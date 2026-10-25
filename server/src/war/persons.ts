/**
 * War persons in D1 (M5e; docs/WAR.md "Soldiers"): the roster rules and every read and write of `war_persons`,
 * `war_pools`, `war_items` and `war_fights` (migrations/0021_war_persons.sql). M6e: food and coin live in the player's
 * home strongroom (./holders.ts): recruits, upkeep, training, promotion, ransom and retirement pay from it or into it.
 *
 *  - Roster: the field squad (SQUAD_MAX, `active` with a slot) plus a reserve of SQUAD_MAX / 2 (reserve, wounded,
 *    captive); the dead do not count. At the cap a recruit is refused (retirement comes later).
 *  - Household: min(4, 1 + fit fighters / 4) civilians (M5f brings the classes; none can be recruited yet).
 *  - Recruit: from a pool per town the player holds (M4 stub: the home camp, 6/h, cap 30), 20 food each, L1 militia.
 *  - Timers, read lazily: wounded heal after HEAL (field 6 h), captives walk home after CAPTIVE_MS (24 h), training ends
 *    after TRAIN.ms (10 min).
 *  - Train: a fit man at home becomes a class his town trains (TOWN buildings: barracks, range; no stable yet): militia
 *    into any, others only within their family; TRAIN.silver buys the class's tier-1 common kit (crafting comes with M6),
 *    put on when training ends; his old gear goes to the stash; level, XP and his family's skills stay.
 *  - Promote (docs/WAR.md "Promote"): a fit trained man at home with PROMOTE.level and PROMOTE.honours, in a town with a
 *    fortress, becomes an elite of his family (src/war/sim/roster.ts promotesTo) in PROMOTE_MS; he pays the elite rare
 *    kit's value in silver, it goes on when he is done (his old gear to the stash). Elites cost UPKEEP.elite.
 *  - Prisoners: a captive is held by the player of the captor alliance who fought there (`captor_pid`); he pays the
 *    captive's upkeep and takes the ransom (RANSOM_PER_LEVEL x level silver) when the owner pays it; he may also let him go.
 *    A captor who cannot pay upkeep lets all his captives go. A captive is held at the captor's nearest fort or camp in
 *    the region (`held_fort`, the sim's building id; at most HOLD_MAX there, the rest go free, wounded); a raid reaching
 *    it or its fall (the sim's `raid` event, freeRaided) frees them all: home, wounded (HEAL.field).
 *  - Upkeep (docs/WAR.md "Anti-oversaturation"), settled lazily: food per hour for each man in the field (UPKEEP), and
 *    each captive held. Unpaid: the player's wounded do not heal and his men earn no XP until it is paid.
 *  - Retire: a fit man at home leaves for good (frees his roster place); half his gear's value comes back as silver and
 *    his first honour goes on the memorial. A level-10 soldier may instead retire into a civilian class at level 5
 *    (household cap).
 *  - Deployment: a room claims persons for its region on join (`region`); while deployed the API leaves them alone and
 *    only the room's fight write-back changes them. Fight writes are one D1 batch keyed by the fight id (idempotent).
 */
import { ATTR_IDS, ATTR_MAX, type AttrId, type Attrs } from '../../../src/data/perks';
import { CLASSES, isCivClass, isClassId, type ClassId } from '../../../src/data/classes';
import { itemValue, ITEMS, type Item, type Slot } from '../../../src/data/items';
import { classGearBlocker } from '../../../src/data/gearRules';
import { freeName } from '../../../src/data/names';
import type { Equipment, Hero } from '../../../src/data/units';
import { freshHero } from '../../../src/war/sim/classes';
import { freshCivilian } from '../../../src/war/sim/civilians';
import { isElite, makePerson, promoteBlocker, promotePerson, type PersonOpts } from '../../../src/war/sim/roster';
import { FAMILY_OF, legalSkills, SKILL_LEVELS } from '../../../src/war/sim/skills';
import { SQUAD_MAX } from '../../../src/war/sim/soldiers';
import { HONOURS_MAX } from '../../../src/war/sim/honours';
import { WAR_SEASON } from '../../../src/war/world/alliances';
import type { FightReport, HonourStat, WarPerson, WarSkillId } from '../../../src/war/types';
import { ApiError } from '../errors';
import { randomToken } from '../online/store';
import { batch, ensureHolder, goodsOf, HOME, itemsIn, lotsOf, pay as payFrom, placeItemStmt, planTake, putStmt, strongroom } from './holders';

