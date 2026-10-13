/**
 * Server-side sessions (ADR-0008 §3). A token is `pa2_` + 32 random bytes
 * (base64url); D1 stores only b64url(SHA-256(token)) as `sessions.id_hash`.
 * Every lookup joins `players` (ban, deletion, display name). Positive lookups
 * are cached per isolate for at most 30 s; revocations clear this isolate's
 * entries, other isolates may serve a revoked session until theirs expire.
 */
import { b64urlEncode, utf8 } from '../crypto';
import { bannedError } from '../ban';

export type Transport = 'cookie' | 'bearer';
export type Method = 'telegram' | 'password' | 'email_link';

export interface Session {
  /** players.id */
  pid: number;
  /** sessions.id_hash: never sent to a client (the list shows a 12-character handle). */
  sid: string;
  transport: Transport;
  method: Method;
  /** players.display_name (presence, Durable Objects). */
  name: string;
  /** Last fresh proof, unix ms (ADR-0009 sensitive actions). */
  reauthAt: number | null;
  /** Absolute expiry, unix ms. */
  expiresAt: number;
  /** The player has at least one log-in identity (requirePlayable). */
  hasIdentity: boolean;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Lifetimes per transport, ms. */
export const LIFETIME: Record<Transport, { absolute: number; idle: number }> = {
  cookie: { absolute: 30 * DAY, idle: 7 * DAY },
  bearer: { absolute: DAY, idle: DAY },
};
/** `last_seen_at` (and the sliding idle expiry) is written at most this often. */
export const TOUCH_EVERY_MS = HOUR;
export const CACHE_TTL_MS = 30_000;
export const CACHE_MAX = 5_000;
/** The public handle of a session: the first characters of its id hash. */
export const HANDLE_LENGTH = 12;

const PREFIX = 'pa2_';
const TOKEN = /^pa2_[A-Za-z0-9_-]{43}$/;

export async function hashToken(token: string): Promise<string> {
  return b64urlEncode(await crypto.subtle.digest('SHA-256', utf8(token)));
}

interface Cached {
  session: Session;
  idleExpiresAt: number;
  lastSeenAt: number;
  at: number;
}
const cache = new Map<string, Cached>();

/** Drops cached lookups: one player's, or all (bans, revocations in this isolate). */
export function forgetSessions(pid?: number): void {
  if (pid === undefined) cache.clear();
  else for (const [k, v] of cache) if (v.session.pid === pid) cache.delete(k);
}

/** A short label from the User-Agent, e.g. 'Chrome on macOS'; null when unknown. */
export function deviceLabel(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const app = /Telegram/i.test(ua) ? 'Telegram' : /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : null;
  if (!app && !os) return null;
  return [app ?? 'Browser', os].filter(Boolean).join(' on ');
}

export async function createSession(
  db: D1Database,
  pid: number,
  transport: Transport,
  method: Method,
  device: string | null,
  now = Date.now(),
): Promise<{ token: string; session: Session }> {
  const token = PREFIX + b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const sid = await hashToken(token);
  const life = LIFETIME[transport];
  const row = await db
    .prepare(
      `INSERT INTO sessions (id_hash, player_id, transport, method, created_at, last_seen_at, idle_expires_at, expires_at, reauth_at, device)
       SELECT ?1, p.id, ?3, ?4, ?5, ?5, ?6, ?7, ?5, ?8 FROM players p WHERE p.id = ?2 AND p.deleted_at IS NULL
       RETURNING (SELECT display_name FROM players WHERE id = ?2) AS name,
                 EXISTS (SELECT 1 FROM auth_identities WHERE player_id = ?2) AS has_identity`,
    )
    .bind(sid, pid, transport, method, now, now + Math.min(life.idle, life.absolute), now + life.absolute, device?.slice(0, 64) ?? null)
    .first<{ name: string; has_identity: number }>();
  if (!row) throw new Error(`no player ${pid} to start a session for`);
  return { token, session: { pid, sid, transport, method, name: row.name, reauthAt: now, expiresAt: now + life.absolute, hasIdentity: !!row.has_identity } };
}

interface LookupRow {
  player_id: number;
  transport: Transport;
  method: Method;
  last_seen_at: number;
  idle_expires_at: number;
  expires_at: number;
  reauth_at: number | null;
  banned_at: number | null;
  deleted_at: number | null;
  display_name: string;
  has_identity: number;
}

/**
 * The live session for `token` arriving over `transport`, else null (unknown,
 * malformed, expired, idle, the other transport, or a deleted player). A banned
 * player's session throws 403 `banned`.
 */
export async function lookupSession(db: D1Database, token: string, transport: Transport, now = Date.now()): Promise<Session | null> {
  if (!TOKEN.test(token)) return null;
  const sid = await hashToken(token);
  let hit = cache.get(sid);
  if (hit && now - hit.at >= CACHE_TTL_MS) {
    cache.delete(sid);
    hit = undefined;
  }
  if (!hit) {
    const row = await db
      .prepare(
        `SELECT s.player_id, s.transport, s.method, s.last_seen_at, s.idle_expires_at, s.expires_at, s.reauth_at,
                p.banned_at, p.deleted_at, p.display_name,
                EXISTS (SELECT 1 FROM auth_identities i WHERE i.player_id = p.id) AS has_identity
         FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.id_hash = ?1`,
      )
      .bind(sid)
      .first<LookupRow>();
    if (!row || row.deleted_at !== null) return null;
    if (row.banned_at !== null) throw bannedError();
    hit = {
      session: { pid: row.player_id, sid, transport: row.transport, method: row.method, name: row.display_name, reauthAt: row.reauth_at, expiresAt: row.expires_at, hasIdentity: !!row.has_identity },
      idleExpiresAt: row.idle_expires_at,
      lastSeenAt: row.last_seen_at,
      at: now,
    };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(sid, hit);
  }
  const s = hit.session;
  if (s.transport !== transport) return null;
  if (now >= s.expiresAt || now >= hit.idleExpiresAt) {
    cache.delete(sid);
    return null;
  }
  if (now - hit.lastSeenAt >= TOUCH_EVERY_MS) {
    const idle = Math.min(now + LIFETIME[s.transport].idle, s.expiresAt);
    hit.lastSeenAt = now;
    hit.idleExpiresAt = idle;
    await db.prepare('UPDATE sessions SET last_seen_at = ?2, idle_expires_at = ?3 WHERE id_hash = ?1').bind(sid, now, idle).run();
  }
  return s;
}

/** Ends one of the player's sessions by its handle (or full id hash). True when one was found. */
export async function revokeSession(db: D1Database, pid: number, sidHashPrefix: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{12,43}$/.test(sidHashPrefix)) return false;
  const r = await db
    .prepare('DELETE FROM sessions WHERE player_id = ?1 AND substr(id_hash, 1, ?3) = ?2')
    .bind(pid, sidHashPrefix, sidHashPrefix.length)
    .run();
  forgetSessions(pid);
  return (r.meta.changes ?? 0) > 0;
}

