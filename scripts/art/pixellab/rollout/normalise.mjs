// I4a stature normalisation without resampling (main's rule: no smooth rescaling of pixel art): drops whole rows and
// columns, so every remaining pixel is an original pixel and no colour is invented.
//  - rows: --rows k rows are removed from the body between --from (default: 12 rows below the crown, past the face)
//    and 3 rows above the feet, each the row most like its upper neighbour (fewest changed pixels), at least 4 apart;
//    the figure is re-aligned on its feet row
//  - cols: --cols c columns are removed from the figure the same way (a thin spear or cord column differs from both
//    neighbours, so it is never picked), half the shift given back so the body stays centred
// The same k and c go to all 8 views, chosen per view.
// Usage: node scripts/art/pixellab/rollout/normalise.mjs <rotations dir> <out dir> --rows k [--cols c] [--crown y]
import { mkdirSync } from 'node:fs';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank } from '../../lib/ops.mjs';
import { DIRS8 } from '../sheet.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? Number(args[args.indexOf(`--${n}`) + 1]) : d);
const [dir, out] = args;
const K = opt('rows', 0), C = opt('cols', 0);
mkdirSync(out, { recursive: true });

const px = (im, x, y) => (y * im.w + x) * 4;
const same = (im, x0, y0, x1, y1) => {
  const a = px(im, x0, y0), b = px(im, x1, y1), d = im.data;
  if (d[a + 3] < 128 && d[b + 3] < 128) return true;
  return d[a] === d[b] && d[a + 1] === d[b + 1] && d[a + 2] === d[b + 2] && d[a + 3] === d[b + 3];
};
function pick(costs, lo, hi, k) {
  const chosen = [];
  const order = [];
  for (let i = lo; i <= hi; i++) order.push(i);
  order.sort((a, b) => costs[a] - costs[b]);
  for (const i of order) { if (chosen.length >= k) break; if (chosen.every((j) => Math.abs(j - i) >= 4)) chosen.push(i); }
  return chosen;
}
for (const d of DIRS8) {
  const im = readImage(`${dir}/${d}.png`);
  let top = -1, feet = -1, x0 = im.w, x1 = -1;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.data[px(im, x, y) + 3] > 128) {
    if (top < 0) top = y; feet = y; x0 = Math.min(x0, x); x1 = Math.max(x1, x);
  }
  const crown = opt('crown', top);
  const rowCost = [], colCost = [];
  for (let y = 1; y < im.h; y++) { let c = 0; for (let x = 0; x < im.w; x++) if (!same(im, x, y, x, y - 1)) c++; rowCost[y] = c; }
  for (let x = 1; x < im.w; x++) { let c = 0; for (let y = 0; y < im.h; y++) if (!same(im, x, y, x - 1, y)) c++; colCost[x] = c; }
  const dropR = new Set(pick(rowCost, opt('from', crown + 12), feet - 3, K));
  const dropC = new Set(pick(colCost, x0 + 3, x1 - 3, C));
  const keptR = [...Array(im.h).keys()].filter((y) => !dropR.has(y));
  const keptC = [...Array(im.w).keys()].filter((x) => !dropC.has(x));
  const o = blank(im.w, im.h);
  // bottom-align rows (the feet row stays put), shift columns back by half the dropped count
  const dy = im.h - keptR.length, dx = Math.floor(dropC.size / 2);
  keptR.forEach((sy, j) => keptC.forEach((sx, i) => {
    const X = i + dx, Y = j + dy;
    if (X >= im.w) return;
    o.data.set(im.data.subarray(px(im, sx, sy), px(im, sx, sy) + 4), px(o, X, Y));
  }));
  writeImage(`${out}/${d}.png`, o);
  console.log(`${d}: rows -${[...dropR].sort((a, b) => a - b).join(',')} cols -${[...dropC].sort((a, b) => a - b).join(',')}`);
}
