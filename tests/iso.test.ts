import { describe, expect, it } from 'vitest';
import { isoFacing, isoToScreen, screenToIso } from '../src/art/iso';

describe('isometric projection', () => {
  it('round-trips field <-> screen coordinates', () => {
    for (const [x, y] of [[0, 0], [12, 26], [23.5, 0.25], [3.3, 35.9]]) {
      const s = isoToScreen(x, y);
      const b = screenToIso(s.x, s.y);
      expect(b.x).toBeCloseTo(x, 9);
      expect(b.y).toBeCloseTo(y, 9);
    }
  });

  it('is a 2:1 diamond projection with the battle line on a diagonal', () => {
    const o = isoToScreen(0, 0);
    const ex = isoToScreen(1, 0);
    const ey = isoToScreen(0, 1);
    expect((ex.x - o.x) / (ex.y - o.y)).toBe(2); // field x -> down-right
    expect((ey.x - o.x) / (ey.y - o.y)).toBe(-2); // field y -> down-left
  });

  it('player (facing -y) is seen from behind facing right, enemy from the front facing left', () => {
    expect(isoFacing(0, -1)).toMatchObject({ back: true, left: false });
    expect(isoFacing(0, 1)).toMatchObject({ back: false, left: true });
  });
});
