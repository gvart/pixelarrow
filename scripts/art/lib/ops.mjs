// Pixel operations on RGBA images ({ w, h, data }) for the art pipeline
// (docs/v5/art/ASSET_PIPELINE.md). Pure functions, no dependencies.

export const blank = (w, h) => ({ w, h, data: new Uint8Array(w * h * 4) });

export const hexToRgb = (hex) => {
  const n = parseInt(String(hex).replace(/^#|^0x/, ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/**
 * Key out the #FF00FF background. A pixel within `tol` (RGB distance) of the key is transparent;
 * within `soft` more it gets partial alpha (anti-aliased edges of painted art). Every kept pixel is
 * despilled: magenta tint (R and B both above G) is pulled back toward its neighbours' hue.
 */
export function keyOut(img, { key = '#ff00ff', tol = 60, soft = 60, hard = false } = {}) {
  const [kr, kg, kb] = hexToRgb(key);
  const out = { w: img.w, h: img.h, data: new Uint8Array(img.data) };
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const dist = Math.hypot(d[i] - kr, d[i + 1] - kg, d[i + 2] - kb);
    if (dist <= tol) {
      d[i + 3] = 0;
      continue;
    }
    if (!hard && dist < tol + soft) d[i + 3] = Math.round(d[i + 3] * ((dist - tol) / soft));
    else if (hard && dist < tol + soft) d[i + 3] = 0;
    // despill: magenta fringe has R and B well above G
    const spill = Math.min(d[i], d[i + 2]) - d[i + 1];
    if (spill > 0 && d[i + 3] < 255) {
      d[i] -= spill;
      d[i + 2] -= spill;
    }
  }
  return out;
}

/** Opaque bounding box (alpha > threshold), or null when the image is empty. */
export function alphaBox(img, threshold = 8) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++)
      if (img.data[(y * img.w + x) * 4 + 3] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function crop(img, { x, y, w, h }) {
  const out = blank(w, h);
  for (let yy = 0; yy < h; yy++) {
    const sy = y + yy;
    if (sy < 0 || sy >= img.h) continue;
    for (let xx = 0; xx < w; xx++) {
      const sx = x + xx;
      if (sx < 0 || sx >= img.w) continue;
      const s = (sy * img.w + sx) * 4;
      out.data.set(img.data.subarray(s, s + 4), (yy * w + xx) * 4);
    }
  }
  return out;
}

/** Trim to the opaque box plus `pad` transparent px on each side. */
export function trim(img, pad = 0) {
  const b = alphaBox(img);
  if (!b) throw new Error('trim: the image is fully transparent (wrong key colour?)');
  return crop(img, { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 });
}

/** Nearest-neighbour resize (pixel art). */
export function resizeNearest(img, w, h) {
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.h - 1, Math.floor(((y + 0.5) * img.h) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.w - 1, Math.floor(((x + 0.5) * img.w) / w));
      const s = (sy * img.w + sx) * 4;
      out.data.set(img.data.subarray(s, s + 4), (y * w + x) * 4);
    }
  }
  return out;
}

/**
 * Area-average (box filter) resize with premultiplied alpha: the exact, artefact-free downscale for
 * painted art. Refuses to upscale: a painted asset smaller than its slot must be regenerated larger.
 */
export function resizeArea(img, w, h) {
  if (w > img.w || h > img.h) throw new Error(`resizeArea: refusing to upscale ${img.w}x${img.h} to ${w}x${h} (regenerate the source larger)`);
  const out = blank(w, h);
  const fx = img.w / w;
  const fy = img.h / h;
  for (let y = 0; y < h; y++) {
    const y0 = y * fy, y1 = y0 + fy;
    for (let x = 0; x < w; x++) {
      const x0 = x * fx, x1 = x0 + fx;
      let r = 0, g = 0, b = 0, a = 0, area = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
          const k = wx * wy;
          const s = (sy * img.w + sx) * 4;
          const al = img.data[s + 3] / 255;
          r += img.data[s] * al * k;
          g += img.data[s + 1] * al * k;
          b += img.data[s + 2] * al * k;
          a += al * k;
          area += k;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) {
        out.data[o] = Math.round(r / a);
        out.data[o + 1] = Math.round(g / a);
        out.data[o + 2] = Math.round(b / a);
      }
      out.data[o + 3] = Math.round((a / area) * 255);
    }
  }
  return out;
}

