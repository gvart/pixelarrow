// Drawn size of each mob sheet beside the militia: idle frame 0's opaque box per facing (px at sheet scale), as metres
// at 33 px/m, so view scales can be set to real shoulder heights and lengths.
// Usage: node scripts/art/pixellab/mobs/sizes.mjs [<class> ...]   (default: militia and every mob_ sheet)
import { readFileSync, readdirSync } from 'node:fs';
import { readImage } from '../../lib/png.mjs';
import { alphaBox, crop } from '../../lib/ops.mjs';

const SHEETS = new URL('../../../../src/assets/sheets/', import.meta.url).pathname;
const PX_M = 33;
const classes = process.argv.length > 2 ? process.argv.slice(2) : ['militia', ...readdirSync(SHEETS).filter((c) => c.startsWith('mob_'))];
for (const c of classes) {
  const m = JSON.parse(readFileSync(`${SHEETS}${c}/manifest.json`, 'utf8'));
  const img = readImage(`${SHEETS}${c}/${m.image}`), k = (m.scale ?? 0.55) / 0.55, col = m.anims.idle.col;
  const out = [];
  for (const dir of ['south-west', 'north-west']) {
    const row = m.rows.indexOf(dir);
    const b = alphaBox(crop(img, { x: col * m.frame.w, y: row * m.frame.h, w: m.frame.w, h: m.frame.h }));
    if (!b) continue;
    out.push(`${dir.padEnd(10)} ${String(Math.round(b.w * k)).padStart(4)}x${String(Math.round(b.h * k)).padEnd(4)} (${((b.w * k) / PX_M).toFixed(1)} x ${((b.h * k) / PX_M).toFixed(1)} m)`);
  }
  console.log(c.padEnd(22), `x${k.toFixed(2)}`, out.join('   '));
}
