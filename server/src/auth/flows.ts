/**
 * Email and password flows (ADR-0008 §4, §5; control manifest M-PW, M-AF):
 * sign-up, verify, resend, log-in, reset (request and confirm) and password
 * change. Routes (routes/auth.ts) parse bodies, run the per-IP and Turnstile
 * gates (V6-ACCT-04) and turn results into sessions; everything that decides
 * what an attacker can learn lives here.
 *
 * - Sign-up, resend and reset-request return nothing: the route always answers
 *   202. The work done before the reply does not depend on whether the account
 *   exists; issuing a resend or reset token and every send happen after the
 *   response (`defer`), so the reply's timing doesn't depend on them.
 * - Log-in throws one `401 invalid_credentials` for an unknown email, a wrong
 *   password and a locked address, with a dummy hash for unknown emails.
 * - Email tokens are 32 random bytes, stored as SHA-256, single use.
 * - Nothing here logs an address, password, hash or token.
 */
import { ApiError } from '../errors';
import { bannedError } from '../ban';
import type { PlayerRow } from '../players';
import { log } from '../telemetry/log';
import { b64urlEncode } from '../crypto';
import { sendWithTimeout, type EmailSender } from '../email/sender';
import { renderEmail, type Lang, type Template } from '../email/templates';
import { checkPasswordPolicy, hashPassword, verifyPassword, type PepperSet } from './password';
import { clearLoginFailures, loginLockedFor, mailAllowed, recordLoginFailure } from './throttle';
import { createPasswordPlayer } from './identity';
import { forgetSessions, hashToken, type Session } from './sessions';

const MIN = 60_000;
/** M-AF-6: verify links last 24 h, reset links 30 min. */
export const SIGNUP_TOKEN_TTL_MS = 24 * 60 * MIN;
export const RESET_TOKEN_TTL_MS = 30 * MIN;
const EMAIL_MAX = 254;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export interface FlowDeps {
  db: D1Database;
  peppers: PepperSet;
  /** Null when email is not configured: the mail flows answer 503 before looking at any account. */
  mail: EmailSender | null;
  gameUrl: string;
  lang: Lang;
  /** Runs work after the response (ctx.waitUntil). */
  defer: (p: Promise<unknown>) => void;
  now: number;
}

export const invalidCredentials = () => new ApiError(401, 'invalid_credentials', 'Wrong email or password');
const invalidToken = () => new ApiError(400, 'invalid_token', 'This link has expired or was already used');
const invalidEmail = () => new ApiError(400, 'invalid_email', 'Enter a valid email address');

/**
 * ADR-0008 §1 / M-ID-4: trim, NFKC, lower-case; at most 254 characters, one
 * `@`, a non-empty local part and a domain with a dot. No dot or plus folding.
 * `display` is the address as typed (trimmed), for sending.
 */
export function normalizeEmail(raw: string): { norm: string; display: string } | null {
  const display = raw.trim();
  const norm = display.normalize('NFKC').toLowerCase();
  if (norm.length === 0 || norm.length > EMAIL_MAX || display.length > EMAIL_MAX || /\s/.test(norm)) return null;
  const parts = norm.split('@');
  if (parts.length !== 2 || !parts[0] || !/^[^.]+(\.[^.]+)+$/.test(parts[1])) return null;
  return { norm, display };
}

function requirePolicy(pw: string, emailNorm: string): void {
  const r = checkPasswordPolicy(pw, emailNorm);
  if (r !== 'ok') throw new ApiError(400, r, 'The password does not meet the policy');
}

function requireMail(d: FlowDeps): EmailSender {
  if (!d.mail) throw new ApiError(503, 'email_unavailable', 'Email is not available right now');
  return d.mail;
}

const newToken = () => b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));

/**
 * Runs `work` after the response (token issue and send), so the reply's
 * timing does not depend on whether there was anything to send. A failure is
 * logged by template only: never the address or the token.
 */
function later(d: FlowDeps, template: Template, work: () => Promise<void>): void {
  d.defer(
    work().catch((e: unknown) => {
      log('warn', 'email_send_failed', { template, error: e instanceof Error ? e.name : 'non-error' });
    }),
  );
}

