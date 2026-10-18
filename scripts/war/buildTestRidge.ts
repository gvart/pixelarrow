/**
 * Writes the greybox test region src/war/regions/test-ridge.json (160 x 160 tiles).
 * Hand-placed shapes, no noise:
 *  - NW: a long ridge (gentle 1-step slopes) topped by a plateau at height 5;
 *  - a rock mountain wall across the west half (y 78..86, cliffs) with one 3-wide pass at x 38..40;
 *  - a deep river running north-south near x 100, crossable only at the ford (y 36..39)
 *    and the road bridge (y 118..120);
 *  - forest (NE), sand (SE), marsh (west bank, south of the wall), an east-west road;
 *  - entry rectangles on all 4 sides, each with a no-build band 20 tiles deep.
 *
 *   node scripts/war/buildTestRidge.ts
 */
import { writeFileSync } from 'node:fs';

const W = 160;
const H = 160;
const height = new Array<number>(W * H).fill(1);
const terrain = new Array<string>(W * H).fill('grass');
const water = new Array<number>(W * H).fill(0);
const at = (x: number, y: number) => y * W + x;

/** Calls f for every tile inside the ellipse; r is 0 at the centre and 1 on the rim. */
function ellipse(cx: number, cy: number, rx: number, ry: number, f: (i: number, r: number) => void) {
  for (let y = Math.max(0, cy - ry); y <= Math.min(H - 1, cy + ry); y++)
    for (let x = Math.max(0, cx - rx); x <= Math.min(W - 1, cx + rx); x++) {
      const r = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (r <= 1) f(at(x, y), r);
    }
}

// Ridge and plateau: height climbs one step per 2.5 tiles of depth, flat at 5 on top.
const RY = 14;
ellipse(42, 40, 28, RY, (i, r) => {
  height[i] = 1 + Math.min(4, Math.floor(((1 - r) * RY) / 2.5));
  if (height[i] === 5) terrain[i] = 'dirt';
});

// Terrain patches.
ellipse(130, 40, 14, 10, (i) => (terrain[i] = 'forest'));
ellipse(128, 140, 18, 12, (i) => (terrain[i] = 'sand'));
ellipse(78, 102, 10, 6, (i) => (terrain[i] = 'marsh'));

// River centre line.
const riverX = (y: number) => 100 + Math.round(4 * Math.sin(y / 14));

// Mountain wall from the west edge to the river bank, with the pass.
for (let y = 78; y <= 86; y++)
  for (let x = 0; x <= riverX(y) - 3; x++) {
    if (x >= 38 && x <= 40) {
      terrain[at(x, y)] = 'dirt';
      continue;
    }
    height[at(x, y)] = 6;
    terrain[at(x, y)] = 'rock';
  }

// East-west road (3 wide).
for (let y = 118; y <= 120; y++) for (let x = 0; x < W; x++) terrain[at(x, y)] = 'road';

// River: deep, 5 wide, bed at height 0; the ford is shallow sand, the bridge keeps the road at height 1.
for (let y = 0; y < H; y++)
  for (let x = riverX(y) - 2; x <= riverX(y) + 2; x++) {
    const i = at(x, y);
    if (y >= 118 && y <= 120) continue; // bridge deck
    height[i] = 0;
    if (y >= 36 && y <= 39) {
      water[i] = 1;
      terrain[i] = 'sand';
    } else {
      water[i] = 2;
      terrain[i] = 'dirt';
    }
  }

const entries = [
  { side: 'N', x: 50, y: 0, w: 40, h: 8 },
  { side: 'S', x: 50, y: 152, w: 40, h: 8 },
  { side: 'W', x: 0, y: 100, w: 8, h: 40 },
  { side: 'E', x: 152, y: 56, w: 8, h: 40 },
] as const;
const BAND = 20;
const noBuild = entries.map((e) =>
  e.side === 'N' ? { x: e.x, y: 0, w: e.w, h: BAND }
  : e.side === 'S' ? { x: e.x, y: H - BAND, w: e.w, h: BAND }
  : e.side === 'W' ? { x: 0, y: e.y, w: BAND, h: e.h }
  : { x: W - BAND, y: e.y, w: BAND, h: e.h },
);

const region = { id: 'test-ridge', name: 'Test Ridge', w: W, h: H, height, terrain, water, entries, noBuild };
const out = new URL('../../src/war/regions/test-ridge.json', import.meta.url);
writeFileSync(out, JSON.stringify(region) + '\n');
console.log(`wrote ${out.pathname}`);
