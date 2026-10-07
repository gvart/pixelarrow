import { describe, expect, it } from 'vitest';
import { DEPTH_STEP, MIN_PULL, SHORT_PULL, dragFormation } from '../src/ui/dragFormation';
import { isoToScreen, screenToIso } from '../src/art/iso';

describe('formation drag: face the pull', () => {
  it('centres the front rank on the touch point and faces the pull direction', () => {
    const p = dragFormation(10, 27, 12, 27, 6, 6, 0, -1);
    expect([p.cx, p.cy]).toEqual([10, 27]);
    expect(p.fx).toBeCloseTo(1);
    expect(p.fy).toBeCloseTo(0);
    const back = dragFormation(10, 27, 10, 29, 6, 6, 0, -1);
    expect(back.fy).toBeCloseTo(1); // pulling toward your own side turns the men around
  });

  it('a short pull only rotates; a longer pull adds ranks', () => {
    const short = dragFormation(10, 27, 10, 27 - SHORT_PULL, 8, 8, 1, 0);
    expect(short.frontage).toBe(8);
    const long = dragFormation(10, 27, 10, 27 - SHORT_PULL - DEPTH_STEP * 2, 8, 8, 1, 0);
    expect(long.frontage).toBeLessThan(8);
    expect(Math.ceil(8 / long.frontage)).toBe(3);
  });

  it('a pull shorter than the threshold keeps the facing', () => {
    const p = dragFormation(10, 27, 10 + MIN_PULL / 2, 27, 6, 3, 0, -1);
    expect([p.fx, p.fy, p.frontage]).toEqual([0, -1, 3]);
  });

  it('works through the iso projection: a screen-space pull becomes the field facing', () => {
    // finger moves straight up the screen from the touch point
    const a = isoToScreen(12, 27);
    const fa = screenToIso(a.x, a.y);
    const fb = screenToIso(a.x, a.y - 40);
    const p = dragFormation(fa.x, fa.y, fb.x, fb.y, 6, 6, 0, -1);
    const s = isoToScreen(12 + p.fx, 27 + p.fy);
    // projected facing points up the screen
    expect(s.y - a.y).toBeLessThan(0);
    expect(Math.abs(s.x - a.x)).toBeLessThan(1e-9);
  });
});
