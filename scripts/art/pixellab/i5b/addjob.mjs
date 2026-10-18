// I5b: append clip jobs to docs/v5/pixellab/I5b/<class>.jobs.json (the fetchjobs.mjs format plus gens and first frame).
// Usage: node scripts/art/pixellab/i5b/addjob.mjs <class> <anim>:<dir>:<attempt>:<job>:<mode>:<frames>:<gens>:<first> [...]
//   dir: se ne sw nw; mode: pm (pixminimax) | sk (skeleton)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../lib/manifest.mjs';

const D = { se: 'south-east', ne: 'north-east', sw: 'south-west', nw: 'north-west' };
const [cls, ...items] = process.argv.slice(2);
const path = join(ROOT, 'docs/v5/pixellab/I5b', `${cls}.jobs.json`);
const jobs = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
for (const it of items) {
  const [anim, dir, attempt, job, mode, frames, gens, first] = it.split(':');
  jobs.push({ anim, dir: D[dir] ?? dir, attempt, job, mode: mode === 'sk' ? 'skeleton' : 'pixminimax', frames: +frames, gens: +gens, first });
}
writeFileSync(path, '[\n' + jobs.map((j) => ' ' + JSON.stringify(j)).join(',\n') + '\n]\n');
const total = jobs.reduce((s, j) => s + (j.gens || 0), 0);
console.log(`${cls}: ${jobs.length} jobs, ${total} gens quoted`);
