// Guardians (ART-L): review strip of raw clip folders (frame_NNN.png side by side, one row per folder, every other
// frame with --half), on a dark ground.
// Usage: node scripts/art/pixellab/guard/strip.mjs <out.png> [--half] <clip dir> [<clip dir> ...]
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank, paste } from '../../lib/ops.mjs';

const args = process.argv.slice(2);
const half = args.includes('--half');
const [out, ...dirs] = args.filter((a) => a !== '--half');
const rows = dirs.map((d) => readdirSync(d).filter((f) => /^frame_\d+\.png$/.test(f)).sort()
  .filter((_, i) => !half || i % 2 === 0).map((f) => readImage(join(d, f))));
const W = Math.max(...rows.map((r) => r.reduce((s, f) => s + f.w, 0)));
const H = rows.reduce((s, r) => s + Math.max(...r.map((f) => f.h)), 0);
const c = blank(W, H);
for (let i = 0; i < W * H; i++) c.data.set([38, 34, 30, 255], i * 4);
let y = 0;
for (const r of rows) {
  let x = 0;
  for (const f of r) {
    for (let fy = 0; fy < f.h; fy++) for (let fx = 0; fx < f.w; fx++) {
      const k = (fy * f.w + fx) * 4;
      if (f.data[k + 3] > 127) c.data.set([f.data[k], f.data[k + 1], f.data[k + 2], 255], ((y + fy) * W + x + fx) * 4);
    }
    x += f.w;
  }
  y += Math.max(...r.map((f) => f.h));
}
writeImage(out, c);
console.log(`${out}: ${W}x${H}`);
