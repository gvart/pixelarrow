// I4b gallop recipe, step 2: pick the loop key of a first pixminimax gallop run: the most stretched frame (widest
// opaque box, the legs reaching out front and back) among frames 2..9, past the start from the standing rotation.
// Usage: node scripts/art/pixellab/mounted/keyframe.mjs <clip dir>  -> prints the frame path
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readImage } from '../../lib/png.mjs';
import { bbox } from './lib.mjs';

const dir = process.argv[2];
const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
let best = null, bw = -1;
for (const f of files.slice(2, 10)) {
  const b = bbox(readImage(join(dir, f)));
  if (b.x1 - b.x0 > bw) { bw = b.x1 - b.x0; best = f; }
}
console.log(join(dir, best), `width ${bw + 1}`);
