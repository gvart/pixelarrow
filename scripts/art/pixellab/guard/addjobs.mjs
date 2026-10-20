// Guardians (ART-L): append pixminimax jobs to docs/v5/pixellab/GUARD/<class>.jobs.json.
// Usage: node scripts/art/pixellab/guard/addjobs.mjs <class> <anim>:<dir>:<job>[:<gens>] ...
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const [cls, ...items] = process.argv.slice(2);
const f = `docs/v5/pixellab/GUARD/${cls}.jobs.json`;
const jobs = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : [];
for (const it of items) {
  const [anim, dir, job, gens = '1'] = it.split(':');
  if (jobs.some((j) => j.job === job)) continue;
  jobs.push({ anim, dir, attempt: 'a1', job, mode: 'pixminimax', frames: 12, gens: Number(gens) });
}
writeFileSync(f, '[\n' + jobs.map((j) => ' ' + JSON.stringify(j)).join(',\n') + '\n]\n');
console.log(`${f}: ${jobs.length} jobs`);