export type PersonState = 'active' | 'reserve' | 'wounded' | 'captive' | 'dead' | 'training' | 'retired';

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
/** Towns a player recruits and trains in. M4 stub: everyone holds a home camp; owned towns (3/h) come with the world map. */
export const TOWNS: Record<string, { rate: number; cap: number; buildings: TrainingBuilding[] }> = { home: { rate: 6, cap: 30, buildings: ['barracks', 'range', 'fortress'] } };
/** A new player's pool and food (season start: his squad and START.food in his home strongroom, no coin, no goods). */
export const START = { pool: SQUAD_MAX, food: (SQUAD_MAX + RESERVE_MAX) * RECRUIT_FOOD };
/** Dev seed (DEV_AUTH=1): coin topped up to this, to test the coin paths. */
export const DEV_COIN = 500;
/** Training: time and the coin a tier-1 common kit costs. */
export const TRAIN = { ms: 10 * 60_000, coin: 40 };
export type TrainingBuilding = 'barracks' | 'range' | 'stable' | 'fortress';
/** The classes each building trains (docs/WAR.md "Classes"). */
export const TRAINS: Record<TrainingBuilding, ClassId[]> = {
  barracks: ['hoplite', 'thureophoros', 'celt_sword', 'falx'],
  range: ['archer', 'slinger', 'javelineer', 'peltast'],
  stable: ['companion', 'thessalian', 'horse_archer'],
  fortress: [], // promotes (promote), trains no one
};
/** Promotion to elite takes this long (at a fortress). */
export const PROMOTE_MS = 30 * 60_000;
/** Captives one fort or camp holds; past it the rest go free. */
export const HOLD_MAX = 20;
/** Ransom: coin per level of the captive. */
export const RANSOM_PER_LEVEL = 30;
/** Upkeep: food per hour each. */
export const UPKEEP = { soldier: 1, elite: 2, civilian: 1, captive: 1 };
/** Unpaid upkeep stops growing past this many hours of the player's rate. */
export const UPKEEP_DEBT_HOURS = 24;

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
  held_at: string | null; slot: number | null; region: string | null; train_to: string | null; captor_pid: number | null;
  perks: string; respec_at: number | null; held_fort: number | null;
}

export const json = <T>(s: string, fallback: T): T => {
  try {
    return (JSON.parse(s) as T) ?? fallback;
  } catch {
    return fallback;
  }
};

/** The person the sim spawns: the class's fresh hero with the row's level, attributes, gear and tallies. */
export function personOf(r: PersonRow): WarPerson {
  // a civilian is his own class (freshHero would make him a soldier carrying a tool the item table does not know)
  const base = isCivClass(r.cls) ? freshCivilian(r.cls, r.id) : freshHero(r.cls, r.id);
  const hero: Hero = {
    ...base, name: r.name || base.name, level: r.level, xp: r.xp, points: r.points, kills: r.kills, battles: r.battles,
    attrs: { ...base.attrs, ...json<Partial<Attrs>>(r.attrs, {}) }, equip: json<Equipment>(r.gear, {}),
    perks: json<Hero['perks']>(r.perks ?? '[]', []),
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
    heldAt: r.held_at, slot: r.slot, region: r.region, pending: pending(p), trainTo: r.train_to, perks: p.hero.perks, respecAt: r.respec_at,
    ...(r.state === 'captive' ? { ransom: RANSOM_PER_LEVEL * r.level } : {}),
  };
}

const COLS = 'id, player_id, cls, name, level, xp, points, kills, battles, attrs, skills, gear, honours, state, until_at, captor, held_at, slot, region, train_to, captor_pid, perks, respec_at, held_fort';

/** The player's upkeep in food per hour: his men in the field (elites 2, civilians 1) and the captives he holds. */
export async function upkeepRate(db: D1Database, pid: number): Promise<number> {
  const [field, held] = await Promise.all([
    db.prepare("SELECT cls FROM war_persons WHERE player_id = ?1 AND region IS NOT NULL AND state IN ('active', 'reserve')").bind(pid).all<{ cls: string }>(),
    db.prepare("SELECT COUNT(*) AS n FROM war_persons WHERE captor_pid = ?1 AND state = 'captive'").bind(pid).first<{ n: number }>(),
  ]);
  let rate = (held?.n ?? 0) * UPKEEP.captive;
  for (const r of field.results) rate += isCivClass(r.cls) ? UPKEEP.civilian : isElite(r.cls) ? UPKEEP.elite : UPKEEP.soldier;
  return rate;
}

/**
 * Settle the player's upkeep up to `now` at his current rate: the food owed since the last settle is paid from his stock
 * in whole units; what the stock cannot cover stays owed (up to UPKEEP_DEBT_HOURS of his rate) and marks him unpaid. An
 * unpaid captor lets his captives go. Returns whether he is unpaid now.
 */
export async function settleUpkeep(db: D1Database, pid: number, now: number): Promise<{ unpaid: boolean; rate: number; owed: number }> {
  const u = await db.prepare('SELECT at, owed, unpaid FROM war_upkeep WHERE player_id = ?1').bind(pid).first<{ at: number; owed: number; unpaid: number }>();
  const rate = await upkeepRate(db, pid);
  if (!u) {
    await db.prepare('INSERT OR IGNORE INTO war_upkeep (player_id, at, owed, unpaid) VALUES (?1, ?2, 0, 0)').bind(pid, now).run();
    return { unpaid: false, rate, owed: 0 };
  }
  let owed = Math.min(u.owed + (rate * Math.max(0, now - u.at)) / HOUR, Math.max(u.owed, rate * UPKEEP_DEBT_HOURS));
  const due = Math.floor(owed);
  let paid = 0;
  if (due > 0) {
    const lots = await lotsOf(db, strongroom(pid));
    const food = lots.filter((l) => l.res === 'food' && !l.seal).reduce((a, l) => a + l.amount, 0);
    paid = Math.min(due, Math.floor(food + 1e-6));
    if (paid > 0) await batch(db, planTake(db, strongroom(pid), lots, { food: paid }).stmts);
    owed -= paid;
  }
  const unpaid = due > paid;
  await db.prepare('UPDATE war_upkeep SET at = ?2, owed = ?3, unpaid = ?4 WHERE player_id = ?1').bind(pid, now, owed, unpaid ? 1 : 0).run();
  if (unpaid)
    await db
      .prepare("UPDATE war_persons SET state = 'reserve', until_at = NULL, captor = NULL, captor_pid = NULL, held_at = NULL, held_fort = NULL, updated_at = ?2 WHERE captor_pid = ?1 AND state = 'captive'")
      .bind(pid, now)
      .run();
  return { unpaid, rate, owed };
}

