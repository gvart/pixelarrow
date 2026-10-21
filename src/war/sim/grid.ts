import { footprintTiles, OBJECT_BLOCKS } from '../region/objects';
import type { RegionData, TerrainKind } from '../types';

/** Move cost per tile (1 = grass); 0 = impassable. */
const TERRAIN_COST: Record<TerrainKind, number> = { grass: 1, dirt: 1, road: 0.7, forest: 1.6, sand: 1.4, marsh: 2, snow: 1.5, rock: 0 };
const SHALLOW = 2; // multiplier in a ford
/** M6b cart pace by terrain (1 / speed factor): road x1.3, ford x0.5, sand x0.5; forest and marsh only on a road (0: closed). */
const CART_COST: Record<TerrainKind, number> = { grass: 1, dirt: 1, road: 1 / 1.3, forest: 0, sand: 2, marsh: 0, snow: 1.5, rock: 0 };
export const CART_FORD = 2;
export const CART_UPHILL = 1 / 0.6;
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
  /** Gate tiles: team + 1 of the owner who may pass, 0 none (src/war/sim/works.ts). */
  gate: Int8Array;
  /** Team of the mover the next canEnter / findPath / lineClear calls are for; -1 = gates open to all. */
  team: number;
  /**
   * Raised layer (W-27, W-28): DECK on a wall walkway or tower platform tile, STAIR on a placed stair ramp, LADDER on a ladder
   * or tower door, else 0. Height: the raised one (a ladder stays on the ground). A deck tile is entered only from another
   * deck, a stair (height rules) or a ladder (any height), and left only to one; so from outside a wall is a cliff even
   * where the ground runs high. Steps on or off a deck, stair or ladder are straight (no diagonals).
   */
  deck: Uint8Array;
  /**
   * Open tiles of a diagonal bridge (a done deck or ramp piece): 1, else 0. A deck along a grid diagonal is a staircase of
   * tiles, so a diagonal step between two of them may pass a corner of water while its other corner is one of them too.
   */
  span: Uint8Array;
  /** Tower platform tiles: the tower's building id, -1 none (capacity: src/war/sim/index.ts). */
  plat: Int32Array;
  /** M5h3: done stakes or ditch tiles (1): engines cannot enter them. */
  trench: Uint8Array;
  /** The next canEnter / findPath calls are for a siege engine (keeps off trench tiles). */
  engine: boolean;
  /**
   * M6b carts (docs/WAR.md "Carts"): the next canEnter / findPath calls are for a cart (with `engine`): no deck, stair or
   * ladder tile, no tile of a bridge under 2 wide (`narrow`), none where cartMul is 0 (forest and marsh off a road).
   * cartMul: a cart's step cost by terrain (road 1/1.3, ford and sand 2); uphill x CART_UPHILL.
   */
  cart: boolean;
  cartMul: Float32Array;
  narrow: Uint8Array;
  /** Tiles (flat x,y) opened or closed since the last flushSectors. */
  dirty: number[];
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
  links: number[][]; // node -> linked nodes (the source of start/adj, kept for updateSectors)
  meanCost: number[];
}

export const SECTOR = 8;

export const DECK = 1;
export const STAIR = 2;
export const LADDER = 3; // ladder or tower door: joins ground to the deck beside it whatever the height

export const BOG = 1;
export const FOREST = 2;

