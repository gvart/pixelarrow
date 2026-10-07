/** Procedural isometric steppe ground (golden-olive tufted grass, faint diamond grid), blood, shadows, base plates. */
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

/** Dry steppe grass, light to dark: straw highlight .. soil shadow (docs/ART_STYLE.md §6). */
export const GRASS = [0xbba96a, 0xaa9a51, 0xa19045, 0x9a8f3b, 0x938739, 0x8d7d38, 0x7d6c36, 0x6b6038, 0x5b4a2c];
/** Straw tuft tones (lit tops of the wind-combed clumps). */
const STRAW = [0xd2c286, 0xc4b474, 0xbba96a, 0xaa9a51];

/**
 * Renders a w x h pixel image of the isometric plain. Every pixel is mapped back
 * through the inverse projection to field coordinates, so the faint diamond grid
 * is aligned with the simulation's tiles.
 *
 * The plain is a flat golden-olive field with low-frequency "drifts" (noise
 * stretched 3:1 horizontally) of lighter straw over darker olive, covered in
 * short vertical 1 x 1-4 tufts: bright straw on the top edge of a drift,
 * olive-brown shadow tufts on its bottom edge. No ordered dither.
 */
export function renderGround(w: number, h: number, o: GroundOpts): Pix {
  const px = new Pix(w, h);
  // per pixel: drift value (0 dark olive .. 1 straw) and whether tufts may grow there
  const drift = new Float32Array(w * h);
  const grassy = new Uint8Array(w * h);
  const G = GRASS;
  const driftAt = (wx: number, wy: number) => {
    const a = valueNoise(wx * 0.34 + 4000, wy + 4000, 34, o.seed);
    const b = valueNoise(wx * 0.34 + 9000, wy + 7000, 13, o.seed + 3);
    return Math.max(0, Math.min(1, 0.5 + (a - 0.5) * 1.5 + (b - 0.5) * 0.7));
  };
  for (let y = 0; y < h; y++) {
    const wy = o.originY + y;
    for (let x = 0; x < w; x++) {
      const wx = o.originX + x;
      const a = wx / ISO_HW;
      const b = wy / ISO_HH;
      const fx = (a + b) / 2;
      const fy = (b - a) / 2;
      const i = y * w + x;
      const d = driftAt(wx, wy);
      drift[i] = d;
      // base tone: mostly the dominant olive, lighter in the drifts, a sparse grain
      const grain = hash2(x, y, o.seed + 5);
      let idx = 5.6 - d * 3.6 + (grain > 0.85 ? 0.7 : grain < 0.12 ? -0.6 : 0);
      const broad = valueNoise(wx * 0.5 + 100, wy + 100, 140, o.seed + 41);
      idx += (0.5 - broad) * 1.0;
      let c = G[Math.max(1, Math.min(G.length - 2, Math.round(idx)))];
      const inField = fx >= 0 && fy >= 0 && fx < o.fieldW && fy < o.fieldH;
      const tk = inField && o.terrain ? o.terrain.at(fx, fy).kind : 'open';
      if (inField && o.terrain) c = terrainPixel(o.terrain, fx, fy, c, 1 - (idx - 1) / 7, x, y);
      const wet = tk === 'water' || tk === 'sea' || tk === 'ford';
      grassy[i] = tk === 'open' || tk === 'scrub' ? 1 : 0;
      // the faint diamond grid: two pixels wide per row, one step darker than the grass
      if (!wet && tk !== 'forest') {
        const ux = fx - Math.floor(fx);
        const uy = fy - Math.floor(fy);
        if (ux < 1 / ISO_HW || uy < 1 / ISO_HW) c = mix(c, 0x4e3e22, 0.1);
      }
      if (!inField) c = mix(c, 0x6b5a34, 0.12);
      px.set(x, y, c);
    }
  }
  // tufts: short vertical strokes, clumped by the drift value
  for (let y = 4; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!grassy[i]) continue;
      const r = hash2(x, y, o.seed + 11);
      if (r > 0.16) continue;
      const d = drift[i];
      // edges of a drift: top (rising into straw) and bottom (falling back to olive)
      const up = y >= 6 ? drift[i - 6 * w] : d;
      const dn = y < h - 6 ? drift[i + 6 * w] : d;
      const topEdge = d - up;
      const botEdge = d - dn;
      const t2 = hash2(x, y, o.seed + 12);
      const len = 2 + Math.floor(t2 * t2 * 2.6);
      let tone: number;
      let tip: number;
      if (topEdge > 0.05 || (d > 0.62 && t2 < 0.5)) {
        tone = STRAW[Math.min(3, Math.floor(hash2(x, y, 13) * 2) + (d > 0.7 ? 1 : 2))];
        tip = STRAW[d > 0.7 ? 0 : 1];
      } else if (botEdge > 0.05 || d < 0.32) {
        tone = r < 0.03 ? G[7] : G[6];
        tip = G[5];
      } else {
        const k = Math.max(1, Math.min(G.length - 3, Math.round(5 - d * 3.6)));
        tone = t2 < 0.5 ? G[k + 1] : G[k - 1];
        tip = G[k - 1];
      }
      for (let k = 0; k < len; k++) {
        const yy = y - k;
        if (yy < 0 || !grassy[yy * w + x]) break;
        px.set(x, yy, k === len - 1 && len > 1 ? tip : tone);
      }
      // a dark root pixel under taller lit tufts gives them depth
      if (len >= 3 && y + 1 < h && grassy[i + w]) px.set(x, y + 1, G[6]);
    }
  }
  // rare dry flowers and pebbles
  const area = w * h;
  for (let i = 0; i < area / 2600; i++) {
    const x = Math.floor(hash2(i, 1, o.seed) * w);
    const y = Math.floor(hash2(i, 2, o.seed) * h);
    if (!grassy[Math.min(h - 1, y) * w + Math.min(w - 1, x)]) continue;
    const r = hash2(i, 3, o.seed);
    if (r < 0.6) {
      px.set(x, y, [0xe6d8b0, 0xd8b84a, 0xc98a6a][Math.floor(hash2(i, 4, o.seed) * 3)]);
      px.set(x, y + 1, GRASS[6]);
    } else {
      px.set(x, y, 0xb3a692);
      px.set(x + 1, y, 0x836c65);
      px.set(x, y + 1, 0x6b6038);
      px.set(x + 1, y + 1, 0x6b6038);
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

/** Base plate tones (a tabletop miniature's base): top light / top / rim / side / side shadow. */
const PLATE = [0xb4bd8c, 0x9a9a68, 0x7c7c50, 0x66603e, 0x4e4630];

/**
 * A soldier's iso base plate: a 2:1 diamond top (w x w/2) with a 2 px side,
 * lit from the upper left, over a soft shadow cast to the lower right.
 * The plate's top-face centre sits at (w/2, plateCentreY(w)).
 */
export function renderBasePlate(w = 20): Pix {
  const hh = Math.floor(w / 4); // half height of the top face
  const hw = w / 2;
  const th = 2;
  const px = new Pix(w + 6, hh * 2 + th + 3);
  const cx = hw + 1.5;
  const cy = hh - 0.5;
  // soft shadow, offset to the lower right
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      const d = Math.abs(x - cx - 2.5) / (hw + 1) + Math.abs(y - cy - 2.5) / (hh + 1);
      if (d <= 1) px.set(x, y, 0x3a2e1c, d < 0.75 ? 90 : 50);
    }
  const inTop = (x: number, y: number) => Math.abs(x - cx) / hw + Math.abs(y - cy) / hh <= 1;
  // side: the top face pushed down th px
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      if (inTop(x, y)) continue;
      for (let k = 1; k <= th; k++)
        if (inTop(x, y - k)) {
          px.set(x, y, k === th || x > cx ? PLATE[4] : PLATE[3]);
          break;
        }
    }
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      if (!inTop(x, y)) continue;
      const edge = !inTop(x - 1, y) || !inTop(x + 1, y) || !inTop(x, y - 1) || !inTop(x, y + 1);
      let c = PLATE[1];
      if (edge) c = y < cy && x < cx + 2 ? PLATE[0] : PLATE[2];
      else if (hash2(x, y, 5) > 0.86) c = PLATE[2];
      px.set(x, y, c);
    }
  return px;
}

/** Where the top-face centre of renderBasePlate(w) sits, as a texture origin (0..1). */
export function plateOrigin(w = 20): [number, number] {
  const hh = Math.floor(w / 4);
  return [(w / 2 + 2) / (w + 6), hh / (hh * 2 + 2 + 3)];
}

/** A selection outline that hugs a base plate: a 1 px diamond plus the side edge. */
export function renderPlateRing(color: number, w = 20): Pix {
  const hh = Math.floor(w / 4);
  const hw = w / 2;
  const px = new Pix(w + 6, hh * 2 + 2 + 3);
  const cx = hw + 1.5;
  const cy = hh - 0.5;
  const inTop = (x: number, y: number) => Math.abs(x - cx) / (hw + 1) + Math.abs(y - cy) / (hh + 0.5) <= 1;
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      const on = inTop(x, y);
      const edge = on && (!inTop(x - 1, y) || !inTop(x + 1, y) || !inTop(x, y - 1) || !inTop(x, y + 1));
      if (edge) px.set(x, y, color);
      else if (on) px.set(x, y, color, 70);
    }
  return px;
}
