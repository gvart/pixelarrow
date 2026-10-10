// 9-slice check for painted chrome (a frame, a button face, a plaque): the asset's `slice`
// insets [left, top, right, bottom] (px) split it into corners, edges and centre. Phaser's
// NineSlice stretches the edges, so each edge must be uniform along its length (no rosette, rivet
// or stain in the middle of an edge) and the corners must hold every ornament.
// It measures how much each edge strip varies along its stretch axis and writes stretched previews
// (2x wide, 2x tall, small) next to the staged file. Usage: node scripts/art/nineslice.mjs <asset id> [--max 18]
import { existsSync, writeFileSync } from 'node:fs';
import { readImage, writeImage } from './lib/png.mjs';
import { crop, blank, paste, resizeNearest, flatten } from './lib/ops.mjs';
import { findAsset, stagedPath } from './lib/manifest.mjs';

const args = process.argv.slice(2);
// ad hoc: --file <png> --slice l,t,r,b (a frame not in the manifest yet)
const opt = (n) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const a = opt('file') ? { id: args[0], slice: opt('slice').split(',').map(Number) } : findAsset(args[0]);
const maxVar = Number(opt('max') || 18);
if (!a.slice) throw new Error(`${a.id} has no "slice" insets in the manifest`);
const p = opt('file') ?? stagedPath(a);
if (!existsSync(p)) {
  console.log(`NOT ASSESSED ${a.id}: no staged file`);
  process.exit(3);
}
const img = readImage(p);
const [l, t, r, b] = a.slice;
const mw = img.w - l - r, mh = img.h - t - b;
if (mw < 4 || mh < 4) throw new Error('insets leave no stretchable middle');

// mean colour distance of each column (top/bottom edges) or row (left/right) from the strip's mean
function variation(strip, alongX) {
  const n = alongX ? strip.w : strip.h;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const s = alongX ? crop(strip, { x: i, y: 0, w: 1, h: strip.h }) : crop(strip, { x: 0, y: i, w: strip.w, h: 1 });
    lines.push(s.data);
  }
  const mean = new Float64Array(lines[0].length);
  for (const ln of lines) for (let k = 0; k < ln.length; k++) mean[k] += ln[k] / n;
  let worst = 0;
  for (const ln of lines) {
    let d = 0;
    for (let k = 0; k < ln.length; k++) d += Math.abs(ln[k] - mean[k]);
    worst = Math.max(worst, d / ln.length);
  }
  return worst;
}
const edges = {
  top: variation(crop(img, { x: l, y: 0, w: mw, h: t }), true),
  bottom: variation(crop(img, { x: l, y: img.h - b, w: mw, h: b }), true),
  left: variation(crop(img, { x: 0, y: t, w: l, h: mh }), false),
  right: variation(crop(img, { x: img.w - r, y: t, w: r, h: mh }), false),
};
let ok = true;
for (const [k, v] of Object.entries(edges)) {
  const pass = v <= maxVar;
  ok &&= pass;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${k} edge varies ${v.toFixed(1)} (max ${maxVar}) along its stretch`);
}

// stretched previews: rebuild at new sizes from the nine pieces (nearest on the stretched parts)
function stretch(W, H) {
  const out = blank(W, H);
  const piece = (sx, sy, sw, sh, dx, dy, dw, dh) => paste(out, resizeNearest(crop(img, { x: sx, y: sy, w: sw, h: sh }), dw, dh), dx, dy);
  const cw = W - l - r, ch = H - t - b;
  piece(0, 0, l, t, 0, 0, l, t);
  piece(l, 0, mw, t, l, 0, cw, t);
  piece(img.w - r, 0, r, t, W - r, 0, r, t);
  piece(0, t, l, mh, 0, t, l, ch);
  piece(l, t, mw, mh, l, t, cw, ch);
  piece(img.w - r, t, r, mh, W - r, t, r, ch);
  piece(0, img.h - b, l, b, 0, H - b, l, b);
  piece(l, img.h - b, mw, b, l, H - b, cw, b);
  piece(img.w - r, img.h - b, r, b, W - r, H - b, r, b);
  return flatten(out, '#16120f');
}
for (const [tag, W, H] of [['wide', img.w * 2, img.h], ['tall', img.w, img.h * 2], ['small', l + r + 8, t + b + 8]]) writeImage(p.replace(/\.png$/, `.9-${tag}.png`), stretch(W, H));
writeFileSync(p.replace(/\.png$/, '.slice.json'), JSON.stringify({ id: a.id, slice: a.slice, edges, ok }, null, 2));
console.log(`${ok ? 'PASS' : 'FAIL'} ${a.id}: previews ${p.replace(/\.png$/, '.9-{wide,tall,small}.png')}`);
process.exit(ok ? 0 : 1);
