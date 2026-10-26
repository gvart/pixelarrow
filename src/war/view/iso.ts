/**
 * True-isometric projection of a region with raised height (W-16). The sim stays in tile
 * coordinates; this maps tiles to world pixels and back.
 *
 *   world.x = OX + (x - y) * HW
 *   world.y = OY + (x + y) * HH - z * LH      z: the tile's surface level (height; water flush with its banks)
 *
 * Real scale (W-18): a tile is 2 m, drawn as a 64 x 32 diamond at zoom 1 next to 58 px (1.76 m)
 * soldier sprites. One visual level lifts a cell by LH = 32 px, 1 m next to the 33 px/m soldiers and
 * buildings (W-52 amendment: RELIEF = 4 visual levels per sim level, so a sim level reads 4 m). The
 * PixelLab tile sides and cliff strips are 16 px (SIDE): taller risers stack them. LH = 2 * HH, so a
 * screen pixel's view ray steps one level up for every two units of x + y toward the viewer: picking
 * marches down that ray from the highest level and takes the first solid column it meets.
 *
 * The ground is drawn from the visual layer (RegionData.visual, src/war/regions/visual.ts): 1 m
 * cells, 2 x 2 per tile, drawn as 32 x 16 diamonds, whose levels may rise far above the sim's 0..15
 * on impassable mountains (up to ZMAX). Picking, occlusion and the objects use those cells; units
 * stand on them too but never more than a level off their tile's sim height.
 *
 * One-level steps between land cells (the generator's eased slopes) are drawn as smooth ramps, not risers: each cell
 * has four corner levels (cornerLevels), its diamond warped through them, and zAt is that surface. Steps of two levels
 * or more are cliffs: the cells along them, and water, stay flat at their own level, but for rock walls (./rockFace.ts
 * wallStone): their rim cells a level apart ramp into each other, so a wall's top runs up a slope instead of in steps.
 */
import type { RegionData } from '../types';
import { decodeBiomes, decodeVisual, KINDS, ZVIS } from '../regions/visual';
import { peakAt, peakField, stubField, type PeakField } from './peaks';
import { wallStone } from './rockFace';

export const HW = 32;
export const HH = 16;
/** Px per visual level: the single source of the drawn level height (W-52 amendment). */
export const LH = 32;
/** Px of the art's own riser: a fine frame's side and the pitch of the cliff strips (./art.ts), tiled down taller faces. */
export const SIDE = 16;
/** Highest visual level. */
export const ZMAX = ZVIS;
/** The slab's underside: walls along the map edge drop to this level. */
export const ZBASE = -1.5;

/**
 * Surface level per cell: its height; water lies flush with its banks (each connected body at the
 * commonest height of the land round it), so shores are drawn as organic transitions, not walls
 * along cell edges. Rock banks above it stay cliffs.
 */
function flush(w: number, h: number, height: ArrayLike<number>, wet: (i: number) => boolean): Float32Array {
  const z = new Float32Array(w * h);
  for (let i = 0; i < z.length; i++) z[i] = height[i];
  const seen = new Uint8Array(w * h);
  for (let s = 0; s < seen.length; s++) {
    if (!wet(s) || seen[s]) continue;
    const body = [s], shore = new Map<number, number>();
    seen[s] = 1;
    for (let k = 0; k < body.length; k++) {
      const i = body[k], x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, j = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[j] === 1) continue;
        // a body stops where its bed drops 3+ levels (a river over a fall: the pool below lies at its own banks)
        if (wet(j) && Math.abs(height[j] - height[i]) <= 2) { seen[j] = 1; body.push(j); } else if (!wet(j)) shore.set(height[j], (shore.get(height[j]) ?? 0) + 1);
      }
    }
    let level = 0, best = -1;
    for (const [hgt, c] of shore) if (c > best || (c === best && hgt < level)) { level = hgt; best = c; }
    for (const i of body) z[i] = Math.max(height[i], level);
  }
  return z;
}

/**
 * Cells `low` take the level of the nearest other cell (breadth first), then no two of them differ by
 * more than a level, so the flat mountain ground has no cliff inside.
 */
