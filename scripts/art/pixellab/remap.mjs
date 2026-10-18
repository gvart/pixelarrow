// Ramp-aware palette remap (I1b, V5-087): unlike ops.mjs snapToPalette (nearest colour, which sends saturated
// bronze to the grey metal ramp), every colour is first given the ramp nearest its hue and chroma in OKLab
// (lightness ignored), then the step of that ramp nearest its lightness. Hue families and shading steps survive.
// Usage (library): import { remap, loadRamps } from './remap.mjs'
//        (CLI):    node scripts/art/pixellab/remap.mjs <in.png> <out.png> [palette.json]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../lib/png.mjs';
import { hexToRgb } from '../lib/ops.mjs';
import { ROOT } from '../lib/manifest.mjs';

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
/** sRGB -> OKLab [L, a, b]. */
export function oklab([r, g, b]) {
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

export function loadRamps(file = join(ROOT, 'docs/v5/pixellab/palette-dark.json')) {
  return Object.entries(JSON.parse(readFileSync(file, 'utf8'))).filter(([k]) => !k.startsWith('$'))
    .map(([name, cols]) => ({ name, cols: cols.map((h) => ({ rgb: hexToRgb(h), lab: oklab(hexToRgb(h)) })) }));
}

/** Remaps every opaque pixel; alpha is made binary. */
export function remap(img, ramps) {
  const out = { w: img.w, h: img.h, data: new Uint8Array(img.data) };
  const d = out.data;
  const cache = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) { d[i + 3] = 0; continue; }
    d[i + 3] = 255;
    const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let rgb = cache.get(k);
    if (!rgb) {
      const [L, a, b] = oklab([d[i], d[i + 1], d[i + 2]]);
      // ramp: nearest in chroma-hue (a, b), with a little lightness so near-black and near-white find their ramps
      let best = null, bd = Infinity;
      for (const r of ramps) for (const c of r.cols) {
        const dist = (a - c.lab[1]) ** 2 + (b - c.lab[2]) ** 2 + 0.08 * (L - c.lab[0]) ** 2;
        if (dist < bd) (bd = dist), (best = r);
      }
      // step: nearest lightness within that ramp
      let step = best.cols[0], sd = Infinity;
      for (const c of best.cols) {
        const dist = (L - c.lab[0]) ** 2;
        if (dist < sd) (sd = dist), (step = c);
      }
      rgb = step.rgb;
      cache.set(k, rgb);
    }
    d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [src, dst, pal] = process.argv.slice(2);
  writeImage(dst, remap(readImage(src), loadRamps(pal)));
  console.log(dst);
}
