/** Procedural isometric steppe ground (golden-olive tufted grass, faint diamond grid), blood, shadows, base plates. */
import { P, mix } from './palette';
import { BAYER4, Pix, hash2, valueNoise } from './pixels';
import { ISO_HH, ISO_HW } from './iso';
import { terrainPixel, warpedField } from './terrainArt';
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
      let tk = 'open';
      if (inField && o.terrain) {
        const [wx, wy] = warpedField(o.terrain, fx, fy, x, y);
        tk = o.terrain.at(wx, wy).kind;
        c = terrainPixel(o.terrain, fx, fy, c, 1 - (idx - 1) / 7, x, y, wx, wy);
      }
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

/** Facing steps for the joined formation plates (a rectangle is symmetric, so 8 cover all 16). */
export const STRIP_STEPS = 8;
/** Lateral and depth size (field units) of one man's plate inside a formation strip. */
export const STRIP_LAT = 1.04;
export const STRIP_DEP = 0.5;

/** Plate tones when selected (cyan, docs/ART_STYLE.md §9) and when singled out (gold). */
const PLATE_SEL = [0xc0dcc8, 0x9cbcae, 0x7a9e96, 0x5e807c, 0x4a6666];
const PLATE_ONE = [0xf6e4a0, 0xdcc070, 0xb09048, 0x8a7038, 0x6a5428];

export interface StripPlate {
  /** Side + shadow layer (drawn under every top so a strip has no seams). */
  side: Pix;
  /** Top faces: plain, selected (cyan), singled out (gold). */
  top: Pix;
  sel: Pix;
  one: Pix;
  /** Texture origin (0..1) of the top-face centre. */
  ox: number;
  oy: number;
}

/**
 * One soldier's piece of a joined formation base: the field-space rectangle
 * STRIP_LAT x STRIP_DEP turned to the formation's facing (step k of
 * STRIP_STEPS half-turns), projected to the iso view. Neighbours in a rank
 * overlap a little, and the lateral ends carry no rim, so a rank of men stands
 * on one continuous strip like a tabletop movement tray; the front and back
 * edges keep the light / dark rim and the 2 px side.
 */
export function renderStripPlate(k: number): StripPlate {
  const ang = (k / STRIP_STEPS) * Math.PI; // facing angle in field space
  const fx = Math.cos(ang);
  const fy = Math.sin(ang);
  const rx = -fy; // the facing's right-hand vector (any perpendicular works: the plate is symmetric)
  const ry = fx;
  const hl = STRIP_LAT / 2;
  const hd = STRIP_DEP / 2;
  // bounding box of the projected corners
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const px = rx * hl * a + fx * hd * b;
    const py = ry * hl * a + fy * hd * b;
    const sx = (px - py) * ISO_HW;
    const sy = (px + py) * ISO_HH;
    x0 = Math.min(x0, sx);
    x1 = Math.max(x1, sx);
    y0 = Math.min(y0, sy);
    y1 = Math.max(y1, sy);
  }
  const cx = Math.ceil(-x0) + 1;
  const cy = Math.ceil(-y0) + 1;
  const w = Math.ceil(x1 - x0) + 6;
  const h = Math.ceil(y1 - y0) + 6;
  const side = new Pix(w, h);
  const tops = [new Pix(w, h), new Pix(w, h), new Pix(w, h)];
  // field-space test: lateral and depth coordinates of a texture pixel
  const lat = (x: number, y: number) => {
    const a = (x - cx + 0.5) / ISO_HW;
    const b = (y - cy + 0.5) / ISO_HH;
    const px = (a + b) / 2;
    const py = (b - a) / 2;
    return [px * rx + py * ry, px * fx + py * fy];
  };
  const inTop = (x: number, y: number) => {
    const [l, d] = lat(x, y);
    return Math.abs(l) <= hl && Math.abs(d) <= hd;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (inTop(x, y)) continue;
      // soft shadow to the lower right, then the 2 px side under the front edges
      if (inTop(x - 2, y - 2)) side.set(x, y, 0x3a2e1c, 80);
      for (let t = 1; t <= 2; t++)
        if (inTop(x, y - t)) {
          side.set(x, y, t === 2 ? PLATE[4] : PLATE[3]);
          break;
        }
    }
  const ramps = [PLATE, PLATE_SEL, PLATE_ONE];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!inTop(x, y)) continue;
      const [l] = lat(x, y);
      // rim only where the neighbour pixel leaves the plate through a front/back edge
      const out = (xx: number, yy: number) => {
        if (inTop(xx, yy)) return false;
        const [l2] = lat(xx, yy);
        return Math.abs(l2) <= hl;
      };
      const lit = out(x - 1, y) || out(x, y - 1);
      const dark = out(x + 1, y) || out(x, y + 1);
      for (let r = 0; r < 3; r++) {
        const R = ramps[r];
        let c = R[1];
        if (dark) c = R[2];
        else if (lit) c = R[0];
        else if (hash2(x, y, 5 + k) > 0.88 && Math.abs(l) < hl - 0.05) c = R[2];
        tops[r].set(x, y, c);
      }
    }
  return { side, top: tops[0], sel: tops[1], one: tops[2], ox: cx / w, oy: cy / h };
}

