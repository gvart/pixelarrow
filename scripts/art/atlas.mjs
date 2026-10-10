// Rebuild an icon atlas (public/icons/<ui|items>.png + .json, TexturePacker "hash" format, as
// BootScene loads it) with the staged frames of every manifest asset whose `atlas` is <name>.
// Existing frames are kept; a staged frame with the same id replaces its old cell. Shelf packing,
// 2 px gap, at most 2048 px wide. Output: docs/v5/art/staging/atlas/<name>.{png,json}.
// Usage: node scripts/art/atlas.mjs icons_ui
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from './lib/png.mjs';
import { crop, blank, paste } from './lib/ops.mjs';
import { loadManifest, stagedPath, STAGING, ROOT } from './lib/manifest.mjs';

const name = process.argv[2];
if (!name) {
  console.error('usage: node scripts/art/atlas.mjs <icons_ui|icons_items>');
  process.exit(2);
}
const file = name.replace(/^icons_/, '');
const oldJson = JSON.parse(readFileSync(join(ROOT, 'public/icons', `${file}.json`), 'utf8'));
const oldPng = readImage(join(ROOT, 'public/icons', `${file}.png`));
const frames = new Map(Object.entries(oldJson.frames).map(([id, f]) => [id, crop(oldPng, f.frame)]));
let replaced = 0, added = 0, missing = 0;
for (const a of loadManifest().assets.filter((x) => x.atlas === name)) {
  const p = stagedPath(a);
  if (!existsSync(p)) {
    missing++;
    console.log(`  NOT ASSESSED ${a.id} ${a.frame}: no staged file, the old cell stays`);
    continue;
  }
  frames.has(a.frame) ? replaced++ : added++;
  frames.set(a.frame, readImage(p));
}

// shelf pack, tallest first, in a stable order
const GAP = 2, MAXW = 2048;
const order = [...frames.entries()].sort((p, q) => q[1].h - p[1].h || p[0].localeCompare(q[0]));
let x = 0, y = 0, shelf = 0, width = 0;
const placed = [];
for (const [id, im] of order) {
  if (x + im.w > MAXW) (x = 0), (y += shelf + GAP), (shelf = 0);
  placed.push({ id, im, x, y });
  x += im.w + GAP;
  shelf = Math.max(shelf, im.h);
  width = Math.max(width, x - GAP);
}
const sheet = blank(width, y + shelf);
const json = { frames: {}, meta: { app: 'scripts/art/atlas.mjs', image: `${file}.png`, format: 'RGBA8888', size: { w: width, h: y + shelf }, scale: '1' } };
for (const { id, im, x: px, y: py } of placed) {
  paste(sheet, im, px, py);
  json.frames[id] = { frame: { x: px, y: py, w: im.w, h: im.h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: im.w, h: im.h }, sourceSize: { w: im.w, h: im.h } };
}
mkdirSync(join(STAGING, 'atlas'), { recursive: true });
writeImage(join(STAGING, 'atlas', `${name}.png`), sheet);
writeFileSync(join(STAGING, 'atlas', `${name}.json`), JSON.stringify(json));
console.log(`${name}: ${frames.size} frames (${replaced} replaced, ${added} added, ${missing} not staged), ${width}x${y + shelf} -> docs/v5/art/staging/atlas/${name}.{png,json}`);
if (width * (y + shelf) > 4096 * 4096 || width > 4096 || y + shelf > 4096) {
  console.log('FAIL: larger than 4096 px, the WebGL texture limit on low-end phones');
  process.exit(1);
}
