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
  sectors: Sectors;
}

/**
 * Coarse layer for long searches: the map is cut into SECTOR x SECTOR blocks and each block into
 * nodes, the sets of its open tiles that reach each other inside the block under the A* move rules.
 * Nodes link where a legal step crosses a block border. A long search first finds a node path, then
 * runs the tile A* only inside the blocks along it (and their neighbours).
 */
export interface Sectors {
  node: Int32Array; // tile -> node, -1 when blocked
  n: number;
  bx: Int32Array; // node -> block column
  by: Int32Array; // node -> block row
  cx: Float32Array; // node centroid (tile coords)
  cy: Float32Array;
  start: Int32Array; // CSR adjacency: links of node k are adj[start[k] .. start[k+1])
  adj: Int32Array;
  adjCost: Float32Array;
  bw: number; // blocks per row
  bh: number;
  blockNodes: Int32Array[]; // block (row-major) -> its nodes
}

export const SECTOR = 8;

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
  const g = { w: r.w, h: r.h, cost, height, ground } as Grid;
  g.sectors = buildSectors(g);
  ensureScratch(g); // allocate the search scratch now, not in the first tick
  return g;
}

/** Legal step from tile a = (ax,ay) in direction k (A* rules: open, no cliff, no cut corner); the tile or -1. */
function stepTo(g: Grid, a: number, ax: number, ay: number, k: number): number {
  const nx = ax + DX[k];
  const ny = ay + DY[k];
  if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) return -1;
  const b = ny * g.w + nx;
  if (!canEnter(g, a, b)) return -1;
  if (k >= 4 && (!canEnter(g, a, ay * g.w + nx) || !canEnter(g, a, ny * g.w + ax))) return -1;
  return b;
}

function buildSectors(g: Grid): Sectors {
  const { w, h } = g;
  const node = new Int32Array(w * h).fill(-1);
  const bw = Math.ceil(w / SECTOR);
  const bh = Math.ceil(h / SECTOR);
  const blockNodes: number[][] = Array.from({ length: bw * bh }, () => []);
  const bx: number[] = [];
  const by: number[] = [];
  const cx: number[] = [];
  const cy: number[] = [];
  const meanCost: number[] = [];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (node[i] >= 0 || g.cost[i] === 0) continue;
    const id = bx.length;
    const bcol = Math.floor((i % w) / SECTOR);
    const brow = Math.floor(i / w / SECTOR);
    let sx = 0, sy = 0, sc = 0, count = 0;
    node[i] = id;
    stack.push(i);
    while (stack.length) {
      const t = stack.pop()!;
      const tx = t % w;
      const ty = (t / w) | 0;
      sx += tx + 0.5;
      sy += ty + 0.5;
      sc += g.cost[t];
      count++;
      for (let k = 0; k < 8; k++) {
        const b = stepTo(g, t, tx, ty, k);
        if (b < 0 || node[b] >= 0 || Math.floor((b % w) / SECTOR) !== bcol || Math.floor(b / w / SECTOR) !== brow) continue;
        node[b] = id;
        stack.push(b);
      }
    }
    bx.push(bcol);
    by.push(brow);
    cx.push(sx / count);
    cy.push(sy / count);
    meanCost.push(sc / count);
    blockNodes[brow * bw + bcol].push(id);
  }
  const n = bx.length;
  const links: Set<number>[] = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < w * h; t++) {
    const a = node[t];
    if (a < 0) continue;
    const tx = t % w;
    const ty = (t / w) | 0;
    for (let k = 0; k < 8; k++) {
      const b = stepTo(g, t, tx, ty, k);
      if (b >= 0 && node[b] !== a) links[a].add(node[b]);
    }
  }
  const start = new Int32Array(n + 1);
  for (let k = 0; k < n; k++) start[k + 1] = start[k] + links[k].size;
  const adj = new Int32Array(start[n]);
  const adjCost = new Float32Array(start[n]);
  for (let k = 0; k < n; k++) {
    let j = start[k];
    for (const o of links[k]) {
      adj[j] = o;
      adjCost[j++] = Math.hypot(cx[o] - cx[k], cy[o] - cy[k]) * 0.5 * (meanCost[k] + meanCost[o]);
    }
  }
  return {
    node, n, bx: Int32Array.from(bx), by: Int32Array.from(by), cx: Float32Array.from(cx), cy: Float32Array.from(cy),
    start, adj, adjCost, bw, bh, blockNodes: blockNodes.map((b) => Int32Array.from(b)),
  };
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

let allowed = new Uint32Array(0); // node -> search stamp when the tile search may enter it

