/**
 * Durable per-account and per-address limits in D1 `auth_throttle`
 * (ADR-0008 §5): global and strongly consistent, written only on auth
 * attempts. Every update is one `INSERT … ON CONFLICT DO UPDATE … RETURNING`,
 * so there is no read-then-write race. Keys carry b64url(SHA-256(email_norm)),
 * never the address. Per-IP limits are the Rate Limiting binding (V6-ACCT-04);
 * the in-isolate rateLimit.ts is never used for /api/auth/* (N-AF-1).
 */
import { b64urlEncode, utf8 } from '../crypto';

export interface ThrottleRule {
  limit: number;
  windowMs: number;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
/** M-AF-5: all purposes together, per address. */
export const MAIL_PER_HOUR: ThrottleRule = { limit: 3, windowMs: HOUR };
export const MAIL_PER_DAY: ThrottleRule = { limit: 10, windowMs: 24 * HOUR };
/** M-AF-4: lock after this many consecutive failures… */
export const LOCK_AFTER = 5;
/** …for 1 minute, doubling per further failure, up to 1 hour. */
const LOCK_BASE_MS = MIN;
const LOCK_MAX_MS = HOUR;

export async function emailKeyHash(emailNorm: string): Promise<string> {
  return b64urlEncode(await crypto.subtle.digest('SHA-256', utf8(emailNorm)));
}

function hitStatement(db: D1Database, key: string, rule: ThrottleRule, now: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO auth_throttle (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN window_start <= ?2 - ?3 THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN window_start <= ?2 - ?3 THEN ?2 ELSE window_start END
       RETURNING count, window_start`,
    )
    .bind(key, now, rule.windowMs);
}

function verdict(row: { count: number; window_start: number } | undefined, rule: ThrottleRule, now: number) {
  if (!row || row.count <= rule.limit) return { allowed: true, retryAfterSec: 0 };
  return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((row.window_start + rule.windowMs - now) / 1000)) };
}

/** Counts one hit on `key` in a fixed window; refused once the window holds more than `rule.limit`. */
export async function hitThrottle(db: D1Database, key: string, rule: ThrottleRule, now = Date.now()): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const row = await hitStatement(db, key, rule, now).first<{ count: number; window_start: number }>();
  return verdict(row ?? undefined, rule, now);
}

/** Spends one email for this address against both caps; false means send nothing (silently, M-AF-5). */
export async function mailAllowed(db: D1Database, emailNorm: string, now = Date.now()): Promise<boolean> {
  const h = await emailKeyHash(emailNorm);
  const [hour, day] = await db.batch<{ count: number; window_start: number }>([
    hitStatement(db, `mail:h:${h}`, MAIL_PER_HOUR, now),
    hitStatement(db, `mail:d:${h}`, MAIL_PER_DAY, now),
  ]);
  return verdict(hour.results[0], MAIL_PER_HOUR, now).allowed && verdict(day.results[0], MAIL_PER_DAY, now).allowed;
}

const loginKey = async (emailNorm: string) => `login:${await emailKeyHash(emailNorm)}`;

/** Seconds left on this address's log-in lock, 0 when not locked. Works for unknown addresses too. */
export async function loginLockedFor(db: D1Database, emailNorm: string, now = Date.now()): Promise<number> {
  const row = await db.prepare('SELECT locked_until FROM auth_throttle WHERE key = ?1').bind(await loginKey(emailNorm)).first<{ locked_until: number | null }>();
  const left = (row?.locked_until ?? 0) - now;
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/** One more failed log-in (or password-change check); from the 5th on, (re)locks for 1, 2, 4 … 60 minutes. */
export async function recordLoginFailure(db: D1Database, emailNorm: string, now = Date.now()): Promise<void> {
  await db
    .prepare(
      `INSERT INTO auth_throttle (key, window_start, count, failures, locked_until) VALUES (?1, ?2, 0, 1, NULL)
       ON CONFLICT (key) DO UPDATE SET
         failures = failures + 1,
         window_start = ?2,
         locked_until = CASE WHEN failures + 1 >= ?3 THEN ?2 + min(?5, ?4 << min(failures + 1 - ?3, 6)) ELSE locked_until END`,
    )
    .bind(await loginKey(emailNorm), now, LOCK_AFTER, LOCK_BASE_MS, LOCK_MAX_MS)
    .run();
}

/** A successful log-in or reset: the failure count and any lock are gone. */
export async function clearLoginFailures(db: D1Database, emailNorm: string): Promise<void> {
  await db.prepare('DELETE FROM auth_throttle WHERE key = ?1').bind(await loginKey(emailNorm)).run();
}
