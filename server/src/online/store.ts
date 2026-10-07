/**
 * D1 access for the online mode: seasons and shards (lifecycle, rewards),
 * profiles with home placement, armies and marches, heroes, items, hex state
 * and clan membership.
 *
 * Economy writes are relative (`gold = gold + ?`, `WHERE gold >= ?`) and the
 * statements of one operation run in a single D1 batch (a transaction) whose
 * first statement bumps the profile's `rev` from the value read; the others
 * are guarded by `EXISTS (... rev = <new rev>)`, so a concurrent request can
 * never apply half an operation or spend the same gold twice.
 */
import type { Hero } from '../../../src/data/units';
import { normalizeEquip, normalizeItem, type Item } from '../../../src/data/items';
import type { FormationType } from '../../../src/sim/formation';
import { hashString } from '../../../src/sim/rng';
import { capitals, hexDistance, hexesWithin, hexInfo, SHARD_RADIUS, type Axial, type HexInfo } from '../../../src/online/hex';
import { beastHex } from '../../../src/online/lairs';
import { DEFAULT_FORMATIONS, energyAt, hexScore, ONLINE_RULES, starterOnlineArmy } from '../../../src/online/rules';
import { bytesToHex } from '../crypto';
import { ApiError } from '../errors';

export function randomU32(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] >>> 0 || 1;
}

export function randomToken(bytes = 16): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return bytesToHex(a);
}

const CODE_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode(len = 10): string {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  let s = '';
  for (const b of a) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return s;
}

// ------------------------------------------------------------------ seasons

export interface Season {
  id: number;
  startedAt: number;
  endsAt: number;
}

interface SeasonRow {
  id: number;
  started_at: number;
  ends_at: number;
  status: string;
}

let seasonCache: { season: Season; at: number; db: D1Database } | null = null;
const SEASON_MS = () => ONLINE_RULES.seasonDays * 24 * 3_600_000;

/**
 * The active season. Starts season 1 on first use; when the active season's
 * time is up, ends it (ranks and titles into season_rewards) and starts the
 * next one. Every step is idempotent, so racing requests agree.
 */
export async function currentSeason(db: D1Database, now = Date.now()): Promise<Season> {
  if (seasonCache && seasonCache.db === db && now - seasonCache.at < 30_000 && seasonCache.season.endsAt > now) return seasonCache.season;
  let row = await db.prepare("SELECT * FROM online_seasons WHERE status = 'active' ORDER BY id DESC LIMIT 1").first<SeasonRow>();
  if (!row) {
    const last = await db.prepare('SELECT MAX(id) AS id FROM online_seasons').first<{ id: number | null }>();
    const id = (last?.id ?? 0) + 1;
    await db.prepare('INSERT OR IGNORE INTO online_seasons (id, started_at, ends_at) VALUES (?1, ?2, ?3)').bind(id, now, now + SEASON_MS()).run();
    row = await db.prepare('SELECT * FROM online_seasons WHERE id = ?1').bind(id).first<SeasonRow>();
    if (!row) throw new Error('season bootstrap failed');
  }
  if (row.ends_at <= now && row.status === 'active') {
    await endSeason(db, row.id, now);
    seasonCache = null;
    return currentSeason(db, now);
  }
  const season = { id: row.id, startedAt: row.started_at, endsAt: row.ends_at };
  seasonCache = { season, at: now, db };
  return season;
}

export function forgetSeasonCache(): void {
  seasonCache = null;
  shardCache.clear();
}

export interface Standing {
  playerId: number;
  shardId: number;
  score: number;
  clanId: number | null;
  clanName: string | null;
  clanScore: number;
}

