// I5a: the throw clip's first frames: the 68 rotation (weapon upright) padded onto the guard canvas (128 x 112 at the
// hoplite's guard offsets, room ahead of the man for the throw), and their upload refs merged into first/uploads.json.
// Usage: node scripts/art/pixellab/i5a/tpad.mjs <class> [--upload <url>]   -> first/tpad_<dir>.png
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const GUARD = { 'south-east': [16, 30], 'north-east': [8, 30], 'south-west': [52, 30], 'north-west': [40, 30] };
const args = process.argv.slice(2);
const cls = args[0];
const url = args.includes('--upload') ? args[args.indexOf('--upload') + 1] : null;
const first = join(ROOT, 'docs/v5/pixellab/I5a/raw', cls, 'first');
const refs = existsSync(join(first, 'uploads.json')) ? JSON.parse(readFileSync(join(first, 'uploads.json'), 'utf8')) : {};
for (const [d, [dx, dy]] of Object.entries(GUARD)) {
  const out = join(first, `tpad_${d}.png`);
  execFileSync('node', [join(HERE, '..', 'pad.mjs'), join(first, `rot_${d}.png`), out, '128', '112', String(dx), String(dy)]);
  if (url) refs[`tpad_${d}`] = JSON.parse(execFileSync('curl', ['-sS', '-F', `file=@${out}`, url]).toString()).ref;
}
if (url) writeFileSync(join(first, 'uploads.json'), JSON.stringify(refs, null, 1));
console.log(JSON.stringify(Object.fromEntries(Object.entries(refs).filter(([k]) => k.startsWith('tpad_')))));
