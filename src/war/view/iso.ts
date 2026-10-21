/**
 * True-isometric projection of a region with raised height (W-16). The sim stays in tile
 * coordinates; this maps tiles to world pixels and back.
 *
 *   world.x = OX + (x - y) * HW
 *   world.y = OY + (x + y) * HH - z * LH      z: the tile's surface level (height; water flush with its banks)
 *
 * Real scale (W-18): a tile is 2 m, drawn as a 64 x 32 diamond at zoom 1 next to 58 px (1.76 m)
 * soldier sprites. One height level lifts a tile by LH = 16 px (about 1 m at the tile's ground
 * scale), the earth side of a PixelLab iso tile, so tile sides stack exactly. LH = HH, so a screen
 * pixel's view ray steps one level up for every unit of x + y toward the viewer: picking marches
 * down that ray from the highest level and takes the first solid column it meets.
 *
 * The ground is drawn from the visual layer (RegionData.visual, src/war/regions/visual.ts): 1 m
 * cells, 2 x 2 per tile, drawn as 32 x 16 diamonds, whose levels may rise far above the sim's 0..7
 * on impassable mountains (up to ZMAX). Picking, occlusion and the objects use those cells; units
 * stand on them too but never more than a level off their tile's sim height.
 */
import type { RegionData } from '../types';
import { decodeVisual, KINDS, ZVIS } from '../regions/visual';

export const HW = 32;
export const HH = 16;
export const LH = 16;
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
        if (wet(j)) { seen[j] = 1; body.push(j); } else shore.set(height[j], (shore.get(height[j]) ?? 0) + 1);
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

const SHALLOW = KINDS.indexOf('shallow'), DEEP = KINDS.indexOf('deep');

export class IsoMap {
  readonly w: number;
  readonly h: number;
  /** Surface level per tile (sim heights, water flush with its banks). */
  readonly z: Float32Array;
  /**
   * Per tile, the level units on it are drawn about: its surface level, or the lowest of its four visual cells when all of
   * them stand 2+ levels above it (a landmark's relief drawn taller than the sim's levels, scripts/war/regions/kit.ts
   * Site.lift).
   */
  readonly zu: Float32Array;
  /** The visual cells: 2w x 2h, kind (KINDS index) and surface level. */
  readonly fw: number;
  readonly fh: number;
  readonly fk: Uint8Array;
  readonly fz: Float32Array;
  /** Highest surface level. */
  readonly top: number;
  readonly OX: number;
  readonly OY = (ZMAX + 1) * LH;
  /** World size in px. */
  readonly W: number;
  readonly H: number;

  /**
   * `flat`: per tile, 1 = mountain drawn flat at its foot height under massif sprites (./massifs.ts);
   * `scree`: per tile, 1 = its grass and meadow cells drawn as scree (the ring round the massifs).
   */
  constructor(r: RegionData, flat: Uint8Array | null = null, scree: Uint8Array | null = null) {
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
    this.fz = flush(fw, fh, height, (j) => kind[j] === SHALLOW || kind[j] === DEEP);
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
    this.zu = this.z.slice();
    for (let i = 0; i < this.zu.length; i++) {
      const j = 2 * ((i / r.w) | 0) * fw + 2 * (i % r.w), lo = Math.min(this.fz[j], this.fz[j + 1], this.fz[j + fw], this.fz[j + fw + 1]);
      if (lo >= this.zu[i] + 2) this.zu[i] = lo;
    }
    let top = 0;
    for (let j = 0; j < n; j++) if (this.fz[j] > top) top = this.fz[j];
    this.top = top;
    this.OX = r.h * HW;
    this.W = (r.w + r.h) * HW;
    this.H = this.OY + (r.w + r.h) * HH - ZBASE * LH + 4;
  }

  /** Surface level of the tile at integer (x, y); ZBASE off the map. */
  zt(x: number, y: number): number {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? ZBASE : this.z[y * this.w + x];
  }

  /** Surface level of the visual cell at integer (fx, fy); ZBASE off the map. */
  zf(fx: number, fy: number): number {
    return fx < 0 || fy < 0 || fx >= this.fw || fy >= this.fh ? ZBASE : this.fz[fy * this.fw + fx];
  }

  /** Visual surface level under a fractional tile point. */
  zAt(x: number, y: number): number {
    return this.zf(Math.floor(2 * x), Math.floor(2 * y));
  }

  /**
   * Level a unit is drawn at: its cell's level, eased toward a neighbour one level up or down (a
   * walkable step) over the half cell next to the shared edge, so a man walking a slope rises
   * smoothly and meets the neighbour's value halfway up the riser. Cliffs and water stay hard. Kept
   * within a level of the tile's sim height (the cells follow finer curves than the sim), or of its drawn relief (zu).
   */
  zDraw(x: number, y: number): number {
    const X = 2 * x, Y = 2 * y, cx = Math.floor(X), cy = Math.floor(Y), z = this.zf(cx, cy);
    const tx = Math.floor(x), ty = Math.floor(y), zs = tx < 0 || ty < 0 || tx >= this.w || ty >= this.h ? ZBASE : this.zu[ty * this.w + tx];
    if (cx < 0 || cy < 0 || cx >= this.fw || cy >= this.fh) return z;
    const fx = X - cx - 0.5, fy = Y - cy - 0.5;
    const ease = (nx: number, ny: number, f: number) => {
      const n = this.zf(nx, ny), d = n - z;
      return d !== 0 && Math.abs(d) <= 1 ? d * Math.abs(f) : 0;
    };
    const d = z + ease(cx + Math.sign(fx), cy, fx) + ease(cx, cy + Math.sign(fy), fy);
    return Math.max(zs - 1, Math.min(zs + 1, d));
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
  pick(wx: number, wy: number): { x: number; y: number } {
    const u = (wx - this.OX) / HW;
    for (let z = this.top; z >= ZBASE; z -= 0.125) {
      const v = (wy - this.OY + z * LH) / HH, x = (u + v) / 2, y = (v - u) / 2;
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      if (this.fz[Math.floor(2 * y) * this.fw + Math.floor(2 * x)] >= z - 1e-4) return { x, y };
    }
    const v = (wy - this.OY) / HH;
    return { x: Math.max(0, Math.min(this.w - 0.01, (u + v) / 2)), y: Math.max(0, Math.min(this.h - 0.01, (v - u) / 2)) };
  }

  /** Is the world point (wx, wy), standing at x + y = v0 and level z0, hidden by ground in front of it? */
  hidden(wx: number, wy: number, v0: number, z0: number): boolean {
    const u = (wx - this.OX) / HW;
    for (let z = this.top; z > z0; z -= 0.25) {
      const v = (wy - this.OY + z * LH) / HH;
      if (v <= v0 + 0.25) return false;
      const x = Math.floor(u + v), y = Math.floor(v - u); // visual cells
      if (x >= 0 && y >= 0 && x < this.fw && y < this.fh && this.fz[y * this.fw + x] >= z) return true;
    }
    return false;
  }
}
