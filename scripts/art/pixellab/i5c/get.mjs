// I5c: download a pixminimax image job (frames + 1 images, index 0 = the input, skipped), align it on the work
// canvas against its start frame, and write a numbered contact sheet and a GIF for review.
// Usage: node scripts/art/pixellab/i5c/get.mjs <class> <anim> <dir> <attempt> <job> <frames> <start.png> [--fps 12] [--review dir]
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { RAW, clipDir } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [cls, anim, dir, attempt, job, n, start] = args;
const here = new URL('.', import.meta.url).pathname;
const tmp = join(RAW, cls, 'dl', `${anim}-${dir}-${attempt}`);
execFileSync('node', [join(here, '../getclip.mjs'), job, String(Number(n) + 1), tmp, '--skip', '1'], { stdio: 'inherit' });
const out = clipDir(cls, anim, dir, attempt);
execFileSync('node', [join(here, 'align.mjs'), cls, tmp, start, out], { stdio: 'inherit' });
const rev = opt('review');
if (rev) {
  const base = join(rev, `${cls}-${anim}-${dir}-${attempt}`);
  execFileSync('node', [join(here, '../mounted/clip.mjs'), `${base}.png`, out, '--scale', '3', '--wrap', '8', '--gif', `${base}.gif`, '--fps', opt('fps', '12')], { stdio: 'inherit' });
}
