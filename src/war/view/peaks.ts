/**
 * Mountain ranges drawn as procedural peaks (the default; ?mountains=massifs: the massif sprites of ./massifs.ts). The
 * impassable rock of the mountains biome is drawn flat at its foot height (./iso.ts), and over it a height field of
 * visual-only levels rises (the sim never sees it): ridged noise swelling with the distance from the range's edge, so
 * crests run through the range with peaks where they meet, a gentle scree foot and steep upper faces.
 *
 * The field lives on the tile lattice ((w + 1) x (h + 1) points), each tile a quad split along its W-E diagonal as the
 * ramps are (./iso.ts zAt). ./art.ts paints the quads back to front with the ground rows: each triangle one flat colour
 * from its material's ramp by the NW light (lit NW faces, dark SE faces), snow above the biome's snowline (none in a
 * desert region: red rock there), scree at the foot, a speckle texture over all and light crest lines along the ridges.
 * IsoMap.zSurf includes the field, so picking and the units' occlusion see the peaks as they see cliffs.
 */
import type { RegionData } from '../types';
import { decodeBiomes } from '../regions/visual';
import { hash } from './autotile';
import { noise } from './relief';
import { peakTexture } from './rockFace';
import { BUILDINGS } from '../sim/economy';

export interface PeakField {
  w: number;
  h: number;
  /** Per lattice point ((w + 1) x (h + 1)): visual levels above the ground. */
  P: Float32Array;
  /** Per lattice point: the surface level (ground + P). */
  S: Float32Array;
  /** Highest surface level. */
  top: number;
  /** Per tile: its snowline in levels above the ground (Infinity: none), and 1 = red rock. */
  snow: Float32Array;
  red: Uint8Array;
}

/** Tallest peak, in visual levels (1 m each) above the foot. */
const HMAX = 150;
/** Tallest red rock dome, levels. */
const REDMAX = 30;
/** Snowline per biome, levels above the foot (absent: no snow). */
const SNOWLINE: Record<string, number> = { mountains: 88, global: 92, dodona: 90, elaia: 104 };

const ridged = (x: number, y: number, s: number, k: number) => 1 - Math.min(1, Math.abs(noise(x, y, s, k)));

/** Two-pass chamfer distance (1, 1.4) on the lattice from the points where `src` holds, capped. */
function chamfer(W: number, H: number, src: (X: number, Y: number) => boolean, cap: number): Float32Array {
  const d = new Float32Array(W * H);
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) d[Y * W + X] = src(X, Y) ? 0 : cap;
  const D = 1.4;
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    const i = Y * W + X;
    let v = d[i];
    if (X > 0) v = Math.min(v, d[i - 1] + 1);
    if (Y > 0) { v = Math.min(v, d[i - W] + 1); if (X > 0) v = Math.min(v, d[i - W - 1] + D); if (X < W - 1) v = Math.min(v, d[i - W + 1] + D); }
    d[i] = v;
  }
  for (let Y = H - 1; Y >= 0; Y--) for (let X = W - 1; X >= 0; X--) {
    const i = Y * W + X;
    let v = d[i];
    if (X < W - 1) v = Math.min(v, d[i + 1] + 1);
    if (Y < H - 1) { v = Math.min(v, d[i + W] + 1); if (X < W - 1) v = Math.min(v, d[i + W + 1] + D); if (X > 0) v = Math.min(v, d[i + W - 1] + D); }
    d[i] = v;
  }
  return d;
}

/**
 * Per tile: the foot level of a place the player needs in sight (Infinity: none): pre-built pieces (their footprint and a
 * tile round), spots (claim points, lairs, guardian posts, market courts and yards), roads. Visual only.
 */
