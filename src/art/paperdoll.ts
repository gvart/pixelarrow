/**
 * Procedural soldier, rider, chariot and animal sprites.
 *
 * Every figure is posed as a small 3D model (src/art/model3d.ts: spheres,
 * tapered limbs, ellipsoids, boxes and lines, in metres) and rendered through
 * the battle's isometric camera, so proportions stay realistic (a man is
 * ~1.75 m = ~34 px with a head of ~5 px), light always falls from the upper
 * left, and every facing is a true view rather than a mirror image.
 *
 * SHEET FORMAT (what a hand-drawn replacement must follow):
 *   - One sheet per figure: 13 columns x 4 rows of frames.
 *   - Columns (FRAME_NAMES): idle0 idle1 walk0..walk3 atk0 atk1 atk2 hit die0 die1 die2.
 *     Riders: walk = gallop, hit = the horse rears, die = horse and rider fall.
 *     Animals: walk = trot/lope, atk = lunge and bite (the bear rears and swipes).
 *   - Rows (DIRS): 0 facing field +x (screen down-right), 1 facing field -y (up-right,
 *     seen from behind: the player's army), 2 facing field +y (down-left, seen from the
 *     front: the enemy), 3 facing field -x (up-left). No mirroring at render time.
 *   - Frame size and the feet line depend on the figure (dollGeom): a man 48 x 56
 *     with the feet at y = 50, a rider 96 x 84 (hooves at 74), a chariot 128 x 96
 *     (84), wolf / boar 48 x 40 (34), bear 64 x 60 (52). The feet are centred on x.
 *   - Layers, back to front, each keyed by an `art` id from src/data/items.ts (or the
 *     class / mount / beast for bodies): [cloak], legs (skin / trousers / greaves),
 *     tunic and skirt, body armour, arms, head / hair / beard, helmet and crest,
 *     shield (painted face: field, emblem, rim), weapon. A hand-drawn sheet per layer
 *     in this same 13 x 4 grid can replace a builder function below.
 *   - The player's side (row 1) always shows the painted shield face: the shield
 *     carried on the left side is turned towards the viewer.
 */
import { Scene, add, cross, mul, norm, sub, len, CAM, project, type Material, type V3, type Hit } from './model3d';
import {
  BLOOD, BRONZE, BEAST, CLOTH, COATS, CREST, DARK_LEATHER, DARK_WOOD, EYE, FELT, FIELD, HAIR, HOOF, INK, IRON, IVORY,
  LEATHER, LINEN, MANE, SKIN, STRING, WOOD,
} from './materials';
import { EMBLEM_BITMAPS } from './emblems';
import { Pix, hash2 } from './pixels';
import type { Look } from '../data/units';
import { itemDef, type Item, type ItemPaint } from '../data/items';
import type { Hero } from '../data/units';
import { CLASSES, classOfHero, type BeastId, type MountId } from '../data/classes';

export const FRAME_NAMES = ['idle0', 'idle1', 'walk0', 'walk1', 'walk2', 'walk3', 'atk0', 'atk1', 'atk2', 'hit', 'die0', 'die1', 'die2'] as const;
export const NFRAMES = FRAME_NAMES.length;
/** Rows: facings in field coordinates. */
export const DIRS: [number, number][] = [[1, 0], [0, -1], [0, 1], [-1, 0]];
export const NDIRS = DIRS.length;
export const ANIM_FRAMES = {
  idle: [0, 1],
  walk: [2, 3, 4, 5],
  attack: [6, 7, 8],
  hit: [9],
  die: [10, 11, 12],
} as const;

export interface SheetGeom {
  fw: number;
  fh: number;
  /** Feet line (y) inside a frame; x is centred. */
  footY: number;
}

const GEOM = {
  man: { fw: 48, fh: 56, footY: 50 },
  horse: { fw: 96, fh: 84, footY: 74 },
  chariot: { fw: 128, fh: 96, footY: 84 },
  small: { fw: 48, fh: 40, footY: 34 },
  bear: { fw: 64, fh: 60, footY: 52 },
} satisfies Record<string, SheetGeom>;

/** Frame size of a man (the common case). */
export const FW = GEOM.man.fw;
export const FH = GEOM.man.fh;

export interface DollSpec {
  look: Look;
  weapon?: string; // art key
  shield?: { art: string; paint?: ItemPaint };
  helmet?: { art: string; paint?: ItemPaint };
  armor?: string;
  /** Class look (src/data/classes.ts ClassArt). */
  cloak?: string;
  trousers?: string;
  bare?: boolean;
  mount?: MountId;
  beast?: BeastId;
  /** Horse coat index (COATS). */
  coat?: number;
  /** Variation seed (wear, dirt). */
  seed?: number;
}

export function dollFromHero(h: Pick<Hero, 'look' | 'equip' | 'cls' | 'arch' | 'culture' | 'id'>): DollSpec {
  const cls = CLASSES[classOfHero({ cls: h.cls, arch: h.arch, culture: h.culture, weaponDef: h.equip.weapon?.def })];
  const seed = hashId(h.id ?? '');
  if (cls.kind === 'animal') return { look: h.look, beast: cls.beast, seed };
  const art = (it?: Item) => (it ? itemDef(it.def).art : undefined);
  const twoHanded = h.equip.weapon ? !!itemDef(h.equip.weapon.def).twoHanded : false;
  return {
    look: h.look,
    weapon: art(h.equip.weapon),
    shield: h.equip.shield && !twoHanded ? { art: art(h.equip.shield)!, paint: shieldPaintOf(h.equip.shield) } : undefined,
    helmet: h.equip.helmet ? { art: art(h.equip.helmet)!, paint: h.equip.helmet.paint } : undefined,
    armor: art(h.equip.armor),
    cloak: cls.art.cloak,
    trousers: cls.art.trousers,
    bare: cls.art.bare,
    mount: cls.mount,
    coat: cls.mount ? seed % COATS.length : undefined,
    seed: seed % 97,
  };
}

function shieldPaintOf(it: Item): ItemPaint | undefined {
  if (it.def === 'argyraspis') return { ...(it.paint ?? {}), field: 'silver' };
  return it.paint;
}

function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

export function dollKey(d: DollSpec): string {
  const l = d.look;
  const p = (x?: ItemPaint) => (x ? `${x.emblem ?? ''}.${x.field ?? ''}.${x.ink ?? ''}` : '');
  if (d.beast) return `beast_${d.beast}`;
  return `doll2_${l.skin}${l.hair}${l.hairStyle}${l.beard}${l.tunic}_${d.weapon ?? '-'}_${d.shield?.art ?? '-'}${p(d.shield?.paint)}_${d.helmet?.art ?? '-'}${p(d.helmet?.paint)}_${d.armor ?? '-'}_${d.cloak ?? ''}${d.trousers ?? ''}${d.bare ? 'b' : ''}_${d.mount ?? ''}${d.coat ?? ''}_${(d.seed ?? 0) % 4}`;
}

export function dollGeom(d: DollSpec): SheetGeom {
  if (d.beast === 'bear') return GEOM.bear;
  if (d.beast) return GEOM.small;
  if (d.mount === 'chariot') return GEOM.chariot;
  if (d.mount) return GEOM.horse;
  return GEOM.man;
}

/** Render the full sprite sheet (13 frames x 4 facings). */
export function renderSheet(d: DollSpec): Pix {
  const g = dollGeom(d);
  const sheet = new Pix(g.fw * NFRAMES, g.fh * NDIRS);
  for (let dir = 0; dir < NDIRS; dir++) {
    for (let f = 0; f < NFRAMES; f++) sheet.blit(renderFrame(d, f, dir), f * g.fw, dir * g.fh);
  }
  return sheet;
}

export function renderFrame(d: DollSpec, frame: number, dir: number): Pix {
  const g = dollGeom(d);
  const sc = new Scene();
  const [fx, fy] = DIRS[dir];
  const B = basis(fx, fy);
  if (d.beast) buildBeast(sc, d.beast, frame, B, d.seed ?? 0);
  else if (d.mount === 'chariot') buildChariot(sc, d, frame, B, dir);
  else if (d.mount) buildRider(sc, d, frame, B, dir);
  else buildMan(sc, d, frame, B, dir, manPose(d, frame));
  return sc.render(g.fw, g.fh, Math.floor(g.fw / 2), g.footY);
}

// ================================================================ local frame

interface Basis {
  F: V3;
  R: V3;
  U: V3;
  /** Local (forward, right, up) -> world, relative to an origin. */
  at(o: V3, f: number, r: number, u: number): V3;
  dir(f: number, r: number, u: number): V3;
}

function basis(fx: number, fy: number): Basis {
  const F: V3 = [fx, fy, 0];
  const U: V3 = [0, 0, 1];
  const L = cross(F, U); // the figure's left
  const R: V3 = mul(L, -1);
  return {
    F,
    R,
    U,
    at: (o, f, r, u) => add(o, add(add(mul(F, f), mul(R, r)), mul(U, u))),
    dir: (f, r, u) => norm(add(add(mul(F, f), mul(R, r)), mul(U, u))),
  };
}

