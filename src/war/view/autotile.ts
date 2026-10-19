/**
 * Autotiling of a region onto the PixelLab iso Wang sets of public/war/tiles/tiles.json (W-20).
 * Pure (no DOM): the art baker and the tests share it.
 *
 * Corner terrain lives on the map's vertices: a vertex takes the terrain of the cells sharing it
 * whose surface is highest (so a plateau, a mountain or a bank keeps its own edge and the ground
 * below a wall takes the scree or the bank fringe), the commonest of those, ties to the earlier
 * terrain in `fallback.order` (water, then marsh, sand ... grass last). Then the tiles.json fallback
 * rule (scripts/war/art/preview.mjs resolve()) settles pairs with no sheet, and each tile draws the
 * frame of its corner mask NW<<3|NE<<2|SW<<1|SE (NW = top vertex, set bit = the sheet's first
 * terrain); full tiles draw a variant by position hash.
 */
import type { RegionData } from '../types';

export interface TileSheetMeta { pair: string; first: string; second: string; file: string; maskToFrame: number[] }
export interface TilesMeta {
  sheets: TileSheetMeta[];
  variants?: { terrain: string; file: string; frames: number }[];
  fallback: { order: string[] };
  cliffs?: { id: string; file: string }[];
}

/** Per tile: sheet * 16 + frame, VARIANT + variant * 16 + frame, or -1 (no sheet fits). */
export const VARIANT = 1024;

export const hash = (x: number, y: number, k = 0) => ((x * 73856093) ^ (y * 19349663) ^ (k * 83492791)) >>> 0;

export interface Autotile { code: Int16Array; missing: number; approx: number }

/**
 * `z`: surface level per cell (the art draws all water at one level). Returns the frame code of
 * every tile, row-major.
 */