/** Gear with uids unique to the man and the moment. */
function reUid(equip: Equipment, id: string, now: number): Equipment {
  const out: Equipment = {};
  for (const [slot, it] of Object.entries(equip)) if (it) out[slot as Slot] = { ...it, uid: `${id}-${slot}-${now.toString(36)}` };
  return out;
}

/** The tier-1 common kit of a class, as worn gear. */
const kitOf = (cls: string, id: string, now: number): Equipment => reUid(freshHero(cls, id).equip, id, now);

/**
 * Timers, read lazily: upkeep first (an unpaid player's wounded do not heal); wounded men whose time is up are fit again
 * (reserve); captives whose 24 h are up walk home; finished training: the new class, its kit on, skills of the new family.
 */
export async function settle(db: D1Database, pid: number, now: number): Promise<void> {
  const { unpaid } = await settleUpkeep(db, pid, now);
  const states = unpaid ? "'captive'" : "'wounded', 'captive'";
  await db
    .prepare(`UPDATE war_persons SET state = 'reserve', until_at = NULL, captor = NULL, captor_pid = NULL, held_at = NULL, held_fort = NULL, updated_at = ?2 WHERE player_id = ?1 AND state IN (${states}) AND until_at <= ?2`)
    .bind(pid, now)
    .run();
  const done = (await db.prepare(`SELECT ${COLS} FROM war_persons WHERE player_id = ?1 AND state = 'training' AND until_at <= ?2`).bind(pid, now).all<PersonRow>()).results;
  if (!done.length) return;
  await db.batch(
    done.map((r) => {
      const cls = r.train_to && isClassId(r.train_to) ? r.train_to : r.cls;
      // a promotion: the elite rare kit; training: the class's tier-1 common kit
      const elite = isClassId(cls) && isElite(cls) ? promotePerson(personOf(r), cls) : null;
      const skills = elite?.skills ?? legalSkills(cls, r.level, json<WarSkillId[]>(r.skills, []));
      return db
        .prepare("UPDATE war_persons SET state = 'reserve', cls = ?3, gear = ?4, skills = ?5, train_to = NULL, until_at = NULL, updated_at = ?6 WHERE id = ?1 AND player_id = ?2 AND state = 'training'")
        .bind(r.id, pid, cls, JSON.stringify(elite ? reUid(elite.hero.equip, r.id, now) : kitOf(cls, r.id, now)), JSON.stringify(skills), now);
    }),
  );
}

export async function persons(db: D1Database, pid: number): Promise<PersonRow[]> {
  const r = await db.prepare(`SELECT ${COLS} FROM war_persons WHERE player_id = ?1 AND state != 'retired' ORDER BY state = 'dead', slot IS NULL, slot, created_at, id`).bind(pid).all<PersonRow>();
  return r.results;
}

/** Fighters (the roster cap counts them): soldiers neither dead nor retired; civilians are the household. */
const isFighter = (r: PersonRow) => r.state !== 'dead' && r.state !== 'retired' && !isCivClass(r.cls);

export async function person(db: D1Database, pid: number, id: string): Promise<PersonRow> {
  const r = await db.prepare(`SELECT ${COLS} FROM war_persons WHERE id = ?1 AND player_id = ?2`).bind(id, pid).first<PersonRow>();
  if (!r) throw new ApiError(404, 'not_found', 'No such soldier');
  return r;
}

/** A person at home and fit: the API may change him. */
export function home(r: PersonRow): void {
  if (r.region) throw new ApiError(409, 'deployed', `He is in the field in ${r.region}`);
  if (r.state !== 'active' && r.state !== 'reserve') throw new ApiError(409, 'not_fit', `He is ${r.state}`);
}

/** Season start, once: the recruit pools and START.food in the home strongroom (the strongroom row marks it done). */
export async function ensureStart(db: D1Database, pid: number, now: number): Promise<void> {
  const sr = strongroom(pid);
  await db.batch([
    ...Object.keys(TOWNS).map((t) => db.prepare('INSERT OR IGNORE INTO war_pools (player_id, town, stored, at) VALUES (?1, ?2, ?3, ?4)').bind(pid, t, START.pool, now)),
    db
      .prepare("INSERT INTO war_goods (place, res, origin, seal, amount) SELECT ?1, 'food', ?3, 0, ?2 WHERE NOT EXISTS (SELECT 1 FROM war_holders WHERE id = ?1) ON CONFLICT (place, res, origin, seal) DO UPDATE SET amount = amount + ?2")
      .bind(sr, START.food, HOME),
    ensureHolder(db, sr, 'strongroom', { pid }, now),
  ]);
}