/** Two-bone IK: the middle joint between root a and end c, bending towards pole. */
function ik(a: V3, c: V3, l1: number, l2: number, pole: V3): { mid: V3; end: V3 } {
  let d = sub(c, a);
  let dl = len(d);
  const max = l1 + l2 - 1e-3;
  if (dl > max) {
    d = mul(d, max / dl);
    dl = max;
  }
  const end = add(a, d);
  const dir = mul(d, 1 / (dl || 1));
  const cosA = Math.max(-1, Math.min(1, (l1 * l1 + dl * dl - l2 * l2) / (2 * l1 * (dl || 1))));
  const pp = norm(sub(pole, mul(dir, pole[0] * dir[0] + pole[1] * dir[1] + pole[2] * dir[2])));
  const mid = add(add(a, mul(dir, l1 * cosA)), mul(pp, l1 * Math.sqrt(1 - cosA * cosA)));
  return { mid, end };
}

// ================================================================ the man

type ArmPose = 'rest' | 'raise' | 'strike' | 'recover' | 'block' | 'fall';

interface ManPose {
  /** Pelvis height and offset (forward, right). */
  hip: number;
  pf: number;
  pr: number;
  /** Torso lean forward (m of shoulder offset), and a sideways sway. */
  lean: number;
  /** Feet: [forward, right, lift]. */
  footL: V3;
  footR: V3;
  arm: ArmPose;
  /** Free-arm swing (walking) forward offset. */
  swing: number;
  /** Death: rotation backwards (radians) and blood. */
  fall: number;
  dead: boolean;
  /** Seated on a horse / standing in a chariot. */
  seated?: boolean;
  /** Walk phase (cloak sway). */
  phase: number;
}

const ranged = (w?: string) => w === 'sling' || w === 'bow' || w === 'bow_short' || w === 'javelins';

function manPose(d: DollSpec, frame: number): ManPose {
  const p: ManPose = { hip: 0.95, pf: 0, pr: 0, lean: 0, footL: [0.04, -0.12, 0], footR: [-0.04, 0.12, 0], arm: 'rest', swing: 0, fall: 0, dead: false, phase: 0 };
  const twoH = d.weapon === 'rhomphaia' || d.weapon === 'falx' || d.weapon === 'lance';
  // a fighting stance: left foot forward, behind the shield
  if (d.shield && !ranged(d.weapon)) {
    p.footL = [0.16, -0.13, 0];
    p.footR = [-0.12, 0.13, 0];
    p.hip = 0.93;
  }
  switch (FRAME_NAMES[frame]) {
    case 'idle1':
      p.hip -= 0.012;
      p.lean += 0.01;
      break;
    case 'walk0':
    case 'walk1':
    case 'walk2':
    case 'walk3': {
      const k = frame - 2;
      const ph = (k * Math.PI) / 2;
      p.phase = k;
      p.footL = [0.24 * Math.cos(ph), -0.12, Math.max(0, Math.sin(ph)) * 0.14];
      p.footR = [-0.24 * Math.cos(ph), 0.12, Math.max(0, -Math.sin(ph)) * 0.14];
      p.hip = 0.94 - Math.abs(Math.cos(ph)) * 0.035;
      p.lean = 0.05;
      p.swing = -0.14 * Math.cos(ph);
      break;
    }
    case 'atk0':
      p.arm = 'raise';
      p.lean = -0.03;
      p.footL = [0.2, -0.13, 0];
      p.footR = [-0.2, 0.14, 0];
      break;
    case 'atk1':
      p.arm = 'strike';
      p.lean = twoH ? 0.12 : 0.1;
      p.pf = 0.06;
      p.footL = [0.32, -0.13, 0];
      p.footR = [-0.2, 0.14, 0];
      p.hip = 0.9;
      break;
    case 'atk2':
      p.arm = 'recover';
      p.lean = 0.04;
      p.footL = [0.22, -0.13, 0];
      p.footR = [-0.16, 0.14, 0];
      break;
    case 'hit':
      p.arm = 'block';
      p.lean = -0.09;
      p.pf = -0.05;
      p.hip = 0.91;
      break;
    case 'die0':
      p.arm = 'fall';
      p.hip = 0.72;
      p.lean = -0.12;
      p.footL = [0.25, -0.15, 0];
      p.footR = [0.05, 0.15, 0];
      break;
    case 'die1':
      p.arm = 'fall';
      p.hip = 0.6;
      p.fall = 0.75;
      p.dead = true;
      p.footL = [0.3, -0.15, 0];
      p.footR = [0.12, 0.18, 0];
      break;
    case 'die2':
      p.arm = 'fall';
      p.hip = 0.55;
      p.fall = 1.45;
      p.dead = true;
      p.footL = [0.32, -0.16, 0];
      p.footR = [0.2, 0.2, 0];
      break;
  }
  return p;
}

interface Skeleton {
  pelvis: V3;
  chest: V3;
  neck: V3;
  head: V3;
  shL: V3;
  shR: V3;
  hipL: V3;
  hipR: V3;
  kneeL: V3;
  kneeR: V3;
  ankleL: V3;
  ankleR: V3;
  elbowL: V3;
  elbowR: V3;
  handL: V3;
  handR: V3;
}

/** Hand targets for each weapon and arm pose (local forward, right, up from the pelvis). */
function handTargets(d: DollSpec, p: ManPose): { R: V3; L: V3 } {
  const w = d.weapon ?? '';
  const sh = !!d.shield;
  // default: weapon hand at the side, shield forearm across the body
  let R: V3 = [0.06, 0.27, -0.1];
  let L: V3 = sh ? [0.32, -0.04, 0.22] : [0.03 + p.swing * -1, -0.27, -0.12];
  if (!sh && p.swing) R = [0.03 + p.swing, 0.27, -0.12];
  const spear = w === 'spear' || w === 'spear_short';
  const two = w === 'rhomphaia' || w === 'falx';
  switch (p.arm) {
    case 'rest':
      if (spear) R = [0.1, 0.25, 0.08];
      if (w === 'lance') R = [0.12, 0.22, 0.12];
      if (two) {
        R = [0.22, 0.18, 0.2];
        L = [0.3, 0.02, 0.12];
      }
      if (w === 'bow' || w === 'bow_short') L = [0.18, -0.22, 0.1];
      if (w === 'javelins') L = [0.12, -0.24, 0.05];
      break;
    case 'raise':
      if (spear) R = [-0.12, 0.24, 0.62];
      else if (w === 'lance') R = [-0.08, 0.2, 0.3];
      else if (w === 'bow' || w === 'bow_short') {
        L = [0.62, -0.08, 0.5];
        R = [0.12, 0.05, 0.52];
      } else if (w === 'sling') R = [0.0, 0.18, 0.92];
      else if (w === 'javelins') R = [-0.22, 0.26, 0.62];
      else if (two) {
        R = [-0.05, 0.12, 0.85];
        L = [0.0, -0.02, 0.8];
      } else R = [-0.08, 0.28, 0.8];
      break;
    case 'strike':
      if (spear) R = [0.48, 0.18, 0.5];
      else if (w === 'lance') R = [0.38, 0.12, 0.3];
      else if (w === 'bow' || w === 'bow_short') {
        L = [0.62, -0.08, 0.5];
        R = [-0.04, 0.1, 0.56];
      } else if (w === 'sling' || w === 'javelins') R = [0.55, 0.16, 0.5];
      else if (two) {
        R = [0.55, 0.1, 0.25];
        L = [0.5, -0.04, 0.3];
      } else R = [0.55, 0.12, 0.22];
      break;
    case 'recover':
      if (spear) R = [0.24, 0.24, 0.42];
      else if (two) {
        R = [0.35, 0.16, 0.15];
        L = [0.38, 0.0, 0.2];
      } else R = [0.24, 0.26, 0.2];
      break;
    case 'block':
      if (sh) L = [0.36, -0.02, 0.38];
      break;
    case 'fall':
      R = [0.18, 0.32, 0.12];
      L = [0.12, -0.32, 0.18];
      break;
  }
  return { R, L };
}

function skeleton(B: Basis, o: V3, d: DollSpec, p: ManPose): Skeleton {
  const pelvis = B.at(o, p.pf, p.pr, p.hip);
  const chest = B.at(pelvis, p.lean * 0.6, 0, 0.36);
  const neck = B.at(pelvis, p.lean, 0, 0.56);
  const head = B.at(neck, 0.02 + p.lean * 0.15, 0, 0.13);
  const shL = B.at(neck, -0.01, -0.2, -0.06);
  const shR = B.at(neck, -0.01, 0.2, -0.06);
  const hipL = B.at(pelvis, 0, -0.1, -0.04);
  const hipR = B.at(pelvis, 0, 0.1, -0.04);
  let footL = B.at(o, p.footL[0], p.footL[1], 0.06 + p.footL[2]);
  let footR = B.at(o, p.footR[0], p.footR[1], 0.06 + p.footR[2]);
  const legPole = B.dir(1, 0, 0.1);
  if (p.seated) {
    footL = B.at(pelvis, 0.12, -0.28, -0.72);
    footR = B.at(pelvis, 0.12, 0.28, -0.72);
  }
  const lL = ik(hipL, footL, 0.46, 0.44, p.seated ? B.dir(1, -0.6, 0) : legPole);
  const lR = ik(hipR, footR, 0.46, 0.44, p.seated ? B.dir(1, 0.6, 0) : legPole);
  const ht = handTargets(d, p);
  const hR = B.at(pelvis, ht.R[0], ht.R[1], ht.R[2] + 0.36);
  const hL = B.at(pelvis, ht.L[0], ht.L[1], ht.L[2] + 0.36);
  const aR = ik(shR, hR, 0.29, 0.27, B.dir(-0.4, 0.6, -1));
  const aL = ik(shL, hL, 0.29, 0.27, B.dir(-0.4, -0.6, -1));
  return {
    pelvis, chest, neck, head, shL, shR, hipL, hipR,
    kneeL: lL.mid, kneeR: lR.mid, ankleL: lL.end, ankleR: lR.end,
    elbowL: aL.mid, elbowR: aR.mid, handL: aL.end, handR: aR.end,
  };
}

