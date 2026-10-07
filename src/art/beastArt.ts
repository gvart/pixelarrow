/**
 * Mythical beasts and world bosses, posed as 3D models (src/art/model3d.ts)
 * and rendered through the battle camera like the soldiers, so they share the
 * light, the soft outline and the gritty dithered shading, only far bigger.
 *
 * SHEET FORMAT: the soldiers' 13 x 4 grid (src/art/paperdoll.ts FRAME_NAMES /
 * DIRS) per beast, plus a second "special" sheet (DollSpec.pose = 'sp') of 13
 * frames for the signature moves:
 *   cyclops / titan  sp0-2 hurl (crouch, boulder overhead, throw), sp3-5 stomp, sp6-8 quake (fists to the ground)
 *   minotaur         sp0-3 charge (head down at the run), sp4 balked (reeling), sp5-6 roar (enraged)
 *   chimera          sp0-2 fire (rear up, lunge, jaws wide), sp3-4 goat bleat, sp5-6 tail strike
 *   harpy            sp0-3 flying (wing beats), sp4-5 dive (wings swept, talons out)
 *   nemean lion      sp0-2 leap
 *   hydra head       sp0-1 hissing, sp2 rising from the stump (regrowth)
 *   kraken arm       sp0-2 coiling grab
 * Unused special frames repeat idle. Frame sizes are per beast (MYTH_GEOM),
 * feet centred on x at footY.
 */
import { Scene, add, cross, mul, norm, sub, type Material, type V3, type Hit } from './model3d';
import { ramp } from './model3d';
import { BLOOD, BRONZE, DARK_LEATHER as DARK_LEATHER_M, DARK_WOOD, EYE, IRON, IVORY, LEATHER, WOOD } from './materials';
import type { MythId } from '../data/beasts';
import type { SheetGeom } from './paperdoll';

const m = (base: number, extra: Partial<Material> = {}, n = 5): Material => ({ ramp: ramp(base, n), ...extra });

const MAT = {
  scale: m(0x3a5c5a, { grit: 0.55 }),
  scaleDark: m(0x223a3c, { grit: 0.4 }),
  belly: m(0x9a9462, { grit: 0.4 }),
  gold: m(0xd7a440, { grit: 0.35 }),
  giantSkin: m(0xa8784e, { grit: 0.7, contrast: 1.2 }),
  fur: m(0x4a4038, { grit: 0.7 }),
  furDark: m(0x2e241c, { grit: 0.5 }),
  bull: m(0x3e2c22, { grit: 0.6 }),
  harpySkin: m(0x9a9a80, { grit: 0.4, contrast: 0.9 }),
  feather: m(0x3c3440, { grit: 0.55 }),
  featherLight: m(0x6a5a6e, { grit: 0.5 }),
  talon: m(0x2a2422),
  lion: m(0xc8963a, { grit: 0.45 }),
  mane: m(0x8a5a24, { grit: 0.6 }),
  goat: m(0x8e8676, { grit: 0.55 }),
  serpent: m(0x4e6a34, { grit: 0.5 }),
  kraken: m(0x7a3a46, { grit: 0.5 }),
  krakenPale: m(0xc0908a, { grit: 0.35 }),
  stone: m(0x8a8478, { grit: 0.7, contrast: 1.05 }),
  stoneDark: m(0x55524c, { grit: 0.6 }),
  ember: { ramp: [0xfff0a0, 0xffc040, 0xe07020, 0xa03a10, 0x601c08] } as Material,
  eyeGlow: { ramp: [0xfff4b0, 0xf0c040, 0xc08020] } as Material,
  eyeWhite: { ramp: [0xf0ead8, 0xd0c8b0, 0xa89e88] } as Material,
  mouth: { ramp: [0x5a1a18, 0x401210, 0x2a0a0a] } as Material,
  water: { ramp: [0x8ab8c0, 0x5a8a98, 0x3a6474, 0x24485a, 0x163040], contrast: 0.7 } as Material,
  boulder: m(0x7e766a, { grit: 0.7 }),
};

/** Frame size per beast (and its parts). */
export const MYTH_GEOM: Record<MythId, SheetGeom> = {
  hydra: { fw: 144, fh: 112, footY: 92 },
  hydra_head: { fw: 112, fh: 144, footY: 124 },
  cyclops: { fw: 112, fh: 128, footY: 112 },
  harpy: { fw: 64, fh: 64, footY: 54 },
  nemean_lion: { fw: 96, fh: 72, footY: 60 },
  minotaur: { fw: 96, fh: 112, footY: 98 },
  chimera: { fw: 112, fh: 88, footY: 74 },
  kraken: { fw: 176, fh: 144, footY: 116 },
  kraken_arm: { fw: 96, fh: 128, footY: 108 },
  titan: { fw: 144, fh: 160, footY: 142 },
};

interface Basis {
  F: V3;
  R: V3;
  U: V3;
  at(o: V3, f: number, r: number, u: number): V3;
  dir(f: number, r: number, u: number): V3;
}

export function mythBasis(fx: number, fy: number): Basis {
  const F: V3 = [fx, fy, 0];
  const U: V3 = [0, 0, 1];
  const R: V3 = mul(cross(F, U), -1);
  return {
    F,
    R,
    U,
    at: (o, f, r, u) => add(o, add(add(mul(F, f), mul(R, r)), mul(U, u))),
    dir: (f, r, u) => norm(add(add(mul(F, f), mul(R, r)), mul(U, u))),
  };
}

const NAMES = ['idle0', 'idle1', 'walk0', 'walk1', 'walk2', 'walk3', 'atk0', 'atk1', 'atk2', 'hit', 'die0', 'die1', 'die2'];

interface Pose {
  walk: number;
  atk: number;
  hit: boolean;
  die: number;
  idle: number;
  sp: number;
}

function poseOf(frame: number, special: boolean): Pose {
  const p: Pose = { walk: -1, atk: -1, hit: false, die: -1, idle: 0, sp: -1 };
  if (special) {
    p.sp = frame;
    return p;
  }
  const n = NAMES[frame];
  if (n.startsWith('walk')) p.walk = frame - 2;
  else if (n.startsWith('atk')) p.atk = frame - 6;
  else if (n === 'hit') p.hit = true;
  else if (n.startsWith('die')) p.die = frame - 10;
  else p.idle = frame;
  return p;
}

/** Scales and plates: a diagonal pattern of darker rows. */
const scales = (k = 9): ((l: V3) => Hit | null) => (l) => (((Math.floor((l[0] + 2) * k) + Math.floor((l[1] + 2) * k)) & 1) === 0 ? { shade: 0.45 } : null);