/**
 * Fit to exactly w x h. `cover` crops the overflow (anchor: 0..1 per axis, 0.5 = centre;
 * portraits use ay 0.2 so the head is kept), `contain` letterboxes into transparency.
 */
export function fit(img, w, h, { mode = 'cover', ax = 0.5, ay = 0.5, nearest = false } = {}) {
  const scale = mode === 'cover' ? Math.max(w / img.w, h / img.h) : Math.min(w / img.w, h / img.h);
  if (mode === 'cover') {
    // crop the source to the target aspect first, then one exact downscale
    const cw = Math.min(img.w, Math.round(w / scale));
    const ch = Math.min(img.h, Math.round(h / scale));
    const src = crop(img, { x: Math.round((img.w - cw) * ax), y: Math.round((img.h - ch) * ay), w: cw, h: ch });
    return nearest ? resizeNearest(src, w, h) : resizeArea(src, w, h);
  }
  const iw = Math.max(1, Math.round(img.w * scale));
  const ih = Math.max(1, Math.round(img.h * scale));
  const inner = nearest ? resizeNearest(img, iw, ih) : resizeArea(img, iw, ih);
  const out = blank(w, h);
  const ox = Math.round((w - iw) * ax);
  const oy = Math.round((h - ih) * ay);
  for (let y = 0; y < ih; y++) out.data.set(inner.data.subarray(y * iw * 4, (y + 1) * iw * 4), ((y + oy) * w + ox) * 4);
  return out;
}

/** Distinct opaque colours (alpha > 0), capped at `cap` to stay cheap. */
export function countColors(img, cap = 100000) {
  const set = new Set();
  for (let i = 0; i < img.data.length && set.size < cap; i += 4) if (img.data[i + 3] > 0) set.add((img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2]);
  return set.size;
}

/** Alpha summary: how many pixels are fully transparent, partial, opaque. */
export function alphaStats(img) {
  let clear = 0, partial = 0, opaque = 0;
  for (let i = 3; i < img.data.length; i += 4) {
    const a = img.data[i];
    if (a === 0) clear++;
    else if (a === 255) opaque++;
    else partial++;
  }
  return { clear, partial, opaque };
}

/** Visible pixels still close to the key colour (a failed key-out leaves a magenta fringe). */
export function keyResidue(img, { key = '#ff00ff', tol = 90 } = {}) {
  const [kr, kg, kb] = hexToRgb(key);
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] > 24 && Math.hypot(img.data[i] - kr, img.data[i + 1] - kg, img.data[i + 2] - kb) < tol) n++;
  return n;
}

/** Snap every opaque pixel to the nearest palette colour (RGB distance, weighted for the eye). */
export function snapToPalette(img, palette) {
  const pal = palette.map(hexToRgb);
  const out = { w: img.w, h: img.h, data: new Uint8Array(img.data) };
  const d = out.data;
  const cache = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let best = cache.get(k);
    if (best === undefined) {
      let bd = Infinity;
      pal.forEach(([r, g, b], j) => {
        const dr = d[i] - r, dg = d[i + 1] - g, db = d[i + 2] - b;
        const dist = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
        if (dist < bd) (bd = dist), (best = j);
      });
      cache.set(k, best);
    }
    [d[i], d[i + 1], d[i + 2]] = pal[best];
  }
  return out;
}

/** Binary alpha for pixel art: every pixel is fully on or fully off. */
export function hardAlpha(img, threshold = 128) {
  const out = { w: img.w, h: img.h, data: new Uint8Array(img.data) };
  for (let i = 3; i < out.data.length; i += 4) out.data[i] = out.data[i] >= threshold ? 255 : 0;
  return out;
}

/**
 * Estimate the "fake pixel" size of an upscaled pixel-art image (a generator draws each art pixel
 * as a block of n x n screen pixels): the n in 2..32 whose block grid best explains the colour edges.
 */
