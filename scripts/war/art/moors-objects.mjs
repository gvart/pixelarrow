// Grey Moors objects (regions-look, PROMPTS_ART §49): PixelLab create_map_object raws -> public/war/biomes/moors/
// (trimmed, scaled to true size at 33 px/m, binary alpha, graded into the dark palette, foot anchor) + objects.json.
// Usage: node scripts/war/art/moors-objects.mjs [raw dir]   (default: shots/war/pixellab/moors/raw of the main checkout)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { resizeArea, trim, rgbToHex } from '../../art/lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const RAW = process.argv[2] ?? '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/pixellab/moors/raw';
const OUT = join(ROOT, 'public/war/biomes/moors');
const PPM = 33;

// id, raw source id, scale, kind, footprint, blocks, grade (sat, val), drop: pixel tests removed before trimming
const green = (r, g, b) => g > r * 1.02 && g > b * 1.02;
const OBJECTS = [
  { id: 'tor-a', src: '2f89d339', scale: 1, kind: 'stone', footprint: [3, 3], blocks: true, sat: 0.6, val: 0.85, drop: green, note: 'grass disc under it dropped' },
  { id: 'tor-b', src: 'daf58dd4', scale: 0.8, kind: 'stone', footprint: [2, 2], blocks: true, sat: 0.75, val: 0.85 },
  { id: 'standing-stone', src: '18ec6166', scale: 0.95, kind: 'stone', footprint: [1, 1], blocks: true, sat: 0.7, val: 0.85, drop: green },
  { id: 'heather', src: '75879d75', scale: 0.7, kind: 'bush', footprint: [1, 1], blocks: false, sat: 0.3, val: 0.7 },
  { id: 'bracken', src: 'b154d519', scale: 0.6, kind: 'bush', footprint: [1, 1], blocks: false, sat: 0.55, val: 0.75 },
  { id: 'bog-cotton', src: '1e37cbc5', scale: 0.7, kind: 'bush', footprint: [1, 1], blocks: false, sat: 0.45, val: 0.85, drop: (r, g, b, y, h) => y > h * 0.7 && Math.abs(r - g) < 14 && Math.abs(g - b) < 14 },
  { id: 'peat-stack', src: '83121956', scale: 0.6, kind: 'stone', footprint: [1, 1], blocks: true, sat: 0.6, val: 0.8 },
  { id: 'hawthorn', src: '4c303ce7', scale: 0.9, kind: 'tree', footprint: [1, 1], blocks: false, sat: 0.7, val: 0.85 },
];

const grade = (r, g, b, sat, val) => {
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  return [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round((l + (c - l) * sat) * val))));
};
const q = (c) => Math.min(255, Math.round(c / 6) * 6); // a coarse grid: the moor objects' own colours

const GO = JSON.parse(readFileSync(join(ROOT, 'public/war/objects/objects.json')));
const prevPath = join(OUT, 'objects.json'), prev = existsSync(prevPath) ? JSON.parse(readFileSync(prevPath)) : null;
const colours = new Set(GO.palette), objects = [];
for (const o of OBJECTS) {
  let im = readImage(join(RAW, `${o.id}.png`));
  const d = im.data;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const i = (y * im.w + x) * 4;
    if (d[i + 3] < 128 || (o.drop && o.drop(d[i], d[i + 1], d[i + 2], y, im.h))) d[i + 3] = 0;
  }
  im = trim(im);
  if (o.scale !== 1) im = resizeArea(im, Math.round(im.w * o.scale), Math.round(im.h * o.scale));
  for (let i = 0; i < im.data.length; i += 4) {
    if (im.data[i + 3] < 128) { im.data[i + 3] = 0; continue; }
    const c = grade(im.data[i], im.data[i + 1], im.data[i + 2], o.sat, o.val).map(q);
    im.data.set([...c, 255], i);
    colours.add(rgbToHex(c));
  }
  im = trim(im);
  // the foot: the middle of the opaque span of the bottom row
  let x0 = im.w, x1 = -1;
  for (let x = 0; x < im.w; x++) if (im.data[((im.h - 1) * im.w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  writeImage(join(OUT, `${o.id}.png`), im);
  objects.push({ id: o.id, kind: o.kind, file: `${o.id}.png`, w: im.w, h: im.h, metres: Math.round((im.h / PPM) * 10) / 10, anchor: { x: Math.round((x0 + x1) / 2), y: im.h - 1 }, footprint: o.footprint, blocksMovement: o.blocks, source: `map_object ${o.src}${o.note ? ` (${o.note})` : ''}` });
}
const ids = new Set(objects.map((o) => o.id));
const json = { biome: 'moors', pxPerMetre: PPM, note: 'Grey Moors objects (PROMPTS_ART §49), built by scripts/war/art/moors-objects.mjs', palette: [...colours], objects: [...objects, ...(prev?.objects ?? []).filter((o) => !ids.has(o.id))] };
writeFileSync(prevPath, JSON.stringify(json, null, 1) + '\n');
console.log(`moors objects: ${objects.map((o) => `${o.id} ${o.w}x${o.h}`).join(', ')}; ${colours.size - GO.palette.length} own colours`);
