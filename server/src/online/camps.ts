/**
 * Camp plots (POST/GET /api/online/camps/*, docs/DESIGN_V2.md "Camp"; rules in
 * src/online/rules.ts CAMP_*, shared logic in src/online/camps.ts).
 *
 * GET  /         your camps (buildings, timers, effects), claimable plots, limits.
 * POST /claim    makes a forward camp on a campPlot region you hold (army there, cost).
 * POST /build    builds `kind` on an empty `slot`, or raises the existing one a level.
 * POST /rest     rests the army at one of your camps (energy, wounds; cooldown).
 *
 * Construction finishes lazily: a building's `level` is reached at `done_at`
 * (it works at level - 1 before). Every write is one batch led by the
 * profile's rev bump (store.ts), so resources are never spent twice.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { readJson } from '../body';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { requireAuth } from '../middleware';
import { CAMP_BUILDING_IDS, CAMP_RULES, ONLINE_RULES, type CampBuildingId, type Resources } from '../../../src/online/rules';
import { campView, checkBuild, checkClaim, towerSight, type CampBuildingState, type CampMarker, type CampReason } from '../../../src/online/camps';
import type { WorldGraph } from '../../../src/online/world';
import { limit, player, type PlayerCtx } from './context';
import { armyState, energyNow, getProfile, revBatch, revGuard, type ProfileRow, type Shard } from './store';

export const camps = new Hono<AppEnv>();
camps.use('*', requireAuth);

// ------------------------------------------------------------------ storage

export interface CampRow {
  loc: number;
  player_id: number;
  home: number;
  rested_at: number | null;
  buildings: CampBuildingState[];
}

interface BuildingRow {
  loc: number;
  slot: number;
  kind: CampBuildingId;
  level: number;
  done_at: number;
}

const toState = (b: BuildingRow): CampBuildingState => ({ slot: b.slot, kind: b.kind, level: b.level, doneAt: b.done_at });

async function withBuildings(d: D1Database, shard: Pick<Shard, 'season' | 'id'>, rows: Omit<CampRow, 'buildings'>[]): Promise<CampRow[]> {
  if (!rows.length) return [];
  const out: CampRow[] = rows.map((r) => ({ ...r, buildings: [] }));
  const at = new Map(out.map((r) => [r.loc, r]));
  const locs = out.map((r) => r.loc);
  for (let i = 0; i < locs.length; i += 90) {
    const part = locs.slice(i, i + 90);
    const b = await d
      .prepare(`SELECT loc, slot, kind, level, done_at FROM online_camp_buildings WHERE season_id = ?1 AND shard_id = ?2 AND loc IN (${part.map((_, j) => `?${j + 3}`).join(',')})`)
      .bind(shard.season, shard.id, ...part)
      .all<BuildingRow>();
    for (const x of b.results) at.get(x.loc)?.buildings.push(toState(x));
  }
  return out;
}

/** A player's camps with their buildings (home first). */
export async function playerCamps(d: D1Database, shard: Pick<Shard, 'season' | 'id'>, pid: number): Promise<CampRow[]> {
  const r = await d
    .prepare('SELECT loc, player_id, home, rested_at FROM online_camps WHERE season_id = ?1 AND shard_id = ?2 AND player_id = ?3 ORDER BY home DESC, created_at, loc')
    .bind(shard.season, shard.id, pid)
    .all<Omit<CampRow, 'buildings'>>();
  return withBuildings(d, shard, r.results);
}

/** The camp in a region, if any. */
export async function campAt(d: D1Database, shard: Pick<Shard, 'season' | 'id'>, loc: number): Promise<CampRow | null> {
  const r = await d
    .prepare('SELECT loc, player_id, home, rested_at FROM online_camps WHERE season_id = ?1 AND shard_id = ?2 AND loc = ?3')
    .bind(shard.season, shard.id, loc)
    .first<Omit<CampRow, 'buildings'>>();
  return r ? (await withBuildings(d, shard, [r]))[0] : null;
}

/** Map markers of the camps in some regions (owner, home, buildings standing). */
export async function campMarkers(d: D1Database, shard: Pick<Shard, 'season' | 'id'>, locs: Iterable<number>, now: number): Promise<CampMarker[]> {
  const ids = [...new Set(locs)];
  const out: CampMarker[] = [];
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const r = await d
      .prepare(
        `SELECT c.loc, c.player_id, c.home, (SELECT COUNT(*) FROM online_camp_buildings b
           WHERE b.season_id = c.season_id AND b.shard_id = c.shard_id AND b.loc = c.loc AND (b.level > 1 OR b.done_at <= ?3)) AS n
         FROM online_camps c WHERE c.season_id = ?1 AND c.shard_id = ?2 AND c.loc IN (${part.map((_, j) => `?${j + 4}`).join(',')})`,
      )
      .bind(shard.season, shard.id, now, ...part)
      .all<{ loc: number; player_id: number; home: number; n: number }>();
    for (const x of r.results) out.push({ loc: x.loc, owner: x.player_id, home: x.home === 1, buildings: x.n });
  }
  return out.sort((a, b) => a.loc - b.loc);
}

