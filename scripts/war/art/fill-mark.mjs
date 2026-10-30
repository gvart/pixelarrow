// Take a stray mark out of a terrain fill in every built tile that carries it (PROMPTS_ART.md §40p).
// A fill is pixel-identical in every sheet, variant frame 0 and biome set that draws it (build.mjs), so a mark in it lands
// on the same place of every 2 m tile and reads as a lattice (the brown comma on sand). Every 64 x 48 frame of every tile
// PNG under public/war/tiles and public/war/biomes/* whose pixel at a mark position still equals the fill's mark pixel gets
// the fill's own pixel from `dx` px aside instead (so the patch is the same sand and in the palette).
// Usage: node scripts/war/art/fill-mark.mjs <var png> <frame> <x0> <y0> <x1> <y1> <dx> [--dry]
//   the mark: the pixels of the fill's top in the box (x0..x1, y0..y1) darker than its median by more than 7.
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const [file, fr, x0, y0, x1, y1, dx] = process.argv.slice(2, 9).map((a, i) => (i ? Number(a) : a));
const dry = process.argv.includes('--dry');
const F = readImage(join(ROOT, file));
const TW = 64, TH = 48;
const at = (im, f, x, y) => (y * im.w + f * TW + x) * 4;
const lum = (d, i) => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
const inTop = (x, y) => Math.abs(x + 0.5 - 32) / 32 + Math.abs(y + 0.5 - 16) / 16 <= 1;
const ls = [];
for (let y = 0; y < 32; y++) for (let x = 0; x < TW; x++) if (inTop(x, y)) ls.push(lum(F.data, at(F, fr, x, y)));
ls.sort((a, b) => a - b);
const med = ls[ls.length >> 1];
const mark = []; // [x, y, rgba of the mark, rgba of the patch]
for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
  if (!inTop(x, y) || !inTop(x + dx, y) || lum(F.data, at(F, fr, x, y)) > med - 7) continue;
  const i = at(F, fr, x, y), j = at(F, fr, x + dx, y);
  mark.push([x, y, F.data.slice(i, i + 4), F.data.slice(j, j + 4)]);
}
console.log(`mark: ${mark.length} px`);
const files = [];
for (const d of ['public/war/tiles', ...readdirSync(join(ROOT, 'public/war/biomes')).map((b) => `public/war/biomes/${b}`)]) {
  for (const f of readdirSync(join(ROOT, d))) if (f.endsWith('.png') && !f.startsWith('cliff-')) files.push(join(d, f));
}
for (const f of files) {
  const im = readImage(join(ROOT, f));
  if (im.h !== TH || im.w % TW) continue;
  let n = 0;
  for (let k = 0; k < im.w / TW; k++) {
    // only where the fill lies under the mark (a quarter of it at least), not a stray pixel of the same colour
    const hit = mark.filter(([x, y, m]) => { const i = at(im, k, x, y); return im.data[i] === m[0] && im.data[i + 1] === m[1] && im.data[i + 2] === m[2] && im.data[i + 3] === m[3]; });
    if (hit.length * 4 < mark.length) continue;
    for (const [x, y, , p] of hit) { im.data.set(p, at(im, k, x, y)); n++; }
  }
  if (n) { console.log(f, n); if (!dry) writeImage(join(ROOT, f), im); }
}
