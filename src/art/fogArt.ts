/**
 * Fog of war for the overland map, drawn as parchment clouds (ART_STYLE §5,
 * §12): cream with horizontal 1 px streaks, jagged stair-stepped edges, a
 * sparse checker dither where the cloud thins, and a lavender shadow cast on
 * the revealed land/sea below its lower edge.
 *
 * The painter works on square chunks so the scene only re-uploads what
 * changed; `vis` (0 = fog .. 1 = clear, per tile) animates for the dissolve.
 */
import { hash2, valueNoise } from './pixels';
import { MAPC } from './worldArt';

export const FOG_CHUNK = 128;

export class FogPainter {
  readonly W: number;
  readonly H: number;
  /** Per-pixel edge noise (stair-stepped), precomputed. */
  private noise: Float32Array;
  /** Softened per-tile visibility (3x3 average of vis). */
  private soft: Float32Array;
  private buf = new Float32Array((FOG_CHUNK + 3) * (FOG_CHUNK + 10));

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
      const jog = (hash2(yq, 3, seed) - 0.5) * 0.18;
      for (let x = 0; x < this.W; x++) {
        const n = valueNoise(x / 4, yq, 3, seed + 1) * 0.35 + valueNoise(x, y, 18, seed + 2) * 0.35 + valueNoise(x, y, 48, seed + 4) * 0.3;
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
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
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
    return 0.5 - (v * 1.35 - 0.12 + (this.noise[y * this.W + x] - 0.5) * 1.25);
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
    // density with a margin (3 left, 8 above, 2 below), computed once
    const BW = C + 3;
    const BH = C + 10;
    const buf = this.buf;
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) buf[y * BW + x] = this.dens(x0 + x - 3, y0 + y - 8);
    const dd = (X: number, Y: number) => buf[(Y - y0 + 8) * BW + (X - x0 + 3)];
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
          const st = hash2(Math.floor((X + Math.floor(hash2(Y, 1, 9) * 9)) / 7), Y, 5);
          if (st > 0.82) c = P[3];
          else if (st < 0.1) c = P[2];
          if (d < 0.05) c = (X + Y) % 2 === 0 ? 0xe9cfc0 : P[3]; // thin edge: checker dither
          else if (dd(X, Y + 1) <= 0 || dd(X, Y + 2) <= 0) c = 0xe4c8bc; // shaded underside
          else if (dd(X, Y - 1) <= 0) c = 0xfff0e0; // lit top rim
          put(i, c, 255);
          continue;
        }
        // clear: a lavender shadow under a cloud's lower edge (cast down and right)
        if (dd(X - 3, Y - 8) > 0 || dd(X - 1, Y - 3) > 0) {
          const deep = dd(X - 1, Y - 3) > 0;
          put(i, MAPC.cloudShadow, deep ? 165 : (X + Y) % 2 === 0 ? 135 : 95);
          continue;
        }
        out[i + 3] = 0;
      }
    }
  }
}
