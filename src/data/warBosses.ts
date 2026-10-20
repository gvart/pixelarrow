/**
 * War region bosses and their drop tables (W-45; docs/WAR.md "Crafting": set pieces and named legendaries stay drops).
 *
 * Some neutral regions hold a boss: a unique, powerful mob guarding the region (the boss sim, its AI and claim gating
 * live in src/war/sim). Killing it drops gear: `BOSS_TIERS[tier].picks` pieces of rolled rarity from the base items,
 * and, `signature` of the time, the first is one of the boss's own legendaries. The bosses are the war's only source
 * of the Arms of Achilles, the Panoply of Alexander, the Trident of Poseidon and the Aegis of Zeus.
 *
 * Pure and seeded: the same kill (seed) always drops the same table.
 */
import { BASE_ITEMS, type Rarity } from './items';
import { setPieces } from './sets';
import { Rng, hashString } from '../sim/rng';

export type BossTier = 1 | 2 | 3;

export interface WarBoss {
  id: string;
  name: string;
  /** The neutral region it guards (src/war/world/regions.ts). */
  region: string;
  tier: BossTier;
  /** Its own legendaries: item ids and set ids (a set drops one of its pieces). */
  signature: readonly string[];
}

export const WAR_BOSSES: readonly WarBoss[] = [
  // the estuary where the sea meets the rim: the sea god's trident
  { id: 'scylla', name: 'Scylla of the Estuary', region: 'siren', tier: 3, signature: ['poseidon_trident'] },
  // a titan frozen in the glacier: the aegis of the god who threw the titans down
  { id: 'glacier_titan', name: 'Titan of Krios', region: 'krios', tier: 3, signature: ['aegis_of_zeus'] },
  // the river that fought Achilles at Troy, here as the Achelous: the arms of Achilles
  { id: 'river_god', name: 'Achelous the River-God', region: 'delta', tier: 3, signature: ['achilles'] },
  // the lion whose scalp Alexander wore: the panoply of Alexander
  { id: 'savanna_lion', name: 'Lion of the Savanna', region: 'savanna', tier: 3, signature: ['alexander'] },
  { id: 'griffin', name: 'Griffin of the Kimmerian Hills', region: 'kimmeria', tier: 2, signature: [] },
  { id: 'moor_bear', name: 'Great Bear of the Moors', region: 'moors', tier: 1, signature: [] },
];

/** Per tier: pieces dropped, rarity weights of each, the least item tier, and the chance the first is a signature legendary. */
export const BOSS_TIERS: Record<BossTier, { picks: number; rarity: readonly (readonly [Rarity, number])[]; minTier: number; signature: number }> = {
  1: { picks: 2, rarity: [['rare', 70], ['epic', 28], ['legendary', 2]], minTier: 2, signature: 0 },
  2: { picks: 3, rarity: [['rare', 40], ['epic', 50], ['legendary', 10]], minTier: 3, signature: 0 },
  3: { picks: 4, rarity: [['rare', 15], ['epic', 55], ['legendary', 30]], minTier: 3, signature: 0.25 },
};

const BY_ID = new Map(WAR_BOSSES.map((b) => [b.id, b]));
export const warBoss = (id: string): WarBoss | undefined => BY_ID.get(id);
export const bossOfRegion = (region: string): WarBoss | undefined => WAR_BOSSES.find((b) => b.region === region);

export interface BossDrop { def: string; rarity: Rarity }

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
