/**
 * Writes the test region src/war/regions/test-ridge.json (SIZE x SIZE tiles, default 256) and its named spots
 * src/war/regions/test-ridge.spots.ts (tests and the bench place squads by name, not by number).
 * Hand-placed organic features (./shapes.ts gives curves and noisy blobs, noise only roughens edges):
 *  - a deep river winding north to south, east of centre, with one ford and one road bridge;
 *  - a mountain chain from the west edge to the river (rock, impassable) cut by one narrow
 *    switchback pass road that climbs over a saddle in 1-step ramps;
 *  - NW: a ridge, gentle 1-step slopes (one level per 2.5 tiles) on its south side and a cliff on its north side;
 *  - NE: a high plateau ringed by cliffs, reached only by a ramp road (the fort spot);
 *  - forest (big wood SE plus copses), marsh with pools on the west bank, a sand patch with dunes (SE);
 *  - roads linking the four entries over the ford, the bridge and the pass.
 * Heights: grass 1, river bed 0, foothills 2, ridge crest and plateau 5, mountains 5 (rim) and 7 (core).
 * Every 2+ level step between walkable tiles is a deliberate cliff (ridge north face, plateau rim).
 *
 * The visual layer (RegionData.visual, src/war/regions/visual.ts) is the same land generated again at
 * twice the size (1 m cells, the script runs itself with `fine`), so coasts and borders follow the
 * shapes' sub-tile curves. There the mountain rock rises far above the sim's levels (a 1-level scree
 * foot, then steep flanks in 3-level cliff steps up to ridged summits of up to ZVIS, snow on the
 * highest; never tall enough in front of a road to hide it); the sim keeps rock impassable at 5..7. Map objects stand only where the fine cell under the foot has
 * their terrain and no ground in front hides the foot.
 *
 * Features are authored in units of a 256-wide map (one unit = one tile at the default size); SIZE
 * scales them all, widths and slope lengths included, so a bigger map is the same land in finer tiles.
 *
 *   node scripts/war/buildTestRidge.ts [size] [outDir]   (default 256, src/war/regions)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blob, curveField, fbm, nearestSample, noise, spline, type Pt, type Sample } from './shapes.ts';
import { decodeVisual, encodeBiomes, encodeVisual, KINDS, ZVIS } from '../../src/war/regions/visual.ts';
import { footprintTiles, OBJECT_BLOCKS } from '../../src/war/region/objects.ts';

const SIZE = Number(process.argv[2] ?? 256);
/** `fine`: write only the visual layer of this size (test-ridge.fine.json) and stop. */
const FINE = process.argv[4] === 'fine';
const K = SIZE / 256; // tiles per authoring unit
const W = SIZE;
const H = SIZE;
const N = W * H;
const height = new Array<number>(N).fill(1);
const terrain = new Array<string>(N).fill('grass');
const water = new Array<number>(N).fill(0);
/** Unit coordinate of tile index t (the tile's centre maps to t + 0.5 in tiles), and back. */
const toUnit = (t: number) => (t + 0.5) / K - 0.5;
const toTile = (u: number) => (u + 0.5) * K - 0.5;
/** Calls f for every tile with its index and its position in authoring units. */
const each = (f: (i: number, x: number, y: number) => void) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) f(y * W + x, toUnit(x), toUnit(y));
};
const field = (c: Sample[], reach: number) => curveField(c, W, H, reach, K);
const r1 = (v: number) => Math.round(v * 10) / 10;
const pt = (p: { x: number; y: number }): Pt => [p.x, p.y];
/** Point at distance k from sample p along its normal (+ = right of travel). */
const off = (p: Sample, k: number): Pt => [p.x - p.ty * k, p.y + p.tx * k];

// ---- ridge (NW): crest at 5 along a curve; south side steps down one level per 2.5 tiles, north side is a cliff
const RIDGE = spline([[18, 58], [40, 42], [66, 44], [88, 50], [108, 36]]);
const RIDGE_LEN = RIDGE[RIDGE.length - 1].s;
{
  const f = field(RIDGE, 30);
  each((i, x, y) => {
    if (f.d[i] === Infinity) return;
    const crest = 1 + 2 * Math.sin((Math.PI * f.s[i]) / RIDGE_LEN); // flat top, widest in the middle
    const e = f.d[i] + fbm(x, y, 9, 11);
    const h = f.side[i] > 0 ? 5 - Math.floor(Math.max(0, e - crest) / 2.5) : e <= crest ? 5 : 1;
    if (h > height[i]) height[i] = h;
  });
}

// ---- plateau (NE): flat top at 5 ringed by cliffs; the fort ground is bare dirt
const PLATEAU: Pt = [214, 50];
each((i, x, y) => {
  const e = blob(x, y, PLATEAU[0], PLATEAU[1], 25, 17, 0.35, 3, 21);
  if (e > 0) height[i] = 5;
  if (blob(x, y, PLATEAU[0] + 2, PLATEAU[1] - 1, 6, 5, 0, 1.5, 22) > 0) terrain[i] = 'dirt';
});
// the ramp road climbs the south-west rim, one level per 4 tiles
const RAMP = spline([[170, 80], [180, 83], [190, 79], [198, 71], [204, 62], [208, 56]]);
{
  const f = field(RAMP, 3);
  each((i) => {
    if (f.d[i] > 2) return;
    height[i] = Math.min(5, 1 + Math.floor(f.s[i] / 5));
    terrain[i] = 'road';
  });
}

