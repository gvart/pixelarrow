/**
 * War region bosses and their drop tables (W-45; docs/WAR.md "Crafting": set pieces and named legendaries stay drops).
 *
 * Some neutral regions hold a boss: a unique, powerful mob guarding the region (the boss sim, its AI and claim gating
 * live in src/war/sim). Killing it drops gear: `BOSS_TIERS[tier].picks` pieces of rolled rarity from the base items,
 * and, `signature` of the time, the first is one of the boss's own legendaries. The bosses are the war's only source
 * of the Arms of Achilles, the Panoply of Alexander, the Trident of Poseidon and the Aegis of Zeus, all on the rim.
 * M7c (docs/WAR.md "Region lore and depth"): every home faces the same guardians at the same depth: four tier-1 pocket
 * bosses (depth 2), four tier-2 gate bosses (depth 3) and four tier-3 rim bosses (depth 4) in their landmarks, and the
 * Titan and the Minotaur of Omphalos.
 *
 * Pure and seeded: the same kill (seed) always drops the same table.
 */
import { BASE_ITEMS, type Rarity } from './items';
import { setPieces } from './sets';
import { Rng, hashString } from '../sim/rng';
import type { RareGood } from './warLandmarks';

export type BossTier = 1 | 2 | 3;

export interface WarBoss {
  id: string;
  name: string;
  /** The neutral region it guards (src/war/world/regions.ts). */
  region: string;
  /** M7c: tier = the region's depth - 1 (src/war/sim/depth.ts), Omphalos 3 (docs/WAR.md "Region lore and depth"). */
  tier: BossTier;
  /** Its own legendaries: item ids and set ids (a set drops one of its pieces). */
  signature: readonly string[];
  /** M7c: the landmark it holds (docs/WAR.md "Landmarks"; ./warLandmarks.ts), absent for a pocket boss. */
  landmark?: string;
  /** Its phases, by the share of max hp they start below (the first starts at 1): src/war/sim/bosses.ts. */
  phases: readonly number[];
  /** M7e: the rare good its kill drops into the loot pile (docs/WAR.md "Rare goods"). */
  rare?: { good: RareGood; n: number };
}

export const WAR_BOSSES: readonly WarBoss[] = [
  // depth 2 pockets: tier 1, no signature
  { id: 'moor_bear', name: 'Great Bear of the Moors', region: 'moors', tier: 1, signature: [], phases: [1] },
  { id: 'griffin', name: 'Griffin of the Kimmerian Hills', region: 'kimmeria', tier: 1, signature: [], phases: [1] },
  { id: 'savanna_lion', name: 'Lion of the Savanna', region: 'savanna', tier: 1, signature: [], phases: [1] },
  { id: 'maenad_queen', name: 'the Maenad Queen', region: 'bacchae', tier: 1, signature: [], phases: [1] },
  // depth 3 gates: tier 2, each in its landmark
  { id: 'brontes', name: 'Brontes the Cyclops', region: 'saddle', tier: 2, signature: [], landmark: 'cyclopean_gatehouse', phases: [1, 0.85], rare: { good: 'starIron', n: 10 } },
  // M7d: the Oracle Grove's guardians are the god's maenads and their queen (the art built them; docs/WAR.md "Landmarks")
  { id: 'grove_queen', name: 'the Maenad Queen of the Grove', region: 'erymanthos', tier: 2, signature: [], landmark: 'oracle_grove', phases: [1, 0.4], rare: { good: 'asphodel', n: 10 } },
  { id: 'gyges', name: 'Gyges the Hundred-Handed', region: 'gorge', tier: 2, signature: [], landmark: 'titans_forge', phases: [1, 0.5], rare: { good: 'titanBronze', n: 10 } },
  { id: 'chimera', name: 'the Chimera', region: 'canyons', tier: 2, signature: [], landmark: 'obsidian_hold', phases: [1], rare: { good: 'obsidian', n: 10 } },
  // depth 4 rim edges: tier 3, the four signature legendaries
  // a dragon on the titan frozen in the glacier: the aegis of the god who threw the titans down
  { id: 'drakon', name: 'Drakon the White', region: 'krios', tier: 3, signature: ['aegis_of_zeus'], landmark: 'drakons_citadel', phases: [1, 0.6, 0.54], rare: { good: 'dragonbone', n: 20 } },
  // the estuary where the sea meets the rim: the sea god's trident
  { id: 'scylla', name: 'Scylla of the Estuary', region: 'siren', tier: 3, signature: ['poseidon_trident'], landmark: 'rim_watchtower', phases: [1, 0.5], rare: { good: 'nereidPearl', n: 15 } },
  // the oracle that named Alexander son of a god: his armour on a king of thieves
  { id: 'bandit_king', name: 'the Bandit King of Ammon', region: 'ammon', tier: 3, signature: ['alexander'], landmark: 'dead_city', phases: [1, 0.6, 0.3] },
  // the river that fought Achilles at Troy, here as the Achelous: the arms of Achilles
  { id: 'river_god', name: 'Achelous the River-God', region: 'delta', tier: 3, signature: ['achilles'], landmark: 'sunken_temple', phases: [1, 0.66, 0.33] },
  // the navel of the in-between: two guardians, two fights at once
  { id: 'titan', name: 'the Titan of the Navel', region: 'omphalos', tier: 3, signature: [], landmark: 'temple_city', phases: [1, 0.5] },
  { id: 'minotaur', name: 'the Minotaur', region: 'omphalos', tier: 3, signature: [], landmark: 'temple_city', phases: [1] },
];

