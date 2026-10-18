// I5c: does every clip stand where idle stands? Per clip and facing of a built sheet, the median over its frames of
// the lowest opaque row and of the mean x of the lowest 40 rows (the horse's legs and belly), against idle's. A clip
// a few px off makes the figure jump when the state changes.
// Usage: node scripts/art/pixellab/i5c/anchorcheck.mjs <manifest.json>
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readImage } from '../../lib/png.mjs';

const m = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const img = readImage(join(dirname(process.argv[2]), m.image));
const { w: FW, h: FH } = m.frame, wrap = m.wrap ?? 1e9, R = m.rows.length;
const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
const measure = (row, col) => {
  const X = (col % wrap) * FW, Y = (Math.floor(col / wrap) * R + row) * FH;
  let low = -1;
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (img.data[((Y + y) * img.w + X + x) * 4 + 3]) low = y;
  let sx = 0, n = 0;
  for (let y = low - 40; y <= low; y++) for (let x = 0; x < FW; x++) if (img.data[((Y + y) * img.w + X + x) * 4 + 3]) { sx += x; n++; }
  return [low, sx / n];
};
m.rows.forEach((dir, row) => {
  const line = [];
  let base = null;
  for (const [anim, a] of Object.entries(m.anims)) {
    const ms = Array.from({ length: a.frames }, (_, i) => measure(row, a.col + i));
    const r = [med(ms.map((v) => v[0])), Math.round(med(ms.map((v) => v[1])))];
    if (!base) base = r;
    line.push(`${anim} ${r[0] - base[0] >= 0 ? '+' : ''}${r[0] - base[0]},${r[1] - base[1] >= 0 ? '+' : ''}${r[1] - base[1]}`);
  }
  console.log(`${dir.padEnd(10)} ${line.join('  ')}`);
});
