/**
 * Data-driven item definitions. Every piece of equipment in the game is listed here.
 * Item *instances* (what heroes carry) reference a definition by id and add
 * rarity, condition and paint (shield emblem / colours).
 */
import { affixMods } from './affixes';
import { gearPenalty, shortfall } from './gearRules';
import type { Attrs } from './perks';

export type Slot = 'weapon' | 'shield' | 'helmet' | 'armor' | 'trinket';
export const SLOTS: Slot[] = ['weapon', 'shield', 'helmet', 'armor', 'trinket'];

export type WeaponKind = 'spear' | 'sword' | 'axe' | 'club' | 'sling' | 'bow' | 'javelins' | 'polearm' | 'lance';
export type ShieldKind = 'hoplon' | 'oval' | 'buckler';
/**
 * Five rarity tiers (docs/DESIGN_V2.md "Items"): Common (grey), Uncommon
 * (green), Rare (blue), Epic (purple), Legendary (gold). Colours live in
 * src/ui/theme.ts. Saves and server data from before v4 used four tiers
 * ('fine', 'heroic'): `normalizeRarity` maps them (fine -> uncommon,
 * heroic -> epic, keeping their stat multipliers).
 */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
/** Old four-tier names -> new tiers. */
export const LEGACY_RARITY: Readonly<Record<string, Rarity>> = { fine: 'uncommon', heroic: 'epic' };

/** Any stored rarity (current, legacy or junk) as a current tier; unknown values become common. */
export function normalizeRarity(r: unknown): Rarity {
  if (typeof r !== 'string') return 'common';
  if ((RARITIES as string[]).includes(r)) return r as Rarity;
  return LEGACY_RARITY[r] ?? 'common';
}

/** Rarity a set piece or named legendary always has (null for other items). */
export const FIXED_RARITY: Record<string, Rarity> = { agoge: 'rare', peltast: 'rare', cretan: 'rare', brennus: 'epic', immortals: 'epic', sacred_band: 'epic', achilles: 'legendary', alexander: 'legendary' };

/**
 * Map a stored item's legacy rarity in place (server rows, old saves); set
 * pieces and named legendaries always have their own rarity. Returns the item.
 */
export function normalizeItem<T extends { rarity: Rarity; def?: string } | null | undefined>(it: T): T {
  if (!it) return it;
  if ((it.rarity as string) !== normalizeRarity(it.rarity)) it.rarity = normalizeRarity(it.rarity);
  const def = it.def ? ITEMS[it.def] : undefined;
  const fixed = def?.named ? 'legendary' : def?.set ? FIXED_RARITY[def.set] : undefined;
  if (fixed && it.rarity !== fixed) it.rarity = fixed;
  return it;
}

/** Normalise every equipped item of a hero-like object in place. */
export function normalizeEquip<T extends { equip?: Partial<Record<string, { rarity: Rarity } | null | undefined>> }>(h: T): T {
  for (const it of Object.values(h?.equip ?? {})) normalizeItem(it);
  return h;
}

/** 0 (common) .. 4 (legendary). */
export function rarityRank(r: Rarity | string): number {
  return RARITIES.indexOf(normalizeRarity(r));
}

/** Additive stat modifiers. All optional. */
export interface StatMods {
  hp?: number;
  dmg?: number; // melee damage per hit
  reach?: number; // melee reach in field units (overrides base when on a weapon)
  atkTime?: number; // seconds between melee attacks (weapon sets it)
  rangedDmg?: number;
  range?: number; // ranged reach in field units
  ammo?: number;
  shotTime?: number; // seconds between shots
  accuracy?: number; // added to hit chance
  block?: number; // frontal block chance
  blockPierce?: number; // reduces target block chance
  armor?: number;
  morale?: number;
  stamina?: number;
  speed?: number; // fractional speed modifier, e.g. -0.08
  chargeBonus?: number; // extra multiplier on charge impact / brace
  armorPierce?: number; // missiles: fraction of the target's armour ignored
  moraleShock?: number; // extra morale damage multiplier on hit
  xpBonus?: number; // fractional
  atkSpeed?: number; // fractional: attack time is divided by (1 + atkSpeed)
  steady?: number; // fractional: morale damage taken shrinks by it
  koChance?: number; // added to the chance a mortal blow only knocks out (campaign and war map)
  goldBonus?: number; // fractional bonus battle gold (campaign and war map)
  durable?: number; // fractional: wear taken shrinks by it (campaign and war map)
}

export interface ItemDef {
  id: string;
  name: string;
  slot: Slot;
  weaponKind?: WeaponKind;
  shieldKind?: ShieldKind;
  /** Paper-doll art key (see src/art/paperdoll.ts). Trinkets are not drawn. */
  art: string;
  /** 1 (common gear) .. 3 (elite gear). Used for enemy generation and loot value. */
  tier: number;
  value: number;
  mods: StatMods;
  desc: string;
  twoHanded?: boolean;
  shieldWall?: boolean;
  /**
   * What it is mostly made of, for the item icon (src/art/itemIcons.ts) to
   * tell variants of one `art` apart. Optional: the icon falls back to the
   * art's usual material.
   */
  material?: ItemMaterial;
  /** Set piece of this set (src/data/sets.ts). Always drops at the set's rarity. */
  set?: string;
  /** A named legendary: always legendary, fixed random stats and power. */
  named?: boolean;
  /** Fixed power of a named legendary (src/data/affixes.ts POWERS). */
  power?: string;
  /** Fixed random stats of a named legendary, as steps (src/data/affixes.ts). */
  fixed?: Partial<Record<string, number>>;
  /** Never traded on the marketplace or sold to merchants. */
  bound?: boolean;
  /** Named extras the battle runs (src/sim/powers.ts): fraction of missile damage taken off; accuracy enemy missiles lose against the wearer. */
  missileWard?: number;
  shroud?: number;
}

export type ItemMaterial = 'bronze' | 'iron' | 'steel' | 'silver' | 'gold' | 'wood' | 'leather' | 'linen' | 'bone' | 'horn' | 'stone' | 'faience' | 'felt' | 'wicker';

