// Download every clip job listed in a jobs file that is not on disk yet (or all with --force).
// Usage: node scripts/art/pixellab/fetchjobs.mjs <jobs.json> <raw dir> [--force]
//   jobs.json  [{ "anim", "dir", "attempt", "job", "mode": "skeleton" | "pixminimax", "frames", ... }]
//              (pixminimax returns frames + 1 images, the first being the input: it is skipped)
// Frames land in <raw dir>/clips/<anim>/<dir>/<attempt>/frame_NNN.png.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const [jobsPath, raw] = process.argv.slice(2);
const force = process.argv.includes('--force');
const here = new URL('.', import.meta.url).pathname;
for (const j of JSON.parse(readFileSync(jobsPath, 'utf8'))) {
  if (!j.job) continue;
  const out = join(raw, 'clips', j.anim, j.dir, j.attempt);
  if (!force && existsSync(join(out, 'job.json'))) continue;
  const pm = j.mode === 'pixminimax';
  execFileSync('node', [join(here, 'getclip.mjs'), j.job, String(j.frames + (pm ? 1 : 0)), out, '--skip', pm ? '1' : '0'], { stdio: 'inherit' });
}
