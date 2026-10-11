// Rebuild an icon atlas (public/icons/<ui|items>.png + .json, TexturePacker "hash" format, as
// BootScene loads it) from the current atlas plus the 160 px masters of its manifest frames.
//
// Which manifest frames go in:
//   (default)       only those already in the atlas: each is re-read from its master, so a
//                   rebuild of the shipped atlas from the same masters gives the same bytes;
//   --add ui:a,ui:b those frames too (a slot story adding its wired icon);
//   --all           every manifest frame of the atlas (the staged atlas the previews load).
// Masters are read from --src <dir> by the manifest `file` name (default docs/v5/art/staging;
// the AS-03 masters are tracked in docs/v5/gemini/AS-03/processed). A missing master keeps the
// old cell. Shelf packing, tallest first then by id, 2 px gap, at most 2048 px wide.
//
// Output: docs/v5/art/staging/atlas/<name>.{png,json} (what preview.mjs serves), or --out <dir>
// (files <ui|items>.{png,json}).
// Writing into public/icons ships the atlas, so it needs --looked: the same rebuild was
// previewed in the real game first (scripts/art/preview.mjs, ASSET_PIPELINE.md D-9).
//
// Usage: node scripts/art/atlas.mjs icons_ui [--src dir] [--add ids | --all] [--out dir [--looked]]
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readImage, writeImage } from './lib/png.mjs';
import { crop, blank } from './lib/ops.mjs';
import { loadManifest, STAGING, ROOT } from './lib/manifest.mjs';

const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const name = args[0];
if (!name || name.startsWith('--')) {
  console.error('usage: node scripts/art/atlas.mjs <icons_ui|icons_items> [--src dir] [--add ids | --all] [--out dir [--looked]]');
  process.exit(2);
}
const file = name.replace(/^icons_/, '');
const src = resolve(ROOT, opt('--src') ?? STAGING);
const outDir = opt('--out') ? resolve(ROOT, opt('--out')) : join(STAGING, 'atlas');
const shipping = outDir === join(ROOT, 'public/icons');
// staging keeps the names preview.mjs and promote.mjs read (icons_ui.*); any other dir gets ui.*
const stem = opt('--out') ? file : name;
if (shipping && !args.includes('--looked')) {
  console.error('REFUSED: writing public/icons ships the atlas; preview this rebuild in the real game, then pass --looked');
  process.exit(1);
}
const add = new Set((opt('--add') ?? '').split(',').filter(Boolean));

const oldJson = JSON.parse(readFileSync(join(ROOT, 'public/icons', `${file}.json`), 'utf8'));
const oldPng = readImage(join(ROOT, 'public/icons', `${file}.png`));
const frames = new Map(Object.entries(oldJson.frames).map(([id, f]) => [id, crop(oldPng, f.frame)]));
let refreshed = 0, added = 0, missing = 0, staged = 0;
for (const a of loadManifest().assets.filter((x) => x.atlas === name)) {
  const wanted = frames.has(a.frame) || add.has(a.frame) || args.includes('--all');
  if (!wanted) {
    staged++;
    continue;
  }
  const p = join(src, a.file);
  if (!existsSync(p)) {
    missing++;
    console.log(`  NOT ASSESSED ${a.id} ${a.frame}: no master ${p.replace(ROOT + '/', '')}, the old cell stays`);
    continue;
  }
  frames.has(a.frame) ? refreshed++ : added++;
  frames.set(a.frame, readImage(p));
}

// shelf pack, tallest first, in a stable order
const GAP = 2, MAXW = 2048;
const order = [...frames.entries()].sort((p, q) => q[1].h - p[1].h || (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0));
let x = 0, y = 0, shelf = 0, width = 0;
const placed = [];
for (const [id, im] of order) {
  if (x + im.w > MAXW) (x = 0), (y += shelf + GAP), (shelf = 0);
  placed.push({ id, im, x, y });
  x += im.w + GAP;
  shelf = Math.max(shelf, im.h);
  width = Math.max(width, x - GAP);
}
const height = y + shelf;
if (width > 4096 || height > 4096) {
  console.log(`FAIL: ${width}x${height} is larger than 4096 px, the WebGL texture limit on low-end phones`);
  process.exit(1);
}
const sheet = blank(width, height);
const json = { frames: {}, meta: { app: 'scripts/art/atlas.mjs', image: `${file}.png`, format: 'RGBA8888', size: { w: width, h: height }, scale: '1' } };
for (const { id, im, x: px, y: py } of placed) {
  blit(sheet, im, px, py);
  json.frames[id] = { frame: { x: px, y: py, w: im.w, h: im.h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: im.w, h: im.h }, sourceSize: { w: im.w, h: im.h } };
}
mkdirSync(outDir, { recursive: true });
writeImage(join(outDir, `${stem}.png`), sheet);
writeFileSync(join(outDir, `${stem}.json`), JSON.stringify(json));
const rel = outDir.replace(ROOT + '/', '');

/** Copy src's RGBA into dst at (x, y). Not lib/ops paste(), which blends over the blank sheet:
 * that darkens every soft edge (RGB times alpha) once per rebuild. */
function blit(dst, src, x, y) {
  for (let yy = 0; yy < src.h; yy++) dst.data.set(src.data.subarray(yy * src.w * 4, (yy + 1) * src.w * 4), ((y + yy) * dst.w + x) * 4);
}

console.log(`${name}: ${frames.size} frames (${refreshed} from masters, ${added} added, ${missing} without a master, ${staged} staged out), ${width}x${height} -> ${rel}/${stem}.{png,json}`);
