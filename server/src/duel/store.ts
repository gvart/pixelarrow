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
import { DUEL_RULES, accountLevel, starterDuelRoster, utcDay } from '../../../src/duel/rules';
import { ApiError } from '../errors';

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

export function teamOf(p: Pick<DuelProfileRow, 'team'>): string[] {
  try {
    const v = JSON.parse(p.team) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function duelFormations(p: Pick<DuelProfileRow, 'formations'>): FormationType[] {
  try {
    const v = JSON.parse(p.formations) as FormationType[];
    return Array.isArray(v) && v.length === 4 ? v : [...DEFAULT_FORMATIONS];
  } catch {
    return [...DEFAULT_FORMATIONS];
  }
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
  ladder: { cleared: number; farmLeft: number; farmCap: number };
  team: string[];
  formations: FormationType[];
  heroes: Hero[];
  stash: Item[];
  battles: number;
  wins: number;
  /** Daily offers this player already bought today. */
  bought: string[];
}

export async function duelProfileView(db: D1Database, pid: number, now: number, row?: DuelProfileRow): Promise<DuelProfileView> {
  const p = row ?? (await requireDuelProfile(db, pid));
  const day = utcDay(now);
  const [heroes, stash, bought] = await Promise.all([
    loadDuelHeroes(db, pid),
    loadDuelItems(db, pid),
    db.prepare("SELECT ref FROM duel_orders WHERE player_id = ?1 AND kind = 'buy' AND ref LIKE ?2").bind(pid, `day${day}:%`).all<{ ref: string }>(),
  ]);
  const ids = new Set(heroes.map((h) => h.hero.id));
  return {
    now,
    day,
    glory: p.glory,
    xp: p.xp,
    level: accountLevel(p.xp),
    ladder: { cleared: p.ladder_cleared, farmLeft: farmLeft(p, now), farmCap: DUEL_RULES.farmGloryPerDay },
    team: teamOf(p).filter((id) => ids.has(id)),
    formations: duelFormations(p),
    heroes: heroes.map((h) => h.hero),
    stash,
    battles: p.battles,
    wins: p.wins,
    bought: bought.results.map((r) => r.ref),
  };
}
