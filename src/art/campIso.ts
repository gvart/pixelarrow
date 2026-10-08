/**
 * Isometric camp art (docs/ART_STYLE.md: 2:1 dimetric, soft volumetric
 * shading, hue-shifted ramps, selective outlines). Everything here is pure
 * Pix: the ground of a camp clearing (grass drifts with mown patches, dirt
 * paths, sand and sea with foam bands when the camp is on a coast, the forest
 * floor under the trees), and the structures ray-cast by src/art/model3d.ts
 * from spheres, boxes, cones and lines posed in metres: the red command
 * pavilion with its guy ropes, cream bell tents, rows of soldiers' ridge
 * tents, wooden sheds with red roofs, the market stall under its awning, the
 * forge hut with its chimney, the granary, the watchtower, palisade stakes and
 * gate, drill dummies, banners, campfires, crates, amphorae, the beached
 * trireme, and the framing trees, rocks and temple ruin. The camp scene
 * (src/scenes/CampScene.ts) bakes the ground into one texture and places the
 * structures as sorted sprites.
 *
 * Grid: a camp tile is CELL x CELL metres; the model camera draws 1 m as 8 px
 * along a tile axis (model3d K = 16 at ISO_SCALE 0.5), so a tile is a 32 x 16
 * diamond. Tile (tx, ty)'s top corner is at tileScreen(tx, ty).
 */
import { Pix, hash2, valueNoise } from './pixels';
import { Scene, ramp, type Material, type Shader, type V3 } from './model3d';

export const CELL = 2;
export const ISO_SCALE = 0.5;
/** Pixels per metre along a tile axis (x and y on screen). */
const PX = 8;
const PY = 4;
/** Pixels per metre of height. */
const PZ = Math.cos(Math.PI / 6) * 16 * Math.SQRT2 * ISO_SCALE; // 9.8
export const TILE_W = CELL * PX * 2; // 32
export const TILE_H = CELL * PY * 2; // 16

/** Screen offset of the top corner of tile (tx, ty) from the origin tile's. */
export function tileScreen(tx: number, ty: number): { x: number; y: number } {
  return { x: (tx - ty) * (TILE_W / 2), y: (tx + ty) * (TILE_H / 2) };
}

/** Screen offset of a point (in tiles, fractional) on the ground. */
export function groundScreen(fx: number, fy: number): { x: number; y: number } {
  return { x: (fx - fy) * (TILE_W / 2), y: (fx + fy) * (TILE_H / 2) };
}

/** Tile coordinates (fractional) under a screen offset. */
export function screenTile(sx: number, sy: number): { x: number; y: number } {
  return { x: sx / TILE_W + sy / TILE_H, y: sy / TILE_H - sx / TILE_W };
}

// ---------------------------------------------------------------- materials

const M = (base: number, extra: Partial<Material> = {}): Material => ({ ramp: ramp(base), ...extra });

export const MAT = {
  canvas: M(0xe8d6b4, { contrast: 0.75 }),
  canvasOld: M(0xd6c09c, { contrast: 0.8, grit: 0.4 }),
  olive: M(0xa09e6c, { contrast: 0.85, grit: 0.35 }),
  red: M(0xc45a4c, { contrast: 0.9 }),
  redDark: M(0x8e3a32, { contrast: 0.9 }),
  wine: M(0x7a2e30),
  wood: M(0xa67a52, { grit: 0.5 }),
  woodDark: M(0x6e4c34, { grit: 0.5 }),
  plank: M(0xbe9062, { grit: 0.6 }),
  stone: M(0xb6ada0, { grit: 0.7, contrast: 0.9 }),
  stoneCream: M(0xe4d8c0, { grit: 0.5 }),
  rock: M(0x9c9690, { grit: 0.8 }),
  rockMauve: M(0xa6929a, { grit: 0.8 }),
  thatch: M(0xd6b66a, { grit: 0.9, contrast: 0.8 }),
  tile: M(0xb85c46, { grit: 0.4 }),
  iron: M(0x8c9096, { metal: true }),
  bronze: M(0xcc9c48, { metal: true }),
  leaf: M(0x7a964e, { grit: 0.9, contrast: 0.9 }),
  leafDark: M(0x5e7c42, { grit: 0.9 }),
  leafOlive: M(0x92a070, { grit: 0.9 }),
  cypress: M(0x4e6c3e, { grit: 0.8 }),
  dark: M(0x4a3630, { contrast: 0.6 }),
  clay: M(0xcc8458, { grit: 0.5 }),
  sack: M(0xd0b890, { grit: 0.7 }),
  rope: M(0xbca486),
  sail: M(0xf2e8d2, { contrast: 0.7 }),
  hull: M(0xa06e46, { grit: 0.5 }),
  hullDark: M(0x6c4a34, { grit: 0.5 }),
  straw: M(0xe2c67a, { grit: 0.8 }),
  skin: M(0xd4a888),
  ember: M(0xf0a048),
  cream: M(0xf0e4cc, { contrast: 0.7 }),
  blue: M(0x5a7a9a),
} satisfies Record<string, Material>;

const DOT = { ink: 0x3a2622, white: 0xf6f0e4, red: 0xb83a34, blue: 0x2c4a6e, gold: 0xf0d070, ember: 0xffd468, coal: 0x2c1c1c } as const;

/** Hides everything under the ground (sphere sweeps would bulge below it). */
const aboveGround: Shader = (_l, w) => (w[2] < -0.01 ? { hole: true } : null);

// ---------------------------------------------------------------- model rendering

export interface IsoSprite {
  px: Pix;
  /** Pixel of the sprite that sits on the top corner of its origin tile. */
  ox: number;
  oy: number;
}

export interface ModelOpts {
  /** Footprint in tiles. */
  w: number;
  h: number;
  /** Tallest point in metres (sets the sprite height). */
  height: number;
  /** Extra room around the footprint for overhangs (px). */
  pad?: number;
  /** Flat lavender shadow under the footprint (default on). */
  shadow?: boolean | { w: number; h: number; dx?: number; dy?: number; a?: number };
  outline?: boolean;
}

/** Ray-casts a scene posed in metres on a footprint of w x h tiles. */
export function renderModel(build: (sc: Scene) => void, o: ModelOpts): IsoSprite {
  const pad = o.pad ?? 10;
  const ox = o.h * TILE_W / 2 + pad;
  const oy = pad + Math.ceil(o.height * PZ);
  const w = (o.w + o.h) * (TILE_W / 2) + pad * 2;
  const h = oy + (o.w + o.h) * (TILE_H / 2) + pad;
  const sc = new Scene();
  build(sc);
  // shaders are written in metres: hand them the unscaled world point
  for (const p of sc.prims) {
    const f = p.shader;
    if (f) p.shader = (l, w) => f(l, [w[0] / ISO_SCALE, w[1] / ISO_SCALE, w[2] / ISO_SCALE]);
  }
  sc.scale(ISO_SCALE);
  const body = sc.render(w, h, ox, oy, { outline: o.outline !== false });
  if (o.shadow === false) return { px: body, ox, oy };
  const out = new Pix(w, h);
  const s = typeof o.shadow === 'object' ? o.shadow : { w: o.w, h: o.h };
  drawShadow(out, ox, oy, s.w, s.h, s.dx ?? 3, s.dy ?? 2, s.a ?? 70);
  out.blit(body, 0, 0);
  return { px: out, ox, oy };
}

/** A translucent lavender diamond-ellipse under a footprint, cast to the SE. */
function drawShadow(px: Pix, ox: number, oy: number, w: number, h: number, dx: number, dy: number, a: number): void {
  const c = groundScreen(w / 2, h / 2);
  const rx = (w + h) * (TILE_W / 4) * 0.98;
  const ry = (w + h) * (TILE_H / 4) * 0.98;
  const cx = ox + c.x + dx;
  const cy = oy + c.y + dy;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const u = (x - cx) / rx;
      const v = (y - cy) / ry;
      const d = u * u + v * v;
      if (d > 1) continue;
      px.set(x, y, 0x5c4a6c, d > 0.72 ? a * 0.55 : a);
    }
}

// ---------------------------------------------------------------- shaders

/** Vertical cloth panels around a tent (alternate panels a touch darker). */
const panels =
  (cx: number, cy: number, n: number, dark = 0.9): Shader =>
  (_l, w) => {
    const a = Math.atan2(w[1] - cy, w[0] - cx) / (Math.PI * 2) + 1;
    return Math.floor(a * n) % 2 ? { shade: dark } : null;
  };

/** A dark doorway on the camera-facing side (+X +Y) of a round tent wall, below `h`, `half` wide in radians. */
const doorway =
  (cx: number, cy: number, h: number, half: number, next?: Shader): Shader =>
  (l, w) => {
    const a = Math.atan2(w[1] - cy, w[0] - cx);
    if (w[2] < h && w[2] > -0.01 && Math.abs(a - Math.PI / 4) < half) return { ramp: MAT.dark.ramp };
    return next ? next(l, w) : null;
  };

/** A ring of a different material near the ground (a tent's hem). */
const hem =
  (z: number, mat: Material, next?: Shader): Shader =>
  (l, w) =>
    w[2] < z ? { ramp: mat.ramp } : next ? next(l, w) : null;

/** Horizontal planks / courses. */
const courses =
  (per: number, dark = 0.6): Shader =>
  (_l, w) =>
    Math.floor(w[2] * per) % 2 ? { shade: dark } : null;

// ---------------------------------------------------------------- primitives