/** Build one frame of a mythical beast into the scene (origin at its feet). */
export function buildMyth(sc: Scene, id: MythId, frame: number, B: Basis, special: boolean, variant = 0): void {
  const p = poseOf(frame, special);
  switch (id) {
    case 'cyclops':
      giant(sc, B, p, { H: 3.3, bulk: 1.15, skin: MAT.giantSkin, head: 'cyclops', weapon: 'club', cloth: MAT.fur });
      break;
    case 'titan':
      giant(sc, B, p, { H: 4.4, bulk: 1.25, skin: MAT.stone, head: 'titan', weapon: 'none', cloth: BRONZE });
      break;
    case 'minotaur':
      giant(sc, B, p, { H: 2.7, bulk: 1.1, skin: MAT.bull, head: 'bull', weapon: 'axe', cloth: LEATHER });
      break;
    case 'hydra':
      hydraBody(sc, B, p);
      break;
    case 'hydra_head':
      serpentNeck(sc, B, p, 'hydra', variant);
      break;
    case 'kraken':
      krakenBody(sc, B, p);
      break;
    case 'kraken_arm':
      serpentNeck(sc, B, p, 'kraken', variant);
      break;
    case 'harpy':
      harpy(sc, B, p);
      break;
    case 'nemean_lion':
      cat(sc, B, p, 'lion');
      break;
    case 'chimera':
      cat(sc, B, p, 'chimera');
      break;
  }
}

// ================================================================ giants (cyclops, titan, minotaur)

interface GiantSpec {
  H: number;
  bulk: number;
  skin: Material;
  head: 'cyclops' | 'titan' | 'bull';
  weapon: 'club' | 'axe' | 'none';
  cloth: Material;
}

