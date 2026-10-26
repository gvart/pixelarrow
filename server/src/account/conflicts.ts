/**
 * Link conflicts (ADR-0009 §5 as amended by V6-053; M-LK-5..8, N-LK-1, N-LK-4):
 * linking an identity that already has its own player. There is never a merge
 * of game state: one player survives with the sign-ins of both, the other is
 * deleted under §7.
 *
 * - The other side is strictly empty (no save beyond day 1 — see day1Only —, no
 *   purchases, no duel or war history, no clan, no Drachmae, only the one sign-in) → it is deleted
 *   at once and the link completes.
 * - Otherwise a `link_conflicts` row (15 minutes) needs the SAME choice from
 *   both sides: the web session that asked (re-authed), and the Telegram owner
 *   in the Mini App with fresh initData (≤ 10 minutes, the same Telegram user,
 *   from a launch newer than the one that completed the code). Neither side
 *   alone resolves; different choices cancel the conflict. The Mini App can
 *   cancel at any point ("Not me").
 * - Purchases or entitlements force their side to survive; both → 409
 *   `contact_support`. A loser in live play → 409 `busy_try_later`.
 *
 * Every transfer is one D1 batch: the identities the survivor lacks move over
 * with the `players.telegram_id` mirror (M-ID-3), the loser's deletion starts
 * (deleted_at, deletion_jobs) and its sessions go, and the single-use proof
 * (the link code, the email token, the agreed conflict row) is spent last.
 * Each statement is guarded by "that proof is still live and the loser isn't
 * busy", so the busy check and the write can't be split by a race, and of two
 * concurrent requests one does everything and the other nothing.
 */
import type { Env } from '../env';
import { ApiError } from '../errors';
import { bannedError } from '../ban';
import { b64urlEncode } from '../crypto';
import { forgetSessions, hashToken, type Session } from '../auth/sessions';
import { hitThrottle } from '../auth/throttle';
import { deleteAccount, startDeletion } from './delete';
import { noticeTargets, type Notifier } from './notices';
import type { IdentityKind } from './banTombstone';
import type { PlayerRow } from '../players';
import { invalidCredentials, invalidToken, login, type FlowDeps } from '../auth/flows';
import { liveToken, ownerOf, verifyAddEmail } from './email';
import { validateInitData, INIT_DATA_MAX_AGE_SEC, type TelegramUser } from '../telegramAuth';
import { REAUTH_WINDOW_MS } from './reauth';
import { maskEmail } from './summary';

const CONFLICT_TTL_MS = 15 * 60_000;
const CONFLICT_ID = /^[A-Za-z0-9_-]{22}$/;
const LINK_CODE_RE = /^link_([A-Za-z0-9_-]{22})$/;
/** Codes a player may create per hour; a Mini App cancel counts as one (V6-053). */
export const LINK_CODE_RULE = { limit: 10, windowMs: 3_600_000 };

type ConflictKind = 'telegram' | 'email';

/** One side of a conflict as the player sees it (accounts-v6.md §8.7). */
interface SideSummary {
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
  banned: boolean;
  deleted: boolean;
  kinds: IdentityKind[];
  paid: boolean;
  /** V6-053: anything at all beyond a fresh account. */
  progress: boolean;
  summary: SideSummary;
}

