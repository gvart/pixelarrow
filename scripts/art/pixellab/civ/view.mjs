// Review helper: images side by side on an olive ground, zoomed (nearest).
// Usage: node scripts/art/pixellab/civ/view.mjs <out.png> <zoom> <img.png> [<img.png> ...]
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank } from '../../lib/ops.mjs';
import { blit } from '../sheet.mjs';

const [out, z, ...files] = process.argv.slice(2);
const K = Number(z);
const imgs = files.map(readImage);
const W = imgs.reduce((t, i) => t + i.w + 2, 2), H = Math.max(...imgs.map((i) => i.h)) + 4;
const o = blank(W * K, H * K);
for (let i = 0; i < o.data.length; i += 4) o.data.set([0x8f, 0x8a, 0x42, 255], i);
let x = 2;
for (const i of imgs) { blit(o, i, x * K, 2 * K, K); x += i.w + 2; }
writeImage(out, o);