const defs: ItemDef[] = [
  // ---- weapons -------------------------------------------------------------
  { id: 'dory', name: 'Dory spear', slot: 'weapon', weaponKind: 'spear', art: 'spear', tier: 1, value: 30,
    mods: { dmg: 7, reach: 1.9, atkTime: 1.3, chargeBonus: 0.4 }, desc: 'Long thrusting spear. Reach; braces against charges.', material: 'iron' },
  { id: 'bronze_dory', name: 'Bronze-shod dory', slot: 'weapon', weaponKind: 'spear', art: 'spear', tier: 2, value: 60,
    mods: { dmg: 8.5, reach: 2.0, atkTime: 1.25, chargeBonus: 0.5 }, desc: 'A finer spear with a heavy bronze head.', material: 'bronze' },
  { id: 'xiphos', name: 'Xiphos', slot: 'weapon', weaponKind: 'sword', art: 'sword', tier: 1, value: 35,
    mods: { dmg: 8, reach: 1.1, atkTime: 1.0 }, desc: 'Short leaf-bladed sword. Quick.', material: 'bronze' },
  { id: 'kopis', name: 'Kopis', slot: 'weapon', weaponKind: 'sword', art: 'kopis', tier: 2, value: 65,
    mods: { dmg: 9.5, reach: 1.15, atkTime: 1.1, blockPierce: 0.05 }, desc: 'Forward-curved chopping sword.', material: 'iron' },
  { id: 'falcata', name: 'Falcata', slot: 'weapon', weaponKind: 'sword', art: 'kopis', tier: 3, value: 110,
    mods: { dmg: 11, reach: 1.15, atkTime: 1.05, blockPierce: 0.08 }, desc: 'Iberian blade, feared in every port.', material: 'iron' },
  { id: 'longsword', name: 'Celtic longsword', slot: 'weapon', weaponKind: 'sword', art: 'longsword', tier: 2, value: 70,
    mods: { dmg: 10, reach: 1.35, atkTime: 1.25 }, desc: 'Long iron slashing sword.', material: 'iron' },
  { id: 'axe', name: 'War axe', slot: 'weapon', weaponKind: 'axe', art: 'axe', tier: 1, value: 35,
    mods: { dmg: 11, reach: 1.1, atkTime: 1.5, blockPierce: 0.15 }, desc: 'Slow, but splits shields.', material: 'iron' },
  { id: 'club', name: 'Club', slot: 'weapon', weaponKind: 'club', art: 'club', tier: 1, value: 10,
    mods: { dmg: 6.5, reach: 1.0, atkTime: 1.15, moraleShock: 0.4 }, desc: 'Knotted olive wood. Cracks nerves as well as skulls.', material: 'wood' },
  { id: 'sling', name: 'Sling', slot: 'weapon', weaponKind: 'sling', art: 'sling', tier: 1, value: 20,
    mods: { rangedDmg: 6, range: 11, ammo: 20, shotTime: 2.2, dmg: 2.5, reach: 1.0, atkTime: 1.1, armorPierce: 0.25 }, desc: 'Stones at long range: they bruise through armour.', material: 'leather' },
  { id: 'balearic_sling', name: 'Balearic sling', slot: 'weapon', weaponKind: 'sling', art: 'sling', tier: 2, value: 55,
    mods: { rangedDmg: 7.5, range: 12, ammo: 24, shotTime: 2.0, accuracy: 0.08, dmg: 2.5, reach: 1.0, atkTime: 1.1, armorPierce: 0.3 }, desc: 'Island slingers never miss twice.' },
  { id: 'bow', name: 'Composite bow', slot: 'weapon', weaponKind: 'bow', art: 'bow', tier: 2, value: 60, twoHanded: true,
    mods: { rangedDmg: 7, range: 13, ammo: 16, shotTime: 2.0, dmg: 2.5, reach: 1.0, atkTime: 1.1, armorPierce: 0.3 }, desc: 'Two-handed. Long range arrows.' },
  { id: 'javelins', name: 'Akontia javelins', slot: 'weapon', weaponKind: 'javelins', art: 'javelins', tier: 1, value: 25,
    mods: { rangedDmg: 11, range: 7, ammo: 3, shotTime: 2.0, dmg: 5, reach: 1.5, atkTime: 1.2, chargeBonus: 0.1, armorPierce: 0.25 }, desc: 'Three heavy throws, then a short spear.', material: 'wood' },
  { id: 'longche', name: 'Longche', slot: 'weapon', weaponKind: 'spear', art: 'spear_short', tier: 1, value: 28,
    mods: { dmg: 6.5, reach: 1.6, atkTime: 1.15, chargeBonus: 0.3 }, desc: 'Short thrusting spear: quicker than the dory, less reach.', material: 'iron' },
  { id: 'xyston', name: 'Xyston lance', slot: 'weapon', weaponKind: 'lance', art: 'lance', tier: 2, value: 70, twoHanded: true,
    mods: { dmg: 8, reach: 2.2, atkTime: 1.35, chargeBonus: 0.9 }, desc: 'Long cornel-wood cavalry lance, butt-spiked. Wins the first clash.', material: 'wood' },
  { id: 'falx', name: 'Falx', slot: 'weapon', weaponKind: 'polearm', art: 'falx', tier: 2, value: 75, twoHanded: true,
    mods: { dmg: 11.5, reach: 1.25, atkTime: 1.3, blockPierce: 0.22, chargeBonus: 0.15 }, desc: 'Two-handed Dacian sickle-blade. Hooks shields aside.', material: 'iron' },
  { id: 'rhomphaia', name: 'Rhomphaia', slot: 'weapon', weaponKind: 'polearm', art: 'rhomphaia', tier: 2, value: 85, twoHanded: true,
    mods: { dmg: 12.5, reach: 1.6, atkTime: 1.45, blockPierce: 0.18 }, desc: 'Thracian long blade on a long haft. Cleaves helmets and shields.', material: 'iron' },
  { id: 'cretan_bow', name: 'Cretan bow', slot: 'weapon', weaponKind: 'bow', art: 'bow', tier: 2, value: 75, twoHanded: true,
    mods: { rangedDmg: 7.5, range: 14, ammo: 18, shotTime: 1.9, accuracy: 0.04, dmg: 3, reach: 1.0, atkTime: 1.1, armorPierce: 0.4 }, desc: 'Horn-backed bow of the island archers. The longest reach.' },
  { id: 'scythian_bow', name: 'Scythian bow', slot: 'weapon', weaponKind: 'bow', art: 'bow_short', tier: 2, value: 70, twoHanded: true,
    mods: { rangedDmg: 7, range: 11, ammo: 30, shotTime: 1.55, dmg: 2.5, reach: 1.0, atkTime: 1.1, armorPierce: 0.45 }, desc: 'Short recurve bow, quick to draw from the saddle.' },
  { id: 'rhodian_sling', name: 'Rhodian sling', slot: 'weapon', weaponKind: 'sling', art: 'sling', tier: 2, value: 60,
    mods: { rangedDmg: 8, range: 12.5, ammo: 22, shotTime: 2.1, accuracy: 0.04, dmg: 2.5, reach: 1.0, atkTime: 1.1, armorPierce: 0.4 }, desc: 'Cast lead bullets: they outrange Persian bows.' },
  { id: 'saunion', name: 'Iron saunia', slot: 'weapon', weaponKind: 'javelins', art: 'javelins', tier: 2, value: 55,
    mods: { rangedDmg: 13, range: 7.5, ammo: 4, shotTime: 1.9, dmg: 6, reach: 1.5, atkTime: 1.2, blockPierce: 0.1, armorPierce: 0.35 }, desc: 'All-iron javelins that pin shields.', material: 'iron' },

  // ---- shields ---------------------------------------------------------------
  { id: 'hoplon', name: 'Hoplon', slot: 'shield', shieldKind: 'hoplon', art: 'hoplon', tier: 1, value: 40, shieldWall: true,
    mods: { block: 0.45, armor: 1, speed: -0.07, stamina: -10 }, desc: 'Great round bronze-faced shield. Enables the shield wall.', material: 'bronze' },
  { id: 'aspis', name: 'Argive aspis', slot: 'shield', shieldKind: 'hoplon', art: 'hoplon', tier: 3, value: 120, shieldWall: true,
    mods: { block: 0.52, armor: 2, speed: -0.06, stamina: -8, morale: 4 }, desc: 'A masterwork hoplon, passed father to son.', material: 'bronze' },
  { id: 'thureos', name: 'Thureos', slot: 'shield', shieldKind: 'oval', art: 'oval', tier: 1, value: 30, shieldWall: true,
    mods: { block: 0.38, speed: -0.03 }, desc: 'Light oval shield with an iron boss.', material: 'wood' },
  { id: 'celtic_shield', name: 'Celtic long shield', slot: 'shield', shieldKind: 'oval', art: 'oval', tier: 2, value: 55, shieldWall: true,
    mods: { block: 0.42, armor: 1, speed: -0.04 }, desc: 'Tall plank shield with a spina.', material: 'wood' },
  { id: 'pelte', name: 'Pelte', slot: 'shield', shieldKind: 'buckler', art: 'pelte', tier: 1, value: 20,
    mods: { block: 0.27, speed: -0.01 }, desc: 'Crescent wicker shield of the Thracian peltast. No shield wall.', material: 'wicker' },
  { id: 'argyraspis', name: 'Silver aspis', slot: 'shield', shieldKind: 'hoplon', art: 'hoplon', tier: 3, value: 160, shieldWall: true,
    mods: { block: 0.54, armor: 2, speed: -0.06, stamina: -8, morale: 6 }, desc: 'Silver-faced aspis of the royal guard.', material: 'silver' },
  { id: 'buckler', name: 'Buckler', slot: 'shield', shieldKind: 'buckler', art: 'buckler', tier: 1, value: 15,
    mods: { block: 0.2 }, desc: 'Small hand shield. No shield wall.', material: 'bronze' },

  // ---- helmets ---------------------------------------------------------------
  { id: 'cap', name: 'Leather cap', slot: 'helmet', art: 'cap', tier: 1, value: 8, mods: { armor: 1 }, desc: 'Better than nothing.', material: 'leather' },
  { id: 'pilos', name: 'Pilos helmet', slot: 'helmet', art: 'pilos', tier: 1, value: 25, mods: { armor: 2 }, desc: 'Conical bronze helmet.', material: 'bronze' },
  { id: 'montefortino', name: 'Montefortino', slot: 'helmet', art: 'montefortino', tier: 2, value: 40, mods: { armor: 3 }, desc: 'Knobbed bowl helmet with cheek guards.', material: 'bronze' },
  { id: 'chalcidian', name: 'Chalcidian helm', slot: 'helmet', art: 'chalcidian', tier: 2, value: 55, mods: { armor: 3, morale: 3 }, desc: 'Crested helm with open ears.', material: 'bronze' },
  { id: 'scythian_hood', name: 'Felt hood', slot: 'helmet', art: 'hood', tier: 1, value: 10, mods: { armor: 1 }, desc: 'Pointed felt hood of the steppe riders.', material: 'felt' },
  { id: 'thracian', name: 'Thracian helm', slot: 'helmet', art: 'thracian', tier: 2, value: 50, mods: { armor: 3, morale: 2 }, desc: 'Peaked bronze cap with a forward crest.', material: 'bronze' },
  { id: 'boeotian', name: 'Boeotian helm', slot: 'helmet', art: 'boeotian', tier: 2, value: 55, mods: { armor: 3, accuracy: 0.02 }, desc: 'Open cavalry helm with a folded brim: a clear view.', material: 'bronze' },
  { id: 'attic', name: 'Attic helm', slot: 'helmet', art: 'attic', tier: 3, value: 95, mods: { armor: 4, morale: 6 }, desc: 'Plumed parade helm of the royal guard.', material: 'bronze' },
  { id: 'corinthian', name: 'Corinthian helm', slot: 'helmet', art: 'corinthian', tier: 3, value: 90, mods: { armor: 4.5, morale: 5, accuracy: -0.05 }, desc: 'Full-face bronze. Terrifying, but hard to see out of.', material: 'bronze' },

  // ---- body armour -------------------------------------------------------------
  { id: 'leather', name: 'Leather jerkin', slot: 'armor', art: 'leather', tier: 1, value: 20, mods: { armor: 2 }, desc: 'Boiled leather over the tunic.', material: 'leather' },
  { id: 'linothorax', name: 'Linothorax', slot: 'armor', art: 'linothorax', tier: 1, value: 45, mods: { armor: 3.5, speed: -0.02 }, desc: 'Layered linen, light and stiff.', material: 'linen' },
  { id: 'scale', name: 'Scale corselet', slot: 'armor', art: 'scale', tier: 2, value: 70, mods: { armor: 5, speed: -0.05, stamina: -5 }, desc: 'Bronze scales on a linen backing.', material: 'bronze' },
  { id: 'mail', name: 'Ring mail', slot: 'armor', art: 'mail', tier: 3, value: 100, mods: { armor: 6, speed: -0.05, stamina: -8 }, desc: 'A Celtic invention: iron rings.', material: 'iron' },
  { id: 'cuirass', name: 'Muscle cuirass', slot: 'armor', art: 'cuirass', tier: 3, value: 120, mods: { armor: 6.5, speed: -0.08, stamina: -10, morale: 4 }, desc: 'Sculpted bronze. The look of a hero.', material: 'bronze' },

  // ---- trinkets (not drawn) -----------------------------------------------------------
  { id: 'owl_amulet', name: 'Owl amulet', slot: 'trinket', art: 'none', tier: 1, value: 30, mods: { morale: 10 }, desc: 'Athena watches. +morale.', material: 'silver' },
  { id: 'herakles_knot', name: 'Herakles knot', slot: 'trinket', art: 'none', tier: 1, value: 30, mods: { hp: 6 }, desc: 'Gold knot charm. +HP.', material: 'gold' },
  { id: 'scarab', name: 'Faience scarab', slot: 'trinket', art: 'none', tier: 1, value: 30, mods: { stamina: 20 }, desc: 'Phoenician luck. +stamina.', material: 'faience' },
  { id: 'laurel', name: 'Laurel token', slot: 'trinket', art: 'none', tier: 2, value: 45, mods: { xpBonus: 0.3 }, desc: 'Learns faster. +30% XP.', material: 'gold' },
  { id: 'tanit_eye', name: 'Eye of Tanit', slot: 'trinket', art: 'none', tier: 2, value: 45, mods: { accuracy: 0.08, block: 0.04 }, desc: '+accuracy, +block.', material: 'faience' },
  { id: 'boar_tusk', name: 'Boar tusk', slot: 'trinket', art: 'none', tier: 2, value: 45, mods: { dmg: 1.5 }, desc: '+melee damage.', material: 'bone' },

  // =========================================================================
  // The wider Mediterranean (v5 item pool): more weapons, shields, helmets,
  // armour and charms from Macedon to Iberia, the steppe and Italy. Each one
  // reuses a paper-doll `art` (so soldiers wear it) and names its material
  // (so its icon reads as its own piece). Every item must also be listed in a
  // source table (class kits, hero charms, map merchants): see
  // tests/itemSources.test.ts.
  // =========================================================================

  // ---- weapons: spears and lances -------------------------------------------
  { id: 'ash_dory', name: 'Ash-wood dory', slot: 'weapon', weaponKind: 'spear', art: 'spear', tier: 1, value: 28, material: 'wood',
    mods: { dmg: 6.8, reach: 2.0, atkTime: 1.35, chargeBonus: 0.45 }, desc: 'A long, plain ash shaft: outreaches the dory, hits a little softer.' },
  { id: 'sauroter_dory', name: 'Sauroter dory', slot: 'weapon', weaponKind: 'spear', art: 'spear', tier: 3, value: 105, material: 'bronze',
    mods: { dmg: 9.5, reach: 2.0, atkTime: 1.25, chargeBonus: 0.6 }, desc: 'Balanced by its bronze butt-spike, the "lizard-killer". A veteran\'s spear.' },
  { id: 'sarissa', name: 'Sarissa', slot: 'weapon', weaponKind: 'spear', art: 'spear', tier: 2, value: 75, twoHanded: true, material: 'wood',
    mods: { dmg: 7.5, reach: 2.4, atkTime: 1.45, chargeBonus: 0.7, speed: -0.03 }, desc: 'Macedonian pike. Two-handed: the longest reach in the line, but no shield.' },
  { id: 'lancea', name: 'Celtic leaf spear', slot: 'weapon', weaponKind: 'spear', art: 'spear_short', tier: 1, value: 30, material: 'iron',
    mods: { dmg: 7, reach: 1.65, atkTime: 1.2, chargeBonus: 0.3, blockPierce: 0.05 }, desc: 'Broad iron leaf-blade on a short haft. Bites past a shield rim.' },
  { id: 'hasta', name: 'Hasta', slot: 'weapon', weaponKind: 'spear', art: 'spear', tier: 2, value: 55, material: 'iron',
    mods: { dmg: 8, reach: 1.85, atkTime: 1.15, chargeBonus: 0.35 }, desc: 'Thrusting spear of the Italian third line: shorter than a dory, quicker.' },
  { id: 'kontos', name: 'Kontos', slot: 'weapon', weaponKind: 'lance', art: 'lance', tier: 3, value: 120, twoHanded: true, material: 'wood',
    mods: { dmg: 9, reach: 2.4, atkTime: 1.4, chargeBonus: 1.0 }, desc: 'Steppe lance held in both hands. Nothing hits harder in a charge.' },

  // ---- weapons: javelins ------------------------------------------------------
  { id: 'ankyle', name: 'Thonged darts', slot: 'weapon', weaponKind: 'javelins', art: 'javelins', tier: 1, value: 25, material: 'wood',
    mods: { rangedDmg: 9, range: 8, ammo: 5, shotTime: 1.7, dmg: 4.5, reach: 1.5, atkTime: 1.15, armorPierce: 0.2 }, desc: 'Light darts flung with a finger-loop: five quick throws, longer range.' },
  { id: 'gaesum', name: 'Gaesum', slot: 'weapon', weaponKind: 'javelins', art: 'javelins', tier: 2, value: 55, material: 'iron',
    mods: { rangedDmg: 12, range: 7, ammo: 4, shotTime: 2.0, dmg: 6, reach: 1.6, atkTime: 1.2, chargeBonus: 0.15, armorPierce: 0.3 }, desc: 'Gallic iron javelin; the last one makes a fair charging spear.' },
  { id: 'pilum', name: 'Pilum', slot: 'weapon', weaponKind: 'javelins', art: 'javelins', tier: 2, value: 60, material: 'iron',
    mods: { rangedDmg: 12.5, range: 6.5, ammo: 3, shotTime: 1.9, dmg: 6.5, reach: 1.5, atkTime: 1.15, blockPierce: 0.25, armorPierce: 0.35 }, desc: 'Roman heavy javelin. Its soft shank bends in a shield and drags it down.' },
  { id: 'soliferrum', name: 'Soliferrum', slot: 'weapon', weaponKind: 'javelins', art: 'javelins', tier: 2, value: 60, material: 'iron',
    mods: { rangedDmg: 15, range: 6.5, ammo: 2, shotTime: 2.1, dmg: 5.5, reach: 1.5, atkTime: 1.2, blockPierce: 0.08, armorPierce: 0.5 }, desc: 'Iberian javelin forged in one piece of iron. Two throws that go through anything.' },

  // ---- weapons: swords --------------------------------------------------------
  { id: 'akinakes', name: 'Akinakes', slot: 'weapon', weaponKind: 'sword', art: 'sword', tier: 1, value: 30, material: 'iron',
    mods: { dmg: 7.2, reach: 1.0, atkTime: 0.9 }, desc: 'Persian and Scythian short sword, worn on the right thigh. Very quick.' },
  { id: 'iron_xiphos', name: 'Iron xiphos', slot: 'weapon', weaponKind: 'sword', art: 'sword', tier: 2, value: 50, material: 'iron',
    mods: { dmg: 8.5, reach: 1.1, atkTime: 0.95 }, desc: 'A xiphos in good forged iron: holds an edge and strikes fast.' },
  { id: 'gladius', name: 'Gladius hispaniensis', slot: 'weapon', weaponKind: 'sword', art: 'sword', tier: 3, value: 105, material: 'steel',
    mods: { dmg: 10, reach: 1.1, atkTime: 0.95, blockPierce: 0.06 }, desc: 'The Spanish sword Rome adopted: a stabbing point in fine Celtiberian steel.' },
  { id: 'makhaira', name: 'Makhaira', slot: 'weapon', weaponKind: 'sword', art: 'kopis', tier: 2, value: 65, material: 'iron',
    mods: { dmg: 10, reach: 1.15, atkTime: 1.2, blockPierce: 0.06, moraleShock: 0.1 }, desc: 'Heavy single-edged chopper. Slow, but its wounds unnerve.' },
  { id: 'sica', name: 'Sica', slot: 'weapon', weaponKind: 'sword', art: 'kopis', tier: 2, value: 60, material: 'iron',
    mods: { dmg: 8, reach: 1.0, atkTime: 0.85, blockPierce: 0.12 }, desc: 'Thracian curved blade that hooks around a shield. Short and vicious.' },
  { id: 'chieftain_sword', name: "Chieftain's longsword", slot: 'weapon', weaponKind: 'sword', art: 'longsword', tier: 3, value: 115, material: 'steel',
    mods: { dmg: 11.5, reach: 1.4, atkTime: 1.25, moraleShock: 0.15 }, desc: 'Pattern-welded blade in a bronze-mounted scabbard. Men break before it.' },

  // ---- weapons: axes and maces ---------------------------------------------------
  { id: 'sagaris', name: 'Sagaris', slot: 'weapon', weaponKind: 'axe', art: 'axe', tier: 2, value: 60, material: 'iron',
    mods: { dmg: 10, reach: 1.15, atkTime: 1.3, blockPierce: 0.18 }, desc: 'Steppe battle-axe with a pick at the back. Lighter and quicker than a war axe.' },
  { id: 'dolabra', name: 'Dolabra', slot: 'weapon', weaponKind: 'axe', art: 'axe', tier: 2, value: 55, material: 'iron',
    mods: { dmg: 11.5, reach: 1.1, atkTime: 1.55, blockPierce: 0.22 }, desc: 'A sapper\'s pick-axe. Digs ditches by day, opens shields by day too.' },
  { id: 'labrys', name: 'Cretan labrys', slot: 'weapon', weaponKind: 'axe', art: 'axe', tier: 3, value: 110, twoHanded: true, material: 'bronze',
    mods: { dmg: 14, reach: 1.25, atkTime: 1.6, blockPierce: 0.25, moraleShock: 0.2 }, desc: 'Sacred double axe, swung in both hands. Terrible and slow.' },
  { id: 'bronze_mace', name: 'Bronze mace', slot: 'weapon', weaponKind: 'club', art: 'club', tier: 2, value: 45, material: 'bronze',
    mods: { dmg: 8, reach: 1.0, atkTime: 1.2, blockPierce: 0.05, moraleShock: 0.5 }, desc: 'Flanged bronze head on a short haft. Rings helmets like bells.' },

  // ---- weapons: bows and slings ---------------------------------------------------
  { id: 'self_bow', name: 'Hunting bow', slot: 'weapon', weaponKind: 'bow', art: 'bow', tier: 1, value: 30, twoHanded: true, material: 'wood',
    mods: { rangedDmg: 5.5, range: 11.5, ammo: 16, shotTime: 2.1, dmg: 2.5, reach: 1.0, atkTime: 1.1, armorPierce: 0.2 }, desc: 'A plain wooden bow. Two-handed; weaker than a composite.' },
  { id: 'persian_bow', name: 'Persian bow', slot: 'weapon', weaponKind: 'bow', art: 'bow', tier: 2, value: 65, twoHanded: true, material: 'horn',
    mods: { rangedDmg: 6.5, range: 12.5, ammo: 26, shotTime: 1.75, dmg: 2.5, reach: 1.0, atkTime: 1.1, armorPierce: 0.3 }, desc: 'Long-eared composite bow of the Great King. Shoots arrows in clouds.' },
  { id: 'gorytos_bow', name: 'Gorytos bow', slot: 'weapon', weaponKind: 'bow', art: 'bow_short', tier: 3, value: 110, twoHanded: true, material: 'horn',
    mods: { rangedDmg: 7.5, range: 11.5, ammo: 32, shotTime: 1.5, accuracy: 0.03, dmg: 3, reach: 1.0, atkTime: 1.1, armorPierce: 0.45 }, desc: 'A royal steppe bow in a gilded bow-case. Fast, deep quiver.' },
  { id: 'shepherd_sling', name: "Shepherd's sling", slot: 'weapon', weaponKind: 'sling', art: 'sling', tier: 1, value: 15, material: 'linen',
    mods: { rangedDmg: 6, range: 10.5, ammo: 28, shotTime: 2.0, dmg: 2.5, reach: 1.0, atkTime: 1.1, armorPierce: 0.2 }, desc: 'Woven wool cords and a pouch of river stones: shorter range, quicker and plenty of shot.' },
  { id: 'staff_sling', name: 'Staff sling', slot: 'weapon', weaponKind: 'sling', art: 'sling', tier: 2, value: 50, twoHanded: true, material: 'wood',
    mods: { rangedDmg: 9.5, range: 13, ammo: 16, shotTime: 2.5, dmg: 3, reach: 1.2, atkTime: 1.2, armorPierce: 0.35 }, desc: 'A sling on a staff, two-handed: heavy stones, slow to reload.' },
  { id: 'achaean_sling', name: 'Achaean sling', slot: 'weapon', weaponKind: 'sling', art: 'sling', tier: 3, value: 100, material: 'leather',
    mods: { rangedDmg: 8.5, range: 13, ammo: 24, shotTime: 2.0, accuracy: 0.06, dmg: 2.5, reach: 1.0, atkTime: 1.1, armorPierce: 0.4 }, desc: 'Triple-thonged sling of Aegion, where boys shoot at rings for their bread.' },

  // ---- shields ------------------------------------------------------------------
  { id: 'hide_shield', name: 'Hide shield', slot: 'shield', shieldKind: 'oval', art: 'oval', tier: 1, value: 22, shieldWall: true, material: 'leather',
    mods: { block: 0.34, speed: -0.02 }, desc: 'Ox-hide stretched on a frame. Light; it still locks in a wall.' },
  { id: 'gerron', name: 'Gerron', slot: 'shield', shieldKind: 'oval', art: 'oval', tier: 1, value: 25, shieldWall: true, material: 'wicker',
    mods: { block: 0.4, speed: -0.05 }, desc: 'Tall Persian wicker shield. Stops arrows; heavy to carry.' },
  { id: 'scutum', name: 'Scutum', slot: 'shield', shieldKind: 'oval', art: 'oval', tier: 2, value: 60, shieldWall: true, material: 'wood',
    mods: { block: 0.46, armor: 1, speed: -0.06, stamina: -6 }, desc: 'Big curved Italian shield of glued planks and hide.' },
  { id: 'legion_scutum', name: 'Legionary scutum', slot: 'shield', shieldKind: 'oval', art: 'oval', tier: 3, value: 115, shieldWall: true, material: 'iron',
    mods: { block: 0.5, armor: 2, speed: -0.07, stamina: -8 }, desc: 'Iron-rimmed scutum with a heavy boss. A wall on its own.' },
  { id: 'punic_shield', name: 'Punic oval shield', slot: 'shield', shieldKind: 'oval', art: 'oval', tier: 2, value: 60, shieldWall: true, material: 'bronze',
    mods: { block: 0.43, armor: 1, speed: -0.05, morale: 2 }, desc: 'Bronze-faced oval of the Libyan spearmen, painted with the sign of Tanit.' },
  { id: 'bossed_shield', name: 'Bronze-bossed shield', slot: 'shield', shieldKind: 'oval', art: 'oval', tier: 3, value: 110, shieldWall: true, material: 'bronze',
    mods: { block: 0.46, armor: 1.5, speed: -0.04, morale: 4 }, desc: 'A chieftain\'s long shield, its boss worked in swirling bronze.' },
  { id: 'macedonian_aspis', name: 'Macedonian aspis', slot: 'shield', shieldKind: 'hoplon', art: 'hoplon', tier: 2, value: 55, shieldWall: true, material: 'bronze',
    mods: { block: 0.42, armor: 1, speed: -0.04, stamina: -6 }, desc: 'Smaller, flatter aspis on a neck strap: it leaves both hands for the pike.' },
  { id: 'boeotian_shield', name: 'Boeotian shield', slot: 'shield', shieldKind: 'hoplon', art: 'hoplon', tier: 2, value: 65, shieldWall: true, material: 'bronze',
    mods: { block: 0.47, armor: 1, speed: -0.06, stamina: -9 }, desc: 'Hoplon with cut-away sides for a spear to pass. The Theban pattern.' },
  { id: 'spartan_aspis', name: 'Lakedaimonian aspis', slot: 'shield', shieldKind: 'hoplon', art: 'hoplon', tier: 3, value: 125, shieldWall: true, material: 'bronze',
    mods: { block: 0.53, armor: 1.5, speed: -0.07, stamina: -10, morale: 5 }, desc: 'Come back with it or on it.' },
  { id: 'caetra', name: 'Caetra', slot: 'shield', shieldKind: 'buckler', art: 'buckler', tier: 2, value: 40, material: 'leather',
    mods: { block: 0.3, speed: -0.01 }, desc: 'Small round Iberian shield, made for parrying. No shield wall.' },
  { id: 'bronze_pelte', name: 'Bronze-faced pelte', slot: 'shield', shieldKind: 'buckler', art: 'pelte', tier: 2, value: 45, material: 'bronze',
    mods: { block: 0.31, armor: 0.5, speed: -0.02 }, desc: 'A pelte sheathed in thin bronze. No shield wall.' },

  // ---- helmets ------------------------------------------------------------------
  { id: 'wolfskin_cap', name: 'Wolfskin cap', slot: 'helmet', art: 'cap', tier: 1, value: 15, material: 'leather',
    mods: { armor: 1, morale: 2 }, desc: 'A wolf\'s mask worn over the brow.' },
  { id: 'bronze_skullcap', name: 'Bronze skullcap', slot: 'helmet', art: 'cap', tier: 1, value: 18, material: 'bronze',
    mods: { armor: 1.5 }, desc: 'A plain hammered bowl.' },
  { id: 'felt_pilos', name: 'Felt pilos', slot: 'helmet', art: 'pilos', tier: 1, value: 12, material: 'felt',
    mods: { armor: 1, stamina: 5 }, desc: 'The traveller\'s felt cap. Cool and light.' },
  { id: 'konos', name: 'Konos helmet', slot: 'helmet', art: 'pilos', tier: 1, value: 30, material: 'bronze',
    mods: { armor: 2, morale: 1 }, desc: 'Bronze cone with a narrow brim.' },
  { id: 'persian_tiara', name: 'Persian tiara', slot: 'helmet', art: 'hood', tier: 1, value: 15, material: 'felt',
    mods: { armor: 1, morale: 2 }, desc: 'Soft felt hood with lappets tied under the chin.' },
  { id: 'iron_pilos', name: 'Iron pilos', slot: 'helmet', art: 'pilos', tier: 2, value: 45, material: 'iron',
    mods: { armor: 3, accuracy: 0.01 }, desc: 'Late pilos in iron: tough and open-faced.' },
  { id: 'phrygian', name: 'Phrygian helm', slot: 'helmet', art: 'thracian', tier: 2, value: 50, material: 'bronze',
    mods: { armor: 3, morale: 2, stamina: 3 }, desc: 'Tall forward-curling crown and cheek pieces.' },
  { id: 'illyrian', name: 'Illyrian helm', slot: 'helmet', art: 'chalcidian', tier: 2, value: 50, material: 'bronze',
    mods: { armor: 3.5, morale: 1, accuracy: -0.01 }, desc: 'Square-faced helm with a crest channel. Snug and solid.' },
  { id: 'apulo_corinthian', name: 'Apulo-Corinthian helm', slot: 'helmet', art: 'corinthian', tier: 2, value: 50, material: 'bronze',
    mods: { armor: 3, morale: 3 }, desc: 'A Corinthian worn pushed up like a cap: the look without the blindness.' },
  { id: 'coolus', name: 'Coolus helm', slot: 'helmet', art: 'montefortino', tier: 2, value: 45, material: 'bronze',
    mods: { armor: 3, morale: 1, accuracy: 0.01 }, desc: 'Round Gallic bowl with a little neck guard.' },
  { id: 'negau', name: 'Negau helm', slot: 'helmet', art: 'montefortino', tier: 2, value: 50, material: 'bronze',
    mods: { armor: 3.5, morale: 2, accuracy: -0.02 }, desc: 'Ridged Alpine helm of the Etruscans. Low brim, deep bowl.' },
  { id: 'hellenistic', name: 'Hellenistic helm', slot: 'helmet', art: 'attic', tier: 3, value: 90, material: 'iron',
    mods: { armor: 4, morale: 3, accuracy: 0.02 }, desc: 'The Successors\' practical helm: brow peak, hinged cheeks, good view.' },
  { id: 'iron_boeotian', name: 'Iron Boeotian helm', slot: 'helmet', art: 'boeotian', tier: 3, value: 90, material: 'iron',
    mods: { armor: 4, morale: 2, accuracy: 0.03 }, desc: 'Xenophon\'s choice for a horseman, in iron.' },
  { id: 'crested_chalcidian', name: 'Plumed Chalcidian helm', slot: 'helmet', art: 'chalcidian', tier: 3, value: 95, material: 'bronze',
    mods: { armor: 4, morale: 4, accuracy: 0.01 }, desc: 'Silver-browed Chalcidian with a tall horsehair crest.' },
  { id: 'gilded_thracian', name: 'Gilded Thracian helm', slot: 'helmet', art: 'thracian', tier: 3, value: 100, material: 'gold',
    mods: { armor: 4, morale: 5, accuracy: 0.01 }, desc: 'A prince\'s helm with gilded eyebrows and beard on the cheeks.' },
  { id: 'horned_helm', name: 'Horned helm', slot: 'helmet', art: 'montefortino', tier: 3, value: 95, material: 'bronze',
    mods: { armor: 3.5, morale: 7 }, desc: 'Ceremonial bronze cap with two horns. More awe than armour.' },

  // ---- body armour ----------------------------------------------------------------
  { id: 'hide_jerkin', name: 'Hide jerkin', slot: 'armor', art: 'leather', tier: 1, value: 18, material: 'leather',
    mods: { armor: 1.5, morale: 3 }, desc: 'Untanned furs of beasts the wearer killed himself.' },
  { id: 'felt_coat', name: 'Felt kaftan', slot: 'armor', art: 'leather', tier: 1, value: 20, material: 'felt',
    mods: { armor: 2, stamina: 6 }, desc: 'Thick felt coat of the steppe. Warm, light, soaks up a cut.' },
  { id: 'quilted', name: 'Quilted tunic', slot: 'armor', art: 'leather', tier: 1, value: 25, material: 'linen',
    mods: { armor: 2.5, speed: -0.01 }, desc: 'Layers of stitched linen and wool stuffing.' },
  { id: 'spolas', name: 'Spolas', slot: 'armor', art: 'leather', tier: 1, value: 35, material: 'leather',
    mods: { armor: 3, speed: -0.01 }, desc: 'Leather corselet with shoulder flaps, as Xenophon\'s men wore.' },
  { id: 'painted_linothorax', name: 'Painted linothorax', slot: 'armor', art: 'linothorax', tier: 2, value: 60, material: 'linen',
    mods: { armor: 4, speed: -0.02, morale: 2 }, desc: 'Glued linen in bright meander borders. Proud and light.' },
  { id: 'scaled_linothorax', name: 'Scaled linothorax', slot: 'armor', art: 'linothorax', tier: 2, value: 65, material: 'linen',
    mods: { armor: 4.5, speed: -0.03, stamina: -3 }, desc: 'Linen with bronze scales over the belly.' },
  { id: 'horn_scale', name: 'Horn scale', slot: 'armor', art: 'scale', tier: 2, value: 60, material: 'horn',
    mods: { armor: 4.5, speed: -0.03, stamina: -3 }, desc: 'Sarmatian scales cut from horse hooves. Light for scale.' },
  { id: 'persian_scale', name: 'Persian scale coat', slot: 'armor', art: 'scale', tier: 2, value: 75, material: 'bronze',
    mods: { armor: 5.5, speed: -0.06, stamina: -7 }, desc: 'Long-sleeved coat of small bronze scales. Heavy.' },
  { id: 'triple_disc', name: 'Triple-disc cuirass', slot: 'armor', art: 'cuirass', tier: 2, value: 70, material: 'bronze',
    mods: { armor: 4.5, speed: -0.04, stamina: -4, morale: 2 }, desc: 'Three bronze discs front and back: Samnite pride.' },
  { id: 'bell_cuirass', name: 'Bell cuirass', slot: 'armor', art: 'cuirass', tier: 2, value: 70, material: 'bronze',
    mods: { armor: 5, speed: -0.07, stamina: -8, morale: 2 }, desc: 'Old-fashioned bronze bell, flared at the hips. Grandfather\'s armour.' },
  { id: 'iron_scale', name: 'Iron scale', slot: 'armor', art: 'scale', tier: 3, value: 100, material: 'iron',
    mods: { armor: 6, speed: -0.06, stamina: -8 }, desc: 'Iron scales on leather: proof against arrows.' },
  { id: 'hamata', name: 'Lorica hamata', slot: 'armor', art: 'mail', tier: 3, value: 100, material: 'iron',
    mods: { armor: 5.5, speed: -0.04, stamina: -6 }, desc: 'Italian mail shirt with doubled shoulders. Lighter than Gallic mail.' },
  { id: 'noble_mail', name: "Noble's mail", slot: 'armor', art: 'mail', tier: 3, value: 120, material: 'iron',
    mods: { armor: 6.5, speed: -0.06, stamina: -10, morale: 2 }, desc: 'Fine riveted rings with a bronze-hooked cape. A chieftain\'s fortune.' },
  { id: 'plated_linothorax', name: 'Plated linothorax', slot: 'armor', art: 'linothorax', tier: 3, value: 105, material: 'bronze',
    mods: { armor: 5.5, speed: -0.04, stamina: -5 }, desc: 'Linen faced with bronze plates and scales. Most of a cuirass for less weight.' },
  { id: 'iron_cuirass', name: 'Iron cuirass', slot: 'armor', art: 'cuirass', tier: 3, value: 125, material: 'iron',
    mods: { armor: 7, speed: -0.09, stamina: -12, morale: 3 }, desc: 'A king\'s iron cuirass, gold-trimmed. The heaviest there is.' },

  // ---- trinkets (not drawn) ---------------------------------------------------------
  { id: 'eye_bead', name: 'Eye bead', slot: 'trinket', art: 'none', tier: 1, value: 30, material: 'faience',
    mods: { accuracy: 0.05 }, desc: 'Blue glass eye against the evil eye. +accuracy.' },
  { id: 'wolf_tooth', name: 'Wolf-tooth string', slot: 'trinket', art: 'none', tier: 1, value: 30, material: 'bone',
    mods: { speed: 0.03, morale: 2 }, desc: 'The wolf lends his legs. +speed, +morale.' },
  { id: 'torc', name: 'Bronze torc', slot: 'trinket', art: 'none', tier: 1, value: 30, material: 'bronze',
    mods: { morale: 6, hp: 3 }, desc: 'Twisted neck-ring of a free warrior. +morale, +HP.' },
  { id: 'hermes_token', name: 'Hermes token', slot: 'trinket', art: 'none', tier: 1, value: 30, material: 'bronze',
    mods: { speed: 0.05, stamina: -8 }, desc: 'Winged sandal of the messenger. +speed, but you tire sooner.' },
  { id: 'votive_shield', name: 'Votive shield', slot: 'trinket', art: 'none', tier: 1, value: 30, material: 'bronze',
    mods: { block: 0.04 }, desc: 'A tiny shield vowed at a shrine. +block.' },
  { id: 'iron_ring', name: 'Iron ring', slot: 'trinket', art: 'none', tier: 1, value: 30, material: 'iron',
    mods: { armor: 0.5, hp: 2 }, desc: 'Plain iron, as the Spartans wore. +armour, +HP.' },
  { id: 'knucklebones', name: 'Knucklebones', slot: 'trinket', art: 'none', tier: 1, value: 30, material: 'bone',
    mods: { xpBonus: 0.15 }, desc: 'Astragali for games by the fire. +15% XP.' },
  { id: 'gorgoneion', name: 'Gorgoneion', slot: 'trinket', art: 'none', tier: 2, value: 45, material: 'silver',
    mods: { moraleShock: 0.2, morale: 4 }, desc: 'Medusa\'s face turns the enemy\'s heart to stone. +morale shock.' },
  { id: 'bulla', name: 'Golden bulla', slot: 'trinket', art: 'none', tier: 2, value: 45, material: 'gold',
    mods: { hp: 4, morale: 5 }, desc: 'Etruscan locket worn since boyhood. +HP, +morale.' },
  { id: 'horse_pendant', name: 'Horse pendant', slot: 'trinket', art: 'none', tier: 2, value: 45, material: 'bronze',
    mods: { chargeBonus: 0.15 }, desc: 'Poseidon Hippios gives the charge its weight. +charge.' },
  { id: 'lion_claw', name: 'Lion claw', slot: 'trinket', art: 'none', tier: 2, value: 45, material: 'bone',
    mods: { dmg: 1, moraleShock: 0.1 }, desc: 'From a lion of the Macedonian hills. +damage, +morale shock.' },
  { id: 'serpent_ring', name: 'Serpent ring', slot: 'trinket', art: 'none', tier: 2, value: 45, material: 'silver',
    mods: { hp: 4, stamina: 8 }, desc: 'Coiled silver snake of Asklepios. +HP, +stamina.' },
  { id: 'signet_ring', name: 'Signet ring', slot: 'trinket', art: 'none', tier: 2, value: 45, material: 'gold',
    mods: { xpBonus: 0.15, morale: 5 }, desc: 'A gold seal: the mark of a man who gives orders. +XP, +morale.' },
  { id: 'curse_tablet', name: 'Curse tablet', slot: 'trinket', art: 'none', tier: 2, value: 45, material: 'stone',
    mods: { blockPierce: 0.07, morale: -3 }, desc: 'Names of foes scratched and nailed down. +shield-break, but it weighs on you.' },
  { id: 'bes_amulet', name: 'Bes amulet', slot: 'trinket', art: 'none', tier: 2, value: 45, material: 'faience',
    mods: { morale: 6, stamina: 10 }, desc: 'The grinning dwarf god scares off ill luck. +morale, +stamina.' },
  { id: 'thumb_ring', name: "Archer's thumb ring", slot: 'trinket', art: 'none', tier: 2, value: 45, material: 'bone',
    mods: { accuracy: 0.06, block: -0.03 }, desc: 'Draws the string clean. +accuracy, but clumsy behind a shield.' },
  { id: 'faravahar', name: 'Winged disc', slot: 'trinket', art: 'none', tier: 2, value: 45, material: 'gold',
    mods: { morale: 8, accuracy: 0.02 }, desc: 'Persian winged sun in gold. +morale, +accuracy.' },
  { id: 'gold_torc', name: 'Gold torc', slot: 'trinket', art: 'none', tier: 3, value: 80, material: 'gold',
    mods: { morale: 8, hp: 8 }, desc: 'Heavy gold neck-ring of a king among Celts. +morale, +HP.' },
  { id: 'gold_stag', name: 'Gold stag plaque', slot: 'trinket', art: 'none', tier: 3, value: 80, material: 'gold',
    mods: { morale: 5, chargeBonus: 0.15, hp: 4 }, desc: 'Shield badge of a steppe lord: a stag with folded legs. +charge, +morale, +HP.' },
  { id: 'pythian_token', name: 'Pythian crown', slot: 'trinket', art: 'none', tier: 3, value: 80, material: 'silver',
    mods: { xpBonus: 0.35, morale: 4 }, desc: 'Laurel from Delphi, given to a victor of the games. +35% XP, +morale.' },
  // ---- set pieces (docs/ITEMS.md "Sets"): built on a base item, always at the set's rarity
  { id: 'agoge_dory', name: 'Agoge dory', slot: 'weapon', weaponKind: 'spear', art: 'spear', tier: 3, value: 45,
    mods: { dmg: 7, reach: 1.9, atkTime: 1.3, chargeBonus: 0.4 }, desc: 'Set: Agoge of Sparta. Long thrusting spear. Reach; braces against charges.', material: 'iron', set: 'agoge' },
  { id: 'agoge_pilos', name: 'Agoge pilos', slot: 'helmet', art: 'pilos', tier: 3, value: 38,
    mods: { armor: 2 }, desc: 'Set: Agoge of Sparta. Conical bronze helmet.', material: 'bronze', set: 'agoge' },
  { id: 'crimson_exomis', name: 'Crimson exomis', slot: 'armor', art: 'leather', tier: 3, value: 53,
    mods: { armor: 3, speed: -0.01 }, desc: 'Set: Agoge of Sparta. Leather corselet with shoulder flaps, as Xenophon\'s men wore.', material: 'leather', set: 'agoge' },
  { id: 'fox_alopekis', name: 'Fox-skin alopekis', slot: 'helmet', art: 'hood', tier: 3, value: 15,
    mods: { armor: 1 }, desc: 'Set: Peltast of Thrace. Pointed felt hood of the steppe riders.', material: 'felt', set: 'peltast' },
  { id: 'peltast_crescent', name: 'Peltast\'s crescent', slot: 'shield', shieldKind: 'buckler', art: 'pelte', tier: 3, value: 30,
    mods: { block: 0.27, speed: -0.01 }, desc: 'Set: Peltast of Thrace. Crescent wicker shield of the Thracian peltast. No shield wall.', material: 'wicker', set: 'peltast' },
  { id: 'thracian_darts', name: 'Thracian darts', slot: 'weapon', weaponKind: 'javelins', art: 'javelins', tier: 3, value: 38,
    mods: { rangedDmg: 11, range: 7, ammo: 3, shotTime: 2, dmg: 5, reach: 1.5, atkTime: 1.2, chargeBonus: 0.1, armorPierce: 0.25 }, desc: 'Set: Peltast of Thrace. Three heavy throws, then a short spear.', material: 'wood', set: 'peltast' },
  { id: 'gortyn_bow', name: 'Bow of Gortyn', slot: 'weapon', weaponKind: 'bow', art: 'bow', tier: 3, value: 113, twoHanded: true,
    mods: { rangedDmg: 7.5, range: 14, ammo: 18, shotTime: 1.9, accuracy: 0.04, dmg: 3, reach: 1, atkTime: 1.1, armorPierce: 0.4 }, desc: 'Set: Cretan Bowman. Horn-backed bow of the island archers. The longest reach.', set: 'cretan' },
  { id: 'cretan_cap', name: 'Cretan archer\'s cap', slot: 'helmet', art: 'cap', tier: 3, value: 12,
    mods: { armor: 1 }, desc: 'Set: Cretan Bowman. Better than nothing.', material: 'leather', set: 'cretan' },
  { id: 'gortyn_string', name: 'Gortyn bowstring', slot: 'trinket', art: 'none', tier: 3, value: 68,
    mods: { accuracy: 0.06, block: -0.03 }, desc: 'Set: Cretan Bowman. Draws the string clean. +accuracy, but clumsy behind a shield.', material: 'bone', set: 'cretan' },
  { id: 'brennus_blade', name: 'Brennus\'s blade', slot: 'weapon', weaponKind: 'sword', art: 'longsword', tier: 3, value: 140,
    mods: { dmg: 10, reach: 1.35, atkTime: 1.25 }, desc: 'Set: Warband of Brennus. Long iron slashing sword.', material: 'iron', set: 'brennus' },
  { id: 'boar_crest_helm', name: 'Boar-crest helm', slot: 'helmet', art: 'montefortino', tier: 3, value: 90,
    mods: { armor: 3, morale: 1, accuracy: 0.01 }, desc: 'Set: Warband of Brennus. Round Gallic bowl with a little neck guard.', material: 'bronze', set: 'brennus' },
  { id: 'brennus_mail', name: 'Brennus\'s mail', slot: 'armor', art: 'mail', tier: 3, value: 240,
    mods: { armor: 6.5, speed: -0.06, stamina: -10, morale: 2 }, desc: 'Set: Warband of Brennus. Fine riveted rings with a bronze-hooked cape. A chieftain\'s fortune.', material: 'iron', set: 'brennus' },
  { id: 'spiral_shield', name: 'Spiral-boss shield', slot: 'shield', shieldKind: 'oval', art: 'oval', tier: 3, value: 220, shieldWall: true,
    mods: { block: 0.46, armor: 1.5, speed: -0.04, morale: 4 }, desc: 'Set: Warband of Brennus. A chieftain\'s long shield, its boss worked in swirling bronze.', material: 'bronze', set: 'brennus' },
  { id: 'immortal_bow', name: 'Immortal\'s bow', slot: 'weapon', weaponKind: 'bow', art: 'bow', tier: 3, value: 130, twoHanded: true,
    mods: { rangedDmg: 6.5, range: 12.5, ammo: 26, shotTime: 1.75, dmg: 2.5, reach: 1, atkTime: 1.1, armorPierce: 0.3 }, desc: 'Set: Immortals of Persia. Long-eared composite bow of the Great King. Shoots arrows in clouds.', material: 'horn', set: 'immortals' },
  { id: 'immortal_scale', name: 'Immortal\'s scale coat', slot: 'armor', art: 'scale', tier: 3, value: 150,
    mods: { armor: 5.5, speed: -0.06, stamina: -7 }, desc: 'Set: Immortals of Persia. Long-sleeved coat of small bronze scales. Heavy.', material: 'bronze', set: 'immortals' },
  { id: 'immortal_tiara', name: 'Immortal\'s tiara', slot: 'helmet', art: 'hood', tier: 3, value: 30,
    mods: { armor: 1, morale: 2 }, desc: 'Set: Immortals of Persia. Soft felt hood with lappets tied under the chin.', material: 'felt', set: 'immortals' },
  { id: 'golden_apple', name: 'Golden apple', slot: 'trinket', art: 'none', tier: 3, value: 90,
    mods: { hp: 4, morale: 5 }, desc: 'Set: Immortals of Persia. Etruscan locket worn since boyhood. +HP, +morale.', material: 'gold', set: 'immortals' },
  { id: 'theban_dory', name: 'Theban dory', slot: 'weapon', weaponKind: 'spear', art: 'spear', tier: 3, value: 210,
    mods: { dmg: 9.5, reach: 2, atkTime: 1.25, chargeBonus: 0.6 }, desc: 'Set: Sacred Band of Thebes. Balanced by its bronze butt-spike, the "lizard-killer". A veteran\'s spear.', material: 'bronze', set: 'sacred_band' },
  { id: 'band_shield', name: 'Shield of the Band', slot: 'shield', shieldKind: 'hoplon', art: 'hoplon', tier: 3, value: 240, shieldWall: true,
    mods: { block: 0.52, armor: 2, speed: -0.06, stamina: -8, morale: 4 }, desc: 'Set: Sacred Band of Thebes. A masterwork hoplon, passed father to son.', material: 'bronze', set: 'sacred_band' },
  { id: 'theban_helm', name: 'Theban helm', slot: 'helmet', art: 'corinthian', tier: 3, value: 180,
    mods: { armor: 4.5, morale: 5, accuracy: -0.05 }, desc: 'Set: Sacred Band of Thebes. Full-face bronze. Terrifying, but hard to see out of.', material: 'bronze', set: 'sacred_band' },
  { id: 'theban_linothorax', name: 'Theban linothorax', slot: 'armor', art: 'linothorax', tier: 3, value: 210,
    mods: { armor: 5.5, speed: -0.04, stamina: -5 }, desc: 'Set: Sacred Band of Thebes. Linen faced with bronze plates and scales. Most of a cuirass for less weight.', material: 'bronze', set: 'sacred_band' },
  { id: 'pelian_ash', name: 'Pelian ash', slot: 'weapon', weaponKind: 'spear', art: 'spear', tier: 3, value: 84,
    mods: { dmg: 6.8, reach: 2, atkTime: 1.35, chargeBonus: 0.45 }, desc: 'Set: Arms of Achilles. A long, plain ash shaft: outreaches the dory, hits a little softer.', material: 'wood', set: 'achilles' },
  { id: 'achilles_shield', name: 'Shield of Achilles', slot: 'shield', shieldKind: 'hoplon', art: 'hoplon', tier: 3, value: 480, shieldWall: true,
    mods: { block: 0.54, armor: 2, speed: -0.06, stamina: -8, morale: 6 }, desc: 'Set: Arms of Achilles. Silver-faced aspis of the royal guard.', material: 'silver', set: 'achilles' },
  { id: 'achilles_helm', name: 'Helm of Achilles', slot: 'helmet', art: 'attic', tier: 3, value: 285,
    mods: { armor: 4, morale: 6 }, desc: 'Set: Arms of Achilles. Plumed parade helm of the royal guard.', material: 'bronze', set: 'achilles' },
  { id: 'hephaestean_cuirass', name: 'Hephaestean cuirass', slot: 'armor', art: 'cuirass', tier: 3, value: 360,
    mods: { armor: 6.5, speed: -0.08, stamina: -10, morale: 4 }, desc: 'Set: Arms of Achilles. Sculpted bronze. The look of a hero.', material: 'bronze', set: 'achilles' },
  { id: 'thetis_anklet', name: 'Anklet of Thetis', slot: 'trinket', art: 'none', tier: 3, value: 240,
    mods: { morale: 8, hp: 8 }, desc: 'Set: Arms of Achilles. Heavy gold neck-ring of a king among Celts. +morale, +HP.', material: 'gold', set: 'achilles' },
  { id: 'alexander_kopis', name: 'Kopis of Alexander', slot: 'weapon', weaponKind: 'sword', art: 'kopis', tier: 3, value: 195,
    mods: { dmg: 9.5, reach: 1.15, atkTime: 1.1, blockPierce: 0.05 }, desc: 'Set: Panoply of Alexander. Forward-curved chopping sword.', material: 'iron', set: 'alexander' },
  { id: 'ilion_shield', name: 'Shield of Ilion', slot: 'shield', shieldKind: 'hoplon', art: 'hoplon', tier: 3, value: 120, shieldWall: true,
    mods: { block: 0.45, armor: 1, speed: -0.07, stamina: -10 }, desc: 'Set: Panoply of Alexander. Great round bronze-faced shield. Enables the shield wall.', material: 'bronze', set: 'alexander' },
  { id: 'lion_scalp_helm', name: 'Lion-scalp helm', slot: 'helmet', art: 'thracian', tier: 3, value: 150,
    mods: { armor: 3, morale: 2, stamina: 3 }, desc: 'Set: Panoply of Alexander. Tall forward-curling crown and cheek pieces.', material: 'bronze', set: 'alexander' },
  { id: 'issus_linothorax', name: 'Linothorax of Issus', slot: 'armor', art: 'linothorax', tier: 3, value: 180,
    mods: { armor: 4, speed: -0.02, morale: 2 }, desc: 'Set: Panoply of Alexander. Glued linen in bright meander borders. Proud and light.', material: 'linen', set: 'alexander' },
  { id: 'bucephalus_bit', name: 'Bit of Bucephalus', slot: 'trinket', art: 'none', tier: 3, value: 135,
    mods: { chargeBonus: 0.15 }, desc: 'Set: Panoply of Alexander. Poseidon Hippios gives the charge its weight. +charge.', material: 'bronze', set: 'alexander' },
  // ---- named legendaries (docs/ITEMS.md "Named legendaries"): fixed random stats and power
  { id: 'herakles_club', name: 'Club of Herakles', slot: 'weapon', weaponKind: 'club', art: 'club', tier: 3, value: 30,
    mods: { dmg: 6.5, reach: 1, atkTime: 1.15, moraleShock: 0.5 }, desc: 'Wild olive, torn from the ground at Nemea.', material: 'wood', named: true, bound: true, power: 'terror', fixed: { dmg: 3, atkSpeed: 2, accuracy: 2, moraleShock: 2 } },
  { id: 'nemean_pelt', name: 'Nemean lion pelt', slot: 'armor', art: 'leather', tier: 3, value: 54,
    mods: { armor: 1.5, morale: 3 }, desc: 'No arrow ever pierced it.', material: 'leather', named: true, bound: true, power: 'unshaken', missileWard: 0.4, fixed: { hp: 3, armor: 3, stamina: 2, steady: 2 } },
  { id: 'philoctetes_bow', name: 'Bow of Philoctetes', slot: 'weapon', weaponKind: 'bow', art: 'bow', tier: 3, value: 180, twoHanded: true,
    mods: { rangedDmg: 7, range: 13.5, ammo: 16, shotTime: 2, dmg: 2.5, reach: 1, atkTime: 1.1, armorPierce: 0.3 }, desc: 'Herakles\' bow; the arrows still carry the Hydra\'s venom.', named: true, bound: true, power: 'sunder', fixed: { rangedDmg: 3, range: 2, ammo: 2, armorPierce: 3 } },
  { id: 'minotaur_horn', name: 'Horn of the Minotaur', slot: 'trinket', art: 'none', tier: 3, value: 135,
    mods: { dmg: 1.5, hp: 6 }, desc: 'Cut from the bull of the labyrinth.', material: 'bone', named: true, bound: true, power: 'momentum', fixed: { hp: 3, morale: 3, stamina: 2, xpBonus: 2 } },
  { id: 'cyclops_hammer', name: 'Hammer of the Cyclopes', slot: 'weapon', weaponKind: 'club', art: 'club', tier: 3, value: 135,
    mods: { dmg: 9, reach: 1, atkTime: 1.2, blockPierce: 0.05, moraleShock: 0.5 }, desc: 'Struck the thunderbolts of Zeus.', material: 'bronze', named: true, bound: true, power: 'rend', fixed: { dmg: 3, atkSpeed: 2, accuracy: 2, moraleShock: 2 } },
  { id: 'harpy_helm', name: 'Harpy-wing helm', slot: 'helmet', art: 'chalcidian', tier: 3, value: 165,
    mods: { armor: 3, morale: 3, speed: 0.03 }, desc: 'Feathers that fell like knives.', material: 'bronze', named: true, bound: true, power: 'frenzy', fixed: { hp: 3, armor: 2, morale: 3, steady: 2 } },
  { id: 'chimera_cuirass', name: 'Chimera-hide cuirass', slot: 'armor', art: 'scale', tier: 3, value: 180,
    mods: { armor: 5.5, speed: -0.03, stamina: -3 }, desc: 'Lion, goat and serpent; it still smells of fire.', material: 'gold', named: true, bound: true, power: 'retribution', fixed: { hp: 3, armor: 3, stamina: 2, steady: 2 } },
  { id: 'poseidon_trident', name: 'Trident of Poseidon', slot: 'weapon', weaponKind: 'spear', art: 'spear', tier: 3, value: 165,
    mods: { dmg: 8, reach: 1.85, atkTime: 1.15, chargeBonus: 0.39 }, desc: 'Fished from the beast\'s jaws.', material: 'iron', named: true, bound: true, power: 'executioner', fixed: { dmg: 3, atkSpeed: 2, accuracy: 2, moraleShock: 2 } },
  { id: 'aegis_of_zeus', name: 'Aegis of Zeus', slot: 'shield', shieldKind: 'hoplon', art: 'hoplon', tier: 3, value: 480, shieldWall: true,
    mods: { block: 0.54, armor: 2, speed: -0.06, stamina: -8, morale: 11 }, desc: 'Goatskin of Amaltheia with the Gorgon\'s head.', material: 'silver', named: true, bound: true, power: 'aegis', fixed: { block: 3, armor: 3, hp: 2, morale: 2 } },
  { id: 'golden_fleece', name: 'Golden Fleece', slot: 'trinket', art: 'none', tier: 3, value: 240,
    mods: { morale: 5, chargeBonus: 0.15, hp: 4, xpBonus: 0.1 }, desc: 'Taken from Colchis by Jason.', material: 'gold', named: true, bound: true, power: 'second_wind', fixed: { hp: 3, morale: 3, stamina: 2, xpBonus: 2 } },
  { id: 'helm_of_hades', name: 'Helm of Hades', slot: 'helmet', art: 'boeotian', tier: 3, value: 270,
    mods: { armor: 4, morale: 2, accuracy: 0.03 }, desc: 'The Cap of Darkness.', material: 'iron', named: true, bound: true, power: 'steadfast', shroud: 0.3, fixed: { hp: 3, armor: 2, morale: 3, steady: 2 } },
  { id: 'harpe_of_perseus', name: 'Harpe of Perseus', slot: 'weapon', weaponKind: 'sword', art: 'kopis', tier: 3, value: 180,
    mods: { dmg: 8, reach: 1, atkTime: 0.85, blockPierce: 0.12, atkSpeed: 0.05 }, desc: 'The sickle that took the Gorgon\'s head.', material: 'iron', named: true, bound: true, power: 'blood_price', fixed: { dmg: 3, atkSpeed: 2, accuracy: 2, moraleShock: 2 } },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
export const ITEM_LIST: readonly ItemDef[] = defs;
/** Every item but set pieces and named legendaries: the pool of shops, markets and random drops (those have their own sources). */
export const BASE_ITEMS: readonly ItemDef[] = defs.filter((d) => !d.set && !d.named);

export function itemDef(id: string): ItemDef {
  const d = ITEMS[id];
  if (!d) throw new Error(`Unknown item ${id}`);
  return d;
}

/** Paint used for shields (field + emblem colours) and helmet crests. Palette keys from src/art/palette.ts. */
export interface ItemPaint {
  emblem?: string;
  field?: string;
  ink?: string;
}

/** An owned item instance. Kept small: it is serialised into saves. */
export interface Item {
  uid: string;
  def: string;
  rarity: Rarity;
  /** Condition 0..100. Low condition weakens the item. */
  cond: number;
  paint?: ItemPaint;
  /** Random stats set explicitly ("atkSpeed:2,hp:1"); missing = rolled from uid (src/data/affixes.ts). */
  aff?: string;
  /** Power set explicitly; missing = rolled from uid for epic and legendary items. */
  pow?: string;
}

/** Base stats by rarity: random stats and powers carry the rest (docs/ITEMS.md "Rarity tiers"). */
export const RARITY_MULT: Record<Rarity, number> = { common: 1, uncommon: 1.05, rare: 1.1, epic: 1.15, legendary: 1.2 };
/** Market value by rarity (prices kept from before random stats). */
export const VALUE_MULT: Record<Rarity, number> = { common: 1, uncommon: 1.12, rare: 1.25, epic: 1.4, legendary: 1.6 };
/** English labels; UI code should use t(`rarity.${r}`) (src/i18n). */
export const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };

