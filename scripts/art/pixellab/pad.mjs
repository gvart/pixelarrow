// Pad a sprite onto a bigger transparent canvas (no scaling), e.g. to give a skeleton-v3 thrust room to reach.
// Usage: node scripts/art/pixellab/pad.mjs <in.png> <out.png> <W> <H> <dx> <dy>
import { readImage, writeImage } from '../lib/png.mjs';
import { blank, paste } from '../lib/ops.mjs';

const [src, out, W, H, dx, dy] = process.argv.slice(2);
const img = readImage(src);
const o = blank(Number(W), Number(H));
paste(o, img, Number(dx), Number(dy));
writeImage(out, o);
console.log(`${out} ${W}x${H} (${img.w}x${img.h} at ${dx},${dy})`);
