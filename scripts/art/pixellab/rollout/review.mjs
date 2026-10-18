// I4a review of one base-character attempt: download it, then a contact sheet of its 8 rotations under H4's,
// plus the row extents of the south view (opaque rows, the widest opaque run near the feet) for the proportion check.
// Usage: node scripts/art/pixellab/rollout/review.mjs <class> <tag> <character id> [out.png, default raw/review.png] [--scale 5]
//   raws go to docs/v5/pixellab/I4a/raw/<class>/<tag>/ (gitignored)
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { ROOT } from '../../lib/manifest.mjs';
import { buildSheet, DIRS8 } from '../sheet.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [cls, tag, id] = args;
const raw = join(ROOT, 'docs/v5/pixellab/I4a/raw', cls, tag);
const out = args[3] && !args[3].startsWith("--") ? args[3] : join(raw, "review.png");
execFileSync('node', [join(ROOT, 'scripts/art/pixellab/fetch.mjs'), id, raw], { stdio: 'inherit' });
const rot = (dir) => {
  const states = execFileSync('ls', [join(dir, 'zip')]).toString().split('\n').filter((s) => s && !s.endsWith('.json'));
  return join(dir, 'zip', states[0], 'rotations');
};
const h4 = rot(join(ROOT, 'docs/v5/pixellab/I4a/raw/H4'));
const mine = rot(raw);
const rows = [
  { label: 'H4', imgs: DIRS8.map((d) => readImage(`${h4}/${d}.png`)) },
  { label: `${cls} ${tag}`, imgs: DIRS8.map((d) => readImage(`${mine}/${d}.png`)) },
];
writeImage(out, buildSheet(rows, { scale: Number(opt('scale', 5)) }));
for (const d of ['south', 'south-east', 'north-east', 'south-west', 'north-west']) {
  const im = readImage(`${mine}/${d}.png`);
  let top = -1, bot = -1;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.data[(y * im.w + x) * 4 + 3] > 128) { if (top < 0) top = y; bot = y; }
  console.log(`${d}: opaque rows ${top}..${bot} (${bot - top + 1} px), canvas ${im.w}x${im.h}`);
}
console.log(`${out}\nrotations: ${mine}`);
