// ANIM-2: put a clip's feet back on the ground. Some generated clips drift up frame by frame (celt_sword's charge
// north-east climbs 25 px over 12 frames, then snaps back on the loop: the "jump" seen when swordsmen attack on the
// move). Each frame of the clip, in every facing, is shifted up or down so its lowest opaque row sits on the row's
// anchor (the feet row), in place in src/assets/sheets/<class>/.
// Usage: node scripts/art/pixellab/anim2/ground.mjs <class> <anim> [<anim> ...]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../lib/png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const [cls, ...anims] = process.argv.slice(2);
const dir = join(ROOT, 'src/assets/sheets', cls);
const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const img = readImage(join(dir, m.image));
const FW = m.frame.w, FH = m.frame.h, wrap = m.wrap ?? 1e9, R = m.rows.length;
for (const name of anims) {
  const a = m.anims[name];
  if (!a) throw new Error(`${cls}: no clip ${name}`);
  const moved = [];
  for (let r = 0; r < R; r++) for (let i = 0; i < a.frames; i++) {
    const col = a.col + i, x0 = (col % wrap) * FW, y0 = (Math.floor(col / wrap) * R + r) * FH;
    const at = (x, y) => ((y0 + y) * img.w + x0 + x) * 4;
    let bot = -1;
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (img.data[at(x, y) + 3]) bot = y;
    const dy = m.anchors[m.rows[r]].y - bot;
    if (bot < 0 || !dy) continue;
    const f = new Uint8Array(FW * FH * 4);
    for (let y = 0; y < FH; y++) f.set(img.data.subarray(at(0, y), at(FW, y)), y * FW * 4);
    for (let y = 0; y < FH; y++) {
      const sy = y - dy;
      img.data.fill(0, at(0, y), at(FW, y));
      if (sy >= 0 && sy < FH) img.data.set(f.subarray(sy * FW * 4, (sy + 1) * FW * 4), at(0, y));
    }
    moved.push(`${m.rows[r]}#${i}:${dy > 0 ? '+' : ''}${dy}`);
  }
  console.log(`${cls} ${name}: ${moved.length} frames moved ${moved.join(' ')}`);
}
writeImage(join(dir, m.image), img);
