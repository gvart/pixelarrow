/**
 * Random stats ("affixes") and powers of items (docs/ITEMS.md).
 *
 * An uncommon item has 1 random stat, rare 2, epic 3, legendary 4; epic and
 * legendary items also have a power (grade I or II). Both are a pure function
 * of the item's uid, base item and rarity (`itemAffixes`, `itemPower`), so
 * every item ever made, old saves included, has them without storing them,
 * and a client cannot invent them. An item can carry explicit `aff` / `pow`
 * (a future forge, or fixed named items via their def) that win over the roll.
 *
 * A random stat is stored and rolled as **steps**; one step is a fixed size
 * per stat (`AFFIXES[id].step`), so balance can retune a stat without
 * touching saves.
 */
import { hashString, Rng } from '../sim/rng';
import { itemDef, normalizeRarity, rarityRank, type Item, type ItemDef, type Rarity, type StatMods } from './items';
import { weaponFamily } from './gearRules';

export type AffixId =
  | 'hp' | 'dmg' | 'rangedDmg' | 'atkSpeed' | 'accuracy' | 'armor' | 'block' | 'morale' | 'stamina' | 'speed'
  | 'chargeBonus' | 'blockPierce' | 'armorPierce' | 'moraleShock' | 'ammo' | 'range' | 'steady' | 'koChance'
  | 'xpBonus' | 'goldBonus' | 'durable';

/** Where an affix may roll: melee weapon, ranged weapon (bows, slings, javelins), shield, helmet, armour, trinket. */
export type AffixSlot = 'melee' | 'ranged' | 'shield' | 'helmet' | 'armor' | 'trinket';

export interface AffixDef {
  id: AffixId;
  /** The word in front of the item's name ("Keen Xiphos"). */
  word: string;
  /** Value of one step, in the stat's own unit (fractions for percentages). */
  step: number;
  slots: AffixSlot[];
  /** Only matters on the campaign and the war map (gold, knock-outs, wear): does nothing in duels. */
  economy?: boolean;
  /** Only on these weapon families (charge bonus: spears and lances). */
  families?: string[];
}

const A = (id: AffixId, word: string, step: number, slots: AffixSlot[], extra: Partial<AffixDef> = {}): AffixDef => ({ id, word, step, slots, ...extra });

export const AFFIXES: Record<AffixId, AffixDef> = {
  hp: A('hp', 'Hale', 3, ['shield', 'helmet', 'armor', 'trinket']),
  dmg: A('dmg', 'Keen', 0.5, ['melee', 'trinket']),
  rangedDmg: A('rangedDmg', 'Deadly', 0.6, ['ranged', 'trinket']),
  atkSpeed: A('atkSpeed', 'Swift', 0.03, ['melee', 'trinket']),
  accuracy: A('accuracy', 'True', 0.015, ['melee', 'ranged', 'helmet', 'trinket']),
  armor: A('armor', 'Warded', 0.5, ['shield', 'helmet', 'armor']),
  block: A('block', 'Stalwart', 0.02, ['shield']),
  morale: A('morale', 'Brave', 3, ['shield', 'helmet', 'trinket']),
  stamina: A('stamina', 'Tireless', 6, ['armor', 'trinket']),
  speed: A('speed', 'Fleet', 0.015, ['helmet', 'armor', 'trinket']),
  chargeBonus: A('chargeBonus', 'Driving', 0.04, ['melee', 'shield'], { families: ['spear', 'short_spear', 'lance'] }),
  blockPierce: A('blockPierce', 'Hooking', 0.02, ['melee']),
  armorPierce: A('armorPierce', 'Piercing', 0.03, ['ranged']),
  moraleShock: A('moraleShock', 'Dread', 0.04, ['melee', 'helmet']),
  ammo: A('ammo', 'Plenty', 2, ['ranged']),
  range: A('range', 'Far', 0.4, ['ranged']),
  steady: A('steady', 'Steady', 0.03, ['helmet', 'armor', 'trinket']),
  koChance: A('koChance', 'Lucky', 0.03, ['helmet', 'armor', 'trinket'], { economy: true }),
  xpBonus: A('xpBonus', 'Wise', 0.05, ['helmet', 'trinket']),
  goldBonus: A('goldBonus', 'Gilded', 0.05, ['trinket'], { economy: true }),
  durable: A('durable', 'Sturdy', 0.15, ['melee', 'ranged', 'shield', 'helmet', 'armor'], { economy: true }),
};
export const AFFIX_IDS = Object.keys(AFFIXES) as AffixId[];

