/**
 * W-66, W-84 the demigod's level in D1 (rules and amounts: src/war/net/favour.ts; tables: migrations/0047_war_favour.sql).
 * Per player, reset with the season (./seasonWipe.ts). Each reason pays only its path (W-111: the SQL checks it, so every
 * hook stays one call). Earned where the events are already written:
 *
 *   fights won, fought and kills   persons.ts applyFight (fightFavourStmts, in the fight's own batch: written once)
 *   guardians slain                bosses.ts applyBossKill (favourStmts, in the kill's batch)
 *   lairs cleared, land held       regionDO.ts outputs (favourTick)
 *   work on sites, alliance works  regionDO.ts outputs (builtFavour); goods given to a work: works.ts give
 *   goods sold                     tradeScore.ts fillHook (cappedStmts)
 *   goods carried over a border    regionDO.ts arrive
 *   tasks claimed                  tasks.ts claimTask (addFavour), every path
 *   story steps and chains         regionDO.ts storied (storyFavour), every path
 *   encounters                     regionDO.ts met (encounterFavour), every path
 */
import type { Env } from '../env';
import { WAR_SEASON } from '../../../src/war/world/alliances';
import { FAVOUR_EARN, FAVOUR_MAX, FAVOUR_XP, favourLevel, favourView, HOUR_CAP, LAND_MS, PAYS, type FavourReason, type FavourView } from '../../../src/war/net/favour';
import type { PathId, StartFamily } from '../../../src/war/world/start';
import type { StoryNote } from '../../../src/war/sim/stories';
import type { EncNote } from '../../../src/war/sim/encounters';
import type { FightReport, Snapshot } from '../../../src/war/types';
import { fightTally } from './persons';

export { favourLevel, FAVOUR_EARN, type FavourReason, type FavourView };

/** Log rows kept per player. */
export const FAVOUR_LOG = 20;
/** Tiles from a lair within which a player's living men share its clearing. */
export const LAIR_NEAR = 20;
const HOUR = 3_600_000;
const TICK_MS = 100;

type DbEnv = Pick<Env, 'DB'>;

/** The level of `x` (an SQL expression of the new total) by the curve. */
const levelSql = (x: string) => `CASE ${Array.from({ length: FAVOUR_MAX - 1 }, (_, i) => FAVOUR_MAX - i).map((l) => `WHEN ${x} >= ${FAVOUR_XP[l]} THEN ${l}`).join(' ')} ELSE 1 END`;
/** W-111: an SQL test that this reason pays player ?1: its path is his, or he has none (dev tools). */
const paysSql = (reason: FavourReason) => {
  const only = PAYS[reason];
  return only ? `COALESCE((SELECT path FROM war_alliance_members WHERE season = ${WAR_SEASON.id} AND player_id = ?1), '${only}') = '${only}'` : '1';
};
const upsert = (reason: FavourReason) => `INSERT INTO war_favour (player_id, xp, level, updated_at) SELECT ?1, ?2, ${levelSql('?2')}, ?3 WHERE ${paysSql(reason)}
  ON CONFLICT (player_id) DO UPDATE SET xp = xp + ?2, level = ${levelSql('xp + ?2')}, updated_at = ?3`;

/** The statements that add `amount` favour for `reason` if it pays his path (the total, the level, a log row, the log trimmed). */
export function favourStmts(db: D1Database, pid: number, amount: number, reason: FavourReason, now: number): D1PreparedStatement[] {
  const n = Math.round(amount);
  if (!(n > 0)) return [];
  return [
    db.prepare(upsert(reason)).bind(pid, n, now),
    db.prepare(`INSERT INTO war_favour_log (player_id, at, amount, reason) SELECT ?1, ?2, ?3, ?4 WHERE ${paysSql(reason)}`).bind(pid, now, n, reason),
    db.prepare('DELETE FROM war_favour_log WHERE player_id = ?1 AND id <= (SELECT id FROM war_favour_log WHERE player_id = ?1 ORDER BY id DESC LIMIT 1 OFFSET ?2)').bind(pid, FAVOUR_LOG),
  ];
}

