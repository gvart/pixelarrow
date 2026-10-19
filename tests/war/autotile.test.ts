import { describe, expect, it } from 'vitest';
import ridgeJson from '../../src/war/regions/test-ridge.json';
import { parseRegion } from '../../src/war/region/schema';
import { autotile, VARIANT, type TilesMeta } from '../../src/war/view/autotile';
import type { RegionData, TerrainKind } from '../../src/war/types';
import tilesJson from '../../public/war/tiles/tiles.json';

const T = tilesJson as TilesMeta;
const flatZ = (r: RegionData) => r.height.map((h, i) => h - (r.water[i] ? 0.3 : 0));
const region = (w: number, h: number, f: (x: number, y: number) => TerrainKind): RegionData => {
  const terrain: TerrainKind[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) terrain.push(f(x, y));
  return { id: 't', name: 't', w, h, height: terrain.map(() => 1), terrain, water: terrain.map(() => 0), entries: [], noBuild: [] };
};
const sheet = (pair: string) => T.sheets.findIndex((s) => s.pair === pair);

describe('autotile', () => {
  it('draws grass variants on a plain field', () => {
    const r = region(8, 8, () => 'grass'), { code, missing } = autotile(r, flatZ(r), T);
    expect(missing).toBe(0);
    for (const c of code) expect(c >= VARIANT && c < VARIANT + 16).toBe(true);
  });

  it('cuts a diagonal edge between grass and forest by corner mask', () => {
    const r = region(8, 8, (x, y) => (x + y >= 8 ? 'forest' : 'grass')), { code } = autotile(r, flatZ(r), T);
    // tile (3, 4): its NW vertex (3, 4) only touches grass cells; its SE vertex (4, 5) touches forest
    const c = code[4 * 8 + 3];
    expect(Math.floor(c / 16)).toBe(sheet('grass-forest'));
    expect(c % 16 & 8).toBe(8); // set bit = the first terrain (grass)
    expect(c % 16 & 1).toBe(0);
  });

  it('tiles on different levels keep their own edges', () => {
    const r = region(8, 8, (x, y) => (x < 4 && y < 4 ? 'dirt' : 'grass'));
    r.height = r.terrain.map((_, i) => (i % 8 < 4 && i < 32 ? 5 : 1));
    const { code } = autotile(r, flatZ(r), T);
    expect(code[3 * 8 + 3]).toBeGreaterThanOrEqual(VARIANT); // the plateau's corner tile is full dirt
    expect(code[4 * 8 + 4]).toBeGreaterThanOrEqual(VARIANT); // the grass below the wall stays whole
  });

  it('autotiles test-ridge with every tile drawn', () => {
    const r = parseRegion(ridgeJson), { missing } = autotile(r, flatZ(r), T);
    expect(missing).toBe(0);
  });
});
