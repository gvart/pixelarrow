/**
 * War persons in D1 (M5e; docs/WAR.md "Soldiers"): the roster rules and every read and write of `war_persons`,
 * `war_pools`, `war_stock`, `war_items` and `war_fights` (migrations/0021_war_persons.sql).
 *
 *  - Roster: the field squad (SQUAD_MAX, `active` with a slot) plus a reserve of SQUAD_MAX / 2 (reserve, wounded,
 *    captive); the dead do not count. At the cap a recruit is refused (retirement comes later).
 *  - Household: min(4, 1 + fit fighters / 4) civilians (M5f brings the classes; none can be recruited yet).
 *  - Recruit: from a pool per town the player holds (M4 stub: the home camp, 6/h, cap 30), 20 food each, L1 militia.
 *  - Timers, read lazily: wounded heal after HEAL (field 6 h), captives walk home after CAPTIVE_MS (24 h).
 *  - Deployment: a room claims persons for its region on join (`region`); while deployed the API leaves them alone and
 *    only the room's fight write-back changes them. Fight writes are one D1 batch keyed by the fight id (idempotent).
 */
import { ATTR_IDS, ATTR_MAX, type AttrId, type Attrs } from '../../../src/data/perks';
import { CLASSES, isClassId } from '../../../src/data/classes';
import { ITEMS, type Item, type Slot } from '../../../src/data/items';
import { classGearBlocker } from '../../../src/data/gearRules';
import { freeName } from '../../../src/data/names';
import type { Equipment, Hero } from '../../../src/data/units';
import { freshHero } from '../../../src/war/sim/classes';
import { makePerson, type PersonOpts } from '../../../src/war/sim/roster';
import { legalSkills, SKILL_LEVELS } from '../../../src/war/sim/skills';
import { SQUAD_MAX } from '../../../src/war/sim/soldiers';
import type { FightReport, HonourStat, WarPerson, WarSkillId } from '../../../src/war/types';
import { ApiError } from '../errors';
import { randomToken } from '../online/store';

export type PersonState = 'active' | 'reserve' | 'wounded' | 'captive' | 'dead';

const HOUR = 3_600_000;
/** Fighters beyond the squad: the reserve (barracks, healing, captive). */
export const RESERVE_MAX = SQUAD_MAX / 2;
export const ROSTER_MAX = SQUAD_MAX + RESERVE_MAX;
/** Heal timers by where the wounded man lies (docs/WAR.md "Heal"); a fight's wounded heal in the field. */
export const HEAL = { field: 6 * HOUR, camp: 3 * HOUR, town: 2 * HOUR, physician: 1 * HOUR };
/** Captives walk home after this. */
export const CAPTIVE_MS = 24 * HOUR;
/** A recruit's cost in food. */
export const RECRUIT_FOOD = 20;
/** Towns a player recruits in. M4 stub: everyone holds a home camp; owned towns (3/h) come with the world map. */
export const TOWNS: Record<string, { rate: number; cap: number }> = { home: { rate: 6, cap: 30 } };
/** A new player's pool and food, so a first squad can be raised at once. */
export const START = { pool: SQUAD_MAX, food: (SQUAD_MAX + RESERVE_MAX) * RECRUIT_FOOD };

/** Civilians a player may keep (docs/WAR.md "Household"). */
export function householdCap(fit: number): number {
  return Math.min(4, 1 + Math.floor(fit / 4));
}

/** The pool's recruits at `now`, grown at the town's rate since `at`. */
export function poolAt(town: string, stored: number, at: number, now: number): number {
  const t = TOWNS[town];
  if (!t) return 0;
  return Math.min(t.cap, stored + (t.rate * Math.max(0, now - at)) / HOUR);
}

export interface PersonRow {
  id: string; player_id: number; cls: string; name: string; level: number; xp: number; points: number; kills: number; battles: number;
  attrs: string; skills: string; gear: string; honours: string; state: PersonState; until_at: number | null; captor: number | null;
  held_at: string | null; slot: number | null; region: string | null;
}

const json = <T>(s: string, fallback: T): T => {
  try {
    return (JSON.parse(s) as T) ?? fallback;
  } catch {
    return fallback;
  }
};