/** Number of random stats by rarity, and the steps each one rolls. */
export const AFFIX_COUNT = [0, 1, 2, 3, 4];
const STEPS: [number, number][] = [[0, 0], [1, 2], [1, 2], [2, 3], [2, 3]];

export function affixSlot(def: ItemDef): AffixSlot {
  if (def.slot !== 'weapon') return def.slot;
  const f = weaponFamily(def);
  return f === 'bow' || f === 'short_bow' || f === 'sling' || f === 'javelins' ? 'ranged' : 'melee';
}

/** The stats an item of `def` can roll, with their weights (the stats the base item is about count double). */
export function affixPool(def: ItemDef): [AffixId, number][] {
  const slot = affixSlot(def);
  const fam = weaponFamily(def);
  const out: [AffixId, number][] = [];
  for (const a of Object.values(AFFIXES)) {
    if (!a.slots.includes(slot)) continue;
    if (a.families && def.slot === 'weapon' && !a.families.includes(fam ?? '')) continue;
    const base = (def.mods as Record<string, number | undefined>)[a.id];
    out.push([a.id, base && base > 0 ? 2 : 1]);
  }
  return out;
}

export type Affixes = [AffixId, number][];

/** Parse a stored `aff` string ("atkSpeed:2,hp:1"). Unknown stats are dropped. */
export function parseAffixes(s: string): Affixes {
  const out: Affixes = [];
  for (const part of s.split(',')) {
    const [k, v] = part.split(':');
    const n = Math.round(Number(v));
    if (k in AFFIXES && n > 0) out.push([k as AffixId, Math.min(5, n)]);
  }
  return out;
}

function seed(item: Pick<Item, 'uid' | 'def' | 'rarity'>, salt: string): number {
  return hashString(`${salt}|${item.uid}|${item.def}|${normalizeRarity(item.rarity)}`);
}

/** An item's random stats as [stat, steps], strongest first: stored, fixed (named items), or rolled from its uid. */
export function itemAffixes(item: Pick<Item, 'uid' | 'def' | 'rarity'> & { aff?: string }): Affixes {
  if (item.aff) return parseAffixes(item.aff);
  const def = itemDef(item.def);
  if (def.fixed) return (Object.entries(def.fixed) as [AffixId, number][]).filter(([k, n]) => k in AFFIXES && n > 0);
  const r = rarityRank(item.rarity);
  const n = AFFIX_COUNT[r];
  if (!n) return [];
  const rng = new Rng(seed(item, 'aff'));
  const pool = affixPool(def);
  const out: Affixes = [];
  const [lo, hi] = STEPS[r];
  for (let i = 0; i < n && pool.length; i++) {
    const id = rng.weighted(pool);
    pool.splice(pool.findIndex(([k]) => k === id), 1);
    out.push([id, rng.int(lo, hi)]);
  }
  return out.sort((a, b) => b[1] - a[1]);
}

/** Affixes as the stored `aff` string ("atkSpeed:2,hp:1"). */
export function encodeAffixes(a: Affixes): string {
  return a.map(([k, n]) => `${k}:${n}`).join(',');
}

/**
 * Give `item` the random stats and power an item rolled under `fromUid` would
 * have (a shop or merchant offer's preview), stored explicitly so the bought
 * item is exactly the one shown. Returns the item.
 */
export function freezeRolls<T extends Item>(item: T, fromUid: string): T {
  const src = { uid: fromUid, def: item.def, rarity: item.rarity };
  const aff = itemAffixes(src);
  if (aff.length) item.aff = encodeAffixes(aff);
  const pow = itemPower(src);
  if (pow && !itemDef(item.def).power) item.pow = pow.id;
  return item;
}

