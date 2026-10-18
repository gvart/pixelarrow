// I5a: the sheet spec's rowsFeet for a class (the feet point of each game facing's 68 rotation: shins' centre, feet row),
// measured as rig.mjs fitOf does.
// Usage: node scripts/art/pixellab/i5a/feet.mjs <class>
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage } from '../../lib/png.mjs';
import { fitOf } from '../rig.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const cls = process.argv[2];
const out = {};
for (const d of ['south-east', 'north-east', 'south-west', 'north-west']) {
  const f = fitOf(readImage(join(ROOT, 'docs/v5/pixellab/I5a/raw', cls, 'base/zip/Idle/rotations', `${d}.png`)));
  out[d] = [Math.round(f.cx), f.feet];
}
console.log(JSON.stringify(out));
