/**
 * Procedural art of the war-table hex map (docs/DESIGN_V2.md "Hex map: a map
 * on a war table"): painted terrain tiles with thickness, miniature props
 * (trees, peaks, farms, mines, walled towns, forts, capitals, ruins and
 * shrines, beast lairs) and painted figures (armies, neutral defenders) built
 * with the 3D primitive renderer (src/art/model3d.ts), the parchment of the
 * unexplored map, the wooden table, clouds, smoke and water glints. Pure:
 * every function returns a Pix; the scene turns them into textures.
 *
 * Board geometry (tile sizes, heights) comes from src/online/board.ts. The
 * palette follows the battlefield: muted grass, olive scrub, dusty soil,
 * weathered stone, slate sea.
 */
import { mix } from './palette';
import { BAYER4, Pix, hash2, valueNoise } from './pixels';
import { Scene, ramp, type Material, type V3 } from './model3d';
import { BRONZE, CLOTH, DARK_WOOD, IRON, IVORY, LEATHER, LINEN, SKIN, WOOD, BEAST } from './materials';
import { ELEV, TILE_H, TILE_W, inTopFace } from '../online/board';
import type { HexType } from '../online/hex';

export interface Sprite {
  pix: Pix;
  /** Anchor inside the pix: the tile's top-face centre, or a prop's foot point. */
  ax: number;
  ay: number;
}

// ------------------------------------------------------------------ colours

const R = {
  grass: [0xa0a26a, 0x8e9160, 0x7f8655, 0x71794b, 0x636c42, 0x555d39],
  meadow: [0x9aa466, 0x8a985c, 0x7a8a52, 0x6c7c48],
  field: [0xd2b878, 0xc4a868, 0xb4985c, 0xa08652, 0x8c7448],
  furrow: [0x8a7650, 0x7a6846, 0x6a5a3e],
  forest: [0x66733f, 0x5a6638, 0x4e5a32, 0x434e2c, 0x384226],
  hills: [0xa8a26a, 0x9a9662, 0x8a8758, 0x7b794f, 0x6c6c46, 0x5e5f3e],
  rock: [0xb2a690, 0xa09480, 0x8e8270, 0x7c7262, 0x6a6054, 0x585044],
  dust: [0xc4b088, 0xb8a47c, 0xa8946c, 0x988660, 0x887856],
  ruin: [0xaaa27a, 0x9c946e, 0x8e8662, 0x807858, 0x726a4e],
  sea: [0x5a8296, 0x4f7486, 0x476a7a, 0x3e5e6e, 0x355262, 0x2e4858],
  soil: [0x8a6a48, 0x7a5e40, 0x6a5038, 0x5a4430, 0x4a3828, 0x3a2c20],
  wet: [0x4a6676, 0x3e5868, 0x344c5a, 0x2c404c],
  parch: [0xd6c29c, 0xccb690, 0xc0a984, 0xb29a76, 0xa28a68],
  wood: [0x7a5436, 0x6c4a30, 0x5e402a, 0x503624, 0x422c1e, 0x34221a],
  snow: [0xf2f0ea, 0xe0e0dc, 0xc8ccd0],
};

const pickRamp = (ramp: readonly number[], v: number) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(v * ramp.length)))];

// ------------------------------------------------------------------ tiles

/** Top-face colour of one pixel of a terrain tile. dx, dy: pixel centre relative to the face centre. */
function topColor(type: HexType, dx: number, dy: number, px: number, py: number, seed: number): number {
  const b = BAYER4[py & 3][px & 3] - 0.5;
  const n = valueNoise(px + seed * 37, py + seed * 53, 4, seed) * 0.55 + valueNoise(px, py, 9, seed + 11) * 0.45;
  // light from the upper left; a painted, slightly brushed board
  const light = (dx * 0.6 + dy * 1.1) / 22;
  const v = (k: number) => Math.max(0, Math.min(0.999, k));
  switch (type) {
    case 'water': {
      const stroke = valueNoise(px * 0.5, py * 2, 3, seed + 5);
      let c = pickRamp(R.sea, v(0.32 + (n - 0.5) * 0.45 + light * 0.6 + b * 0.25));
      if (stroke > 0.72 && (px + py * 3) % 7 < 4) c = mix(c, 0xb8d0d8, 0.28);
      return c;
    }
    case 'farmland': {
      // strips of grain, fallow and green crops, slightly slanted
      const band = Math.floor((dy * 1.6 + dx * 0.35 + 20 + seed * 3) / 3.2);
      const kind = Math.floor(hash2(band, seed, 41) * 3);
      if ((Math.round(dy * 1.6 + dx * 0.35 + seed) & 1) === 0 && kind !== 1) return pickRamp(R.furrow, v(0.4 + light * 0.4 + b * 0.3));
      const rmp = kind === 0 ? R.field : kind === 1 ? R.meadow : R.grass;
      return pickRamp(rmp, v(0.3 + (n - 0.5) * 0.5 + light * 0.5 + b * 0.3));
    }
    case 'forest':
      return pickRamp(R.forest, v(0.45 + (n - 0.5) * 0.7 + light * 0.5 + b * 0.35));
    case 'hills':
    case 'mine': {
      // a rounded dome: strongly lit upper left, shaded lower right
      const dome = (dx * 0.9 + dy * 1.6) / 18;
      const rmp = type === 'mine' ? R.rock : R.hills;
      let c = pickRamp(rmp, v(0.35 + dome * 0.55 + (n - 0.5) * 0.4 + b * 0.3));
      // contour lines like a painted relief
      const ring = Math.sqrt((dx / 13) ** 2 + (dy / 9) ** 2);
      if (Math.abs(((ring * 3.2 + n * 0.3) % 1) - 0.5) < 0.07 && ring > 0.25) c = mix(c, 0x4a4a30, 0.25);
      return c;
    }
    case 'mountain':
      return pickRamp(R.rock, v(0.4 + (dx * 0.9 + dy * 1.5) / 26 + (n - 0.5) * 0.6 + b * 0.35));
    case 'town': {
      // dusty ground with paving flecks
      let c = pickRamp(R.dust, v(0.35 + (n - 0.5) * 0.5 + light * 0.5 + b * 0.3));
      if (hash2(px >> 1, py, seed + 9) > 0.86) c = mix(c, 0xe0d2b0, 0.35);
      return c;
    }
    case 'ruins':
      return pickRamp(R.ruin, v(0.4 + (n - 0.5) * 0.6 + light * 0.5 + b * 0.35));
    default: {
      let c = pickRamp(R.grass, v(0.35 + (n - 0.5) * 0.6 + light * 0.5 + b * 0.35));
      // flowers and tufts
      const h = hash2(px, py, seed + 77);
      if (h > 0.985) c = 0xd8c88a;
      else if (h > 0.96) c = mix(c, 0x4a5a30, 0.5);
      return c;
    }
  }
}

