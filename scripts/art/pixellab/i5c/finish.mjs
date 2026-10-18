// I5c: after sheetbuild.mjs, add the mounted manifest fields sheetbuild does not write, from the spec's `manifest`
// block: `variation` / `rarity` (the runtime flags that switch off the per-man skin tint, the cloak shade step and the
// metal rarity swap where a horse coat shares the rider's skin or metal hexes) and `notes` (why).
// Usage: node scripts/art/pixellab/i5c/finish.mjs <spec.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const path = join(spec.out, 'manifest.json');
const m = JSON.parse(readFileSync(path, 'utf8'));
Object.assign(m, spec.manifest ?? {});
writeFileSync(path, JSON.stringify(m, null, 1) + '\n');
console.log(`${path}: ${Object.keys(spec.manifest ?? {}).join(', ') || 'nothing'} added`);
