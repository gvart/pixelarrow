// Scale lineup: the militia and every mob's idle frame 0, feet on one line, one row per facing.
// Usage: node scripts/art/pixellab/mobs/lineup.mjs <out.png> <class> [<class> ...]
import { readFileSync } from 'node:fs';
import { readImage, writeImage } from '../../lib/png.mjs';
import { alphaBox, blank, crop } from '../../lib/ops.mjs';
import { blit } from '../sheet.mjs';

const [out, ...classes] = process.argv.slice(2);
const SHEETS = new URL('../../../../src/assets/sheets/', import.meta.url).pathname;
const sheets = ['militia', ...classes].map((c) => {
  const m = JSON.parse(readFileSync(`${SHEETS}${c}/manifest.json`, 'utf8'));
  return { m, img: readImage(`${SHEETS}${c}/${m.image}`) };
});
const K = 4, BASE = 70, ROW = 80;
const rows = ['south-west', 'north-east'];
const img = blank(sheets.length * 70 * K, rows.length * ROW * K);
for (let i = 0; i < img.data.length; i += 4) img.data.set([0x8f, 0x8a, 0x42, 255], i);
rows.forEach((dir, ri) => {
  let x = 6;
  for (const { m, img: s } of sheets) {
    const r = m.rows.indexOf(dir);
    const f = crop(s, { x: 0, y: r * m.frame.h, w: m.frame.w, h: m.frame.h });
    const b = alphaBox(f);
    const a = m.anchors?.[dir] ?? m.anchor;
    blit(img, crop(f, b), (x) * K, (ri * ROW + BASE - (a.y - b.y)) * K, K);
    x += b.w + 8;
  }
});
writeImage(out, img);