/**
 * One raised terrain tile: the painted top face (TILE_W x TILE_H, with a dark
 * seam so neighbouring tiles read as separate pieces) and its side faces
 * (soil strata, ELEV[type] pixels thick). Anchor: the top face's centre.
 */
export function renderTile(type: HexType, variant: number): Sprite {
  const elev = ELEV[type];
  const w = TILE_W;
  const h = TILE_H + elev + 1;
  const px = new Pix(w, h);
  const cx = w / 2;
  const cy = TILE_H / 2;
  const seed = variant * 13 + type.length * 7;
  const side = type === 'water' ? R.wet : R.soil;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const b = BAYER4[y & 3][x & 3] - 0.5;
      if (inTopFace(dx, dy)) {
        const inner = inTopFace(dx * 1.075, dy * 1.1);
        let c = topColor(type, dx, dy, x, y, seed);
        if (!inner) c = mix(c, 0x2a2016, dy < 0 || dx < -12 ? 0.32 : 0.5); // seam / bevel
        else if (!inTopFace(dx * 1.16, dy * 1.2) && (dy < -2 || dx < -9)) c = mix(c, 0xfff0d0, 0.12); // lit bevel
        px.set(x, y, c);
        continue;
      }
      if (Math.abs(dx) > w / 2 || dy < 0) continue;
      const lower = TILE_H / 2 - (Math.abs(dx) * (TILE_H / 4)) / (TILE_W / 2);
      const k = dy - lower; // depth below the top edge
      if (k < 0 || k > elev) continue;
      const left = dx < 0;
      let t = (left ? 0.3 : 0.62) + (k / Math.max(1, elev)) * 0.25 + b * 0.25;
      // strata bands
      const band = valueNoise(x * 0.4, k * 1.3 + variant * 3, 3, seed + 21);
      t += (band - 0.5) * 0.25;
      let c = pickRamp(side, Math.max(0, Math.min(0.999, t)));
      if (k < 1.2 && type !== 'water') c = mix(topColor(type, dx, dy - k, x, y, seed), 0x2a2016, 0.35); // grassy lip
      if (k >= elev - 0.8) c = mix(c, 0x1d140f, 0.5);
      if (Math.abs(dx) < 0.6) c = mix(c, 0x1d140f, 0.25); // the front edge
      px.set(x, y, c);
    }
  }
  return { pix: px, ax: cx, ay: cy };
}

/** A flat parchment hex of the unexplored map (tiles seamlessly; faint ink grid, stains). */
export function renderFogTile(variant: number): Sprite {
  const w = TILE_W;
  const h = TILE_H;
  const px = new Pix(w, h);
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (!inTopFace(dx, dy)) continue;
      const b = BAYER4[y & 3][x & 3] - 0.5;
      const n = valueNoise(x + variant * 31, y + variant * 17, 6, variant + 3);
      let c = pickRamp(R.parch, Math.max(0, Math.min(0.999, 0.25 + (n - 0.5) * 0.6 + b * 0.25)));
      const stain = valueNoise(x + variant * 50, y, 11, 99 + variant);
      if (stain > 0.78) c = mix(c, 0xa88a60, (stain - 0.78) * 1.2);
      // ink grid: the hex outline, sketchy
      if (!inTopFace(dx * 1.09, dy * 1.12) && hash2(x, y, variant + 5) > 0.25) c = mix(c, 0x6a5038, 0.4);
      px.set(x, y, c);
    }
  }
  return { pix: px, ax: cx, ay: cy };
}

export type Doodle = 'hills' | 'trees' | 'waves' | 'peak';

/** Ink sketches on the parchment of the unexplored map (decoration only: they say nothing about the real land). */
export function renderDoodle(kind: Doodle): Sprite {
  const px = new Pix(18, 12);
  const ink = 0x5a3e28;
  const dot = (x: number, y: number) => px.set(x, y, ink, 200);
  switch (kind) {
    case 'hills':
      for (const ox of [1, 8]) for (let i = 0; i < 7; i++) dot(ox + i, 8 - Math.round(Math.sin((i / 6) * Math.PI) * 4));
      break;
    case 'trees':
      for (const [ox, oy] of [[2, 3], [8, 1], [13, 4]]) {
        for (let a = 0; a < 10; a++) dot(ox + Math.round(Math.cos(a * 0.63) * 2), oy + 2 + Math.round(Math.sin(a * 0.63) * 2));
        dot(ox, oy + 5);
        dot(ox, oy + 6);
      }
      break;
    case 'waves':
      for (const oy of [3, 8]) for (let i = 0; i < 14; i++) dot(2 + i, oy + Math.round(Math.sin(i * 0.9) * 1.2));
      break;
    case 'peak':
      for (let i = 0; i < 7; i++) {
        dot(3 + i, 10 - i);
        dot(15 - i, 10 - i);
      }
      for (let i = 0; i < 4; i++) dot(9 + i, 6 + i);
      break;
  }
  return { pix: px, ax: 9, ay: 6 };
}

