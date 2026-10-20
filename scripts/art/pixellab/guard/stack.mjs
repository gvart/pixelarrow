// Guardians (ART-L): stack review strips (e.g. mobs/build.mjs <raw>/strips/<anim>_<dir>.png) on a dark ground,
// optionally shrunk by a whole factor (nearest) for a quick look.
// Usage: node scripts/art/pixellab/guard/stack.mjs <out.png> <factor> <png> [<png> ...]
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank } from '../../lib/ops.mjs';

const [out, f, ...files] = process.argv.slice(2);
const k = Number(f);
const ims = files.map((p) => readImage(p));
const W = Math.ceil(Math.max(...ims.map((i) => i.w)) / k), H = ims.reduce((s, i) => s + Math.ceil(i.h / k), 0);
const c = blank(W, H);
for (let i = 0; i < W * H; i++) c.data.set([40, 36, 32, 255], i * 4);
let y0 = 0;
for (const im of ims) {
  for (let y = 0; y < Math.ceil(im.h / k); y++) for (let x = 0; x < Math.ceil(im.w / k); x++) {
    const q = (y * k * im.w + x * k) * 4;
    if (im.data[q + 3]) c.data.set([im.data[q], im.data[q + 1], im.data[q + 2], 255], ((y0 + y) * W + x) * 4);
  }
  y0 += Math.ceil(im.h / k);
}
writeImage(out, c);
console.log(`${out}: ${W}x${H}`);