export function keepFeet(r: RegionData, ground: (x: number, y: number) => number): Float32Array {
  const { w, h } = r, T = new Float32Array(w * h).fill(Infinity);
  // a tile's foot: its lowest corner
  const foot = (x: number, y: number) => Math.min(ground(x, y), ground(x + 1, y), ground(x, y + 1), ground(x + 1, y + 1));
  const put = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(h - 1, Math.floor(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(w - 1, Math.floor(x1)); x++) {
      T[y * w + x] = Math.min(T[y * w + x], foot(x, y));
    }
  };
  for (const p of r.prebuilt ?? []) {
    if (p.tiles?.length) for (const t of p.tiles) put((t % w) - 1, ((t / w) | 0) - 1, (t % w) + 1, ((t / w) | 0) + 1);
    else { const d = BUILDINGS[p.type], hw = (p.rot ? d.h : d.w) / 2 + 1, hh = (p.rot ? d.w : d.h) / 2 + 1; put(p.x - hw, p.y - hh, p.x + hw, p.y + hh); }
  }
  for (const s of [...(r.claimPoints ?? []), ...(r.lairs ?? []), ...(r.guardians ?? [])]) put(s.x - 3, s.y - 3, s.x + 3, s.y + 3);
  for (const q of [...(r.safe ?? []), ...(r.yard ?? [])]) put(q.x, q.y, q.x + q.w - 1, q.y + q.h - 1);
  for (let i = 0; i < w * h; i++) if (r.terrain[i] === 'road') T[i] = Math.min(T[i], foot(i % w, (i / w) | 0));
  return T;
}

/**
 * Per lattice point: the highest surface level the peaks may reach there without hiding a kept tile behind it
 * (keepFeet). A tile's centre stands (v - v') / 2 levels' worth of screen above a point v' = X + Y rows in front of it
 * (a level 32 px, a row 16 px): the tiles W and E of the point (same row) cap it at their foot, the tile N of it at its
 * foot + 1/2, those a column aside at + 1; each step back along its screen column adds a level. A quarter level spare.
 */
export function peakCap(w: number, h: number, T: Float32Array): Float32Array {
  const W = w + 1, C = new Float32Array(W * (h + 1)).fill(Infinity);
  const t = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? Infinity : T[y * w + x]);
  for (let Y = 0; Y <= h; Y++) for (let X = 0; X <= w; X++) {
    const k = Math.min(t(X - 1, Y), t(X, Y - 1), t(X - 1, Y - 1) + 0.5, t(X - 2, Y - 1) + 1, t(X - 1, Y - 2) + 1) - 0.25;
    C[Y * W + X] = X && Y ? Math.min(k, C[(Y - 1) * W + X - 1] + 1) : k;
  }
  return C;
}

/**
 * The peak field over `mask` (per tile 1 = mountain rock drawn flat), `ground(X, Y)` the flat ground's level at a lattice
 * point. Null when nothing rises. The peaks rise only over the mask's impassable rock, never over a kept tile (keepFeet:
 * pre-built pieces, spots, roads), and never so high that they hide one behind them.
 */
export function peakField(r: RegionData, mask: Uint8Array, ground: (X: number, Y: number) => number): PeakField {
  const { w, h } = r, W = w + 1, H = h + 1;
  const T = keepFeet(r, ground), cap = peakCap(w, h, T);
  // a lattice point is inside when all four tiles round it are mountain; past the back edges the range runs on, the
  // front edges (toward the viewer) close it a few tiles in (the slab's cut face stays low)
  const m = (x: number, y: number) => (x >= w || y >= h ? 0 : mask[Math.max(0, y) * w + Math.max(0, x)] && T[Math.max(0, y) * w + Math.max(0, x)] === Infinity ? 1 : 0);
  const inside = (X: number, Y: number) => m(X - 1, Y - 1) && m(X, Y - 1) && m(X - 1, Y) && m(X, Y);
  const d = chamfer(W, H, (X, Y) => !inside(X, Y), 160);
  // material per tile: the biome's snowline; a desert region's (mostly kyrene) mountains are red rock without snow
  const snow = new Float32Array(w * h).fill(Infinity), red = new Uint8Array(w * h);
  if (r.biomes) {
    const b = decodeBiomes(r.biomes.rle, w * h), cnt = new Map<string, number>();
    for (let i = 0; i < b.length; i++) { const nm = r.biomes.names[b[i]]; if (nm !== 'mountains') cnt.set(nm, (cnt.get(nm) ?? 0) + 1); }
    let dom = 'global', best = -1;
    for (const [nm, c] of cnt) if (c > best) { dom = nm; best = c; }
    for (let i = 0; i < b.length; i++) {
      const nm = r.biomes.names[b[i]], desert = nm === 'kyrene' || (nm === 'mountains' && dom === 'kyrene');
      if (desert) red[i] = 1;
      else snow[i] = SNOWLINE[nm] ?? SNOWLINE.global;
    }
  } else snow.fill(SNOWLINE.global);
  const P = new Float32Array(W * H), S = new Float32Array(W * H);
  let top = 0;
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    const i = Y * W + X, e = d[i];
    let p = 0;
    if (e > 0) {
      const r1 = ridged(X, Y, 46, 21) ** 2, r2 = ridged(X + 31, Y - 17, 17, 22) ** 2, r3 = ridged(X, Y, 7, 23);
      const R = 0.62 * r1 + 0.28 * r1 * r2 + 0.1 * r3 * (0.4 + 0.6 * r1);
      const env = HMAX * (1 - Math.exp(-e / 20));
      p = Math.min(env * (0.22 + 0.78 * R), 1.1 * e ** 1.5);
      // red rock (the desert's kopjes and inselbergs): rounded domes of stacked boulders, not spires
      if (red[Math.min(h - 1, Y) * w + Math.min(w - 1, X)]) p = Math.min(REDMAX * (1 - Math.exp(-e / 5)) * (0.75 + 0.25 * ridged(X, Y, 9, 24)), 2.4 * e);
      p = Math.max(0, Math.min(p, cap[i] - ground(X, Y)));
    }
    P[i] = p;
    S[i] = ground(X, Y) + p;
    if (S[i] > top) top = S[i];
  }
  return { w, h, P, S, top, snow, red };
}

