/**
 * W-52 set pieces: the 1-3 huge features a region is composed around (docs/impl/global-war-rebuild.md W-52), each
 * filling a large share of the 256-unit map. All take authoring units (kit.ts) and run in both builds (fine and sim).
 *
 *   massif        a stepped hill, mesa or plateau: an organic outline (the foot) rising in `tiers` terraces of `step`
 *                 levels toward a crown (point or polygon); the tier lines follow both the outline and the crown, so
 *                 terraces run along the contours. Steps of 2+ levels are cliffs (retaining walls); roads climb them
 *                 by their grade (Kit.road). Returns the field for contour rows.
 *   terraceRows   vine or olive rows on a massif's terraces, laid along its contours (dirt strips with plants on them),
 *                 not in blobs.
 *   contourRows   vine rows along the retaining walls as built (the final height field), so each row follows the wall
 *                 below it rather than the massif's noisy field (bacchae).
 *   pit           a deep quarry or crater: benches cut down toward a floor, cliff-faced, organic rim.
 *   valley        a corridor along a line: a floor at one level between rims raised over the land round it (cliff
 *                 walls or banks), for river valleys, defiles and sunken roads.
 *   townAlong     a dense village strung along a road line: a village (well, claim point) and houses packed along it.
 *   relief        a whole-map height field from a continuous elevation: whole levels (walkable one-level slopes) except
 *                 inside cliff bands, where it snaps to the band's ends along a noisy contour (walls of 3-6 levels);
 *                 `profile` turns a hand-drawn cross-section into the elevation's backbone.
 */
import { curveField, fbm, spline, type Pt } from '../shapes.ts';
import type { BiomeName, Kit } from './kit.ts';
import type { VisualKind as Kind } from '../../../src/war/regions/visual.ts';
import { MAX_HEIGHT } from '../../../src/war/region/compact.ts';

const G = 257; // the unit grid the distance fields are sampled on (bilinear between)

/** A closed Catmull-Rom loop through pts, sampled every `step` units. */
export function loop(pts: Pt[], step = 1): Pt[] {
  const out: Pt[] = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), m = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < m; k++) {
      const t = k / m, t2 = t * t, t3 = t2 * t;
      const c = (a: number, b: number, cc: number, d: number) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

function inside(p: Pt[], x: number, y: number) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  return c;
}

/** Signed distance to a closed polyline on the unit grid (positive inside), Float32Array G x G. */
function sdf(p: Pt[]): Float32Array {
  const out = new Float32Array(G * G);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of p) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    let d = Infinity;
    // far from the outline's box the box distance is a fine lower bound (the fields only matter near and inside)
    const bx = Math.max(x0 - x, 0, x - x1), by = Math.max(y0 - y, 0, y - y1);
    if (bx > 40 || by > 40) { out[y * G + x] = -Math.hypot(bx, by); continue; }
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const ax = p[j][0], ay = p[j][1], ex = p[i][0] - ax, ey = p[i][1] - ay, l2 = ex * ex + ey * ey;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / l2)) : 0;
      const dx = x - ax - t * ex, dy = y - ay - t * ey, dd = dx * dx + dy * dy;
      if (dd < d) d = dd;
    }
    out[y * G + x] = inside(p, x, y) ? Math.sqrt(d) : -Math.sqrt(d);
  }
  return out;
}

function lerp(f: Float32Array, x: number, y: number) {
  const cx = Math.max(0, Math.min(G - 1.001, x)), cy = Math.max(0, Math.min(G - 1.001, y));
  const ix = Math.floor(cx), iy = Math.floor(cy), fx = cx - ix, fy = cy - iy, i = iy * G + ix;
  return (f[i] * (1 - fx) + f[i + 1] * fx) * (1 - fy) + (f[i + G] * (1 - fx) + f[i + G + 1] * fx) * fy;
}

