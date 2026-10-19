// Contact sheet and GIFs of mob sheets beside the militia (same art scale, feet on one line) for review.
// Usage: node scripts/art/pixellab/mobs/contact.mjs <out dir> <class> [<class> ...]
// Writes <out>/contact.png (per mob, per facing: the militia, then every clip's frames) and
// <out>/<class>_<facing>.gif for south-west and north-east (the militia, then each clip looping on its own).
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank, crop } from '../../lib/ops.mjs';
import { blit, text } from '../sheet.mjs';
import { writeGif } from '../gif.mjs';

const [out, ...classes] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const SHEETS = new URL('../../../../src/assets/sheets/', import.meta.url).pathname;
const load = (cls) => {
  const m = JSON.parse(readFileSync(join(SHEETS, cls, 'manifest.json'), 'utf8'));
  return { m, img: readImage(join(SHEETS, cls, m.image)) };
};
const frameOf = ({ m, img }, col, row) => {
  const wrap = m.wrap ?? 1e9;
  const band = Math.floor(col / wrap);
  return crop(img, { x: (col % wrap) * m.frame.w, y: (band * m.rows.length + row) * m.frame.h, w: m.frame.w, h: m.frame.h });
};
// a frame on a common cell: feet (row anchor) at (cx, base)
const CELL_W = 128, BASE = 120;
const place = (s, f, row) => {
  const a = s.m.anchors?.[s.m.rows[row]] ?? s.m.anchor;
  const c = blank(CELL_W, BASE + 8);
  blit(c, f, Math.round(CELL_W / 2 - a.x), BASE - a.y, 1);
  return c;
};
const trimCells = (cells) => {
  // common trim of a clip's cells so GIF cells stay feet-aligned
  let x0 = 1e9, y0 = 1e9, x1 = 0, y1 = 0;
  for (const c of cells) for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.data[(y * c.w + x) * 4 + 3]) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
  }
  return cells.map((c) => crop(c, { x: x0 - 1, y: y0 - 1, w: x1 - x0 + 2, h: BASE + 2 - (y0 - 1) }));
};

const militia = load('militia');
const mobs = classes.map((c) => ({ cls: c, s: load(c) }));
const K = 3, GAP = 4;
const rowsOut = [];
for (const { cls, s } of mobs) {
  rowsOut.push({ label: cls.toUpperCase() });
  s.m.rows.forEach((dir, r) => {
    const mr = militia.m.rows.indexOf(dir);
    const cells = [trimCells([place(militia, frameOf(militia, 0, mr), mr)])[0]];
    for (const [name, a] of Object.entries(s.m.anims)) {
      const fs = trimCells(Array.from({ length: a.frames }, (_, i) => place(s, frameOf(s, a.col + i, r), r)));
      cells.push(...fs, null);
    }
    rowsOut.push({ label: dir.toUpperCase(), cells });
  });
}
const W = Math.max(...rowsOut.map((r) => (r.cells ?? []).reduce((t, c) => t + (c ? c.w : GAP * 2) + GAP, GAP)));
const H = rowsOut.reduce((t, r) => t + (r.cells ? Math.max(...r.cells.filter(Boolean).map((c) => c.h)) + GAP : 10), 0);
const sheet = blank(W * K, H * K);
for (let i = 0; i < sheet.w * sheet.h; i++) sheet.data.set([0x8f, 0x8a, 0x42, 255], i * 4);
let y = 0;
for (const r of rowsOut) {
  if (!r.cells) {
    text(sheet, r.label, 2 * K, (y + 2) * K, K, [0x2b, 0x1d, 0x1a]);
    y += 10;
    continue;
  }
  const h = Math.max(...r.cells.filter(Boolean).map((c) => c.h));
  let x = GAP;
  for (const c of r.cells) {
    if (!c) { x += GAP * 2; continue; }
    blit(sheet, c, x * K, (y + h - c.h) * K, K);
    x += c.w + GAP;
  }
  y += h + GAP;
}
writeImage(join(out, 'contact.png'), sheet);

for (const { cls, s } of mobs) {
  for (const dir of ['south-west', 'north-east']) {
    const r = s.m.rows.indexOf(dir);
    const mr = militia.m.rows.indexOf(dir);
    const clips = [trimCells(Array.from({ length: 12 }, (_, i) => place(militia, frameOf(militia, i, mr), mr)))];
    for (const a of Object.values(s.m.anims)) clips.push(trimCells(Array.from({ length: a.frames }, (_, i) => place(s, frameOf(s, a.col + i, r), r))));
    writeGif(join(out, `${cls}_${dir}.gif`), clips, { fps: 10, scale: 4 });
  }
}
console.log(`${out}/contact.png and ${mobs.length * 2} gifs`);
