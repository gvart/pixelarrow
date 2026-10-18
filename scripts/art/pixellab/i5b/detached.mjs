// I5b: the detached pieces of every frame of a clip (8-connected opaque parts other than the largest, at least 5 px):
// an arrow loosed in flight, a stray arrowhead or sling bullet. Prints them as sheetbuild "clear" fixes to paste into
// a picks file (the sim draws missiles itself). Usage: node scripts/art/pixellab/i5b/detached.mjs <clip dir> [--min 5]
import { loadClip } from '../gif.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const min = Number(opt('min', 5));
const fixes = [];
loadClip(args[0]).forEach((im, f) => {
  const { w, h, data } = im;
  const comp = new Int32Array(w * h).fill(-1);
  const boxes = [];
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] < 128 || comp[i] >= 0) continue;
    const id = boxes.length;
    const b = { n: 0, x0: w, y0: h, x1: -1, y1: -1 };
    const st = [i];
    comp[i] = id;
    while (st.length) {
      const j = st.pop(), x = j % w, y = (j / w) | 0;
      b.n++; b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const k = Y * w + X;
        if (data[k * 4 + 3] >= 128 && comp[k] < 0) { comp[k] = id; st.push(k); }
      }
    }
    boxes.push(b);
  }
  const big = Math.max(...boxes.map((b) => b.n));
  for (const b of boxes) if (b.n < big && b.n >= min) fixes.push({ frame: f, op: 'clear', box: [b.x0, b.y0, b.x1, b.y1], why: `a detached piece (${b.n} px): the loosed missile in flight or a stray part` });
});
console.log(JSON.stringify(fixes));