/** Ends every session of the player, except `exceptIdHash` when given. */
export async function revokeAll(db: D1Database, pid: number, exceptIdHash?: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE player_id = ?1 AND id_hash != ?2').bind(pid, exceptIdHash ?? '').run();
  forgetSessions(pid);
}

export interface SessionInfo {
  handle: string;
  transport: Transport;
  method: Method;
  device: string | null;
  createdAt: number;
  lastSeenAt: number;
  current: boolean;
}

/** The player's live sessions, newest first; never the token or its hash. */
export async function listSessions(db: D1Database, pid: number, currentSid: string, now = Date.now()): Promise<SessionInfo[]> {
  const rows = await db
    .prepare(
      `SELECT id_hash, transport, method, device, created_at, last_seen_at FROM sessions
       WHERE player_id = ?1 AND expires_at > ?2 AND idle_expires_at > ?2 ORDER BY created_at DESC LIMIT 100`,
    )
    .bind(pid, now)
    .all<{ id_hash: string; transport: Transport; method: Method; device: string | null; created_at: number; last_seen_at: number }>();
  return rows.results.map((r) => ({
    handle: r.id_hash.slice(0, HANDLE_LENGTH),
    transport: r.transport,
    method: r.method,
    device: r.device,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    current: r.id_hash === currentSid,
  }));
}

const PRUNE_IDLE_MS = 7 * DAY;

/** Daily housekeeping: expired sessions, used or expired email tokens, throttle rows idle for 7 days. */
export async function pruneAuth(db: D1Database, now = Date.now()): Promise<{ sessions: number; emailTokens: number; throttle: number }> {
  const [s, e, t] = await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?1 OR idle_expires_at <= ?1').bind(now),
    db.prepare('DELETE FROM email_tokens WHERE used_at IS NOT NULL OR expires_at <= ?1').bind(now),
    db.prepare('DELETE FROM auth_throttle WHERE window_start <= ?1 AND (locked_until IS NULL OR locked_until <= ?2)').bind(now - PRUNE_IDLE_MS, now),
  ]);
  return { sessions: s.meta.changes ?? 0, emailTokens: e.meta.changes ?? 0, throttle: t.meta.changes ?? 0 };
}
