/**
 * Account deletion (ADR-0009 §7, control manifest M-DL). Immediate and
 * irreversible; idempotent and resumable.
 *
 * A run starts by writing `deletion_jobs` and `players.deleted_at` in one batch
 * (from then on no session works and none can be created), then runs the steps
 * in order. Each step is one D1 batch that also advances `deletion_jobs.step`,
 * so a step either happens with its advance or not at all, and every statement
 * in it can run twice without harm. An interrupted run is finished by the daily
 * cron (finishDeletions).
 *
 *   revoke     sessions, identities (and password hashes), email tokens, link
 *              codes and conflicts, throttle keys, bot rows, support requests;
 *              a banned player's identities go to ban_tombstones as hashes
 *   leave      market listings, regions and garrisons, clan (leadership passes
 *              on, an empty clan is disbanded), duel queue, open sockets
 *   purge      every `delete` table of DELETION_MAP
 *   tombstone  the players row loses every personal field; the freed name is
 *              held 30 days through display_name_history
 *
 * Kept rows (purchases, entitlements, ledger, audits, other players' history)
 * keep pointing at the same id, which is now the tombstone.
 */
import type { Env } from '../env';
import { peppersFromEnv } from '../auth/password';
import { forgetSessions } from '../auth/sessions';
import { emailKeyHash } from '../auth/throttle';
import { NAME_HOLD_MS } from '../players';
import { log, logError } from '../telemetry/log';
import { BAN_TOMBSTONE_MS, banIdentityHash, type IdentityKind } from './banTombstone';
import { purgeTables } from './deletionMap';

type DeletionReason = 'self' | 'conflict' | 'admin';
type DeletionResult = 'done' | 'resumable';

/** What other players see in place of a deleted player's name. */
export const DELETED_NAME = 'Deleted player';
export const DELETION_STEPS = ['revoke', 'leave', 'purge', 'tombstone'] as const;
/** The cron sweeps finished deletions this long for rows written late (a match settling after the run). */
const SWEEP_MS = 2 * 86_400_000;

interface DeleteOptions {
  /** Run at most this many steps now and leave the rest to the cron, as an interrupted run would. */
  maxSteps?: number;
  /** Called with the player's email addresses before the identities go (the confirmation email, ADR-0009 §7). Failures are logged, not fatal. */
  beforeRevoke?: (emails: string[]) => Promise<void>;
}

interface Job {
  player_id: number;
  step: number;
  finished_at: number | null;
}

interface Ctx {
  env: Env;
  db: D1Database;
  pid: number;
  now: number;
  opts: DeleteOptions;
}

const getJob = (db: D1Database, pid: number) => db.prepare('SELECT player_id, step, finished_at FROM deletion_jobs WHERE player_id = ?1').bind(pid).first<Job>();

/**
 * Deletes the player (ADR-0009 §7). 'resumable' when
 * the run stopped before the end (the cron finishes it). Calling it again on a
 * started or finished deletion resumes or does nothing.
 */
export async function deleteAccount(env: Env, pid: number, reason: DeletionReason, now = Date.now(), opts: DeleteOptions = {}): Promise<DeletionResult> {
  const db = env.DB;
  if (!db) throw new Error('D1 is not configured');
  let job = await getJob(db, pid);
  if (!job) {
    if (!(await db.prepare('SELECT 1 FROM players WHERE id = ?1').bind(pid).first())) throw new Error(`no player ${pid}`);
    await db.batch(startDeletion(db, pid, reason, now));
    forgetSessions(pid);
    log('info', 'account_deletion', { pid, reason });
    job = (await getJob(db, pid))!;
  }
  return runJob({ env, db, pid, now, opts }, job.step);
}

/**
 * The statements that start a deletion: the job row and `deleted_at` (no
 * session works from then on). `guard` (an SQL condition) lets a caller start
 * it inside its own batch only when that batch's precondition holds (V6-LINK-03
 * conflicts); deleteAccount then resumes the started job.
 */
export function startDeletion(db: D1Database, pid: number, reason: DeletionReason, now: number, guard = '1'): D1PreparedStatement[] {
  return [
    db.prepare(`INSERT INTO deletion_jobs (player_id, reason, step, started_at) SELECT ?1, ?2, 0, ?3 WHERE ${guard} ON CONFLICT (player_id) DO NOTHING`).bind(pid, reason, now),
    db.prepare(`UPDATE players SET deleted_at = COALESCE(deleted_at, ?2) WHERE id = ?1 AND ${guard}`).bind(pid, now),
  ];
}

