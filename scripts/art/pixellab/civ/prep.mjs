// Civilians (ART-S): first frames for pixminimax. Each base rotation (68 x 68) goes on the one civilian work canvas,
// 96 x 96 at (14, 24): head room for a raised tool, width for a fall. Stray specks the edit left are dropped.
// Usage: node scripts/art/pixellab/civ/prep.mjs <class>   (docs/v5/pixellab/CIV/raw/<class>/rot -> .../canvas)
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank, paste } from '../../lib/ops.mjs';

const ROWS = ['south-east', 'north-east', 'south-west', 'north-west'];
const raw = join('docs/v5/pixellab/CIV/raw', process.argv[2]);
mkdirSync(join(raw, 'canvas'), { recursive: true });
for (const d of ROWS) {
  const r = readImage(join(raw, 'rot', `${d}.png`));
  // hard alpha, then keep only the biggest 8-connected piece and pieces of 12+ px (a tool held clear of the body)
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
  writeImage(join(raw, 'rot', `${d}.png`), r);
  const c = blank(96, 96);
  paste(c, r, 14, 24);
  writeImage(join(raw, 'canvas', `${d}.png`), c);
}
console.log(`${raw}/canvas: ${ROWS.length} first frames`);