/** Dust on the lower legs, scuffs: a little darker near the ground. */
const dusty: (k: number) => (l: V3, w: V3) => Hit | null = (k) => (_l, w) => (w[2] < 0.3 ? { shade: k * (1 - w[2] / 0.3) } : null);

function buildMan(sc: Scene, d: DollSpec, _frame: number, B: Basis, dir: number, p: ManPose, origin: V3 = [0, 0, 0]): Skeleton {
  const k = skeleton(B, origin, d, p);
  const look = d.look;
  const skin = SKIN[Math.max(0, Math.min(3, look.skin))];
  const tunic = CLOTH[look.tunic] ?? CLOTH.tunicWhite;
  const seed = d.seed ?? 0;
  const greaves = d.armor === 'cuirass' || d.helmet?.art === 'corinthian' || d.helmet?.art === 'attic';
  const back = dir === 1 || dir === 3;

  // ---- cloak (behind the body, swinging as he walks)
  if (d.cloak && !p.seated) {
    const cm = CLOTH[d.cloak] ?? CLOTH.cloakRed;
    sc.group();
    const sway = p.phase ? (p.phase % 2 ? 0.04 : -0.02) : 0;
    const top = add(add(k.shL, k.shR), [0, 0, 0]).map((v) => v / 2) as V3;
    const bottom = B.at(k.pelvis, -0.26 - sway - p.lean * 0.3, 0, -0.42);
    const mid = mul(add(top, bottom), 0.5);
    sc.ellipsoid(add(mid, mul(B.F, -0.08)), mul(B.F, 0.07), mul(B.R, 0.24), mul(norm(sub(top, bottom)), len(sub(top, bottom)) / 2 + 0.06), cm, (l) => (l[2] < -0.85 ? { shade: 0.8 } : null));
  } else if (d.cloak && p.seated) {
    const cm = CLOTH[d.cloak] ?? CLOTH.cloakRed;
    sc.group();
    sc.ellipsoid(B.at(k.chest, -0.2, 0, -0.08), mul(B.F, 0.06), mul(B.R, 0.2), mul(B.dir(-0.6, 0, 1), 0.3), cm);
  }

  // ---- legs
  sc.group();
  const legMat = d.trousers ? CLOTH[d.trousers] ?? CLOTH.trouserBrown : skin;
  const checks: (l: V3, w: V3) => Hit | null = d.trousers
    ? (l, w) => (((Math.floor(w[2] * 22) + Math.floor((w[0] - w[1]) * 22)) & 1) === 0 ? { shade: 0.7 } : dusty(0.8)(l, w))
    : dusty(0.6);
  for (const [hip, knee, ankle] of [[k.hipL, k.kneeL, k.ankleL], [k.hipR, k.kneeR, k.ankleR]] as [V3, V3, V3][]) {
    sc.limb(hip, knee, 0.085, 0.062, legMat, checks);
    sc.limb(knee, ankle, greaves ? 0.064 : 0.056, 0.042, greaves ? BRONZE : legMat, greaves ? undefined : checks);
    // sandal / boot
    sc.limb(ankle, add(ankle, add(mul(B.F, 0.13), [0, 0, -0.04])), 0.045, 0.035, d.trousers ? DARK_LEATHER : LEATHER);
  }

  // ---- body: hips, skirt, torso
  sc.group();
  const torsoMat: Material = d.bare ? skin : tunic;
  // skirt (tunic hem to mid-thigh) or a bare man's loin cloth / belt
  const skirtLen = d.bare ? 0.1 : 0.22;
  sc.blob(B.at(k.pelvis, 0, 0, -0.06 - skirtLen / 2), B.F, B.R, B.U, 0.16, 0.2, skirtLen / 2 + 0.08, d.bare ? (d.trousers ? CLOTH[d.trousers] ?? LEATHER : LEATHER) : tunic, (l) => (l[2] < -0.7 ? { shade: 0.9 } : l[1] > 0.55 ? { shade: 0.4 } : null));
  // torso: waist and chest
  const up = norm(sub(k.neck, k.pelvis));
  const fwd = norm(sub(B.F, mul(up, B.F[0] * up[0] + B.F[1] * up[1] + B.F[2] * up[2])));
  sc.ellipsoid(add(k.pelvis, mul(up, 0.15)), mul(fwd, 0.12), mul(B.R, 0.16), mul(up, 0.17), torsoMat, d.bare ? muscles : undefined);
  sc.ellipsoid(add(k.pelvis, mul(up, 0.38)), mul(fwd, 0.135), mul(B.R, 0.2), mul(up, 0.17), torsoMat, d.bare ? muscles : undefined);
  // body armour over the torso
  sc.group();
  armour(sc, d.armor, k, B, fwd, up);
  // belt
  if (!d.bare || d.trousers) sc.blob(add(k.pelvis, mul(up, 0.04)), fwd, B.R, up, 0.125, 0.17, 0.025, d.armor === 'mail' ? DARK_LEATHER : LEATHER);

  // ---- arms (skin; sleeves from the tunic)
  sc.group();
  for (const [sh, el, hd, side] of [[k.shL, k.elbowL, k.handL, -1], [k.shR, k.elbowR, k.handR, 1]] as [V3, V3, V3, number][]) {
    sc.limb(sh, el, 0.06, 0.048, skin, d.bare ? undefined : (_l, w) => (len(sub(w, sh)) < 0.12 ? { ramp: torsoMat.ramp } : null));
    sc.limb(el, hd, 0.046, 0.036, skin);
    sc.sphere(hd, 0.042, skin);
    void side;
  }

  // ---- head
  sc.group();
  sc.limb(k.neck, add(k.neck, mul(up, 0.08)), 0.055, 0.05, skin);
  const H = k.head;
  sc.sphere(H, 0.105, skin);
  sc.blob(B.at(H, 0.035, 0, -0.06), B.F, B.R, B.U, 0.07, 0.07, 0.06, skin); // jaw
  sc.sphere(B.at(H, 0.105, 0, -0.01), 0.022, skin); // nose
  if (!back) {
    sc.sphere(B.at(H, 0.085, -0.042, 0.015), 0.012, EYE);
    sc.sphere(B.at(H, 0.085, 0.042, 0.015), 0.012, EYE);
  }
  const hair = HAIR[Math.max(0, Math.min(3, look.hair))];
  const hairStyle = look.hairStyle;
  if (hairStyle !== 2) sc.blob(B.at(H, -0.025, 0, 0.03), B.F, B.R, B.U, 0.1, 0.112, 0.1, hair);
  if (hairStyle === 1) sc.blob(B.at(H, -0.07, 0, -0.08), B.F, B.R, B.U, 0.05, 0.1, 0.1, hair);
  if (look.beard >= 1) sc.blob(B.at(H, 0.05, 0, -0.085), B.F, B.R, B.U, 0.065, 0.075, look.beard === 2 ? 0.07 : 0.045, hair);
  if (d.helmet) helmet(sc, d.helmet, H, B, back);

  // ---- shield
  if (d.shield) shield(sc, d.shield, k, B, dir, p);

  // ---- weapon
  if (d.weapon) weapon(sc, d.weapon, k, B, p, seed);

  // ---- a dead man bleeds; the body (and everything on it) topples backwards
  if (p.fall) {
    sc.rotate(origin, B.R, -p.fall);
    if (p.dead) {
      // keep the body centred on his spot: he falls back over his own feet
      const shift = Math.sin(Math.min(p.fall, Math.PI / 2)) * 0.85;
      sc.translate(mul(B.F, shift));
      if (p.fall > 1.2) {
        sc.group();
        sc.blob(B.at(origin, 0.05, 0.12, 0.005), B.F, B.R, B.U, 0.42, 0.3, 0.01, BLOOD);
      }
    }
  }
  return k;
}

/** Muscle shading on a bare chest: a sternum groove and the line under the pectorals. */
const muscles = (l: V3): Hit | null => {
  if (l[0] > 0.3 && Math.abs(l[1]) < 0.09 && l[2] > -0.6) return { shade: 0.8 };
  if (l[0] > 0.4 && Math.abs(l[2] + 0.1) < 0.12 && Math.abs(l[1]) > 0.15) return { shade: 0.7 };
  return null;
};

