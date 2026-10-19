// ANIM-1: how much a clip moves: per frame, the opaque pixels that differ from frame 0 (alpha or colour), and the
// figure's top row and side columns; the max over the clip. A still idle changes a few dozen pixels; the bar for an
// idle that reads at half zoom is a few hundred and a 2+ px swing of the top row or sides.
// Usage: node scripts/art/pixellab/anim1/motion.mjs <clip dir> [<clip dir> ...]
import { loadClip } from '../gif.mjs';

for (const dir of process.argv.slice(2)) {
  const fr = loadClip(dir);
  const box = (f) => {
    let top = f.h, l = f.w, r = -1;
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.data[(y * f.w + x) * 4 + 3] > 0) { top = Math.min(top, y); l = Math.min(l, x); r = Math.max(r, x); }
    return { top, l, r };
  };
  const b0 = box(fr[0]);
  let maxDiff = 0, dTop = 0, dSide = 0;
  for (const f of fr) {
    let n = 0;
    for (let i = 0; i < f.data.length; i += 4) {
      const a = fr[0].data[i + 3] > 0, b = f.data[i + 3] > 0;
      if (a !== b || (a && (Math.abs(f.data[i] - fr[0].data[i]) + Math.abs(f.data[i + 1] - fr[0].data[i + 1]) + Math.abs(f.data[i + 2] - fr[0].data[i + 2]) > 30))) n++;
    }
    const b = box(f);
    maxDiff = Math.max(maxDiff, n);
    dTop = Math.max(dTop, Math.abs(b.top - b0.top));
    dSide = Math.max(dSide, Math.abs(b.l - b0.l), Math.abs(b.r - b0.r));
  }
  console.log(`${dir}: ${fr.length} frames, max ${maxDiff} px changed, top row moves ${dTop}, sides ${dSide}`);
}
