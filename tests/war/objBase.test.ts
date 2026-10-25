import { describe, expect, it } from 'vitest';
import { baseOffset } from '../../src/war/view/objBase';

/** A w x h RGBA sprite with the given opaque runs per row: rows[y] = [lo, hi] (inclusive). */
function sprite(w: number, h: number, rows: Record<number, [number, number][]>): Uint8Array {
  const px = new Uint8Array(w * h * 4);
  for (const [y, runs] of Object.entries(rows)) for (const [lo, hi] of runs) for (let x = lo; x <= hi; x++) px[(+y * w + x) * 4 + 3] = 255;
  return px;
}

describe('object base', () => {
  it('rings a tree round its trunk base, not the root tip its anchor sits on', () => {
    // a 60 x 120 tree: canopy rows 0-59, a trunk x 26..33 down to row 105, roots flaring to x 16..44 at row 110, one root
    // running down-left to a tip at x 18..20, row 119 (the anchor: the lowest opaque pixel)
    const w = 60, h = 120, rows: Record<number, [number, number][]> = {};
    for (let y = 0; y < 60; y++) rows[y] = [[5, 55]];
    for (let y = 60; y <= 105; y++) rows[y] = [[26, 33]];
    for (let y = 106; y <= 112; y++) { const s = (y - 105) * 2; rows[y] = [[26 - s, 33 + s - 2]]; }
    for (let y = 113; y <= 119; y++) rows[y] = [[18, 20 + (119 - y)]];
    const b = baseOffset(sprite(w, h, rows), w, h, 19, 119);
    // the widest row of the flare (112), under the trunk's middle (x 29.5)
    expect(b.dy).toBe(112 - 119);
    expect(19 + b.dx).toBeGreaterThanOrEqual(29);
    expect(19 + b.dx).toBeLessThanOrEqual(30);
  });

  it('leaves a sprite with no spread base on its anchor', () => {
    const w = 10, h = 20, rows: Record<number, [number, number][]> = {};
    for (let y = 0; y < 20; y++) rows[y] = [[4, 6]];
    expect(baseOffset(sprite(w, h, rows), w, h, 5, 19)).toEqual({ dx: 0, dy: 0 });
  });
});
