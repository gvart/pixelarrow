/**
 * Season map compiler (docs/DESIGN_V2.md "Map"): turns a hand-authored source in
 * `maps-src/<id>.json` (coastline polygons in lon/lat, terrain hints, rivers,
 * named places, tribal districts and sea zones) into the runtime map JSON
 * `src/online/maps/<id>.json` (format in src/online/mapSchema.ts).
 *
 *   npm run map:build                       (westmed)
 *   node scripts/buildMap.ts maps-src/westmed.json [--out file] [--png file] [--scale n]
 *
 * Pipeline (deterministic, no randomness beyond integer hashes):
 *  1. project lon/lat onto a w x h grid, rasterize land polygons (coasts are
 *     roughened by a hashed midpoint displacement), cut channels, drop specks;
 *  2. terrain: hint polylines/circles/polygons (with noisy edges), sand on the
 *     coast, a shelf of shallow water around the land;
 *  3. land regions: named places are fixed seeds, filler plots are added by
 *     farthest-point sampling and relaxed (Lloyd); cells go to the seed with
 *     the lowest weighted travel cost (grown region by region, so every region
 *     is contiguous); sea zones likewise from the authored sea seeds;
 *  4. edges between touching land regions, naval edges between coastal
 *     regions across the water, dotted-route waypoints, march minutes;
 *  5. spawn plots (spread by farthest-point, each near a town), camp plots,
 *     labels, battle sites, names; RLE output; validation.
 *
 * Self-contained on purpose (runs under plain `node` with type stripping);
 * the RLE layout matches mapSchema.ts, and tests/buildMap.test.ts also runs
 * mapSchema's validateMap on the output.
 */

// ------------------------------------------------------------------ source types

export type LonLat = [number, number];

export interface MapSource {
  id: string;
  version: number;
  cell: number;
  w: number;
  bounds: { lon0: number; lon1: number; lat0: number; lat1: number };
  targets: { landRegions: number; spawns: number; minRegionCells: number; minSeaCells: number };
  land: { name: string; pts: LonLat[] }[];
  channels?: { name: string; line: LonLat[]; r: number }[];
  terrain: { type: 'forest' | 'hills' | 'mountain' | 'marsh' | 'land'; line?: LonLat[]; at?: LonLat; poly?: LonLat[]; r?: number }[];
  rivers: { name: string; line: LonLat[] }[];
  places: { name: string; kind: 'capital' | 'town' | 'fort' | 'post' | 'lair'; at: LonLat; major?: boolean; weight?: number }[];
  districts: { name: string; at: LonLat }[];
  seas: { name: string; at: LonLat }[];
}

// ------------------------------------------------------------------ output types (mirror src/online/mapSchema.ts)

export const TERRAINS = ['sea', 'shelf', 'sand', 'land', 'forest', 'hills', 'mountain', 'marsh'] as const;
const SEA = 0;
const SHELF = 1;
const SAND = 2;
const LAND = 3;
const FOREST = 4;
const HILLS = 5;
const MOUNTAIN = 6;
const MARSH = 7;

export interface Site {
  base: 'plain' | 'scrub' | 'forest' | 'hills' | 'beach';
  river: boolean;
  coast: boolean;
  rocky: boolean;
  woods: number;
}

export interface OutRegion {
  id: number;
  name: string;
  kind: 'plot' | 'town' | 'fort' | 'capital' | 'sea' | 'lair' | 'post';
  tier: 1 | 2 | 3 | 4 | 5;
  site?: Site;
  spawn?: boolean;
  campPlot?: boolean;
  label: [number, number];
  revealPan?: boolean;
}

export interface OutEdge {
  a: number;
  b: number;
  minutes: number;
  naval?: boolean;
  waypoints: [number, number][];
}

export interface OutMap {
  id: string;
  version: number;
  cell: number;
  w: number;
  h: number;
  mask: number[];
  terrain: number[];
  regions: OutRegion[];
  edges: OutEdge[];
}

// ------------------------------------------------------------------ small helpers

type Pt = [number, number];

function hash(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul((c | 0) + 0x3c6ef372, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise 0..1 on a lattice of `scale` cells. */
function noise(x: number, y: number, scale: number, salt: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = smooth(fx - ix);
  const ty = smooth(fy - iy);
  const a = hash(ix, iy, salt);
  const b = hash(ix + 1, iy, salt);
  const c = hash(ix, iy + 1, salt);
  const d = hash(ix + 1, iy + 1, salt);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

function segDist(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}

function lineDist(px: number, py: number, line: Pt[]): number {
  if (line.length === 1) return Math.hypot(px - line[0][0], py - line[0][1]);
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) best = Math.min(best, segDist(px, py, line[i], line[i + 1]));
  return best;
}

/** Binary min-heap of (key, value) numbers. */
class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size(): number {
    return this.k.length;
  }
  topKey(): number {
    return this.k[0];
  }
  push(key: number, val: number): void {
    const k = this.k;
    const v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] < key || (k[p] === key && v[p] <= val)) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): number {
    const k = this.k;
    const v = this.v;
    const top = v[0];
    const lk = k.pop()!;
    const lv = v.pop()!;
    if (k.length) {
      let i = 0;
      const n = k.length;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && (k[r] < k[l] || (k[r] === k[l] && v[r] < v[l])) ? r : l;
        if (lk < k[c] || (lk === k[c] && lv <= v[c])) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
}

const DIRS8: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

class Grid {
  readonly w: number;
  readonly h: number;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
  }
  /** 8-neighbours of i that `ok` allows; diagonals only when one of the two orthogonal cells is allowed too (keeps 4-connectivity). */
  each8(i: number, ok: (j: number) => boolean, f: (j: number, step: number) => void): void {
    const w = this.w;
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy, step] of DIRS8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= this.h) continue;
      const j = ny * w + nx;
      if (!ok(j)) continue;
      if (dx && dy && !ok(y * w + nx) && !ok(ny * w + x)) continue;
      f(j, step);
    }
  }
  each4(i: number, f: (j: number) => void): void {
    const w = this.w;
    const x = i % w;
    if (x > 0) f(i - 1);
    if (x + 1 < w) f(i + 1);
    if (i >= w) f(i - w);
    if (i + w < w * this.h) f(i + w);
  }
}

/** 4-connected components of the cells `ok` allows: component index per cell (-1 = not allowed) and sizes. */
function components(g: Grid, ok: (i: number) => boolean): { comp: Int32Array; sizes: number[] } {
  const comp = new Int32Array(g.w * g.h).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < comp.length; s++) {
    if (comp[s] !== -1 || !ok(s)) continue;
    const c = sizes.length;
    let n = 0;
    comp[s] = c;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      n++;
      g.each4(i, (j) => {
        if (comp[j] === -1 && ok(j)) {
          comp[j] = c;
          stack.push(j);
        }
      });
    }
    sizes.push(n);
  }
  return { comp, sizes };
}

/**
 * Weighted multi-source travel-cost partition: every allowed cell goes to the
 * seed it is cheapest to reach (cost of entering a cell / seed weight). Cells
 * are claimed through a neighbour of the same seed, so regions are connected.
 */