function giant(sc: Scene, B: Basis, p: Pose, g: GiantSpec): void {
  const H = g.H;
  const o: V3 = [0, 0, 0];
  let lean = 0.04;
  let hip = 0.5 * H;
  let footL: V3 = [0.08 * H, -0.09 * H, 0];
  let footR: V3 = [-0.06 * H, 0.09 * H, 0];
  // hands relative to the shoulders: [forward, out, up] in units of H
  let handR: V3 = [0.1, 0.06, -0.3];
  let handL: V3 = [0.06, -0.06, -0.3];
  let headDown = 0;
  let fall = 0;
  let boulder: V3 | null = null;
  const bob = p.idle === 1 ? -0.008 * H : 0;
  hip += bob;
  if (p.walk >= 0) {
    const s = [1, 0, -1, 0][p.walk];
    const lift = [0, 1, 0, 1][p.walk];
    footL = [0.16 * H * s, -0.09 * H, lift && p.walk === 3 ? 0.06 * H : 0];
    footR = [-0.16 * H * s, 0.09 * H, lift && p.walk === 1 ? 0.06 * H : 0];
    hip -= Math.abs(s) * 0.02 * H;
    lean = 0.08;
    handR = [-0.1 * s, 0.08, -0.28];
    handL = [0.1 * s, -0.08, -0.28];
  }
  if (p.atk === 0) {
    handR = [-0.08, 0.06, 0.28];
    lean = -0.05;
  } else if (p.atk === 1) {
    handR = [0.34, 0.02, -0.12];
    lean = 0.18;
    footL = [0.2 * H, -0.09 * H, 0];
    hip -= 0.04 * H;
  } else if (p.atk === 2) {
    handR = [0.24, 0.1, -0.22];
    lean = 0.1;
  }
  if (p.hit) {
    lean = -0.14;
    handL = [0.16, -0.12, 0.05];
  }
  if (p.die >= 0) {
    fall = [0.35, 0.95, 1.5][p.die];
    hip -= [0.08, 0.16, 0.22][p.die] * H;
    handR = [0.1, 0.25, -0.1];
    handL = [0.1, -0.25, -0.1];
  }
  // signature moves
  if (p.sp >= 0) {
    const sp = p.sp;
    if (g.head === 'bull') {
      if (sp <= 3) {
        // the charge: head down, horns first, at a run
        const s = [1, 0, -1, 0][sp];
        footL = [0.22 * H * s, -0.09 * H, sp % 2 ? 0.08 * H : 0];
        footR = [-0.22 * H * s, 0.09 * H, sp % 2 ? 0 : 0.06 * H];
        lean = 0.45;
        headDown = 0.7;
        hip -= 0.05 * H;
        handR = [-0.14, 0.14, -0.2];
        handL = [-0.1, -0.14, -0.22];
      } else if (sp === 4) {
        lean = -0.2;
        handR = [0.05, 0.3, 0.05];
        handL = [0.05, -0.3, 0.05];
        headDown = -0.3;
      } else if (sp <= 6) {
        // a roar: arms flung wide, head thrown back
        lean = -0.1;
        headDown = -0.55;
        handR = [0.05, 0.32, 0.18];
        handL = [0.05, -0.32, 0.18];
      }
    } else {
      if (sp <= 2) {
        // hurl: crouch and lift the boulder, raise it overhead, throw
        if (sp === 0) {
          hip -= 0.07 * H;
          lean = 0.25;
          handR = [0.3, 0.06, -0.3];
          handL = [0.3, -0.06, -0.3];
        } else if (sp === 1) {
          lean = -0.12;
          handR = [-0.05, 0.05, 0.3];
          handL = [-0.05, -0.05, 0.3];
        } else {
          lean = 0.22;
          handR = [0.36, 0.05, 0.02];
          handL = [0.36, -0.05, 0.02];
          footL = [0.22 * H, -0.09 * H, 0];
        }
        if (sp < 2) boulder = [0, 0, 0];
      } else if (sp <= 5) {
        // stomp: knee high, then down hard
        if (sp === 3) footR = [0.08 * H, 0.09 * H, 0.22 * H];
        else if (sp === 4) {
          footR = [0.12 * H, 0.1 * H, 0];
          hip -= 0.06 * H;
          lean = 0.1;
        }
        handR = [0.05, 0.24, -0.05];
        handL = [0.05, -0.24, -0.05];
      } else if (sp <= 8) {
        // quake: both fists high, then down onto the earth
        if (sp === 6) {
          handR = [0, 0.08, 0.32];
          handL = [0, -0.08, 0.32];
          lean = -0.1;
        } else {
          hip -= 0.18 * H;
          lean = 0.5;
          handR = [0.38, 0.1, -0.48];
          handL = [0.38, -0.1, -0.48];
        }
      }
    }
  }
  const pel = B.at(o, lean * 0.15 * H, 0, hip);
  const chest = B.at(pel, lean * 0.3 * H, 0, 0.27 * H);
  const neck = B.at(chest, lean * 0.08 * H, 0, 0.11 * H);
  const sw = 0.14 * H * g.bulk;
  const shR = B.at(chest, 0, sw, 0.05 * H);
  const shL = B.at(chest, 0, -sw, 0.05 * H);
  const hipR = B.at(pel, 0, 0.075 * H, 0);
  const hipL = B.at(pel, 0, -0.075 * H, 0);
  const fR = B.at(o, footR[0], footR[1], footR[2]);
  const fL = B.at(o, footL[0], footL[1], footL[2]);
  const limbR = 0.055 * H * g.bulk;
  // legs
  sc.group();
  for (const [hp, ft] of [[hipL, fL], [hipR, fR]] as [V3, V3][]) {
    const knee = add(mul(add(hp, ft), 0.5), mul(B.F, 0.06 * H));
    sc.limb(hp, knee, limbR * 1.25, limbR, g.skin);
    sc.limb(knee, ft, limbR, limbR * 0.8, g.skin);
    sc.blob(add(ft, mul(B.F, 0.04 * H)), B.F, B.R, B.U, 0.07 * H, 0.045 * H, 0.03 * H, g.head === 'bull' ? MAT.furDark : g.skin);
  }
  // body: a huge chest and belly, a loincloth / kilt
  sc.group();
  const shade = (l: V3): Hit | null => (l[2] > 0.55 ? { shade: -0.3 } : null);
  sc.blob(B.at(pel, 0.02 * H, 0, 0.05 * H), B.F, B.R, B.U, 0.1 * H, 0.12 * H * g.bulk, 0.09 * H, g.skin);
  sc.blob(B.at(chest, 0.01 * H, 0, -0.06 * H), B.F, B.R, B.U, 0.11 * H * g.bulk, 0.15 * H * g.bulk, 0.15 * H, g.skin, shade);
  if (g.head === 'titan') {
    // stone body with molten cracks and a bronze belt and pauldrons
    sc.blob(B.at(chest, 0.02 * H, 0, -0.04 * H), B.F, B.R, B.U, 0.112 * H * g.bulk, 0.152 * H * g.bulk, 0.13 * H, MAT.stone, (l) => (Math.abs(Math.sin(l[0] * 9 + l[2] * 7) + Math.sin(l[1] * 11 - l[2] * 5)) < 0.12 ? { ramp: MAT.ember.ramp } : null));
    for (const sh of [shL, shR]) sc.sphere(sh, 0.08 * H, BRONZE);
  }
  sc.group();
  sc.blob(B.at(pel, 0, 0, -0.02 * H), B.F, B.R, B.U, 0.11 * H, 0.13 * H * g.bulk, 0.08 * H, g.cloth, g.cloth === MAT.fur ? (l) => (((Math.floor(l[0] * 7) + Math.floor(l[2] * 9)) & 1) ? { shade: 0.6 } : null) : undefined);
  if (g.head !== 'titan') {
    // a leather belt, and (the cyclops) a shaggy pelt over one shoulder
    sc.blob(B.at(pel, 0.01 * H, 0, 0.075 * H), B.F, B.R, B.U, 0.105 * H, 0.125 * H * g.bulk, 0.022 * H, DARK_LEATHER_M);
    if (g.head === 'cyclops') {
      sc.blob(B.at(chest, 0.01 * H, -0.07 * H, 0.02 * H), B.F, B.R, B.U, 0.1 * H, 0.09 * H, 0.15 * H, MAT.fur, (l) => (((Math.floor((l[0] + 1) * 6) + Math.floor((l[2] + 1) * 8)) & 1) ? { shade: 0.7 } : null));
      sc.limb(B.at(chest, 0.105 * H, -0.08 * H, 0.06 * H), B.at(pel, 0.1 * H, 0.1 * H, 0.08 * H), 0.012 * H, 0.012 * H, DARK_LEATHER_M);
    }
  }
  // arms
  sc.group();
  const handPos = (sh: V3, h: V3, side: number): V3 => B.at(sh, h[0] * H, h[1] * H * side * (side > 0 ? 1 : -1), h[2] * H);
  const hR = handPos(shR, handR, 1);
  const hL = handPos(shL, handL, -1);
  for (const [sh, hd, side] of [[shL, hL, -1], [shR, hR, 1]] as [V3, V3, number][]) {
    const el = add(mul(add(sh, hd), 0.5), add(mul(B.R, side * 0.05 * H), mul(B.F, -0.03 * H)));
    sc.limb(sh, el, limbR * 1.15, limbR * 0.9, g.skin);
    sc.limb(el, hd, limbR * 0.9, limbR * 0.75, g.skin);
    sc.sphere(hd, limbR * 0.95, g.skin);
    if (g.head !== 'titan') sc.limb(add(mul(el, 0.4), mul(hd, 0.6)), add(mul(el, 0.1), mul(hd, 0.9)), limbR * 0.92, limbR * 0.85, g.head === 'bull' ? BRONZE : DARK_LEATHER_M); // bracers
  }
  // weapon in the right hand
  if (g.weapon === 'club' && p.sp < 0) {
    const dir = p.atk === 0 ? B.dir(-0.4, 0.1, 1) : p.atk === 1 ? B.dir(1, 0, -0.4) : B.dir(0.5, 0.25, 0.7);
    sc.limb(sub(hR, mul(dir, 0.1 * H)), add(hR, mul(dir, 0.42 * H)), 0.035 * H, 0.07 * H, DARK_WOOD, (l) => (((Math.floor(l[2] * 6) + Math.floor(l[0] * 4)) & 3) === 0 ? { shade: 0.8 } : null));
  } else if (g.weapon === 'axe' && (p.sp < 0 || p.sp >= 4)) {
    // a double-headed bronze labrys on a long haft
    const dir = p.atk === 0 ? B.dir(-0.5, 0.1, 1) : p.atk === 1 ? B.dir(1, 0.1, -0.5) : B.dir(0.6, 0.3, 0.6);
    const top = add(hR, mul(dir, 0.42 * H));
    sc.line(sub(hR, mul(dir, 0.18 * H)), top, WOOD, 2);
    const side = norm(cross(dir, B.U));
    for (const s of [-1, 1]) sc.ellipsoid(add(top, mul(side, s * 0.1 * H)), mul(side, 0.1 * H), mul(dir, 0.08 * H), mul(norm(cross(side, dir)), 0.012 * H), BRONZE);
  }
  if (boulder) {
    const c = mul(add(hR, hL), 0.5);
    sc.group();
    sc.ellipsoid(add(c, mul(B.U, 0.1 * H)), [0.16 * H, 0, 0], [0, 0.14 * H, 0], [0, 0, 0.13 * H], MAT.boulder, (l) => (((Math.floor((l[0] + 1) * 3) + Math.floor((l[2] + 1) * 4)) & 1) ? { shade: 0.5 } : null));
  }
  // head
  sc.group();
  const hc = add(B.at(neck, (0.06 + headDown * 0.12) * H, 0, (0.06 - headDown * 0.05) * H), [0, 0, 0]);
  const hr = (g.head === 'cyclops' ? 0.1 : g.head === 'titan' ? 0.085 : 0.085) * H;
  if (g.head === 'cyclops') {
    sc.sphere(hc, hr, g.skin);
    sc.blob(B.at(hc, 0.02 * H, 0, -0.045 * H), B.F, B.R, B.U, 0.06 * H, 0.06 * H, 0.04 * H, MAT.furDark); // beard
    sc.blob(B.at(hc, hr * 0.7, 0, hr * 0.35), B.F, B.R, B.U, hr * 0.3, hr * 0.75, hr * 0.18, g.skin); // brow
    const eye = B.at(hc, hr * 0.86, 0, hr * 0.08);
    sc.sphere(eye, hr * 0.32, MAT.eyeWhite);
    sc.sphere(add(eye, mul(B.F, hr * 0.22)), hr * 0.13, EYE);
    sc.limb(B.at(hc, 0, 0, hr * 0.8), B.at(hc, -hr * 0.2, 0, hr * 1.35), hr * 0.18, hr * 0.05, IVORY); // a horn stub
    sc.blob(B.at(hc, -hr * 0.2, 0, hr * 0.6), B.F, B.R, B.U, hr * 0.8, hr * 0.85, hr * 0.4, MAT.furDark); // wild hair
  } else if (g.head === 'titan') {
    sc.sphere(hc, hr, MAT.stone);
    sc.blob(B.at(hc, 0.01 * H, 0, -0.04 * H), B.F, B.R, B.U, 0.05 * H, 0.06 * H, 0.05 * H, MAT.stoneDark);
    for (const s of [-1, 1]) sc.sphere(B.at(hc, hr * 0.85, s * hr * 0.35, hr * 0.15), hr * 0.16, MAT.eyeGlow);
    // a bronze crown of spikes
    for (let i = -2; i <= 2; i++) sc.limb(B.at(hc, hr * 0.3, i * hr * 0.32, hr * 0.7), B.at(hc, hr * 0.35, i * hr * 0.4, hr * 1.25), hr * 0.12, hr * 0.03, BRONZE);
  } else {
    // a bull's head: long muzzle, wide horns
    const hd = B.dir(1, 0, -0.3 - headDown);
    sc.sphere(hc, hr * 0.95, g.skin);
    const muzzle = add(hc, mul(hd, hr * 1.2));
    sc.limb(hc, muzzle, hr * 0.8, hr * 0.55, g.skin);
    sc.sphere(muzzle, hr * 0.5, MAT.furDark);
    for (const s of [-1, 1]) {
      const root = B.at(hc, -hr * 0.1, s * hr * 0.7, hr * 0.55);
      const mid = B.at(hc, hr * 0.2, s * hr * 1.8, hr * 0.9);
      const tip = B.at(hc, hr * 0.9, s * hr * 1.9, hr * 1.7);
      sc.limb(root, mid, hr * 0.28, hr * 0.17, IVORY);
      sc.limb(mid, tip, hr * 0.17, hr * 0.04, IVORY);
      sc.sphere(B.at(hc, hr * 0.7, s * hr * 0.45, hr * 0.3), hr * 0.13, p.sp === 5 || p.sp === 6 ? MAT.eyeGlow : EYE);
      sc.limb(B.at(hc, 0, s * hr * 0.8, hr * 0.2), B.at(hc, -hr * 0.1, s * hr * 1.25, hr * 0.05), hr * 0.2, hr * 0.06, g.skin); // ears
    }
    sc.line(add(muzzle, mul(B.R, -hr * 0.2)), add(muzzle, mul(B.R, hr * 0.2)), BRONZE, 1); // nose ring
    sc.blob(B.at(chest, 0, 0, 0.05 * H), B.F, B.R, B.U, 0.1 * H, 0.14 * H, 0.08 * H, MAT.furDark); // shaggy hump
  }
  if (fall) {
    sc.rotate(o, B.R, -fall);
    sc.translate(mul(B.F, -Math.sin(Math.min(fall, 1.5)) * 0.15 * H));
    if (p.die === 2) {
      sc.group();
      sc.blob(B.at(o, -0.3 * H, 0, 0.005), B.F, B.R, B.U, 0.4 * H, 0.25 * H, 0.01, BLOOD);
    }
  }
}

