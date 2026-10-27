/**
 * War persons in D1 (M5e; docs/WAR.md "Soldiers"): the roster rules and every read and write of `war_persons`,
 * `war_items` and `war_fights` (migrations/0021_war_persons.sql). M6e: food and coin live in the player's home
 * strongroom (./holders.ts): captives' upkeep, promotion, ransom and retirement pay from it or into it.
 *
 *  - Army (W-58): at most ARMY_MAX fighters in total, counted across all regions (fit, wounded, captive, training); the
 *    dead and retired do not count. No reserve: a fit man is `active` (his `slot` only orders the squad picker). At the
 *    cap a claimed soul is refused.
 *  - Household: min(4, 1 + fit fighters / 4) civilians (M5f brings the classes).
 *  - Souls (W-60, replaces recruiting and training): a man joins only by a claimed soul in a region (claimSoul, the room
 *    and src/war/sim/souls.ts), of the class and level the soul woke with; the start squad (./start.ts) is the other way in.
 *  - Timers, read lazily: wounded heal after HEAL (field 6 h), captives walk home after CAPTIVE_MS (24 h), a promotion
 *    ends after PROMOTE_MS.
 *  - Promote (docs/WAR.md "Promote"): a fit trained man at home with PROMOTE.level and PROMOTE.honours becomes an elite of his family (src/war/sim/roster.ts promotesTo) in PROMOTE_MS; he pays the elite rare
 *    kit's value in silver, it goes on when he is done (his old gear to the stash). Elites cost UPKEEP.elite.
 *  - Prisoners: a captive is held by the player of the captor alliance who fought there (`captor_pid`); he pays the
 *    captive's upkeep and takes the ransom (RANSOM_PER_LEVEL x level silver) when the owner pays it; he may also let him go.
 *    A captor who cannot pay upkeep lets all his captives go. A captive is held at the captor's nearest fort or camp in
 *    the region (`held_fort`, the sim's building id; at most HOLD_MAX there, the rest go free, wounded); a raid reaching
 *    it or its fall (the sim's `raid` event, freeRaided) frees them all: home, wounded (HEAL.field).
 *  - Upkeep (docs/WAR.md "Anti-oversaturation"), settled lazily: food per hour for each captive held (UPKEEP). His own
 *    men eat in the field (W-60, src/war/sim/food.ts), from their packs and the stores. Unpaid: the player's wounded do
 *    not heal and his men earn no XP until it is paid.
 *  - Retire: a fit man at home leaves for good (frees his roster place); half his gear's value comes back as silver and
 *    his first honour goes on the memorial. A level-10 soldier may instead retire into a civilian class at level 5
 *    (household cap).
 *  - Deployment: a room claims persons for its region on join (`region`); while deployed the API leaves them alone and
 *    only the room's fight write-back changes them. Fight writes are one D1 batch keyed by the fight id (idempotent).
 */
import { ATTR_MAX, type AttrId, type Attrs } from '../../../src/data/perks';
import { CLASSES, isCivClass, isClassId, type ClassId } from '../../../src/data/classes';
import { itemValue, ITEMS, type Item, type Slot } from '../../../src/data/items';
import { classGearBlocker } from '../../../src/data/gearRules';
import { freeName } from '../../../src/data/names';
import type { Equipment, Hero } from '../../../src/data/units';
import { freshHero } from '../../../src/war/sim/classes';
import { freshCivilian } from '../../../src/war/sim/civilians';
import { isElite, makePerson, promoteBlocker, promotePerson, spendLevel, type PersonOpts, type SpendRefusal } from '../../../src/war/sim/roster';
import { legalSkills, SKILL_LEVELS } from '../../../src/war/sim/skills';
import { ARMY_MAX } from '../../../src/war/sim/soldiers';
import { HONOURS_MAX } from '../../../src/war/sim/honours';
import type { Deed, FightReport, HonourStat, WarPerson, WarSkillId } from '../../../src/war/types';
import { addDeeds, SCARS_MAX } from '../../../src/war/sim/deeds';
import { trophies, type Trophy } from './bosses';
import { ApiError } from '../errors';
import { STAT_SEASON } from './peace';
import { randomToken } from './store';
import { raiseBonus, settleTunnelFor, type TunnelView } from './raise';
import { fightFavourStmts, withFavour } from './favour';
import { batch, ensureHolder, goodsOf, HOME, itemsIn, lotsOf, pay as payFrom, placeItemStmt, planTake, putStmt, strongroom } from './holders';

