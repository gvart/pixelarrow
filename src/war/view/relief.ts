/**
 * Baked terrain light per visual cell (1 m cells, ./iso.ts), painted by ./art.ts over each row of
 * ground as translucent fills, so it costs nothing per frame. Computed once per region (pure but for the tree shadow sprite).
 * Tree shadows are a soft sprite drawn on the ground SE of each tree (treeShadow), after the row of its front edge.
 *
 *  - hill shading: light from the NW (-x, a little -y). The slope comes from clamped height
 *    differences over a few cells (a cliff counts as a steep slope, not a spike), smoothed, so a
 *    hillside of one-level steps reads as one lit or shaded slope;
 *  - ambient occlusion: ground below the mean of its neighbourhood (hollows, the feet of walls)
 *    darker, ground above it (crests, rims) a little lighter;
 *  - cast shadow: the ground behind a wall facing away from the light, as far as the wall is tall;
 *  - rock relief: rock, scree, snow and the biome rocks get a ridged noise relief that swells
 *    toward the middle of each patch, shaded the same way, so a rock field reads as a raised mass;
 *  - water: darker with the distance from land; land just above the water line wet (darker sand).
 *
 * Each cell gets one palette code (0: none); ./art.ts batches one fill per code and row.
 */
import { hash } from './autotile';
import { KINDS } from '../regions/visual';
import { canvas } from './canvas';

/** Light step per shade code. */
const STEP = 0.02;
/** Shade codes each side of 0. */
const NS = 24;
const WATER0 = 1 + 2 * NS + 1, NWATER = 15;
const WET0 = WATER0 + NWATER, NWET = 6;
/** The codes of the water at the shore and of the wet ground at the water's edge (./art.ts splits shore cells between them). */
export const SHORE_WATER = WATER0, SHORE_WET = WET0 + 3;

/** Fill per code (index 0 unused). */
export const RELIEF_FILL: string[] = (() => {
  const out = [''];
  for (let s = -NS; s <= NS; s++) {
    // shadows cool, light warm
    out.push(s < 0 ? `rgba(16,20,38,${(-s * STEP).toFixed(3)})` : s > 0 ? `rgba(255,240,205,${(s * STEP * 0.8).toFixed(3)})` : 'rgba(0,0,0,0)');
  }
  // water by distance from land: shallows lit turquoise over the bed (fading over 8 cells), open water darkening offshore
  for (let k = 0; k < 8; k++) out.push(`rgba(130,206,200,${(0.34 - 0.04 * k).toFixed(3)})`);
  out.push('rgba(0,0,0,0)');
  for (let k = 1; k < NWATER - 8; k++) out.push(`rgba(6,18,40,${(0.04 * k).toFixed(3)})`);
  for (let k = 1; k <= NWET; k++) out.push(`rgba(40,30,18,${(0.05 * k).toFixed(3)})`);
  return out;
})();

const K = (n: string) => KINDS.indexOf(n as never);
const ROCKY = new Set(['rock', 'snow', 'drift', 'scree', 'gravel', 'redrock', 'marble'].map(K));
const SNOWY = new Set(['snow', 'drift', 'salt'].map(K));
const SANDY = new Set(['sand', 'dune', 'reg', 'hardpan'].map(K));
const SHALLOW = K('shallow'), DEEP = K('deep');
const BRIGHT = new Set(['marble', 'snow', 'drift'].map(K));
const DUNE = new Set(['dune', 'sand'].map(K));
/** Undulation per kind (1 = grass). */
const AMP: Record<number, number> = Object.fromEntries([['road', 0.3], ['paving', 0], ['ruin', 0.4], ['forest', 1.2], ['dune', 1.6], ['sand', 0.8], ['snow', 1.4], ['drift', 1.4], ['salt', 0.4], ['marsh', 0.5]].map(([k, v]) => [K(k as string), v as number]));