/** Queues one email after the response. */
function queue(d: FlowDeps, sender: EmailSender, template: Template, to: string, lang: Lang, link?: string): void {
  later(d, template, () => sendWithTimeout(sender, renderEmail(template, lang, to, link)));
}

async function hasPasswordIdentity(db: D1Database, emailNorm: string): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS x FROM auth_identities WHERE kind = 'password' AND subject = ?1`).bind(emailNorm).first();
  return row !== null;
}

/** Retires the address's unused tokens of one purpose and stores a new one (one batch). */
async function issueToken(d: FlowDeps, purpose: 'signup' | 'reset', emailNorm: string, email: string, ttlMs: number, playerId: number | null, pendingHash: string | null): Promise<string> {
  const token = newToken();
  await d.db.batch([
    d.db.prepare('UPDATE email_tokens SET used_at = ?3 WHERE email_norm = ?1 AND purpose = ?2 AND used_at IS NULL').bind(emailNorm, purpose, d.now),
    d.db
      .prepare('INSERT INTO email_tokens (token_hash, purpose, email_norm, email, player_id, pending_hash, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
      .bind(await hashToken(token), purpose, emailNorm, email, playerId, pendingHash, d.now, d.now + ttlMs),
  ]);
  return token;
}

/**
 * POST /api/auth/signup. The account is created only when the link is opened
 * (N-ID-1): a pending token holds the hash. A registered address gets an
 * "already registered" email instead; the same hashing and writes happen either way.
 */
export async function signup(d: FlowDeps, rawEmail: string, password: string): Promise<void> {
  const e = normalizeEmail(rawEmail);
  if (!e) throw invalidEmail();
  const sender = requireMail(d);
  requirePolicy(password, e.norm);
  // The D1 throttle runs before the hash (M-AF-1, N-PW-2); the cap is per address, so it reveals nothing.
  if (!(await mailAllowed(d.db, e.norm, d.now))) return;
  const hash = await hashPassword(password, d.peppers.current);
  const exists = await hasPasswordIdentity(d.db, e.norm);
  // The same writes either way; a registered address's token is never sent, so it is inert.
  const token = await issueToken(d, 'signup', e.norm, e.display, SIGNUP_TOKEN_TTL_MS, null, hash);
  if (exists) queue(d, sender, 'already_registered', e.display, d.lang, `${d.gameUrl}/#login`);
  else queue(d, sender, 'verify', e.display, d.lang, `${d.gameUrl}/auth/signup#t=${token}`);
}

/** POST /api/auth/verify/resend: a new link for a pending sign-up (older links stop working). */
export async function resendSignup(d: FlowDeps, rawEmail: string): Promise<void> {
  const e = normalizeEmail(rawEmail);
  if (!e) throw invalidEmail();
  const sender = requireMail(d);
  const allowed = await mailAllowed(d.db, e.norm, d.now);
  const exists = await hasPasswordIdentity(d.db, e.norm);
  const pending = await d.db
    .prepare(
      `SELECT email, pending_hash FROM email_tokens WHERE email_norm = ?1 AND purpose = 'signup' AND used_at IS NULL AND expires_at > ?2
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(e.norm, d.now)
    .first<{ email: string; pending_hash: string | null }>();
  if (!allowed || exists || !pending?.pending_hash) return;
  const { email, pending_hash } = pending;
  later(d, 'verify', async () => {
    const token = await issueToken(d, 'signup', e.norm, email, SIGNUP_TOKEN_TTL_MS, null, pending_hash);
    await sendWithTimeout(sender, renderEmail('verify', d.lang, email, `${d.gameUrl}/auth/signup#t=${token}`));
  });
}

