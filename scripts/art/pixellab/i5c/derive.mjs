// I5c: clips that ship frames of another clip (sheetbuild reads clips/<anim>/<dir>/<attempt>): copies the aligned
// frames of a source clip to the shipped clip's folder. The spec then picks the frames (its `frames` list).
// Usage: node scripts/art/pixellab/i5c/derive.mjs <class>
import { cpSync, existsSync, rmSync } from 'node:fs';
import { clipDir } from './lib.mjs';

/** class -> [ [to anim, dir, to attempt, from anim, from attempt] ] */
const DERIVED = {
  companion: [
    // the charge entry's frames 7-14 are one couched stride that loops (wrap 50 % vs 60-69 % between neighbours)
    ['charge', 'south-west', 'e1', 'charge-entry', 'a1'],
    // the rout entries that already loop: SW whole (frame 8 = frame 0), SE frames 3-10
    ['rout', 'south-west', 'e1', 'rout-entry', 'a1'],
    ['rout', 'south-east', 'e1', 'rout-entry', 'a1'],
  ],
  horse_archer: [
    // gallop entries whose 8-frame strides loop: SW 7-14, NW 3-10
    ['gallop', 'south-west', 'e1', 'gallop-entry', 'a1'],
    ['gallop', 'north-west', 'e1', 'gallop-entry', 'a1'],
    // rout entries: SW and SE strides 7-14, NE 2-13
    ['rout', 'south-west', 'e1', 'rout-entry', 'a1'],
    ['rout', 'south-east', 'e1', 'rout-entry', 'a1'],
    ['rout', 'north-east', 'e1', 'rout-entry', 'a1'],
    ['rout', 'north-west', 'e1', 'rout-entry', 'a2'],
  ],
};

const cls = process.argv[2];
for (const [anim, dir, attempt, from, fromAttempt] of DERIVED[cls] ?? []) {
  const src = clipDir(cls, from, dir, fromAttempt), dst = clipDir(cls, anim, dir, attempt);
  if (!existsSync(src)) throw new Error(`${src} missing (fetchall first)`);
  rmSync(dst, { recursive: true, force: true });
  cpSync(src, dst, { recursive: true });
  console.log(`${from}/${dir}/${fromAttempt} -> ${anim}/${dir}/${attempt}`);
}