export type PersonState = 'active' | 'wounded' | 'captive' | 'dead' | 'training' | 'retired';

const HOUR = 3_600_000;
/** Heal timers by where the wounded man lies (docs/WAR.md "Heal"); a fight's wounded heal in the field. */
export const HEAL = { field: 6 * HOUR, camp: 3 * HOUR, town: 2 * HOUR, physician: 1 * HOUR };
/** Captives walk home after this. */
export const CAPTIVE_MS = 24 * HOUR;
/** A new player's food (season start: START.food in his home strongroom, no coin, no goods). */
export const START = { food: 240 };
/** Dev seed (DEV_AUTH=1): coin topped up to this, to test the coin paths. */
export const DEV_COIN = 500;
/** Promotion to elite takes this long (at a fortress). */
export const PROMOTE_MS = 30 * 60_000;
/** Captives one fort or camp holds; past it the rest go free. */
export const HOLD_MAX = 20;
/** Ransom: coin per level of the captive. */
export const RANSOM_PER_LEVEL = 30;
/** Upkeep: food per hour each captive held (W-60: the player's own men eat in the field). */
export const UPKEEP = { captive: 1 };
/** Unpaid upkeep stops growing past this many hours of the player's rate. */
export const UPKEEP_DEBT_HOURS = 24;

/** Civilians a player may keep (docs/WAR.md "Household"). */
export function householdCap(fit: number): number {
  return Math.min(4, 1 + Math.floor(fit / 4));
}

export interface PersonRow {
  id: string; player_id: number; cls: string; name: string; level: number; xp: number; points: number; kills: number; battles: number;
  attrs: string; skills: string; gear: string; honours: string; state: PersonState; until_at: number | null; captor: number | null;
  held_at: string | null; slot: number | null; region: string | null; train_to: string | null; captor_pid: number | null;
  perks: string; respec_at: number | null; held_fort: number | null;
  /** E3 (0041): deeds JSON [{id, name}] and scars. */
  deeds: string; scars: number;
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
  const deeds = json<Deed[]>(r.deeds ?? '[]', []);
  return { id: r.id, hero, skills: json<WarSkillId[]>(r.skills, []), honours: json<{ name: string; stat: HonourStat }[]>(r.honours, []), ...(deeds.length ? { deeds } : {}), ...(r.scars ? { scars: r.scars } : {}) };
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
    deeds: p.deeds ?? [], scars: r.scars ?? 0,
    ...(r.state === 'captive' ? { ransom: RANSOM_PER_LEVEL * r.level } : {}),
  };
}

const COLS = 'id, player_id, cls, name, level, xp, points, kills, battles, attrs, skills, gear, honours, state, until_at, captor, held_at, slot, region, train_to, captor_pid, perks, respec_at, held_fort, deeds, scars';

/** The player's upkeep in food per hour: the captives he holds (W-60: his men eat in the field). */
export async function upkeepRate(db: D1Database, pid: number): Promise<number> {
  const held = await db.prepare("SELECT COUNT(*) AS n FROM war_persons WHERE captor_pid = ?1 AND state = 'captive'").bind(pid).first<{ n: number }>();
  return (held?.n ?? 0) * UPKEEP.captive;
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
      .prepare("UPDATE war_persons SET state = 'active', until_at = NULL, captor = NULL, captor_pid = NULL, held_at = NULL, held_fort = NULL, updated_at = ?2 WHERE captor_pid = ?1 AND state = 'captive'")
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
 * (active); captives whose 24 h are up walk home; a finished promotion: the elite, his rare kit on.
 */
export async function settle(db: D1Database, pid: number, now: number): Promise<void> {
  const { unpaid } = await settleUpkeep(db, pid, now);
  const states = unpaid ? "'captive'" : "'wounded', 'captive'";
  await db
    .prepare(`UPDATE war_persons SET state = 'active', until_at = NULL, captor = NULL, captor_pid = NULL, held_at = NULL, held_fort = NULL, updated_at = ?2 WHERE player_id = ?1 AND state IN (${states}) AND until_at <= ?2`)
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
        .prepare("UPDATE war_persons SET state = 'active', cls = ?3, gear = ?4, skills = ?5, train_to = NULL, until_at = NULL, updated_at = ?6 WHERE id = ?1 AND player_id = ?2 AND state = 'training'")
        .bind(r.id, pid, cls, JSON.stringify(elite ? reUid(elite.hero.equip, r.id, now) : kitOf(cls, r.id, now)), JSON.stringify(skills), now);
    }),
  );
}