function armour(sc: Scene, art: string | undefined, k: Skeleton, B: Basis, fwd: V3, up: V3): void {
  if (!art) return;
  const at = (h: number) => add(k.pelvis, mul(up, h));
  switch (art) {
    case 'cuirass': {
      const shader = (l: V3): Hit | null => {
        if (l[0] > 0.25 && Math.abs(l[1]) < 0.1 && l[2] > -0.7) return { shade: 1 };
        if (l[0] > 0.35 && Math.abs(l[2] - 0.05) < 0.11 && Math.abs(l[1]) > 0.2) return { shade: 0.9 };
        if (l[0] > 0.3 && l[2] < -0.35 && ((Math.floor(l[2] * 6) & 1) === 0)) return { shade: 0.6 };
        return null;
      };
      sc.ellipsoid(at(0.17), mul(fwd, 0.14), mul(B.R, 0.18), mul(up, 0.19), BRONZE, shader);
      sc.ellipsoid(at(0.39), mul(fwd, 0.155), mul(B.R, 0.215), mul(up, 0.17), BRONZE, shader);
      pteruges(sc, k, B, fwd, up, LEATHER);
      break;
    }
    case 'linothorax': {
      const band = (l: V3): Hit | null => (Math.abs(l[2] + 0.2) < 0.13 ? { ramp: CLOTH.tunicOchre.ramp } : l[0] > 0.5 && Math.abs(l[1]) < 0.05 ? { shade: 0.6 } : null);
      sc.ellipsoid(at(0.17), mul(fwd, 0.135), mul(B.R, 0.175), mul(up, 0.19), LINEN, band);
      sc.ellipsoid(at(0.39), mul(fwd, 0.15), mul(B.R, 0.21), mul(up, 0.17), LINEN);
      // shoulder yoke flaps
      sc.blob(at(0.5), fwd, B.R, up, 0.12, 0.2, 0.05, LINEN);
      pteruges(sc, k, B, fwd, up, LINEN);
      break;
    }
    case 'scale': {
      const scales = (_l: V3, w: V3): Hit | null => (((Math.floor(w[2] * 26) + (Math.floor((w[0] - w[1]) * 18) & 1)) & 1) === 0 ? { shade: 0.9 } : null);
      sc.ellipsoid(at(0.17), mul(fwd, 0.14), mul(B.R, 0.18), mul(up, 0.2), BRONZE, scales);
      sc.ellipsoid(at(0.39), mul(fwd, 0.155), mul(B.R, 0.215), mul(up, 0.17), BRONZE, scales);
      pteruges(sc, k, B, fwd, up, LEATHER);
      break;
    }
    case 'mail': {
      const rings = (_l: V3, w: V3): Hit | null => (((Math.floor(w[2] * 30) + Math.floor((w[0] - w[1]) * 30)) & 1) === 0 ? { shade: 0.8 } : null);
      sc.ellipsoid(at(0.12), mul(fwd, 0.14), mul(B.R, 0.19), mul(up, 0.25), IRON, rings);
      sc.ellipsoid(at(0.39), mul(fwd, 0.15), mul(B.R, 0.215), mul(up, 0.17), IRON, rings);
      // shoulder doubling
      sc.blob(at(0.5), fwd, B.R, up, 0.12, 0.22, 0.05, IRON);
      break;
    }
    case 'leather': {
      sc.ellipsoid(at(0.17), mul(fwd, 0.135), mul(B.R, 0.175), mul(up, 0.19), LEATHER, (l) => (l[0] > 0.6 && Math.abs(l[1]) < 0.06 ? { shade: 0.9 } : null));
      sc.ellipsoid(at(0.39), mul(fwd, 0.148), mul(B.R, 0.205), mul(up, 0.165), LEATHER);
      break;
    }
  }
}

/** Hanging strips (pteruges) at the waist. */
function pteruges(sc: Scene, k: Skeleton, B: Basis, fwd: V3, up: V3, mat: Material): void {
  sc.ellipsoid(add(k.pelvis, mul(up, -0.08)), mul(fwd, 0.16), mul(B.R, 0.21), mul(up, 0.11), mat, (l) => {
    const a = Math.atan2(l[1], l[0]);
    return Math.floor((a + 4) * 4) & 1 ? { shade: 1 } : l[2] < -0.6 ? { shade: 0.5 } : null;
  });
}

// ---------------------------------------------------------------- helmets

function helmet(sc: Scene, h: { art: string; paint?: ItemPaint }, H: V3, B: Basis, back: boolean): void {
  sc.group();
  const crest = CREST[h.paint?.field ?? 'red'] ?? CREST.red;
  const bowl = (r = 0.122, mat: Material = BRONZE) => sc.blob(B.at(H, -0.01, 0, 0.035), B.F, B.R, B.U, r, r * 0.98, r * 0.92, mat);
  const ridgeCrest = (h0: number, height: number, length: number, transverse = false) => {
    // horsehair crest: a sweep of spheres over the bowl, front to back (or ear to ear)
    sc.group();
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const t = i / n - 0.5;
      const a = transverse ? B.at(H, 0, t * length * 2, h0 + height * (1 - 4 * t * t) * 0.7) : B.at(H, t * length * 2 - 0.02, 0, h0 + height * (1 - 2.4 * t * t) * 0.8);
      sc.sphere(a, 0.042 + (1 - 4 * t * t) * 0.015, crest);
    }
    // tail of the crest hanging behind
    if (!transverse) sc.limb(B.at(H, -length * 1.05, 0, h0 + height * 0.25), B.at(H, -length * 1.25, 0, h0 - 0.12), 0.04, 0.02, crest);
  };
  switch (h.art) {
    case 'cap':
      sc.blob(B.at(H, -0.01, 0, 0.05), B.F, B.R, B.U, 0.112, 0.112, 0.08, LEATHER);
      break;
    case 'hood': {
      sc.blob(B.at(H, -0.02, 0, 0.03), B.F, B.R, B.U, 0.12, 0.125, 0.11, FELT);
      sc.limb(B.at(H, -0.01, 0, 0.1), B.at(H, -0.08, 0, 0.32), 0.075, 0.015, FELT);
      sc.blob(B.at(H, -0.03, 0, -0.08), B.F, B.R, B.U, 0.09, 0.13, 0.08, FELT); // flaps
      break;
    }
    case 'pilos':
      bowl(0.118);
      sc.limb(B.at(H, -0.01, 0, 0.08), B.at(H, -0.02, 0, 0.27), 0.1, 0.018, BRONZE);
      break;
    case 'montefortino':
      bowl(0.122);
      sc.sphere(B.at(H, -0.01, 0, 0.16), 0.03, BRONZE); // knob
      sc.limb(B.at(H, -0.01, 0, 0.18), B.at(H, -0.12, 0, 0.3), 0.035, 0.05, crest); // short plume
      sc.blob(B.at(H, 0.02, 0.09, -0.06), B.F, B.R, B.U, 0.05, 0.02, 0.06, BRONZE); // cheek guards
      sc.blob(B.at(H, 0.02, -0.09, -0.06), B.F, B.R, B.U, 0.05, 0.02, 0.06, BRONZE);
      break;
    case 'thracian':
      bowl(0.12);
      // the forward-curving Phrygian peak and a small crest along it
      sc.limb(B.at(H, -0.02, 0, 0.1), B.at(H, 0.08, 0, 0.2), 0.09, 0.05, BRONZE);
      sc.limb(B.at(H, 0.08, 0, 0.2), B.at(H, 0.14, 0, 0.15), 0.05, 0.035, BRONZE);
      sc.blob(B.at(H, 0.03, 0.095, -0.07), B.F, B.R, B.U, 0.06, 0.02, 0.06, BRONZE);
      sc.blob(B.at(H, 0.03, -0.095, -0.07), B.F, B.R, B.U, 0.06, 0.02, 0.06, BRONZE);
      ridgeCrest(0.2, 0.06, 0.08);
      break;
    case 'boeotian':
      bowl(0.12);
      // wide folded brim
      sc.blob(B.at(H, 0, 0, 0.0), B.F, B.R, B.U, 0.19, 0.19, 0.035, BRONZE, (l) => (Math.abs(l[0]) > 0.6 && l[2] > 0 ? { shade: 0.6 } : null));
      break;
    case 'chalcidian':
    case 'attic':
    case 'corinthian': {
      const full = h.art === 'corinthian';
      sc.blob(B.at(H, -0.01, 0, full ? 0.0 : 0.03), B.F, B.R, B.U, 0.128, 0.126, full ? 0.15 : 0.11, BRONZE, full && !back ? (l) => (l[0] > 0.5 && l[2] > -0.15 && l[2] < 0.1 && Math.abs(l[1]) > 0.08 ? { ramp: EYE.ramp } : l[0] > 0.6 && Math.abs(l[1]) < 0.12 && l[2] < -0.4 ? { ramp: EYE.ramp } : null) : undefined);
      if (!full) {
        sc.blob(B.at(H, 0.03, 0.1, -0.07), B.F, B.R, B.U, 0.06, 0.02, 0.07, BRONZE);
        sc.blob(B.at(H, 0.03, -0.1, -0.07), B.F, B.R, B.U, 0.06, 0.02, 0.07, BRONZE);
      }
      // the tall crest: the silhouette of a hoplite
      sc.limb(B.at(H, -0.01, 0, 0.12), B.at(H, -0.01, 0, 0.17), 0.025, 0.025, BRONZE);
      ridgeCrest(h.art === 'attic' ? 0.24 : 0.2, h.art === 'attic' ? 0.16 : 0.12, h.art === 'attic' ? 0.16 : 0.13);
      break;
    }
  }
}

// ---------------------------------------------------------------- shields

function shieldFrame(n: V3): { s: V3; v: V3 } {
  // side axis across the face, up axis on it; keep emblems unmirrored for the viewer
  let s = norm(cross([0, 0, 1], n));
  if (len(s) < 0.1) s = [1, 0, 0];
  const v = norm(cross(n, s));
  return { s, v };
}

