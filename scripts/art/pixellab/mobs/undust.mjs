// Cut the dust PixelLab paints round a falling beast from a shipped sheet, in place (§50 open issue: the guardians' die
// clips). Frame i of a clip loses every mid-light pixel (channel mean in [lo, hi]: the pale tan or grey puffs; the dark
// hide and the cream tusks stay) where its reference frame j, a clean frame lying in about the same pose, is empty;
// the loose specks left over go (as build.mjs). Every row, or the rows named (SE, NE, SW, NW order).
// Usage: node scripts/art/pixellab/mobs/undust.mjs <class> <lo> <hi> <clip>:<i>=<j>[!][:<row>,<row>] ...   (! : swap the whole frame)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { crop } from '../../lib/ops.mjs';
import { dropSpecks } from './shrink.mjs';

const [cls, lo, hi, ...cuts] = process.argv.slice(2);
const dir = join('src/assets/sheets', cls);
const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const img = readImage(join(dir, m.image));
const { w: FW, h: FH } = m.frame, R = m.rows.length, wrap = m.wrap ?? Infinity;
const at = (c, r) => ({ x: (c % wrap) * FW, y: (Math.floor(c / wrap) * R + r) * FH, w: FW, h: FH });
let n = 0;
for (const s of cuts) {
  const [clip, ij, rows] = s.split(':');
  const copy = ij.endsWith('!'), [i, j] = ij.replace('!', '').split('=').map(Number);
  const a = m.anims[clip];
  for (const r of rows ? rows.split(',').map(Number) : [...Array(R).keys()]) {
    const box = at(a.col + i, r), fr = crop(img, box), ref = crop(img, at(a.col + j, r)), d = fr.data;
    if (copy) d.set(ref.data); // i=j!: the whole frame replaced by j (dust inside the body's own outline)
    else for (let p = 0; p < d.length; p += 4) {
      const mean = (d[p] + d[p + 1] + d[p + 2]) / 3;
      if (d[p + 3] && !ref.data[p + 3] && mean >= +lo && mean <= +hi) { d[p + 3] = 0; n++; }
    }
    const out = dropSpecks(fr);
    for (let y = 0; y < FH; y++) img.data.set(out.data.subarray(y * FW * 4, (y + 1) * FW * 4), ((box.y + y) * img.w + box.x) * 4);
  }
}
writeImage(join(dir, m.image), img);
console.log(`${cls}: ${n} dust pixels cut`);
