// Contact sheet: rows of PNGs, nearest-scaled, on a flat ground, with a 3x5 pixel-font label per row.
// Usage: node scripts/art/pixellab/sheet.mjs <out.png> [--scale 4] [--bg #8f8a42] [--gap 2]
//          --row "<label>" a.png b.png ... [--row "<label>" ...]
import { readImage, writeImage } from '../lib/png.mjs';
import { blank, hexToRgb } from '../lib/ops.mjs';

export const DIRS8 = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];

// 3x5 glyphs, rows top to bottom, 3 bits each (MSB = left).
const FONT = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4],
  G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7],
  M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5],
  S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2], U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7], 0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6],
  4: [5, 5, 7, 1, 1], 5: [7, 4, 6, 1, 6], 6: [3, 4, 7, 5, 7], 7: [7, 1, 2, 2, 2], 8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 6],
  '-': [0, 0, 7, 0, 0], '.': [0, 0, 0, 0, 2], ':': [0, 2, 0, 2, 0], '/': [1, 1, 2, 4, 4], x: [0, 5, 2, 5, 0], ' ': [0, 0, 0, 0, 0],
  '(': [1, 2, 2, 2, 1], ')': [4, 2, 2, 2, 4], '+': [0, 2, 7, 2, 0], '=': [0, 7, 0, 7, 0],
};

function setPx(img, x, y, [r, g, b]) {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const i = (y * img.w + x) * 4;
  img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
}

/** Draws text at (x, y) with each font pixel s x s. */
export function text(img, str, x, y, s, rgb) {
  for (const ch of str) {
    const g = FONT[ch] ?? FONT[ch.toUpperCase()] ?? FONT[' '];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r] & (4 >> c))
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) setPx(img, x + (c * s) + dx, y + r * s + dy, rgb);
    x += 4 * s;
  }
}

/** Alpha-blends src nearest-scaled by k onto dst at (x, y). */
export function blit(dst, src, x, y, k) {
  for (let sy = 0; sy < src.h; sy++) for (let sx = 0; sx < src.w; sx++) {
    const i = (sy * src.w + sx) * 4;
    const a = src.data[i + 3] / 255;
    if (!a) continue;
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
      const X = x + sx * k + dx, Y = y + sy * k + dy;
      if (X < 0 || Y < 0 || X >= dst.w || Y >= dst.h) continue;
      const j = (Y * dst.w + X) * 4;
      for (let c = 0; c < 3; c++) dst.data[j + c] = Math.round(src.data[i + c] * a + dst.data[j + c] * (1 - a));
      dst.data[j + 3] = 255;
    }
  }
}

/** rows: [{ label, imgs: [{w,h,data}] }] -> image. */
export function buildSheet(rows, { scale = 4, bg = '#8f8a42', gap = 2, ink = '#2b1d1a' } = {}) {
  const font = Math.max(1, Math.round(scale / 2));
  const labelH = 7 * font;
  const cellW = Math.max(...rows.flatMap((r) => r.imgs.map((i) => i.w)));
  const W = Math.max(...rows.map((r) => r.imgs.length)) * (cellW + gap) * scale + gap * scale;
  const H = rows.reduce((h, r) => h + labelH + (Math.max(...r.imgs.map((i) => i.h)) + gap) * scale, gap * scale);
  const out = blank(W, H);
  const bgc = hexToRgb(bg);
  for (let i = 0; i < W * H; i++) out.data.set([...bgc, 255], i * 4);
  let y = gap * scale;
  for (const r of rows) {
    text(out, r.label, gap * scale, y, font, hexToRgb(ink));
    y += labelH;
    r.imgs.forEach((im, k) => blit(out, im, gap * scale + k * (cellW + gap) * scale, y, scale));
    y += (Math.max(...r.imgs.map((i) => i.h)) + gap) * scale;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const out = args.shift();
  const opts = {};
  const rows = [];
  while (args.length) {
    const a = args.shift();
    if (a === '--row') rows.push({ label: args.shift(), imgs: [] });
    else if (a === '--rot') {
      // --rot "<label>" <rotations dir>: the 8 turnaround views in compass order
      const label = args.shift();
      const dir = args.shift();
      rows.push({ label: `${label}: S SE E NE N NW W SW`, imgs: DIRS8.map((d) => readImage(`${dir}/${d}.png`)) });
    }
    else if (a === '--scale') opts.scale = Number(args.shift());
    else if (a === '--bg') opts.bg = args.shift();
    else if (a === '--gap') opts.gap = Number(args.shift());
    else rows.at(-1).imgs.push(readImage(a));
  }
  const img = buildSheet(rows, opts);
  writeImage(out, img);
  console.log(`${out} ${img.w}x${img.h}`);
}
