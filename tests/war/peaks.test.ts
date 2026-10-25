import { describe, expect, it } from 'vitest';
import { peakAt, peakField, STUB, stubField } from '../../src/war/view/peaks';
import type { RegionData } from '../../src/war/types';

/** A w x h region whose tiles inside the box [x0, x1) x [y0, y1) are mountain, biomes `names` with every tile the first. */
function region(w: number, h: number, names: string[]): RegionData {
  return { id: 't', name: 't', w, h, height: new Array(w * h).fill(0), terrain: new Array(w * h).fill('grass'), water: new Array(w * h).fill(0), entries: [], noBuild: [], biomes: { names, rle: [0, w * h] } } as unknown as RegionData;
}
function box(w: number, h: number, x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const m = new Uint8Array(w * h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * w + x] = 1;
  return m;
}

describe('peaks', () => {
  it('rises over the mountain only, meeting the ground at its edge, tall in a wide range', () => {
    const w = 120, h = 120, f = peakField(region(w, h, ['mountains']), box(w, h, 10, 10, 110, 110), () => 5);
    expect(peakAt(f, 5, 5)).toBe(0);
    expect(peakAt(f, 10, 60)).toBe(0);
    expect(peakAt(f, 11, 60)).toBeGreaterThan(0);
    expect(peakAt(f, 11, 60)).toBeLessThan(3);
    expect(f.top - 5).toBeGreaterThan(60);
    // the surface is the ground plus the peak
    const W = w + 1, k = 60 * W + 60;
    expect(f.S[k]).toBeCloseTo(5 + f.P[k]);
  });

  it('never rises over a road or a pre-built piece, nor hides one behind it', () => {
    const w = 120, h = 120, r = region(w, h, ['mountains']), m = box(w, h, 10, 10, 110, 110);
    // a road across the range (row 40) and a house in it (60, 70): both cut out of the mask's rock
    for (let x = 0; x < w; x++) { r.terrain[40 * w + x] = 'road'; m[40 * w + x] = 0; }
    r.prebuilt = [{ type: 'house', x: 60, y: 70 }];
    const f = peakField(r, m, () => 5), W = w + 1;
    expect(peakAt(f, 30.5, 40.5)).toBe(0);
    expect(peakAt(f, 60.5, 70.5)).toBe(0);
    // every lattice point j tiles in front of the house's foot, down its screen column, stands under it on screen
    for (let j = 0; j < 50; j++) expect(f.S[(71 + j) * W + 61 + j]).toBeLessThanOrEqual(5 + j + 0.5);
    // the range still rises tall where nothing stands behind it
    expect(f.top - 5).toBeGreaterThan(60);
  });

  it('cut away (V, a see-through hole): every peak lowered to a low stub over its foot', () => {
    const w = 60, h = 60, f = peakField(region(w, h, ['mountains']), box(w, h, 5, 5, 55, 55), () => 5), s = stubField(f), W = w + 1;
    expect(f.top - 5).toBeGreaterThan(20);
    expect(s.top).toBeCloseTo(5 + STUB);
    const k = 30 * W + 30;
    expect(s.P[k]).toBe(STUB);
    expect(s.S[k]).toBeCloseTo(5 + STUB);
    expect(s.P[2 * W + 2]).toBe(0);
  });

  it('snow in the mountains, red rock without snow in a desert region', () => {
    const w = 40, h = 40, m = box(w, h, 5, 5, 35, 35);
    const alp = peakField(region(w, h, ['mountains']), m, () => 0), des = peakField(region(w, h, ['kyrene']), m, () => 0);
    expect(alp.red[20 * w + 20]).toBe(0);
    expect(Number.isFinite(alp.snow[20 * w + 20])).toBe(true);
    expect(des.red[20 * w + 20]).toBe(1);
    expect(des.snow[20 * w + 20]).toBe(Infinity);
    // the desert's domes stay low
    expect(des.top).toBeLessThan(40);
  });
});