/** A hex top as a solid colour (territory tint, selection), with the given alpha baked in. */
export function renderHexFill(color: number, alpha: number, inset = 1.2): Sprite {
  const px = new Pix(TILE_W, TILE_H);
  const k = 1 + inset / 10;
  for (let y = 0; y < TILE_H; y++)
    for (let x = 0; x < TILE_W; x++) {
      const dx = x + 0.5 - TILE_W / 2;
      const dy = y + 0.5 - TILE_H / 2;
      if (inTopFace(dx * k, dy * k)) px.set(x, y, color, Math.round(alpha * 255));
    }
  return { pix: px, ax: TILE_W / 2, ay: TILE_H / 2 };
}

/** Soft drop shadow of a tile on the table (dithered). */
export function renderTileShadow(): Sprite {
  const px = new Pix(TILE_W + 6, TILE_H + 6);
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      const dx = x + 0.5 - px.w / 2;
      const dy = y + 0.5 - px.h / 2;
      const inner = inTopFace(dx * 1.05, dy * 1.05);
      const outer = inTopFace(dx * 0.9, dy * 0.85);
      if (inner) px.set(x, y, 0x140c08, 120);
      else if (outer && BAYER4[y & 3][x & 3] > 0.45) px.set(x, y, 0x140c08, 80);
    }
  return { pix: px, ax: px.w / 2, ay: px.h / 2 };
}

/** Tileable wooden table planks (dark oak, grain, seams, a few nails). */
export function renderTableWood(w = 128, h = 96): Pix {
  const px = new Pix(w, h);
  const plank = 24;
  for (let y = 0; y < h; y++) {
    const pi = Math.floor(y / plank);
    const py = y % plank;
    for (let x = 0; x < w; x++) {
      const b = BAYER4[y & 3][x & 3] - 0.5;
      // grain: stretched noise along x, periodic in w
      const g = valueNoise((x * 64) / w, py * 1.6 + pi * 40, 4, 7 + pi) * 0.5 + valueNoise((x * 16) / w, py * 0.5 + pi * 9, 2, 3 + pi) * 0.5;
      const tone = 0.35 + (hash2(pi, 1, 5) - 0.5) * 0.3 + (g - 0.5) * 0.7 + b * 0.25;
      let c = pickRamp(R.wood, Math.max(0, Math.min(0.999, tone)));
      if (py === 0) c = 0x24170f;
      else if (py === 1) c = mix(c, 0x9a7050, 0.25);
      else if (py === plank - 1) c = mix(c, 0x24170f, 0.45);
      // plank ends staggered per row
      const end = Math.floor(hash2(pi, 2, 9) * w);
      if (x === end) c = 0x2a1b12;
      if ((x === (end + 6) % w || x === (end - 6 + w) % w) && (py === 4 || py === plank - 5)) c = 0x1a120c; // nails
      px.set(x, y, c);
    }
  }
  return px;
}

// ------------------------------------------------------------------ 3D props

const mat = (base: number, extra: Partial<Material> = {}): Material => ({ ramp: ramp(base), ...extra });
const M = {
  leaf: mat(0x5c7a3a, { grit: 0.5, contrast: 0.9 }),
  leaf2: mat(0x6e8040, { grit: 0.5, contrast: 0.9 }),
  cypress: mat(0x3e5634, { grit: 0.4, contrast: 0.95 }),
  rock: mat(0x8e8676, { grit: 0.6, contrast: 1.05 }),
  darkRock: mat(0x6a6256, { grit: 0.6 }),
  snow: { ramp: [0xf6f4ee, 0xe4e4e0, 0xccd0d4, 0xa8aeb6, 0x8a909a] } as Material,
  wall: mat(0xcfc2a0, { grit: 0.35, contrast: 0.9 }),
  stone: mat(0xa89c80, { grit: 0.5 }),
  roof: mat(0xa04a30, { grit: 0.3 }),
  roofDark: mat(0x7a3a28, { grit: 0.3 }),
  marble: mat(0xc4bca8, { grit: 0.35, contrast: 0.95 }),
  hay: mat(0xc8a858, { grit: 0.5 }),
  earth: mat(0x7a6448, { grit: 0.6 }),
  dark: { ramp: [0x2a221c, 0x221a16, 0x1a1410, 0x140f0c, 0x0e0a08] } as Material,
  base: mat(0x4e5a34, { grit: 0.3, contrast: 0.8 }),
  baseRim: mat(0x3a2c20, { contrast: 0.6 }),
  gold: { ramp: [0xf4dc8a, 0xe0b860, 0xb88a3a, 0x8a6428, 0x5e421a], metal: true } as Material,
  hydra: mat(0x4a6a4a, { grit: 0.5 }),
  hydraBelly: mat(0x8a8a5a, { grit: 0.4 }),
  red: mat(0x8a2a20, { grit: 0.3 }),
  robe: mat(0x3a3036, { grit: 0.4 }),
  pole: mat(0x6a4a2c),
};

/** Ground point for screen offsets (sx, sy) from the prop's origin (z = 0). */
const G = (sx: number, sy: number, z = 0): V3 => [sx / 32 + sy / 16, -sx / 32 + sy / 16, z];

/** Renders a scene into a generous canvas and crops it to its pixels; anchor = the world origin. */
function shoot(build: (s: Scene) => void, size = 64, outline = true, k = 1): Sprite {
  const s = new Scene();
  build(s);
  if (k !== 1) s.scale(k);
  const ox = size / 2;
  const oy = Math.round(size * 0.72);
  const full = s.render(size, size, ox, oy, { outline });
  return crop(full, ox, oy);
}

export function crop(full: Pix, ox: number, oy: number): Sprite {
  let x0 = full.w;
  let y0 = full.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < full.h; y++)
    for (let x = 0; x < full.w; x++)
      if (full.alpha(x, y) > 0) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) return { pix: new Pix(1, 1), ax: 0, ay: 0 };
  const out = new Pix(x1 - x0 + 1, y1 - y0 + 1);
  out.blit(full, 0, 0, false, x0, y0, out.w, out.h);
  return { pix: out, ax: ox - x0, ay: oy - y0 };
}

