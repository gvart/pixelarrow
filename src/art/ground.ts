/** Procedural isometric grass ground with dithered texture, tufts, flowers and dirt. */
import { P, mix } from './palette';
import { BAYER4, Pix, hash2, valueNoise } from './pixels';

export interface GroundOpts {
  /** playable field in pixels (relative to the ground origin) */
  fieldX: number;
  fieldY: number;
  fieldW: number;
  fieldH: number;
  seed: number;
}

export function renderGround(w: number, h: number, o: GroundOpts): Pix {
  const px = new Pix(w, h);
  const g = P.grass;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Iso-stretched noise (ground plane is squashed 2:1 vertically).
      const n1 = valueNoise(x, y * 2, 64, o.seed);
      const n2 = valueNoise(x, y * 2, 18, o.seed + 7);
      const n3 = valueNoise(x, y * 2, 6, o.seed + 13);
      let n = n1 * 0.55 + n2 * 0.3 + n3 * 0.15;
      // subtle isometric tile checker (32x16 diamonds)
      const u = Math.floor(x / 32 + y / 16);
      const v = Math.floor(y / 16 - x / 32);
      if ((u + v) % 2 === 0) n += 0.035;
      const inField = x >= o.fieldX && y >= o.fieldY && x < o.fieldX + o.fieldW && y < o.fieldY + o.fieldH;
      if (!inField) n -= 0.12;
      const t = BAYER4[y & 3][x & 3];
      const idx = Math.max(0, Math.min(4, Math.floor((1 - n) * 4.2 + (t - 0.5) * 0.9)));
      let c = g[idx];
      // dirt patches
      const d = valueNoise(x, y * 2, 90, o.seed + 31);
      if (d > 0.74) {
        const dd = (d - 0.74) / 0.26;
        if (dd + (t - 0.5) * 0.5 > 0.25) c = P.dirt[Math.max(0, Math.min(2, Math.floor(n3 * 3 + (t - 0.5))))];
      }
      if (!inField) c = mix(c, 0x3d4a2a, 0.18);
      px.set(x, y, c);
    }
  }
  // tufts, flowers and stones
  const area = w * h;
  for (let i = 0; i < area / 55; i++) {
    const x = Math.floor(hash2(i, 1, o.seed) * w);
    const y = Math.floor(hash2(i, 2, o.seed) * h);
    const r = hash2(i, 3, o.seed);
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

/** Small blood splat decals. */
export function renderBlood(variant: number): Pix {
  const px = new Pix(12, 7);
  const n = 7 + variant * 2;
  px.ellipse(2, 1, 8, 4, (x, y) => (hash2(x, y, variant) > 0.25 ? (hash2(x, y, variant + 9) > 0.7 ? P.blood[1] : P.blood[0]) : null));
  for (let i = 0; i < n; i++) {
    const x = Math.floor(hash2(i, variant, 77) * 12);
    const y = Math.floor(hash2(i, variant, 78) * 7);
    px.set(x, y, i % 3 ? P.blood[0] : P.blood[2]);
  }
  return px;
}

export function renderShadow(): Pix {
  const px = new Pix(14, 5);
  px.ellipse(0, 0, 14, 5, () => 0x1d140f);
  return px;
}

export function renderRing(color: number): Pix {
  const px = new Pix(18, 8);
  px.ellipse(0, 0, 18, 8, (_x, _y, edge) => (edge ? color : null));
  return px;
}
