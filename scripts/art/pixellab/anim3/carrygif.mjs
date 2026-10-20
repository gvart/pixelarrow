// ANIM-3: preview of the carry overlay as the game draws it: the class's carry body (manifest `loads.clip`) with each
// load sprite on its per-frame anchor (over the body, or under it for a chest load in the north facings). One GIF per
// class (rows: loads, columns: the 4 facings) and a strip PNG of frame 0.
// Usage: node scripts/art/pixellab/anim3/carrygif.mjs <out dir> <class> [<class> ...]
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../lib/png.mjs';
import { crop, blank } from '../../lib/ops.mjs';
import { writeGif } from '../gif.mjs';
import { buildSheet } from '../sheet.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const [out, ...classes] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const lm = JSON.parse(readFileSync(join(ROOT, 'src/assets/loads/manifest.json'), 'utf8'));
const limg = readImage(join(ROOT, 'src/assets/loads', lm.image));
const over = (dst, src, x0, y0) => {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const s = (y * src.w + x) * 4, dx = x0 + x, dy = y0 + y;
    if (!src.data[s + 3] || dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue;
    dst.data.set(src.data.subarray(s, s + 4), (dy * dst.w + dx) * 4);
  }
};
for (const cls of classes) {
  const dir = join(ROOT, 'src/assets/sheets', cls), m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const img = readImage(join(dir, m.image)), FW = m.frame.w, FH = m.frame.h, R = m.rows.length, a = m.anims[m.loads.clip];
  const frame = (r, i, load) => {
    const col = a.col + i, body = crop(img, { x: (col % m.wrap) * FW, y: (Math.floor(col / m.wrap) * R + r) * FH, w: FW, h: FH });
    const f = lm.frames[load], row = m.rows[r], [dx, dy] = m.loads[f.at][row][i], anc = m.anchors[row];
    const sp = crop(limg, { x: f.x, y: f.y, w: f.w, h: f.h }), x0 = anc.x + dx - f.ox, y0 = anc.y + dy - f.oy;
    if (f.at === 'chest' && row.startsWith('north')) { const o = blank(FW, FH); over(o, sp, x0, y0); over(o, body, 0, 0); return o; }
    over(body, sp, x0, y0);
    return body;
  };
  const loads = Object.keys(lm.frames);
  // a GIF frame: the loads stacked, each a row of the 4 facings
  const clips = m.rows.map((_, r) => Array.from({ length: a.frames }, (_, i) => {
    const o = blank(FW, FH * loads.length);
    loads.forEach((l, k) => over(o, frame(r, i, l), 0, k * FH));
    return o;
  }));
  writeGif(join(out, `${cls}_carry_loads.gif`), clips, { fps: a.fps, scale: 3 });
  writeImage(join(out, `${cls}_carry_loads.png`), buildSheet(loads.map((l) => ({ label: `${l}`, imgs: m.rows.flatMap((_, r) => [0, 4, 8].map((i) => frame(r, i, l))) })), { scale: 2 }));
  console.log(`${cls}: ${loads.length} loads x ${R} facings`);
}