/** A vertical cone (or cylinder) from z0 (radius r0) to z1 (radius r1). */
function cone(sc: Scene, x: number, y: number, z0: number, z1: number, r0: number, r1: number, mat: Material, shader?: Shader): void {
  sc.limb([x, y, z0], [x, y, z1], r0, r1, mat, shader ?? aboveGround);
}

function post(sc: Scene, x: number, y: number, h: number, r = 0.08, mat: Material = MAT.woodDark, z0 = 0): void {
  sc.limb([x, y, z0], [x, y, z0 + h], r, r * 0.85, mat, aboveGround);
}

function box(sc: Scene, c: V3, hx: number, hy: number, hz: number, mat: Material, shader?: Shader): void {
  sc.box(c, [hx, 0, 0], [0, hy, 0], [0, 0, hz], mat, shader);
}

/**
 * A ridge roof / ridge tent along X: a box turned 45 degrees about its ridge,
 * its lower half hidden under `floor`. Width 4s on the ground, height 2s.
 */
function ridge(sc: Scene, cx: number, cy: number, floor: number, halfLen: number, s: number, mat: Material, shader?: Shader): void {
  sc.box([cx, cy, floor], [halfLen, 0, 0], [0, s, s], [0, -s, s], mat, (l, w) => {
    if (w[2] < floor - 0.01) return { hole: true };
    return shader ? shader(l, w) : null;
  });
}

function pegRope(sc: Scene, from: V3, to: V3): void {
  sc.line(from, to, MAT.rope, 1);
  sc.dot([to[0], to[1], 0.04], DOT.ink, 0.1);
}

function pennant(sc: Scene, x: number, y: number, z: number, h: number, mat: Material = MAT.red): void {
  sc.line([x, y, z], [x, y, z + h], MAT.woodDark, 1);
  sc.box([x + 0.22, y, z + h - 0.16], [0.22, 0, 0], [0, 0.015, 0], [0, 0, 0.11], mat, (l) => (l[0] > 0.55 && Math.abs(l[2]) < 0.6 ? { hole: true } : null));
}

// ---------------------------------------------------------------- structures

/** The red command pavilion: a tall striped cone on a round wall, guy ropes, a pennant and the door banner. 3 x 3 tiles. */
export function renderPavilion(size: 2 | 3 = 3): IsoSprite {
  const k = size / 3;
  return renderModel(
    (sc) => {
      const cx = size;
      const cy = size;
      sc.group();
      const door = doorway(cx, cy, 0.95, 0.16, hem(0.26, MAT.redDark, panels(cx, cy, 14, 0.8)));
      cone(sc, cx, cy, 0, 1.5 * k + 0.2, 2.45 * k, 2.45 * k, MAT.red, door);
      cone(sc, cx, cy, 1.45 * k + 0.2, 4.6 * k + 0.6, 2.62 * k, 0.08, MAT.red, panels(cx, cy, 14, 0.8));
      // guy ropes to pegs
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        const r0 = 2.5 * k;
        const r1 = 3.2 * k;
        pegRope(sc, [cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, 1.5 * k + 0.2], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, 0.05]);
      }
      pennant(sc, cx, cy, 4.5 * k + 0.5, 1.1, MAT.cream);
      sc.dot([cx, cy, 4.65 * k + 0.5], DOT.gold, 0.2);
      // a banner by the door
      sc.line([cx + 2.6 * k, cy + 2.2 * k, 0], [cx + 2.6 * k, cy + 2.2 * k, 2.2], MAT.woodDark, 1);
      sc.box([cx + 2.6 * k, cy + 2.2 * k + 0.3, 1.75], [0.02, 0, 0], [0, 0.3, 0], [0, 0, 0.36], MAT.red);
      sc.dot([cx + 2.6 * k + 0.02, cy + 2.2 * k + 0.3, 1.8], DOT.white, 0.1);
    },
    { w: size, h: size, height: 6.0, pad: 14 },
  );
}

/** The barracks: ridge tents in a row with a bell tent, a rack of spears and a standard at level 3. 2 x 2 tiles. */
export function renderBarracks(level = 1): IsoSprite {
  return renderModel(
    (sc) => {
      cone(sc, 1.2, 1.1, 0, 0.7, 1.0, 1.0, MAT.canvasOld, hem(0.18, MAT.redDark, panels(1.2, 1.1, 8, 0.6)));
      cone(sc, 1.2, 1.1, 0.68, 2.3, 1.1, 0.05, MAT.canvasOld, panels(1.2, 1.1, 8, 0.6));
      sc.box([1.2 + 0.72, 1.1 + 0.72, 0.3], [0.2, -0.2, 0], [0.08, 0.08, 0], [0, 0, 0.3], MAT.dark);
      ridge(sc, 1.0, 3.1, 0, 0.8, 0.42, MAT.olive, (l) => (Math.floor((l[1] + 1) * 3) % 2 ? { shade: 0.35 } : null));
      ridge(sc, 3.0, 3.1, 0, 0.8, 0.42, MAT.olive, (l) => (Math.floor((l[1] + 1) * 3) % 2 ? { shade: 0.35 } : null));
      if (level >= 2) {
        post(sc, 3.0, 0.5, 1.1, 0.06);
        post(sc, 3.8, 0.5, 1.1, 0.06);
        sc.line([2.9, 0.5, 1.05], [3.9, 0.5, 1.05], MAT.woodDark, 1);
        for (let i = 0; i < 4; i++) sc.line([3.05 + i * 0.25, 0.65, 0.05], [3.0 + i * 0.25, 0.45, 1.9], MAT.wood, 1);
        sc.ellipsoid([3.3, 0.9, 0.4], [0.38, 0, 0], [0, 0.06, 0], [0, 0, 0.38], MAT.red, (l) => (l[0] * l[0] + l[2] * l[2] > 0.8 ? { ramp: MAT.bronze.ramp } : null));
      }
      if (level >= 3) pennant(sc, 3.4, 2.0, 0, 2.6);
    },
    { w: 2, h: 2, height: 3.2, pad: 12 },
  );
}

/** A cream bell tent with an ochre hem. 2 x 2 tiles; `look` picks the cloth. */
export function renderBellTent(look = 0): IsoSprite {
  const cloth = [MAT.canvas, MAT.canvasOld, MAT.cream, MAT.canvas][look % 4];
  const band = [MAT.redDark, MAT.wine, MAT.blue, MAT.woodDark][look % 4];
  return renderModel(
    (sc) => {
      const cx = 2;
      const cy = 2;
      cone(sc, cx, cy, 0, 0.95, 1.65, 1.65, cloth, doorway(cx, cy, 0.7, 0.2, hem(0.22, band, panels(cx, cy, 10, 0.6))));
      cone(sc, cx, cy, 0.92, 3.1, 1.78, 0.06, cloth, panels(cx, cy, 10, 0.6));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.5;
        pegRope(sc, [cx + Math.cos(a) * 1.7, cy + Math.sin(a) * 1.7, 0.95], [cx + Math.cos(a) * 2.25, cy + Math.sin(a) * 2.25, 0.05]);
      }
      sc.line([cx, cy, 3.0], [cx, cy, 3.5], MAT.woodDark, 1);
      sc.dot([cx, cy, 3.5], DOT.red, 0.2);
    },
    { w: 2, h: 2, height: 4, pad: 12 },
  );
}

/** A soldiers' ridge tent (olive canvas), 1 x 1 tile, ridge along X, door towards the camera. */
export function renderRidgeTent(look = 0): IsoSprite {
  const cloth = [MAT.olive, MAT.canvasOld, MAT.olive][look % 3];
  return renderModel(
    (sc) => {
      ridge(sc, 1, 1, 0, 0.85, 0.48, cloth, (l, w) => {
        // the front flap: a dark wedge on the +X end
        if (l[0] > 0.97 && w[2] < 0.58 && Math.abs(w[1] - 1) < 0.22) return { ramp: MAT.dark.ramp };
        return Math.floor((l[1] + 1) * 3) % 2 ? { shade: 0.35 } : null;
      });
      sc.line([0.15, 1, 0.96], [1.85, 1, 0.96], MAT.woodDark, 1);
      pegRope(sc, [1.85, 1, 0.92], [2.35, 1, 0.04]);
      pegRope(sc, [0.15, 1, 0.92], [-0.35, 1, 0.04]);
    },
    { w: 1, h: 1, height: 1.3, pad: 8, shadow: { w: 1, h: 1, a: 55 } },
  );
}

/** A plank shed with a red tile roof, 2 x 1 tiles (ridge along X). `look` 1 adds a lean-to and barrels. */
export function renderShed(look = 0, tall = false): IsoSprite {
  const wh = tall ? 1.6 : 1.3;
  return renderModel(
    (sc) => {
      sc.group();
      box(sc, [2, 1, wh / 2], 1.7, 0.85, wh / 2, MAT.plank, (l, w) => {
        if (l[0] > 0.97 && w[2] < 1.0 && Math.abs(w[1] - 1) < 0.28) return { ramp: MAT.dark.ramp };
        return Math.floor(w[2] * 5) % 2 ? { shade: 0.55 } : null;
      });
      sc.group();
      ridge(sc, 2, 1, wh - 0.02, 2.0, 1.02, MAT.tile, (l) => (Math.floor((l[1] + 1) * 7) % 2 ? { shade: 0.6 } : Math.floor((l[0] + 1) * 9) % 3 === 0 ? { shade: 0.35 } : null));
      sc.line([0.0, 1, wh + 2.0], [4.0, 1, wh + 2.0], MAT.woodDark, 1);
      if (look === 1) {
        // a lean-to roof over a stack of barrels on the +Y side
        sc.box([2, 2.25, wh - 0.55], [1.2, 0, 0], [0, 0.42, -0.2], [0, 0.03, 0.06], MAT.woodDark);
        post(sc, 1.0, 2.55, wh - 0.9, 0.06);
        post(sc, 3.0, 2.55, wh - 0.9, 0.06);
        barrel(sc, 1.5, 2.3);
        barrel(sc, 2.3, 2.35);
      }
    },
    { w: 2, h: 1, height: wh + 2.4, pad: 12 },
  );
}