/** POST /api/auth/verify (purpose signup): single use; creates the player, identity and hash. */
export async function verifySignup(d: FlowDeps, token: string): Promise<PlayerRow> {
  if (!TOKEN.test(token)) throw invalidToken();
  const row = await d.db
    .prepare(
      `UPDATE email_tokens SET used_at = ?2
       WHERE token_hash = ?1 AND purpose = 'signup' AND used_at IS NULL AND expires_at > ?2
       RETURNING email_norm, email, pending_hash`,
    )
    .bind(await hashToken(token), d.now)
    .first<{ email_norm: string; email: string; pending_hash: string | null }>();
  if (!row?.pending_hash) throw invalidToken();
  const player = await createPasswordPlayer(d.db, row.email_norm, row.email, row.pending_hash, d.now);
  if (player === 'taken') throw new ApiError(409, 'email_taken', 'This email was confirmed for another account in the meantime');
  // The other pending links for this address are dead now.
  await d.db.prepare(`UPDATE email_tokens SET used_at = ?2 WHERE email_norm = ?1 AND purpose = 'signup' AND used_at IS NULL`).bind(row.email_norm, d.now).run();
  return player;
}

/** POST /api/auth/login: the checked player, else one uniform 401 (403 `banned` only after a correct password). */
export async function login(d: FlowDeps, rawEmail: string, password: string): Promise<PlayerRow> {
  const e = normalizeEmail(rawEmail);
  if (!e) throw invalidEmail();
  // A locked address answers like a wrong password, without hashing (ADR-0008 §5).
  if ((await loginLockedFor(d.db, e.norm, d.now)) > 0) throw invalidCredentials();
  const row = await d.db
    .prepare(
      `SELECT i.id AS identity_id, i.player_id, h.hash, p.banned_at FROM auth_identities i
       JOIN password_hashes h ON h.identity_id = i.id JOIN players p ON p.id = i.player_id
       WHERE i.kind = 'password' AND i.subject = ?1 AND p.deleted_at IS NULL`,
    )
    .bind(e.norm)
    .first<{ identity_id: number; player_id: number; hash: string; banned_at: number | null }>();
  const v = await verifyPassword(password, row?.hash ?? null, d.peppers);
  if (!row || !v.ok) {
    await recordLoginFailure(d.db, e.norm, d.now);
    throw invalidCredentials();
  }
  await clearLoginFailures(d.db, e.norm);
  if (row.banned_at !== null) throw bannedError();
  if (v.needsRehash) {
    try {
      const fresh = await hashPassword(password, d.peppers.current);
      await d.db.prepare('UPDATE password_hashes SET hash = ?2, updated_at = ?3 WHERE identity_id = ?1').bind(row.identity_id, fresh, d.now).run();
    } catch (err) {
      // M-PW-1: a failed rehash never fails the log-in.
      log('warn', 'password_rehash_failed', { error: err instanceof Error ? err.name : 'non-error' });
    }
  }
  const [, player] = await d.db.batch<PlayerRow>([
    d.db.prepare('UPDATE auth_identities SET last_login_at = ?2 WHERE id = ?1').bind(row.identity_id, d.now),
    d.db.prepare('UPDATE players SET last_seen_at = ?2 WHERE id = ?1 RETURNING *').bind(row.player_id, d.now),
  ]);
  return player.results[0];
}

/** POST /api/auth/reset/request: a 30-minute link when the address has a password identity, else nothing. */
export async function requestReset(d: FlowDeps, rawEmail: string): Promise<void> {
  const e = normalizeEmail(rawEmail);
  if (!e) throw invalidEmail();
  const sender = requireMail(d);
  const allowed = await mailAllowed(d.db, e.norm, d.now);
  const ident = await d.db
    .prepare(
      `SELECT i.player_id, i.email FROM auth_identities i JOIN players p ON p.id = i.player_id
       WHERE i.kind = 'password' AND i.subject = ?1 AND p.deleted_at IS NULL`,
    )
    .bind(e.norm)
    .first<{ player_id: number; email: string | null }>();
  if (!allowed || !ident) return;
  const to = ident.email ?? e.display;
  const pid = ident.player_id;
  later(d, 'reset', async () => {
    const token = await issueToken(d, 'reset', e.norm, to, RESET_TOKEN_TTL_MS, pid, null);
    await sendWithTimeout(sender, renderEmail('reset', d.lang, to, `${d.gameUrl}/auth/reset#t=${token}`));
  });
}

