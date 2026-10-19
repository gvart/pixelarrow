// ANIM-3: recolour the crimson props of work clips (logs, chips, stakes, mallets) to natural wood, in place in
// src/assets/sheets/<class>/. A sheet without a warm wood ramp (the hoplite) put them on the cloak ramp, so the
// tiers recoloured them with the cloak too. Per frame, the 8-connected components of cloak / crest / emblem colours
// are found; the body's (big, reaching above the hips) and shield emblems stay, the rest is wood. `force` boxes (frame px relative to
// the row anchor) turn any red inside to wood: a prop that touches the cloak (a carried log on the shoulder).
// Each red goes to the wood ramp step of nearest lightness.
// Usage: node scripts/art/pixellab/anim3/wood.mjs <class> <anim>[:<row>:<x0>,<y0>,<x1>,<y1>[:<from>-<to>]] ...
//   rows: se ne sw nw; e.g. carry:se:-40,-70,10,-40 (frames from-to inclusive, default all)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../lib/png.mjs';
import { hexToRgb, rgbToHex } from '../../lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const ROW = { se: 'south-east', ne: 'north-east', sw: 'south-west', nw: 'north-west' };
const [cls, ...args] = process.argv.slice(2);
const dir = join(ROOT, 'src/assets/sheets', cls);
const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const img = readImage(join(dir, m.image));
const FW = m.frame.w, FH = m.frame.h, wrap = m.wrap, R = m.rows.length;
const red = new Set(['cloak', 'crest', 'emblem'].flatMap((g) => m.colorGroups[g] ?? []));
const emblem = new Set(m.colorGroups.emblem ?? []);
const L = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// the brown steps of the wood group (its pale skin-like steps left out)
const WOOD = ['#241a11', '#30241b', '#463427', '#5e4633', '#7b5e45', '#977849'].filter((c) => m.colorGroups.wood?.includes(c));
if (WOOD.length < 4) throw new Error(`${cls}: no wood ramp`);
const reds = [...red].sort((a, b) => L(hexToRgb(a)) - L(hexToRgb(b)));
// rank-map the reds' lightness onto the wood ramp (crimson is darker than the wood, so a plain nearest-L squashes it)
const toWood = new Map(reds.map((c) => [c, hexToRgb(WOOD[Math.min(WOOD.length - 1, Math.round(((L(hexToRgb(c)) - L(hexToRgb(reds[0]))) / (L(hexToRgb(reds.at(-1))) - L(hexToRgb(reds[0])))) * (WOOD.length - 1)))])]));

const clips = new Map();
for (const a of args) {
  const [name, row, box, range] = a.split(':');
  if (!clips.has(name)) clips.set(name, []);
  if (row) clips.get(name).push({ row: ROW[row], box: box.split(',').map(Number), range: range ? range.split('-').map(Number) : null });
}
for (const [name, forces] of clips) {
  const a = m.anims[name];
  if (!a) throw new Error(`${cls}: no clip ${name}`);
  let n = 0;
  for (let r = 0; r < R; r++) for (let i = 0; i < a.frames; i++) {
    const col = a.col + i, x0 = (col % wrap) * FW, y0 = (Math.floor(col / wrap) * R + r) * FH;
    const at = (x, y) => ((y0 + y) * img.w + x0 + x) * 4;
    const hexAt = (x, y) => (img.data[at(x, y) + 3] ? rgbToHex([...img.data.subarray(at(x, y), at(x, y) + 3)]) : null);
    const anc = m.anchors[m.rows[r]];
    const lab = new Int32Array(FW * FH).fill(-1);
    const comps = [];
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      if (lab[y * FW + x] >= 0 || !red.has(hexAt(x, y))) continue;
      const c = { px: [], top: y }, st = [[x, y]];
      lab[y * FW + x] = comps.length;
      while (st.length) {
        const [px, py] = st.pop();
        c.px.push([px, py]); c.top = Math.min(c.top, py);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const qx = px + dx, qy = py + dy;
          if (qx < 0 || qy < 0 || qx >= FW || qy >= FH || lab[qy * FW + qx] >= 0 || !red.has(hexAt(qx, qy))) continue;
          lab[qy * FW + qx] = comps.length; st.push([qx, qy]);
        }
      }
      comps.push(c);
    }
    const forced = forces.filter((f) => f.row === m.rows[r] && (!f.range || (i >= f.range[0] && i <= f.range[1])));
    const inForce = (x, y) => forced.some(({ box: [bx0, by0, bx1, by1] }) => x - anc.x >= bx0 && x - anc.x <= bx1 && y - anc.y >= by0 && y - anc.y <= by1);
    for (const c of comps) {
      // the body's cloak and crest; a shield emblem (mostly emblem colours, off the ground) stays too
      const bottom = Math.max(...c.px.map(([, y]) => y));
      const body = (c.px.length >= 40 && c.top < anc.y - 22) || (bottom < anc.y - 15 && c.px.filter(([x, y]) => emblem.has(hexAt(x, y))).length >= 0.6 * c.px.length);
      for (const [x, y] of c.px) {
        if (body && !inForce(x, y)) continue;
        img.data.set(toWood.get(hexAt(x, y)), at(x, y));
        n++;
      }
    }
  }
  console.log(`${cls} ${name}: ${n} px to wood${forces.length ? ` (${forces.length} boxes)` : ''}`);
}
writeImage(join(dir, m.image), img);
