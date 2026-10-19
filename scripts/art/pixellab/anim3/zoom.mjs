// ANIM-3: one frame of a sheet clip at 8x with a grid line every 10 px from the row anchor (red: the anchor row /
// column), to read box coordinates for wood.mjs.
// Usage: node scripts/art/pixellab/anim3/zoom.mjs <class> <anim> <row se|ne|sw|nw> <frame> <out.png>
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank } from '../../lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const ROW = { se: 'south-east', ne: 'north-east', sw: 'south-west', nw: 'north-west' };
const [cls, anim, row, fr, out] = process.argv.slice(2);
const dir = join(ROOT, 'src/assets/sheets', cls);
const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const img = readImage(join(dir, m.image));
const FW = m.frame.w, FH = m.frame.h, r = m.rows.indexOf(ROW[row]), col = m.anims[anim].col + Number(fr);
const x0 = (col % m.wrap) * FW, y0 = (Math.floor(col / m.wrap) * m.rows.length + r) * FH, anc = m.anchors[ROW[row]], S = 8;
const o = blank(FW * S, FH * S);
for (let y = 0; y < FH * S; y++) for (let x = 0; x < FW * S; x++) {
  const px = Math.floor(x / S), py = Math.floor(y / S), k = ((y0 + py) * img.w + x0 + px) * 4;
  let c = img.data[k + 3] ? [img.data[k], img.data[k + 1], img.data[k + 2], 255] : [150, 150, 110, 255];
  const gx = x % S === 0 && (px - anc.x) % 10 === 0, gy = y % S === 0 && (py - anc.y) % 10 === 0;
  if (gx || gy) c = (gx && px === anc.x) || (gy && py === anc.y) ? [255, 0, 0, 255] : [255, 255, 255, 255];
  o.data.set(c, (y * o.w + x) * 4);
}
writeImage(out, o);