function barrel(sc: Scene, x: number, y: number): void {
  cone(sc, x, y, 0, 0.62, 0.26, 0.26, MAT.wood, (_l, w) => (Math.abs(w[2] - 0.14) < 0.04 || Math.abs(w[2] - 0.5) < 0.04 ? { ramp: MAT.iron.ramp } : null));
}

/** The market stall: four posts, a striped awning, a counter with amphorae and sacks. 2 x 1 tiles. */
export function renderStall(): IsoSprite {
  return renderModel(
    (sc) => {
      for (const [x, y] of [[0.3, 0.3], [3.7, 0.3], [0.3, 1.7], [3.7, 1.7]]) post(sc, x, y, y < 1 ? 2.3 : 2.0, 0.07);
      // awning: a slab sloping down towards the camera (+Y), striped along X
      sc.box([2, 1.05, 2.3], [2.0, 0, 0], [0, 0.95, -0.32], [0, 0.02, 0.06], MAT.cream, (l) => (Math.floor((l[0] + 1) * 5) % 2 ? { ramp: MAT.red.ramp } : null));
      // counter
      box(sc, [2, 1.55, 0.42], 1.5, 0.32, 0.42, MAT.plank, courses(5, 0.5));
      amphora(sc, 1.1, 1.6, 0.84);
      amphora(sc, 1.7, 1.5, 0.84);
      sack(sc, 3.0, 1.55, 0.84, 0.26);
      sack(sc, 0.8, 0.7, 0, 0.32);
      sack(sc, 1.5, 0.6, 0, 0.3);
      crate(sc, 3.1, 0.6, 0, 0.3);
    },
    { w: 2, h: 1, height: 2.6, pad: 10 },
  );
}

function amphora(sc: Scene, x: number, y: number, z: number): void {
  sc.ellipsoid([x, y, z + 0.3], [0.19, 0, 0], [0, 0.19, 0], [0, 0, 0.3], MAT.clay, courses(8, 0.3));
  cone(sc, x, y, z + 0.55, z + 0.74, 0.08, 0.1, MAT.clay, undefined);
  sc.line([x - 0.16, y, z + 0.5], [x - 0.14, y, z + 0.68], MAT.clay, 1);
  sc.line([x + 0.16, y, z + 0.5], [x + 0.14, y, z + 0.68], MAT.clay, 1);
}

function sack(sc: Scene, x: number, y: number, z: number, r: number): void {
  sc.ellipsoid([x, y, z + r * 0.8], [r, 0, 0], [0, r * 0.9, 0], [0, 0, r * 0.8], MAT.sack, (_l, w) => (w[2] > z + r * 1.45 ? { shade: 0.7 } : null));
}

function crate(sc: Scene, x: number, y: number, z: number, hs: number): void {
  box(sc, [x, y, z + hs], hs, hs, hs, MAT.plank, (l) => (Math.abs(l[0]) > 0.85 || Math.abs(l[1]) > 0.85 || Math.abs(l[2]) > 0.85 ? { shade: 0.9 } : null));
}

/** The forge: an open smithy under a tile roof, stone hearth with its chimney, anvil on a stump, quench barrel. 2 x 2 tiles. */
export function renderForge(level = 1): IsoSprite {
  return renderModel(
    (sc) => {
      // back walls (the -X and -Y sides), open towards the camera
      sc.group();
      box(sc, [0.35, 1.6, 0.8], 0.25, 1.5, 0.8, MAT.plank, courses(5, 0.55));
      box(sc, [1.6, 0.35, 0.8], 1.5, 0.25, 0.8, MAT.plank, courses(5, 0.55));
      for (const [x, y] of [[3.6, 0.4], [3.6, 3.6], [0.4, 3.6]]) post(sc, x, y, 2.0, 0.09);
      sc.group();
      ridge(sc, 2, 2, 1.85, 2.0, 1.1, MAT.tile, (l) => (Math.floor((l[1] + 1) * 7) % 2 ? { shade: 0.6 } : null));
      sc.line([0, 2, 1.85 + 2.2], [4, 2, 1.85 + 2.2], MAT.woodDark, 1);
      // hearth: a stone block with the coal mouth, the chimney through the roof
      sc.group();
      box(sc, [1.1, 1.1, 0.5], 0.75, 0.75, 0.5, MAT.stone, courses(4, 0.5));
      sc.box([1.85, 1.1, 0.42], [0.04, 0, 0], [0, 0.36, 0], [0, 0, 0.26], MAT.dark);
      for (let i = 0; i < 5; i++) sc.dot([1.88, 0.85 + i * 0.12, 0.3 + (i % 2) * 0.1], i % 2 ? DOT.ember : 0xf6a048, 0.15);
      box(sc, [1.0, 1.0, 2.9], 0.3, 0.3, 1.3, MAT.stone, courses(5, 0.5));
      sc.box([1.0, 1.0, 4.22], [0.2, 0, 0], [0, 0.2, 0], [0, 0, 0.03], MAT.dark);
      // anvil on a stump, quench barrel, tool rack
      post(sc, 2.7, 2.4, 0.5, 0.26, MAT.woodDark);
      sc.box([2.7, 2.4, 0.66], [0.34, 0, 0], [0, 0.16, 0], [0, 0, 0.13], MAT.iron);
      sc.limb([3.0, 2.4, 0.68], [3.3, 2.4, 0.72], 0.1, 0.03, MAT.iron, undefined);
      barrel(sc, 3.4, 1.0);
      if (level >= 2) {
        // a second hearth block and bronze ingots stacked by the wall
        for (let i = 0; i < 3; i++) sc.box([0.9 + i * 0.3, 3.2, 0.08], [0.12, 0, 0], [0, 0.22, 0], [0, 0, 0.06], MAT.bronze);
      }
      if (level >= 3) {
        sc.line([3.7, 3.2, 0.3], [3.7, 3.2, 1.6], MAT.woodDark, 1);
        sc.line([3.5, 3.0, 1.5], [3.9, 3.4, 1.5], MAT.woodDark, 1);
        sc.line([3.6, 3.1, 1.45], [3.6, 3.1, 1.0], MAT.iron, 1);
        sc.line([3.8, 3.3, 1.45], [3.8, 3.3, 0.95], MAT.iron, 1);
      }
    },
    { w: 2, h: 2, height: 4.4, pad: 12 },
  );
}

/** Where the forge's smoke (chimney) and sparks (anvil) rise, relative to its origin corner (px). */
export const FORGE_FX = { chimney: groundScreen(0.5, 0.5), anvil: groundScreen(1.35, 1.2), hearth: groundScreen(0.95, 0.55) };

/** The granary: a round stone store with a conical thatch roof, sacks and amphorae. 2 x 2 tiles. */
export function renderGranary(level = 1): IsoSprite {
  return renderModel(
    (sc) => {
      const cx = 1.7;
      const cy = 1.7;
      sc.group();
      cone(sc, cx, cy, 0, 1.5, 1.35, 1.35, MAT.stoneCream, (_l, w) => {
        if (w[2] < 0.9 && Math.hypot(w[0] - cx - 0.95, w[1] - cy - 0.95) < 0.42) return { ramp: MAT.dark.ramp };
        return Math.floor(w[2] * 4) % 2 ? { shade: 0.5 } : null;
      });
      sc.group();
      cone(sc, cx, cy, 1.4, 3.3, 1.65, 0.1, MAT.thatch, (_l, w) => (Math.floor(w[2] * 6) % 2 ? { shade: 0.5 } : null));
      sack(sc, 3.3, 1.2, 0, 0.3);
      sack(sc, 3.4, 1.9, 0, 0.27);
      if (level >= 2) {
        amphora(sc, 0.5, 3.3, 0);
        amphora(sc, 1.0, 3.5, 0);
      }
      if (level >= 3) {
        crate(sc, 3.2, 3.2, 0, 0.3);
        crate(sc, 3.2, 3.2, 0.6, 0.24);
      }
    },
    { w: 2, h: 2, height: 3.6, pad: 10 },
  );
}

