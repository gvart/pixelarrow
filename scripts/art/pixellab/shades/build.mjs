// W-66 shades: PixelLab walk frames -> public/war/shades/<id>.png + manifest.json (src/war/view/shades.ts).
// Usage: node scripts/art/pixellab/shades/build.mjs [--fetch]
//   ids: docs/v5/pixellab/SHADES/ids.json ([{ id, character, size?, anim? }], size: height share of an adult, the boy 0.72; anim: the clip folder, default shade-walk).
//   --fetch downloads each character first (scripts/art/pixellab/fetch.mjs) to docs/v5/pixellab/SHADES/raw/<id>/ (gitignored).
// Per shade: the south-west walk (template walking-8-frames), and the south-east as its mirror (iso: SW flipped is SE).
// Ghost look: every pixel to a pale blue-grey ramp by its luminance, partly see-through (outline more opaque).
// All frames of a shade share one box (the union of their opaque pixels, padded); rows south-west, south-east.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank } from '../../lib/ops.mjs';

const ROOT = new URL('../../../../', import.meta.url).pathname;
const SRC = join(ROOT, 'docs/v5/pixellab/SHADES'), OUT = join(ROOT, 'public/war/shades');
const ids = JSON.parse(readFileSync(join(SRC, 'ids.json'), 'utf8'));
mkdirSync(OUT, { recursive: true });
/** A soldier's figure is ~64 px tall in its sheet, drawn at 1 (units.ts: its manifest scale 0.55 over SOLDIER_SCALE 0.55). */
const SOLDIER_H = 64, SOLDIER_SCALE = 1, PAD = 2, FPS = 10;
// dark -> light: deep slate, blue-grey, pale bone-blue
const RAMP = [[22, 28, 40], [58, 72, 92], [104, 124, 148], [160, 182, 204], [214, 228, 240]];
const ramp = (t) => {
  const f = Math.min(0.999, Math.max(0, t)) * (RAMP.length - 1), i = Math.floor(f), k = f - i;
  return RAMP[i].map((v, c) => Math.round(v + (RAMP[i + 1][c] - v) * k));
};

function ghost(img) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) { d[i + 3] = 0; continue; }
    const l = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255;
    const [r, g, b] = ramp(0.08 + l * 1.05);
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
    d[i + 3] = Math.round((l < 0.16 ? 230 : 185) * (d[i + 3] / 255));
  }
  return img;
}
const mirror = (img) => {
  const o = blank(img.w, img.h);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) for (let c = 0; c < 4; c++) o.data[(y * img.w + x) * 4 + c] = img.data[(y * img.w + img.w - 1 - x) * 4 + c];
  return o;
};
function box(imgs) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const im of imgs) for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.data[(y * im.w + x) * 4 + 3] > 0) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
}
/** The lowest opaque row of a frame (the feet). */
const feetY = (im) => { for (let y = im.h - 1; y >= 0; y--) for (let x = 0; x < im.w; x++) if (im.data[(y * im.w + x) * 4 + 3] > 0) return y; return im.h - 1; };

const out = [], heights = [];
const built = [];
for (const s of ids) {
  const raw = join(SRC, 'raw', s.id);
  if (process.argv.includes('--fetch')) execFileSync('node', [join(ROOT, 'scripts/art/pixellab/fetch.mjs'), s.character, raw], { stdio: 'inherit' });
  const dir = join(raw, `zip/Idle/animations/${s.anim ?? 'shade-walk'}/south-west`);
  let files;
  try { files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort(); } catch { console.warn('skip', s.id, '(no south-west walk yet)'); continue; }
  const sw = files.map((f) => ghost(readImage(join(dir, f)))), se = sw.map(mirror);
  const b = box([...sw, ...se]), x0 = Math.max(0, b.x0 - PAD), y0 = Math.max(0, b.y0 - PAD);
  const fw = b.x1 + PAD + 1 - x0, fh = b.y1 + PAD + 1 - y0, n = sw.length;
  const sheet = blank(fw * n, fh * 2);
  [sw, se].forEach((row, r) => row.forEach((im, i) => {
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const sx = x0 + x, sy = y0 + y;
      if (sx >= im.w || sy >= im.h) continue;
      const si = (sy * im.w + sx) * 4, di = ((r * fh + y) * sheet.w + i * fw + x) * 4;
      for (let c = 0; c < 4; c++) sheet.data[di + c] = im.data[si + c];
    }
  }));
  writeImage(join(OUT, `${s.id}.png`), sheet);
  const fy = feetY(sw[0]), h = fy - box([sw[0]]).y0 + 1;
  if (!s.size) heights.push(h);
  // the feet: the middle of the frame box (the walk sways round it), on the lowest row of the first frame
  built.push({ s, fw, fh, n, ox: 0.5, oy: (fy - y0 + 1) / fh, h });
}
heights.sort((a, b) => a - b);
const adult = heights[Math.floor(heights.length / 2)] ?? SOLDIER_H;
for (const { s, fw, fh, n, ox, oy, h } of built) {
  // each figure at a soldier's height (the boy smaller), kept within 15% of the median adult's scale (hats and staffs
  // make a figure taller than the man)
  const mid = SOLDIER_SCALE * SOLDIER_H / adult, own = SOLDIER_SCALE * SOLDIER_H * (s.size ?? 1) / h;
  const scale = +Math.min(mid * 1.15 * (s.size ?? 1), Math.max(mid * 0.85 * (s.size ?? 1), own)).toFixed(3);
  out.push({ id: s.id, sheet: `${s.id}.png`, frameW: fw, frameH: fh, frames: n, fps: FPS, rows: ['south-west', 'south-east'], originX: ox, originY: +oy.toFixed(3), scale });
  console.log(s.id, `${fw}x${fh}`, n, 'frames, figure', h, 'px, scale', scale);
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(out, null, 1) + '\n');
console.log('wrote', out.length, 'shades ->', OUT);