/** A binary min-heap over (node, f) pairs in the given arrays. */
function heap(nodes: Int32Array, fs: Float32Array) {
  let size = 0;
  return {
    get size() {
      return size;
    },
    push(node: number, f: number) {
      let i = size++;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (fs[p] <= f) break;
        nodes[i] = nodes[p];
        fs[i] = fs[p];
        i = p;
      }
      nodes[i] = node;
      fs[i] = f;
    },
    pop() {
      const top = nodes[0];
      const lastN = nodes[--size];
      const lastF = fs[size];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= size) break;
        if (c + 1 < size && fs[c + 1] < fs[c]) c++;
        if (fs[c] >= lastF) break;
        nodes[i] = nodes[c];
        fs[i] = fs[c];
        i = c;
      }
      nodes[i] = lastN;
      fs[i] = lastF;
      return top;
    },
  };
}

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

/**
 * 8-way A* over tiles with terrain and uphill costs; diagonals may not cut a blocked corner.
 * Returns tile indices from start to goal, or to the explored tile closest to the goal when it
 * is unreachable. Searches between blocks more than one apart go through the sector layer first.
 */
export function findPath(g: Grid, start: number, goal: number): number[] {
  ensureScratch(g);
  stamp++;
  const sc = g.sectors;
  const a = sc.node[start];
  const b = sc.node[goal];
  const far = a >= 0 && b >= 0 && Math.max(Math.abs(sc.bx[a] - sc.bx[b]), Math.abs(sc.by[a] - sc.by[b])) > 1;
  if (far) corridor(sc, a, b);
  return tileSearch(g, start, goal, far);
}

function ensureScratch(g: Grid) {
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
  if (allowed.length < g.sectors.n) allowed = new Uint32Array(g.sectors.n);
}

/**
 * Node-level A* from node a to node b (or to the reached node nearest b when b is cut off); marks
 * every node in the blocks along that node path, and their neighbour blocks, as allowed for this
 * search stamp.
 */
function corridor(sc: Sectors, a: number, b: number): void {
  const bxg = sc.cx[b];
  const byg = sc.cy[b];
  const hOf = (k: number) => MIN_COST * Math.hypot(sc.cx[k] - bxg, sc.cy[k] - byg);
  const open = heap(heapNode, heapF);
  gScore[a] = 0;
  parent[a] = -1;
  seen[a] = stamp;
  open.push(a, hOf(a));
  let best = a;
  let bestH = hOf(a);
  while (open.size > 0) {
    const cur = open.pop();
    if (closed[cur] === stamp) continue;
    closed[cur] = stamp;
    if (cur === b) {
      best = cur;
      break;
    }
    const hc = hOf(cur);
    if (hc < bestH) (bestH = hc), (best = cur);
    for (let j = sc.start[cur]; j < sc.start[cur + 1]; j++) {
      const nb = sc.adj[j];
      if (closed[nb] === stamp) continue;
      const ng = gScore[cur] + sc.adjCost[j];
      if (seen[nb] === stamp && ng >= gScore[nb]) continue;
      seen[nb] = stamp;
      gScore[nb] = ng;
      parent[nb] = cur;
      open.push(nb, ng + hOf(nb));
    }
  }
  const { bw, bh } = sc;
  for (let k = best; k !== -1; k = parent[k])
    for (let y = Math.max(0, sc.by[k] - 1); y <= Math.min(bh - 1, sc.by[k] + 1); y++)
      for (let x = Math.max(0, sc.bx[k] - 1); x <= Math.min(bw - 1, sc.bx[k] + 1); x++)
        for (const o of sc.blockNodes[y * bw + x]) allowed[o] = stamp;
  stamp++; // the tile search below reuses the scratch arrays; its nodes check allowed[] against stamp - 1
}

/** Tile A*; with `restricted`, only tiles whose node the corridor allowed (stamp - 1) may be entered. */
function tileSearch(g: Grid, start: number, goal: number, restricted: boolean): number[] {
  const w = g.w;
  const node = g.sectors.node;
  const pass = stamp - 1;
  const gx = goal % w;
  const gy = (goal / w) | 0;
  const hOf = (i: number) => {
    const dx = Math.abs((i % w) - gx);
    const dy = Math.abs(((i / w) | 0) - gy);
    return MIN_COST * (Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy));
  };
  const open = heap(heapNode, heapF);
  gScore[start] = 0;
  parent[start] = -1;
  seen[start] = stamp;
  open.push(start, hOf(start));
  let best = start;
  let bestH = hOf(start);
  while (open.size > 0) {
    const cur = open.pop();
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
      const nb = stepTo(g, cur, cx, cy, k);
      if (nb < 0 || closed[nb] === stamp || (restricted && allowed[node[nb]] !== pass)) continue;
      const ng = gScore[cur] + stepCost(g, cur, nb) * (k >= 4 ? SQRT2 : 1);
      if (seen[nb] === stamp && ng >= gScore[nb]) continue;
      seen[nb] = stamp;
      gScore[nb] = ng;
      parent[nb] = cur;
      open.push(nb, ng + hOf(nb));
    }
  }
  const out: number[] = [];
  for (let i = best; i !== -1; i = parent[i]) out.push(i);
  return out.reverse();
}
