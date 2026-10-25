// W-52 amendment: a sim level drawn 4 m (RELIEF visual levels of LH px) — picking and occlusion on a cliff edge.
import { describe, expect, it } from 'vitest';
import type { RegionData } from '../../src/war/types';
import { IsoMap, LH } from '../../src/war/view/iso';
import { encodeVisual, KINDS, RELIEF } from '../../src/war/regions/visual';

/** 40 x 40 tiles: a plateau at sim level 6 on x < 20 over ground at 0, its cliff facing +x (toward the viewer). */
function cliff(): IsoMap {
  const w = 40, h = 40, height = Array.from({ length: w * h }, (_, i) => (i % w < 20 ? 6 : 0));
  const r: RegionData = { id: 'c', name: 'c', w, h, height, terrain: Array(w * h).fill('grass'), water: Array(w * h).fill(0), entries: [], noBuild: [] };
  const fw = 2 * w, kind = new Uint8Array(fw * 2 * h).fill(KINDS.indexOf('grass')), z = new Uint8Array(fw * 2 * h);
  for (let j = 0; j < z.length; j++) z[j] = RELIEF * height[((j / fw / 2) | 0) * w + ((j % fw) >> 1)];
  return new IsoMap({ ...r, visual: { scale: 2, rle: encodeVisual(kind, z) } });
}

describe('iso picking on a cliff edge (4 m levels)', () => {
  it('a sim level is drawn 4 m: RELIEF levels of 32 px', () => {
    expect(LH).toBe(32);
    expect(RELIEF * LH).toBe(128);
  });

  it('a click on the plateau just behind the rim picks the plateau, not the ground under it', () => {
    const iso = cliff(), x = 19.6, y = 20.5;
    const p = iso.pick(iso.sx(x, y), iso.sy(x, y, iso.zAt(x, y)));
    expect(p.x).toBeCloseTo(x, 1);
    expect(p.y).toBeCloseTo(y, 1);
  });

  it('a click on the cliff face picks the tile on top of it (highest first)', () => {
    const iso = cliff(), top = iso.sy(19.99, 20.5, 24), foot = iso.sy(20.01, 20.5, 0);
    expect(foot - top).toBeGreaterThan(24 * LH * 0.9); // the 6-level face is ~768 px tall
    const p = iso.pick(iso.sx(19.99, 20.5), (top + foot) / 2);
    expect(Math.floor(p.x)).toBe(19);
  });

  it('a click on the low ground in front of the foot picks the low ground', () => {
    const iso = cliff(), x = 24.5, y = 20.5;
    const p = iso.pick(iso.sx(x, y), iso.sy(x, y, 0));
    expect(p.x).toBeCloseTo(x, 1);
    expect(iso.zAt(p.x, p.y)).toBe(0);
  });

  it('a man at the foot of a wall facing away is hidden behind it; one on open ground is not', () => {
    // a bank 2 sim levels (8 m, 256 px) high on x >= 20, its rim facing -x (away from the viewer): it hides the low ground
    // behind it as far as 256 / HH = 16 units of x + y (8 tiles straight back)
    const w = 40, h = 40, height = Array.from({ length: w * h }, (_, i) => (i % w >= 20 ? 2 : 0));
    const r: RegionData = { id: 'b', name: 'b', w, h, height, terrain: Array(w * h).fill('grass'), water: Array(w * h).fill(0), entries: [], noBuild: [] };
    const fw = 2 * w, kind = new Uint8Array(fw * 2 * h).fill(KINDS.indexOf('grass')), z = new Uint8Array(fw * 2 * h);
    for (let j = 0; j < z.length; j++) z[j] = RELIEF * height[((j / fw / 2) | 0) * w + ((j % fw) >> 1)];
    const iso = new IsoMap({ ...r, visual: { scale: 2, rle: encodeVisual(kind, z) } });
    const at = (x: number, y: number) => iso.hidden(iso.sx(x, y), iso.sy(x, y, 0) - 30, x + y, 0);
    expect(at(19.2, 10.5)).toBe(true);
    expect(at(14.5, 10.5)).toBe(true);
    expect(at(2.5, 10.5)).toBe(false);
  });
});
