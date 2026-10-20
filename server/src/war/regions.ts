/** War regions the server hosts (bundled region JSON, src/war/regions/). M3 slice: test-ridge only. */
import { parseRegion } from '../../../src/war/region/schema';
import type { RegionData } from '../../../src/war/types';
import testRidge from '../../../src/war/regions/test-ridge.json';

const SOURCES: Record<string, unknown> = { 'test-ridge': testRidge };
const cache = new Map<string, RegionData>();

export const WAR_REGIONS = Object.keys(SOURCES);

/** The parsed region (sim layers only: the visual-only ones are dropped), or null for an unknown id. */
export function warRegion(id: string): RegionData | null {
  const hit = cache.get(id);
  if (hit) return hit;
  const src = SOURCES[id];
  if (!src) return null;
  const { visual: _v, biomes: _b, ...r } = parseRegion(src);
  cache.set(id, r);
  return r;
}
