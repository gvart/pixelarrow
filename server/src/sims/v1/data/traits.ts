import type { StatMods } from './items';

export type TraitId = 'veteran' | 'steady' | 'swift' | 'brute' | 'keen' | 'stalwart' | 'tough' | 'skittish';

export interface TraitDef {
  id: TraitId;
  name: string;
  desc: string;
  mods: StatMods;
  /** Multiplier on morale damage taken (lower = steadier). */
  moraleLoss?: number;
  negative?: boolean;
}

const list: TraitDef[] = [
  { id: 'veteran', name: 'Veteran', desc: 'Seen it all. +morale, +dmg, +accuracy.', mods: { morale: 10, dmg: 1, accuracy: 0.05 } },
  { id: 'steady', name: 'Steady', desc: 'Takes 35% less morale damage.', mods: {}, moraleLoss: 0.65 },
  { id: 'swift', name: 'Swift', desc: '+12% speed, +stamina.', mods: { speed: 0.12, stamina: 15 } },
  { id: 'brute', name: 'Brute', desc: '+2 melee damage, -5 morale.', mods: { dmg: 2, morale: -5 } },
  { id: 'keen', name: 'Keen-eyed', desc: '+accuracy and +1 range.', mods: { accuracy: 0.12, range: 1 } },
  { id: 'stalwart', name: 'Stalwart', desc: '+7% block chance.', mods: { block: 0.07 } },
  { id: 'tough', name: 'Tough', desc: '+8 HP.', mods: { hp: 8 } },
  { id: 'skittish', name: 'Skittish', desc: '-10 morale, +5% speed.', mods: { morale: -10, speed: 0.05 }, moraleLoss: 1.2, negative: true },
];

export const TRAITS: Record<TraitId, TraitDef> = Object.fromEntries(list.map((t) => [t.id, t])) as Record<TraitId, TraitDef>;
export const TRAIT_IDS: TraitId[] = list.map((t) => t.id);
export const POSITIVE_TRAITS: TraitId[] = list.filter((t) => !t.negative).map((t) => t.id);