/** The person the sim spawns: the class's fresh hero with the row's level, attributes, gear and tallies. */
export function personOf(r: PersonRow): WarPerson {
  const base = freshHero(r.cls, r.id);
  const hero: Hero = {
    ...base, name: r.name || base.name, level: r.level, xp: r.xp, points: r.points, kills: r.kills, battles: r.battles,
    attrs: { ...base.attrs, ...json<Partial<Attrs>>(r.attrs, {}) }, equip: json<Equipment>(r.gear, {}),
  };
  return { id: r.id, hero, skills: json<WarSkillId[]>(r.skills, []), honours: json<{ name: string; stat: HonourStat }[]>(r.honours, []) };
}

/** Open choices after level-ups: unspent attribute points and skill slots with no skill in them. */
export function pending(p: WarPerson): { points: number; skills: number } {
  const slots = SKILL_LEVELS.filter((l) => p.hero.level >= l).length;
  return { points: p.hero.points, skills: Math.max(0, slots - (p.skills?.length ?? 0)) };
}

export function view(r: PersonRow) {
  const p = personOf(r);
  return {
    id: r.id, cls: r.cls, name: p.hero.name, level: r.level, xp: r.xp, kills: r.kills, battles: r.battles, attrs: p.hero.attrs,
    skills: p.skills ?? [], gear: p.hero.equip, honours: p.honours ?? [], state: r.state, until: r.until_at, captor: r.captor,
    heldAt: r.held_at, slot: r.slot, region: r.region, pending: pending(p),
  };
}

const COLS = 'id, player_id, cls, name, level, xp, points, kills, battles, attrs, skills, gear, honours, state, until_at, captor, held_at, slot, region';

/** Wounded men whose timer ran out are fit again (reserve); captives whose 24 h are up walk home. */
export async function settle(db: D1Database, pid: number, now: number): Promise<void> {
  await db
    .prepare("UPDATE war_persons SET state = 'reserve', until_at = NULL, captor = NULL, held_at = NULL, updated_at = ?2 WHERE player_id = ?1 AND state IN ('wounded', 'captive') AND until_at <= ?2")
    .bind(pid, now)
    .run();
}

export async function persons(db: D1Database, pid: number): Promise<PersonRow[]> {
  const r = await db.prepare(`SELECT ${COLS} FROM war_persons WHERE player_id = ?1 ORDER BY state = 'dead', slot IS NULL, slot, created_at, id`).bind(pid).all<PersonRow>();
  return r.results;
}

async function person(db: D1Database, pid: number, id: string): Promise<PersonRow> {
  const r = await db.prepare(`SELECT ${COLS} FROM war_persons WHERE id = ?1 AND player_id = ?2`).bind(id, pid).first<PersonRow>();
  if (!r) throw new ApiError(404, 'not_found', 'No such soldier');
  return r;
}

/** A person at home and fit: the API may change him. */
function home(r: PersonRow): void {
  if (r.region) throw new ApiError(409, 'deployed', `He is in the field in ${r.region}`);
  if (r.state !== 'active' && r.state !== 'reserve') throw new ApiError(409, 'not_fit', `He is ${r.state}`);
}

async function ensureStart(db: D1Database, pid: number, now: number): Promise<void> {
  await db.batch([
    ...Object.keys(TOWNS).map((t) => db.prepare('INSERT OR IGNORE INTO war_pools (player_id, town, stored, at) VALUES (?1, ?2, ?3, ?4)').bind(pid, t, START.pool, now)),
    db.prepare("INSERT OR IGNORE INTO war_stock (player_id, res, amount) VALUES (?1, 'food', ?2)").bind(pid, START.food),
  ]);
}

export interface Roster {
  persons: ReturnType<typeof view>[];
  caps: { squad: number; reserve: number; roster: number; household: number; fighters: number; fit: number };
  pools: { town: string; recruits: number; rate: number; cap: number }[];
  stock: Record<string, number>;
  items: Item[];
}

