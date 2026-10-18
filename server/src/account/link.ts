/**
 * Web → Telegram linking (ADR-0009 §3; M-LK-1, M-LK-2, N-LK-3, M-ID-2, M-ID-3).
 *
 *   1. The web (re-authed) creates a link code: 16 random bytes, only its
 *      SHA-256 stored, 10 minutes, bound to the player and the creating
 *      session; a new code retires the player's older ones.
 *   2. The Mini App shows the target account (display name, masked email) and
 *      completes with its initData: valid HMAC, auth_date ≤ 10 minutes,
 *      start_param = link_<code>. That records the Telegram id and nothing else.
 *   3. Only the creating web session sees the request (status) and confirms it
 *      (re-authed). Then, in one D1 batch, the identity and the mirror are
 *      written and the code is spent; or the conflict rules (conflicts.ts) run,
 *      where the Telegram owner must also choose in the Mini App (V6-053).
 *   The Mini App can cancel at any point ("Not me", conflicts.ts).
 *
 * A leaked code alone links nothing: the web owner must confirm, and sees the
 * Telegram account that asked. Every step re-checks the ban tombstones (V6-048).
 */
import type { Env } from '../env';
import { ApiError } from '../errors';
import { bannedError } from '../ban';
import { b64urlEncode } from '../crypto';
import { hashToken, forgetSessions, type Session } from '../auth/sessions';
import { hitThrottle } from '../auth/throttle';
import type { PepperSet } from '../auth/password';
import { playerByTelegramIdentity } from '../auth/identity';
import { validateInitData } from '../telegramAuth';
import { isBanTombstoned } from './banTombstone';
import { REAUTH_WINDOW_MS } from './reauth';
import { maskEmail } from './summary';
import { hasProgress, LINK_CODE_RULE, lit, noticeGained, settle, type Proof } from './conflicts';
import type { Notifier } from './notices';

const LINK_CODE_TTL_MS = 10 * 60_000;
const LINK_CODE = /^[A-Za-z0-9_-]{22}$/;
const START_PARAM = /^link_([A-Za-z0-9_-]{22})$/;

const linkExpired = () => new ApiError(410, 'link_expired', 'This link has expired. Start again from Settings on the web');
const alreadyLinked = () => new ApiError(409, 'already_linked', 'This Telegram account is already linked');

const telegramIdentityOf = (db: D1Database, pid: number) =>
  db.prepare(`SELECT subject FROM auth_identities WHERE player_id = ?1 AND kind = 'telegram'`).bind(pid).first<{ subject: string }>();