/** The watchtower: four braced legs, a railed platform, a pyramid roof and a flag. 1 x 1 tile. */
export function renderWatchtower(level = 1): IsoSprite {
  const legH = 2.6 + level * 0.7;
  return renderModel(
    (sc) => {
      const legs: [number, number][] = [[0.35, 0.35], [1.65, 0.35], [0.35, 1.65], [1.65, 1.65]];
      for (const [x, y] of legs) sc.limb([x, y, 0], [x * 0.7 + 0.3, y * 0.7 + 0.3, legH], 0.09, 0.07, MAT.woodDark, aboveGround);
      // cross bracing
      for (let z = 0.6; z < legH - 0.4; z += 1.1) {
        const k = 1 - (z / legH) * 0.3;
        sc.line([1 - 0.65 * k, 1 + 0.65 * k, z], [1 + 0.65 * k, 1 + 0.65 * k, z + 0.9], MAT.wood, 1);
        sc.line([1 + 0.65 * k, 1 - 0.65 * k, z], [1 + 0.65 * k, 1 + 0.65 * k, z + 0.9], MAT.wood, 1);
      }
      // platform with rails
      box(sc, [1, 1, legH + 0.12], 0.95, 0.95, 0.1, MAT.plank, (l) => (Math.floor((l[0] + 1) * 4) % 2 ? { shade: 0.5 } : null));
      for (const [x, y] of [[0.1, 0.1], [1.9, 0.1], [0.1, 1.9], [1.9, 1.9]]) post(sc, x, y, 0.75, 0.05, MAT.woodDark, legH + 0.2);
      sc.line([0.1, 0.1, legH + 0.9], [1.9, 0.1, legH + 0.9], MAT.woodDark, 1);
      sc.line([0.1, 0.1, legH + 0.9], [0.1, 1.9, legH + 0.9], MAT.woodDark, 1);
      sc.line([1.9, 0.1, legH + 0.9], [1.9, 1.9, legH + 0.9], MAT.woodDark, 1);
      sc.line([0.1, 1.9, legH + 0.9], [1.9, 1.9, legH + 0.9], MAT.woodDark, 1);
      // roof on four posts
      for (const [x, y] of [[0.3, 0.3], [1.7, 0.3], [0.3, 1.7], [1.7, 1.7]]) post(sc, x, y, 1.1, 0.05, MAT.woodDark, legH + 0.2);
      // a stepped pyramid roof (flattened discs shrinking towards the top)
      const roof = level >= 2 ? MAT.tile : MAT.thatch;
      for (let i = 0; i < 6; i++) {
        const rr = 1.35 - i * 0.2;
        sc.ellipsoid([1, 1, legH + 1.3 + i * 0.17], [rr, 0, 0], [0, rr, 0], [0, 0, 0.12], roof);
      }
      sc.box([1, 1, legH + 2.35], [0.12, 0, 0], [0, 0.12, 0], [0, 0, 0.08], MAT.woodDark);
      // ladder
      for (let z = 0.3; z < legH; z += 0.35) sc.line([1.0, 1.75, z], [1.3, 1.75, z], MAT.wood, 1);
      if (level >= 3) pennant(sc, 1, 1, legH + 2.0, 1.0);
    },
    { w: 1, h: 1, height: legH + 3.2, pad: 10 },
  );
}

/** A row of palisade stakes along one tile edge (dir 0: along X, 1: along Y), with a sharpened top. */
export function renderStakes(dir: 0 | 1, seed = 0): IsoSprite {
  return renderModel(
    (sc) => {
      for (let i = 0; i < 5; i++) {
        const t = 0.2 + i * 0.4 + (hash2(i, seed, 3) - 0.5) * 0.08;
        const h = 0.95 + (hash2(i, seed, 5) - 0.5) * 0.25;
        const x = dir === 0 ? t : 0.25;
        const y = dir === 0 ? 0.25 : t;
        sc.limb([x, y, 0], [x, y, h - 0.25], 0.075, 0.075, MAT.wood, aboveGround);
        sc.limb([x, y, h - 0.25], [x, y, h], 0.075, 0.015, MAT.plank, undefined);
      }
      // a lashing rail
      if (dir === 0) sc.line([0.1, 0.25, 0.6], [1.95, 0.25, 0.6], MAT.rope, 1);
      else sc.line([0.25, 0.1, 0.6], [0.25, 1.95, 0.6], MAT.rope, 1);
    },
    { w: 1, h: 1, height: 1.3, pad: 6, shadow: false },
  );
}

/** The palisade gate: two tall posts, a lintel and a banner, on a tile edge along X. */
export function renderGate(dir: 0 | 1 = 0): IsoSprite {
  return renderModel(
    (sc) => {
      const at = (t: number): [number, number] => (dir === 0 ? [t, 0.3] : [0.3, t]);
      for (const t of [0.25, 1.75]) {
        const [x, y] = at(t);
        sc.limb([x, y, 0], [x, y, 2.2], 0.16, 0.14, MAT.woodDark, aboveGround);
      }
      const [ax, ay] = at(0.1);
      const [bx, by] = at(1.9);
      sc.line([ax, ay, 2.2], [bx, by, 2.2], MAT.woodDark, 2);
      sc.line([ax, ay, 2.05], [bx, by, 2.05], MAT.wood, 1);
      // the banner hanging from the lintel
      const [mx, my] = at(1.0);
      sc.box([mx, my, 1.7], dir === 0 ? [0.36, 0, 0] : [0, 0.36, 0], dir === 0 ? [0, 0.02, 0] : [0.02, 0, 0], [0, 0, 0.28], MAT.red);
      sc.dot([mx + (dir === 0 ? 0 : 0.03), my + (dir === 0 ? 0.03 : 0), 1.7], DOT.white, 0.1);
    },
    { w: 1, h: 1, height: 2.6, pad: 8, shadow: false },
  );
}

/** A drill dummy: a post with a straw head, a crossbar and a battered shield. */
export function renderDummy(look = 0): IsoSprite {
  return renderModel(
    (sc) => {
      post(sc, 1, 1, 1.55, 0.09);
      sc.sphere([1, 1, 1.7], 0.2, MAT.straw);
      sc.line([0.55, 1, 1.25], [1.45, 1, 1.25], MAT.wood, 1);
      sc.ellipsoid([1.08, 1.08, 1.0], [0.26, -0.26, 0], [0.04, 0.04, 0], [0, 0, 0.3], look ? MAT.plank : MAT.red, (l) => (l[0] * l[0] + l[2] * l[2] > 0.8 ? { ramp: MAT.woodDark.ramp } : null));
      sc.dot([1.1, 1.1, 1.0], look ? DOT.red : DOT.white, 0.1);
    },
    { w: 1, h: 1, height: 2.2, pad: 6, shadow: { w: 0.4, h: 0.4, a: 50 } },
  );
}

/** A straw archery target on legs. */
export function renderTarget(): IsoSprite {
  return renderModel(
    (sc) => {
      sc.line([0.7, 1.2, 0], [1.0, 1.0, 1.0], MAT.woodDark, 1);
      sc.line([1.3, 1.2, 0], [1.0, 1.0, 1.0], MAT.woodDark, 1);
      sc.ellipsoid([1.0, 1.0, 0.95], [0.42, -0.42, 0], [0.06, 0.06, 0], [0, 0, 0.6], MAT.straw, (l) => {
        const r = l[0] * l[0] + l[2] * l[2];
        return r < 0.08 ? { ramp: MAT.red.ramp } : r < 0.35 ? { shade: 0.7 } : r < 0.6 ? { ramp: MAT.cream.ramp } : null;
      });
    },
    { w: 1, h: 1, height: 1.8, pad: 6, shadow: { w: 0.5, h: 0.5, a: 50 } },
  );
}

/** A weapons rack with spears and shields. */
export function renderRack(): IsoSprite {
  return renderModel(
    (sc) => {
      post(sc, 0.3, 0.6, 1.2, 0.06);
      post(sc, 1.7, 0.6, 1.2, 0.06);
      sc.line([0.2, 0.6, 1.15], [1.8, 0.6, 1.15], MAT.woodDark, 1);
      for (let i = 0; i < 5; i++) {
        const x = 0.45 + i * 0.28;
        sc.line([x, 0.75, 0.05], [x - 0.08, 0.55, 2.0], MAT.wood, 1);
        sc.dot([x - 0.09, 0.55, 2.05], 0xd8d0c8, 0.15);
      }
      sc.ellipsoid([0.9, 1.0, 0.45], [0.42, 0, 0], [0, 0.07, 0], [0, 0, 0.42], MAT.red, (l) => (l[0] * l[0] + l[2] * l[2] > 0.8 ? { ramp: MAT.bronze.ramp } : null));
      sc.ellipsoid([1.5, 1.1, 0.42], [0.4, 0, 0], [0, 0.07, 0], [0, 0, 0.4], MAT.cream, (l) => (l[0] * l[0] + l[2] * l[2] > 0.8 ? { ramp: MAT.bronze.ramp } : null));
    },
    { w: 1, h: 1, height: 2.3, pad: 6, shadow: { w: 0.6, h: 0.4, a: 50 } },
  );
}

/** A standard: pole, red cloth with a cream device; 3 frames of wind. */
export function renderBanner(frame = 0, cloth: Material = MAT.red): IsoSprite {
  const wave = [0, 0.12, -0.08][frame % 3];
  return renderModel(
    (sc) => {
      sc.line([1, 1, 0], [1, 1, 2.9], MAT.woodDark, 1);
      sc.dot([1, 1, 2.95], DOT.gold, 0.2);
      // cloth hanging from a crossbar, swaying along Y
      sc.line([1, 0.55, 2.7], [1, 1.45, 2.7], MAT.woodDark, 1);
      sc.box([1 + wave, 1, 2.2], [0.02, 0, 0], [0, 0.42, 0], [0, wave * 0.5, 0.48], cloth, (l) => (l[2] < -0.75 && Math.abs(l[1]) < 0.3 ? { hole: true } : null));
      sc.dot([1.03 + wave, 1, 2.28], DOT.white, 0.12);
      sc.dot([1.03 + wave, 0.9, 2.2], DOT.white, 0.12);
      sc.dot([1.03 + wave, 1.1, 2.2], DOT.white, 0.12);
    },
    { w: 1, h: 1, height: 3.2, pad: 6, shadow: { w: 0.35, h: 0.35, a: 45 } },
  );
}

