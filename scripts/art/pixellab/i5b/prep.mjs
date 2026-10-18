// I5b: the first frames of a class's clips, from its approved base rotations (no pixel changed, only padded):
//   rot_<dir>.png   68 x 68, the rotation itself
//   tall_<dir>.png  96 x 112, the rotation at (14, 40): stances and cheer, room for a raised weapon
//   atk_<dir>.png   128 x 112: the attacks; the man set back from his facing (40 px ahead of him, 20 behind)
//   die_<dir>.png   128 x 128 at (30, 30): the deaths, room to lie down
// Usage: node scripts/art/pixellab/i5b/prep.mjs <class> [<class> ...]   (raws: docs/v5/pixellab/I5b/raw/<class>/)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank, paste } from '../../lib/ops.mjs';
import { ROOT } from '../../lib/manifest.mjs';

export const DIRS = ['south-east', 'north-east', 'south-west', 'north-west'];
/** Where the 68 rotation sits in each canvas, per facing. */
export const CANVASES = {
  rot: { size: [68, 68], at: { 'south-east': [0, 0], 'north-east': [0, 0], 'south-west': [0, 0], 'north-west': [0, 0] } },
  tall: { size: [96, 112], at: { 'south-east': [14, 40], 'north-east': [14, 40], 'south-west': [14, 40], 'north-west': [14, 40] } },
  atk: { size: [128, 112], at: { 'south-east': [20, 40], 'north-east': [20, 40], 'south-west': [40, 40], 'north-west': [40, 40] } },
  die: { size: [128, 128], at: { 'south-east': [30, 30], 'north-east': [30, 30], 'south-west': [30, 30], 'north-west': [30, 30] } },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const cls of process.argv.slice(2)) {
    const raw = join(ROOT, 'docs/v5/pixellab/I5b/raw', cls);
    const out = join(raw, 'first');
    mkdirSync(out, { recursive: true });
    for (const d of DIRS) {
      const r = readImage(join(raw, 'base/zip/Idle/rotations', `${d}.png`));
      for (const [name, c] of Object.entries(CANVASES)) {
        const o = blank(...c.size);
        paste(o, r, ...c.at[d]);
        writeImage(join(out, `${name}_${d}.png`), o);
      }
    }
    console.log(`${cls}: first frames -> ${out}`);
  }
}