export interface Massif {
  /** Continuous terrace coordinate at a unit point: < 0 outside the foot, 0 at the foot, `tiers` at the crown. */
  t(x: number, y: number): number;
  /** Tier at a unit point (0 outside, 1..tiers). */
  tier(x: number, y: number): number;
  /** Ground level of tier n. */
  level(n: number): number;
  base: number; step: number; tiers: number;
  outline: Pt[];
}

/**
 * A stepped massif over `outline` (a closed loop of unit points, smoothed): tier n (1..tiers) stands at base + n * step
 * levels (`steps` overrides per tier), the crown (`crown`: a point or a closed loop; default the outline's centre) the
 * top tier. `wobble` bends the tier lines (in tiers, default 0.18); `skew` > 0 squeezes the tiers toward the outline
 * (steep foot, broad top) and < 0 toward the crown. `terrain` paints its ground (default: leave), `top` the crown tier's.
 * The land outside is untouched; rock and water inside stay.
 */
export function massif(k: Kit, o: { outline: Pt[]; crown?: Pt | Pt[]; base: number; tiers: number; step?: number; steps?: number[]; wobble?: number; skew?: number; terrain?: string; top?: string; keepHigher?: boolean }): Massif {
  const out = loop(o.outline), seed = k.seed();
  const dB = sdf(out);
  let dC: Float32Array;
  if (o.crown && typeof o.crown[0] !== 'number') dC = sdf(loop(o.crown as Pt[]));
  else {
    let c = o.crown as Pt | undefined;
    if (!c) { let sx = 0, sy = 0; for (const p of out) { sx += p[0]; sy += p[1]; } c = [sx / out.length, sy / out.length]; }
    dC = new Float32Array(G * G);
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) dC[y * G + x] = -Math.hypot(x - c[0], y - c[1]);
  }
  const step = o.step ?? 3, wob = o.wobble ?? 0.18, skew = o.skew ?? 0;
  const lv: number[] = [o.base];
  for (let n = 1; n <= o.tiers; n++) lv.push(Math.min(MAX_HEIGHT, lv[n - 1] + (o.steps?.[n - 1] ?? step)));
  const t = (x: number, y: number) => {
    const b = lerp(dB, x, y);
    if (b < 0) return b / 8;
    const c = Math.max(0, -lerp(dC, x, y));
    let f = c <= 0 ? 1 : b / (b + c);
    if (skew) f = skew > 0 ? 1 - (1 - f) ** (1 + skew) : f ** (1 - skew);
    return Math.min(o.tiers, f * o.tiers + wob * (fbm(x, y, 9, seed) + 0.5 * fbm(x, y, 3.5, seed + 1)));
  };
  const tier = (x: number, y: number) => { const v = t(x, y); return v < 0 ? 0 : Math.min(o.tiers, 1 + Math.floor(v)); };
  k.each((i, x, y) => {
    if (k.water[i] || k.terrain[i] === 'rock') return;
    const n = tier(x, y);
    if (!n) return;
    k.height[i] = o.keepHigher ? Math.max(k.height[i], lv[n]) : lv[n];
    const tt = n === o.tiers && o.top ? o.top : o.terrain;
    if (tt && k.terrain[i] !== 'road') k.terrain[i] = tt;
  });
  return { t, tier, level: (n) => lv[n], base: o.base, step, tiers: o.tiers, outline: out };
}

/**
 * Rows of plants along a massif's contours on tiers `tiers` (default all but the crown): lines `every` units apart, kept
 * `margin` units off the tier edges, plants (`ids`, default vines; a row piece turned along the line) packed on them,
 * over vineyard soil (`soil`, a biome terrain of `biome`, default Elaia's rossa; null: the ground as it is). `where`
 * limits them further (unit point). The sim ground stays as it is (no strips: the visual layer keeps its long runs).
 */
