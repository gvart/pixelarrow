/**
 * Data-driven item definitions. Every piece of equipment in the game is listed here.
 * Item *instances* (what heroes carry) reference a definition by id and add
 * rarity, condition and paint (shield emblem / colours).
 */

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

/** Map a stored item's legacy rarity in place (server rows, old saves). Returns the item. */
export function normalizeItem<T extends { rarity: Rarity } | null | undefined>(it: T): T {
  if (it && (it.rarity as string) !== normalizeRarity(it.rarity)) it.rarity = normalizeRarity(it.rarity);
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
}

export type ItemMaterial = 'bronze' | 'iron' | 'steel' | 'silver' | 'gold' | 'wood' | 'leather' | 'linen' | 'bone' | 'horn' | 'stone' | 'faience' | 'felt' | 'wicker';

const defs: ItemDef[] = [
  // ---- weapons -------------------------------------------------------------
  { id: 'dory', name: 'Dory spear', slot: 'weapon', weaponKind: 'spear', art: 'spear', tier: 1, value: 30,
    mods: { dmg: 7, reach: 1.9, atkTime: 1.3, chargeBonus: 0.4 }, desc: 'Long thrusting spear. Reach; braces against charges.' },
  { id: 'bronze_dory', name: 'Bronze-shod dory', slot: 'weapon', weaponKind: 'spear', art: 'spear', tier: 2, value: 60,
    mods: { dmg: 8.5, reach: 2.0, atkTime: 1.25, chargeBonus: 0.5 }, desc: 'A finer spear with a heavy bronze head.' },
  { id: 'xiphos', name: 'Xiphos', slot: 'weapon', weaponKind: 'sword', art: 'sword', tier: 1, value: 35,
    mods: { dmg: 8, reach: 1.1, atkTime: 1.0 }, desc: 'Short leaf-bladed sword. Quick.' },
  { id: 'kopis', name: 'Kopis', slot: 'weapon', weaponKind: 'sword', art: 'kopis', tier: 2, value: 65,
    mods: { dmg: 9.5, reach: 1.15, atkTime: 1.1, blockPierce: 0.05 }, desc: 'Forward-curved chopping sword.' },
  { id: 'falcata', name: 'Falcata', slot: 'weapon', weaponKind: 'sword', art: 'kopis', tier: 3, value: 110,
    mods: { dmg: 11, reach: 1.15, atkTime: 1.05, blockPierce: 0.08 }, desc: 'Iberian blade, feared in every port.' },
  { id: 'longsword', name: 'Celtic longsword', slot: 'weapon', weaponKind: 'sword', art: 'longsword', tier: 2, value: 70,
    mods: { dmg: 10, reach: 1.35, atkTime: 1.25 }, desc: 'Long iron slashing sword.' },
  { id: 'axe', name: 'War axe', slot: 'weapon', weaponKind: 'axe', art: 'axe', tier: 1, value: 35,
    mods: { dmg: 11, reach: 1.1, atkTime: 1.5, blockPierce: 0.15 }, desc: 'Slow, but splits shields.' },
  { id: 'club', name: 'Club', slot: 'weapon', weaponKind: 'club', art: 'club', tier: 1, value: 10,
    mods: { dmg: 6.5, reach: 1.0, atkTime: 1.15, moraleShock: 0.4 }, desc: 'Knotted olive wood. Cracks nerves as well as skulls.' },
  { id: 'sling', name: 'Sling', slot: 'weapon', weaponKind: 'sling', art: 'sling', tier: 1, value: 20,
    mods: { rangedDmg: 6, range: 11, ammo: 20, shotTime: 2.2, dmg: 2.5, reach: 1.0, atkTime: 1.1, armorPierce: 0.25 }, desc: 'Stones at long range: they bruise through armour.' },
  { id: 'balearic_sling', name: 'Balearic sling', slot: 'weapon', weaponKind: 'sling', art: 'sling', tier: 2, value: 55,
    mods: { rangedDmg: 7.5, range: 12, ammo: 24, shotTime: 2.0, accuracy: 0.08, dmg: 2.5, reach: 1.0, atkTime: 1.1, armorPierce: 0.3 }, desc: 'Island slingers never miss twice.' },
  { id: 'bow', name: 'Composite bow', slot: 'weapon', weaponKind: 'bow', art: 'bow', tier: 2, value: 60, twoHanded: true,
    mods: { rangedDmg: 7, range: 13, ammo: 16, shotTime: 2.0, dmg: 2.5, reach: 1.0, atkTime: 1.1, armorPierce: 0.3 }, desc: 'Two-handed. Long range arrows.' },
  { id: 'javelins', name: 'Akontia javelins', slot: 'weapon', weaponKind: 'javelins', art: 'javelins', tier: 1, value: 25,
    mods: { rangedDmg: 11, range: 7, ammo: 3, shotTime: 2.0, dmg: 5, reach: 1.5, atkTime: 1.2, chargeBonus: 0.1, armorPierce: 0.25 }, desc: 'Three heavy throws, then a short spear.' },
  { id: 'longche', name: 'Longche', slot: 'weapon', weaponKind: 'spear', art: 'spear_short', tier: 1, value: 28,
    mods: { dmg: 6.5, reach: 1.6, atkTime: 1.15, chargeBonus: 0.3 }, desc: 'Short thrusting spear: quicker than the dory, less reach.' },
  { id: 'xyston', name: 'Xyston lance', slot: 'weapon', weaponKind: 'lance', art: 'lance', tier: 2, value: 70, twoHanded: true,
    mods: { dmg: 8, reach: 2.2, atkTime: 1.35, chargeBonus: 0.9 }, desc: 'Long cornel-wood cavalry lance, butt-spiked. Wins the first clash.' },
  { id: 'falx', name: 'Falx', slot: 'weapon', weaponKind: 'polearm', art: 'falx', tier: 2, value: 75, twoHanded: true,
    mods: { dmg: 11.5, reach: 1.25, atkTime: 1.3, blockPierce: 0.22, chargeBonus: 0.15 }, desc: 'Two-handed Dacian sickle-blade. Hooks shields aside.' },
  { id: 'rhomphaia', name: 'Rhomphaia', slot: 'weapon', weaponKind: 'polearm', art: 'rhomphaia', tier: 2, value: 85, twoHanded: true,
    mods: { dmg: 12.5, reach: 1.6, atkTime: 1.45, blockPierce: 0.18 }, desc: 'Thracian long blade on a long haft. Cleaves helmets and shields.' },
  { id: 'cretan_bow', name: 'Cretan bow', slot: 'weapon', weaponKind: 'bow', art: 'bow', tier: 2, value: 75, twoHanded: true,
    mods: { rangedDmg: 7.5, range: 14, ammo: 18, shotTime: 1.9, accuracy: 0.04, dmg: 3, reach: 1.0, atkTime: 1.1, armorPierce: 0.4 }, desc: 'Horn-backed bow of the island archers. The longest reach.' },
  { id: 'scythian_bow', name: 'Scythian bow', slot: 'weapon', weaponKind: 'bow', art: 'bow_short', tier: 2, value: 70, twoHanded: true,
    mods: { rangedDmg: 7, range: 11, ammo: 30, shotTime: 1.55, dmg: 2.5, reach: 1.0, atkTime: 1.1, armorPierce: 0.45 }, desc: 'Short recurve bow, quick to draw from the saddle.' },
  { id: 'rhodian_sling', name: 'Rhodian sling', slot: 'weapon', weaponKind: 'sling', art: 'sling', tier: 2, value: 60,
    mods: { rangedDmg: 8, range: 12.5, ammo: 22, shotTime: 2.1, accuracy: 0.04, dmg: 2.5, reach: 1.0, atkTime: 1.1, armorPierce: 0.4 }, desc: 'Cast lead bullets: they outrange Persian bows.' },
  { id: 'saunion', name: 'Iron saunia', slot: 'weapon', weaponKind: 'javelins', art: 'javelins', tier: 2, value: 55,
    mods: { rangedDmg: 13, range: 7.5, ammo: 4, shotTime: 1.9, dmg: 6, reach: 1.5, atkTime: 1.2, blockPierce: 0.1, armorPierce: 0.35 }, desc: 'All-iron javelins that pin shields.' },

  // ---- shields ---------------------------------------------------------------
  { id: 'hoplon', name: 'Hoplon', slot: 'shield', shieldKind: 'hoplon', art: 'hoplon', tier: 1, value: 40, shieldWall: true,
    mods: { block: 0.45, armor: 1, speed: -0.07, stamina: -10 }, desc: 'Great round bronze-faced shield. Enables the shield wall.' },
  { id: 'aspis', name: 'Argive aspis', slot: 'shield', shieldKind: 'hoplon', art: 'hoplon', tier: 3, value: 120, shieldWall: true,
    mods: { block: 0.52, armor: 2, speed: -0.06, stamina: -8, morale: 4 }, desc: 'A masterwork hoplon, passed father to son.' },
  { id: 'thureos', name: 'Thureos', slot: 'shield', shieldKind: 'oval', art: 'oval', tier: 1, value: 30, shieldWall: true,
    mods: { block: 0.38, speed: -0.03 }, desc: 'Light oval shield with an iron boss.' },
  { id: 'celtic_shield', name: 'Celtic long shield', slot: 'shield', shieldKind: 'oval', art: 'oval', tier: 2, value: 55, shieldWall: true,
    mods: { block: 0.42, armor: 1, speed: -0.04 }, desc: 'Tall plank shield with a spina.' },
  { id: 'pelte', name: 'Pelte', slot: 'shield', shieldKind: 'buckler', art: 'pelte', tier: 1, value: 20,
    mods: { block: 0.27, speed: -0.01 }, desc: 'Crescent wicker shield of the Thracian peltast. No shield wall.' },
  { id: 'argyraspis', name: 'Silver aspis', slot: 'shield', shieldKind: 'hoplon', art: 'hoplon', tier: 3, value: 160, shieldWall: true,
    mods: { block: 0.54, armor: 2, speed: -0.06, stamina: -8, morale: 6 }, desc: 'Silver-faced aspis of the royal guard.' },
  { id: 'buckler', name: 'Buckler', slot: 'shield', shieldKind: 'buckler', art: 'buckler', tier: 1, value: 15,
    mods: { block: 0.2 }, desc: 'Small hand shield. No shield wall.' },

  // ---- helmets ---------------------------------------------------------------
  { id: 'cap', name: 'Leather cap', slot: 'helmet', art: 'cap', tier: 1, value: 8, mods: { armor: 1 }, desc: 'Better than nothing.' },
  { id: 'pilos', name: 'Pilos helmet', slot: 'helmet', art: 'pilos', tier: 1, value: 25, mods: { armor: 2 }, desc: 'Conical bronze helmet.' },
  { id: 'montefortino', name: 'Montefortino', slot: 'helmet', art: 'montefortino', tier: 2, value: 40, mods: { armor: 3 }, desc: 'Knobbed bowl helmet with cheek guards.' },
  { id: 'chalcidian', name: 'Chalcidian helm', slot: 'helmet', art: 'chalcidian', tier: 2, value: 55, mods: { armor: 3, morale: 3 }, desc: 'Crested helm with open ears.' },
  { id: 'scythian_hood', name: 'Felt hood', slot: 'helmet', art: 'hood', tier: 1, value: 10, mods: { armor: 1 }, desc: 'Pointed felt hood of the steppe riders.' },
  { id: 'thracian', name: 'Thracian helm', slot: 'helmet', art: 'thracian', tier: 2, value: 50, mods: { armor: 3, morale: 2 }, desc: 'Peaked bronze cap with a forward crest.' },
  { id: 'boeotian', name: 'Boeotian helm', slot: 'helmet', art: 'boeotian', tier: 2, value: 55, mods: { armor: 3, accuracy: 0.02 }, desc: 'Open cavalry helm with a folded brim: a clear view.' },
  { id: 'attic', name: 'Attic helm', slot: 'helmet', art: 'attic', tier: 3, value: 95, mods: { armor: 4, morale: 6 }, desc: 'Plumed parade helm of the royal guard.' },
  { id: 'corinthian', name: 'Corinthian helm', slot: 'helmet', art: 'corinthian', tier: 3, value: 90, mods: { armor: 4.5, morale: 5, accuracy: -0.05 }, desc: 'Full-face bronze. Terrifying, but hard to see out of.' },

  // ---- body armour -------------------------------------------------------------
  { id: 'leather', name: 'Leather jerkin', slot: 'armor', art: 'leather', tier: 1, value: 20, mods: { armor: 2 }, desc: 'Boiled leather over the tunic.' },
  { id: 'linothorax', name: 'Linothorax', slot: 'armor', art: 'linothorax', tier: 1, value: 45, mods: { armor: 3.5, speed: -0.02 }, desc: 'Layered linen, light and stiff.' },
  { id: 'scale', name: 'Scale corselet', slot: 'armor', art: 'scale', tier: 2, value: 70, mods: { armor: 5, speed: -0.05, stamina: -5 }, desc: 'Bronze scales on a linen backing.' },
  { id: 'mail', name: 'Ring mail', slot: 'armor', art: 'mail', tier: 3, value: 100, mods: { armor: 6, speed: -0.05, stamina: -8 }, desc: 'A Celtic invention: iron rings.' },
  { id: 'cuirass', name: 'Muscle cuirass', slot: 'armor', art: 'cuirass', tier: 3, value: 120, mods: { armor: 6.5, speed: -0.08, stamina: -10, morale: 4 }, desc: 'Sculpted bronze. The look of a hero.' },

  // ---- trinkets (not drawn) -----------------------------------------------------------
  { id: 'owl_amulet', name: 'Owl amulet', slot: 'trinket', art: 'none', tier: 1, value: 30, mods: { morale: 10 }, desc: 'Athena watches. +morale.' },
  { id: 'herakles_knot', name: 'Herakles knot', slot: 'trinket', art: 'none', tier: 1, value: 30, mods: { hp: 6 }, desc: 'Gold knot charm. +HP.' },
  { id: 'scarab', name: 'Faience scarab', slot: 'trinket', art: 'none', tier: 1, value: 30, mods: { stamina: 20 }, desc: 'Phoenician luck. +stamina.' },
  { id: 'laurel', name: 'Laurel token', slot: 'trinket', art: 'none', tier: 2, value: 45, mods: { xpBonus: 0.3 }, desc: 'Learns faster. +30% XP.' },
  { id: 'tanit_eye', name: 'Eye of Tanit', slot: 'trinket', art: 'none', tier: 2, value: 45, mods: { accuracy: 0.08, block: 0.04 }, desc: '+accuracy, +block.' },
  { id: 'boar_tusk', name: 'Boar tusk', slot: 'trinket', art: 'none', tier: 2, value: 45, mods: { dmg: 1.5 }, desc: '+melee damage.' },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
export const ITEM_LIST: readonly ItemDef[] = defs;

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
}

export const RARITY_MULT: Record<Rarity, number> = { common: 1, uncommon: 1.12, rare: 1.25, epic: 1.4, legendary: 1.6 };
/** English labels; UI code should use t(`rarity.${r}`) (src/i18n). */
export const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };

/** Stats that improve with rarity and degrade with condition. */
const SCALED: (keyof StatMods)[] = ['hp', 'dmg', 'rangedDmg', 'block', 'armor', 'morale', 'chargeBonus', 'blockPierce', 'xpBonus'];

/** Effective modifiers for an item instance, applying rarity and condition. */
export function itemMods(item: Item): StatMods {
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
  return Math.round(def.value * RARITY_MULT[normalizeRarity(item.rarity)] * (0.5 + 0.5 * item.cond / 100));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