function partition(g: Grid, ok: (i: number) => boolean, cost: Float32Array, seeds: { cell: number; weight: number }[]): Int32Array {
  const owner = new Int32Array(g.w * g.h).fill(-1);
  const dist = new Float64Array(g.w * g.h).fill(Infinity);
  const heap = new Heap();
  const S = 1024;
  seeds.forEach((s, k) => {
    dist[s.cell] = 0;
    heap.push(0, s.cell * S + k);
  });
  while (heap.size) {
    const d = heap.topKey();
    const val = heap.pop();
    const k = val % S;
    const i = (val - k) / S;
    if (owner[i] !== -1) continue;
    owner[i] = k;
    const wgt = seeds[k].weight;
    g.each8(i, ok, (j, step) => {
      if (owner[j] !== -1) return;
      const nd = d + (step * (cost[i] + cost[j])) / 2 / wgt;
      if (nd < dist[j]) {
        dist[j] = nd;
        heap.push(nd, j * S + k);
      }
    });
  }
  return owner;
}

/** A* over allowed cells (8-neighbour), cost per step = step length x mean cell cost. */
function astar(g: Grid, start: number, goal: number, ok: (i: number) => boolean, cost: (i: number) => number): number[] | null {
  const w = g.w;
  const gx = goal % w;
  const gy = (goal - gx) / w;
  const best = new Map<number, number>([[start, 0]]);
  const prev = new Map<number, number>();
  const closed = new Set<number>();
  const heap = new Heap();
  const hEst = (i: number) => {
    const x = i % w;
    return Math.hypot(x - gx, (i - x) / w - gy) * 0.999;
  };
  heap.push(hEst(start), start);
  while (heap.size) {
    const i = heap.pop();
    if (closed.has(i)) continue;
    closed.add(i);
    if (i === goal) break;
    const gi = best.get(i)!;
    g.each8(i, ok, (j, step) => {
      if (closed.has(j)) return;
      const nd = gi + (step * (cost(i) + cost(j))) / 2;
      if (nd < (best.get(j) ?? Infinity)) {
        best.set(j, nd);
        prev.set(j, i);
        heap.push(nd + hEst(j), j);
      }
    });
  }
  if (!closed.has(goal)) return null;
  const path = [goal];
  while (path[path.length - 1] !== start) path.push(prev.get(path[path.length - 1])!);
  return path.reverse();
}

function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  let idx = -1;
  let dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i][0], pts[i][1], pts[0], pts[pts.length - 1]);
    if (d > dmax) {
      dmax = d;
      idx = i;
    }
  }
  if (dmax <= eps) return [pts[0], pts[pts.length - 1]];
  const a = rdp(pts.slice(0, idx + 1), eps);
  const b = rdp(pts.slice(idx), eps);
  return [...a.slice(0, -1), ...b];
}

function chaikin(pts: Pt[], rounds: number): Pt[] {
  let cur = pts;
  for (let r = 0; r < rounds && cur.length > 2; r++) {
    const out: Pt[] = [cur[0]];
    for (let i = 0; i + 1 < cur.length; i++) {
      const p = cur[i];
      const q = cur[i + 1];
      out.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
    }
    out.push(cur[cur.length - 1]);
    cur = out;
  }
  return cur;
}

/** Run-length encoding as in mapSchema.ts: [run, value, run, value, ...]. */
export function rleEncode(values: ArrayLike<number>): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < values.length) {
    const v = values[i];
    let n = 1;
    while (i + n < values.length && values[i + n] === v) n++;
    out.push(n, v);
    i += n;
  }
  return out;
}

export function rleDecode(rle: readonly number[], length: number): Int32Array {
  const out = new Int32Array(length);
  let at = 0;
  for (let i = 0; i < rle.length; i += 2) {
    out.fill(rle[i + 1], at, at + rle[i]);
    at += rle[i];
  }
  if (at !== length) throw new Error(`RLE covers ${at} of ${length}`);
  return out;
}

// ------------------------------------------------------------------ build

const KIND_WEIGHT: Record<string, number> = { capital: 1.45, town: 1.1, fort: 1.05, post: 0.85, lair: 1.0, plot: 1.0 };
/** Travel cost of a cell for region growth (borders follow ridges, marshes). */
const GROW_COST = [1, 1, 1, 1, 1.25, 1.45, 2.4, 1.3];
/** March minutes per cell crossed, by terrain. */
const MARCH_RATE = [0.2, 0.2, 0.4, 0.4, 0.6, 0.7, 1.0, 0.7];
/** Minutes to embark/disembark on a naval route. */
const NAVAL_EXTRA = 4;

const WORDS: Record<number, string[]> = {
  [LAND]: ['Fields', 'Plain', 'Vale', 'Downs', 'Pastures', 'Meadows', 'Farmlands', 'Lowlands', 'Valley', 'Plains'],
  [SAND]: ['Shore', 'Strand', 'Coast', 'Dunes', 'Bay', 'Cape'],
  [FOREST]: ['Woods', 'Forest', 'Grove', 'Thickets', 'Wildwood', 'Pinewood'],
  [HILLS]: ['Hills', 'Uplands', 'Ridges', 'Highlands', 'Foothills', 'Scarps'],
  [MOUNTAIN]: ['Heights', 'Peaks', 'Crags', 'Passes', 'Summits'],
  [MARSH]: ['Marsh', 'Fens', 'Lagoons', 'Mires', 'Wetlands'],
};

export interface BuildStats {
  w: number;
  h: number;
  landCells: number;
  landRegions: number;
  seaRegions: number;
  byKind: Record<string, number>;
  edges: number;
  navalEdges: number;
  spawns: number;
  campPlots: number;
  minLandCells: number;
  maxLandCells: number;
  medianLandCells: number;
  spawnMinSpacing: number;
  spawnHopsToTown: Record<number, number>;
}

export interface BuildResult {
  map: OutMap;
  stats: BuildStats;
}

interface Seed {
  cell: number;
  weight: number;
  name: string;
  kind: OutRegion['kind'];
  major: boolean;
  fixed: boolean;
}

