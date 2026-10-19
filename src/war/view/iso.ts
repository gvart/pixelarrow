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
 */
import type { RegionData } from '../types';

export const HW = 32;
export const HH = 16;
export const LH = 16;
export const ZMAX = 7;
/** The slab's underside: walls along the map edge drop to this level. */
export const ZBASE = -1.5;

export class IsoMap {
  readonly w: number;
  readonly h: number;
  /**
   * Surface level per tile: its height; water lies flush with its banks (each connected body at
   * the commonest height of the land round it), so shores are drawn as organic tile transitions,
   * not walls along tile edges. Rock banks above it stay cliffs.
   */
  readonly z: Float32Array;
  readonly OX: number;
  readonly OY = (ZMAX + 1) * LH;
  /** World size in px. */
  readonly W: number;
  readonly H: number;

  constructor(r: RegionData) {
    this.w = r.w;
    this.h = r.h;
    this.z = new Float32Array(r.w * r.h);
    for (let i = 0; i < this.z.length; i++) this.z[i] = r.height[i];
    const seen = new Uint8Array(r.w * r.h);
    for (let s = 0; s < seen.length; s++) {
      if (!r.water[s] || seen[s]) continue;
      const body = [s], shore = new Map<number, number>();
      seen[s] = 1;
      for (let k = 0; k < body.length; k++) {
        const i = body[k], x = i % r.w, y = (i / r.w) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy, j = ny * r.w + nx;
          if (nx < 0 || ny < 0 || nx >= r.w || ny >= r.h || seen[j] === 1) continue;
          if (r.water[j]) { seen[j] = 1; body.push(j); } else shore.set(r.height[j], (shore.get(r.height[j]) ?? 0) + 1);
        }
      }
      let level = 0, best = -1;
      for (const [hgt, c] of shore) if (c > best || (c === best && hgt < level)) { level = hgt; best = c; }
      for (const i of body) this.z[i] = Math.max(r.height[i], level);
    }
    this.OX = r.h * HW;
    this.W = (r.w + r.h) * HW;
    this.H = this.OY + (r.w + r.h) * HH - ZBASE * LH + 4;
  }

  /** Surface level of the tile at integer (x, y); ZBASE off the map. */
  zt(x: number, y: number): number {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? ZBASE : this.z[y * this.w + x];
  }

  /** Surface level under a fractional tile point. */
  zAt(x: number, y: number): number {
    return this.zt(Math.floor(x), Math.floor(y));
  }

  /**
   * Level a unit is drawn at: its tile's level, eased toward a neighbour one level up or down (a
   * walkable step) over the half tile next to the shared edge, so a man walking a slope rises
   * smoothly and meets the neighbour's value halfway up the riser. Cliffs and water stay hard.
   */
  zDraw(x: number, y: number): number {
    const tx = Math.floor(x), ty = Math.floor(y), z = this.zt(tx, ty);
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h || this.z[ty * this.w + tx] % 1) return z;
    const fx = x - tx - 0.5, fy = y - ty - 0.5;
    const ease = (nx: number, ny: number, f: number) => {
      const n = this.zt(nx, ny), d = n - z;
      return d !== 0 && Math.abs(d) <= 1 && n % 1 === 0 ? d * Math.abs(f) : 0;
    };
    return z + ease(tx + Math.sign(fx), ty, fx) + ease(tx, ty + Math.sign(fy), fy);
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
    for (let z = ZMAX; z >= ZBASE; z -= 0.125) {
      const v = (wy - this.OY + z * LH) / HH, x = (u + v) / 2, y = (v - u) / 2;
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      if (this.z[Math.floor(y) * this.w + Math.floor(x)] >= z - 1e-4) return { x, y };
    }
    const v = (wy - this.OY) / HH;
    return { x: Math.max(0, Math.min(this.w - 0.01, (u + v) / 2)), y: Math.max(0, Math.min(this.h - 0.01, (v - u) / 2)) };
  }

  /** Is the world point (wx, wy), standing at x + y = v0 and level z0, hidden by ground in front of it? */
  hidden(wx: number, wy: number, v0: number, z0: number): boolean {
    const u = (wx - this.OX) / HW;
    for (let z = ZMAX; z > z0; z -= 0.25) {
      const v = (wy - this.OY + z * LH) / HH;
      if (v <= v0 + 0.5) return false;
      const x = Math.floor((u + v) / 2), y = Math.floor((v - u) / 2);
      if (x >= 0 && y >= 0 && x < this.w && y < this.h && this.z[y * this.w + x] >= z) return true;
    }
    return false;
  }
}
