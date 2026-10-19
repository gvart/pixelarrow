// ANIM-1: append a submitted pixminimax job to docs/v5/pixellab/ANIM1/<class>.jobs.json (fetchjobs.mjs format) and print
// the round's generations so far (every class).
// Usage: node scripts/art/pixellab/anim1/job.mjs <class> <anim> <dir> <attempt> <job id> <frames> <gens> [first] [note]
//        node scripts/art/pixellab/anim1/job.mjs            (just the totals)
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'docs/v5/pixellab', process.env.ROUND ?? 'ANIM1');
const [cls, anim, dir, attempt, job, frames, gens, first, ...note] = process.argv.slice(2);
if (job) {
  const p = join(DIR, `${cls}.jobs.json`);
  const jobs = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : [];
  jobs.push({ anim, dir, attempt, job, mode: 'pixminimax', frames: Number(frames), gens: Number(gens), ...(first ? { first } : {}), ...(note.length ? { note: note.join(' ') } : {}) });
  writeFileSync(p, '[\n' + jobs.map((j) => ' ' + JSON.stringify(j)).join(',\n') + '\n]\n');
}
let total = 0;
for (const f of readdirSync(DIR).filter((f) => f.endsWith('.jobs.json'))) {
  const g = JSON.parse(readFileSync(join(DIR, f), 'utf8')).reduce((s, j) => s + j.gens, 0);
  console.log(`${f}: ${g}`);
  total += g;
}
console.log(`${process.env.ROUND ?? 'ANIM1'} total: ${total} gens quoted`);
