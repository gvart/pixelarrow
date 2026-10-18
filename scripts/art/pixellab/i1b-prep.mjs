// I1b (run once, before the E3 import): E1 rotations -> E1fix (NW gets NE's spear arm, columns 43..56 shifted +3, stray foot pixels cleared)
// -> E1pad96 (96x96 canvas, the 68 sprite at 14,16: feet on row 81).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../lib/png.mjs';
import { ROOT } from '../lib/manifest.mjs';
import { blank, paste } from '../lib/ops.mjs';
const B = join(ROOT, 'docs/v5/pixellab/I1/raw/');
const R = B + 'E1/zip/Idle/rotations/';
mkdirSync(B + 'E1fix', { recursive: true });
mkdirSync(B + 'E1pad96', { recursive: true });
const dirs = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];
for (const d of dirs) {
  const im = readImage(R + d + '.png');
  if (d === 'north-west') {
    const ne = readImage(R + 'north-east.png');
    for (let y = 0; y < 63; y++) for (let x = 43; x <= 56; x++) {
      const i = (y * ne.w + x) * 4;
      if (ne.data[i + 3] < 128) continue;
      im.data.set(ne.data.subarray(i, i + 4), (y * im.w + x + 3) * 4);
    }
  }
  writeImage(B + 'E1fix/' + d + '.png', im);
  const o = blank(96, 96);
  paste(o, im, 14, 16);
  writeImage(B + 'E1pad96/' + d + '.png', o);
}
console.log('ok');
