// I4b contact sheets from docs/v5/pixellab/mounted.json and bases.json, all at one scale, PA-WORLD-DARK-I4a remap
// (as in game; --raw for PixelLab's colours), every figure standing on its lowest opaque row (feet or hooves):
//  1. <out>-lineup.png: rows SE, NE, SW, NW (the game facings); H4 and 3 foot classes, then every mounted base
//  2. <out>-formation.png: a mixed army on the 2:1 field, SW (enemy front) and NE (player back), zoom 1 and 3:
//     a 5x2 foot block in the centre, a cavalry wing of companions and thessalians on its right, horse archers
//     screening its left, and a chariot ahead
//  3. <out>-gallop.png: the companion's gallop loop in the 4 facings, every frame numbered (and <out>-gallop.gif)
// Usage: node scripts/art/pixellab/mounted/sheets.mjs <out prefix> [--scale 3] [--raw]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank, hexToRgb } from '../../lib/ops.mjs';
import { ROOT } from '../../lib/manifest.mjs';
import { blit, text, buildSheet } from '../sheet.mjs';
import { remap, loadRamps } from '../remap.mjs';
import { writeGif } from '../gif.mjs';
import { bbox } from './lib.mjs';

const args = process.argv.slice(2);
const out = args[0];
const scale = Number(args.includes('--scale') ? args[args.indexOf('--scale') + 1] : 3);
const raw = args.includes('--raw');
const bases = JSON.parse(readFileSync(join(ROOT, 'docs/v5/pixellab/bases.json'), 'utf8')).classes;
const mounted = JSON.parse(readFileSync(join(ROOT, 'docs/v5/pixellab/mounted.json'), 'utf8')).classes;
const ramps = loadRamps(join(ROOT, 'docs/v5/pixellab/I4a/palette-dark-i4a.json'));
const FACINGS = ['south-east', 'north-east', 'south-west', 'north-west'];
const GROUND = '#8f8a42';
const g = hexToRgb(GROUND);
const ink = hexToRgb('#2b1d1a');
const col = (im) => (raw ? im : remap(im, ramps));
const ground = (w, h) => { const im = blank(w, h); for (let i = 0; i < w * h; i++) im.data.set([...g, 255], i * 4); return im; };
const FOOT = ['hoplite', 'militia', 'peltast', 'sacred_band'];
const MOUNTED = Object.keys(mounted).filter((k) => mounted[k].rotations);
const rot = (id, d) => col(readImage(join(ROOT, (bases[id] ?? mounted[id]).rotations, `${d}.png`)));

// 1. lineup: each cell is the figure's opaque box, all cells bottom-aligned in a row
const PAD = 4;
const cellsOf = (d) => [...FOOT, ...MOUNTED].map((id) => { const im = rot(id, d); return { id, im, b: bbox(im) }; });
const rowsData = FACINGS.map(cellsOf);
const colW = [...FOOT, ...MOUNTED].map((_, k) => Math.max(...rowsData.map((r) => r[k].b.x1 - r[k].b.x0 + 1)) + PAD);
const rowH = rowsData.map((r) => Math.max(...r.map((c) => c.b.y1 - c.b.y0 + 1)) + PAD + 8);
const W = colW.reduce((a, b) => a + b, PAD) + 30, H = rowH.reduce((a, b) => a + b, 10);
const line = ground(W, H);
let y = 10;
[...FOOT, ...MOUNTED].forEach((id, k) => text(line, id.replace('_', ' ').slice(0, 12), 30 + colW.slice(0, k).reduce((a, b) => a + b, 0), 2, 1, ink));
rowsData.forEach((r, ri) => {
  text(line, FACINGS[ri].split('-').map((s) => s[0]).join('').toUpperCase(), 2, y + rowH[ri] - 12, 1, ink);
  let x = 30;
  r.forEach((c, k) => { blit(line, c.im, x - c.b.x0, y + rowH[ri] - PAD - 1 - c.b.y1, 1); x += colW[k]; });
  y += rowH[ri];
});
const lineup = buildSheet([{ label: `I4b mounted bases beside H4 and foot classes, one scale${raw ? ' (raw)' : ''}`, imgs: [line] }], { scale, bg: GROUND });
writeImage(`${out}-lineup.png`, lineup);

