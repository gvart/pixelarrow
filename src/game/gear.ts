/**
 * Pure logic behind the army, hero and stash screens (no Phaser): which stats
 * a character sheet shows, what equipping an item would change (the compare
 * popup's green / red deltas), stash filters and sorting, roster sorting,
 * stars and power rating. Unit-tested in tests/gear.test.ts.
 */
import { itemDef, itemMods, itemValue, normalizeRarity, rarityRank, SLOTS, type Item, type ItemDef, type Rarity, type Slot, type StatMods, type WeaponKind } from '../data/items';
import type { Equipment, Hero } from '../data/units';
import { perkSlots } from '../data/perks';
import { classGearBlocker, type ClassGearBlock } from '../data/gearRules';
import { computeStats, heroClass, heroPower, type CombatStats } from '../sim/stats';

// ------------------------------------------------------------------ stats shown on a sheet

export type StatId = 'hp' | 'dmg' | 'ranged' | 'armor' | 'block' | 'morale' | 'stamina' | 'speed' | 'accuracy' | 'reach' | 'range' | 'atkTime' | 'ko';

export interface StatDef {
  id: StatId;
  get: (s: CombatStats) => number;
  /** Decimal places shown. */
  dp: number;
  /** Bar scale (a full bar). */
  max: number;
  /** Smaller is better (attack time). */
  lowerIsBetter?: boolean;
  /** Shown as a percentage (value already x100). */
  pct?: boolean;
}

export const STATS: Record<StatId, StatDef> = {
  hp: { id: 'hp', get: (s) => s.maxHp, dp: 0, max: 140 },
  dmg: { id: 'dmg', get: (s) => s.dmg, dp: 1, max: 24 },
  ranged: { id: 'ranged', get: (s) => s.rangedDmg, dp: 1, max: 20 },
  armor: { id: 'armor', get: (s) => s.armor, dp: 1, max: 16 },
  block: { id: 'block', get: (s) => s.block * 100, dp: 0, max: 80, pct: true },
  morale: { id: 'morale', get: (s) => s.morale, dp: 0, max: 140 },
  stamina: { id: 'stamina', get: (s) => s.stamina, dp: 0, max: 180 },
  speed: { id: 'speed', get: (s) => s.speed, dp: 2, max: 4.5 },
  accuracy: { id: 'accuracy', get: (s) => s.accuracy * 100, dp: 0, max: 100, pct: true },
  reach: { id: 'reach', get: (s) => s.reach, dp: 1, max: 3 },
  range: { id: 'range', get: (s) => s.range, dp: 1, max: 18 },
  atkTime: { id: 'atkTime', get: (s) => s.atkTime, dp: 2, max: 2.2, lowerIsBetter: true },
  ko: { id: 'ko', get: (s) => s.koChance * 100, dp: 0, max: 100, pct: true },
};

/** Carries missiles (a trait's +range alone does not make a shooter). */
export const shoots = (s: CombatStats): boolean => s.range > 0 && s.ammo > 0 && s.rangedDmg > 0;

/** The stats a hero's sheet lists (ranged ones only for missile troops). */
export function sheetStats(s: CombatStats): StatId[] {
  const out: StatId[] = ['hp', 'dmg'];
  if (shoots(s)) out.push('ranged');
  out.push('armor', 'block', 'morale', 'stamina', 'speed', 'accuracy', shoots(s) ? 'range' : 'reach', 'atkTime', 'ko');
  return out;
}

export function fmtStat(id: StatId, v: number): string {
  const d = STATS[id];
  const s = d.dp === 0 ? `${Math.round(v)}` : v.toFixed(d.dp).replace(/\.?0+$/, '') || '0';
  return d.pct ? `${s}%` : s;
}

export interface StatDelta {
  id: StatId;
  cur: number;
  next: number;
  delta: number;
  /** True when the change is an improvement, false when worse, null when unchanged. */
  better: boolean | null;
}

const EPS = 0.004;

/** Stat by stat difference between two stat blocks (only `ids`, default: every sheet stat of either). */
export function statDeltas(cur: CombatStats, next: CombatStats, ids?: StatId[]): StatDelta[] {
  const list = ids ?? [...new Set([...sheetStats(cur), ...sheetStats(next)])];
  return list.map((id) => {
    const d = STATS[id];
    const a = d.get(cur);
    const b = d.get(next);
    const delta = b - a;
    const better = Math.abs(delta) <= EPS ? null : (delta > 0) !== !!d.lowerIsBetter;
    return { id, cur: a, next: b, delta, better };
  });
}

