/**
 * Autotiling of a region onto the PixelLab iso Wang sets of public/war/tiles/tiles.json (W-20).
 * Pure (no DOM): the art baker and the tests share it.
 *
 * Corner terrain lives on the map's vertices, one value per vertex and surface level: the commonest
 * terrain of the cells sharing the vertex on that level, ties to the earlier terrain in
 * `fallback.order` (water, then marsh, sand ... grass last). Tiles on different levels meet only
 * across a wall, so a plateau, a mountain or a bank keeps its own edge and the ground below too. Then the tiles.json fallback
 * rule (scripts/war/art/preview.mjs resolve()) settles pairs with no sheet (a biome set's
 * fallback.buffer.land, e.g. Kyrene's sand, takes grass's place as the buffer), and each tile draws the
 * frame of its corner mask NW<<3|NE<<2|SW<<1|SE (NW = top vertex, set bit = the sheet's first
 * terrain); full tiles draw a variant by position hash.
 */
import type { RegionData } from '../types';

export interface TileSheetMeta { pair: string; first: string; second: string; file: string; maskToFrame: number[] }
export interface TilesMeta {
  sheets: TileSheetMeta[];
  variants?: { terrain: string; file: string; frames: number }[];
  /** buffer.land: the land terrain pairs with no sheet give way to (grass; sand in a desert biome). */
  fallback: { order: string[]; buffer?: { land?: string } };
  cliffs?: { id: string; file: string }[];
}

/** Per tile: sheet * 16 + frame, VARIANT + variant * 16 + frame, or -1 (no sheet fits). */
export const VARIANT = 1024;
/** Majority passes over the vertex terrain. */
const SMOOTH = 2;
/** Their radius in vertices. */
const R = 2;

export const hash = (x: number, y: number, k = 0) => ((x * 73856093) ^ (y * 19349663) ^ (k * 83492791)) >>> 0;

export interface Autotile { code: Int16Array; missing: number; approx: number }

/**
 * `z`: surface level per cell (the art draws all water at one level). Returns the frame code of
 * every tile, row-major.
 */
