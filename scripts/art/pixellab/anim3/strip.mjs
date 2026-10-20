// ANIM-3: drop clips from a shipped sheet and pack the rest left (src/assets/sheets/<class>/, in place). The
// militia and hoplite log `carry` clips went out of use when the carry became the walk with a load overlay.
// Usage: node scripts/art/pixellab/anim3/strip.mjs <class> <anim> [<anim> ...]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank } from '../../lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const [cls, ...drop] = process.argv.slice(2);
const dir = join(ROOT, 'src/assets/sheets', cls), mp = join(dir, 'manifest.json');
const m = JSON.parse(readFileSync(mp, 'utf8'));
const img = readImage(join(dir, m.image));
const FW = m.frame.w, FH = m.frame.h, R = m.rows.length, wrap = m.wrap;
for (const d of drop) if (!m.anims[d]) throw new Error(`${cls}: no clip ${d}`);
const keep = Object.entries(m.anims).filter(([n]) => !drop.includes(n)).sort((a, b) => a[1].col - b[1].col);
const cols = keep.reduce((s, [, a]) => s + a.frames, 0), bands = Math.ceil(cols / wrap);
const out = blank(Math.min(cols, wrap) * FW, bands * R * FH);
const anims = {};
let c = 0;
for (const [name, a] of keep) {
  anims[name] = { ...a, col: c };
  for (let i = 0; i < a.frames; i++, c++) for (let r = 0; r < R; r++) {
    const s = a.col + i, sx = (s % wrap) * FW, sy = (Math.floor(s / wrap) * R + r) * FH;
    const dx = (c % wrap) * FW, dy = (Math.floor(c / wrap) * R + r) * FH;
    for (let y = 0; y < FH; y++) out.data.set(img.data.subarray(((sy + y) * img.w + sx) * 4, ((sy + y) * img.w + sx + FW) * 4), ((dy + y) * out.w + dx) * 4);
  }
}
// keep the manifest's key order (the one-line `loads` of anim3/anchors.mjs too)
const loads = m.loads;
m.anims = Object.fromEntries(Object.keys(m.anims).filter((n) => anims[n]).map((n) => [n, anims[n]]));
if (loads) m.loads = '@loads';
writeImage(join(dir, m.image), out);
writeFileSync(mp, JSON.stringify(m, null, 1).replace('"@loads"', JSON.stringify(loads)) + '\n');
console.log(`${cls}: -${drop.join(', ')}; ${cols} columns -> ${out.w}x${out.h} (was ${img.w}x${img.h})`);
