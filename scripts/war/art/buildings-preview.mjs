// Build-mode art preview (Buildings, PROMPTS_ART.md): contact sheet of public/war/buildings and 1:1 mock-ups on the
// global tiles with soldiers: a walled outpost (palisade, wood gate and towers; a stone wall with its gate and towers), a
// fort under construction (scaffold) with a squad, and bridges over a river. Usage: node scripts/war/art/buildings-preview.mjs [out dir]
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, crop, paste, resizeNearest } from '../../art/lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = process.argv[2] ?? '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/pixellab/buildings';
mkdirSync(OUT, { recursive: true });
const BD = join(ROOT, 'public/war/buildings'), TD = join(ROOT, 'public/war/tiles');
const B = JSON.parse(readFileSync(join(BD, 'objects.json'))), T = JSON.parse(readFileSync(join(TD, 'tiles.json')));
const BG = [22, 17, 13, 255];
const fill = (im, c = BG) => { for (let i = 0; i < im.w * im.h; i++) im.data.set(c, i * 4); return im; };
const spr = Object.fromEntries(B.objects.map((o) => [o.id, { ...o, im: readImage(join(BD, o.file)) }]));
const kit = Object.fromEntries(B.kits.map((k) => [k.id, { ...k, sheets: Object.fromEntries(Object.entries(k.states).map(([s, f]) => [s, readImage(join(BD, f))])) }]));
const frame = (k, s, n) => crop(kit[k].sheets[s], { x: n * kit[k].frame.w, y: 0, w: kit[k].frame.w, h: kit[k].frame.h });

// ---- contact sheet: kit sheets (x1) per state, then every sprite
{
  const rows = B.kits.flatMap((k) => Object.keys(k.states).map((s) => [k.id, s]));
  const objW = 2400, im = fill(blank(objW, rows.length * 230 + 3000)); let y = 4;
  for (const [id, s] of rows) { paste(im, kit[id].sheets[s], 4, y); y += kit[id].frame.h + 6; }
  let x = 4, rowH = 0; y += 10;
  for (const o of Object.values(spr)) { if (x + o.w > objW) { x = 4; y += rowH + 10; rowH = 0; } paste(im, o.im, x, y); x += o.w + 12; rowH = Math.max(rowH, o.h); }
  writeImage(join(OUT, 'BUILDINGS_contact.png'), crop(im, { x: 0, y: 0, w: objW, h: y + rowH + 6 }));
}

// ---- terrain: vertex terrain grid -> autotiled global sheets (grass / shallow / deep only, shores get shallow)
const sheet = (pair) => { const s = T.sheets.find((q) => q.pair === pair); const im = readImage(join(TD, s.file)); return [...Array(16)].map((_, m) => crop(im, { x: s.maskToFrame[m] * 64, y: 0, w: 64, h: 48 })); };
const GS = sheet('grass-shallow'), SD = sheet('shallow-deep');
function soldier(cls, row, col) {
  const dir = join(ROOT, 'src/assets/sheets', cls); if (!existsSync(dir)) return null;
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'))), sh = readImage(join(dir, m.image));
  const r = m.rows.indexOf(row), wrap = m.wrap ?? 1e9, band = Math.floor(col / wrap);
  const im = crop(sh, { x: (col % wrap) * m.frame.w, y: (band * m.rows.length + r) * m.frame.h, w: m.frame.w, h: m.frame.h });
  const a = m.anchors?.[row] ?? m.anchor; return { im, anchor: { x: a.x, y: a.y } };
}
// scene: n x n tiles; water(x, y) -> 0 land, 1 shallow, 2 deep per vertex; items: [{ kind: 'kit', id, state, n, x, y } |
// { kind: 'obj', id, x, y } (footprint NW tile) | { kind: 'unit', s, x, y } (tile coords, fractional)]
function scene(n, water, items, name) {
  const W = n * 64 + 64, H = n * 32 + 520, OX = n * 32 + 32, OY = 460, img = fill(blank(W, H));
  const sx = (x, y) => OX + (x - y) * 32, sy = (x, y) => OY + (x + y) * 16;
  const V = (x, y) => water(x, y);
  for (let d = 0; d <= 2 * (n - 1); d++) for (let x = 0; x < n; x++) {
    const y = d - x; if (y < 0 || y >= n) continue;
    const c = [V(x, y), V(x + 1, y), V(x, y + 1), V(x + 1, y + 1)];
    const deep = c.some((v) => v === 2), land = c.some((v) => v === 0);
    const bit = (v) => ((v[0] ? 1 : 0) << 3) | ((v[1] ? 1 : 0) << 2) | ((v[2] ? 1 : 0) << 1) | (v[3] ? 1 : 0);
    let t;
    if (deep && !land) t = SD[bit(c.map((v) => (v === 1 ? 1 : 0)))]; // shallow-deep: set bit = shallow
    else t = GS[bit(c.map((v) => (v === 0 ? 1 : 0)))]; // grass-shallow: set bit = grass
    paste(img, t, sx(x, y) - 32, sy(x, y));
  }
  // depth order: by the south vertex of the footprint (units by their tile position)
  const key = (it) => (it.kind === 'unit' ? it.x + it.y + 0.01 + (it.z ? 2.5 : 0) : it.kind === 'kit' ? it.x + it.y + 2 : it.x + it.y + spr[it.id].footprint[0] + spr[it.id].footprint[1] - 0.01);
  for (const it of [...items].sort((a, b) => key(a) - key(b))) {
    if (it.kind === 'kit') { const k = kit[it.id]; paste(img, frame(it.id, it.state, it.n), sx(it.x, it.y) - k.tileOrigin.x, sy(it.x, it.y) - k.tileOrigin.y); }
    else if (it.kind === 'obj') { const o = spr[it.id]; paste(img, o.im, sx(it.x, it.y) - o.tileOrigin.x, sy(it.x, it.y) - o.tileOrigin.y); }
    else if (it.s) paste(img, it.s.im, Math.round(sx(it.x, it.y) - it.s.anchor.x), Math.round(sy(it.x, it.y) - (it.z ?? 0) * 33 - it.s.anchor.y)); // z: standing on a deck
  }
  writeImage(join(OUT, `${name}.png`), crop(img, { x: 0, y: 200, w: W, h: H - 200 }));
  return img;
}
// wall line helper: tiles of a wall run and its neighbour masks
function walls(id, state, cells, solid) { // cells: set "x,y" of wall tiles; solid: extra "x,y" (gates/towers) that walls join
  const has = (x, y) => cells.has(`${x},${y}`) || solid.has(`${x},${y}`);
  return [...cells].map((c) => { const [x, y] = c.split(',').map(Number); const n = (has(x + 1, y) ? 1 : 0) | (has(x, y + 1) ? 2 : 0) | (has(x - 1, y) ? 4 : 0) | (has(x, y - 1) ? 8 : 0); return { kind: 'kit', id, state, n, x, y }; });
}
const hop = soldier('hoplite', 'south-east', 0), hop2 = soldier('hoplite', 'south-west', 40), arc = soldier('archer', 'south-east', 0);
const land = () => 0;

