// Scale check: the militia's idle frame next to a mob's four game facings, feet on one line.
// Usage: node scripts/art/pixellab/mobs/scale.mjs <out.png> <dir with south-east.png ...> [--scale 4]
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank, crop, alphaBox } from '../../lib/ops.mjs';
import { blit } from '../sheet.mjs';

const args = process.argv.slice(2);
const si = args.indexOf('--scale');
const k = si >= 0 ? Number(args.splice(si, 2)[1]) : 4;
const [out, dir] = args;
const DIRS = ['south-east', 'north-east', 'south-west', 'north-west'];
const sheet = readImage(new URL('../../../../src/assets/sheets/militia/militia.png', import.meta.url).pathname);
const cells = [];
DIRS.forEach((d, r) => cells.push(crop(sheet, { x: 0, y: r * 114, w: 120, h: 114 }), readImage(`${dir}/${d}.png`)));
const boxes = cells.map((c) => alphaBox(c));
const H = Math.max(...boxes.map((b) => b.h)) + 4;
const W = boxes.reduce((s, b) => s + b.w + 4, 4);
const img = blank(W * k, H * k);
for (let i = 0; i < img.data.length; i += 4) img.data.set([0x8f, 0x8a, 0x42, 255], i);
let x = 4;
cells.forEach((c, i) => {
  const b = boxes[i];
  blit(img, crop(c, b), x * k, (H - 2 - b.h) * k, k);
  x += b.w + 4;
});
writeImage(out, img);
console.log(boxes.map((b) => `${b.w}x${b.h}`).join(' '));