function shield(sc: Scene, sh: { art: string; paint?: ItemPaint }, k: Skeleton, B: Basis, dir: number, p: ManPose): void {
  sc.group();
  const paint = sh.paint ?? {};
  const field = FIELD[paint.field ?? 'bronze'] ?? FIELD.bronze;
  const ink = INK[paint.ink ?? 'ink'] ?? INK.ink;
  const em = paint.emblem ? EMBLEM_BITMAPS[paint.emblem] : undefined;
  const back = dir === 1 || dir === 3;
  // Held on the left forearm in front; seen from behind it is carried at the
  // left side, turned so its painted face shows to the viewer (the player).
  const L = mul(B.R, -1);
  let c: V3;
  let n: V3;
  if (p.arm === 'fall') {
    c = add(k.handL, mul(L, 0.1));
    n = norm(add(B.F, mul(L, 0.6)));
  } else {
    c = add(k.handL, add(mul(B.F, 0.05), mul(L, 0.03)));
    n = norm(add(B.F, mul(L, 0.25)));
  }
  if (back && p.arm !== 'fall') {
    c = add(add(k.chest, mul(L, 0.3)), mul(B.F, 0.02));
    n = norm(add(mul(CAM, 0.85), mul(L, 0.5)));
  }
  const { s, v } = shieldFrame(n);
  // face-on: the face is the side towards n; emblem grid 7x7 over the centre
  const flipX = project(s).x < 0 ? -1 : 1;
  const emblemAt = (u: number, w: number, spread: number): boolean => {
    if (!em) return false;
    const gx = Math.floor(((u * flipX) / spread + 0.5) * 7);
    const gy = Math.floor((0.5 - w / spread) * 7);
    return gx >= 0 && gy >= 0 && gx < 7 && gy < 7 && em[gy][gx] === '#';
  };
  switch (sh.art) {
    case 'hoplon': {
      const R = 0.46;
      sc.ellipsoid(c, mul(n, 0.06), mul(s, R), mul(v, R), { ramp: field, metal: paint.field === 'bronze' || paint.field === 'silver', grit: 0.5, contrast: 1.05 }, (l) => {
        if (l[0] < 0) return { ramp: LEATHER.ramp };
        const r = Math.sqrt(l[1] * l[1] + l[2] * l[2]);
        if (r > 0.88) return { ramp: BRONZE.ramp };
        if (r > 0.83) return { shade: 0.8 };
        if (emblemAt(l[1], l[2], 1.3)) return { ramp: ink };
        return null;
      });
      break;
    }
    case 'oval': {
      sc.ellipsoid(c, mul(n, 0.05), mul(s, 0.3), mul(v, 0.56), { ramp: field, grit: 0.5, contrast: 0.95 }, (l) => {
        if (l[0] < 0) return { ramp: WOOD.ramp };
        if (Math.abs(l[1]) < 0.09 && Math.abs(l[2]) > 0.25) return { ramp: WOOD.ramp }; // spina
        if (Math.abs(l[1]) < 0.22 && Math.abs(l[2]) < 0.2) return { ramp: IRON.ramp }; // boss
        const r = Math.sqrt(l[1] * l[1] + l[2] * l[2]);
        if (r > 0.9) return { shade: 0.9 };
        if (emblemAt(l[1] * 0.55, l[2], 1.0) && Math.abs(l[2]) > 0.25) return { ramp: ink };
        return null;
      });
      break;
    }
    case 'pelte': {
      sc.ellipsoid(c, mul(n, 0.04), mul(s, 0.3), mul(v, 0.27), { ramp: FIELD[paint.field ?? 'cream'] ?? field, grit: 0.6 }, (l) => {
        // the crescent notch at the top
        if (l[2] > 0.35 && Math.abs(l[1]) < 0.45 - (l[2] - 0.35) * 0.3) return { hole: true };
        if (l[0] < 0) return { ramp: WOOD.ramp };
        if (Math.sqrt(l[1] * l[1] + l[2] * l[2]) > 0.86) return { ramp: LEATHER.ramp };
        return null;
      });
      break;
    }
    case 'buckler':
    default: {
      sc.ellipsoid(c, mul(n, 0.05), mul(s, 0.21), mul(v, 0.21), { ramp: field, metal: true, grit: 0.4 }, (l) => (l[0] < 0 ? { ramp: LEATHER.ramp } : Math.sqrt(l[1] * l[1] + l[2] * l[2]) < 0.3 ? { ramp: BRONZE.ramp, shade: -0.5 } : null));
      break;
    }
  }
}

// ---------------------------------------------------------------- weapons