/**
 * POST /api/auth/reset/confirm: single use within 30 minutes. Sets the new
 * hash, revokes **all** the player's sessions (the route then issues one),
 * clears the lockout and sends a notice.
 */
export async function confirmReset(d: FlowDeps, token: string, password: string): Promise<PlayerRow> {
  if (!TOKEN.test(token)) throw invalidToken();
  const th = await hashToken(token);
  const row = await d.db
    .prepare(`SELECT email_norm, email, player_id FROM email_tokens WHERE token_hash = ?1 AND purpose = 'reset' AND used_at IS NULL AND expires_at > ?2`)
    .bind(th, d.now)
    .first<{ email_norm: string; email: string; player_id: number | null }>();
  if (!row?.player_id) throw invalidToken();
  // The policy runs before the token is spent, so a weak password doesn't burn the link.
  requirePolicy(password, row.email_norm);
  const hash = await hashPassword(password, d.peppers.current);
  const spent = await d.db
    .prepare(`UPDATE email_tokens SET used_at = ?2 WHERE token_hash = ?1 AND used_at IS NULL AND expires_at > ?2 RETURNING player_id`)
    .bind(th, d.now)
    .first<{ player_id: number }>();
  if (!spent) throw invalidToken();
  const pid = row.player_id;
  const [updated] = await d.db.batch([
    d.db
      .prepare(
        `UPDATE password_hashes SET hash = ?3, updated_at = ?4
         WHERE identity_id = (SELECT id FROM auth_identities WHERE player_id = ?1 AND kind = 'password' AND subject = ?2)`,
      )
      .bind(pid, row.email_norm, hash, d.now),
    d.db.prepare('DELETE FROM sessions WHERE player_id = ?1').bind(pid),
    d.db.prepare(`UPDATE email_tokens SET used_at = ?2 WHERE email_norm = ?1 AND purpose = 'reset' AND used_at IS NULL`).bind(row.email_norm, d.now),
  ]);
  forgetSessions(pid);
  if ((updated.meta.changes ?? 0) === 0) throw invalidToken(); // the identity is gone (unlinked or deleted)
  await clearLoginFailures(d.db, row.email_norm);
  const player = await d.db.prepare('SELECT * FROM players WHERE id = ?1 AND deleted_at IS NULL').bind(pid).first<PlayerRow>();
  if (!player) throw invalidToken();
  if (d.mail && (await mailAllowed(d.db, row.email_norm, d.now))) queue(d, d.mail, 'password_changed', row.email, d.lang);
  return player;
}

/**
 * POST /api/auth/password: re-checks `current` (it counts toward the address's
 * lockout), sets the new hash and revokes every other session of the player.
 */
export async function changePassword(d: FlowDeps, s: Session, current: string, next: string): Promise<void> {
  const ident = await d.db
    .prepare(
      `SELECT i.id, i.subject, i.email, h.hash FROM auth_identities i JOIN password_hashes h ON h.identity_id = i.id
       WHERE i.player_id = ?1 AND i.kind = 'password'`,
    )
    .bind(s.pid)
    .first<{ id: number; subject: string; email: string | null; hash: string }>();
  if (!ident) throw new ApiError(400, 'no_password', 'This account has no password yet');
  if ((await loginLockedFor(d.db, ident.subject, d.now)) > 0) throw invalidCredentials();
  if (!(await verifyPassword(current, ident.hash, d.peppers)).ok) {
    await recordLoginFailure(d.db, ident.subject, d.now);
    throw invalidCredentials();
  }
  requirePolicy(next, ident.subject);
  const hash = await hashPassword(next, d.peppers.current);
  await d.db.batch([
    d.db.prepare('UPDATE password_hashes SET hash = ?2, updated_at = ?3 WHERE identity_id = ?1').bind(ident.id, hash, d.now),
    d.db.prepare('DELETE FROM sessions WHERE player_id = ?1 AND id_hash != ?2').bind(s.pid, s.sid),
  ]);
  forgetSessions(s.pid);
  await clearLoginFailures(d.db, ident.subject);
  if (d.mail && (await mailAllowed(d.db, ident.subject, d.now))) queue(d, d.mail, 'password_changed', ident.email ?? ident.subject, d.lang);
}
