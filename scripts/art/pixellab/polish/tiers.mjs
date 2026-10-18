// Polish: a quick side-by-side of a sheet's basic / veteran / elite tiers (the manifest's tier ramps applied by exact
// colour, as the runtime does before skin, shade and rarity), one frame per facing, at a zoom and at 1x.
// Usage: node scripts/art/pixellab/polish/tiers.mjs <manifest.json> <out.png> [--anim idle] [--frame 0] [--scale 4]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank, hexToRgb } from '../../lib/ops.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [mPath, out] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const m = JSON.parse(readFileSync(mPath, 'utf8'));
const img = readImage(join(dirname(mPath), m.image));
const anim = m.anims[opt('anim', 'idle')];
const col = anim.col + Number(opt('frame', 0));
const S = Number(opt('scale', 4));
const { w: FW, h: FH } = m.frame;
const wrap = m.wrap ?? Infinity;
const tiers = ['basic', 'veteran', 'elite'];
const maps = tiers.map((t) => {
  const mp = new Map();
  for (const [g, ramp] of Object.entries(m.tiers?.[t] ?? {})) m.colorGroups[g].forEach((hex, i) => mp.set(hex, hexToRgb(ramp[i])));
  return mp;
});
const bg = [58, 54, 44];
const gap = 4;
// rows: tiers; columns: facings at S, then facings at 1x
const W = m.rows.length * (FW * S + gap) + m.rows.length * (FW + gap);
const H = tiers.length * (FH * S + gap);
const o = blank(W, H);
for (let i = 0; i < W * H; i++) o.data.set([...bg, 255], i * 4);
const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
tiers.forEach((t, ti) => {
  m.rows.forEach((_, ri) => {
    const sx = (col % wrap) * FW, sy = (Math.floor(col / wrap) * m.rows.length + ri) * FH;
    for (const [z, ox] of [[S, ri * (FW * S + gap)], [1, m.rows.length * (FW * S + gap) + ri * (FW + gap)]]) {
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        const p = ((sy + y) * img.w + sx + x) * 4;
        if (img.data[p + 3] < 128) continue;
        const c = maps[ti].get(hex(img.data[p], img.data[p + 1], img.data[p + 2])) ?? [img.data[p], img.data[p + 1], img.data[p + 2]];
        for (let dy = 0; dy < z; dy++) for (let dx = 0; dx < z; dx++) {
          const X = ox + x * z + dx, Y = ti * (FH * S + gap) + y * z + dy;
          o.data.set([...c, 255], (Y * W + X) * 4);
        }
      }
    }
  });
});
writeImage(out, o);
console.log(out);