/** Gradient noise in about [-1, 1] on a lattice of `s` cells (8 hashed gradient directions), rotated off the cell axes. */
export function noise(x: number, y: number, s: number, k: number): number {
  const fx = (x * 0.8 + y * 0.6) / s, fy = (y * 0.8 - x * 0.6) / s, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const t00 = ((hash(ix, iy, k) >>> 4) & 7) * 2, t10 = ((hash(ix + 1, iy, k) >>> 4) & 7) * 2;
  const t01 = ((hash(ix, iy + 1, k) >>> 4) & 7) * 2, t11 = ((hash(ix + 1, iy + 1, k) >>> 4) & 7) * 2;
  const g00 = G8[t00] * tx + G8[t00 + 1] * ty, g10 = G8[t10] * (tx - 1) + G8[t10 + 1] * ty;
  const g01 = G8[t01] * tx + G8[t01 + 1] * (ty - 1), g11 = G8[t11] * (tx - 1) + G8[t11 + 1] * (ty - 1);
  const sx = tx * tx * tx * (tx * (tx * 6 - 15) + 10), sy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
  const a = g00 + (g10 - g00) * sx, b = g01 + (g11 - g01) * sx;
  return (a + (b - a) * sy) * 1.4;
}
const G8 = [1, 0, -1, 0, 0, 1, 0, -1, 0.707, 0.707, -0.707, 0.707, 0.707, -0.707, -0.707, -0.707];

/** Ridged noise in [0, 1]: sharp crests at 1. */
const ridged = (x: number, y: number, s: number, k: number) => 1 - Math.min(1, Math.abs(noise(x, y, s, k)));

/** Breadth-first distance (4-neighbour, capped at `cap`) from the cells where `src` holds, through the cells where `pass` holds. */
function distance(w: number, h: number, src: (j: number) => boolean, pass: (j: number, from: number) => boolean, cap: number): Uint8Array {
  const n = w * h, d = new Uint8Array(n).fill(cap), q = new Int32Array(n);
  let qe = 0;
  for (let j = 0; j < n; j++) if (src(j)) { d[j] = 0; q[qe++] = j; }
  for (let qs = 0; qs < qe; qs++) {
    const j = q[qs], x = j % w, nd = d[j] + 1;
    if (nd >= cap) continue;
    const go = (i: number) => { if (d[i] > nd && pass(i, j)) { d[i] = nd; q[qe++] = i; } };
    if (x > 0) go(j - 1);
    if (x < w - 1) go(j + 1);
    if (j >= w) go(j - w);
    if (j + w < n) go(j + w);
  }
  return d;
}