export function terraceRows(k: Kit, m: Massif, o: { tiers?: number[]; every?: number; margin?: number; ids?: [string, string]; where?: (x: number, y: number) => boolean; gap?: number; soil?: Kind | null; biome?: BiomeName } = {}) {
  const tiers = new Set(o.tiers ?? Array.from({ length: m.tiers - 1 }, (_, n) => n + 1));
  const every = o.every ?? 2, margin = o.margin ?? 1.5, half = 0.3;
  const [idY, idX] = o.ids ?? ['elaia/vines', 'elaia/vines-x'];
  // distance along the slope from the tier's lower edge, from the field and its gradient
  const grad = (x: number, y: number) => {
    const e = 0.5, gx = (m.t(x + e, y) - m.t(x - e, y)) / (2 * e), gy = (m.t(x, y + e) - m.t(x, y - e)) / (2 * e);
    return [gx, gy, Math.hypot(gx, gy) || 1e-3] as const;
  };
  const row = (x: number, y: number) => {
    // every other tile in a checkerboard: a row piece spans two tiles, so the rows stay whole at half the pieces
    if ((Math.round(2 * x) + Math.round(2 * y)) & 1) return false;
    if (o.where && !o.where(x, y)) return false;
    const v = m.t(x, y);
    if (v < 0) return false;
    const n = Math.min(m.tiers, 1 + Math.floor(v));
    if (!tiers.has(n) || (n === m.tiers && v >= m.tiers)) return false;
    const [, , g] = grad(x, y), dLow = (v - (n - 1)) / g, dHigh = (n - v) / g;
    if (dLow < margin || dHigh < margin) return false;
    const r = dLow / every;
    return Math.abs(r - Math.round(r)) * every < half;
  };
  // the vineyard soil (visual only, Elaia's terra rossa) over the planted tiers, the rows on it
  const planted = (x: number, y: number) => { if (o.where && !o.where(x, y)) return false; const v = m.t(x, y); return v >= 0 && tiers.has(Math.min(m.tiers, 1 + Math.floor(v))); };
  if (o.soil !== null) k.patchWhere(o.biome ?? 'elaia', o.soil ?? 'rossa', planted, ['grass']);
  // the row piece runs along y (vines) or x (vines-x): whichever lies closer to the contour
  const idAt = (x: number, y: number) => { const [gx, gy] = grad(x, y); return Math.abs(gx) > Math.abs(gy) ? idY : idX; };
  k.rowsAt(idAt, (x, y) => row(x, y), [o.soil ?? 'rossa', 'grass', 'dry'], o.gap ?? 1);
}

/**
 * Vine rows along the terraces as they were built (the final height field, not a massif's field): on the cells where
 * `planted` holds, lines `every` units apart parallel to the retaining wall below (its top edge: a drop of 2+ levels),
 * kept `margin` units off it and off the wall above, a row piece turned along the line (`ids`, default the Elaia vines;
 * trees `gap` tiles apart, default packed).
 * Read after the whole build (roads, pits, water), so the rows follow the walls the player sees; vineyard soil (`soil`,
 * a biome terrain) under the planted cells. The sim ground stays as it is.
 */
