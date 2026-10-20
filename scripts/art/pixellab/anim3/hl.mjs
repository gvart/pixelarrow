// ANIM-3: a clip of a sheet at 3x, the colours of the given colour groups painted green (which pixels a recolour or
// tier touches). Usage: node scripts/art/pixellab/anim3/hl.mjs <sheet dir> <anim> <group,...> <out.png>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank, rgbToHex } from '../../lib/ops.mjs';
const [dir, anim, groups, out] = process.argv.slice(2);
const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const img = readImage(join(dir, m.image));
const set = new Set(groups.split(',').flatMap((g) => m.colorGroups[g] ?? []));
const a = m.anims[anim], FW = m.frame.w, FH = m.frame.h, W = m.wrap, R = m.rows.length, S = 3;
const o = blank(a.frames * FW * S, R * FH * S);
for (let r = 0; r < R; r++) for (let i = 0; i < a.frames; i++) {
  const col = a.col + i, x0 = (col % W) * FW, y0 = (Math.floor(col / W) * R + r) * FH;
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const k = ((y0 + y) * img.w + x0 + x) * 4;
    let c = [140, 140, 80, 255];
    if (img.data[k + 3]) { c = [img.data[k], img.data[k + 1], img.data[k + 2], 255]; if (set.has(rgbToHex(c))) c = [0, 255, 0, 255]; }
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) o.data.set(c, (((r * FH + y) * S + dy) * o.w + (i * FW + x) * S + dx) * 4);
  }
}
writeImage(out, o);
