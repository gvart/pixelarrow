/**
 * Who may wear what (docs/ITEMS.md "Requirements and class limits"):
 *  - every item asks for attribute points by tier and rarity; a hero short of
 *    them still wears it, weaker (`gearPenalty`), and its power and set count
 *    are off;
 *  - each class may equip only its weapon families, shield types and armour
 *    up to its weight (`classGearBlocker`, a hard rule). Helmets and trinkets
 *    are open to every class.
 */
import { itemDef, normalizeRarity, rarityRank, type ItemDef, type Rarity } from './items';
import type { AttrId, Attrs } from './perks';

export type WeaponFamily =
  | 'spear' | 'short_spear' | 'lance' | 'javelins' | 'short_sword' | 'curved_sword' | 'longsword'
  | 'axe' | 'club' | 'falx' | 'rhomphaia' | 'sling' | 'bow' | 'short_bow';
export type ShieldType = 'big' | 'long' | 'light';
export type ArmorWeight = 'light' | 'medium' | 'heavy';

const WEIGHT_RANK: Record<ArmorWeight, number> = { light: 0, medium: 1, heavy: 2 };

/** Armour that weighs other than its art's usual weight. */
const WEIGHT_OVERRIDE: Record<string, ArmorWeight> = { plated_linothorax: 'heavy', horn_scale: 'medium', immortal_scale: 'medium' };
const ART_WEIGHT: Record<string, ArmorWeight> = { leather: 'light', linothorax: 'medium', scale: 'heavy', mail: 'heavy', cuirass: 'heavy' };

export function weaponFamily(def: ItemDef): WeaponFamily | null {
  if (def.slot !== 'weapon') return null;
  switch (def.weaponKind) {
    case 'spear': return def.art === 'spear_short' ? 'short_spear' : 'spear';
    case 'lance': return 'lance';
    case 'javelins': return 'javelins';
    case 'sword': return def.art === 'kopis' ? 'curved_sword' : def.art === 'longsword' ? 'longsword' : 'short_sword';
    case 'axe': return 'axe';
    case 'club': return 'club';
    case 'polearm': return def.art === 'falx' ? 'falx' : 'rhomphaia';
    case 'sling': return 'sling';
    case 'bow': return def.art === 'bow_short' ? 'short_bow' : 'bow';
    default: return null;
  }
}

export function shieldType(def: ItemDef): ShieldType | null {
  if (def.slot !== 'shield') return null;
  return def.shieldKind === 'hoplon' ? 'big' : def.shieldKind === 'oval' ? 'long' : 'light';
}

export function armorWeight(def: ItemDef): ArmorWeight | null {
  if (def.slot !== 'armor') return null;
  return WEIGHT_OVERRIDE[def.id] ?? ART_WEIGHT[def.art] ?? 'medium';
}

// ------------------------------------------------------------------ class limits

export interface ClassGear {
  weapons: WeaponFamily[];
  shields: ShieldType[];
  armor: ArmorWeight;
}

const G = (weapons: WeaponFamily[], shields: ShieldType[], armor: ArmorWeight): ClassGear => ({ weapons, shields, armor });

/** Built from each class's starting kit (src/data/classes.ts), so no class loses its own gear. Missing classes (animals, beasts) wear nothing. */
export const CLASS_GEAR: Readonly<Record<string, ClassGear>> = {
  militia: G(['spear', 'short_spear', 'club', 'javelins', 'sling'], ['long'], 'light'),
  hoplite: G(['spear'], ['big'], 'heavy'),
  thureophoros: G(['short_sword', 'curved_sword', 'short_spear'], ['long'], 'heavy'),
  celt_sword: G(['longsword', 'short_sword', 'curved_sword'], ['long'], 'heavy'),
  rhomphaia: G(['rhomphaia'], [], 'heavy'),
  archer: G(['bow'], [], 'medium'),
  slinger: G(['sling'], [], 'light'),
  javelineer: G(['javelins'], ['light'], 'light'),
  horse_archer: G(['short_bow'], [], 'heavy'),
  peltast: G(['javelins', 'short_spear'], ['light', 'long'], 'light'),
  falx: G(['falx'], [], 'light'),
  gallic: G(['axe', 'longsword', 'club'], ['long'], 'light'),
  fanatic: G(['club', 'axe', 'short_sword', 'curved_sword'], ['light'], 'light'),
  companion: G(['lance', 'curved_sword'], ['big'], 'heavy'),
  thessalian: G(['javelins', 'short_sword'], ['light'], 'medium'),
  chariot: G(['curved_sword', 'short_sword', 'axe'], [], 'heavy'),
  royal_guard: G(['spear'], ['big'], 'heavy'),
  sacred_band: G(['spear'], ['big'], 'heavy'),
};

