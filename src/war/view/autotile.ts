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
 * every tile, row-major. `zc` (optional): the level of each tile corner (k: 0 NW, 1 NE, 2 SW, 3 SE) where the ground is
 * ramped (src/war/view/iso.ts IsoMap.fc): corners meet on one surface when their levels match, and a vertex's
 * neighbours count as on its surface within a level per vertex step (a ramp, not a cliff).
 */
export function autotile(r: RegionData, z: ArrayLike<number>, T: TilesMeta, zc?: (c: number, k: number) => number): Autotile {
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
  // other levels meet them only across a wall, so each level keeps its own edge). A vertex's groups are numbered in
  // order: vertex v holds groups vStart[v] .. vStart[v + 1] - 1 (typed arrays, no per-vertex allocation: the hot path of
  // a region's bake)
  const G = new Int32Array(n * 4); // tile * 4 + corner (0 NW, 1 NE, 2 SW, 3 SE) -> group
  let cap = vw * (h + 1) + 16, ng = 0;
  let GV = new Uint8Array(cap), GZ = new Float64Array(cap);
  const vStart = new Int32Array(vw * (h + 1) + 1);
  const cnt = new Uint8Array(K), lz = new Float64Array(4), lc = new Int32Array(16), ln = new Int32Array(4);
  for (let vy = 0; vy <= h; vy++) for (let vx = 0; vx <= w; vx++) {
    vStart[vy * vw + vx] = ng;
    let nl = 0;
    for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
      const x = vx + dx, y = vy + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const c = y * w + x, k = (dx ? 1 : 0) + (dy ? 2 : 0);
      const zk = zc ? zc(c, k) : z[c];
      let j = 0;
      while (j < nl && lz[j] !== zk) j++;
      if (j === nl) { lz[nl] = zk; ln[nl++] = 0; }
      lc[j * 4 + ln[j]++] = c * 4 + k;
    }
    if (ng + nl > cap) { // grow
      cap *= 2;
      const v = new Uint8Array(cap), zz = new Float64Array(cap);
      v.set(GV); zz.set(GZ); GV = v; GZ = zz;
    }
    for (let j = 0; j < nl; j++) {
      // the commonest terrain of the group's cells, ties to the earlier one in `order`
      cnt.fill(0);
      for (let q = 0; q < ln[j]; q++) cnt[cell[lc[j * 4 + q] >> 2]]++;
      let best = 0;
      for (let t = 1; t < K; t++) if (cnt[t] > cnt[best]) best = t;
      const g = ng++;
      GV[g] = best; GZ[g] = lz[j];
      for (let q = 0; q < ln[j]; q++) G[lc[j * 4 + q]] = g;
    }
  }
  vStart[vw * (h + 1)] = ng;
  /** Groups a and b, d vertex steps apart, on one surface. */
  const same = zc ? (a: number, b: number, d: number) => Math.abs(GZ[a] - GZ[b]) <= d + 1e-4 : (a: number, b: number) => GZ[a] === GZ[b];
  // the smoothing's neighbourhood: vertex offsets within R (and the corners just past it) and their step counts
  const OFF: number[] = [];
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= R * R + 1) OFF.push(dx, dy, Math.max(Math.abs(dx), Math.abs(dy)));

  // smoothing: a vertex outvoted by its 3 x 3 neighbourhood on its level joins the majority, so the
  // cells' steps and single-tile teeth become runs of straight and diagonal edges. A pass after the first looks only
  // at vertices with a change of the pass before in reach (elsewhere it would decide just the same: nothing)
  const prev = new Uint8Array(ng), nv = vw * (h + 1);
  let need: Uint8Array | null = null;
  for (let it = 0; it < SMOOTH; it++) {
    prev.set(GV.subarray(0, ng));
    const moved = it + 1 < SMOOTH ? new Uint8Array(nv) : null;
    for (let vy = 0; vy <= h; vy++) for (let vx = 0; vx <= w; vx++) {
      if (need && !need[vy * vw + vx]) continue;
      for (let g = vStart[vy * vw + vx]; g < vStart[vy * vw + vx + 1]; g++) {
        const pg = prev[g];
        if (pg === ROAD || pg === PAVING) continue; // roads and paved streets are lines: they keep their width
        for (let t = 0; t < K; t++) cnt[t] = 0;
        let all = 0;
        const gz = GZ[g];
        for (let o = 0; o < OFF.length; o += 3) {
          const x = vx + OFF[o], y = vy + OFF[o + 1];
          if (x < 0 || y < 0 || x > w || y > h) continue;
          const lim = OFF[o + 2] + 1e-4, v = y * vw + x;
          for (let b = vStart[v]; b < vStart[v + 1]; b++) if (zc ? Math.abs(GZ[b] - gz) <= lim : GZ[b] === gz) { cnt[prev[b]]++; all++; }
        }
        let best = pg;
        for (let t = 0; t < K; t++) if (t !== ROAD && t !== PAVING && cnt[t] > cnt[best]) best = t;
        if (best !== pg && cnt[best] * 2 > all) { GV[g] = best; if (moved) moved[vy * vw + vx] = 1; }
      }
    }
    if (!moved) continue;
    need = new Uint8Array(nv);
    for (let v = 0; v < nv; v++) if (moved[v]) {
      const vx = v % vw, vy = (v / vw) | 0;
      for (let o = 0; o < OFF.length; o += 3) {
        const x = vx + OFF[o], y = vy + OFF[o + 1];
        if (x >= 0 && y >= 0 && x <= w && y <= h) need[y * vw + x] = 1;
      }
    }
  }

  // (1) shores get a shallow band
  const V0 = GV.slice(0, ng);
  for (let vy = 0; vy <= h; vy++) for (let vx = 0; vx <= w; vx++) {
    for (let g = vStart[vy * vw + vx]; g < vStart[vy * vw + vx + 1]; g++) {
      if (V0[g] !== DEEP) continue;
      let land = false;
      for (let dy = -1; dy <= 1 && !land; dy++) for (let dx = -1; dx <= 1 && !land; dx++) {
        const x = vx + dx, y = vy + dy;
        if (x < 0 || y < 0 || x > w || y > h) continue;
        for (let b = vStart[y * vw + x]; b < vStart[y * vw + x + 1]; b++) if (same(b, g, 0) && !isWater(V0[b])) land = true;
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
  // a tile is settled again only when a corner of it changed since it was last settled (from the same corners it would
  // change nothing again): stamp per group of its last change, per tile the clock when it was last settled
  // (and a row of tiles only when a corner on it changed since it was last scanned)
  const stamp = new Int32Array(ng), seen = new Int32Array(n).fill(-1), gRow = new Int32Array(ng), dirty = new Uint8Array(h).fill(1);
  for (let v = 0; v < nv; v++) for (let g = vStart[v]; g < vStart[v + 1]; g++) gRow[g] = (v / vw) | 0;
  let clock = 0;
  const set = (g: number, v: number) => {
    GV[g] = v; stamp[g] = ++clock;
    const vy = gRow[g];
    if (vy > 0) dirty[vy - 1] = 1;
    if (vy < h) dirty[vy] = 1;
  };
  for (let pass = 0, changed = true; changed && pass < 30; pass++) {
    changed = false;
    for (let y = 0; y < h; y++) {
      if (!dirty[y]) continue;
      dirty[y] = 0;
      for (let x = 0; x < w; x++) {
        const i = y * w + x, t4 = i * 4, sn = seen[i];
        if (sn >= 0 && stamp[G[t4]] <= sn && stamp[G[t4 + 1]] <= sn && stamp[G[t4 + 2]] <= sn && stamp[G[t4 + 3]] <= sn) continue;
        seen[i] = clock;
        corners(x, y);
        if (ts[0] === ts[1] && ts[0] === ts[2] && ts[0] === ts[3]) continue;
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
          const a = ts[i], b = ts[j];
          if (a >= b || pair[a * K + b] >= 0) continue;
          const lose = isWater(a) !== isWater(b) ? (isWater(a) ? b : a) : Math.min(a, b);
          if (lose === GRASS) continue;
          for (let k = 0; k < 4; k++) if (GV[ci[k]] === lose) { set(ci[k], GRASS); changed = true; }
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
        for (let k = 0; k < 4; k++) if (ts[k] === lose) { set(ci[k], to); changed = true; }
      }
    }
  }

  // (3) frames
  const code = new Int16Array(n);
  let missing = 0, approx = 0;
  // per terrain: its variant's frame count, or the frame of a sheet whole in it
  const frames = Array.from({ length: K }, (_, t) => (variant[t] >= 0 ? T.variants![variant[t]].frames : 0));
  const whole = Array.from({ length: K }, (_, t) => { const s = sheetFirst.findIndex((f, k) => f === t || sheetSecond[k] === t); return s < 0 ? -1 : s * 16 + (sheetFirst[s] === t ? 15 : 0); });
  const full = (t: number, x: number, y: number) => (variant[t] >= 0 ? VARIANT + variant[t] * 16 + (hash(x, y) % frames[t]) : whole[t]);
  const kinds = new Int32Array(4);
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
    // its terrains in first-seen order, stably sorted by count, most first
    let nk = 0;
    for (let k = 0; k < 4; k++) {
      let j = 0;
      while (j < nk && kinds[j] !== ts[k]) j++;
      if (j < nk) continue;
      j = nk++;
      while (j > 0 && c4[kinds[j - 1]] < c4[ts[k]]) { kinds[j] = kinds[j - 1]; j--; }
      kinds[j] = ts[k];
    }
    let s = -1;
    for (let a = 0; a < nk && s < 0; a++) for (let b = a + 1; b < nk && s < 0; b++) s = pair[kinds[a] * K + kinds[b]];
    if (s < 0) { // the rule did not settle here: the cell's own terrain, whole
      code[i] = full(cell[i], x, y);
      approx++;
      if (code[i] < 0) missing++;
      continue;
    }
    if (nk > 2) approx++;
    let m = 0;
    for (let k = 0; k < 4; k++) if (ts[k] !== sheetSecond[s]) m |= 1 << (3 - k);
    code[i] = s * 16 + T.sheets[s].maskToFrame[m];
  }
  return { code, missing, approx };
}
