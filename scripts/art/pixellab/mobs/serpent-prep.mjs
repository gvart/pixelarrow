// W-67 river serpent: before mobs/build.mjs. Its Pro Flash character files the south-west view we drew as "south"
// (PROMPTS_ART.md §40c lesson 1), so the game's south-west and north-west are its south and west; PixMiniMax stored the
// two facings on different canvases (124, 132): every clip frame is centred onto one 132 canvas, and the four game-facing
// rotations (east ones mirrored) are written for the palette.
// Usage: node scripts/art/pixellab/mobs/serpent-prep.mjs [raw dir]
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank, paste } from '../../lib/ops.mjs';

const raw = process.argv[2] ?? 'docs/v5/pixellab/MOBS/raw/serpent';
const C = 132;
const centre = (img) => {
  if (img.w === C && img.h === C) return img;
  const c = blank(C, C);
  paste(c, img, Math.floor((C - img.w) / 2), Math.floor((C - img.h) / 2));
  return c;
};
const flip = (img) => {
  const o = blank(img.w, img.h);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const i = (y * img.w + x) * 4, j = (y * img.w + img.w - 1 - x) * 4;
    o.data.set(img.data.subarray(i, i + 4), j);
  }
  return o;
};
for (const anim of readdirSync(join(raw, 'clips'))) for (const dir of readdirSync(join(raw, 'clips', anim))) for (const at of readdirSync(join(raw, 'clips', anim, dir))) {
  const d = join(raw, 'clips', anim, dir, at);
  for (const f of readdirSync(d).filter((n) => n.endsWith('.png'))) writeImage(join(d, f), centre(readImage(join(d, f))));
}
// rotations: game facing <- the character's (zip/<state>/rotations)
const z = join(raw, 'zip');
const st = readdirSync(z).find((n) => !n.endsWith('.json'));
const rot = (n) => centre(readImage(join(z, st, 'rotations', `${n}.png`)));
const out = join(raw, 'rot');
mkdirSync(out, { recursive: true });
const sw = rot('south'), nw = rot('west');
writeImage(join(out, 'south-west.png'), sw);
writeImage(join(out, 'north-west.png'), nw);
writeImage(join(out, 'south-east.png'), flip(sw));
writeImage(join(out, 'north-east.png'), flip(nw));
writeFileSync(join(out, 'README'), 'game facing <- character rotation: south-west <- south, north-west <- west, east rows mirrored\n');
console.log('serpent prepped', raw);
