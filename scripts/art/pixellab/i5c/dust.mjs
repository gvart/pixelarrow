// I5c: clear the unrequested dust puffs PixelLab kicks up where they touch a hoof (despeck.mjs only takes detached
// bits): pixels in the lowest <rows> rows of each frame's figure that are lighter than <L> (OKLab), plus the
// 8-connected light pixels around them. The coats, hooves and leather are all darker. In place.
// --below Y also clears every pixel under row Y (dust thrown below the ground line: the wheels' or hooves' row + 2).
// Usage: node scripts/art/pixellab/i5c/dust.mjs <clip dir> [--rows 26] [--L 0.64] [--below Y]
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
  const below = opt('below');
  if (below) for (let y = Number(below) + 1; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const i = (y * im.w + x) * 4;
    if (im.data[i + 3]) { im.data[i + 3] = 0; cut++; }
  }
  for (let y = Math.max(0, b.y1 - rows); y <= b.y1; y++) for (let x = 0; x < im.w; x++) {
    const i = (y * im.w + x) * 4;
    if (im.data[i + 3] <= 128) continue;
    if (oklab([im.data[i], im.data[i + 1], im.data[i + 2]])[0] > Lmax) { im.data[i + 3] = 0; cut++; }
  }
  // --clods: earth clods thrown up at the hooves and wheels share the coat's light browns, so they are found by shape:
  // components of warm light pixels (L > 0.4, chroma > 0.03) in the lowest <rows> rows, at least 8 px, whose border
  // is mostly background or its own outline touching the background (a clod lies on the ground; a highlight on a
  // leg is bordered by the leg). Grey iron is kept.
  if (args.includes('--clods')) {
    const { w, h, data } = im;
    const warm = new Uint8Array(w * h);
    for (let y = Math.max(0, b.y1 - rows); y <= b.y1; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (data[i * 4 + 3] <= 128) continue;
      const [L, A, B] = oklab([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
      if (L > 0.4 && Math.hypot(A, B) > 0.03) warm[i] = 1;
    }
    const seen = new Uint8Array(w * h);
    for (let s = 0; s < w * h; s++) {
      if (!warm[s] || seen[s]) continue;
      const comp = [], st = [s];
      seen[s] = 1;
      let bg = 0, body = 0;
      const ring = new Set();
      while (st.length) {
        const j = st.pop(), x = j % w, y = (j / w) | 0;
        comp.push(j);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = x + dx, Y = y + dy;
          if (X < 0 || Y < 0 || X >= w || Y >= h) { bg++; continue; }
          const k = Y * w + X;
          if (warm[k]) { if (!seen[k]) { seen[k] = 1; st.push(k); } continue; }
          if (data[k * 4 + 3] <= 128) { bg++; continue; }
          // an opaque neighbour: the blob's own outline when it touches the background itself
          body++;
          if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ex, ey]) => { const X2 = X + ex, Y2 = Y + ey; return X2 < 0 || Y2 < 0 || X2 >= w || Y2 >= h || data[(Y2 * w + X2) * 4 + 3] <= 128; })) ring.add(k);
        }
      }
      if (comp.length >= 8 && bg + ring.size * 2 >= body) for (const j of [...comp, ...ring]) { data[j * 4 + 3] = 0; cut++; }
    }
  }
  if (cut) writeImage(join(dir, f), im);
  total += cut;
}
console.log(`${dir}: ${total} light dust px cleared`);
