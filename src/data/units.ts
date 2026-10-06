import type { Item, Slot } from './items';
import type { TraitId } from './traits';
import type { Culture } from './names';
import type { Attrs, PerkId } from './perks';

/** Visual body variant: indexes into palette tables in src/art/palette.ts. */
export interface Look {
  skin: number; // 0..3
  hair: number; // 0..3 hair colour
  hairStyle: number; // 0 short, 1 long, 2 cropped/bald
  beard: number; // 0 none, 1 short, 2 full
  tunic: string; // tunic palette key
}

export type Equipment = Partial<Record<Slot, Item>>;

export interface Hero {
  id: string;
  name: string;
  culture: Culture;
  level: number;
  xp: number;
  traits: TraitId[];
  look: Look;
  equip: Equipment;
  kills: number;
  battles: number;
  /** Preferred battle group index (0..3). */
  group: number;
  /** Base attributes (see src/data/perks.ts). */
  attrs: Attrs;
  /** Unspent attribute points. */
  points: number;
  /** Perks taken, in order. */
  perks: PerkId[];
  /** Hours of rest still needed to recover from a wound (0 = fit). Wounded heroes sit out battles. */
  wound: number;
  /** Archetype the hero was raised as (recruit pools, bot development). */
  arch?: string;
}

export const MAX_ARMY = 20;
export const MAX_LEVEL = 10;
export const RECRUIT_COST = 40;

export const BASE = {
  hp: 40,
  hpPerLevel: 4,
  dmg: 2,
  dmgPerLevel: 0.4,
  morale: 60,
  moralePerLevel: 2,
  stamina: 100,
  speed: 2.0, // walk speed, field units / s
  runMult: 1.75,
  accuracy: 0.62,
  accuracyPerLevel: 0.01,
  reach: 0.9,
  atkTime: 1.2,
};

export function xpToNext(level: number): number {
  return 40 * level;
}

export const TUNIC_COLORS = ['tunicBlue', 'tunicGreen', 'tunicWhite', 'tunicRed', 'tunicOchre'] as const;
export const GROUP_NAMES = ['Phalanx', 'Skirmish', 'Reserve', 'Flank'];
