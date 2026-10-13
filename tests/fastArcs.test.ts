/** QA-05: Graphics arcs as as few chords as their radius needs (src/platform/fastArcs.ts). */
import { describe, expect, it } from 'vitest';
import { arcPoints, arcSegments, arcSweep, installFastArcs } from '../src/platform/fastArcs';

const sagitta = (r: number, n: number, sweep: number) => r * (1 - Math.cos(sweep / n / 2));

describe('fastArcs', () => {
  it('keeps every chord within a quarter device px at 12 device px per unit, and never above 100 segments', () => {
    for (const r of [0.5, 1, 1.2, 2, 5, 10, 40, 200, 2000]) {
      for (const sweep of [Math.PI / 2, Math.PI, Math.PI * 2]) {
        const n = arcSegments(r, sweep);
        expect(n, `${r} ${sweep}`).toBeLessThanOrEqual(100);
        if (n < 100) expect(sagitta(r * 12, n, sweep), `${r} ${sweep}`).toBeLessThanOrEqual(0.25 + 1e-9);
      }
    }
    // the battle cards' 1.2 UI px bar corners: a handful of points instead of Phaser's 101
    expect(arcSegments(1.2, Math.PI / 2)).toBeLessThanOrEqual(6);
  });

  it("normalises the sweep as Phaser's renderer does", () => {
    expect(arcSweep(0, Math.PI * 3, false)).toBeCloseTo(Math.PI * 2);
    expect(arcSweep(Math.PI, 0, false)).toBeCloseTo(Math.PI);
    expect(arcSweep(0, Math.PI / 2, true)).toBeCloseTo(-Math.PI * 1.5);
    expect(arcSweep(0, -Math.PI * 3, true)).toBeCloseTo(-Math.PI * 2);
  });

  it('starts and ends where the stock arc does, every point on the circle', () => {
    const pts = arcPoints(10, 20, 5, -Math.PI / 2, 0);
    expect(pts[0][0]).toBeCloseTo(10);
    expect(pts[0][1]).toBeCloseTo(15);
    expect(pts.at(-1)![0]).toBeCloseTo(15);
    expect(pts.at(-1)![1]).toBeCloseTo(20);
    for (const [x, y] of pts) expect(Math.hypot(x - 10, y - 20)).toBeCloseTo(5);
    // the overshoot goes past the end, then the last point is the end (Phaser's order)
    const o = arcPoints(0, 0, 5, 0, Math.PI / 2, false, 0.1);
    expect(Math.atan2(o.at(-2)![1], o.at(-2)![0])).toBeCloseTo((Math.PI / 2) * 1.1);
    expect(Math.atan2(o.at(-1)![1], o.at(-1)![0])).toBeCloseTo(Math.PI / 2);
  });

  it('records an arc as lineTo commands on the Graphics', () => {
    const calls: [number, number][] = [];
    class G {
      lineTo(x: number, y: number) {
        calls.push([x, y]);
        return this;
      }
    }
    installFastArcs(G as never);
    const g = new G() as unknown as { arc: (...a: number[]) => unknown };
    expect(g.arc(0, 0, 1.2, 0, Math.PI / 2)).toBe(g);
    expect(calls.length).toBe(arcPoints(0, 0, 1.2, 0, Math.PI / 2).length);
    expect(calls.length).toBeLessThan(10);
  });
});
