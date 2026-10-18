import type { RegionData, TerrainKind } from '../types';

/** Move cost per tile (1 = grass); 0 = impassable. */
const TERRAIN_COST: Record<TerrainKind, number> = { grass: 1, dirt: 1, road: 0.7, forest: 1.6, sand: 1.4, marsh: 2, snow: 1.5, rock: 0 };
const SHALLOW = 2; // multiplier in a ford
export const UPHILL = 1.5; // multiplier when stepping one height level up
const MIN_COST = TERRAIN_COST.road;
const SQRT2 = Math.SQRT2;

export interface Grid {
  w: number;
  h: number;
  cost: Float32Array;
  height: Uint8Array;
  /** Fighting ground per tile: BOG (ford or marsh), FOREST, else 0. */
  ground: Uint8Array;
}

export const BOG = 1;
export const FOREST = 2;

export function buildGrid(r: RegionData): Grid {
  const n = r.w * r.h;
  const cost = new Float32Array(n);
  const height = new Uint8Array(n);
  const ground = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    height[i] = r.height[i];
    ground[i] = r.water[i] === 1 || r.terrain[i] === 'marsh' ? BOG : r.terrain[i] === 'forest' ? FOREST : 0;
    cost[i] = r.water[i] === 2 ? 0 : TERRAIN_COST[r.terrain[i]] * (r.water[i] === 1 ? SHALLOW : 1);
  }
  return { w: r.w, h: r.h, cost, height, ground };
}

export function tileAt(g: Grid, x: number, y: number): number {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  return tx < 0 || ty < 0 || tx >= g.w || ty >= g.h ? -1 : ty * g.w + tx;
}

/** Can a unit step from tile a into the adjacent tile b (open, and not a cliff of 2+ levels)? */
export function canEnter(g: Grid, a: number, b: number): boolean {
  return b >= 0 && g.cost[b] > 0 && Math.abs(g.height[b] - g.height[a]) < 2;
}

/** Cost multiplier for moving from tile a into tile b (terrain of b, slower uphill). */
export function stepCost(g: Grid, a: number, b: number): number {
  return g.height[b] > g.height[a] ? g.cost[b] * UPHILL : g.cost[b];
}

/** Straight walk from (x0,y0) to (x1,y1) crosses no blocked tile or cliff. */
export function lineClear(g: Grid, x0: number, y0: number, x1: number, y1: number): boolean {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4);
  let prev = tileAt(g, x0, y0);
  if (prev < 0) return false;
  for (let s = 1; s <= steps; s++) {
    const t = tileAt(g, x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps);
    if (t !== prev) {
      if (!canEnter(g, prev, t)) return false;
      prev = t;
    }
  }
  return true;
}

/** Nearest open tile to (tx,ty) by growing square rings; -1 if the map has none. */
export function nearestOpen(g: Grid, tx: number, ty: number): number {
  const max = Math.max(g.w, g.h);
  for (let r = 0; r < max; r++)
    for (let y = ty - r; y <= ty + r; y++)
      for (let x = tx - r; x <= tx + r; x++) {
        if ((Math.abs(x - tx) !== r && Math.abs(y - ty) !== r) || x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
        if (g.cost[y * g.w + x] > 0) return y * g.w + x;
      }
  return -1;
}

// A* scratch, reused across searches (the sim is single-threaded).
let scratchN = 0;
let gScore = new Float32Array(0);
let parent = new Int32Array(0);
let seen = new Uint32Array(0); // search stamp when gScore is valid
let closed = new Uint32Array(0);
let heapNode = new Int32Array(0);
let heapF = new Float32Array(0);
let stamp = 0;

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

/**
 * 8-way A* over tiles with terrain and uphill costs; diagonals may not cut a blocked corner.
 * Returns tile indices from start to goal, or to the explored tile closest to the goal when it
 * is unreachable.
 */
export function findPath(g: Grid, start: number, goal: number): number[] {
  const n = g.w * g.h;
  if (scratchN !== n) {
    scratchN = n;
    gScore = new Float32Array(n);
    parent = new Int32Array(n);
    seen = new Uint32Array(n);
    closed = new Uint32Array(n);
    heapNode = new Int32Array(n * 8);
    heapF = new Float32Array(n * 8);
    stamp = 0;
  }
  stamp++;
  const w = g.w;
  const gx = goal % w;
  const gy = (goal / w) | 0;
  const hOf = (i: number) => {
    const dx = Math.abs((i % w) - gx);
    const dy = Math.abs(((i / w) | 0) - gy);
    return MIN_COST * (Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy));
  };
  let size = 0;
  const push = (node: number, f: number) => {
    let i = size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= f) break;
      heapNode[i] = heapNode[p];
      heapF[i] = heapF[p];
      i = p;
    }
    heapNode[i] = node;
    heapF[i] = f;
  };
  const pop = () => {
    const top = heapNode[0];
    const lastN = heapNode[--size];
    const lastF = heapF[size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= size) break;
      if (c + 1 < size && heapF[c + 1] < heapF[c]) c++;
      if (heapF[c] >= lastF) break;
      heapNode[i] = heapNode[c];
      heapF[i] = heapF[c];
      i = c;
    }
    heapNode[i] = lastN;
    heapF[i] = lastF;
    return top;
  };

  gScore[start] = 0;
  parent[start] = -1;
  seen[start] = stamp;
  push(start, hOf(start));
  let best = start;
  let bestH = hOf(start);
  while (size > 0) {
    const cur = pop();
    if (closed[cur] === stamp) continue;
    closed[cur] = stamp;
    if (cur === goal) {
      best = cur;
      break;
    }
    const hc = hOf(cur);
    if (hc < bestH) {
      bestH = hc;
      best = cur;
    }
    const cx = cur % w;
    const cy = (cur / w) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k];
      const ny = cy + DY[k];
      if (nx < 0 || ny < 0 || nx >= w || ny >= g.h) continue;
      const nb = ny * w + nx;
      if (closed[nb] === stamp || !canEnter(g, cur, nb)) continue;
      if (k >= 4 && (!canEnter(g, cur, cy * w + nx) || !canEnter(g, cur, ny * w + cx))) continue;
      const ng = gScore[cur] + stepCost(g, cur, nb) * (k >= 4 ? SQRT2 : 1);
      if (seen[nb] === stamp && ng >= gScore[nb]) continue;
      seen[nb] = stamp;
      gScore[nb] = ng;
      parent[nb] = cur;
      push(nb, ng + hOf(nb));
    }
  }
  const out: number[] = [];
  for (let i = best; i !== -1; i = parent[i]) out.push(i);
  return out.reverse();
}