/** Scores of a season: hexes 1, forts 10, capitals 100 points (per player and per clan). */
export async function standings(db: D1Database, season: number): Promise<Standing[]> {
  const shards = await db.prepare('SELECT id, seed, radius FROM online_shards WHERE season_id = ?1').bind(season).all<{ id: number; seed: number; radius: number }>();
  const seedOf = new Map(shards.results.map((s) => [s.id, s]));
  const hexes = await db
    .prepare('SELECT shard_id, q, r, owner_id FROM online_hexes WHERE season_id = ?1 AND owner_id IS NOT NULL')
    .bind(season)
    .all<{ shard_id: number; q: number; r: number; owner_id: number }>();
  const score = new Map<number, number>();
  for (const h of hexes.results) {
    const s = seedOf.get(h.shard_id);
    if (!s) continue;
    const info = hexInfo(s.seed, h.q, h.r, s.radius);
    score.set(h.owner_id, (score.get(h.owner_id) ?? 0) + hexScore(info));
  }
  const members = await db
    .prepare(
      `SELECT p.player_id, p.shard_id, m.clan_id, c.name FROM online_profiles p
       LEFT JOIN clan_members m ON m.season_id = p.season_id AND m.player_id = p.player_id
       LEFT JOIN clans c ON c.id = m.clan_id
       WHERE p.season_id = ?1`,
    )
    .bind(season)
    .all<{ player_id: number; shard_id: number; clan_id: number | null; name: string | null }>();
  const clanScore = new Map<number, number>();
  for (const m of members.results) if (m.clan_id !== null) clanScore.set(m.clan_id, (clanScore.get(m.clan_id) ?? 0) + (score.get(m.player_id) ?? 0));
  return members.results.map((m) => ({
    playerId: m.player_id,
    shardId: m.shard_id,
    score: score.get(m.player_id) ?? 0,
    clanId: m.clan_id,
    clanName: m.name,
    clanScore: m.clan_id !== null ? clanScore.get(m.clan_id) ?? 0 : 0,
  }));
}

/** Title for a final placing: the best clan of a shard rules it, the best players command. */
export function seasonTitle(rank: number, topClan: boolean, score: number): string {
  if (topClan) return 'Archon';
  if (rank === 1) return 'Basileus';
  if (rank <= 3) return 'Strategos';
  if (rank <= 10) return 'Polemarch';
  return score > 0 ? 'Veteran' : 'Recruit';
}

/**
 * Ends a season: final ranks per shard (by own score, ties by clan score)
 * and titles into season_rewards (kept forever), status 'ended'. Everything
 * else of the season (map, armies, gear, resources) is simply left behind: the
 * next season starts with new ids. Idempotent.
 */