/**
 * Watchtowers of the shard working now: extra vision sources `{ loc, hops }`
 * (sight + tower bonus) with their owner and the owner's clan.
 */
export async function shardTowers(d: D1Database, shard: Pick<Shard, 'season' | 'id'>, now: number): Promise<{ loc: number; hops: number; pid: number; clan: number | null }[]> {
  const r = await d
    .prepare(
      `SELECT b.loc, b.slot, b.kind, b.level, b.done_at, c.player_id, m.clan_id FROM online_camp_buildings b
       JOIN online_camps c ON c.season_id = b.season_id AND c.shard_id = b.shard_id AND c.loc = b.loc
       LEFT JOIN clan_members m ON m.season_id = c.season_id AND m.player_id = c.player_id
       WHERE b.season_id = ?1 AND b.shard_id = ?2 AND b.kind = 'watchtower'`,
    )
    .bind(shard.season, shard.id)
    .all<BuildingRow & { player_id: number; clan_id: number | null }>();
  return r.results
    .map((x) => ({ loc: x.loc, hops: ONLINE_RULES.sight + towerSight([toState(x)], now), pid: x.player_id, clan: x.clan_id }))
    .filter((x) => x.hops > ONLINE_RULES.sight);
}

/** Every region a set of towers sees. */
export function towerVision(world: WorldGraph, towers: readonly { loc: number; hops: number }[]): Set<number> {
  const out = new Set<number>();
  for (const t of towers) if (world.has(t.loc)) for (const r of world.within(t.loc, t.hops)) out.add(r);
  return out;
}

/** Statements that raze the camp of a region (inside a guarded batch: `guard` is its SQL guard). */
export function razeCampStmts(d: D1Database, season: number, shard: number, loc: number, guard: string): D1PreparedStatement[] {
  return [
    d.prepare(`DELETE FROM online_camp_buildings WHERE season_id = ?1 AND shard_id = ?2 AND loc = ?3 AND ${guard}`).bind(season, shard, loc),
    d.prepare(`DELETE FROM online_camps WHERE season_id = ?1 AND shard_id = ?2 AND loc = ?3 AND home = 0 AND ${guard}`).bind(season, shard, loc),
  ];
}

// ------------------------------------------------------------------ routes

const Loc = z.number().int().min(1).max(1_000_000);
const Kind = z.enum(CAMP_BUILDING_IDS as [CampBuildingId, ...CampBuildingId[]]);

const resOf = (p: ProfileRow): Resources => ({ gold: p.gold, food: p.food, wood: p.wood, bronze: p.bronze, recruits: Math.round(p.recruits * 100) / 100 });

const REASON_TEXT: Record<CampReason, string> = {
  notCamp: 'You have no camp there',
  badSlot: 'No such building slot in this camp',
  slotTaken: 'That slot is taken',
  built: 'That building already stands in this camp',
  notBuilt: 'Unknown building',
  busy: 'Your builders are busy with another building in this camp',
  maxLevel: 'That building is at its highest level',
  funds: 'Not enough resources',
  notYours: 'You must hold the region',
  notPlot: 'This region is no camp plot',
  isCamp: 'There is a camp here already',
  limit: `At most ${CAMP_RULES.maxForward} forward camps`,
  notHere: 'Your army must stand in the region',
  resting: 'Your men rested here not long ago',
};

function refuse(reason: CampReason, extra?: Record<string, unknown>): never {
  const status = reason === 'notCamp' ? 404 : reason === 'badSlot' || reason === 'notBuilt' ? 400 : reason === 'notYours' ? 403 : 409;
  throw new ApiError(status, `camp_${reason}`, REASON_TEXT[reason], extra);
}

async function campsView(pc: PlayerCtx, p: ProfileRow = pc.profile) {
  const w = pc.shard.world;
  const list = await playerCamps(pc.db, pc.shard, pc.pid);
  const isCamp = new Set(list.map((c) => c.loc));
  const owned = await pc.db
    .prepare('SELECT loc FROM online_regions WHERE season_id = ?1 AND shard_id = ?2 AND owner_id = ?3')
    .bind(pc.shard.season, pc.shard.id, pc.pid)
    .all<{ loc: number }>();
  const army = armyState(p, pc.now);
  return {
    now: pc.now,
    camps: list.map((c) => campView({ loc: c.loc, home: c.home === 1, restedAt: c.rested_at, buildings: c.buildings }, pc.now)),
    claimable: owned.results.map((x) => x.loc).filter((loc) => w.has(loc) && w.info(loc).campPlot && !isCamp.has(loc)).sort((a, b) => a - b),
    forward: { n: list.filter((c) => c.home !== 1).length, max: CAMP_RULES.maxForward },
    resources: resOf(p),
    army: { loc: army.pos, marching: army.marching },
  };
}

