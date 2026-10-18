// Skeleton keypoints for PixelLab's animate_with_skeleton_v3, posed in 3D like the procedural dolls
// (src/art/paperdoll.ts skeleton(): pelvis, IK legs and arms, metres, z up) and projected through the
// battle camera (src/art/model3d.ts: 2:1 dimetric, 30 degrees down). One clip, one facing.
//
// Usage: node scripts/art/pixellab/skeleton.mjs <clip> <facing> <sprite.png> [--frames 14] [--out file.json]
//          [--sheet overlay.png] [--feet y] [--head y] [--cx x] [--hand r|l]
//   clip    thrust | walk | rest
//   facing  south-east | north-east | south-west | north-west | south (PixelLab direction names)
//   --feet/--head/--cx  fit: the ground row, the top of the head (not the crest) and the body's centre column
//           in sprite px; measured from the sprite when left out (bbox bottom; the crest's base is found as the
//           first non-crest row under the red crest; cx = the median opaque column of the legs)
// Writes { first_frame_keypoints, keypoints: [[18 joints] x frames] } with x, y as fractions of the image and
// z_index from the depth towards the camera, plus an overlay contact sheet to check the fit and every frame.
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
const lerpV = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

/** Field facing of each PixelLab direction (paperdoll DIRS rows 0..3, and south = towards the camera). */
const FACING = { 'south-east': [1, 0], 'north-east': [0, -1], 'south-west': [0, 1], 'north-west': [-1, 0], south: [Math.SQRT1_2, Math.SQRT1_2] };

/** Two-bone IK (paperdoll ik): the joint between a and b, bent towards pole. */
function ik(a, b, l1, l2, pole) {
  const d = sub(b, a);
  const dist = Math.min(len(d), l1 + l2 - 1e-4);
  const n = norm(d);
  const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const side = norm(sub(pole, mul(n, dot(pole, n))));
  return add(add(a, mul(n, x)), mul(side, h));
}

// ---- poses (local metres: f forward, r to the man's right, u up; feet on u = 0)
// hR / hL hands, fL / fR feet, lean (forward tilt of the spine, radians), twist (right shoulder forward), dip (pelvis drop).
// Proportions (BODY) are the PixelLab hero's, not a real man's: measured on the I1b sprite (68 canvas, helmet top
// at y 10, feet at 65): a big helmet and short legs, so the joints sit where the sprite draws them.
const BODY = { hip: 0.5, neck: 0.6, shoulderW: 0.24, shoulderDrop: 0.06, upperArm: 0.22, foreArm: 0.22, thigh: 0.22, shin: 0.24, head: 0.26, ankle: 0.06 };
const REST = { hR: [0.1, 0.48, 0.86], hL: [0.3, -0.04, 0.78], fL: [0.02, -0.1], fR: [-0.02, 0.1], lean: 0, twist: 0, dip: 0 };
const POSES = {
  rest: [[0, REST], [1, REST]],
  // overhand dory thrust: raise the spear to the shoulder, cock it back, drive it forward and down, recover
  thrust: [
    [0, REST],
    [0.14, { ...REST, hR: [0.02, 0.36, 1.12], lean: 0.02 }],
    [0.28, { ...REST, hR: [-0.06, 0.3, 1.32], twist: -0.15, lean: -0.03 }],
    [0.4, { ...REST, hR: [-0.22, 0.28, 1.36], twist: -0.35, lean: -0.07, fL: [0.1, -0.11] }],
    [0.54, { ...REST, hR: [0.24, 0.2, 1.28], twist: 0.2, lean: 0.08, fL: [0.2, -0.11], dip: 0.02, hL: [0.34, -0.02, 0.8] }],
    [0.64, { ...REST, hR: [0.52, 0.12, 1.16], twist: 0.45, lean: 0.16, fL: [0.24, -0.11], dip: 0.04, hL: [0.36, 0.0, 0.8] }],
    [0.74, { ...REST, hR: [0.52, 0.12, 1.16], twist: 0.45, lean: 0.16, fL: [0.24, -0.11], dip: 0.04, hL: [0.36, 0.0, 0.8] }],
    [0.88, { ...REST, hR: [-0.04, 0.3, 1.3], twist: -0.1, lean: 0, fL: [0.1, -0.11] }],
    [1, REST],
  ],
  // the I1b thrust: the spear couched level at the hip (first frame drawn by spear.mjs), drawn back, driven forward
  // along its own line with a lunge and a twist of the shoulders, held, recovered; the shield stays across the body
  thrustLow: [
    [0, REST],
    [0.25, { ...REST, hR: [-0.16, 0.48, 0.9], twist: -0.25, lean: -0.04 }],
    [0.5, { ...REST, hR: [0.56, 0.42, 0.86], twist: 0.4, lean: 0.14, fL: [0.22, -0.1], dip: 0.03, hL: [0.34, -0.02, 0.8] }],
    [0.62, { ...REST, hR: [0.58, 0.42, 0.86], twist: 0.4, lean: 0.15, fL: [0.22, -0.1], dip: 0.03, hL: [0.34, -0.02, 0.8] }],
    [0.85, { ...REST, hR: [0.2, 0.47, 0.87], twist: 0.1, lean: 0.03, fL: [0.08, -0.1] }],
    [1, REST],
  ],
  // walk cycle: phase-driven, the spear upright in the right hand, the shield across the chest
  walk: null,
};

