// Contact sheet of clips, one row each, every frame numbered: for the frame-by-frame review.
// Usage: node scripts/art/pixellab/clipsheet.mjs <out.png> [--scale 3] [--wrap 8] [--bg #8f8a42] <label>=<clip> ...
//   --wrap n  at most n frames per row (a clip continues on the next row)
//   clip  a folder of frame_NNN.png, or <strip.png>:<frame width> (gif.mjs loadClip)
import { writeImage } from '../lib/png.mjs';
import { buildSheet, text } from './sheet.mjs';
import { hexToRgb } from '../lib/ops.mjs';
import { loadClip } from './gif.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [out, ...specs] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const scale = Number(opt('scale', 3));
const wrap = Number(opt('wrap', 999));
const rows = specs.flatMap((s) => {
  const k = s.indexOf('=');
  const imgs = loadClip(s.slice(k + 1));
  const out = [];
  for (let i = 0; i < imgs.length; i += wrap) out.push({ label: i ? `${s.slice(0, k)} ${i}-` : s.slice(0, k), imgs: imgs.slice(i, i + wrap), first: i });
  return out;
});
const img = buildSheet(rows, { scale, bg: opt('bg', '#8f8a42') });
// frame numbers under each cell's top-left corner
const cellW = Math.max(...rows.flatMap((r) => r.imgs.map((i) => i.w)));
const font = Math.max(1, Math.round(scale / 2));
let y = 2 * scale;
for (const r of rows) {
  y += 7 * font;
  r.imgs.forEach((_, i) => text(img, String(r.first + i), 2 * scale + i * (cellW + 2) * scale + 1, y + 1, font, hexToRgb('#f0e6d0')));
  y += (Math.max(...r.imgs.map((i) => i.h)) + 2) * scale;
}
writeImage(out, img);
console.log(`${out} ${img.w}x${img.h}`);
