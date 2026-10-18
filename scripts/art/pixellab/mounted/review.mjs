// I4b review of one mounted attempt: download it, then a contact sheet of its 8 rotations with H4 standing beside
// each view at the same scale (both bottom-aligned on their lowest opaque row), plus the opaque box of every view.
// Usage: node scripts/art/pixellab/mounted/review.mjs <class> <tag> <character id> [--scale 4] [--nofetch]
//   raws go to docs/v5/pixellab/I4b/raw/<class>/<tag>/ (gitignored); the sheet to <raw>/review.png
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { ROOT } from '../../lib/manifest.mjs';
import { buildSheet, DIRS8 } from '../sheet.mjs';
import { bbox, sideBySide } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [cls, tag, id] = args;
const raw = join(ROOT, 'docs/v5/pixellab/I4b/raw', cls, tag);
if (!args.includes('--nofetch')) execFileSync('node', [join(ROOT, 'scripts/art/pixellab/fetch.mjs'), id, raw], { stdio: 'inherit' });
const rot = (dir) => {
  const states = readdirSync(join(dir, 'zip')).filter((s) => !s.endsWith('.json'));
  return join(dir, 'zip', states[0], 'rotations');
};
const h4 = rot(join(ROOT, 'docs/v5/pixellab/I4a/raw/H4'));
const mine = rot(raw);
const imgs = DIRS8.map((d) => sideBySide(readImage(`${mine}/${d}.png`), readImage(`${h4}/${d}.png`)));
writeImage(join(raw, 'review.png'), buildSheet([{ label: `${cls} ${tag} + H4`, imgs }], { scale: Number(opt('scale', 4)) }));
for (const d of DIRS8) {
  const im = readImage(`${mine}/${d}.png`);
  const b = bbox(im);
  console.log(`${d.padEnd(10)} x ${b.x0}..${b.x1} (${b.x1 - b.x0 + 1}) y ${b.y0}..${b.y1} (${b.y1 - b.y0 + 1}) canvas ${im.w}x${im.h}`);
}
console.log(`${join(raw, 'review.png')}\nrotations: ${mine}`);