/** favourStmts within the reason's HOUR_CAP (land, goods sold and carried; one count: only one path earns each). */
export async function cappedStmts(db: D1Database, pid: number, amount: number, reason: FavourReason, now: number): Promise<D1PreparedStatement[]> {
  const cap = HOUR_CAP[reason];
  if (cap === undefined) return favourStmts(db, pid, amount, reason, now);
  const hour = Math.floor(now / HOUR);
  const r = await db.prepare('SELECT land_hour, land_n FROM war_favour WHERE player_id = ?1').bind(pid).first<{ land_hour: number; land_n: number }>();
  const had = r?.land_hour === hour ? r.land_n : 0, n = Math.min(Math.round(amount), cap - had);
  if (!(n > 0)) return [];
  return [
    ...favourStmts(db, pid, n, reason, now),
    db.prepare(`UPDATE war_favour SET land_hour = ?2, land_n = ?3 WHERE player_id = ?1 AND ${paysSql(reason)}`).bind(pid, hour, had + n),
  ];
}

/** Add favour to the player, if the reason pays his path and within its cap. */
export async function addFavour(env: DbEnv, pid: number, amount: number, reason: FavourReason, now = Date.now()): Promise<void> {
  const db = env.DB;
  if (!db) return;
  const stmts = await cappedStmts(db, pid, amount, reason, now);
  if (stmts.length) await db.batch(stmts);
}

/** The player's level, path and what earned it recently (newest first). */
export async function getFavour(env: DbEnv, pid: number): Promise<FavourView> {
  const db = env.DB;
  if (!db) return favourView(0);
  const [row, log, way] = await Promise.all([
    db.prepare('SELECT xp FROM war_favour WHERE player_id = ?1').bind(pid).first<{ xp: number }>(),
    db.prepare('SELECT at, amount, reason FROM war_favour_log WHERE player_id = ?1 ORDER BY id DESC LIMIT ?2').bind(pid, FAVOUR_LOG).all<FavourView['recent'][number]>(),
    db.prepare('SELECT path, family FROM war_alliance_members WHERE season = ?1 AND player_id = ?2').bind(WAR_SEASON.id, pid).first<{ path: PathId | null; family: StartFamily | null }>(),
  ]);
  return favourView(row?.xp ?? 0, log.results, way?.path ?? null, way?.family ?? null);
}

/** W-84: the demigod levels of these players (the region room keeps its men's perks up to date); no row: level 1. */
export async function levelsOf(db: D1Database, pids: readonly number[]): Promise<Map<number, number>> {
  const rows = (await db.prepare('SELECT player_id AS pid, level FROM war_favour WHERE player_id IN (SELECT value FROM json_each(?1))').bind(JSON.stringify(pids)).all<{ pid: number; level: number }>()).results;
  return new Map(pids.map((p) => [p, rows.find((r) => r.pid === p)?.level ?? 1]));
}

/** Favour of labour owed by player, paid in lumps of BUILT_LUMP so the log reads and D1 stays quiet (each room's own). */
const BUILT = new WeakMap<object, Map<number, number>>();
const BUILT_LUMP = 10;
/**
 * W-111: a room's labour since the last call, worker-seconds by player (sites and alliance works): what to pay now.
 * Pure but for the room's running count.
 */
export function builtFavour(room: object, secs: readonly (readonly [number, number])[]): [number, number][] {
  let owed = BUILT.get(room);
  if (!owed) BUILT.set(room, (owed = new Map()));
  const touched = new Set<number>(), out: [number, number][] = [];
  for (const [pid, n] of secs) {
    owed.set(pid, (owed.get(pid) ?? 0) + n * FAVOUR_EARN.built.labour);
    touched.add(pid);
  }
  for (const pid of touched) {
    const have = owed.get(pid)!;
    if (have < BUILT_LUMP) continue;
    const pay = Math.floor(have);
    owed.set(pid, have - pay);
    out.push([pid, pay]);
  }
  return out;
}

/** A fight's favour per player: won or fought, and his men's kills (at most killCap). Pure. */
export function fightFavour(r: FightReport): [number, number, FavourReason][] {
  const E = FAVOUR_EARN;
  return [...fightTally(r)].map(([pid, s]) => [pid, (s.win ? E.win : E.battle) + Math.min(s.kills, E.killCap) * E.kill, s.win ? 'win' : 'battle']);
}
export const fightFavourStmts = (db: D1Database, r: FightReport, now: number): D1PreparedStatement[] => fightFavour(r).flatMap(([pid, n, why]) => favourStmts(db, pid, n, why, now));