function weapon(sc: Scene, w: string, k: Skeleton, B: Basis, p: ManPose, seed: number): void {
  sc.group();
  const hR = k.handR;
  const hL = k.handL;
  const shaft = (a: V3, b: V3, mat: Material = WOOD) => sc.line(a, b, mat, 1);
  const blade = (a: V3, b: V3, mat: Material = IRON, width = 2) => sc.line(a, b, mat, width);
  const tip = (base: V3, d: V3, l = 0.24, mat: Material = BRONZE) => {
    sc.line(base, add(base, mul(d, l)), mat, 2);
    sc.line(add(base, mul(d, l)), add(base, mul(d, l + 0.05)), mat, 1);
  };
  const dropped = p.dead || p.arm === 'fall';
  if (dropped && p.dead) {
    // the weapon lies beside the body
    const o = B.at([0, 0, 0], 0.4, 0.45, 0.03);
    const along = norm(add(B.F, mul(B.R, 0.3 + (seed % 3) * 0.1)));
    if (w === 'spear' || w === 'spear_short' || w === 'lance' || w === 'javelins' || w === 'rhomphaia') {
      const l = w === 'lance' ? 3.2 : w === 'spear' ? 2.3 : 1.6;
      shaft(add(o, mul(along, -l / 2)), add(o, mul(along, l / 2)));
      tip(add(o, mul(along, l / 2)), along, w === 'rhomphaia' ? 0.6 : 0.2, w === 'rhomphaia' ? IRON : BRONZE);
    } else blade(o, add(o, mul(along, 0.6)));
    return;
  }
  switch (w) {
    case 'spear':
    case 'spear_short':
    case 'lance': {
      const L = w === 'lance' ? 3.4 : w === 'spear' ? 2.5 : 1.85;
      let d: V3;
      let grip = 0.42; // fraction of the shaft behind the hand
      if (p.arm === 'rest' && !p.seated) {
        // upright, butt-spike near the foot: the hedge of a phalanx at rest
        d = norm(add(B.U, mul(B.F, 0.08)));
        grip = 0.28;
      } else if (p.arm === 'rest' && p.seated) {
        d = norm(add(mul(B.F, 1), mul(B.U, w === 'lance' ? 0.15 : 0.9)));
        grip = 0.35;
      } else if (p.arm === 'raise') d = norm(add(B.F, mul(B.U, -0.12)));
      else if (p.arm === 'strike') d = norm(add(B.F, mul(B.U, -0.2)));
      else if (p.arm === 'block') d = norm(add(B.U, mul(B.F, 0.5)));
      else d = norm(add(B.F, mul(B.U, 0.1)));
      if (p.seated && w === 'lance' && p.arm !== 'rest') d = norm(add(B.F, mul(B.U, -0.08)));
      const a = sub(hR, mul(d, L * grip));
      const b = add(hR, mul(d, L * (1 - grip)));
      shaft(a, b, w === 'lance' ? DARK_WOOD : WOOD);
      tip(b, d, 0.22, w === 'lance' ? IRON : BRONZE);
      sc.line(a, sub(a, mul(d, 0.1)), BRONZE, 1); // sauroter
      break;
    }
    case 'sword':
    case 'kopis':
    case 'longsword': {
      const L = w === 'longsword' ? 0.85 : 0.6;
      let d: V3;
      if (p.arm === 'raise') d = B.dir(-0.6, 0.2, 0.8);
      else if (p.arm === 'strike') d = B.dir(1, -0.1, -0.35);
      else if (p.arm === 'recover') d = B.dir(0.8, 0.1, 0.4);
      else d = B.dir(0.25, 0.05, 1);
      sc.line(sub(hR, mul(d, 0.09)), hR, DARK_LEATHER, 1); // grip
      sc.line(add(hR, mul(B.R, -0.05)), add(hR, mul(B.R, 0.05)), BRONZE, 1); // guard
      if (w === 'kopis') {
        const mid = add(hR, mul(d, L * 0.55));
        blade(hR, mid);
        blade(mid, add(mid, mul(norm(add(d, mul(B.U, -0.35))), L * 0.45)));
      } else {
        const end = add(hR, mul(d, L));
        sc.line(hR, end, IRON, 1);
        sc.line(add(hR, mul(B.U, -0.015)), add(end, mul(B.U, -0.015)), { ramp: IRON.ramp.slice(2) }, 1);
      }
      break;
    }
    case 'axe':
    case 'club': {
      let d: V3;
      if (p.arm === 'raise') d = B.dir(-0.5, 0.1, 0.9);
      else if (p.arm === 'strike') d = B.dir(1, 0, -0.4);
      else d = B.dir(0.35, 0.05, 1);
      const end = add(hR, mul(d, 0.65));
      if (w === 'axe') {
        shaft(sub(hR, mul(d, 0.12)), end);
        const side = norm(cross(d, B.R));
        sc.box(add(end, mul(side, 0.06)), mul(d, 0.06), mul(B.R, 0.015), mul(side, 0.09), IRON);
      } else {
        sc.limb(hR, end, 0.025, 0.06, WOOD);
      }
      break;
    }
    case 'falx':
    case 'rhomphaia': {
      // two-handed: haft between the hands, a long (curved) blade beyond
      const d = norm(sub(hR, hL).map((v, i) => v + [0, 0, 0.0001][i]) as V3);
      const haft = w === 'falx' ? 0.75 : 0.95;
      const start = sub(hL, mul(d, 0.18));
      const end = add(start, mul(d, haft));
      shaft(start, end, DARK_WOOD);
      const bend = norm(add(d, mul(B.U, w === 'falx' ? -0.8 : -0.15)));
      const bl = w === 'falx' ? 0.55 : 0.75;
      const mid = add(end, mul(d, bl * 0.5));
      blade(end, mid, IRON, 2);
      blade(mid, add(mid, mul(bend, bl * 0.55)), IRON, 2);
      break;
    }
    case 'javelins': {
      // a sheaf in the left hand, one ready in the right
      const up = norm(add(B.U, mul(B.F, 0.15)));
      for (const off of [-0.03, 0.03]) {
        const base = add(hL, mul(B.R, off));
        shaft(sub(base, mul(up, 0.55)), add(base, mul(up, 0.9)));
        sc.line(add(base, mul(up, 0.9)), add(base, mul(up, 1.0)), IRON, 1);
      }
      if (p.arm !== 'strike') {
        const d = p.arm === 'raise' ? norm(add(B.F, mul(B.U, 0.25))) : norm(add(B.U, mul(B.F, 0.3)));
        shaft(sub(hR, mul(d, 0.6)), add(hR, mul(d, 0.85)));
        sc.line(add(hR, mul(d, 0.85)), add(hR, mul(d, 0.97)), IRON, 1);
      }
      break;
    }
    case 'sling': {
      if (p.arm === 'raise') {
        // the cords whirl overhead
        const c = add(hR, mul(B.U, 0.25));
        for (let i = 0; i < 8; i++) {
          const a0 = (i / 8) * Math.PI * 2;
          const a1 = ((i + 1) / 8) * Math.PI * 2;
          sc.line(add(c, add(mul(B.F, Math.cos(a0) * 0.3), mul(B.R, Math.sin(a0) * 0.3))), add(c, add(mul(B.F, Math.cos(a1) * 0.3), mul(B.R, Math.sin(a1) * 0.3))), STRING, 1);
        }
      } else {
        sc.line(hR, add(hR, B.dir(0.1, 0, -0.5)), STRING, 1);
        sc.sphere(add(hR, B.dir(0.1, 0, -0.55)), 0.04, LEATHER);
      }
      // the pouch of stones at the hip
      sc.sphere(B.at(k.pelvis, 0.02, -0.2, -0.05), 0.07, LEATHER);
      break;
    }
    case 'bow':
    case 'bow_short': {
      const short = w === 'bow_short';
      const half = short ? 0.42 : 0.62;
      const aiming = p.arm === 'raise' || p.arm === 'strike';
      const grip = hL;
      const fwd = aiming ? norm(sub(hL, k.shL)) : B.F;
      const upv = norm(sub(B.U, mul(fwd, fwd[2])));
      const pts: V3[] = [];
      for (let i = 0; i <= 6; i++) {
        const t = i / 6 - 0.5;
        const bend = short ? (Math.abs(t) > 0.35 ? -0.06 : 0.1) * (1 - 4 * t * t) + (Math.abs(t) > 0.4 ? -0.05 : 0) : 0.14 * (1 - 4 * t * t);
        pts.push(add(add(grip, mul(upv, t * 2 * half)), mul(fwd, bend)));
      }
      for (let i = 0; i < 6; i++) sc.line(pts[i], pts[i + 1], DARK_WOOD, 1);
      const nock = p.arm === 'raise' ? hR : add(grip, mul(fwd, -0.02));
      sc.line(pts[0], nock, STRING, 1);
      sc.line(nock, pts[6], STRING, 1);
      if (p.arm === 'raise') sc.line(nock, add(grip, mul(fwd, 0.18)), WOOD, 1); // arrow
      // quiver on the back (a gorytos case at the hip for the steppe bow)
      if (short) sc.blob(B.at(k.pelvis, -0.08, -0.2, 0.0), B.F, B.R, B.U, 0.08, 0.05, 0.18, LEATHER);
      else {
        const qa = B.at(k.chest, -0.16, 0.08, -0.25);
        sc.limb(qa, B.at(k.chest, -0.2, 0.16, 0.25), 0.06, 0.06, LEATHER);
        sc.line(B.at(k.chest, -0.2, 0.16, 0.25), B.at(k.chest, -0.22, 0.18, 0.36), WOOD, 1);
      }
      break;
    }
  }
}

// ================================================================ horses and riders

interface Gait {
  /** Per leg [fl, fr, hl, hr]: swing angle forward (rad) and lift (m). */
  swing: number[];
  lift: number[];
  /** Body pitch (rad, + = nose up) and height bob. */
  pitch: number;
  bob: number;
  /** Head / neck: + = head raised. */
  head: number;
  roll: number;
  down: number;
}

function gait(frame: number): Gait {
  const g: Gait = { swing: [0.05, -0.05, -0.05, 0.05], lift: [0, 0, 0, 0], pitch: 0, bob: 0, head: 0, roll: 0, down: 0 };
  const name = FRAME_NAMES[frame];
  if (name === 'idle1') g.head = -0.08;
  if (name.startsWith('walk')) {
    // transverse gallop: hind pair then fore pair, a moment of suspension
    const k = frame - 2;
    const sw = [
      [0.45, 0.3, -0.35, -0.5],
      [0.1, 0.45, -0.05, -0.35],
      [-0.45, -0.3, 0.45, 0.3],
      [-0.2, -0.45, 0.2, 0.45],
    ][k];
    const lf = [
      [0.12, 0.05, 0.0, 0.0],
      [0.0, 0.12, 0.06, 0.0],
      [0.0, 0.0, 0.14, 0.06],
      [0.06, 0.0, 0.0, 0.14],
    ][k];
    g.swing = sw;
    g.lift = lf;
    g.pitch = [0.05, 0.0, -0.06, 0.0][k];
    g.bob = [0.05, 0.0, 0.03, -0.02][k];
    g.head = [-0.1, 0.05, 0.12, 0.0][k];
  } else if (name === 'atk0') {
    g.head = 0.15;
    g.swing = [0.25, 0.1, -0.15, -0.1];
  } else if (name === 'atk1') {
    g.pitch = -0.05;
    g.swing = [0.35, 0.3, -0.3, -0.25];
    g.head = -0.1;
  } else if (name === 'atk2') {
    g.swing = [0.15, 0.05, -0.1, -0.05];
  } else if (name === 'hit') {
    // rearing
    g.pitch = 0.45;
    g.swing = [0.9, 0.6, 0.15, 0.1];
    g.lift = [0.3, 0.2, 0, 0];
    g.head = 0.3;
  } else if (name === 'die0') {
    g.pitch = -0.2;
    g.swing = [0.7, 0.6, -0.1, -0.1];
    g.down = 0.25;
  } else if (name === 'die1') {
    g.roll = 0.75;
    g.down = 0.35;
    g.swing = [0.5, 0.3, -0.3, -0.2];
  } else if (name === 'die2') {
    g.roll = 1.5;
    g.down = 0.42;
    g.swing = [0.6, 0.2, -0.5, -0.1];
  }
  return g;
}

