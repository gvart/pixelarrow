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

/** The item ids of a set, in the order of the item list. */
export function setPieces(id: string): string[] {
  return ITEM_LIST.filter((d) => d.set === id).map((d) => d.id);
}

/** Active bonus lines of a set for a number of counted pieces. */
export function activeBonuses(id: string, pieces: number): SetBonus[] {
  return (SETS[id]?.bonuses ?? []).filter((b) => pieces >= b.pieces);
}