interface FactsRow {
  id: number;
  display_name: string;
  created_at: number;
  banned_at: number | null;
  deleted_at: number | null;
  saved: number;
  heroes: number | null;
  hours: number | null;
  won: number | null;
  fought: number | null;
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

async function facts(db: D1Database, pid: number): Promise<Facts | null> {
  const save = (expr: string) => `(SELECT ${expr} FROM saves WHERE player_id = p.id AND json_valid(data))`;
  const r = await db
    .prepare(
      `SELECT p.id, p.display_name, p.created_at, p.banned_at, p.deleted_at,
              EXISTS (SELECT 1 FROM saves WHERE player_id = p.id) AS saved,
              ${save(`json_array_length(data, '$.heroes')`)} AS heroes,
              ${save(`json_extract(data, '$.world.time')`)} AS hours,
              ${save(`json_extract(data, '$.won')`)} AS won,
              ${save(`json_extract(data, '$.fought')`)} AS fought,
              (SELECT rating FROM duel_ratings WHERE player_id = p.id AND ladder = 'live') AS rating,
              EXISTS (SELECT 1 FROM online_profiles WHERE player_id = p.id) AS war,
              0 AS regions, -- the old region map is gone (W-01)
              EXISTS (SELECT 1 FROM duel_profiles WHERE player_id = p.id) OR EXISTS (SELECT 1 FROM duel_ratings WHERE player_id = p.id)
                OR EXISTS (SELECT 1 FROM duel_matches WHERE player_a = p.id OR player_b = p.id) AS duel,
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
  // Strict (V6-053): any cloud save past day 1, purchase, duel or war history, clan, or Drachmae movement is progress.
  const progress = (!!r.saved && !day1Only(r)) || !!r.war || !!r.duel || !!r.paid || r.drachmae !== 0 || !!r.ledger || !!r.clan;
  return {
    id: r.id,
    displayName: r.display_name,
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

/**
 * A cloud save with day-1 progress only (V6-LINK-07): the game uploads a campaign the first time the
 * Mini App opens, so without this nearly every link would become a conflict. "Day 1 only" is exact:
 * the save is readable JSON, no campaign battle was fought or won (`fought` and `won` are 0; the
 * tutorial's battle counts toward neither, its small reward is not earned progress), and the campaign
 * clock is still on its first day (`world.time` < 24 hours). A missing or non-numeric field, or an
 * unreadable save, is progress (when in doubt, the player chooses).
 */
export function day1Only(s: { hours: unknown; won: unknown; fought: unknown }): boolean {
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  return num(s.won) && s.won === 0 && num(s.fought) && s.fought === 0 && num(s.hours) && s.hours >= 0 && s.hours < 24;
}

/** True when the player has anything to lose. */
export async function hasProgress(db: D1Database, pid: number): Promise<boolean> {
  return (await facts(db, pid))?.progress ?? false;
}

const contactSupport = () => new ApiError(409, 'contact_support', 'Both accounts have purchases. Contact support to resolve this');
const conflictExpired = () => new ApiError(410, 'conflict_expired', 'This choice timed out. Start the link again');
const linkCancelled = () => new ApiError(410, 'link_cancelled', 'The link was cancelled in Telegram');
const choicesDiffer = () => new ApiError(409, 'choices_differ', 'The two sides chose differently, so nothing was changed. Start the link again');
const noConflict = () => new ApiError(404, 'not_found', 'No such conflict');

/** A value inlined into a guard: only base64url and digits ever get here (ids, hashes, times). */
export function lit(v: string | number): string {
  const s = String(v);
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error('unsafe guard literal');
  return typeof v === 'number' ? s : `'${s}'`;
}

/** A single-use proof: `guard` is true while it is live; `spend(g)` (last in the batch, guarded by g) consumes it and must change one row. */
export interface Proof {
  guard: string;
  spend: (g: string) => D1PreparedStatement;
}

/**
 * Moves to `survivor` every identity kind it lacks from `loser` (with the
 * mirror), starts the loser's deletion and revokes its sessions, spends the
 * proof, then runs the deletion. Returns the kinds that moved; throws
 * `gone()` when the proof was spent meanwhile.
 */
async function transfer(env: Env, survivor: number, loser: number, proof: Proof, gone: () => ApiError, now: number): Promise<IdentityKind[]> {
  const db = env.DB!;
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
  stmts.push(...startDeletion(db, loser, 'conflict', now, g), db.prepare(`DELETE FROM sessions WHERE player_id = ?1 AND ${g}`).bind(loser), proof.spend(g));
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

interface ConflictOrigin {
  /** The web session that may choose (null until bound, for the email flow). */
  webSession: string | null;
  /** The Telegram user who must choose in the Mini App. */
  tgId: number;
  /** The initData hash already spent on this link (the code's complete), never accepted as a choice. */
  tgInitHash: string | null;
}

/**
 * A link found the identity on another player (`other`). A strictly empty
 * other side is removed and the link completes ({removedEmpty}); otherwise a
 * conflict row is opened, the proof is spent and the Telegram owner is asked
 * by the bot ({conflict}). Both sides with purchases: contact_support, nothing spent.
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
  origin: ConflictOrigin,
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
      .prepare(
        `INSERT INTO link_conflicts (id, player_id, other_player_id, kind, created_at, expires_at, web_session, tg_id, tg_init_hash)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9 WHERE ${proof.guard}`,
      )
      .bind(id, self, other, kind, now, now + CONFLICT_TTL_MS, origin.webSession, origin.tgId, origin.tgInitHash),
    proof.spend(proof.guard),
  ]);
  if ((spent.meta.changes ?? 0) !== 1) throw gone();
  // The Telegram owner must choose too (V6-053): the bot asks in their chat.
  const lang = (await db.prepare('SELECT language_code FROM players WHERE id = ?1').bind(kind === 'telegram' ? other : self).first<{ language_code: string | null }>())?.language_code ?? null;
  notify('link_conflict', { emails: [], telegramId: origin.tgId, languageCode: lang });
  return { conflict: id };
}

interface ConflictRow {
  id: string;
  player_id: number;
  other_player_id: number;
  kind: ConflictKind;
  created_at: number;
  expires_at: number;
  web_session: string | null;
  tg_id: number;
  tg_init_hash: string | null;
  keep_web: number | null;
  keep_tg: number | null;
  cancelled_at: number | null;
}

interface Live {
  row: ConflictRow;
  self: Facts;
  other: Facts;
  /** The player that owns the Telegram id, and the other (web) one. */
  tg: Facts;
  web: Facts;
  forced: Facts | null;
}

async function liveConflict(db: D1Database, id: string, now: number): Promise<Live> {
  if (!CONFLICT_ID.test(id)) throw noConflict();
  const row = await db.prepare('SELECT * FROM link_conflicts WHERE id = ?1').bind(id).first<ConflictRow>();
  if (!row) throw noConflict();
  if (row.cancelled_at !== null) throw linkCancelled();
  if (row.expires_at <= now) throw conflictExpired();
  const [self, other] = await Promise.all([facts(db, row.player_id), facts(db, row.other_player_id)]);
  if (!self || !other || self.deleted || other.deleted) throw conflictExpired();
  if (self.banned || other.banned) throw bannedError();
  if (self.paid && other.paid) throw contactSupport();
  const [tg, web] = row.kind === 'telegram' ? [other, self] : [self, other];
  return { row, self, other, tg, web, forced: self.paid ? self : other.paid ? other : null };
}

/** The web side's view and choices are only for the session the conflict is bound to. */
function forWebSession(l: Live, s: Session): void {
  if (l.row.web_session === null || l.row.web_session !== s.sid || l.row.player_id !== s.pid) throw noConflict();
}

const side = (l: Live, pid: number | null): 'this' | 'other' | null => (pid === null ? null : pid === l.self.id ? 'this' : 'other');

/** GET /api/account/conflict/:id (the bound web session): both sides, the forced survivor, and each side's choice so far. */
export async function conflictView(db: D1Database, s: Session, id: string, now: number) {
  const l = await liveConflict(db, id, now);
  forWebSession(l, s);
  const forced = side(l, l.forced?.id ?? null);
  return {
    kind: l.row.kind,
    this: l.self.summary,
    other: l.other.summary,
    ...(forced ? { forced, reason: 'purchases' as const } : {}),
    choices: { web: side(l, l.row.keep_web), telegram: side(l, l.row.keep_tg) },
    expiresAt: l.row.expires_at,
  };
}

/** Typed confirmations accept any case and surrounding spaces (accounts-v6.md §13.5). */
const fold = (s: string) => s.normalize('NFKC').trim().toLocaleLowerCase();

/** Different choices: nothing happens and the conflict ends (V6-053). */
async function endConflict(db: D1Database, id: string, now: number): Promise<never> {
  await db.prepare('UPDATE link_conflicts SET expires_at = ?2 WHERE id = ?1').bind(id, now).run();
  throw choicesDiffer();
}

/**
 * POST /api/account/conflict/:id/resolve (the bound web session, re-authed by
 * the route): records the web side's choice. It resolves only when the
 * Telegram owner already chose the same in the Mini App; different choices end
 * the conflict. Re-posting the same choice after the Mini App agreed resolves.
 */
export async function resolveConflict(
  env: Env,
  notify: Notifier,
  s: Session,
  id: string,
  keep: 'this' | 'other',
  typed: string,
  now: number,
): Promise<{ status: 'waiting_telegram' } | { status: 'resolved'; kept: 'this' | 'other'; survivor: number }> {
  const db = env.DB!;
  const l = await liveConflict(db, id, now);
  forWebSession(l, s);
  const [survivor, loser] = keep === 'this' ? [l.self, l.other] : [l.other, l.self];
  if (l.forced && l.forced.id !== survivor.id) throw new ApiError(409, 'forced_survivor', 'The account with purchases must be kept', { forced: side(l, l.forced.id) });
  if (fold(typed) !== fold(loser.displayName)) throw new ApiError(400, 'confirm_mismatch', 'Type the name of the account that will be deleted');
  if (l.row.keep_web !== null && l.row.keep_web !== survivor.id) throw new ApiError(409, 'already_chosen', 'This side already chose');
  if (l.row.keep_tg !== null && l.row.keep_tg !== survivor.id) return endConflict(db, id, now);
  if (l.row.keep_web === null) {
    await db.prepare('UPDATE link_conflicts SET keep_web = ?2 WHERE id = ?1 AND keep_web IS NULL').bind(id, survivor.id).run();
  }
  if (l.row.keep_tg === null) return { status: 'waiting_telegram' };
  const agreed = `keep_web = ${lit(survivor.id)} AND keep_tg = ${lit(survivor.id)}`;
  const proof: Proof = {
    guard: `EXISTS (SELECT 1 FROM link_conflicts WHERE id = ${lit(id)} AND expires_at > ${lit(now)} AND cancelled_at IS NULL AND ${agreed})`,
    spend: (g) => db.prepare(`DELETE FROM link_conflicts WHERE id = ?1 AND ${g}`).bind(id),
  };
  const moved = await transfer(env, survivor.id, loser.id, proof, conflictExpired, now);
  await noticeGained(db, notify, survivor.id, moved);
  return { status: 'resolved', kept: keep, survivor: survivor.id };
}

// ---- The Mini App side (V6-053) ----

/** Validated initData of the Telegram user, at most `maxAgeSec` old. */
async function telegramProof(botToken: string, initData: string, now: number, maxAgeSec: number): Promise<{ user: TelegramUser; authDate: number; hash: string; startParam: string | null }> {
  const r = await validateInitData(initData, botToken, Math.floor(now / 1000), maxAgeSec);
  if (!r.ok) {
    if (r.reason === 'expired') throw new ApiError(401, 'init_data_expired', 'Reopen Pixelarrow in Telegram to continue');
    throw new ApiError(401, 'invalid_init_data', `initData rejected: ${r.reason}`);
  }
  return { user: r.user, authDate: r.authDate, hash: await hashToken(initData), startParam: r.fields.start_param ?? null };
}

interface TelegramConflictView {
  id: string;
  kind: ConflictKind;
  /** The Telegram user's own account, and the web account that asks (with its masked email). */
  telegram: SideSummary;
  web: SideSummary & { emailMasked: string | null };
  forced?: 'telegram' | 'web';
  reason?: 'purchases';
  choices: { telegram: 'telegram' | 'web' | null; web: 'telegram' | 'web' | null };
  expiresAt: number;
}

const tgSide = (l: Live, pid: number | null): 'telegram' | 'web' | null => (pid === null ? null : pid === l.tg.id ? 'telegram' : 'web');

/** POST /api/account/conflict/telegram {initData} (Mini App): the live conflicts this Telegram user must decide. */
export async function telegramConflicts(db: D1Database, botToken: string, initData: string, now: number): Promise<{ conflicts: TelegramConflictView[] }> {
  const t = await telegramProof(botToken, initData, now, REAUTH_WINDOW_MS / 1000);
  const ids = (await db.prepare('SELECT id FROM link_conflicts WHERE tg_id = ?1 AND expires_at > ?2 AND cancelled_at IS NULL ORDER BY created_at DESC').bind(t.user.id, now).all<{ id: string }>()).results;
  const out: TelegramConflictView[] = [];
  for (const { id } of ids) {
    let l: Live;
    try {
      l = await liveConflict(db, id, now);
    } catch {
      continue;
    }
    const mail = await db.prepare(`SELECT subject FROM auth_identities WHERE player_id = ?1 AND kind = 'password'`).bind(l.web.id).first<{ subject: string }>();
    const forced = tgSide(l, l.forced?.id ?? null);
    out.push({
      id,
      kind: l.row.kind,
      telegram: l.tg.summary,
      web: { ...l.web.summary, emailMasked: mail ? maskEmail(mail.subject) : null },
      ...(forced ? { forced, reason: 'purchases' as const } : {}),
      choices: { telegram: tgSide(l, l.row.keep_tg), web: tgSide(l, l.row.keep_web) },
      expiresAt: l.row.expires_at,
    });
  }
  return { conflicts: out };
}

/**
 * POST /api/account/conflict/:id/telegram {initData, keep} (Mini App): the
 * Telegram owner's choice. Needs initData ≤ 10 minutes old, of the conflict's
 * Telegram user, from a launch newer than the code's complete. Never resolves
 * by itself; the web side completes an agreed choice.
 */
export async function chooseFromTelegram(db: D1Database, botToken: string, id: string, initData: string, keep: 'telegram' | 'web', now: number): Promise<{ status: 'waiting_web' }> {
  const t = await telegramProof(botToken, initData, now, REAUTH_WINDOW_MS / 1000);
  const l = await liveConflict(db, id, now);
  if (t.user.id !== l.row.tg_id) throw new ApiError(403, 'wrong_account', 'This Telegram account is not part of this link');
  if (t.hash === l.row.tg_init_hash || t.authDate < Math.floor(l.row.created_at / 1000)) {
    throw new ApiError(401, 'init_data_reused', 'Reopen Pixelarrow in Telegram to choose');
  }
  const survivor = keep === 'telegram' ? l.tg : l.web;
  if (l.forced && l.forced.id !== survivor.id) throw new ApiError(409, 'forced_survivor', 'The account with purchases must be kept', { forced: tgSide(l, l.forced.id) });
  if (l.row.keep_tg !== null && l.row.keep_tg !== survivor.id) throw new ApiError(409, 'already_chosen', 'This side already chose');
  if (l.row.keep_web !== null && l.row.keep_web !== survivor.id) return endConflict(db, id, now);
  await db.prepare('UPDATE link_conflicts SET keep_tg = ?2, tg_init_hash = ?3 WHERE id = ?1 AND (keep_tg IS NULL OR keep_tg = ?2)').bind(id, survivor.id, t.hash).run();
  return { status: 'waiting_web' };
}

/**
 * POST /api/account/link/telegram/cancel {initData} (Mini App "Not me", at any
 * point): cancels the code named by start_param (or any this user completed)
 * and every live conflict of this Telegram user. Each web owner is told and
 * the cancel counts toward their code limit.
 */
export async function cancelFromTelegram(db: D1Database, botToken: string, notify: Notifier, initData: string, now: number): Promise<{ cancelled: number }> {
  const t = await telegramProof(botToken, initData, now, INIT_DATA_MAX_AGE_SEC);
  const m = LINK_CODE_RE.exec(t.startParam ?? '');
  const codeHash = m ? await hashToken(m[1]) : null;
  const [codes, conflicts] = await db.batch([
    db
      .prepare(
        `UPDATE link_codes SET cancelled_at = ?3 WHERE status != 'used' AND cancelled_at IS NULL AND expires_at > ?3
           AND ((code_hash = ?1 AND (status = 'pending' OR telegram_id = ?2)) OR (status = 'awaiting_web' AND telegram_id = ?2))
         RETURNING player_id`,
      )
      .bind(codeHash, t.user.id, now),
    db
      .prepare(
        `UPDATE link_conflicts SET cancelled_at = ?2 WHERE tg_id = ?1 AND cancelled_at IS NULL AND expires_at > ?2
         RETURNING CASE kind WHEN 'telegram' THEN player_id ELSE other_player_id END AS player_id`,
      )
      .bind(t.user.id, now),
  ]);
  const owners = new Set([...(codes.results as { player_id: number }[]), ...(conflicts.results as { player_id: number }[])].map((r) => r.player_id));
  for (const pid of owners) {
    await hitThrottle(db, `linkcode:${pid}`, LINK_CODE_RULE, now);
    notify('link_cancelled', await noticeTargets(db, pid));
  }
  return { cancelled: codes.results.length + conflicts.results.length };
}

/** The email flow opens the conflict before the browser's session exists; this binds the web side to it. */
export async function bindWebSession(db: D1Database, id: string, sid: string): Promise<void> {
  await db.prepare('UPDATE link_conflicts SET web_session = ?2 WHERE id = ?1 AND web_session IS NULL').bind(id, sid).run();
}

/**
 * POST /api/auth/verify/conflict {token, password} (ADR-0009 §5.2, V6-049):
 * the add_email link that answered 409 email_conflict (it stays live), plus
 * the password of the account that owns the address. The link proves the
 * mailbox and the Telegram player's request; the password proves the other
 * account (the log-in lockout applies). Then the empty-side or conflict rules
 * run for the Telegram player ("this"), who gets a cookie session here; the
 * Telegram owner must still choose in the Mini App.
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
  const tg = await d.db.prepare(`SELECT subject FROM auth_identities WHERE player_id = ?1 AND kind = 'telegram'`).bind(player.id).first<{ subject: string }>();
  if (!tg) throw invalidToken();
  const proof: Proof = {
    guard: `EXISTS (SELECT 1 FROM email_tokens WHERE token_hash = ${lit(th)} AND used_at IS NULL AND expires_at > ${lit(d.now)})`,
    spend: (g) => d.db.prepare(`UPDATE email_tokens SET used_at = ?2 WHERE token_hash = ?1 AND ${g}`).bind(th, d.now),
  };
  const out = await settle(env, notify, 'email', player.id, other.id, proof, invalidToken, d.now, { webSession: null, tgId: Number(tg.subject), tgInitHash: null });
  return { player, ...out };
}
