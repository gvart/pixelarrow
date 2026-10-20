// ANIM-3: fetch every ANIM3 job (fetchjobs.mjs per class) until all are on disk or `limit` minutes pass; prints
// what is still missing. Usage: node scripts/art/pixellab/anim3/wait.mjs [minutes]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, '..', '..', '..', '..', 'docs/v5/pixellab/ANIM3');
const until = Date.now() + Number(process.argv[2] ?? 10) * 60000;
for (;;) {
  const missing = [];
  for (const f of readdirSync(DIR).filter((f) => f.endsWith('.jobs.json'))) {
    const cls = f.replace('.jobs.json', ''), raw = join(DIR, 'raw', cls);
    execFileSync('node', [join(HERE, '..', 'fetchjobs.mjs'), join(DIR, f), raw], { stdio: 'ignore' });
    for (const j of JSON.parse(readFileSync(join(DIR, f), 'utf8'))) if (!existsSync(join(raw, 'clips', j.anim, j.dir, j.attempt, 'job.json'))) missing.push(`${cls} ${j.anim} ${j.dir} ${j.attempt}`);
  }
  if (!missing.length || Date.now() > until) { console.log(missing.length ? `missing: ${missing.join('; ')}` : 'all fetched'); break; }
  await new Promise((r) => setTimeout(r, 20000));
}