function tree(s: Scene, at: V3, k: number, variant: number): void {
  s.group();
  s.limb(at, [at[0], at[1], at[2] + 0.16 * k], 0.026 * k, 0.02 * k, DARK_WOOD);
  const crown = variant % 2 ? M.leaf2 : M.leaf;
  const c: V3 = [at[0], at[1], at[2] + 0.27 * k];
  s.group();
  s.sphere(c, 0.12 * k, crown);
  s.sphere([c[0] - 0.06 * k, c[1] + 0.05 * k, c[2] - 0.03 * k], 0.09 * k, crown);
  s.sphere([c[0] + 0.05 * k, c[1] - 0.06 * k, c[2] - 0.02 * k], 0.09 * k, crown);
  s.sphere([c[0] + 0.01 * k, c[1] + 0.01 * k, c[2] + 0.08 * k], 0.08 * k, crown);
}

function cypress(s: Scene, at: V3, k: number): void {
  s.group();
  s.limb(at, [at[0], at[1], at[2] + 0.06 * k], 0.02 * k, 0.018 * k, DARK_WOOD);
  s.group();
  s.ellipsoid([at[0], at[1], at[2] + 0.24 * k], [0.065 * k, 0, 0], [0, 0.065 * k, 0], [0, 0, 0.2 * k], M.cypress);
}

function rock(s: Scene, at: V3, k: number, m = M.rock): void {
  s.group();
  s.ellipsoid([at[0], at[1], at[2] + 0.03 * k], [0.09 * k, 0.02 * k, 0], [-0.02 * k, 0.06 * k, 0], [0, 0, 0.06 * k], m);
}

function house(s: Scene, at: V3, k: number, roof = M.roof, turn = false): void {
  s.group();
  const a: V3 = turn ? [0, 0.1 * k, 0] : [0.1 * k, 0, 0];
  const b: V3 = turn ? [0.07 * k, 0, 0] : [0, 0.07 * k, 0];
  s.box([at[0], at[1], at[2] + 0.06 * k], a, b, [0, 0, 0.06 * k], M.wall);
  s.group();
  // pitched roof: two slanted slabs
  const h = 0.05 * k;
  const ridge = turn ? [0, 1, 0] : [1, 0, 0];
  const across = turn ? [1, 0, 0] : [0, 1, 0];
  for (const sg of [-1, 1]) {
    const c: V3 = [at[0] + across[0] * sg * 0.035 * k, at[1] + across[1] * sg * 0.035 * k, at[2] + 0.12 * k + 0.02 * k];
    const ax: V3 = [ridge[0] * 0.11 * k, ridge[1] * 0.11 * k, 0];
    const ay: V3 = [across[0] * 0.045 * k, across[1] * 0.045 * k, -sg * 0.03 * k];
    const az: V3 = [across[0] * sg * 0.01 * k, across[1] * sg * 0.01 * k, 0.012 * k];
    s.box(c, ax, ay, az, roof);
  }
  void h;
}

function wallRing(s: Scene, rx: number, ry: number, hgt: number, towers: number, gate = true): void {
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    if (gate && Math.abs(am - Math.PI / 2) < 0.18) continue; // gate facing the viewer
    const p0 = G(Math.cos(a0) * rx, Math.sin(a0) * ry);
    const p1 = G(Math.cos(a1) * rx, Math.sin(a1) * ry);
    const c: V3 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, hgt / 2];
    const d: V3 = [(p1[0] - p0[0]) / 2, (p1[1] - p0[1]) / 2, 0];
    const l = Math.hypot(d[0], d[1]);
    const nrm: V3 = [(-d[1] / l) * 0.012, (d[0] / l) * 0.012, 0];
    s.group();
    s.box(c, [d[0] * 1.08, d[1] * 1.08, 0], nrm, [0, 0, hgt / 2], M.stone);
  }
  for (let i = 0; i < towers; i++) {
    const a = (i / towers) * Math.PI * 2 + Math.PI / towers;
    const p = G(Math.cos(a) * rx, Math.sin(a) * ry);
    s.group();
    s.box([p[0], p[1], hgt * 0.75], [0.03, 0, 0], [0, 0.03, 0], [0, 0, hgt * 0.75], M.stone);
    s.box([p[0], p[1], hgt * 1.55], [0.036, 0, 0], [0, 0.036, 0], [0, 0, 0.012], M.stone);
  }
}

function temple(s: Scene, at: V3, k: number): void {
  s.group();
  s.box([at[0], at[1], at[2] + 0.015 * k], [0.13 * k, 0, 0], [0, 0.09 * k, 0], [0, 0, 0.015 * k], M.marble);
  for (const cx of [-0.1, -0.033, 0.033, 0.1])
    for (const cy of [-0.065, 0.065]) {
      s.group();
      s.limb([at[0] + cx * k, at[1] + cy * k, at[2] + 0.03 * k], [at[0] + cx * k, at[1] + cy * k, at[2] + 0.13 * k], 0.012 * k, 0.011 * k, M.marble);
    }
  s.group();
  s.box([at[0], at[1], at[2] + 0.145 * k], [0.135 * k, 0, 0], [0, 0.095 * k, 0], [0, 0, 0.015 * k], M.marble);
  s.box([at[0], at[1], at[2] + 0.175 * k], [0.13 * k, 0, 0], [0, 0.06 * k, 0], [0, 0, 0.018 * k], M.roofDark);
}

function column(s: Scene, at: V3, h: number, broken: boolean): void {
  s.group();
  s.limb(at, [at[0], at[1], at[2] + h], 0.018, 0.016, M.marble);
  if (!broken) s.box([at[0], at[1], at[2] + h + 0.008], [0.026, 0, 0], [0, 0.026, 0], [0, 0, 0.008], M.marble);
}

export type PropKind =
  | 'tree'
  | 'cypress'
  | 'rock'
  | 'peak'
  | 'mound'
  | 'house'
  | 'farm'
  | 'hay'
  | 'mine'
  | 'town'
  | 'fort'
  | 'capital'
  | 'ruins'
  | 'shrine'
  | 'lair'
  | 'camp';

