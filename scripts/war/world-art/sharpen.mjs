// Sharp base (v3): the 1024 painting is cut into 3x3 overlapping tiles, Gemini repaints each at 1024 px with the same
// style (PROMPTS_ART.md §37d), and this script fits every repaint back onto its tile (sub-pixel shift, colour match),
// feathers the overlaps and writes public/war/world/src/painted@hi.jpg (the source paint.mjs resamples from).
// Usage: node scripts/war/world-art/sharpen.mjs cut <dir>    writes tile_RC.png (the crops, upscaled to 1024x768)
//        node scripts/war/world-art/sharpen.mjs blend <dir>  reads gem_RC.png (Gemini's repaints), writes the source
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { OUT } from './regions.mjs';

const SRC = join(OUT, 'src', 'painted.png'); // 1024x768, the approved painting
export const HI = join(OUT, 'src', 'painted@hi.jpg');
const TW = 380, TH = 285; // tile in source px (4:3, like Gemini's output)
const XS = [0, 322, 644], YS = [0, 241, 483];
const F = 3.6; // output px per source px: 3686x2765, then paint.mjs resamples to the 4096 @2x
const [cmd, dir] = process.argv.slice(2);

const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);

if (cmd === 'cut') {
  for (const [r, y] of YS.entries()) for (const [c, x] of XS.entries())
    ff(['-i', SRC, '-vf', `crop=${TW}:${TH}:${x}:${y},scale=1024:768:flags=lanczos`, join(dir, `tile_${r}${c}.png`)]);
} else if (cmd === 'blend') {
  const W = Math.round(1024 * F), H = Math.round(768 * F);
  // the reference: the painting upscaled (what each repaint must line up with and stay true to in colour)
  ff(['-i', SRC, '-vf', `scale=${W}:${H}:flags=lanczos`, join(dir, 'ref.png')]);
  const ref = readImage(join(dir, 'ref.png'));
  const acc = new Float32Array(W * H * 3), wsum = new Float32Array(W * H);
  const tw = Math.round(TW * F), th = Math.round(TH * F);
  for (const [r, y0] of YS.entries()) for (const [c, x0] of XS.entries()) {
    const name = join(dir, `gem_${r}${c}.png`), fit = join(dir, `fit_${r}${c}.png`);
    const ox = Math.round(x0 * F), oy = Math.round(y0 * F), have = existsSync(name);
    // a tile Gemini would not repaint: the upscaled painting with a light unsharp, feathered in like the others
    if (have) ff(['-i', name, '-vf', `scale=${tw}:${th}:flags=lanczos`, fit]);
    else ff(['-i', join(dir, 'ref.png'), '-vf', `crop=${tw}:${th}:${ox}:${oy},unsharp=5:5:0.7`, fit]);
    const t = readImage(fit);
    const [dx, dy] = have ? align(t, ref, ox, oy) : [0, 0];
    const [gain, bias] = have ? colourMatch(t, ref, ox, oy, dx, dy) : [[1, 1, 1], [0, 0, 0]];
    const fx = Math.round((TW - 0) * F * 0.16), fy = Math.round(TH * F * 0.16); // feather width ~ the overlap
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const X = ox + x, Y = oy + y, sx = x + dx, sy = y + dy;
      if (X >= W || Y >= H || sx < 0 || sy < 0 || sx >= tw || sy >= th) continue;
      // weight: ramps up from the tile edge (except on the frame's own edge)
      const wx = Math.min(1, (c === 0 ? 1 : (x + 1) / fx), (c === 2 ? 1 : (tw - x) / fx));
      const wy = Math.min(1, (r === 0 ? 1 : (y + 1) / fy), (r === 2 ? 1 : (th - y) / fy));
      const w = Math.max(1e-4, wx * wy) ** 1.5, s = (sy * tw + sx) * 4, i = Y * W + X;
      for (let k = 0; k < 3; k++) acc[i * 3 + k] += w * (t.data[s + k] * gain[k] + bias[k]);
      wsum[i] += w;
    }
    console.log(`tile ${r}${c}: ${have ? '' : 'no repaint (painting + unsharp), '}shift ${dx},${dy} gain ${gain.map((g) => g.toFixed(2))}`);
  }
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    for (let k = 0; k < 3; k++) data[i * 4 + k] = wsum[i] ? Math.max(0, Math.min(255, Math.round(acc[i * 3 + k] / wsum[i]))) : ref.data[i * 4 + k];
    data[i * 4 + 3] = 255;
  }
  writeImage(join(dir, 'hi.png'), { w: W, h: H, data });
  ff(['-i', join(dir, 'hi.png'), '-frames:v', '1', '-q:v', '2', HI]); // JPEG: a lossless copy would weigh ~20 MB
  console.log(`wrote ${HI} (${W}x${H})`);
} else {
  console.error('usage: sharpen.mjs cut|blend <dir>');
  process.exit(1);
}

// Grey at a quarter size, for the shift search.
function lumAt(img, x, y) { const i = (y * img.w + x) * 4; return img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11; }

/** The shift (repaint px) that lines the repaint up with the reference: brute force on a coarse grid, then refine. */
function align(t, ref, ox, oy) {
  const cost = (dx, dy, step) => {
    let s = 0, n = 0;
    for (let y = 40; y < t.h - 40; y += step) for (let x = 40; x < t.w - 40; x += step) {
      const X = ox + x - dx, Y = oy + y - dy;
      if (X < 0 || Y < 0 || X >= ref.w || Y >= ref.h) continue;
      s += Math.abs(lumAt(t, x, y) - lumAt(ref, X, Y)); n++;
    }
    return n ? s / n : 1e9;
  };
  let best = [0, 0], bc = cost(0, 0, 8);
  for (let dy = -36; dy <= 36; dy += 4) for (let dx = -36; dx <= 36; dx += 4) { const c = cost(dx, dy, 8); if (c < bc) { bc = c; best = [dx, dy]; } }
  const [cx, cy] = best;
  for (let dy = cy - 4; dy <= cy + 4; dy++) for (let dx = cx - 4; dx <= cx + 4; dx++) { const c = cost(dx, dy, 5); if (c < bc) { bc = c; best = [dx, dy]; } }
  return best;
}

/** Per-channel gain and bias so the repaint keeps the approved painting's colours. */
function colourMatch(t, ref, ox, oy, dx, dy) {
  const gain = [], bias = [];
  for (let k = 0; k < 3; k++) {
    let a = 0, a2 = 0, b = 0, b2 = 0, n = 0;
    for (let y = 0; y < t.h; y += 3) for (let x = 0; x < t.w; x += 3) {
      const X = ox + x - dx, Y = oy + y - dy;
      if (X < 0 || Y < 0 || X >= ref.w || Y >= ref.h) continue;
      const u = t.data[(y * t.w + x) * 4 + k], v = ref.data[(Y * ref.w + X) * 4 + k];
      a += u; a2 += u * u; b += v; b2 += v * v; n++;
    }
    const ma = a / n, mb = b / n, sa = Math.sqrt(Math.max(1, a2 / n - ma * ma)), sb = Math.sqrt(Math.max(1, b2 / n - mb * mb));
    const g = Math.max(0.8, Math.min(1.25, sb / sa));
    gain.push(g); bias.push(mb - ma * g);
  }
  return [gain, bias];
}
