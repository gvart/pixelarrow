/**
 * Offline region authoring helpers (deterministic, no runtime use): smooth value noise,
 * Catmull-Rom curves sampled by arc length, and distance fields for curves and noisy blobs.
 * Features are hand-placed with these; the noise only roughens their edges.
 */

export type Pt = [number, number];

/** Integer hash to [0, 1). */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 2D value noise in [-1, 1]. */
export function noise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return 2 * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) - 1;
}

/** Two octaves of noise at feature scale `scale` (tiles), in about [-1, 1]. */
export function fbm(x: number, y: number, scale: number, seed: number): number {
  return (noise(x / scale, y / scale, seed) * 2 + noise((2 * x) / scale, (2 * y) / scale, seed + 1)) / 3;
}

export interface Sample {
  x: number;
  y: number;
  s: number; // arc length from the first point
  tx: number; // unit tangent
  ty: number;
}

/** Catmull-Rom spline through the points, sampled every `step` tiles of arc length (about). */
export function spline(pts: Pt[], step = 0.5): Sample[] {
  const p = [pts[0], ...pts, pts[pts.length - 1]];
  const raw: Pt[] = [];
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / (step / 2)));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      raw.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  raw.push(pts[pts.length - 1]);
  const out: Sample[] = [];
  let s = 0;
  for (let i = 0; i < raw.length; i++) {
    if (i > 0) s += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
    const a = raw[Math.max(0, i - 1)];
    const b = raw[Math.min(raw.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    out.push({ x: raw[i][0], y: raw[i][1], s, tx: (b[0] - a[0]) / len, ty: (b[1] - a[1]) / len });
  }
  return out;
}

/** The sample nearest to (x, y). */
export function nearestSample(c: Sample[], x: number, y: number): Sample {
  let best = c[0];
  let bd = Infinity;
  for (const p of c) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) (bd = d), (best = p);
  }
  return best;
}

export interface CurveField {
  d: Float32Array; // distance from the tile centre to the curve (Infinity beyond reach)
  s: Float32Array; // arc length of the nearest sample
  side: Int8Array; // -1 left of the direction of travel, +1 right (y grows down)
}

/**
 * Distance field of a sampled curve over a w x h tile map, out to `reach`. The curve, the distances
 * and arc lengths are in authoring units; a tile is 1/k of a unit (tile x has its centre at (x + 0.5) / k).
 */
export function curveField(c: Sample[], w: number, h: number, reach: number, k = 1): CurveField {
  const d = new Float32Array(w * h).fill(Infinity);
  const s = new Float32Array(w * h);
  const side = new Int8Array(w * h);
  for (const p of c) {
    for (let y = Math.max(0, Math.floor((p.y - reach) * k)); y <= Math.min(h - 1, Math.ceil((p.y + reach) * k)); y++)
      for (let x = Math.max(0, Math.floor((p.x - reach) * k)); x <= Math.min(w - 1, Math.ceil((p.x + reach) * k)); x++) {
        const dx = (x + 0.5) / k - p.x;
        const dy = (y + 0.5) / k - p.y;
        const dist = Math.hypot(dx, dy);
        const i = y * w + x;
        if (dist >= d[i] || dist > reach) continue;
        d[i] = dist;
        s[i] = p.s;
        side[i] = p.tx * dy - p.ty * dx >= 0 ? 1 : -1;
      }
  }
  return { d, s, side };
}

/**
 * Inside depth of a noisy rotated ellipse at tile (x, y): positive inside (tiles to the rim,
 * roughly), negative outside. `rough` is the edge noise amplitude in tiles.
 */
export function blob(x: number, y: number, cx: number, cy: number, rx: number, ry: number, rot: number, rough: number, seed: number): number {
  const dx = x + 0.5 - cx;
  const dy = y + 0.5 - cy;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const u = (dx * c + dy * s) / rx;
  const v = (-dx * s + dy * c) / ry;
  return (1 - Math.hypot(u, v)) * Math.min(rx, ry) + rough * fbm(x, y, 8, seed);
}
