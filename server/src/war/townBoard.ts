/**
 * W-184..W-193 the town boards on the server (docs/WAR.md "Town boards"; the listing and pay: src/war/net/townBoard.ts; tables:
 * migrations/0058). What a player holds is a copy of a board's line in war_town_jobs, so it outlives the listing and his
 * absence. Everything physical goes through the region room:
 *
 *  - take, hand in: his men stand at the board's town (W-187: the room's npcSlots, as a deal with its market).
 *  - Kill: a band is set down in the region for the taker (room.townBand), the deed the room's wild deeds (W-146's way).
 *  - Build: his men within WORK_R of the work's spot (room.setTownJobs, the room's `peace`), labour reported as for a work.
 *  - Trade: the load leaves the town's stock sealed into his packs and carts, reaches the named town's stock there; he goes
 *    back to the board's town to be paid. Coin comes out of that town's purse, on the books W-142 bounds.
 */
import { BOARD } from '../../../src/data/warTownBoard';
import { storyOf } from '../../../src/data/warStories';
import { armyStrength, boardEntries, boardLines, boardWindow, heatAfter, quotePay, TOWN_SEAL, windowEnd, type Band, type BoardJob, type BoardView, type JobKind } from '../../../src/war/net/townBoard';
import { npcGoods } from '../../../src/war/net/npcMarket';
import type { BoardMsg } from '../../../src/war/net/protocol';
import { depthOf } from '../../../src/war/sim/depth';
import type { PathId } from '../../../src/war/world/start';
import type { Env } from '../env';
import { ApiError } from '../errors';
import { fill, room as freeLoads, takeSealed } from './cargo';
import { favourStmts, getFavour } from './favour';
import { batch, ensureHolder, putStmt, strongroom } from './holders';
import { isHomeOf, npcGive, npcView, planPayOut, planStock } from './npcMarket';
import { statStmt } from './peace';
import { warRegion } from './regions';
import type { WarRoom } from './room';
import { pathOf } from './start';
import { tallyStmt } from './tasks';
import type { WildDeed } from '../../../src/war/net/mastery';

interface JobRow { id: number; player_id: number; town: string; kind: JobKind; entry: string; errand: number; goal: string; giver: string | null; story: string | null; state: 'taken' | 'ready'; target: number | null; band: string | null; x: number | null; y: number | null; done: number; need: number; to_town: string | null; res: string | null; n: number; coin: number; points: number }

const toJob = (r: JobRow): BoardJob => ({ id: r.id, kind: r.kind, town: r.town, goal: r.goal, state: r.state, done: r.done, need: r.need, x: r.x, y: r.y, toTown: r.to_town, res: r.res, n: r.n, coin: r.coin, points: r.points, errand: !!r.errand, giver: r.giver, story: r.story });

export const jobsOf = async (db: D1Database, pid: number): Promise<JobRow[]> => (await db.prepare('SELECT * FROM war_town_jobs WHERE player_id = ?1 ORDER BY id').bind(pid).all<JobRow>()).results;
const jobOf = async (db: D1Database, pid: number, id: number): Promise<JobRow> => {
  const r = await db.prepare('SELECT * FROM war_town_jobs WHERE id = ?1 AND player_id = ?2').bind(id, pid).first<JobRow>();
  if (!r) throw new ApiError(404, 'not_found', 'You do not hold that');
  return r;
};

/** W-189: the weights on each kind at a town now. */
async function heatsOf(db: D1Database, pid: number, town: string, now: number): Promise<Record<JobKind, number>> {
  const rows = (await db.prepare('SELECT kind, heat, at FROM war_town_heat WHERE player_id = ?1 AND town = ?2').bind(pid, town).all<{ kind: JobKind; heat: number; at: number }>()).results;
  const out: Record<JobKind, number> = { kill: 0, build: 0, trade: 0 };
  for (const r of rows) out[r.kind] = heatAfter(r.heat, now - r.at);
  return out;
}

