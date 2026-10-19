// ANIM-1: first frames of a class's new clips from its base rotations (fetch.mjs <id> docs/v5/pixellab/ANIM1/raw/<class>/base),
// and their upload refs.
// Usage: node scripts/art/pixellab/anim1/prep.mjs <class> [--upload <get_upload_url URL>]
//   Writes docs/v5/pixellab/ANIM1/raw/<class>/first/{rot,tall}_<dir>.png
//     rot   the 68 rotation (breathe, shift)
//     tall  96 x 112, the rotation at 14,40 (build: the mallet overhead; carry: the log on the shoulder)
//   With --upload every file is uploaded and the refs merged into first/uploads.json.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank, paste } from '../../lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const DIRS = ['south-east', 'north-east', 'south-west', 'north-west'];
const args = process.argv.slice(2);
const cls = args[0];
const raw = join(ROOT, 'docs/v5/pixellab', process.env.ROUND ?? 'ANIM1', 'raw', cls);
const first = join(raw, 'first');
mkdirSync(first, { recursive: true });
const files = [];
for (const d of DIRS) {
  const rot = readImage(join(raw, 'base/zip/Idle/rotations', `${d}.png`));
  writeImage(join(first, `rot_${d}.png`), rot);
  const tall = blank(96, 112);
  paste(tall, rot, 14, 40);
  writeImage(join(first, `tall_${d}.png`), tall);
  files.push(`rot_${d}`, `tall_${d}`);
}
const url = args.includes('--upload') ? args[args.indexOf('--upload') + 1] : null;
if (url) {
  const upPath = join(first, 'uploads.json');
  const refs = existsSync(upPath) ? JSON.parse(readFileSync(upPath, 'utf8')) : {};
  for (const f of files) refs[f] = JSON.parse(execFileSync('curl', ['-sS', '-F', `file=@${join(first, f + '.png')}`, url]).toString()).ref;
  writeFileSync(upPath, JSON.stringify(refs, null, 1));
  console.log(JSON.stringify(refs));
} else console.log(`${cls}: ${files.length} first frames -> ${first}`);