/** The cut-away peaks (the V key, a see-through hole): each lowered to a stub of rock this many levels tall at most. */
export const STUB = 1.5;

/** The field with every peak lowered to its STUB (the flat foot rock with a low stub over it). */
export function stubField(f: PeakField): PeakField {
  const P = f.P.map((p) => Math.min(p, STUB)), S = f.S.map((s, i) => s - f.P[i] + P[i]);
  let top = 0;
  for (const v of S) if (v > top) top = v;
  return { ...f, P, S, top };
}

/** Peak levels at a fractional tile point (the quad's two triangles, as IsoMap.zAt splits a ramp). */
export function peakAt(f: PeakField, x: number, y: number): number {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= f.w || cy >= f.h) return 0;
  const W = f.w + 1, k = cy * W + cx, P = f.P, a = x - cx, b = y - cy;
  const n = P[k], e = P[k + 1], s = P[k + W + 1], wv = P[k + W];
  if (n === 0 && e === 0 && s === 0 && wv === 0) return 0;
  return a + b <= 1 ? n + a * (e - n) + b * (wv - n) : s + (1 - a) * (wv - s) + (1 - b) * (e - s);
}

/** Shades per material ramp. */
const NSH = 8;
/** Material ramps, dark to light: rock, snow, scree, red rock, red scree. */
const RAMPS = [
  ['#2c2e36', '#3b3e47', '#4d505a', '#62656e', '#7a7c83', '#94959a', '#aeaeae', '#c6c4bd'],
  ['#5a6478', '#6e798f', '#8691a7', '#a1abbf', '#bcc5d5', '#d5dce6', '#e9edf2', '#f8f9fb'],
  ['#2e2b27', '#3c3832', '#4b463e', '#5b554b', '#6c655a', '#7e776a', '#91897a', '#a39b8b'],
  ['#2e1712', '#43211a', '#5b2d21', '#763b29', '#904b31', '#a85d3b', '#c0744a', '#d4905f'],
  ['#3a261b', '#4c3224', '#5f3f2d', '#734d37', '#875c42', '#9a6c4f', '#ad7e5f', '#bf9171'],
];
const FILL = RAMPS.flat();
/** Contour slope buckets each side of level (./rockFace.ts peakTexture sheared by bucket / SLOPES). */
const SLOPES = 4;
/** The rock-mark patterns per material and slope bucket. */
const MARKS: Record<number, CanvasPattern> = {};
/** Crest line colour per material. */
const CREST = ['rgba(196,190,178,0.55)', 'rgba(255,255,255,0.8)', 'rgba(190,182,166,0.4)', 'rgba(236,170,120,0.55)', 'rgba(220,172,136,0.4)'];
// toward the light: from the NW (-x, a little -y) and above
const LX = -1, LY = -0.35, LZ = 1.05, LN = Math.hypot(LX, LY, LZ);

/** Per triangle: its fill index (material * NSH + shade). */
function shadeOf(nx: number, ny: number, nz: number, mat: number, h: number, soft = false): number {
  const l = Math.max(0, (nx * LX + ny * LY + nz * LZ) / (Math.hypot(nx, ny, nz) * LN));
  // flat ground l ~0.72; steep NW faces near 1, SE faces to 0
  let b = 0.12 + 0.98 * l + ((h & 255) / 255 - 0.5) * (soft ? 0.04 : 0.1);
  // near, snow keeps a narrower range: one soft drift, its facets left to the ripples over it
  if (soft && mat === 1) b = 0.62 + (b - 0.62) * 0.55;
  return mat * NSH + Math.max(0, Math.min(NSH - 1, Math.floor(b * NSH)));
}

