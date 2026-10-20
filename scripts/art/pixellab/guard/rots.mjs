// Guardians (ART-L): a fetched character's four game-facing rotations -> <raw>/rot/<facing>.png, and a contact strip
// <raw>/rot.png (SE NE SW NW). --mirror: SE and NE are the SW and NW views flipped (keeps one hand / one profile).
// Usage: node scripts/art/pixellab/guard/rots.mjs <raw dir> [--mirror]
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank, paste } from '../../lib/ops.mjs';

const ROWS = ['south-east', 'north-east', 'south-west', 'north-west'];
const raw = process.argv[2];
const mirror = process.argv.includes('--mirror');
const z = join(raw, 'zip');
const st = readdirSync(z).find((d) => existsSync(join(z, d, 'rotations')));
const flip = (img) => {
  const o = blank(img.w, img.h);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) o.data.set(img.data.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4), (y * img.w + img.w - 1 - x) * 4);
  return o;
};
mkdirSync(join(raw, 'rot'), { recursive: true });
// --shift: the character was made from a three-quarter south-west sprite, which Pro Flash files as "south", so every
// label is 45 degrees off: the game's SE NE SW NW are its east, north, south and west
const SHIFT = { 'south-east': 'east', 'north-east': 'north', 'south-west': 'south', 'north-west': 'west' };
const shift = process.argv.includes('--shift');
const imgs = ROWS.map((d) => {
  const src = mirror && d.endsWith('east') ? d.replace('east', 'west') : d;
  const im = readImage(join(z, st, 'rotations', `${shift ? SHIFT[src] : src}.png`));
  return src === d ? im : flip(im);
});
imgs.forEach((im, i) => writeImage(join(raw, 'rot', `${ROWS[i]}.png`), im));
const c = blank(imgs.reduce((s, im) => s + im.w, 0), Math.max(...imgs.map((im) => im.h)));
let x = 0;
for (const im of imgs) { paste(c, im, x, 0); x += im.w; }
writeImage(join(raw, 'rot.png'), c);
console.log(`${raw}/rot: ${imgs[0].w}x${imgs[0].h}`);
