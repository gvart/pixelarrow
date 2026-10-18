// I4b helpers for mounted figures: opaque box, and a figure placed beside H4 on one canvas at the same scale.
import { blank } from '../../lib/ops.mjs';
import { blit } from '../sheet.mjs';

/** Opaque box (alpha > 128): { x0, x1, y0, y1 }. */
export function bbox(im) {
  let x0 = im.w, x1 = -1, y0 = im.h, y1 = -1;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.data[(y * im.w + x) * 4 + 3] > 128) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, x1, y0, y1 };
}

/** The images left to right on one canvas, each bottom-aligned on its lowest opaque row, 4 px apart. */
export function sideBySide(...ims) {
  const boxes = ims.map(bbox);
  const above = Math.max(...boxes.map((b) => b.y1 + 1));
  const W = boxes.reduce((w, b) => w + (b.x1 - b.x0 + 1) + 4, 4);
  const out = blank(W, above + 2);
  let x = 4;
  ims.forEach((im, i) => {
    const b = boxes[i];
    blit(out, im, x - b.x0, above - 1 - b.y1, 1);
    x += b.x1 - b.x0 + 1 + 4;
  });
  return out;
}