function lower(z: Float32Array, w: number, low: (j: number) => boolean): void {
  const q: number[] = [], done = new Uint8Array(z.length);
  for (let j = 0; j < z.length; j++) if (!low(j)) { done[j] = 1; q.push(j); }
  const N = [1, -1, w, -w];
  for (let k = 0; k < q.length; k++) {
    const j = q[k], x = j % w;
    for (const d of N) {
      const i = j + d;
      if (i < 0 || i >= z.length || (d === 1 && x === w - 1) || (d === -1 && x === 0) || done[i]) continue;
      done[i] = 1; z[i] = z[j]; q.push(i);
    }
  }
  const set = q.filter((j) => low(j));
  for (let it = 0, changed = true; changed && it < 8; it++) {
    changed = false;
    for (const pass of [set, [...set].reverse()]) for (const j of pass) {
      const x = j % w;
      let m = z[j];
      if (x > 0 && low(j - 1)) m = Math.min(m, z[j - 1] + 1);
      if (x < w - 1 && low(j + 1)) m = Math.min(m, z[j + 1] + 1);
      if (j >= w && low(j - w)) m = Math.min(m, z[j - w] + 1);
      if (j + w < z.length && low(j + w)) m = Math.min(m, z[j + w] + 1);
      if (m < z[j]) { z[j] = m; changed = true; }
    }
  }
}

/**
 * Corner levels of the visual cells, 4 per cell (N, E, S, W: the lattice points (x, y), (x + 1, y), (x + 1, y + 1),
 * (x, y + 1)), and per cell 1 if they are not all its own level (a ramp cell). At each lattice point the cells joined by
 * flat edges or one-level land steps share one level: the level of a flat cell among them (a cliff's or water's), else
 * their mean. A cell is flat when it is water or a 4-neighbour lies two or more levels off (a cliff top or foot), but two
 * such cells of a rock wall (`rock`) a level apart join: the lower one's corner rises to the higher (the wall's rim slopes).
 */
function cornerLevels(fw: number, fh: number, fz: Float32Array, wet: (j: number) => boolean, rock: (j: number) => boolean = () => false): { fc: Float32Array; ramp: Uint8Array } {
  const n = fw * fh, fc = new Float32Array(4 * n), ramp = new Uint8Array(n), hard = new Uint8Array(n);
  for (let j = 0; j < n; j++) {
    const x = j % fw, z = fz[j];
    fc[4 * j] = fc[4 * j + 1] = fc[4 * j + 2] = fc[4 * j + 3] = z;
    if (wet(j) || (x > 0 && Math.abs(fz[j - 1] - z) >= 2) || (x < fw - 1 && Math.abs(fz[j + 1] - z) >= 2)
      || (j >= fw && Math.abs(fz[j - fw] - z) >= 2) || (j + fw < n && Math.abs(fz[j + fw] - z) >= 2)) hard[j] = 1;
  }
  const link = (a: number, b: number) => {
    const d = Math.abs(fz[a] - fz[b]);
    return d === 0 || (d <= 1 && (!(hard[a] && hard[b]) || (rock(a) && rock(b))) && !wet(a) && !wet(b));
  };
  // the cells round a point: 0 (X-1, Y-1), 1 (X, Y-1), 2 (X-1, Y), 3 (X, Y), and which corner of each the point is
  const c = [0, 0, 0, 0], g = [0, 0, 0, 0], Q = [2, 3, 1, 0], E = [[0, 1], [0, 2], [1, 3], [2, 3]];
  for (let Y = 0; Y <= fh; Y++) for (let X = 0; X <= fw; X++) {
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < 4; k++) {
      const x = X - 1 + (k & 1), y = Y - 1 + (k >> 1);
      c[k] = x < 0 || y < 0 || x >= fw || y >= fh ? -1 : y * fw + x;
      g[k] = k;
      if (c[k] >= 0) { lo = Math.min(lo, fz[c[k]]); hi = Math.max(hi, fz[c[k]]); }
    }
    if (hi === lo) continue;
    for (let it = 0; it < 2; it++) for (const [a, b] of E) {
      if (c[a] < 0 || c[b] < 0 || g[a] === g[b] || !link(c[a], c[b])) continue;
      const from = Math.max(g[a], g[b]), to = Math.min(g[a], g[b]);
      for (let k = 0; k < 4; k++) if (g[k] === from) g[k] = to;
    }
    for (let k = 0; k < 4; k++) {
      if (g[k] !== k) continue;
      let sum = 0, cnt = 0, fixed = -Infinity, mixed = false;
      for (let m = 0; m < 4; m++) if (g[m] === k && c[m] >= 0) {
        const z = fz[c[m]];
        sum += z; cnt++;
        if (hard[c[m]]) fixed = Math.max(fixed, z);
        if (z !== fz[c[k] >= 0 ? c[k] : c[m]]) mixed = true;
      }
      if (!mixed) continue;
      const v = fixed > -Infinity ? fixed : sum / cnt;
      for (let m = 0; m < 4; m++) if (g[m] === k && c[m] >= 0 && (!hard[c[m]] || rock(c[m])) && fz[c[m]] !== v) { fc[4 * c[m] + Q[m]] = v; ramp[c[m]] = 1; }
    }
  }
  return { fc, ramp };
}

