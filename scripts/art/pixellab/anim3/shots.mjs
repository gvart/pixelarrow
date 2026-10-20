// ANIM-3: the review shots of a class's work clips into <out>/<class>/: sheetgifs.mjs GIFs + strips of chop, mine,
// harvest and build only, and the carry-load preview (carrygif.mjs).
// Usage: node scripts/art/pixellab/anim3/shots.mjs <out dir> <class> [<class> ...]
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..', '..', '..');
const [out, ...classes] = process.argv.slice(2);
const WORK = /_(chop|mine|harvest|build)\.(gif|png)$/;
for (const cls of classes) {
  const dir = join(out, cls), tmp = mkdtempSync(join(tmpdir(), 'anim3-'));
  mkdirSync(dir, { recursive: true });
  execFileSync('node', [join(HERE, '..', 'sheetgifs.mjs'), join(ROOT, 'src/assets/sheets', cls, 'manifest.json'), tmp, '--strips'], { stdio: 'ignore' });
  for (const f of readdirSync(tmp)) if (WORK.test(f)) renameSync(join(tmp, f), join(dir, f));
  rmSync(tmp, { recursive: true, force: true });
  execFileSync('node', [join(HERE, 'carrygif.mjs'), dir, cls], { stdio: 'ignore' });
  console.log(`${cls}: ${readdirSync(dir).join(' ')}`);
}