/** Box blur of radius r, in place over a copy (separable, clamped at the edges). */
function blur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += src[o + Math.max(0, Math.min(w - 1, i))];
    for (let x = 0; x < w; x++) {
      tmp[o + x] = acc * k;
      acc += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += tmp[Math.max(0, Math.min(h - 1, i)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc * k;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** The fill of the global deep water tile, about (public/war/tiles/shallow-deep.png frame 0). */
const DEEP_RGB = [23, 35, 45];

/**
 * The water's light as a smooth field (regions-look 2), RGBA per visual cell, drawn by ./art.ts as a bilinear pattern
 * over the water cells instead of one flat diamond per cell (which drew the water as a stepped mosaic). All water is
 * drawn with the shallow tiles (./art.ts fineCodes); this field makes the deep:
 *  - the deep's fill over the deep cells, ramped over about 5 cells across the shallow-to-deep line (a smooth curve, not
 *    the staircase of a tile seam), a little of the tile's texture left;
 *  - over it the light by the distance from land: the shallows lit turquoise fading over 8 cells, open water darkening.
 * `wet`: the cells it covers (others take the shore's value, so the field does not fade at the shoreline).
 */
export function waterField(fw: number, fh: number, fk: Uint8Array, wet: (j: number) => boolean): Uint8ClampedArray<ArrayBuffer> {
  const n = fw * fh;
  const land = distance(fw, fh, (j) => !wet(j), (i) => wet(i), 40);
  // drawn shallow: the shallow cells and a band along every shore (as the autotiler laid it between the old tiles)
  const vs = (j: number) => wet(j) && (fk[j] === SHALLOW || land[j] <= 2);
  const toS = distance(fw, fh, vs, (i) => wet(i), 8), toD = distance(fw, fh, (j) => wet(j) && !vs(j), (i) => wet(i), 8);
  const D = new Float32Array(n), S = new Float32Array(n);
  for (let j = 0; j < n; j++) { D[j] = land[j]; S[j] = !wet(j) ? -6 : vs(j) ? -Math.min(6, toD[j] - 0.5) : Math.min(6, toS[j] - 0.5); }
  const Db = blur(blur(D, fw, fh, 1), fw, fh, 1), Sb = blur(blur(S, fw, fh, 1), fw, fh, 1);
  const out = new Uint8ClampedArray(new ArrayBuffer(4 * n));
  for (let j = 0; j < n; j++) {
    const d = wet(j) ? Math.max(1, Db[j]) : 1, f = Math.max(0, Math.min(1, (Sb[j] + 2.5) / 5));
    // the distance light (over), the deep's fill (under)
    let c1 = [130, 206, 200], a1 = Math.max(0, Math.min(0.34, 0.34 - 0.04 * (d - 1)));
    if (d > 9.5) { c1 = [6, 18, 40]; a1 = Math.min(0.24, 0.04 * (d - 9.5)); }
    const a2 = wet(j) ? 0.74 * f * f * (3 - 2 * f) : 0, a = a1 + a2 * (1 - a1);
    for (let k = 0; k < 3; k++) out[4 * j + k] = a ? (c1[k] * a1 + DEEP_RGB[k] * a2 * (1 - a1)) / a : 0;
    out[4 * j + 3] = Math.round(255 * a);
  }
  return out;
}

/** Foam bits of a shore water cell: the sides it meets land on (at about its level). */
export const FOAM_PX = 1, FOAM_NX = 2, FOAM_PY = 4, FOAM_NY = 8;

/**
 * The relief code of every visual cell (fw x fh, kinds fk, levels fz): an index into RELIEF_FILL, 0 none; and the
 * foam bits of every water cell (FOAM_*).
 */
export function relief(fw: number, fh: number, fk: Uint8Array, fz: Float32Array): { code: Uint8Array; foam: Uint8Array } {
  const n = fw * fh, wet = (j: number) => fk[j] === SHALLOW || fk[j] === DEEP;
  // rock relief: ridged noise swelling toward the middle of each patch (levels, for the light only)
  const edge = distance(fw, fh, (j) => !ROCKY.has(fk[j]), () => true, 12);
  // ground undulation: every land kind a little (dunes more), blended across kind borders so no seam shows
  const amp = new Float32Array(n);
  for (let j = 0; j < n; j++) amp[j] = wet(j) ? 0 : AMP[fk[j]] ?? 1;
  const A = blur(amp, fw, fh, 3);
  const P = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    P[j] = fz[j];
    if (wet(j)) continue;
    const x = j % fw, y = (j / fw) | 0, e = edge[j];
    P[j] += A[j] * (1.2 * noise(x, y, 24, 7) + 0.5 * noise(x, y, 10, 8) + (DUNE.has(fk[j]) ? 1.4 * ridged(x, y, 14, 9) ** 3 : 0));
    if (!e) continue;
    const m = Math.min(1, e / 7) * (BRIGHT.has(fk[j]) ? 0.45 : 1); // bright stone shows every fold: less of it
    P[j] += m * (5 * noise(x, y, 44, 4) + 3 * noise(x, y, 20, 3) + 2.4 * ridged(x, y, 12, 1) ** 2 + 0.6 * ridged(x, y, 5, 2)) + Math.min(e, 12) * 0.3;
  }
  // slope: clamped differences over 1..3 cells each way (a wall counts as a slope of 1.5 levels per cell)
  const gx = new Float32Array(n), gy = new Float32Array(n);
  const W = [0, 1, 0.6, 0.35], C = 1.5;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    const j = y * fw + x, z = P[j];
    let ax = 0, ay = 0, ws = 0;
    for (let d = 1; d <= 3; d++) {
      const c = C * d;
      const e = Math.max(-c, Math.min(c, P[y * fw + Math.min(fw - 1, x + d)] - z)), wv = Math.max(-c, Math.min(c, P[y * fw + Math.max(0, x - d)] - z));
      const s = Math.max(-c, Math.min(c, P[Math.min(fh - 1, y + d) * fw + x] - z)), nv = Math.max(-c, Math.min(c, P[Math.max(0, y - d) * fw + x] - z));
      ax += (W[d] * (e - wv)) / (2 * d);
      ay += (W[d] * (s - nv)) / (2 * d);
      ws += W[d];
    }
    gx[j] = ax / ws; gy[j] = ay / ws;
  }
  const sgx = blur(gx, fw, fh, 1), sgy = blur(gy, fw, fh, 1);
  // occlusion: the level against the mean round it (radius ~5 cells)
  const B = blur(blur(P, fw, fh, 3), fw, fh, 2);
  // the median level: high ground a little lighter
  const hist = new Uint32Array(256);
  for (let j = 0; j < n; j++) hist[Math.max(0, Math.min(255, Math.round(fz[j])))]++;
  let med = 0;
  for (let acc = 0; med < 255 && (acc += hist[med]) < n / 2; med++);
  // water: distance from land; land: distance from water over ground near its level (wet sand)
  const shore = distance(fw, fh, (j) => !wet(j), (j) => wet(j), 24);
  const sf = new Float32Array(n);
  for (let j = 0; j < n; j++) sf[j] = shore[j];
  const shoreF = blur(blur(sf, fw, fh, 1), fw, fh, 1); // twice: the shading falls off in a smooth band, not in diamonds
  const damp = distance(fw, fh, wet, (j, f) => !wet(j) && Math.abs(fz[j] - fz[f]) <= 1, 4);
  const out = new Uint8Array(n), foam = new Uint8Array(n);
  let ray = 0;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    const j = y * fw + x, k = fk[j];
    // the light's ray toward +x from the highest ground behind, falling half a level per cell (cast shadows)
    ray = x ? Math.max(ray - 0.5, fz[j - 1] - 0.5) : -1e9;
    if (wet(j)) {
      const d = shore[j];
      if (d === 1) {
        const land = (i: number) => !wet(i) && fz[i] >= fz[j] - 1;
        foam[j] = (x < fw - 1 && land(j + 1) ? FOAM_PX : 0) | (x > 0 && land(j - 1) ? FOAM_NX : 0) | (y < fh - 1 && land(j + fw) ? FOAM_PY : 0) | (y > 0 && land(j - fw) ? FOAM_NY : 0);
      }
      out[j] = WATER0 + Math.max(0, Math.min(NWATER - 1, Math.round(shoreF[j] - 1 + ((Math.imul(hash(x, y, 6) ^ (hash(x, y, 6) >>> 15), 0x2c1b3c6d) >>> 24) / 255 - 0.5) * 0.5 + (shoreF[j] > 9 ? (shoreF[j] - 9) * 0.5 : 0))));
      continue;
    }
    if (damp[j] <= 2 && !ROCKY.has(k)) { out[j] = WET0 + (damp[j] === 1 ? 3 : 1); continue; }
    // slope toward the light: ground rising toward +x (and a little +y) faces the NW
    const lit = sgx[j] + 0.4 * sgy[j];
    let s = 0.2 * Math.tanh(lit * 0.9);
    const occ = B[j] - P[j];
    s += occ > 0 ? -Math.min(0.22, occ * 0.045) : Math.min(0.1, -occ * 0.03);
    // cast shadow of a wall toward +x
    s -= Math.min(0.36, Math.max(0, ray - fz[j]) * 0.035);
    s += Math.max(-0.2, Math.min(0.16, (fz[j] - med) * 0.007));
    if (SNOWY.has(k)) s *= s > 0 ? 0.4 : 0.75;
    else if (SANDY.has(k)) s *= 0.85;
    else if (ROCKY.has(k)) s *= s > 0 ? 1.5 : 1.15;
    // dithered rounding: no band lines on long gentle slopes
    const c = Math.round(s / STEP + ((hash(x, y, 5) & 255) / 255 - 0.5) * 0.9);
    out[j] = 1 + NS + Math.max(-NS, Math.min(NS, c));
    if (out[j] === 1 + NS) out[j] = 0;
  }
  return { code: out, foam };
}