const SHALLOW = KINDS.indexOf('shallow'), DEEP = KINDS.indexOf('deep');

export class IsoMap {
  readonly w: number;
  readonly h: number;
  /** Surface level per tile (sim heights, water flush with its banks). */
  readonly z: Float32Array;
  /**
   * Per tile, the lowest level units on it are drawn at: its surface level, or the lowest of its four visual cells when
   * all of them stand above it (the relief is drawn taller than the sim's levels, scripts/war/regions/kit.ts RELIEF and
   * Site.lift).
   */
  readonly zu: Float32Array;
  /** Per tile, the highest level units on it are drawn at (its highest visual cell). */
  readonly zh: Float32Array;
  /** The visual cells: 2w x 2h, kind (KINDS index) and surface level. */
  readonly fw: number;
  readonly fh: number;
  readonly fk: Uint8Array;
  readonly fz: Float32Array;
  /** Per visual cell its four corner levels (N, E, S, W; cornerLevels), and 1 where they are not all its level (a ramp). */
  readonly fc: Float32Array;
  readonly ramp: Uint8Array;
  /** Highest surface level (the peaks' included). */
  readonly top: number;
  /** Highest ground level (the cells'). */
  readonly groundTop: number;
  /** The visual-only peaks over the flat mountain (./peaks.ts), null without. */
  readonly peaks: PeakField | null = null;
  /** The peaks cut down to stubs (./peaks.ts stubField): drawn and picked while `cut`, and inside the `holes`. */
  readonly stub: PeakField | null = null;
  /** The peaks are cut away (the V key): the ground behind them is drawn, picked and hides nothing. */
  cut = false;
  /** See-through holes in the peaks (world px circles round the cursor and the selected units behind a range). */
  holes: { x: number; y: number; r: number }[] = [];
  readonly OX: number;
  readonly OY: number;
  /** World size in px. */
  readonly W: number;
  readonly H: number;