// 2. formation on the 2:1 field: positions are field px of the feet / hooves (x right, y down), facing SW or NE
function army(facing) {
  const sw = facing === 'south-west';
  const units = [];
  // the rank runs along (+20, +10) per man; files go back along (+20, -10) (SW front) or (-20, +10) (NE front)
  const back = sw ? [20, -10] : [-20, 10];
  const foot = ['hoplite', 'sacred_band', 'hoplite', 'peltast', 'militia', 'hoplite', 'militia', 'hoplite', 'peltast', 'sacred_band'];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) units.push({ id: foot[r * 5 + c], x: 260 + c * 20 + r * back[0], y: 150 + c * 10 + r * back[1] });
  // cavalry wing beyond the rank's far end: 2 ranks of 3, about 40 px apart
  const wing = ['companion', 'companion', 'thessalian', 'companion', 'thessalian', 'thessalian'];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) units.push({ id: wing[r * 3 + c], x: 420 + c * 44 + r * back[0] * 2.4, y: 225 + c * 22 + r * back[1] * 2.4 });
  // horse archers screening the near end, loose
  for (const [dx, dy] of [[0, 0], [46, 6], [20, 30]]) units.push({ id: 'horse_archer', x: 150 + dx, y: 95 + dy });
  // the chariot ahead of the block
  units.push({ id: 'chariot', x: sw ? 190 : 440, y: sw ? 275 : 128 });
  const img = ground(680, 340);
  units.filter((u) => mounted[u.id]?.rotations || bases[u.id]).sort((a, b) => a.y - b.y).forEach((u) => {
    const im = rot(u.id, facing); const b = bbox(im);
    blit(img, im, u.x - Math.round((b.x0 + b.x1) / 2), u.y - b.y1, 1);
  });
  return img;
}
const A = army('south-west'), B = army('north-east');
const f1 = buildSheet([{ label: 'zoom 1: SW (enemy front) / NE (player back)', imgs: [A, B] }], { scale: 1, bg: GROUND });
const f3 = buildSheet([{ label: 'zoom 3: SW', imgs: [A] }, { label: 'zoom 3: NE', imgs: [B] }], { scale: 3, bg: GROUND });
const both = ground(Math.max(f1.w, f3.w), f1.h + f3.h);
blit(both, f1, 0, 0, 1);
blit(both, f3, 0, f1.h, 1);
writeImage(`${out}-formation.png`, both);

// 3. the companion's gallop loop, 4 facings
const c = mounted.companion;
if (c?.clips?.gallop) {
  const dirOf = (d) => join(ROOT, c.clips.gallop.dir, d);
  const clips = FACINGS.map((d) => readdirSync(dirOf(d)).filter((f) => f.endsWith('.png')).sort().map((f) => col(readImage(join(dirOf(d), f)))));
  const all = clips.flat().map(bbox);
  const bx = { x0: Math.min(...all.map((b) => b.x0)), y0: Math.min(...all.map((b) => b.y0)), x1: Math.max(...all.map((b) => b.x1)), y1: Math.max(...all.map((b) => b.y1)) };
  const crop = (im) => { const o = ground(bx.x1 - bx.x0 + 3, bx.y1 - bx.y0 + 3); blit(o, im, 1 - bx.x0, 1 - bx.y0, 1); return o; };
  const rows = FACINGS.map((d, k) => ({ label: `${d} ${clips[k].length} frames @ ${c.clips.gallop.fps} fps`, imgs: clips[k].map(crop) }));
  writeImage(`${out}-gallop.png`, buildSheet(rows, { scale: 2, bg: GROUND }));
  writeGif(`${out}-gallop.gif`, clips.map((cl) => cl.map(crop)), { fps: c.clips.gallop.fps, scale: 2, bg: GROUND });
}
console.log(`${out}-lineup.png ${lineup.w}x${lineup.h}\n${out}-formation.png ${both.w}x${both.h}`);