export function buildMap(src: MapSource): BuildResult {
  const { lon0, lon1, lat0, lat1 } = src.bounds;
  const W = src.w;
  const cosm = Math.cos((((lat0 + lat1) / 2) * Math.PI) / 180);
  const K = W / ((lon1 - lon0) * cosm); // cells per degree of latitude
  const H = Math.round((lat1 - lat0) * K);
  const N = W * H;
  const g = new Grid(W, H);
  const P = (p: LonLat): Pt => [(p[0] - lon0) * cosm * K, (lat1 - p[1]) * K];
  const cellOf = (p: Pt) => Math.min(H - 1, Math.max(0, Math.floor(p[1]))) * W + Math.min(W - 1, Math.max(0, Math.floor(p[0])));
  const cx = (i: number) => (i % W) + 0.5;
  const cy = (i: number) => Math.floor(i / W) + 0.5;

  // ---- 1. land
  const land = new Uint8Array(N);
  src.land.forEach((poly, pi) => {
    const pts = roughen(poly.pts.map(P), 101 + pi, W, H);
    fillPoly(pts, W, H, (i) => (land[i] = 1));
  });
  for (const ch of src.channels ?? []) {
    const line = ch.line.map(P);
    const r = ch.r * K;
    for (let i = 0; i < N; i++) if (land[i] && lineDist(cx(i), cy(i), line) <= r) land[i] = 0;
  }
  const placeCells = new Set(src.places.map((p) => cellOf(P(p.at))));
  {
    // drop specks of land (unless a place stands there) and fill tiny inland ponds
    const { comp, sizes } = components(g, (i) => land[i] === 1);
    const keep = sizes.map((n) => n >= 30);
    for (const c of placeCells) if (comp[c] >= 0) keep[comp[c]] = true;
    for (let i = 0; i < N; i++) if (land[i] && !keep[comp[i]]) land[i] = 0;
    const sea = components(g, (i) => land[i] === 0);
    const edgeTouch = new Set<number>();
    for (let x = 0; x < W; x++) edgeTouch.add(sea.comp[x]), edgeTouch.add(sea.comp[(H - 1) * W + x]);
    for (let y = 0; y < H; y++) edgeTouch.add(sea.comp[y * W]), edgeTouch.add(sea.comp[y * W + W - 1]);
    for (let i = 0; i < N; i++) if (!land[i] && sea.sizes[sea.comp[i]] < 60 && !edgeTouch.has(sea.comp[i])) land[i] = 1;
  }

  // ---- 2. terrain
  const terr = new Uint8Array(N);
  for (let i = 0; i < N; i++) terr[i] = land[i] ? LAND : SEA;
  const TYPE: Record<string, number> = { land: LAND, forest: FOREST, hills: HILLS, mountain: MOUNTAIN, marsh: MARSH };
  src.terrain.forEach((t, ti) => {
    const v = TYPE[t.type];
    if (t.poly) {
      fillPoly(t.poly.map(P), W, H, (i) => {
        if (land[i]) terr[i] = v;
      });
      return;
    }
    const line = t.line ? t.line.map(P) : [P(t.at!)];
    const r = (t.r ?? 0.1) * K;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of line) (x0 = Math.min(x0, p[0])), (x1 = Math.max(x1, p[0])), (y0 = Math.min(y0, p[1])), (y1 = Math.max(y1, p[1]));
    const pad = r * 1.4 + 1;
    for (let y = Math.max(0, Math.floor(y0 - pad)); y <= Math.min(H - 1, Math.ceil(y1 + pad)); y++)
      for (let x = Math.max(0, Math.floor(x0 - pad)); x <= Math.min(W - 1, Math.ceil(x1 + pad)); x++) {
        const i = y * W + x;
        if (!land[i]) continue;
        const wob = 0.65 + 0.55 * noise(x, y, 5, 300 + ti) + 0.2 * noise(x, y, 2, 600 + ti);
        if (lineDist(x + 0.5, y + 0.5, line) <= r * wob) terr[i] = v;
      }
  });
  const isSea = (i: number) => land[i] === 0;
  for (let i = 0; i < N; i++) {
    if (!land[i] || terr[i] !== LAND) continue;
    let coast = false;
    g.each4(i, (j) => {
      if (!land[j]) coast = true;
    });
    if (coast) terr[i] = SAND;
  }
  {
    // shelf: water within ~2.5 cells of land
    const d = new Float64Array(N).fill(Infinity);
    const heap = new Heap();
    for (let i = 0; i < N; i++) if (land[i]) (d[i] = 0), heap.push(0, i);
    while (heap.size) {
      const k = heap.topKey();
      const i = heap.pop();
      if (k > d[i] || k > 2.5) continue;
      g.each8(i, () => true, (j, step) => {
        if (land[j] || k + step >= d[j]) return;
        d[j] = k + step;
        heap.push(k + step, j);
      });
    }
    for (let i = 0; i < N; i++) if (!land[i] && d[i] <= 2.5) terr[i] = SHELF;
  }
  const river = new Uint8Array(N);
  for (const rv of src.rivers) {
    const line = rv.line.map(P);
    for (let s = 0; s + 1 < line.length; s++) {
      const [a, b] = [line[s], line[s + 1]];
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2) + 1;
      for (let t = 0; t <= n; t++) {
        const x = Math.floor(a[0] + ((b[0] - a[0]) * t) / n);
        const y = Math.floor(a[1] + ((b[1] - a[1]) * t) / n);
        if (x >= 0 && y >= 0 && x < W && y < H && land[y * W + x]) river[y * W + x] = 1;
      }
    }
  }
  const growCost = new Float32Array(N);
  for (let i = 0; i < N; i++) growCost[i] = GROW_COST[terr[i]];

  // ---- 3. land regions
  const isLand = (i: number) => land[i] === 1;
  const landComp = components(g, isLand);
  const used = new Set<number>();
  const nearestFree = (from: number, ok: (i: number) => boolean): number => {
    const seen = new Set<number>([from]);
    const q = [from];
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      if (ok(i) && !used.has(i)) return i;
      g.each8(i, () => true, (j) => {
        if (!seen.has(j)) seen.add(j), q.push(j);
      });
    }
    throw new Error('no free cell');
  };
  const seeds: Seed[] = src.places.map((p) => {
    const cell = nearestFree(cellOf(P(p.at)), isLand);
    used.add(cell);
    return { cell, weight: p.weight ?? KIND_WEIGHT[p.kind], name: p.name, kind: p.kind, major: !!p.major || p.kind === 'capital', fixed: true };
  });
  const named = seeds.length;
  {
    // filler plots: farthest-point sampling by travel distance
    const d = new Float64Array(N).fill(Infinity);
    const relax = (from: number) => {
      const heap = new Heap();
      d[from] = 0;
      heap.push(0, from);
      while (heap.size) {
        const k = heap.topKey();
        const i = heap.pop();
        if (k > d[i]) continue;
        g.each8(i, isLand, (j, step) => {
          const nd = k + step;
          if (nd < d[j]) (d[j] = nd), heap.push(nd, j);
        });
      }
    };
    for (const s of seeds) relax(s.cell);
    while (seeds.length < src.targets.landRegions) {
      let bi = -1;
      let bd = -1;
      for (let i = 0; i < N; i++) if (land[i] && d[i] > bd) (bd = d[i]), (bi = i);
      if (bi < 0) break;
      seeds.push({ cell: bi, weight: 1, name: '', kind: 'plot', major: false, fixed: false });
      relax(bi);
    }
  }
  let owner: Int32Array = new Int32Array(0);
  for (let pass = 0; pass < 12; pass++) {
    owner = partition(g, isLand, growCost, seeds);
    mergePieces(g, owner, seeds.map((s) => s.cell));
    const cnt = new Float64Array(seeds.length);
    const sx = new Float64Array(seeds.length);
    const sy = new Float64Array(seeds.length);
    for (let i = 0; i < N; i++) {
      const o = owner[i];
      if (o < 0) continue;
      cnt[o]++;
      sx[o] += cx(i);
      sy[o] += cy(i);
    }
    // drop filler slivers (not the only seed of an island) and re-grow
    const compSeeds = new Map<number, number>();
    for (const s of seeds) compSeeds.set(landComp.comp[s.cell], (compSeeds.get(landComp.comp[s.cell]) ?? 0) + 1);
    const tiny = seeds.map((s, k) => !s.fixed && cnt[k] < src.targets.minRegionCells && compSeeds.get(landComp.comp[s.cell])! > 1);
    if (pass < 10 && tiny.some(Boolean)) {
      const keep = seeds.filter((_, k) => !tiny[k]);
      seeds.length = 0;
      seeds.push(...keep);
      continue;
    }
    if (pass >= 9) break;
    // Lloyd: move filler seeds to the cell of their region nearest the centroid
    const best = new Float64Array(seeds.length).fill(Infinity);
    const bestCell = new Int32Array(seeds.length).fill(-1);
    for (let i = 0; i < N; i++) {
      const o = owner[i];
      if (o < 0 || seeds[o].fixed) continue;
      const dd = Math.hypot(cx(i) - sx[o] / cnt[o], cy(i) - sy[o] / cnt[o]) + (terr[i] === MOUNTAIN ? 3 : 0);
      if (dd < best[o]) (best[o] = dd), (bestCell[o] = i);
    }
    seeds.forEach((s, k) => {
      if (!s.fixed && bestCell[k] >= 0) s.cell = bestCell[k];
    });
  }
  // filler order: north to south, west to east
  const fillers = seeds.slice(named).sort((a, b) => a.cell - b.cell);
  const order = [...seeds.slice(0, named), ...fillers];
  const reindex = new Int32Array(seeds.length);
  order.forEach((s, k) => (reindex[seeds.indexOf(s)] = k));
  const mask = new Int32Array(N);
  for (let i = 0; i < N; i++) if (owner[i] >= 0) mask[i] = reindex[owner[i]] + 1;
  const landSeeds = order;

  // ---- sea zones
  const seaSeeds: Seed[] = src.seas.map((s) => {
    const cell = nearestFree(cellOf(P(s.at)), isSea);
    used.add(cell);
    return { cell, weight: 1, name: s.name, kind: 'sea', major: false, fixed: true };
  });
  {
    const { comp, sizes } = components(g, isSea);
    const has = new Set(seaSeeds.map((s) => comp[s.cell]));
    sizes.forEach((_, c) => {
      if (has.has(c)) return;
      const cell = comp.indexOf(c);
      seaSeeds.push({ cell, weight: 1, name: `Open Sea ${seaSeeds.length + 1}`, kind: 'sea', major: false, fixed: true });
    });
  }
  const seaCost = new Float32Array(N).fill(1);
  const seaOwner = partition(g, isSea, seaCost, seaSeeds);
  mergePieces(g, seaOwner, seaSeeds.map((s) => s.cell));
  const base = landSeeds.length;
  for (let i = 0; i < N; i++) if (seaOwner[i] >= 0) mask[i] = base + seaOwner[i] + 1;
  const all: Seed[] = [...landSeeds, ...seaSeeds];
  const R = all.length;

  // ---- per region stats
  const cnt = new Int32Array(R + 1);
  const tcount = Array.from({ length: R + 1 }, () => new Int32Array(8));
  const rivers = new Int32Array(R + 1);
  const sumX = new Float64Array(R + 1);
  const sumY = new Float64Array(R + 1);
  for (let i = 0; i < N; i++) {
    const r = mask[i];
    cnt[r]++;
    tcount[r][terr[i]]++;
    rivers[r] += river[i];
    sumX[r] += cx(i);
    sumY[r] += cy(i);
  }
  // shared borders
  const border = new Map<number, number>();
  const bkey = (a: number, b: number) => (a < b ? a * 4096 + b : b * 4096 + a);
  for (let i = 0; i < N; i++) {
    const a = mask[i];
    const x = i % W;
    if (x + 1 < W && mask[i + 1] !== a) border.set(bkey(a, mask[i + 1]), (border.get(bkey(a, mask[i + 1])) ?? 0) + 1);
    if (i + W < N && mask[i + W] !== a) border.set(bkey(a, mask[i + W]), (border.get(bkey(a, mask[i + W])) ?? 0) + 1);
  }
  const isSeaId = (id: number) => id > base;
  const coastal = new Set<number>();
  for (const k of border.keys()) {
    const a = Math.floor(k / 4096);
    const b = k % 4096;
    if (isSeaId(a) !== isSeaId(b)) coastal.add(isSeaId(a) ? b : a);
  }

  // label points: named places at their seed, others at the pole of inaccessibility
  const inner = new Float64Array(N).fill(Infinity);
  {
    const heap = new Heap();
    for (let i = 0; i < N; i++) {
      let edge = false;
      const x = i % W;
      const y = (i - x) / W;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
      else g.each4(i, (j) => {
        if (mask[j] !== mask[i]) edge = true;
      });
      if (edge) (inner[i] = 0.5), heap.push(0.5, i);
    }
    while (heap.size) {
      const k = heap.topKey();
      const i = heap.pop();
      if (k > inner[i]) continue;
      g.each8(i, (j) => mask[j] === mask[i], (j, step) => {
        if (k + step < inner[j]) (inner[j] = k + step), heap.push(k + step, j);
      });
    }
  }
  const labelCell = new Int32Array(R + 1).fill(-1);
  const score = new Float64Array(R + 1).fill(-Infinity);
  for (let i = 0; i < N; i++) {
    const r = mask[i];
    const s = Math.min(inner[i], isSeaId(r) ? 14 : 6) - 0.12 * Math.hypot(cx(i) - sumX[r] / cnt[r], cy(i) - sumY[r] / cnt[r]);
    if (s > score[r]) (score[r] = s), (labelCell[r] = i);
  }
  all.forEach((s, k) => {
    if (s.kind !== 'plot' && s.kind !== 'sea') labelCell[k + 1] = s.cell;
  });
  const px = (i: number): [number, number] => [Math.round(cx(i) * src.cell), Math.round(cy(i) * src.cell)];

  // ---- 4. edges
  interface E {
    a: number;
    b: number;
    naval: boolean;
    path: number[];
  }
  const landAdj = new Map<number, Set<number>>();
  for (let r = 1; r <= base; r++) landAdj.set(r, new Set());
  for (const [k, n] of border) {
    const a = Math.floor(k / 4096);
    const b = k % 4096;
    if (isSeaId(a) || isSeaId(b) || n < 2) continue;
    landAdj.get(a)!.add(b);
    landAdj.get(b)!.add(a);
  }
  const edges: E[] = [];
  for (let a = 1; a <= base; a++)
    for (const b of [...landAdj.get(a)!].sort((x, y) => x - y)) {
      if (b < a) continue;
      const path = astar(g, labelCell[a], labelCell[b], (i) => mask[i] === a || mask[i] === b, (i) => growCost[i]);
      if (!path) throw new Error(`no path between touching regions ${a} and ${b}`);
      edges.push({ a, b, naval: false, path });
    }

  // naval: coastal regions across the water
  const landHops = (from: number, max: number): Map<number, number> => {
    const d = new Map<number, number>([[from, 0]]);
    const q = [from];
    for (let h = 0; h < q.length; h++) {
      const r = q[h];
      if (d.get(r)! >= max) continue;
      for (const n of landAdj.get(r)!) if (!d.has(n)) d.set(n, d.get(r)! + 1), q.push(n);
    }
    return d;
  };
  const coastList = [...coastal].sort((a, b) => a - b);
  const isPort = (r: number) => ['capital', 'town', 'post'].includes(all[r - 1].kind);
  const seaDist = new Map<number, Map<number, number>>();
  {
    // shore cells of each coastal region: its sea-adjacent water cells
    const shore = new Map<number, number[]>();
    for (let i = 0; i < N; i++) {
      if (!isSea(i)) continue;
      g.each4(i, (j) => {
        const r = mask[j];
        if (!isSeaId(r)) {
          const l = shore.get(r) ?? [];
          if (l[l.length - 1] !== i) l.push(i);
          shore.set(r, l);
        }
      });
    }
    const shoreOf = new Map<number, number[]>(); // sea cell -> coastal regions
    for (const [r, cells] of shore) for (const c of cells) shoreOf.set(c, [...(shoreOf.get(c) ?? []), r]);
    const d = new Float64Array(N);
    for (const r of coastList) {
      const limit = isPort(r) ? 130 : 26;
      d.fill(Infinity);
      const heap = new Heap();
      for (const c of shore.get(r) ?? []) (d[c] = 0), heap.push(0, c);
      const found = new Map<number, number>();
      while (heap.size) {
        const k = heap.topKey();
        const i = heap.pop();
        if (k > d[i] || k > limit) continue;
        for (const o of shoreOf.get(i) ?? []) if (o !== r && !found.has(o)) found.set(o, k);
        g.each8(i, isSea, (j, step) => {
          if (k + step < d[j]) (d[j] = k + step), heap.push(k + step, j);
        });
      }
      seaDist.set(r, found);
    }
  }
  const navalPairs = new Set<number>();
  const addNaval = (a: number, b: number) => navalPairs.add(bkey(a, b));
  for (const r of coastList) {
    const found = seaDist.get(r)!;
    const hops = landHops(r, 4);
    const cand = [...found.entries()].filter(([o]) => !hops.has(o) || hops.get(o)! >= 4).sort((x, y) => x[1] - y[1] || x[0] - y[0]);
    // short hops to nearby coasts across bays and straits
    for (const [o, dd] of cand.filter(([, dd]) => dd <= 14).slice(0, 2)) if (dd <= 14) addNaval(r, o);
    // sea lanes between ports
    if (isPort(r)) for (const [o] of cand.filter(([o]) => isPort(o)).slice(0, 3)) addNaval(r, o);
  }
  {
    // make sure every landmass is reachable: link components by their closest coasts
    const compOf = (): Map<number, number> => {
      const c = new Map<number, number>();
      const adj = new Map<number, number[]>();
      for (const k of navalPairs) {
        const a = Math.floor(k / 4096);
        const b = k % 4096;
        adj.set(a, [...(adj.get(a) ?? []), b]);
        adj.set(b, [...(adj.get(b) ?? []), a]);
      }
      let n = 0;
      for (let r = 1; r <= base; r++) {
        if (c.has(r)) continue;
        c.set(r, n);
        const q = [r];
        for (let h = 0; h < q.length; h++)
          for (const m of [...landAdj.get(q[h])!, ...(adj.get(q[h]) ?? [])]) if (!c.has(m)) c.set(m, n), q.push(m);
        n++;
      }
      return c;
    };
    for (let guard = 0; guard < 50; guard++) {
      const c = compOf();
      if (new Set(c.values()).size <= 1) break;
      let best: [number, number, number] | null = null;
      for (const r of coastList)
        for (const [o, dd] of seaDist.get(r)!) if (c.get(r) !== c.get(o) && (!best || dd < best[2])) best = [r, o, dd];
      if (!best) break;
      addNaval(best[0], best[1]);
    }
  }
  for (const k of [...navalPairs].sort((x, y) => x - y)) {
    const a = Math.floor(k / 4096);
    const b = k % 4096;
    const path = astar(g, labelCell[a], labelCell[b], (i) => mask[i] === a || mask[i] === b || isSea(i), (i) => (isSea(i) ? 1 : 1.6));
    if (!path) throw new Error(`no sea route ${a}-${b}`);
    edges.push({ a, b, naval: true, path });
  }
  edges.sort((x, y) => x.a - y.a || x.b - y.b);

  const outEdges: OutEdge[] = edges.map((e) => {
    let minutes = e.naval ? NAVAL_EXTRA : 0;
    for (let s = 1; s < e.path.length; s++) {
      const i = e.path[s];
      const step = Math.hypot(cx(i) - cx(e.path[s - 1]), cy(i) - cy(e.path[s - 1]));
      minutes += step * MARCH_RATE[terr[i]];
    }
    const pts = chaikin(rdp(e.path.map((i): Pt => [cx(i), cy(i)]), 0.9), 2);
    const wp = pts.map((p): [number, number] => [Math.round(p[0] * src.cell), Math.round(p[1] * src.cell)]);
    wp[0] = px(labelCell[e.a]);
    wp[wp.length - 1] = px(labelCell[e.b]);
    const minutesOut = Math.max(2, Math.round(minutes));
    return e.naval ? { a: e.a, b: e.b, minutes: minutesOut, naval: true, waypoints: wp } : { a: e.a, b: e.b, minutes: minutesOut, waypoints: wp };
  });

  // ---- 5. regions
  const adjAll = new Map<number, number[]>();
  for (const e of outEdges) {
    adjAll.set(e.a, [...(adjAll.get(e.a) ?? []), e.b]);
    adjAll.set(e.b, [...(adjAll.get(e.b) ?? []), e.a]);
  }
  const bfs = (starts: number[]): Map<number, number> => {
    const d = new Map<number, number>();
    const q = [...starts];
    for (const s of starts) d.set(s, 0);
    for (let h = 0; h < q.length; h++) for (const n of adjAll.get(q[h]) ?? []) if (!d.has(n)) d.set(n, d.get(q[h])! + 1), q.push(n);
    return d;
  };
  const townIds = all.map((s, k) => (s.kind === 'town' || s.kind === 'capital' ? k + 1 : 0)).filter(Boolean);
  const toTown = bfs(townIds);
  const regionsPerMass = new Map<number, number>();
  for (let r = 1; r <= base; r++) {
    const c = landComp.comp[all[r - 1].cell];
    regionsPerMass.set(c, (regionsPerMass.get(c) ?? 0) + 1);
  }
  const dominant = (r: number): number => {
    const t = tcount[r];
    let best = LAND;
    let bn = -1;
    for (const k of [LAND, FOREST, HILLS, MOUNTAIN, MARSH]) {
      const n = k === LAND ? t[LAND] + t[SAND] : t[k];
      if (n > bn) (bn = n), (best = k);
    }
    return best;
  };

  // spawns: farthest-point spread over plots near a town
  const spawnCand: number[] = [];
  for (let r = 1; r <= base; r++) {
    if (all[r - 1].kind !== 'plot') continue;
    const t = tcount[r];
    if (t[MOUNTAIN] > cnt[r] * 0.4 || cnt[r] < src.targets.minRegionCells) continue;
    if (regionsPerMass.get(landComp.comp[all[r - 1].cell])! < 10) continue;
    if ((toTown.get(r) ?? 99) > 2) continue;
    spawnCand.push(r);
  }
  const spawns = new Set<number>();
  if ((globalThis as { DEBUG_SPAWN?: boolean }).DEBUG_SPAWN) {
    const why: Record<string, number> = {};
    for (let r = 1; r <= base; r++) {
      if (all[r - 1].kind !== 'plot') continue;
      const k = tcount[r][MOUNTAIN] > cnt[r] * 0.4 ? 'mtn' : cnt[r] < src.targets.minRegionCells ? 'small' : regionsPerMass.get(landComp.comp[all[r - 1].cell])! < 10 ? 'isle' : `hop${toTown.get(r)}`;
      why[k] = (why[k] ?? 0) + 1;
    }
    console.log(why);
  }
  {
    const pos = (r: number) => [cx(labelCell[r]), cy(labelCell[r])];
    const md = new Map<number, number>(spawnCand.map((r) => [r, Infinity]));
    let first = spawnCand[0];
    let fd = Infinity;
    for (const r of spawnCand) {
      const [x, y] = pos(r);
      const d = Math.hypot(x - W / 2, y - H / 2);
      if (d < fd) (fd = d), (first = r);
    }
    let next: number | undefined = first;
    while (next !== undefined && spawns.size < src.targets.spawns) {
      spawns.add(next);
      md.delete(next);
      const [nx, ny] = pos(next);
      let bd = -1;
      next = undefined;
      for (const [r, d0] of md) {
        const [x, y] = pos(r);
        const d = Math.min(d0, Math.hypot(x - nx, y - ny));
        md.set(r, d);
        if (d > bd) (bd = d), (next = r);
      }
    }
  }

  const usedNames = new Set(all.filter((s) => s.kind !== 'plot').map((s) => s.name));
  const districts = src.districts.map((d) => ({ name: d.name, p: P(d.at) }));
  const regions: OutRegion[] = all.map((s, k) => {
    const id = k + 1;
    const label = px(labelCell[id]);
    if (s.kind === 'sea') return { id, name: s.name, kind: 'sea', tier: 1, label };
    const t = tcount[id];
    const n = cnt[id];
    const dom = dominant(id);
    const coast = coastal.has(id);
    const hilly = (t[HILLS] + t[MOUNTAIN]) / n;
    const woods = Math.min(1, Math.round((t[FOREST] / n) * 100) / 100);
    const lat = lat1 - cy(s.cell) / K;
    const hh = hash(s.cell, id, 7);
    let siteBase: Site['base'];
    if (t[FOREST] / n >= 0.35) siteBase = 'forest';
    else if (hilly >= 0.45) siteBase = 'hills';
    else if (coast && t[SAND] / n >= 0.12 && hh < 0.6) siteBase = 'beach';
    else if (hh < (lat < 38.6 ? 0.55 : 0.2)) siteBase = 'scrub';
    else siteBase = 'plain';
    const site: Site = {
      base: siteBase,
      river: rivers[id] >= 3 && siteBase !== 'beach',
      coast,
      rocky: t[MOUNTAIN] / n >= 0.12 || (hilly >= 0.4 && hash(id, 3, 9) < 0.5),
      woods,
    };
    let name = s.name;
    if (s.kind === 'plot') {
      const [lx, ly] = [cx(labelCell[id]), cy(labelCell[id])];
      let dn = districts[0];
      let dd = Infinity;
      for (const d of districts) {
        const e = Math.hypot(d.p[0] - lx, d.p[1] - ly);
        if (e < dd) (dd = e), (dn = d);
      }
      const words = WORDS[coast && dom === LAND && t[SAND] / n > 0.1 && hash(id, 5, 5) < 0.6 ? SAND : dom];
      const off = Math.floor(hash(id, 11, 3) * words.length);
      name = '';
      for (let j = 0; j < words.length && !name; j++) {
        const c = `${dn.name} ${words[(off + j) % words.length]}`;
        if (!usedNames.has(c)) name = c;
      }
      for (let j = 2; !name; j++) {
        const c = `${dn.name} ${words[off]} ${['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][j] ?? j}`;
        if (!usedNames.has(c)) name = c;
      }
      usedNames.add(name);
    }
    const tier: OutRegion['tier'] =
      s.kind === 'capital' ? 5 : s.kind === 'fort' || s.kind === 'lair' ? 4 : s.kind === 'town' ? 3 : s.kind === 'post' ? 2 : dom === LAND ? 1 : 2;
    const out: OutRegion = { id, name, kind: s.kind, tier, site, label };
    if (spawns.has(id)) out.spawn = true;
    if (s.kind === 'plot' && coast) out.campPlot = true;
    if (s.major) out.revealPan = true;
    return out;
  });

  const map: OutMap = {
    id: src.id,
    version: src.version,
    cell: src.cell,
    w: W,
    h: H,
    mask: rleEncode(mask),
    terrain: rleEncode(terr),
    regions,
    edges: outEdges,
  };

  // ---- stats
  const landCounts = [...cnt.slice(1, base + 1)].sort((a, b) => a - b);
  const byKind: Record<string, number> = {};
  for (const r of regions) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  const hopsHist: Record<number, number> = {};
  for (const r of spawns) hopsHist[toTown.get(r)!] = (hopsHist[toTown.get(r)!] ?? 0) + 1;
  const stats: BuildStats = {
    w: W,
    h: H,
    landCells: land.reduce((a, b) => a + b, 0),
    landRegions: base,
    seaRegions: seaSeeds.length,
    byKind,
    edges: outEdges.length,
    navalEdges: outEdges.filter((e) => e.naval).length,
    spawns: spawns.size,
    campPlots: regions.filter((r) => r.campPlot).length,
    minLandCells: landCounts[0],
    maxLandCells: landCounts[landCounts.length - 1],
    medianLandCells: landCounts[landCounts.length >> 1],
    spawnMinSpacing: spawnSpacing(map),
    spawnHopsToTown: hopsHist,
  };
  return { map, stats };
}