export interface Roster {
  persons: ReturnType<typeof view>[];
  caps: { squad: number; reserve: number; roster: number; household: number; fighters: number; fit: number };
  pools: { town: string; recruits: number; rate: number; cap: number }[];
  /** The home strongroom: its goods (food, coin, ...) and items (equip from here). */
  stock: Record<string, number>;
  items: Item[];
  /** Captives the player holds (he pays their upkeep, takes their ransom). */
  captives: { id: string; name: string; cls: string; level: number; owner: number; ransom: number; until: number | null; heldAt: string | null }[];
  upkeep: { rate: number; owed: number; unpaid: boolean };
}

export async function roster(db: D1Database, pid: number, now: number): Promise<Roster> {
  await ensureStart(db, pid, now);
  await settle(db, pid, now);
  const up = await db.prepare('SELECT owed, unpaid FROM war_upkeep WHERE player_id = ?1').bind(pid).first<{ owed: number; unpaid: number }>();
  const [rows, pools, stock, items, held, rate] = await Promise.all([
    persons(db, pid),
    db.prepare('SELECT town, stored, at FROM war_pools WHERE player_id = ?1').bind(pid).all<{ town: string; stored: number; at: number }>(),
    goodsOf(db, strongroom(pid)),
    itemsIn(db, strongroom(pid)),
    db.prepare(`SELECT ${COLS} FROM war_persons WHERE captor_pid = ?1 AND state = 'captive' ORDER BY until_at, id`).bind(pid).all<PersonRow>(),
    upkeepRate(db, pid),
  ]);
  const fighters = rows.filter(isFighter).length;
  const fit = rows.filter((r) => r.state === 'active' || r.state === 'reserve').length;
  return {
    persons: rows.map(view),
    caps: { squad: SQUAD_MAX, reserve: RESERVE_MAX, roster: ROSTER_MAX, household: householdCap(fit), fighters, fit },
    pools: pools.results.map((p) => ({ town: p.town, recruits: Math.floor(poolAt(p.town, p.stored, p.at, now)), ...TOWNS[p.town] })),
    stock,
    items,
    captives: held.results.map((r) => ({ id: r.id, name: r.name, cls: r.cls, level: r.level, owner: r.player_id, ransom: RANSOM_PER_LEVEL * r.level, until: r.until_at, heldAt: r.held_at })),
    upkeep: { rate, owed: +(up?.owed ?? 0).toFixed(2), unpaid: !!up?.unpaid },
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
  const fighters = rows.filter(isFighter).length;
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
  // food from the strongroom and the recruits in one batch: no food, nothing changes
  await payFrom(db, strongroom(pid), { food }, [
    db.prepare('UPDATE war_pools SET stored = ?3, at = ?4 WHERE player_id = ?1 AND town = ?2').bind(pid, town, have - count, now),
    ...made.map((p) => insertPerson(db, pid, p, 'reserve', null, now)),
  ]).catch((e) => {
    if (e instanceof ApiError && e.code === 'no_food') throw new ApiError(409, 'no_food', `A recruit costs ${RECRUIT_FOOD} food`);
    throw e;
  });
  return made.map((p) => p.id);
}

/** Put `uid` (from the home strongroom; null: take the slot's item off) on the soldier; the old item goes to the strongroom. */
export async function equip(db: D1Database, pid: number, id: string, slot: Slot, uid: string | null, now: number): Promise<void> {
  const r = await person(db, pid, id);
  home(r);
  const gear = json<Equipment>(r.gear, {});
  const stmts: D1PreparedStatement[] = [];
  let item: Item | null = null;
  if (uid) {
    const row = await db.prepare('SELECT item FROM war_items WHERE uid = ?1 AND player_id = ?2 AND place = ?3').bind(uid, pid, strongroom(pid)).first<{ item: string }>();
    if (!row) throw new ApiError(404, 'not_found', 'No such item in your strongroom');
    item = json<Item | null>(row.item, null);
    const def = item ? ITEMS[item.def] : undefined;
    if (!item || !def) throw new ApiError(409, 'bad_item', 'Unknown item');
    if (def.slot !== slot) throw new ApiError(409, 'wrong_slot', `${def.name} goes in the ${def.slot} slot`);
    const block = classGearBlocker(r.cls, def);
    if (block) throw new ApiError(409, 'class_gear', `A ${r.cls} cannot use ${def.name} (${block})`);
    stmts.push(db.prepare('DELETE FROM war_items WHERE uid = ?1 AND player_id = ?2 AND place = ?3').bind(uid, pid, strongroom(pid)));
  }
  const old = gear[slot];
  if (old) stmts.push(placeItemStmt(db, pid, strongroom(pid), old, now));
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

/** Dev: replace the player's soldiers at home with a full roster (a squad of `squad` and a reserve of `reserve`), plus food, DEV_COIN and strongroom gear. */
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
  const have = await goodsOf(db, strongroom(pid));
  const top = (res: string, n: number) => ((have[res] ?? 0) < n ? [putStmt(db, strongroom(pid), res, n - (have[res] ?? 0))] : []);
  await db.batch([
    db.prepare("DELETE FROM war_persons WHERE player_id = ?1 AND region IS NULL").bind(pid),
    ...top('food', START.food),
    ...top('coin', DEV_COIN),
    ...a.map((p, i) => insertPerson(db, pid, p, 'active', i, now)),
    ...b.map((p) => insertPerson(db, pid, p, 'reserve', null, now)),
    ...Object.values(spare.equip).filter((x): x is Item => !!x).map((it) => {
      const item = { ...it, uid: `${pid}-seed-${it.def}` };
      return db.prepare('INSERT OR IGNORE INTO war_items (uid, player_id, item, created_at, place) VALUES (?1, ?2, ?3, ?4, ?5)').bind(item.uid, pid, JSON.stringify(item), now, strongroom(pid));
    }),
  ]);
  return [...a, ...b].map((p) => p.id);
}

// ---------------------------------------------------------------- training, prisoners, retirement

/** Pay `n` coin from the player's home strongroom together with `with_` (one batch); false (nothing done) when he has too little. */
export async function payCoin(db: D1Database, pid: number, n: number, with_: D1PreparedStatement[] = []): Promise<boolean> {
  try {
    await payFrom(db, strongroom(pid), n > 0 ? { coin: n } : {}, with_);
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.code === 'no_coin') return false;
    throw e;
  }
}

