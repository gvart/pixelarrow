// I5c (mounted and chariot clips): shared paths, the per-class work canvas, and an offset search used to put
// every clip on one canvas per facing (PixelLab redraws a frame a few px off, and stores grown canvases).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readImage } from '../../lib/png.mjs';
import { blank, paste } from '../../lib/ops.mjs';
import { ROOT } from '../../lib/manifest.mjs';

export { ROOT };
export const RAW = join(ROOT, 'docs/v5/pixellab/I5c/raw');
export const FACINGS = ['south-east', 'north-east', 'south-west', 'north-west'];

/**
 * Work canvas per class: the base rotation (100 riders, 128 chariot) pasted at `at` on W x H, room for a horse
 * that rears, falls on its side or a lance raised overhead. Every clip of the class is generated on, or moved to,
 * this canvas, so the sheet spec needs one canvas offset only.
 */
export const CANVAS = {
  companion: { W: 144, H: 160, at: [22, 44] },
  thessalian: { W: 144, H: 160, at: [22, 44] },
  horse_archer: { W: 144, H: 160, at: [22, 44] },
  chariot: { W: 176, H: 176, at: [24, 40] },
};

export const rotDir = (cls) => join(RAW, cls, 'base/zip/Idle/rotations');
export const clipDir = (cls, anim, dir, attempt) => join(RAW, cls, 'clips', anim, dir, attempt);
export const jobsPath = (cls) => join(ROOT, 'docs/v5/pixellab/I5c', `${cls}.jobs.json`);
export const loadJobs = (cls) => (existsSync(jobsPath(cls)) ? JSON.parse(readFileSync(jobsPath(cls), 'utf8')) : []);

export const frames = (dir) => readdirSync(dir).filter((f) => /^frame_\d+\.png$/.test(f)).sort().map((f) => readImage(join(dir, f)));

/** The rotation of a facing on the class's work canvas. */
export function startFrame(cls, dir) {
  const c = CANVAS[cls];
  const o = blank(c.W, c.H);
  paste(o, readImage(join(rotDir(cls), `${dir}.png`)), c.at[0], c.at[1]);
  return o;
}

/** Opaque box (alpha > 128). */
export function bbox(im) {
  let x0 = im.w, x1 = -1, y0 = im.h, y1 = -1;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.data[(y * im.w + x) * 4 + 3] > 128) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, x1, y0, y1 };
}

/** Share of the union of opaque pixels that differ when `b` is moved by (dx, dy) over `a`. */
export function diffAt(a, b, dx, dy) {
  let n = 0, u = 0;
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    const X = x - dx, Y = y - dy;
    const ia = (y * a.w + x) * 4;
    const oa = a.data[ia + 3] > 128;
    const inb = X >= 0 && Y >= 0 && X < b.w && Y < b.h;
    const ib = inb ? (Y * b.w + X) * 4 : -1;
    const ob = inb && b.data[ib + 3] > 128;
    if (!oa && !ob) continue;
    u++;
    if (oa !== ob || Math.abs(a.data[ia] - b.data[ib]) + Math.abs(a.data[ia + 1] - b.data[ib + 1]) + Math.abs(a.data[ia + 2] - b.data[ib + 2]) > 60) n++;
  }
  return u ? n / u : 1;
}

/** The (dx, dy) that best lays `b` over `ref` (b moved by dx,dy matches ref), searching from the box offset. */
export function bestOffset(ref, b, r = 8, start = null) {
  const ba = bbox(ref), bb = bbox(b);
  // start from the given offset, else from the bottom-centre match of the boxes
  const [sx, sy] = start ?? [Math.round((ba.x0 + ba.x1) / 2 - (bb.x0 + bb.x1) / 2), ba.y1 - bb.y1];
  let best = { dx: sx, dy: sy, d: 2 };
  for (let dy = sy - r; dy <= sy + r; dy++) for (let dx = sx - r; dx <= sx + r; dx++) {
    const d = diffAt(ref, b, dx, dy);
    if (d < best.d) best = { dx, dy, d };
  }
  return best;
}

/** Image `b` moved by (dx, dy) onto a W x H canvas. */
export function shifted(b, W, H, dx, dy) {
  const o = blank(W, H);
  paste(o, b, dx, dy);
  return o;
}