/** A miniature prop (anchor = its foot point on the tile). */
export function renderProp(kind: PropKind, variant = 0): Sprite {
  // Models are posed in metres at ~16-22 px per metre; `k` scales a model up to its size on a 28 x 20 tile.
  switch (kind) {
    case 'tree':
      return shoot((s) => tree(s, [0, 0, 0], 1, variant), 40, true, 1.15 + (variant % 3) * 0.12);
    case 'cypress':
      return shoot((s) => cypress(s, [0, 0, 0], 1), 40, true, 1.1 + (variant % 3) * 0.12);
    case 'rock':
      return shoot((s) => {
        rock(s, [0, 0, 0], 1, variant % 2 ? M.darkRock : M.rock);
        if (variant % 3 === 0) rock(s, G(3, 1), 0.6);
      }, 32, true, 2);
    case 'peak':
      return shoot((s) => {
        const snowLine = 0.36 + (variant % 2) * 0.06;
        const sh = (_l: V3, w: V3) => (w[2] > snowLine + hash2(Math.round(w[0] * 60), Math.round(w[1] * 60), 3) * 0.08 ? { ramp: M.snow.ramp } : null);
        s.group();
        s.limb([0, 0, 0], [0.02, -0.02, 0.62], 0.36, 0.035, M.rock, sh);
        s.group();
        const o = variant % 2 ? G(-8, 2) : G(8, 1);
        s.limb(o, [o[0] + 0.02, o[1], 0.4], 0.22, 0.03, M.darkRock, sh);
        s.group();
        rock(s, G(-10, 4), 1.4, M.darkRock);
        rock(s, G(9, 5), 1.1, M.rock);
      }, 64);
    case 'mound':
      return shoot((s) => {
        s.group();
        s.ellipsoid([0, 0, 0], [0.16, 0, 0], [0, 0.12, 0], [0, 0, 0.1], mat(0x8e8a58, { grit: 0.6 }));
        s.group();
        s.ellipsoid(G(4, 1), [0.1, 0, 0], [0, 0.08, 0], [0, 0, 0.07], mat(0x7e7c50, { grit: 0.6 }));
        if (variant % 2) tree(s, G(-2, -2, 0.08), 0.45, 1);
        else rock(s, G(-4, 2), 0.5);
      }, 48, true, 1.3);
    case 'house':
      return shoot((s) => house(s, [0, 0, 0], 1, variant % 2 ? M.roof : M.roofDark, variant % 3 === 1), 40, true, 1.8);
    case 'farm':
      return shoot((s) => {
        house(s, [0, 0, 0], 1, M.roofDark, variant % 2 === 1);
        s.group();
        s.sphere(G(5, 2, 0.04), 0.045, M.hay);
        s.group();
        s.sphere(G(7, 0, 0.035), 0.035, M.hay);
      }, 48, true, 1.6);
    case 'hay':
      return shoot((s) => s.sphere([0, 0, 0.04], 0.045, M.hay), 16, true, 1.6);
    case 'mine':
      return shoot((s) => {
        s.group();
        s.ellipsoid([-0.04, -0.04, 0.0], [0.17, 0, 0], [0, 0.13, 0], [0, 0, 0.13], M.rock);
        s.group();
        // dark shaft mouth with a timber frame, facing the viewer
        const m: V3 = [0.08, 0.05, 0.05];
        s.box(m, [0.012, 0.012, 0], [0.035, -0.035, 0], [0, 0, 0.045], M.dark);
        s.line([m[0] + 0.02, m[1] - 0.04, 0], [m[0] + 0.02, m[1] - 0.04, 0.1], WOOD, 1);
        s.line([m[0] + 0.02, m[1] + 0.05, 0], [m[0] + 0.02, m[1] + 0.05, 0.1], WOOD, 1);
        s.line([m[0] + 0.02, m[1] - 0.05, 0.1], [m[0] + 0.02, m[1] + 0.06, 0.1], WOOD, 1);
        s.group();
        s.sphere(G(-6, 3, 0.01), 0.05, M.earth);
        s.group();
        s.box(G(6, 4, 0.02), [0.03, 0, 0], [0, 0.02, 0], [0, 0, 0.018], WOOD);
      }, 64, true, 1.7);
    case 'town':
      return shoot((s) => {
        wallRing(s, 12, 7.5, 0.07, 4);
        const spots: [number, number][] = [[-5, -2], [3, -3], [-1, 1], [6, 1], [-6, 3]];
        spots.forEach(([x, y], i) => house(s, G(x, y), 1.15, i % 2 ? M.roof : M.roofDark, (i + variant) % 2 === 0));
      }, 64);
    case 'capital':
      return shoot((s) => {
        wallRing(s, 13, 8.5, 0.1, 6);
        const spots: [number, number][] = [[-8, -1], [8, -1], [-7, 3], [7, 3], [-3, -5], [4, -5]];
        spots.forEach(([x, y], i) => house(s, G(x, y), 1.05, i % 2 ? M.roof : M.roofDark, i % 2 === 0));
        temple(s, G(0, 0), 1.25);
      }, 72);
    case 'fort':
      return shoot((s) => {
        s.group();
        s.box([0, 0, 0.08], [0.11, 0, 0], [0, 0.11, 0], [0, 0, 0.08], M.stone);
        for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          s.group();
          s.box([x * 0.11, y * 0.11, 0.12], [0.035, 0, 0], [0, 0.035, 0], [0, 0, 0.12], M.stone);
          s.box([x * 0.11, y * 0.11, 0.25], [0.042, 0, 0], [0, 0.042, 0], [0, 0, 0.012], M.stone);
        }
        s.group();
        s.box([0, 0, 0.17], [0.05, 0, 0], [0, 0.05, 0], [0, 0, 0.012], M.roofDark);
        s.line([0, 0, 0.17], [0, 0, 0.33], M.pole);
      }, 64, true, 1.6);
    case 'ruins':
      return shoot((s) => {
        s.group();
        s.box([0, 0, 0.012], [0.12, 0, 0], [0, 0.07, 0], [0, 0, 0.012], M.marble);
        column(s, [-0.09, -0.05, 0.02], 0.14, false);
        column(s, [-0.03, -0.05, 0.02], 0.09 + (variant % 2) * 0.05, true);
        column(s, [0.09, -0.05, 0.02], 0.05, true);
        column(s, [0.09, 0.05, 0.02], 0.12, variant % 2 === 0);
        s.group();
        s.limb([0.0, 0.07, 0.02], [0.08, 0.12, 0.02], 0.016, 0.016, M.marble);
      }, 56, true, 1.9);
    case 'shrine':
      return shoot((s) => {
        s.group();
        s.ellipsoid([0, 0, 0.01], [0.1, 0, 0], [0, 0.1, 0], [0, 0, 0.012], M.marble);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          column(s, [Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0.02], 0.12, i === 4);
        }
        s.group();
        s.ellipsoid([0, 0, 0.15], [0.085, 0, 0], [0, 0.085, 0], [0, 0, 0.03], M.roofDark);
        s.group();
        s.limb([0, 0, 0.02], [0, 0, 0.07], 0.02, 0.016, M.gold);
      }, 56, true, 1.9);
    case 'lair':
      return shoot((s) => {
        s.group();
        s.ellipsoid([-0.03, -0.05, 0.0], [0.16, 0, 0], [0, 0.13, 0], [0, 0, 0.13], M.darkRock);
        s.group();
        s.ellipsoid([0.07, 0.04, 0.04], [0.012, 0.012, 0], [0.035, -0.035, 0], [0, 0, 0.045], M.dark);
        for (let i = 0; i < 3; i++) s.line(G(2 + i * 2, 4 + (i % 2), 0.005), G(4 + i * 2, 5, 0.005), IVORY);
        s.group();
        s.sphere(G(-5, 3, 0.015), 0.018, IVORY);
      }, 64, true, 1.8);
    case 'camp':
      return shoot((s) => {
        s.group();
        // a tent: two slanted canvas slabs
        for (const sg of [-1, 1]) s.box([0, sg * 0.04, 0.05], [0.08, 0, 0], [0, 0.04, -sg * 0.05], [0, sg * 0.006, 0.006], LINEN);
        s.line([0.09, 0, 0], [0.09, 0, 0.22], M.pole);
      }, 48, true, 1.6);
  }
}