/**
 * Diagonal growth can leave a region in several 4-connected pieces: keep the
 * piece holding the seed and hand every other piece to the neighbouring
 * region it touches most.
 */
function mergePieces(g: Grid, owner: Int32Array, seedCells: number[]): void {
  for (let round = 0; round < 8; round++) {
    const piece = new Int32Array(owner.length).fill(-1);
    const keep = new Set<number>();
    let n = 0;
    const cellsOf: number[][] = [];
    for (let s = 0; s < owner.length; s++) {
      if (owner[s] < 0 || piece[s] >= 0) continue;
      const cells = [s];
      piece[s] = n;
      for (let h = 0; h < cells.length; h++)
        g.each4(cells[h], (j) => {
          if (piece[j] < 0 && owner[j] === owner[s]) (piece[j] = n), cells.push(j);
        });
      cellsOf.push(cells);
      n++;
    }
    seedCells.forEach((c) => keep.add(piece[c]));
    let moved = 0;
    for (let p = 0; p < n; p++) {
      if (keep.has(p)) continue;
      const own = owner[cellsOf[p][0]];
      const votes = new Map<number, number>();
      for (const i of cellsOf[p]) g.each4(i, (j) => {
        if (owner[j] >= 0 && owner[j] !== own) votes.set(owner[j], (votes.get(owner[j]) ?? 0) + 1);
      });
      let best = -1;
      let bv = 0;
      for (const [o, v] of votes) if (v > bv || (v === bv && o < best)) (bv = v), (best = o);
      if (best < 0) continue;
      for (const i of cellsOf[p]) owner[i] = best;
      moved++;
    }
    if (!moved) return;
  }
}