export async function persons(db: D1Database, pid: number): Promise<PersonRow[]> {
  const r = await db.prepare(`SELECT ${COLS} FROM war_persons WHERE player_id = ?1 AND state != 'retired' ORDER BY state = 'dead', slot IS NULL, slot, created_at, id`).bind(pid).all<PersonRow>();
  return r.results;
}

/** Fighters (ARMY_MAX counts them, in every region): soldiers neither dead nor retired; civilians are the household. */
const isFighter = (r: PersonRow) => r.state !== 'dead' && r.state !== 'retired' && !isCivClass(r.cls);

export async function person(db: D1Database, pid: number, id: string): Promise<PersonRow> {
  const r = await db.prepare(`SELECT ${COLS} FROM war_persons WHERE id = ?1 AND player_id = ?2`).bind(id, pid).first<PersonRow>();
  if (!r) throw new ApiError(404, 'not_found', 'No such soldier');
  return r;
}

/** A person at home and fit: the API may change him. */
export function home(r: PersonRow): void {
  if (r.region) throw new ApiError(409, 'deployed', `He is in the field in ${r.region}`);
  if (r.state !== 'active') throw new ApiError(409, 'not_fit', `He is ${r.state}`);
}

/** Season start, once: START.food in the home strongroom (the strongroom row marks it done). */
export async function ensureStart(db: D1Database, pid: number, now: number): Promise<void> {
  const sr = strongroom(pid);
  await db.batch([
    db
      .prepare("INSERT INTO war_goods (place, res, origin, seal, amount) SELECT ?1, 'food', ?3, 0, ?2 WHERE NOT EXISTS (SELECT 1 FROM war_holders WHERE id = ?1) ON CONFLICT (place, res, origin, seal) DO UPDATE SET amount = amount + ?2")
      .bind(sr, START.food, HOME),
    ensureHolder(db, sr, 'strongroom', { pid }, now),
  ]);
}

export interface Roster {
  persons: ReturnType<typeof view>[];
  caps: { army: number; household: number; fighters: number; fit: number };
  /** The home strongroom: its goods (food, coin, ...) and items (equip from here). */
  stock: Record<string, number>;
  items: Item[];
  /** Captives the player holds (he pays their upkeep, takes their ransom). */
  captives: { id: string; name: string; cls: string; level: number; owner: number; ransom: number; until: number | null; heldAt: string | null }[];
  upkeep: { rate: number; owed: number; unpaid: boolean };
  /** E3: the home memorial (the fallen and the retired, newest first) and the guardians' trophies in the home town. */
  memorial: MemorialRow[];
  trophies: Trophy[];
  /** W-66: the Tunnel of Shades (./raise.ts): men alive against the floor, the next rise, how many are still to come. */
  tunnel: TunnelView;
}

/** E3: a grave (fallen) or an engraved honour (retired) on the player's home memorial. */
export interface MemorialRow { kind: 'fallen' | 'retired'; personId: string; name: string; cls: string; level: number; kills: number; battles: number; honour: string; deeds: Deed[]; region: string | null; at: number }