let speckle: HTMLCanvasElement | null = null;
/** A 64 px speckle and strata texture (rgba over the flat fills), made once. */
function speckleTile(): HTMLCanvasElement {
  if (speckle) return speckle;
  const c = (speckle = document.createElement('canvas')), N = 64;
  c.width = N; c.height = N;
  const g = c.getContext('2d')!, img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const h = hash(x, y, 41), o = (y * N + x) * 4, strata = Math.sin((y + ((x * 0.5) % N)) * 0.7 + Math.sin(x * 0.2) * 1.5) > 0.82;
    const v = h & 255;
    if (strata || v < 40) { img.data[o] = 8; img.data[o + 1] = 8; img.data[o + 2] = 14; img.data[o + 3] = strata ? 40 : 28 + (v & 15); }
    else if (v > 226) { img.data[o] = 255; img.data[o + 1] = 246; img.data[o + 2] = 226; img.data[o + 3] = 30; }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * Paints the peak quads of one tile row at a time (./art.ts calls it after the ground cells of the row's front edge).
 * Per tile with any peak: two fill indices (upper N-E-W, lower E-S-W), and its crest edges (bit 1: N-E, bit 2: N-W).
 */
export class PeakPainter {
  /** Tiles with peaks, by row x + y. */
  private rows: number[][];
  private fill: Uint8Array;
  /** Per triangle near: its fill shaded by normals smoothed over the lattice, so the facets melt into one painted face. */
  private soft: Uint8Array;
  private crest: Uint8Array;
  private mat: Uint8Array;
  /** Per triangle: the screen slope bucket of its contour lines (0..2 * SLOPES), the shear of its rock marks. */
  private slope: Uint8Array;
  private pattern: CanvasPattern | null = null;

  constructor(readonly f: PeakField, private OX: number, private OY: number) {
    const { w, h, P, S } = f, W = w + 1;
    this.rows = Array.from({ length: w + h - 1 }, () => []);
    this.fill = new Uint8Array(2 * w * h);
    this.soft = new Uint8Array(2 * w * h);
    // per lattice point: the surface's slope (levels per tile) by central differences
    const GX = new Float32Array(W * (h + 1)), GY = new Float32Array(W * (h + 1));
    for (let Y = 0; Y <= h; Y++) for (let X = 0; X <= w; X++) {
      const k = Y * W + X;
      GX[k] = (S[Y * W + Math.min(w, X + 1)] - S[Y * W + Math.max(0, X - 1)]) / (Math.min(w, X + 1) - Math.max(0, X - 1));
      GY[k] = (S[Math.min(h, Y + 1) * W + X] - S[Math.max(0, Y - 1) * W + X]) / (Math.min(h, Y + 1) - Math.max(0, Y - 1));
    }
    this.crest = new Uint8Array(w * h);
    this.mat = new Uint8Array(w * h);
    this.slope = new Uint8Array(2 * w * h);
    const pmAt = (X: number, Y: number) => {
      if (X < 0 || Y < 0 || X >= w || Y >= h) return 0;
      const k = Y * W + X;
      return (P[k] + P[k + 1] + P[k + W] + P[k + W + 1]) / 4;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * W + x, t = y * w + x;
      const pn = P[k], pe = P[k + 1], ps = P[k + W + 1], pw = P[k + W];
      if (pn <= 0 && pe <= 0 && ps <= 0 && pw <= 0) continue;
      this.rows[x + y].push(t);
      const n = S[k], e = S[k + 1], s = S[k + W + 1], wv = S[k + W], pm = (pn + pe + ps + pw) / 4;
      // material: snow above the snowline (ragged, fingers down the gullies), scree at the foot, rock between
      const red = f.red[t], hz = hash(x, y, 43);
      const sl = f.snow[t] + 16 * noise(x, y, 9, 44) - 10 * ridged(x, y, 5, 45);
      const scree = pm < 5 + 3 * noise(x, y, 6, 46);
      // snow lies on ledges and fills the gullies (a hollow: the neighbours stand over the tile), the steep faces and
      // the spurs between gullies shed it; per triangle, so its edge is not the tile grid
      const hollow = (pmAt(x - 1, y) + pmAt(x + 1, y) + pmAt(x, y - 1) + pmAt(x, y + 1)) / 4 - pm;
      const upTri = Math.max(Math.abs(e - n), Math.abs(wv - n)), loTri = Math.max(Math.abs(s - wv), Math.abs(s - e));
      const snowy = (tri: number) => pm > sl - 8 + tri * 0.9 - Math.max(-4, Math.min(14, hollow * 4.5));
      const m = scree ? (red ? 4 : 2) : red ? 3 : snowy(upTri) ? 1 : 0, m2 = scree ? m : red ? 3 : snowy(loTri) ? 1 : 0;
      this.mat[t] = m;
      // normals in metres (tile 2 m, level 1 m): upper (-2 dE, -2 dW, 4), lower (2 (W - S), 2 (E - S), 4)
      this.fill[2 * t] = shadeOf(-2 * (e - n), -2 * (wv - n), 4, m, hz);
      this.fill[2 * t + 1] = shadeOf(2 * (wv - s), 2 * (e - s), 4, m2, hz >>> 8);
      const B = 0.4, sgx = (a: number, b: number, c: number) => (GX[a] + GX[b] + GX[c]) / 3, sgy = (a: number, b: number, c: number) => (GY[a] + GY[b] + GY[c]) / 3;
      this.soft[2 * t] = shadeOf(-2 * (B * (e - n) + (1 - B) * sgx(k, k + 1, k + W)), -2 * (B * (wv - n) + (1 - B) * sgy(k, k + 1, k + W)), 4, m, hz, true);
      this.soft[2 * t + 1] = shadeOf(-2 * (B * (s - wv) + (1 - B) * sgx(k + 1, k + W, k + W + 1)), -2 * (B * (s - e) + (1 - B) * sgy(k + 1, k + W, k + W + 1)), 4, m2, hz >>> 8, true);
      // contour lines: world direction (-gy, gx), on screen (dx - dy) * HW, (dx + dy) * HH
      const bucket = (gx: number, gy: number) => {
        const dx = -gy, dy = gx, sx = (dx - dy) * 32, sy = (dx + dy) * 16;
        if (Math.abs(sx) < 1e-6) return SLOPES + (sy === 0 ? 0 : SLOPES);
        return SLOPES + Math.round(Math.max(-1, Math.min(1, sy / sx)) * SLOPES);
      };
      this.slope[2 * t] = bucket(e - n, wv - n);
      this.slope[2 * t + 1] = bucket(s - wv, s - e);
      // crests: an edge whose two ends both stand over their neighbours across it
      const at = (X: number, Y: number) => (X < 0 || Y < 0 || X > w || Y > h ? -1 : P[Y * W + X]);
      const crestY = (X: number, Y: number) => { const p = at(X, Y); return p > 6 && p > at(X, Y - 1) && p >= at(X, Y + 1); };
      const crestX = (X: number, Y: number) => { const p = at(X, Y); return p > 6 && p > at(X - 1, Y) && p >= at(X + 1, Y); };
      this.crest[t] = (crestY(x, y) && crestY(x + 1, y) ? 1 : 0) | (crestX(x, y) && crestX(x, y + 1) ? 2 : 0);
    }
  }

  /** Does the tile carry peaks all round (its ground cells are hidden under them, so they need not be drawn)? */
  covers(x: number, y: number): boolean {
    const { P, w } = this.f, W = w + 1, k = y * W + x;
    return P[k] > 1.5 && P[k + 1] > 1.5 && P[k + W] > 1.5 && P[k + W + 1] > 1.5;
  }

  /** Paint tile row v's quads within tile columns u0..u1 and world rows y0..y0 + hh; `scale` canvas px per world px. */
  paintRow(ctx: CanvasRenderingContext2D, v: number, u0: number, u1: number, y0: number, hh: number, scale: number): void {
    const row = this.rows[v];
    if (!row?.length) return;
    const { f, OX, OY } = this, { w, S } = f, W = w + 1, HW = 32, HH = 16, LH = 32;
    const paths = new Map<number, Path2D>(), crests = new Map<number, Path2D>(), all = new Path2D(), marks = new Map<number, Path2D>();
    const fine = scale >= 0.5;
    let any = false;
    for (const t of row) {
      const x = t % w, y = (t / w) | 0, u = x - y;
      if (u < u0 || u > u1) continue;
      const k = y * W + x, cx = OX + u * HW;
      const yn = OY + v * HH - S[k] * LH, ye = OY + (v + 1) * HH - S[k + 1] * LH, ys = OY + (v + 2) * HH - S[k + W + 1] * LH, yw = OY + (v + 1) * HH - S[k + W] * LH;
      if (Math.min(yn, ye, ys, yw) > y0 + hh || Math.max(yn, ye, ys, yw) < y0) continue;
      any = true;
      const N = [cx, yn], E = [cx + HW, ye], Sx = [cx, ys], Wp = [cx - HW, yw];
      const tri = (c: number, a: number[], b: number[], d: number[]) => {
        let p = paths.get(c);
        if (!p) paths.set(c, (p = new Path2D()));
        p.moveTo(a[0], a[1]); p.lineTo(b[0], b[1]); p.lineTo(d[0], d[1]); p.closePath();
      };
      const fl = fine ? this.soft : this.fill;
      tri(fl[2 * t], N, E, Wp);
      tri(fl[2 * t + 1], E, Sx, Wp);
      if (fine) for (let q = 0; q < 2; q++) {
        const key = Math.floor(this.fill[2 * t + q] / NSH) * 32 + this.slope[2 * t + q];
        let p = marks.get(key);
        if (!p) marks.set(key, (p = new Path2D()));
        const [a, b, d] = q ? [E, Sx, Wp] : [N, E, Wp];
        p.moveTo(a[0], a[1]); p.lineTo(b[0], b[1]); p.lineTo(d[0], d[1]); p.closePath();
      }
      all.moveTo(N[0], N[1]); all.lineTo(E[0], E[1]); all.lineTo(Sx[0], Sx[1]); all.lineTo(Wp[0], Wp[1]); all.closePath();
      const cr = this.crest[t];
      if (cr) {
        const m = this.mat[t];
        let p = crests.get(m);
        if (!p) crests.set(m, (p = new Path2D()));
        if (cr & 1) { p.moveTo(N[0], N[1]); p.lineTo(E[0], E[1]); }
        if (cr & 2) { p.moveTo(N[0], N[1]); p.lineTo(Wp[0], Wp[1]); }
      }
    }
    if (!any) return;
    // a hair of stroke in the fill's colour closes the seams between triangles
    ctx.lineWidth = 1 / scale;
    for (const [c, p] of paths) { ctx.fillStyle = FILL[c]; ctx.strokeStyle = FILL[c]; ctx.fill(p); ctx.stroke(p); }
    if (scale >= 0.5) {
      this.pattern ??= ctx.createPattern(speckleTile(), 'repeat');
      if (this.pattern) { ctx.fillStyle = this.pattern; ctx.fill(all); }
    }
    // painted rock: each material's marks sheared along the triangle's contour lines (rows) and fall line (columns)
    for (const [key, p] of marks) {
      const m = key >> 5, b = (key & 31) - SLOPES;
      const pat = (MARKS[key] ??= ctx.createPattern(peakTexture(m), 'repeat')!);
      pat.setTransform(new DOMMatrix([1, b / SLOPES, 0, 1, 0, 0]));
      ctx.fillStyle = pat; ctx.fill(p);
    }
    ctx.lineWidth = Math.max(1.5, 1.2 / scale);
    // crests broken into runs (a ridge is notched, not ruled), solid when far
    if (fine) ctx.setLineDash([9, 3, 5, 6, 14, 4]);
    for (const [m, p] of crests) { ctx.strokeStyle = CREST[m]; ctx.stroke(p); }
    if (fine) ctx.setLineDash([]);
    ctx.lineWidth = 1;
  }
}

/**
 * Per tile: the highest screen row (least world y) the peaks reach in front of it along its screen column (the tiles
 * (x + k, y + k), k >= 1), Infinity where none: a live sprite standing there whose top is below that row is behind them.
 */
export function peakHorizon(f: PeakField, OY: number): Float32Array {
  const { w, h, P, S } = f, W = w + 1, HH = 16, LH = 32, out = new Float32Array(w * h).fill(Infinity);
  for (let y = h - 2; y >= 0; y--) for (let x = w - 2; x >= 0; x--) {
    const t = (y + 1) * w + x + 1, k = (y + 1) * W + x + 1;
    let best = out[t];
    // the front tile's surface at its centre, a little under its highest corner
    if (Math.max(P[k], P[k + 1], P[k + W], P[k + W + 1]) > 0.5) best = Math.min(best, OY + (x + y + 3) * HH - ((S[k] + S[k + 1] + S[k + W] + S[k + W + 1]) / 4) * LH);
    out[y * w + x] = best;
  }
  return out;
}
