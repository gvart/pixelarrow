// I5b: the feet point (shins' centre column, lowest opaque row) of each game facing's 68 rotation, as the
// sheetbuild spec's rowsFeet. Usage: node scripts/art/pixellab/i5b/feet.mjs <class>
import { join } from 'node:path';
import { readImage } from '../../lib/png.mjs';
import { ROOT } from '../../lib/manifest.mjs';
import { fitOf } from '../rig.mjs';
import { DIRS } from './prep.mjs';

const cls = process.argv[2];
const out = {};
for (const d of DIRS) {
  const f = fitOf(readImage(join(ROOT, 'docs/v5/pixellab/I5b/raw', cls, 'first', `rot_${d}.png`)));
  out[d] = [Math.round(f.cx), f.feet];
}
console.log(JSON.stringify(out));
