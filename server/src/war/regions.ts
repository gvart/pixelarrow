/**
 * War regions the server hosts (bundled region JSON, src/war/regions/). M4: every world region (src/war/world) is
 * hosted; one without its own map yet runs on test-ridge's map under its own id (a stand-in until its draft lands).
 */
import { parseRegion } from '../../../src/war/region/schema';
import type { RegionData } from '../../../src/war/types';
import { isWorldRegion, WORLD_IDS } from '../../../src/war/world';
import testRidge from '../../../src/war/regions/test-ridge.json';

const SOURCES: Record<string, unknown> = { 'test-ridge': testRidge };
const STAND_IN = 'test-ridge';
const cache = new Map<string, RegionData>();

export const WAR_REGIONS = [...new Set([...Object.keys(SOURCES), ...WORLD_IDS])];

/** M7f: the region runs on its own map (not the stand-in). */
export const hasOwnMap = (id: string): boolean => id in SOURCES;

/** The parsed region (sim layers only: the visual-only ones are dropped), or null for an unknown id. */
export function warRegion(id: string): RegionData | null {
  const hit = cache.get(id);
  if (hit) return hit;
  const src = SOURCES[id] ?? (isWorldRegion(id) ? SOURCES[STAND_IN] : undefined);
  if (!src) return null;
  const { visual: _v, biomes: _b, ...r } = parseRegion(src);
  r.id = id;
  cache.set(id, r);
  return r;
}
