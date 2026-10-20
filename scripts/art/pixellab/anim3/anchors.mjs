// ANIM-3: per-frame load anchors of a class's carry body (the walk clip) into its manifest, `loads`:
//   { "clip": "walk", "shoulder": { "<row>": [[dx, dy], ...] }, "chest": { ... } }
// dx, dy from the row anchor (the feet), one pair per frame. A man is 58 px skull to feet: his left shoulder sits
// 44 px up and 6 px to the side (clear of the face), the hands holding a load at the chest 34 px up; each frame adds the walk's bob (its top row against the clip's
// median) and its own body centre (the mean x of the opaque pixels in the shoulder band, the weapon left out by
// keeping to 9 px either side of the anchor).
// Usage: node scripts/art/pixellab/anim3/anchors.mjs <class> [<class> ...]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage } from '../../lib/png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const CLIP = 'walk', SHOULDER = 44, CHEST = 34, BAND = 9, SIDE = 6;
for (const cls of process.argv.slice(2)) {
  const dir = join(ROOT, 'src/assets/sheets', cls), mp = join(dir, 'manifest.json');
  const m = JSON.parse(readFileSync(mp, 'utf8'));
  const img = readImage(join(dir, m.image));
  const FW = m.frame.w, FH = m.frame.h, R = m.rows.length, a = m.anims[CLIP];
  const loads = { clip: CLIP, shoulder: {}, chest: {} };
  m.rows.forEach((row, r) => {
    const anc = m.anchors[row], tops = [], cxs = [];
    for (let i = 0; i < a.frames; i++) {
      const col = a.col + i, x0 = (col % m.wrap) * FW, y0 = (Math.floor(col / m.wrap) * R + r) * FH;
      const op = (x, y) => img.data[((y0 + y) * img.w + x0 + x) * 4 + 3] > 0;
      let top = -1;
      for (let y = 0; y < FH && top < 0; y++) {
        let run = 0;
        for (let x = anc.x - BAND; x <= anc.x + BAND; x++) if ((run = op(x, y) ? run + 1 : 0) >= 4) { top = y; break; }
      }
      let sx = 0, n = 0;
      for (let y = anc.y - SHOULDER - 3; y <= anc.y - SHOULDER + 3; y++) for (let x = anc.x - BAND; x <= anc.x + BAND; x++) if (op(x, y)) sx += x, n++;
      tops.push(top); cxs.push(n ? Math.round(sx / n) - anc.x : 0);
    }
    const med = [...tops].sort((p, q) => p - q)[tops.length >> 1];
    // his left shoulder (the shield side): screen right in the south facings, left in the north ones
    const side = row.startsWith('south') ? SIDE : -SIDE;
    loads.shoulder[row] = tops.map((t, i) => [cxs[i] + side, -SHOULDER + (t - med)]);
    loads.chest[row] = tops.map((t, i) => [cxs[i], -CHEST + (t - med)]);
  });
  m.loads = '@loads'; // one line: the pairs would take a line per number
  writeFileSync(mp, JSON.stringify(m, null, 1).replace('"@loads"', JSON.stringify(loads)) + '\n');
  console.log(`${cls}: ${m.rows.map((row) => `${row} ${loads.shoulder[row].map(([x, y]) => `${x},${y}`).join(' ')}`).join(' | ')}`);
}
