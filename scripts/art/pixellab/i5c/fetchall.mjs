// I5c: fetch (get.mjs) every job of a class's jobs file whose aligned frames are not on disk yet, with review
// sheets and GIFs. A job still running is reported and skipped.
// Usage: node scripts/art/pixellab/i5c/fetchall.mjs <class> [--review dir] [--force]
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { RAW, clipDir, loadJobs } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const cls = args[0];
const FPS = { idle: 8, walk: 14, gallop: 16, charge: 16, rout: 16, thrust: 14, throw: 14, shoot: 14, stagger: 12, hit: 12, fallFwd: 12, wreck: 12, cheer: 10, drive: 16 };
const here = new URL('.', import.meta.url).pathname;
for (const j of loadJobs(cls)) {
  if (!j.job || j.local) continue;
  const out = clipDir(cls, j.anim, j.dir, j.attempt);
  if (!args.includes('--force') && existsSync(join(out, 'frame_000.png'))) continue;
  const start = join(RAW, cls, 'starts', `${j.start}-${j.dir}.png`);
  const a = [join(here, 'get.mjs'), cls, j.anim, j.dir, j.attempt, j.job, String(j.frames), start, '--fps', String(FPS[j.anim] ?? 12)];
  if (opt('review')) a.push('--review', opt('review'));
  try {
    execFileSync('node', a, { stdio: ['ignore', 'pipe', 'pipe'] })
      .toString().split('\n').filter((l) => l.includes('moved')).forEach((l) => console.log(l.replace(/.*clips\//, '')));
    if (j.dust) console.log(execFileSync('node', [join(here, 'dust.mjs'), out]).toString().trim().replace(/.*clips\//, ''));
    if (j.despeck) console.log(execFileSync('node', [join(here, 'despeck.mjs'), out, String(j.despeck)]).toString().trim().replace(/.*clips\//, ''));
  } catch (e) {
    console.log(`${j.anim} ${j.dir} ${j.attempt}: not ready (${String(e.stderr ?? e.message).split('\n').find((l) => l.trim()) ?? ''})`);
  }
}
