/**
 * Link conflicts (ADR-0009 §5; M-LK-5, M-LK-6, M-LK-7, N-LK-1): linking an
 * identity that already has its own player. There is never a merge of game
 * state: one player survives with the sign-ins of both, the other is deleted
 * under §7.
 *
 * - The other side is empty (no progress, no purchases, only the one sign-in
 *   being linked) → it is deleted at once and the link completes.
 * - Otherwise a `link_conflicts` row (15 minutes) waits for the player's choice:
 *   GET shows both sides, resolve keeps one after the loser's typed name.
 * - Purchases or entitlements force their side to survive; both → 409
 *   `contact_support`. A loser in live play → 409 `busy_try_later`.
 *
 * Every transfer is one D1 batch: the identities the survivor lacks move over
 * with the `players.telegram_id` mirror (M-ID-3), the loser's deletion starts
 * (deleted_at, deletion_jobs) and its sessions go, and the caller's single-use
 * proof (the link code, the email token, the conflict row) is spent last.
 * Each statement is guarded by "that proof is still live", so of two
 * concurrent requests one does everything and the other nothing. The rest of
 * the deletion runs right after (the cron finishes it if it stops).
 */
import type { Env } from '../env';
import { ApiError } from '../errors';
import { bannedError } from '../ban';
import { b64urlEncode } from '../crypto';
import { forgetSessions } from '../auth/sessions';
import { deleteAccount, isBusy, startDeletion } from './delete';
import { noticeTargets, type Notifier } from './notices';
import type { IdentityKind } from './banTombstone';
import type { PlayerRow } from '../players';
import { invalidCredentials, invalidToken, login, type FlowDeps } from '../auth/flows';
import { liveToken, ownerOf, verifyAddEmail } from './email';

export const CONFLICT_TTL_MS = 15 * 60_000;
export const CONFLICT_ID = /^[A-Za-z0-9_-]{22}$/;

export type ConflictKind = 'telegram' | 'email';

/** One side of a conflict as the player sees it (accounts-v6.md §8.7): the player's own data only. */
export interface SideSummary {
  displayName: string;
  signIn: IdentityKind[];
  /** Campaign day of the cloud save (1-based), null without one. */
  campaignDay: number | null;
  heroes: number;
  duelRating: number | null;
  war: { regions: number } | null;
  purchases: boolean;
  createdAt: number;
}

interface Facts {
  id: number;
  displayName: string;
  createdAt: number;
  banned: boolean;
  deleted: boolean;
  kinds: IdentityKind[];
  paid: boolean;
  /** ADR-0009 §5.1: anything beyond a fresh account. */
  progress: boolean;
  summary: SideSummary;
}

interface FactsRow {
  id: number;
  display_name: string;
  created_at: number;
  banned_at: number | null;
  deleted_at: number | null;
  won: number | null;
  heroes: number | null;
  hours: number | null;
  rating: number | null;
  war: number;
  regions: number;
  duel: number;
  paid: number;
  drachmae: number;
  ledger: number;
  clan: number;
  kinds: string | null;
}