// 1) walled outpost: a palisade square with a wood gate and wood towers, a stone wall square with a stone gate and towers
{
  const items = [], cellsP = new Set(), solidP = new Set();
  const P0 = 3, P1 = 12; // palisade ring x, y in [3, 12]
  for (let t = P0; t <= P1; t++) for (const c of [[t, P0], [t, P1], [P0, t], [P1, t]]) cellsP.add(c.join(','));
  for (const c of [[P0, P0], [P1, P0], [P0, P1], [P1, P1]]) { cellsP.delete(c.join(',')); solidP.add(c.join(',')); items.push({ kind: 'obj', id: 'wood-tower-done', x: c[0], y: c[1] }); }
  for (const x of [7, 8, 9]) { cellsP.delete(`${x},${P1}`); solidP.add(`${x},${P1}`); } items.push({ kind: 'obj', id: 'wood-gate-x-done', x: 7, y: P1 });
  for (const y of [6, 7, 8]) { cellsP.delete(`${P0},${y}`); solidP.add(`${P0},${y}`); } items.push({ kind: 'obj', id: 'wood-gate-y-done', x: P0, y: 6 });
  items.push(...walls('palisade', 'done', cellsP, solidP));
  items.push({ kind: 'obj', id: 'outpost-done', x: 8, y: 5 }, { kind: 'obj', id: 'camp-done', x: 4, y: 7 }, { kind: 'obj', id: 'storehouse-done', x: 8, y: 8 }, { kind: 'obj', id: 'lumber-pile-done', x: 5, y: 5 });
  // stone ring to the east (clear of the palisade front): x in [21, 31], y in [3, 13], corner towers, a gate in the +y side and in the +x side
  const cellsS = new Set(), solidS = new Set(), S0x = 21, S1x = 31, S0y = 3, S1y = 13;
  for (let x = S0x; x <= S1x; x++) { cellsS.add(`${x},${S0y}`); cellsS.add(`${x},${S1y}`); }
  for (let y = S0y; y <= S1y; y++) { cellsS.add(`${S0x},${y}`); cellsS.add(`${S1x},${y}`); }
  const blockS = (cx, cy) => { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { cellsS.delete(`${cx + dx},${cy + dy}`); solidS.add(`${cx + dx},${cy + dy}`); } };
  for (const [cx, cy] of [[S0x, S0y], [S1x, S0y], [S0x, S1y], [S1x, S1y]]) { blockS(cx, cy); items.push({ kind: 'obj', id: 'stone-tower-done', x: cx - 1, y: cy - 1 }); }
  blockS(26, S1y); items.push({ kind: 'obj', id: 'stone-gate-x-done', x: 25, y: S1y - 1 });
  blockS(S1x, 8); items.push({ kind: 'obj', id: 'stone-gate-y-done', x: S1x - 1, y: 7 });
  items.push(...walls('stone-wall', 'done', cellsS, solidS));
  items.push({ kind: 'obj', id: 'barracks-done', x: 23, y: 5 }, { kind: 'obj', id: 'olive-press-done', x: 27, y: 5 }, { kind: 'obj', id: 'farm-done', x: 23, y: 8 });
  for (let i = 0; i < 6; i++) items.push({ kind: 'unit', s: i % 2 ? hop2 : hop, x: 7.6 + i * 0.6, y: P1 + 2.2 + (i % 2) * 0.5 }, { kind: 'unit', s: arc, x: 25 + i * 0.5, y: S1y + 2.6 });
  scene(36, land, items, 'BUILDINGS_outpost_1x');
}

