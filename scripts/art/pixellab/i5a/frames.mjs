// I5a: chosen frames of a shipped (v2 source) sheet, nearest-scaled, for a close look at one facing.
// Usage: node scripts/art/pixellab/i5a/frames.mjs <manifest.json> <out.png> --dir south-east --anims ready,charge [--frames 0,3,6] [--scale 6]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { crop } from '../../lib/ops.mjs';
import { buildSheet } from '../sheet.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [manPath, out] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const m = JSON.parse(readFileSync(manPath, 'utf8'));
const img = readImage(join(dirname(manPath), m.image));
const row = m.rows.indexOf(opt('dir', 'south-east'));
const R = m.rows.length, wrap = m.wrap ?? 1e9;
const rows = [];
for (const anim of opt('anims').split(',')) {
  const a = m.anims[anim];
  const want = opt('frames') ? opt('frames').split(',').map(Number).filter((f) => f < a.frames) : [...Array(a.frames).keys()];
  const imgs = want.map((f) => {
    const col = a.col + f;
    return crop(img, { x: (col % wrap) * m.frame.w, y: (Math.floor(col / wrap) * R + row) * m.frame.h, w: m.frame.w, h: m.frame.h });
  });
  rows.push({ label: `${anim} ${opt('dir', 'south-east')} f${want.join(',')}`, imgs });
}
writeImage(out, buildSheet(rows, { scale: Number(opt('scale', 6)) }));
console.log(out);
