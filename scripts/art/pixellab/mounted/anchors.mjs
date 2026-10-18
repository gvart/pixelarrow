// I4b: per game facing, the opaque box and the ground-contact centre (mean x of the opaque pixels in the lowest 6 rows:
// the hooves or wheels) of a rotations dir, for the manifest's per-row anchors.
// Usage: node scripts/art/pixellab/mounted/anchors.mjs <rotations dir> [more dirs ...]
import { join } from 'node:path';
import { readImage } from '../../lib/png.mjs';
import { bbox } from './lib.mjs';

for (const dir of process.argv.slice(2)) {
  console.log(`== ${dir}`);
  for (const d of ['south-east', 'north-east', 'south-west', 'north-west']) {
    const im = readImage(join(dir, `${d}.png`));
    const b = bbox(im);
    let sx = 0, n = 0;
    for (let y = b.y1 - 5; y <= b.y1; y++) for (let x = 0; x < im.w; x++) if (im.data[(y * im.w + x) * 4 + 3] > 128) { sx += x; n++; }
    console.log(`${d.padEnd(10)} box x ${b.x0}..${b.x1} y ${b.y0}..${b.y1}  ground x ${Math.round(sx / n)} y ${b.y1}  canvas ${im.w}x${im.h}`);
  }
}