/** E3: the player's memorial, newest first (at most `limit`). */
export async function memorial(db: D1Database, pid: number, limit = 100): Promise<MemorialRow[]> {
  const r = await db
    .prepare('SELECT kind, person_id, name, cls, level, kills, battles, honour, deeds, region, at FROM war_memorial WHERE player_id = ?1 ORDER BY at DESC, id DESC LIMIT ?2')
    .bind(pid, limit)
    .all<{ kind: string; person_id: string; name: string; cls: string; level: number; kills: number; battles: number; honour: string; deeds: string; region: string | null; at: number }>();
  return r.results.map((x) => ({ kind: x.kind === 'fallen' ? 'fallen' : 'retired', personId: x.person_id, name: x.name, cls: x.cls, level: x.level, kills: x.kills, battles: x.battles, honour: x.honour, deeds: json<Deed[]>(x.deeds, []), region: x.region, at: x.at }));
}

export async function roster(db: D1Database, pid: number, now: number): Promise<Roster> {
  await ensureStart(db, pid, now);
  await settle(db, pid, now);
  const tunnel = await settleTunnelFor(db, pid, now); // W-66: the men the tunnel raised since the last read
  const up = await db.prepare('SELECT owed, unpaid FROM war_upkeep WHERE player_id = ?1').bind(pid).first<{ owed: number; unpaid: number }>();
  const [rows, stock, items, held, rate, mem, troph] = await Promise.all([
    persons(db, pid),
    goodsOf(db, strongroom(pid)),
    itemsIn(db, strongroom(pid)),
    db.prepare(`SELECT ${COLS} FROM war_persons WHERE captor_pid = ?1 AND state = 'captive' ORDER BY until_at, id`).bind(pid).all<PersonRow>(),
    upkeepRate(db, pid),
    memorial(db, pid),
    trophies(db, pid),
  ]);
  const fighters = rows.filter(isFighter).length;
  const fit = rows.filter((r) => r.state === 'active').length;
  return {
    persons: rows.map(view),
    caps: { army: ARMY_MAX, household: householdCap(fit), fighters, fit },
    stock,
    items,
    captives: held.results.map((r) => ({ id: r.id, name: r.name, cls: r.cls, level: r.level, owner: r.player_id, ransom: RANSOM_PER_LEVEL * r.level, until: r.until_at, heldAt: r.held_at })),
    upkeep: { rate, owed: +(up?.owed ?? 0).toFixed(2), unpaid: !!up?.unpaid },
    memorial: mem,
    trophies: troph,
    tunnel,
  };
}

export const newId = (pid: number) => `w${pid}-${randomToken(5)}`;

export function insertPerson(db: D1Database, pid: number, p: WarPerson, state: PersonState, slot: number | null, now: number): D1PreparedStatement {
  const h = p.hero;
  return db
    .prepare(
      `INSERT INTO war_persons (id, player_id, cls, name, level, xp, points, kills, battles, attrs, skills, gear, honours, state, slot, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16)`,
    )
    .bind(p.id, pid, h.cls ?? 'militia', h.name, h.level, h.xp, h.points, h.kills, h.battles, JSON.stringify(h.attrs), JSON.stringify(p.skills ?? []), JSON.stringify(h.equip), JSON.stringify(p.honours ?? []), state, slot, now);
}

/** A fresh name of the class's first culture that no living soldier of the player has. */
export function nameFor(cls: string, taken: Set<string>, k: number): string {
  const c = CLASSES[isClassId(cls) ? cls : 'militia'].cultures[0] ?? 'greek';
  const n = freeName(c, k, taken);
  taken.add(n);
  return n;
}