// ------------------------------------------------------------------ figures

interface FigLook {
  body: Material;
  legs?: Material;
  skin?: Material;
  helm?: Material;
  /** Helmet crest colour. */
  crest?: Material;
  /** Round shield facing the viewer (rim colour = the material's dark tone). */
  shield?: Material;
  spear?: boolean;
  bow?: boolean;
  fork?: boolean;
  cap?: Material;
  /** Wide brim (a straw hat). */
  brim?: boolean;
  hood?: Material;
  robe?: boolean;
  sling?: boolean;
}

// screen axes as world vectors (the model camera, src/art/model3d.ts)
const SCR_R: V3 = [Math.SQRT1_2, -Math.SQRT1_2, 0];
const SCR_U: V3 = [-0.3536, -0.3536, 0.866];
const SCR_C: V3 = [0.6124, 0.6124, 0.5];

/** A painted miniature soldier (~0.4 m model, ~11 px once scaled), facing the viewer. */
function figure(s: Scene, at: V3, look: FigLook, k = 1): void {
  const [x, y, z] = at;
  const skin = look.skin ?? SKIN[1];
  const P = (dx: number, dy: number, dz: number): V3 => [x + dx * k, y + dy * k, z + dz * k];
  s.group();
  if (look.robe) s.ellipsoid(P(0, 0, 0.1), [0.05 * k, 0, 0], [0, 0.05 * k, 0], [0, 0, 0.11 * k], look.body);
  else {
    const legs = look.legs ?? skin;
    s.limb(P(-0.017, 0.017, 0), P(-0.012, 0.012, 0.1), 0.017 * k, 0.019 * k, legs);
    s.limb(P(0.017, -0.017, 0), P(0.012, -0.012, 0.1), 0.017 * k, 0.019 * k, legs);
    s.ellipsoid(P(0, 0, 0.155), [0.045 * k, 0, 0], [0, 0.045 * k, 0], [0, 0, 0.065 * k], look.body);
  }
  s.group();
  s.sphere(P(0, 0, 0.245), 0.032 * k, skin);
  if (look.hood) s.ellipsoid(P(-0.004, -0.004, 0.25), [0.038 * k, 0, 0], [0, 0.038 * k, 0], [0, 0, 0.036 * k], look.hood);
  if (look.helm) {
    s.ellipsoid(P(-0.004, -0.004, 0.26), [0.035 * k, 0, 0], [0, 0.035 * k, 0], [0, 0, 0.03 * k], look.helm);
    if (look.crest) {
      s.group();
      s.limb(P(-0.03, 0.03, 0.29), P(0.02, -0.02, 0.3), 0.012 * k, 0.012 * k, look.crest);
    }
  }
  if (look.cap) {
    s.ellipsoid(P(0, 0, 0.268), [0.034 * k, 0, 0], [0, 0.034 * k, 0], [0, 0, 0.02 * k], look.cap);
    if (look.brim) s.ellipsoid(P(0, 0, 0.262), [0.055 * k, 0, 0], [0, 0.055 * k, 0], [0, 0, 0.007 * k], look.cap);
  }
  if (look.spear) s.line(P(-0.05, 0.05, 0.04), P(-0.05, 0.05, 0.42), WOOD);
  if (look.fork) {
    s.line(P(-0.05, 0.05, 0.04), P(-0.05, 0.05, 0.36), WOOD);
    s.line(P(-0.065, 0.065, 0.33), P(-0.065, 0.065, 0.39), IRON);
    s.line(P(-0.035, 0.035, 0.33), P(-0.035, 0.035, 0.39), IRON);
  }
  if (look.bow) s.line(P(0.05, -0.06, 0.08), P(0.06, -0.07, 0.34), DARK_WOOD);
  if (look.sling) s.line(P(0.04, -0.05, 0.22), P(0.08, -0.1, 0.33), LEATHER);
  if (look.shield) {
    s.group();
    const r = 0.068 * k;
    const c = add3(P(0, 0, 0.15), [SCR_C[0] * 0.05 * k, SCR_C[1] * 0.05 * k, SCR_C[2] * 0.05 * k]);
    const rim = look.shield;
    s.ellipsoid(c, [SCR_C[0] * 0.01 * k, SCR_C[1] * 0.01 * k, SCR_C[2] * 0.01 * k], [SCR_R[0] * r, SCR_R[1] * r, 0], [SCR_U[0] * r, SCR_U[1] * r, SCR_U[2] * r], rim, (l) => (l[1] * l[1] + l[2] * l[2] > 0.62 ? { shade: 1 } : null));
  }
}

