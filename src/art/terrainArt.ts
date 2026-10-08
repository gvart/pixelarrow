/**
 * Procedural pixel art for battlefield terrain in the 2:1 iso view: ground
 * colours per terrain kind (painted into the ground texture by ground.ts),
 * stepped height shading with contour lips, water with ripples and ford
 * stones, plus upright sprites (trees, boulders, water glints) that the scene
 * depth-sorts among the soldiers.
 */
import { mix } from './palette';
import { BAYER4, Pix, hash2, valueNoise } from './pixels';
import { Scene, ramp, type Material } from './model3d';
import type { Terrain } from '../sim/terrain';

const RAMP = {
  forestFloor: [0x7d7a3e, 0x6e6c38, 0x605c32, 0x534c2c, 0x463e27],
  scrub: [0xa8a058, 0x968f4c, 0x857e44, 0x746c3c, 0x635a35],
  sand: [0xe2cfa0, 0xd6c190, 0xc8b182, 0xb8a074, 0xa68e66],
  rough: [0xaa9a78, 0x988868, 0x86765c, 0x746452, 0x625446],
  // lavender-teal water (docs/ART_STYLE.md §6 sea, cooled toward teal so it reads against the olive field)
  water: [0x9aa8b4, 0x8c9aac, 0x8090a6, 0x75849c, 0x6b7892],
  ford: [0xaab8b8, 0x9eacb0, 0x92a2aa, 0x8696a2, 0x7a8a98],
  sea: [0x8a90aa, 0x7e84a0, 0x737896, 0x686c8a, 0x5e607e],
};

/** Distances (field units) of the shore bands; inside a uniform patch only the far one can apply. */
const SHORE_R = [0.07, 0.16, 0.3, 0.48];
const SHORE_FAR = [0.48];

/**
 * How far (field units) the drawn terrain boundaries wobble from the sim's cell
 * edges at pixel (x, y); axis 1 = field x, 2 = field y. Drawing only.
 */
export function terrainWobble(x: number, y: number, axis: number): number {
  return (valueNoise(x + axis * 977, y * 2 + axis * 331, 9, 71) - 0.5) * 0.5 + (valueNoise(x + axis * 131, y * 2, 3, 72) - 0.5) * 0.12;
}

/**
 * The drawn position of field point (fx, fy) at pixel (x, y): wobbled near a
 * boundary between terrain kinds, unchanged inside a uniform patch (which skips
 * the noise for most of the field).
 */
export function warpedField(t: Terrain, fx: number, fy: number, x: number, y: number): [number, number] {
  const k = t.at(fx, fy).kind;
  const e = 0.34;
  if (t.at(fx + e, fy).kind === k && t.at(fx - e, fy).kind === k && t.at(fx, fy + e).kind === k && t.at(fx, fy - e).kind === k) return [fx, fy];
  return [fx + terrainWobble(x, y, 1), fy + terrainWobble(x, y, 2)];
}

/**
 * Colour of one ground pixel at field position (fx, fy), given the grass
 * colour the plain would have there. n is the pixel's noise value 0..1,
 * (x, y) its pixel position (for dithering).
 */