export async function roster(db: D1Database, pid: number, now: number): Promise<Roster> {
  await ensureStart(db, pid, now);
  await settle(db, pid, now);
  const [rows, pools, stock, items] = await Promise.all([
    persons(db, pid),
    db.prepare('SELECT town, stored, at FROM war_pools WHERE player_id = ?1').bind(pid).all<{ town: string; stored: number; at: number }>(),
    db.prepare('SELECT res, amount FROM war_stock WHERE player_id = ?1').bind(pid).all<{ res: string; amount: number }>(),
    db.prepare('SELECT item FROM war_items WHERE player_id = ?1 ORDER BY created_at, uid').bind(pid).all<{ item: string }>(),
  ]);
  const fighters = rows.filter((r) => r.state !== 'dead').length;
  const fit = rows.filter((r) => r.state === 'active' || r.state === 'reserve').length;
  return {
    persons: rows.map(view),
    caps: { squad: SQUAD_MAX, reserve: RESERVE_MAX, roster: ROSTER_MAX, household: householdCap(fit), fighters, fit },
    pools: pools.results.map((p) => ({ town: p.town, recruits: Math.floor(poolAt(p.town, p.stored, p.at, now)), ...TOWNS[p.town] })),
    stock: Object.fromEntries(stock.results.map((s) => [s.res, s.amount])),
    items: items.results.map((i) => json<Item>(i.item, { uid: '', def: '', rarity: 'common', cond: 0 })),
  };
}

const newId = (pid: number) => `w${pid}-${randomToken(5)}`;

function insertPerson(db: D1Database, pid: number, p: WarPerson, state: PersonState, slot: number | null, now: number): D1PreparedStatement {
  const h = p.hero;
  return db
    .prepare(
      `INSERT INTO war_persons (id, player_id, cls, name, level, xp, points, kills, battles, attrs, skills, gear, honours, state, slot, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16)`,
    )
    .bind(p.id, pid, h.cls ?? 'militia', h.name, h.level, h.xp, h.points, h.kills, h.battles, JSON.stringify(h.attrs), JSON.stringify(p.skills ?? []), JSON.stringify(h.equip), JSON.stringify(p.honours ?? []), state, slot, now);
}

/** A fresh name of the class's first culture that no living soldier of the player has. */
function nameFor(cls: string, taken: Set<string>, k: number): string {
  const c = CLASSES[isClassId(cls) ? cls : 'militia'].cultures[0] ?? 'greek';
  const n = freeName(c, k, taken);
  taken.add(n);
  return n;
}

/** Recruit `count` L1 militia from the town's pool for RECRUIT_FOOD each; caps checked first. */
export async function recruit(db: D1Database, pid: number, town: string, count: number, now: number): Promise<string[]> {
  if (!TOWNS[town]) throw new ApiError(404, 'not_found', 'You hold no such town');
  await ensureStart(db, pid, now);
  await settle(db, pid, now);
  const rows = await persons(db, pid);
  const fighters = rows.filter((r) => r.state !== 'dead').length;
  if (fighters + count > ROSTER_MAX) throw new ApiError(409, 'roster_full', `The roster holds ${ROSTER_MAX} soldiers (${fighters} now); retire one first`);
  const pool = await db.prepare('SELECT stored, at FROM war_pools WHERE player_id = ?1 AND town = ?2').bind(pid, town).first<{ stored: number; at: number }>();
  const have = pool ? poolAt(town, pool.stored, pool.at, now) : 0;
  if (have < count) throw new ApiError(409, 'pool_empty', `${Math.floor(have)} recruits wait in ${town}`);
  const food = RECRUIT_FOOD * count;
  const taken = new Set(rows.filter((r) => r.state !== 'dead').map((r) => r.name));
  const made = Array.from({ length: count }, (_, k) => {
    const p = makePerson(newId(pid), 'militia');
    return { ...p, hero: { ...p.hero, name: nameFor('militia', taken, rows.length + k) } };
  });
  // the food debit is conditional: no food, nothing changes
  const paid = await db.prepare("UPDATE war_stock SET amount = amount - ?2 WHERE player_id = ?1 AND res = 'food' AND amount >= ?2").bind(pid, food).run();
  if (paid.meta.changes === 0) throw new ApiError(409, 'no_food', `A recruit costs ${RECRUIT_FOOD} food`);
  await db.batch([
    db.prepare('UPDATE war_pools SET stored = ?3, at = ?4 WHERE player_id = ?1 AND town = ?2').bind(pid, town, have - count, now),
    ...made.map((p) => insertPerson(db, pid, p, 'reserve', null, now)),
  ]);
  return made.map((p) => p.id);
}