/** The campfire ring of stones with crossed logs (the flames are a separate animated sprite). */
export function renderFirePit(): IsoSprite {
  return renderModel(
    (sc) => {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        sc.sphere([1 + Math.cos(a) * 0.68, 1 + Math.sin(a) * 0.68, 0.1], 0.16 + hash2(i, 1, 9) * 0.06, MAT.rock, aboveGround);
      }
      sc.limb([0.6, 0.7, 0.12], [1.45, 1.3, 0.3], 0.09, 0.08, MAT.woodDark, undefined);
      sc.limb([1.4, 0.65, 0.12], [0.65, 1.35, 0.3], 0.09, 0.08, MAT.woodDark, undefined);
      for (let i = 0; i < 4; i++) sc.dot([0.85 + i * 0.1, 0.9 + (i % 2) * 0.15, 0.3], i % 2 ? DOT.ember : 0xf07038, 0.3);
      // log seats around the fire
      sc.limb([0.15, 1.9, 0.14], [1.1, 2.3, 0.14], 0.14, 0.14, MAT.wood, aboveGround);
      sc.limb([1.9, 0.2, 0.14], [2.3, 1.1, 0.14], 0.14, 0.14, MAT.wood, aboveGround);
    },
    { w: 1, h: 1, height: 0.8, pad: 10, shadow: false },
  );
}

/** Flames over the fire pit: 4 frames, 11 x 13 gp, bottom centre at the pit's middle. */
export function renderFlames(frame: number): Pix {
  const px = new Pix(11, 13);
  const F = [0xfff4c0, 0xffd468, 0xf6a048, 0xe06838, 0xa83a2c];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const seed = frame * 7 + i;
    const bx = 2 + hash2(i, frame, 11) * 6;
    const h = 5 + hash2(seed, 2, 13) * 7;
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const w = Math.max(1, Math.round((1 - t) * 2.6 + hash2(seed, y, 17) * 0.8));
      const sx = Math.round(bx + Math.sin(y * 0.9 + frame * 1.7 + i) * 0.8 * t);
      const c = F[Math.min(4, Math.floor((t + hash2(seed, y, 19) * 0.3) * 3.4))];
      for (let x = -w; x <= w; x++) px.set(sx + x, 12 - y, c);
    }
  }
  // glowing core
  px.rect(4, 10, 3, 2, F[0]);
  return px;
}

/** A soft warm glow disc (for fires at dusk and night); alpha falls off to the rim. */
export function renderGlow(r: number, color = 0xffb060): Pix {
  const px = new Pix(r * 2, r);
  for (let y = 0; y < r; y++)
    for (let x = 0; x < r * 2; x++) {
      const u = (x - r + 0.5) / r;
      const v = (y - r / 2 + 0.5) / (r / 2);
      const d = Math.sqrt(u * u + v * v);
      if (d > 1) continue;
      px.set(x, y, color, Math.round((1 - d) ** 2 * 110));
    }
  return px;
}

/** A stack of crates (look 0), amphorae (1), sacks (2), hay (3) or barrels (4). Half a tile. */
export function renderProps(look: number): IsoSprite {
  return renderModel(
    (sc) => {
      switch (look % 5) {
        case 0:
          crate(sc, 0.5, 0.6, 0, 0.32);
          crate(sc, 1.2, 0.55, 0, 0.28);
          crate(sc, 0.75, 0.6, 0.64, 0.24);
          break;
        case 1:
          amphora(sc, 0.4, 0.6, 0);
          amphora(sc, 0.9, 0.45, 0);
          amphora(sc, 1.3, 0.8, 0);
          break;
        case 2:
          sack(sc, 0.5, 0.5, 0, 0.3);
          sack(sc, 1.1, 0.45, 0, 0.28);
          sack(sc, 0.8, 0.9, 0, 0.3);
          break;
        case 3:
          sc.ellipsoid([0.9, 0.7, 0.3], [0.7, 0, 0], [0, 0.5, 0], [0, 0, 0.45], MAT.straw, aboveGround);
          break;
        default:
          barrel(sc, 0.5, 0.5);
          barrel(sc, 1.15, 0.6);
          barrel(sc, 0.8, 0.6 + 0.0);
          break;
      }
    },
    { w: 1, h: 1, height: 1.2, pad: 6, shadow: { w: 0.7, h: 0.5, a: 50 } },
  );
}

/** A tree: `kind` 0 round oak, 1 olive (grey-green, gnarled), 2 cypress (tall, dark). Frame 1 sways the canopy. */
export function renderTree(kind: number, seed = 0, frame = 0): IsoSprite {
  const sway = frame ? 0.1 : 0;
  const r = (i: number) => hash2(seed, i, 23);
  const k = kind % 3;
  const height = k === 2 ? 5.2 : 3.8;
  return renderModel(
    (sc) => {
      const cx = 1;
      const cy = 1;
      if (k === 2) {
        sc.limb([cx, cy, 0], [cx, cy, 0.8], 0.14, 0.12, MAT.woodDark, aboveGround);
        sc.ellipsoid([cx + sway, cy - sway, 2.8], [0.55, 0, 0], [0, 0.55, 0], [0, 0, 2.2], MAT.cypress, (l) => (Math.floor((l[2] + 1) * 7) % 2 ? { shade: 0.45 } : null));
        sc.ellipsoid([cx + sway * 1.3, cy - sway * 1.3, 4.6], [0.3, 0, 0], [0, 0.3, 0], [0, 0, 0.7], MAT.cypress);
        return;
      }
      const leaf = k === 1 ? MAT.leafOlive : r(0) < 0.5 ? MAT.leaf : MAT.leafDark;
      sc.limb([cx, cy, 0], [cx + (r(1) - 0.5) * 0.3, cy + (r(2) - 0.5) * 0.3, 1.5], 0.2, 0.14, MAT.woodDark, aboveGround);
      const n = k === 1 ? 4 : 5;
      sc.group();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r(3);
        const d = i === 0 ? 0 : 0.55 + r(4 + i) * 0.3;
        const rr = i === 0 ? 1.15 : 0.65 + r(10 + i) * 0.35;
        const z = 2.1 + (i === 0 ? 0.2 : r(20 + i) * 0.7 - 0.2);
        sc.sphere([cx + Math.cos(a) * d + sway * (1 + z * 0.2), cy + Math.sin(a) * d - sway * (1 + z * 0.2), z], rr, leaf, (_l, w) => (w[2] < z - rr * 0.45 ? { shade: 0.8 } : null));
      }
    },
    { w: 1, h: 1, height, pad: 14, shadow: { w: 1.1, h: 1.1, dx: 6, dy: 3, a: 55 } },
  );
}

/** A rock cluster (look 0..2); 2 x 1 tiles for the big one. */
export function renderRocks(look: number, seed = 0): IsoSprite {
  const big = look % 3 === 0;
  const r = (i: number) => hash2(seed, i, 31);
  return renderModel(
    (sc) => {
      const n = big ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const x = 0.6 + r(i) * (big ? 2.8 : 0.9);
        const y = 0.5 + r(i + 7) * 1.0;
        const rx = 0.45 + r(i + 11) * (big ? 0.7 : 0.35);
        const ry = 0.4 + r(i + 13) * 0.4;
        const rz = 0.35 + r(i + 17) * (big ? 0.9 : 0.4);
        const th = r(i + 19) * Math.PI;
        const c = Math.cos(th);
        const s = Math.sin(th);
        sc.ellipsoid([x, y, rz * 0.6], [c * rx, s * rx, 0], [-s * ry, c * ry, 0], [0, 0, rz], r(i + 23) < 0.4 ? MAT.rockMauve : MAT.rock, (l, w) => (w[2] < -0.01 ? { hole: true } : l[2] > 0.55 ? { shade: -0.5 } : null));
      }
    },
    { w: big ? 2 : 1, h: 1, height: 2.2, pad: 10, shadow: { w: big ? 1.8 : 0.9, h: 0.9, a: 55 } },
  );
}

/** A ruined temple: columns, a broken architrave, a fallen drum. 3 x 2 tiles. */
export function renderRuin(): IsoSprite {
  return renderModel(
    (sc) => {
      const flutes: Shader = (_l, w) => (Math.floor((Math.atan2(w[1], w[0]) / Math.PI) * 9) % 2 ? { shade: 0.5 } : null);
      const col = (x: number, y: number, h: number, broken = false) => {
        sc.limb([x, y, 0], [x, y, h], 0.3, 0.26, MAT.stoneCream, (_l, w) => (w[2] < 0 ? { hole: true } : flutes(_l, [w[0] - x, w[1] - y, w[2]])));
        box(sc, [x, y, 0.12], 0.4, 0.4, 0.12, MAT.stoneCream);
        if (!broken) box(sc, [x, y, h + 0.1], 0.42, 0.42, 0.1, MAT.stoneCream);
      };
      col(0.8, 0.8, 3.2);
      col(0.8, 3.2, 3.2);
      col(3.0, 0.8, 1.6, true);
      col(5.2, 0.8, 3.2);
      // architrave across the standing pair on the left
      box(sc, [0.8, 2.0, 3.55], 0.5, 1.7, 0.25, MAT.stoneCream, courses(3, 0.4));
      box(sc, [3.0, 0.8, 3.55], 2.7, 0.5, 0.25, MAT.stoneCream, (l) => (l[0] > 0.2 && l[0] < 0.5 && l[2] > -0.4 ? { hole: true } : null));
      // a fallen drum and rubble
      sc.ellipsoid([3.6, 3.0, 0.3], [0.5, 0.4, 0], [-0.24, 0.3, 0], [0, 0, 0.3], MAT.stoneCream, aboveGround);
      sc.sphere([4.6, 2.6, 0.12], 0.18, MAT.stone, aboveGround);
      sc.sphere([2.4, 3.4, 0.1], 0.14, MAT.stone, aboveGround);
    },
    { w: 3, h: 2, height: 4.2, pad: 12, shadow: { w: 2.6, h: 1.8, a: 45 } },
  );
}

