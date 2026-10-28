// Guardians (W-67): clean a raw PixMiniMax clip in place. PixMiniMax draws blood, claw smears and dust on beast attacks
// whatever the prompt says: every bright red pixel becomes the dark maw colour, and only the biggest opaque piece (and
// pieces at least a quarter its size) is kept, so detached splats, dust and slash arcs go. `i=j` replaces frame i with
// frame j (a smear frame by its neighbour, as 40c lesson 4). The original frames are kept once in <clip>/orig/.
// Usage: node scripts/art/pixellab/guard/clean.mjs <clip dir> [i=j ...]
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';

const [dir, ...swaps] = process.argv.slice(2);
const MAW = [38, 26, 22];
const frames = readdirSync(dir).filter((f) => /^frame_\d+\.png$/.test(f)).sort();
if (!existsSync(join(dir, 'orig'))) {
  mkdirSync(join(dir, 'orig'));
  for (const f of frames) copyFileSync(join(dir, f), join(dir, 'orig', f));
}
const name = (i) => `frame_${String(i).padStart(3, '0')}.png`;
for (const s of swaps) {
  const [i, j] = s.split('=').map(Number);
  copyFileSync(join(dir, 'orig', name(j)), join(dir, name(i)));
}
const first = readImage(join(dir, 'orig', frames[0]));
let top = first.h, bot = -1;
for (let i = 0; i < first.w * first.h; i++) if (first.data[i * 4 + 3] >= 128) (top = Math.min(top, Math.floor(i / first.w)), bot = Math.floor(i / first.w));
const ground = bot - Math.round((bot - top) * 0.1);
const swapped = new Set(swaps.map((s) => name(Number(s.split('=')[0]))));
let red = 0, cut = 0;
for (const f of frames) {
  const im = readImage(swapped.has(f) ? join(dir, f) : join(dir, 'orig', f));
  const { w, h, data } = im;
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    // red on the ground (the bottom tenth of the first frame's figure) is a splat: cut; above it, a maw: darkened
    if (data[i * 4 + 3] >= 128 && r >= 110 && r > 1.7 * g && r > 1.7 * b) {
      if (Math.floor(i / w) >= ground) data[i * 4 + 3] = 0;
      else data.set(MAW, i * 4);
      red++;
    }
  }
  const seen = new Uint8Array(w * h), comps = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || data[i * 4 + 3] < 128) continue;
    const c = [i];
    seen[i] = 1;
    for (let k = 0; k < c.length; k++) {
      const p = c[k], x = p % w, y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, q = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[q] || data[q * 4 + 3] < 128) continue;
        seen[q] = 1;
        c.push(q);
      }
    }
    comps.push(c);
  }
  const big = Math.max(0, ...comps.map((c) => c.length));
  for (const c of comps) if (c.length < big / 4) for (const p of c) (data[p * 4 + 3] = 0, cut++);
  writeImage(join(dir, f), im);
}
console.log(`${dir}: ${frames.length} frames, ${red} red px darkened, ${cut} stray px cut${swaps.length ? `, swapped ${swaps.join(' ')}` : ''}`);
