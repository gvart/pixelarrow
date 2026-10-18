// I5b skeleton clips for the shieldless, two-handed and missile classes, on the shared rig (scripts/art/pixellab/rig.mjs:
// the doll body, the battle camera, the style-lock warp). Only new poses live here; the body, projection and fit are
// rig.mjs's, unchanged.
//
//   slash2h  two hands on the haft (rhomphaia, falx): from the high guard, the weapon heaved back over the right
//            shoulder, a step in on the lead (left) foot with the hips leading, the blade brought down along a
//            diagonal arc to low at his left, a follow-through, back up to the high guard. Both hands stay on the
//            haft (the left hand a fixed 0.16 m above the right along it) in every frame.
//   slash1h  one hand, a shield on the left arm (celt_sword, gallic): the sword or axe raised behind the right
//            shoulder, the step in with the shield driving forward with the body, a downward diagonal cut, follow-
//            through, recovery.
//   hack1h   one hand, no shield (fanatic): as slash1h with the free left arm thrown back for balance.
//
// Usage: node scripts/art/pixellab/i5b/rig5b.mjs <clip> <facing> <sprite.png> [--frames 14] [--out kp.json]
//          [--sheet overlay.png] [--grip x,y] [--ghost 1] [--feet y] [--cx x]
import { writeFileSync } from 'node:fs';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank } from '../../lib/ops.mjs';
import { blit } from '../sheet.mjs';
import { BODY, FACING, joints, frameKeypoints, fitOf, overlay } from '../rig.mjs';

const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (u) => u * u * (3 - 2 * u);

const base = { pf: 0, pr: 0, hip: BODY.hip, lean: 0, roll: 0, twist: 0, fL: [0.03, -0.12, 0], fR: [-0.03, 0.12, 0], R: [0.06, 0.4, 0.98], L: [0.02, -0.24, 0.9], yaw: 0, nod: 0, fall: 0, fallDir: 1 };

/** Both hands on one haft: the left hand `gap` m further along the haft direction `dir` from the right. */
const grip2 = (R, dir, gap = 0.16) => {
  const n = Math.hypot(...dir) || 1;
  return { R, L: add3(R, dir.map((v) => (v / n) * gap)) };
};

export const CLIPS5 = {
  slash2h: {
    frames: 14,
    // the base rotation: the weapon upright in the right hand at his right side
    start: () => base,
    keys: () => {
      const hi = { ...base, ...grip2([0.1, 0.3, 1.12], [0.05, -0.1, 1]), twist: -0.15, hip: BODY.hip - 0.03 };
      const wind = { ...base, ...grip2([-0.12, 0.26, 1.62], [-0.3, 0.2, 0.6]), twist: -0.55, lean: -0.08, roll: -0.06, hip: BODY.hip - 0.04, fL: [0.1, -0.13, 0.03] };
      const step = { ...base, ...grip2([0.02, 0.22, 1.7], [0.1, -0.1, 0.9]), twist: -0.35, lean: 0.05, pf: 0.08, hip: BODY.hip - 0.06, fL: [0.4, -0.14, 0.05] };
      const cut = { ...base, ...grip2([0.42, 0.02, 1.15], [0.6, -0.3, -0.4]), twist: 0.35, lean: 0.25, pf: 0.22, hip: BODY.hip - 0.1, fL: [0.5, -0.15, 0], fR: [-0.18, 0.13, 0.03], nod: 0.1 };
      const low = { ...base, ...grip2([0.36, -0.18, 0.78], [0.5, -0.4, -0.5]), twist: 0.55, lean: 0.34, pf: 0.26, hip: BODY.hip - 0.13, fL: [0.52, -0.15, 0], fR: [-0.2, 0.13, 0.05], nod: 0.15 };
      return [
        [0, base],
        [0.12, hi],
        [0.3, wind],
        [0.42, step],
        [0.52, cut],
        [0.62, low],
        [0.72, { ...low, twist: 0.6, lean: 0.36 }],
        [0.86, { ...cut, ...grip2([0.2, 0.2, 1.05], [0.1, -0.1, 0.9]), twist: 0.1, lean: 0.12, pf: 0.1, fL: [0.3, -0.14, 0.03], fR: [-0.06, 0.13, 0] }],
        [1, base],
      ];
    },
  },
};

export function poseAt5(clip, t) {
  const keys = CLIPS5[clip].keys();
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const [t0, p0] = keys[i], [t1, p1] = keys[i + 1];
  const e = ease(Math.min(1, Math.max(0, (t - t0) / (t1 - t0 || 1))));
  const out = {};
  for (const k of Object.keys(p0)) out[k] = Array.isArray(p0[k]) ? p0[k].map((v, j) => lerp(v, p1[k][j], e)) : lerp(p0[k], p1[k], e);
  out.fallDir = 1;
  return out;
}

export function clipKeypoints5(clip, facing, img, { frames, fit, grip } = {}) {
  const c = CLIPS5[clip];
  const n = frames ?? c.frames;
  const f = fit ?? fitOf(img);
  const dir = FACING[facing];
  let first = frameKeypoints(joints(c.start(), dir), f, img);
  let kps = Array.from({ length: n }, (_, i) => frameKeypoints(joints(poseAt5(clip, (i + 1) / n), dir), f, img));
  if (grip) {
    const h = first.find((p) => p.label === 'RIGHT ARM');
    const dx = grip[0] / img.w - h.x, dy = grip[1] / img.h - h.y;
    const shift = (fr) => fr.map((p) => (p.label === 'RIGHT ARM' ? { ...p, x: +(p.x + dx).toFixed(3), y: +(p.y + dy).toFixed(3) }
      : p.label === 'RIGHT ELBOW' ? { ...p, x: +(p.x + dx / 2).toFixed(3), y: +(p.y + dy / 2).toFixed(3) } : p));
    first = shift(first);
    kps = kps.map(shift);
  }
  return { clip, facing, frames: n, fit: f, first_frame_keypoints: first, keypoints: kps };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
  const [clip, facing, sprite] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  const img = readImage(sprite);
  const o = {};
  for (const k of ['feet', 'head', 'cx', 'stature']) if (opt(k) !== undefined) o[k] = Number(opt(k));
  const res = clipKeypoints5(clip, facing, img, { frames: opt('frames') ? Number(opt('frames')) : undefined, fit: fitOf(img, o), grip: opt('grip') ? opt('grip').split(',').map(Number) : undefined });
  if (opt('out')) writeFileSync(opt('out'), JSON.stringify(res));
  if (opt('sheet')) {
    const k = Number(opt('k', 4));
    const tiles = [overlay(img, res.first_frame_keypoints, k), ...res.keypoints.map((p) => overlay(img, p, k, { sprite: !!opt('ghost') }))];
    const cols = Number(opt('cols', 5));
    const S = blank(Math.min(cols, tiles.length) * img.w * k, Math.ceil(tiles.length / cols) * img.h * k);
    tiles.forEach((t, i) => blit(S, t, (i % cols) * img.w * k, Math.floor(i / cols) * img.h * k, 1));
    writeImage(opt('sheet'), S);
  }
  console.log(`${clip} ${facing}: ${res.frames} frames, fit feet ${res.fit.feet} cx ${res.fit.cx}`);
}
