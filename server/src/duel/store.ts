/**
 * D1 access for the duel mode (docs/DUELS.md): the duel profile, roster,
 * stash and the profile view the client renders. Writes follow the online
 * convention: the first statement of a batch bumps `rev` from the value read,
 * the others are guarded by `revGuard`, so no request applies half an
 * operation or spends the same Glory twice.
 */
import type { Hero } from '../../../src/data/units';
import { normalizeEquip, normalizeItem, type Item } from '../../../src/data/items';
import type { Attrs } from '../../../src/data/perks';
import type { FormationType } from '../../../src/sim/formation';
import { hashString } from '../../../src/sim/rng';
import { DEFAULT_FORMATIONS } from '../../../src/online/rules';
import { DUEL_RULES, accountLevel, freshGear, starterDuelRoster, teamPoints, teamProblem, utcDay } from '../../../src/duel/rules';
import { starsByFloor } from '../../../src/duel/ladder';
import type { Context } from 'hono';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { db } from '../middleware';

export interface DuelProfileRow {
  player_id: number;
  glory: number;
  xp: number;
  ladder_cleared: number;
  farm_day: number;
  farm_glory: number;
  next_id: number;
  team: string;
  formations: string;
  battles: number;
  wins: number;
  rev: number;
  created_at: number;
  updated_at: number;
  /** The loadout the Team tab edits, and the ones that fight on the ladder, in the arena and defend (slots 1..5). */
  loadout: number;
  lo_ladder: number;
  lo_arena: number;
  lo_defence: number;
  /** UTC day of the last first-ranked-win spoil (-1: never; migration 0015). */
  spoils_day: number;
}

export type LoadoutUse = 'ladder' | 'arena' | 'defence';
export const LOADOUT_USES: LoadoutUse[] = ['ladder', 'arena', 'defence'];
/** Most presets a player keeps (slots 1..LOADOUT_SLOTS). */
export const LOADOUT_SLOTS = DUEL_RULES.presetsMax;

export interface Loadout {
  slot: number;
  name: string | null;
  team: string[];
  formations: FormationType[];
}

export interface DuelHero {
  hero: Hero;
  base: Attrs;
}

/** Ids of duel heroes and items: `d<player>_...` (never clash with war-map ids). */
export const duelPrefix = (pid: number) => `d${pid}_`;

export async function getDuelProfile(db: D1Database, pid: number): Promise<DuelProfileRow | null> {
  return db.prepare('SELECT * FROM duel_profiles WHERE player_id = ?1').bind(pid).first<DuelProfileRow>();
}

export async function requireDuelProfile(db: D1Database, pid: number): Promise<DuelProfileRow> {
  const p = await getDuelProfile(db, pid);
  if (!p) throw new ApiError(409, 'no_duel_profile', 'Open the duel mode first (POST /api/duel/profile)');
  return p;
}

/** Creates the duel profile with the starter roster (idempotent). */
/** What a signed-in duel request works with: the player, the request time and their duel profile (409 `no_duel_profile` without one). */
export interface DuelCtx {
  db: D1Database;
  pid: number;
  now: number;
  p: DuelProfileRow;
}

export async function duelCtx(c: Context<AppEnv>): Promise<DuelCtx> {
  const d = db(c.env);
  const pid = c.get('session').pid;
  return { db: d, pid, now: Date.now(), p: await requireDuelProfile(d, pid) };
}

