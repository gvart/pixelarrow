/**
 * True-isometric projection of a region with raised height (W-16). The sim stays in tile
 * coordinates; this maps tiles to world pixels and back.
 *
 *   world.x = OX + (x - y) * HW
 *   world.y = OY + (x + y) * HH - z * LH      z: the tile's surface level (height, water lower)
 *
 * 2:1 diamonds (HW = 2 * HH) and one height level lifts a tile by LH = HH, so a screen pixel's
 * view ray steps one level up for every unit of x + y toward the viewer: picking marches down
 * that ray from the highest level and takes the first solid column it meets.
 */
import type { RegionData } from '../types';

export const HW = 16;
export const HH = 8;
export const LH = 8;
export const ZMAX = 7;
/** The slab's underside: walls along the map edge drop to this level. */
export const ZBASE = -1.5;
const DEEP_DROP = 0.55, SHALLOW_DROP = 0.3;

export class IsoMap {
  readonly w: number;
  readonly h: number;
  /** Surface level per tile: height, minus a drop for water (deep lower than a ford). */
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
    for (let i = 0; i < this.z.length; i++) this.z[i] = r.height[i] - (r.water[i] === 2 ? DEEP_DROP : r.water[i] === 1 ? SHALLOW_DROP : 0);
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
