/**
 * Procedural pixel art for battlefield terrain in the 2:1 iso view: ground
 * colours per terrain kind (painted into the ground texture by ground.ts),
 * stepped height shading with contour lips, water with ripples and ford
 * stones, plus upright sprites (trees, boulders, water glints) that the scene
 * depth-sorts among the soldiers.
 */
import { mix } from './palette';
import { BAYER4, Pix, hash2 } from './pixels';
import type { Terrain } from '../sim/terrain';

const RAMP = {
  forestFloor: [0x6a8248, 0x5d7540, 0x506838, 0x445a30, 0x3a4e2a],
  scrub: [0xa8a868, 0x98985c, 0x888a52, 0x787c48, 0x6a6e40],
  sand: [0xe6d4a0, 0xdcc892, 0xd0ba84, 0xc2ab76, 0xb39c6a],
  rough: [0xa89a78, 0x988a6a, 0x887a5e, 0x786a52, 0x685c48],
  water: [0x6a9cc0, 0x5a8cb4, 0x4c7ea6, 0x426f96, 0x385f84],
  ford: [0x8ab4c8, 0x7aa6be, 0x6c98b2, 0x5e8aa4, 0x527c96],
  sea: [0x46769e, 0x3e6b94, 0x37628a, 0x30587e, 0x2a4e72],
};

/**
 * Colour of one ground pixel at field position (fx, fy), given the grass
 * colour the plain would have there. n is the pixel's noise value 0..1,
 * (x, y) its pixel position (for dithering).
 */
export function terrainPixel(t: Terrain, fx: number, fy: number, grass: number, n: number, x: number, y: number): number {
  const d = t.at(fx, fy);
  const b = BAYER4[y & 3][x & 3];
  const pick = (ramp: number[], bias = 0) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor((1 - n) * 4.2 + (b - 0.5) * 0.9 + bias)))];
  let c = grass;
  switch (d.kind) {
    case 'forest':
      c = pick(RAMP.forestFloor);
      break;
    case 'scrub':
      c = (hash2(x >> 1, y, 5) > 0.55 ? pick(RAMP.scrub, -0.5) : mix(grass, RAMP.scrub[2], 0.45));
      if (hash2(x >> 2, y >> 1, 9) > 0.93) c = 0x5a6236;
      break;
    case 'sand':
      c = pick(RAMP.sand);
      break;
    case 'rough':
    case 'rocks':
      c = hash2(x, y, 3) > 0.82 ? mix(pick(RAMP.rough), 0x504838, 0.4) : hash2(x >> 1, y, 4) > 0.5 ? pick(RAMP.rough) : mix(grass, RAMP.rough[2], 0.5);
      break;
    case 'water': {
      c = pick(RAMP.water);
      // horizontal ripple dashes
      if (hash2(x >> 2, y, 11) > 0.93 && (x & 3) !== 3) c = mix(c, 0xd0e4ec, 0.5);
      break;
    }
    case 'ford': {
      c = pick(RAMP.ford);
      // stepping stones: little rounded pebbles across the shallows
      const sx = Math.floor(fx * 2);
      const sy = Math.floor(fy * 2);
      const cxp = sx / 2 + 0.25 + (hash2(sx, sy, 21) - 0.5) * 0.2;
      const cyp = sy / 2 + 0.25 + (hash2(sx, sy, 22) - 0.5) * 0.2;
      const r = (fx - cxp) ** 2 + (fy - cyp) ** 2;
      if (hash2(sx, sy, 23) > 0.45 && r < 0.022) c = r < 0.008 ? 0xd8ccb0 : 0xa89a80;
      else if (hash2(x >> 2, y, 13) > 0.95) c = mix(c, 0xe0eef4, 0.5);
      break;
    }
    case 'sea':
      c = pick(RAMP.sea);
      if (hash2(x >> 2, y, 17) > 0.96 && (x & 3) !== 3) c = mix(c, 0xcfe0ea, 0.45);
      break;
  }
  // shoreline foam: water next to land
  if (d.kind === 'water' || d.kind === 'sea') {
    const e = 0.14;
    const land = (px: number, py: number) => {
      const k = t.at(px, py).kind;
      return k !== 'water' && k !== 'sea' && k !== 'ford';
    };
    if (land(fx + e, fy) || land(fx - e, fy) || land(fx, fy + e) || land(fx, fy - e)) c = (x + y) % 3 ? 0xd8e8ec : mix(c, 0xd8e8ec, 0.5);
  }
  // high ground: each level a little lighter and warmer...
  const h = t.heightAt(fx, fy);
  if (h > 0) c = mix(c, 0xeee6b0, Math.min(0.36, h * 0.12));
  // ...with stepped contours: a dark face where the ground drops toward the
  // viewer (+x / +y), a lit lip along the top of a rise seen from below.
  const e = 0.13;
  const drop = Math.max(h - t.heightAt(fx + e, fy), h - t.heightAt(fx, fy + e));
  if (drop > 0) c = mix(c, 0x2a3018, 0.5 + (x & 1) * 0.1);
  else if (h > t.heightAt(fx - e, fy) || h > t.heightAt(fx, fy - e)) c = mix(c, 0xf4ecc0, 0.3);
  else if (drop === 0) {
    // a softer shade band just below a step on the lower side
    const e2 = 0.32;
    if (t.heightAt(fx - e2, fy) > h || t.heightAt(fx, fy - e2) > h) c = mix(c, 0x2e3420, ((x + y) & 1) ? 0.16 : 0.08);
  }
  return c;
}

