/**
 * Add an email and password (Telegram → web) and change the email (ADR-0009
 * §2 and §4; M-LK-3, M-ID-2). Both are requested by a signed-in, re-authed
 * player and complete only when the emailed link is opened: no identity row
 * exists before that proof, and `UNIQUE(kind, subject)` is checked then.
 *
 * - Requests answer 202 whether or not the address has an account (the same
 *   hash and writes either way). An address that already has an account gets
 *   an email saying so instead of the link that would change anything.
 * - Both share the per-account throttle `addmail:<pid>` (5 per hour) and the
 *   per-address mail caps (M-AF-5). Cheap checks (address, policy) run first,
 *   then the throttle, then the hash (N-PW-2).
 * - Opening a link re-checks the ban tombstones (V6-048), the target player
 *   and the address, spends the token, writes the identity in one batch,
 *   queues the notices and returns the player; the route then issues a cookie
 *   session (ADR-0008 §3: verification by link issues a fresh session).
 */
import { ApiError } from '../errors';
import { bannedError } from '../ban';
import type { PlayerRow } from '../players';
import { hashPassword } from '../auth/password';
import { hitThrottle, mailAllowed } from '../auth/throttle';
import { forgetSessions, hashToken, type Session } from '../auth/sessions';
import { EMAIL_TOKEN, invalidEmail, invalidToken, newToken, normalizeEmail, queue, requireMail, requirePolicy, SIGNUP_TOKEN_TTL_MS, type FlowDeps } from '../auth/flows';
import { isBanTombstoned } from './banTombstone';
import { noticeTargets, type Notifier } from './notices';

/** ADR-0009 §2: add-email (and change-email) requests per account per hour. */
export const ADD_EMAIL_RULE = { limit: 5, windowMs: 3_600_000 };

const alreadyHasEmail = () => new ApiError(409, 'already_has_email', 'This account already has an email');
const emailConflict = () => new ApiError(409, 'email_conflict', 'This email belongs to another account');
const emailTaken = () => new ApiError(409, 'email_taken', 'This email belongs to another account');

async function throttle(d: FlowDeps, pid: number): Promise<void> {
  const t = await hitThrottle(d.db, `addmail:${pid}`, ADD_EMAIL_RULE, d.now);
  if (!t.allowed) throw new ApiError(429, 'rate_limited', 'Too many requests, try again later', { retryAfterSec: t.retryAfterSec });
}

async function passwordIdentity(db: D1Database, pid: number) {
  return db.prepare(`SELECT id, subject, email FROM auth_identities WHERE player_id = ?1 AND kind = 'password'`).bind(pid).first<{ id: number; subject: string; email: string | null }>();
}

async function ownerOf(db: D1Database, emailNorm: string): Promise<number | null> {
  const row = await db.prepare(`SELECT player_id FROM auth_identities WHERE kind = 'password' AND subject = ?1`).bind(emailNorm).first<{ player_id: number }>();
  return row?.player_id ?? null;
}

