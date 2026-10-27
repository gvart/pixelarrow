/**
 * W-66 divine favour in D1 (rules and amounts: src/war/net/favour.ts; tables: migrations/0047_war_favour.sql). Per
 * account, never reset by a season. Earned where the events are already written, each hook one call:
 *
 *   fights won, fought and kills   persons.ts applyFight (fightFavourStmts, in the fight's own batch: written once)
 *   guardians slain                bosses.ts applyBossKill (favourStmts, in the kill's batch)
 *   tasks claimed                  tasks.ts claimTask (addFavour)
 *   story steps and chains         regionDO.ts storied (storyFavour)
 *   encounters                     regionDO.ts met (encounterFavour)
 *   lairs cleared, land held       regionDO.ts outputs (favourTick: a lair turning cleared pays the players with men
 *                                  near it; every LAND_MS each player with men standing in the region is paid for his
 *                                  alliance's claim points there and the region if it owns it, capped an hour)
 *
 * And spent: a newly raised man takes favourBonus of his player's level (claimSoul in persons.ts via `favoured`; the
 * tunnel's raise.ts wires `raiseBonus` to `bonusOf`).
 */
import type { Env } from '../env';
import { FAVOUR_EARN, FAVOUR_MAX, FAVOUR_XP, favourBonus, favourLevel, favourView, LAND_MS, withFavour, type FavourBonus, type FavourReason, type FavourView } from '../../../src/war/net/favour';
import type { StoryNote } from '../../../src/war/sim/stories';
import type { EncNote } from '../../../src/war/sim/encounters';
import type { FightReport, Snapshot, WarPerson } from '../../../src/war/types';
import { fightTally } from './persons';

export { favourBonus, favourLevel, withFavour, FAVOUR_EARN, type FavourBonus, type FavourReason, type FavourView };

/** Log rows kept per player. */
export const FAVOUR_LOG = 20;
/** Tiles from a lair within which a player's living men share its clearing. */
export const LAIR_NEAR = 20;
const HOUR = 3_600_000;
const TICK_MS = 100;

type DbEnv = Pick<Env, 'DB'>;

/** The level of `x` (an SQL expression of the new total) by the curve. */
const levelSql = (x: string) => `CASE ${Array.from({ length: FAVOUR_MAX - 1 }, (_, i) => FAVOUR_MAX - i).map((l) => `WHEN ${x} >= ${FAVOUR_XP[l]} THEN ${l}`).join(' ')} ELSE 1 END`;
const UPSERT = `INSERT INTO war_favour (player_id, xp, level, updated_at) VALUES (?1, ?2, ${levelSql('?2')}, ?3)
  ON CONFLICT (player_id) DO UPDATE SET xp = xp + ?2, level = ${levelSql('xp + ?2')}, updated_at = ?3`;

/** The statements that add `amount` favour for `reason` (the total, the level, a log row, the log trimmed). */
export function favourStmts(db: D1Database, pid: number, amount: number, reason: FavourReason, now: number): D1PreparedStatement[] {
  const n = Math.round(amount);
  if (!(n > 0)) return [];
  return [
    db.prepare(UPSERT).bind(pid, n, now),
    db.prepare('INSERT INTO war_favour_log (player_id, at, amount, reason) VALUES (?1, ?2, ?3, ?4)').bind(pid, now, n, reason),
    db.prepare('DELETE FROM war_favour_log WHERE player_id = ?1 AND id <= (SELECT id FROM war_favour_log WHERE player_id = ?1 ORDER BY id DESC LIMIT 1 OFFSET ?2)').bind(pid, FAVOUR_LOG),
  ];
}

/** Add favour to the player (land: within FAVOUR_EARN.land.hourCap an hour, across regions). Returns what was added. */
export async function addFavour(env: DbEnv, pid: number, amount: number, reason: FavourReason, now = Date.now()): Promise<number> {
  const db = env.DB;
  let n = Math.round(amount);
  if (!db || !(n > 0)) return 0;
  if (reason === 'land') {
    const hour = Math.floor(now / HOUR);
    const r = await db.prepare('SELECT land_hour, land_n FROM war_favour WHERE player_id = ?1').bind(pid).first<{ land_hour: number; land_n: number }>();
    const had = r?.land_hour === hour ? r.land_n : 0;
    n = Math.min(n, FAVOUR_EARN.land.hourCap - had);
    if (n <= 0) return 0;
    await db.batch([
      ...favourStmts(db, pid, n, reason, now),
      db.prepare('UPDATE war_favour SET land_hour = ?2, land_n = ?3 WHERE player_id = ?1').bind(pid, hour, had + n),
    ]);
    return n;
  }
  await db.batch(favourStmts(db, pid, n, reason, now));
  return n;
}

/** The player's favour: total, level, title, the bonus and what earned it recently (newest first). */
export async function getFavour(env: DbEnv, pid: number): Promise<FavourView> {
  const db = env.DB;
  if (!db) return favourView(0);
  const [row, log] = await Promise.all([
    db.prepare('SELECT xp FROM war_favour WHERE player_id = ?1').bind(pid).first<{ xp: number }>(),
    db.prepare('SELECT at, amount, reason FROM war_favour_log WHERE player_id = ?1 ORDER BY id DESC LIMIT ?2').bind(pid, FAVOUR_LOG).all<FavourView['recent'][number]>(),
  ]);
  return favourView(row?.xp ?? 0, log.results);
}

/** The bonus the player's newly raised men take now (raise.ts: `raiseBonus` = this). */
export async function bonusOf(env: DbEnv, pid: number): Promise<FavourBonus> {
  const r = await env.DB?.prepare('SELECT level FROM war_favour WHERE player_id = ?1').bind(pid).first<{ level: number }>();
  return favourBonus(r?.level ?? 1);
}

/** A newly raised man with his player's favour bonus (unspent points, his kit's rarity). */
export async function favoured(db: D1Database, pid: number, p: WarPerson): Promise<WarPerson> {
  return withFavour(p, await bonusOf({ DB: db }, pid));
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