/** POST /api/account/link/telegram (re-authed by the route). */
export async function createLinkCode(db: D1Database, s: Session, now: number): Promise<{ code: string; expiresAt: number }> {
  if (await telegramIdentityOf(db, s.pid)) throw alreadyLinked();
  const t = await hitThrottle(db, `linkcode:${s.pid}`, LINK_CODE_RULE, now);
  if (!t.allowed) throw new ApiError(429, 'rate_limited', 'Too many link codes, try again later', { retryAfterSec: t.retryAfterSec });
  const code = b64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
  const expiresAt = now + LINK_CODE_TTL_MS;
  await db.batch([
    db.prepare('DELETE FROM link_codes WHERE player_id = ?1').bind(s.pid),
    db.prepare('INSERT INTO link_codes (code_hash, player_id, session_hash, status, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(await hashToken(code), s.pid, s.sid, 'pending', now, expiresAt),
  ]);
  return { code, expiresAt };
}

/** The Mini App deep link for a code, when the bot's username is known. */
export function deepLinkFor(bot: string | null, app: string, code: string): string | null {
  return bot ? `https://t.me/${bot}/${app}?startapp=link_${code}` : null;
}

interface CodeRow {
  code_hash: string;
  player_id: number;
  session_hash: string;
  telegram_id: number | null;
  status: 'pending' | 'awaiting_web' | 'used';
  expires_at: number;
  init_hash: string | null;
  cancelled_at: number | null;
}

async function pendingCode(db: D1Database, code: string, now: number): Promise<CodeRow> {
  if (!LINK_CODE.test(code)) throw linkExpired();
  const row = await db
    .prepare(
      `SELECT c.* FROM link_codes c JOIN players p ON p.id = c.player_id
       WHERE c.code_hash = ?1 AND c.status = 'pending' AND c.cancelled_at IS NULL AND c.expires_at > ?2 AND p.deleted_at IS NULL AND p.banned_at IS NULL`,
    )
    .bind(await hashToken(code), now)
    .first<CodeRow>();
  if (!row) throw linkExpired();
  return row;
}

/**
 * GET /api/account/link/telegram/:code (Mini App): the target's display name
 * and masked email only, plus whether the caller's own account has progress
 * that a link would put up for deletion (`conflict`), so the sheet can warn.
 */
export async function peekLinkCode(db: D1Database, s: Session, code: string, now: number): Promise<{ displayName: string; emailMasked: string | null; conflict: boolean }> {
  const row = await pendingCode(db, code, now);
  if (row.player_id === s.pid) throw alreadyLinked();
  const [p, mail] = await db.batch([
    db.prepare('SELECT display_name FROM players WHERE id = ?1').bind(row.player_id),
    db.prepare(`SELECT subject FROM auth_identities WHERE player_id = ?1 AND kind = 'password'`).bind(row.player_id),
  ]);
  const email = (mail.results[0] as { subject: string } | undefined)?.subject ?? null;
  return {
    displayName: (p.results[0] as { display_name: string }).display_name,
    emailMasked: email ? maskEmail(email) : null,
    conflict: await hasProgress(db, s.pid),
  };
}

/** POST /api/account/link/telegram/complete {initData} (Mini App): records the Telegram id; links nothing. */
export async function completeLinkCode(db: D1Database, botToken: string, peppers: () => PepperSet, initData: string, now: number): Promise<{ status: 'awaiting_web' }> {
  const r = await validateInitData(initData, botToken, Math.floor(now / 1000), REAUTH_WINDOW_MS / 1000);
  if (!r.ok) {
    if (r.reason === 'expired') throw new ApiError(401, 'init_data_expired', 'Reopen this link from the web to continue');
    throw new ApiError(401, 'invalid_init_data', `initData rejected: ${r.reason}`);
  }
  const m = START_PARAM.exec(r.fields.start_param ?? '');
  if (!m) throw new ApiError(400, 'bad_start_param', 'This is not a link request');
  const row = await pendingCode(db, m[1], now);
  const tgId = r.user.id;
  if (await isBanTombstoned(db, peppers, 'telegram', String(tgId), now)) throw bannedError();
  const owner = await playerByTelegramIdentity(db, tgId);
  if (owner?.id === row.player_id) throw alreadyLinked();
  if (owner?.banned_at != null) throw bannedError();
  const res = await db
    .prepare(`UPDATE link_codes SET status = 'awaiting_web', telegram_id = ?2, init_hash = ?4 WHERE code_hash = ?1 AND status = 'pending' AND cancelled_at IS NULL AND expires_at > ?3`)
    .bind(row.code_hash, tgId, now, await hashToken(initData))
    .run();
  if ((res.meta.changes ?? 0) !== 1) throw linkExpired();
  return { status: 'awaiting_web' };
}

const sessionCode = (db: D1Database, s: Session) =>
  db.prepare('SELECT * FROM link_codes WHERE session_hash = ?1 AND player_id = ?2 ORDER BY created_at DESC LIMIT 1').bind(s.sid, s.pid).first<CodeRow>();

type LinkStatus =
  | { status: 'none' | 'expired' | 'linked' | 'cancelled' }
  | { status: 'pending'; expiresAt: number }
  | { status: 'awaiting_web'; expiresAt: number; telegram: { username: string | null; firstName: string | null } }
  | { status: 'conflict'; conflict: string };

/** GET /api/account/link/telegram/status: only the creating session sees its code. */
export async function linkStatus(db: D1Database, s: Session, now: number): Promise<LinkStatus> {
  const row = await sessionCode(db, s);
  if (!row) return { status: 'none' };
  if (row.cancelled_at !== null) return { status: 'cancelled' };
  if (row.status === 'used') {
    const c = await db
      .prepare(`SELECT id, cancelled_at FROM link_conflicts WHERE player_id = ?1 AND kind = 'telegram' AND web_session = ?2 AND expires_at > ?3 ORDER BY created_at DESC LIMIT 1`)
      .bind(s.pid, s.sid, now)
      .first<{ id: string; cancelled_at: number | null }>();
    if (c) return c.cancelled_at !== null ? { status: 'cancelled' } : { status: 'conflict', conflict: c.id };
    const mine = await telegramIdentityOf(db, s.pid);
    return { status: mine && mine.subject === String(row.telegram_id) ? 'linked' : 'expired' };
  }
  if (row.expires_at <= now) return { status: 'expired' };
  if (row.status === 'pending') return { status: 'pending', expiresAt: row.expires_at };
  // The Telegram profile of the account that asked (Telegram sent it moments ago); shown to the web owner to decide.
  const p = await playerByTelegramIdentity(db, row.telegram_id!);
  return { status: 'awaiting_web', expiresAt: row.expires_at, telegram: { username: p?.username ?? null, firstName: p?.first_name ?? null } };
}

/** DELETE /api/account/link/telegram ("Not me", or the sheet closed): the session's unspent code goes. */
export async function cancelLink(db: D1Database, s: Session): Promise<void> {
  await db.prepare(`DELETE FROM link_codes WHERE session_hash = ?1 AND player_id = ?2 AND status != 'used'`).bind(s.sid, s.pid).run();
}

/**
 * POST /api/account/link/telegram/confirm (the creating session, re-authed):
 * links, removes an empty other account and links, or opens a conflict.
 */
export async function confirmLink(env: Env, peppers: () => PepperSet, notify: Notifier, s: Session, now: number): Promise<{ linked: true; removedEmpty?: true } | { conflict: string }> {
  const db = env.DB!;
  const row = await sessionCode(db, s);
  if (!row || row.status !== 'awaiting_web' || row.cancelled_at !== null || row.expires_at <= now || row.telegram_id === null) throw linkExpired();
  const tgId = row.telegram_id;
  if (await isBanTombstoned(db, peppers, 'telegram', String(tgId), now)) throw bannedError();
  if (await telegramIdentityOf(db, s.pid)) throw alreadyLinked();
  const proof: Proof = {
    guard: `EXISTS (SELECT 1 FROM link_codes WHERE code_hash = ${lit(row.code_hash)} AND status = 'awaiting_web' AND cancelled_at IS NULL AND expires_at > ${lit(now)})`,
    spend: (g) => db.prepare(`UPDATE link_codes SET status = 'used' WHERE code_hash = ?1 AND ${g}`).bind(row.code_hash),
  };
  const owner = await playerByTelegramIdentity(db, tgId);
  if (owner?.id === s.pid) throw alreadyLinked();
  if (owner) {
    if (owner.banned_at !== null) throw bannedError();
    const out = await settle(env, notify, 'telegram', s.pid, owner.id, proof, linkExpired, now, { webSession: s.sid, tgId, tgInitHash: row.init_hash });
    return 'conflict' in out ? out : { linked: true, removedEmpty: true };
  }
  // No player has this Telegram id: the identity and the mirror in one batch with the spend (M-ID-3).
  let spent: D1Result;
  try {
    [, , spent] = await db.batch([
      db
        .prepare(`INSERT INTO auth_identities (player_id, kind, subject, verified_at, created_at) SELECT ?1, 'telegram', ?2, ?3, ?3 WHERE ${proof.guard}`)
        .bind(s.pid, String(tgId), now),
      db.prepare(`UPDATE players SET telegram_id = ?2 WHERE id = ?1 AND ${proof.guard}`).bind(s.pid, tgId),
      proof.spend(proof.guard),
    ]);
  } catch (e) {
    // A concurrent first sign-in of that Telegram user created its player: the caller retries into the conflict rules.
    if (/UNIQUE/i.test(String((e as Error).message))) throw new ApiError(409, 'retry', 'Something changed, try again');
    throw e;
  }
  if ((spent.meta.changes ?? 0) !== 1) throw linkExpired();
  forgetSessions(s.pid);
  await noticeGained(db, notify, s.pid, ['telegram']);
  return { linked: true };
}
