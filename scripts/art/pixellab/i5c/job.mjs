// I5c job log: every PixelLab clip job of a class in docs/v5/pixellab/I5c/<class>.jobs.json (committed; the frames
// are refetched from it with fetch.mjs). Prompts live once in docs/v5/pixellab/I5c/prompts.json by id.
// Usage:
//   node scripts/art/pixellab/i5c/job.mjs add <class> <anim> <dir> <attempt> <job> <frames> <gens> <start> <prompt id> [k=v ...]
//   node scripts/art/pixellab/i5c/job.mjs verdict <class> <anim> <dir> <attempt> <verdict text>
import { writeFileSync } from 'node:fs';
import { jobsPath, loadJobs } from './lib.mjs';

const [cmd, cls, anim, dir, attempt, ...rest] = process.argv.slice(2);
const jobs = loadJobs(cls);
const find = () => jobs.find((j) => j.anim === anim && j.dir === dir && j.attempt === attempt);
if (cmd === 'add') {
  const [job, frames, gens, start, prompt, ...kv] = rest;
  const e = { anim, dir, attempt, job, mode: 'pixminimax', frames: +frames, gens: +gens, start, prompt, ...Object.fromEntries(kv.map((s) => s.split('='))) };
  const old = find();
  if (old) Object.assign(old, e);
  else jobs.push(e);
} else if (cmd === 'verdict') {
  const e = find();
  if (!e) throw new Error('no such job');
  e.verdict = rest.join(' ');
} else throw new Error('add | verdict');
writeFileSync(jobsPath(cls), JSON.stringify(jobs, null, 1) + '\n');
console.log(`${cls}: ${jobs.length} jobs, ${jobs.reduce((s, j) => s + (j.gens || 0), 0)} gens`);