/**
 * Ground tints: broad patches laid over the tile art of a kind, so a floor of one kind is not one repeated sheet (the
 * tiles repeat every 2 m). Per visual cell a code into TINT_FILL (0 none), filled by ./art.ts under the relief light:
 *  - salt: the pale sand the salt pans lie in (the salt tiles bleached white at load, ./art.ts bleach), about half of it;
 *  - redrock: ochre, rust-dark and dusty patches of a few tens of metres over the red tableland;
 *  - basalt: the ground on the desert's dark volcanic stone (./art.ts), near black;
 *  - peat water: the moors' bog pools near black (peatWater), lighter only at the very edge where the bed shows;
 *  - heath: rust-red heather and dark wet hollows of a few tens of metres over the moor (the reference's mottled moor).
 */
const TINTS: [string, number[]][] = [
  ['214,193,150', [0.62, 0.46, 0.28, 0.14]], // pale sand over salt
  ['204,128,62', [0.2, 0.13, 0.07]], // ochre over red rock
  ['86,32,18', [0.2, 0.13, 0.07]], // rust-dark over red rock
  ['236,184,146', [0.16, 0.1, 0.05]], // dust over red rock
  ['12,10,13', [0.78, 0.7, 0.62]], // basalt: rock, then other ground, a little dithered
  ['11,9,7', [0.9, 0.85, 0.78, 0.68]], // peat water: open water, then toward the shore
  ['132,52,36', [0.2, 0.13, 0.07]], // rust heather over the heath
  ['20,14,11', [0.26, 0.17, 0.08]], // dark wet peat over the heath
  ['40,27,18', [0.6, 0.52]], // peat mud over the moors' tracks (peatWater)
];
/** Fill per code (index 0 unused); the first code of each tint in TINT0. */
export const TINT_FILL: string[] = [''];
const TINT0: number[] = [];
for (const [rgb, as] of TINTS) { TINT0.push(TINT_FILL.length); for (const a of as) TINT_FILL.push(`rgba(${rgb},${a})`); }
const ROAD = K('road'), ROCK = K('rock'), SALT = K('salt'), REDROCK = K('redrock'), HEATH = K('heath'), PAVED = new Set(['road', 'paving', 'shallow', 'deep'].map(K));