/** The beached trireme: hull with its eye and ram, deck, mast with the furled sail, oars down on the sand. 7 x 2 tiles, bow towards +X. */
export function renderShip(alongY = false): IsoSprite {
  const r = renderModel(
    (sc) => {
      const cx = 7;
      const cy = 2;
      sc.group();
      // hull: a long ellipsoid, the keel under the sand, a red band at the gunwale, planks below
      sc.ellipsoid([cx, cy, 0.55], [6.0, 0, 0], [0, 1.35, 0], [0, 0, 1.05], MAT.hull, (_l, w) => {
        if (w[2] < 0.05) return { hole: true };
        if (w[2] > 1.3) return { ramp: MAT.redDark.ramp };
        return Math.floor(w[2] * 5) % 2 ? { shade: 0.5 } : null;
      });
      // deck (a dark plank floor) and the rowing benches
      sc.group();
      box(sc, [cx, cy, 1.4], 5.2, 1.0, 0.08, MAT.woodDark, (l) => (Math.floor((l[0] + 1) * 12) % 2 ? { shade: 0.5 } : null));
      for (let i = -4; i <= 4; i++) box(sc, [cx + i * 1.1, cy, 1.58], 0.14, 0.95, 0.1, MAT.plank);
      // stem post curling up at the bow, the bronze ram at the waterline, the stern's swan neck
      sc.limb([cx + 5.6, cy, 1.1], [cx + 6.6, cy, 2.6], 0.2, 0.12, MAT.hullDark, undefined);
      sc.limb([cx + 5.8, cy, 0.35], [cx + 6.9, cy, 0.3], 0.26, 0.1, MAT.bronze, undefined);
      sc.limb([cx - 5.6, cy, 1.1], [cx - 6.4, cy, 2.4], 0.2, 0.12, MAT.hullDark, undefined);
      sc.limb([cx - 6.4, cy, 2.4], [cx - 6.0, cy, 3.1], 0.12, 0.14, MAT.hullDark, undefined);
      // the eye on the bow (camera-facing +Y side)
      sc.dot([cx + 4.9, cy + 1.33, 1.0], DOT.white, 0.25);
      sc.dot([cx + 4.9, cy + 1.33, 1.1], DOT.white, 0.25);
      sc.dot([cx + 5.0, cy + 1.34, 1.05], DOT.blue, 0.25);
      sc.dot([cx + 4.8, cy + 1.34, 1.05], DOT.ink, 0.25);
      // mast, yard and the furled sail
      sc.line([cx, cy, 1.4], [cx, cy, 6.6], MAT.wood, 2);
      sc.line([cx - 3.4, cy, 5.6], [cx + 3.4, cy, 5.6], MAT.woodDark, 1);
      sc.ellipsoid([cx, cy, 5.45], [3.3, 0, 0], [0, 0.34, 0], [0, 0, 0.3], MAT.sail, (l) => (Math.floor((l[0] + 1) * 6) % 2 ? { shade: 0.6 } : null));
      sc.line([cx - 3.4, cy, 5.6], [cx - 5.6, cy, 1.5], MAT.rope, 1);
      sc.line([cx + 3.4, cy, 5.6], [cx + 5.6, cy, 1.5], MAT.rope, 1);
      // shields along the gunwale and oars resting on the sand
      for (let i = -4; i <= 4; i++) {
        const x = cx + i * 1.1 + 0.5;
        sc.ellipsoid([x, cy + 1.3, 1.5], [0.26, 0, 0], [0, 0.05, 0], [0, 0, 0.26], i % 2 ? MAT.red : MAT.cream, (l) => (l[0] * l[0] + l[2] * l[2] > 0.8 ? { ramp: MAT.bronze.ramp } : null));
        sc.line([x - 0.3, cy + 1.2, 1.15], [x + 0.4, cy + 2.9, 0.02], MAT.wood, 1);
        sc.line([x - 0.3, cy - 1.2, 1.15], [x + 0.4, cy - 2.9, 0.02], MAT.wood, 1);
      }
      // a gangplank down to the sand at the stern
      sc.box([cx - 4.4, cy + 1.9, 0.6], [0.3, 0, 0], [0, 1.1, -0.55], [0, 0.03, 0.05], MAT.plank);
      if (alongY) {
        // the same ship with its keel along Y (swap the axes about the footprint's diagonal)
        for (const p of sc.prims) {
          p.c = [p.c[1], p.c[0], p.c[2]];
          p.a = p.a.map((a) => [a[1], a[0], a[2]] as V3) as [V3, V3, V3];
        }
        for (const l of sc.lines) {
          l.p0 = [l.p0[1], l.p0[0], l.p0[2]];
          l.p1 = [l.p1[1], l.p1[0], l.p1[2]];
        }
        for (const d of sc.dots) d.p = [d.p[1], d.p[0], d.p[2]];
      }
    },
    alongY ? { w: 2, h: 7, height: 7.2, pad: 16, shadow: { w: 1.6, h: 6.2, dx: 4, dy: 2, a: 60 } } : { w: 7, h: 2, height: 7.2, pad: 16, shadow: { w: 6.2, h: 1.6, dx: 4, dy: 2, a: 60 } },
  );
  return r;
}

/** An empty building plot: a tan / pink checker diamond with a dotted orange-brown rim (ART_STYLE §13). 2 x 2 tiles. */
export function renderPlot(active = false): Pix {
  const w = TILE_W * 2;
  const h = TILE_H * 2;
  const px = new Pix(w + 2, h + 2);
  const a = active ? 0xfde0ae : 0xe8d2a8;
  const b = active ? 0xe8b8b0 : 0xc8a888;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5 - w / 2) / (w / 2);
      const v = (y + 0.5 - h / 2) / (h / 2);
      if (Math.abs(u) + Math.abs(v) > 1) continue;
      if (((x >> 1) + (y >> 1)) % 2 === 0) px.set(x + 1, y + 1, (x + y) % 2 ? a : b, 150);
      else px.set(x + 1, y + 1, a, 90);
    }
  // dotted rim
  for (let k = 0; k < w; k += 2) {
    const yy = Math.round(Math.abs(k - w / 2) * (h / w));
    px.set(k + 1, yy + 1, 0xb06030);
    px.set(k + 1, h - yy, 0xb06030);
  }
  return px;
}

/** Slot marker: a dotted diamond, cyan when the structure may go there, red when not. 2 x 2 tiles. */
export function renderSlotMark(ok: boolean): Pix {
  const w = TILE_W * 2;
  const h = TILE_H * 2;
  const px = new Pix(w + 2, h + 2);
  const c = ok ? 0x7fd0e0 : 0xb83d4a;
  for (let k = 0; k < w; k += 2) {
    const yy = Math.round(Math.abs(k - w / 2) * (h / w));
    px.set(k + 1, yy + 1, c);
    px.set(k + 1, h - yy, c);
  }
  for (let y = 1; y < h; y++)
    for (let x = 1; x < w; x++) {
      const u = (x - w / 2) / (w / 2);
      const v = (y - h / 2) / (h / 2);
      if (Math.abs(u) + Math.abs(v) < 0.92 && (x + y) % 4 === 0) px.set(x + 1, y + 1, c, 90);
    }
  return px;
}

/** A w x h tile diamond tint (the footprint of a placement ghost per tile). */
export function renderTileTint(ok: boolean): Pix {
  const px = new Pix(TILE_W + 2, TILE_H + 2);
  const c = ok ? 0x7fd0e0 : 0xb83d4a;
  for (let y = 0; y < TILE_H; y++)
    for (let x = 0; x < TILE_W; x++) {
      const u = (x + 0.5 - TILE_W / 2) / (TILE_W / 2);
      const v = (y + 0.5 - TILE_H / 2) / (TILE_H / 2);
      const d = Math.abs(u) + Math.abs(v);
      if (d > 1) continue;
      px.set(x + 1, y + 1, c, d > 0.85 ? 200 : (x + y) % 2 ? 70 : 40);
    }
  return px;
}

/** The rope-and-peg boundary of the drill yard (w x h tiles). */
export function renderYard(w: number, h: number): IsoSprite {
  return renderModel(
    (sc) => {
      const W = w * CELL;
      const H = h * CELL;
      const corners: V3[] = [[0.3, 0.3, 0.3], [W - 0.3, 0.3, 0.3], [W - 0.3, H - 0.3, 0.3], [0.3, H - 0.3, 0.3]];
      for (let i = 0; i < 4; i++) {
        sc.line(corners[i], corners[(i + 1) % 4], MAT.rope, 1);
        sc.limb([corners[i][0], corners[i][1], 0], [corners[i][0], corners[i][1], 0.45], 0.06, 0.04, MAT.woodDark, aboveGround);
      }
    },
    { w, h, height: 0.8, pad: 6, shadow: false },
  );
}

/** The cream dust puff of a placement (3 frames, 20 x 12). */
export function renderDust(frame: number): Pix {
  const px = new Pix(20, 12);
  const n = 6 + frame * 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 2 + frame * 3 + hash2(i, frame, 3) * 2;
    const x = Math.round(10 + Math.cos(a) * r);
    const y = Math.round(7 + Math.sin(a) * r * 0.5 - frame);
    const s = frame === 0 ? 2 : 1;
    px.rect(x, y, s, s, hash2(i, frame, 4) < 0.5 ? 0xf0dcc4 : 0xd8bfa4);
  }
  return px;
}

