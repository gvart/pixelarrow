// I5b: move a first frame from one canvas to another (no pixel changed), e.g. the guard frame (drawn on the tall
// canvas) onto the attack canvas, so a clip can start from the guard. Offsets from prep.mjs CANVASES.
// Usage: node scripts/art/pixellab/i5b/repad.mjs <class> <name> <from canvas> <to canvas> [<out name>]
//   reads first/<name>_<dir>.png for the 4 facings, writes first/<out name, default name_to>_<dir>.png
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank, paste } from '../../lib/ops.mjs';
import { ROOT } from '../../lib/manifest.mjs';
import { CANVASES, DIRS } from './prep.mjs';

const [cls, name, from, to, outName] = process.argv.slice(2);
const dir = join(ROOT, 'docs/v5/pixellab/I5b/raw', cls, 'first');
for (const d of DIRS) {
  if (!existsSync(join(dir, `${name}_${d}.png`))) continue;
  const img = readImage(join(dir, `${name}_${d}.png`));
  const [fx, fy] = CANVASES[from].at[d], [tx, ty] = CANVASES[to].at[d];
  const o = blank(...CANVASES[to].size);
  paste(o, img, tx - fx, ty - fy);
  writeImage(join(dir, `${outName ?? `${name}_${to}`}_${d}.png`), o);
}
console.log(`${cls}: ${name} ${from} -> ${to}`);