function roughen(pts: Pt[], salt: number, w: number, h: number): Pt[] {
  let cur = pts;
  const off = (p: Pt) => p[0] < 0 || p[1] < 0 || p[0] > w || p[1] > h;
  for (let lvl = 0; lvl < 3; lvl++) {
    const out: Pt[] = [];
    for (let i = 0; i < cur.length; i++) {
      const p = cur[i];
      const q = cur[(i + 1) % cur.length];
      out.push(p);
      if (off(p) && off(q)) continue;
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const len = Math.hypot(dx, dy);
      if (len < 1.5) continue;
      const amp = Math.min(len * 0.2, 2.5);
      const t = hash(Math.round((p[0] + q[0]) * 8), Math.round((p[1] + q[1]) * 8), salt * 7 + lvl) - 0.5;
      out.push([(p[0] + q[0]) / 2 + (-dy / len) * t * amp, (p[1] + q[1]) / 2 + (dx / len) * t * amp]);
    }
    cur = out;
  }
  return cur;
}

/** Even-odd scanline fill of a polygon (grid coordinates), cell centres. */
function fillPoly(pts: Pt[], w: number, h: number, set: (i: number) => void): void {
  for (let y = 0; y < h; y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (a[1] <= yc !== b[1] <= yc) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((a, b) => a - b);
    for (let j = 0; j + 1 < xs.length; j += 2) {
      const x0 = Math.max(0, Math.ceil(xs[j] - 0.5));
      const x1 = Math.min(w - 1, Math.ceil(xs[j + 1] - 0.5) - 1);
      for (let x = x0; x <= x1; x++) set(y * w + x);
    }
  }
}