/** Put `uid` (from the stash; null: take the slot's item off) on the soldier; the old item goes to the stash. */
export async function equip(db: D1Database, pid: number, id: string, slot: Slot, uid: string | null, now: number): Promise<void> {
  const r = await person(db, pid, id);
  home(r);
  const gear = json<Equipment>(r.gear, {});
  const stmts: D1PreparedStatement[] = [];
  let item: Item | null = null;
  if (uid) {
    const row = await db.prepare('SELECT item FROM war_items WHERE uid = ?1 AND player_id = ?2').bind(uid, pid).first<{ item: string }>();
    if (!row) throw new ApiError(404, 'not_found', 'No such item in your stash');
    item = json<Item | null>(row.item, null);
    const def = item ? ITEMS[item.def] : undefined;
    if (!item || !def) throw new ApiError(409, 'bad_item', 'Unknown item');
    if (def.slot !== slot) throw new ApiError(409, 'wrong_slot', `${def.name} goes in the ${def.slot} slot`);
    const block = classGearBlocker(r.cls, def);
    if (block) throw new ApiError(409, 'class_gear', `A ${r.cls} cannot use ${def.name} (${block})`);
    stmts.push(db.prepare('DELETE FROM war_items WHERE uid = ?1 AND player_id = ?2').bind(uid, pid));
  }
  const old = gear[slot];
  if (old) stmts.push(db.prepare('INSERT OR REPLACE INTO war_items (uid, player_id, item, created_at) VALUES (?1, ?2, ?3, ?4)').bind(old.uid, pid, JSON.stringify(old), now));
  if (item) gear[slot] = item;
  else delete gear[slot];
  stmts.push(db.prepare('UPDATE war_persons SET gear = ?3, updated_at = ?4 WHERE id = ?1 AND player_id = ?2 AND region IS NULL').bind(id, pid, JSON.stringify(gear), now));
  await db.batch(stmts);
}

/** Spend unspent attribute points and / or take a skill in an open slot (levels 3 and 7, the family pool). */
export async function levelUp(db: D1Database, pid: number, id: string, attrs: Partial<Record<AttrId, number>>, skill: WarSkillId | undefined, now: number): Promise<void> {
  const r = await person(db, pid, id);
  home(r);
  const p = personOf(r);
  const a: Attrs = { ...p.hero.attrs };
  let spent = 0;
  for (const k of ATTR_IDS) {
    const n = attrs[k] ?? 0;
    if (a[k] + n > ATTR_MAX) throw new ApiError(409, 'attr_max', `${k} is at most ${ATTR_MAX}`);
    a[k] += n;
    spent += n;
  }
  if (spent > p.hero.points) throw new ApiError(409, 'no_points', `${p.hero.points} points to spend`);
  const skills = [...(p.skills ?? [])];
  if (skill) {
    const next = legalSkills(r.cls, r.level, [...skills, skill]);
    if (skills.includes(skill) || !next.includes(skill)) throw new ApiError(409, 'bad_skill', `${skill} is not open to him now`);
    skills.push(skill);
  }
  await db
    .prepare('UPDATE war_persons SET attrs = ?3, points = ?4, skills = ?5, updated_at = ?6 WHERE id = ?1 AND player_id = ?2 AND region IS NULL')
    .bind(id, pid, JSON.stringify(a), p.hero.points - spent, JSON.stringify(skills), now)
    .run();
}

/** The field squad, in slot order: these become active; everyone else who was active goes to the reserve. */
export async function formSquad(db: D1Database, pid: number, ids: string[], now: number): Promise<void> {
  if (new Set(ids).size !== ids.length) throw new ApiError(400, 'bad_request', 'A soldier stands in one slot');
  if (ids.length > SQUAD_MAX) throw new ApiError(409, 'squad_full', `A squad is at most ${SQUAD_MAX}`);
  await settle(db, pid, now);
  const rows = await persons(db, pid);
  const by = new Map(rows.map((r) => [r.id, r]));
  for (const id of ids) {
    const r = by.get(id);
    if (!r) throw new ApiError(404, 'not_found', `No soldier ${id}`);
    home(r);
  }
  for (const r of rows) if (r.state === 'active' && r.region && !ids.includes(r.id)) throw new ApiError(409, 'deployed', `${r.name} is in the field`);
  await db.batch([
    db.prepare("UPDATE war_persons SET state = 'reserve', slot = NULL, updated_at = ?2 WHERE player_id = ?1 AND state = 'active' AND region IS NULL").bind(pid, now),
    ...ids.map((id, slot) => db.prepare("UPDATE war_persons SET state = 'active', slot = ?3, updated_at = ?4 WHERE id = ?1 AND player_id = ?2").bind(id, pid, slot, now)),
  ]);
}

