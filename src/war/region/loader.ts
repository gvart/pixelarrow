import type { RegionData } from '../types';
import { parseRegion } from './schema';

const files = import.meta.glob('../regions/*.json');

/** Load and validate src/war/regions/<id>.json (each region is its own lazy chunk). */
export async function loadRegion(id: string): Promise<RegionData> {
  const load = files[`../regions/${id}.json`];
  if (!load) throw new Error(`unknown region "${id}"`);
  const mod = (await load()) as { default: unknown };
  return parseRegion(mod.default);
}
