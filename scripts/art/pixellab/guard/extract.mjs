// Guardians (ART-L): one frame per row of a shipped sheet, cropped round its anchor, as <facing>.png (a re-dress base).
// Usage: node scripts/art/pixellab/guard/extract.mjs <class> <anim> <frame> <w> <h> <feetY> <out dir>
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank, crop, paste } from '../../lib/ops.mjs';

const [cls, anim, fi, W, H, FY, out] = process.argv.slice(2);
const dir = `src/assets/sheets/${cls}`;
const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const img = readImage(join(dir, m.image));
const col = m.anims[anim].col + Number(fi);
mkdirSync(out, { recursive: true });
m.rows.forEach((r, ri) => {
  const band = m.wrap ? Math.floor(col / m.wrap) : 0;
  const x = (m.wrap ? col % m.wrap : col) * m.frame.w;
  const y = (band * m.rows.length + ri) * m.frame.h;
  const fr = crop(img, { x, y, w: m.frame.w, h: m.frame.h });
  const an = m.anchors?.[r] ?? m.anchor;
  const c = blank(+W, +H);
  paste(c, fr, Math.round(+W / 2 - an.x), +FY - an.y);
  writeImage(join(out, `${r}.png`), c);
});