/** Only the stats that change. */
export function changedDeltas(cur: CombatStats, next: CombatStats): StatDelta[] {
  return statDeltas(cur, next).filter((d) => d.better !== null);
}

/**
 * Why `h` may not equip `item` (docs/ITEMS.md "Class limits"): 'weapon',
 * 'shield' or 'armor' when his class does not use that kind, 'none' when the
 * class wears no gear (animals). Null when he may.
 */
export function equipBlocker(h: Pick<Hero, 'cls' | 'arch' | 'culture' | 'equip'>, item: Pick<Item, 'def'>): ClassGearBlock | null {
  return classGearBlocker(heroClass(h as Hero).id, itemDef(item.def));
}

/** One line for an equip refusal. */
export function equipBlockerText(block: ClassGearBlock): string {
  return block === 'none' ? 'This hero wears no gear' : `This class cannot use this ${block === 'armor' ? 'armour' : block}`;
}

/** Sum of one stat over everything a hero wears (rarity, random stats and requirement penalty applied). */
export function gearTotal(h: Pick<Hero, 'equip' | 'attrs'>, key: keyof StatMods): number {
  let sum = 0;
  for (const slot of SLOTS) {
    const it = h.equip[slot];
    if (it) sum += itemMods(it, h.attrs)[key] ?? 0;
  }
  return sum;
}

// ------------------------------------------------------------------ equipping

/**
 * Put `item` in its slot of `equip` (mutates). Two-handed weapons and shields
 * exclude each other. Returns what was taken off, in stash order: the old item
 * in that slot first, then a shield or two-hander the new item displaced.
 */
export function equipInto(equip: Equipment, item: Item): Item[] {
  const def = itemDef(item.def);
  const slot = def.slot;
  const out: Item[] = [];
  const prev = equip[slot];
  if (prev) out.push(prev);
  equip[slot] = item;
  if (slot === 'weapon' && def.twoHanded && equip.shield) {
    out.push(equip.shield);
    delete equip.shield;
  }
  if (slot === 'shield' && equip.weapon && itemDef(equip.weapon.def).twoHanded) {
    out.push(equip.weapon);
    delete equip.weapon;
  }
  return out;
}

// ------------------------------------------------------------------ who would use an item

/** The weapon kinds a hero fights with: every weapon of his class kit, and the one in his hand. */
export function heroWeaponKinds(h: Hero): Set<WeaponKind> {
  const out = new Set<WeaponKind>();
  for (const tier of heroClass(h).kit.weapon ?? []) for (const id of tier) if (id) {
    const k = itemDef(id).weaponKind;
    if (k) out.add(k);
  }
  const held = h.equip.weapon ? itemDef(h.equip.weapon.def).weaponKind : undefined;
  if (held) out.add(held);
  return out;
}

/**
 * Whether a hero would actually equip an item (compare lines, "best in
 * team"): a weapon of a kind he fights with (a spear for a spearman, never
 * for an archer); a shield only beside a one-handed weapon and when his class
 * carries one; helmets, armour and trinkets fit everyone. Never an item his
 * class may not equip (docs/ITEMS.md "Class limits"), when `def` is a full
 * item definition.
 */
export function heroUses(h: Hero, def: Pick<ItemDef, 'slot' | 'weaponKind'> & Partial<ItemDef>): boolean {
  if (def.id && equipBlocker(h, { def: def.id })) return false;
  if (def.slot === 'weapon') return !!def.weaponKind && heroWeaponKinds(h).has(def.weaponKind);
  if (def.slot === 'shield') {
    const held = h.equip.weapon ? itemDef(h.equip.weapon.def) : null;
    if (held?.twoHanded) return false;
    if (h.equip.shield) return true;
    return (heroClass(h).kit.shield ?? []).some((tier) => tier.some((id) => !!id));
  }
  return true;
}

/**
 * Who an item is compared against: the heroes who would use it, those already
 * holding the same weapon kind first (a spear against a spear). Empty when no
 * one in `heroes` would.
 */
export function compareCandidates(heroes: readonly Hero[], def: Pick<ItemDef, 'slot' | 'weaponKind'>): Hero[] {
  const users = heroes.filter((h) => heroUses(h, def));
  if (def.slot !== 'weapon') return users;
  const same = users.filter((h) => h.equip.weapon && itemDef(h.equip.weapon.def).weaponKind === def.weaponKind);
  return same.length ? same : users;
}

/** Take what `equip` carries in `slot` off into `stash` (mutates both); returns it, or undefined if the slot was empty. */
export function unequipInto(equip: Equipment, slot: Slot, stash: Item[]): Item | undefined {
  const prev = equip[slot];
  if (!prev) return undefined;
  stash.push(prev);
  delete equip[slot];
  return prev;
}

