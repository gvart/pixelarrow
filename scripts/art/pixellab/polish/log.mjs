// Polish: log a re-run clip job, in the class's jobs file (the fetchjobs.mjs format) and, word for word, in
// docs/v5/pixellab/I5b/polish.prompts.json; or set its verdict.
// Usage: node scripts/art/pixellab/polish/log.mjs add <class> <anim> <dir> <attempt> <job> <frames> <gens> <first> <description>
//        node scripts/art/pixellab/polish/log.mjs verdict <job> <verdict text>
//   dir: se ne sw nw; first: the canvas the input frame is on (rot, tall, guard, atk, gatk, die)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../lib/manifest.mjs';

const D = { se: 'south-east', ne: 'north-east', sw: 'south-west', nw: 'north-west' };
const base = join(ROOT, 'docs/v5/pixellab/I5b');
const pPath = join(base, 'polish.prompts.json');
const P = JSON.parse(readFileSync(pPath, 'utf8'));
const [cmd, ...a] = process.argv.slice(2);
if (cmd === 'add') {
  const [cls, anim, d, attempt, job, frames, gens, first, description] = a;
  const dir = D[d] ?? d;
  const jPath = join(base, `${cls}.jobs.json`);
  const jobs = existsSync(jPath) ? JSON.parse(readFileSync(jPath, 'utf8')) : [];
  if (!jobs.some((j) => j.job === job)) jobs.push({ anim, dir, attempt, job, mode: 'pixminimax', frames: +frames, gens: +gens, first });
  writeFileSync(jPath, '[\n' + jobs.map((j) => ' ' + JSON.stringify(j)).join(',\n') + '\n]\n');
  if (!P.jobs.some((j) => j.job === job)) P.jobs.push({ class: cls, anim, dir, attempt, job, first, frames: +frames, gens: +gens, description });
} else if (cmd === 'verdict') {
  const [job, verdict] = a;
  const j = P.jobs.find((x) => x.job === job);
  if (!j) throw new Error(`${job}: not logged`);
  j.verdict = verdict;
} else throw new Error('usage: log.mjs add ... | verdict <job> <text>');
writeFileSync(pPath, JSON.stringify(P, null, 1) + '\n');
console.log(`${P.jobs.length} polish jobs, ${P.jobs.reduce((s, j) => s + j.gens, 0)} gens`);