/** The player's fighters now, counted across all regions (ARMY_MAX bounds them; W-58). */
export async function armyCount(db: D1Database, pid: number): Promise<number> {
  const r = await db
    .prepare(`SELECT COUNT(*) AS n FROM war_persons WHERE player_id = ?1 AND state NOT IN ('dead', 'retired') AND cls NOT LIKE 'civ\\_%' ESCAPE '\\'`)
    .bind(pid)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

/**
 * An insert of a new man, active, in `region` (null: at home), only while the player has fewer than `cap` fighters,
 * checked in the insert itself (two writers at once cannot pass it); a run with no change: refused.
 */
export function insertCapped(db: D1Database, pid: number, p: WarPerson, region: string | null, cap: number, now: number): D1PreparedStatement {
  const h = p.hero;
  return db
    .prepare(
      `INSERT INTO war_persons (id, player_id, cls, name, level, xp, points, kills, battles, attrs, skills, gear, honours, state, slot, region, created_at, updated_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 0, ?8, ?9, ?10, '[]', 'active', NULL, ?11, ?12, ?12
       WHERE (SELECT COUNT(*) FROM war_persons WHERE player_id = ?2 AND state NOT IN ('dead', 'retired') AND cls NOT LIKE 'civ\\_%' ESCAPE '\\') < ?13
       ON CONFLICT (id) DO NOTHING`,
    )
    .bind(p.id, pid, h.cls ?? 'militia', h.name, h.level, h.xp, h.points, JSON.stringify(h.attrs), JSON.stringify(p.skills ?? []), JSON.stringify(h.equip), region, now, cap);
}

/**
 * W-60: a soul the player's squad claimed in `region` (src/war/sim/souls.ts) becomes his man there: active, deployed in
 * that region, the class and level he woke with (W-66: plus ./raise.ts raiseBonus). Only while the player has fewer than
 * ARMY_MAX fighters, checked in the insert itself (two regions claiming at once cannot pass the cap); false: refused
 * (the army is full), nothing written.
 */
export async function claimSoul(db: D1Database, pid: number, p: WarPerson, region: string, now: number): Promise<boolean> {
  Object.assign(p, withFavour(p, await raiseBonus(db, pid))); // W-66: his player's favour bonus (the DO hands the live man the same)
  const r = await insertCapped(db, pid, p, region, ARMY_MAX, now).run();
  return (r.meta?.changes ?? 0) > 0;
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

/** A level-up on a man in a region reaches his living man in its room (wired by ./regionDO.ts wirePresence; tests: absent). */
export const LIVE: { levelUp: (region: string, id: string, attrs: Partial<Record<AttrId, number>>, skill: WarSkillId | undefined) => Promise<string> } = { levelUp: async () => 'absent' };

const SPEND_REFUSED: Record<SpendRefusal, (p: WarPerson, skill?: WarSkillId) => string> = {
  attr_max: () => `An attribute is at most ${ATTR_MAX}`,
  no_points: (p) => `${p.hero.points} points to spend`,
  bad_skill: (_p, skill) => `${skill} is not open to him now`,
};

/**
 * Spend unspent attribute points and / or take a skill in an open slot (levels 3 and 7, the family pool). A fit man in
 * a region (every man stands in one, W-58) takes it there too: his living man in the room, whose next fight report
 * writes the attributes and points back.
 */
export async function levelUp(db: D1Database, pid: number, id: string, attrs: Partial<Record<AttrId, number>>, skill: WarSkillId | undefined, now: number): Promise<void> {
  const r = await person(db, pid, id);
  if (r.state !== 'active') throw new ApiError(409, 'not_fit', `He is ${r.state}`);
  const p = personOf(r), q = spendLevel(p, attrs, skill);
  if (typeof q === 'string') throw new ApiError(409, q, SPEND_REFUSED[q](p, skill));
  if (r.region) {
    const live = await LIVE.levelUp(r.region, id, attrs, skill);
    if (live !== 'ok' && live !== 'absent') throw new ApiError(409, live, live in SPEND_REFUSED ? SPEND_REFUSED[live as SpendRefusal](p, skill) : 'refused');
  }
  await db
    .prepare('UPDATE war_persons SET attrs = ?3, points = ?4, skills = ?5, updated_at = ?6 WHERE id = ?1 AND player_id = ?2')
    .bind(id, pid, JSON.stringify(q.hero.attrs), q.hero.points, JSON.stringify(q.skills ?? []), now)
    .run();
}

/** The squad order, in slot order: these take slots 0..; every other fit man at home loses his slot. */
export async function formSquad(db: D1Database, pid: number, ids: string[], now: number): Promise<void> {
  if (new Set(ids).size !== ids.length) throw new ApiError(400, 'bad_request', 'A soldier stands in one slot');
  if (ids.length > ARMY_MAX) throw new ApiError(409, 'squad_full', `A squad is at most ${ARMY_MAX}`);
  await settle(db, pid, now);
  const rows = await persons(db, pid);
  const by = new Map(rows.map((r) => [r.id, r]));
  for (const id of ids) {
    const r = by.get(id);
    if (!r) throw new ApiError(404, 'not_found', `No soldier ${id}`);
    home(r);
  }
  await db.batch([
    db.prepare("UPDATE war_persons SET slot = NULL, updated_at = ?2 WHERE player_id = ?1 AND state = 'active' AND region IS NULL").bind(pid, now),
    ...ids.map((id, slot) => db.prepare("UPDATE war_persons SET slot = ?3, updated_at = ?4 WHERE id = ?1 AND player_id = ?2").bind(id, pid, slot, now)),
  ]);
}

/**
 * Dev: replace the player's men at home with `squad` (soldiers and civilians, in slot order; default a whole army of
 * hoplites and archers), plus food, DEV_COIN and strongroom gear. His fighters in the field count toward ARMY_MAX.
 */
export async function seed(db: D1Database, pid: number, now: number, o: { squad?: { cls: string; level?: number }[] } = {}): Promise<string[]> {
  await ensureStart(db, pid, now);
  const deployed = (await persons(db, pid)).filter((r) => r.region && isFighter(r)).length;
  const squad = o.squad ?? Array.from({ length: ARMY_MAX }, (_, i) => (i < ARMY_MAX - 4 ? { cls: 'hoplite', level: 1 + (i % 6) } : { cls: 'archer', level: 1 + (i % 4) }));
  const fighters = squad.filter((g) => !isCivClass(g.cls)).length;
  if (deployed + fighters > ARMY_MAX) throw new ApiError(409, 'army_full', `Your army is at most ${ARMY_MAX} men (${deployed} in the field)`);
  const taken = new Set<string>();
  const make = (g: { cls: string; level?: number }, k: number) => {
    const opts: PersonOpts = { level: g.level ?? 1, tier: (g.level ?? 1) >= 6 ? 1 : 0 };
    const p = makePerson(newId(pid), g.cls, opts);
    return { ...p, hero: { ...p.hero, name: nameFor(g.cls, taken, k) } };
  };
  const a = squad.map(make);
  const spare = freshHero('hoplite', 'stash');
  const have = await goodsOf(db, strongroom(pid));
  const top = (res: string, n: number) => ((have[res] ?? 0) < n ? [putStmt(db, strongroom(pid), res, n - (have[res] ?? 0))] : []);
  await db.batch([
    db.prepare("DELETE FROM war_persons WHERE player_id = ?1 AND region IS NULL").bind(pid),
    ...top('food', START.food),
    ...top('coin', DEV_COIN),
    ...a.map((p, i) => insertPerson(db, pid, p, 'active', i, now)),
    ...Object.values(spare.equip).filter((x): x is Item => !!x).map((it) => {
      const item = { ...it, uid: `${pid}-seed-${it.def}` };
      return db.prepare('INSERT OR IGNORE INTO war_items (uid, player_id, item, created_at, place) VALUES (?1, ?2, ?3, ?4, ?5)').bind(item.uid, pid, JSON.stringify(item), now, strongroom(pid));
    }),
  ]);
  return a.map((p) => p.id);
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

/** Coin the elite rare kit of `cls` costs (its items' value). */
export function promoteCost(cls: ClassId): number {
  return Object.values(promotePerson(makePerson('kit', 'militia'), cls).hero.equip).reduce((a, it) => a + (it ? itemValue(it) : 0), 0);
}

/**
 * Promote a fit man at home to the elite `cls` (docs/WAR.md "Promote"): PROMOTE.level and PROMOTE.honours, an elite of
 * his family. Pays promoteCost (the elite rare kit), puts his old gear in the stash; he is
 * `training` for PROMOTE_MS and out of the squad, then the elite with the kit on (settle). Returns when he is done.
 */
export async function promote(db: D1Database, pid: number, id: string, cls: string, now: number): Promise<number> {
  await ensureStart(db, pid, now);
  await settle(db, pid, now);
  const r = await person(db, pid, id);
  home(r);
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
    db.prepare("UPDATE war_persons SET state = 'active', until_at = NULL, captor = NULL, captor_pid = NULL, held_at = NULL, held_fort = NULL, updated_at = ?3 WHERE id = ?1 AND player_id = ?2").bind(id, pid, now),
    ...(r.captor_pid !== null ? [credit(db, r.captor_pid, price)] : []),
  ];
  if (!(await payCoin(db, pid, price, done))) throw new ApiError(409, 'no_coin', `His ransom is ${price} coin`);
  return price;
}

/** The captor lets a captive he holds go (no ransom): the man walks home. */
export async function releaseCaptive(db: D1Database, captor: number, id: string, now: number): Promise<void> {
  const r = await db
    .prepare("UPDATE war_persons SET state = 'active', until_at = NULL, captor = NULL, captor_pid = NULL, held_at = NULL, held_fort = NULL, updated_at = ?3 WHERE id = ?1 AND captor_pid = ?2 AND state = 'captive'")
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
    const fit = rows.filter((x) => x.state === 'active' && !isCivClass(x.cls) && x.id !== id).length;
    const household = rows.filter((x) => isCivClass(x.cls) && x.state !== 'dead').length;
    if (household >= householdCap(fit)) throw new ApiError(409, 'household_full', `Your household holds ${householdCap(fit)}`);
    const p = makePerson(id, civ, { level: RETIRE_CIV.at, name: r.name });
    stmts.push(
      db
        .prepare("UPDATE war_persons SET cls = ?3, level = ?4, xp = 0, points = ?5, attrs = ?6, skills = '[]', gear = ?7, state = 'active', slot = NULL, updated_at = ?8 WHERE id = ?1 AND player_id = ?2 AND region IS NULL")
        .bind(id, pid, civ, p.hero.level, p.hero.points, JSON.stringify(p.hero.attrs), JSON.stringify(p.hero.equip), now),
    );
  } else stmts.push(db.prepare("UPDATE war_persons SET state = 'retired', slot = NULL, gear = '{}', updated_at = ?3 WHERE id = ?1 AND player_id = ?2 AND region IS NULL").bind(id, pid, now));
  if (refund) stmts.push(credit(db, pid, refund));
  if (honour)
    stmts.push(
      db
        .prepare("INSERT INTO war_memorial (player_id, person_id, name, level, honour, at, kind, cls, kills, battles, deeds) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'retired', ?7, ?8, ?9, ?10)")
        .bind(pid, id, r.name, r.level, honour, now, r.cls, r.kills, r.battles, r.deeds ?? '[]'),
    );
  await db.batch(stmts);
  return refund;
}

// ---------------------------------------------------------------- the region rooms

/**
 * Claim persons for a join into `region`: every id must be the player's, fit (active) and at home (or
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
    if (r.state !== 'active') return `${r.name} is ${r.state}`;
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
  const rows = (await db.prepare(`SELECT ${COLS} FROM war_persons WHERE region = ?1 AND state = 'active' AND id IN (SELECT value FROM json_each(?2))`).bind(region, JSON.stringify(ids)).all<PersonRow>()).results;
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
      `INSERT INTO war_player_stats (season, player_id, kills, fights, wins, honours, bosses) VALUES (COALESCE(?1, ${STAT_SEASON}), ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT (season, player_id) DO UPDATE SET kills = kills + ?3, fights = fights + ?4, wins = wins + ?5, honours = honours + ?6, bosses = bosses + ?7`,
    )
    .bind(null, pid, d.kills ?? 0, d.fights ?? 0, d.wins ?? 0, d.honours ?? 0, d.bosses ?? 0);

/**
 * Each player's tallies of one fight: his men's kills and honours, one fight, and a win when some of his men walked
 * off fit and no man of another team did (mobs are not persons: a fight against beasts is won by surviving it).
 */
export function fightStats(db: D1Database, r: FightReport): D1PreparedStatement[] {
  return [...fightTally(r)].map(([pid, s]) => addStats(db, pid, { kills: s.kills, fights: 1, wins: s.win ? 1 : 0, honours: s.honours }));
}

/** Those tallies by player (also E7's task tallies, ./tasks.ts). */
export function fightTally(r: FightReport): Map<number, { kills: number; honours: number; win: boolean }> {
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
  return new Map([...per].map(([pid, s]) => [pid, { kills: s.kills, honours: s.honours, win: s.fit && [...fitTeams].every((t) => t === s.team) }]));
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
  // E3: each man's deeds and scars so far (his fresh ones merge in; a grave takes them all)
  const recs = new Map(
    (await db.prepare('SELECT id, name, deeds, scars, honours FROM war_persons WHERE id IN (SELECT value FROM json_each(?1))').bind(JSON.stringify(r.persons.map((x) => x.pid))).all<{ id: string; name: string; deeds: string; scars: number; honours: string }>()).results.map((x) => [x.id, x]),
  );
  for (const x of r.persons) {
    const pid = ownerPid(x.owner);
    if (pid === null) continue;
    const h = x.hero;
    const rec = recs.get(x.pid), deeds = addDeeds(json<Deed[]>(rec?.deeds ?? '[]', []), x.deeds ?? []).all;
    const scars = Math.min(SCARS_MAX, (rec?.scars ?? 0) + (x.scar ? 1 : 0));
    // unpaid: level, xp and points stay (nullif(?n, ?n) is null: the params are still used)
    const xpCols = unpaid.has(pid) ? 'level = coalesce(nullif(?4, ?4), level), xp = coalesce(nullif(?5, ?5), xp), points = coalesce(nullif(?6, ?6), points), ' : 'level = ?4, xp = ?5, points = ?6, ';
    // a battle honour won: appended while he has fewer than HONOURS_MAX and none of that name (?17: the honour or null)
    const honourCol = `honours = CASE WHEN ?17 IS NOT NULL AND json_array_length(honours) < ${HONOURS_MAX} AND NOT EXISTS (SELECT 1 FROM json_each(honours) WHERE json_extract(value, '$.name') = json_extract(?17, '$.name')) THEN json_insert(honours, '$[#]', json(?17)) ELSE honours END`;
    const base = `cls = ?3, ${xpCols}kills = ?7, battles = ?8, attrs = ?9, gear = ?10, updated_at = ?11, ${honourCol}, deeds = ?18, scars = ?19`;
    const honour = x.honour && x.state !== 'dead' && x.state !== 'captive' ? JSON.stringify(x.honour) : null;
    const base11 = [x.pid, pid, h.cls ?? 'militia', h.level, h.xp, h.points, h.kills, h.battles, JSON.stringify(h.attrs), JSON.stringify(x.state === 'dead' ? {} : h.equip), now];
    // ?1..?11 shared, ?12..?16 per state, ?17 the honour, ?18 his deeds, ?19 his scars
    const bind = (...extra: unknown[]) => [...base11, ...extra, ...Array<null>(5 - extra.length).fill(null), honour, JSON.stringify(deeds), scars];
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
    else {
      stmts.push(db.prepare(`UPDATE war_persons SET ${base}, state = 'dead', until_at = NULL, slot = NULL, region = NULL WHERE id = ?1 AND player_id = ?2`).bind(...bind()));
      // E3: he stays dead; his grave on the home memorial, with his name and deeds
      const first = json<{ name: string }[]>(rec?.honours ?? '[]', [])[0]?.name ?? '';
      stmts.push(
        db
          .prepare("INSERT INTO war_memorial (player_id, person_id, name, level, honour, at, kind, cls, kills, battles, deeds, region) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'fallen', ?7, ?8, ?9, ?10, ?11)")
          .bind(pid, x.pid, h.name || rec?.name || '', h.level, first, now, h.cls ?? 'militia', h.kills, h.battles, JSON.stringify(deeds), region),
      );
    }
  }
  stmts.push(...fightStats(db, r));
  stmts.push(...fightFavourStmts(db, r, now)); // W-66 divine favour
  try {
    await db.batch(stmts);
    return true;
  } catch (e) {
    if (/UNIQUE constraint failed: war_fights\.id/.test(String(e))) return false;
    throw e;
  }
}