/** Equip `stash[index]` on `equip`, moving whatever it displaces back into `stash` (mutates both). Returns the item. */
export function equipFromStash(equip: Equipment, stash: Item[], index: number): Item {
  const [item] = stash.splice(index, 1);
  stash.push(...equipInto(equip, item));
  return item;
}

// ------------------------------------------------------------------ equip previews

/** The hero as he would be with `item` equipped (two-handers drop the shield and vice versa). */
export function previewEquip(h: Hero, it: Item): Hero {
  const clone: Hero = { ...h, equip: { ...h.equip } };
  equipInto(clone.equip, it);
  return clone;
}

/** The hero without what he carries in `slot`. */
export function previewUnequip(h: Hero, slot: Slot): Hero {
  const clone: Hero = { ...h, equip: { ...h.equip } };
  delete clone.equip[slot];
  return clone;
}

/** Hero attributes raised by `pending` points (the stats tab's live preview). */
export function previewAttrs(h: Hero, pending: Partial<Hero['attrs']>): Hero {
  const attrs = { ...h.attrs };
  for (const k of Object.keys(pending) as (keyof Hero['attrs'])[]) attrs[k] += pending[k] ?? 0;
  return { ...h, attrs };
}

export interface Comparison {
  /** What the hero carries in the item's slot now (if anything). */
  equipped: Item | undefined;
  /** Items the swap would also take off (a shield for a two-hander...). */
  displaced: Item[];
  deltas: StatDelta[];
  /** Power rating before and after. */
  power: [number, number];
}

/** What equipping `item` would do to `hero`: the compare popup. */
export function compareItem(h: Hero, item: Item): Comparison {
  const def = itemDef(item.def);
  const next = previewEquip(h, item);
  const displaced = SLOTS.filter((s) => s !== def.slot && h.equip[s] && !next.equip[s]).map((s) => h.equip[s]!);
  return {
    equipped: h.equip[def.slot],
    displaced,
    deltas: statDeltas(computeStats(h), computeStats(next)),
    power: [powerRating(h), powerRating(next)],
  };
}

// ------------------------------------------------------------------ item stat lines

/** Order and dp of item modifiers on an item card. */
const MOD_ORDER: [keyof StatMods, number, boolean?][] = [
  ['dmg', 1], ['rangedDmg', 1], ['range', 1], ['reach', 2], ['atkTime', 2], ['shotTime', 2], ['ammo', 0], ['accuracy', 0, true], ['block', 0, true],
  ['blockPierce', 0, true], ['armorPierce', 0, true], ['armor', 1], ['hp', 0], ['morale', 0], ['stamina', 0], ['speed', 0, true],
  ['chargeBonus', 2], ['moraleShock', 2], ['atkSpeed', 0, true], ['steady', 0, true], ['xpBonus', 0, true], ['koChance', 0, true],
  ['goldBonus', 0, true], ['durable', 0, true],
];

export interface ModLine {
  key: keyof StatMods;
  value: number;
  /** Formatted with sign and unit, e.g. "+8.5", "-7%". */
  text: string;
  /** Positive effect for the wearer (attack / shot time are better when lower, but are base values, not bonuses). */
  good: boolean;
}

/** The modifiers of an item instance (rarity, condition, random stats and, with the wearer's attributes, the requirement penalty), for its card. */
export function itemModLines(it: Item, attrs?: Hero['attrs']): ModLine[] {
  const m = itemMods(it, attrs);
  const out: ModLine[] = [];
  for (const [k, dp, pct] of MOD_ORDER) {
    const v = m[k];
    if (v === undefined || v === 0) continue;
    const base = k === 'atkTime' || k === 'shotTime' || k === 'reach' || k === 'range' || k === 'ammo';
    const shown = pct ? v * 100 : v;
    const num = dp === 0 ? `${Math.round(shown)}` : shown.toFixed(dp).replace(/\.?0+$/, '');
    const text = `${base || shown < 0 ? '' : '+'}${num}${pct ? '%' : ''}`;
    out.push({ key: k, value: v, text, good: base ? true : v > 0 });
  }
  return out;
}

// ------------------------------------------------------------------ stash filters and sorting

export type SlotFilter = Slot | 'all';
export type RarityFilter = Rarity | 'all';
export type StashSort = 'rarity' | 'slot' | 'value' | 'cond';
export const STASH_SORTS: StashSort[] = ['rarity', 'slot', 'value', 'cond'];
export const SLOT_FILTERS: SlotFilter[] = ['all', ...SLOTS];
export const RARITY_FILTERS: RarityFilter[] = ['all', 'common', 'uncommon', 'rare', 'epic', 'legendary'];

