/**
 * Fog of war for the overland map, drawn as parchment clouds (ART_STYLE §5,
 * §12, and the war map's fog in src/art/parchmentMap.ts): cream paper with a
 * handwritten scribble texture, edges torn in long horizontal rags that
 * stair-step on two-pixel rows, a lit rim on top and a shaded underside, a
 * lavender shadow cast down and right onto the revealed land and sea below,
 * and loose puffs drifting just off the boundary.
 *
 * The painter works on square chunks so the scene only re-uploads what
 * changed; `vis` (0 = fog .. 1 = clear, per tile) animates for the dissolve.
 */
import { hash2, valueNoise } from './pixels';
import { MP } from './mapProps';
import { mix } from './palette';
import { MAPC } from './worldArt';

export const FOG_CHUNK = 128;

const MX = 4;
const MY = 9;

export class FogPainter {
  readonly W: number;
  readonly H: number;
  /** Per-pixel edge noise (stair-stepped on two-pixel rows, stretched sideways), precomputed. */
  private noise: Float32Array;
  /** Softened per-tile visibility (3x3 average of vis). */
  private soft: Float32Array;
  private buf = new Float32Array((FOG_CHUNK + 2 * MX) * (FOG_CHUNK + 2 * MY));

  constructor(
    readonly tw: number,
    readonly th: number,
    readonly tile: number,
    readonly vis: Float32Array,
    seed: number,
  ) {
    this.W = tw * tile;
    this.H = th * tile;
    this.noise = new Float32Array(this.W * this.H);
    for (let y = 0; y < this.H; y++) {
      const yq = y >> 1; // two-pixel rows: horizontal stair steps
      const jog = (hash2(yq, 3, seed) - 0.5) * 0.2 + (valueNoise(0, yq, 7, seed + 5) - 0.5) * 0.3;
      for (let x = 0; x < this.W; x++) {
        const n = valueNoise(x / 3.5, yq, 4, seed + 1) * 0.35 + valueNoise(x, yq * 2, 16, seed + 2) * 0.3 + valueNoise(x, y, 44, seed + 4) * 0.35;
        this.noise[y * this.W + x] = n + jog;
      }
    }
    this.soft = new Float32Array(tw * th);
    this.soften(0, 0, tw - 1, th - 1);
  }