export function buildGrid(r: RegionData): Grid {
  const n = r.w * r.h;
  const cost = new Float32Array(n);
  const height = new Uint8Array(n);
  const ground = new Uint8Array(n);
  const cartMul = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    cartMul[i] = r.water[i] === 2 ? 1 : CART_COST[r.terrain[i]] * (r.water[i] === 1 ? CART_FORD : 1); // deep water: only a bridge opens it
    height[i] = r.height[i];
    ground[i] = r.water[i] === 1 || r.terrain[i] === 'marsh' ? BOG : r.terrain[i] === 'forest' ? FOREST : 0;
    cost[i] = r.water[i] === 2 ? 0 : TERRAIN_COST[r.terrain[i]] * (r.water[i] === 1 ? SHALLOW : 1);
  }
  for (const o of r.objects ?? []) { // boulders, ruins, towers close their footprint
    const fp = OBJECT_BLOCKS[o.id];
    if (fp) for (const [x, y] of footprintTiles(o.x, o.y, fp)) if (x >= 0 && y >= 0 && x < r.w && y < r.h) cost[y * r.w + x] = 0;
  }
  const b = r.blocked ?? []; // the ground massifs stand on
  for (let k = 0; k + 1 < b.length; k += 2) cost.fill(0, b[k], Math.min(n, b[k] + b[k + 1]));
  const g = { w: r.w, h: r.h, cost, height, ground, gate: new Int8Array(n), deck: new Uint8Array(n), span: new Uint8Array(n), plat: new Int32Array(n).fill(-1), trench: new Uint8Array(n), engine: false, cart: false, cartMul, narrow: new Uint8Array(n), team: -1, dirty: [] as number[] } as Grid;
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
  if (k >= 4) {
    const c1 = ay * g.w + nx, c2 = ny * g.w + ax;
    if (g.span[a] && g.span[b] && ((g.span[c1] && canEnter(g, a, c1)) || (g.span[c2] && canEnter(g, a, c2)))) return b; // along a diagonal bridge
    if (g.deck[a] !== g.deck[b] || !canEnter(g, a, c1) || !canEnter(g, a, c2)) return -1; // on or off a deck or stair: straight only
  }
  return b;
}

function buildSectors(g: Grid): Sectors {
  const bw = Math.ceil(g.w / SECTOR);
  const bh = Math.ceil(g.h / SECTOR);
  const sc: Sectors = {
    node: new Int32Array(g.w * g.h).fill(-1), n: 0, bx: new Int32Array(0), by: new Int32Array(0), cx: new Float32Array(0), cy: new Float32Array(0),
    start: new Int32Array(1), adj: new Int32Array(0), adjCost: new Float32Array(0), bw, bh, blockNodes: Array.from({ length: bw * bh }, () => new Int32Array(0)),
    links: [], meanCost: [],
  };
  g.sectors = sc;
  const all: number[] = [];
  for (let b = 0; b < bw * bh; b++) all.push(b);
  rebuildBlocks(g, all, all);
  return sc;
}

/**
 * Re-cut the nodes of the given blocks (after tiles in them opened or closed) and re-link them and their
 * neighbours. Old nodes of a re-cut block stay in the arrays as dead ids (no tiles, no links). Gates count
 * as open: the sector layer is shared by all teams.
 */
/** Re-cut the sectors for the tiles changed since the last flush (once per tick, however many sites changed). */
export function flushSectors(g: Grid): void {
  if (!g.dirty.length) return;
  updateSectors(g, g.dirty);
  g.dirty = [];
}

export function updateSectors(g: Grid, tiles: number[]): void {
  const sc = g.sectors;
  const dirty = new Set<number>();
  for (let i = 0; i < tiles.length; i += 2) {
    const bx = Math.floor(tiles[i] / SECTOR), by = Math.floor(tiles[i + 1] / SECTOR);
    if (bx >= 0 && by >= 0 && bx < sc.bw && by < sc.bh) dirty.add(by * sc.bw + bx);
  }
  if (!dirty.size) return;
  if (sc.n > (g.w * g.h) / 4) { // too many dead ids: start over
    g.sectors = buildSectors(g);
    return;
  }
  const ring = new Set<number>();
  for (const b of dirty) {
    const bx = b % sc.bw, by = (b / sc.bw) | 0;
    for (let y = Math.max(0, by - 1); y <= Math.min(sc.bh - 1, by + 1); y++)
      for (let x = Math.max(0, bx - 1); x <= Math.min(sc.bw - 1, bx + 1); x++) ring.add(y * sc.bw + x);
  }
  rebuildBlocks(g, [...dirty].sort((a, b) => a - b), [...ring].sort((a, b) => a - b));
}

