import { describe, expect, it } from 'vitest';
import { frontDepth, key, type Back } from '../../src/war/view/build/wallDepth';

/** A west wall (x 120) of 1-tile pieces, y 425..440, each back drawn at its centre's x + y (as the units sort). */
const wall = (): Map<number, Back> => {
  const m = new Map<number, Back>();
  for (let y = 425; y <= 440; y++) m.set(key(120, y), { x1: 121, y1: y + 1, depth: 120.495 + y + 0.495 });
  return m;
};

describe('unit depth beside a wall (frontDepth)', () => {
  it('a man in front of the +x face, past the next tile\'s end, draws over that tile', () => {
    // (121.05, 431.9): sorts at 552.95, the tile (120, 432) at 552.99, but he stands in front of its +x face
    const d = frontDepth(121.05, 431.9, wall());
    expect(121.05 + 431.9).toBeLessThan(120.495 + 432.495);
    expect(d).toBeGreaterThan(120.495 + 432.495);
  });

  it('a man behind a wall (its -x side) stays under the tiles in front of him', () => {
    expect(frontDepth(119.9, 431.9, wall())).toBeLessThan(119.9 + 431.9); // only the tile behind him (120, 430) counts
  });

  it('a man in front of the +y face of a wall along x draws over the tile up-right of him', () => {
    const m = new Map<number, Back>();
    for (let x = 119; x <= 135; x++) m.set(key(x, 426), { x1: x + 1, y1: 427, depth: x + 0.495 + 426.495 });
    expect(frontDepth(130.9, 427.05, m)).toBeGreaterThan(131.495 + 426.495);
    expect(frontDepth(130.9, 425.9, new Map([[key(131, 426), { x1: 132, y1: 427, depth: 557.99 }]]))).toBe(0);
  });

  it('a 2 x 2 tower: only a man past its whole +x side is in front of it', () => {
    const m = new Map<number, Back>();
    for (const [x, y] of [[127, 428], [128, 428], [127, 429], [128, 429]]) m.set(key(x, y), { x1: 129, y1: 430, depth: 557 });
    expect(frontDepth(129.1, 427.9, m)).toBeGreaterThan(557); // beside its +x face
    expect(frontDepth(128.6, 427.9, new Map([[key(127, 428), m.get(key(127, 428))!]]))).toBe(0); // behind its -y face
  });
});