export function detectGrid(img, { min = 2, max = 32 } = {}) {
  const edgesX = new Float64Array(img.w);
  const edgesY = new Float64Array(img.h);
  const at = (x, y) => (y * img.w + x) * 4;
  for (let y = 0; y < img.h; y++)
    for (let x = 1; x < img.w; x++) {
      const a = at(x - 1, y), b = at(x, y);
      const e = Math.abs(img.data[a] - img.data[b]) + Math.abs(img.data[a + 1] - img.data[b + 1]) + Math.abs(img.data[a + 2] - img.data[b + 2]) + Math.abs(img.data[a + 3] - img.data[b + 3]);
      edgesX[x] += e;
    }
  for (let y = 1; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const a = at(x, y - 1), b = at(x, y);
      const e = Math.abs(img.data[a] - img.data[b]) + Math.abs(img.data[a + 1] - img.data[b + 1]) + Math.abs(img.data[a + 2] - img.data[b + 2]) + Math.abs(img.data[a + 3] - img.data[b + 3]);
      edgesY[y] += e;
    }
  const score = (edges, n) => {
    // best phase: share of edge energy that falls on multiples of n
    let best = { share: 0, phase: 0 };
    const total = edges.reduce((s, v) => s + v, 0) || 1;
    for (let ph = 0; ph < n; ph++) {
      let on = 0;
      for (let i = ph; i < edges.length; i += n) on += edges[i];
      if (on / total > best.share) best = { share: on / total, phase: ph };
    }
    return best;
  };
  let best = { n: 1, share: 0, px: 0, py: 0 };
  for (let n = min; n <= max; n++) {
    const sx = score(edgesX, n);
    const sy = score(edgesY, n);
    // a true grid puts nearly all edge energy on its lines; expected share by chance is 1/n
    const lift = ((sx.share + sy.share) / 2) * n;
    if (lift > best.share * 1.02) best = { n, share: lift, px: sx.phase, py: sy.phase, fit: (sx.share + sy.share) / 2 };
  }
  return best;
}

/** Downsample an upscaled pixel-art image by its block size: each cell takes its most common colour. */
export function unscale(img, n, px = 0, py = 0) {
  const w = Math.floor((img.w - px) / n);
  const h = Math.floor((img.h - py) / n);
  const out = blank(w, h);
  for (let cy = 0; cy < h; cy++)
    for (let cx = 0; cx < w; cx++) {
      const votes = new Map();
      // sample the cell's inner area (edges are often anti-aliased)
      const m = n >= 4 ? 1 : 0;
      for (let y = py + cy * n + m; y < py + (cy + 1) * n - m; y++)
        for (let x = px + cx * n + m; x < px + (cx + 1) * n - m; x++) {
          const s = (y * img.w + x) * 4;
          const k = img.data[s + 3] < 128 ? -1 : (img.data[s] << 16) | (img.data[s + 1] << 8) | img.data[s + 2];
          votes.set(k, (votes.get(k) ?? 0) + 1);
        }
      let bk = -1, bv = -1;
      for (const [k, v] of votes) if (v > bv) (bv = v), (bk = k);
      const o = (cy * w + cx) * 4;
      if (bk >= 0) {
        out.data[o] = (bk >> 16) & 255;
        out.data[o + 1] = (bk >> 8) & 255;
        out.data[o + 2] = bk & 255;
        out.data[o + 3] = 255;
      }
    }
  return out;
}

/** Composite `img` over a solid colour or a checkerboard (previews). */
export function flatten(img, bg = '#808080') {
  const [r, g, b] = hexToRgb(bg);
  const out = { w: img.w, h: img.h, data: new Uint8Array(img.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    const a = out.data[i + 3] / 255;
    out.data[i] = Math.round(out.data[i] * a + r * (1 - a));
    out.data[i + 1] = Math.round(out.data[i + 1] * a + g * (1 - a));
    out.data[i + 2] = Math.round(out.data[i + 2] * a + b * (1 - a));
    out.data[i + 3] = 255;
  }
  return out;
}

/** Paste `src` into `dst` at (x, y) with alpha blending. */
export function paste(dst, src, x, y) {
  for (let yy = 0; yy < src.h; yy++) {
    const dy = y + yy;
    if (dy < 0 || dy >= dst.h) continue;
    for (let xx = 0; xx < src.w; xx++) {
      const dx = x + xx;
      if (dx < 0 || dx >= dst.w) continue;
      const s = (yy * src.w + xx) * 4;
      const o = (dy * dst.w + dx) * 4;
      const a = src.data[s + 3] / 255;
      for (let c = 0; c < 3; c++) dst.data[o + c] = Math.round(src.data[s + c] * a + dst.data[o + c] * (1 - a));
      dst.data[o + 3] = Math.max(dst.data[o + 3], src.data[s + 3]);
    }
  }
  return dst;
}