export function contourRows(k: Kit, planted: (x: number, y: number) => boolean, o: { every?: number; margin?: number; ids?: [string, string]; soil?: Kind; biome?: BiomeName; gap?: number } = {}) {
  const every = o.every ?? 1.6, margin = o.margin ?? 1, half = 0.3, [idY, idX] = o.ids ?? ['elaia/vines', 'elaia/vines-x'];
  let low: Float32Array | null = null, high: Float32Array | null = null;
  // units from the nearest wall top below (low) and wall foot above (high), two-pass chamfer over the cells
  const fields = () => {
    const { W, H, K, height } = k, N = W * H;
    const chamfer = (seed: (i: number, x: number, y: number) => boolean) => {
      const d = new Float32Array(N).fill(1e9);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (seed(y * W + x, x, y)) d[y * W + x] = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 1);
        if (y > 0) d[i] = Math.min(d[i], d[i - W] + 1, x > 0 ? d[i - W - 1] + 1.414 : 1e9, x < W - 1 ? d[i - W + 1] + 1.414 : 1e9);
      }
      for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x;
        if (x < W - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
        if (y < H - 1) d[i] = Math.min(d[i], d[i + W] + 1, x < W - 1 ? d[i + W + 1] + 1.414 : 1e9, x > 0 ? d[i + W - 1] + 1.414 : 1e9);
      }
      for (let i = 0; i < N; i++) d[i] /= K;
      return d;
    };
    const step = (i: number, x: number, y: number, s: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < W && ny < H && s * (height[ny * W + nx] - height[i]) >= 2;
    });
    low = chamfer((i, x, y) => step(i, x, y, -1));
    high = chamfer((i, x, y) => step(i, x, y, 1));
  };
  const at = (x: number, y: number) => { if (!low) fields(); return k.at([x, y]); };
  const row = (x: number, y: number) => {
    if ((Math.round(2 * x) + Math.round(2 * y)) & 1) return false; // a row piece spans two tiles: every other one
    if (!planted(x, y)) return false;
    const i = at(x, y);
    if (i < 0) return false;
    const d = low![i], e = high![i];
    if (d < margin || e < margin || d > 1e6) return false;
    return Math.abs(d / every - Math.round(d / every)) * every < half;
  };
  const idAt = (x: number, y: number) => {
    const s = 0.5, f = (u: number, v: number) => { const j = at(u, v); return j < 0 ? 0 : low![j]; };
    return Math.abs(f(x + s, y) - f(x - s, y)) > Math.abs(f(x, y + s) - f(x, y - s)) ? idY : idX;
  };
  if (o.soil) k.patchWhere(o.biome ?? 'elaia', o.soil, planted, ['grass']);
  k.rowsAt(idAt, row, [o.soil ?? 'rossa', 'grass', 'dry', 'dirt'], o.gap ?? 1);
}

/**
 * A pit (quarry, crater) at `p`, `r` units across (`ry`, `rot` for an oval): `benches` cut down to `depth` levels under
 * the ground at p, each bench edge a cliff; the floor and benches bare (`t`, default dirt). Elaia's marble patch over it
 * with `marble`. Spot `quarry` unless `spot` names another.
 */
export function pit(k: Kit, p: Pt, o: { r: number; ry?: number; rot?: number; depth: number; benches?: number; t?: string; marble?: boolean; spot?: string | null; rough?: number }) {
  const s = k.seed(), h0 = k.height[k.at(p)], benches = o.benches ?? Math.max(1, Math.floor(o.depth / 2));
  const ry = o.ry ?? o.r, ca = Math.cos(o.rot ?? 0), sa = Math.sin(o.rot ?? 0);
  k.each((i, x, y) => {
    if (k.water[i] || k.terrain[i] === 'rock') return;
    const u = (x - p[0]) * ca + (y - p[1]) * sa, v = (y - p[1]) * ca - (x - p[0]) * sa;
    const d = 1 - Math.hypot(u / o.r, v / ry) + (o.rough ?? 0.06) * fbm(x, y, 4, s);
    if (d <= 0) return;
    const b = Math.min(benches, Math.ceil(d * benches * 1.25));
    k.height[i] = Math.max(0, Math.min(k.height[i], h0 - Math.round((o.depth * b) / benches)));
    if (k.terrain[i] !== 'road') k.terrain[i] = o.t ?? 'dirt';
  });
  if (o.marble) k.patch('elaia', 'marble', [p[0], p[1], o.r + 1.5, ry + 1.5, o.rot ?? 0], ['grass', 'dirt', 'forest']);
  if (o.spot !== null) k.spot(o.spot ?? 'quarry', p);
  return p;
}

/**
 * A corridor along `pts`: the floor `half` units each side at level `floor` (terrain `t` if given), the walls up to `rim`
 * over `wall` units (0: a sheer cliff; otherwise one level per `wall` units), the rims raised to `rim` out to `reach`
 * units beyond the walls (higher land kept).
 */