/** Dev: replace the player's soldiers at home with a full roster (a squad of `squad` and a reserve of `reserve`), plus food and stash gear. */
export async function seed(db: D1Database, pid: number, now: number, o: { squad?: { cls: string; level?: number }[]; reserve?: { cls: string; level?: number }[] } = {}): Promise<string[]> {
  await ensureStart(db, pid, now);
  const deployed = (await persons(db, pid)).filter((r) => r.region && r.state !== 'dead').length;
  const squad = o.squad ?? Array.from({ length: SQUAD_MAX }, (_, i) => ({ cls: 'hoplite', level: 1 + (i % 6) }));
  const reserve = o.reserve ?? Array.from({ length: RESERVE_MAX }, (_, i) => ({ cls: 'archer', level: 1 + (i % 4) }));
  if (deployed + squad.length + reserve.length > ROSTER_MAX) throw new ApiError(409, 'roster_full', `${deployed} soldiers are in the field`);
  const taken = new Set<string>();
  const make = (g: { cls: string; level?: number }, k: number) => {
    const opts: PersonOpts = { level: g.level ?? 1, tier: (g.level ?? 1) >= 6 ? 1 : 0 };
    const p = makePerson(newId(pid), g.cls, opts);
    return { ...p, hero: { ...p.hero, name: nameFor(g.cls, taken, k) } };
  };
  const a = squad.map(make), b = reserve.map((g, k) => make(g, squad.length + k));
  const spare = freshHero('hoplite', 'stash');
  await db.batch([
    db.prepare("DELETE FROM war_persons WHERE player_id = ?1 AND region IS NULL").bind(pid),
    db.prepare("UPDATE war_stock SET amount = MAX(amount, ?2) WHERE player_id = ?1 AND res = 'food'").bind(pid, START.food),
    ...a.map((p, i) => insertPerson(db, pid, p, 'active', i, now)),
    ...b.map((p) => insertPerson(db, pid, p, 'reserve', null, now)),
    ...Object.values(spare.equip).filter((x): x is Item => !!x).map((it) => {
      const item = { ...it, uid: `${pid}-seed-${it.def}` };
      return db.prepare('INSERT OR IGNORE INTO war_items (uid, player_id, item, created_at) VALUES (?1, ?2, ?3, ?4)').bind(item.uid, pid, JSON.stringify(item), now);
    }),
  ]);
  return [...a, ...b].map((p) => p.id);
}

// ---------------------------------------------------------------- the region rooms

/**
 * Claim persons for a join into `region`: every id must be the player's, fit (active or reserve) and at home (or
 * already claimed by this region and not on its field, `inRoom`). Returns them grouped as asked, or a refusal reason.
 */
export async function claimForJoin(db: D1Database, pid: number, region: string, squads: string[][], inRoom: ReadonlySet<string>, now: number): Promise<WarPerson[][] | string> {
  const ids = squads.flat();
  if (new Set(ids).size !== ids.length) return 'a soldier listed twice';
  await settle(db, pid, now);
  const rows = (await db.prepare(`SELECT ${COLS} FROM war_persons WHERE player_id = ?1 AND id IN (SELECT value FROM json_each(?2))`).bind(pid, JSON.stringify(ids)).all<PersonRow>()).results;
  const by = new Map(rows.map((r) => [r.id, r]));
  for (const id of ids) {
    const r = by.get(id);
    if (!r) return `no soldier ${id}`;
    if (r.state !== 'active' && r.state !== 'reserve') return `${r.name} is ${r.state}`;
    if (inRoom.has(id) || (r.region && r.region !== region)) return `${r.name} is already in the field`;
  }
  const res = await db
    .prepare('UPDATE war_persons SET region = ?3, updated_at = ?4 WHERE player_id = ?1 AND id IN (SELECT value FROM json_each(?2)) AND (region IS NULL OR region = ?3)')
    .bind(pid, JSON.stringify(ids), region, now)
    .run();
  if (res.meta.changes !== ids.length) {
    await release(db, region, ids.filter((id) => !by.get(id)!.region));
    return 'a soldier was taken meanwhile';
  }
  return squads.map((s) => s.map((id) => personOf(by.get(id)!)));
}

