// Bandit (polish): the re-dressed base's four views (civ/grid.mjs split of the Pro Flash edit) -> pixminimax first
// frames, 96 x 96 at (14, 24) as the civilians. The edit's north-west view came back half turned to the viewer, so the
// north-west rotation is the north-east one mirrored (a clean back view). Specks under 12 px are dropped.
// Usage: node scripts/art/pixellab/bandit/prep.mjs   (docs/v5/pixellab/BANDIT/raw/bandit/rot -> .../canvas)
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank, paste } from '../../lib/ops.mjs';

const ROWS = ['south-east', 'north-east', 'south-west', 'north-west'];
const raw = 'docs/v5/pixellab/BANDIT/raw/bandit';
const mirror = (im) => { const o = blank(im.w, im.h); for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) o.data.set(im.data.subarray((y * im.w + x) * 4, (y * im.w + x) * 4 + 4), (y * im.w + im.w - 1 - x) * 4); return o; };
function clean(r) {
  const { w, h, data } = r;
  for (let i = 0; i < w * h; i++) data[i * 4 + 3] = data[i * 4 + 3] >= 128 ? 255 : 0;
  const seen = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || !data[i * 4 + 3]) continue;
    const comp = [i];
    seen[i] = 1;
    for (let k = 0; k < comp.length; k++) {
      const p = comp[k], x = p % w, y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, q = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[q] || !data[q * 4 + 3]) continue;
        seen[q] = 1;
        comp.push(q);
      }
    }
    if (comp.length < 12) for (const p of comp) data[p * 4 + 3] = 0;
  }
  return r;
}
mkdirSync(join(raw, 'canvas'), { recursive: true });
writeImage(join(raw, 'rot', 'north-west.png'), mirror(readImage(join(raw, 'rot', 'north-east.png'))));
for (const d of ROWS) {
  const r = clean(readImage(join(raw, 'rot', `${d}.png`)));
  writeImage(join(raw, 'rot', `${d}.png`), r);
  const c = blank(96, 96);
  paste(c, r, 14, 24);
  writeImage(join(raw, 'canvas', `${d}.png`), c);
}
console.log(`${raw}/canvas: ${ROWS.length} first frames`);