/** The peat water tint at the shore (a shore cell's water half, ./art.ts). */
export const PEAT_SHORE = TINT0[5] + 3;

/**
 * Black peat water (the moors' bog pools, regions-look 2), and the moors' tracks in peat mud: the water cells where `peat` holds lose their lit turquoise
 * shallows, open-water shade and surf (code, foam) and take the near-black peat tint instead, graded by the distance
 * from the shore their water shade carried (the edge a little lighter, where the bed shows).
 */
export function peatWater(fk: Uint8Array, code: Uint8Array, foam: Uint8Array, tint: Uint8Array, peat: (j: number) => boolean): void {
  for (let j = 0; j < fk.length; j++) {
    if ((fk[j] !== SHALLOW && fk[j] !== DEEP) || !peat(j)) continue;
    const s = code[j], d = s >= WATER0 && s < WATER0 + NWATER ? s - WATER0 : NWATER;
    tint[j] = TINT0[5] + Math.max(0, 3 - (d >> 1));
    code[j] = 0;
    foam[j] = 0;
  }
  // the tracks over the moor trodden into dark peat mud (the global road is pale dust)
  for (let j = 0; j < fk.length; j++) if (fk[j] === ROAD && peat(j)) tint[j] = TINT0[8] + (hash(j, 7, 86) % 4 === 0 ? 1 : 0);
}

/**
 * The tint code of every visual cell (fw x fh, kinds fk): an index into TINT_FILL, 0 none. `basalt`: the cells on the
 * desert's dark volcanic stone (./art.ts), their ground darkened to near black (roads and water kept).
 */