const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

function mini(s: Scene, rx: number, ry: number): void {
  s.group();
  s.ellipsoid([0, 0, -0.012], [rx, 0, 0], [0, ry, 0], [0, 0, 0.016], M.baseRim);
  s.group();
  s.ellipsoid([0, 0, -0.004], [rx * 0.92, 0, 0], [0, ry * 0.92, 0], [0, 0, 0.012], M.base);
}

function wolf(s: Scene, at: V3, k = 1): void {
  const c = BEAST.wolf;
  const [x, y, z] = at;
  s.group();
  s.ellipsoid([x, y, z + 0.08 * k], [0.075 * k, -0.04 * k, 0], [0.02 * k, 0.035 * k, 0], [0, 0, 0.035 * k], c.coat);
  for (const [lx, ly] of [[0.05, -0.03], [0.05, 0.0], [-0.05, 0.01], [-0.05, 0.04]]) s.limb([x + lx * k, y + ly * k, z + 0.07 * k], [x + lx * k, y + ly * k, z], 0.01 * k, 0.008 * k, c.dark);
  s.group();
  s.sphere([x + 0.085 * k, y - 0.03 * k, z + 0.12 * k], 0.026 * k, c.coat);
  s.limb([x + 0.09 * k, y - 0.03 * k, z + 0.115 * k], [x + 0.13 * k, y - 0.01 * k, z + 0.1 * k], 0.014 * k, 0.008 * k, c.belly);
  s.limb([x - 0.07 * k, y + 0.05 * k, z + 0.09 * k], [x - 0.12 * k, y + 0.08 * k, z + 0.06 * k], 0.012 * k, 0.006 * k, c.coat);
}

function hydra(s: Scene, at: V3, k = 1): void {
  const [x, y, z] = at;
  s.group();
  s.ellipsoid([x, y, z + 0.08 * k], [0.1 * k, 0, 0], [0, 0.08 * k, 0], [0, 0, 0.07 * k], M.hydra);
  for (let i = -1; i <= 1; i++) {
    s.group();
    const top: V3 = [x + 0.04 * k + i * 0.03 * k, y - i * 0.05 * k, z + 0.26 * k - Math.abs(i) * 0.04 * k];
    s.limb([x, y - i * 0.02 * k, z + 0.12 * k], top, 0.022 * k, 0.014 * k, M.hydraBelly);
    s.sphere(top, 0.026 * k, M.hydra);
  }
}

export type MiniKind = 'army' | 'militia' | 'beasts' | 'outlaws' | 'tribes' | 'pirates' | 'deserters' | 'city' | 'cultists' | 'beast';

const STRAW = mat(0xc8a858, { grit: 0.4 });
const HOOD_GREEN = mat(0x4e6a34, { grit: 0.4 });
const PURPLE = mat(0x5a2a5a, { grit: 0.3 });
const RED_CREST = mat(0x9a2a1e, { contrast: 0.8 });
const STRIPE = mat(0xd8d0bc, { grit: 0.3 });

const LOOKS: Record<Exclude<MiniKind, 'army' | 'beasts' | 'beast'>, FigLook[]> = {
  militia: [{ body: CLOTH.tunicWhite, fork: true, cap: STRAW, brim: true }, { body: CLOTH.tunicOchre, legs: CLOTH.trouserBrown, spear: true }],
  outlaws: [{ body: CLOTH.tunicGreen, hood: HOOD_GREEN, bow: true }, { body: CLOTH.cloakBrown, hood: HOOD_GREEN, bow: true }],
  tribes: [{ body: CLOTH.checkRed, legs: CLOTH.checkGreen, sling: true, skin: SKIN[0] }, { body: CLOTH.checkGreen, legs: CLOTH.trouserBrown, spear: true, skin: SKIN[0], shield: mat(0x6a5038) }],
  pirates: [{ body: STRIPE, cap: M.red, spear: true }, { body: CLOTH.tunicBlue, cap: M.red, shield: mat(0x5a4a3a) }],
  deserters: [{ body: CLOTH.cloakBlack, helm: IRON, shield: IRON, spear: true }, { body: CLOTH.tunicRed, helm: IRON, shield: IRON }],
  city: [{ body: CLOTH.tunicRed, helm: BRONZE, crest: RED_CREST, shield: BRONZE, spear: true }, { body: CLOTH.tunicRed, helm: BRONZE, crest: RED_CREST, shield: BRONZE, spear: true }],
  cultists: [{ body: PURPLE, robe: true, hood: PURPLE }, { body: CLOTH.cloakBlack, robe: true, hood: PURPLE }],
};

/**
 * A painted miniature on a round base: the army (a little phalanx of
 * hoplites around a banner pole; the flag is a separate sprite) or a neutral
 * garrison (two figures, or wolves, or a beast). Anchor: the base's centre.
 */