/** The StatMods an item's random stats add (before any requirement penalty). */
export function affixMods(item: Pick<Item, 'uid' | 'def' | 'rarity'> & { aff?: string }): StatMods {
  const def = itemDef(item.def);
  const out: Record<string, number> = {};
  for (const [id, steps] of itemAffixes(item)) {
    const step = id === 'ammo' && def.weaponKind === 'javelins' ? 1 : AFFIXES[id].step;
    out[id] = round3((out[id] ?? 0) + step * steps);
  }
  return out as StatMods;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// ------------------------------------------------------------------ powers

export type PowerId =
  | 'blood_price' | 'frenzy' | 'sunder' | 'rend' | 'second_wind' | 'aegis' | 'retribution' | 'hunger'
  | 'terror' | 'steadfast' | 'eagle_eye' | 'twin_shot' | 'unshaken' | 'momentum' | 'last_stand' | 'executioner';

/** A power's numbers at one grade; which fields a power reads is listed with it. */
export interface PowerGrade {
  /** Proc chance (0..1). */
  chance?: number;
  /** Main size: damage multiplier bonus, fraction, morale points... */
  value?: number;
  /** Seconds (buff length, or cooldown for Aegis). */
  time?: number;
  /** A second size (HP cost, stamina, stun seconds...). */
  extra?: number;
}

export interface PowerDef {
  id: PowerId;
  name: string;
  /** Slots that roll it (the melee / ranged split for weapons). */
  slots: AffixSlot[];
  /** Only on these weapon families when on a weapon. */
  families?: string[];
  /** Grade I (epic) and grade II (legendary). */
  grades: [PowerGrade, PowerGrade];
  /** One line for the item card; {v} {c} {t} {x} are filled from the grade. */
  text: string;
}

const P = (id: PowerId, name: string, slots: AffixSlot[], g1: PowerGrade, g2: PowerGrade, text: string, families?: string[]): PowerDef => ({ id, name, slots, grades: [g1, g2], text, families });

export const POWERS: Record<PowerId, PowerDef> = {
  blood_price: P('blood_price', 'Blood Price', ['melee'], { chance: 0.12, extra: 0.05 }, { chance: 0.18, extra: 0.05 }, '{c} chance a hit does double damage; costs {x} of max HP'),
  frenzy: P('frenzy', 'Battle Frenzy', ['melee', 'ranged', 'trinket'], { value: 0.2, time: 6 }, { value: 0.3, time: 6 }, 'on a kill: +{v} attack speed for {t}'),
  sunder: P('sunder', 'Sunder', ['melee', 'ranged'], { chance: 0.1, value: 0.1, time: 8 }, { chance: 0.15, value: 0.15, time: 8 }, '{c} chance on hit: target max HP -{v} for {t}'),
  rend: P('rend', 'Rend Armour', ['melee', 'ranged'], { chance: 0.15, value: 2, time: 6 }, { chance: 0.25, value: 3, time: 6 }, '{c} chance on hit: target armour -{v} for {t}, stacks twice'),
  second_wind: P('second_wind', 'Second Wind', ['armor', 'trinket'], { value: 0.2, extra: 30 }, { value: 0.3, extra: 50 }, 'once, below 30% HP: heal {v} of max HP and +{x} stamina'),
  aegis: P('aegis', 'Aegis', ['shield'], { time: 12 }, { time: 8 }, 'every {t} the next front or side hit is blocked'),
  retribution: P('retribution', 'Retribution', ['armor', 'shield'], { value: 0.15 }, { value: 0.25 }, 'melee attackers take {v} of their damage back'),
  hunger: P('hunger', "Wolf's Hunger", ['melee'], { value: 0.06 }, { value: 0.1 }, 'heal {v} of the damage dealt'),
  terror: P('terror', 'Terror', ['melee', 'ranged', 'helmet'], { value: 8, extra: 3 }, { value: 12, extra: 3 }, 'on a kill: enemies within {x} lose {v} morale'),
  steadfast: P('steadfast', 'Steadfast', ['helmet', 'trinket'], { value: 0.1, extra: 3 }, { value: 0.15, extra: 3 }, 'allies within {x} take {v} less morale damage'),
  eagle_eye: P('eagle_eye', 'Eagle Eye', ['ranged'], { chance: 0.15 }, { chance: 0.25 }, '{c} chance a missile ignores block'),
  twin_shot: P('twin_shot', 'Twin Shot', ['ranged'], { chance: 0.1 }, { chance: 0.15 }, '{c} chance to loose a second missile free'),
  unshaken: P('unshaken', 'Unshaken', ['armor', 'helmet'], { value: 0.2 }, { value: 0.35 }, 'charges cannot stun; charge damage taken -{v}'),
  momentum: P('momentum', 'Momentum', ['melee', 'shield', 'trinket'], { value: 0.25, extra: 0.3 }, { value: 0.4, extra: 0.5 }, 'charge impact +{v}, charge stun +{x}', ['spear', 'short_spear', 'lance']),
  last_stand: P('last_stand', 'Last Stand', ['armor', 'trinket'], { value: 0.2 }, { value: 0.35 }, 'below 25% HP: +{v} damage and never routs'),
  executioner: P('executioner', 'Executioner', ['melee', 'ranged'], { value: 0.3 }, { value: 0.5 }, '+{v} damage against targets below 30% HP'),
};
export const POWER_IDS = Object.keys(POWERS) as PowerId[];

export interface ItemPower {
  id: PowerId;
  /** 0 = grade I (epic), 1 = grade II (legendary). */
  grade: 0 | 1;
}

/** Powers an item of `def` can roll. */
export function powerPool(def: ItemDef): PowerId[] {
  const slot = affixSlot(def);
  const fam = weaponFamily(def);
  return POWER_IDS.filter((id) => {
    const p = POWERS[id];
    if (!p.slots.includes(slot)) return false;
    if (p.families && def.slot === 'weapon' && !p.families.includes(fam ?? '')) return false;
    return true;
  });
}

/** An item's power: stored, fixed (named items), or rolled for epic and legendary items; set pieces have none (their set bonus is the power). */
export function itemPower(item: Pick<Item, 'uid' | 'def' | 'rarity'> & { pow?: string }): ItemPower | null {
  const def = itemDef(item.def);
  const r = rarityRank(item.rarity);
  const grade: 0 | 1 = r >= 4 ? 1 : 0;
  const fixed = item.pow ?? def.power;
  if (fixed) return fixed in POWERS ? { id: fixed as PowerId, grade: def.named ? 1 : grade } : null;
  if (r < 3 || def.set) return null;
  const pool = powerPool(def);
  if (!pool.length) return null;
  return { id: new Rng(seed(item, 'pow')).pick(pool), grade };
}

/**
 * A power's card line at a grade ("12% chance a hit does double damage; costs
 * 5% of max HP"). `template` is a translation of `POWERS[id].text` with the
 * same {c} {v} {t} {x} slots; `sec` the unit of seconds.
 */
export function powerText(p: ItemPower, template = POWERS[p.id].text, sec = 's'): string {
  const g = POWERS[p.id].grades[p.grade];
  const pct = (v?: number) => `${Math.round((v ?? 0) * 100)}%`;
  const fmt = (v?: number) => (v !== undefined && v < 1 ? pct(v) : `${v ?? 0}`);
  return template
    .replace('{c}', pct(g.chance))
    .replace('{v}', fmt(g.value))
    .replace('{t}', `${g.time ?? 0} ${sec}`)
    .replace('{x}', p.id === 'momentum' ? `${g.extra} ${sec}` : fmt(g.extra));
}

/** The name an item shows: "Keen Iron xiphos of Frenzy". Set pieces and named items keep their own name. */
export function itemDisplayName(item: Pick<Item, 'uid' | 'def' | 'rarity'> & { aff?: string; pow?: string }): string {
  const def = itemDef(item.def);
  if (def.named || def.set) return def.name;
  const aff = itemAffixes(item);
  const pow = itemPower(item);
  const word = aff.length ? `${AFFIXES[aff[0][0]].word} ` : '';
  const tail = pow ? ` of ${POWERS[pow.id].name.replace(/^Battle /, '')}` : '';
  return `${word}${def.name}${tail}`;
}

export type { Rarity };
