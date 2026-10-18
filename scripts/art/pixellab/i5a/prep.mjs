// I5a: the first frames of a class's clips from its base rotations, and their upload refs.
// Usage: node scripts/art/pixellab/i5a/prep.mjs <class> [--spear 1|2|0] [--upload <url>] [--only name,name]
//   Writes docs/v5/pixellab/I5a/raw/<class>/first/{rot,tall,die,guard,guardflat}_<dir>.png
//     rot        the 68 rotation
//     tall       96 x 112, the rotation at 14,40 (a weapon raised overhead)
//     die        128 x 128, the rotation at 30,30 (room to lie down)
//     guard      128 x 112, the spear redrawn levelled (i5a/guard.mjs; --spear 2: a pair of javelins); 0: the rotation
//                padded the same way (a sword class)
//     guardflat  SE only: guard with the spear drawn flatter (--vec 1,0.22), the thrust's first frame (STYLE_LOCK §6)
//   With --upload (a get_upload_url URL) every file is uploaded and the refs merged into first/uploads.json.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const DIRS = ['south-east', 'north-east', 'south-west', 'north-west'];
const GUARD = { 'south-east': [16, 30], 'north-east': [8, 30], 'south-west': [52, 30], 'north-west': [40, 30] };
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const cls = args[0];
const raw = join(ROOT, 'docs/v5/pixellab/I5a/raw', cls);
const rotDir = join(raw, 'base/zip/Idle/rotations');
const first = join(raw, 'first');
mkdirSync(first, { recursive: true });
const spear = Number(opt('spear', 1));
const only = opt('only') ? opt('only').split(',') : null;
const node = (...a) => execFileSync('node', a, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
const files = [];
for (const d of DIRS) {
  const rot = join(rotDir, `${d}.png`);
  const want = (n) => !only || only.includes(n);
  if (want('rot')) { node(join(HERE, '..', 'pad.mjs'), rot, join(first, `rot_${d}.png`), '68', '68', '0', '0'); files.push(`rot_${d}`); }
  if (want('tall')) { node(join(HERE, '..', 'pad.mjs'), rot, join(first, `tall_${d}.png`), '96', '112', '14', '40'); files.push(`tall_${d}`); }
  if (want('die')) { node(join(HERE, '..', 'pad.mjs'), rot, join(first, `die_${d}.png`), '128', '128', '30', '30'); files.push(`die_${d}`); }
  if (want('guard')) {
    // SE: the grip moved back (head 52 px ahead of the fist, butt 10 behind) so the leaf clears the shield rim and leads
    // visibly (main's review of royal_guard: with 38 / 20 the long butt up-left read as the point)
    const se = d === 'south-east' ? ['--ahead', '52', '--behind', '10'] : [];
    if (spear) console.log(node(join(HERE, 'guard.mjs'), rot, join(first, `guard_${d}.png`), '--facing', d, '--count', String(spear), ...se).split('\n').at(-1));
    else node(join(HERE, '..', 'pad.mjs'), rot, join(first, `guard_${d}.png`), '128', '112', ...GUARD[d].map(String));
    files.push(`guard_${d}`);
  }
  if (spear && d === 'south-east' && want('guardflat')) {
    console.log(node(join(HERE, 'guard.mjs'), rot, join(first, `guardflat_${d}.png`), '--facing', d, '--count', String(spear), '--vec', '1,0.22', '--ahead', '52', '--behind', '10').split('\n').at(-1));
    files.push(`guardflat_${d}`);
  }
}
const url = opt('upload');
if (url) {
  const upPath = join(first, 'uploads.json');
  const refs = existsSync(upPath) ? JSON.parse(readFileSync(upPath, 'utf8')) : {};
  for (const f of files) {
    const res = JSON.parse(execFileSync('curl', ['-sS', '-F', `file=@${join(first, f + '.png')}`, url]).toString());
    refs[f] = res.ref;
  }
  writeFileSync(upPath, JSON.stringify(refs, null, 1));
  console.log(JSON.stringify(refs));
}