/** n coin into the player's home strongroom. */
export const credit = (db: D1Database, pid: number, n: number) => putStmt(db, strongroom(pid), 'coin', n);
/** His old gear into his home strongroom. */
const stow = (db: D1Database, pid: number, items: Item[], now: number) => items.map((it) => placeItemStmt(db, pid, strongroom(pid), it, now));

/** The buildings of the player's towns that can train `cls` (M4 stub: the home camp's). */
export function trainsAt(cls: string): string[] {
  return Object.entries(TOWNS).filter(([, t]) => t.buildings.some((b) => TRAINS[b].includes(cls as ClassId))).map(([id]) => id);
}

/**
 * Send a fit man at home to train as `cls` (docs/WAR.md "Train"): a town he holds must train it (barracks, range), a
 * militiaman may take any class, a trained man only one of his family. Pays TRAIN.coin (the kit), puts his old gear in
 * the strongroom; he is `training` for TRAIN.ms and out of the squad. Returns when he is done.
 */
export async function train(db: D1Database, pid: number, id: string, cls: string, now: number): Promise<number> {
  await ensureStart(db, pid, now);
  await settle(db, pid, now);
  const r = await person(db, pid, id);
  home(r);
  if (!isClassId(cls) || !trainsAt(cls).length) throw new ApiError(409, 'no_training', `No town of yours trains ${cls}`);
  if (r.cls === cls) throw new ApiError(409, 'same_class', `He is a ${cls} already`);
  if (r.cls !== 'militia' && FAMILY_OF[r.cls as ClassId] !== FAMILY_OF[cls]) throw new ApiError(409, 'family', `A ${r.cls} trains only within his family`);
  const until = now + TRAIN.ms;
  const old = Object.values(json<Equipment>(r.gear, {})).filter((x): x is Item => !!x);
  const done = [
    ...stow(db, pid, old, now),
    db
      .prepare("UPDATE war_persons SET state = 'training', train_to = ?3, until_at = ?4, gear = '{}', slot = NULL, updated_at = ?5 WHERE id = ?1 AND player_id = ?2 AND region IS NULL")
      .bind(id, pid, cls, until, now),
  ];
  if (!(await payCoin(db, pid, TRAIN.coin, done))) throw new ApiError(409, 'no_coin', `A kit costs ${TRAIN.coin} coin`);
  return until;
}

/** Coin the elite rare kit of `cls` costs (its items' value). */
export function promoteCost(cls: ClassId): number {
  return Object.values(promotePerson(makePerson('kit', 'militia'), cls).hero.equip).reduce((a, it) => a + (it ? itemValue(it) : 0), 0);
}

/**
 * Promote a fit man at home to the elite `cls` (docs/WAR.md "Promote"): a town of his with a fortress, PROMOTE.level and
 * PROMOTE.honours, an elite of his family. Pays promoteCost (the elite rare kit), puts his old gear in the stash; he is
 * `training` for PROMOTE_MS and out of the squad, then the elite with the kit on (settle). Returns when he is done.
 */
