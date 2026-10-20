// Guardians (ART-L): first frames for pixminimax, as civ/prep.mjs with the raw dir and canvas as arguments.
// Each <raw>/rot/<facing>.png (the facings found there) is cleaned (hard alpha, only the biggest piece and pieces of
// 12+ px kept) and pasted on a W x H canvas at (px, py) -> <raw>/canvas/<facing>.png.
// Usage: node scripts/art/pixellab/guard/prep.mjs <raw dir> <W> <H> <px> <py>
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank, paste } from '../../lib/ops.mjs';

const ROWS = ['south-east', 'north-east', 'south-west', 'north-west'];
const [raw, CW, CH, PX, PY] = process.argv.slice(2).map((v, i) => (i ? Number(v) : v));
mkdirSync(join(raw, 'canvas'), { recursive: true });
for (const d of ROWS) {
  const f = join(raw, 'rot', `${d}.png`);
  if (!existsSync(f)) continue;
  const r = readImage(f);
  const { w, h, data } = r;
  for (let i = 0; i < w * h; i++) data[i * 4 + 3] = data[i * 4 + 3] >= 128 ? 255 : 0;
  const seen = new Uint8Array(w * h);
  const comps = [];
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
    comps.push(comp);
  }
  const big = Math.max(0, ...comps.map((c) => c.length));
  for (const c of comps) if (c.length < 12 && c.length < big) for (const p of c) data[p * 4 + 3] = 0;
  writeImage(f, r);
  const c = blank(CW, CH);
  paste(c, r, PX, PY);
  writeImage(join(raw, 'canvas', `${d}.png`), c);
}
console.log(`${raw}/canvas: first frames`);