async function runJob(x: Ctx, from: number): Promise<DeletionResult> {
  let budget = x.opts.maxSteps ?? Infinity;
  for (let step = from; step < DELETION_STEPS.length; step++) {
    if (budget-- <= 0) return 'resumable';
    try {
      const stmts = await STEPS[step](x);
      const last = step === DELETION_STEPS.length - 1;
      stmts.push(
        x.db
          .prepare(`UPDATE deletion_jobs SET step = ?2 + 1${last ? ', finished_at = ?3' : ''} WHERE player_id = ?1 AND step = ?2`)
          .bind(x.pid, step, ...(last ? [x.now] : [])),
      );
      await x.db.batch(stmts);
      if (step === 0) forgetSessions(x.pid);
    } catch (e) {
      logError('account_deletion', e, { pid: x.pid, step: DELETION_STEPS[step] });
      return 'resumable';
    }
  }
  return 'done';
}

const STEPS: ((x: Ctx) => Promise<D1PreparedStatement[]>)[] = [revoke, leave, purge, tombstone];

async function revoke(x: Ctx): Promise<D1PreparedStatement[]> {
  const { db, pid } = x;
  const p = await db.prepare('SELECT telegram_id, banned_at FROM players WHERE id = ?1').bind(pid).first<{ telegram_id: number | null; banned_at: number | null }>();
  const ids = (await db.prepare('SELECT kind, subject, email FROM auth_identities WHERE player_id = ?1').bind(pid).all<{ kind: IdentityKind; subject: string; email: string | null }>()).results;
  const emails = ids.filter((i) => i.kind === 'password').map((i) => i.subject);
  const tgIdentity = ids.find((i) => i.kind === 'telegram');
  const tg = p?.telegram_id ?? (tgIdentity ? Number(tgIdentity.subject) : null);
  if (x.opts.beforeRevoke && emails.length) {
    try {
      await x.opts.beforeRevoke(ids.filter((i) => i.kind === 'password').map((i) => i.email ?? i.subject));
    } catch (e) {
      logError('account_deletion', e, { pid, step: 'confirmation' });
    }
  }
  const stmts: D1PreparedStatement[] = [];
  if (p?.banned_at != null && ids.length) {
    const pepper = peppersFromEnv(x.env).current;
    for (const i of ids) {
      stmts.push(
        db
          .prepare('INSERT INTO ban_tombstones (identity_hash, banned_at, expires_at) VALUES (?1, ?2, ?3) ON CONFLICT (identity_hash) DO UPDATE SET expires_at = MAX(expires_at, excluded.expires_at)')
          .bind(await banIdentityHash(pepper, i.kind, i.subject), p.banned_at, x.now + BAN_TOMBSTONE_MS),
      );
    }
  }
  const keys = [`addmail:${pid}`];
  for (const e of emails) {
    const h = await emailKeyHash(e);
    keys.push(`login:${h}`, `mail:h:${h}`, `mail:d:${h}`);
  }
  const inList = (xs: unknown[], first: number) => xs.map((_, i) => `?${i + first}`).join(',') || 'NULL';
  stmts.push(
    db.prepare('DELETE FROM sessions WHERE player_id = ?1').bind(pid),
    db.prepare(`DELETE FROM email_tokens WHERE player_id = ?1 OR email_norm IN (${inList(emails, 2)})`).bind(pid, ...emails),
    db.prepare('DELETE FROM link_codes WHERE player_id = ?1 OR telegram_id = ?2').bind(pid, tg),
    db.prepare('DELETE FROM link_conflicts WHERE player_id = ?1 OR other_player_id = ?1').bind(pid),
    db.prepare(`DELETE FROM auth_throttle WHERE key IN (${inList(keys, 1)})`).bind(...keys),
    db.prepare('DELETE FROM bot_state WHERE telegram_id = ?1').bind(tg),
    db.prepare('DELETE FROM support_requests WHERE player_id = ?1 OR telegram_id = ?2').bind(pid, tg),
    // password_hashes go with their identity (ON DELETE CASCADE).
    db.prepare('DELETE FROM auth_identities WHERE player_id = ?1').bind(pid),
    db.prepare('UPDATE players SET telegram_id = NULL WHERE id = ?1').bind(pid),
  );
  return stmts;
}

