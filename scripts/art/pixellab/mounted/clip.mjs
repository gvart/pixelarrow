// I4b: frames from..to of a clip folder, cropped to their common opaque box, as a numbered contact sheet (and a GIF).
// Usage: node scripts/art/pixellab/mounted/clip.mjs <out.png> <clip dir> [--from 0] [--to last] [--scale 3] [--wrap 8] [--gif out.gif --fps 14]
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { crop, hexToRgb } from '../../lib/ops.mjs';
import { buildSheet, text } from '../sheet.mjs';
import { writeGif } from '../gif.mjs';
import { bbox } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [out, dir] = args;
const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
const from = Number(opt('from', 0)), to = Number(opt('to', files.length - 1));
const frames = files.slice(from, to + 1).map((f) => readImage(join(dir, f)));
const bs = frames.map(bbox);
const box = { x: Math.min(...bs.map((b) => b.x0)) - 1, y: Math.min(...bs.map((b) => b.y0)) - 1 };
box.w = Math.max(...bs.map((b) => b.x1)) + 2 - box.x; box.h = Math.max(...bs.map((b) => b.y1)) + 2 - box.y;
const imgs = frames.map((f) => crop(f, box));
const scale = Number(opt('scale', 3)), wrap = Number(opt('wrap', 8));
const rows = [];
for (let i = 0; i < imgs.length; i += wrap) rows.push({ label: `${from + i}-`, imgs: imgs.slice(i, i + wrap), first: from + i });
const sheet = buildSheet(rows, { scale });
const font = Math.max(1, Math.round(scale / 2));
let y = 2 * scale;
for (const r of rows) {
  y += 7 * font;
  r.imgs.forEach((_, i) => text(sheet, String(r.first + i), 2 * scale + i * (box.w + 2) * scale + 1, y + 1, font, hexToRgb('#f0e6d0')));
  y += (box.h + 2) * scale;
}
writeImage(out, sheet);
if (args.includes('--gif')) writeGif(opt('gif'), [imgs], { fps: Number(opt('fps', 14)), scale: 3 });
console.log(`${out} frames ${from}..${to} box ${box.w}x${box.h} at ${box.x},${box.y}`);
