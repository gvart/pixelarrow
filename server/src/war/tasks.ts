/**
 * W-62 E7 daily and weekly tasks, server-posted (pools and the draw: src/war/net/tasks.ts; migrations/0042). Player
 * contracts stay in ./contracts.ts; the council's treasury quests (W-64) can reuse the tally (`tallyOf` over any days)
 * and the payout (`payStmts`, `scoreTask`).
 *
 *  - Tally: what the server sees a player do, per UTC day and metric (war_task_tally), booked where it happens:
 *    the room's men carrying wood or stone home (./taskWatch.ts GatherWatch, via the region DO), stows in less stows out
 *    (a day's net), fights (wins, kills), souls claimed, caravans in (the DO), guard and build labour and contracts filled (./contracts.ts), goods and labour given
 *    to works (./works.ts), coin sold to another alliance (./tradeScore.ts).
 *  - Tasks: drawn on the first read of a period (war_tasks), the same for a player whatever the device; progress is the
 *    tally over the period's days less the row's `base` (a reroll starts at what was there already, a first draw at 0:
 *    what he did earlier that day counts).
 *  - Claim: done and not claimed: the reward (times the wonder's task boost) into his home strongroom, its score to his
 *    alliance as peace ('tasks') or war ('feats') score, each capped a UTC day (TASKS.peaceCap / warCap).
 *  - Reroll: TASKS.rerolls a UTC day across his daily and weekly tasks, of a task not yet claimed.
 *  - W-73 solo: a player whose alliance has fewer than PARTNERS.min other members active (a tally row) in the last
 *    PARTNERS.days UTC days draws and rerolls no partner task (selling abroad, guard and market contracts).
 */
import { ApiError } from '../errors';
import { WAR_SEASON } from '../../../src/war/world/alliances';
import { dayOf, drawTasks, PARTNERS, periodOf, rerollTask, taskDef, TASKS, type TaskDef, type TaskKind, type TaskMetric, type TaskPeriod, type TasksView, type TaskView } from '../../../src/war/net/tasks';
import type { FightReport } from '../../../src/war/types';
import type { Env } from '../env';
import { batch, ensureHolder, putStmt, strongroom } from './holders';
import { scorePeace } from './peace';
import { fightTally } from './persons';
import { addFavour, FAVOUR_EARN } from './favour';
import { allianceOf } from './world/members';
import { perksOf } from './works';

/** Add `n` to the player's tally of `metric` today (a statement). */
export function tallyStmt(db: D1Database, pid: number, metric: TaskMetric, n: number, now: number, season = WAR_SEASON.id): D1PreparedStatement {
  return db
    .prepare('INSERT INTO war_task_tally (season, player_id, day, metric, n) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (season, player_id, day, metric) DO UPDATE SET n = n + ?5')
    .bind(season, pid, dayOf(now), metric, n);
}

/** The tallies of a fight: each player's wins and his men's kills. */
export function fightTallies(db: D1Database, r: FightReport, now: number): D1PreparedStatement[] {
  return [...fightTally(r)].flatMap(([pid, s]) => [
    ...(s.win ? [tallyStmt(db, pid, 'wins', 1, now)] : []),
    ...(s.kills > 0 ? [tallyStmt(db, pid, 'kills', s.kills, now)] : []),
  ]);
}

/** The player's tally by metric over UTC days [from, to). */
export async function tallyOf(db: D1Database, pid: number, from: number, to: number, season = WAR_SEASON.id): Promise<Partial<Record<TaskMetric, number>>> {
  const rows = (await db.prepare('SELECT metric, SUM(n) AS n FROM war_task_tally WHERE season = ?1 AND player_id = ?2 AND day >= ?3 AND day < ?4 GROUP BY metric').bind(season, pid, from, to).all<{ metric: TaskMetric; n: number }>()).results;
  return Object.fromEntries(rows.map((r) => [r.metric, r.n]));
}

