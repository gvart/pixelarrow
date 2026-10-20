// ANIM-3: rebuild one class's work clips from the round's raw frames, start to end: the north-west stand-ins
// (nw.mjs), the append spec (anim1/spec.mjs) and append (anim1/append.mjs), the north-east of every 'nw' clip
// mirrored from the north-west (mirror.mjs), then the load anchors (anchors.mjs, the append rewrites the manifest).
// Usage: node scripts/art/pixellab/anim3/build.mjs <class> [<class> ...]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..', '..', '..');
const run = (script, ...args) => execFileSync('node', [join(HERE, script), ...args], { stdio: 'inherit', env: { ...process.env, ROUND: 'ANIM3' } });
for (const cls of process.argv.slice(2)) {
  run('nw.mjs', cls, 'chop', 'build', 'harvest', 'mine');
  run('../anim1/spec.mjs', cls);
  const spec = join(ROOT, 'docs/v5/pixellab/ANIM3', `${cls}.sheet.json`);
  run('../anim1/append.mjs', spec);
  const mirrored = Object.entries(JSON.parse(readFileSync(spec, 'utf8')).anims).filter(([, a]) => a.dirs['north-east'].attempt === 'nw').map(([n]) => n);
  if (mirrored.length) run('mirror.mjs', cls, 'north-west', 'north-east', ...mirrored);
  run('anchors.mjs', cls);
}
