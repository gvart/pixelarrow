// I4b: the 4 game facings (SE, NE, SW, NW) of one or more mounted rotations dirs, each beside H4, large.
// Usage: node scripts/art/pixellab/mounted/facings.mjs <out.png> [--scale 5] <label>=<rotations dir> ...
import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import { readImage, writeImage } from '../../lib/png.mjs';
import { ROOT } from '../../lib/manifest.mjs';
import { buildSheet } from '../sheet.mjs';
import { sideBySide } from './lib.mjs';

const args = process.argv.slice(2);
const scale = Number(args.includes('--scale') ? args[args.indexOf('--scale') + 1] : 5);
const out = args[0];
const specs = args.slice(1).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--')));
const FACINGS = ['south-east', 'north-east', 'south-west', 'north-west'];
const h4zip = join(ROOT, 'docs/v5/pixellab/I4a/raw/H4/zip');
const h4dir = join(h4zip, readdirSync(h4zip).find((s) => !s.endsWith('.json')), 'rotations');
const rows = specs.map((s) => {
  const [label, dir] = s.split('=');
  return { label, imgs: FACINGS.map((d) => sideBySide(readImage(join(dir, `${d}.png`)), readImage(join(h4dir, `${d}.png`)))) };
});
writeImage(out, buildSheet(rows, { scale }));
console.log(out);