/** Per tier: pieces dropped, rarity weights of each, the least item tier, and the chance the first is a signature legendary. */
export const BOSS_TIERS: Record<BossTier, { picks: number; rarity: readonly (readonly [Rarity, number])[]; minTier: number; signature: number }> = {
  1: { picks: 2, rarity: [['rare', 70], ['epic', 28], ['legendary', 2]], minTier: 2, signature: 0 },
  2: { picks: 3, rarity: [['rare', 40], ['epic', 50], ['legendary', 10]], minTier: 3, signature: 0 },
  3: { picks: 4, rarity: [['rare', 15], ['epic', 55], ['legendary', 30]], minTier: 3, signature: 0.25 },
};

const BY_ID = new Map(WAR_BOSSES.map((b) => [b.id, b]));
export const warBoss = (id: string): WarBoss | undefined => BY_ID.get(id);
/** The (first) boss of a region; Omphalos has two (bossesOfRegion). */
export const bossOfRegion = (region: string): WarBoss | undefined => WAR_BOSSES.find((b) => b.region === region);
export const bossesOfRegion = (region: string): WarBoss[] => WAR_BOSSES.filter((b) => b.region === region);

export interface BossDrop { def: string; rarity: Rarity }

/** M7e: the goods a kill of `boss` drops into its loot pile (its rare good; none for most). */
export const bossGoods = (boss: string): { r: RareGood; n: number }[] => {
  const g = warBoss(boss)?.rare;
  return g ? [{ r: g.good, n: g.n }] : [];
};

/** The item ids a signature entry may drop: a set's pieces, or the item itself. */
const signatureItems = (s: string): string[] => {
  const pieces = setPieces(s);
  return pieces.length ? pieces : [s];
};

/** What a kill of `boss` drops; `seed` names the kill (the same seed, the same drop). Unknown boss: nothing. */
export function bossLoot(boss: string, seed: string): BossDrop[] {
  const b = warBoss(boss);
  if (!b) return [];
  const t = BOSS_TIERS[b.tier];
  const rng = new Rng(hashString(`${boss}:${seed}:bossloot`) || 1);
  const pool = BASE_ITEMS.filter((d) => d.tier >= t.minTier);
  const out: BossDrop[] = [];
  for (let i = 0; i < t.picks; i++) {
    if (i === 0 && b.signature.length && rng.chance(t.signature)) {
      out.push({ def: rng.pick(signatureItems(rng.pick(b.signature))), rarity: 'legendary' });
      continue;
    }
    out.push({ def: rng.pick(pool).id, rarity: rng.weighted(t.rarity) });
  }
  return out;
}