/** A tree: trunk, layered dithered canopy, 1px outline. Variants: 0 oak, 1 pine, 2 olive. */
export function renderTree(variant: number): Pix {
  const W = 20;
  const H = 28;
  const px = new Pix(W, H);
  const leaf =
    variant === 1 ? [0x5c7a48, 0x46663a, 0x34522e, 0x26402a] : variant === 2 ? [0x9aa868, 0x7e8e52, 0x657444, 0x4c5a36] : [0x6e9048, 0x587a3a, 0x44622e, 0x324c26];
  const trunk = [0x7a5532, 0x5e4026, 0x45301c];
  // trunk
  for (let y = 16; y < 26; y++) {
    px.set(9, y, trunk[0]);
    px.set(10, y, trunk[1]);
    if (y > 22) px.set(11, y, trunk[2]);
    if (y > 23) px.set(8, y, trunk[1]);
  }
  const blob = (x0: number, y0: number, w: number, h: number) =>
    px.ellipse(x0, y0, w, h, (x, y, edge, u, v) => {
      const lit = -u * 0.6 - v * 0.8;
      const b = BAYER4[y & 3][x & 3] - 0.5;
      const k = lit + b * 0.5;
      if (edge && v > 0.2) return leaf[3];
      return k > 0.55 ? leaf[0] : k > -0.1 ? leaf[1] : k > -0.6 ? leaf[2] : leaf[3];
    });
  if (variant === 1) {
    // pine: stacked tiers
    for (let i = 0; i < 4; i++) {
      const w = 6 + i * 3;
      blob(10 - w / 2, 2 + i * 5, w, 7);
    }
  } else if (variant === 2) {
    blob(2, 6, 10, 9);
    blob(8, 4, 11, 10);
    blob(5, 10, 11, 8);
  } else {
    blob(3, 3, 14, 13);
    blob(1, 8, 9, 8);
    blob(10, 7, 9, 9);
  }
  px.outline(0x2a1a16);
  return px;
}

/** A boulder cluster: lit top-left, shaded right, outlined. */
export function renderBoulder(variant: number): Pix {
  const px = new Pix(18, 13);
  const stone = [0xc4bcaa, 0xa49a86, 0x847a68, 0x625a4c];
  const rock = (x0: number, y0: number, w: number, h: number) =>
    px.ellipse(x0, y0, w, h, (x, y, _e, u, v) => {
      const k = -u * 0.7 - v * 0.9 + (BAYER4[y & 3][x & 3] - 0.5) * 0.4;
      return k > 0.6 ? stone[0] : k > 0 ? stone[1] : k > -0.6 ? stone[2] : stone[3];
    });
  if (variant % 2 === 0) {
    rock(2, 2, 11, 10);
    rock(10, 6, 7, 6);
  } else {
    rock(5, 1, 10, 11);
    rock(1, 6, 7, 6);
  }
  // a crack and a moss spot
  px.set(7, 6, stone[3]);
  px.set(8, 7, stone[3]);
  px.set(5, 4, 0x6a7a48);
  px.outline(0x2a1a16);
  return px;
}

/** A short light glint for water shimmer. */
export function renderGlint(): Pix {
  const px = new Pix(5, 1);
  px.set(0, 0, 0xcfe0ea);
  px.set(1, 0, 0xffffff);
  px.set(2, 0, 0xffffff);
  px.set(3, 0, 0xcfe0ea);
  return px;
}
