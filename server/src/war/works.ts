/**
 * W-61 alliance works (docs/WAR.md "Alliance works"; defs and sites: src/war/net/works.ts; migrations/0039). Each
 * alliance raises each work once a season in its home region:
 *
 *  - goods: a member gives from his home strongroom (`give`); at most what the work still lacks is taken;
 *  - labour: the home region's room counts the alliance's men standing within WORK_R of the site every LABOUR_EVERY
 *    ticks (WarRoom.workLabour) and the region DO books it here (`addLabour`), capped at the need;
 *  - done: every good in and the labour done: `done_at` set once, the alliance scores PEACE.work, a road's transfer
 *    bonus goes to the world, and every region room of the season applies the rest (`bonusesOf`: repairs, sight).
 * Who gave what stays in war_work_gifts (the panel's contributors).
 *
 * W-62 E7 alliance projects: the wonder (src/war/net/works.ts WONDER) is a work in stages. `stage` counts the stages
 * done; goods and labour are the current stage's and start again at 0 when a stage stands (gifts add up over all
 * stages: the top contributors). Each stage done scores its own `score` and adds its perk (`perksOf`, `bonusesOf`;
 * the transfer share goes to the world folded with the road's; the task boost to ./tasks.ts). Every plain work is one
 * stage (`stagesOf`).
 */
import { ApiError } from '../errors';
import { ALLIANCES, WAR_SEASON } from '../../../src/war/world/alliances';
import type { AllianceId } from '../../../src/war/world/types';
import type { TeamBonus } from '../../../src/war/types';
import { foldBonus, stagesOf, workDef, workSite, WONDER, WORKS, type WorkBonus, type WorkId, type WorkView } from '../../../src/war/net/works';
import type { Env } from '../env';
import { logError } from '../telemetry/log';
import { batch, lotsOf, planTake, strongroom } from './holders';
import { allianceOf } from './world/members';
import { warRegion } from './regions';
import { json } from './persons';
import { scorePeace, statStmt } from './peace';
import { tallyStmt } from './tasks';
import { worldStub } from './world/routes';

const EPS = 1e-6;
interface WorkRow { work: string; goods: string; labour: number; stage: number; done_at: number | null }
/** Stages done of a row (a done work: all of them). */
const doneStages = (r: Pick<WorkRow, 'work' | 'stage' | 'done_at'>) => (r.done_at ? stagesOf(r.work)?.length ?? 0 : r.stage);

const row = (db: D1Database, a: number, id: string, season: number) =>
  db.prepare('SELECT work, goods, labour, stage, done_at FROM war_works WHERE season = ?1 AND alliance = ?2 AND work = ?3').bind(season, a, id).first<WorkRow>();
const ensure = (db: D1Database, a: number, id: string, season: number) =>
  db.prepare('INSERT OR IGNORE INTO war_works (season, alliance, work) VALUES (?1, ?2, ?3)').bind(season, a, id);
const gift = (db: D1Database, a: number, id: string, pid: number, season: number) =>
  db.prepare('INSERT OR IGNORE INTO war_work_gifts (season, alliance, work, player_id) VALUES (?1, ?2, ?3, ?4)').bind(season, a, id, pid);

/** Where an alliance's work stands: its home region and the site there. */
export function siteOf(a: number, id: WorkId): { region: string; x: number; y: number } {
  const al = ALLIANCES[a], r = warRegion(al.home);
  const p = r ? workSite(id, r, al.quadrant) : { x: 0, y: 0 };
  return { region: al.home, ...p };
}

