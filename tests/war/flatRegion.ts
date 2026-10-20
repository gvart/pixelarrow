import type { RegionData } from '../../src/war/types';

/** Open flat grass n x n at height 1. */
export function flat(n = 64): RegionData {
  return {
    id: 't', name: 't', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0),
    entries: [], noBuild: [],
  };
}
