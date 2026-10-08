/** A* on a tile grid, 8-directional, no corner cutting past impassable tiles. Pure and deterministic. */

export interface Tile {
  x: number;
  y: number;
}

/** Cost of entering tile (x, y); Infinity = impassable. */
export type CostFn = (x: number, y: number) => number;

class Heap {
  private items: number[] = [];
  private prio: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, p: number): void {
    const it = this.items;
    const pr = this.prio;
    it.push(item);
    pr.push(p);
    let i = it.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pr[parent] <= pr[i]) break;
      [it[parent], it[i]] = [it[i], it[parent]];
      [pr[parent], pr[i]] = [pr[i], pr[parent]];
      i = parent;
    }
  }
  pop(): number {
    const it = this.items;
    const pr = this.prio;
    const top = it[0];
    const lastI = it.pop()!;
    const lastP = pr.pop()!;
    if (it.length > 0) {
      it[0] = lastI;
      pr[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < it.length && pr[l] < pr[m]) m = l;
        if (r < it.length && pr[r] < pr[m]) m = r;
        if (m === i) break;
        [it[m], it[i]] = [it[i], it[m]];
        [pr[m], pr[i]] = [pr[i], pr[m]];
        i = m;
      }
    }
    return top;
  }
}

const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * Cheapest path from (sx, sy) to (tx, ty), both tiles included. Returns null if
 * the goal is unreachable or the search exceeds maxNodes expansions.
 * minCost is the cheapest possible tile cost (keeps the heuristic admissible).
 */
export function findPath(w: number, h: number, cost: CostFn, sx: number, sy: number, tx: number, ty: number, minCost = 1, maxNodes = 40000): Tile[] | null {
  if (sx === tx && sy === ty) return [{ x: sx, y: sy }];
  if (!isFinite(cost(tx, ty))) return null;
  const n = w * h;
  const g = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const start = sy * w + sx;
  const goal = ty * w + tx;
  const heur = (x: number, y: number) => {
    const dx = Math.abs(x - tx);
    const dy = Math.abs(y - ty);
    return (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)) * minCost;
  };
  const open = new Heap();
  g[start] = 0;
  open.push(start, heur(sx, sy));
  let expanded = 0;
  while (open.size > 0) {
    const cur = open.pop();
    if (closed[cur]) continue;
    if (cur === goal) break;
    closed[cur] = 1;
    if (++expanded > maxNodes) return null;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    for (const [dx, dy, mul] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (closed[ni]) continue;
      const c = cost(nx, ny);
      if (!isFinite(c)) continue;
      if (dx !== 0 && dy !== 0 && (!isFinite(cost(cx + dx, cy)) || !isFinite(cost(cx, cy + dy)))) continue;
      const ng = g[cur] + c * mul;
      if (ng < g[ni]) {
        g[ni] = ng;
        from[ni] = cur;
        open.push(ni, ng + heur(nx, ny));
      }
    }
  }
  if (from[goal] < 0) return null;
  const out: Tile[] = [];
  for (let c = goal; c !== -1; c = from[c]) {
    const x = c % w;
    out.push({ x, y: (c - x) / w });
    if (c === start) break;
  }
  out.reverse();
  return out;
}
