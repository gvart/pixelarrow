/**
 * W-50 helpers for the hand-made regions: a stream that runs down a region's tiers (its bed a level under the ground it
 * crosses, a waterfall wherever the ground drops two or more levels along it), shared by the region scripts.
 */
import { spline } from '../shapes.ts';
import type { Kit, Pt } from './kit.ts';

/**
 * A river along pts (upstream first) whose bed follows `ground` (the tier under it, read before the river is cut) one
 * level down; at every drop of 2+ levels a waterfall (Kit.fall) and spot `<name>Fall<n>`. Returns the fall points.
 */
export function tierStream(k: Kit, pts: Pt[], ground: (x: number, y: number) => number, o: { half?: number; deep?: boolean; bank?: number; fords?: Pt[]; fordHalf?: number; narrows?: [Pt, number][]; name?: string } = {}): Pt[] {
  const c = spline(pts);
  const lv = c.map((p) => Math.max(0, ground(p.x, p.y) - 1));
  // the bed never climbs downstream
  for (let n = 1; n < lv.length; n++) lv[n] = Math.min(lv[n], lv[n - 1]);
  const bed = (s: number) => {
    let lo = 0, hi = c.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (c[m].s < s) lo = m + 1; else hi = m; }
    return lv[lo];
  };
  k.river(pts, { half: o.half ?? 1.4, deep: o.deep ?? false, bed, bank: o.bank ?? 0.15, fords: o.fords, fordHalf: o.fordHalf, narrows: o.narrows, name: o.name });
  const falls: Pt[] = [];
  for (let n = 1; n < c.length; n++) {
    if (lv[n - 1] - lv[n] < 2) continue;
    const p = c[n], q = c[Math.min(c.length - 1, n + 6)];
    if (p.x < 2 || p.y < 2 || p.x > 254 || p.y > 254) continue;
    k.fall([p.x + p.tx * 0.5, p.y + p.ty * 0.5], [q.x, q.y]);
    if (o.name) k.spot(`${o.name}Fall${falls.length || ''}`, [p.x, p.y]);
    falls.push([p.x, p.y]);
  }
  return falls;
}