export interface StashQuery {
  slot?: SlotFilter;
  rarity?: RarityFilter;
  sort?: StashSort;
}

/** Filter and sort stash items (stable: ties keep slot order, then tier, then uid). */
export function queryStash(items: readonly Item[], q: StashQuery = {}): Item[] {
  const slot = q.slot ?? 'all';
  const rar = q.rarity ?? 'all';
  const list = items.filter((it) => (slot === 'all' || itemDef(it.def).slot === slot) && (rar === 'all' || normalizeRarity(it.rarity) === rar));
  const bySlot = (a: Item, b: Item) => SLOTS.indexOf(itemDef(a.def).slot) - SLOTS.indexOf(itemDef(b.def).slot);
  const byTier = (a: Item, b: Item) => itemDef(b.def).tier - itemDef(a.def).tier;
  const byRarity = (a: Item, b: Item) => rarityRank(b.rarity) - rarityRank(a.rarity);
  const byUid = (a: Item, b: Item) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);
  const cmp: Record<StashSort, (a: Item, b: Item) => number> = {
    rarity: (a, b) => byRarity(a, b) || bySlot(a, b) || byTier(a, b) || byUid(a, b),
    slot: (a, b) => bySlot(a, b) || byRarity(a, b) || byTier(a, b) || byUid(a, b),
    value: (a, b) => itemValue(b) - itemValue(a) || bySlot(a, b) || byUid(a, b),
    cond: (a, b) => a.cond - b.cond || bySlot(a, b) || byUid(a, b),
  };
  return list.sort(cmp[q.sort ?? 'rarity']);
}

/** Next value of a cycling filter button. */
export function cycle<T>(list: readonly T[], cur: T): T {
  const i = list.indexOf(cur);
  return list[(i + 1) % list.length];
}

/** Does equipping this item improve the hero's power rating? (an up-arrow on stash cells). */
export function isUpgrade(h: Hero, it: Item): boolean {
  const c = compareItem(h, it);
  return c.power[1] > c.power[0] + 0.5;
}

// ------------------------------------------------------------------ roster

/** Combat power as a whole number for the roster (the bot's estimate x 10). */
export function powerRating(h: Hero): number {
  return Math.round(heroPower(h) * 10);
}

/** Rank stars 1..5 from the level (1-2, 3-4, ... 9-10). */
export function heroStars(h: { level: number }): number {
  return Math.max(1, Math.min(5, Math.floor((h.level + 1) / 2)));
}

export type RosterSort = 'power' | 'level' | 'class' | 'group';
export const ROSTER_SORTS: RosterSort[] = ['power', 'level', 'class', 'group'];
export type RosterFilter = 'all' | 0 | 1 | 2 | 3 | 'wounded' | 'ready';
export const ROSTER_FILTERS: RosterFilter[] = ['all', 0, 1, 2, 3, 'wounded', 'ready'];

/** Something to spend: attribute points or a perk point. */
export function hasPending(h: Hero, perkSlots: (lvl: number) => number): boolean {
  return h.points > 0 || h.perks.length < perkSlots(h.level);
}

/**
 * A hero to badge: unspent attribute points or a free perk slot
 * (perkSlots(level) − perks taken > 0), as the hero sheet's tab badges.
 */
export function heroNeedsAttention(h: Pick<Hero, 'points' | 'perks' | 'level'>): boolean {
  return h.points > 0 || perkSlots(h.level) - h.perks.length > 0;
}

export function queryRoster(heroes: readonly Hero[], sort: RosterSort = 'power', filter: RosterFilter = 'all'): Hero[] {
  const list = heroes.filter((h) => (filter === 'all' ? true : filter === 'wounded' ? h.wound > 0 : filter === 'ready' ? h.wound <= 0 : h.group === filter));
  const pw = new Map(list.map((h) => [h.id, powerRating(h)]));
  const cmp: Record<RosterSort, (a: Hero, b: Hero) => number> = {
    power: (a, b) => pw.get(b.id)! - pw.get(a.id)!,
    level: (a, b) => b.level - a.level || b.xp - a.xp,
    class: (a, b) => heroClass(a).name.localeCompare(heroClass(b).name),
    group: (a, b) => a.group - b.group,
  };
  // stable sort keeps the army order on ties
  return list.map((h, i) => [h, i] as const).sort((x, y) => cmp[sort](x[0], y[0]) || x[1] - y[1]).map((x) => x[0]);
}
