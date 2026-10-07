/**
 * Procedural pixel art for battlefield terrain in the 2:1 iso view: ground
 * colours per terrain kind (painted into the ground texture by ground.ts),
 * stepped height shading with contour lips, water with ripples and ford
 * stones, plus upright sprites (trees, boulders, water glints) that the scene
 * depth-sorts among the soldiers.
 */
import { mix } from './palette';
import { BAYER4, Pix, hash2 } from './pixels';
import { Scene, ramp, type Material } from './model3d';
import type { Terrain } from '../sim/terrain';

const RAMP = {
  forestFloor: [0x7d7a3e, 0x6e6c38, 0x605c32, 0x534c2c, 0x463e27],
  scrub: [0xa8a058, 0x968f4c, 0x857e44, 0x746c3c, 0x635a35],
  sand: [0xe2cfa0, 0xd6c190, 0xc8b182, 0xb8a074, 0xa68e66],
  rough: [0xaa9a78, 0x988868, 0x86765c, 0x746452, 0x625446],
  water: [0x5e8292, 0x527686, 0x476a7a, 0x3e5e6e, 0x355262],
  ford: [0x7c98a0, 0x6e8c94, 0x618088, 0x55747c, 0x4a6870],
  sea: [0x426272, 0x3b5a6a, 0x355262, 0x2f4a58, 0x29424f],
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
      // shaded floor under the canopy, blended into the grass so the cells do not read as tiles
      c = mix(grass, pick(RAMP.forestFloor), 0.6);
      break;
    case 'scrub':
      c = (hash2(x >> 1, y, 5) > 0.55 ? pick(RAMP.scrub, -0.5) : mix(grass, RAMP.scrub[2], 0.45));
      if (hash2(x >> 2, y >> 1, 9) > 0.93) c = 0x5b4a2c;
      break;
    case 'sand':
      c = pick(RAMP.sand);
      break;
    case 'rough':
    case 'rocks':
      c = hash2(x, y, 3) > 0.82 ? mix(pick(RAMP.rough), 0x5b4433, 0.4) : hash2(x >> 1, y, 4) > 0.5 ? pick(RAMP.rough) : mix(grass, RAMP.rough[2], 0.5);
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
  if (drop > 0) c = mix(c, 0x4a3022, 0.5 + (x & 1) * 0.1);
  else if (h > t.heightAt(fx - e, fy) || h > t.heightAt(fx, fy - e)) c = mix(c, 0xf4ecc0, 0.3);
  else if (drop === 0) {
    // a softer shade band just below a step on the lower side
    const e2 = 0.32;
    if (t.heightAt(fx - e2, fy) > h || t.heightAt(fx, fy - e2) > h) c = mix(c, 0x4a3426, ((x + y) & 1) ? 0.16 : 0.08);
  }
  return c;
}

/** Tree and boulder sprite sizes (feet / base line at footY, centred). */
export const TREE_GEOM = { w: 64, h: 84, footY: 78 };
export const BOULDER_GEOM = { w: 48, h: 36, footY: 28 };

/**
 * A tree built and lit like the soldiers (src/art/model3d.ts): a trunk and
 * clustered, grainy foliage. Variants: 0 oak, 1 pine, 2 olive.
 */
export function renderTree(variant: number): Pix {
  const sc = new Scene();
  const leaf: Material =
    variant === 1 ? { ramp: ramp(0x66703e), grit: 0.6, contrast: 1.1 } : variant === 2 ? { ramp: ramp(0x8c8e58), grit: 0.6, contrast: 1.05 } : { ramp: ramp(0x7a8442), grit: 0.6, contrast: 1.1 };
  const bark: Material = { ramp: ramp(0x5e4630), grit: 0.6 };
  const rnd = (i: number) => hash2(variant * 31 + i, 7, 3);
  if (variant === 1) {
    sc.limb([0, 0, 0], [0, 0, 4.2], 0.18, 0.06, bark);
    sc.group();
    for (let k = 0; k < 5; k++) {
      const z = 1.6 + k * 0.55;
      const r = 1.05 - k * 0.18;
      sc.ellipsoid([0, 0, z], [r, 0, 0], [0, r, 0], [0, 0, 0.42], leaf);
    }
  } else {
    const h = variant === 2 ? 1.5 : 2.2;
    sc.limb([0, 0, 0], [0.1, -0.05, h], variant === 2 ? 0.2 : 0.16, 0.12, bark);
    sc.limb([0.1, -0.05, h], [0.6, 0.2, h + 0.7], 0.1, 0.05, bark);
    sc.limb([0.1, -0.05, h], [-0.5, -0.3, h + 0.6], 0.1, 0.05, bark);
    sc.group();
    const n = variant === 2 ? 9 : 12;
    for (let k = 0; k < n; k++) {
      const a = rnd(k) * Math.PI * 2;
      const rr = 0.4 + rnd(k + 20) * 0.9;
      const z = h + 0.4 + rnd(k + 40) * (variant === 2 ? 0.9 : 1.6);
      const r = 0.55 + rnd(k + 60) * 0.45;
      sc.sphere([Math.cos(a) * rr, Math.sin(a) * rr, z], r * (variant === 2 ? 0.85 : 1), leaf);
    }
  }
  return sc.render(TREE_GEOM.w, TREE_GEOM.h, TREE_GEOM.w / 2, TREE_GEOM.footY);
}

/** A boulder cluster, lit like everything else. */
export function renderBoulder(variant: number): Pix {
  const sc = new Scene();
  const stone: Material = { ramp: ramp(0x938078), grit: 0.6, contrast: 1.2 };
  const moss: Material = { ramp: ramp(0x8a8a4a), grit: 0.6 };
  const k = variant % 2;
  sc.ellipsoid([0, 0, 0.35], [0.75, 0.2, 0], [-0.15, 0.6, 0], [0, 0, 0.55], stone);
  sc.group();
  sc.ellipsoid([k ? 0.6 : -0.5, k ? -0.4 : 0.45, 0.2], [0.42, 0, 0], [0, 0.38, 0], [0, 0, 0.32], stone);
  sc.group();
  sc.ellipsoid([0.1, 0.05, 0.75], [0.3, 0, 0], [0, 0.3, 0], [0, 0, 0.12], moss);
  return sc.render(BOULDER_GEOM.w, BOULDER_GEOM.h, BOULDER_GEOM.w / 2, BOULDER_GEOM.footY);
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