export async function facts(db: D1Database, pid: number): Promise<Facts | null> {
  const save = (expr: string) => `(SELECT ${expr} FROM saves WHERE player_id = p.id AND json_valid(data))`;
  const r = await db
    .prepare(
      `SELECT p.id, p.display_name, p.created_at, p.banned_at, p.deleted_at,
              ${save(`json_extract(data, '$.won')`)} AS won,
              ${save(`json_array_length(data, '$.heroes')`)} AS heroes,
              ${save(`json_extract(data, '$.world.time')`)} AS hours,
              (SELECT rating FROM duel_ratings WHERE player_id = p.id AND ladder = 'live') AS rating,
              EXISTS (SELECT 1 FROM online_profiles WHERE player_id = p.id) AS war,
              (SELECT COUNT(*) FROM online_regions WHERE owner_id = p.id) AS regions,
              EXISTS (SELECT 1 FROM duel_profiles WHERE player_id = p.id) OR EXISTS (SELECT 1 FROM duel_ratings WHERE player_id = p.id) AS duel,
              EXISTS (SELECT 1 FROM purchases WHERE player_id = p.id) OR EXISTS (SELECT 1 FROM entitlements WHERE player_id = p.id) AS paid,
              COALESCE((SELECT drachmae FROM wallets WHERE player_id = p.id), 0) AS drachmae,
              EXISTS (SELECT 1 FROM drachmae_ledger WHERE player_id = p.id) AS ledger,
              EXISTS (SELECT 1 FROM clan_members WHERE player_id = p.id) AS clan,
              (SELECT group_concat(kind) FROM (SELECT kind FROM auth_identities WHERE player_id = p.id ORDER BY id)) AS kinds
       FROM players p WHERE p.id = ?1`,
    )
    .bind(pid)
    .first<FactsRow>();
  if (!r) return null;
  const kinds = (r.kinds ? r.kinds.split(',') : []) as IdentityKind[];
  const progress = (r.won ?? 0) > 1 || !!r.war || !!r.duel || !!r.paid || r.drachmae !== 0 || !!r.ledger || !!r.clan;
  return {
    id: r.id,
    displayName: r.display_name,
    createdAt: r.created_at,
    banned: r.banned_at !== null,
    deleted: r.deleted_at !== null,
    kinds,
    paid: !!r.paid,
    progress,
    summary: {
      displayName: r.display_name,
      signIn: kinds,
      campaignDay: r.hours === null ? null : Math.floor(r.hours / 24) + 1,
      heroes: r.heroes ?? 0,
      duelRating: r.rating === null ? null : Math.round(r.rating),
      war: r.war ? { regions: r.regions } : null,
      purchases: !!r.paid,
      createdAt: r.created_at,
    },
  };
}

/** True when the player has anything to lose (ADR-0009 §5.1). */
export async function hasProgress(db: D1Database, pid: number): Promise<boolean> {
  return (await facts(db, pid))?.progress ?? false;
}

export const busyError = () => new ApiError(409, 'busy_try_later', 'That account is in a live match, queue or battle. Try again when it has finished');
const contactSupport = () => new ApiError(409, 'contact_support', 'Both accounts have purchases. Contact support to resolve this');
const conflictExpired = () => new ApiError(410, 'conflict_expired', 'This choice timed out. Start the link again');

/** A value inlined into a guard: only base64url and digits ever get here (ids, hashes, times). */
export function lit(v: string | number): string {
  const s = String(v);
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error('unsafe guard literal');
  return typeof v === 'number' ? s : `'${s}'`;
}

/** A single-use proof: `guard` is true while it is live; `spend` (last in the batch) consumes it and must change one row. */
export interface Proof {
  guard: string;
  spend: D1PreparedStatement;
}

/**
 * Moves to `survivor` every identity kind it lacks from `loser` (with the
 * mirror), starts the loser's deletion and revokes its sessions, spends the
 * proof, then runs the deletion. Returns the kinds that moved; throws
 * busy_try_later (nothing changed) or `gone()` when the proof was spent
 * meanwhile.
 */
