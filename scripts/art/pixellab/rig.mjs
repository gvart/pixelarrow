// Skeleton keypoints for PixelLab's animate_with_skeleton_v3, derived from the procedural rig, with no hand-fitting
// per class (I3a, docs/v5/art/STYLE_LOCK.md). Replaces skeleton.mjs (I1b), whose body was fitted by hand to E3's
// big-helmet proportions.
//
//  - The body is the doll rig's (src/art/paperdoll.ts skeleton(): pelvis 0.95 m, neck 0.56 m above it, thigh 0.46,
//    shin 0.44, upper arm 0.29, forearm 0.27, shoulders 0.2 from the neck): a real man of about 1.76 m, 7 heads.
//  - The camera is the battle's (src/art/model3d.ts: 2:1 dimetric, 30 degrees down).
//  - The fit to the sprite: the feet row (bbox bottom) and the body's centre column (the shins) are measured; the
//    height is the STYLE_LOCK stature (STATURE_PX, helmet top to feet), since every class is normalised to it.
//  - Poses are keyframes per clip and weapon (WEAPONS: where the hands sit), eased with smoothstep, or a phase
//    function for loops.
//
// Usage: node scripts/art/pixellab/rig.mjs <clip> <facing> <sprite.png> [--weapon spear] [--frames 14]
//          [--out file.json] [--sheet overlay.png] [--feet y] [--head y] [--stature px] [--cx x] [--k 4] [--cols 5] [--ghost 1]
//   clip    one of CLIPS (node rig.mjs --list)
//   facing  south-east | north-east | south-west | north-west | south
// Writes { clip, facing, weapon, fit, first_frame_keypoints, keypoints } (x, y fractions of the image, z_index
// from the depth towards the camera) and, with --sheet, the skeletons over the sprite for a look before paying.
import { writeFileSync } from 'node:fs';
import { readImage, writeImage } from '../lib/png.mjs';
import { blank } from '../lib/ops.mjs';
import { blit } from './sheet.mjs';

