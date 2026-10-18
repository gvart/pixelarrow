// Polish: frame strips of shipped clips straight from a sheet (what the game draws, after every fix and cut), one
// strip per <anim>:<dir>, for before / after comparisons. A tier may be forced (its ramps applied by exact colour).
// Usage: node scripts/art/pixellab/polish/strip.mjs <manifest.json> <out.png> <anim>:<dir> [...] [--scale 3] [--tier elite]
//   dir: se ne sw nw (or the full row name)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank, hexToRgb } from '../../lib/ops.mjs';

const D = { se: 'south-east', ne: 'north-east', sw: 'south-west', nw: 'north-west' };
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [mPath, out, ...clips] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const m = JSON.parse(readFileSync(mPath, 'utf8'));
const img = readImage(join(dirname(mPath), m.image));
const S = Number(opt('scale', 3));
const tier = opt('tier', 'basic');
const recol = new Map();
for (const [g, ramp] of Object.entries(m.tiers?.[tier] ?? {})) m.colorGroups[g].forEach((hex, i) => recol.set(hex, hexToRgb(ramp[i])));
const { w: FW, h: FH } = m.frame;
const wrap = m.wrap ?? Infinity;
const strips = clips.map((c) => { const [a, d] = c.split(':'); return { a, row: m.rows.indexOf(D[d] ?? d), anim: m.anims[a] }; });
for (const s of strips) if (!s.anim || s.row < 0) throw new Error(`no clip ${s.a} / row`);
const maxF = Math.max(...strips.map((s) => s.anim.frames));
const gap = 2;
const W = maxF * (FW * S + gap), H = strips.length * (FH * S + gap);
const o = blank(W, H);
for (let i = 0; i < W * H; i++) o.data.set([58, 54, 44, 255], i * 4);
const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
strips.forEach((s, si) => {
  for (let f = 0; f < s.anim.frames; f++) {
    const col = s.anim.col + f;
    const sx = (col % wrap) * FW, sy = (Math.floor(col / wrap) * m.rows.length + s.row) * FH;
    // frame tick: strike frame marked by a lighter ground
    const strike = f === s.anim.strike;
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const p = ((sy + y) * img.w + sx + x) * 4;
      const opaque = img.data[p + 3] >= 128;
      const c = opaque ? (recol.get(hex(img.data[p], img.data[p + 1], img.data[p + 2])) ?? [img.data[p], img.data[p + 1], img.data[p + 2]]) : strike ? [78, 72, 58] : null;
      if (!c) continue;
      for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) o.data.set([...c, 255], ((si * (FH * S + gap) + y * S + dy) * W + f * (FW * S + gap) + x * S + dx) * 4);
    }
  }
});
writeImage(out, o);
console.log(`${out} ${W}x${H}`);
