// Nearest-neighbour upscale of a concept for upload (STYLE_LOCK §2 step B.3).
// Usage: node scripts/art/pixellab/rollout/upscale.mjs <in.png> <out.png> [k=4]
import { readImage, writeImage } from '../../lib/png.mjs';
import { resizeNearest } from '../../lib/ops.mjs';

const [src, out, k = 4] = process.argv.slice(2);
const im = readImage(src);
writeImage(out, resizeNearest(im, im.w * +k, im.h * +k));
console.log(out);
