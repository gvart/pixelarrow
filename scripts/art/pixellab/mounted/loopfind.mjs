// I4b: find the cleanest loop in a clip: for every pair (i < j, j - i >= min) the share of pixels that differ
// (alpha or colour) between frame i and frame j; a loop i..j-1 is seamless when frame j looks like frame i.
// Usage: node scripts/art/pixellab/mounted/loopfind.mjs <clip dir> [--min 8] [--top 10]
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readImage } from '../../lib/png.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const dir = args[0];
const fr = readdirSync(dir).filter((f) => f.endsWith('.png')).sort().map((f) => readImage(join(dir, f)));
const diff = (a, b) => {
  let n = 0, u = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const oa = a.data[i + 3] > 128, ob = b.data[i + 3] > 128;
    if (!oa && !ob) continue;
    u++;
    if (oa !== ob || Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 60) n++;
  }
  return n / u;
};
const min = Number(opt('min', 8));
const res = [];
for (let i = 0; i < fr.length; i++) for (let j = i + min; j < fr.length; j++) res.push({ i, j, len: j - i, d: diff(fr[i], fr[j]) });
res.sort((a, b) => a.d - b.d);
for (const r of res.slice(0, Number(opt('top', 10)))) console.log(`loop ${r.i}..${r.j - 1} (${r.len} frames): frame ${r.j} vs ${r.i} differs ${(r.d * 100).toFixed(1)}%`);
// neighbour step for reference
const steps = fr.slice(1).map((f, k) => diff(fr[k], f));
console.log('neighbour steps %:', steps.map((s) => (s * 100).toFixed(0)).join(' '));