async function leave(x: Ctx): Promise<D1PreparedStatement[]> {
  const { db, pid } = x;
  const stmts: D1PreparedStatement[] = [];
  const clans = (await db.prepare('SELECT season_id, clan_id, role FROM clan_members WHERE player_id = ?1').bind(pid).all<{ season_id: number; clan_id: number; role: string }>()).results;
  for (const m of clans) {
    stmts.push(db.prepare('DELETE FROM clan_members WHERE season_id = ?1 AND player_id = ?2').bind(m.season_id, pid));
    if (m.role === 'leader') {
      // The longest-serving officer (else member) takes over, as on /clans/leave.
      stmts.push(
        db
          .prepare(
            `UPDATE clan_members SET role = 'leader' WHERE season_id = ?1 AND player_id = (
               SELECT player_id FROM clan_members WHERE clan_id = ?2 ORDER BY CASE role WHEN 'officer' THEN 0 ELSE 1 END, joined_at LIMIT 1)`,
          )
          .bind(m.season_id, m.clan_id),
      );
    }
    // An empty clan is disbanded (its invites go with it, ON DELETE CASCADE).
    const empty = 'NOT EXISTS (SELECT 1 FROM clan_members WHERE clan_id = ?1)';
    stmts.push(db.prepare(`DELETE FROM clans WHERE id = ?1 AND ${empty}`).bind(m.clan_id));
  }
  stmts.push(db.prepare('DELETE FROM clan_invites WHERE created_by = ?1').bind(pid));
  return stmts;
}

/**
 * Hard-deletes every `delete` table of DELETION_MAP by the player's id (the
 * Telegram id is gone by now; revoke took those rows). The cron's sweep of a
 * finished deletion keeps display_name_history: it holds the freed name.
 */
function purgeStatements(db: D1Database, pid: number, sweep = false): D1PreparedStatement[] {
  return [
    ...purgeTables()
      .filter(([table, r]) => r.pid?.length && !(sweep && table === 'display_name_history'))
      .map(([table, r]) => db.prepare(`DELETE FROM ${table} WHERE ${r.pid!.map((c) => `${c} = ?1`).join(' OR ')}`).bind(pid)),
  ];
}

async function purge(x: Ctx): Promise<D1PreparedStatement[]> {
  return purgeStatements(x.db, x.pid);
}

async function tombstone(x: Ctx): Promise<D1PreparedStatement[]> {
  const { db, pid, now } = x;
  return [
    // The freed name stays held for 30 days (players.nameKeyHeld), like a rename's.
    db
      .prepare(
        `INSERT INTO display_name_history (player_id, old, new, old_key, changed_at, by_admin)
         SELECT id, display_name, ?3, display_name_key, ?2, 0 FROM players WHERE id = ?1 AND display_name_key != 'deleted:' || id`,
      )
      .bind(pid, now, DELETED_NAME),
    db
      .prepare(
        `UPDATE players SET display_name = ?3, display_name_key = 'deleted:' || id, telegram_id = NULL, username = NULL, first_name = NULL,
           language_code = NULL, is_premium = 0, public_boards = 0, ban_reason = NULL, analytics_opt_out = 1, name_changed_at = NULL,
           name_locked_until = NULL, deleted_at = COALESCE(deleted_at, ?2)
         WHERE id = ?1`,
      )
      .bind(pid, now, DELETED_NAME),
  ];
}

/**
 * Daily cron: finishes interrupted deletions, sweeps the rows a late writer
 * may have re-created for players deleted in the last two days, and prunes
 * expired ban tombstones and the 30-day name holds of deleted players.
 */
export async function finishDeletions(env: Env, now = Date.now()): Promise<{ finished: number; resumable: number; swept: number }> {
  const db = env.DB!;
  const open = (await db.prepare('SELECT player_id, step FROM deletion_jobs WHERE finished_at IS NULL ORDER BY started_at LIMIT 25').all<Job>()).results;
  let finished = 0;
  let resumable = 0;
  for (const j of open) {
    if ((await runJob({ env, db, pid: j.player_id, now, opts: {} }, j.step)) === 'done') finished++;
    else resumable++;
  }
  const recent = (await db.prepare('SELECT player_id FROM deletion_jobs WHERE finished_at > ?1 LIMIT 100').bind(now - SWEEP_MS).all<{ player_id: number }>()).results;
  for (const r of recent) await db.batch(purgeStatements(db, r.player_id, true));
  await db.batch([
    db.prepare('DELETE FROM ban_tombstones WHERE expires_at <= ?1').bind(now),
    db.prepare('DELETE FROM display_name_history WHERE changed_at <= ?1 AND player_id IN (SELECT id FROM players WHERE deleted_at IS NOT NULL)').bind(now - NAME_HOLD_MS),
  ]);
  return { finished, resumable, swept: recent.length };
}
