// Shrink a PixelLab frame to true scale (pro mode fills its 68 canvas whatever the animal's size): area-average with
// premultiplied alpha, hard alpha at 50 %, every colour snapped back to the nearest (OKLab) colour of the source
// palette, so the result stays crisp pixel art in the source's own colours.
// Usage (CLI test): node scripts/art/pixellab/mobs/shrink.mjs <in.png> <out.png> <factor>
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank } from '../../lib/ops.mjs';
import { oklab } from '../remap.mjs';

/** Colours (rgb) of all opaque pixels of the images. */
export function paletteOf(imgs) {
  const set = new Map();
  for (const img of imgs) {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      if (!set.has(key)) set.set(key, [d[i], d[i + 1], d[i + 2]]);
    }
  }
  return [...set.values()].map((rgb) => ({ rgb, lab: oklab(rgb) }));
}

function nearest(pal, rgb, cache) {
  const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
  let hit = cache.get(key);
  if (hit) return hit;
  const [L, a, b] = oklab(rgb);
  let best = pal[0];
  let bd = Infinity;
  for (const p of pal) {
    const d = (p.lab[0] - L) ** 2 + (p.lab[1] - a) ** 2 + (p.lab[2] - b) ** 2;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  cache.set(key, best.rgb);
  return best.rgb;
}

/** Shrink `img` by `f` (0..1] about its bottom-centre box; output w x h = round(img * f). */
export function shrink(img, f, pal, cache = new Map()) {
  if (f >= 1) {
    // true scale already (civilians): only hard alpha and the palette snap
    const out = blank(img.w, img.h);
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] < 128) continue;
      out.data.set([...nearest(pal, [img.data[i], img.data[i + 1], img.data[i + 2]], cache), 255], i);
    }
    return out;
  }
  const W = Math.round(img.w * f);
  const H = Math.round(img.h * f);
  const out = blank(W, H);
  const s = 1 / f;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const x0 = x * s;
      const x1 = x0 + s;
      const y0 = y * s;
      const y1 = y0 + s;
      let r = 0, g = 0, b = 0, a = 0, area = 0;
      // darkest opaque sample keeps the outline from washing out
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
          const w = wx * wy;
          if (sx >= img.w || sy >= img.h) continue;
          const i = (sy * img.w + sx) * 4;
          const al = img.data[i + 3] / 255;
          r += img.data[i] * al * w;
          g += img.data[i + 1] * al * w;
          b += img.data[i + 2] * al * w;
          a += al * w;
          area += w;
        }
      }
      if (!area || a / area < 0.5) continue;
      const rgb = nearest(pal, [Math.round(r / a), Math.round(g / a), Math.round(b / a)], cache);
      out.data.set([...rgb, 255], (y * W + x) * 4);
    }
  }
  return out;
}

// Scale2x (EPX): a 2x enlargement that rounds diagonals instead of doubling stairs; with `pre2x` a frame drawn smaller
// than its true size is enlarged so and then shrunk by shrink / 2 (a bear at 1.2: no source pixel is drawn wider than
// another on screen, the sheet itself is at true size)
export function scale2x(img) {
  const { w, h, data } = img;
  const o = blank(w * 2, h * 2);
  const px = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : (y * w + x) * 4);
  const same = (i, j) => i >= 0 && j >= 0 ? data[i + 3] === data[j + 3] && (!data[i + 3] || (data[i] === data[j] && data[i + 1] === data[j + 1] && data[i + 2] === data[j + 2])) : i === j;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = px(x, y), A = px(x, y - 1), B = px(x + 1, y), C = px(x - 1, y), D = px(x, y + 1);
    let e = [P, P, P, P];
    if (A >= 0 && B >= 0 && C >= 0 && D >= 0 && !same(A, D) && !same(C, B)) {
      e = [same(C, A) ? A : P, same(A, B) ? B : P, same(C, D) ? C : P, same(D, B) ? D : P];
    }
    e.forEach((s, k) => o.data.set(data.subarray(s, s + 4), ((y * 2 + (k >> 1)) * w * 2 + x * 2 + (k & 1)) * 4));
  }
  return o;
}

/** Keep the body: drop opaque bits under 4 px and any under a tenth of the biggest (dust, spray). */
export function dropSpecks(s) {
  const { w, h, data } = s;
  const seen = new Uint8Array(w * h);
  const comps = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || !data[i * 4 + 3]) continue;
    const comp = [i];
    seen[i] = 1;
    for (let k = 0; k < comp.length; k++) {
      const p = comp[k], x = p % w, y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, q = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[q] || !data[q * 4 + 3]) continue;
        seen[q] = 1;
        comp.push(q);
      }
    }
    comps.push(comp);
  }
  // keep the body: drop bits under 4 px and any bit under a tenth of the biggest (dust, spray)
  const big = Math.max(0, ...comps.map((c) => c.length));
  for (const comp of comps) if (comp.length < 4 || comp.length < big / 10) for (const p of comp) data[p * 4 + 3] = 0;
  return s;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [inp, outp, f] = process.argv.slice(2);
  const img = readImage(inp);
  writeImage(outp, shrink(img, Number(f), paletteOf([img])));
}