/** W-73: no realistic partner for the partner tasks: under PARTNERS.min other members of his alliance active lately. */
export async function soloOf(db: D1Database, pid: number, now: number, season = WAR_SEASON.id): Promise<boolean> {
  const a = await allianceOf(db, pid, season);
  if (a === null) return true;
  const r = await db
    .prepare(`SELECT COUNT(DISTINCT t.player_id) AS n FROM war_task_tally t JOIN war_alliance_members m ON m.season = t.season AND m.player_id = t.player_id
      WHERE t.season = ?1 AND m.alliance = ?2 AND t.player_id != ?3 AND t.day > ?4`)
    .bind(season, a, pid, dayOf(now) - PARTNERS.days)
    .first<{ n: number }>();
  return (r?.n ?? 0) < PARTNERS.min;
}

interface TaskRow { slot: number; task: string; base: number; claimed_at: number | null }

/** The period's rows, drawn now when there are none. */
async function rowsOf(db: D1Database, pid: number, p: TaskPeriod, season: number, now: number): Promise<TaskRow[]> {
  const q = () => db.prepare('SELECT slot, task, base, claimed_at FROM war_tasks WHERE season = ?1 AND player_id = ?2 AND period = ?3 ORDER BY slot').bind(season, pid, p.key).all<TaskRow>();
  const got = (await q()).results;
  if (got.length) return got;
  await db.batch(drawTasks(season, p, pid, await soloOf(db, pid, now, season)).map((t, slot) => db.prepare('INSERT OR IGNORE INTO war_tasks (season, player_id, period, slot, task) VALUES (?1, ?2, ?3, ?4, ?5)').bind(season, pid, p.key, slot, t.id)));
  return (await q()).results;
}

/** Rerolls left today. */
async function rerollsLeft(db: D1Database, pid: number, now: number, season: number): Promise<number> {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM war_tasks WHERE season = ?1 AND player_id = ?2 AND rerolled_day = ?3').bind(season, pid, dayOf(now)).first<{ n: number }>();
  return Math.max(0, TASKS.rerolls - (r?.n ?? 0));
}

/** The task reward times the boost (coin and goods rounded down, at least the base). */
export const boosted = (reward: Record<string, number>, boost: number): Record<string, number> =>
  Object.fromEntries(Object.entries(reward).map(([k, n]) => [k, Math.max(n, Math.floor(n * boost))]));

const view = (kind: TaskKind, p: TaskPeriod, r: TaskRow, t: TaskDef, tally: Partial<Record<TaskMetric, number>>, boost: number): TaskView => ({
  kind, slot: r.slot, id: t.id, title: t.title, hint: t.hint, metric: t.metric,
  have: Math.max(0, Math.min(t.n, (tally[t.metric] ?? 0) - r.base)), need: t.n, per: t.per ?? 1, unit: t.unit ?? '',
  reward: boosted(t.reward, boost), score: t.score, pts: t.pts, claimed: r.claimed_at !== null, ends: p.ends,
});

/** The player's tasks now (drawn on first read), their progress, rerolls left and the wonder's boost. */
export async function tasksOf(db: D1Database, pid: number, now: number, season = WAR_SEASON.id): Promise<TasksView> {
  const a = await allianceOf(db, pid, season), boost = a === null ? 1 : (await perksOf(db, a, season)).tasks ?? 1;
  const tasks: TaskView[] = [];
  for (const kind of ['daily', 'weekly'] as const) {
    const p = periodOf(kind, now), rows = await rowsOf(db, pid, p, season, now), tally = await tallyOf(db, pid, p.from, p.to, season);
    for (const r of rows) {
      const t = taskDef(r.task);
      if (t) tasks.push(view(kind, p, r, t, tally, boost));
    }
  }
  return { tasks, rerolls: await rerollsLeft(db, pid, now, season), boost, now };
}