  /**
   * `flat`: per tile, 1 = mountain drawn flat at its foot height under massif sprites (./massifs.ts);
   * `scree`: per tile, 1 = its grass and meadow cells drawn as scree (the ring round the massifs);
   * `peaks`: raise procedural peaks over the flat mountain (./peaks.ts) instead of leaving it to massif sprites.
   */
  constructor(r: RegionData, flat: Uint8Array | null = null, scree: Uint8Array | null = null, peaks = false) {
    this.w = r.w;
    this.h = r.h;
    this.z = flush(r.w, r.h, r.height, (i) => r.water[i] > 0);
    const fw = (this.fw = 2 * r.w), fh = (this.fh = 2 * r.h), n = fw * fh;
    let kind: Uint8Array, height: Uint8Array;
    if (r.visual) ({ kind, z: height } = decodeVisual(r.visual.rle, n));
    else { // no visual layer: each tile's 4 cells copy it
      kind = new Uint8Array(n); height = new Uint8Array(n);
      for (let fy = 0; fy < fh; fy++) for (let fx = 0; fx < fw; fx++) {
        const i = (fy >> 1) * r.w + (fx >> 1), j = fy * fw + fx;
        kind[j] = r.water[i] === 2 ? DEEP : r.water[i] === 1 ? SHALLOW : KINDS.indexOf(r.terrain[i]);
        height[j] = r.height[i];
      }
    }
    this.fk = kind;
    // a built visual layer has its water levelled already (scripts/war/regions/kit.ts visualLayer)
    this.fz = r.visual ? Float32Array.from(height) : flush(fw, fh, height, (j) => kind[j] === SHALLOW || kind[j] === DEEP);
    if (flat) {
      // the mountain's tiles, and rock cells on the tiles round them (the cells' curves overhang the tiles')
      const SNOW = KINDS.indexOf('snow'), ROCK = KINDS.indexOf('rock'), near = new Uint8Array(flat.length);
      for (let i = 0; i < flat.length; i++) if (flat[i]) {
        const x = i % r.w, y = (i / r.w) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < r.w && y + dy < r.h) near[i + dy * r.w + dx] = 1;
      }
      const tile = (j: number) => ((j / fw / 2) | 0) * r.w + ((j % fw) >> 1);
      const low = (j: number) => flat[tile(j)] === 1 || (near[tile(j)] === 1 && (kind[j] === ROCK || kind[j] === SNOW));
      lower(this.fz, fw, low);
      for (let j = 0; j < n; j++) if (kind[j] === SNOW && low(j)) kind[j] = ROCK; // the summits' snow is on the sprites now
    }
    if (scree) {
      const SCREE = KINDS.indexOf('scree'), GRASS = KINDS.indexOf('grass'), MEADOW = KINDS.indexOf('meadow');
      for (let j = 0; j < n; j++) {
        if ((kind[j] === GRASS || kind[j] === MEADOW) && scree[((j / fw / 2) | 0) * r.w + ((j % fw) >> 1)]) kind[j] = SCREE;
      }
    }
    // rock walls' rims ramp (cornerLevels): the cells whose walls are drawn as stone faces (./art.ts)
    const biome = r.biomes ? decodeBiomes(r.biomes.rle, r.w * r.h) : null, names = r.biomes?.names ?? [];
    const rock = (j: number) => wallStone(biome ? names[biome[((j / fw / 2) | 0) * r.w + ((j % fw) >> 1)]] : 'global', KINDS[kind[j]]) !== null;
    ({ fc: this.fc, ramp: this.ramp } = cornerLevels(fw, fh, this.fz, (j) => kind[j] === SHALLOW || kind[j] === DEEP, rock));
    this.zu = this.z.slice();
    this.zh = this.z.slice();
    for (let i = 0; i < this.zu.length; i++) {
      const j = 2 * ((i / r.w) | 0) * fw + 2 * (i % r.w), c = [this.fz[j], this.fz[j + 1], this.fz[j + fw], this.fz[j + fw + 1]];
      const lo = Math.min(...c), hi = Math.max(...c);
      if (lo > this.zu[i]) this.zu[i] = lo;
      this.zh[i] = Math.max(this.zu[i], hi);
    }
    let top = 0;
    for (let j = 0; j < n; j++) if (this.fz[j] > top) top = this.fz[j];
    this.groundTop = top;
    if (flat && peaks) {
      // the flat ground under a lattice point: the mean of the cells round it
      const fz = this.fz, ground = (X: number, Y: number) => {
        let s = 0;
        for (let k = 0; k < 4; k++) s += fz[Math.max(0, Math.min(fh - 1, 2 * Y - 1 + (k >> 1))) * fw + Math.max(0, Math.min(fw - 1, 2 * X - 1 + (k & 1)))];
        return s / 4;
      };
      this.peaks = peakField(r, flat, ground);
      this.stub = stubField(this.peaks);
      top = Math.max(top, this.peaks.top);
    }
    this.top = top;
    // room above the map for its highest ground and the tallest sprite on it (~650 px); not ZMAX levels, which at 32 px
    // a level would be ~4000 px of empty sky
    this.OY = (Math.ceil(top) + 1) * LH + 1024;
    this.OX = r.h * HW;
    this.W = (r.w + r.h) * HW;
    this.H = this.OY + (r.w + r.h) * HH - ZBASE * LH + 4;
  }

  /** Surface level of the tile at integer (x, y); ZBASE off the map. */
  zt(x: number, y: number): number {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? ZBASE : this.z[y * this.w + x];
  }

  /** Drawn top level of the tile at integer (x, y) (its highest visual cell); ZBASE off the map. */
  ztop(x: number, y: number): number {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? ZBASE : this.zh[y * this.w + x];
  }

  /** Surface level of the visual cell at integer (fx, fy); ZBASE off the map. */
  zf(fx: number, fy: number): number {
    return fx < 0 || fy < 0 || fx >= this.fw || fy >= this.fh ? ZBASE : this.fz[fy * this.fw + fx];
  }

  /**
   * Visual surface level under a fractional tile point: the drawn ground, flat on a cell or, on a ramp cell, linear
   * over each half of its diamond (split along its W-E diagonal, as ./art.ts warps it); ZBASE off the map.
   */
  zAt(x: number, y: number): number {
    const X = 2 * x, Y = 2 * y, cx = Math.floor(X), cy = Math.floor(Y);
    if (cx < 0 || cy < 0 || cx >= this.fw || cy >= this.fh) return ZBASE;
    const j = cy * this.fw + cx;
    if (!this.ramp[j]) return this.fz[j];
    const a = X - cx, b = Y - cy, c = this.fc, k = 4 * j;
    return a + b <= 1 ? c[k] + a * (c[k + 1] - c[k]) + b * (c[k + 3] - c[k]) : c[k + 2] + (1 - a) * (c[k + 3] - c[k + 2]) + (1 - b) * (c[k + 1] - c[k + 2]);
  }

  /** The peaks as drawn at world px (wx, wy): their stubs while cut or inside a hole (none given: the cut alone). */
  drawnPeaks(wx?: number, wy?: number): PeakField | null {
    if (this.cut) return this.stub;
    if (wx !== undefined && wy !== undefined) for (const h of this.holes) if ((wx - h.x) ** 2 + (wy - h.y) ** 2 < h.r * h.r) return this.stub;
    return this.peaks;
  }

  /** The drawn surface under a fractional tile point: the ground (zAt) and the peaks over it (`f`: the peaks as drawn). */
  zSurf(x: number, y: number, f = this.drawnPeaks()): number {
    return f ? this.zAt(x, y) + peakAt(f, x, y) : this.zAt(x, y);
  }

  /** Peak levels over the ground at a fractional tile point (0 off the mountain), as drawn (cut or not). */
  peakAt(x: number, y: number): number {
    const f = this.drawnPeaks();
    return f ? peakAt(f, x, y) : 0;
  }

  /**
   * Level a unit is drawn at: the ground surface under it (zAt: a man walking a ramp rises with it), kept within a
   * level of its tile's drawn relief (zu..zh; the cells follow finer curves than the sim).
   */
  zDraw(x: number, y: number): number {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return ZBASE;
    const i = ty * this.w + tx;
    return Math.max(this.zu[i] - 1, Math.min(this.zh[i] + 1, this.zAt(x, y)));
  }

  sx(x: number, y: number): number {
    return this.OX + (x - y) * HW;
  }

  sy(x: number, y: number, z: number): number {
    return this.OY + (x + y) * HH - z * LH;
  }

  /**
   * World px -> the tile point on the front-most surface under it (a cliff face picks the tile on
   * top of it). Off the map: the point on the base plane, clamped to the map.
   */
  pick(wx: number, wy: number, f = this.drawnPeaks(wx, wy)): { x: number; y: number } {
    const u = (wx - this.OX) / HW, zm = this.zmax();
    for (let z = this.top; z >= ZBASE; z -= 2 / LH) { // 2 px steps along the ray
      const v = (wy - this.OY + z * LH) / HH, x = (u + v) / 2, y = (v - u) / 2;
      if (x < 0 || y < 0 || x >= this.w || y >= this.h || zm[(y | 0) * this.w + (x | 0)] < z - 1e-4) continue;
      if (this.zSurf(x, y, f) >= z - 1e-4) return { x, y };
    }
    const v = (wy - this.OY) / HH;
    return { x: Math.max(0, Math.min(this.w - 0.01, (u + v) / 2)), y: Math.max(0, Math.min(this.h - 0.01, (v - u) / 2)) };
  }

  /** Is the world point (wx, wy), standing at x + y = v0 and level z0, hidden by ground in front of it? */
  hidden(wx: number, wy: number, v0: number, z0: number, f = this.drawnPeaks(wx, wy)): boolean {
    const u = (wx - this.OX) / HW, zm = this.zmax();
    for (let z = this.top; z > z0; z -= (z > this.groundTop ? 8 : 4) / LH) { // 4 px steps (8 over the peaks alone)
      const v = (wy - this.OY + z * LH) / HH;
      if (v <= v0 + 0.25) return false;
      const x = (u + v) / 2, y = (v - u) / 2;
      if (x >= 0 && y >= 0 && x < this.w && y < this.h && zm[(y | 0) * this.w + (x | 0)] >= z && this.zSurf(x, y, f) >= z) return true;
    }
    return false;
  }

  /**
   * Per tile, a level no point of its drawn surface rises above (its cells' corners, the full peaks' over them): the
   * rays of pick() and hidden() pass a tile below it without sampling the surface.
   */
  private zmax(): Float32Array {
    if (this.zm) return this.zm;
    const { w, h, fw, fc, fz } = this, out = new Float32Array(w * h), f = this.peaks;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let m = -Infinity;
      for (let k = 0; k < 4; k++) {
        const j = (2 * y + (k >> 1)) * fw + 2 * x + (k & 1);
        m = Math.max(m, fz[j], fc[4 * j], fc[4 * j + 1], fc[4 * j + 2], fc[4 * j + 3]);
      }
      if (f) { const W = f.w + 1, q = y * W + x; m += Math.max(0, f.P[q], f.P[q + 1], f.P[q + W], f.P[q + W + 1]); }
      out[y * w + x] = m;
    }
    return (this.zm = out);
  }

  private zm: Float32Array | null = null;
}