/** What a player is to the board: path, level and the strength of the men in this list. */
async function readerOf(db: D1Database, env: Pick<Env, 'DB'>, pid: number, men: readonly { cls: string; level?: number; hp?: number }[]) {
  const [way, fav] = await Promise.all([pathOf(db, pid), getFavour(env, pid)]);
  const fighters = men.filter((m) => !m.cls.startsWith('civ_'));
  // the band is sized to his men whole; the word on the card reads them as they stand (W-194)
  return { path: way.path as PathId | null, level: fav.level, whole: armyStrength(fighters.map((m) => ({ cls: m.cls, level: m.level })), fav.level), army: armyStrength(fighters, fav.level) };
}

/**
 * The board at `town` as `pid` reads it. `men`: his army (fighters and their levels, whichever region they stand in);
 * `chainOver`: his story chain at this town is done, or he has none here (W-190: the giver's errand opens).
 */
export async function boardView(env: Pick<Env, 'DB'>, pid: number, town: string, men: readonly { cls: string; level?: number; hp?: number }[], now: number, chainOver = false): Promise<BoardView> {
  const db = env.DB!, r = warRegion(town);
  if (!r || !npcGoods(town).length) throw new ApiError(404, 'no_town', `${town} is no town`);
  const [who, heats, npc, jobs] = await Promise.all([readerOf(db, env, pid, men), heatsOf(db, pid, town, now), npcView(db, town, now), jobsOf(db, pid)]);
  const win = boardWindow(now), chain = who.path ? storyOf(town, who.path) : null;
  const entries = boardEntries(r, win, { army: who.whole, path: who.path, killHeat: heats.kill, errand: chainOver, giver: chain?.giver.name });
  return {
    town, purse: npc.purse, until: windowEnd(win),
    lines: boardLines(entries, { army: who.army, path: who.path, heat: (k) => heats[k], purse: npc.purse, held: new Set(jobs.filter((j) => j.town === town).map((j) => j.entry)), depth: depthOf(r) }),
    jobs: jobs.map(toJob),
  };
}

const sealOf = (id: number) => TOWN_SEAL + id;