/** The alliance's works as the panel shows them: progress, needs and who gave; the wonder last, by its current stage. */
export async function worksOf(db: D1Database, a: number, season = WAR_SEASON.id): Promise<WorkView[]> {
  const rows = new Map((await db.prepare('SELECT work, goods, labour, stage, done_at FROM war_works WHERE season = ?1 AND alliance = ?2').bind(season, a).all<WorkRow>()).results.map((r) => [r.work, r]));
  const gifts = (await db
    .prepare('SELECT g.work, g.player_id AS pid, g.goods, g.labour, pl.display_name AS name FROM war_work_gifts g LEFT JOIN players pl ON pl.id = g.player_id WHERE g.season = ?1 AND g.alliance = ?2')
    .bind(season, a)
    .all<{ work: string; pid: number; goods: string; labour: number; name: string | null }>()).results;
  const byOf = (id: string) => gifts
    .filter((g) => g.work === id)
    .map((g) => ({ pid: g.pid, name: g.name ?? `#${g.pid}`, goods: Math.round(Object.values(json<Record<string, number>>(g.goods, {})).reduce((x, y) => x + y, 0)), labour: Math.round((g.labour / 3600) * 10) / 10 }))
    .sort((x, y) => y.goods + y.labour * 50 - (x.goods + x.labour * 50) || x.pid - y.pid);
  const views: WorkView[] = WORKS.map((w) => {
    const r = rows.get(w.id), site = siteOf(a, w.id);
    return {
      id: w.id, name: w.name, text: w.text, region: site.region, x: site.x, y: site.y,
      goods: json<Record<string, number>>(r?.goods ?? '{}', {}), need: w.goods, labour: (r?.labour ?? 0) / 3600, needLabour: w.labour, done: !!r?.done_at, by: byOf(w.id),
    };
  });
  // E7: the wonder: its current stage's goods and labour, and every stage with its perk
  const r = rows.get(WONDER.id), site = siteOf(a, WONDER.id), n = r ? doneStages(r) : 0, done = n >= WONDER.stages.length;
  const cur = WONDER.stages[Math.min(n, WONDER.stages.length - 1)];
  views.push({
    id: WONDER.id, name: WONDER.name, text: cur.text, region: site.region, x: site.x, y: site.y,
    goods: done ? { ...cur.goods } : json<Record<string, number>>(r?.goods ?? '{}', {}), need: cur.goods, labour: done ? cur.labour : (r?.labour ?? 0) / 3600, needLabour: cur.labour, done, by: byOf(WONDER.id),
    stage: n, stages: WONDER.stages.map((s, k) => ({ name: s.name, text: s.text, need: s.goods, needLabour: s.labour, done: k < n })),
  });
  return views;
}

/** The perks of the works and wonder stages alliance `a` raised this season (tasks: ./tasks.ts; travel: the world). */
export async function perksOf(db: D1Database, a: number, season = WAR_SEASON.id): Promise<WorkBonus> {
  const rows = (await db.prepare('SELECT work, stage, done_at FROM war_works WHERE season = ?1 AND alliance = ?2 AND (done_at IS NOT NULL OR stage > 0)').bind(season, a).all<WorkRow>()).results;
  return foldBonus(rows.map((r) => [r.work, doneStages(r)]));
}

/**
 * The current stage done? Then mark it once (the last: the work stands; else the next stage opens with nothing in),
 * score it and hand out its travel share (folded with the other works'). Returns true when a stage was finished now.
 */
async function finish(env: Env, a: number, id: WorkId, now: number, season: number): Promise<boolean> {
  const db = env.DB!, stages = stagesOf(id)!, r = await row(db, a, id, season);
  if (!r || r.done_at) return false;
  const st = stages[r.stage];
  if (!st) return false;
  const have = json<Record<string, number>>(r.goods, {});
  if (Object.entries(st.goods).some(([k, n]) => (have[k] ?? 0) < n - EPS) || r.labour < st.labour * 3600 - EPS) return false;
  const last = r.stage + 1 >= stages.length;
  const u = await db
    .prepare(last
      ? 'UPDATE war_works SET done_at = ?4, stage = ?5 + 1 WHERE season = ?1 AND alliance = ?2 AND work = ?3 AND done_at IS NULL AND stage = ?5'
      : "UPDATE war_works SET stage = ?5 + 1, goods = '{}', labour = 0 WHERE season = ?1 AND alliance = ?2 AND work = ?3 AND done_at IS NULL AND stage = ?5 AND ?4 > 0")
    .bind(season, a, id, now, r.stage)
    .run();
  if (!u.meta.changes) return false;
  await scorePeace(env, a, 'works', st.score, now);
  if (st.bonus.travel) {
    try {
      await worldStub(env).setTravel(a as AllianceId, (await perksOf(db, a, season)).travel ?? 1);
    } catch (e) {
      logError('war_travel_failed', e);
    }
  }
  return true;
}

