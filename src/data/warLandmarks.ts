/**
 * The nine landmarks and the six rare goods (docs/WAR.md "Landmarks", "Rare goods"; W-47). A landmark is a pre-built
 * stronghold in a depth-3 or depth-4 region, held by its boss (./warBosses.ts `landmark`); restoring it once held needs
 * bulk goods and rare goods, one of its own and one from a landmark on another frontier, so its holder must buy, haul
 * or raid across the map. The landmark sim (layouts, capture damage, patch and restore sites, functions) is M7d; this
 * table is what it, the region JSON (rare nodes by object id) and the balance script share.
 */
import type { ResourceKind } from '../war/types';

export type RareGood = 'dragonbone' | 'nereidPearl' | 'starIron' | 'asphodel' | 'titanBronze' | 'obsidian';
export const RARE_GOODS: readonly RareGood[] = ['dragonbone', 'nereidPearl', 'starIron', 'asphodel', 'titanBronze', 'obsidian'];
export const isRare = (r: string): r is RareGood => (RARE_GOODS as readonly string[]).includes(r);

/**
 * Rare nodes (region object ids, src/war/sim/economy.ts RESOURCE_NODES): 1 a 10 min, at most 20; the slag heap 20 once.
 * Only the region's holder gathers them, at landmark yield (no depth multiplier).
 */
export const RARE_NODE = { regrow: 1 / 600, max: 20, rate: 0.1, slots: 2 };
export const RARE_NODES: Readonly<Record<string, { res: RareGood; once?: true }>> = {
  'landmark/bone-pit': { res: 'dragonbone' },
  'landmark/sea-cave': { res: 'nereidPearl' },
  'landmark/eagle-crater': { res: 'starIron' },
  'landmark/asphodel-meadow': { res: 'asphodel' },
  'landmark/slag-heap': { res: 'titanBronze', once: true },
  'landmark/glass-field': { res: 'obsidian' },
};

export interface Landmark {
  id: string;
  name: string;
  region: string;
  /** Its own rare good (none for the Dead City, the Sunken Temple and the Temple City). */
  rare?: RareGood;
  /** Restore: bulk goods and rare goods (own + from another landmark). */
  restore: { bulk: Partial<Record<ResourceKind, number>>; rare: Partial<Record<RareGood, number>> };
  /** Engineer level that leads the restore (Fortifier and Master Builder; 10: Poliorcetes or Archimedes too). */
  engineer: 8 | 10;
}

export const LANDMARKS: readonly Landmark[] = [
  { id: 'drakons_citadel', name: "Drakon's Citadel", region: 'krios', rare: 'dragonbone', restore: { bulk: { stone: 600, iron: 60 }, rare: { dragonbone: 20, titanBronze: 10 } }, engineer: 10 },
  { id: 'rim_watchtower', name: 'Rim Watchtower', region: 'siren', rare: 'nereidPearl', restore: { bulk: { stone: 300, marble: 40 }, rare: { nereidPearl: 10, starIron: 5 } }, engineer: 8 },
  { id: 'dead_city', name: 'Dead City of Ammon', region: 'ammon', restore: { bulk: { stone: 500, wood: 200 }, rare: { obsidian: 10, starIron: 5 } }, engineer: 8 },
  { id: 'sunken_temple', name: 'Sunken Temple', region: 'delta', restore: { bulk: { stone: 300, marble: 60 }, rare: { asphodel: 10, nereidPearl: 5 } }, engineer: 8 },
  { id: 'temple_city', name: 'Temple City of the Navel', region: 'omphalos', restore: { bulk: { marble: 300, stone: 300 }, rare: { titanBronze: 20, dragonbone: 10, asphodel: 10 } }, engineer: 10 },
  { id: 'cyclopean_gatehouse', name: 'Cyclopean Gatehouse', region: 'saddle', rare: 'starIron', restore: { bulk: { stone: 400 }, rare: { starIron: 10, obsidian: 5 } }, engineer: 8 },
  { id: 'oracle_grove', name: 'Oracle Grove', region: 'erymanthos', rare: 'asphodel', restore: { bulk: { wood: 100, marble: 40 }, rare: { asphodel: 10, nereidPearl: 5 } }, engineer: 8 },
  { id: 'titans_forge', name: "Titan's Forge", region: 'gorge', rare: 'titanBronze', restore: { bulk: { stone: 300, bronze: 40 }, rare: { titanBronze: 10, starIron: 5 } }, engineer: 8 },
  { id: 'obsidian_hold', name: 'Obsidian Hold', region: 'canyons', rare: 'obsidian', restore: { bulk: { stone: 300 }, rare: { obsidian: 10, dragonbone: 5 } }, engineer: 8 },
];

const BY_ID = new Map(LANDMARKS.map((l) => [l.id, l]));
export const landmark = (id: string): Landmark | undefined => BY_ID.get(id);
export const landmarkOfRegion = (region: string): Landmark | undefined => LANDMARKS.find((l) => l.region === region);
/** A landmark's whole restore bill (bulk and rare goods together). */
export const restoreCost = (id: string): Partial<Record<ResourceKind, number>> => {
  const l = landmark(id);
  return l ? { ...l.restore.bulk, ...l.restore.rare } : {};
};
/** Titan bronze smelted at the restored Titan's Forge (M7d): bronze 4 + charcoal 4 -> 1 in 120 s. */
export const TITAN_SMELT = { in: { bronze: 4, charcoal: 4 }, out: 1, secs: 120 };