/** One board order of `pid`, his men in `room`. Returns what he read after it, and the pay of a hand-in. */
export async function boardOrder(env: Pick<Env, 'DB'>, room: WarRoom, pid: number, m: Omit<BoardMsg, 't'>, now: number, chainOver = false): Promise<{ view: BoardView; paid?: { coin: number; points: number } }> {
  const db = env.DB!, town = room.region.id, men = () => room.armyOf(pid), done = (paid?: { coin: number; points: number }) => boardView(env, pid, town, men(), now, chainOver).then((view) => ({ view, ...(paid ? { paid } : {}) }));
  if (m.op === 'view') return done();
  const slots = room.npcSlots(pid);

  if (m.op === 'take') {
    if (!slots.length) throw new ApiError(409, 'not_present', 'Your men must stand at the town');
    const have = await jobsOf(db, pid);
    if (have.length >= BOARD.hold) throw new ApiError(409, 'board_full', `You hold ${BOARD.hold} already: finish or drop one`);
    const view = await boardView(env, pid, town, men(), now, chainOver), e = view.lines.find((l) => l.id === m.entry);
    if (!e) throw new ApiError(409, 'gone', 'That line is gone from the board');
    if (e.held) throw new ApiError(409, 'held', 'You hold that one already');
    const errand = e.size === 'errand' ? 1 : 0;
    if (e.kind === 'trade' && freeLoads(slots) < e.loads! - 1e-6) throw new ApiError(409, 'no_room', `It takes ${e.loads} loads of room in the packs and carts here`);
    const stock = e.kind === 'trade' ? await planStock(db, town, e.res!, -e.n!, now) : null;
    const band = e.band ? room.townBand(e.band, `${pid}:${e.id}`) : null, site = band ?? e.site ?? null;
    const need = e.kind === 'build' ? e.labour! : e.kind === 'trade' ? e.n! : 1;
    const row = (await db
      .prepare('INSERT INTO war_town_jobs (player_id, town, kind, entry, errand, goal, giver, story, target, band, x, y, need, to_town, res, n, coin, points, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19) RETURNING id')
      .bind(pid, town, e.kind, e.id, errand, e.goal, e.giver ?? null, e.story ?? null, band?.lair ?? null, e.band ? JSON.stringify(e.band) : null, site?.x ?? null, site?.y ?? null, need, e.toTown ?? null, e.res ?? null, e.n ?? 0, e.coin, e.points, now)
      .first<{ id: number }>())!;
    if (stock) {
      try {
        await batch(db, stock.stmts);
      } catch (x) {
        await db.prepare('DELETE FROM war_town_jobs WHERE id = ?1').bind(row.id).run();
        throw x;
      }
      fill(slots, { lots: [{ r: e.res as never, n: e.n!, o: town, s: sealOf(row.id) }], items: [] });
    }
    if (e.kind === 'build') room.watchTownJob({ id: row.id, pid, x: e.site!.x, y: e.site!.y });
    return done();
  }

  const j = await jobOf(db, pid, m.job ?? -1);

  if (m.op === 'deliver') {
    if (j.kind !== 'trade' || j.state !== 'taken') throw new ApiError(409, 'not_load', 'You carry no load under that');
    if (j.to_town !== town) throw new ApiError(409, 'wrong_town', `It goes to ${j.to_town}`);
    if (!slots.length) throw new ApiError(409, 'not_present', 'Your men must stand at the town');
    const b = takeSealed(slots, sealOf(j.id)), n = b.lots.reduce((a, l) => a + l.n, 0);
    if (!(n > 1e-6)) throw new ApiError(409, 'no_load', 'The load is lost');
    try {
      const st = await planStock(db, town, j.res!, n, now);
      await batch(db, [...st.stmts, db.prepare("UPDATE war_town_jobs SET state = 'ready', done = ?2 WHERE id = ?1 AND state = 'taken'").bind(j.id, n)]);
    } catch (x) {
      fill(slots.map((s) => ({ ...s, cap: Infinity })), b);
      throw x;
    }
    return done();
  }

  if (m.op === 'drop') {
    // W-192: a load goes back where it came from: he cannot walk off with it. What he no longer has is simply lost
    if (j.kind === 'trade' && j.state === 'taken') {
      if (town !== j.town || !slots.length) throw new ApiError(409, 'wrong_town', 'Bring the load back to the board to drop it');
      const n = takeSealed(slots, sealOf(j.id)).lots.reduce((a, l) => a + l.n, 0);
      if (n > 1e-6) await batch(db, (await planStock(db, town, j.res!, n, now)).stmts);
    }
    await db.prepare('DELETE FROM war_town_jobs WHERE id = ?1').bind(j.id).run();
    if (j.kind === 'build') room.unwatchTownJob(j.id);
    return done();
  }

  // hand in: at the board's town, the work done; the town pays from its purse what it can now
  if (j.town !== town) throw new ApiError(409, 'wrong_town', `Hand it in at ${j.town}`);
  if (!slots.length) throw new ApiError(409, 'not_present', 'Your men must stand at the town');
  if (j.state !== 'ready') throw new ApiError(409, 'not_done', 'It is not done yet');
  const way = await pathOf(db, pid), heats = await heatsOf(db, pid, town, now), heat = heats[j.kind];
  // a load that came in short pays its share
  const share = j.kind === 'trade' && j.n > 0 ? Math.min(1, j.done / j.n) : 1;
  const base = { kind: j.kind, coin: j.coin * share, points: j.points * share };
  const pay = await planPayOut(db, town, (purse) => quotePay(base, way.path, heat, purse).coin, now);
  const points = quotePay(base, way.path, heat, Infinity).points;
  const home = await isHomeOf(db, pid, town);
  await batch(db, [
    db.prepare('DELETE FROM war_town_jobs WHERE id = ?1').bind(j.id),
    ...pay.stmts,
    db.prepare('INSERT INTO war_town_heat (player_id, town, kind, heat, at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (player_id, town, kind) DO UPDATE SET heat = ?4, at = ?5').bind(pid, town, j.kind, heat + 1, now),
    ...favourStmts(db, pid, points, 'contract', now),
    statStmt(db, pid, 'contracts', 1), tallyStmt(db, pid, 'contract', 1, now),
    ...(home && pay.coin > 0 ? [ensureHolder(db, strongroom(pid), 'strongroom', { pid }, now), putStmt(db, strongroom(pid), 'coin', pay.coin, town)] : []),
  ]);
  if (!home && pay.coin > 0) npcGive(room, slots, { lots: [{ r: 'coin', n: pay.coin, o: town }], items: [] });
  return done({ coin: pay.coin, points });
}