/** Smallest distance between two spawn labels, in cells. */
function spawnSpacing(m: OutMap): number {
  const s = m.regions.filter((r) => r.spawn);
  let best = Infinity;
  for (let i = 0; i < s.length; i++)
    for (let j = i + 1; j < s.length; j++) best = Math.min(best, Math.hypot(s[i].label[0] - s[j].label[0], s[i].label[1] - s[j].label[1]) / m.cell);
  return Math.round(best * 10) / 10;
}

// ------------------------------------------------------------------ validation

export interface MapCheckOptions {
  spawns: number;
  minRegionCells: number;
  minSeaCells: number;
  /** Fewest cells between two spawn labels. */
  minSpawnSpacing?: number;
  /** Most routes from a spawn plot to the nearest town or capital. */
  maxSpawnHopsToTown?: number;
}

/**
 * Builder-side checks on top of mapSchema's validateMap: every region one
 * piece and not a sliver (whole small islands excepted), labels inside their
 * region, land edges between touching regions, naval edges between coasts,
 * sea regions without edges, everything connected, spawn count and fairness.
 */
export function checkMap(m: OutMap, opt: MapCheckOptions): string[] {
  const errs: string[] = [];
  const N = m.w * m.h;
  let mask: Int32Array;
  try {
    mask = rleDecode(m.mask, N);
    rleDecode(m.terrain, N);
  } catch (e) {
    return [(e as Error).message];
  }
  const g = new Grid(m.w, m.h);
  const byId = new Map(m.regions.map((r) => [r.id, r]));
  const cells = new Map<number, number>();
  for (const v of mask) cells.set(v, (cells.get(v) ?? 0) + 1);
  const sea = (id: number) => byId.get(id)?.kind === 'sea';
  // contiguity + slivers
  const seen = new Int32Array(N).fill(0);
  const pieces = new Map<number, number>();
  for (let s = 0; s < N; s++) {
    if (seen[s]) continue;
    const id = mask[s];
    pieces.set(id, (pieces.get(id) ?? 0) + 1);
    const st = [s];
    seen[s] = 1;
    while (st.length) {
      const i = st.pop()!;
      g.each4(i, (j) => {
        if (!seen[j] && mask[j] === id) (seen[j] = 1), st.push(j);
      });
    }
  }
  const landMass = components(g, (i) => !sea(mask[i]));
  const massRegions = new Map<number, Set<number>>();
  for (let i = 0; i < N; i++) if (landMass.comp[i] >= 0) massRegions.set(landMass.comp[i], (massRegions.get(landMass.comp[i]) ?? new Set()).add(mask[i]));
  const soleOfIsland = new Set<number>();
  for (const s of massRegions.values()) if (s.size === 1) soleOfIsland.add([...s][0]);
  for (const r of m.regions) {
    const n = cells.get(r.id) ?? 0;
    if ((pieces.get(r.id) ?? 0) > 1) errs.push(`region ${r.id} ${r.name}: ${pieces.get(r.id)} pieces`);
    if (r.kind === 'sea' ? n < opt.minSeaCells : n < opt.minRegionCells && !soleOfIsland.has(r.id)) errs.push(`region ${r.id} ${r.name}: sliver (${n} cells)`);
    const li = Math.floor(r.label[1] / m.cell) * m.w + Math.floor(r.label[0] / m.cell);
    if (mask[li] !== r.id) errs.push(`region ${r.id} ${r.name}: label outside the region`);
  }
  // edges
  const touch = new Set<string>();
  const coast = new Set<number>();
  for (let i = 0; i < N; i++) {
    const a = mask[i];
    g.each4(i, (j) => {
      const b = mask[j];
      if (a === b) return;
      touch.add(`${a}-${b}`);
      if (sea(b) && !sea(a)) coast.add(a);
    });
  }
  const adj = new Map<number, number[]>();
  for (const e of m.edges) {
    const at = `edge ${e.a}-${e.b}`;
    if (sea(e.a) || sea(e.b)) errs.push(`${at}: touches a sea region`);
    if (e.naval) {
      if (!coast.has(e.a) || !coast.has(e.b)) errs.push(`${at}: naval edge between non-coastal regions`);
    } else if (!touch.has(`${e.a}-${e.b}`)) errs.push(`${at}: regions do not touch`);
    const f = e.waypoints[0];
    const l = e.waypoints[e.waypoints.length - 1];
    if (mask[Math.floor(f[1] / m.cell) * m.w + Math.floor(f[0] / m.cell)] !== e.a) errs.push(`${at}: first waypoint outside a`);
    if (mask[Math.floor(l[1] / m.cell) * m.w + Math.floor(l[0] / m.cell)] !== e.b) errs.push(`${at}: last waypoint outside b`);
    if (!(e.minutes > 0)) errs.push(`${at}: minutes`);
    adj.set(e.a, [...(adj.get(e.a) ?? []), e.b]);
    adj.set(e.b, [...(adj.get(e.b) ?? []), e.a]);
  }
  const land = m.regions.filter((r) => r.kind !== 'sea');
  const d = new Map<number, number>([[land[0].id, 0]]);
  const q = [land[0].id];
  for (let h = 0; h < q.length; h++) for (const n of adj.get(q[h]) ?? []) if (!d.has(n)) d.set(n, 0), q.push(n);
  const cut = land.filter((r) => !d.has(r.id));
  if (cut.length) errs.push(`unreachable regions: ${cut.map((r) => r.name).slice(0, 10).join(', ')}`);
  // spawns
  const spawns = land.filter((r) => r.spawn);
  if (spawns.length !== opt.spawns) errs.push(`spawns: ${spawns.length}, expected ${opt.spawns}`);
  if (spawns.some((r) => r.kind !== 'plot')) errs.push('spawns must be plots');
  const towns = land.filter((r) => r.kind === 'town' || r.kind === 'capital').map((r) => r.id);
  const hop = new Map<number, number>(towns.map((t) => [t, 0]));
  const tq = [...towns];
  for (let h = 0; h < tq.length; h++) for (const n of adj.get(tq[h]) ?? []) if (!hop.has(n)) hop.set(n, hop.get(tq[h])! + 1), tq.push(n);
  const maxHop = opt.maxSpawnHopsToTown ?? 2;
  for (const s of spawns) if ((hop.get(s.id) ?? 99) > maxHop) errs.push(`spawn ${s.id} ${s.name}: ${hop.get(s.id)} routes from a town`);
  const spacing = spawnSpacing(m);
  if (spacing < (opt.minSpawnSpacing ?? 8)) errs.push(`spawns too close: ${spacing} cells`);
  return errs;
}