/** Persons the room let go (a refused or abandoned join) are home again. */
export async function release(db: D1Database, region: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db.prepare('UPDATE war_persons SET region = NULL WHERE region = ?1 AND id IN (SELECT value FROM json_each(?2))').bind(region, JSON.stringify(ids)).run();
}

/** A fresh room (no saved state): nobody is in the field there any more. */
export async function releaseRegion(db: D1Database, region: string): Promise<void> {
  await db.prepare('UPDATE war_persons SET region = NULL WHERE region = ?1').bind(region).run();
}

/** Persons deployed in `region` by id (a resumed room respawns them). */
export async function deployed(db: D1Database, region: string, ids: string[]): Promise<Map<string, WarPerson>> {
  if (!ids.length) return new Map();
  const rows = (await db.prepare(`SELECT ${COLS} FROM war_persons WHERE region = ?1 AND state IN ('active', 'reserve') AND id IN (SELECT value FROM json_each(?2))`).bind(region, JSON.stringify(ids)).all<PersonRow>()).results;
  return new Map(rows.map((r) => [r.id, personOf(r)]));
}

const ownerPid = (owner: string): number | null => {
  const m = /^p:(\d+)$/.exec(owner);
  return m ? Number(m[1]) : null;
};

/**
 * Write a fight back (M5d FightReport) in one batch: XP, level and points, kills and battles for all; the wounded go
 * home to heal (HEAL.field), captives are held by the captor's alliance in this region (CAPTIVE_MS), the dead lose
 * their gear; loot goes to the stashes of the team's players in the fight in turn. The war_fights row comes first: a
 * second write of the same fight fails on its key and changes nothing. Returns false for a fight already written.
 */
export async function applyFight(db: D1Database, fightId: string, region: string, r: FightReport, now: number): Promise<boolean> {
  const stmts: D1PreparedStatement[] = [db.prepare('INSERT INTO war_fights (id, region, tick, persons, at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(fightId, region, r.tick, r.persons.length, now)];
  for (const x of r.persons) {
    const pid = ownerPid(x.owner);
    if (pid === null) continue;
    const h = x.hero;
    const base = `cls = ?3, level = ?4, xp = ?5, points = ?6, kills = ?7, battles = ?8, attrs = ?9, gear = ?10, updated_at = ?11`;
    const args = [x.pid, pid, h.cls ?? 'militia', h.level, h.xp, h.points, h.kills, h.battles, JSON.stringify(h.attrs), JSON.stringify(x.state === 'dead' ? {} : h.equip), now] as const;
    if (x.state === 'fit') stmts.push(db.prepare(`UPDATE war_persons SET ${base} WHERE id = ?1 AND player_id = ?2`).bind(...args));
    else if (x.state === 'wounded')
      stmts.push(db.prepare(`UPDATE war_persons SET ${base}, state = 'wounded', until_at = ?12, slot = NULL, region = NULL WHERE id = ?1 AND player_id = ?2`).bind(...args, now + HEAL.field));
    else if (x.state === 'captive')
      stmts.push(db.prepare(`UPDATE war_persons SET ${base}, state = 'captive', until_at = ?12, captor = ?13, held_at = ?14, slot = NULL, region = NULL WHERE id = ?1 AND player_id = ?2`).bind(...args, now + CAPTIVE_MS, x.captor ?? null, region));
    else stmts.push(db.prepare(`UPDATE war_persons SET ${base}, state = 'dead', until_at = NULL, slot = NULL, region = NULL WHERE id = ?1 AND player_id = ?2`).bind(...args));
  }
  for (const [team, items] of Object.entries(r.loot)) {
    const owners = [...new Set(r.persons.filter((x) => x.team === Number(team)).map((x) => ownerPid(x.owner)).filter((p): p is number => p !== null))].sort((a, b) => a - b);
    if (!owners.length) continue;
    items.forEach((it, i) => {
      const item = { ...it, uid: `${fightId}:${i}:${it.uid}` };
      stmts.push(db.prepare('INSERT INTO war_items (uid, player_id, item, fight_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(item.uid, owners[i % owners.length], JSON.stringify(item), fightId, now));
    });
  }
  try {
    await db.batch(stmts);
    return true;
  } catch (e) {
    if (/UNIQUE constraint failed: war_fights\.id/.test(String(e))) return false;
    throw e;
  }
}