/** Stats that improve with rarity and degrade with condition. */
const SCALED: (keyof StatMods)[] = ['hp', 'dmg', 'rangedDmg', 'block', 'armor', 'morale', 'chargeBonus', 'blockPierce', 'xpBonus'];
/** Stats a requirement penalty shrinks: the scaled ones and every random stat; reach, timings, range and negatives stay. */
const PENALISED: (keyof StatMods)[] = [...SCALED, 'accuracy', 'stamina', 'speed', 'armorPierce', 'moraleShock', 'ammo', 'atkSpeed', 'steady', 'koChance', 'goldBonus', 'durable'];

/**
 * Effective modifiers for an item instance: base stats scaled by rarity and
 * condition, plus its random stats. With the wearer's attributes, a missing
 * requirement takes 10% per point off its positive stats (src/data/gearRules.ts).
 */
export function itemMods(item: Item, attrs?: Attrs): StatMods {
  const out = baseMods(item);
  const aff = affixMods(item) as Record<string, number>;
  const o = out as Record<string, number>;
  for (const k of Object.keys(aff)) o[k] = round2((o[k] ?? 0) + aff[k]);
  const pen = gearPenalty(shortfall(attrs, item.def, item.rarity));
  if (pen > 0) {
    for (const k of PENALISED) {
      const v = o[k];
      if (v !== undefined && v > 0) o[k] = k === 'ammo' ? Math.round(v * (1 - pen)) : round2(v * (1 - pen));
    }
  }
  return out;
}

function baseMods(item: Item): StatMods {
  const def = itemDef(item.def);
  const r = RARITY_MULT[normalizeRarity(item.rarity)];
  const c = 0.6 + 0.4 * Math.max(0, Math.min(100, item.cond)) / 100;
  const out: StatMods = {};
  for (const k of Object.keys(def.mods) as (keyof StatMods)[]) {
    const v = def.mods[k]!;
    if (SCALED.includes(k) && v > 0) {
      out[k] = round2(v * r * (k === 'xpBonus' || k === 'morale' || k === 'hp' ? 1 : c));
    } else {
      out[k] = v;
    }
  }
  // Rare+ ranged gear carries extra ammunition.
  if (out.ammo && normalizeRarity(item.rarity) !== 'common') out.ammo = Math.round(out.ammo * (r + 0.05));
  return out;
}

export function itemValue(item: Item): number {
  const def = itemDef(item.def);
  return Math.round(def.value * VALUE_MULT[normalizeRarity(item.rarity)] * (0.5 + 0.5 * item.cond / 100));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
