// I4a proportion overlay: each class's south view with H4's south silhouette edge drawn over it in cyan (both stand
// on the same feet row, so a taller or broader body shows at once), plus guide lines at H4's helmet top (row 10),
// shoulders (21) and the feet (66).
// Usage: node scripts/art/pixellab/rollout/overlay.mjs <out.png> <label>=<south.png> ...  [--scale 4]
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { ROOT } from '../../lib/manifest.mjs';
import { buildSheet } from '../sheet.mjs';

const args = process.argv.slice(2);
const scale = Number(args.includes('--scale') ? args[args.indexOf('--scale') + 1] : 4);
const out = args[0];
const h4 = readImage(join(ROOT, 'docs/v5/pixellab/I4a/raw/H4/zip/Idle/rotations/south.png'));
const op = (im, x, y) => x >= 0 && y >= 0 && x < im.w && y < im.h && im.data[(y * im.w + x) * 4 + 3] > 128;
const imgs = [];
for (const a of args.slice(1).filter((s) => s.includes('='))) {
  const im = readImage(a.split('=')[1]);
  const o = { w: im.w, h: im.h, data: new Uint8Array(im.data) };
  const put = (x, y, c) => o.data.set([...c, 255], (y * o.w + x) * 4);
  for (const gy of [10, 21, 66]) for (let x = 0; x < o.w; x += 2) put(x, gy, [255, 255, 0]);
  for (let y = 0; y < h4.h; y++) for (let x = 0; x < h4.w; x++) {
    if (!op(h4, x, y)) continue;
    if (!op(h4, x - 1, y) || !op(h4, x + 1, y) || !op(h4, x, y - 1) || !op(h4, x, y + 1)) put(x, y, [0, 230, 255]);
  }
  imgs.push(o);
}
writeImage(out, buildSheet([{ label: args.slice(1).filter((s) => s.includes('=')).map((s) => s.split('=')[0]).join(' '), imgs }], { scale }));
console.log(out);