// 2) fort under construction (scaffold) with a building squad, a foundation and a finished wall stub
{
  const items = [{ kind: 'obj', id: 'fort-scaffold', x: 3, y: 3 }, { kind: 'obj', id: 'stone-pile-done', x: 14, y: 6 }, { kind: 'obj', id: 'lumber-pile-done', x: 14, y: 8 }, { kind: 'obj', id: 'lumber-pile-done', x: 7, y: 15 }, { kind: 'obj', id: 'storehouse-foundation', x: 15, y: 11 }, { kind: 'obj', id: 'camp-done', x: 4, y: 16 }];
  const run = new Set(), none = new Set(); for (let x = 13; x <= 19; x++) run.add(`${x},3`);
  items.push(...walls('stone-wall', 'scaffold', run, none).map((w) => (+w.x > 16 ? { ...w, state: 'foundation' } : w)));
  for (let i = 0; i < 10; i++) items.push({ kind: 'unit', s: i % 3 ? hop : hop2, x: 13.3 + (i % 5) * 0.55, y: 9 + Math.floor(i / 5) * 0.6 });
  for (let i = 0; i < 4; i++) items.push({ kind: 'unit', s: hop2, x: 9 + i * 0.6, y: 14.2 });
  scene(22, land, items, 'BUILDINGS_fort_scaffold_1x');
}

// 3) bridges over a river: a stone bridge along x and a wooden one along y; deep water 8 tiles bank to bank
{
  const n = 26, river = (x, y) => { const c = 12 + Math.round(1.2 * Math.sin(y / 5)); const d = Math.abs(x - c); return d <= 3 ? 2 : d <= 4 ? 1 : 0; };
  const items = [], yb = 6;
  const c0 = 12 + Math.round(1.2 * Math.sin(yb / 5));
  for (let x = c0 - 5; x <= c0 + 4; x++) items.push({ kind: 'kit', id: 'bridge-stone', state: 'done', n: x === c0 - 5 ? 2 : x === c0 + 4 ? 3 : 0, x, y: yb });
  const yw = 17, c1 = 12 + Math.round(1.2 * Math.sin(yw / 5));
  for (let x = c1 - 5; x <= c1 + 4; x++) items.push({ kind: 'kit', id: 'bridge-wood', state: x > c1 + 1 ? 'scaffold' : 'done', n: x === c1 - 5 ? 2 : x === c1 + 4 ? 3 : 0, x, y: yw });
  // a wooden bridge along y over a pond (one span burnt)
  for (let i = 0; i < 7; i++) items.push({ kind: 'kit', id: 'bridge-wood', state: i === 3 ? 'damaged' : 'done', n: i === 0 ? 4 : i === 6 ? 5 : 1, x: 21, y: 8 + i });
  for (let i = 0; i < 6; i++) items.push({ kind: 'unit', s: i % 2 ? hop : hop2, x: c0 - 1 + i * 0.5, y: yb + 0.45, z: 2.5 });
  items.push({ kind: 'unit', s: arc, x: c1 - 2.5, y: yw + 0.5, z: 2 }, { kind: 'unit', s: hop, x: c1 - 1.5, y: yw + 0.5, z: 2 });
  scene(n, (x, y) => Math.max(river(x, y), x >= 18 && x <= 24 && y >= 9 && y <= 14 ? (x >= 19 && x <= 23 && y >= 10 && y <= 13 ? 2 : 1) : 0), items, 'BUILDINGS_bridges_1x');
}
// 4) seam check at 3x: straight runs and corners of every wall state, on both axes
{
  const im = fill(blank(4 * 300, 4 * 330));
  ['palisade', 'stone-wall'].forEach((id, r) => ['foundation', 'scaffold', 'done', 'damaged'].forEach((s, c) => {
    const ox = c * 300 + 150, oy = r * 600 + 230, k = kit[id];
    const cells = new Set(['0,0', '1,0', '2,0', '3,0', '0,1', '0,2', '0,3', '3,1', '3,2']);
    for (const w of walls(id, s, cells, new Set()).sort((a, b) => a.x + a.y - b.x - b.y)) paste(im, frame(id, s, w.n), ox + (w.x - w.y) * 32 - k.tileOrigin.x, oy + (w.x + w.y) * 16 - k.tileOrigin.y);
  }));
  writeImage(join(OUT, 'BUILDINGS_seams_3x.png'), resizeNearest(im, im.w * 3 / 2, im.h * 3 / 2));
}
console.log('buildings preview ->', OUT);