export function terrainPixel(t: Terrain, fx: number, fy: number, grass: number, n: number, x: number, y: number, wx = fx, wy = fy): number {
  // (wx, wy): the position wobbled by terrainWobble (see warpedField), so coasts and
  // banks read as organic curves instead of a staircase of tiles. Drawing only.
  const d = t.at(wx, wy);
  // not wobbled = a uniform patch: no other kind within ~0.34, so the shore tests can be skipped
  const edge = wx !== fx || wy !== fy;
  const b = BAYER4[y & 3][x & 3];
  const pick = (ramp: number[], bias = 0) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor((1 - n) * 4.2 + (b - 0.5) * 0.9 + bias)))];
  const wetAt = (px: number, py: number) => {
    const k = t.at(px, py).kind;
    return k === 'water' || k === 'sea' || k === 'ford';
  };
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
      // sparse stipple, as on the map's beaches
      if (hash2(x, y, 31) > 0.94) c = RAMP.sand[4];
      break;
    case 'rough':
    case 'rocks':
      c = hash2(x, y, 3) > 0.82 ? mix(pick(RAMP.rough), 0x5b4433, 0.4) : hash2(x >> 1, y, 4) > 0.5 ? pick(RAMP.rough) : mix(grass, RAMP.rough[2], 0.5);
      break;
    case 'water':
    case 'sea': {
      const R = d.kind === 'sea' ? RAMP.sea : RAMP.water;
      // depth bands by distance to the nearest land: foam, light shelf, darker shelf, deep
      let dl = 9;
      for (const r of edge ? SHORE_R : SHORE_FAR) {
        if (!wetAt(wx + r, wy) || !wetAt(wx - r, wy) || !wetAt(wx, wy + r) || !wetAt(wx, wy - r) || !wetAt(wx + r * 0.7, wy + r * 0.7) || !wetAt(wx - r * 0.7, wy - r * 0.7)) {
          dl = r;
          break;
        }
      }
      // deep water: flat bands in 2 tones, broken by the noise
      c = n > 0.55 ? R[2] : n > 0.3 ? R[3] : R[4];
      if (dl <= 0.07) c = (x + (y >> 1)) % 4 === 0 ? 0xc8ccc4 : 0xeae6dc; // foam line
      else if (dl <= 0.16) c = (hash2(x, y, 33) > 0.9 ? 0xeae6dc : 0xbccac8); // light shelf with foam flecks
      else if (dl <= 0.3) c = 0xa2b2b8; // darker shelf
      else if (dl <= 0.48) c = R[1];
      // horizontal 1 px streaks (the map sea's texture)
      if (dl > 0.16 && hash2(x >> 3, y, 11) > 0.88 && (x & 7) < 5) c = mix(c, 0xdce4e4, 0.35);
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
  }
  // the dotted dark coastline on the land side of every shore (the map's signature motif)
  if (edge && d.kind !== 'water' && d.kind !== 'sea' && d.kind !== 'ford') {
    const e = 0.06;
    if (wetAt(wx + e, wy) || wetAt(wx - e, wy) || wetAt(wx, wy + e) || wetAt(wx, wy - e)) c = (x + y) & 1 ? 0x6a5a5e : mix(c, 0x8a7468, 0.4);
    else if (d.kind === 'sand') {
      const e2 = 0.16;
      if (wetAt(wx + e2, wy) || wetAt(wx - e2, wy) || wetAt(wx, wy + e2) || wetAt(wx, wy - e2)) c = mix(c, 0xf4e6cc, 0.45); // wet, pale sand by the water
    }
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
export const TREE_GEOM = { w: 72, h: 88, footY: 76 };
export const BOULDER_GEOM = { w: 48, h: 36, footY: 28 };

/** Sage canopy ramps (light cap .. dark under-band, then the dotted rim), per variant. */
const CANOPY = [
  // 0 oak: warm sage
  [0xd8dc9a, 0xbcc67e, 0x9ca864, 0x7e8a54, 0x60664a, 0x423e36],
  // 1 pine / cypress: cooler, deeper sage
  [0xb4c48a, 0x92a670, 0x76885c, 0x5e6e4e, 0x484f42, 0x343632],
  // 2 olive: silvery grey-sage
  [0xd6d6b0, 0xb8bc98, 0x9aa080, 0x7c826c, 0x5e6256, 0x403e3a],
];
const BARK = [0x9a7a5a, 0x7a5a40, 0x5a402e, 0x3e2c22];

/**
 * A tree in the map's vocabulary re-projected to the battle view
 * (docs/ART_STYLE.md §7): a blobby canopy of 3-6 overlapping round clumps,
 * each lit from the upper left with a light cap and a dark under-band, a
 * dotted dark rim with broken light highlights on the lit side, a short trunk
 * and a flat translucent shadow cast to the lower right. Drawn flat in 2D
 * (no 3D model) so the clumps stay crisp at battle zoom.
 * Variants: 0 broad oak, 1 tall cypress, 2 small silvery olive.
 */
export function renderTree(variant: number): Pix {
  const { w: W, h: H, footY } = TREE_GEOM;
  const px = new Pix(W, H);
  const cx = Math.floor(W / 2);
  const rnd = (i: number) => hash2(variant * 31 + i, 7, 3);
  const C = CANOPY[variant] ?? CANOPY[0];
  // clumps: [x, y, r] in sprite pixels, back to front (front = drawn last)
  let clumps: [number, number, number][];
  let trunkTop: number;
  let trunkW: number;
  if (variant === 1) {
    trunkTop = footY - 14;
    trunkW = 3;
    clumps = [
      [cx, footY - 56, 6],
      [cx - 1, footY - 46, 8],
      [cx + 1, footY - 35, 9.5],
      [cx - 1, footY - 24, 10],
    ];
  } else if (variant === 2) {
    trunkTop = footY - 16;
    trunkW = 4;
    clumps = [
      [cx - 8, footY - 26, 8],
      [cx + 7, footY - 28, 8.5],
      [cx - 1, footY - 34, 9],
      [cx + 2, footY - 23, 7],
    ];
  } else {
    trunkTop = footY - 22;
    trunkW = 6;
    clumps = [
      [cx - 3, footY - 58, 12],
      [cx - 15, footY - 45, 12],
      [cx + 12, footY - 47, 13],
      [cx - 1, footY - 40, 14],
      [cx - 12, footY - 30, 10],
      [cx + 10, footY - 31, 11],
    ];
  }
  // jitter the clumps a little per variant seed so groves do not look stamped
  clumps = clumps.map(([x, y, r], i) => [x + Math.round((rnd(i) - 0.5) * 3), y + Math.round((rnd(i + 9) - 0.5) * 2), r]);

  // ---- shadow: a flat translucent iso blob to the lower right (SE)
  const sx = cx + 9;
  const sy = footY - 1;
  const srx = variant === 1 ? 13 : variant === 2 ? 15 : 20;
  const sry = srx * 0.45;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = ((x - sx) / srx) ** 2 + ((y - sy) / sry) ** 2;
      if (d <= 1) px.set(x, y, 0x3a2e1c, d < 0.6 ? 96 : 64);
    }

  // ---- trunk (with a root flare), lit on the left
  const tx0 = cx - Math.floor(trunkW / 2);
  for (let y = trunkTop; y <= footY; y++) {
    const flare = y >= footY - 1 ? 1 : 0;
    for (let x = tx0 - flare; x < tx0 + trunkW + flare; x++) {
      const u = (x - (tx0 - flare)) / (trunkW + flare * 2 - 1 || 1);
      let c = u < 0.3 ? BARK[1] : u > 0.7 ? BARK[3] : BARK[2];
      if (u < 0.3 && hash2(x, y, 41) > 0.7) c = BARK[0];
      if (hash2(x, y, 43) > 0.86) c = BARK[3];
      px.set(x, y, c);
    }
  }
  if (variant !== 1) {
    // two short branches into the crown
    px.line(cx - 1, trunkTop + 3, cx - 6, trunkTop - 4, BARK[2]);
    px.line(cx + 1, trunkTop + 2, cx + 6, trunkTop - 5, BARK[3]);
  }

  // ---- canopy: owner clump per pixel (the frontmost that covers it)
  const own = new Int8Array(W * H).fill(-1);
  for (let k = 0; k < clumps.length; k++) {
    const [x0, y0, r] = clumps[k];
    for (let y = Math.floor(y0 - r - 1); y <= y0 + r + 1; y++)
      for (let x = Math.floor(x0 - r - 1); x <= x0 + r + 1; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        // a slightly lumpy circle: the rim wobbles by a pixel
        const a = Math.atan2(y - y0, x - x0);
        const rr = r + Math.sin(a * 5 + k * 1.7) * 0.7 + (hash2(x, y, k + 50) - 0.5) * 0.6;
        if ((x - x0) ** 2 + (y - y0) ** 2 <= rr * rr) own[y * W + x] = k;
      }
  }
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : own[y * W + x]);
  // light from the upper left (and a little from the viewer)
  const L = [-0.55, -0.65, 0.52];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = at(x, y);
      if (k < 0) continue;
      const [x0, y0, r] = clumps[k];
      const nx = (x - x0) / r;
      const ny = (y - y0) / r;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      // leafy texture: shading jittered in 2x2 clusters, never a smooth gradient
      const leaf = (hash2(x >> 1, y >> 1, 60 + variant) - 0.5) * 0.34 + (hash2(x, y, 61) - 0.5) * 0.1;
      const lit = nx * L[0] + ny * L[1] + nz * L[2] + leaf;
      let i = lit > 0.88 ? 0 : lit > 0.58 ? 1 : lit > 0.22 ? 2 : lit > -0.12 ? 3 : 4;
      // dark under-band along the bottom of every clump
      if (ny > 0.6 && i < 4) i = Math.max(i, 3);
      if (ny > 0.78) i = 4;
      let c = C[i];
      // the silhouette: dotted dark rim, broken light highlights on the lit side
      const outL = at(x - 1, y) < 0;
      const outU = at(x, y - 1) < 0;
      const outR = at(x + 1, y) < 0;
      const outD = at(x, y + 1) < 0;
      if (outL || outU || outR || outD) {
        const litSide = (outL || outU) && !outD && ny < 0.3;
        if (litSide) c = (x + y) % 3 === 0 ? C[0] : (x + y) & 1 ? C[1] : C[2];
        else c = (x + y) & 1 ? C[5] : C[4];
      } else {
        // a clump in front of another: a dotted contour where it overlaps
        const behind = (kk: number) => kk >= 0 && kk < k;
        if (behind(at(x, y - 1)) || behind(at(x - 1, y)) || behind(at(x + 1, y))) {
          if (ny < -0.2 || nx < -0.3) c = (x + y) & 1 ? C[0] : C[1];
          else c = (x + y) & 1 ? C[4] : C[3];
        } else if (behind(at(x, y + 1)) && (x + y) & 1) c = C[5];
      }
      px.set(x, y, c);
    }
  // a few leaf flecks just outside the rim (broken edge)
  for (let n = 0; n < 26; n++) {
    const x = Math.floor(rnd(100 + n) * W);
    const y = Math.floor(rnd(200 + n) * (footY - 8));
    if (at(x, y) >= 0) continue;
    const near = at(x + 1, y) >= 0 || at(x - 1, y) >= 0 || at(x, y + 1) >= 0 || at(x, y - 1) >= 0;
    if (near) px.set(x, y, y < 40 ? C[1] : C[4]);
  }
  return px;
}

