// Text dump of a sprite for measuring rows and columns: . transparent, # outline, R crimson, s skin, B b d e brown light to dark.
// Usage: node scripts/art/pixellab/ascii.mjs <sprite.png> [x0 x1 y0 y1]
import { readImage } from '../lib/png.mjs';
const [p, x0 = 0, x1 = 999, y0 = 0, y1 = 999] = process.argv.slice(2);
const im = readImage(p);
let hdr = '   '; for (let x = +x0; x < Math.min(im.w, +x1); x++) hdr += x % 10; console.log(hdr);
for (let y = +y0; y < Math.min(im.h, +y1); y++) {
  let s = '';
  for (let x = +x0; x < Math.min(im.w, +x1); x++) {
    const i = (y * im.w + x) * 4, d = im.data;
    if (d[i + 3] < 128) { s += '.'; continue; }
    const [r, g, b] = [d[i], d[i + 1], d[i + 2]], L = 0.3 * r + 0.59 * g + 0.11 * b;
    if (L < 22) s += '#';
    else if (r > g * 1.8 && r > b * 1.5) s += 'R';
    else if (r > 150 || (r > 120 && r - b > 50)) s += 's';
    else s += L > 85 ? 'B' : L > 60 ? 'b' : L > 40 ? 'd' : 'e';
  }
  console.log(String(y).padStart(2), s);
}