// ---- mountain chain: rock 5..7 inside a noisy band, foothills at 2 around it
const CHAIN = spline([[-8, 146], [20, 136], [48, 150], [80, 142], [112, 154], [146, 138], [180, 144]]);
const SPURS: [number, number, number, number, number][] = [[72, 160, 18, 8, 0], [74, 128, 15, 5, 0], [36, 128, 12, 6, -0.5], [100, 166, 13, 7, 0.4], [134, 128, 9, 5, 0.8], [12, 160, 10, 6, 0.2]];
const chainDepth = new Float32Array(N).fill(-Infinity);
{
  const f = field(CHAIN, 30);
  each((i, x, y) => {
    let e = f.d[i] === Infinity ? -Infinity : 13 + 4 * Math.sin(f.s[i] / 29) - f.d[i] + 4 * fbm(x, y, 12, 31) + 1.5 * fbm(x, y, 4, 32);
    for (const [cx, cy, rx, ry, rot] of SPURS) e = Math.max(e, blob(x, y, cx, cy, rx, ry, rot, 3, 33));
    if (e === -Infinity) return;
    chainDepth[i] = e;
    if (e > 0) {
      height[i] = e < 4 ? 5 : 7; // two tall bands, no 1-level terraces (the visual layer draws the real mass)
      terrain[i] = 'rock';
    } else if (e > -5 && height[i] < 2) height[i] = 2;
  });
}

// ---- terrain patches
const FOREST: [number, number, number, number, number][] = [
  [204, 180, 26, 14, -0.3], // the big wood, SE
  [22, 112, 10, 7, 0.5],
  [118, 214, 15, 9, 0.2],
  [238, 18, 11, 8, -0.4],
  [90, 70, 8, 5, 0.1], // on the ridge's south slope
  [112, 112, 5, 4, 0],
  [236, 168, 6, 4, 0.7],
  [40, 230, 9, 6, -0.2],
];
// low rounded hills, one level per 3 tiles up to 3
const HILLS: [number, number, number, number, number][] = [[36, 198, 14, 9, 0.3], [16, 26, 12, 8, -0.2], [236, 78, 10, 7, 0.5], [96, 236, 12, 7, 0.1]];
each((i, x, y) => {
  HILLS.forEach(([cx, cy, rx, ry, rot], k) => {
    const e = blob(x, y, cx, cy, rx, ry, rot, 2.5, 90 + k);
    if (e > 0) height[i] = Math.max(height[i], Math.min(3, 2 + Math.floor(e / 3)));
  });
});
const MARSH: Pt = [146, 110];
const SAND: Pt = [222, 232];
each((i, x, y) => {
  FOREST.forEach(([cx, cy, rx, ry, rot], k) => {
    if (blob(x, y, cx, cy, rx, ry, rot, 3.5, 40 + k) > 0 && terrain[i] === 'grass') terrain[i] = 'forest';
  });
  const m = Math.max(blob(x, y, MARSH[0], MARSH[1], 14, 8, 0.9, 4, 51), blob(x, y, MARSH[0] + 6, MARSH[1] - 14, 9, 6, 0.6, 3, 52));
  if (m > 0 && terrain[i] === 'grass' && height[i] === 1) terrain[i] = 'marsh';
  if (blob(x, y, SAND[0], SAND[1], 27, 16, -0.15, 4, 61) > 0 && terrain[i] !== 'rock') {
    terrain[i] = 'sand';
    if (blob(x, y, 214, 228, 7, 3, 0.6, 1, 62) > 0 || blob(x, y, 234, 238, 6, 3, 0.4, 1, 63) > 0) height[i] = 2; // dunes
  }
});
// marsh pools (deep, small)
for (const [cx, cy, r] of [[141, 108, 2.4], [150, 114, 1.8], [146, 104, 1.5], [154, 96, 2], [139, 116, 1.4]])
  each((i, x, y) => {
    if (blob(x, y, cx, cy, r, r * 0.8, 0, 0.6, 70) > 0) (water[i] = 2), (height[i] = 0), (terrain[i] = 'marsh');
  });

// ---- river: deep, about 7 wide, bed at 0; carved over everything
const RIVER = spline([[146, -6], [160, 18], [138, 44], [142, 72], [170, 92], [184, 120], [168, 150], [148, 172], [152, 198], [176, 220], [162, 262]]);
const ford = nearestSample(RIVER.filter((p) => p.y > 50), 140, 60);
const bridge = nearestSample(RIVER.filter((p) => p.y > 180), 154, 200);
const river = field(RIVER, 12);
const riverHalf = (i: number, x: number, y: number) => 3.8 + 1.1 * fbm(x, y, 10, 81) + 0.7 * Math.sin(river.s[i] / 23);
each((i, x, y) => {
  const d = river.d[i];
  if (d === Infinity) return;
  const half = riverHalf(i, x, y);
  const atFord = Math.abs(river.s[i] - ford.s);
  if (d <= half) {
    height[i] = 0;
    terrain[i] = atFord <= 2.5 ? 'sand' : 'dirt';
    water[i] = atFord <= 2.5 ? 1 : 2;
  } else if (terrain[i] !== 'rock' && ((atFord <= 7 && d <= half + 3) || (d <= half + 2.5 && fbm(x, y, 6, 82) > 0.25))) terrain[i] = 'sand'; // shoals by the ford, gravel banks
});