export function groundTint(fw: number, fh: number, fk: Uint8Array, basalt: (j: number) => boolean = () => false): Uint8Array {
  const out = new Uint8Array(fw * fh);
  // a graded edge: the strongest step deepest in the patch
  const step = (t: number, v: number, w: number) => { const n = TINTS[t][1].length, k = Math.floor(v / w); return k >= n ? TINT0[t] : k >= 0 ? TINT0[t] + n - 1 - k : 0; };
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    const j = y * fw + x, k = fk[j];
    if (!PAVED.has(k) && basalt(j)) out[j] = TINT0[4] + (k === ROCK ? 0 : 1) + (hash(x, y, 79) % 3 === 0 ? 1 : 0);
    else if (k === SALT) {
      const v = 0.65 * noise(x, y, 44, 71) + 0.35 * noise(x, y, 14, 72) + 0.15 + ((hash(x, y, 73) & 255) / 255 - 0.5) * 0.04;
      out[j] = step(0, v, 0.05);
    } else if (k === REDROCK) {
      const a = 0.7 * noise(x, y, 34, 74) + 0.3 * noise(x, y, 11, 75), b = 0.7 * noise(x, y, 52, 76) + 0.3 * noise(x, y, 15, 77);
      const d = ((hash(x, y, 78) & 255) / 255 - 0.5) * 0.04;
      out[j] = a > 0.12 ? step(1, a - 0.12 + d, 0.07) : b > 0.15 ? step(2, b - 0.15 + d, 0.07) : a < -0.25 ? step(3, -0.25 - a + d, 0.07) : 0;
    } else if (k === HEATH) {
      const a = 0.7 * noise(x, y, 30, 81) + 0.3 * noise(x, y, 9, 82), b = 0.7 * noise(x, y, 40, 83) + 0.3 * noise(x, y, 12, 84);
      const d = ((hash(x, y, 85) & 255) / 255 - 0.5) * 0.04;
      out[j] = a > 0.1 ? step(6, a - 0.1 + d, 0.07) : b < -0.2 ? step(7, -0.2 - b + d, 0.07) : 0;
    }
  }
  return out;
}

let shadowSprite: HTMLCanvasElement | null = null;
/** Px of the shadow sprite (SHADOW_W x SHADOW_H): a soft ellipse along the tile x axis (the light falls toward +x). */
export const SHADOW_W = 128, SHADOW_H = 96;
/** The tree shadow sprite (made once). */
export function treeShadow(): HTMLCanvasElement {
  if (shadowSprite) return shadowSprite;
  const c = (shadowSprite = canvas(SHADOW_W, SHADOW_H));
  const g = c.getContext('2d')!;
  g.translate(SHADOW_W / 2, SHADOW_H / 2);
  g.rotate(Math.atan2(1, 2));
  g.scale(1, 0.36);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 56);
  gr.addColorStop(0, 'rgba(12,16,30,0.55)');
  gr.addColorStop(0.55, 'rgba(12,16,30,0.4)');
  gr.addColorStop(1, 'rgba(12,16,30,0)');
  g.fillStyle = gr;
  g.beginPath(); g.arc(0, 0, 56, 0, Math.PI * 2); g.fill();
  return c;
}

let foamCanvas: HTMLCanvasElement | null = null;
/** Px of the foam sprite. */
export const FOAM_W = 26, FOAM_H = 12;
/** A soft white spray blob for the shore (made once). */
export function foamSprite(): HTMLCanvasElement {
  if (foamCanvas) return foamCanvas;
  const c = (foamCanvas = canvas(FOAM_W, FOAM_H));
  const g = c.getContext('2d')!;
  g.translate(FOAM_W / 2, FOAM_H / 2);
  g.scale(1, FOAM_H / FOAM_W);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, FOAM_W / 2);
  gr.addColorStop(0, 'rgba(240,248,244,0.5)');
  gr.addColorStop(0.6, 'rgba(236,246,242,0.25)');
  gr.addColorStop(1, 'rgba(236,246,242,0)');
  g.fillStyle = gr;
  g.beginPath(); g.arc(0, 0, FOAM_W / 2, 0, Math.PI * 2); g.fill();
  return c;
}