// ================================================================ the hydra's body and the kraken

function hydraBody(sc: Scene, B: Basis, p: Pose): void {
  const o: V3 = [0, 0, 0];
  const L = 1.5;
  const bodyH = 0.85;
  const bob = p.idle === 1 ? -0.02 : p.walk >= 0 ? [0.02, 0, 0.03, 0][p.walk] : 0;
  let down = 0;
  let roll = 0;
  if (p.die >= 0) {
    down = [0.1, 0.25, 0.35][p.die];
    roll = [0.2, 0.6, 1.0][p.die];
  }
  const at = (f: number, r: number, u: number) => B.at(o, f, r, u + bob - down);
  // four short splayed legs
  sc.group();
  const sw = p.walk >= 0 ? [[0.3, -0.3], [0.1, -0.1], [-0.3, 0.3], [-0.1, 0.1]][p.walk] : [0, 0];
  for (const [lf, lr, k] of [[0.7, -0.75, 0], [0.7, 0.75, 1], [-0.65, -0.75, 1], [-0.65, 0.75, 0]] as [number, number, number][]) {
    const top = at(lf, lr * 0.7, bodyH * 0.8);
    const foot = B.at(o, lf + sw[k], lr * 1.15, 0.04);
    const knee = add(mul(add(top, foot), 0.5), mul(B.U, 0.18));
    sc.limb(top, knee, 0.2, 0.15, MAT.scale);
    sc.limb(knee, foot, 0.15, 0.12, MAT.scaleDark);
    for (const c of [-1, 0, 1]) sc.line(foot, add(foot, add(mul(B.F, 0.18), mul(B.R, c * 0.08))), IVORY, 1);
  }
  // the great scaled body and its pale belly
  sc.group();
  const sh = (l: V3): Hit | null => (l[2] < -0.4 ? { ramp: MAT.belly.ramp } : scales(7)(l));
  sc.blob(at(0, 0, bodyH + 0.25), B.F, B.R, B.U, L, 1.0, 0.75, MAT.scale, sh);
  sc.blob(at(0.75, 0, bodyH + 0.45), B.F, B.R, B.U, 0.75, 0.95, 0.72, MAT.scale, sh);
  // spines along the back
  for (let i = -3; i <= 3; i++) sc.limb(at(i * 0.28, 0, bodyH + 0.72 - Math.abs(i) * 0.05), at(i * 0.28 - 0.08, 0, bodyH + 0.98 - Math.abs(i) * 0.06), 0.06, 0.01, MAT.scaleDark);
  // the tail, coiling behind
  sc.group();
  let prev = at(-L * 0.9, 0, bodyH + 0.1);
  const wag = p.walk >= 0 ? [0.25, 0, -0.25, 0][p.walk] : p.idle === 1 ? 0.1 : 0;
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    const next = at(-L * 0.9 - t * 1.4, Math.sin(t * 3 + wag * 4) * 0.45 * t, bodyH * (1 - t) * 0.6 + 0.12);
    sc.limb(prev, next, 0.36 * (1 - t * 0.75), 0.36 * (1 - t * 0.85), MAT.scale, scales(10));
    prev = next;
  }
  // the neck stumps the heads rise from (seared black when sealed: drawn by the heads)
  sc.group();
  for (let i = 0; i < 5; i++) {
    const lat = (i / 4 - 0.5) * 2;
    sc.limb(at(0.75, lat * 0.55, bodyH + 0.7), at(1.15, lat * 0.7, bodyH + 1.2), 0.34, 0.29, MAT.scale, scales(8));
  }
  if (roll) {
    sc.rotate(o, B.F, roll);
    if (p.die === 2) {
      sc.group();
      sc.blob(B.at(o, 0, 0.5, 0.005), B.F, B.R, B.U, 1.6, 1.1, 0.01, BLOOD);
    }
  }
}