export async function endSeason(db: D1Database, season: number, now = Date.now()): Promise<void> {
  const st = await standings(db, season);
  const byShard = new Map<number, Standing[]>();
  for (const s of st) byShard.set(s.shardId, [...(byShard.get(s.shardId) ?? []), s]);
  const stmts: D1PreparedStatement[] = [];
  for (const [shard, list] of byShard) {
    list.sort((a, b) => b.score - a.score || b.clanScore - a.clanScore || a.playerId - b.playerId);
    const best = list.reduce((m, s) => (s.clanId !== null && s.clanScore > (m?.clanScore ?? 0) ? s : m), null as Standing | null);
    list.forEach((s, i) => {
      const title = seasonTitle(i + 1, best !== null && s.clanId === best.clanId && s.clanScore > 0, s.score);
      stmts.push(
        db
          .prepare('INSERT OR IGNORE INTO season_rewards (season_id, player_id, shard_id, rank, score, clan_name, title, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
          .bind(season, s.playerId, shard, i + 1, s.score, s.clanName, title, now),
      );
    });
  }
  stmts.push(db.prepare("UPDATE online_seasons SET status = 'ended', ended_at = ?2 WHERE id = ?1 AND status = 'active'").bind(season, now));
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
}

// ------------------------------------------------------------------ shards

export interface Shard {
  season: number;
  id: number;
  seed: number;
  radius: number;
}

const shardCache = new Map<string, Shard>();

export async function getShard(db: D1Database, season: number, id: number): Promise<Shard> {
  const k = `${season}:${id}`;
  const c = shardCache.get(k);
  if (c) return c;
  const r = await db.prepare('SELECT seed, radius FROM online_shards WHERE season_id = ?1 AND id = ?2').bind(season, id).first<{ seed: number; radius: number }>();
  if (!r) throw new ApiError(404, 'not_found', 'No such shard');
  const s = { season, id, seed: r.seed, radius: r.radius };
  shardCache.set(k, s);
  return s;
}

/** The newest shard with room, or a new one. */
export async function openShard(db: D1Database, season: number, now = Date.now()): Promise<Shard> {
  const r = await db
    .prepare('SELECT id FROM online_shards WHERE season_id = ?1 AND players < ?2 ORDER BY id LIMIT 1')
    .bind(season, ONLINE_RULES.shardCapacity)
    .first<{ id: number }>();
  if (r) return getShard(db, season, r.id);
  const last = await db.prepare('SELECT MAX(id) AS id FROM online_shards WHERE season_id = ?1').bind(season).first<{ id: number | null }>();
  const id = (last?.id ?? 0) + 1;
  await db.prepare('INSERT OR IGNORE INTO online_shards (season_id, id, seed, radius, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(season, id, randomU32(), SHARD_RADIUS, now).run();
  return getShard(db, season, id);
}

export const shardDoName = (s: { season: number; id: number }) => `shard-${s.season}-${s.id}`;

// ------------------------------------------------------------------ profiles

export interface ProfileRow {
  season_id: number;
  player_id: number;
  shard_id: number;
  gold: number;
  food: number;
  wood: number;
  bronze: number;
  recruits: number;
  energy: number;
  energy_at: number;
  next_id: number;
  formations: string;
  home_q: number;
  home_r: number;
  army_q: number;
  army_r: number;
  march: string | null;
  battles: number;
  wins: number;
  rev: number;
  created_at: number;
  updated_at: number;
}

export interface March {
  path: [number, number][];
  /** Arrival time at each path entry (at[0] = departure). */
  at: number[];
}

export interface ArmyState {
  /** Hex the army stands on (or last passed). */
  pos: Axial;
  marching: boolean;
  march: March | null;
  /** Destination and arrival while marching. */
  dest: Axial | null;
  arriveAt: number | null;
}

export function armyState(p: Pick<ProfileRow, 'army_q' | 'army_r' | 'march'>, now: number): ArmyState {
  const m = p.march ? (JSON.parse(p.march) as March) : null;
  if (!m || m.path.length === 0) return { pos: { q: p.army_q, r: p.army_r }, marching: false, march: null, dest: null, arriveAt: null };
  let i = 0;
  while (i + 1 < m.at.length && m.at[i + 1] <= now) i++;
  const last = m.path.length - 1;
  const pos = { q: m.path[i][0], r: m.path[i][1] };
  if (i >= last) return { pos, marching: false, march: null, dest: null, arriveAt: null };
  return { pos, marching: true, march: m, dest: { q: m.path[last][0], r: m.path[last][1] }, arriveAt: m.at[last] };
}

export const heroPrefix = (season: number, pid: number) => `s${season}p${pid}_`;

export async function getProfile(db: D1Database, season: number, pid: number): Promise<ProfileRow | null> {
  return db.prepare('SELECT * FROM online_profiles WHERE season_id = ?1 AND player_id = ?2').bind(season, pid).first<ProfileRow>();
}

export async function requireProfile(db: D1Database, season: number, pid: number): Promise<ProfileRow> {
  const p = await getProfile(db, season, pid);
  if (!p) throw new ApiError(409, 'no_profile', 'Join the online season first (POST /api/online/profile)');
  return p;
}

/** Owned hexes of a shard (for home placement). */
async function ownedCoords(db: D1Database, shard: Shard): Promise<Axial[]> {
  const r = await db
    .prepare('SELECT q, r FROM online_hexes WHERE season_id = ?1 AND shard_id = ?2 AND owner_id IS NOT NULL')
    .bind(shard.season, shard.id)
    .all<{ q: number; r: number }>();
  return r.results;
}

/**
 * A free home hex: passable plain land (no town, fort or capital) at least
 * homeSpacing hexes from anyone's territory and away from the capitals,
 * searched outward from a random spot on the middle rings.
 */
export function pickHome(shard: Shard, taken: Axial[], start: number): Axial | null {
  const near = (h: Axial, d: number) => taken.some((t) => hexDistance(t, h) <= d);
  const caps = capitals(shard.radius);
  const ring = 8 + (start % Math.max(1, shard.radius - 14));
  const dirs = hexesWithin({ q: 0, r: 0 }, ring).filter((h) => hexDistance(h, { q: 0, r: 0 }) === ring);
  const c0 = dirs[start % dirs.length];
  for (let d = 0; d <= shard.radius; d++) {
    const cands = d === 0 ? [c0] : hexesWithin(c0, d, shard.radius).filter((h) => hexDistance(h, c0) === d);
    for (const h of cands) {
      const info = hexInfo(shard.seed, h.q, h.r, shard.radius);
      if (!info.passable || info.fort || info.capital || info.type === 'town') continue;
      // beast lairs and world bosses are nobody's home
      if (beastHex(shard.seed, info, shard.radius)) continue;
      if (hexDistance(h, { q: 0, r: 0 }) > shard.radius - 2) continue;
      if (caps.some((c) => hexDistance(c, h) <= 4)) continue;
      if (near(h, ONLINE_RULES.homeSpacing)) continue;
      return h;
    }
  }
  return null;
}

/**
 * Joins the current season: picks a shard (or the given one, e.g. the shard
 * of the clan whose invite brought the player), places the home hex and
 * raises the starting army. Idempotent.
 */
export async function ensureProfile(db: D1Database, season: Season, pid: number, now = Date.now(), shardId?: number): Promise<ProfileRow> {
  const existing = await getProfile(db, season.id, pid);
  if (existing) return existing;
  const shard = shardId !== undefined ? await getShard(db, season.id, shardId) : await openShard(db, season.id, now);
  const taken = await ownedCoords(db, shard);
  let home: Axial | null = null;
  for (let attempt = 0; attempt < 5 && !home; attempt++) {
    const h = pickHome(shard, taken, hashString(`${pid}:${attempt}:${randomU32()}`));
    if (!h) break;
    const ins = await db
      .prepare(
        `INSERT INTO online_hexes (season_id, shard_id, q, r, occupant, owner_id, home, captured_at, accrued_at)
         VALUES (?1, ?2, ?3, ?4, 'player', ?5, 1, ?6, ?6) ON CONFLICT DO NOTHING`,
      )
      .bind(season.id, shard.id, h.q, h.r, pid, now)
      .run();
    if (ins.meta.changes === 1) home = h;
    else taken.push(h);
  }
  if (!home) throw new ApiError(503, 'shard_full', 'No free home hex in this shard');
  const ids = { nextId: 1 };
  const heroes = starterOnlineArmy(hashString(`online:${season.id}:${pid}`), ids, heroPrefix(season.id, pid));
  const s = ONLINE_RULES.start;
  const res = await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO online_profiles (season_id, player_id, shard_id, gold, food, wood, bronze, recruits, energy, energy_at,
           next_id, formations, home_q, home_r, army_q, army_r, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?13, ?14, ?10, ?10)`,
      )
      .bind(season.id, pid, shard.id, s.gold, s.food, s.wood, s.bronze, s.recruits, ONLINE_RULES.energyMax, now, ids.nextId, JSON.stringify(DEFAULT_FORMATIONS), home.q, home.r),
    db.prepare('UPDATE online_shards SET players = players + changes() WHERE season_id = ?1 AND id = ?2').bind(season.id, shard.id),
    ...heroes.map((h) =>
      db
        .prepare('INSERT OR IGNORE INTO online_heroes (id, season_id, player_id, data, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)')
        .bind(h.id, season.id, pid, JSON.stringify(h), now),
    ),
  ]);
  if (res[0].meta.changes !== 1) {
    // Lost a race with another request of the same player: give the extra home hex back.
    await db.prepare('DELETE FROM online_hexes WHERE season_id = ?1 AND shard_id = ?2 AND q = ?3 AND r = ?4 AND owner_id = ?5 AND home = 1 AND NOT EXISTS (SELECT 1 FROM online_profiles WHERE season_id = ?1 AND player_id = ?5 AND home_q = ?3 AND home_r = ?4)')
      .bind(season.id, shard.id, home.q, home.r, pid)
      .run();
  }
  return (await getProfile(db, season.id, pid))!;
}

/** SQL guard: true only inside the batch whose first statement bumped the profile to `rev`. */
export function revGuard(season: number, pid: number, rev: number): string {
  return `EXISTS (SELECT 1 FROM online_profiles WHERE season_id = ${season | 0} AND player_id = ${pid | 0} AND rev = ${rev | 0})`;
}

/** Runs a batch whose first statement must bump the profile rev; 409 if another write got there first. */
export async function revBatch(db: D1Database, stmts: D1PreparedStatement[]): Promise<D1Result[]> {
  const res = await db.batch(stmts);
  if (res[0].meta.changes !== 1) throw new ApiError(409, 'conflict', 'Your army changed meanwhile; try again');
  return res;
}

/** Reserves `n` fresh id numbers for new heroes/items. */
export async function reserveIds(db: D1Database, season: number, pid: number, n: number): Promise<number> {
  const r = await db
    .prepare('UPDATE online_profiles SET next_id = next_id + ?3 WHERE season_id = ?1 AND player_id = ?2 RETURNING next_id')
    .bind(season, pid, n)
    .first<{ next_id: number }>();
  if (!r) throw new ApiError(409, 'no_profile', 'No online profile');
  return r.next_id - n;
}

export function energyNow(p: Pick<ProfileRow, 'energy' | 'energy_at'>, now: number): number {
  return energyAt(p.energy, p.energy_at, now);
}

// ------------------------------------------------------------------ heroes & items

export interface HeroRow {
  id: string;
  player_id: number;
  data: string;
  wounded_until: number;
  busy_ticket: string | null;
  busy_until: number;
  updated_at: number;
  gq: number | null;
  gr: number | null;
}

export interface OwnedHero {
  hero: Hero;
  playerId: number;
  /** Hex it garrisons, or null when it marches with the field army. */
  garrison: Axial | null;
  woundedUntil: number;
  busyUntil: number;
  updatedAt: number;
}

export function heroOf(r: HeroRow): OwnedHero {
  return {
    hero: normalizeEquip(JSON.parse(r.data) as Hero),
    playerId: r.player_id,
    garrison: r.gq === null || r.gq === undefined ? null : { q: r.gq, r: r.gr! },
    woundedUntil: r.wounded_until,
    busyUntil: r.busy_until,
    updatedAt: r.updated_at,
  };
}

export async function loadHeroes(db: D1Database, season: number, pid: number): Promise<OwnedHero[]> {
  const r = await db
    .prepare(
      `SELECT h.*, g.q AS gq, g.r AS gr FROM online_heroes h
       LEFT JOIN online_garrisons g ON g.hero_id = h.id
       WHERE h.season_id = ?1 AND h.player_id = ?2 ORDER BY h.created_at, h.id`,
    )
    .bind(season, pid)
    .all<HeroRow>();
  return r.results.map(heroOf);
}

export async function loadGarrison(db: D1Database, shard: Shard, h: Axial): Promise<OwnedHero[]> {
  const r = await db
    .prepare(
      `SELECT x.*, g.q AS gq, g.r AS gr FROM online_garrisons g JOIN online_heroes x ON x.id = g.hero_id
       WHERE g.season_id = ?1 AND g.shard_id = ?2 AND g.q = ?3 AND g.r = ?4 ORDER BY g.placed_at, x.id`,
    )
    .bind(shard.season, shard.id, h.q, h.r)
    .all<HeroRow>();
  return r.results.map(heroOf);
}

export async function loadItems(db: D1Database, season: number, pid: number): Promise<Item[]> {
  const r = await db.prepare('SELECT data FROM online_items WHERE season_id = ?1 AND player_id = ?2 ORDER BY created_at, uid').bind(season, pid).all<{ data: string }>();
  return r.results.map((x) => normalizeItem(JSON.parse(x.data) as Item));
}

/** Field army heroes that can fight now: not garrisoned, not wounded, not in another battle. */
export function fieldReady(heroes: OwnedHero[], now: number): OwnedHero[] {
  return heroes.filter((h) => !h.garrison && h.woundedUntil <= now && h.busyUntil <= now);
}

export function formationsOf(json: string | null): FormationType[] {
  if (!json) return [...DEFAULT_FORMATIONS];
  try {
    const v = JSON.parse(json) as FormationType[];
    return Array.isArray(v) && v.length === 4 ? v : [...DEFAULT_FORMATIONS];
  } catch {
    return [...DEFAULT_FORMATIONS];
  }
}

// ------------------------------------------------------------------ hexes

export interface HexRow {
  season_id: number;
  shard_id: number;
  q: number;
  r: number;
  occupant: string;
  owner_id: number | null;
  clan_id: number | null;
  home: number;
  captured_at: number | null;
  accrued_at: number | null;
  formations: string | null;
  npc: string | null;
  npc_gen: number;
  npc_at: number | null;
  siege_by: number | null;
  siege_wins: number;
  siege_at: number | null;
  version: number;
  /** Lair hexes: when the beast was last slain (migration 0004). */
  beast_slain_at?: number | null;
}

export async function hexRow(db: D1Database, shard: Shard, h: Axial): Promise<HexRow | null> {
  return db
    .prepare('SELECT * FROM online_hexes WHERE season_id = ?1 AND shard_id = ?2 AND q = ?3 AND r = ?4')
    .bind(shard.season, shard.id, h.q, h.r)
    .first<HexRow>();
}

export async function hexRowsIn(db: D1Database, shard: Shard, q0: number, q1: number, r0: number, r1: number): Promise<HexRow[]> {
  const r = await db
    .prepare('SELECT * FROM online_hexes WHERE season_id = ?1 AND shard_id = ?2 AND q BETWEEN ?3 AND ?4 AND r BETWEEN ?5 AND ?6')
    .bind(shard.season, shard.id, q0, q1, r0, r1)
    .all<HexRow>();
  return r.results;
}

export function staticHex(shard: Shard, h: Axial): HexInfo {
  return hexInfo(shard.seed, h.q, h.r, shard.radius);
}

// ------------------------------------------------------------------ clans & names

export interface Membership {
  clanId: number;
  role: 'leader' | 'officer' | 'member';
}

export async function membership(db: D1Database, season: number, pid: number): Promise<Membership | null> {
  const r = await db
    .prepare('SELECT clan_id, role FROM clan_members WHERE season_id = ?1 AND player_id = ?2')
    .bind(season, pid)
    .first<{ clan_id: number; role: Membership['role'] }>();
  return r ? { clanId: r.clan_id, role: r.role } : null;
}

export async function playerNames(db: D1Database, ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const uniq = [...new Set(ids.filter((x) => Number.isSafeInteger(x)))];
  for (let i = 0; i < uniq.length; i += 90) {
    const part = uniq.slice(i, i + 90);
    const r = await db
      .prepare(`SELECT id, first_name, username, telegram_id FROM players WHERE id IN (${part.map((_, j) => `?${j + 1}`).join(',')})`)
      .bind(...part)
      .all<{ id: number; first_name: string | null; username: string | null; telegram_id: number }>();
    for (const p of r.results) out.set(p.id, (p.first_name || p.username || `Player ${p.telegram_id}`).slice(0, 64));
  }
  return out;
}

export async function clanTags(db: D1Database, ids: number[]): Promise<Map<number, { name: string; tag: string }>> {
  const out = new Map<number, { name: string; tag: string }>();
  const uniq = [...new Set(ids.filter((x) => Number.isSafeInteger(x)))];
  for (let i = 0; i < uniq.length; i += 90) {
    const part = uniq.slice(i, i + 90);
    const r = await db
      .prepare(`SELECT id, name, tag FROM clans WHERE id IN (${part.map((_, j) => `?${j + 1}`).join(',')})`)
      .bind(...part)
      .all<{ id: number; name: string; tag: string }>();
    for (const c of r.results) out.set(c.id, { name: c.name, tag: c.tag });
  }
  return out;
}