export async function ensureDuelProfile(db: D1Database, pid: number, now: number): Promise<{ row: DuelProfileRow; created: boolean }> {
  const had = await getDuelProfile(db, pid);
  if (had) return { row: had, created: false };
  const ids = { nextId: 1 };
  const heroes = starterDuelRoster(hashString(`duel:${pid}`), ids, duelPrefix(pid));
  const res = await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO duel_profiles (player_id, glory, next_id, team, formations, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`,
      )
      .bind(pid, DUEL_RULES.startGlory, ids.nextId, JSON.stringify(heroes.map((h) => h.id)), JSON.stringify(DEFAULT_FORMATIONS), now),
    db
      .prepare('INSERT OR IGNORE INTO duel_loadouts (player_id, slot, name, team, formations, updated_at) VALUES (?1, 1, NULL, ?2, ?3, ?4)')
      .bind(pid, JSON.stringify(heroes.map((h) => h.id)), JSON.stringify(DEFAULT_FORMATIONS), now),
    // The starter roster is a pure function of the player id: a racing second create inserts nothing new.
    ...heroes.map((h) =>
      db
        .prepare('INSERT OR IGNORE INTO duel_heroes (id, player_id, data, base_attrs, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)')
        .bind(h.id, pid, JSON.stringify(h), JSON.stringify(h.attrs), now),
    ),
  ]);
  return { row: (await getDuelProfile(db, pid))!, created: res[0].meta.changes === 1 };
}

export function duelRevGuard(pid: number, rev: number): string {
  return `EXISTS (SELECT 1 FROM duel_profiles WHERE player_id = ${pid | 0} AND rev = ${rev | 0})`;
}

/** The statement that opens every duel write batch (bumps rev from the value read). */
export function bumpRev(db: D1Database, p: DuelProfileRow, now: number): D1PreparedStatement {
  return db.prepare('UPDATE duel_profiles SET rev = rev + 1, updated_at = ?2 WHERE player_id = ?1 AND rev = ?3').bind(p.player_id, now, p.rev);
}

/** Runs a batch whose first statement bumps the profile rev; 409 if another write got there first. */
export async function duelBatch(db: D1Database, stmts: D1PreparedStatement[]): Promise<D1Result[]> {
  const res = await db.batch(stmts);
  if (res[0].meta.changes !== 1) throw new ApiError(409, 'conflict', 'Your duel army changed meanwhile; try again');
  return res;
}

/** Reserves `n` fresh id numbers for new heroes and items. */
export async function reserveDuelIds(db: D1Database, pid: number, n: number): Promise<number> {
  const r = await db.prepare('UPDATE duel_profiles SET next_id = next_id + ?2 WHERE player_id = ?1 RETURNING next_id').bind(pid, n).first<{ next_id: number }>();
  if (!r) throw new ApiError(409, 'no_duel_profile', 'No duel profile');
  return r.next_id - n;
}

export async function loadDuelHeroes(db: D1Database, pid: number): Promise<DuelHero[]> {
  const rows = await db.prepare('SELECT data, base_attrs FROM duel_heroes WHERE player_id = ?1 ORDER BY created_at, id').bind(pid).all<{ data: string; base_attrs: string }>();
  return rows.results.map((r) => ({ hero: normalizeEquip(JSON.parse(r.data) as Hero), base: JSON.parse(r.base_attrs) as Attrs }));
}

export async function loadDuelItems(db: D1Database, pid: number): Promise<Item[]> {
  const rows = await db.prepare('SELECT data FROM duel_items WHERE player_id = ?1 ORDER BY created_at, uid').bind(pid).all<{ data: string }>();
  return rows.results.map((r) => normalizeItem(JSON.parse(r.data) as Item));
}

function idList(json: string): string[] {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function formationList(json: string): FormationType[] {
  try {
    const v = JSON.parse(json) as FormationType[];
    return Array.isArray(v) && v.length === 4 ? v : [...DEFAULT_FORMATIONS];
  } catch {
    return [...DEFAULT_FORMATIONS];
  }
}

/** The legacy team of a profile row (0007; loadout 1 since 0010). */
export function teamOf(p: Pick<DuelProfileRow, 'team'>): string[] {
  return idList(p.team);
}

export function duelFormations(p: Pick<DuelProfileRow, 'formations'>): FormationType[] {
  return formationList(p.formations);
}

/**
 * The player's presets (saved teams) by slot, 1..LOADOUT_SLOTS: one per row
 * (0014: a preset exists while its row does). Never empty: a profile without
 * rows (before 0010) has its legacy team as preset 1.
 */
export async function loadLoadouts(db: D1Database, p: DuelProfileRow): Promise<Loadout[]> {
  const rows = await db
    .prepare('SELECT slot, name, team, formations FROM duel_loadouts WHERE player_id = ?1 AND slot BETWEEN 1 AND ?2 ORDER BY slot')
    .bind(p.player_id, LOADOUT_SLOTS)
    .all<{ slot: number; name: string | null; team: string; formations: string }>();
  const out = rows.results.map((r) => ({ slot: r.slot, name: r.name, team: idList(r.team), formations: formationList(r.formations) }));
  if (!out.length) out.push({ slot: 1, name: null, team: teamOf(p), formations: duelFormations(p) });
  return out;
}

/** An existing preset slot: `slot` when it exists, else the first preset. */
export function presentSlot(loadouts: readonly Loadout[], slot: number): number {
  return loadouts.some((l) => l.slot === slot) ? slot : loadouts[0].slot;
}

/** The slot a profile row names for something (1..LOADOUT_SLOTS; resolve with presentSlot). */
export function useSlot(p: Pick<DuelProfileRow, 'lo_ladder' | 'lo_arena' | 'lo_defence'>, use: LoadoutUse): number {
  const v = use === 'ladder' ? p.lo_ladder : use === 'arena' ? p.lo_arena : p.lo_defence;
  return v >= 1 && v <= LOADOUT_SLOTS ? v : 1;
}

/** The slot the Team tab edits (resolve with presentSlot). */
export function editedSlot(p: Pick<DuelProfileRow, 'loadout'>): number {
  return p.loadout >= 1 && p.loadout <= LOADOUT_SLOTS ? p.loadout : 1;
}

/** The preset of a slot among `loadouts` (the first one when that slot is gone). */
export function presetAt(loadouts: readonly Loadout[], slot: number): Loadout {
  return loadouts.find((l) => l.slot === slot) ?? loadouts[0];
}

/** The loadout a profile uses for something. */
export async function loadoutFor(db: D1Database, p: DuelProfileRow, use: LoadoutUse): Promise<Loadout> {
  return presetAt(await loadLoadouts(db, p), useSlot(p, use));
}

/** Writes a loadout (guarded by `G`). */
export function loadoutStmt(db: D1Database, pid: number, l: Loadout, G: string, now: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO duel_loadouts (player_id, slot, name, team, formations, updated_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE ${G}
       ON CONFLICT (player_id, slot) DO UPDATE SET name = excluded.name, team = excluded.team, formations = excluded.formations, updated_at = excluded.updated_at`,
    )
    .bind(pid, l.slot, l.name, JSON.stringify(l.team), JSON.stringify(l.formations), now);
}

