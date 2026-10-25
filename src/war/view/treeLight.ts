/**
 * Tree sprites relit at load for the scene's NW light, so a crown reads as a rounded mass at every zoom (and a dense
 * forest as many crowns, not one dark blob): pixels near the sprite's upper-left silhouette edge catch a warm rim
 * light, pixels near its lower-right edge fall into shadow, and the crown grades from lit (upper left) to shaded
 * (lower right) across its width. The trunk keeps most of its colour (the change fades toward the foot).
 */

/** Px searched toward and away from the light for the silhouette edge. */
const REACH = 7;
const LX = -0.8, LY = -0.6; // toward the light, screen px (up and left)

export function relightTree(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.width, h = img.height, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, w, h), d = id.data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 100;
  // per row: the opaque span, for the crown's left-to-right grade
  const x0 = new Int32Array(h).fill(w), x1 = new Int32Array(h).fill(-1);
  let top = h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 100) { if (x < x0[y]) x0[y] = x; x1[y] = x; if (y < top) top = y; }
  const out = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) {
    if (x1[y] < 0) continue;
    // the crown is the upper part: fade the relight out over the lowest fifth (the trunk)
    const fy = Math.min(1, Math.max(0, (h - 1 - y) / (0.2 * (h - top))));
    if (fy <= 0) continue;
    for (let x = x0[y]; x <= x1[y]; x++) {
      const k = (y * w + x) * 4;
      if (d[k + 3] <= 100) continue;
      let toL = REACH, toD = REACH;
      for (let s = 1; s <= REACH; s++) if (!solid(Math.round(x + LX * s), Math.round(y + LY * s))) { toL = s; break; }
      for (let s = 1; s <= REACH; s++) if (!solid(Math.round(x - LX * s), Math.round(y - LY * s))) { toD = s; break; }
      const span = Math.max(1, x1[y] - x0[y]), gx = (x - x0[y]) / span; // 0 left .. 1 right
      let m = 1 + 0.24 * (0.5 - gx) * 2 + 0.1 * (1 - (y - top) / (h - top));
      let warm = 0;
      if (toL <= 2) { m += 0.5 - 0.12 * toL; warm = 1; } else if (toL <= 4) m += 0.16;
      if (toD <= 3) m -= 0.32 - 0.07 * toD;
      m = 1 + (m - 1) * fy;
      out[k] = Math.min(255, d[k] * m + warm * 10 * fy);
      out[k + 1] = Math.min(255, d[k + 1] * m + warm * 7 * fy);
      out[k + 2] = Math.min(255, d[k + 2] * (m < 1 ? m * 1.04 : m));
    }
  }
  g.putImageData(new ImageData(out, w, h), 0, 0);
  return c;
}