/** Retires the player's unused links of this purpose and stores a new one (one batch). */
async function issue(d: FlowDeps, purpose: 'add_email' | 'change_email', pid: number, emailNorm: string, email: string, pendingHash: string | null): Promise<string> {
  const token = newToken();
  await d.db.batch([
    d.db.prepare('UPDATE email_tokens SET used_at = ?3 WHERE player_id = ?1 AND purpose = ?2 AND used_at IS NULL').bind(pid, purpose, d.now),
    d.db
      .prepare('INSERT INTO email_tokens (token_hash, purpose, email_norm, email, player_id, pending_hash, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
      .bind(await hashToken(token), purpose, emailNorm, email, pid, pendingHash, d.now, d.now + SIGNUP_TOKEN_TTL_MS),
  ]);
  return token;
}

/** POST /api/account/email {email, password}: emails an add_email link (or, for a taken address, a conflict email). */
export async function requestAddEmail(d: FlowDeps, s: Session, rawEmail: string, password: string): Promise<void> {
  const sender = requireMail(d);
  if (await passwordIdentity(d.db, s.pid)) throw alreadyHasEmail();
  const e = normalizeEmail(rawEmail);
  if (!e) throw invalidEmail();
  requirePolicy(password, e.norm);
  await throttle(d, s.pid);
  if (!(await mailAllowed(d.db, e.norm, d.now))) return;
  const hash = await hashPassword(password, d.peppers.current);
  const owner = await ownerOf(d.db, e.norm);
  const token = await issue(d, 'add_email', s.pid, e.norm, e.display, hash);
  // A taken address gets the same link (V6-LINK-03 turns it into the conflict proof); opening it links nothing here.
  queue(d, sender, owner !== null && owner !== s.pid ? 'email_conflict' : 'add_email', e.display, d.lang, `${d.gameUrl}/auth/add_email#t=${token}`);
}

/** POST /api/account/email/change {email}: emails a change_email link to the new address. */
export async function requestChangeEmail(d: FlowDeps, s: Session, rawEmail: string): Promise<void> {
  const sender = requireMail(d);
  const ident = await passwordIdentity(d.db, s.pid);
  if (!ident) throw new ApiError(400, 'no_password', 'This account has no email yet');
  const e = normalizeEmail(rawEmail);
  if (!e) throw invalidEmail();
  if (e.norm === ident.subject) throw new ApiError(400, 'same_email', 'This is already your email');
  await throttle(d, s.pid);
  if (!(await mailAllowed(d.db, e.norm, d.now))) return;
  const taken = (await ownerOf(d.db, e.norm)) !== null;
  // The same write either way; a taken address's token is never sent, so it is inert.
  const token = await issue(d, 'change_email', s.pid, e.norm, e.display, null);
  if (taken) queue(d, sender, 'email_in_use', e.display, d.lang);
  else queue(d, sender, 'change_email', e.display, d.lang, `${d.gameUrl}/auth/change_email#t=${token}`);
}

interface TokenRow {
  email_norm: string;
  email: string;
  player_id: number | null;
  pending_hash: string | null;
}

async function liveToken(d: FlowDeps, purpose: 'add_email' | 'change_email', token: string): Promise<{ th: string; row: TokenRow & { player_id: number }; player: PlayerRow }> {
  if (!EMAIL_TOKEN.test(token)) throw invalidToken();
  const th = await hashToken(token);
  const row = await d.db
    .prepare('SELECT email_norm, email, player_id, pending_hash FROM email_tokens WHERE token_hash = ?1 AND purpose = ?2 AND used_at IS NULL AND expires_at > ?3')
    .bind(th, purpose, d.now)
    .first<TokenRow>();
  if (!row || row.player_id === null) throw invalidToken();
  const player = await d.db.prepare('SELECT * FROM players WHERE id = ?1 AND deleted_at IS NULL').bind(row.player_id).first<PlayerRow>();
  if (!player) throw invalidToken();
  if (player.banned_at !== null) throw bannedError();
  // A deleted banned player's address stays refused for 180 days (ADR-0009 §7.7, V6-048).
  if (await isBanTombstoned(d.db, () => d.peppers, 'password', row.email_norm, d.now)) throw bannedError();
  return { th, row: row as TokenRow & { player_id: number }, player };
}

/** Spends the token (single use); invalid_token when a concurrent open won. */
async function spend(d: FlowDeps, th: string): Promise<void> {
  const spent = await d.db.prepare('UPDATE email_tokens SET used_at = ?2 WHERE token_hash = ?1 AND used_at IS NULL AND expires_at > ?2 RETURNING 1 AS x').bind(th, d.now).first();
  if (!spent) throw invalidToken();
}

const uniqueOn = (e: unknown, cols: string) => /UNIQUE/i.test(String((e as Error)?.message)) && String((e as Error).message).includes(cols);

/**
 * POST /api/auth/verify, purpose add_email: inserts the password identity and
 * its hash for the player. 409 `email_conflict` (the token stays live, for
 * V6-LINK-03) when the address belongs to another account.
 */
export async function verifyAddEmail(d: FlowDeps, notify: Notifier, token: string): Promise<PlayerRow> {
  const { th, row, player } = await liveToken(d, 'add_email', token);
  if (!row.pending_hash) throw invalidToken();
  const owner = await ownerOf(d.db, row.email_norm);
  if (owner !== null && owner !== player.id) throw emailConflict();
  if (owner === null && (await passwordIdentity(d.db, player.id))) throw alreadyHasEmail();
  await spend(d, th);
  if (owner === player.id) return player; // already added (a second device opened an older copy)
  try {
    await d.db.batch([
      d.db
        .prepare(`INSERT INTO auth_identities (player_id, kind, subject, email, verified_at, created_at) VALUES (?1, 'password', ?2, ?3, ?4, ?4)`)
        .bind(player.id, row.email_norm, row.email, d.now),
      d.db
        .prepare(`INSERT INTO password_hashes (identity_id, hash, updated_at) SELECT id, ?2, ?3 FROM auth_identities WHERE kind = 'password' AND subject = ?1`)
        .bind(row.email_norm, row.pending_hash, d.now),
      d.db.prepare(`UPDATE email_tokens SET used_at = ?2 WHERE player_id = ?1 AND purpose = 'add_email' AND used_at IS NULL`).bind(player.id, d.now),
    ]);
  } catch (e) {
    if (uniqueOn(e, 'auth_identities.kind')) throw emailConflict();
    if (uniqueOn(e, 'auth_identities.player_id')) throw alreadyHasEmail();
    throw e;
  }
  forgetSessions(player.id);
  notify('email_added', await noticeTargets(d.db, player.id));
  return player;
}

/**
 * POST /api/auth/verify, purpose change_email: the password identity's
 * subject and email become the new address in place (the password stays).
 * The old address and the Telegram chat are told.
 */
export async function verifyChangeEmail(d: FlowDeps, notify: Notifier, token: string): Promise<PlayerRow> {
  const { th, row, player } = await liveToken(d, 'change_email', token);
  const ident = await passwordIdentity(d.db, player.id);
  if (!ident) throw invalidToken(); // the email was removed meanwhile
  const owner = await ownerOf(d.db, row.email_norm);
  if (owner === player.id) {
    await spend(d, th);
    return player; // already moved
  }
  if (owner !== null) throw emailTaken();
  const before = await noticeTargets(d.db, player.id);
  await spend(d, th);
  try {
    const [moved] = await d.db.batch([
      d.db.prepare('UPDATE auth_identities SET subject = ?3, email = ?4 WHERE id = ?1 AND subject = ?2').bind(ident.id, ident.subject, row.email_norm, row.email),
      // Every other live link of the player dies, and so does a reset link sent to the old address.
      d.db
        .prepare(`UPDATE email_tokens SET used_at = ?3 WHERE used_at IS NULL AND ((player_id = ?1 AND purpose IN ('change_email', 'reset')) OR (email_norm = ?2 AND purpose = 'reset'))`)
        .bind(player.id, ident.subject, d.now),
    ]);
    if ((moved.meta.changes ?? 0) === 0) throw invalidToken();
  } catch (e) {
    if (uniqueOn(e, 'auth_identities.kind')) throw emailTaken();
    throw e;
  }
  forgetSessions(player.id);
  // The notice goes to the old address (M-LK-4) and the chat; the new address just confirmed itself.
  notify('email_changed', before);
  return player;
}
