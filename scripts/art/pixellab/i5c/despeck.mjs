// I5c: clear the unrequested dust PixelLab kicks up at the hooves: every 8-connected opaque component of a frame
// smaller than <max px> that is not the figure (the largest component) is made transparent, in place.
// fetchall.mjs runs it after the download for a job with `despeck` set (the max size) in the jobs file.
// Usage: node scripts/art/pixellab/i5c/despeck.mjs <clip dir> <max px>
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';

const [dir, maxS] = process.argv.slice(2);
const max = Number(maxS);
let total = 0;
for (const f of readdirSync(dir).filter((n) => /^frame_\d+\.png$/.test(n))) {
  const im = readImage(join(dir, f));
  const { w, h, data } = im;
  const comp = new Int32Array(w * h).fill(-1);
  const sizes = [];
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] <= 128 || comp[i] >= 0) continue;
    const id = sizes.length, st = [i];
    comp[i] = id;
    let n = 0;
    while (st.length) {
      const j = st.pop(), x = j % w, y = (j / w) | 0;
      n++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const k = Y * w + X;
        if (data[k * 4 + 3] > 128 && comp[k] < 0) { comp[k] = id; st.push(k); }
      }
    }
    sizes.push(n);
  }
  const big = sizes.indexOf(Math.max(...sizes));
  let cut = 0;
  for (let i = 0; i < w * h; i++) if (comp[i] >= 0 && comp[i] !== big && sizes[comp[i]] < max) { data[i * 4 + 3] = 0; cut++; }
  if (cut) writeImage(join(dir, f), im);
  total += cut;
}
console.log(`${dir}: ${total} px of detached bits under ${max} px cleared`);
