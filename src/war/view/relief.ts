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

/** Light step per shade code. */
const STEP = 0.02;
/** Shade codes each side of 0. */
const NS = 24;
const WATER0 = 1 + 2 * NS + 1, NWATER = 15;
const WET0 = WATER0 + NWATER, NWET = 6;

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
function noise(x: number, y: number, s: number, k: number): number {
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
  const shoreF = blur(sf, fw, fh, 1);
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
      out[j] = WATER0 + Math.max(0, Math.min(NWATER - 1, Math.round(shoreF[j] - 1 + ((hash(x, y, 6) & 255) / 255 - 0.5) * 0.9 + (shoreF[j] > 9 ? (shoreF[j] - 9) * 0.5 : 0))));
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

let shadowSprite: HTMLCanvasElement | null = null;
/** Px of the shadow sprite (SHADOW_W x SHADOW_H): a soft ellipse along the tile x axis (the light falls toward +x). */
export const SHADOW_W = 128, SHADOW_H = 96;
/** The tree shadow sprite (made once). */
export function treeShadow(): HTMLCanvasElement {
  if (shadowSprite) return shadowSprite;
  const c = (shadowSprite = document.createElement('canvas'));
  c.width = SHADOW_W; c.height = SHADOW_H;
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
  const c = (foamCanvas = document.createElement('canvas'));
  c.width = FOAM_W; c.height = FOAM_H;
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
