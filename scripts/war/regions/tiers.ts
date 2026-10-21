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

/**
 * A depth-2 pocket's tier-1 boss (docs/WAR.md "Region lore and depth", src/data/warBosses.ts) at its den: a small
 * guardian site of no pieces round unit point `at` (its claim gate as any guardian's), `r` units each way.
 */
export function pocketBoss(k: Kit, boss: string, at: Pt, r = 6) {
  const s = Math.round(r * 4);
  return k.site(`${boss}-den`, [at[0] - r, at[1] - r], [s, s], { guardians: [{ boss, at: [s / 2, s / 2] }] });
}

/**
 * A town wall (W-47/W-48: real stoneWall, stoneTower and stoneGate pieces of the nearest town) round a rectangle of
 * half-size hx x hy units about c: towers on the corners, 2-tile wall runs between, a gate in the middle of each of
 * `gates` (map sides: N top, S bottom, W left, E right). Runs that would land on a road or water are left out.
 */
export function townWall(k: Kit, c: Pt, hx: number, hy: number, gates: ('N' | 'S' | 'W' | 'E')[] = []) {
  const t = (u: number) => Math.round((u + 0.5) * 2 - 0.5);
  const x0 = t(c[0] - hx), x1 = t(c[0] + hx), y0 = t(c[1] - hy), y1 = t(c[1] + hy), mx = (x0 + x1) >> 1, my = (y0 + y1) >> 1;
  const u = (t: number) => (t + 0.5) / 2 - 0.5;
  const clear = (x: number, y: number, w: number, h: number) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const n = k.at([u(x + i), u(y + j)]); if (n < 0 || k.water[n] || k.terrain[n] === 'road') return false; }
    return true;
  };
  const put = (id: string, x: number, y: number, w: number, h: number) => { if (clear(x, y, w, h)) k.structure(id, x, y, false); };
  for (const [x, y] of [[x0, y0], [x1 - 1, y0], [x0, y1 - 1], [x1 - 1, y1 - 1]]) put('elaia/town-tower', x, y, 2, 2);
  for (const [y, side] of [[y0, 'N'], [y1 - 1, 'S']] as const) for (let x = x0 + 2; x < x1 - 3; x += 2) {
    if (gates.includes(side) && x <= mx && mx <= x + 1) k.structure('elaia/town-gate-x', x, y, false);
    else put('elaia/town-wall-x', x, y, 2, 1);
  }
  for (const [x, side] of [[x0, 'W'], [x1 - 1, 'E']] as const) for (let y = y0 + 2; y < y1 - 3; y += 2) {
    if (gates.includes(side) && y <= my && my <= y + 1) k.structure('elaia/town-gate-y', x, y, false);
    else put('elaia/town-wall-y', x, y, 1, 2);
  }
}
