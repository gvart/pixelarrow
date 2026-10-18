// I4a: the most used colours of a character's rotations with their OKLab lightness, chroma and hue, to build ramps.
// Usage: node scripts/art/pixellab/rollout/colours.mjs <rotations dir> [n=40]
import { readImage } from '../../lib/png.mjs';
import { oklab } from '../remap.mjs';

const [dir, n = 40] = process.argv.slice(2);
const m = new Map();
for (const d of ['south', 'north', 'south-east', 'north-west']) {
  const im = readImage(`${dir}/${d}.png`);
  for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3] > 128) {
    const k = '#' + [0, 1, 2].map((c) => im.data[i + c].toString(16).padStart(2, '0')).join('');
    m.set(k, (m.get(k) ?? 0) + 1);
  }
}
for (const [k, v] of [...m].sort((a, b) => b[1] - a[1]).slice(0, +n)) {
  const rgb = [1, 3, 5].map((j) => parseInt(k.slice(j, j + 2), 16));
  const [L, a, b] = oklab(rgb);
  console.log(k, String(v).padStart(4), 'L', L.toFixed(2), 'C', Math.hypot(a, b).toFixed(3), 'h', (Math.atan2(b, a) * 180 / Math.PI).toFixed(0));
}
