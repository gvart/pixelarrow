/**
 * W-72 proposal, rival warlords (docs/WAR.md "Rival warlords"): the named NPC lords of the wild, their seats, men, look
 * and lines, and the numbers the director (src/war/sim/warlords.ts) runs on. Rivals, never helpers: they take neutral
 * places, grow, raid and fall piece by piece. Lines are short (the compact notice, W-70), grim, never gory.
 */
import type { MobKind } from '../war/types';
import { WORLD_REGIONS } from '../war/world/regions';
import { REGION_DEPTH } from '../war/sim/depth';
import { Rng, hashString } from '../sim/rng';
import { BASE_ITEMS, type Rarity } from './items';

export interface WarlordDef {
  id: string;
  name: string;
  /** Under his name on the plate. */
  title: string;
  /** His band's name on its banners. */
  band: string;
  /** The region of his hall (a depth-2 mid-neutral). */
  seat: string;
  /** His men's mob kind (src/war/sim/mobs.ts MOBS). */
  kind: MobKind;
  /** Men a garrison holds over the bandit baseline (frail kinds come in more, strong ones fewer). */
  men: number;
  /** W-81: the lord's hp over WARLORD.lord.hp (a frail kind's lord needs more to hold his hall as long). */
  lord: number;
  /** Banner colour and the lord's multiply tint. */
  tint: number;
  /** Draw scale of the lord over his kind's sheet. */
  scale: number;
  /** Notices: he rises, takes a place, warns of a raid (`{what}`: the target), raids, loses a place, falls. */
  lines: { rise: string; took: string; warn: string; freed: string; fallen: string };
}

export const WARLORDS: readonly WarlordDef[] = [
  {
    id: 'harpalos', name: 'Harpalos', title: 'Lord of the Toll', band: 'the Tollmen', seat: 'kleisoura', kind: 'bandit', men: 1, lord: 1, tint: 0xb04a3a, scale: 1.25,
    lines: {
      rise: 'Harpalos bars the pass. Every road pays him now.',
      took: 'The Tollmen raise their pikes over {place}.',
      warn: "Harpalos's men ride for your {what}",
      freed: 'The Tollmen are cut down. {place} is free.',
      fallen: 'Harpalos lies in the dust of his own toll-road.',
    },
  },
  {
    id: 'kelaino', name: 'Kelaino', title: 'Mother of the Reeds', band: 'the Reed-Brood', seat: 'stymphalia', kind: 'harpy', men: 1.25, lord: 5, tint: 0x6a5a8a, scale: 1.35,
    lines: {
      rise: 'Kelaino screams over the lake. Her brood wakes.',
      took: 'The Reed-Brood nests at {place}.',
      warn: "Kelaino's brood wheels toward your {what}",
      freed: 'The nests at {place} are broken.',
      fallen: 'Kelaino falls into the reeds. The lake goes still.',
    },
  },
  {
    id: 'skiron', name: 'Skiron', title: 'the Drowner, Ford-Lord', band: 'the Drowned Men', seat: 'achelous', kind: 'bandit', men: 1, lord: 1, tint: 0x3a6a78, scale: 1.25,
    lines: {
      rise: 'Skiron holds the ford. Who crosses unpaid goes under.',
      took: 'The Drowned Men take {place}.',
      warn: "Skiron's men wade toward your {what}",
      freed: 'The Drowned Men are scattered from {place}.',
      fallen: 'Skiron goes into the river he fed so long.',
    },
  },
  {
    id: 'auge', name: 'Auge', title: 'the Pride-Mother', band: 'the Pride', seat: 'ammos', kind: 'lion', men: 0.8, lord: 2.5, tint: 0xc08a3a, scale: 1.4,
    lines: {
      rise: 'Auge leads her pride out of the dunes. The herds run.',
      took: 'The Pride lairs at {place}.',
      warn: "Auge's pride stalks your {what}",
      freed: 'The Pride is driven from {place}.',
      fallen: 'Auge lies still on the hot sand. Her pride scatters.',
    },
  },
];