function krakenBody(sc: Scene, B: Basis, p: Pose): void {
  const o: V3 = [0, 0, 0];
  const bob = p.idle === 1 ? -0.04 : p.walk >= 0 ? [0.04, 0, -0.04, 0][p.walk] : 0;
  const sink = p.die >= 0 ? [0.4, 0.9, 1.4][p.die] : 0;
  // the surf it rises from
  sc.group();
  sc.blob(B.at(o, 0, 0, 0.02), B.F, B.R, B.U, 2.6, 2.6, 0.05, MAT.water, (l, w) => { const r = Math.sqrt(l[0] * l[0] + l[1] * l[1]); return r > 0.9 ? { shade: 2 } : (Math.floor(r * 7 + w[0] * 0.5) % 3 === 0 ? { ramp: [0xd8ecee, 0xb0d0d6, 0x88b0b8] } : null); });
  // the mantle: a great tapering dome
  sc.group();
  const base = B.at(o, -0.3, 0, 0.6 + bob - sink);
  sc.blob(base, B.F, B.R, B.U, 1.4, 1.5, 0.9, MAT.kraken, scales(5));
  sc.blob(B.at(base, -0.5, 0, 1.3), B.dir(0.4, 0, 1), B.R, norm(cross(B.R, B.dir(0.4, 0, 1))), 1.6, 1.0, 1.0, MAT.kraken, (l) => (l[0] > 0.6 ? { shade: 0.6 } : null));
  // eyes, a beak
  sc.group();
  for (const s of [-1, 1]) {
    const e = B.at(base, 0.9, s * 0.95, 0.75);
    sc.blob(add(e, mul(B.U, 0.1)), B.F, B.R, B.U, 0.22, 0.3, 0.12, MAT.kraken); // a heavy brow
    sc.sphere(e, 0.17, MAT.eyeGlow);
    sc.blob(add(e, mul(B.F, 0.12)), B.F, B.R, B.U, 0.05, 0.05, 0.13, EYE);
  }
  const open = p.atk === 1 || p.hit ? 0.2 : 0.05;
  sc.limb(B.at(base, 1.2, 0, 0.0 + open), B.at(base, 1.6, 0, -0.1), 0.18, 0.04, MAT.furDark);
  sc.limb(B.at(base, 1.2, 0, -0.15 - open), B.at(base, 1.5, 0, -0.25), 0.14, 0.03, MAT.furDark);
  // short arms at rest round the base (the long ones are separate fighters)
  sc.group();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const wave = p.idle === 1 ? 0.1 : 0;
    const r0 = B.at(base, Math.cos(a) * 1.2, Math.sin(a) * 1.3, -0.4);
    const r1 = B.at(base, Math.cos(a) * 1.9, Math.sin(a) * 2.0, -0.45);
    const r2 = B.at(base, Math.cos(a + 0.4) * 2.3, Math.sin(a + 0.4) * 2.35, 0.1 + wave + (i % 3) * 0.15);
    sc.limb(r0, r1, 0.3, 0.17, MAT.kraken, (l) => (l[2] < -0.3 && (Math.floor(l[0] * 6) & 1) === 0 ? { ramp: MAT.krakenPale.ramp } : null));
    sc.limb(r1, r2, 0.17, 0.05, MAT.kraken);
  }
}

