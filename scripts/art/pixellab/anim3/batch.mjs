// ANIM-3: the pixminimax calls of one wave, one JSON line each (class, anim, dir + the tool's fields), from the
// anim1/prompts.mjs wordings and the tall first frames uploaded by `ROUND=ANIM3 anim1/prep.mjs <class> --upload`.
// North-east work clips (not haul) get AWAY=short: the back facing turned round in ANIM-2. Logs and mallets are
// named pale grey-brown (ANIM-2's came out crimson).
// Usage: node scripts/art/pixellab/anim3/batch.mjs <anim,...> <class,...> [dir,...]
//   anim: chop | mine | harvest | mallet (build) | haul (carry); haul is SHORT (a log no longer than he is tall)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const [anims, classes, dirs = 'south-east,north-east,south-west,north-west'] = process.argv.slice(2);
process.env.SHORT = '1';
const { promptOf } = await import('../anim1/prompts.mjs');
for (const cls of classes.split(',')) {
  const refs = JSON.parse(readFileSync(join(ROOT, 'docs/v5/pixellab/ANIM3/raw', cls, 'first/uploads.json'), 'utf8'));
  for (const anim of anims.split(',')) for (const dir of dirs.split(',')) {
    if (dir === 'north-east') process.env.AWAY = 'short'; else delete process.env.AWAY;
    const p = promptOf(cls, anim, dir);
    // the ANIM-2 logs and mallets came out crimson (the dark warm palette): name a pale natural wood
    p.description = p.description.replace('short rough log', 'short rough pale grey-brown log').replace('long rough wooden log', 'long rough pale grey-brown wooden log').replace('short wooden mallet', 'short pale grey-brown wooden mallet');
    if (p.description.length > 1000) throw new Error(`${cls} ${anim} ${dir}: ${p.description.length} characters`);
    console.log(JSON.stringify({ cls, anim, dir, first_frame_url: refs[`tall_${dir}`], frame_count: 12, no_background: true, ...p }));
  }
}