export function autotile(r: RegionData, z: ArrayLike<number>, T: TilesMeta): Autotile {
  const order = T.fallback.order, K = order.length;
  const BUF = order.indexOf(T.fallback.buffer?.land ?? 'grass'); // terrains this set does not know draw as the buffer
  const id = (t: string) => { const i = order.indexOf(t); return i < 0 ? BUF : i; };
  const DEEP = id('deep'), SHALLOW = id('shallow'), GRASS = BUF, ROAD = id('road'), PAVING = order.indexOf('paving');
  const isWater = (t: number) => t === DEEP || t === SHALLOW;
  const pair = new Int16Array(K * K).fill(-1);
  // sheets and variants of terrains the set's order leaves out are not used
  const known = (t: string) => order.indexOf(t);
  T.sheets.forEach((s, i) => { const a = known(s.first), b = known(s.second); if (a >= 0 && b >= 0) { pair[a * K + b] = i; pair[b * K + a] = i; } });
  const variant = new Int16Array(K).fill(-1);
  (T.variants ?? []).forEach((v, i) => { if (known(v.terrain) >= 0) variant[known(v.terrain)] = i; });
  const sheetFirst = T.sheets.map((s) => known(s.first)), sheetSecond = T.sheets.map((s) => known(s.second));

  const { w, h } = r, vw = w + 1, n = w * h;
  const cell = new Uint8Array(n);
  for (let i = 0; i < n; i++) cell[i] = r.water[i] === 2 ? DEEP : r.water[i] === 1 ? SHALLOW : id(r.terrain[i]);

  // corner groups: the tile corners at one vertex on one surface level share a terrain (tiles on
  // other levels meet them only across a wall, so each level keeps its own edge)
  const G = new Int32Array(n * 4); // tile * 4 + corner (0 NW, 1 NE, 2 SW, 3 SE) -> group
  const GV: number[] = [], GZ: number[] = [];
  const vStart = new Int32Array(vw * (h + 1) + 1), vGroups: number[] = [];
  const cnt = new Uint8Array(K), lz: number[] = [], lc: number[][] = [];
  for (let vy = 0; vy <= h; vy++) for (let vx = 0; vx <= w; vx++) {
    vStart[vy * vw + vx] = vGroups.length;
    lz.length = 0; lc.length = 0;
    for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
      const x = vx + dx, y = vy + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const c = y * w + x, k = (dx ? 1 : 0) + (dy ? 2 : 0);
      let j = lz.indexOf(z[c]);
      if (j < 0) { j = lz.length; lz.push(z[c]); lc.push([]); }
      lc[j].push(c * 4 + k);
    }
    for (let j = 0; j < lz.length; j++) {
      // the commonest terrain of the group's cells, ties to the earlier one in `order`
      cnt.fill(0);
      for (const ck of lc[j]) cnt[cell[ck >> 2]]++;
      let best = 0;
      for (let t = 1; t < K; t++) if (cnt[t] > cnt[best]) best = t;
      const g = GV.length;
      GV.push(best); GZ.push(lz[j]); vGroups.push(g);
      for (const ck of lc[j]) G[ck] = g;
    }
  }
  vStart[vw * (h + 1)] = vGroups.length;

  // smoothing: a vertex outvoted by its 3 x 3 neighbourhood on its level joins the majority, so the
  // cells' steps and single-tile teeth become runs of straight and diagonal edges
  for (let it = 0; it < SMOOTH; it++) {
    const prev = GV.slice();
    for (let vy = 0; vy <= h; vy++) for (let vx = 0; vx <= w; vx++) {
      for (let a = vStart[vy * vw + vx]; a < vStart[vy * vw + vx + 1]; a++) {
        const g = vGroups[a];
        cnt.fill(0);
        let all = 0;
        if (prev[g] === ROAD || prev[g] === PAVING) continue; // roads and paved streets are lines: they keep their width
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
          const x = vx + dx, y = vy + dy;
          if (x < 0 || y < 0 || x > w || y > h || dx * dx + dy * dy > R * R + 1) continue;
          for (let b = vStart[y * vw + x]; b < vStart[y * vw + x + 1]; b++) if (GZ[vGroups[b]] === GZ[g]) { cnt[prev[vGroups[b]]]++; all++; }
        }
        let best = prev[g];
        for (let t = 0; t < K; t++) if (t !== ROAD && t !== PAVING && cnt[t] > cnt[best]) best = t;
        if (best !== prev[g] && cnt[best] * 2 > all) GV[g] = best;
      }
    }
  }

  // (1) shores get a shallow band
  const V0 = GV.slice();
  for (let vy = 0; vy <= h; vy++) for (let vx = 0; vx <= w; vx++) {
    for (let a = vStart[vy * vw + vx]; a < vStart[vy * vw + vx + 1]; a++) {
      const g = vGroups[a];
      if (V0[g] !== DEEP) continue;
      let land = false;
      for (let dy = -1; dy <= 1 && !land; dy++) for (let dx = -1; dx <= 1 && !land; dx++) {
        const x = vx + dx, y = vy + dy;
        if (x < 0 || y < 0 || x > w || y > h) continue;
        for (let b = vStart[y * vw + x]; b < vStart[y * vw + x + 1]; b++) if (GZ[vGroups[b]] === GZ[g] && !isWater(V0[vGroups[b]])) land = true;
      }
      if (land) GV[g] = SHALLOW;
    }
  }

  // (2) pairs with no sheet get the buffer (GRASS: grass, or the set's buffer.land); 3+ terrains: the minority joins the majority
  const ci = new Int32Array(4), ts = new Uint8Array(4), c4 = new Uint8Array(K);
  const corners = (x: number, y: number) => {
    const t4 = (y * w + x) * 4;
    for (let k = 0; k < 4; k++) { ci[k] = G[t4 + k]; ts[k] = GV[ci[k]]; }
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
        for (let k = 0; k < 4; k++) if (GV[ci[k]] === lose) { GV[ci[k]] = GRASS; changed = true; }
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
      for (let k = 0; k < 4; k++) if (ts[k] === lose) { GV[ci[k]] = to; changed = true; }
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