export async function promote(db: D1Database, pid: number, id: string, cls: string, now: number): Promise<number> {
  await ensureStart(db, pid, now);
  await settle(db, pid, now);
  const r = await person(db, pid, id);
  home(r);
  if (!Object.values(TOWNS).some((t) => t.buildings.includes('fortress'))) throw new ApiError(409, 'no_fortress', 'You hold no town with a fortress');
  const why = promoteBlocker(personOf(r), cls);
  if (why || !isClassId(cls)) throw new ApiError(409, 'not_promotable', why ?? `${cls} is no class`);
  const price = promoteCost(cls);
  const until = now + PROMOTE_MS;
  const old = Object.values(json<Equipment>(r.gear, {})).filter((x): x is Item => !!x);
  const done = [
    ...stow(db, pid, old, now),
    db
      .prepare("UPDATE war_persons SET state = 'training', train_to = ?3, until_at = ?4, gear = '{}', slot = NULL, updated_at = ?5 WHERE id = ?1 AND player_id = ?2 AND region IS NULL")
      .bind(id, pid, cls, until, now),
  ];
  if (!(await payCoin(db, pid, price, done))) throw new ApiError(409, 'no_coin', `The ${cls} kit costs ${price} coin`);
  return until;
}

/** The owner pays the ransom of his captive (RANSOM_PER_LEVEL x level coin from his strongroom, into the captor's): he is home and fit. */
export async function payRansom(db: D1Database, pid: number, id: string, now: number): Promise<number> {
  await settle(db, pid, now);
  const r = await person(db, pid, id);
  if (r.state !== 'captive') throw new ApiError(409, 'not_captive', `He is ${r.state}`);
  const price = RANSOM_PER_LEVEL * r.level;
  const done = [
    db.prepare("UPDATE war_persons SET state = 'reserve', until_at = NULL, captor = NULL, captor_pid = NULL, held_at = NULL, held_fort = NULL, updated_at = ?3 WHERE id = ?1 AND player_id = ?2").bind(id, pid, now),
    ...(r.captor_pid !== null ? [credit(db, r.captor_pid, price)] : []),
  ];
  if (!(await payCoin(db, pid, price, done))) throw new ApiError(409, 'no_coin', `His ransom is ${price} coin`);
  return price;
}

/** The captor lets a captive he holds go (no ransom): the man walks home. */
export async function releaseCaptive(db: D1Database, captor: number, id: string, now: number): Promise<void> {
  const r = await db
    .prepare("UPDATE war_persons SET state = 'reserve', until_at = NULL, captor = NULL, captor_pid = NULL, held_at = NULL, held_fort = NULL, updated_at = ?3 WHERE id = ?1 AND captor_pid = ?2 AND state = 'captive'")
    .bind(id, captor, now)
    .run();
  if (!r.meta.changes) throw new ApiError(404, 'not_found', 'You hold no such captive');
}

/** Level a soldier must reach to retire into a civilian class, and the level he starts there. */
export const RETIRE_CIV = { from: 10, at: 5 };

/**
 * Retire a fit man at home (docs/WAR.md "Retire"): half his gear's value back as coin, his first honour on the
 * memorial; he leaves the roster (state retired). `civ`: a level-10 soldier becomes that civilian class at level 5
 * instead (within the household cap), with the class's first tool. Returns the coin paid back.
 */