// ---- roads: W - ford - E, N down to it, and the pass road from it over the bridge to S
const across = (p: Sample, sign: 1 | -1, ks: number[]) => ks.map((k) => off(p, sign * k));
// the ford's west bank is on the right of the river's travel (it flows south)
const ROADS: Pt[][] = [
  [[-4, 86], [30, 90], [64, 95], [96, 86], [118, 74], ...across(ford, 1, [16, 8]), ...across(ford, -1, [8, 16]), [174, 86], [204, 102], [232, 110], [260, 112]],
  [[96, -4], [104, 14], [124, 30], [128, 52], [118, 72]],
  [
    [64, 95], [62, 106], [58, 118], // to the pass
    [60, 126], [66, 131], [84, 132], [89, 136], [88, 141], [82, 144], [62, 144], [56, 147], [55, 152], [60, 156], [80, 156], [86, 160], [84, 166], [74, 170], // switchbacks
    [68, 182], [84, 194], [106, 198], [128, 202], ...across(bridge, 1, [16, 8]), ...across(bridge, -1, [8, 16]), [188, 214], [200, 234], [200, 260],
  ],
];
const PASS_ROAD = 2;
const SADDLE: Pt = [72, 144]; // middle of the switchbacks
let saddle = { i: -1, h: 0, d: Infinity };
/** Distance to the nearest road's centre line (units, Infinity beyond 8). */
const roadDist = new Float32Array(N).fill(Infinity);
ROADS.forEach((pts, k) => {
  const f = field(spline(pts), 8);
  each((i) => {
    roadDist[i] = Math.min(roadDist[i], f.d[i]);
    if (f.d[i] > 1.6) return;
    if (water[i] === 1) return; // the ford stays a sandy shallow
    if (water[i] === 2) {
      if (river.d[i] === Infinity || Math.abs(river.s[i] - bridge.s) > 4) return; // only the bridge deck spans water
      water[i] = 0;
      height[i] = 1;
    } else if (terrain[i] === 'rock') {
      if (k !== PASS_ROAD) return;
      // the pass climbs with the mountain's depth: 2 at the foothills up to 4 on the saddle
      height[i] = Math.min(4, 2 + Math.floor(Math.max(0, chainDepth[i]) / 5));
      const d = Math.hypot(toUnit(i % W) - SADDLE[0], toUnit(Math.floor(i / W)) - SADDLE[1]);
      if (height[i] > saddle.h || (height[i] === saddle.h && d < saddle.d)) saddle = { i, h: height[i], d };
    }
    terrain[i] = 'road';
  });
});

// ---- biomes (W-21 libraries, public/war/biomes/): the mountains biome over the chain and its foothills, Kyrene
// (desert) over the south-east sand patch (clear of the south road), Elaia (dry Mediterranean hills) over the ridge's
// slopes and the plateau. Each zone has a depth (units inside its edge); biome terrains only start 2 units in, so a
// zone's edge runs through terrains every set knows and the sets meet without a seam.
const BIOMES = ['global', 'elaia', 'kyrene', 'mountains'] as const;
const OASIS: Pt = [232, 222];
const VINEYARD: [number, number, number, number, number] = [44, 63, 7, 3.5, 0.15];
const GROVES: [number, number, number, number, number][] = [[74, 61, 6, 3.5, -0.1], [26, 54, 5, 3, 0.3], [200, 66, 5, 3, 0.4]];
const MARBLE: [number, number, number, number, number] = [226, 44, 4.5, 3.2, 0.3];
const biome = new Uint8Array(N), bDepth = new Float32Array(N);
{
  const ridge = field(RIDGE, 40);
  each((i, x, y) => {
    const em = chainDepth[i] + 9;
    if (em > 0) { biome[i] = 3; bDepth[i] = em; return; }
    const ek = Math.min(blob(x, y, SAND[0] + 4, SAND[1], 30, 19, -0.15, 4, 64), roadDist[i] - 4);
    if (ek > 0) { biome[i] = 2; bDepth[i] = ek; return; }
    const ee = Math.max(ridge.d[i] === Infinity ? -Infinity : 32 - ridge.d[i] + 5 * fbm(x, y, 10, 65), blob(x, y, PLATEAU[0], PLATEAU[1] + 2, 33, 25, 0.35, 4, 66));
    if (ee > 0) { biome[i] = 1; bDepth[i] = ee; }
  });
  // the oasis pool: a small shallow spring in the sand
  each((i, x, y) => {
    if (Math.hypot(x - OASIS[0], y - OASIS[1]) + 0.8 * fbm(x, y, 3, 67) < 1.6 && terrain[i] === 'sand') water[i] = 1;
  });
}

