// I5a: append a submitted clip job to a class's jobs file (fetchjobs.mjs format) and print the class's gens so far.
// Usage: node scripts/art/pixellab/i5a/job.mjs <class> <anim> <dir> <attempt> <job id> <pixminimax|skeleton> <frames> <gens> [note]
//        node scripts/art/pixellab/i5a/job.mjs <class>        (just the totals)
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const [cls, anim, dir, attempt, job, mode, frames, gens, ...note] = process.argv.slice(2);
const p = join(ROOT, 'docs/v5/pixellab/I5a', cls, 'jobs.json');
mkdirSync(dirname(p), { recursive: true });
const jobs = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : [];
if (job) {
  jobs.push({ anim, dir, attempt, job, mode, frames: Number(frames), gens: Number(gens), ...(note.length ? { note: note.join(' ') } : {}) });
  writeFileSync(p, '[\n' + jobs.map((j) => ' ' + JSON.stringify(j)).join(',\n') + '\n]\n');
}
console.log(`${cls}: ${jobs.length} jobs, ${jobs.reduce((s, j) => s + j.gens, 0)} gens quoted`);
