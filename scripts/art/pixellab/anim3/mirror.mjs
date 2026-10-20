// ANIM-3: replace one facing of a clip with another facing mirrored left-right about the row anchors, in place in
// src/assets/sheets/<class>/. For a back-view clip whose north-east turned to a side view (hoplite chop / mine),
// the north-west mirrored is a north-east that keeps his back to the viewer.
// Usage: node scripts/art/pixellab/anim3/mirror.mjs <class> <from dir> <to dir> <anim> [<anim> ...]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../lib/png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const [cls, from, to, ...anims] = process.argv.slice(2);
const dir = join(ROOT, 'src/assets/sheets', cls);
const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const img = readImage(join(dir, m.image));
const FW = m.frame.w, FH = m.frame.h, wrap = m.wrap, R = m.rows.length;
const rf = m.rows.indexOf(from), rt = m.rows.indexOf(to);
if (rf < 0 || rt < 0) throw new Error(`no row ${from} / ${to}`);
const ax = m.anchors[from].x, bx = m.anchors[to].x;
for (const name of anims) {
  const a = m.anims[name];
  if (!a) throw new Error(`${cls}: no clip ${name}`);
  let lost = 0;
  for (let i = 0; i < a.frames; i++) {
    const col = a.col + i, x0 = (col % wrap) * FW, band = Math.floor(col / wrap) * R;
    const sy0 = (band + rf) * FH, dy0 = (band + rt) * FH;
    const at = (x, y) => (y * img.w + x0 + x) * 4;
    for (let y = 0; y < FH; y++) img.data.fill(0, at(0, dy0 + y), at(FW, dy0 + y));
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const s = at(x, sy0 + y);
      if (!img.data[s + 3]) continue;
      const dx = bx + (ax - x);
      if (dx < 0 || dx >= FW) { lost++; continue; }
      img.data.set(img.data.subarray(s, s + 4), at(dx, dy0 + y));
    }
  }
  console.log(`${cls} ${name}: ${to} = ${from} mirrored${lost ? `, ${lost} px off the frame` : ''}`);
}
writeImage(join(dir, m.image), img);