/** The strip step (0..STRIP_STEPS-1) nearest a field facing. */
export function stripStep(fx: number, fy: number): number {
  const a = Math.atan2(fy, fx);
  return ((Math.round((a / Math.PI) * STRIP_STEPS) % STRIP_STEPS) + STRIP_STEPS) % STRIP_STEPS;
}

/** A standard: team-coloured disc with an emblem on a pole, streamers that wave (4 frames side by side). */
export const STANDARD_W = 13;
export const STANDARD_H = 44;
export const STANDARD_FRAMES = 4;
export function renderStandard(ramp: number[]): Pix {
  const W = STANDARD_W;
  const H = STANDARD_H;
  const px = new Pix(W * STANDARD_FRAMES, H);
  const WOOD = [0xa8845a, 0x7a5a3c, 0x523a28];
  for (let f = 0; f < STANDARD_FRAMES; f++) {
    const o = f * W;
    const pole = o + 6;
    // pole with a lit left edge
    for (let y = 9; y < H; y++) px.set(pole, y, y % 5 === 0 ? WOOD[2] : WOOD[1]);
    px.set(pole, H - 1, WOOD[2]);
    // cross-bar under the disc, with two streamers that wave
    px.set(pole - 3, 14, WOOD[1]);
    px.set(pole - 2, 14, WOOD[1]);
    px.set(pole - 1, 14, WOOD[0]);
    px.set(pole + 1, 14, WOOD[1]);
    px.set(pole + 2, 14, WOOD[1]);
    px.set(pole + 3, 14, WOOD[2]);
    // the wind takes the streamer tails to the right, more or less each frame
    const tail = [
      [0, 0, 1, 1, 1, 2],
      [0, 1, 1, 2, 2, 3],
      [0, 0, 1, 1, 2, 2],
      [0, 0, 0, 1, 1, 1],
    ][f];
    for (const sx of [-3, 3]) {
      for (let t = 0; t < 6; t++) {
        const dx = tail[t];
        const c = t === 5 ? ramp[3] : t % 2 ? ramp[2] : ramp[1];
        px.set(pole + sx + dx, 15 + t, c);
      }
    }
    // the disc: 9 px, light rim upper left, dark rim lower right, cream emblem
    const dc = { x: pole, y: 5 };
    for (let y = 0; y < 11; y++)
      for (let x = pole - 5; x <= pole + 5; x++) {
        const dx = x - dc.x;
        const dy = y - dc.y;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r > 4.6) continue;
        let c = ramp[1];
        if (r > 3.6) c = dx + dy < 0 ? 0xe8dcc6 : ramp[3];
        else if (dx + dy > 2.5) c = ramp[2];
        // emblem: a small cream diamond with a dark eye (original, not a copied device)
        if (Math.abs(dx) + Math.abs(dy) <= 2 && r <= 3.6) c = Math.abs(dx) + Math.abs(dy) === 0 ? ramp[3] : 0xe8dcc6;
        px.set(x, y, c);
      }
    // finial on top
    px.set(pole, 0, 0xd2b68e);
  }
  return px;
}