/** A hydra head on its long neck, or a kraken arm, rising from behind (the body) to the front. */
function serpentNeck(sc: Scene, B: Basis, p: Pose, kind: 'hydra' | 'kraken', variant = 0): void {
  const lift = [0, 0.45, -0.3][variant] ?? 0;
  const o: V3 = [0, 0, 0];
  const hydra = kind === 'hydra';
  const mat = hydra ? MAT.scale : MAT.kraken;
  // neck base (towards the body), mid and head position
  let base = B.at(o, hydra ? -0.65 : -1.4, 0, hydra ? 2.0 : 0.1);
  let head = B.at(o, 0.2, 0, hydra ? 2.75 : 2.0);
  let mid = B.at(o, hydra ? -0.55 : -0.8, 0, hydra ? 3.5 : 1.5);
  let jaw = 0.05;
  const sway = p.idle === 1 ? 0.08 : p.walk >= 0 ? [0.1, 0, -0.1, 0][p.walk] : 0;
  head = add(head, mul(B.R, sway));
  if (p.atk === 0 || p.sp === 0 || p.sp === 1) {
    head = B.at(o, -0.3, 0, hydra ? 3.4 : 2.7);
    mid = B.at(o, -0.65, 0, hydra ? 3.3 : 2.0);
    jaw = p.sp >= 0 ? 0.3 : 0.18;
  } else if (p.atk === 1) {
    head = B.at(o, 0.8, 0, hydra ? 1.2 : 0.35);
    mid = B.at(o, -0.2, 0, hydra ? 2.9 : 1.6);
    jaw = 0.45;
  } else if (p.atk === 2) {
    head = B.at(o, 0.5, 0, hydra ? 1.9 : 1.0);
    jaw = 0.15;
  } else if (p.hit) {
    head = B.at(o, -0.3, 0.25, hydra ? 2.6 : 1.8);
  } else if (p.sp === 2) {
    // regrowing: a raw head pushing out of the stump
    head = B.at(o, -0.45, 0, 2.3);
    mid = B.at(o, -0.6, 0, 2.2);
    jaw = 0.1;
  }
  if (p.die < 0) {
    head = add(head, [0, 0, lift]);
    mid = add(mid, [0, 0, lift * 0.8]);
  }
  let fallen = false;
  if (p.die >= 0) {
    // severed: the head and a length of neck lie on the ground; the stump is the body's
    const k = [0.4, 0.75, 1][p.die];
    head = add(mul(head, 1 - k), mul(B.at(o, 0.5, 0.3, 0.22), k));
    mid = add(mul(mid, 1 - k), mul(B.at(o, -0.1, 0.1, 0.15), k));
    base = add(mul(base, 1 - k), mul(B.at(o, -0.6, -0.1, 0.12), k));
    jaw = 0.3;
    fallen = p.die === 2;
  }
  // the neck: a smooth bezier of tapering segments
  sc.group();
  let prev = base;
  const n = 8;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const q = add(add(mul(base, (1 - t) * (1 - t)), mul(mid, 2 * t * (1 - t))), mul(head, t * t));
    const r0 = (hydra ? 0.27 : 0.3) * (1 - (i - 1) / n * (hydra ? 0.35 : 0.75));
    const r1 = (hydra ? 0.27 : 0.3) * (1 - (i / n) * (hydra ? 0.35 : 0.75));
    sc.limb(prev, q, r0, r1, mat, hydra ? (l) => (l[2] < -0.3 ? { ramp: MAT.belly.ramp } : scales(10)(l)) : (l) => (l[2] < -0.2 && ((Math.floor(l[0] * 8) & 1) === 0) ? { ramp: MAT.krakenPale.ramp } : null));
    prev = q;
  }
  if (!hydra) {
    // the arm ends in a curled tip
    sc.limb(head, add(head, B.dir(0.4, 0.2, -0.6).map((v) => v * 0.4) as V3), 0.08, 0.02, mat);
    if (fallen) {
      sc.group();
      sc.blob(B.at(o, 0, 0, 0.005), B.F, B.R, B.U, 0.8, 0.5, 0.01, BLOOD);
    }
    return;
  }
  // the head: a wedge-shaped serpent skull with a frill, yellow eyes, fangs
  sc.group();
  const hd = norm(sub(head, mid));
  const fwd = norm(add(mul(hd, 0.4), mul(B.F, 0.8)));
  const side = norm(cross(fwd, B.U));
  const up = norm(cross(side, fwd));
  sc.ellipsoid(head, mul(fwd, 0.480), mul(side, 0.320), mul(up, 0.256), MAT.scale, scales(12));
  const snout = add(head, mul(fwd, 0.576));
  sc.ellipsoid(add(snout, mul(up, 0.032)), mul(fwd, 0.272), mul(side, 0.192), mul(up, 0.128), MAT.scale);
  // lower jaw, opening
  const jd = norm(add(fwd, mul(up, -jaw * 2)));
  sc.ellipsoid(add(add(head, mul(jd, 0.480)), mul(up, -0.144)), mul(jd, 0.384), mul(side, 0.176), mul(up, 0.080), MAT.belly);
  if (jaw > 0.12) {
    sc.ellipsoid(add(add(head, mul(fwd, 0.480)), mul(up, -0.096)), mul(fwd, 0.256), mul(side, 0.144), mul(up, 0.064), MAT.mouth);
    for (const s of [-1, 1]) sc.line(add(snout, mul(side, s * 0.112)), add(add(snout, mul(side, s * 0.112)), mul(up, -0.192)), IVORY, 1);
  }
  for (const s of [-1, 1]) {
    sc.sphere(add(add(head, mul(fwd, 0.224)), add(mul(side, s * 0.240), mul(up, 0.128))), 0.072, MAT.eyeGlow);
    // the frill / horns
    sc.limb(add(add(head, mul(fwd, -0.240)), mul(side, s * 0.192)), add(add(head, mul(fwd, -0.672)), add(mul(side, s * 0.448), mul(up, 0.288))), 0.096, 0.024, MAT.scaleDark);
  }
  if (fallen) {
    sc.group();
    sc.blob(B.at(o, 0.1, 0.1, 0.005), B.F, B.R, B.U, 0.9, 0.5, 0.01, BLOOD);
  }
}

// ================================================================ harpies

function harpy(sc: Scene, B: Basis, p: Pose): void {
  const o: V3 = [0, 0, 0];
  const flying = p.sp >= 0 && p.sp <= 5;
  const diving = p.sp === 4 || p.sp === 5;
  // wing angle: up (1) .. down (-1); folded when perched
  let wing = flying ? [1, 0.3, -0.8, 0.2][p.sp % 4] : p.atk >= 0 ? 0.8 : p.hit ? 0.5 : -1.5;
  if (diving) wing = 1.6;
  let lift = flying ? 0.6 + (p.sp % 2) * 0.05 : p.atk === 1 ? 0.25 : 0;
  let tilt = diving ? 0.9 : flying ? 0.2 : p.atk === 1 ? 0.4 : 0;
  let fall = 0;
  if (p.die >= 0) {
    fall = [0.4, 1.0, 1.5][p.die];
    lift = 0;
    wing = -0.5;
    tilt = 0;
  }
  const hip = B.at(o, 0, 0, 0.85 + lift);
  // bird legs with long talons
  sc.group();
  for (const s of [-1, 1]) {
    const h = add(hip, mul(B.R, s * 0.1));
    const knee = add(h, add(mul(B.F, 0.12), mul(B.U, -0.32)));
    const reach = p.atk === 1 || diving ? 0.35 : 0;
    const foot = add(knee, add(mul(B.F, -0.06 + reach), mul(B.U, flying ? -0.25 : -0.45)));
    sc.limb(h, knee, 0.07, 0.04, MAT.feather);
    sc.limb(knee, foot, 0.035, 0.03, MAT.talon);
    for (const c of [-1, 0, 1]) sc.line(foot, add(foot, add(mul(B.F, 0.12 + reach * 0.3), mul(B.R, c * 0.05))), IVORY, 1);
  }
  // a woman's torso, gaunt and grey, feathers below
  sc.group();
  const chest = add(hip, add(mul(B.U, 0.38), mul(B.F, tilt * 0.2)));
  sc.blob(add(hip, mul(B.U, 0.05)), B.F, B.R, B.U, 0.18, 0.2, 0.17, MAT.feather, scales(14));
  sc.blob(chest, B.F, B.R, B.U, 0.13, 0.17, 0.2, MAT.harpySkin);
  // head with wild black hair, a screaming mouth
  const head = add(chest, add(mul(B.U, 0.3), mul(B.F, 0.04 + tilt * 0.1)));
  sc.sphere(head, 0.11, MAT.harpySkin);
  sc.blob(add(head, add(mul(B.F, -0.06), mul(B.U, 0.04))), B.F, B.R, B.U, 0.14, 0.15, 0.13, MAT.furDark);
  sc.limb(add(head, mul(B.F, -0.08)), add(head, add(mul(B.F, -0.35), mul(B.U, -0.25))), 0.08, 0.03, MAT.furDark);
  for (const s of [-1, 1]) sc.sphere(add(head, add(add(mul(B.F, 0.09), mul(B.R, s * 0.045)), mul(B.U, 0.02))), 0.02, MAT.eyeGlow);
  if (p.atk >= 0 || diving || p.sp === 0) sc.sphere(add(head, add(mul(B.F, 0.1), mul(B.U, -0.04))), 0.03, MAT.mouth);
  // great ragged wings from the shoulders
  sc.group();
  for (const s of [-1, 1]) {
    const sh = add(chest, add(mul(B.R, s * 0.16), mul(B.U, 0.1)));
    const spanDir = norm(add(mul(B.R, s * Math.cos(wing * 0.7)), mul(B.U, Math.sin(wing * 0.7))));
    const back = mul(B.F, -0.15);
    for (let k = 0; k < 4; k++) {
      const len = 0.95 - k * 0.12;
      const a = add(sh, mul(spanDir, 0.1 + k * 0.05));
      const b = add(add(sh, mul(spanDir, len)), add(back, mul(B.F, -k * 0.12)));
      sc.limb(a, b, 0.09 - k * 0.012, 0.03, k % 2 ? MAT.featherLight : MAT.feather);
    }
  }
  if (fall) {
    sc.rotate(o, B.R, -fall);
    if (p.die === 2) {
      sc.group();
      sc.blob(B.at(o, -0.4, 0, 0.005), B.F, B.R, B.U, 0.5, 0.35, 0.01, BLOOD);
    }
  }
}