// ---- camera (model3d.ts)
const C30 = Math.cos(Math.PI / 6), S30 = 0.5;
const RIGHT = [Math.SQRT1_2, -Math.SQRT1_2, 0];
const UP = [-S30 / Math.SQRT2, -S30 / Math.SQRT2, C30];
const CAM = [C30 / Math.SQRT2, C30 / Math.SQRT2, S30];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => mul(a, 1 / (len(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a, b, t) => a + (b - a) * t;
/** Rotate v about the unit axis k by angle a (Rodrigues). */
const rot = (v, k, a) => add(add(mul(v, Math.cos(a)), mul(cross(k, v), Math.sin(a))), mul(k, dot(k, v) * (1 - Math.cos(a))));

/** Field facing of each PixelLab direction (paperdoll DIRS rows 0..3; south = towards the camera). */
export const FACING = { 'south-east': [1, 0], 'north-east': [0, -1], 'south-west': [0, 1], 'north-west': [-1, 0], south: [Math.SQRT1_2, Math.SQRT1_2] };

/** The doll rig's body (paperdoll.ts skeleton(), build 1:1). */
export const BODY = { hip: 0.95, neck: 0.56, head: 0.13, crown: 0.12, shoulderW: 0.2, shoulderDrop: 0.06, upperArm: 0.29, foreArm: 0.27, thigh: 0.46, shin: 0.44, ankle: 0.06, hipW: 0.1 };
/** Crown of the head above the ground (the helmet top, crest not counted), metres. */
export const STATURE = BODY.hip + BODY.neck + BODY.head + BODY.crown;

function ik(a, b, l1, l2, pole) {
  const d = sub(b, a);
  const dist = Math.min(len(d), l1 + l2 - 1e-4);
  const n = norm(d);
  const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const side = norm(sub(pole, mul(n, dot(pole, n))));
  return add(add(a, mul(n, x)), mul(side, h));
}

// ---- weapons: where the hands sit (local metres from the ground under the man: f forward, r his right, u up).
// R = weapon hand, L = shield / off hand. `guard` is the fighting stance, `rest` the parade stance, `couch` the
// weapon levelled for the charge, `thrustBack` / `thrustOut` the ends of the thrust (the hand moves along the
// weapon's own line between them: same r and u, only f changes), `block` the shield (or the shaft) raised.
export const WEAPONS = {
  // one-hand spear (dory) and a big shield on the left arm: hoplite, and every spear-and-shield class
  spear: {
    rest: { R: [0.06, 0.42, 0.98], L: [0.1, -0.4, 1.02] },
    guard: { R: [0.02, 0.4, 0.98], L: [0.16, -0.38, 1.06] },
    couch: { R: [0.06, 0.38, 0.98], L: [0.2, -0.36, 1.06] },
    thrustBack: { R: [-0.1, 0.4, 0.98], L: [0.12, -0.38, 1.06] },
    thrustOut: { R: [0.58, 0.4, 0.98], L: [0.3, -0.32, 1.1] },
    block: { R: [-0.02, 0.4, 0.98], L: [0.36, -0.2, 1.3] },
    brace: { R: [0.02, 0.38, 0.94], L: [0.3, -0.22, 1.05] },
  },
  // a two-hand spear or pike, no shield: both hands on the shaft, the left one forward
  pike: {
    rest: { R: [0.04, 0.26, 0.98], L: [0.22, 0.12, 1.12] },
    guard: { R: [-0.08, 0.24, 1.02], L: [0.32, 0.08, 1.08] },
    couch: { R: [-0.08, 0.24, 1.02], L: [0.32, 0.08, 1.08] },
    thrustBack: { R: [-0.32, 0.24, 1.0], L: [0.1, 0.1, 1.04] },
    thrustOut: { R: [0.4, 0.16, 1.06], L: [0.78, 0.04, 1.1] },
    block: { R: [0.0, 0.26, 1.2], L: [0.3, -0.16, 1.32] },
    brace: { R: [-0.18, 0.2, 0.82], L: [0.24, 0.06, 0.98] },
  },
};

// ---- poses: { pf, pr, hip, lean, roll, twist, fL, fR, R, L, yaw, nod, fall, fallDir }
//   pf/pr pelvis offset (forward, right), hip pelvis height, lean torso tilt forward (rad), roll to his right (rad),
//   twist shoulders (+ = right shoulder forward, rad; the hips follow by half), fL/fR feet [f, r, lift],
//   R/L hands [f, r, u], yaw head turn (+ = to his right), nod (+ = down), fall whole-body tip (rad) about the
//   feet, fallDir +1 forwards / -1 backwards.
const base = (w) => ({ pf: 0, pr: 0, hip: BODY.hip, lean: 0, roll: 0, twist: 0, fL: [0.03, -0.12, 0], fR: [-0.03, 0.12, 0], R: w.rest.R, L: w.rest.L, yaw: 0, nod: 0, fall: 0, fallDir: 1 });
// the guard keeps the parade stance's feet (the first frame is a rotation with the weapon redrawn levelled, spear.mjs):
// a slight crouch, the weapon couched forward, the shield up across the chest
const guardPose = (w) => ({ ...base(w), hip: BODY.hip - 0.02, lean: 0.04, twist: -0.06, R: w.guard.R, L: w.guard.L });

/** Clips: kind 'once' (keyframes over 0..1, ends where it starts unless `end` says otherwise) or 'loop' (phase fn). */
export const CLIPS = {
  idle: { kind: 'loop', frames: 12, f: (w, t) => { const b = Math.sin(t * 2 * Math.PI); return { ...base(w), hip: BODY.hip - 0.006 * (1 - b), lean: 0.01 * b, L: add3(w.rest.L, [0, 0, 0.01 * b]), R: add3(w.rest.R, [0, 0, 0.006 * b]) }; } },
  ready: { kind: 'loop', frames: 12, f: (w, t) => { const b = Math.sin(t * 2 * Math.PI); const g = guardPose(w); return { ...g, hip: g.hip - 0.012 * (1 + b), pf: 0.01 * b, L: add3(g.L, [0, 0, 0.012 * b]) }; } },
  walk: { kind: 'loop', frames: 16, f: (w, t) => stride(w, t, 0.3, 0.05, 0.02, 0.06) },
  run: { kind: 'loop', frames: 12, f: (w, t) => stride(w, t, 0.5, 0.12, 0.05, 0.16) },
  rout: { kind: 'loop', frames: 12, f: (w, t) => ({ ...stride(w, t, 0.52, 0.12, 0.05, 0.22), nod: 0.15 }) },
  charge: { kind: 'loop', frames: 12, f: (w, t) => ({ ...stride(w, t, 0.48, 0.12, 0.04, 0.18), R: add3(w.couch.R, [0, 0, 0.02 * Math.sin(t * 4 * Math.PI)]), L: w.couch.L }) },
  // the thrust: guard, draw back along the shaft with the weight on the rear foot, step in with the lead (left)
  // foot as the hips and shoulders turn and the shield drives forward with the body, the arm extends last along
  // the weapon's own line, a held follow-through with the rear heel up, recovery back to guard
  thrust: {
    kind: 'once', frames: 14, start: guardPose, keys: (w) => {
      const g = guardPose(w);
      return [
        [0, g],
        [0.2, { ...g, pf: -0.08, hip: BODY.hip - 0.07, lean: -0.02, twist: -0.4, R: w.thrustBack.R, L: w.thrustBack.L, fL: [0.16, -0.14, 0.02] }],
        [0.34, { ...g, pf: 0.06, hip: BODY.hip - 0.06, lean: 0.08, twist: -0.1, R: add3(w.thrustBack.R, [0.2, 0, 0]), L: add3(w.thrustBack.L, [0.1, 0, 0]), fL: [0.34, -0.14, 0.06] }],
        [0.46, { ...g, pf: 0.22, hip: BODY.hip - 0.09, lean: 0.2, twist: 0.35, R: add3(w.thrustOut.R, [-0.22, 0, 0]), L: add3(w.thrustOut.L, [0, 0, 0]), fL: [0.5, -0.14, 0], fR: [-0.16, 0.14, 0] }],
        [0.56, { ...g, pf: 0.28, hip: BODY.hip - 0.1, lean: 0.26, twist: 0.5, R: w.thrustOut.R, L: add3(w.thrustOut.L, [0.04, 0, 0]), fL: [0.52, -0.14, 0], fR: [-0.18, 0.14, 0.04] }],
        [0.66, { ...g, pf: 0.28, hip: BODY.hip - 0.1, lean: 0.26, twist: 0.5, R: add3(w.thrustOut.R, [0.04, 0, 0]), L: add3(w.thrustOut.L, [0.04, 0, 0]), fL: [0.52, -0.14, 0], fR: [-0.18, 0.14, 0.04] }],
        [0.82, { ...g, pf: 0.12, hip: BODY.hip - 0.06, lean: 0.12, twist: 0.1, R: add3(w.guard.R, [0.2, 0, 0]), L: w.guard.L, fL: [0.34, -0.14, 0.03] }],
        [1, g],
      ];
    },
  },
  // shield up and out to take a blow, a small give at the impact, back down
  block: {
    kind: 'once', frames: 12, start: guardPose, keys: (w) => {
      const g = guardPose(w);
      return [
        [0, g],
        [0.25, { ...g, hip: BODY.hip - 0.08, lean: 0.12, twist: -0.25, L: w.block.L, R: w.block.R }],
        [0.45, { ...g, pf: -0.06, hip: BODY.hip - 0.09, lean: 0.06, twist: -0.3, L: add3(w.block.L, [-0.08, 0, -0.02]), R: w.block.R, nod: 0.08 }],
        [0.65, { ...g, hip: BODY.hip - 0.08, lean: 0.12, twist: -0.25, L: w.block.L, R: w.block.R }],
        [1, g],
      ];
    },
  },
  // shield wall: the entry (crouch, rear foot back, shield set, weapon low) then a held, breathing crouch
  brace: {
    kind: 'once', frames: 14, hold: 8, start: (w) => base(w), keys: (w) => {
      const set = { ...base(w), hip: BODY.hip - 0.16, lean: 0.22, twist: -0.15, fL: [0.26, -0.16, 0], fR: [-0.3, 0.16, 0], L: w.brace.L, R: w.brace.R, nod: 0.06 };
      return [
        [0, base(w)],
        [0.3, { ...set, hip: BODY.hip - 0.08, lean: 0.12, fR: [-0.16, 0.16, 0.05] }],
        [0.5, set],
        [0.57, set],
        [0.72, { ...set, hip: set.hip - 0.012, L: add3(set.L, [0, 0, -0.01]) }],
        [0.86, { ...set, hip: set.hip - 0.004 }],
        [1, set],
      ];
    },
  },
  // struck: flinch back, a stumbling step back (knockback), the shield sagging, then catching himself in guard
  stagger: {
    kind: 'once', frames: 12, start: guardPose, keys: (w) => {
      const g = guardPose(w);
      return [
        [0, g],
        [0.15, { ...g, pf: -0.12, lean: -0.22, roll: 0.08, twist: -0.3, nod: -0.15, L: add3(w.guard.L, [-0.12, -0.08, -0.12]), R: add3(w.guard.R, [-0.1, 0.06, 0.06]) }],
        [0.35, { ...g, pf: -0.28, hip: BODY.hip - 0.08, lean: -0.12, roll: 0.05, twist: -0.2, fR: [-0.46, 0.16, 0], fL: [0.0, -0.14, 0.05], nod: -0.05, L: add3(w.guard.L, [-0.14, -0.08, -0.18]) }],
        [0.55, { ...g, pf: -0.34, hip: BODY.hip - 0.12, lean: 0.1, fR: [-0.48, 0.16, 0], fL: [-0.08, -0.14, 0], L: add3(w.guard.L, [-0.06, -0.04, -0.1]) }],
        [0.8, { ...g, pf: -0.3, hip: BODY.hip - 0.06, lean: 0.06, fR: [-0.48, 0.16, 0], fL: [-0.1, -0.14, 0] }],
        [1, { ...g, pf: -0.3, fL: [-0.12, -0.14, 0], fR: [-0.46, 0.14, 0] }],
      ];
    },
  },
  // killed: the knees go, the body tips backwards past the feet and lands flat (the shield stays on the arm)
  fallBack: { kind: 'once', frames: 14, start: base, keys: (w) => fallKeys(w, -1) },
  fallFwd: { kind: 'once', frames: 14, start: base, keys: (w) => fallKeys(w, 1) },
  // wounded: down on the right knee, leaning on the shield, a slow laboured breath; the entry is the drop
  kneel: {
    kind: 'once', frames: 12, hold: 4, start: base, keys: (w) => {
      const k = { ...base(w), pf: -0.06, hip: 0.5, lean: 0.3, twist: -0.1, fL: [0.34, -0.14, 0], fR: [-0.3, 0.14, 0], L: [0.4, -0.12, 0.56], R: [0.12, 0.3, 0.5], nod: 0.25 };
      return [
        [0, base(w)],
        [0.18, { ...k, hip: 0.72, lean: 0.18 }],
        [0.33, k],
        [0.55, { ...k, hip: 0.49, lean: 0.34, nod: 0.3 }],
        [0.78, { ...k, hip: 0.51, lean: 0.27, nod: 0.22 }],
        [1, k],
      ];
    },
  },
  // victory: the spear raised high in the right hand, shield up, a shout; held and pumped
  cheer: {
    kind: 'once', frames: 14, hold: 5, start: base, keys: (w) => {
      const up = { ...base(w), lean: -0.08, R: [0.12, 0.34, 1.82], L: [0.3, -0.24, 1.42], nod: -0.2 };
      return [
        [0, base(w)],
        [0.3, up],
        [0.5, { ...up, R: [0.12, 0.34, 1.7], hip: BODY.hip - 0.02 }],
        [0.7, up],
        [0.85, { ...up, R: [0.12, 0.34, 1.7], hip: BODY.hip - 0.02 }],
        [1, up],
      ];
    },
  },
  // ambient: a look to his right, then to his left, back ahead
  look: {
    kind: 'once', frames: 16, start: base, keys: (w) => [
      [0, base(w)], [0.2, { ...base(w), yaw: 0.8 }], [0.4, { ...base(w), yaw: 0.8 }], [0.62, { ...base(w), yaw: -0.8 }], [0.8, { ...base(w), yaw: -0.8 }], [1, base(w)],
    ],
  },
  // ambient: the shield hitched up and resettled on the arm, a roll of the shoulder
  adjust: {
    kind: 'once', frames: 12, start: base, keys: (w) => [
      [0, base(w)], [0.3, { ...base(w), L: add3(w.rest.L, [0.04, 0.06, 0.16]), roll: -0.06, twist: 0.12 }], [0.5, { ...base(w), L: add3(w.rest.L, [0.06, 0.04, 0.1]), roll: -0.04 }], [0.75, { ...base(w), L: add3(w.rest.L, [0.02, 0, -0.03]) }], [1, base(w)],
    ],
  },
};

function add3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/** A stride cycle (walk, run): stride half-length, foot lift, pelvis bob, forward lean. */
function stride(w, t, s, lift, bob, lean) {
  const a = Math.sin(t * 2 * Math.PI), c = Math.cos(t * 2 * Math.PI);
  const b = base(w);
  return {
    ...b,
    hip: BODY.hip - 0.02 - bob * Math.abs(Math.cos(t * 2 * Math.PI)),
    lean,
    fL: [s * a, -0.11, Math.max(0, c) * lift],
    fR: [-s * a, 0.11, Math.max(0, -c) * lift],
    twist: -0.1 * a,
    R: add3(w.rest.R, [-0.05 * a, 0, 0.02 * Math.abs(a)]),
    L: add3(w.rest.L, [0.02, 0, 0.01 * Math.abs(c)]),
  };
}

function fallKeys(w, dir) {
  const b = base(w);
  const buckle = { ...b, hip: BODY.hip - 0.18, lean: 0.2 * dir, nod: 0.25 * dir, fL: [0.06, -0.14, 0], fR: [-0.08, 0.14, 0], L: add3(w.rest.L, [0, -0.06, -0.12]), R: add3(w.rest.R, [0.06, 0.06, -0.2]) };
  return [
    [0, b],
    [0.15, { ...b, pf: -0.06 * dir, lean: -0.2 * dir, nod: -0.25 * dir, roll: 0.05 }],
    [0.32, buckle],
    [0.55, { ...buckle, fall: 0.55, fallDir: dir, hip: BODY.hip - 0.3 }],
    [0.75, { ...buckle, fall: 1.25, fallDir: dir, hip: BODY.hip - 0.35, lean: 0.05 * dir }],
    [0.86, { ...buckle, fall: 1.5, fallDir: dir, hip: BODY.hip - 0.36, lean: 0 }],
    [0.93, { ...buckle, fall: 1.45, fallDir: dir, hip: BODY.hip - 0.36, lean: 0 }],
    [1, { ...buckle, fall: 1.52, fallDir: dir, hip: BODY.hip - 0.36, lean: 0, nod: 0 }],
  ];
}

const ease = (u) => u * u * (3 - 2 * u);
function blend(p0, p1, e) {
  const out = {};
  for (const k of Object.keys(p0)) out[k] = Array.isArray(p0[k]) ? p0[k].map((v, i) => lerp(v, p1[k][i], e)) : k === 'fallDir' ? (e < 0.5 ? p0[k] : p1[k]) : lerp(p0[k], p1[k], e);
  // a fall direction set on either side wins (the start pose has fall 0)
  if (p0.fall === 0 && p1.fall) out.fallDir = p1.fallDir;
  return out;
}

/** The pose of `clip` at t in 0..1 (loops: the phase; once: the clip's time). */
export function poseAt(clip, t, weapon = 'spear') {
  const c = CLIPS[clip];
  const w = WEAPONS[weapon];
  if (!c) throw new Error(`unknown clip ${clip}`);
  if (!w) throw new Error(`unknown weapon ${weapon}`);
  if (c.kind === 'loop') return c.f(w, t);
  const keys = c.keys(w);
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const [t0, p0] = keys[i], [t1, p1] = keys[i + 1];
  return blend(p0, p1, ease(Math.min(1, Math.max(0, (t - t0) / (t1 - t0 || 1)))));
}

/** The pose the first frame (the sprite sent) must be in. */
export function startPose(clip, weapon = 'spear') {
  const c = CLIPS[clip];
  return c.kind === 'loop' ? c.f(WEAPONS[weapon], 0) : c.start(WEAPONS[weapon]);
}

/** The 18 joints (world metres) of a pose for a field facing. */
export function joints(p, [fx, fy]) {
  const U = [0, 0, 1];
  const F0 = norm([fx, fy, 0]);
  // model3d's world is mirrored against a right-handed z-up frame: his right is U x F (facing the camera, his right hand is on screen-left)
  const R0 = cross(U, F0);
  const at = (o, f, r, u) => add(o, add(add(mul(F0, f), mul(R0, r)), mul(U, u)));
  const O = [0, 0, 0];
  const pelvis = at(O, p.pf, p.pr, p.hip);
  const up = norm(add(add(U, mul(F0, Math.tan(p.lean))), mul(R0, Math.tan(p.roll))));
  const Rt = norm(add(mul(R0, Math.cos(p.twist)), mul(F0, Math.sin(p.twist))));
  const Rh = norm(add(mul(R0, Math.cos(p.twist / 2)), mul(F0, Math.sin(p.twist / 2))));
  const neck = add(pelvis, mul(up, BODY.neck));
  const shL = add(add(neck, mul(Rt, -BODY.shoulderW)), mul(up, -BODY.shoulderDrop));
  const shR = add(add(neck, mul(Rt, BODY.shoulderW)), mul(up, -BODY.shoulderDrop));
  const hipL = add(add(pelvis, mul(Rh, -BODY.hipW)), mul(U, -0.04)), hipR = add(add(pelvis, mul(Rh, BODY.hipW)), mul(U, -0.04));
  const ankL = at(O, p.fL[0], p.fL[1], BODY.ankle + (p.fL[2] ?? 0));
  const ankR = at(O, p.fR[0], p.fR[1], BODY.ankle + (p.fR[2] ?? 0));
  const legPole = add(F0, mul(U, 0.1));
  const kneeL = ik(hipL, ankL, BODY.thigh, BODY.shin, legPole), kneeR = ik(hipR, ankR, BODY.thigh, BODY.shin, legPole);
  // hands are placed relative to the pelvis's travel (forward and down), so a lunge carries the arms with it
  const ho = at(O, p.pf, p.pr, p.hip - BODY.hip);
  // a hand never leaves the arm's reach: the keypoints must not ask for a stretched (noodle) arm
  const reach = (sh, h) => { const d = sub(h, sh), m = 0.97 * (BODY.upperArm + BODY.foreArm); return len(d) > m ? add(sh, mul(norm(d), m)) : h; };
  const hR = reach(shR, at(ho, p.R[0], p.R[1], p.R[2])), hL = reach(shL, at(ho, p.L[0], p.L[1], p.L[2]));
  const elR = ik(shR, hR, BODY.upperArm, BODY.foreArm, add(mul(R0, 0.6), mul(U, -1)));
  const elL = ik(shL, hL, BODY.upperArm, BODY.foreArm, add(mul(R0, -0.6), mul(U, -1)));
  const head = add(neck, mul(up, BODY.head));
  // the head turns (yaw) and nods on the neck
  const Fy = norm(add(mul(F0, Math.cos(p.yaw)), mul(R0, Math.sin(p.yaw))));
  const Ry = cross(U, Fy);
  const Fh = norm(add(mul(Fy, Math.cos(p.nod)), mul(U, -Math.sin(p.nod))));
  const nose = add(head, mul(Fh, 0.12));
  const eye = (s) => add(add(head, mul(Fh, 0.1)), add(mul(Ry, s * 0.05), mul(up, 0.03)));
  const ear = (s) => add(add(head, mul(Ry, s * 0.09)), mul(Fh, -0.02));
  let js = {
    NOSE: nose, NECK: neck,
    'RIGHT SHOULDER': shR, 'RIGHT ELBOW': elR, 'RIGHT ARM': hR,
    'LEFT SHOULDER': shL, 'LEFT ELBOW': elL, 'LEFT ARM': hL,
    'RIGHT HIP': hipR, 'RIGHT KNEE': kneeR, 'RIGHT LEG': ankR,
    'LEFT HIP': hipL, 'LEFT KNEE': kneeL, 'LEFT LEG': ankL,
    'RIGHT EYE': eye(1), 'LEFT EYE': eye(-1), 'RIGHT EAR': ear(1), 'LEFT EAR': ear(-1),
  };
  if (p.fall) {
    // tip the whole body about a line through the feet across his facing; then keep every joint above the ground
    const pivot = at(O, p.fallDir > 0 ? 0.1 : -0.1, 0, 0);
    const axis = mul(R0, p.fallDir > 0 ? 1 : -1);
    js = Object.fromEntries(Object.entries(js).map(([k, v]) => {
      const r = add(pivot, rot(sub(v, pivot), axis, p.fall));
      return [k, [r[0], r[1], Math.max(0.04, r[2])]];
    }));
  }
  return js;
}

// ---- the fit to the sprite

/** Sprite px from the helmet top (crest not counted) to the feet: the STYLE_LOCK figure height (68 canvas, I3a hoplite H4). */
export const STATURE_PX = 58;
/**
 * Where the sprite draws the pelvis and the neck (chin), px above the feet, for the STYLE_LOCK figure: pixel-art
 * helmets are bigger than a real head, so heights are warped piecewise from the rig's (feet..pelvis..neck..crown)
 * to these before projecting. Measured once on the hoplite H4 rotations; the same for every class.
 */
export const SHAPE_PX = { pelvis: 26, neck: 45 };

/** Fit: feet row (measured), helmet top (feet - STATURE_PX), body centre column (measured on the shins), px per metre. */
export function fitOf(img, o = {}) {
  const op = (x, y) => img.data[(y * img.w + x) * 4 + 3] > 8;
  let y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (op(x, y)) y1 = y;
  // body centre: the middle of the shins a few rows above the feet; runs under 4 px wide (a spear shaft) are left out
  let lo = img.w, hi = -1;
  for (let y = y1 - 8; y <= y1 - 3; y++) for (let x = 0; x < img.w;) {
    if (!op(x, y)) { x++; continue; }
    let e = x;
    while (e < img.w && op(e, y)) e++;
    if (e - x >= 4) { lo = Math.min(lo, x); hi = Math.max(hi, e - 1); }
    x = e;
  }
  const cx = o.cx ?? (lo + hi) / 2;
  const feet = o.feet ?? y1;
  // every class is normalised to the same stature on the canvas (STYLE_LOCK), so the helmet top is not measured
  const head = o.head ?? feet - (o.stature ?? STATURE_PX);
  const ppm = (feet - head) / (STATURE * C30);
  const sh = o.shape ?? SHAPE_PX;
  // the warp's knots in metres of the projected height
  const kn = [[0, 0], [BODY.hip, sh.pelvis / (C30 * ppm)], [BODY.hip + BODY.neck, sh.neck / (C30 * ppm)], [STATURE, STATURE]];
  return { feet, head, cx, ppm, warp: kn };
}

/** Piecewise-linear height warp (rig metres -> sprite proportions), linear beyond the last knot. */
function warpZ(z, kn) {
  if (!kn) return z;
  let i = 0;
  while (i < kn.length - 2 && z > kn[i + 1][0]) i++;
  const [a0, b0] = kn[i], [a1, b1] = kn[i + 1];
  return b0 + ((z - a0) * (b1 - b0)) / (a1 - a0);
}

const toImg = (v, f, img) => {
  const w = [v[0], v[1], warpZ(v[2], f.warp)];
  return { x: (f.cx + dot(w, RIGHT) * f.ppm) / img.w, y: (f.feet - dot(w, UP) * f.ppm) / img.h };
};

export function frameKeypoints(js, f, img) {
  return Object.entries(js).map(([label, v]) => {
    const p = toImg(v, f, img);
    return { label, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z_index: Math.round(dot(v, CAM) * 100) };
  });
}

/** Keypoints of a clip for a facing on a sprite: { fit, first_frame_keypoints, keypoints }. */
export function clipKeypoints(clip, facing, img, { weapon = 'spear', frames, fit } = {}) {
  const c = CLIPS[clip];
  const n = frames ?? c.frames;
  const f = fit ?? fitOf(img);
  const dir = FACING[facing];
  const first = frameKeypoints(joints(startPose(clip, weapon), dir), f, img);
  // a loop samples n phases (frame 0 = the start pose); a one-shot runs from just after the start to the end
  const kps = Array.from({ length: n }, (_, i) => frameKeypoints(joints(poseAt(clip, c.kind === 'loop' ? i / n : (i + 1) / n, weapon), dir), f, img));
  return { clip, facing, weapon, frames: n, hold: c.hold, fit: f, first_frame_keypoints: first, keypoints: kps };
}

const BONES = [['NECK', 'NOSE'], ['NECK', 'RIGHT SHOULDER'], ['RIGHT SHOULDER', 'RIGHT ELBOW'], ['RIGHT ELBOW', 'RIGHT ARM'], ['NECK', 'LEFT SHOULDER'],
  ['LEFT SHOULDER', 'LEFT ELBOW'], ['LEFT ELBOW', 'LEFT ARM'], ['NECK', 'RIGHT HIP'], ['RIGHT HIP', 'RIGHT KNEE'], ['RIGHT KNEE', 'RIGHT LEG'],
  ['NECK', 'LEFT HIP'], ['LEFT HIP', 'LEFT KNEE'], ['LEFT KNEE', 'LEFT LEG']];

/** The skeleton drawn over the sprite (k x), right side cyan, left yellow. */
export function overlay(img, kps, k, { sprite = true } = {}) {
  const out = blank(img.w * k, img.h * k);
  for (let i = 0; i < out.w * out.h; i++) out.data.set([60, 58, 40, 255], i * 4);
  if (sprite) blit(out, img, 0, 0, k);
  const px = (x, y, c) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = Math.round(x) + dx, Y = Math.round(y) + dy;
      if (X >= 0 && Y >= 0 && X < out.w && Y < out.h) out.data.set([...c, 255], (Y * out.w + X) * 4);
    }
  };
  const by = Object.fromEntries(kps.map((p) => [p.label, p]));
  for (const [a, b] of BONES) {
    const A = by[a], B = by[b];
    const col = a.includes('RIGHT') || b.includes('RIGHT') ? [80, 220, 255] : a.includes('LEFT') || b.includes('LEFT') ? [255, 220, 60] : [255, 255, 255];
    for (let t = 0; t <= 1; t += 0.02) px(lerp(A.x, B.x, t) * out.w, lerp(A.y, B.y, t) * out.h, col);
  }
  px(by.NOSE.x * out.w, by.NOSE.y * out.h, [255, 60, 60]);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args[0] === '--list') {
    for (const [k, c] of Object.entries(CLIPS)) console.log(`${k}\t${c.kind}\t${c.frames} frames${c.hold !== undefined ? `, hold from ${c.hold}` : ''}`);
    process.exit(0);
  }
  const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
  const [clip, facing, sprite] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  const img = readImage(sprite);
  const o = {};
  for (const k of ['feet', 'head', 'cx', 'stature']) if (opt(k) !== undefined) o[k] = Number(opt(k));
  const res = clipKeypoints(clip, facing, img, { weapon: opt('weapon', 'spear'), frames: opt('frames') ? Number(opt('frames')) : undefined, fit: fitOf(img, o) });
  const out = opt('out');
  if (out) writeFileSync(out, JSON.stringify(res));
  const sheet = opt('sheet');
  if (sheet) {
    const k = Number(opt('k', 4));
    const tiles = [overlay(img, res.first_frame_keypoints, k), ...res.keypoints.map((p) => overlay(img, p, k, { sprite: !!opt('ghost') }))];
    const cols = Number(opt('cols', 5));
    const S = blank(Math.min(cols, tiles.length) * img.w * k, Math.ceil(tiles.length / cols) * img.h * k);
    tiles.forEach((t, i) => blit(S, t, (i % cols) * img.w * k, Math.floor(i / cols) * img.h * k, 1));
    writeImage(sheet, S);
  }
  const f = res.fit;
  console.log(`${clip} ${facing} ${res.weapon}: ${res.frames} frames, fit feet ${f.feet} head ${f.head} cx ${f.cx} ppm ${f.ppm.toFixed(1)}${out ? ` -> ${out}` : ''}`);
}