function walkPose(t) {
  const a = Math.sin(t * 2 * Math.PI), c = Math.cos(t * 2 * Math.PI);
  const stride = 0.14;
  return {
    ...REST,
    fL: [stride * a, -0.1, Math.max(0, -c) * 0.05],
    fR: [-stride * a, 0.1, Math.max(0, c) * 0.05],
    hR: [REST.hR[0] - 0.04 * a, REST.hR[1], REST.hR[2] + 0.015 * Math.abs(a)],
    dip: 0.025 * Math.abs(Math.cos(t * 4 * Math.PI)),
    twist: 0.08 * a,
  };
}

function poseAt(clip, t) {
  if (clip === 'walk') return walkPose(t);
  const keys = POSES[clip];
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const [t0, p0] = keys[i], [t1, p1] = keys[i + 1];
  const u = Math.min(1, Math.max(0, (t - t0) / (t1 - t0 || 1)));
  const e = u * u * (3 - 2 * u); // smoothstep: ease in and out of every key
  const out = {};
  for (const k of Object.keys(p0)) out[k] = Array.isArray(p0[k]) ? lerpV(p0[k], p1[k], e) : lerp(p0[k], p1[k], e);
  return out;
}

/** The 18 joints (world metres) of a pose for a field facing. */
function joints(p, [fx, fy]) {
  const U = [0, 0, 1];
  const F0 = norm([fx, fy, 0]);
  // model3d's world is mirrored against a right-handed z-up frame: the man's right is U x F (facing the camera, his right hand is on screen-left)
  const R0 = cross(U, F0);
  const at = (o, f, r, u) => add(o, add(add(mul(F0, f), mul(R0, r)), mul(U, u)));
  const pelvis = at([0, 0, 0], p.lean * 0.15, 0, BODY.hip - p.dip);
  const up = norm(add(U, mul(F0, Math.sin(p.lean))));
  const Rt = norm(add(mul(R0, Math.cos(p.twist)), mul(F0, Math.sin(p.twist))));
  const neck = add(pelvis, mul(up, BODY.neck));
  const shL = add(add(neck, mul(Rt, -BODY.shoulderW)), mul(up, -BODY.shoulderDrop));
  const shR = add(add(neck, mul(Rt, BODY.shoulderW)), mul(up, -BODY.shoulderDrop));
  const hipL = at(pelvis, 0, -0.1, -0.03), hipR = at(pelvis, 0, 0.1, -0.03);
  const ankL = at([0, 0, 0], p.fL[0], p.fL[1], BODY.ankle + (p.fL[2] ?? 0));
  const ankR = at([0, 0, 0], p.fR[0], p.fR[1], BODY.ankle + (p.fR[2] ?? 0));
  const kneeL = ik(hipL, ankL, BODY.thigh, BODY.shin, F0), kneeR = ik(hipR, ankR, BODY.thigh, BODY.shin, F0);
  const base = at([0, 0, 0], 0, 0, 0);
  const hR = at(base, p.hR[0], p.hR[1], p.hR[2] - p.dip), hL = at(base, p.hL[0], p.hL[1], p.hL[2] - p.dip);
  const elR = ik(shR, hR, BODY.upperArm, BODY.foreArm, add(mul(R0, 0.8), mul(U, -1)));
  const elL = ik(shL, hL, BODY.upperArm, BODY.foreArm, add(mul(R0, -0.8), mul(U, -1)));
  const head = add(neck, mul(up, BODY.head));
  const nose = add(head, mul(F0, 0.14));
  const eye = (s) => add(add(head, mul(F0, 0.12)), add(mul(R0, s * 0.06), mul(up, 0.05)));
  const ear = (s) => add(add(head, mul(R0, s * 0.13)), mul(F0, -0.02));
  return {
    NOSE: nose, NECK: neck,
    'RIGHT SHOULDER': shR, 'RIGHT ELBOW': elR, 'RIGHT ARM': hR,
    'LEFT SHOULDER': shL, 'LEFT ELBOW': elL, 'LEFT ARM': hL,
    'RIGHT HIP': hipR, 'RIGHT KNEE': kneeR, 'RIGHT LEG': ankR,
    'LEFT HIP': hipL, 'LEFT KNEE': kneeL, 'LEFT LEG': ankL,
    'RIGHT EYE': eye(1), 'LEFT EYE': eye(-1), 'RIGHT EAR': ear(1), 'LEFT EAR': ear(-1),
  };
}