// ------------------------------------------------------------------ debug preview

const HEX = (s: string): [number, number, number] => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const TERRAIN_RGB = ['#b18e9d', '#caa8ab', '#f7dac3', '#d7cb88', '#a8b46a', '#b19c7c', '#856a52', '#9fb39a'].map(HEX);

/** RGBA preview: terrain, dotted region borders, routes, places and spawns. */
export function renderDebug(m: OutMap, scale = 2): { w: number; h: number; rgba: Uint8Array } {
  const N = m.w * m.h;
  const mask = rleDecode(m.mask, N);
  const terr = rleDecode(m.terrain, N);
  const w = m.w * scale;
  const h = m.h * scale;
  const rgba = new Uint8Array(w * h * 4);
  const put = (x: number, y: number, c: [number, number, number]) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const o = (y * w + x) * 4;
    rgba[o] = c[0];
    rgba[o + 1] = c[1];
    rgba[o + 2] = c[2];
    rgba[o + 3] = 255;
  };
  const byId = new Map(m.regions.map((r) => [r.id, r]));
  for (let i = 0; i < N; i++) {
    const x = i % m.w;
    const y = (i - x) / m.w;
    let c = TERRAIN_RGB[terr[i]];
    const r = byId.get(mask[i])!;
    if (r.kind === 'sea' && (r.id * 37) % 3 === 0) c = [c[0] - 8, c[1] - 6, c[2] - 6];
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) put(x * scale + dx, y * scale + dy, c);
  }
  const ink: [number, number, number] = [0x5a, 0x40, 0x34];
  const seaInk = HEX('#7e5d8c');
  for (let i = 0; i < N; i++) {
    const x = i % m.w;
    const y = (i - x) / m.w;
    const sea = byId.get(mask[i])!.kind === 'sea';
    if (x + 1 < m.w && mask[i + 1] !== mask[i]) {
      const both = sea && byId.get(mask[i + 1])!.kind === 'sea';
      const coast = sea !== (byId.get(mask[i + 1])!.kind === 'sea');
      for (let d = 0; d < scale; d++) if (coast || (y * scale + d) % 2 === 0) put(x * scale + scale - 1, y * scale + d, both ? seaInk : coast ? [0x40, 0x30, 0x40] : ink);
    }
    if (i + m.w < N && mask[i + m.w] !== mask[i]) {
      const both = sea && byId.get(mask[i + m.w])!.kind === 'sea';
      const coast = sea !== (byId.get(mask[i + m.w])!.kind === 'sea');
      for (let d = 0; d < scale; d++) if (coast || (x * scale + d) % 2 === 0) put(x * scale + d, y * scale + scale - 1, both ? seaInk : coast ? [0x40, 0x30, 0x40] : ink);
    }
  }
  const k = scale / m.cell;
  for (const e of m.edges) {
    const c = e.naval ? HEX('#3f7f7e') : HEX('#a0522d');
    for (let s = 0; s + 1 < e.waypoints.length; s++) {
      const [a, b] = [e.waypoints[s], e.waypoints[s + 1]];
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * k);
      for (let t = 0; t <= n; t++) if (t % 3 !== 2) put((a[0] + ((b[0] - a[0]) * t) / Math.max(1, n)) * k, (a[1] + ((b[1] - a[1]) * t) / Math.max(1, n)) * k, c);
    }
  }
  const box = (x: number, y: number, r: number, c: [number, number, number]) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) put(x + dx, y + dy, c);
  };
  for (const r of m.regions) {
    const x = r.label[0] * k;
    const y = r.label[1] * k;
    if (r.kind === 'capital') box(x, y, scale + 3, HEX('#3a2020')), box(x, y, scale + 1, HEX('#f0dcc4'));
    else if (r.kind === 'town') box(x, y, scale + 1, HEX('#81605f'));
    else if (r.kind === 'fort') box(x, y, scale + 1, HEX('#2a2d4a'));
    else if (r.kind === 'post') box(x, y, scale, HEX('#2f8f86'));
    else if (r.kind === 'lair') box(x, y, scale + 1, HEX('#7a1fa0'));
    else if (r.spawn) box(x, y, scale, HEX('#d02020'));
    else if (r.kind === 'plot') box(x, y, 1, HEX('#40302a'));
    if (r.campPlot) box(x + scale + 2, y, 1, HEX('#e07020'));
  }
  return { w, h, rgba };
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** Minimal PNG (RGBA 8-bit); `deflate` is zlib's deflateSync. */
export function encodePng(w: number, h: number, rgba: Uint8Array, deflate: (b: Uint8Array) => Uint8Array): Uint8Array {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const chunks: Uint8Array[] = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])];
  const chunk = (type: string, data: Uint8Array) => {
    const b = new Uint8Array(12 + data.length);
    const dv = new DataView(b.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
    b.set(data, 8);
    let c = 0xffffffff;
    for (let i = 4; i < 8 + data.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    dv.setUint32(8 + data.length, (c ^ 0xffffffff) >>> 0);
    chunks.push(b);
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr.set([8, 6, 0, 0, 0], 8);
  chunk('IHDR', ihdr);
  chunk('IDAT', deflate(raw));
  chunk('IEND', new Uint8Array(0));
  const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
  let o = 0;
  for (const c of chunks) out.set(c, o), (o += c.length);
  return out;
}

// ------------------------------------------------------------------ output

/** Stable, diff-friendly JSON: one region / edge per line. */
export function serializeMap(m: OutMap): string {
  const j = JSON.stringify;
  return (
    '{\n' +
    `  "id": ${j(m.id)},\n  "version": ${m.version},\n  "cell": ${m.cell},\n  "w": ${m.w},\n  "h": ${m.h},\n` +
    `  "mask": ${j(m.mask)},\n  "terrain": ${j(m.terrain)},\n` +
    `  "regions": [\n${m.regions.map((r) => '    ' + j(r)).join(',\n')}\n  ],\n` +
    `  "edges": [\n${m.edges.map((e) => '    ' + j(e)).join(',\n')}\n  ]\n}\n`
  );
}

export function checkOptions(src: MapSource): MapCheckOptions {
  return { spawns: src.targets.spawns, minRegionCells: src.targets.minRegionCells, minSeaCells: src.targets.minSeaCells };
}

// ------------------------------------------------------------------ CLI

async function main(argv: string[]): Promise<number> {
  const fs = await import(/* @vite-ignore */ 'node:' + 'fs');
  const zlib = await import(/* @vite-ignore */ 'node:' + 'zlib');
  const args = argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(name);
    if (i < 0) return undefined;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const png = opt('--png');
  const scale = Number(opt('--scale') ?? 2);
  let out = opt('--out');
  const input = args[0] ?? 'maps-src/westmed.json';
  const src = JSON.parse(fs.readFileSync(input, 'utf8')) as MapSource;
  out ??= `src/online/maps/${src.id}.json`;
  const t0 = Date.now();
  const { map, stats } = buildMap(src);
  fs.writeFileSync(out, serializeMap(map));
  console.log(`${out}: built in ${Date.now() - t0} ms`);
  console.log(JSON.stringify(stats));
  if (png) {
    const img = renderDebug(map, scale);
    fs.writeFileSync(png, encodePng(img.w, img.h, img.rgba, (b: Uint8Array) => zlib.deflateSync(b)));
    console.log(`preview: ${png}`);
  }
  const errs = checkMap(map, checkOptions(src));
  for (const e of errs.slice(0, 40)) console.error(`  ${e}`);
  if (errs.length) console.error(`${errs.length} problem(s)`);
  return errs.length ? 1 : 0;
}

const proc = (globalThis as { process?: { argv: string[]; exitCode?: number } }).process;
if (proc?.argv?.[1] && /buildMap\.ts$/.test(proc.argv[1])) {
  main(proc.argv).then((code) => (proc.exitCode = code));
}
