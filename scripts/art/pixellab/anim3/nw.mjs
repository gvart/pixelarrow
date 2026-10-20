// ANIM-3: the north-west raw frames of a work clip stand in for its north-east (attempt "nw"); anim3/mirror.mjs turns
// them round after the append. Usage: node scripts/art/pixellab/anim3/nw.mjs <class> <anim> [<anim> ...]
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAW = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'docs/v5/pixellab/ANIM3/raw');
const [cls, ...anims] = process.argv.slice(2);
for (const a of anims) {
  const src = join(RAW, cls, 'clips', a, 'north-west', 'a1'), dst = join(RAW, cls, 'clips', a, 'north-east', 'nw');
  if (!existsSync(join(src, 'job.json'))) { console.log(`${cls} ${a}: no north-west yet`); continue; }
  rmSync(dst, { recursive: true, force: true });
  cpSync(src, dst, { recursive: true });
}
