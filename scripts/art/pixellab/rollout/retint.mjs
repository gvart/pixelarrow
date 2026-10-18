// I4a: move one part's pixels into a ramp of its own, so a recolour group is exclusive (main's I4a review: "a tiny hue
// or value shift is fine"). In every view, the opaque pixels inside a box (rows y0..y1, within dx of the body's centre
// column) whose PA-WORLD-DARK-I4a ramp is one of --from become the --to ramp's step nearest in OKLab lightness.
// Outline and skin pixels are never touched unless named in --from.
// Usage: node scripts/art/pixellab/rollout/retint.mjs <rotations dir> <out dir> --rows y0:y1 --dx 6 --from darkBronze,plaidGreen --to bronze
//          [--views south,south-east,...]  [--x0 x --x1 x]  (fixed columns instead of the centre +- dx)
//          [--inner]  (skip pixels on the silhouette edge, so the outline around the part stays)
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { ROOT } from '../../lib/manifest.mjs';
import { remap, loadRamps, oklab } from '../remap.mjs';
import { DIRS8 } from '../sheet.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [dir, out] = args;
const [y0, y1] = opt('rows').split(':').map(Number);
const dx = Number(opt('dx', 6));
const from = new Set(opt('from').split(','));
const views = new Set((opt('views', DIRS8.join(','))).split(','));
const ramps = loadRamps(join(ROOT, 'docs/v5/pixellab/I4a/palette-dark-i4a.json'));
const to = ramps.find((r) => r.name === opt('to'));
const lookup = new Map(ramps.flatMap((r) => r.cols.map((c) => [c.rgb.join(','), r.name])));
mkdirSync(out, { recursive: true });
for (const d of DIRS8) {
  const im = readImage(`${dir}/${d}.png`);
  if (views.has(d)) {
    const m = remap(im, ramps);
    const op = (x, y) => im.data[(y * im.w + x) * 4 + 3] > 128;
    let feet = 0; for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (op(x, y)) feet = y;
    // centre: the middle of the opaque span within 10 px of the canvas centre, 12 rows above the feet (the knees)
    let l = 99, r = -1; const ky = feet - 12;
    for (let x = 24; x <= 44; x++) if (op(x, ky)) { l = Math.min(l, x); r = Math.max(r, x); }
    const cx = Math.round((l + r) / 2);
    let n = 0;
    const xa = args.includes('--x0') ? Number(opt('x0')) : cx - dx, xb = args.includes('--x1') ? Number(opt('x1')) : cx + dx;
    for (let y = y0; y <= y1; y++) for (let x = xa; x <= xb; x++) {
      const i = (y * im.w + x) * 4;
      if (!m.data[i + 3]) continue;
      if (!from.has(lookup.get(`${m.data[i]},${m.data[i + 1]},${m.data[i + 2]}`))) continue;
      if (args.includes('--inner') && (!op(x - 1, y) || !op(x + 1, y) || !op(x, y - 1) || !op(x, y + 1))) continue;
      const L = oklab([im.data[i], im.data[i + 1], im.data[i + 2]])[0];
      let best = to.cols[0], bd = Infinity;
      for (const c of to.cols) { const dd = (c.lab[0] - L) ** 2; if (dd < bd) (bd = dd), (best = c); }
      im.data.set(best.rgb, i); n++;
    }
    console.log(`${d}: centre ${cx}, ${n} px -> ${to.name}`);
  }
  writeImage(`${out}/${d}.png`, im);
}