/** The band a Kill named, the deed the room's: its lair cleared with his men near (mastery.ts wildDeeds): ready to hand in. */
export async function boardDeeds(env: Pick<Env, 'DB'>, pid: number, town: string, deeds: readonly Pick<WildDeed, 'kind' | 'key'>[]): Promise<number> {
  const db = env.DB!, lairs = deeds.filter((d) => d.kind === 'lair').map((d) => Number(d.key));
  if (!lairs.length) return 0;
  const r = await db.prepare(`UPDATE war_town_jobs SET state = 'ready', done = 1 WHERE player_id = ?1 AND town = ?2 AND kind = 'kill' AND state = 'taken' AND target IN (SELECT value FROM json_each(?3))`).bind(pid, town, JSON.stringify(lairs)).run();
  return r.meta.changes ?? 0;
}

/** Labour on town works this count (the room's): each grows, up to its need; a full one is ready. Who came ready. */
export async function boardLabour(env: Pick<Env, 'DB'>, jobs: readonly { id: number; pid: number; secs: number }[]): Promise<number[]> {
  const db = env.DB!, ready: number[] = [];
  for (const j of jobs) {
    const r = await db.prepare("UPDATE war_town_jobs SET done = MIN(need, done + ?2), state = CASE WHEN done + ?2 >= need THEN 'ready' ELSE state END WHERE id = ?1 AND state = 'taken' RETURNING state").bind(j.id, j.secs).first<{ state: string }>();
    if (r?.state === 'ready') ready.push(j.pid);
  }
  return ready;
}

/**
 * The region's taken town jobs into the room (a poll, the room's restart): its works to watch, and a Kill whose band is gone
 * (someone else's kill pays nobody; a lost save) has a new one set down, the same size.
 */
export async function boardWatch(env: Pick<Env, 'DB'>, room: WarRoom): Promise<void> {
  const db = env.DB!, town = room.region.id;
  const rows = (await db.prepare("SELECT * FROM war_town_jobs WHERE town = ?1 AND state = 'taken' AND kind IN ('kill', 'build') ORDER BY id").bind(town).all<JobRow>()).results;
  room.setTownJobs(rows.filter((r) => r.kind === 'build').map((r) => ({ id: r.id, pid: r.player_id, x: r.x!, y: r.y! })));
  for (const r of rows) {
    room.noteTownBand(r.kind === 'kill' ? r.target : null);
    if (r.kind !== 'kill' || !r.band || room.townBandStands(r.target)) continue;
    const b = room.townBand(JSON.parse(r.band) as Band, `${r.player_id}:${r.entry}:${r.id}`);
    await db.prepare("UPDATE war_town_jobs SET target = ?2, x = ?3, y = ?4 WHERE id = ?1 AND state = 'taken'").bind(r.id, b.lair, b.x, b.y).run();
  }
}
