/** Procedural isometric grass ground: diamond tiles, dithered texture, tufts, flowers and dirt. */
import { P, mix } from './palette';
import { BAYER4, Pix, hash2, valueNoise } from './pixels';
import { ISO_HH, ISO_HW } from './iso';
import { terrainPixel } from './terrainArt';
import type { Terrain } from '../sim/terrain';

export interface GroundOpts {
  /** world-pixel position of the image's top-left corner */
  originX: number;
  originY: number;
  /** playable field size in field units (one unit = one diamond tile) */
  fieldW: number;
  fieldH: number;
  seed: number;
  /** Battlefield terrain painted over the plain (forest floor, water, sand, heights...). */
  terrain?: Terrain | null;
}

/**
 * Renders a w x h pixel image of the isometric plain. Every pixel is mapped back
 * through the inverse projection to field coordinates, so tiles are exact 2:1
 * diamonds aligned with the simulation grid.
 */
export function renderGround(w: number, h: number, o: GroundOpts): Pix {
  const px = new Pix(w, h);
  const g = P.grass;
  for (let y = 0; y < h; y++) {
    const wy = o.originY + y;
    for (let x = 0; x < w; x++) {
      const wx = o.originX + x;
      // inverse projection: field coordinates of this pixel
      const a = wx / ISO_HW;
      const b = wy / ISO_HH;
      const fx = (a + b) / 2;
      const fy = (b - a) / 2;
      const tx = Math.floor(fx);
      const ty = Math.floor(fy);
      const u = fx - tx;
      const v = fy - ty;
      // large-scale meadow variation (screen space, de-squashed)
      // a natural meadow: broad patches, clumps and fine grain; no tile grid
      const n1 = valueNoise(wx + 4000, wy * 2 + 4000, 110, o.seed);
      const n2 = valueNoise(wx + 4000, wy * 2 + 4000, 30, o.seed + 7);
      const n3 = valueNoise(wx + 4000, wy * 2 + 4000, 7, o.seed + 13);
      const n4 = hash2(x >> 1, y, o.seed + 5);
      let n = 0.5 + (n1 - 0.5) * 0.55 + (n2 - 0.5) * 0.35 + (n3 - 0.5) * 0.3 + (n4 - 0.5) * 0.12;
      void tx;
      void ty;
      void u;
      void v;
      const seam = 0;
      const inField = fx >= 0 && fy >= 0 && fx < o.fieldW && fy < o.fieldH;
      if (!inField) n -= 0.1;
      const t = BAYER4[y & 3][x & 3];
      const idx = Math.max(0, Math.min(4, Math.floor((1 - n) * 4.2 + (t - 0.5) * 0.9)));
      let c = g[idx];
      // sun-dried straw-coloured patches
      const dry = valueNoise(wx + 9000, wy * 2 + 4000, 60, o.seed + 41);
      if (dry > 0.62) c = mix(c, 0xa89a64, Math.min(0.55, (dry - 0.62) * 2.2) * (0.7 + t * 0.6));
      // dirt patches (trampled ground)
      const d = valueNoise(wx + 4000, wy * 2 + 4000, 96, o.seed + 31);
      if (d > 0.72) {
        const dd = (d - 0.72) / 0.28;
        if (dd + (t - 0.5) * 0.5 > 0.2) c = P.dirt[Math.max(0, Math.min(2, Math.floor(n3 * 3 + (t - 0.5))))];
      }
      const tk = inField && o.terrain ? o.terrain.at(fx, fy).kind : 'open';
      if (inField && o.terrain) c = terrainPixel(o.terrain, fx, fy, c, n, x, y);
      const wet = tk === 'water' || tk === 'sea' || tk === 'ford';
      // seams are drawn as colour, not noise, so the dither cannot wash them out;
      // every other seam pixel is skipped for a soft, hand-dithered edge
      if (wet) {
        /* no tile seams on water */
      } else if (seam < 0 && ((x + y) & 1) === 0) c = mix(c, 0x3a4a26, 0.42);
      else if (seam < 0) c = mix(c, 0x3a4a26, 0.24);
      else if (seam > 0 && ((x + y) & 1) === 0) c = mix(c, 0xc8d68a, 0.16);
      if (!inField) c = mix(c, 0x3d4a2a, 0.22);
      px.set(x, y, c);
    }
  }
  // tufts, flowers and stones
  const area = w * h;
  for (let i = 0; i < area / 110; i++) {
    const x = Math.floor(hash2(i, 1, o.seed) * w);
    const y = Math.floor(hash2(i, 2, o.seed) * h);
    const r = hash2(i, 3, o.seed);
    if (o.terrain) {
      // tufts and flowers only on open ground and scrub
      const a = (o.originX + x) / ISO_HW;
      const bb = (o.originY + y) / ISO_HH;
      const k = o.terrain.at((a + bb) / 2, (bb - a) / 2).kind;
      if (k !== 'open' && k !== 'scrub' && k !== 'forest') continue;
    }
    const base = px.get(Math.min(w - 1, x), Math.min(h - 1, y));
    const dark = mix(base, 0x2e3d1e, 0.35);
    const light = mix(base, 0xc8d68a, 0.35);
    if (r < 0.8) {
      px.set(x, y, dark);
      px.set(x + 2, y, dark);
      px.set(x + 1, y + 1, dark);
      px.set(x, y - 1, light);
      px.set(x + 2, y - 1, light);
    } else if (r < 0.9) {
      const fc = [0xe8dcb8, 0xd8b84a, 0xb85a5a, 0xc9a0c8][Math.floor(hash2(i, 4, o.seed) * 4)];
      px.set(x, y, fc);
      px.set(x, y + 1, dark);
    } else if (r < 0.95) {
      px.set(x, y, 0x9a9488);
      px.set(x + 1, y, 0x7a7468);
      px.set(x, y - 1, 0xb8b2a4);
    } else {
      // longer grass clump
      for (let k = 0; k < 4; k++) px.set(x + k, y - (k % 2), k % 2 ? light : dark);
      px.set(x + 1, y + 1, dark);
      px.set(x + 2, y + 1, dark);
    }
  }
  return px;
}

/** Blood splat decals: a dark pool with droplets, irregular and dithered. */
export function renderBlood(variant: number): Pix {
  const px = new Pix(18, 9);
  const n = 9 + variant * 3;
  px.ellipse(3, 2, 11, 5, (x, y, edge) => (hash2(x, y, variant) > (edge ? 0.55 : 0.12) ? (hash2(x, y, variant + 9) > 0.65 ? P.blood[1] : P.blood[0]) : null));
  for (let i = 0; i < n; i++) {
    const x = Math.floor(hash2(i, variant, 77) * 18);
    const y = Math.floor(hash2(i, variant, 78) * 9);
    px.set(x, y, i % 3 ? P.blood[1] : P.blood[2]);
  }
  return px;
}

/** A soft ground shadow: dithered, darker in the middle. */
export function renderShadow(w = 18, h = 7): Pix {
  const px = new Pix(w, h);
  px.ellipse(0, 0, w, h, (x, y, _e, u, v) => {
    const r = u * u + v * v;
    return r < 0.45 || BAYER4[y & 3][x & 3] > (r - 0.45) * 1.6 ? 0x1d140f : null;
  });
  return px;
}

export function renderRing(color: number, w = 26, h = 12): Pix {
  const px = new Pix(w, h);
  px.ellipse(0, 0, w, h, (_x, _y, edge) => (edge ? color : null));
  return px;
}