// ---- fine mode: the visual layer. Mountain rock gets its visual height from the chain depth: a scree
// foot one level over the foothills, then steep flanks (SLOPE levels per unit of depth, about 1.5 per
// metre) up to a ridged summit height (PEAK_LO..ZVIS), cut into cliff steps of STEP levels; snow from SNOW_Z.
const SLOPE = 6, STEP = 3, PEAK_LO = 18, SNOW_Z = 33;
const inBlob = (x: number, y: number, [cx, cy, rx, ry, rot]: [number, number, number, number, number], seed: number) => blob(x, y, cx, cy, rx, ry, rot, 1.2, seed) > 0;
/** The visual terrain of a cell: its sim terrain `t`, or deeper inside a biome zone, that biome's terrain. */
function biomeKind(i: number, x: number, y: number, t: string): (typeof KINDS)[number] {
  const b = BIOMES[biome[i]], k = t as (typeof KINDS)[number];
  if (b === 'global' || bDepth[i] < 2 || water[i]) return k;
  if (b === 'mountains') {
    if (t !== 'grass' && t !== 'forest' && t !== 'dirt') return k;
    if (chainDepth[i] > -(0.5 + 0.5 * (fbm(x, y, 4, 71) + 1))) return 'scree'; // 1-3 tiles round the rock
    if (t !== 'grass') return k;
    if (roadDist[i] < 2.8 && fbm(x, y, 3, 72) > -0.1) return 'gravel';
    return fbm(x, y, 7, 73) > 0.1 ? 'meadow' : k;
  }
  if (b === 'kyrene') {
    if (t !== 'sand' && t !== 'grass') return k;
    const pool = Math.hypot(x - OASIS[0], y - OASIS[1]) + 1.5 * fbm(x, y, 3, 74);
    if (pool < 5) return 'oasis';
    // the zone's grass and the sand's rim stay as they are: the sets meet on terrains both know
    if (t === 'grass' || blob(x, y, SAND[0], SAND[1], 27, 16, -0.15, 4, 61) < 1.5) return k;
    if (Math.hypot(x - 212, y - 243) + 2 * fbm(x, y, 3, 75) < 4.5) return 'redrock';
    if (Math.hypot(x - 245, y - 231) + 1.5 * fbm(x, y, 3, 76) < 3.2) return 'salt';
    if (Math.hypot(x - 226, y - 245) + 1.5 * fbm(x, y, 3, 77) < 3.8) return 'hardpan';
    if (t === 'sand' && (height[i] >= 2 || fbm(x, y, 5, 78) > 0.3)) return 'dune';
    return fbm(x, y, 6, 79) > 0.35 ? 'reg' : 'sand';
  }
  if (t !== 'grass') return k;
  if (inBlob(x, y, VINEYARD, 80)) return 'rossa';
  if (GROVES.some((g, n) => inBlob(x, y, g, 81 + n))) return 'grove';
  if (inBlob(x, y, MARBLE, 85)) return 'marble';
  return height[i] >= 2 || fbm(x, y, 7, 86) > 0.05 ? 'dry' : k;
}
const ridged = (x: number, y: number, scale: number, seed: number) => 1 - Math.abs(noise(x / scale, y / scale, seed));
if (FINE) {
  const kind = new Uint8Array(N), zv = new Uint8Array(N);
  each((i, x, y) => {
    const t = water[i] === 2 ? 'deep' : water[i] === 1 ? 'shallow' : terrain[i];
    let z = height[i];
    if (t === 'rock') {
      const e = chainDepth[i] + 1.2 * fbm(x, y, 5, 41);
      const peak = PEAK_LO + (ZVIS - PEAK_LO) * (0.65 * ridged(x, y, 11, 43) + 0.35 * ridged(x, y, 5, 44)) ** 1.6;
      z = e < 0.6 ? 3 : 3 + STEP * Math.floor(Math.min(SLOPE * (e - 0.6), peak - 3) / STEP);
    }
    zv[i] = z;
  });
  // keep the roads in sight: rock in front of a road (toward the viewer, +x +y) rises at most half a
  // level per cell step, so it never hides the road (the pass is a cut with a low near side)
  const lim = new Float32Array(N).fill(Infinity);
  for (let v = 0; v < W + H - 1; v++) for (let x = Math.max(0, v - H + 1); x <= Math.min(W - 1, v); x++) {
    const y = v - x, i = y * W + x;
    let l = terrain[i] === 'road' ? zv[i] : Infinity;
    if (x > 0) l = Math.min(l, lim[i - 1] + 0.5);
    if (y > 0) l = Math.min(l, lim[i - W] + 0.5);
    lim[i] = l;
    if (terrain[i] === 'rock' && zv[i] > l) zv[i] = Math.max(3, 3 + STEP * Math.floor((l - 3) / STEP)); // in cliff steps too, no 1-level terraces
  }
  each((i, x, y) => {
    const t = water[i] === 2 ? 'deep' : water[i] === 1 ? 'shallow' : terrain[i];
    kind[i] = KINDS.indexOf(biomeKind(i, x, y, t === 'rock' && zv[i] >= SNOW_Z ? 'snow' : t));
  });
  writeFileSync(join(process.argv[3], 'test-ridge.fine.json'), JSON.stringify({ rle: encodeVisual(kind, zv) }));
  process.exit(0);
}
const fineDir = mkdtempSync(join(tmpdir(), 'ridge-fine-'));
execFileSync(process.execPath, [fileURLToPath(import.meta.url), String(2 * SIZE), fineDir, 'fine'], { stdio: 'inherit' });
const visual = { scale: 2 as const, rle: JSON.parse(readFileSync(join(fineDir, 'test-ridge.fine.json'), 'utf8')).rle as number[] };
rmSync(fineDir, { recursive: true });
const FW = 2 * W, FH = 2 * H;
const fine = decodeVisual(visual.rle, FW * FH);
// a biome terrain stays only where every tile round its cell is of that biome (the fine run drew its zones at its own
// resolution): next to another biome's tiles the cell takes its tile's sim terrain, so neighbouring sets read the same land
{
  const OWN: Record<string, string[]> = { mountains: ['scree', 'meadow', 'gravel'], elaia: ['dry', 'rossa', 'marble', 'grove'], kyrene: ['dune', 'hardpan', 'redrock', 'reg', 'salt', 'oasis'] };
  const ownerOf = new Map(Object.entries(OWN).flatMap(([b, ks]) => ks.map((k) => [KINDS.indexOf(k as (typeof KINDS)[number]), BIOMES.indexOf(b as (typeof BIOMES)[number])])));
  let fixed = 0;
  for (let fy = 0; fy < FH; fy++) for (let fx = 0; fx < FW; fx++) {
    const j = fy * FW + fx, b = ownerOf.get(fine.kind[j]);
    if (b === undefined) continue;
    const tx = fx >> 1, ty = fy >> 1;
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) {
      const x = tx + dx, y = ty + dy;
      if (x >= 0 && y >= 0 && x < W && y < H && biome[y * W + x] !== b) ok = false;
    }
    if (!ok) { fine.kind[j] = KINDS.indexOf(terrain[ty * W + tx] as (typeof KINDS)[number]); fixed++; }
  }
  visual.rle = encodeVisual(fine.kind, fine.z);
  console.log(`biome terrain cells set back at zone edges: ${fixed}`);
}
const fAt = (fx: number, fy: number) => (fx < 0 || fy < 0 || fx >= FW || fy >= FH ? -1 : fy * FW + fx);
const fzAt = (fx: number, fy: number) => { const j = fAt(fx, fy); return j < 0 ? 0 : fine.z[j]; };

// ---- check: walkable neighbours more than one level apart are only the deliberate cliffs
const open = (i: number) => water[i] !== 2 && terrain[i] !== 'rock';
let cliffs = 0;
for (let i = 0; i < N; i++) {
  if (!open(i)) continue;
  if ((i % W) + 1 < W && open(i + 1) && Math.abs(height[i] - height[i + 1]) >= 2) cliffs++;
  if (i + W < N && open(i + W) && Math.abs(height[i] - height[i + W]) >= 2) cliffs++;
}