function rebuildBlocks(g: Grid, cut: number[], relink: number[]): void {
  const sc = g.sectors;
  const { w } = g;
  const team = g.team;
  g.team = -1; // gates open
  const bx = Array.from(sc.bx), by = Array.from(sc.by), cx = Array.from(sc.cx), cy = Array.from(sc.cy);
  const stack: number[] = [];
  for (const b of cut) {
    for (const k of sc.blockNodes[b]) sc.links[k] = [];
    const bcol = b % sc.bw, brow = (b / sc.bw) | 0;
    const x0 = bcol * SECTOR, y0 = brow * SECTOR, x1 = Math.min(w, x0 + SECTOR), y1 = Math.min(g.h, y0 + SECTOR);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) sc.node[y * w + x] = -1;
    const nodes: number[] = [];
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = y * w + x;
        if (sc.node[i] >= 0 || g.cost[i] === 0) continue;
        const id = bx.length;
        let sx = 0, sy = 0, sco = 0, count = 0;
        sc.node[i] = id;
        stack.push(i);
        while (stack.length) {
          const t = stack.pop()!;
          const tx = t % w;
          const ty = (t / w) | 0;
          sx += tx + 0.5;
          sy += ty + 0.5;
          sco += g.cost[t];
          count++;
          for (let k = 0; k < 8; k++) {
            const nb = stepTo(g, t, tx, ty, k);
            if (nb < 0 || sc.node[nb] >= 0 || Math.floor((nb % w) / SECTOR) !== bcol || Math.floor(nb / w / SECTOR) !== brow) continue;
            sc.node[nb] = id;
            stack.push(nb);
          }
        }
        bx.push(bcol);
        by.push(brow);
        cx.push(sx / count);
        cy.push(sy / count);
        sc.meanCost.push(sco / count);
        sc.links.push([]);
        nodes.push(id);
      }
    sc.blockNodes[b] = Int32Array.from(nodes);
  }
  sc.n = bx.length;
  sc.bx = Int32Array.from(bx);
  sc.by = Int32Array.from(by);
  sc.cx = Float32Array.from(cx);
  sc.cy = Float32Array.from(cy);
  // links of every node in the relinked blocks, from the steps out of their tiles (steps are symmetric)
  const sets = new Map<number, Set<number>>();
  for (const b of relink) for (const k of sc.blockNodes[b]) sets.set(k, new Set());
  for (const b of relink) {
    const x0 = (b % sc.bw) * SECTOR, y0 = ((b / sc.bw) | 0) * SECTOR;
    for (let y = y0; y < Math.min(g.h, y0 + SECTOR); y++)
      for (let x = x0; x < Math.min(w, x0 + SECTOR); x++) {
        const t = y * w + x;
        const a = sc.node[t];
        if (a < 0) continue;
        for (let k = 0; k < 8; k++) {
          const nb = stepTo(g, t, x, y, k);
          if (nb < 0 || sc.node[nb] === a) continue;
          const o = sc.node[nb];
          sets.get(a)!.add(o);
          const back = sets.get(o);
          if (back) back.add(a);
          else if (!sc.links[o].includes(a)) sc.links[o].push(a); // a neighbour block outside the relinked set
        }
      }
  }
  // outer nodes drop links to nodes that no longer exist (dead ids from re-cut blocks)
  const alive = (k: number) => sc.bx[k] >= 0 && sc.blockNodes[sc.by[k] * sc.bw + sc.bx[k]].includes(k);
  for (const b of relink) {
    const bcol = b % sc.bw, brow = (b / sc.bw) | 0;
    for (let y = Math.max(0, brow - 1); y <= Math.min(sc.bh - 1, brow + 1); y++)
      for (let x = Math.max(0, bcol - 1); x <= Math.min(sc.bw - 1, bcol + 1); x++)
        for (const k of sc.blockNodes[y * sc.bw + x]) if (!sets.has(k)) sc.links[k] = sc.links[k].filter(alive);
  }
  for (const [k, set] of sets) sc.links[k] = [...set].sort((a, b) => a - b);
  // CSR
  const n = sc.n;
  const start = new Int32Array(n + 1);
  for (let k = 0; k < n; k++) start[k + 1] = start[k] + sc.links[k].length;
  const adj = new Int32Array(start[n]);
  const adjCost = new Float32Array(start[n]);
  for (let k = 0; k < n; k++) {
    let j = start[k];
    for (const o of sc.links[k]) {
      adj[j] = o;
      adjCost[j++] = Math.hypot(sc.cx[o] - sc.cx[k], sc.cy[o] - sc.cy[k]) * 0.5 * (sc.meanCost[k] + sc.meanCost[o]);
    }
  }
  sc.start = start;
  sc.adj = adj;
  sc.adjCost = adjCost;
  g.team = team;
}