/** The heroes of a loadout as they would fight now (perfect gear, no wear in duels). */
export function loadoutHeroes(l: Loadout, heroes: readonly DuelHero[]): Hero[] {
  const byId = new Map(heroes.map((h) => [h.hero.id, h.hero]));
  return l.team.map((id) => byId.get(id)).filter((h): h is Hero => !!h).map(freshGear);
}

/**
 * Refreshes the defence snapshot (what the async bot plays) from the defence
 * loadout when it fits the ranked budget; a defence over budget keeps its last
 * snapshot. Only for players who already set a defence, unless `create`.
 * Returns why the loadout cannot defend, or null.
 */
export async function syncDefence(db: D1Database, pid: number, now: number, create = false): Promise<'none' | 'empty' | 'too_many' | 'over_budget' | null> {
  const p = await getDuelProfile(db, pid);
  if (!p) return 'none';
  if (!create && !(await db.prepare('SELECT 1 FROM duel_defences WHERE player_id = ?1').bind(pid).first())) return 'none';
  const l = await loadoutFor(db, p, 'defence');
  const heroes = loadoutHeroes(l, await loadDuelHeroes(db, pid));
  const problem = teamProblem(heroes, DUEL_RULES.budget);
  if (problem) return problem;
  await db
    .prepare(
      `INSERT INTO duel_defences (player_id, heroes, formations, points, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (player_id) DO UPDATE SET heroes = excluded.heroes, formations = excluded.formations, points = excluded.points, updated_at = excluded.updated_at`,
    )
    .bind(pid, JSON.stringify(heroes), JSON.stringify(l.formations), teamPoints(heroes), now)
    .run();
  return null;
}

/** Farm Glory still allowed today. */
export function farmLeft(p: Pick<DuelProfileRow, 'farm_day' | 'farm_glory'>, now: number): number {
  return p.farm_day === utcDay(now) ? Math.max(0, DUEL_RULES.farmGloryPerDay - p.farm_glory) : DUEL_RULES.farmGloryPerDay;
}

export interface DuelProfileView {
  now: number;
  day: number;
  glory: number;
  xp: number;
  level: number;
  ladder: {
    cleared: number;
    farmLeft: number;
    farmCap: number;
    /** Best stars per floor (index floor − 1, LADDER.floors long; 0: not won). */
    stars: number[];
    /** Chapter chests already claimed. */
    chests: { chapter: number; tier: number }[];
  };
  team: string[];
  formations: FormationType[];
  heroes: Hero[];
  stash: Item[];
  battles: number;
  wins: number;
  /** Daily offers this player already bought today. */
  bought: string[];
  /** The saved teams; `team` and `formations` above are the edited one's (`loadout`). */
  loadouts: Loadout[];
  loadout: number;
  /** Which loadout fights where. */
  use: Record<LoadoutUse, number>;
  /** The defence the bot plays in async attacks (null: none set yet). */
  defence: { points: number; heroes: number; updatedAt: number } | null;
}