/** Why `cls` may not equip `def` (a short reason key), or null if it may. */
export function classGearBlocker(cls: string, def: ItemDef): 'weapon' | 'shield' | 'armor' | 'none' | null {
  if (def.slot === 'helmet' || def.slot === 'trinket') return CLASS_GEAR[cls] ? null : 'none';
  const g = CLASS_GEAR[cls];
  if (!g) return 'none';
  if (def.slot === 'weapon') return g.weapons.includes(weaponFamily(def)!) ? null : 'weapon';
  if (def.slot === 'shield') return g.shields.includes(shieldType(def)!) ? null : 'shield';
  return WEIGHT_RANK[armorWeight(def)!] <= WEIGHT_RANK[g.armor] ? null : 'armor';
}

/** The classes that may equip `def`. */
export function classesFor(def: ItemDef): string[] {
  return Object.keys(CLASS_GEAR).filter((c) => classGearBlocker(c, def) === null);
}

// ------------------------------------------------------------------ attribute requirements

export interface Requirement {
  attr: AttrId;
  n: number;
}

const TIER_BASE = [5, 7, 9];
const RARITY_ADD = [0, 0, 1, 2, 3];
const SET_NEED: Partial<Record<Rarity, number>> = { rare: 9, epic: 11, legendary: 13 };
/** Helmets that ask nothing at tier 1 (caps and hoods). */
const OPEN_HELMET_ART = ['cap', 'hood'];

/** Main and second attribute an item asks for (second needs 3 less), or none. */
function reqAttrs(def: ItemDef): [AttrId | null, AttrId | null] {
  switch (def.slot) {
    case 'weapon': {
      const f = weaponFamily(def);
      if (f === 'short_sword' || f === 'curved_sword') return ['agi', 'str'];
      if (f === 'bow' || f === 'short_bow' || f === 'sling' || f === 'javelins') return ['agi', null];
      return ['str', null];
    }
    case 'shield':
      return shieldType(def) === 'light' ? ['agi', null] : ['str', 'end'];
    case 'armor': {
      const w = armorWeight(def);
      if (w === 'heavy') return ['end', 'str'];
      if (w === 'light' && def.tier <= 1) return [null, null];
      return ['end', null];
    }
    case 'helmet':
      return OPEN_HELMET_ART.includes(def.art) && def.tier <= 1 ? [null, null] : ['end', null];
    case 'trinket':
      return def.tier <= 1 ? [null, null] : ['wil', null];
  }
}

/** What an item of `defId` at `rarity` asks for. Requirements of 5 or less are dropped (every hero starts near 5). */
export function requirements(defId: string, rarity: Rarity | string): Requirement[] {
  const def = itemDef(defId);
  const [main, second] = reqAttrs(def);
  if (!main) return [];
  const r = normalizeRarity(rarity);
  const n = def.named ? 13 : def.set ? SET_NEED[r] ?? 9 : TIER_BASE[Math.max(1, Math.min(3, def.tier)) - 1] + RARITY_ADD[rarityRank(r)];
  const out: Requirement[] = [];
  if (n > 5) out.push({ attr: main, n });
  if (second && n - 3 > 5) out.push({ attr: second, n: n - 3 });
  return out;
}

/** Attribute points missing for `attrs` to meet an item's requirements. */
export function shortfall(attrs: Attrs | undefined, defId: string, rarity: Rarity | string): number {
  if (!attrs) return 0;
  let miss = 0;
  for (const q of requirements(defId, rarity)) miss += Math.max(0, q.n - (attrs[q.attr] ?? 0));
  return miss;
}

/** Fraction of an item's stats lost for missing points: 10% each, at most 70%. */
export function gearPenalty(missing: number): number {
  return Math.min(0.7, 0.1 * Math.max(0, missing));
}
