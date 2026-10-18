// I5c: a clip's first frame on the class's work canvas (lib.mjs CANVAS), for upload as first_frame_url.
// Usage: node scripts/art/pixellab/i5c/start.mjs <class> <dir> <name> [--clip <anim>/<attempt> --frame k]
//   default: the base rotation of <dir>; with --clip: frame k of an aligned clip of that facing (a loop key).
// Writes docs/v5/pixellab/I5c/raw/<class>/starts/<name>.png (gitignored) and prints its path.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { writeImage } from '../../lib/png.mjs';
import { RAW, startFrame, clipDir, frames } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [cls, dir, name] = args;
let img;
if (opt('clip')) {
  const [anim, attempt] = opt('clip').split('/');
  img = frames(clipDir(cls, anim, dir, attempt))[Number(opt('frame', 0))];
} else img = startFrame(cls, dir);
const out = join(RAW, cls, 'starts', `${name}.png`);
mkdirSync(join(RAW, cls, 'starts'), { recursive: true });
writeImage(out, img);
console.log(out);