const ENTRY = 56 * K;
const DEPTH = 10 * K;
const entries = [
  { side: 'N', x: 96 * K - ENTRY / 2, y: 0, w: ENTRY, h: DEPTH },
  { side: 'S', x: 200 * K - ENTRY / 2, y: H - DEPTH, w: ENTRY, h: DEPTH },
  { side: 'W', x: 0, y: 86 * K - ENTRY / 2, w: DEPTH, h: ENTRY },
  { side: 'E', x: W - DEPTH, y: 112 * K - ENTRY / 2, w: DEPTH, h: ENTRY },
] as const;
const BAND = 28 * K;
const noBuild = entries.map((e) =>
  e.side === 'N' ? { x: e.x, y: 0, w: e.w, h: BAND }
  : e.side === 'S' ? { x: e.x, y: H - BAND, w: e.w, h: BAND }
  : e.side === 'W' ? { x: 0, y: e.y, w: BAND, h: e.h }
  : { x: W - BAND, y: e.y, w: BAND, h: e.h },
);

// ---- named spots (authoring units here, written in tile coordinates) for tests, the bench and the sandbox
const crest = nearestSample(RIDGE.filter((p) => Math.abs(p.s - RIDGE_LEN / 2) < 1), 0, 0);
const rampMid = RAMP.find((p) => p.s >= 12)!;
const spots = {
  entryN: [96, 5], entryS: [200, 250], entryW: [5, 86], entryE: [250, 112],
  ford: pt(ford), fordW: off(ford, 10), fordE: off(ford, -10),
  bridge: pt(bridge), bridgeW: off(bridge, 10), bridgeE: off(bridge, -10),
  passN: [59.5, 112.5], passS: [70.5, 186.5], passSaddle: [toUnit(saddle.i % W), toUnit(Math.floor(saddle.i / W))],
  ridgeCrest: pt(crest), ridgeFoot: off(crest, 26), ridgeCliffFoot: off(crest, -9),
  plateauTop: [PLATEAU[0] + 2, PLATEAU[1] - 1], rampFoot: pt(RAMP[0]), rampMid: pt(rampMid),
  forest: [200, 180], marsh: MARSH, sand: SAND, fieldE: [212, 126], fieldW: [44, 104],
};