/** Construction stage 0: pegs and string around the footprint, a timber pile; stage 1 adds the frame poles. */
export function renderSite(w: number, h: number, stage: 0 | 1): IsoSprite {
  return renderModel(
    (sc) => {
      const W = w * CELL;
      const H = h * CELL;
      const corners: V3[] = [[0.2, 0.2, 0.08], [W - 0.2, 0.2, 0.08], [W - 0.2, H - 0.2, 0.08], [0.2, H - 0.2, 0.08]];
      for (let i = 0; i < 4; i++) {
        sc.line(corners[i], corners[(i + 1) % 4], MAT.rope, 1);
        sc.limb([corners[i][0], corners[i][1], 0], [corners[i][0], corners[i][1], 0.3], 0.05, 0.03, MAT.woodDark, aboveGround);
      }
      for (let i = 0; i < 3; i++) sc.limb([W * 0.3, H * 0.4 + i * 0.22, 0.12 + (i === 1 ? 0.22 : 0)], [W * 0.7, H * 0.4 + i * 0.22 + 0.1, 0.12 + (i === 1 ? 0.22 : 0)], 0.1, 0.1, MAT.wood, aboveGround);
      if (stage === 1) {
        for (const c of corners) sc.limb([c[0] + 0.2, c[1] + 0.2, 0], [c[0] + 0.2, c[1] + 0.2, 1.6], 0.07, 0.06, MAT.woodDark, aboveGround);
        sc.line([0.4, 0.4, 1.6], [W - 0.4, 0.4, 1.6], MAT.wood, 1);
        sc.line([0.4, 0.4, 1.6], [0.4, H - 0.4, 1.6], MAT.wood, 1);
        sc.line([W - 0.4, 0.4, 1.6], [W - 0.4, H - 0.4, 1.6], MAT.wood, 1);
        sc.line([0.4, H - 0.4, 1.6], [W - 0.4, H - 0.4, 1.6], MAT.wood, 1);
        sack(sc, W - 0.6, H - 0.6, 0, 0.26);
      }
    },
    { w, h, height: 2.0, pad: 8, shadow: false },
  );
}

/** A structure sprite cut down to its lower part (the half-built look of stage 2). */
export function cutSprite(s: IsoSprite, keep: number): IsoSprite {
  const px = new Pix(s.px.w, s.px.h);
  const top = s.oy - Math.round((s.oy - 0) * keep);
  for (let y = 0; y < s.px.h; y++) {
    if (y < top) continue;
    for (let x = 0; x < s.px.w; x++) {
      const a = s.px.alpha(x, y);
      if (a) px.set(x, y, s.px.get(x, y), a);
    }
  }
  return { px, ox: s.ox, oy: s.oy };
}

// ---------------------------------------------------------------- small animated sprites (hand-drawn)

/** A goat, 2 frames (grazing / head up), 11 x 9 gp, feet at the bottom. */
export function renderGoat(frame: number, flip = false): Pix {
  const px = new Pix(11, 9);
  const C = { b: 0xe8dcc4, s: 0xbca890, d: 0x6a5648, h: 0x4a3a30, e: 0x2a1c18 };
  const body = ['..bbbbbb...', '.bbbbbbbb..', '.bbbbbbbbb.', '.sbbbbbbbs.', '..d.ss..d..', '..d.....d..'];
  const head0 = ['h..', 'hb.', 'bbs', '.bs'];
  px.bitmap(0, 1, body, { b: C.b, s: C.s, d: C.d }, flip);
  // head: grazing (low, front) or up
  const hx = flip ? 0 : 8;
  if (frame === 0) px.bitmap(hx, 4, head0, { h: C.h, b: C.b, s: C.s }, flip);
  else px.bitmap(hx, 0, ['h.h', '.bb', 'bbs', '.s.'], { h: C.h, b: C.b, s: C.s }, flip);
  px.set(flip ? 1 : 9, frame === 0 ? 5 : 1, C.e);
  // legs (frame 1 shifts one leg)
  px.set(flip ? 8 : 2, 7, C.d);
  px.set(flip ? 8 : 2, 8, C.d);
  px.set(flip ? 2 : 8, 7, C.d);
  px.set(flip ? 2 : 8, 8, C.d);
  px.set(flip ? 7 : 3, 8, C.s);
  px.set(flip ? 3 : 7 + (frame ? 1 : 0), 8, C.s);
  return px;
}

/** A hen, 2 frames (pecking), 6 x 6 gp. */
export function renderHen(frame: number, flip = false): Pix {
  const px = new Pix(6, 6);
  const C = { b: 0xeadfc8, r: 0xc84a3c, y: 0xe0b040, d: 0x6a5648 };
  if (frame === 0) px.bitmap(0, 0, ['...r..', '..bb..', '.bbbb.', 'bbbby.', '.bbb..', '.d.d..'], { b: C.b, r: C.r, y: C.y, d: C.d }, flip);
  else px.bitmap(0, 0, ['......', '......', '.bbb..', 'bbbbr.', '.bbbby', '.d.d..'], { b: C.b, r: C.r, y: C.y, d: C.d }, flip);
  return px;
}

/** A gull in flight, 2 frames (wings up / down), 7 x 4 gp. */
export function renderBird(frame: number): Pix {
  const px = new Pix(7, 4);
  const c = 0x5a4e58;
  if (frame === 0) px.bitmap(0, 0, ['c.....c', '.c...c.', '..ccc..', '.......'], { c });
  else px.bitmap(0, 0, ['.......', '..ccc..', '.c...c.', 'c.....c'], { c });
  return px;
}

/** Foam pixels at the shore (2 frames) drawn as a tiny sprite scattered along the waterline. */
export function renderFoam(frame: number): Pix {
  const px = new Pix(7, 3);
  const c = 0xf4f8f2;
  if (frame === 0) px.bitmap(0, 0, ['.c..c..', 'c.cc.cc', '.......'], { c });
  else px.bitmap(0, 0, ['.......', '.c.c.c.', 'c..c..c'], { c });
  return px;
}

// ---------------------------------------------------------------- ground

export const G = { grass: 0, mown: 1, dirt: 2, sand: 3, sea: 4, forest: 5, rock: 6, deep: 7 } as const;
export type GroundKind = (typeof G)[keyof typeof G];

export interface GroundSpec {
  /** Tiles. */
  w: number;
  h: number;
  kinds: Uint8Array;
  seed: number;
  /** Tiles of the camp clearing get the faint diamond grid and a dotted border. */
  clearing?: Uint8Array;
}

/** Pixel size and origin of the ground image of a w x h tile window. */
export function groundLayout(w: number, h: number): { pw: number; ph: number; ox: number; oy: number } {
  return { pw: (w + h) * (TILE_W / 2), ph: (w + h) * (TILE_H / 2) + 2, ox: h * (TILE_W / 2), oy: 1 };
}

const GRASS = { base: 0x8e9a52, dark: 0x76844a, darker: 0x66733e, light: 0xa2ac5c, straw: 0xbdbd6a, tuftL: 0xcdc67a } as const;
const MOWN = { base: 0xb2b468, alt: 0xa9ac60, light: 0xc4c272, line: 0x9ea258, dot: 0xd0cc82 } as const;
const DIRT = { base: 0xc6a476, dark: 0xaa885c, light: 0xd8bc8e, pebble: 0x8e6e4c } as const;
const SAND = { base: 0xeedcb4, dark: 0xdcc69a, wet: 0xd4ba92, light: 0xf6e8c8 } as const;
const SEA = { shelf: 0x9cc8cc, light: 0x6fb0bc, mid: 0x4f96aa, deep: 0x3c7c96, foam: 0xf2f8f4, streak: 0x5ea4b4 } as const;
const FOREST = { base: 0x6e7c44, dark: 0x5a683a, light: 0x82905a } as const;
const ROCK = { base: 0xa39a94, dark: 0x8a8078, light: 0xb8b0a8 } as const;

/**
 * The ground of the camp window: every tile's kind blended with wobbling
 * edges, grass in wind-combed drifts of tufts, mown clearing tiles with the
 * faint iso grid, dirt paths with pebbles, stippled sand, the sea in
 * concentric shelves with foam at the waterline.
 */
