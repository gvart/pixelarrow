// I4b: how many opaque pixels of each rotation the invented-colour cut (groups.mjs: chroma > 0.14, L > 0.86, or a
// light neutral grey C < 0.025 and L > 0.55) would remove, and how many colours there are. A grey horse must not lose
// its coat to the ghost-trail rule.
// Usage: node scripts/art/pixellab/mounted/cutcheck.mjs <rotations dir>
import { join } from 'node:path';
import { readImage } from '../../lib/png.mjs';
import { oklab } from '../remap.mjs';
import { DIRS8 } from '../sheet.mjs';

const dir = process.argv[2];
for (const d of DIRS8) {
  const im = readImage(join(dir, `${d}.png`));
  let n = 0, cut = 0;
  const cols = new Set();
  for (let i = 0; i < im.data.length; i += 4) {
    if (im.data[i + 3] <= 128) continue;
    n++;
    const rgb = [im.data[i], im.data[i + 1], im.data[i + 2]];
    cols.add(rgb.join(','));
    const [L, a, b] = oklab(rgb);
    const C = Math.hypot(a, b);
    if (C > 0.14 || L > 0.86 || (C < 0.025 && L > 0.55)) cut++;
  }
  console.log(`${d.padEnd(10)} ${n} px, ${cols.size} colours, cut ${cut} (${((cut / n) * 100).toFixed(1)}%)`);
}