export function tileAt(g: Grid, x: number, y: number): number {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  return tx < 0 || ty < 0 || tx >= g.w || ty >= g.h ? -1 : ty * g.w + tx;
}

/**
 * Can a unit (of team g.team) step from tile a into the adjacent tile b (open, not a foe's gate, not a cliff of 2+ levels,
 * onto or off a deck only by a deck or stair)?
 */
export function canEnter(g: Grid, a: number, b: number): boolean {
  if (b < 0 || g.cost[b] <= 0 || (g.gate[b] !== 0 && g.team >= 0 && g.gate[b] !== g.team + 1)) return false;
  if (g.engine && g.trench[b]) return false;
  if (g.cart && (g.deck[b] !== 0 || g.cartMul[b] <= 0 || g.narrow[b])) return false;
  const da = g.deck[a], db = g.deck[b];
  if ((da === LADDER && db === DECK) || (da === DECK && db === LADDER)) return true;
  if (Math.abs(g.height[b] - g.height[a]) >= 2) return false;
  return (da !== DECK && db !== DECK) || (da !== 0 && db !== 0);
}

/** Cost multiplier for moving from tile a into tile b (terrain of b, slower uphill). */
export function stepCost(g: Grid, a: number, b: number): number {
  if (g.cart) return g.height[b] > g.height[a] ? g.cartMul[b] * CART_UPHILL : g.cartMul[b];
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

/** Starting room of the search heap (it doubles when full and keeps its size: one per isolate, not 8 per tile up front). */
const HEAP0 = 1 << 16;
/** A binary min-heap over (node, f) pairs in the given arrays (growing heapNode / heapF when full). */
function heap(nodes: Int32Array, fs: Float32Array) {
  let size = 0;
  return {
    get size() {
      return size;
    },
    push(node: number, f: number) {
      if (size === nodes.length) {
        const n2 = new Int32Array(Math.max(HEAP0, 2 * size)), f2 = new Float32Array(n2.length);
        n2.set(nodes); f2.set(fs);
        nodes = heapNode = n2; fs = heapF = f2;
      }
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
 * is unreachable. Searches between different sector nodes go through the sector layer first.
 */
export function findPath(g: Grid, start: number, goal: number): number[] {
  ensureScratch(g);
  stamp++;
  const sc = g.sectors;
  const a = sc.node[start];
  const b = sc.node[goal];
  // any goal in another node goes through the node layer: a near one may lie across a river or a wall, reached only
  // round a long detour (or not at all), and the tile search keeps to that corridor instead of flooding the map
  const nodes = a >= 0 && b >= 0 && a !== b;
  if (nodes) corridor(sc, a, b);
  const out = tileSearch(g, start, goal, nodes);
  // M5h3: the node layer does not know trench tiles; an engine cut off in its corridor looks for a way round them
  if (g.engine && nodes && out[out.length - 1] !== goal) {
    stamp++;
    return tileSearch(g, start, goal, false);
  }
  return out;
}

function ensureScratch(g: Grid) {
  const n = g.w * g.h;
  if (scratchN !== n) {
    scratchN = n;
    gScore = new Float32Array(n);
    parent = new Int32Array(n);
    seen = new Uint32Array(n);
    closed = new Uint32Array(n);
    if (heapNode.length < HEAP0) (heapNode = new Int32Array(HEAP0)), (heapF = new Float32Array(HEAP0));
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