/** A horse standing on the origin, facing B.F. Returns the saddle point (world). */
function buildHorse(sc: Scene, B: Basis, frame: number, coat: Material, o: V3 = [0, 0, 0], tack: Material | null = LEATHER, cloth: Material | null = null): V3 {
  const g = gait(frame);
  const at = (f: number, r: number, u: number) => B.at(o, f, r, u + g.bob - g.down);
  sc.group();
  // legs first (each leg: shoulder/hip -> knee -> hoof)
  const legs: [number, number, number][] = [[0.52, -0.16, 0], [0.52, 0.16, 1], [-0.58, -0.16, 2], [-0.58, 0.16, 3]];
  for (const [lf, lr, i] of legs) {
    const top = at(lf, lr, 1.02);
    const a = g.swing[i];
    const lift = g.lift[i];
    const knee = add(top, add(mul(B.F, Math.sin(a) * 0.45), mul(B.U, -Math.cos(a) * 0.45 + lift * 0.4)));
    const hind = i >= 2;
    const bendF = hind ? -1 : 1;
    const hoof = add(knee, add(mul(B.F, Math.sin(a) * 0.3 + bendF * lift * 0.5 * (hind ? -0.6 : 0.6)), mul(B.U, -0.5 + lift)));
    sc.limb(top, knee, 0.1, 0.055, coat);
    sc.limb(knee, hoof, 0.045, 0.035, coat);
    sc.limb(hoof, add(hoof, mul(B.U, -0.06)), 0.045, 0.05, HOOF);
  }
  // barrel, chest and haunches
  sc.group();
  const body = at(0, 0, 1.22);
  sc.blob(body, B.F, B.R, B.U, 0.72, 0.27, 0.3, coat, (l) => (l[2] < -0.75 ? { shade: 0.6 } : null));
  sc.blob(at(0.5, 0, 1.25), B.F, B.R, B.U, 0.32, 0.26, 0.32, coat);
  sc.blob(at(-0.55, 0, 1.28), B.F, B.R, B.U, 0.34, 0.29, 0.32, coat);
  // neck, head, ears, mane, tail
  const neckBase = at(0.72, 0, 1.45);
  const headTop = at(1.02 + g.head * 0.1, 0, 1.92 + g.head * 0.3);
  sc.limb(neckBase, headTop, 0.17, 0.1, coat);
  const muzzle = add(headTop, B.dir(0.55, 0, -0.55 + g.head).map((v) => v * 0.48) as V3);
  sc.limb(headTop, muzzle, 0.1, 0.065, coat);
  sc.sphere(muzzle, 0.06, coat);
  for (const s of [-1, 1]) sc.limb(add(headTop, mul(B.R, s * 0.05)), add(headTop, add(mul(B.U, 0.13), mul(B.R, s * 0.06))), 0.025, 0.012, coat);
  sc.group();
  sc.limb(add(neckBase, mul(B.U, 0.14)), add(headTop, mul(B.U, 0.08)), 0.055, 0.045, MANE);
  const tailRoot = at(-0.86, 0, 1.4);
  const flick = FRAME_NAMES[frame].startsWith('walk') ? 0.25 : 0;
  sc.limb(tailRoot, add(tailRoot, B.dir(-0.6 - flick, 0, -0.8).map((v) => v * 0.6) as V3), 0.06, 0.03, MANE);
  // tack: saddle cloth, bridle, reins
  let saddle = at(-0.08, 0, 1.52);
  if (cloth) {
    sc.group();
    sc.blob(at(-0.1, 0, 1.44), B.F, B.R, B.U, 0.36, 0.3, 0.1, cloth, (l) => (l[2] < -0.5 ? { shade: 0.6 } : null));
    saddle = at(-0.08, 0, 1.56);
  }
  if (tack) {
    sc.line(add(headTop, mul(B.U, -0.04)), muzzle, tack, 1);
    sc.line(muzzle, add(saddle, mul(B.F, 0.3)), tack, 1);
  }
  // body pitch (rearing) and roll (falling) about the hind hooves / the ground
  if (g.pitch) sc.rotate(at(-0.6, 0, 0), B.R, -g.pitch);
  return saddle;
}

function buildRider(sc: Scene, d: DollSpec, frame: number, B: Basis, dir: number): void {
  const coat = COATS[(d.coat ?? 0) % COATS.length];
  const cloth = d.cloak ? CLOTH[d.cloak] ?? null : null;
  const g = gait(frame);
  // the rider's pose: seated, the weapon moving with the frame
  const p = manPose({ ...d, shield: d.shield }, frame);
  p.seated = true;
  p.lean = FRAME_NAMES[frame] === 'atk1' ? 0.14 : FRAME_NAMES[frame].startsWith('walk') ? 0.08 : 0.02;
  p.pf = 0;
  p.footL = [0, 0, 0];
  p.footR = [0, 0, 0];
  if (frame >= 10) p.arm = 'fall';
  p.fall = 0;
  p.dead = false;
  const horse = new Scene();
  const saddle = buildHorse(horse, B, frame, coat, [0, 0, 0], LEATHER, cloth ?? CLOTH.tunicOchre);
  // seat him: the pelvis just above the saddle
  const riderScene = new Scene();
  const name = FRAME_NAMES[frame];
  const thrown = name === 'die1' || name === 'die2';
  if (!thrown) {
    p.hip = saddle[2] + 0.08;
    // skeleton() places the pelvis at origin + hip: origin = saddle ground projection
    buildMan(riderScene, d, frame, B, dir, p, [saddle[0], saddle[1], 0]);
    if (g.pitch) riderScene.rotate(B.at([0, 0, 0], -0.6, 0, 0), B.R, -g.pitch);
  } else {
    // thrown ahead of the falling horse
    const pp = manPose({ ...d, cloak: undefined }, name === 'die1' ? 11 : 12);
    buildMan(riderScene, { ...d, cloak: undefined }, name === 'die1' ? 11 : 12, B, dir, pp, B.at([0, 0, 0], 0.6, -0.7, 0));
  }
  if (g.roll) {
    // the horse falls onto its side (towards its right)
    horse.rotate(B.at([0, 0, 0], 0, 0.3, 0), B.F, g.roll);
    // keep the fallen horse on its spot (it lies across where it stood)
    horse.translate(mul(B.R, -Math.sin(Math.min(g.roll, Math.PI / 2)) * 0.95));
    if (g.roll > 1.2) {
      horse.group();
      horse.blob(B.at([0, 0, 0], 0, 0.1, 0.005), B.F, B.R, B.U, 0.6, 0.35, 0.01, BLOOD);
    }
  }
  merge(sc, horse);
  merge(sc, riderScene);
}