  /** Recompute the softened field for a tile rectangle (inclusive). */
  soften(x0: number, y0: number, x1: number, y1: number): void {
    const { tw, th, vis } = this;
    for (let y = Math.max(0, y0); y <= Math.min(th - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(tw - 1, x1); x++) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            const w = dx === 0 && dy === 0 ? 2 : 1;
            s += (xx < 0 || yy < 0 || xx >= tw || yy >= th ? 0 : vis[yy * tw + xx]) * w;
            n += w;
          }
        this.soft[y * tw + x] = s / n;
      }
    }
  }

  /** Cloud density at pixel (x, y): > 0 = fog. */
  private dens(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return 1;
    const { tw, th, tile } = this;
    const fx = x / tile - 0.5;
    const fy = y / tile - 0.5;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const g = (a: number, b: number) => (a < 0 || b < 0 || a >= tw || b >= th ? 0 : this.soft[b * tw + a]);
    const v = (g(ix, iy) * (1 - tx) + g(ix + 1, iy) * tx) * (1 - ty) + (g(ix, iy + 1) * (1 - tx) + g(ix + 1, iy + 1) * tx) * ty;
    return 0.5 - (v * 1.35 - 0.12 + (this.noise[y * this.W + x] - 0.5) * 1.35);
  }

  /** Paint one chunk (cx, cy) into RGBA `out` (FOG_CHUNK^2 * 4). */
  paint(cx: number, cy: number, out: Uint8ClampedArray): void {
    const C = FOG_CHUNK;
    const x0 = cx * C;
    const y0 = cy * C;
    const P = MAPC.parch;
    const put = (i: number, c: number, a: number) => {
      out[i] = (c >> 16) & 255;
      out[i + 1] = (c >> 8) & 255;
      out[i + 2] = c & 255;
      out[i + 3] = a;
    };
    // density with a margin, computed once
    const BW = C + 2 * MX;
    const BH = C + 2 * MY;
    const buf = this.buf;
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) buf[y * BW + x] = this.dens(x0 + x - MX, y0 + y - MY);
    const dd = (X: number, Y: number) => buf[(Y - y0 + MY) * BW + (X - x0 + MX)];
    // short wavy dashes: a slot of 14 px per row holds one now and then, its middle lifted a row
    const dashAt = (X: number, r: number, lift: boolean): boolean => {
      const q = X + Math.floor(hash2(r, 3, 71) * 40);
      const slot = Math.floor(q / 14);
      const pos = q - slot * 14;
      const h = hash2(slot, r, 72);
      if (h > 0.09) return false;
      const len = 4 + Math.floor(h * 70);
      if (pos < 1 || pos >= 1 + len) return false;
      const mid = pos >= 3 && pos < len - 1;
      return lift ? mid : !mid;
    };
    for (let y = 0; y < C; y++) {
      const Y = y0 + y;
      for (let x = 0; x < C; x++) {
        const X = x0 + x;
        const i = (y * C + x) * 4;
        if (X >= this.W || Y >= this.H) {
          put(i, P[0], 255);
          continue;
        }
        const d = dd(X, Y);
        if (d > 0) {
          // inside the cloud
          let c = P[0];
          if (dashAt(X, Y, false) || dashAt(X, Y + 1, true)) c = hash2(X >> 3, Y, 73) < 0.3 ? MP.parchDot : MP.parchLo;
          else if (hash2(X, Y, 76) < 0.012) c = MP.parchHi;
          const pu = valueNoise(X / 3, Y >> 1, 11, 74) > 0.57;
          if (pu && valueNoise(X / 3, (Y + 2) >> 1, 11, 74) <= 0.57) c = MP.parchRim;
          else if (!pu && valueNoise(X / 3, (Y - 2) >> 1, 11, 74) > 0.57) c = (X + Y) % 2 === 0 ? MP.parchDot : MP.parchLo;
          if (d < 0.05) c = (X + Y) % 2 === 0 ? 0xe9cfc0 : P[3]; // thin edge: checker dither
          else if (dd(X, Y + 1) <= 0 || dd(X, Y + 2) <= 0) c = MP.parchRim; // shaded underside
          else if (dd(X, Y - 1) <= 0 || dd(X - 1, Y) <= 0) c = 0xfff0e0; // lit top rim
          put(i, c, 255);
          continue;
        }
        // clear: a lavender shadow band under a cloud's lower edge (cast down and right), dithered out
        let sh = 0;
        if (dd(X, Y - 1) > 0 || dd(X - 1, Y - 2) > 0 || dd(X - 2, Y - 3) > 0 || dd(X - 1, Y) > 0 || dd(X - 2, Y) > 0) sh = 2;
        else if (dd(X - 2, Y - 4) > 0 || dd(X - 3, Y - 5) > 0 || dd(X - 3, Y - 6) > 0 || dd(X - 3, Y) > 0) sh = 1;
        if (sh) {
          put(i, sh === 2 ? MAPC.cloudShadow : (X + Y) % 2 === 0 ? MAPC.cloudShadow : mix(MAPC.cloudShadow, 0xffffff, 0.3), sh === 2 ? 150 : (X + Y) % 2 === 0 ? 120 : 70);
          continue;
        }
        // loose puffs just off the torn edge
        const gx = Math.floor(X / 11);
        const gy = Math.floor(Y / 5);
        let drawn = false;
        for (let oy = -1; oy <= 1 && !drawn; oy++)
          for (let ox = -2; ox <= 1 && !drawn; ox++) {
            const px = gx + ox;
            const py = gy + oy;
            const h = hash2(px, py, 77);
            if (h > 0.42) continue;
            const ccx = px * 11 + Math.floor(hash2(px, py, 78) * 11);
            const ccy = py * 5 + Math.floor(hash2(px, py, 79) * 5);
            const rx = 3 + Math.floor(h * 14);
            const ry = 1 + Math.floor(hash2(px, py, 80) * 2);
            const inside = ((X - ccx) / (rx + 0.5)) ** 2 + ((Y - ccy) / (ry + 0.5)) ** 2 <= 1;
            const under = ((X - ccx - 2) / (rx + 0.5)) ** 2 + ((Y - ccy - 3) / (ry + 0.5)) ** 2 <= 1;
            if (!inside && !under) continue;
            if (ccx - x0 < -MX || ccx - x0 >= C + MX || ccy - y0 < -MY + 5 || ccy - y0 >= C + MY - 3) continue;
            if (dd(ccx, ccy - 4) <= 0 || dd(ccx, ccy + 2) > 0 || dd(ccx - 6, ccy + 1) > 0 || dd(ccx + 6, ccy + 1) > 0) continue;
            if (inside) put(i, Y === ccy - ry ? 0xfff0e0 : Y >= ccy + ry ? MP.parchRim : P[0], 255);
            else put(i, MAPC.cloudShadow, (X + Y) % 2 === 0 ? 130 : 80);
            drawn = true;
          }
        if (!drawn) out[i + 3] = 0;
      }
    }
  }
}