export function valley(k: Kit, pts: Pt[], o: { floor: number; rim: number; half?: number; wall?: number; reach?: number; t?: string }) {
  const c = spline(pts), s = k.seed(), half0 = o.half ?? 6, wall = o.wall ?? 0, reach = o.reach ?? 10;
  const f = curveField(c, k.W, k.H, half0 + 2 + (o.rim - o.floor) * wall + reach, k.K);
  k.each((i, x, y) => {
    const d = f.d[i];
    if (d === Infinity || k.terrain[i] === 'rock') return;
    const half = half0 + 1.2 * fbm(x, y, 8, s);
    const wallW = wall > 0 ? (o.rim - o.floor) * wall : 0;
    if (d > half + wallW + reach) return;
    if (k.water[i]) return;
    if (d <= half) {
      k.height[i] = o.floor;
      if (o.t && k.terrain[i] !== 'road') k.terrain[i] = o.t;
    } else if (d <= half + wallW) k.height[i] = Math.max(Math.min(k.height[i], o.rim), o.floor + Math.ceil((d - half) / wall));
    else k.height[i] = Math.max(k.height[i], o.rim);
  });
  return c;
}

/** A dense village along a road line: a village by its well at `pts[at]` (default the middle point), houses every `every` units along the line. */
export function townAlong(k: Kit, pts: Pt[], o: { n?: number; every?: number; depth?: number; at?: number } = {}) {
  const c = spline(pts), mid = pts[o.at ?? Math.floor(pts.length / 2)];
  k.village(mid, o.n ?? 6);
  const every = o.every ?? 14;
  for (let s = every / 2; s < c[c.length - 1].s; s += every) {
    const q = c.find((p) => p.s >= s)!;
    if (Math.hypot(q.x - mid[0], q.y - mid[1]) < 8) continue;
    k.houses([q.x, q.y], 3, 2, o.depth ?? 9);
  }
}

/** Piecewise-linear lookup of `u` in sorted [u, value] pairs (clamped at both ends): a hand-drawn cross-section. */
export function profile(pts: [number, number][], u: number): number {
  if (u <= pts[0][0]) return pts[0][1];
  for (let n = 1; n < pts.length; n++) if (u <= pts[n][0]) {
    const [a, va] = pts[n - 1], [b, vb] = pts[n];
    return va + ((vb - va) * (u - a)) / (b - a);
  }
  return pts[pts.length - 1][1];
}

/**
 * Cliffed relief: `elev` gives a continuous height in levels per unit point (NaN: leave the tile; its own seed passed in).
 * Rounded to whole levels the land steps one level at a time (walkable slopes along organic contours); inside each cliff
 * band [lo, hi] it snaps to lo or hi instead, at a contour bent by noise (`jitter` of the band's height, default 0.35):
 * one wall of hi - lo levels, and bands close together stack into multi-level drops. Water and rock are left;
 * `keepHigher` keeps higher ground. Lay coves, ravines and roads over it afterwards.
 */
export function relief(k: Kit, elev: (x: number, y: number, seed: number) => number, o: { cliffs?: [number, number][]; jitter?: number; keepHigher?: boolean } = {}) {
  const s = k.seed(), j = o.jitter ?? 0.35, bands = o.cliffs ?? [];
  k.each((i, x, y) => {
    if (k.water[i] || k.terrain[i] === 'rock') return;
    let v = elev(x, y, s);
    if (Number.isNaN(v)) return;
    for (const [lo, hi] of bands) if (v > lo && v < hi) {
      const mid = (lo + hi) / 2 + j * (hi - lo) * fbm(x, y, 11, s + 7);
      v = v < mid ? lo : hi;
      break;
    }
    const h = Math.max(0, Math.min(MAX_HEIGHT, Math.round(v)));
    k.height[i] = o.keepHigher ? Math.max(k.height[i], h) : h;
  });
}
