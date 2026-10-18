// I4a proportion check of a south view, the same way for every class and for H4 (STYLE_LOCK §2 normalisation):
//  - centre: the body's centre column, the middle of the opaque run around the canvas centre at the knees
//  - feet: the last opaque row; head top: the first row with a contiguous opaque run of >= 5 px within 8 px of the
//    run through the centre column (a crest, plume, pilos point is narrower; a weapon at the side is not on the centre)
//  - shoulders: the first row 8+ px below the head top (past a Boeotian brim) where the run through the centre is >= 15 px (the chin is about 1 px above)
//  - heads = stature / (shoulders - head top): a relative measure, compared against H4's
// Usage: node scripts/art/pixellab/rollout/stature.mjs <south.png> [more.png ...]  -> one JSON line each
import { readImage } from '../../lib/png.mjs';

for (const p of process.argv.slice(2)) {
  const im = readImage(p);
  const op = (x, y) => x >= 0 && x < im.w && im.data[(y * im.w + x) * 4 + 3] > 128;
  let feet = -1;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (op(x, y)) feet = y;
  // run through column c on row y
  const run = (y, c) => { if (!op(c, y)) return [c, c - 1]; let a = c, b = c; while (op(a - 1, y)) a--; while (op(b + 1, y)) b++; return [a, b]; };
  const ky = feet - 12;
  let cx = Math.floor(im.w / 2), best = 99;
  for (let x = 0; x < im.w; x++) if (op(x, ky) && Math.abs(x - im.w / 2) < best) { best = Math.abs(x - im.w / 2); cx = x; }
  // knees: two legs; take the span of opaque px within 10 of cx
  let l = cx, r = cx;
  for (let x = cx - 10; x <= cx + 10; x++) if (op(x, ky)) { l = Math.min(l, x); r = Math.max(r, x); }
  cx = Math.round((l + r) / 2);
  let top = -1;
  for (let y = 0; y < feet && top < 0; y++) {
    const [a, b] = run(y, cx); if (b - a + 1 >= 5 && b - a + 1 <= 16 && a <= cx - 1 && b >= cx + 1) top = y;
  }
  let sh = -1;
  for (let y = top + 8; y < feet && sh < 0; y++) { const [a, b] = run(y, cx); if (b - a + 1 >= 15) sh = y; }
  const stature = feet - top + 1;
  console.log(JSON.stringify({ file: p.split('/').slice(-6).join('/'), centre: cx, headTop: top, shoulders: sh, feet, stature, heads: +(stature / (sh - top)).toFixed(2) }));
}