camps.get('/', async (c) => c.json(await campsView(await player(c))));

/** Makes a forward camp on a camp plot you hold (your army must stand there). */
camps.post('/claim', async (c) => {
  limit(c, 'camp', 30);
  const pc = await player(c);
  const { loc } = await readJson(c, z.object({ loc: Loc }), 1024);
  const w = pc.shard.world;
  if (!w.has(loc)) throw new ApiError(400, 'bad_request', 'No such region');
  const [region, list] = await Promise.all([
    pc.db.prepare('SELECT owner_id FROM online_regions WHERE season_id = ?1 AND shard_id = ?2 AND loc = ?3').bind(pc.shard.season, pc.shard.id, loc).first<{ owner_id: number | null }>(),
    playerCamps(pc.db, pc.shard, pc.pid),
  ]);
  const taken = list.some((x) => x.loc === loc) || !!(await campAt(pc.db, pc.shard, loc));
  const army = armyState(pc.profile, pc.now);
  const check = checkClaim({
    campPlot: w.info(loc).campPlot,
    mine: region?.owner_id === pc.pid,
    isCamp: taken,
    forward: list.filter((x) => x.home !== 1).length,
    armyHere: !army.marching && army.pos === loc,
    have: resOf(pc.profile),
  });
  if (!check.ok) refuse(check.reason);
  const cost = CAMP_RULES.claimCost;
  const g = revGuard(pc.season.id, pc.pid, pc.profile.rev + 1);
  await revBatch(pc.db, [
    spendStmt(pc, cost),
    pc.db
      .prepare(
        `INSERT INTO online_camps (season_id, shard_id, loc, player_id, home, created_at)
         SELECT ?1, ?2, ?3, ?4, 0, ?5 WHERE ${g}
           AND EXISTS (SELECT 1 FROM online_regions WHERE season_id = ?1 AND shard_id = ?2 AND loc = ?3 AND owner_id = ?4)
           AND (SELECT COUNT(*) FROM online_camps WHERE season_id = ?1 AND shard_id = ?2 AND player_id = ?4 AND home = 0) < ?6`,
      )
      .bind(pc.season.id, pc.shard.id, loc, pc.pid, pc.now, CAMP_RULES.maxForward),
  ]);
  const after = (await getProfile(pc.db, pc.season.id, pc.pid))!;
  // The guarded insert can only miss on a race (the region lost or another camp made meanwhile): refund then.
  if (!(await campAt(pc.db, pc.shard, loc))) {
    await pc.db.prepare(refundSql).bind(pc.season.id, pc.pid, cost.gold, cost.food, cost.wood, cost.bronze, cost.recruits).run();
    refuse('notYours');
  }
  return c.json(await campsView(pc, after));
});

const BuildBody = z.object({ loc: Loc, kind: Kind, slot: z.number().int().min(0).max(63).nullable().optional() });

/** Builds on an empty slot or raises an existing building a level (one construction per camp). */
camps.post('/build', async (c) => {
  limit(c, 'camp', 30);
  const pc = await player(c);
  const body = await readJson(c, BuildBody, 1024);
  const camp = await campAt(pc.db, pc.shard, body.loc);
  if (!camp || camp.player_id !== pc.pid) refuse('notCamp');
  const check = checkBuild({ home: camp.home === 1, buildings: camp.buildings }, body.kind, body.slot ?? null, resOf(pc.profile), pc.now);
  if (!check.ok) refuse(check.reason);
  const existing = camp.buildings.find((b) => b.kind === body.kind);
  const slot = existing ? existing.slot : body.slot!;
  const doneAt = pc.now + check.minutes * 60_000;
  const g = revGuard(pc.season.id, pc.pid, pc.profile.rev + 1);
  // nothing else under construction in this camp (a racing request)
  const idle = `NOT EXISTS (SELECT 1 FROM online_camp_buildings WHERE season_id = ?1 AND shard_id = ?2 AND loc = ?3 AND done_at > ?7)`;
  const write = existing
    ? pc.db
        .prepare(
          `UPDATE online_camp_buildings SET level = ?6, done_at = ?8, updated_at = ?7
           WHERE season_id = ?1 AND shard_id = ?2 AND loc = ?3 AND slot = ?4 AND kind = ?5 AND level = ?6 - 1 AND ${idle} AND ${g}`,
        )
        .bind(pc.season.id, pc.shard.id, body.loc, slot, body.kind, check.level, pc.now, doneAt)
    : pc.db
        .prepare(
          `INSERT OR IGNORE INTO online_camp_buildings (season_id, shard_id, loc, slot, kind, level, done_at, updated_at)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?8, ?7 WHERE ${idle} AND ${g}
             AND EXISTS (SELECT 1 FROM online_camps WHERE season_id = ?1 AND shard_id = ?2 AND loc = ?3 AND player_id = ?9)`,
        )
        .bind(pc.season.id, pc.shard.id, body.loc, slot, body.kind, check.level, pc.now, doneAt, pc.pid);
  const res = await revBatch(pc.db, [spendStmt(pc, check.cost), write]);
  if (res[1].meta.changes !== 1) {
    await pc.db.prepare(refundSql).bind(pc.season.id, pc.pid, check.cost.gold, check.cost.food, check.cost.wood, check.cost.bronze, check.cost.recruits).run();
    refuse('busy');
  }
  const after = (await getProfile(pc.db, pc.season.id, pc.pid))!;
  return c.json({ built: { loc: body.loc, slot, kind: body.kind, level: check.level, doneAt }, ...(await campsView(pc, after)) });
});