// ================================================================ the lion and the chimera

function cat(sc: Scene, B: Basis, p: Pose, kind: 'lion' | 'chimera'): void {
  const chimera = kind === 'chimera';
  const S = chimera ? 1.35 : 1.15;
  const o: V3 = [0, 0, 0];
  const bodyH = 0.62 * S;
  const bodyL = 0.62 * S;
  const bodyR = 0.24 * S;
  const bodyU = 0.27 * S;
  let rear = 0;
  let lunge = 0;
  let down = 0;
  let roll = 0;
  let leap = 0;
  let jaw = 0.04;
  let headUp = 0;
  if (p.atk === 0) {
    rear = 0.15;
    jaw = 0.15;
  } else if (p.atk === 1) {
    rear = -0.1;
    lunge = 0.2 * S;
    jaw = 0.3;
  } else if (p.atk === 2) jaw = 0.12;
  else if (p.hit) rear = 0.18;
  else if (p.die >= 0) {
    down = [0.25, 0.45, 0.6][p.die] * bodyH;
    roll = [0.3, 0.9, 1.45][p.die];
  }
  if (!chimera && p.sp >= 0 && p.sp <= 2) {
    // the leap: stretched out in the air
    leap = [0.2, 0.55, 0.3][p.sp] * S;
    rear = [0.35, 0, -0.25][p.sp];
    jaw = 0.3;
  }
  if (chimera && p.sp >= 0) {
    if (p.sp <= 2) {
      rear = [0.3, 0.05, -0.05][p.sp];
      headUp = [0.6, 0.1, 0][p.sp];
      jaw = [0.2, 0.45, 0.5][p.sp];
      lunge = p.sp * 0.08 * S;
    }
  }
  const bob = p.walk >= 0 ? [0.03, 0, 0.04, 0][p.walk] * S : p.idle === 1 ? -0.01 : 0;
  const ob: V3 = B.at(o, lunge, 0, leap);
  const at = (f: number, r: number, u: number) => B.at(ob, f, r, u + bob - down);
  const coat = chimera ? MAT.lion : MAT.lion;
  // legs
  sc.group();
  const lx = bodyL * 0.72;
  const sw = p.walk >= 0 ? [[0.5, 0.2, -0.4, -0.5], [0.1, 0.5, -0.1, -0.3], [-0.5, -0.2, 0.4, 0.5], [-0.1, -0.5, 0.1, 0.3]][p.walk] : leap ? [0.9, 0.9, -0.9, -0.9] : [0.05, -0.05, -0.05, 0.05];
  const legs: [number, number, number][] = [[lx, -bodyR * 0.6, 0], [lx, bodyR * 0.6, 1], [-lx, -bodyR * 0.6, 2], [-lx, bodyR * 0.6, 3]];
  for (const [lf, lr, i] of legs) {
    const top = at(lf, lr, bodyH - bodyU * 0.2);
    const hgt = bodyH - bodyU * 0.2 - down * 0.4;
    const foot = B.at(ob, lf + Math.sin(sw[i]) * hgt * 0.6, lr, 0.05 + Math.max(0, Math.sin(sw[i] * 2)) * 0.06 + (leap ? leap * 0.4 : 0));
    const knee = add(mul(add(top, foot), 0.5), mul(B.F, i < 2 ? 0.05 : -0.07));
    sc.limb(top, knee, 0.1 * S, 0.075 * S, coat);
    sc.limb(knee, foot, 0.075 * S, 0.07 * S, coat);
    sc.sphere(foot, 0.08 * S, coat);
  }
  // body: deep chest, lean flanks, pale belly
  sc.group();
  const shade = (l: V3): Hit | null => (l[2] < -0.5 ? { ramp: MAT.belly.ramp } : l[2] > 0.75 ? { shade: 0.5 } : null);
  sc.blob(at(0, 0, bodyH), B.F, B.R, B.U, bodyL, bodyR, bodyU, coat, shade);
  sc.blob(at(bodyL * 0.5, 0, bodyH + bodyU * 0.12), B.F, B.R, B.U, bodyL * 0.5, bodyR * 1.15, bodyU * 1.12, coat, shade);
  // the mane
  sc.group();
  const neck = at(bodyL * 0.95, 0, bodyH + bodyU * 0.55);
  const headC = add(neck, B.dir(0.75, 0, 0.25 + headUp).map((v) => v * 0.26 * S) as V3);
  sc.blob(add(neck, mul(B.F, -0.05 * S)), B.F, B.R, B.U, 0.3 * S, 0.32 * S, 0.34 * S, MAT.mane, (l) => (((Math.floor((l[0] + 1) * 6) + Math.floor((l[2] + 1) * 7)) & 1) ? { shade: 0.6 } : null));
  // head
  const hr = 0.17 * S;
  sc.sphere(headC, hr, coat);
  const snoutDir = B.dir(1, 0, -0.25 + headUp * 0.6);
  const snout = add(headC, mul(snoutDir, hr * 0.95));
  sc.limb(headC, snout, hr * 0.7, hr * 0.45, coat);
  sc.sphere(add(snout, mul(snoutDir, hr * 0.15)), hr * 0.22, MAT.furDark);
  const jd = norm(add(snoutDir, [0, 0, -jaw * 2]));
  sc.limb(add(headC, mul(B.U, -hr * 0.35)), add(add(headC, mul(jd, hr * 0.95)), mul(B.U, -hr * 0.3)), hr * 0.4, hr * 0.25, MAT.belly);
  if (jaw > 0.12) {
    sc.sphere(add(add(headC, mul(snoutDir, hr * 0.7)), mul(B.U, -hr * 0.3)), hr * 0.25, MAT.mouth);
    for (const s of [-1, 1]) sc.line(add(snout, mul(B.R, s * hr * 0.25)), add(add(snout, mul(B.R, s * hr * 0.25)), mul(B.U, -hr * 0.35)), IVORY, 1);
  }
  for (const s of [-1, 1]) {
    sc.sphere(add(headC, add(add(mul(B.F, hr * 0.7), mul(B.R, s * hr * 0.42)), mul(B.U, hr * 0.28))), 0.022 * S, chimera ? MAT.eyeGlow : MAT.gold);
    sc.sphere(add(headC, add(mul(B.R, s * hr * 0.6), mul(B.U, hr * 0.75))), hr * 0.22, MAT.mane);
  }
  if (!chimera) {
    // the hide glints gold: a few hard highlights
    sc.group();
    sc.blob(at(bodyL * 0.1, 0, bodyH + bodyU * 0.8), B.F, B.R, B.U, bodyL * 0.6, bodyR * 0.5, 0.02 * S, MAT.gold);
  }
  // tail: a lion's tuft, or the chimera's serpent
  sc.group();
  const tail0 = at(-bodyL * 0.95, 0, bodyH + bodyU * 0.35);
  if (!chimera) {
    const tip = add(tail0, B.dir(-0.6, p.walk >= 0 ? (p.walk % 2 ? 0.25 : -0.25) : 0.1, -0.5).map((v) => v * 0.6 * S) as V3);
    sc.limb(tail0, tip, 0.04 * S, 0.025 * S, coat);
    sc.sphere(tip, 0.06 * S, MAT.mane);
  } else {
    // serpent tail: arcs up and over, striking forward on sp5-6
    const strike = p.sp === 5 ? 0.6 : p.sp === 6 ? 1 : 0;
    const c1 = add(tail0, add(mul(B.F, -0.5 * S), mul(B.U, 0.5 * S)));
    const tip = add(tail0, add(mul(B.F, (-0.3 + strike * 1.4) * S), add(mul(B.U, (0.9 + strike * 0.2) * S), mul(B.R, 0.25 * S))));
    let prev = tail0;
    for (let i = 1; i <= 7; i++) {
      const t = i / 7;
      const q = add(add(mul(tail0, (1 - t) * (1 - t)), mul(c1, 2 * t * (1 - t))), mul(tip, t * t));
      sc.limb(prev, q, (0.09 - t * 0.05) * S, (0.09 - t * 0.055) * S, MAT.serpent, scales(14));
      prev = q;
    }
    const sd = norm(sub(tip, c1));
    sc.ellipsoid(add(tip, mul(sd, 0.08 * S)), mul(sd, 0.1 * S), mul(B.R, 0.06 * S), [0, 0, 0.05 * S], MAT.serpent);
    sc.sphere(add(tip, add(mul(sd, 0.1 * S), mul(B.U, 0.03 * S))), 0.015 * S, MAT.eyeGlow);
    // the goat's head rising from the back, bleating on sp3-4
    const bleat = p.sp === 3 || p.sp === 4;
    const gb = at(-bodyL * 0.1, 0, bodyH + bodyU * 0.9);
    const gh = add(gb, B.dir(0.2, 0.2, bleat ? 1 : 0.8).map((v) => v * 0.38 * S) as V3);
    sc.limb(gb, gh, 0.1 * S, 0.08 * S, MAT.goat);
    sc.sphere(gh, 0.1 * S, MAT.goat);
    const gm = add(gh, B.dir(0.8, 0.2, bleat ? 0.5 : -0.4).map((v) => v * 0.14 * S) as V3);
    sc.limb(gh, gm, 0.07 * S, 0.04 * S, MAT.goat);
    if (bleat) sc.sphere(gm, 0.035 * S, MAT.mouth);
    for (const s of [-1, 1]) {
      const r0 = add(gh, add(mul(B.R, s * 0.06 * S), mul(B.U, 0.06 * S)));
      const r1 = add(r0, add(mul(B.F, -0.18 * S), add(mul(B.U, 0.12 * S), mul(B.R, s * 0.06 * S))));
      const r2 = add(r1, add(mul(B.F, -0.08 * S), mul(B.U, -0.14 * S)));
      sc.limb(r0, r1, 0.035 * S, 0.025 * S, IVORY);
      sc.limb(r1, r2, 0.025 * S, 0.01 * S, IVORY);
    }
    // scorched dark streaks along the flanks
    sc.blob(at(-bodyL * 0.2, 0, bodyH + bodyU * 0.2), B.F, B.R, B.U, bodyL * 0.5, bodyR * 1.04, bodyU * 0.5, MAT.mane, (l) => ((Math.floor((l[0] + 1) * 5) & 1) ? null : { hole: true }));
  }
  if (rear) sc.rotate(B.at(ob, -bodyL * 0.75, 0, 0), B.R, -rear);
  if (roll) {
    sc.rotate(B.at(o, 0, 0, 0), B.F, roll);
    sc.translate(mul(B.R, -Math.sin(Math.min(roll, Math.PI / 2)) * bodyH * 0.6));
    if (roll > 1.2) {
      sc.group();
      sc.blob(B.at(o, 0.1, bodyU, 0.005), B.F, B.R, B.U, bodyL * 0.9, bodyR * 2, 0.01, BLOOD);
    }
  }
  void IRON;
}

// ================================================================ effects art

/** A thrown boulder (w x w px), lit like the field. */
export function renderBoulderFx(w = 18): import('./pixels').Pix {
  const sc = new Scene();
  sc.ellipsoid([0, 0, 0.5], [0.42, 0.1, 0], [-0.08, 0.38, 0], [0, 0, 0.36], MAT.boulder, (l) => (((Math.floor((l[0] + 1) * 3) + Math.floor((l[2] + 1) * 4)) & 1) ? { shade: 0.6 } : null));
  return sc.render(w, w, w / 2, w * 0.85);
}
