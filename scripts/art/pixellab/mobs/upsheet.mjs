// Redraw a shipped sheet at a larger true size so it draws at a whole scale (no uneven pixels): every frame is enlarged
// by Scale2x and shrunk by f / 2 (area average, snapped to the sheet's own colours; loose specks dropped as build.mjs), the frame box and the feet anchors
// scale with it. For sheets built at shrink 1 (the guardians: the sheet is the cleaned PixelLab frames 1:1); a sheet built
// smaller than its raws is better rebuilt from them (build.mjs, `shrink` x f). Writes the sheet and manifest in place.
// Usage: node scripts/art/pixellab/mobs/upsheet.mjs <class> <f> [--white T] [<clip>:<i>=<j>[:<row>,<row>] ...]
//   --white T: near-white slash streaks and sparks (every channel >= T) go before the shrink (as guard/clean.mjs)
//   (frame i of a clip replaced by its frame j, in the rows named (SE, NE, SW, NW order) or all: a rubble or smear frame)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { alphaBox, blank, crop, paste } from '../../lib/ops.mjs';
import { dropSpecks, paletteOf, scale2x, shrink } from './shrink.mjs';

const args = process.argv.slice(2);
const wi = args.indexOf('--white');
const white = wi >= 0 ? Number(args.splice(wi, 2)[1]) : 256;
const [cls, fArg, ...swaps] = args;
const f = Number(fArg);
const dir = join('src/assets/sheets', cls);
const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const img = readImage(join(dir, m.image));
const { w: FW0, h: FH0 } = m.frame;
const R = m.rows.length;
const wrap0 = m.wrap ?? Infinity;
const cols = Math.max(...Object.values(m.anims).map((a) => a.col + a.frames));
const at = (c, r) => {
  const band = Math.floor(c / wrap0);
  return { x: (c % wrap0) * FW0, y: (band * R + r) * FH0, w: FW0, h: FH0 };
};
const unwhite = (fr) => {
  const d = fr.data;
  for (let i = 0; i < d.length; i += 4) if (d[i] >= white && d[i + 1] >= white && d[i + 2] >= white) d[i + 3] = 0;
  return fr;
};
const pal = paletteOf([img]);
const cache = new Map();
const big = [];
for (let c = 0; c < cols; c++) for (let r = 0; r < R; r++) big.push({ c, r, img: dropSpecks(shrink(scale2x(unwhite(crop(img, at(c, r)))), f / 2, pal, cache)) });

for (const s of swaps) {
  const [clip, ij, rows] = s.split(':');
  const [i, j] = ij.split('=').map(Number);
  const a = m.anims[clip];
  for (const r of rows ? rows.split(',').map(Number) : [...Array(R).keys()]) {
    big[(a.col + i) * R + r].img = big[(a.col + j) * R + r].img;
  }
}

// one frame box for all, 1 px margin (as build.mjs)
let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
for (const { img: b } of big) {
  const a = alphaBox(b);
  if (!a.w) continue;
  x0 = Math.min(x0, a.x); y0 = Math.min(y0, a.y); x1 = Math.max(x1, a.x + a.w); y1 = Math.max(y1, a.y + a.h);
}
x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 += 1; y1 += 1;
const FW = x1 - x0, FH = y1 - y0;
const WRAP = cols * FW > 4096 ? Math.floor(4096 / FW) : 0;
const bands = WRAP ? Math.ceil(cols / WRAP) : 1;
const sheet = blank((WRAP || cols) * FW, bands * R * FH);
for (const { c, r, img: b } of big) {
  const band = WRAP ? Math.floor(c / WRAP) : 0;
  paste(sheet, crop(b, { x: x0, y: y0, w: FW, h: FH }), (WRAP ? c % WRAP : c) * FW, (band * R + r) * FH);
}
const scaleAnchor = (a) => ({ x: Math.round(a.x * f - x0), y: Math.round(a.y * f - y0) });
m.frame = { w: FW, h: FH };
m.anchor = scaleAnchor(m.anchor);
if (m.anchors) m.anchors = Object.fromEntries(Object.entries(m.anchors).map(([k, a]) => [k, scaleAnchor(a)]));
const { wrap: _w, ...rest } = m;
const out = { ...rest, ...(WRAP ? { wrap: WRAP } : {}) };
// keep the manifest's key order: wrap after rows
const ordered = {};
for (const k of Object.keys(out)) {
  if (k === 'wrap') continue;
  ordered[k] = out[k];
  if (k === 'rows' && WRAP) ordered.wrap = WRAP;
}
writeImage(join(dir, m.image), sheet);
writeFileSync(join(dir, 'manifest.json'), JSON.stringify(ordered, null, 1) + '\n');
console.log(`${cls} x${f}: frame ${FW0}x${FH0} -> ${FW}x${FH}, sheet ${sheet.w}x${sheet.h}${WRAP ? `, wrap ${WRAP}` : ''}`);
