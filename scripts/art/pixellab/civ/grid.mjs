// Civilians (ART-S): the four game-facing rotations of a base as one 2x2 grid (one Pro Flash edit re-dresses all
// four at once), and back. Order: SE NE / SW NW.
// Usage: node scripts/art/pixellab/civ/grid.mjs pack <rotations dir> <grid.png>
//        node scripts/art/pixellab/civ/grid.mjs split <grid.png> <out dir>   (writes <dir>.png per facing)
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank, crop, paste } from '../../lib/ops.mjs';

const ROWS = ['south-east', 'north-east', 'south-west', 'north-west'];
const S = 68;
const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'pack') {
  const g = blank(2 * S, 2 * S);
  ROWS.forEach((d, i) => paste(g, readImage(join(a, `${d}.png`)), (i % 2) * S, Math.floor(i / 2) * S));
  writeImage(b, g);
} else if (cmd === 'split') {
  const g = readImage(a);
  mkdirSync(b, { recursive: true });
  ROWS.forEach((d, i) => writeImage(join(b, `${d}.png`), crop(g, { x: (i % 2) * S, y: Math.floor(i / 2) * S, w: S, h: S })));
} else throw new Error('usage: grid.mjs pack|split');