export function renderIsoGround(spec: GroundSpec): Pix {
  const { w, h, kinds, seed } = spec;
  const L = groundLayout(w, h);
  const px = new Pix(L.pw, L.ph);
  const kindAt = (tx: number, ty: number): number => (tx < 0 || ty < 0 || tx >= w || ty >= h ? kinds[Math.max(0, Math.min(h - 1, ty)) * w + Math.max(0, Math.min(w - 1, tx))] : kinds[ty * w + tx]);
  const sea = (k: number) => k === G.sea || k === G.deep;
  // distance (tiles) of every tile to the nearest land / sea tile (for shore bands)
  const toLand = new Float32Array(w * h).fill(99);
  const toSea = new Float32Array(w * h).fill(99);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = kinds[y * w + x];
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nk = kinds[ny * w + nx];
          const d = Math.hypot(dx, dy);
          if (sea(k) && !sea(nk)) toLand[y * w + x] = Math.min(toLand[y * w + x], d);
          if (!sea(k) && sea(nk)) toSea[y * w + x] = Math.min(toSea[y * w + x], d);
        }
    }
  const bil = (arr: Float32Array, fx: number, fy: number): number => {
    const x0 = Math.max(0, Math.min(w - 1, Math.floor(fx - 0.5)));
    const y0 = Math.max(0, Math.min(h - 1, Math.floor(fy - 0.5)));
    const x1 = Math.min(w - 1, x0 + 1);
    const y1 = Math.min(h - 1, y0 + 1);
    const tx = Math.max(0, Math.min(1, fx - 0.5 - x0));
    const ty = Math.max(0, Math.min(1, fy - 0.5 - y0));
    const a = arr[y0 * w + x0];
    const b = arr[y0 * w + x1];
    const c = arr[y1 * w + x0];
    const d = arr[y1 * w + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
  const tuft: number[] = [];
  for (let y = 0; y < L.ph; y++) {
    for (let x = 0; x < L.pw; x++) {
      const sx = x - L.ox;
      const sy = y - L.oy;
      const t = screenTile(sx, sy);
      // organic edges: wobble the tile lookup
      const wob = (valueNoise(x, y, 9, seed) - 0.5) * 0.55;
      const wob2 = (valueNoise(x + 500, y, 9, seed + 1) - 0.5) * 0.55;
      const tx = t.x + wob;
      const ty = t.y + wob2;
      if (tx < -0.5 || ty < -0.5 || tx > w + 0.5 || ty > h + 0.5) continue;
      const ix = Math.floor(tx);
      const iy = Math.floor(ty);
      const k = kindAt(ix, iy);
      const n = hash2(x, y, seed);
      const drift = valueNoise(x * 0.35, y, 26, seed + 7);
      let c: number;
      switch (k) {
        case G.grass:
        case G.forest: {
          const dark = k === G.forest;
          c = dark ? (drift < 0.45 ? FOREST.dark : drift > 0.7 ? FOREST.light : FOREST.base) : drift < 0.4 ? GRASS.dark : drift > 0.68 ? GRASS.light : GRASS.base;
          if (n < (dark ? 0.1 : 0.17)) tuft.push(x, y, dark ? (n < 0.03 ? FOREST.light : FOREST.dark) : drift > 0.6 ? (n < 0.05 ? GRASS.tuftL : GRASS.straw) : n < 0.06 ? GRASS.darker : GRASS.dark);
          // a few flowers on open grass
          if (!dark && n > 0.996) c = hash2(y, x, 5) < 0.5 ? 0xf0e0a0 : 0xe8a8b0;
          break;
        }
        case G.mown: {
          const stripe = Math.floor(t.x * 2 + t.y * 2) % 2 === 0;
          c = stripe ? MOWN.base : MOWN.alt;
          if (n < 0.05) c = MOWN.light;
          else if (n > 0.985) c = MOWN.dot;
          // the faint diamond grid along the tile edges
          const fx = t.x - Math.floor(t.x);
          const fy = t.y - Math.floor(t.y);
          if (fx < 0.045 || fy < 0.045) c = MOWN.line;
          break;
        }
        case G.dirt: {
          const v = valueNoise(x, y, 5, seed + 3);
          c = v < 0.35 ? DIRT.dark : v > 0.7 ? DIRT.light : DIRT.base;
          if (n < 0.04) c = DIRT.pebble;
          else if (n > 0.97) c = 0xe6cfa4;
          break;
        }
        case G.sand: {
          const ds = bil(toSea, tx, ty);
          c = ds < 0.55 ? SAND.wet : n < 0.09 ? SAND.dark : n > 0.95 ? SAND.light : SAND.base;
          if (ds < 0.75 && ds >= 0.55 && n < 0.3) c = SAND.wet;
          if (n > 0.992) c = 0xb8a080;
          break;
        }
        case G.sea:
        case G.deep: {
          const dl = bil(toLand, tx, ty) + (valueNoise(x, y, 6, seed + 9) - 0.5) * 0.35;
          c = dl < 0.42 ? SEA.shelf : dl < 0.95 ? SEA.light : dl < 1.9 || k === G.sea ? SEA.mid : SEA.deep;
          // horizontal streaks and sparkle
          if (((x + Math.floor(y / 3) * 7) % 23 === 0 && y % 3 === 0) || n > 0.995) c = dl < 0.95 ? SEA.foam : SEA.streak;
          if (dl < 0.5 && dl > 0.3 && ((x + y * 2) % 5 === 0) && n < 0.6) c = SEA.foam;
          break;
        }
        default: {
          const v = valueNoise(x, y, 7, seed + 5);
          c = v < 0.4 ? ROCK.dark : v > 0.7 ? ROCK.light : ROCK.base;
          if (n < 0.05) c = 0x7a7068;
        }
      }
      px.set(x, y, c);
    }
  }
  // grass tufts: short vertical strokes, lighter ones gather on the top of the drifts
  for (let i = 0; i < tuft.length; i += 3) {
    const x = tuft[i];
    const y = tuft[i + 1];
    const c = tuft[i + 2];
    const len = 1 + Math.floor(hash2(x, y, 77) * 3);
    for (let k = 0; k < len; k++) if (px.alpha(x, y - k)) px.set(x, y - k, c);
  }
  // the clearing's dotted border (ART_STYLE: the plot motif), every other pixel along the tile edges
  if (spec.clearing) {
    const inC = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < w && ty < h && !!spec.clearing![ty * w + tx];
    for (let ty = 0; ty < h; ty++)
      for (let tx = 0; tx < w; tx++) {
        if (!inC(tx, ty)) continue;
        const o = tileScreen(tx, ty);
        const edges: [boolean, number, number, number, number][] = [
          [!inC(tx, ty - 1), 0, 0, 1, -0.5], // top-right edge: from top corner towards right corner
          [!inC(tx - 1, ty), 0, 0, -1, -0.5], // top-left edge
          [!inC(tx, ty + 1), -16, 8, 1, 0.5], // bottom-left edge: from left corner down to bottom
          [!inC(tx + 1, ty), 16, 8, -1, 0.5], // bottom-right edge
        ];
        for (const [on, x0, y0, dx, dy] of edges) {
          if (!on) continue;
          for (let k = 0; k < 16; k += 2) {
            const x = L.ox + o.x + x0 + dx * k;
            const y = L.oy + o.y + y0 + Math.round(dy * k);
            px.set(x, y, 0xb06030);
          }
        }
      }
  }
  return px;
}

// ---------------------------------------------------------------- UI chrome

/** The vertical column toolbar (ref: an Ionic column in rose stone): capital, fluted shaft, base. */
export function renderColumn(w: number, h: number): Pix {
  const px = new Pix(w, h);
  const C = { lit: 0xf2dcd4, base: 0xe4c4bc, flute: 0xd0a8a4, dark: 0xb8888a, ink: 0x8a4a48, cream: 0xf8ece4 };
  const capH = 12;
  const baseH = 9;
  // shaft with flutes
  px.rect(2, capH, w - 4, h - capH - baseH, C.base);
  for (let x = 3; x < w - 3; x += 4) {
    px.vline(x, capH, h - baseH - 1, C.flute);
    px.vline(x + 1, capH, h - baseH - 1, C.lit);
  }
  px.vline(2, capH, h - baseH - 1, C.lit);
  px.vline(w - 3, capH, h - baseH - 1, C.dark);
  // capital: abacus slab and two volutes
  px.rect(0, 0, w, 3, C.lit);
  px.rect(0, 3, w, 2, C.base);
  px.rect(1, 5, w - 2, 7, C.base);
  px.hline(0, w - 1, 2, C.dark);
  for (const vx of [3, w - 4]) {
    px.ellipse(vx - 3, 4, 7, 7, (_x, _y, edge, u, v) => (edge ? C.ink : u * u + v * v < 0.25 ? C.dark : C.lit));
  }
  // base: a torus and a plinth
  px.rect(1, h - baseH, w - 2, 3, C.lit);
  px.rect(0, h - baseH + 3, w, 4, C.base);
  px.rect(0, h - 2, w, 2, C.dark);
  px.hline(0, w - 1, h - baseH + 3, C.dark);
  // ink sel-out
  px.outline(C.ink);
  return px;
}

/** A parchment strip with a stitched edge for the resource bar / bottom panel (rose-parchment like the ref). */
export function renderStrip(w: number, h: number): Pix {
  const px = new Pix(w, h);
  const C = { base: 0xf0dccc, light: 0xf8ece0, dark: 0xd8b8a8, ink: 0x8a4a48 };
  px.rect(0, 0, w, h, C.base);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (hash2(x, y, 3) < 0.05) px.set(x, y, hash2(y, x, 4) < 0.5 ? C.light : C.dark);
  px.hline(0, w - 1, 0, C.light);
  px.hline(0, w - 1, h - 1, C.dark);
  px.vline(0, 0, h - 1, C.light);
  px.vline(w - 1, 0, h - 1, C.dark);
  // stitched inner border (dotted)
  for (let x = 2; x < w - 2; x += 2) {
    px.set(x, 2, C.ink);
    px.set(x, h - 3, C.ink);
  }
  for (let y = 2; y < h - 2; y += 2) {
    px.set(2, y, C.ink);
    px.set(w - 3, y, C.ink);
  }
  return px;
}

/** A sunburst "end day" badge (the ref's bottom-right medallion), 22 x 16. */
export function renderSunburst(w = 22, h = 16): Pix {
  const px = new Pix(w, h);
  const C = { ray: 0xd8a870, sun: 0xf0cc80, ink: 0x8a4a48, sky: 0xf4e0cc };
  px.rect(0, 0, w, h, C.sky);
  const cx = (w - 1) / 2;
  const cy = h - 2;
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    px.line(cx, cy, cx + Math.cos(a) * (w / 2 + 2), cy + Math.sin(a) * (h + 2), C.ray);
  }
  px.ellipse(Math.floor(cx) - 3, cy - 3, 7, 6, (_x, _y, edge) => (edge ? C.ink : C.sun));
  px.outline(C.ink);
  return px;
}
