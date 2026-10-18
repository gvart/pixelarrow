// I5c: clear the unrequested dust puffs PixelLab kicks up where they touch a hoof (despeck.mjs only takes detached
// bits): pixels in the lowest <rows> rows of each frame's figure that are lighter than <L> (OKLab), plus the
// 8-connected light pixels around them. The coats, hooves and leather are all darker. In place.
// Usage: node scripts/art/pixellab/i5c/dust.mjs <clip dir> [--rows 26] [--L 0.64]
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { oklab } from '../remap.mjs';
import { bbox } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const dir = args[0];
const rows = Number(opt('rows', 26)), Lmax = Number(opt('L', 0.64));
let total = 0;
for (const f of readdirSync(dir).filter((n) => /^frame_\d+\.png$/.test(n))) {
  const im = readImage(join(dir, f));
  const b = bbox(im);
  let cut = 0;
  for (let y = Math.max(0, b.y1 - rows); y <= b.y1; y++) for (let x = 0; x < im.w; x++) {
    const i = (y * im.w + x) * 4;
    if (im.data[i + 3] <= 128) continue;
    if (oklab([im.data[i], im.data[i + 1], im.data[i + 2]])[0] > Lmax) { im.data[i + 3] = 0; cut++; }
  }
  if (cut) writeImage(join(dir, f), im);
  total += cut;
}
console.log(`${dir}: ${total} light dust px cleared`);
