// Figure size of every PNG under a dir: canvas, opaque bounding box, feet row, colour count.
// Usage: node scripts/art/pixellab/measure.mjs <dir>
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readImage } from '../lib/png.mjs';

/** Opaque bounding box (alpha > thr), or null when the image is empty. */
export function bbox(img, thr = 8) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.data[(y * img.w + x) * 4 + 3] > thr) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Distinct opaque colours. */
export function colors(img) {
  const s = new Set();
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] > 8) s.add((img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2]);
  return s.size;
}

export function* walkPngs(d) {
  for (const f of readdirSync(d).sort()) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) yield* walkPngs(p);
    else if (f.endsWith('.png')) yield p;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  for (const p of walkPngs(dir)) {
    const img = readImage(p);
    const b = bbox(img);
    console.log(`${relative(dir, p)}\t${img.w}x${img.h}\t${b ? `fig ${b.w}x${b.h} @${b.x},${b.y} feet y=${b.y + b.h - 1}` : 'empty'}\t${colors(img)} colours`);
  }
}
