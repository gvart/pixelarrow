// Guardians (ART-L): a breathing idle made from one still rotation (0 generations), for the back rows of the big
// guardians: the part above `split` (fraction of the figure's height from the top) rises 1 px and settles again.
// Usage: node scripts/art/pixellab/guard/bob.mjs <rotation.png> <out clip dir> [split=0.6]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { alphaBox, blank } from '../../lib/ops.mjs';

const [src, out, sp = '0.6'] = process.argv.slice(2);
const im = readImage(src);
const b = alphaBox(im);
const cut = b.y + Math.round(b.h * Number(sp));
const LIFT = [0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0];
mkdirSync(out, { recursive: true });
LIFT.forEach((d, i) => {
  const o = blank(im.w, im.h);
  for (let y = 0; y < im.h; y++) {
    const sy = y < cut ? y + d : y; // above the cut: draw the row d px higher
    if (sy >= im.h) continue;
    o.data.set(im.data.subarray(sy * im.w * 4, (sy + 1) * im.w * 4), y * im.w * 4);
  }
  // rows between cut - d and cut were taken from below: keep the original there so nothing tears
  for (let y = cut - d; y < cut; y++) if (y >= 0) o.data.set(im.data.subarray(y * im.w * 4, (y + 1) * im.w * 4), y * im.w * 4);
  writeImage(join(out, `frame_${String(i).padStart(3, '0')}.png`), o);
});
writeFileSync(join(out, 'job.json'), JSON.stringify({ job: 'bob', frames: LIFT.length, src }));
console.log(`${out}: ${LIFT.length} frames`);