// ---- map objects (public/war/objects/objects.json ids), foot points in tiles; deterministic per tile hash.
// Hand-tuned density per terrain: dense pines and oaks in the woods, olives on dry slopes, a few lone trees
// and bushes on grass, reeds in the marsh, boulders on the rock's edge, a watchtower on the plateau, ruins at
// the pass. Nothing on water, roads or named spots; only boulders (on rock, already impassable), the tower
// and the ruins block movement.
const objects: { id: string; x: number; y: number }[] = [];
{
  const hsh = (x: number, y: number, k: number) => {
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(k, 1274126177);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x);
  const spotTiles = new Set(Object.values(spots).map(([u, v]) => at(Math.floor(toTile(u)), Math.floor(toTile(v)))));
  const ring = (x: number, y: number, f: (j: number) => boolean) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = at(x + dx, y + dy); if (j >= 0 && (dx || dy) && f(j)) return true; }
    return false;
  };
  const pick = (ids: string[], r: number) => ids[Math.floor(r * ids.length)];
  const put = (id: string, x: number, y: number) => objects.push({ id, x: r1(x * 10) / 10, y: r1(y * 10) / 10 });
  // the fine cell under a foot point, and whether ground in front of it (toward the viewer, +x +y) rises over the foot
  const cellOf = (x: number, y: number) => fAt(Math.floor(2 * x), Math.floor(2 * y));
  const footSeen = (x: number, y: number) => {
    const fx = Math.floor(2 * x), fy = Math.floor(2 * y), z = fzAt(fx, fy);
    for (let d = 1; d <= ZVIS; d++) for (let j = -1; j <= 1; j++) {
      if (fzAt(fx + d + Math.max(0, j), fy + d + Math.max(0, -j)) - z > d + Math.abs(j) / 2 - 0.5) return false;
    }
    return true;
  };
  const M = (ids: string[]) => ids.map((id) => 'mountains/' + id), E = (ids: string[]) => ids.map((id) => 'elaia/' + id), Y = (ids: string[]) => ids.map((id) => 'kyrene/' + id);
  const FIRS = M(['fir', 'fir', 'black-pine', 'fir-snow', 'fir', 'black-pine']), ALPINE = M(['juniper', 'rhododendron', 'alpine-grass', 'alpine-grass']);
  const OLIVES = E(['olive-ancient', 'olive-orchard', 'olive-tall', 'olive-orchard']), MAQUIS = E(['maquis-a', 'maquis-b', 'maquis-c', 'herbs', 'herbs']);
  const PALMS = Y(['date-palm-tall', 'date-palm-mid', 'date-palm-fruit', 'doum-palm', 'date-palm-young', 'date-palm-clump', 'tamarisk']);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, t = terrain[i], b = BIOMES[biome[i]];
    if (water[i] || t === 'road' || spotTiles.has(i)) continue;
    const p = hsh(x, y, 1), q = hsh(x, y, 2), fx = x + 0.3 + 0.4 * hsh(x, y, 3), fy = y + 0.3 + 0.4 * hsh(x, y, 4);
    const nearWater = ring(x, y, (j) => water[j] > 0), k = KINDS[fine.kind[cellOf(fx, fy)]];
    if (t === 'forest') {
      const edge = ring(x, y, (j) => terrain[j] !== 'forest');
      const trees = b === 'mountains' ? FIRS : b === 'elaia' ? E(['holm-oak', 'stone-pine', 'holm-oak', 'cypress-tall', 'olive-tall']) : ['pine-a', 'pine-b', 'pine-a', 'oak', 'stone-pine', 'pine-b', 'oak'];
      if (p < (edge ? 0.16 : 0.3)) put(pick(trees, q), fx, fy);
      else if (p < 0.34) put(pick(b === 'elaia' ? MAQUIS : b === 'mountains' ? ALPINE : ['bush-a', 'bush-b'], q), fx, fy);
    } else if (t === 'marsh') {
      if (p < 0.2) put(pick(['reeds', 'reeds', 'reeds', 'bush-b'], q), fx, fy);
      else if (p < 0.212) put('dead-tree', fx, fy);
    } else if (t === 'rock') {
      if (p < 0.12 && ring(x, y, (j) => terrain[j] !== 'rock' && !water[j])) put(pick(['boulder-a', 'boulder-b'], q), fx, fy);
    } else if (b === 'mountains') {
      // firs thick on the slopes under the massifs, thinning out over the foothill meadows
      const near = chainDepth[i] > -5;
      if (k === 'scree') { if (p < 0.05) put(pick(M(['juniper', 'alpine-grass', 'juniper', 'fir-snow']), q), fx, fy); }
      else if (k === 'gravel') { if (p < 0.01) put(pick(ALPINE, q), fx, fy); }
      else if (!nearWater && p < (near ? 0.16 : 0.035)) put(pick(FIRS, q), fx, fy);
      else if (!nearWater && p < (near ? 0.2 : 0.07)) put(pick(ALPINE, q), fx, fy);
    } else if (b === 'elaia') {
      // olives and maquis on the dry slopes (the groves, the vineyard and the marble are set pieces)
      if (k === 'dry' && !nearWater) {
        if (p < 0.022) put(pick(OLIVES, q), fx, fy);
        else if (p < 0.06) put(pick(MAQUIS, q), fx, fy);
        else if (p < 0.066) put(pick(E(['cypress-tall', 'cypress-flame', 'stone-pine']), q), fx, fy);
      } else if (k === 'grass' && !nearWater && p < 0.012) put(pick(E(['cypress-tall', 'cypress-flame', 'stone-pine', 'holm-oak', 'maquis-a', 'olive-tall']), q), fx, fy);
      else if (t === 'dirt' && p < 0.004) put('elaia/herbs', fx, fy);
    } else if (b === 'kyrene') {
      if (k === 'oasis') {
        if (nearWater && p < 0.6) put('kyrene/reeds', fx, fy);
        else if (Math.hypot(toUnit(x) - OASIS[0], toUnit(y) - OASIS[1]) > 2.6 && (x + 2 * y) % 4 === 0 && p < 0.6) put(pick(PALMS, q), fx, fy); // round the pool, not over it
        else if (p < 0.1) put(pick(Y(['saltbush', 'reeds', 'dry-grass']), q), fx, fy);
      } else if (k === 'dune') { if (p < 0.012) put(pick(Y(['dry-grass', 'camelthorn']), q), fx, fy); }
      else if (k === 'redrock') { if (p < 0.04) put(pick(Y(['camelthorn', 'dry-grass', 'saltbush']), q), fx, fy); }
      else if (k === 'reg') { if (p < 0.035) put(pick(Y(['saltbush', 'camelthorn', 'dry-grass', 'broom']), q), fx, fy); }
      else if (k === 'hardpan') { if (p < 0.03) put(pick(Y(['dry-grass', 'thorn-tree']), q), fx, fy); }
      else if (k === 'sand' || k === 'grass') { if (p < 0.03) put(pick(Y(['acacia', 'acacia-old', 'thorn-tree', 'broom', 'saltbush', 'camelthorn', 'dry-grass', 'dry-grass', 'tamarisk']), q), fx, fy); }
    } else if (t === 'grass' && !nearWater) {
      const dry = height[i] >= 2; // foothills and hill slopes
      if (dry && p < 0.05) put(pick(['olive-a', 'olive-b', 'olive-a', 'cypress'], q), fx, fy);
      else if (p < (dry ? 0.065 : 0.008)) put(pick(['bush-a', 'bush-b', 'stone-pine', 'olive-b', 'cypress', 'dead-tree'], q), fx, fy);
    } else if (t === 'sand') {
      if (p < 0.006) put(pick(['bush-a', 'boulder-b'], q), fx, fy);
    } else if (t === 'dirt' && p < 0.004) put('bush-a', fx, fy);
  }
  // the fine layer decides at the foot: same terrain there (a biome terrain stands for open land), and the foot in sight
  const open = new Set(['grass', 'sand', 'dirt']);
  for (let k = objects.length - 1; k >= 0; k--) {
    const o = objects[k], t = terrain[at(Math.floor(o.x), Math.floor(o.y))], fk = KINDS[fine.kind[cellOf(o.x, o.y)]];
    if ((fk !== t && !(KINDS.indexOf(fk) > KINDS.indexOf('deep') && open.has(t))) || !footSeen(o.x, o.y)) objects.splice(k, 1);
  }
  // mountains: crags and spires on the lips of the cliff bands, snowy crags on the snow, outcrops inside, scree
  // fans at the foot of the walls facing the viewer. Crags stand on rock (already impassable) and block nothing.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (water[i] || terrain[i] === 'road' || spotTiles.has(i)) continue;
    const p = hsh(x, y, 5), q = hsh(x, y, 6), ox = x + 0.25 + 0.5 * hsh(x, y, 7), oy = y + 0.25 + 0.5 * hsh(x, y, 8);
    const c = cellOf(ox, oy), k = KINDS[fine.kind[c]], fx = Math.floor(2 * ox), fy = Math.floor(2 * oy), z = fine.z[c];
    if (terrain[i] === 'rock' && (k === 'rock' || k === 'snow')) {
      const lip = Math.max(z - fzAt(fx + 1, fy), z - fzAt(fx, fy + 1), z - fzAt(fx + 1, fy + 1)) >= 3;
      let id = '';
      if (k === 'snow') id = p < 0.012 ? 'crag-snow' : '';
      else if (lip) id = p < 0.03 ? pick(z >= 18 ? ['spire', 'crag-a', 'crag-b'] : ['crag-b', 'outcrop', 'crag-a'], q) : '';
      else if (p < 0.008) id = pick(['outcrop', 'crag-b', 'boulder-a'], q);
      if (id && footSeen(ox, oy)) put(id, ox, oy);
    } else if (terrain[i] !== 'rock' && height[i] >= 2) {
      const wall = Math.max(fzAt(fx - 1, fy), fzAt(fx, fy - 1), fzAt(fx - 1, fy - 1)) - z >= 3;
      if (wall && p < 0.1 && footSeen(ox, oy)) put('scree', ox, oy);
    }
  }
  // keep blocking boulders on rock only (the generator's paths and the tests rely on open ground elsewhere)
  for (let k = objects.length - 1; k >= 0; k--) {
    const o = objects[k];
    if (o.id.startsWith('boulder') && terrain[at(Math.floor(o.x), Math.floor(o.y))] !== 'rock') objects.splice(k, 1);
  }
  // clear room for the set pieces (never one another), then place them
  const pinned = new Set<object>();
  const clear = (x0: number, y0: number, x1: number, y1: number) => {
    for (let k = objects.length - 1; k >= 0; k--) if (!pinned.has(objects[k]) && objects[k].x >= x0 && objects[k].x < x1 && objects[k].y >= y0 && objects[k].y < y1) objects.splice(k, 1);
  };
  // the watchtower stands on the plateau, east of the fort ground, on a flat 2 x 2 of plateau grass
  const [ptx, pty] = spots.plateauTop.map(toTile);
  let tower: Pt | null = null;
  for (let r = 6; r < 40 && !tower; r++) for (let d = -r; d <= r && !tower; d++) {
    const x = Math.round(ptx + r), y = Math.round(pty + d);
    let ok = true;
    for (let dy = -2; dy <= 1; dy++) for (let dx = -2; dx <= 1; dx++) {
      const j = at(x + dx, y + dy);
      if (j < 0 || height[j] !== 5 || terrain[j] === 'road' || spotTiles.has(j)) ok = false;
    }
    if (ok) tower = [x, y];
  }
  if (tower) { clear(tower[0] - 3, tower[1] - 3, tower[0] + 3, tower[1] + 3); objects.push({ id: 'watchtower', x: tower[0], y: tower[1] }); pinned.add(objects.at(-1)!); }
  // ruins: broken wall pieces on the road verge round the pass saddle (outermost road tiles, the road stays open)
  const [sx, sy] = spots.passSaddle.map(toTile);
  const verge: Pt[] = [];
  for (let y = Math.floor(sy - 14); y <= sy + 14; y++) for (let x = Math.floor(sx - 14); x <= sx + 14; x++) {
    const i = at(x, y), e = at(x + 1, y);
    if (i < 0 || e < 0 || spotTiles.has(i) || spotTiles.has(e)) continue;
    // a 2 x 1 piece on two road tiles whose north side is rock and whose south side is road (the road goes on past it)
    const rockN = terrain[at(x, y - 1)] === 'rock' && terrain[at(x + 1, y - 1)] === 'rock', roadS = terrain[at(x, y + 2)] === 'road' && terrain[at(x + 1, y + 2)] === 'road';
    if (terrain[i] === 'road' && terrain[e] === 'road' && height[i] === height[e] && rockN && roadS && terrain[at(x, y + 1)] === 'road') verge.push([x, y]);
  }
  verge.sort((a, b) => Math.hypot(a[0] - sx, a[1] - sy) - Math.hypot(b[0] - sx, b[1] - sy));
  const ruins: Pt[] = [];
  for (const v of verge) if (ruins.length < 3 && ruins.every((r) => Math.hypot(r[0] - v[0], r[1] - v[1]) > 5)) ruins.push(v);
  for (const [x, y] of ruins) pinned.add(objects[objects.push({ id: 'wall-ruin', x: x + 1, y: y + 0.5 }) - 1]);
  // ---- biome set pieces. A blocking one (src/war/region/objects.ts) stands with its whole footprint (top-left tile tx, ty)
  // on free ground: open land of one height (or, `onRock`, impassable rock), off roads, water and other pieces, 3+ tiles
  // from every named spot, and 1+ tile off any road so it never narrows one.
  const spotNear = (x: number, y: number, r: number) => Object.values(spots).some(([u, v]) => Math.hypot(toTile(u) - x, toTile(v) - y) < r);
  const taken = new Set<number>();
  const kindAt = (x: number, y: number) => KINDS[fine.kind[cellOf(x, y)]];
  const piece = (id: string, tx: number, ty: number, onRock = false) => {
    const fp = OBJECT_BLOCKS[id] ?? [1, 1], fx = tx + fp[0] / 2, fy = ty + fp[1] / 2;
    let h0 = -1;
    for (const [x, y] of footprintTiles(fx, fy, fp)) {
      const j = at(x, y);
      if (j < 0 || taken.has(j) || water[j] || terrain[j] === 'road' || (terrain[j] === 'rock') !== onRock || spotNear(x + 0.5, y + 0.5, 3)) return false;
      if (!onRock && (ring(x, y, (n) => terrain[n] === 'road') || (h0 >= 0 && height[j] !== h0))) return false;
      h0 = height[j];
    }
    clear(tx - 1, ty - 1, tx + fp[0] + 1, ty + fp[1] + 1);
    for (const [x, y] of footprintTiles(fx, fy, fp)) taken.add(at(x, y));
    pinned.add(objects[objects.push({ id, x: fx, y: fy }) - 1]);
    return true;
  };
  const tilesWhere = (f: (x: number, y: number, i: number) => boolean) => {
    const out: Pt[] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (f(x, y, y * W + x)) out.push([x, y]);
    return out;
  };
  const byHash = (list: Pt[], k: number) => list.sort((a, b) => hsh(a[0], a[1], k) - hsh(b[0], b[1], k));
  const spaced = (list: Pt[], n: number, gap: number, f: (p: Pt) => boolean) => {
    const done: Pt[] = [];
    for (const p of list) if (done.length < n && done.every((d) => Math.hypot(d[0] - p[0], d[1] - p[1]) >= gap) && f(p)) done.push(p);
    return done;
  };
  // Elaia: vineyard rows on the terra rossa, olive groves in rows, marble outcrops and the marble node by the tower, goats
  for (const [x, y] of tilesWhere((x, y) => x % 3 === 0 && y % 2 === 0)) {
    if (kindAt(x + 0.5, y + 0.5) === 'rossa' && kindAt(x + 0.5, y + 1.5) === 'rossa' && !spotNear(x + 0.5, y + 1, 2)) { clear(x, y, x + 1, y + 2); put('elaia/vines', x + 0.5, y + 1.9); }
  }
  for (const [x, y] of tilesWhere((x, y) => x % 3 === 0 && y % 3 === 1 && kindAt(x + 0.5, y + 0.5) === 'grove' && !spotNear(x + 0.5, y + 0.5, 2))) {
    clear(x - 1, y - 1, x + 2, y + 2);
    put(pick(OLIVES, hsh(x, y, 9)), x + 0.4 + 0.2 * hsh(x, y, 10), y + 0.5);
  }
  const marble = byHash(tilesWhere((x, y) => kindAt(x + 0.5, y + 0.5) === 'marble'), 11);
  spaced(marble, 1, 0, ([x, y]) => piece('elaia/marble-deposit', x, y));
  spaced(marble, 2, 3, ([x, y]) => piece('elaia/marble-outcrop-a', x, y));
  spaced(marble, 4, 2, ([x, y]) => piece('elaia/marble-outcrop-b', x, y));
  spaced(byHash(tilesWhere((x, y, i) => BIOMES[biome[i]] === 'elaia' && kindAt(x + 0.5, y + 0.5) === 'dry' && height[i] >= 2), 12), 3, 30, ([x, y]) => (put('elaia/goats', x + 1, y + 0.5), true));
  // Kyrene: the spring at the pool's edge, a well, a nomad tent and camels round the oasis
  const [ox, oy] = OASIS.map(toTile);
  const oasis = (r0: number, r1: number) => byHash(tilesWhere((x, y) => { const d = Math.hypot(x + 0.5 - ox, y + 0.5 - oy); return d >= r0 && d < r1; }), 13);
  spaced(oasis(0, 6 * K), 1, 0, ([x, y]) => ring(x, y, (j) => water[j] === 1) && piece('kyrene/oasis-spring', x, y));
  spaced(oasis(5 * K, 8 * K), 1, 0, ([x, y]) => piece('kyrene/well', x, y));
  spaced(oasis(9 * K, 12 * K), 1, 0, ([x, y]) => piece('kyrene/nomad-tent', x, y) && (put('kyrene/camels', x + 3, y + 1.5), true));
  // the pass: cairns and rockfalls on the rock beside the road, a watch post on the foothills where the road enters
  const passRoad = (x: number, y: number, i: number) => terrain[i] === 'road' && BIOMES[biome[i]] === 'mountains' && ring(x, y, (j) => terrain[j] === 'rock');
  const beside = byHash(tilesWhere((x, y, i) => terrain[i] === 'rock' && ring(x, y, (j) => passRoad(j % W, Math.floor(j / W), j))), 14);
  spaced(beside, 8, 10 * K, ([x, y]) => piece('mountains/cairn', x, y, true));
  spaced(beside, 3, 16 * K, ([x, y]) => piece('mountains/rockfall', x - 1, y - 1, true));
  const [nx, ny] = spots.passN.map(toTile);
  const post = tilesWhere((x, y, i) => terrain[i] !== 'rock' && Math.hypot(x - nx, y - ny) < 14 && Math.hypot(x - nx, y - ny) >= 4 && roadDist[i] < 5)
    .sort((a, b) => Math.hypot(a[0] - nx, a[1] - ny) - Math.hypot(b[0] - nx, b[1] - ny));
  spaced(post, 1, 0, ([x, y]) => piece('mountains/watch-post', x, y));
  console.log(`objects ${objects.length}; tower ${tower}; ruins ${ruins.map((r) => r.join(',')).join(' ')}`);
}

const region = { id: 'test-ridge', name: 'Test Ridge', w: W, h: H, height, terrain, water, entries, noBuild, objects, visual, biomes: { names: [...BIOMES], rle: encodeBiomes(biome) } };
const dir = new URL(process.argv[3] ? `file://${resolve(process.argv[3])}/` : '../../src/war/regions/', import.meta.url);
const out = new URL('test-ridge.json', dir);
writeFileSync(out, JSON.stringify(region) + '\n');
const spotsOut = new URL('test-ridge.spots.ts', dir);
const lines = Object.entries(spots).map(([k, v]) => `  ${k}: [${v.map((u) => r1(toTile(u))).join(', ')}],`);
writeFileSync(
  spotsOut,
  `// Generated by scripts/war/buildTestRidge.ts: named tile points of test-ridge (x, y), for tests and tools.\n` +
    `export const SPOTS = {\n${lines.join('\n')}\n} as const satisfies Record<string, readonly [number, number]>;\n`,
);
console.log(`wrote ${out.pathname} and ${spotsOut.pathname}; saddle height ${saddle.h}; cliff edges ${cliffs}`);
