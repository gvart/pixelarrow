/**
 * Re-auth for sensitive actions (ADR-0009 §1, M-LK-1; accounts-v6.md §1.4 and
 * §14 Q1). Adding or changing the email and deletion need
 * `sessions.reauth_at` within the last 10 minutes, else `401 reauth_required`,
 * which the client answers with AU-10 "Confirm it's you" and one retry.
 *
 * A fresh proof is a password log-in (the session is created with
 * reauth_at = now), or `POST /api/account/reauth {password}`, which shares the
 * log-in lockout of the address (5 failures lock it, ADR-0008 §5).
 *
 * reauth_at is per session: a proof on one device never unlocks another.
 */
import { ApiError } from '../errors';
import { forgetSessions, type Session } from '../auth/sessions';
import { verifyPassword, type PepperSet } from '../auth/password';
import { clearLoginFailures, loginLockedFor, recordLoginFailure } from '../auth/throttle';
import { invalidCredentials } from '../auth/flows';

export const REAUTH_WINDOW_MS = 10 * 60_000;

/** 401 `reauth_required` unless the session has a proof from the last 10 minutes. */
export function requireReauth(s: Session, now = Date.now()): void {
  if (s.reauthAt === null || now - s.reauthAt > REAUTH_WINDOW_MS || s.reauthAt > now + 60_000) {
    throw new ApiError(401, 'reauth_required', "Confirm it's you to continue");
  }
}

async function markFresh(db: D1Database, s: Session, now: number): Promise<number> {
  await db.prepare('UPDATE sessions SET reauth_at = ?2 WHERE id_hash = ?1 AND player_id = ?3').bind(s.sid, now, s.pid).run();
  // This isolate's cached copy carries the old reauth_at; other isolates refresh within 30 s (they fail safe: an older proof).
  forgetSessions(s.pid);
  return now + REAUTH_WINDOW_MS;
}

/** Re-auth by the account's password; the attempt counts toward the address's log-in lockout. */
export async function reauthWithPassword(db: D1Database, peppers: PepperSet, s: Session, password: string, now = Date.now()): Promise<number> {
  const ident = await db
    .prepare(
      `SELECT i.subject, h.hash FROM auth_identities i JOIN password_hashes h ON h.identity_id = i.id
       WHERE i.player_id = ?1 AND i.kind = 'password'`,
    )
    .bind(s.pid)
    .first<{ subject: string; hash: string }>();
  if (!ident) throw new ApiError(400, 'no_password', 'This account has no password yet');
  if ((await loginLockedFor(db, ident.subject, now)) > 0) throw invalidCredentials();
  if (!(await verifyPassword(password, ident.hash, peppers)).ok) {
    await recordLoginFailure(db, ident.subject, now);
    throw invalidCredentials();
  }
  await clearLoginFailures(db, ident.subject);
  return markFresh(db, s, now);
}
