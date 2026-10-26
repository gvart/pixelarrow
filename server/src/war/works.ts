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
 */
import { ApiError } from '../errors';
import { ALLIANCES, WAR_SEASON } from '../../../src/war/world/alliances';
import { PEACE } from '../../../src/war/world/season';
import type { AllianceId } from '../../../src/war/world/types';
import type { TeamBonus } from '../../../src/war/types';
import { workDef, workSite, WORKS, type WorkId, type WorkView } from '../../../src/war/net/works';
import type { Env } from '../env';
import { logError } from '../telemetry/log';
import { batch, lotsOf, planTake, strongroom } from './holders';
import { allianceOf } from './world/members';
import { warRegion } from './regions';
import { json } from './persons';
import { scorePeace, statStmt } from './peace';
import { worldStub } from './world/routes';

const EPS = 1e-6;
interface WorkRow { work: string; goods: string; labour: number; done_at: number | null }

const row = (db: D1Database, a: number, id: string, season: number) =>
  db.prepare('SELECT work, goods, labour, done_at FROM war_works WHERE season = ?1 AND alliance = ?2 AND work = ?3').bind(season, a, id).first<WorkRow>();
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

/** The alliance's works as the panel shows them: progress, needs and who gave. */
export async function worksOf(db: D1Database, a: number, season = WAR_SEASON.id): Promise<WorkView[]> {
  const rows = new Map((await db.prepare('SELECT work, goods, labour, done_at FROM war_works WHERE season = ?1 AND alliance = ?2').bind(season, a).all<WorkRow>()).results.map((r) => [r.work, r]));
  const gifts = (await db
    .prepare('SELECT g.work, g.player_id AS pid, g.goods, g.labour, pl.display_name AS name FROM war_work_gifts g LEFT JOIN players pl ON pl.id = g.player_id WHERE g.season = ?1 AND g.alliance = ?2')
    .bind(season, a)
    .all<{ work: string; pid: number; goods: string; labour: number; name: string | null }>()).results;
  return WORKS.map((w) => {
    const r = rows.get(w.id), site = siteOf(a, w.id);
    const by = gifts
      .filter((g) => g.work === w.id)
      .map((g) => ({ pid: g.pid, name: g.name ?? `#${g.pid}`, goods: Math.round(Object.values(json<Record<string, number>>(g.goods, {})).reduce((x, y) => x + y, 0)), labour: Math.round((g.labour / 3600) * 10) / 10 }))
      .sort((x, y) => y.goods + y.labour * 50 - (x.goods + x.labour * 50) || x.pid - y.pid);
    return {
      id: w.id, name: w.name, text: w.text, region: site.region, x: site.x, y: site.y,
      goods: json<Record<string, number>>(r?.goods ?? '{}', {}), need: w.goods, labour: (r?.labour ?? 0) / 3600, needLabour: w.labour, done: !!r?.done_at, by,
    };
  });
}

/** Done yet? Then mark it once, score it and hand out the travel bonus. Returns true when it was finished now. */
async function finish(env: Env, a: number, id: WorkId, now: number, season: number): Promise<boolean> {
  const db = env.DB!, w = workDef(id)!, r = await row(db, a, id, season);
  if (!r || r.done_at) return false;
  const have = json<Record<string, number>>(r.goods, {});
  if (Object.entries(w.goods).some(([k, n]) => (have[k] ?? 0) < n - EPS) || r.labour < w.labour * 3600 - EPS) return false;
  const u = await db.prepare('UPDATE war_works SET done_at = ?4 WHERE season = ?1 AND alliance = ?2 AND work = ?3 AND done_at IS NULL').bind(season, a, id, now).run();
  if (!u.meta.changes) return false;
  await scorePeace(env, a, 'works', PEACE.work, now);
  if (w.bonus.travel) {
    try {
      await worldStub(env).setTravel(a as AllianceId, w.bonus.travel);
    } catch (e) {
      logError('war_travel_failed', e);
    }
  }
  return true;
}

/** A member gives goods from his home strongroom to his alliance's work: at most what it lacks. Returns what went in. */
export async function give(env: Env, pid: number, id: string, goods: Record<string, number>, now: number, season = WAR_SEASON.id): Promise<Record<string, number>> {
  const db = env.DB!, w = workDef(id);
  if (!w) throw new ApiError(404, 'not_found', 'No such work');
  const a = await allianceOf(db, pid, season);
  if (a === null) throw new ApiError(409, 'no_alliance', 'Join an alliance first');
  const r = await row(db, a, w.id, season);
  if (r?.done_at) throw new ApiError(409, 'done', `${w.name} stands already`);
  const have = json<Record<string, number>>(r?.goods ?? '{}', {});
  const take: Record<string, number> = {};
  for (const [k, n] of Object.entries(goods)) {
    const lack = (w.goods[k] ?? 0) - (have[k] ?? 0);
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
  ]);
  await finish(env, a, w.id, now, season);
  return take;
}

/** Labour at alliance `a`'s work: man-seconds by player (the room's count); capped at the need; the giver's stats too. */
export async function addLabour(env: Env, a: number, id: WorkId, by: Record<number, number>, now: number, season = WAR_SEASON.id): Promise<number> {
  const db = env.DB!, w = workDef(id);
  if (!w) return 0;
  const r = await row(db, a, id, season);
  if (r?.done_at) return 0;
  let left = w.labour * 3600 - (r?.labour ?? 0), put = 0;
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
    );
  }
  if (!(put > EPS)) return 0;
  stmts.push(db.prepare('UPDATE war_works SET labour = labour + ?4 WHERE season = ?1 AND alliance = ?2 AND work = ?3 AND done_at IS NULL').bind(season, a, id, put));
  await db.batch(stmts);
  await finish(env, a, id, now, season);
  return put;
}

/** The works still open for labour in the alliance's home region (the room watches their sites). */
export async function openWorks(db: D1Database, a: number, season = WAR_SEASON.id): Promise<WorkId[]> {
  const done = new Set((await db.prepare('SELECT work FROM war_works WHERE season = ?1 AND alliance = ?2 AND done_at IS NOT NULL').bind(season, a).all<{ work: string }>()).results.map((r) => r.work));
  return WORKS.filter((w) => !done.has(w.id)).map((w) => w.id);
}

/** The sim bonuses of the works each alliance has raised this season (by team = alliance id). */
export async function bonusesOf(db: D1Database, season = WAR_SEASON.id): Promise<Map<number, TeamBonus>> {
  const out = new Map<number, TeamBonus>();
  for (const r of (await db.prepare('SELECT alliance, work FROM war_works WHERE season = ?1 AND done_at IS NOT NULL').bind(season).all<{ alliance: number; work: string }>()).results) {
    const b = workDef(r.work)?.bonus;
    if (!b) continue;
    const cur = out.get(r.alliance) ?? {};
    if (b.repairCost) cur.repairCost = b.repairCost;
    if (b.sight) cur.sight = b.sight;
    out.set(r.alliance, cur);
  }
  return out;
}