/** A story run's notes: its steps and its end. Pure. */
export const storyFavour = (notes: readonly StoryNote[] = []): number =>
  notes.reduce((a, n) => a + (n.kind === 'step' ? FAVOUR_EARN.storyStep : n.kind === 'end' ? FAVOUR_EARN.storyEnd : 0), 0);
/** An encounter run's notes: its steps and ends (a lapse earns nothing). Pure. */
export const encounterFavour = (notes: readonly EncNote[] = []): number =>
  notes.reduce((a, n) => a + (n.kind === 'step' ? FAVOUR_EARN.encounterStep : n.kind === 'end' ? FAVOUR_EARN.encounterEnd : 0), 0);

const pidOf = (owner: string | undefined): number | null => {
  const m = /^p:(\d+)$/.exec(owner ?? '');
  return m ? Number(m[1]) : null;
};

/** Players with living fighters in the snapshot: their team and men (x, y). */
function standing(s: Snapshot): Map<number, { team: number; men: { x: number; y: number }[] }> {
  const out = new Map<number, { team: number; men: { x: number; y: number }[] }>();
  for (const u of s.units) {
    if (u.state === 'dead' || u.cls.startsWith('civ_')) continue;
    const q = s.squads[u.squad], pid = pidOf(q?.owner);
    if (pid === null || !q) continue;
    const e = out.get(pid) ?? { team: q.team, men: [] };
    e.men.push({ x: u.x, y: u.y });
    out.set(pid, e);
  }
  return out;
}

/** Lairs that turned cleared since the last snapshot, and the players with men near each. Pure but for `seen`. */
export function lairsCleared(s: Snapshot, seen: Map<number, string>): number[] {
  const paid: number[] = [];
  let men: ReturnType<typeof standing> | null = null;
  for (const l of s.lairs ?? []) {
    const was = seen.get(l.id);
    seen.set(l.id, l.state);
    if (was === undefined || was === 'cleared' || l.state !== 'cleared') continue;
    men ??= standing(s);
    for (const [pid, e] of men) if (e.men.some((m) => (m.x - l.x) ** 2 + (m.y - l.y) ** 2 <= LAIR_NEAR ** 2)) paid.push(pid);
  }
  return paid;
}

/** Land favour of each player standing in the region: his alliance's claim points here and the region if it owns it. Pure. */
export function landFavour(s: Snapshot): [number, number][] {
  const held = new Map<number, number>();
  for (const c of s.claims ?? []) if (c.state === 'claimed' && c.team >= 0) held.set(c.team, (held.get(c.team) ?? 0) + 1);
  const most = Math.max(0, ...held.values());
  const owners = [...held].filter(([, n]) => n === most);
  const owner = most > 0 && owners.length === 1 ? owners[0][0] : -1;
  const L = FAVOUR_EARN.land, out: [number, number][] = [];
  for (const [pid, e] of standing(s)) {
    const n = Math.min(L.claimsCap, held.get(e.team) ?? 0) * L.claim + (e.team === owner ? L.region : 0);
    if (n > 0) out.push([pid, n]);
  }
  return out;
}

/** Each room's lair states as last seen. */
const LAIRS = new WeakMap<object, Map<number, string>>();
/** Ticks between land pays. */
export const LAND_TICKS = LAND_MS / TICK_MS;

/** After each room tick (regionDO outputs): lairs cleared and, every LAND_TICKS, land held, written through `write`. */
export function favourTick(env: DbEnv, room: { snapshot(): Snapshot; readonly currentTick: number }, write: (what: string, run: () => Promise<unknown>) => void): void {
  if (!env.DB) return;
  const s = room.snapshot();
  let seen = LAIRS.get(room);
  if (!seen) LAIRS.set(room, (seen = new Map()));
  for (const pid of lairsCleared(s, seen)) write(`favour lair ${pid}`, () => addFavour(env, pid, FAVOUR_EARN.lair, 'lair'));
  if (room.currentTick % LAND_TICKS !== 7) return;
  for (const [pid, n] of landFavour(s)) write(`favour land ${pid}`, () => addFavour(env, pid, n, 'land'));
}
