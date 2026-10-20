// Guardians (ART-L): download the base images in docs/v5/pixellab/GUARD/bases.jobs.json (missing ones, or --force).
// "grid" (a 2x2 rotation grid edit, SE NE / SW NW) is split into raw/<class>/rot/<facing>.png; "<facing>" saves one view.
// Usage: node scripts/art/pixellab/guard/bases.mjs [--force]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const RAW = 'docs/v5/pixellab/GUARD/raw';
const force = process.argv.includes('--force');
for (const b of JSON.parse(readFileSync('docs/v5/pixellab/GUARD/bases.jobs.json', 'utf8'))) {
  const dir = join(RAW, b.class);
  const file = join(dir, `base-${b.kind}.png`);
  if (!force && existsSync(file)) continue;
  const res = await fetch(`https://api.pixellab.ai/mcp/images/${b.job}/download`);
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('png')) { console.log(`${b.class}: not ready`); continue; }
  mkdirSync(join(dir, 'rot'), { recursive: true });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  if (b.kind === 'grid') execFileSync('node', ['scripts/art/pixellab/civ/grid.mjs', 'split', file, join(dir, 'rot')]);
  else writeFileSync(join(dir, 'rot', `${b.kind}.png`), readFileSync(file));
  console.log(`${b.class}: ${b.kind}`);
}
