/** Minimal RGBA pixel buffer with drawing helpers. Independent of Phaser. */
export class Pix {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8ClampedArray;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  set(x: number, y: number, c: number, a = 255): void {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.inside(x, y)) return;
    const i = (y * this.w + x) * 4;
    if (a >= 255) {
      this.data[i] = (c >> 16) & 255;
      this.data[i + 1] = (c >> 8) & 255;
      this.data[i + 2] = c & 255;
      this.data[i + 3] = 255;
    } else {
      // alpha blend over
      const sa = a / 255;
      const da = this.data[i + 3] / 255;
      const oa = sa + da * (1 - sa);
      if (oa <= 0) return;
      const blend = (s: number, d: number) => (s * sa + d * da * (1 - sa)) / oa;
      this.data[i] = blend((c >> 16) & 255, this.data[i]);
      this.data[i + 1] = blend((c >> 8) & 255, this.data[i + 1]);
      this.data[i + 2] = blend(c & 255, this.data[i + 2]);
      this.data[i + 3] = oa * 255;
    }
  }

  alpha(x: number, y: number): number {
    if (!this.inside(x, y)) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }

  get(x: number, y: number): number {
    const i = (y * this.w + x) * 4;
    return (this.data[i] << 16) | (this.data[i + 1] << 8) | this.data[i + 2];
  }

  clear(x: number, y: number): void {
    if (!this.inside(x, y)) return;
    this.data[(y * this.w + x) * 4 + 3] = 0;
  }

  rect(x: number, y: number, w: number, h: number, c: number, a = 255): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a);
  }

  hline(x0: number, x1: number, y: number, c: number): void {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c);
  }

  vline(x: number, y0: number, y1: number, c: number): void {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c);
  }

  /** Bresenham line; optional colour function by step index for shading. */
  line(x0: number, y0: number, x1: number, y1: number, c: number | ((i: number, n: number) => number)): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const n = Math.max(dx, -dy);
    let i = 0;
    for (;;) {
      this.set(x0, y0, typeof c === 'number' ? c : c(i, n));
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
      i++;
    }
  }

  /** Filled ellipse inside the box (x, y, w, h). Calls fn for each pixel for shading. */
  ellipse(x: number, y: number, w: number, h: number, fn: (px: number, py: number, edge: boolean, u: number, v: number) => number | null): void {
    const cx = x + (w - 1) / 2;
    const cy = y + (h - 1) / 2;
    const rx = w / 2;
    const ry = h / 2;
    const inside = (px: number, py: number) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1.0;
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        if (!inside(px, py)) continue;
        const edge = !inside(px - 1, py) || !inside(px + 1, py) || !inside(px, py - 1) || !inside(px, py + 1);
        const c = fn(px, py, edge, (px - cx) / rx, (py - cy) / ry);
        if (c !== null) this.set(px, py, c);
      }
    }
  }

  /** Draw a bitmap given as rows of chars; map chars to colours (missing = transparent). */
  bitmap(x: number, y: number, rows: string[], map: Record<string, number>, flip = false): void {
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j];
      for (let i = 0; i < r.length; i++) {
        const c = map[r[i]];
        if (c === undefined) continue;
        this.set(flip ? x + r.length - 1 - i : x + i, y + j, c);
      }
    }
  }

  /** Add a 1px outline around opaque pixels (4-neighbourhood). */
  outline(c: number, region?: { x: number; y: number; w: number; h: number }): void {
    const x0 = region?.x ?? 0;
    const y0 = region?.y ?? 0;
    const x1 = x0 + (region?.w ?? this.w);
    const y1 = y0 + (region?.h ?? this.h);
    const marks: number[] = [];
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (this.alpha(x, y) > 0) continue;
        const n =
          (x > x0 && this.alpha(x - 1, y) > 128) ||
          (x < x1 - 1 && this.alpha(x + 1, y) > 128) ||
          (y > y0 && this.alpha(x, y - 1) > 128) ||
          (y < y1 - 1 && this.alpha(x, y + 1) > 128);
        if (n) marks.push(x, y);
      }
    }
    for (let i = 0; i < marks.length; i += 2) this.set(marks[i], marks[i + 1], c);
  }

  /** Copy another buffer onto this one at (dx, dy), optionally mirrored, only opaque pixels. */
  blit(src: Pix, dx: number, dy: number, flip = false, sx = 0, sy = 0, sw = src.w, sh = src.h): void {
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const xx = sx + (flip ? sw - 1 - x : x);
        const a = src.alpha(xx, sy + y);
        if (a === 0) continue;
        this.set(dx + x, dy + y, src.get(xx, sy + y), a);
      }
    }
  }

  toCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    img.data.set(this.data);
    ctx.putImageData(img, 0, 0);
    return c;
  }
}

/** Deterministic hash noise in [0,1) for art (not used by the simulation). */
export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function valueNoise(x: number, y: number, scale: number, seed = 0): number {
  const fx = x / scale;
  const fy = y / scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  const u = s(tx);
  const v = s(ty);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((r) => r.map((v) => (v + 0.5) / 16));