/** A member gives goods from his home strongroom to his alliance's work (its current stage): at most what it lacks. Returns what went in. */
export async function give(env: Env, pid: number, id: string, goods: Record<string, number>, now: number, season = WAR_SEASON.id): Promise<Record<string, number>> {
  const db = env.DB!, stages = stagesOf(id);
  if (!stages) throw new ApiError(404, 'not_found', 'No such work');
  const w = { id: id as WorkId, name: workDef(id)?.name ?? WONDER.name };
  const a = await allianceOf(db, pid, season);
  if (a === null) throw new ApiError(409, 'no_alliance', 'Join an alliance first');
  const r = await row(db, a, w.id, season);
  if (r?.done_at) throw new ApiError(409, 'done', `${w.name} stands already`);
  const need = stages[r?.stage ?? 0].goods, have = json<Record<string, number>>(r?.goods ?? '{}', {});
  const take: Record<string, number> = {};
  for (const [k, n] of Object.entries(goods)) {
    const lack = (need[k] ?? 0) - (have[k] ?? 0);
    if (lack > EPS && n > EPS) take[k] = Math.min(n, lack);
  }
  if (!Object.keys(take).length) throw new ApiError(409, 'not_needed', `${w.name} needs none of that`);
  const plan = planTake(db, strongroom(pid), await lotsOf(db, strongroom(pid)), take, 'Your strongroom');
  const add = (col: string, k: string, n: number) => `${col} = json_set(${col}, '$.${k}', coalesce(json_extract(${col}, '$.${k}'), 0) + ${n})`;
  await batch(db, [
    ...plan.stmts, ensure(db, a, w.id, season), gift(db, a, w.id, pid, season),
    ...Object.entries(take).flatMap(([k, n]) => [
      db.prepare(`UPDATE war_works SET ${add('goods', k, n)} WHERE season = ?1 AND alliance = ?2 AND work = ?3`).bind(season, a, w.id),
      db.prepare(`UPDATE war_work_gifts SET ${add('goods', k, n)} WHERE season = ?1 AND alliance = ?2 AND work = ?3 AND player_id = ?4`).bind(season, a, w.id, pid),
    ]),
    tallyStmt(db, pid, 'workGoods', Object.values(take).reduce((x, y) => x + y, 0), now, season), // E7 tasks
  ]);
  await finish(env, a, w.id, now, season);
  return take;
}

/** Labour at alliance `a`'s work (its current stage): man-seconds by player (the room's count); capped at the need; the giver's stats too. */
export async function addLabour(env: Env, a: number, id: WorkId, by: Record<number, number>, now: number, season = WAR_SEASON.id): Promise<number> {
  const db = env.DB!, stages = stagesOf(id);
  if (!stages) return 0;
  const r = await row(db, a, id, season);
  if (r?.done_at) return 0;
  let left = stages[r?.stage ?? 0].labour * 3600 - (r?.labour ?? 0), put = 0;
  const stmts: D1PreparedStatement[] = [ensure(db, a, id, season)];
  for (const [p, secs] of Object.entries(by).sort((x, y) => Number(x[0]) - Number(y[0]))) {
    const n = Math.min(secs, left);
    if (!(n > EPS)) continue;
    left -= n;
    put += n;
    stmts.push(
      gift(db, a, id, Number(p), season),
      db.prepare('UPDATE war_work_gifts SET labour = labour + ?5 WHERE season = ?1 AND alliance = ?2 AND work = ?3 AND player_id = ?4').bind(season, a, id, Number(p), n),
      statStmt(db, Number(p), 'labour', n, season),
      tallyStmt(db, Number(p), 'labour', n, now, season), // E7 tasks
    );
  }
  if (!(put > EPS)) return 0;
  stmts.push(db.prepare('UPDATE war_works SET labour = labour + ?4 WHERE season = ?1 AND alliance = ?2 AND work = ?3 AND done_at IS NULL').bind(season, a, id, put));
  await db.batch(stmts);
  await finish(env, a, id, now, season);
  return put;
}

/** The works (and the wonder) still open for labour in the alliance's home region (the room watches their sites). */
export async function openWorks(db: D1Database, a: number, season = WAR_SEASON.id): Promise<WorkId[]> {
  const done = new Set((await db.prepare('SELECT work FROM war_works WHERE season = ?1 AND alliance = ?2 AND done_at IS NOT NULL').bind(season, a).all<{ work: string }>()).results.map((r) => r.work));
  return [...WORKS.map((w) => w.id), WONDER.id].filter((id) => !done.has(id));
}

/** The sim bonuses of the works (and wonder stages) each alliance has raised this season (by team = alliance id). */
export async function bonusesOf(db: D1Database, season = WAR_SEASON.id): Promise<Map<number, TeamBonus>> {
  const by = new Map<number, [string, number][]>();
  for (const r of (await db.prepare('SELECT alliance, work, stage, done_at FROM war_works WHERE season = ?1 AND (done_at IS NOT NULL OR stage > 0)').bind(season).all<WorkRow & { alliance: number }>()).results)
    by.set(r.alliance, [...(by.get(r.alliance) ?? []), [r.work, doneStages(r)]]);
  const out = new Map<number, TeamBonus>();
  for (const [a, done] of by) {
    const b = foldBonus(done), cur: TeamBonus = {};
    if (b.repairCost !== undefined) cur.repairCost = b.repairCost;
    if (b.sight) cur.sight = b.sight;
    if (Object.keys(cur).length) out.set(a, cur);
  }
  return out;
}
