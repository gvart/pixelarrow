// Re-proportion a front-facing sprite into a concept image for PixelLab (I3a): PixelLab's Pro characters come back
// with big helmets and short legs whatever the prompt says, so we stretch and shrink horizontal bands of a good
// sprite to the rig's real-man proportions (rig.mjs BODY: 7 heads, legs about half the height) and send the result
// as `concept_image_url` with the style character; the model redraws it clean in the style.
// Usage: node scripts/art/pixellab/proportion.mjs <in.png> <out.png> --bands y0:y1:sy[:sx],... [--feet 66] [--w 68 --h 68]
//   bands   rows y0..y1 (inclusive, top to bottom) of the input, scaled vertically by sy and horizontally by sx
//           (default 1) about column cx (default the band's opaque centre), only within r px of it (default all:
//           a held spear further out stays where it is); rows outside every band are dropped
//   feet    the output row the last band's bottom lands on
import { readImage, writeImage } from '../lib/png.mjs';
import { blank } from '../lib/ops.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [src, out] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const img = readImage(src);
const W = Number(opt('w', img.w)), H = Number(opt('h', img.h)), feet = Number(opt('feet', H - 2));
const bands = opt('bands').split(',').map((b) => b.split(':').map(Number));
const at = (x, y) => img.data.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4);
// rows of the output, bottom up
const rows = [];
for (const [y0, y1, sy, sx = 1, r = 999, bcx] of bands) {
  let cx0 = img.w, cx1 = -1;
  for (let y = y0; y <= y1; y++) for (let x = 0; x < img.w; x++) if (at(x, y)[3] > 8) { cx0 = Math.min(cx0, x); cx1 = Math.max(cx1, x); }
  const cx = bcx ?? (cx0 + cx1) / 2;
  const n = Math.max(1, Math.round((y1 - y0 + 1) * sy));
  for (let j = 0; j < n; j++) rows.push({ y: Math.min(y1, y0 + Math.floor(((j + 0.5) / n) * (y1 - y0 + 1))), sx, cx, r });
}
const o = blank(W, H);
const top = feet - rows.length + 1;
rows.forEach((r, j) => {
  const Y = top + j;
  if (Y < 0 || Y >= H) return;
  for (let X = 0; X < W; X++) {
    let x = X;
    if (Math.abs(X - r.cx) <= r.r) {
      x = Math.round(r.cx + (X - r.cx) / r.sx);
      if (Math.abs(x - r.cx) > r.r) continue;
    }
    if (x < 0 || x >= img.w) continue;
    const p = at(x, r.y);
    if (p[3] > 8) o.data.set(p, (Y * W + X) * 4);
  }
});
writeImage(out, o);
console.log(`${out}: ${rows.length} rows from ${bands.length} bands, top ${top}, feet ${feet}`);