export async function transfer(env: Env, survivor: number, loser: number, proof: Proof, gone: () => ApiError, now: number): Promise<IdentityKind[]> {
  const db = env.DB!;
  if (await isBusy(env, db, loser, now)) throw busyError();
  const [mine, theirs] = await db.batch([
    db.prepare('SELECT kind FROM auth_identities WHERE player_id = ?1').bind(survivor),
    db.prepare('SELECT id, kind, subject FROM auth_identities WHERE player_id = ?1').bind(loser),
  ]);
  const have = new Set((mine.results as { kind: IdentityKind }[]).map((r) => r.kind));
  const moving = (theirs.results as { id: number; kind: IdentityKind; subject: string }[]).filter((i) => !have.has(i.kind));
  const g = proof.guard;
  const stmts: D1PreparedStatement[] = [];
  for (const m of moving) {
    if (m.kind === 'telegram') stmts.push(db.prepare(`UPDATE players SET telegram_id = NULL WHERE id = ?1 AND ${g}`).bind(loser));
    stmts.push(db.prepare(`UPDATE auth_identities SET player_id = ?2 WHERE id = ?1 AND player_id = ?3 AND ${g}`).bind(m.id, survivor, loser));
    if (m.kind === 'telegram') stmts.push(db.prepare(`UPDATE players SET telegram_id = ?2 WHERE id = ?1 AND ${g}`).bind(survivor, Number(m.subject)));
  }
  stmts.push(...startDeletion(db, loser, 'conflict', now, g), db.prepare(`DELETE FROM sessions WHERE player_id = ?1 AND ${g}`).bind(loser), proof.spend);
  const res = await db.batch(stmts);
  forgetSessions(loser);
  forgetSessions(survivor);
  if ((res[res.length - 1].meta.changes ?? 0) !== 1) throw gone();
  // The job is started: this resumes it, and the daily cron finishes a run that stops.
  await deleteAccount(env, loser, 'conflict', now);
  return moving.map((m) => m.kind);
}

/** Notices for the identities a player just gained (M-LK-4): to its address(es) and chat as they are now. */
export async function noticeGained(db: D1Database, notify: Notifier, pid: number, kinds: IdentityKind[]): Promise<void> {
  if (!kinds.length) return;
  const to = await noticeTargets(db, pid);
  for (const k of kinds) notify(k === 'telegram' ? 'telegram_linked' : 'email_added', to);
}

/**
 * A link found the identity on another player (`other`). An empty other side
 * is removed and the link completes ({removedEmpty}); otherwise a conflict row
 * is opened and the proof is spent ({conflict}). Both sides with purchases:
 * contact_support, nothing spent.
 */
export async function settle(
  env: Env,
  notify: Notifier,
  kind: ConflictKind,
  self: number,
  other: number,
  proof: Proof,
  gone: () => ApiError,
  now: number,
): Promise<{ removedEmpty: true } | { conflict: string }> {
  const db = env.DB!;
  const [a, b] = await Promise.all([facts(db, self), facts(db, other)]);
  if (!a || !b || a.deleted || b.deleted) throw gone();
  if (a.banned || b.banned) throw bannedError();
  if (a.paid && b.paid) throw contactSupport();
  if (!b.progress && b.kinds.length === 1) {
    const moved = await transfer(env, self, other, proof, gone, now);
    await noticeGained(db, notify, self, moved);
    return { removedEmpty: true };
  }
  const id = b64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
  const [, spent] = await db.batch([
    db
      .prepare(`INSERT INTO link_conflicts (id, player_id, other_player_id, kind, created_at, expires_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE ${proof.guard}`)
      .bind(id, self, other, kind, now, now + CONFLICT_TTL_MS),
    proof.spend,
  ]);
  if ((spent.meta.changes ?? 0) !== 1) throw gone();
  return { conflict: id };
}

interface ConflictRow {
  id: string;
  player_id: number;
  other_player_id: number;
  kind: ConflictKind;
  expires_at: number;
}

async function liveConflict(db: D1Database, pid: number, id: string, now: number): Promise<{ row: ConflictRow; self: Facts; other: Facts }> {
  if (!CONFLICT_ID.test(id)) throw new ApiError(404, 'not_found', 'No such conflict');
  const row = await db.prepare('SELECT id, player_id, other_player_id, kind, expires_at FROM link_conflicts WHERE id = ?1 AND player_id = ?2').bind(id, pid).first<ConflictRow>();
  if (!row) throw new ApiError(404, 'not_found', 'No such conflict');
  if (row.expires_at <= now) throw conflictExpired();
  const [self, other] = await Promise.all([facts(db, row.player_id), facts(db, row.other_player_id)]);
  if (!self || !other || self.deleted || other.deleted) throw conflictExpired();
  if (self.banned || other.banned) throw bannedError();
  if (self.paid && other.paid) throw contactSupport();
  return { row, self, other };
}