const find = async (db: D1Database, pid: number, kind: TaskKind, slot: number, now: number, season: number) => {
  const v = await tasksOf(db, pid, now, season), t = v.tasks.find((x) => x.kind === kind && x.slot === slot);
  if (!t) throw new ApiError(404, 'not_found', 'No such task');
  return { v, t };
};

/** Statements paying `goods` into the player's home strongroom (W-64 quests too). */
export const payStmts = (db: D1Database, pid: number, goods: Record<string, number>, now: number): D1PreparedStatement[] => [
  ensureHolder(db, strongroom(pid), 'strongroom', { pid }, now),
  ...Object.entries(goods).filter(([, n]) => n > 0).map(([r, n]) => putStmt(db, strongroom(pid), r, n)),
];

/** A task's score to the player's alliance: peace ('tasks') or war ('feats'), capped a UTC day. Returns what counted. */
export const scoreTask = async (env: Env, pid: number, score: TaskDef['score'], pts: number, now: number): Promise<number> =>
  scorePeace(env, await allianceOf(env.DB!, pid), score === 'peace' ? 'tasks' : 'feats', pts, now);

/** Claim a done task: the reward into his strongroom, the score to his alliance. */
export async function claimTask(env: Env, pid: number, kind: TaskKind, slot: number, now: number, season = WAR_SEASON.id): Promise<{ reward: Record<string, number>; pts: number }> {
  const db = env.DB!, { t } = await find(db, pid, kind, slot, now, season), p = periodOf(kind, now);
  if (t.claimed) throw new ApiError(409, 'claimed', 'Claimed already');
  if (t.have < t.need - 1e-6) throw new ApiError(409, 'not_done', `${t.title} is not done yet`);
  const u = await db.prepare('UPDATE war_tasks SET claimed_at = ?5 WHERE season = ?1 AND player_id = ?2 AND period = ?3 AND slot = ?4 AND claimed_at IS NULL').bind(season, pid, p.key, slot, now).run();
  if (!u.meta.changes) throw new ApiError(409, 'claimed', 'Claimed already');
  await batch(db, payStmts(db, pid, t.reward, now));
  await addFavour(env, pid, FAVOUR_EARN.task[kind], 'task', now); // W-66 divine favour
  return { reward: t.reward, pts: await scoreTask(env, pid, t.score, t.pts, now) };
}

/** Reroll a task not yet claimed (TASKS.rerolls a day): the next of his order; its progress starts from now. */
export async function rerollOne(db: D1Database, pid: number, kind: TaskKind, slot: number, now: number, season = WAR_SEASON.id): Promise<TaskView> {
  const { v, t } = await find(db, pid, kind, slot, now, season), p = periodOf(kind, now);
  if (t.claimed) throw new ApiError(409, 'claimed', 'Claimed tasks stay');
  if (v.rerolls <= 0) throw new ApiError(409, 'no_reroll', 'No reroll left today');
  const next = rerollTask(season, p, pid, v.tasks.filter((x) => x.kind === kind).map((x) => x.id), t.id, await soloOf(db, pid, now, season));
  if (!next) throw new ApiError(409, 'no_task', 'Nothing else to draw');
  const base = (await tallyOf(db, pid, p.from, p.to, season))[next.metric] ?? 0, day = dayOf(now);
  const u = await db
    .prepare(`UPDATE war_tasks SET task = ?6, base = ?7, rerolled_day = ?8 WHERE season = ?1 AND player_id = ?2 AND period = ?3 AND slot = ?4 AND task = ?5 AND claimed_at IS NULL
      AND (SELECT COUNT(*) FROM war_tasks WHERE season = ?1 AND player_id = ?2 AND rerolled_day = ?8) < ${TASKS.rerolls}`)
    .bind(season, pid, p.key, slot, t.id, next.id, base, day)
    .run();
  if (!u.meta.changes) throw new ApiError(409, 'changed', 'Your tasks changed meanwhile; try again');
  const r: TaskRow = { slot, task: next.id, base, claimed_at: null };
  return view(kind, p, r, next, { [next.metric]: base }, v.boost);
}