export function autotile(r: RegionData, z: ArrayLike<number>, T: TilesMeta): Autotile {
  const order = T.fallback.order, K = order.length;
  const id = (t: string) => { const i = order.indexOf(t); return i < 0 ? order.indexOf('grass') : i; };
  const DEEP = id('deep'), SHALLOW = id('shallow'), GRASS = id('grass');
  const isWater = (t: number) => t === DEEP || t === SHALLOW;
  const pair = new Int16Array(K * K).fill(-1);
  T.sheets.forEach((s, i) => { pair[id(s.first) * K + id(s.second)] = i; pair[id(s.second) * K + id(s.first)] = i; });
  const variant = new Int16Array(K).fill(-1);
  (T.variants ?? []).forEach((v, i) => (variant[id(v.terrain)] = i));
  const sheetFirst = T.sheets.map((s) => id(s.first)), sheetSecond = T.sheets.map((s) => id(s.second));

  const { w, h } = r, vw = w + 1, n = w * h;
  const cell = new Uint8Array(n);
  for (let i = 0; i < n; i++) cell[i] = r.water[i] === 2 ? DEEP : r.water[i] === 1 ? SHALLOW : id(r.terrain[i]);

  // vertex terrain: the commonest terrain among the highest cells round the vertex
  const V = new Uint8Array(vw * (h + 1));
  const cnt = new Uint8Array(K);
  for (let vy = 0; vy <= h; vy++) for (let vx = 0; vx <= w; vx++) {
    let top = -Infinity;
    for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
      const x = vx + dx, y = vy + dy;
      if (x >= 0 && y >= 0 && x < w && y < h) top = Math.max(top, z[y * w + x]);
    }
    cnt.fill(0);
    for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
      const x = vx + dx, y = vy + dy;
      if (x >= 0 && y >= 0 && x < w && y < h && z[y * w + x] >= top - 1e-3) cnt[cell[y * w + x]]++;
    }
    let best = 0;
    for (let t = 1; t < K; t++) if (cnt[t] > cnt[best]) best = t;
    V[vy * vw + vx] = best;
  }

  // (1) shores get a shallow band
  const V0 = V.slice();
  for (let vy = 0; vy <= h; vy++) for (let vx = 0; vx <= w; vx++) {
    if (V0[vy * vw + vx] !== DEEP) continue;
    let land = false;
    for (let dy = -1; dy <= 1 && !land; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = vx + dx, y = vy + dy;
      if (x >= 0 && y >= 0 && x <= w && y <= h && !isWater(V0[y * vw + x])) { land = true; break; }
    }
    if (land) V[vy * vw + vx] = SHALLOW;
  }

  // (2) pairs with no sheet get a grass buffer; 3+ terrains: the minority joins the majority
  const ci = new Int32Array(4), ts = new Uint8Array(4), c4 = new Uint8Array(K);
  const corners = (x: number, y: number) => {
    ci[0] = y * vw + x; ci[1] = ci[0] + 1; ci[2] = ci[0] + vw; ci[3] = ci[2] + 1;
    for (let k = 0; k < 4; k++) ts[k] = V[ci[k]];
  };
  for (let pass = 0, changed = true; changed && pass < 30; pass++) {
    changed = false;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      corners(x, y);
      if (ts[0] === ts[1] && ts[0] === ts[2] && ts[0] === ts[3]) continue;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const a = ts[i], b = ts[j];
        if (a >= b || pair[a * K + b] >= 0) continue;
        const lose = isWater(a) !== isWater(b) ? (isWater(a) ? b : a) : Math.min(a, b);
        if (lose === GRASS) continue;
        for (let k = 0; k < 4; k++) if (V[ci[k]] === lose) { V[ci[k]] = GRASS; changed = true; }
      }
      corners(x, y);
      c4.fill(0);
      let kinds = 0;
      for (let k = 0; k < 4; k++) if (c4[ts[k]]++ === 0) kinds++;
      if (kinds < 3) continue;
      // grass corners give way to the commonest other terrain (grass only shrinks, so this ends); else the rarest gives way
      let lose = -1;
      if (c4[GRASS]) lose = GRASS;
      else for (let t = 0; t < K; t++) if (c4[t] && (lose < 0 || c4[t] < c4[lose] || (c4[t] === c4[lose] && t < lose))) lose = t;
      let to = -1;
      for (let t = K - 1; t >= 0; t--) if (t !== lose && c4[t] && (to < 0 || c4[t] > c4[to])) to = t;
      for (let k = 0; k < 4; k++) if (ts[k] === lose) { V[ci[k]] = to; changed = true; }
    }
  }

  // (3) frames
  const code = new Int16Array(n);
  let missing = 0, approx = 0;
  const full = (t: number, x: number, y: number) => {
    const v = variant[t];
    if (v >= 0) return VARIANT + v * 16 + (hash(x, y) % T.variants![v].frames);
    const s = sheetFirst.findIndex((f, k) => f === t || sheetSecond[k] === t);
    return s < 0 ? -1 : s * 16 + (sheetFirst[s] === t ? 15 : 0);
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    corners(x, y);
    const i = y * w + x;
    if (ts[0] === ts[1] && ts[0] === ts[2] && ts[0] === ts[3]) {
      code[i] = full(ts[0], x, y);
      if (code[i] < 0) missing++;
      continue;
    }
    // the commonest pair with a sheet; other corners count as its first terrain
    c4.fill(0);
    for (let k = 0; k < 4; k++) c4[ts[k]]++;
    const kinds = [...new Set(ts)].sort((a, b) => c4[b] - c4[a]);
    let s = -1;
    for (let a = 0; a < kinds.length && s < 0; a++) for (let b = a + 1; b < kinds.length && s < 0; b++) s = pair[kinds[a] * K + kinds[b]];
    if (s < 0) { // the rule did not settle here: the cell's own terrain, whole
      code[i] = full(cell[i], x, y);
      approx++;
      if (code[i] < 0) missing++;
      continue;
    }
    if (kinds.length > 2) approx++;
    let m = 0;
    for (let k = 0; k < 4; k++) if (ts[k] !== sheetSecond[s]) m |= 1 << (3 - k);
    code[i] = s * 16 + T.sheets[s].maskToFrame[m];
  }
  return { code, missing, approx };
}
