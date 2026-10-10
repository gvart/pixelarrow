/**
 * Item sets (docs/ITEMS.md "Sets"). Pieces are their own items in
 * src/data/items.ts (`set: id`), always at the set's rarity. A hero counts the
 * pieces he wears and meets the requirements of; each bonus line is active
 * from its piece count. A line is stats, or a special effect the battle
 * runs (src/sim, with the powers).
 */
import { ITEM_LIST, type Rarity, type StatMods } from './items';

export type SetSpecial = 'war_cry' | 'rain_of_arrows' | 'bond_of_the_band' | 'heel_of_achilles' | 'born_to_rule';

export interface SetBonus {
  pieces: number;
  mods?: StatMods;
  special?: SetSpecial;
}

export interface SetDef {
  id: string;
  name: string;
  rarity: Rarity;
  bonuses: SetBonus[];
}

const S = (id: string, name: string, rarity: Rarity, bonuses: SetBonus[]): SetDef => ({ id, name, rarity, bonuses });

export const SETS: Record<string, SetDef> = {
  agoge: S('agoge', 'Agoge of Sparta', 'rare', [{ pieces: 2, mods: { morale: 6 } }, { pieces: 3, mods: { steady: 0.2, block: 0.03 } }]),
  peltast: S('peltast', 'Peltast of Thrace', 'rare', [{ pieces: 2, mods: { speed: 0.06 } }, { pieces: 3, mods: { ammo: 1, rangedDmg: 1.3 } }]),
  cretan: S('cretan', 'Cretan Bowman', 'rare', [{ pieces: 2, mods: { range: 0.6 } }, { pieces: 3, mods: { accuracy: 0.05, ammo: 4 } }]),
  brennus: S('brennus', 'Warband of Brennus', 'epic', [{ pieces: 2, mods: { dmg: 1.5 } }, { pieces: 3, mods: { atkSpeed: 0.08 } }, { pieces: 4, special: 'war_cry' }]),
  immortals: S('immortals', 'Immortals of Persia', 'epic', [{ pieces: 2, mods: { accuracy: 0.05 } }, { pieces: 3, mods: { ammo: 4 } }, { pieces: 4, special: 'rain_of_arrows' }]),
  sacred_band: S('sacred_band', 'Sacred Band of Thebes', 'epic', [{ pieces: 2, mods: { morale: 8 } }, { pieces: 3, mods: { armor: 1.5 } }, { pieces: 4, special: 'bond_of_the_band' }]),
  achilles: S('achilles', 'Arms of Achilles', 'legendary', [{ pieces: 2, mods: { hp: 10 } }, { pieces: 3, mods: { dmg: 1.2 } }, { pieces: 4, mods: { armor: 3 } }, { pieces: 5, special: 'heel_of_achilles' }]),
  alexander: S('alexander', 'Panoply of Alexander', 'legendary', [{ pieces: 2, mods: { morale: 8 } }, { pieces: 3, mods: { speed: 0.08 } }, { pieces: 4, mods: { chargeBonus: 0.15 } }, { pieces: 5, special: 'born_to_rule' }]),
};

/**
 * Numbers of the special lines (src/sim/powers.ts runs them). Radii in field
 * units; fractions are damage, block or damage-taken multipliers.
 */
export const SET_RULES = {
  /** War Cry: the first time the foe comes within `radius`, enemies there lose `morale`; the wearer's charges shock +`shock`. */
  warCry: { radius: 4, morale: 10, shock: 0.2 },
  /** Rain of Arrows: every `every`-th shot looses `arrows` more. */
  rain: { every: 5, arrows: 2 },
  /** Bond of the Band: per other wearer within `radius` (up to `max`). */
  bond: { radius: 3, dmg: 0.04, block: 0.03, max: 4 },
  /** Heel of Achilles: damage taken from the front and side, and from behind. */
  heel: { front: 0.5, rear: 1.5 },
  /** Born to Rule: allies within `radius` deal +`dmg` and count +`morale` against routing. */
  born: { radius: 4, dmg: 0.1, morale: 10 },
};

/** What a set's special line does (item card; translations in src/i18n/data.ru.ts `setsp.<id>`). */
export const SET_SPECIAL_TEXT: Record<SetSpecial, string> = {
  war_cry: 'War Cry: when the foe first comes within 4, enemies there lose 10 morale; charges +20% shock',
  rain_of_arrows: 'Rain of Arrows: every 5th shot looses 2 more arrows',
  bond_of_the_band: 'Bond of the Band: +4% damage and +3% block per set ally within 3 (up to 4)',
  heel_of_achilles: 'Heel of Achilles: -50% damage from front and side, +50% from behind',
  born_to_rule: 'Born to Rule: allies within 4 +10% damage and +10 morale; his group never routs while he stands',
};

/** The item ids of a set, in the order of the item list. */
export function setPieces(id: string): string[] {
  return ITEM_LIST.filter((d) => d.set === id).map((d) => d.id);
}

/** Active bonus lines of a set for a number of counted pieces. */
export function activeBonuses(id: string, pieces: number): SetBonus[] {
  return (SETS[id]?.bonuses ?? []).filter((b) => pieces >= b.pieces);
}
