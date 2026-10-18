// One GIF per animation of a promoted sheet, the 4 facings side by side, at the clip's own fps (held clips play
// the entry once, then the loop twice). Optionally a tier: the manifest's recolour applied by position.
// Usage: node scripts/art/pixellab/sheetgifs.mjs <manifest.json> <out dir> [--scale 3] [--tier elite] [--strips]
//   --strips  also a PNG per animation: the 4 facings as rows, every frame (for the frame-by-frame review)
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readImage } from '../lib/png.mjs';
import { crop, hexToRgb } from '../lib/ops.mjs';
import { writeGif } from './gif.mjs';
import { buildSheet } from './sheet.mjs';
import { writeImage } from '../lib/png.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [manPath, out] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const scale = Number(opt('scale', 3));
const tier = opt('tier');
mkdirSync(out, { recursive: true });
const m = JSON.parse(readFileSync(manPath, 'utf8'));
const img = readImage(join(dirname(manPath), m.image));
const swap = new Map();
for (const [g, ramp] of Object.entries((tier && m.tiers?.[tier]) || {})) m.colorGroups[g].forEach((c, i) => swap.set(c, hexToRgb(ramp[i])));
const hex = (d, i) => '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
const FW = m.frame.w, FH = m.frame.h, wrap = m.wrap ?? 1e9, R = m.rows.length;
const frame = (row, col) => {
  const f = crop(img, { x: (col % wrap) * FW, y: (Math.floor(col / wrap) * R + row) * FH, w: FW, h: FH });
  if (swap.size) for (let i = 0; i < f.data.length; i += 4) if (f.data[i + 3]) { const c = swap.get(hex(f.data, i)); if (c) f.data.set(c, i); }
  return f;
};
for (const [anim, a] of Object.entries(m.anims)) {
  const order = [];
  const hold = a.hold ?? 0;
  for (let i = 0; i < a.frames; i++) order.push(i);
  if (hold) for (let i = hold; i < a.frames; i++) order.push(i);
  const clips = m.rows.map((_, row) => order.map((i) => frame(row, a.col + i)));
  const file = join(out, `${m.class}${tier ? `_${tier}` : ''}_${anim}.gif`);
  writeGif(file, clips, { fps: a.fps, scale });
  if (args.includes('--strips')) writeImage(join(out, `${m.class}${tier ? `_${tier}` : ''}_${anim}.png`), buildSheet(m.rows.map((d, row) => ({ label: `${anim} ${d}`, imgs: Array.from({ length: a.frames }, (_, i) => frame(row, a.col + i)) })), { scale: 2 }));
  console.log(`${file} (${a.frames} frames @ ${a.fps} fps)`);
}
