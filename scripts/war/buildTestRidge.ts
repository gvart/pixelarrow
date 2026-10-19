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
 * Heights: grass 1, river bed 0, foothills 2, ridge crest and plateau 5, mountains 5..7.
 * Every 2+ level step between walkable tiles is a deliberate cliff (ridge north face, plateau rim).
 *
 * Features are authored in units of a 256-wide map (one unit = one tile at the default size); SIZE
 * scales them all, widths and slope lengths included, so a bigger map is the same land in finer tiles.
 *
 *   node scripts/war/buildTestRidge.ts [size] [outDir]   (default 256, src/war/regions)
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { blob, curveField, fbm, nearestSample, spline, type Pt, type Sample } from './shapes.ts';

const SIZE = Number(process.argv[2] ?? 256);
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
      height[i] = Math.min(7, 5 + Math.floor(e / 4));
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
ROADS.forEach((pts, k) => {
  const f = field(spline(pts), 3);
  each((i) => {
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
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, t = terrain[i];
    if (water[i] || t === 'road' || spotTiles.has(i)) continue;
    const p = hsh(x, y, 1), q = hsh(x, y, 2), fx = x + 0.3 + 0.4 * hsh(x, y, 3), fy = y + 0.3 + 0.4 * hsh(x, y, 4);
    const nearWater = ring(x, y, (j) => water[j] > 0);
    if (t === 'forest') {
      const edge = ring(x, y, (j) => terrain[j] !== 'forest');
      if (p < (edge ? 0.16 : 0.3)) put(pick(['pine-a', 'pine-b', 'pine-a', 'oak', 'stone-pine', 'pine-b', 'oak'], q), fx, fy);
      else if (p < 0.34) put(pick(['bush-a', 'bush-b'], q), fx, fy);
    } else if (t === 'marsh') {
      if (p < 0.2) put(pick(['reeds', 'reeds', 'reeds', 'bush-b'], q), fx, fy);
      else if (p < 0.212) put('dead-tree', fx, fy);
    } else if (t === 'rock') {
      if (p < 0.12 && ring(x, y, (j) => terrain[j] !== 'rock' && !water[j])) put(pick(['boulder-a', 'boulder-b'], q), fx, fy);
    } else if (t === 'grass' && !nearWater) {
      const dry = height[i] >= 2; // foothills and hill slopes
      if (dry && p < 0.05) put(pick(['olive-a', 'olive-b', 'olive-a', 'cypress'], q), fx, fy);
      else if (p < (dry ? 0.065 : 0.008)) put(pick(['bush-a', 'bush-b', 'stone-pine', 'olive-b', 'cypress', 'dead-tree'], q), fx, fy);
    } else if (t === 'sand') {
      if (p < 0.006) put(pick(['bush-a', 'boulder-b'], q), fx, fy);
    } else if (t === 'dirt' && p < 0.004) put('bush-a', fx, fy);
  }
  // keep blocking boulders on rock only (the generator's paths and the tests rely on open ground elsewhere)
  for (let k = objects.length - 1; k >= 0; k--) {
    const o = objects[k];
    if (o.id.startsWith('boulder') && terrain[at(Math.floor(o.x), Math.floor(o.y))] !== 'rock') objects.splice(k, 1);
  }
  // clear room for the set pieces, then place them
  const clear = (x0: number, y0: number, x1: number, y1: number) => {
    for (let k = objects.length - 1; k >= 0; k--) if (objects[k].x >= x0 && objects[k].x < x1 && objects[k].y >= y0 && objects[k].y < y1) objects.splice(k, 1);
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
  if (tower) { clear(tower[0] - 3, tower[1] - 3, tower[0] + 3, tower[1] + 3); objects.push({ id: 'watchtower', x: tower[0], y: tower[1] }); }
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
  for (const [x, y] of ruins) objects.push({ id: 'wall-ruin', x: x + 1, y: y + 0.5 });
  console.log(`objects ${objects.length}; tower ${tower}; ruins ${ruins.map((r) => r.join(',')).join(' ')}`);
}

const region = { id: 'test-ridge', name: 'Test Ridge', w: W, h: H, height, terrain, water, entries, noBuild, objects };
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