/** The numbers (docs/WAR.md "Rival warlords"); ticks are 10 a second, ages in days. */
export const WARLORD = {
  /** Ticks between the director's passes. */
  think: 10,
  /** Seat: one more place every `seat` days of age; march: from day `marchDay`, one more every `march` days. */
  grow: { seat: 2, march: 3, marchDay: 1 },
  /** Places held in one region at most. */
  maxHold: 3,
  /**
   * Garrison men by depth (index), +perDay a day held up to max; x(1 + press x (players - 1)); never over cap. W-79: depth 2
   * tops out at 9 (11 ground a solo 12 down). W-81: his hall holds `hall` more (after W-79 it fell in ~25 s).
   */
  garrison: { base: [5, 5, 7, 8, 8], perDay: 1, max: [9, 9, 9, 12, 12], press: 0.15, cap: 12, hall: 2 },
  /** Hold radius of a garrison (tiles). */
  holdR: 10,
  /** His lieutenant (each garrison's first man) and the lord himself, over a man of his kind. */
  lieutenant: { hp: 2, dmg: 1.25, armor: 2 },
  /**
   * W-79: was hp x14, dmg x1.8, armour +6 (he held 7 men over two minutes), then x6 (his hall fell in ~25 s). W-81: x8 (x his
   * def's `lord`) and his hall's +2 men: 12 level-3 hoplites take his hall in 62-80 s for 1-5 men.
   */
  lord: { hp: 8, dmg: 1.5, armor: 2 },
  /** Ticks between reinforcements; a holding is quiet with no foe man within `quiet` tiles. */
  reinforce: 6000, quiet: 20,
  /** Ticks a freed place stays free. */
  retake: 72000,
  /** Days of age before a fallen lord is back. */
  back: 3,
  /**
   * Raids: every `every` ticks (÷ players, at most ÷ maxDiv), warned `warn` ticks ahead; men by depth + perPlayer each extra (≤ max).
   * W-79: led by a lieutenant, one more man at depth 1-2 (4 plain bandits died to 6 guards without felling one).
   * W-81: a building is guarded (no raid) only with `guarded` or more fit men within `guard` tiles; a cart with any.
   */
  raid: { every: 12000, maxDiv: 3, warn: 600, men: [5, 5, 7, 7, 7], perPlayer: 2, max: 12, reach: 110, guard: 16, guarded: 4, cartGuard: 10, stay: 900, at: 5 },
  /** Loot (x(1 + per x depth)) and favour; players with men within `near` tiles share the favour. */
  loot: {
    holding: { coin: 24, goods: 3, per: 0.5 },
    lord: { coin: 120, goods: 8, per: 0.5, rarity: [['uncommon', 50], ['rare', 40], ['epic', 10]] as readonly (readonly [Rarity, number])[] },
  },
  favour: { holding: 60, lord: 200, near: 20 },
  /** Warlord men in one region at most. */
  cap: 60,
  /** A band is on its place within this many tiles. */
  arrive: 6,
  /** His fall: his bands walk to the border and are gone there (or after `leave` ticks). */
  recall: { leave: 900, line: 'Word of his fall reaches {place}. {band} slink off to the border' },
} as const;

/** Goods his men leave by kind. */
const SPOILS: Partial<Record<MobKind, string>> = { bandit: 'iron', harpy: 'linen', lion: 'hides' };

export const warlord = (id: string): WarlordDef | undefined => WARLORDS.find((w) => w.id === id);

/** His domain: his seat, then its neighbours of depth 1-2 that are no home (the world graph's order). */
export function domainOf(w: WarlordDef): string[] {
  const seat = WORLD_REGIONS.find((r) => r.id === w.seat);
  if (!seat) return [];
  return [seat.id, ...seat.adj.filter((id) => {
    const d = REGION_DEPTH[id] ?? 1, r = WORLD_REGIONS.find((x) => x.id === id);
    return d >= 1 && d <= 2 && r?.role !== 'home';
  })];
}

/** The warlords whose domain holds this region (none for most). */
export const warlordsOf = (region: string): WarlordDef[] => WARLORDS.filter((w) => domainOf(w).includes(region));

/** What a freed holding or the fallen lord leaves (seeded). */
export function warlordLoot(w: WarlordDef, what: 'holding' | 'lord', depth: number, seed: string): { goods: Record<string, number>; item: { def: string; rarity: Rarity } | null } {
  const L = WARLORD.loot[what], m = 1 + L.per * depth;
  const goods: Record<string, number> = { coin: Math.round(L.coin * m), [SPOILS[w.kind] ?? 'hides']: Math.round(L.goods * m) };
  if (what === 'holding') return { goods, item: null };
  const rng = new Rng(hashString(`${w.id}:${seed}:warlordloot`) || 1);
  const pool = BASE_ITEMS.filter((d) => d.tier <= 2 + Math.floor(depth / 2));
  return { goods, item: { def: rng.pick(pool).id, rarity: rng.weighted(WARLORD.loot.lord.rarity) } };
}