/** Two horses, a pole and a scythed two-wheeled car with a driver and the warrior. */
function buildChariot(sc: Scene, d: DollSpec, frame: number, B: Basis, dir: number): void {
  const name = FRAME_NAMES[frame];
  const wrecked = name === 'die1' || name === 'die2';
  const coatA = COATS[(d.coat ?? 0) % COATS.length];
  const coatB = COATS[((d.coat ?? 0) + 3) % COATS.length];
  // horses abreast in front
  for (const [side, coat] of [[-0.42, coatA], [0.42, coatB]] as [number, Material][]) {
    const h = new Scene();
    const f = wrecked ? (name === 'die1' ? 10 : 12) : frame;
    buildHorse(h, B, f >= 10 && !wrecked ? 0 : f, coat, B.at([0, 0, 0], 0.9, side, 0), LEATHER, null);
    merge(sc, h);
  }
  sc.group();
  const car = B.at([0, 0, 0], -0.75, 0, 0.78);
  const tilt = wrecked ? 0.5 : 0;
  // the pole and yoke
  sc.line(B.at(car, 0.3, 0, -0.1), B.at([0, 0, 0], 1.25, 0, 1.25), DARK_WOOD, 2);
  sc.line(B.at([0, 0, 0], 1.25, -0.5, 1.3), B.at([0, 0, 0], 1.25, 0.5, 1.3), DARK_WOOD, 1);
  // the car: a wicker box with a red-painted rail
  sc.box(car, mul(B.F, 0.36), mul(B.R, 0.5), mul(B.U, 0.28), WOOD, (l) => (l[2] > 0.6 ? { ramp: CLOTH.tunicRed.ramp } : ((Math.floor((l[0] + l[1]) * 6) & 1) === 0 ? { shade: 0.6 } : null)));
  // wheels with spokes and scythes on the hubs
  for (const s of [-1, 1]) {
    const hub = B.at([0, 0, 0], -0.8, s * 0.62, 0.48);
    const n = mul(B.R, s);
    const { s: ws, v: wv } = shieldFrame(n);
    const spin = (frame % 4) * 0.4;
    sc.ellipsoid(hub, mul(n, 0.05), mul(ws, 0.48), mul(wv, 0.48), DARK_WOOD, (l) => {
      const r = Math.sqrt(l[1] * l[1] + l[2] * l[2]);
      if (r > 0.82) return { ramp: IRON.ramp };
      if (r < 0.2) return { ramp: BRONZE.ramp };
      const a = Math.atan2(l[2], l[1]) + spin;
      const sp = ((a % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3);
      return sp < 0.18 ? null : { hole: true };
    });
    if (!wrecked) sc.line(hub, add(hub, add(mul(n, 0.6), mul(B.F, -0.15))), IRON, 2);
  }
  // crew: the warrior (the hero) and a driver, standing in the car
  const crew = new Scene();
  if (!wrecked) {
    const p = manPose({ ...d, shield: undefined }, frame);
    p.footL = [0.08, -0.12, 0];
    p.footR = [-0.06, 0.12, 0];
    if (frame >= 10) p.arm = 'fall';
    p.fall = 0;
    p.dead = false;
    buildMan(crew, { ...d, cloak: undefined, mount: undefined }, frame, B, dir, p, B.at(car, 0.02, 0.2, -0.22));
    const driver: DollSpec = { look: { ...d.look, tunic: 'tunicWhite', beard: 0 }, helmet: { art: 'cap' }, seed: 1 };
    const dp = manPose(driver, 0);
    dp.arm = 'rest';
    buildMan(crew, driver, 0, B, dir, dp, B.at(car, 0.06, -0.22, -0.22));
  } else {
    const pp = manPose(d, name === 'die1' ? 11 : 12);
    buildMan(crew, { ...d, cloak: undefined }, name === 'die1' ? 11 : 12, B, dir, pp, B.at([0, 0, 0], 0.2, 0.9, 0));
  }
  merge(sc, crew);
  if (tilt) sc.rotate(B.at([0, 0, 0], -0.8, 0.6, 0), B.F, tilt * 0.6);
}

// ================================================================ animals

function buildBeast(sc: Scene, beast: BeastId, frame: number, B: Basis, seed: number): void {
  const c = BEAST[beast];
  const name = FRAME_NAMES[frame];
  const walk = name.startsWith('walk') ? frame - 2 : -1;
  const S = beast === 'bear' ? 1.5 : beast === 'boar' ? 1.0 : 1.0;
  const bodyH = beast === 'wolf' ? 0.55 : beast === 'boar' ? 0.5 : 0.75;
  const bodyL = beast === 'wolf' ? 0.42 : beast === 'boar' ? 0.48 : 0.7;
  const bodyR = beast === 'wolf' ? 0.13 : beast === 'boar' ? 0.22 : 0.38;
  const bodyU = beast === 'wolf' ? 0.15 : beast === 'boar' ? 0.25 : 0.4;
  let rear = 0; // bear rearing / lunge pitch
  let lunge = 0;
  let down = 0;
  let roll = 0;
  if (name === 'atk0') {
    rear = beast === 'bear' ? 0.9 : 0.12;
    lunge = beast === 'bear' ? 0 : -0.05;
  } else if (name === 'atk1') {
    rear = beast === 'bear' ? 0.45 : -0.12;
    lunge = beast === 'bear' ? 0.1 : 0.15;
  } else if (name === 'atk2') rear = beast === 'bear' ? 0.2 : 0;
  else if (name === 'hit') rear = 0.15;
  else if (name === 'die0') down = bodyH * 0.35;
  else if (name === 'die1') {
    down = bodyH * 0.55;
    roll = 0.8;
  } else if (name === 'die2') {
    down = bodyH * 0.7;
    roll = 1.45;
  }
  const bob = walk >= 0 ? [0.03, 0, 0.04, 0][walk] : name === 'idle1' ? -0.01 : 0;
  const o: V3 = B.at([0, 0, 0], lunge, 0, 0);
  const at = (f: number, r: number, u: number) => B.at(o, f, r, u + bob - down);
  // legs
  sc.group();
  const lx = bodyL * 0.72;
  const legs: [number, number, number][] = [[lx, -bodyR * 0.6, 0], [lx, bodyR * 0.6, 1], [-lx, -bodyR * 0.6, 2], [-lx, bodyR * 0.6, 3]];
  const sw = walk >= 0 ? [[0.5, 0.2, -0.4, -0.5], [0.1, 0.5, -0.1, -0.3], [-0.5, -0.2, 0.4, 0.5], [-0.1, -0.5, 0.1, 0.3]][walk] : [0.05, -0.05, -0.05, 0.05];
  const legR = beast === 'bear' ? 0.11 : beast === 'boar' ? 0.065 : 0.05;
  for (const [lf, lr, i] of legs) {
    const top = at(lf, lr, bodyH - bodyU * 0.2);
    const hgt = bodyH - bodyU * 0.2 - down * 0.4;
    const foot = B.at(o, lf + Math.sin(sw[i]) * hgt * 0.6, lr, 0.04 + Math.max(0, Math.sin(sw[i] * 2)) * 0.05);
    const knee = add(mul(add(top, foot), 0.5), mul(B.F, i < 2 ? 0.04 : -0.06));
    sc.limb(top, knee, legR * 1.4, legR, c.coat);
    sc.limb(knee, foot, legR, legR * 0.85, i % 2 ? c.dark : c.coat);
  }
  // body with a lighter belly and a darker back
  sc.group();
  const shade = (l: V3): Hit | null => (l[2] < -0.45 ? { ramp: c.belly.ramp } : l[2] > 0.7 ? { shade: 0.7 } : null);
  sc.blob(at(0, 0, bodyH), B.F, B.R, B.U, bodyL, bodyR, bodyU, c.coat, shade);
  sc.blob(at(bodyL * 0.55, 0, bodyH + bodyU * 0.1), B.F, B.R, B.U, bodyL * 0.45, bodyR * 1.08, bodyU * 1.05, c.coat, shade);
  if (beast === 'boar') sc.limb(at(-bodyL * 0.4, 0, bodyH + bodyU * 0.85), at(bodyL * 0.6, 0, bodyH + bodyU * 1.05), 0.05, 0.07, c.dark); // bristle ridge
  if (beast === 'bear') sc.blob(at(bodyL * 0.35, 0, bodyH + bodyU * 0.75), B.F, B.R, B.U, 0.25, 0.28, 0.18, c.coat); // shoulder hump
  // head
  sc.group();
  const neck = at(bodyL * 0.95, 0, bodyH + bodyU * (beast === 'boar' ? 0.1 : 0.45));
  const headC = add(neck, B.dir(0.7, 0, beast === 'boar' ? -0.4 : 0.25).map((v) => v * (beast === 'bear' ? 0.28 : 0.2)) as V3);
  const hr = beast === 'bear' ? 0.17 : beast === 'boar' ? 0.15 : 0.1;
  sc.limb(neck, headC, hr * 1.1, hr, c.coat);
  const snoutL = beast === 'wolf' ? 0.2 : beast === 'boar' ? 0.22 : 0.17;
  const snout = add(headC, B.dir(1, 0, beast === 'boar' ? -0.45 : -0.2).map((v) => v * snoutL) as V3);
  sc.limb(headC, snout, hr * 0.75, hr * 0.38, beast === 'wolf' ? c.belly : c.coat);
  sc.sphere(snout, hr * 0.32, c.dark);
  for (const s of [-1, 1]) {
    // ears and eyes
    const ear = add(headC, add(mul(B.R, s * hr * 0.6), mul(B.U, hr * 0.8)));
    sc.limb(add(headC, mul(B.R, s * hr * 0.5)), ear, hr * 0.3, beast === 'wolf' ? 0.012 : hr * 0.2, c.dark);
    sc.sphere(add(headC, add(add(mul(B.F, hr * 0.7), mul(B.R, s * hr * 0.45)), mul(B.U, hr * 0.25))), 0.016, EYE);
  }
  if (beast === 'boar') {
    for (const s of [-1, 1]) sc.line(add(snout, mul(B.R, s * 0.05)), add(snout, add(mul(B.R, s * 0.08), add(mul(B.U, 0.1), mul(B.F, -0.02)))), IVORY, 1);
  }
  if (beast === 'wolf' && (name === 'atk1' || name === 'atk0')) sc.line(snout, add(snout, mul(B.U, -0.05)), IVORY, 1);
  // tail
  sc.group();
  const tail0 = at(-bodyL * 0.95, 0, bodyH + bodyU * 0.4);
  const tLen = beast === 'wolf' ? 0.45 : 0.12;
  const wag = walk >= 0 ? (walk % 2 ? 0.2 : -0.2) : 0;
  sc.limb(tail0, add(tail0, B.dir(-0.7, wag, beast === 'wolf' ? -0.55 : -0.4).map((v) => v * tLen) as V3), beast === 'wolf' ? 0.06 : 0.02, beast === 'wolf' ? 0.03 : 0.01, beast === 'wolf' ? c.coat : c.dark);
  // rearing (pitch up about the hind feet), lunging, falling onto the side
  if (rear) sc.rotate(B.at(o, -bodyL * 0.75, 0, 0), B.R, -rear);
  if (roll) {
    sc.rotate(B.at(o, 0, 0, 0), B.F, roll);
    sc.translate(mul(B.R, -Math.sin(Math.min(roll, Math.PI / 2)) * bodyH * 0.6));
    if (roll > 1.2) {
      sc.group();
      sc.blob(B.at(o, 0.1, bodyU, 0.005), B.F, B.R, B.U, bodyL * 0.7, bodyR * 1.4, 0.01, BLOOD);
    }
  }
  void S;
  void seed;
}

// ---------------------------------------------------------------- gear icons

/**
 * A helmet, shield or body armour on its own, blown up for an inventory icon
 * (seen from the front-right, lit like the soldiers). Returns a w x h Pix.
 */
export function renderGearIcon(slot: 'helmet' | 'shield' | 'armor', art: string, paint: ItemPaint | undefined, w = 28, h = 28): Pix {
  const sc = new Scene();
  const B = basis(0.4, 0.92);
  const d: DollSpec = { look: { skin: 1, hair: 0, hairStyle: 2, beard: 0, tunic: 'tunicWhite' } };
  const p = manPose(d, 0);
  const k = skeleton(B, [0, 0, 0], d, p);
  let zoom = 1;
  let center: V3 = k.head;
  if (slot === 'helmet') {
    helmet(sc, { art, paint }, k.head, B, false);
    zoom = 3.4;
    center = add(k.head, [0, 0, 0.08]);
  } else if (slot === 'shield') {
    shield(sc, { art, paint }, { ...k, handL: B.at(k.chest, 0.3, 0, 0) }, B, 0, p);
    zoom = 1.05;
    center = B.at(k.chest, 0.3, 0, 0);
  } else {
    armour(sc, art, k, B, B.F, B.U);
    zoom = 2;
    center = B.at(k.pelvis, 0, 0, 0.3);
  }
  sc.translate(mul(center, -1));
  sc.scale(zoom);
  return sc.render(w, h, w / 2, h / 2);
}

// ---------------------------------------------------------------- helpers

function merge(dst: Scene, src: Scene): void {
  // keep crease groups distinct between the merged scenes
  const off = dst.group();
  for (const p of src.prims) {
    p.group += off * 1000;
    dst.prims.push(p);
  }
  for (const l of src.lines) {
    l.group += off * 1000;
    dst.lines.push(l);
  }
}

/** Deterministic tiny jitter for variety (wear spots). */
export function dollJitter(seed: number, i: number): number {
  return hash2(seed, i, 41);
}