const forcedOf = (self: Facts, other: Facts): 'this' | 'other' | null => (self.paid ? 'this' : other.paid ? 'other' : null);

/** GET /api/account/conflict/:id: both sides, and the forced survivor when purchases decide it. */
export async function conflictView(db: D1Database, pid: number, id: string, now: number) {
  const { row, self, other } = await liveConflict(db, pid, id, now);
  const forced = forcedOf(self, other);
  return { kind: row.kind, this: self.summary, other: other.summary, ...(forced ? { forced, reason: 'purchases' as const } : {}), expiresAt: row.expires_at };
}

/** Typed confirmations accept any case and surrounding spaces (accounts-v6.md §13.5). */
const fold = (s: string) => s.normalize('NFKC').trim().toLocaleLowerCase();

/**
 * POST /api/account/conflict/:id/resolve: keeps one side; the loser is
 * deleted (§7) and the survivor gets the sign-ins it lacked.
 */
export async function resolveConflict(
  env: Env,
  notify: Notifier,
  pid: number,
  id: string,
  keep: 'this' | 'other',
  typed: string,
  now: number,
): Promise<{ kept: 'this' | 'other'; survivor: number }> {
  const db = env.DB!;
  const { self, other } = await liveConflict(db, pid, id, now);
  const forced = forcedOf(self, other);
  if (forced && forced !== keep) throw new ApiError(409, 'forced_survivor', 'The account with purchases must be kept', { forced });
  const [survivor, loser] = keep === 'this' ? [self, other] : [other, self];
  if (fold(typed) !== fold(loser.displayName)) throw new ApiError(400, 'confirm_mismatch', "Type the name of the account that will be deleted");
  const proof: Proof = {
    guard: `EXISTS (SELECT 1 FROM link_conflicts WHERE id = ${lit(id)} AND expires_at > ${lit(now)})`,
    spend: db.prepare('DELETE FROM link_conflicts WHERE id = ?1 AND expires_at > ?2').bind(id, now),
  };
  const moved = await transfer(env, survivor.id, loser.id, proof, conflictExpired, now);
  await noticeGained(db, notify, survivor.id, moved);
  return { kept: keep, survivor: survivor.id };
}

/**
 * POST /api/auth/verify/conflict {token, password} (ADR-0009 §5.2, V6-049):
 * the add_email link that answered 409 email_conflict (it stays live), plus
 * the password of the account that owns the address. The link proves the
 * mailbox and the Telegram player's request; the password proves the other
 * account (the log-in lockout applies). Then the empty-side or conflict rules
 * run for the Telegram player ("this"), who gets a cookie session here.
 */
export async function proveEmailConflict(
  env: Env,
  d: FlowDeps,
  notify: Notifier,
  token: string,
  password: string,
): Promise<{ player: PlayerRow; removedEmpty?: true; conflict?: string }> {
  const { th, row, player } = await liveToken(d, 'add_email', token);
  const owner = await ownerOf(d.db, row.email_norm);
  // No conflict any more (the address was freed, or already added): the plain link does it.
  if (owner === null || owner === player.id) return { player: await verifyAddEmail(d, notify, token) };
  const other = await login(d, row.email, password);
  if (other.id !== owner) throw invalidCredentials();
  const proof: Proof = {
    guard: `EXISTS (SELECT 1 FROM email_tokens WHERE token_hash = ${lit(th)} AND used_at IS NULL AND expires_at > ${lit(d.now)})`,
    spend: d.db.prepare('UPDATE email_tokens SET used_at = ?2 WHERE token_hash = ?1 AND used_at IS NULL AND expires_at > ?2').bind(th, d.now),
  };
  const out = await settle(env, notify, 'email', player.id, other.id, proof, invalidToken, d.now);
  return { player, ...out };
}
