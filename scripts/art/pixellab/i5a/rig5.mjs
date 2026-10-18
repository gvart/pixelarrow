// I5a: extra rig.mjs weapons and clips for the shieldless militia, added to rig.mjs's exported tables at run time
// (rig.mjs itself is shared and unchanged). Same CLI as rig.mjs.
//   weapon `spear1`  one spear, NO shield: the left hand hangs empty at the side (militia)
//   clip `thrust2`   the two-hand thrust of a man without a shield (V5-093): from the one-hand guard the left hand
//                    takes the shaft ahead of the right, a draw-back along the shaft, the lead foot steps in and the
//                    hips and shoulders drive both hands forward along the spear's line, a held follow-through,
//                    recovery, the left hand back to the side
// Usage: node scripts/art/pixellab/i5a/rig5.mjs thrust2 <facing> <sprite.png> --weapon spear1 --grip x,y [--out kp.json] [--sheet o.png --ghost 1]
import { writeFileSync } from 'node:fs';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank } from '../../lib/ops.mjs';
import { blit } from '../sheet.mjs';
import { WEAPONS, CLIPS, BODY, clipKeypoints, fitOf, overlay } from '../rig.mjs';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
WEAPONS.spear1 = {
  ...WEAPONS.spear,
  rest: { R: WEAPONS.spear.rest.R, L: [0.02, -0.3, 0.62] },
  guard: { R: WEAPONS.spear.guard.R, L: [0.02, -0.29, 0.64] },
  couch: { R: WEAPONS.spear.couch.R, L: [0.04, -0.28, 0.66] },
};
const guard1 = (w) => ({ pf: 0, pr: 0, hip: BODY.hip - 0.02, lean: 0.04, roll: 0, twist: -0.06, fL: [0.03, -0.12, 0], fR: [-0.03, 0.12, 0], R: w.guard.R, L: w.guard.L, yaw: 0, nod: 0, fall: 0, fallDir: 1 });
CLIPS.thrust2 = {
  kind: 'once', frames: 14, start: guard1, keys: (w) => {
    const g = guard1(w);
    const R0 = w.guard.R;
    return [
      [0, g],
      // the left hand comes onto the shaft ahead of the right
      [0.16, { ...g, twist: -0.2, L: add(R0, [0.3, -0.14, 0.04]) }],
      // draw back along the shaft, weight on the rear foot
      [0.3, { ...g, pf: -0.08, hip: BODY.hip - 0.07, lean: -0.02, twist: -0.42, R: add(R0, [-0.26, -0.02, 0]), L: add(R0, [0.06, -0.14, 0.03]), fL: [0.16, -0.14, 0.03] }],
      // step in, hips and shoulders turn, both arms drive forward along the line
      [0.46, { ...g, pf: 0.22, hip: BODY.hip - 0.09, lean: 0.2, twist: 0.3, R: add(R0, [0.2, -0.06, 0.03]), L: add(R0, [0.52, -0.16, 0.06]), fL: [0.5, -0.14, 0], fR: [-0.16, 0.14, 0] }],
      [0.56, { ...g, pf: 0.28, hip: BODY.hip - 0.1, lean: 0.26, twist: 0.42, R: add(R0, [0.34, -0.08, 0.04]), L: add(R0, [0.66, -0.18, 0.06]), fL: [0.52, -0.14, 0], fR: [-0.18, 0.14, 0.04] }],
      [0.66, { ...g, pf: 0.28, hip: BODY.hip - 0.1, lean: 0.26, twist: 0.42, R: add(R0, [0.36, -0.08, 0.04]), L: add(R0, [0.68, -0.18, 0.06]), fL: [0.52, -0.14, 0], fR: [-0.18, 0.14, 0.04] }],
      [0.84, { ...g, pf: 0.12, hip: BODY.hip - 0.06, lean: 0.12, twist: 0.08, R: add(R0, [0.12, -0.02, 0]), L: add(R0, [0.42, -0.14, 0.04]), fL: [0.34, -0.14, 0.03] }],
      [1, g],
    ];
  },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
  const [clip, facing, sprite] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  const img = readImage(sprite);
  const res = clipKeypoints(clip, facing, img, { weapon: opt('weapon', 'spear1'), fit: fitOf(img), grip: opt('grip') ? opt('grip').split(',').map(Number) : undefined });
  if (opt('out')) writeFileSync(opt('out'), JSON.stringify(res));
  if (opt('sheet')) {
    const k = Number(opt('k', 3)), cols = Number(opt('cols', 5));
    const tiles = [overlay(img, res.first_frame_keypoints, k), ...res.keypoints.map((p) => overlay(img, p, k, { sprite: !!opt('ghost') }))];
    const S = blank(Math.min(cols, tiles.length) * img.w * k, Math.ceil(tiles.length / cols) * img.h * k);
    tiles.forEach((t, i) => blit(S, t, (i % cols) * img.w * k, Math.floor(i / cols) * img.h * k, 1));
    writeImage(opt('sheet'), S);
  }
  console.log(`${clip} ${facing} ${res.weapon}: ${res.frames} frames, fit feet ${res.fit.feet} cx ${res.fit.cx}`);
}
