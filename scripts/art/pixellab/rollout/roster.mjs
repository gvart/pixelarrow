// I4a roster sheets from docs/v5/pixellab/bases.json (every class's approved rotations, H4 first):
//  1. <out>-facings.png: one column per class, rows SE, NE, SW, NW (the 4 game facings), all at the same scale on the
//     iso ground colour, the PA-WORLD-DARK-I4a remap (as in game) — or raw with --raw
//  2. <out>-formation.png: a mixed 5x3 block (15 men, every class once plus H4 twice), facing SW (the enemy, front)
//     and NE (the player's army, back) on the 2:1 field, at zoom 1 and zoom 3
// Usage: node scripts/art/pixellab/rollout/roster.mjs <out prefix> [--scale 4] [--raw]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank, hexToRgb } from '../../lib/ops.mjs';
import { ROOT } from '../../lib/manifest.mjs';
import { blit, text, buildSheet } from '../sheet.mjs';
import { remap, loadRamps } from '../remap.mjs';

const args = process.argv.slice(2);
const out = args[0];
const scale = Number(args.includes('--scale') ? args[args.indexOf('--scale') + 1] : 4);
const raw = args.includes('--raw');
const bases = JSON.parse(readFileSync(join(ROOT, 'docs/v5/pixellab/bases.json'), 'utf8'));
const ramps = loadRamps(join(ROOT, 'docs/v5/pixellab/I4a/palette-dark-i4a.json'));
const FACINGS = ['south-east', 'north-east', 'south-west', 'north-west'];
const GROUND = '#8f8a42';
const classes = Object.entries(bases.classes).filter(([, c]) => c.rotations);
const load = (c, d) => { const im = readImage(join(ROOT, c.rotations, `${d}.png`)); return raw ? im : remap(im, ramps); };

// 1. facings
const rows = FACINGS.map((d) => ({ label: d, imgs: classes.map(([, c]) => load(c, d)) }));
const sheet = buildSheet(rows, { scale, bg: GROUND });
// class names under the title row
const font = Math.max(1, Math.round(scale / 2));
const labelled = blank(sheet.w, sheet.h + 8 * font);
labelled.data.fill(0);
const g = hexToRgb(GROUND);
for (let i = 0; i < labelled.w * labelled.h; i++) labelled.data.set([...g, 255], i * 4);
classes.forEach(([id], k) => text(labelled, id.replace('_', ' ').slice(0, 12), 2 * scale + k * (68 + 2) * scale, font * 2, font, hexToRgb('#2b1d1a')));
blit(labelled, sheet, 0, 8 * font, 1);
writeImage(`${out}-facings.png`, labelled);

// 2. formation: the rank runs down-right along the 2:1 axis, the files go back up-right; about 22 px between men
const order = ['hoplite', ...classes.map(([id]) => id).filter((id) => id !== 'hoplite'), 'hoplite'].slice(0, 15);
const byId = Object.fromEntries(classes);
function block(facing) {
  const W = 68 + 4 * 20 + 2 * 20, H = 68 + 4 * 10 + 2 * 10 + 4;
  const img = blank(W, H);
  for (let i = 0; i < W * H; i++) img.data.set([...g, 255], i * 4);
  const men = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
    const id = order[r * 5 + c];
    // SW faces down-left: the rank runs up-left to down-right; NE is the same block seen from behind (rank 0 at the back)
    const rr = facing === 'south-west' ? r : 2 - r;
    men.push({ id, x: c * 20 + rr * 20, y: c * 10 - rr * 10 + 20 });
  }
  men.sort((a, b) => a.y - b.y);
  for (const m of men) blit(img, load(byId[m.id], facing), m.x, m.y, 1);
  return img;
}
const sw = block('south-west'), ne = block('north-east');
const f = buildSheet([
  { label: 'zoom 1: SW (enemy front) / NE (player back)', imgs: [sw, ne] },
], { scale: 1, bg: GROUND });
const f3 = buildSheet([{ label: 'zoom 3: SW / NE', imgs: [sw, ne] }], { scale: 3, bg: GROUND });
const both = blank(Math.max(f.w, f3.w), f.h + f3.h);
for (let i = 0; i < both.w * both.h; i++) both.data.set([...g, 255], i * 4);
blit(both, f, 0, 0, 1);
blit(both, f3, 0, f.h, 1);
writeImage(`${out}-formation.png`, both);
console.log(`${out}-facings.png ${labelled.w}x${labelled.h}\n${out}-formation.png ${both.w}x${both.h}\norder: ${order.join(' ')}`);