export function renderMini(kind: MiniKind): Sprite {
  return shoot((s) => {
    if (kind === 'army') {
      mini(s, 0.14, 0.14);
      const look: FigLook = { body: CLOTH.tunicRed, helm: BRONZE, crest: RED_CREST, shield: BRONZE, spear: true };
      s.group();
      s.line([-0.07, -0.05, 0], [-0.07, -0.05, 0.56], M.pole, 1);
      figure(s, [-0.06, 0.06, 0], look);
      figure(s, [0.06, -0.06, 0], look);
      figure(s, [0.0, 0.0, 0], { ...look, body: CLOTH.tunicBlue });
      s.scale(1.55);
      return;
    }
    if (kind === 'beasts') {
      mini(s, 0.12, 0.12);
      wolf(s, [-0.02, 0.03, 0], 0.95);
      wolf(s, [0.05, -0.05, 0], 0.8);
      s.scale(1.25);
      return;
    }
    if (kind === 'beast') {
      mini(s, 0.14, 0.14);
      hydra(s, [0, 0, 0], 1);
      s.scale(1.5);
      return;
    }
    mini(s, 0.1, 0.1);
    const [a, b] = LOOKS[kind];
    figure(s, [-0.035, 0.035, 0], a, 0.85);
    figure(s, [0.035, -0.035, 0], b, 0.85);
    s.scale(1.2);
  }, 64);
}

/** The army's banner: a small pennant in a clan colour; frame 0..2 (it waves). */
export function renderFlag(color: number, frame: number): Sprite {
  const w = 11;
  const h = 9;
  const px = new Pix(w, h);
  const rm = ramp(color, 4);
  for (let x = 0; x < w - 1; x++) {
    const wave = Math.round(Math.sin((x / 3.2) + frame * 2.1) * (x / 10) * 1.3);
    const len = 6 - Math.floor((x / (w - 1)) * 3);
    for (let y = 0; y < len; y++) {
      const shade = (Math.sin((x / 3.2) + frame * 2.1 + 1.2) > 0.3 ? 1 : 0) + (y === len - 1 ? 1 : 0);
      px.set(x + 1, 1 + y + wave + Math.floor((6 - len) / 2), rm[Math.min(3, shade)]);
    }
  }
  px.vline(0, 0, h - 1, 0x4a3420);
  px.set(0, 0, 0xe0b860);
  return { pix: px, ax: 0, ay: h - 1 };
}

/** A small territory pennant on a pin (baked on owned hexes). */
export function renderPin(color: number): Sprite {
  const px = new Pix(7, 10);
  const rm = ramp(color, 4);
  px.vline(1, 1, 9, 0x4a3420);
  px.set(1, 0, 0xe0b860);
  for (let x = 2; x < 7; x++) for (let y = 1; y < 5 - Math.floor((x - 2) / 2); y++) px.set(x, y + Math.floor((x - 2) / 3), y === 1 ? rm[0] : rm[1]);
  return { pix: px, ax: 1, ay: 9 };
}

// ------------------------------------------------------------------ ambient

/** A drifting cloud puff of the fog of war (soft, dithered edge). */
export function renderCloud(variant: number): Pix {
  const w = 52;
  const h = 30;
  const px = new Pix(w, h);
  const blobs: [number, number, number][] = [];
  for (let i = 0; i < 6; i++) blobs.push([10 + hash2(i, variant, 1) * 32, 12 + hash2(i, variant, 2) * 8, 6 + hash2(i, variant, 3) * 6]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let d = 0;
      for (const [bx, by, br] of blobs) d = Math.max(d, 1 - Math.hypot((x - bx) / br, (y - by) / (br * 0.7)));
      const b = BAYER4[y & 3][x & 3];
      if (d <= 0) continue;
      if (d < 0.25 && b > d * 3.2) continue;
      const shade = y / h + (1 - d) * 0.3;
      const c = shade < 0.45 ? 0xf4ecdc : shade < 0.7 ? 0xe2d8c6 : 0xc8bcaa;
      px.set(x, y, c, d < 0.25 ? 170 : 235);
    }
  return px;
}

/** Wave glints over a water tile (transparent; frame 0..3 shifts the strokes). */
export function renderWaterGlint(frame: number): Pix {
  const px = new Pix(TILE_W, TILE_H);
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(hash2(i, 0, 11) * (TILE_W - 10)) + 5 + ((frame + i) % 4) - 2;
    const y = Math.floor(hash2(i, 1, 11) * (TILE_H - 8)) + 4;
    if (!inTopFace(x + 0.5 - TILE_W / 2, y + 0.5 - TILE_H / 2) || !inTopFace(x + 3.5 - TILE_W / 2, y + 0.5 - TILE_H / 2)) continue;
    const len = (frame + i) % 4 === 3 ? 0 : 2 + ((frame + i) % 2);
    for (let k = 0; k < len; k++) px.set(x + k, y, 0xd6e6ea, 150);
  }
  return px;
}

/** A small smoke puff. */
export function renderSmoke(): Pix {
  const px = new Pix(6, 6);
  px.ellipse(0, 0, 6, 6, (_x, _y, e) => (e ? 0xb8b0a4 : 0xd8d2c8));
  return px;
}

/**
 * Candle-light vignette over the table at UI resolution: dark warm corners
 * (dithered, so it stays pixel art) and a faint warm light from the upper
 * left, in one overlay.
 */
export function renderVignette(w: number, h: number): Pix {
  const px = new Pix(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const b = BAYER4[y & 3][x & 3];
      const dx = (x + 0.5 - w * 0.46) / (w * 0.62);
      const dy = (y + 0.5 - h * 0.44) / (h * 0.6);
      const d = Math.sqrt(dx * dx + dy * dy);
      const k = Math.max(0, Math.min(1, (d - 0.55) / 0.6));
      const a = Math.round(k * 7 + (b - 0.5)) / 7;
      if (a > 0) {
        px.set(x, y, 0x140a04, Math.round(Math.min(1, a) * 175));
        continue;
      }
      // the candle: a faint amber wash near the light
      const g = Math.max(0, 1 - Math.hypot((x - w * 0.22) / (w * 0.8), (y - h * 0.2) / (h * 0.6)));
      if (g > 0 && b < g * 0.9) px.set(x, y, 0xffb060, 22);
    }
  return px;
}
