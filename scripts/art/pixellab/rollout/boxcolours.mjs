// I4a: the exact colours inside a box of one sprite, with counts, to tell whether two parts that remap to one ramp
// use different raw colours (then a colour-keyed retint can split them).
// Usage: node scripts/art/pixellab/rollout/boxcolours.mjs <sprite.png> x0 x1 y0 y1
import { readImage } from '../../lib/png.mjs';

const [p, x0, x1, y0, y1] = process.argv.slice(2);
const im = readImage(p);
const m = new Map();
for (let y = +y0; y <= +y1; y++) for (let x = +x0; x <= +x1; x++) {
  const i = (y * im.w + x) * 4;
  if (im.data[i + 3] < 128) continue;
  const k = '#' + [0, 1, 2].map((c) => im.data[i + c].toString(16).padStart(2, '0')).join('');
  m.set(k, (m.get(k) ?? 0) + 1);
}
console.log([...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