export async function retire(db: D1Database, pid: number, id: string, civ: string | undefined, now: number): Promise<number> {
  await ensureStart(db, pid, now);
  await settle(db, pid, now);
  const r = await person(db, pid, id);
  home(r);
  if (isCivClass(r.cls)) throw new ApiError(409, 'civilian', 'Civilians do not retire');
  const gear = Object.values(json<Equipment>(r.gear, {})).filter((x): x is Item => !!x && !!ITEMS[x.def]);
  const refund = Math.floor(gear.reduce((a, it) => a + itemValue(it), 0) / 2);
  const honour = json<{ name: string }[]>(r.honours, [])[0]?.name;
  const stmts: D1PreparedStatement[] = [];
  if (civ !== undefined) {
    if (!isCivClass(civ)) throw new ApiError(400, 'bad_request', `${civ} is no civilian class`);
    if (r.level < RETIRE_CIV.from) throw new ApiError(409, 'level', `Only a level ${RETIRE_CIV.from} soldier retires into a trade`);
    const rows = await persons(db, pid);
    const fit = rows.filter((x) => (x.state === 'active' || x.state === 'reserve') && !isCivClass(x.cls) && x.id !== id).length;
    const household = rows.filter((x) => isCivClass(x.cls) && x.state !== 'dead').length;
    if (household >= householdCap(fit)) throw new ApiError(409, 'household_full', `Your household holds ${householdCap(fit)}`);
    const p = makePerson(id, civ, { level: RETIRE_CIV.at, name: r.name });
    stmts.push(
      db
        .prepare("UPDATE war_persons SET cls = ?3, level = ?4, xp = 0, points = ?5, attrs = ?6, skills = '[]', gear = ?7, state = 'reserve', slot = NULL, updated_at = ?8 WHERE id = ?1 AND player_id = ?2 AND region IS NULL")
        .bind(id, pid, civ, p.hero.level, p.hero.points, JSON.stringify(p.hero.attrs), JSON.stringify(p.hero.equip), now),
    );
  } else stmts.push(db.prepare("UPDATE war_persons SET state = 'retired', slot = NULL, gear = '{}', updated_at = ?3 WHERE id = ?1 AND player_id = ?2 AND region IS NULL").bind(id, pid, now));
  if (refund) stmts.push(credit(db, pid, refund));
  if (honour) stmts.push(db.prepare('INSERT INTO war_memorial (player_id, person_id, name, level, honour, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(pid, id, r.name, r.level, honour, now));
  await db.batch(stmts);
  return refund;
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

/** A captive goes free: home, wounded. */
const FREE = "state = 'wounded', until_at = ?2, captor = NULL, captor_pid = NULL, held_at = NULL, held_fort = NULL, updated_at = ?3";

/**
 * M5e: raids in `region` (the sim's `raid` events, at wall time `at`): the captives held at each raided building, taken
 * before it, go free, wounded (HEAL.field). Repeating it changes nothing. Returns how many went free.
 */
export async function freeRaided(db: D1Database, region: string, buildings: readonly number[], at: number): Promise<number> {
  if (!buildings.length) return 0;
  const res = await db
    .prepare(`UPDATE war_persons SET ${FREE} WHERE held_at = ?1 AND state = 'captive' AND held_fort IN (SELECT value FROM json_each(?4)) AND until_at <= ?5`)
    .bind(region, at + HEAL.field, at, JSON.stringify([...new Set(buildings)]), at + CAPTIVE_MS)
    .run();
  return res.meta.changes;
}

/** A fresh room (no saved state): nobody is in the field there any more, no item waits at its workplaces, and its forts are gone (their captives go free). */
export async function releaseRegion(db: D1Database, region: string, now = Date.now()): Promise<void> {
  await db.batch([
    db.prepare(`UPDATE war_persons SET ${FREE} WHERE held_at = ?1 AND state = 'captive' AND held_fort IS NOT NULL`).bind(region, now + HEAL.field, now),
    db.prepare('UPDATE war_persons SET region = NULL WHERE region = ?1').bind(region),
    db.prepare('UPDATE war_items SET region = NULL WHERE region = ?1').bind(region),
  ]);
}

/** Persons deployed in `region` by id (a resumed room respawns them). */
export async function deployed(db: D1Database, region: string, ids: string[]): Promise<Map<string, WarPerson>> {
  if (!ids.length) return new Map();
  const rows = (await db.prepare(`SELECT ${COLS} FROM war_persons WHERE region = ?1 AND state IN ('active', 'reserve') AND id IN (SELECT value FROM json_each(?2))`).bind(region, JSON.stringify(ids)).all<PersonRow>()).results;
  return new Map(rows.map((r) => [r.id, personOf(r)]));
}

export const ownerPid = (owner: string): number | null => {
  const m = /^p:(\d+)$/.exec(owner);
  return m ? Number(m[1]) : null;
};

/** The public war boards' tallies (war_player_stats) by `d`, added to the player's row of the running war season. */
export const addStats = (db: D1Database, pid: number, d: { kills?: number; fights?: number; wins?: number; honours?: number; bosses?: number }): D1PreparedStatement =>
  db
    .prepare(
      `INSERT INTO war_player_stats (season, player_id, kills, fights, wins, honours, bosses) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT (season, player_id) DO UPDATE SET kills = kills + ?3, fights = fights + ?4, wins = wins + ?5, honours = honours + ?6, bosses = bosses + ?7`,
    )
    .bind(WAR_SEASON.id, pid, d.kills ?? 0, d.fights ?? 0, d.wins ?? 0, d.honours ?? 0, d.bosses ?? 0);

/**
 * Each player's tallies of one fight: his men's kills and honours, one fight, and a win when some of his men walked
 * off fit and no man of another team did (mobs are not persons: a fight against beasts is won by surviving it).
 */
export function fightStats(db: D1Database, r: FightReport): D1PreparedStatement[] {
  const fitTeams = new Set(r.persons.filter((x) => x.state === 'fit').map((x) => x.team));
  const per = new Map<number, { team: number; kills: number; honours: number; fit: boolean }>();
  for (const x of r.persons) {
    const pid = ownerPid(x.owner);
    if (pid === null) continue;
    const s = per.get(pid) ?? { team: x.team, kills: 0, honours: 0, fit: false };
    s.kills += x.kills;
    if (x.honour && x.state !== 'dead' && x.state !== 'captive') s.honours++;
    if (x.state === 'fit') s.fit = true;
    per.set(pid, s);
  }
  return [...per].map(([pid, s]) => addStats(db, pid, { kills: s.kills, fights: 1, wins: s.fit && [...fitTeams].every((t) => t === s.team) ? 1 : 0, honours: s.honours }));
}

/**
 * Write a fight back (M5d FightReport) in one batch: XP, level and points, kills and battles for all; the wounded go
 * home to heal (HEAL.field), captives are held by the captor's alliance in this region (CAPTIVE_MS), the dead lose
 * their gear (M6c/M6e: it fell in a loot pile in the room, and what anyone picked up is in his pack there: nothing is
 * minted). The war_fights row comes first: a
 * second write of the same fight fails on its key and changes nothing. Returns false for a fight already written.
 */
export async function applyFight(db: D1Database, fightId: string, region: string, r: FightReport, now: number): Promise<boolean> {
  if (await db.prepare('SELECT 1 FROM war_fights WHERE id = ?1').bind(fightId).first()) return false;
  const stmts: D1PreparedStatement[] = [db.prepare('INSERT INTO war_fights (id, region, tick, persons, at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(fightId, region, r.tick, r.persons.length, now)];
  // the players of each team in the fight (lowest id first): a captive goes to the first of the captor's
  const byTeam = new Map<number, number[]>();
  for (const x of r.persons) {
    const pid = ownerPid(x.owner);
    if (pid === null) continue;
    const l = byTeam.get(x.team) ?? [];
    if (!l.includes(pid)) l.push(pid);
    byTeam.set(x.team, l);
  }
  for (const l of byTeam.values()) l.sort((a, b) => a - b);
  // upkeep up to now (at the rate before the fight); unpaid players' men earn no XP from it
  const unpaid = new Set<number>();
  for (const pid of new Set([...byTeam.values()].flat())) if ((await settleUpkeep(db, pid, now)).unpaid) unpaid.add(pid);
  // captives each fort holds already; one more past HOLD_MAX goes free
  const held = new Map<number, number>();
  for (const f of new Set(r.persons.map((x) => (x.state === 'captive' ? x.fort : undefined)).filter((f): f is number => f !== undefined)))
    held.set(f, (await db.prepare("SELECT COUNT(*) AS n FROM war_persons WHERE held_at = ?1 AND held_fort = ?2 AND state = 'captive'").bind(region, f).first<{ n: number }>())?.n ?? 0);
  const overHold = (f: number | undefined) => {
    if (f === undefined) return false;
    const n = (held.get(f) ?? 0) + 1;
    held.set(f, n);
    return n > HOLD_MAX;
  };
  for (const x of r.persons) {
    const pid = ownerPid(x.owner);
    if (pid === null) continue;
    const h = x.hero;
    // unpaid: level, xp and points stay (nullif(?n, ?n) is null: the params are still used)
    const xpCols = unpaid.has(pid) ? 'level = coalesce(nullif(?4, ?4), level), xp = coalesce(nullif(?5, ?5), xp), points = coalesce(nullif(?6, ?6), points), ' : 'level = ?4, xp = ?5, points = ?6, ';
    // a battle honour won: appended while he has fewer than HONOURS_MAX and none of that name (?17: the honour or null)
    const honourCol = `honours = CASE WHEN ?17 IS NOT NULL AND json_array_length(honours) < ${HONOURS_MAX} AND NOT EXISTS (SELECT 1 FROM json_each(honours) WHERE json_extract(value, '$.name') = json_extract(?17, '$.name')) THEN json_insert(honours, '$[#]', json(?17)) ELSE honours END`;
    const base = `cls = ?3, ${xpCols}kills = ?7, battles = ?8, attrs = ?9, gear = ?10, updated_at = ?11, ${honourCol}`;
    const honour = x.honour && x.state !== 'dead' && x.state !== 'captive' ? JSON.stringify(x.honour) : null;
    const base11 = [x.pid, pid, h.cls ?? 'militia', h.level, h.xp, h.points, h.kills, h.battles, JSON.stringify(h.attrs), JSON.stringify(x.state === 'dead' ? {} : h.equip), now];
    // ?1..?11 shared, ?12..?16 per state, ?17 the honour
    const bind = (...extra: unknown[]) => [...base11, ...extra, ...Array<null>(5 - extra.length).fill(null), honour];
    if (x.state === 'fit') stmts.push(db.prepare(`UPDATE war_persons SET ${base} WHERE id = ?1 AND player_id = ?2`).bind(...bind()));
    else if (x.state === 'wounded')
      stmts.push(db.prepare(`UPDATE war_persons SET ${base}, state = 'wounded', until_at = ?12, slot = NULL, region = NULL WHERE id = ?1 AND player_id = ?2`).bind(...bind(now + HEAL.field)));
    else if (x.state === 'captive' && !overHold(x.fort))
      stmts.push(
        db
          .prepare(`UPDATE war_persons SET ${base}, state = 'captive', until_at = ?12, captor = ?13, held_at = ?14, captor_pid = ?15, held_fort = ?16, slot = NULL, region = NULL WHERE id = ?1 AND player_id = ?2`)
          .bind(...bind(now + CAPTIVE_MS, x.captor ?? null, region, x.captor !== undefined ? (byTeam.get(x.captor)?.[0] ?? null) : null, x.fort ?? null)),
      );
    else if (x.state === 'captive') // the fort is full: he goes free, wounded
      stmts.push(db.prepare(`UPDATE war_persons SET ${base}, state = 'wounded', until_at = ?12, slot = NULL, region = NULL WHERE id = ?1 AND player_id = ?2`).bind(...bind(now + HEAL.field)));
    else stmts.push(db.prepare(`UPDATE war_persons SET ${base}, state = 'dead', until_at = NULL, slot = NULL, region = NULL WHERE id = ?1 AND player_id = ?2`).bind(...bind()));
  }
  stmts.push(...fightStats(db, r));
  try {
    await db.batch(stmts);
    return true;
  } catch (e) {
    if (/UNIQUE constraint failed: war_fights\.id/.test(String(e))) return false;
    throw e;
  }
}
