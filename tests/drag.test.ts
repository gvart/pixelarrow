import { describe, expect, it } from 'vitest';
import { CANCEL, MIN_TURN, dragMove, dragPath, dragStart, type DragGroup } from '../src/ui/dragFormation';
import { isoToScreen, screenToIso } from '../src/art/iso';

// 8 men in 4x2 at (10, 27) facing the enemy (-y); the block's centre is 0.675 paces behind the front
const G: DragGroup = { cx: 10, cy: 27, fx: 0, fy: -1, frontage: 4, n: 8, px: 10, py: 27.675 };
/** A finger path from a to b in small steps. */
function line(a: [number, number], b: [number, number], n = 10): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 1; i <= n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return out;
}

describe('formation move drag', () => {
  it('the group follows the finger with the grab offset, keeping facing and shape', () => {
    const p = dragPath('move', G, [[11, 27.5], ...line([11, 27.5], [13, 25])])!;
    expect(p.cx).toBeCloseTo(12);
    expect(p.cy).toBeCloseTo(24.5);
    expect([p.fx, p.fy]).toEqual([0, -1]);
    expect(p).toMatchObject({ frontage: 4, files: 4, ranks: 2, kind: 'move' });
  });

  it('moving backwards never turns the men around', () => {
    const p = dragPath('move', G, [[10, 27], ...line([10, 27], [10, 31])])!;
    expect(p.cy).toBeCloseTo(31);
    expect(p.fy).toBe(-1);
  });

  it('lifted back on the start point: no order', () => {
    expect(dragPath('move', G, [[10, 27], ...line([10, 27], [13, 24]), ...line([13, 24], [10, 27])])).toBeNull();
    expect(dragPath('move', G, [[10, 27], [10, 27 + CANCEL * 0.9]])).toBeNull();
  });

  it('scales with zoom: at k = 2 the same short drag is still a cancel', () => {
    expect(dragPath('move', G, [[10, 27], ...line([10, 27], [10, 27.8])], 1)).not.toBeNull();
    expect(dragPath('move', G, [[10, 27], ...line([10, 27], [10, 27.8])], 2)).toBeNull();
  });
});

describe('formation turn drag', () => {
  it('faces TOWARD the finger and turns in place around the centre', () => {
    // knob ahead of the front, dragged round to the right (+x)
    const p = dragPath('turn', G, [[10, 25], ...line([10, 25], [13, 26.2])])!;
    const d = Math.hypot(3, 26.2 - 27.675);
    expect(p.fx).toBeCloseTo(3 / d);
    expect(p.fy).toBeCloseTo((26.2 - 27.675) / d);
    // the front stays the same distance from the centre, now on the new facing
    expect(p.cx - 10).toBeCloseTo(p.fx * 0.675);
    expect(p.cy - 27.675).toBeCloseTo(p.fy * 0.675);
    expect(p).toMatchObject({ frontage: 4, files: 4, ranks: 2, kind: 'turn' });
  });

  it('snaps to the eight field directions with one tick', () => {
    const s = dragStart('turn', G, 10, 25);
    dragMove(s, 12, 26.4); // between north-east and east: free
    expect(s.snapped).toBe(false);
    // close to east: snaps, and ticks once while it stays snapped
    const evs = line([12.9, 27.4], [13.1, 27.7], 5).map(([x, y]) => dragMove(s, x, y));
    expect(s.fx).toBe(1);
    expect(s.fy).toBe(0);
    expect(evs.filter((e) => e.snapped).length).toBe(1);
    // a diagonal snaps as well
    dragMove(s, 13, 24.6);
    expect(s.fx).toBeCloseTo(Math.SQRT1_2);
    expect(s.fy).toBeCloseTo(-Math.SQRT1_2);
  });

  it('a turn back to the old facing, or a finger on the centre, is no order', () => {
    expect(dragPath('turn', G, [[10, 25], ...line([10, 25], [12, 26]), ...line([12, 26], [10.05, 24])])).toBeNull();
    const s = dragStart('turn', G, 10, 25);
    dragMove(s, 10 + MIN_TURN * 0.5, 27.675);
    expect([s.fx, s.fy]).toEqual([0, -1]);
  });

  it('turns all the way round: dragged behind, the men face their own side', () => {
    const p = dragPath('turn', G, [[10, 25], ...line([10, 25], [13, 27.675]), ...line([13, 27.675], [10, 31])])!;
    expect([p.fx, p.fy]).toEqual([0, 1]);
    expect(p.cy).toBeCloseTo(27.675 + 0.675);
  });

  it('works through the iso projection: dragging up the screen faces up the screen', () => {
    const c = isoToScreen(G.px!, G.py!);
    const path: [number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      const f = screenToIso(c.x, c.y - 20 - i * 4);
      path.push([f.x, f.y]);
    }
    const p = dragPath('turn', G, path)!;
    const s = isoToScreen(10 + p.fx, 27 + p.fy);
    const o = isoToScreen(10, 27);
    expect(s.y - o.y).toBeLessThan(0);
    expect(Math.abs(s.x - o.x)).toBeLessThan(1e-6);
  });
});
