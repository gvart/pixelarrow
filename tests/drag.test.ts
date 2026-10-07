import { describe, expect, it } from 'vitest';
import { CANCEL, LOCK, MAX_RANKS, MIN_PULL, STEP, shapeFor, slingDwell, slingMove, slingPath, slingPlan, slingStart, type SlingGroup } from '../src/ui/dragFormation';
import { isoToScreen, screenToIso } from '../src/art/iso';

// 8 men in one rank at (10, 27) facing the enemy (-y)
const G: SlingGroup = { cx: 10, cy: 27, fx: 0, fy: -1, frontage: 8, n: 8 };
/** A finger path from a to b in small steps. */
function line(a: [number, number], b: [number, number], n = 10): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 1; i <= n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return out;
}

describe('slingshot formation gesture', () => {
  it('grab and pull back: aims where it stands, facing AWAY from the finger', () => {
    const p = slingPath(G, [[10, 27], ...line([10, 27], [10, 29])])!;
    expect([p.cx, p.cy]).toEqual([10, 27]);
    expect(p.fx).toBeCloseTo(0);
    expect(p.fy).toBeCloseTo(-1); // pulled toward own side -> faces the enemy
    const side = slingPath(G, [[10, 27], ...line([10, 27], [9, 28.6])])!;
    // pulled back and to the left -> faces forward and to the right
    expect(side.fx).toBeGreaterThan(0.4);
    expect(side.fy).toBeLessThan(-0.7);
  });

  it('carry, then pull back: the group stands where it was carried and faces away from the pull', () => {
    const path: [number, number][] = [[10, 27], ...line([10, 27], [14, 24]), ...line([14, 24], [12, 24])];
    const p = slingPath(G, path)!;
    expect(p.cx).toBeCloseTo(14);
    expect(p.cy).toBeCloseTo(24);
    expect(p.fx).toBeCloseTo(1); // pulled toward -x -> faces +x
    expect(p.fy).toBeCloseTo(0);
    expect(p.aimed).toBe(true);
  });

  it('keeps the grab offset while carrying', () => {
    const p = slingPath(G, [[11, 27.5], ...line([11, 27.5], [13, 25])])!;
    expect(p.cx).toBeCloseTo(12);
    expect(p.cy).toBeCloseTo(24.5);
    expect([p.fx, p.fy]).toEqual([0, -1]); // carry only: facing and shape kept
    expect(p.frontage).toBe(8);
    expect(p.aimed).toBe(false);
  });

  it('a rest locks the anchor, then the pull aims', () => {
    const s = slingStart(G, 10, 27);
    for (const [x, y] of line([10, 27], [10, 23])) slingMove(s, x, y);
    expect(s.phase).toBe('carry');
    expect(slingDwell(s).anchored).toBe(true);
    for (const [x, y] of line([10, 23], [12, 23])) slingMove(s, x, y);
    const p = slingPlan(s)!;
    expect([p.cx, p.cy]).toEqual([10, 23]);
    expect(p.fx).toBeCloseTo(-1);
  });

  it('cancel: back on the start point, or a tiny pull without a carry', () => {
    expect(slingPath(G, [[10, 27], ...line([10, 27], [13, 24]), ...line([13, 24], [10, 27])])).toBeNull();
    expect(slingPath(G, [[10, 27], [10, 27 + MIN_PULL * 0.9]])).toBeNull();
    const s = slingStart(G, 10, 27);
    slingDwell(s);
    slingMove(s, 10.2, 27.2);
    expect(slingPlan(s)).toBeNull();
    expect(CANCEL).toBeGreaterThan(0);
  });

  it('facing locks once, with an event; ranks change events come in whole ranks', () => {
    const s = slingStart(G, 10, 27);
    const evs = [...line([10, 27], [10, 27 + LOCK + 0.2])].map(([x, y]) => slingMove(s, x, y));
    expect(evs.filter((e) => e.locked).length).toBe(1);
    expect(s.locked).toBe(true);
    // pull further back by 1 step: one more rank (8 -> 4x2)
    const ly = s.ly;
    const e1 = slingMove(s, 10, ly + STEP + 0.05);
    expect(e1.ranks).toBe(true);
    expect(slingPlan(s)!.ranks).toBe(2);
    expect(slingPlan(s)!.files).toBe(4);
    expect(slingMove(s, 10, ly + STEP + 0.1).ranks).toBeUndefined();
  });

  it('sideways widens, further back deepens; clamped and snapped to whole ranks', () => {
    const deep: SlingGroup = { ...G, frontage: 4 }; // 4x2
    const s = slingStart(deep, 10, 27);
    for (const [x, y] of line([10, 27], [10, 28.5])) slingMove(s, x, y);
    expect(s.locked).toBe(true);
    expect(slingPlan(s)!.ranks).toBe(2);
    slingMove(s, 10 + 1.1, s.ly); // one step sideways (right)
    expect(slingPlan(s)).toMatchObject({ files: 8, ranks: 1 });
    slingMove(s, 10 - 5, s.ly); // far sideways (left): clamped at one rank
    expect(slingPlan(s)).toMatchObject({ files: 8, ranks: 1 });
    slingMove(s, 10, s.ly + 2.2); // pull back two steps: 4 ranks of 2
    expect(slingPlan(s)).toMatchObject({ files: 2, ranks: 4 });
    slingMove(s, 10, s.ly + 30); // very deep: clamped at n
    expect(slingPlan(s)!.ranks).toBe(Math.min(8, MAX_RANKS));
    // facing stays locked whatever the shape
    expect(slingPlan(s)!.fy).toBeCloseTo(-1);
  });

  it('shapeFor snaps to whole ranks', () => {
    expect(shapeFor(10, 3)).toEqual({ files: 4, ranks: 3 });
    expect(shapeFor(10, 4)).toEqual({ files: 3, ranks: 4 });
    expect(shapeFor(7, 0)).toEqual({ files: 7, ranks: 1 });
    expect(shapeFor(1, 5)).toEqual({ files: 1, ranks: 1 });
    expect(shapeFor(40, 20).ranks).toBe(MAX_RANKS);
  });

  it('scales with zoom: at k = 2 the same short pull is still a cancel', () => {
    expect(slingPath(G, [[10, 27], ...line([10, 27], [10, 27.8])], 1)).not.toBeNull();
    expect(slingPath(G, [[10, 27], ...line([10, 27], [10, 27.8])], 2)).toBeNull();
  });

  it('works through the iso projection: pulling down the screen faces up the screen', () => {
    const a = isoToScreen(10, 27);
    const fa = screenToIso(a.x, a.y);
    const path: [number, number][] = [[fa.x, fa.y]];
    for (let i = 1; i <= 10; i++) {
      const f = screenToIso(a.x, a.y + i * 4);
      path.push([f.x, f.y]);
    }
    const p = slingPath(G, path)!;
    const s = isoToScreen(10 + p.fx, 27 + p.fy);
    expect(s.y - a.y).toBeLessThan(0);
    expect(Math.abs(s.x - a.x)).toBeLessThan(1e-9);
  });
});