export async function duelProfileView(db: D1Database, pid: number, now: number, row?: DuelProfileRow): Promise<DuelProfileView> {
  const p = row ?? (await requireDuelProfile(db, pid));
  const day = utcDay(now);
  const [heroes, stash, bought, loadouts, defence, ladder] = await Promise.all([
    loadDuelHeroes(db, pid),
    loadDuelItems(db, pid),
    db.prepare("SELECT ref FROM duel_orders WHERE player_id = ?1 AND kind = 'buy' AND ref LIKE ?2").bind(pid, `day${day}:%`).all<{ ref: string }>(),
    loadLoadouts(db, p),
    db.prepare('SELECT heroes, points, updated_at FROM duel_defences WHERE player_id = ?1').bind(pid).first<{ heroes: string; points: number; updated_at: number }>(),
    loadLadderStars(db, p),
  ]);
  const ids = new Set(heroes.map((h) => h.hero.id));
  for (const l of loadouts) l.team = l.team.filter((id) => ids.has(id));
  const edited = presetAt(loadouts, editedSlot(p));
  return {
    now,
    day,
    glory: p.glory,
    xp: p.xp,
    level: accountLevel(p.xp),
    ladder: { cleared: p.ladder_cleared, farmLeft: farmLeft(p, now), farmCap: DUEL_RULES.farmGloryPerDay, ...ladder },
    team: edited.team,
    formations: edited.formations,
    heroes: heroes.map((h) => h.hero),
    stash,
    battles: p.battles,
    wins: p.wins,
    bought: bought.results.map((r) => r.ref),
    loadouts,
    loadout: edited.slot,
    use: {
      ladder: presentSlot(loadouts, useSlot(p, 'ladder')),
      arena: presentSlot(loadouts, useSlot(p, 'arena')),
      defence: presentSlot(loadouts, useSlot(p, 'defence')),
    },
    defence: defence ? { points: defence.points, heroes: (JSON.parse(defence.heroes) as unknown[]).length, updatedAt: defence.updated_at } : null,
  };
}

/** The ladder's best stars per floor (legacy cleared floors count 1) and the claimed chapter chests. */
export async function loadLadderStars(db: D1Database, p: Pick<DuelProfileRow, 'player_id' | 'ladder_cleared'>): Promise<{ stars: number[]; chests: { chapter: number; tier: number }[] }> {
  const [rows, chests] = await Promise.all([
    db.prepare('SELECT floor, stars FROM duel_ladder_stars WHERE player_id = ?1').bind(p.player_id).all<{ floor: number; stars: number }>(),
    db.prepare('SELECT chapter, tier FROM duel_ladder_chests WHERE player_id = ?1 ORDER BY chapter, tier').bind(p.player_id).all<{ chapter: number; tier: number }>(),
  ]);
  return {
    stars: starsByFloor(p.ladder_cleared, new Map(rows.results.map((r) => [r.floor, r.stars]))),
    chests: chests.results.map((c) => ({ chapter: c.chapter, tier: c.tier })),
  };
}

/**
 * Statements writing what a duel battle taught the heroes (level, XP, points,
 * traits, tallies) and nothing else: gear or perks changed since the battle
 * started are kept. `before`: the team as it went in; `after`: the same heroes
 * after duelHeroXp; `current`: the heroes in D1 now. Each is guarded by `G`.
 */
export function heroProgressStmts(db: D1Database, pid: number, before: readonly Hero[], after: readonly Hero[], current: Map<string, Hero>, G: string, now: number): D1PreparedStatement[] {
  const out: D1PreparedStatement[] = [];
  for (const h of after) {
    const cur = current.get(h.id);
    if (!cur) continue;
    const gained = h.points - (before.find((y) => y.id === h.id)?.points ?? h.points);
    const next: Hero = { ...cur, level: h.level, xp: h.xp, points: cur.points + gained, traits: h.traits, battles: h.battles, kills: h.kills };
    out.push(db.prepare(`UPDATE duel_heroes SET data = ?3, updated_at = ?4 WHERE id = ?1 AND player_id = ?2 AND ${G}`).bind(h.id, pid, JSON.stringify(next), now));
  }
  return out;
}
