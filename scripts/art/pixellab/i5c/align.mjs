// I5c: put a clip's frames on the class's work canvas: the offset that best lays its frame k (default 0) over the
// reference (the start frame it was generated from, on the work canvas) moves every frame. PixelLab redraws a frame
// a few px off, and stored character animations come back on grown canvases.
// Usage: node scripts/art/pixellab/i5c/align.mjs <class> <src frames dir> <ref.png> <out dir> [--ref-frame 0] [--r 8]
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { CANVAS, frames, bestOffset, shifted, bbox } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [cls, src, refPath, out] = args;
const { W, H } = CANVAS[cls];
const ref = readImage(refPath);
const fr = frames(src);
const k = Number(opt('ref-frame', 0));
// a clip generated on the work canvas only drifts a little: search 2 px around no move (a fast first frame would
// otherwise pull the match); a stored character clip on its grown canvas is searched from the box match
const same = fr[0].w === W && fr[0].h === H;
let o = same ? bestOffset(ref, fr[k], Number(opt('r', 2)), [0, 0]) : bestOffset(ref, fr[k], Number(opt('r', 8)));
// a frame that has already moved away from the reference matches nothing: leave the clip where it was drawn
if (same && o.d > 0.3) o = { dx: 0, dy: 0, d: o.d };
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
let clipped = 0;
fr.forEach((f, i) => {
  const b = bbox(f);
  if (b.x0 + o.dx < 0 || b.y0 + o.dy < 0 || b.x1 + o.dx >= W || b.y1 + o.dy >= H) clipped++;
  // a frame touching its own canvas edge was cut by PixelLab
  else if (b.x0 === 0 || b.y0 === 0 || b.x1 === f.w - 1 || b.y1 === f.h - 1) clipped++;
  writeImage(join(out, `frame_${String(i).padStart(3, '0')}.png`), shifted(f, W, H, o.dx, o.dy));
});
console.log(`${out}: ${fr.length} frames ${fr[0].w}x${fr[0].h} moved ${o.dx},${o.dy} onto ${W}x${H} (frame ${k} vs ref differs ${(o.d * 100).toFixed(1)}%)${clipped ? `, ${clipped} frames TOUCH OR LEAVE the canvas` : ''}`);