/** Rests the field army at one of your camps: energy back, field heroes' wounds halved (cooldown per camp). */
camps.post('/rest', async (c) => {
  limit(c, 'camp', 30);
  const pc = await player(c);
  const { loc } = await readJson(c, z.object({ loc: Loc }), 1024);
  const camp = await campAt(pc.db, pc.shard, loc);
  if (!camp || camp.player_id !== pc.pid) refuse('notCamp');
  const army = armyState(pc.profile, pc.now);
  if (army.marching || army.pos !== loc) refuse('notHere');
  if (camp.rested_at !== null && pc.now - camp.rested_at < CAMP_RULES.restCooldownMs) refuse('resting', { retryAt: camp.rested_at + CAMP_RULES.restCooldownMs });
  const energy = Math.min(ONLINE_RULES.energyMax, energyNow(pc.profile, pc.now) + CAMP_RULES.restEnergy);
  const g = revGuard(pc.season.id, pc.pid, pc.profile.rev + 1);
  await revBatch(pc.db, [
    pc.db
      .prepare('UPDATE online_profiles SET energy = ?3, energy_at = ?4, rev = rev + 1, updated_at = ?4 WHERE season_id = ?1 AND player_id = ?2 AND rev = ?5')
      .bind(pc.season.id, pc.pid, energy, pc.now, pc.profile.rev),
    pc.db
      .prepare(`UPDATE online_camps SET rested_at = ?4 WHERE season_id = ?1 AND shard_id = ?2 AND loc = ?3 AND ${g}`)
      .bind(pc.season.id, pc.shard.id, loc, pc.now),
    // wounds of the field army (not garrisons) heal twice as fast from now
    pc.db
      .prepare(
        `UPDATE online_heroes SET wounded_until = ?3 + (wounded_until - ?3) / 2 WHERE season_id = ?1 AND player_id = ?2 AND wounded_until > ?3
           AND id NOT IN (SELECT hero_id FROM online_garrisons WHERE season_id = ?1 AND player_id = ?2) AND ${g}`,
      )
      .bind(pc.season.id, pc.pid, pc.now),
  ]);
  const after = (await getProfile(pc.db, pc.season.id, pc.pid))!;
  return c.json({ energy: Math.floor(energy * 10) / 10, ...(await campsView(pc, after)) });
});

// ------------------------------------------------------------------ helpers

/** The batch's first statement: spends `cost` and bumps the profile rev (only when affordable). */
function spendStmt(pc: PlayerCtx, cost: Resources): D1PreparedStatement {
  return pc.db
    .prepare(
      `UPDATE online_profiles SET gold = gold - ?3, food = food - ?4, wood = wood - ?5, bronze = bronze - ?6, recruits = recruits - ?7, rev = rev + 1, updated_at = ?8
       WHERE season_id = ?1 AND player_id = ?2 AND rev = ?9 AND gold >= ?3 AND food >= ?4 AND wood >= ?5 AND bronze >= ?6 AND recruits >= ?7`,
    )
    .bind(pc.season.id, pc.pid, cost.gold, cost.food, cost.wood, cost.bronze, cost.recruits, pc.now, pc.profile.rev);
}

const refundSql = 'UPDATE online_profiles SET gold = gold + ?3, food = food + ?4, wood = wood + ?5, bronze = bronze + ?6, recruits = recruits + ?7, rev = rev + 1 WHERE season_id = ?1 AND player_id = ?2';
