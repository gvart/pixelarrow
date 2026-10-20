// Mock-ups of the landmark structures (ART-L): every landmark composed from its layout (public/war/landmarks/landmarks.json)
// in its four states side by side (intact, damaged, ruined, restored), true scale on a dark ground, a hoplite (H4 sheet,
// idle SE, 1:1 = the same 33 px/m) by the main gate for scale. Also a contact sheet of every piece in every state.
// Usage: node scripts/war/art/landmarks-preview.mjs [out dir]   (default shots/war/landmarks in the main checkout)
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, crop, paste, resizeNearest } from '../../art/lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUTD = process.argv[2] ?? '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/landmarks';
mkdirSync(OUTD, { recursive: true });
const LD = join(ROOT, 'public/war/landmarks'), L = JSON.parse(readFileSync(join(LD, 'landmarks.json')));
const B = JSON.parse(readFileSync(join(ROOT, 'public/war/buildings/objects.json'))), E = JSON.parse(readFileSync(join(ROOT, 'public/war/biomes/elaia/objects.json'))), GO = JSON.parse(readFileSync(join(ROOT, 'public/war/objects/objects.json')));
const obj = new Map(L.objects.map((o) => [o.id, o])), piece = new Map(L.pieces.map((p) => [p.id, p])), cache = new Map();
const img = (f) => { if (!cache.has(f)) cache.set(f, readImage(f)); return cache.get(f); };
// the hoplite: idle SE frame 0
const HM = JSON.parse(readFileSync(join(ROOT, 'src/assets/sheets/hoplite/manifest.json'))), HS = readImage(join(ROOT, 'src/assets/sheets/hoplite', HM.image));
const hop = crop(HS, { x: 0, y: 0, w: HM.frame.w, h: HM.frame.h }), hopA = HM.anchors?.['south-east'] ?? HM.anchor;
// sprite + where to put it: { im, ox, oy } with (ox, oy) = px of the footprint's north tile top vertex in the image
function spriteOf(id, st) {
  if (id.startsWith('@')) {
    const n = id.slice(1), bs = B.buildings.find((b) => b.id === n);
    if (bs) { const sid = bs.states[st === 'damaged' || st === 'ruined' ? 'damaged' : 'done'], o = B.objects.find((q) => q.id === sid); return { im: img(join(ROOT, 'public/war/buildings', o.file)), ox: o.tileOrigin.x, oy: o.tileOrigin.y, fp: o.footprint }; }
    const t = E.objects.find((q) => q.id === `town-${n}`); // town pieces: anchor = the footprint's south vertex
    if (t) { const [fw, fh] = t.footprint; return { im: img(join(ROOT, 'public/war/biomes/elaia', t.file)), ox: t.anchor.x - (fw - fh) * 32, oy: t.anchor.y - (fw + fh) * 16, fp: t.footprint }; }
    const g = GO.objects.find((q) => q.id === n); if (g) return { im: img(join(ROOT, 'public/war/objects', g.file)), ox: g.anchor.x, oy: g.anchor.y - 16, fp: [1, 1] };
    throw new Error(`no sprite ${id}`);
  }
  const o = obj.get(piece.get(id).states[st]); return { im: img(join(LD, o.file)), ox: o.tileOrigin.x, oy: o.tileOrigin.y, fp: o.footprint };
}
const GROUND = [[34, 31, 27], [38, 34, 29], [42, 37, 31]], WATER = [[22, 33, 38], [25, 37, 42], [28, 41, 46]];
function compose(lm, st) {
  const [SW, SH] = lm.size, M = 3, W = (SW + SH + 2 * M) * 32, top = 420, H = top + (SW + SH + 2 * M) * 16 + 20, im = blank(W, H);
  const OX = (SH + M) * 32, OY = top; // screen px of tile (-M, -M)'s top vertex shifted: tile (x, y) top vertex at OX + (x - y) * 32, OY + (x + y + 2 M) * 16
  const sx = (x, y) => OX + (x - y) * 32, sy = (x, y) => OY + (x + y + 2 * M) * 16;
  for (let ty = -M; ty < SH + M; ty++) for (let tx = -M; tx < SW + M; tx++) { // ground diamonds
    const cx = sx(tx, ty), cy = sy(tx, ty), C = (lm.water ? WATER : GROUND)[((tx * 7 + ty * 13) % 3 + 3) % 3];
    for (let dy = 0; dy < 32; dy++) for (let dx = -32; dx < 32; dx++) if (Math.abs(dx + 0.5) / 32 + Math.abs(dy + 0.5 - 16) / 16 <= 1) { const X = cx + dx, Y = cy + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) im.data.set([...C, 255], (Y * W + X) * 4); }
  }
  const items = lm.pieces.map(([id, x, y]) => ({ id, x, y, s: spriteOf(id, st) }));
  if (lm.labyrinth && L.kits.length) { const k = L.kits.find((q) => q.id === lm.kit), S = new Set(lm.labyrinth.map(([x, y]) => `${x},${y}`)), has = (x, y) => S.has(`${x},${y}`), sheet = img(join(LD, k.states[st])); for (const [x, y] of lm.labyrinth) { const m = (has(x + 1, y) ? 1 : 0) | (has(x, y + 1) ? 2 : 0) | (has(x - 1, y) ? 4 : 0) | (has(x, y - 1) ? 8 : 0); items.push({ id: 'lab', x, y, s: { im: crop(sheet, { x: m * k.frame.w, y: 0, w: k.frame.w, h: k.frame.h }), ox: k.tileOrigin.x, oy: k.tileOrigin.y, fp: [1, 1] } }); } }
  const gate = items.find((q) => /gate/.test(q.id)) ?? items[0];
  items.push({ id: 'hoplite', x: gate.x + gate.s.fp[0] / 2, y: gate.y + gate.s.fp[1] + 0.6, s: { im: hop, ox: hopA.x, oy: hopA.y - 16, fp: [0, 0] } });
  items.sort((a, b) => a.x + a.s.fp[0] + a.y + a.s.fp[1] - (b.x + b.s.fp[0] + b.y + b.s.fp[1]) || a.x - b.x);
  for (const q of items) paste(im, q.s.im, Math.round(sx(q.x, q.y) - q.s.ox), Math.round(sy(q.x, q.y) - q.s.oy));
  return im;
}
function row(ims, gap = 12, bg = [16, 14, 12]) {
  const W = ims.reduce((s, i) => s + i.w, 0) + gap * (ims.length + 1), H = Math.max(...ims.map((i) => i.h)) + 2 * gap, out = blank(W, H);
  for (let i = 0; i < W * H; i++) out.data.set([...bg, 255], i * 4);
  let x = gap; for (const i of ims) { paste(out, i, x, gap + H - 2 * gap - i.h); x += i.w + gap; }
  return out;
}
const col = (ims, gap = 12) => { const W = Math.max(...ims.map((i) => i.w)), H = ims.reduce((s, i) => s + i.h, 0), out = blank(W, H); for (let i = 0; i < W * H; i++) out.data.set([16, 14, 12, 255], i * 4); let y = 0; for (const i of ims) { paste(out, i, 0, y); y += i.h; } return out; };
for (const lm of L.landmarks) {
  const panels = L.states.map((st) => compose(lm, st));
  writeImage(join(OUTD, `LANDMARK_${lm.id}_states_1x.png`), row(panels));
  writeImage(join(OUTD, `LANDMARK_${lm.id}_intact_2x.png`), resizeNearest(panels[0], panels[0].w * 2, panels[0].h * 2));
}
// every piece in every state (rows = pieces, columns = states)
const rows = L.pieces.map((p) => row(L.states.map((s) => img(join(LD, obj.get(p.states[s]).file))), 8));
for (let i = 0; i < rows.length; i += 12) writeImage(join(OUTD, `LANDMARK_pieces_${String(i / 12 + 1).padStart(2, '0')}.png`), col(rows.slice(i, i + 12)));
console.log(`landmark mock-ups -> ${OUTD} (${L.landmarks.length} landmarks x ${L.states.length} states, ${L.pieces.length} pieces)`);
