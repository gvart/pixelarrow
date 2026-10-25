import { describe, expect, it } from 'vitest';
import { peakAt, peakField } from '../../src/war/view/peaks';
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