/** Image fit: sprite px of the ground point under the man and pixels per metre. */
function fitOf(img, o) {
  let x0 = img.w, x1 = -1, y1 = -1, crestBase = -1;
  const opaque = (x, y) => img.data[(y * img.w + x) * 4 + 3] > 8;
  const crest = (x, y) => { const i = (y * img.w + x) * 4; return img.data[i + 3] > 8 && img.data[i] > 90 && img.data[i] > img.data[i + 1] * 2 && img.data[i] > img.data[i + 2] * 1.6; };
  let crestTop = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (!opaque(x, y)) continue;
    y1 = y;
    if (crestTop < 0 && crest(x, y)) crestTop = y;
  }
  // the crest's base: first row below its top with no crest-red pixel in the head's columns
  for (let y = Math.max(0, crestTop); y < img.h && crestBase < 0; y++) {
    let any = false;
    for (let x = 0; x < img.w; x++) if (crest(x, y)) any = true;
    if (!any) crestBase = y;
  }
  const legRow = y1 - 6;
  for (let x = 0; x < img.w; x++) if (opaque(x, legRow)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  const feet = o.feet ?? y1;
  const head = o.head ?? crestBase;
  const cx = o.cx ?? (x0 + x1) / 2;
  return { feet, head, cx, ppm: (feet - head) / (1.75 * C30) };
}

const toImg = (v, f, img) => ({ x: (f.cx + dot(v, RIGHT) * f.ppm) / img.w, y: (f.feet - dot(v, UP) * f.ppm) / img.h });

function frameKeypoints(js, f, img) {
  return Object.entries(js).map(([label, v]) => {
    const p = toImg(v, f, img);
    return { label, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z_index: Math.round(dot(v, CAM) * 100) };
  });
}

const BONES = [['NECK', 'NOSE'], ['NECK', 'RIGHT SHOULDER'], ['RIGHT SHOULDER', 'RIGHT ELBOW'], ['RIGHT ELBOW', 'RIGHT ARM'], ['NECK', 'LEFT SHOULDER'],
  ['LEFT SHOULDER', 'LEFT ELBOW'], ['LEFT ELBOW', 'LEFT ARM'], ['NECK', 'RIGHT HIP'], ['RIGHT HIP', 'RIGHT KNEE'], ['RIGHT KNEE', 'RIGHT LEG'],
  ['NECK', 'LEFT HIP'], ['LEFT HIP', 'LEFT KNEE'], ['LEFT KNEE', 'LEFT LEG']];

function overlay(img, kps, k) {
  const out = blank(img.w * k, img.h * k);
  for (let i = 0; i < out.w * out.h; i++) out.data.set([60, 58, 40, 255], i * 4);
  blit(out, img, 0, 0, k);
  const px = (x, y, c) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = Math.round(x) + dx, Y = Math.round(y) + dy;
      if (X >= 0 && Y >= 0 && X < out.w && Y < out.h) out.data.set([...c, 255], (Y * out.w + X) * 4);
    }
  };
  const by = Object.fromEntries(kps.map((p) => [p.label, p]));
  for (const [a, b] of BONES) {
    const A = by[a], B = by[b];
    const right = a.includes('RIGHT') || b.includes('RIGHT');
    const col = right ? [80, 220, 255] : a.includes('LEFT') || b.includes('LEFT') ? [255, 220, 60] : [255, 255, 255];
    for (let t = 0; t <= 1; t += 0.02) px(lerp(A.x, B.x, t) * out.w, lerp(A.y, B.y, t) * out.h, col);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
  const [clip, facing, sprite] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  const n = Number(opt('frames', 14));
  const img = readImage(sprite);
  const o = {};
  for (const k of ['feet', 'head', 'cx']) if (opt(k) !== undefined) o[k] = Number(opt(k));
  const f = fitOf(img, o);
  const dir = FACING[facing];
  const first = frameKeypoints(joints(poseAt(clip === 'walk' ? 'rest' : clip, 0), dir), f, img);
  // a looping walk samples n phases of the cycle; one-shot clips run from just after the rest pose to the end
  const kps = Array.from({ length: n }, (_, i) => frameKeypoints(joints(poseAt(clip, clip === 'walk' ? i / n : (i + 1) / n), dir), f, img));
  const res = { clip, facing, fit: f, first_frame_keypoints: first, keypoints: kps };
  const out = opt('out');
  if (out) writeFileSync(out, JSON.stringify(res));
  const sheet = opt('sheet');
  if (sheet) {
    const k = Number(opt("k", 4));
    const tiles = [overlay(img, first, k), ...kps.map((p) => overlay(img, p, k))];
    const W = tiles.length * img.w * k;
    const S = blank(W, img.h * k);
    tiles.forEach((t, i) => blit(S, t, i * img.w * k, 0, 1));
    writeImage(sheet, S);
  }
  console.log(`${clip} ${facing}: ${n} frames, fit feet ${f.feet} head ${f.head} cx ${f.cx} ppm ${f.ppm.toFixed(1)}${out ? ` -> ${out}` : ''}`);
}
