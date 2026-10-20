/**
 * D1 access for the online season: seasons (lifecycle), profiles, heroes,
 * items and clan membership. The old route-graph war (shards, regions,
 * marches, garrisons) is gone (W-01).
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
import { fieldIds, musterOf } from '../../../src/game/muster';
import { hashString } from '../../../src/sim/rng';
import { DEFAULT_FORMATIONS, energyAt, ONLINE_RULES, starterOnlineArmy } from '../../../src/online/rules';
import { bytesToHex } from '../crypto';
import { ApiError } from '../errors';

let randomSource: (() => number) | null = null;

/**
 * Tests only: replaces the entropy behind randomU32 (battle and duel
 * seeds, recruits) with a seeded stream, so a test
 * run does not depend on chance; null restores crypto randomness. Tokens and
 * codes (randomToken, randomCode) always stay crypto-random.
 */
export function setRandomSource(next: (() => number) | null): void {
  randomSource = next;
}

export function randomU32(): number {
  if (randomSource) return randomSource() >>> 0 || 1;
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
 * time is up, ends it and starts the
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
}

/**
 * Ends a season: status 'ended'. Everything of the season (armies, gear,
 * resources) is simply left behind: the next season starts with new ids.
 * Idempotent.
 */
export async function endSeason(db: D1Database, season: number, now = Date.now()): Promise<void> {
  await db.prepare("UPDATE online_seasons SET status = 'ended', ended_at = ?2 WHERE id = ?1 AND status = 'active'").bind(season, now).run();
}

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
  home_loc: number;
  army_loc: number;
  march: string | null;
  battles: number;
  wins: number;
  rev: number;
  created_at: number;
  updated_at: number;
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

/** Joins the current season: the profile and the starting army. Idempotent. */
export async function ensureProfile(db: D1Database, season: Season, pid: number, now = Date.now()): Promise<ProfileRow> {
  const existing = await getProfile(db, season.id, pid);
  if (existing) return existing;
  const ids = { nextId: 1 };
  const heroes = starterOnlineArmy(hashString(`online:${season.id}:${pid}`), ids, heroPrefix(season.id, pid));
  const s = ONLINE_RULES.start;
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO online_profiles (season_id, player_id, shard_id, gold, food, wood, bronze, recruits, energy, energy_at,
           next_id, formations, home_loc, army_loc, created_at, updated_at)
         VALUES (?1, ?2, 0, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, 0, ?9, ?9)`,
      )
      .bind(season.id, pid, s.gold, s.food, s.wood, s.bronze, s.recruits, ONLINE_RULES.energyMax, now, ids.nextId, JSON.stringify(DEFAULT_FORMATIONS)),
    ...heroes.map((h) =>
      db
        .prepare('INSERT OR IGNORE INTO online_heroes (id, season_id, player_id, data, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)')
        .bind(h.id, season.id, pid, JSON.stringify(h), now),
    ),
  ]);
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

interface HeroRow {
  id: string;
  player_id: number;
  data: string;
  wounded_until: number;
  busy_ticket: string | null;
  busy_until: number;
  updated_at: number;
  /** Kept in camp, out of the field army (0/1). */
  reserve?: number;
}

export interface OwnedHero {
  hero: Hero;
  playerId: number;
  woundedUntil: number;
  busyUntil: number;
  updatedAt: number;
  /** Kept in camp by the muster (src/game/muster.ts): never marches with the field army. */
  reserve: boolean;
}

function heroOf(r: HeroRow): OwnedHero {
  return {
    hero: normalizeEquip(JSON.parse(r.data) as Hero),
    playerId: r.player_id,
    woundedUntil: r.wounded_until,
    busyUntil: r.busy_until,
    updatedAt: r.updated_at,
    reserve: !!r.reserve,
  };
}

export async function loadHeroes(db: D1Database, season: number, pid: number): Promise<OwnedHero[]> {
  const r = await db
    .prepare(
      `SELECT h.* FROM online_heroes h
       WHERE h.season_id = ?1 AND h.player_id = ?2 ORDER BY h.created_at, h.id`,
    )
    .bind(season, pid)
    .all<HeroRow>();
  return r.results.map(heroOf);
}

export async function loadItems(db: D1Database, season: number, pid: number): Promise<Item[]> {
  const r = await db.prepare('SELECT data FROM online_items WHERE season_id = ?1 AND player_id = ?2 ORDER BY created_at, uid').bind(season, pid).all<{ data: string }>();
  return r.results.map((x) => normalizeItem(JSON.parse(x.data) as Item));
}

/**
 * Field army heroes that can fight now: not wounded, not in
 * another battle, not kept in camp by the muster, within the formation caps
 * (MUSTER.fieldCap and the per-group cap, in roster order).
 */
export function fieldReady(heroes: OwnedHero[], now: number): OwnedHero[] {
  const fit = heroes.filter((h) => h.woundedUntil <= now && h.busyUntil <= now);
  const field = new Set(fieldIds(musterOf(fit.map((h) => h.hero), () => false, (h) => !!fit.find((x) => x.hero.id === h.id)?.reserve)));
  return fit.filter((h) => field.has(h.hero.id));
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

/** Public names by player id: display_name only, never Telegram data (ADR-0009 §6, N-DN-1). */
export async function playerNames(db: D1Database, ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const uniq = [...new Set(ids.filter((x) => Number.isSafeInteger(x)))];
  for (let i = 0; i < uniq.length; i += 90) {
    const part = uniq.slice(i, i + 90);
    const r = await db
      .prepare(`SELECT id, display_name FROM players WHERE id IN (${part.map((_, j) => `?${j + 1}`).join(',')})`)
      .bind(...part)
      .all<{ id: number; display_name: string }>();
    for (const p of r.results) out.set(p.id, p.display_name);
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