/** A boulder cluster, lit like everything else. */
export function renderBoulder(variant: number): Pix {
  const sc = new Scene();
  const stone: Material = { ramp: [0xbcaaac, 0x9e8c90, 0x827076, 0x66565e, 0x4c3e46], grit: 0.5, contrast: 1.1 };
  const moss: Material = { ramp: ramp(0xa8b46a), grit: 0.5 };
  const k = variant % 2;
  sc.ellipsoid([0, 0, 0.35], [0.75, 0.2, 0], [-0.15, 0.6, 0], [0, 0, 0.55], stone);
  sc.group();
  sc.ellipsoid([k ? 0.6 : -0.5, k ? -0.4 : 0.45, 0.2], [0.42, 0, 0], [0, 0.38, 0], [0, 0, 0.32], stone);
  sc.group();
  sc.ellipsoid([0.1, 0.05, 0.75], [0.3, 0, 0], [0, 0.3, 0], [0, 0, 0.12], moss);
  return sc.render(BOULDER_GEOM.w, BOULDER_GEOM.h, BOULDER_GEOM.w / 2, BOULDER_GEOM.footY);
}

/** A short light streak for water shimmer. */
export function renderGlint(): Pix {
  const px = new Pix(5, 1);
  px.set(0, 0, 0xc8d4d8);
  px.set(1, 0, 0xf4f2ea);
  px.set(2, 0, 0xf4f2ea);
  px.set(3, 0, 0xc8d4d8);
  return px;
}

/** A twinkling sparkle: a bright pixel with a dim cross. */
export function renderSparkle(): Pix {
  const px = new Pix(3, 3);
  px.set(1, 0, 0xc8d4d8, 160);
  px.set(0, 1, 0xc8d4d8, 160);
  px.set(2, 1, 0xc8d4d8, 160);
  px.set(1, 2, 0xc8d4d8, 160);
  px.set(1, 1, 0xf8f6ee);
  return px;
}
