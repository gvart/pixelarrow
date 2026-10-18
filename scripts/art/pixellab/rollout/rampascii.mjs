// I4a: a text dump of which PA-WORLD-DARK-I4a ramp (and step) every pixel remaps to, to locate parts for retint.mjs.
// Letters: o outline, B darkBronze, Z bronze, C crimson, T teamRed, u umber, P purpleBlack, G plaidGreen, s skin,
// m metal, l linen, e enemySlate; the digit after a block is not shown, lowercase/uppercase is not the step.
// Usage: node scripts/art/pixellab/rollout/rampascii.mjs <sprite.png> [x0 x1 y0 y1]
import { join } from 'node:path';
import { readImage } from '../../lib/png.mjs';
import { ROOT } from '../../lib/manifest.mjs';
import { remap, loadRamps } from '../remap.mjs';

const L = { outline: 'o', darkBronze: 'B', bronze: 'Z', crimson: 'C', teamRed: 'T', umber: 'u', purpleBlack: 'P', plaidGreen: 'G', skin: 's', metal: 'm', linen: 'l', enemySlate: 'e' };
const [p, x0 = 0, x1 = 999, y0 = 0, y1 = 999] = process.argv.slice(2);
const ramps = loadRamps(join(ROOT, 'docs/v5/pixellab/I4a/palette-dark-i4a.json'));
const lookup = new Map(ramps.flatMap((r) => r.cols.map((c) => [c.rgb.join(','), r.name])));
const m = remap(readImage(p), ramps);
let hdr = '   '; for (let x = +x0; x < Math.min(m.w, +x1); x++) hdr += x % 10; console.log(hdr);
for (let y = +y0; y < Math.min(m.h, +y1); y++) {
  let s = '';
  for (let x = +x0; x < Math.min(m.w, +x1); x++) {
    const i = (y * m.w + x) * 4;
    s += m.data[i + 3] ? L[lookup.get(`${m.data[i]},${m.data[i + 1]},${m.data[i + 2]}`)] ?? '?' : '.';
  }
  console.log(String(y).padStart(2), s);
}
