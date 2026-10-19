// Build-mode art preview (Buildings, PROMPTS_ART.md): contact sheet of public/war/buildings and 1:1 mock-ups on the
// global tiles with soldiers: walled outposts (a cyclopean ring with its Lion Gate open; a palisade ring), the Greek fort
// in four states with squads, every piece's construction order (greek/), and bridges over a river. Usage: node scripts/war/art/buildings-preview.mjs [out dir]
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

// a wall ring [x0, x1] x [y0, y1] with 2 x 2 corner towers (their NW tile on the ring corner, so they stand out to +x/+y
// at the far corners: placed so they cover the corner tile) and gates: [{ id, x, y, fw, fh }]; returns kit + obj items
function ring(kitId, state, x0, x1, y0, y1, towerId, gates, extra = []) {
  const cells = new Set(), solid = new Set(), items = [], K = (x, y) => `${x},${y}`;
  for (let x = x0; x <= x1; x++) { cells.add(K(x, y0)); cells.add(K(x, y1)); }
  for (let y = y0; y <= y1; y++) { cells.add(K(x0, y)); cells.add(K(x1, y)); }
  const block = (x, y, fw, fh) => { for (let i = 0; i < fw; i++) for (let j = 0; j < fh; j++) { cells.delete(K(x + i, y + j)); solid.add(K(x + i, y + j)); } };
  for (const [x, y] of [[x0 - 1, y0 - 1], [x1, y0 - 1], [x0 - 1, y1], [x1, y1]]) { block(x, y, 2, 2); items.push({ kind: 'obj', id: `${towerId}-${state}`, x, y }); }
  for (const g of gates) { block(g.x, g.y, g.fw, g.fh); items.push({ kind: 'obj', id: g.id, x: g.x, y: g.y }); }
  for (const e of extra) { block(e.x, e.y, e.fw, e.fh); items.push({ kind: 'obj', id: e.id, x: e.x, y: e.y }); }
  items.push(...walls(kitId, state, cells, solid));
  return items;
}
const squad = (s, x, y, n, cols = 5, dx = 0.55, dy = 0.55) => [...Array(n)].map((_, i) => ({ kind: 'unit', s: Array.isArray(s) ? s[i % s.length] : s, x: x + (i % cols) * dx, y: y + Math.floor(i / cols) * dy }));
const GREEK = join(OUT, 'greek'); mkdirSync(GREEK, { recursive: true });

// 1) walled outposts: a cyclopean ring with square towers and the Lion Gate open (a squad marching in), the outpost and a
// storehouse inside; a palisade ring with wood towers and its gate open
{
  const items = [];
  items.push(...ring('stone-wall', 'done', 20, 29, 4, 13, 'stone-tower', [{ id: 'stone-gate-x-open', x: 24, y: 13, fw: 2, fh: 1 }, { id: 'stone-gate-y-done', x: 29, y: 8, fw: 1, fh: 2 }]));
  items.push({ kind: 'obj', id: 'outpost-done', x: 23, y: 7 }, { kind: 'obj', id: 'storehouse-done', x: 26, y: 6 }, { kind: 'obj', id: 'stone-pile-done', x: 22, y: 11 });
  items.push(...squad([hop, hop2], 24.2, 12.6, 6, 2, 0.8, 0.7), ...squad(arc, 24.1, 15.2, 6, 3, 0.6, 0.6));
  items.push(...ring('palisade', 'done', 4, 12, 5, 13, 'wood-tower', [{ id: 'wood-gate-x-open', x: 8, y: 13, fw: 2, fh: 1 }, { id: 'wood-gate-y-done', x: 4, y: 8, fw: 1, fh: 2 }]));
  items.push({ kind: 'obj', id: 'camp-done', x: 6, y: 7 }, { kind: 'obj', id: 'lumber-pile-done', x: 10, y: 7 });
  items.push(...squad([hop, hop2], 8.2, 14.4, 6, 3, 0.6, 0.6));
  const im = scene(34, land, items, 'BUILDINGS_outpost_1x');
  writeImage(join(GREEK, 'GREEK_outpost_open_1x.png'), crop(im, { x: 0, y: 200, w: im.w, h: im.h - 200 }));
}

// 2) the Greek fort (citadel) done, wrecked and under construction (scaffold, with a building squad and material piles)
{
  const items = [{ kind: 'obj', id: 'fort-done', x: 2, y: 2 }, { kind: 'obj', id: 'fort-damaged', x: 16, y: 2 }, { kind: 'obj', id: 'fort-scaffold', x: 2, y: 16 }, { kind: 'obj', id: 'fort-rising', x: 16, y: 16 }];
  items.push({ kind: 'obj', id: 'stone-pile-done', x: 13, y: 18 }, { kind: 'obj', id: 'stone-pile-done', x: 13, y: 20 }, { kind: 'obj', id: 'lumber-pile-done', x: 7, y: 27 });
  items.push(...squad([hop, hop2], 12.3, 21.5, 10, 5), ...squad(hop2, 4, 27.3, 4, 4));
  items.push(...squad([hop, hop2], 5, 12.6, 6, 6, 0.6), ...squad(arc, 18.5, 13, 5, 5, 0.6));
  const im = scene(28, land, items, 'BUILDINGS_fort_scaffold_1x');
  writeImage(join(GREEK, 'GREEK_fort_states_1x.png'), crop(im, { x: 0, y: 200, w: im.w, h: im.h - 200 }));
}

// 2b) construction order of every procedural piece: foundation -> rising -> scaffold -> done -> damaged (+ open gates)
{
  const ids = ['stone-tower', 'stone-tower-round', 'stone-gate-x', 'keep', 'wood-tower', 'wood-gate-x'], st = ['foundation', 'rising', 'scaffold', 'done', 'damaged', 'open'];
  const cw = 300, rh = 360, im = fill(blank(cw * st.length + 20, rh * ids.length + 20));
  ids.forEach((id, r) => st.forEach((s, c) => { const o = spr[`${id}-${s}`]; if (o) paste(im, o.im, 10 + c * cw + Math.round((cw - o.w) / 2), 10 + r * rh + rh - o.h - 10); }));
  writeImage(join(GREEK, 'GREEK_states_1x.png'), im);
}

// 2c) the three wall tiers (W-27): palisade, timber rampart, Greek stone wall, each a run with a tower; inside stairs up to
// the walks; men on the walks and archers on the tower platforms
{
  const items = [], K = Object.fromEntries(B.kits.map((k) => [k.id, k])), T = Object.fromEntries(B.buildings.map((b) => [b.id, b]));
  const tiers = [['palisade', 'wood-tower', null, 3], ['rampart', 'wood-tower', 'stair-wood', 11], ['stone-wall', 'stone-tower', 'stair-stone', 19]];
  for (const [kid, tid, sid, y] of tiers) {
    const cells = new Set(), solid = new Set(); for (let x = 3; x <= 14; x++) cells.add(`${x},${y}`);
    for (const d of [[15, y], [16, y], [15, y + 1], [16, y + 1]]) solid.add(d.join(','));
    items.push(...walls(kid, 'done', cells, solid), { kind: 'obj', id: `${tid}-done`, x: 15, y });
    if (sid) items.push({ kind: 'kit', id: sid, state: 'done', n: K[sid].pieces.indexOf('x+n'), x: 6, y: y + 1 }, { kind: 'kit', id: sid, state: 'damaged', n: K[sid].pieces.indexOf('x-n'), x: 11, y: y + 1 });
    const walk = K[kid].walkwayM;
    if (walk) items.push(...squad([hop, hop2], 3.3, y + 0.5, 5, 5, 0.6).map((u) => ({ ...u, z: walk })), ...squad(arc, 9.0, y + 0.55, 3, 3, 0.6).map((u) => ({ ...u, z: walk })));
    items.push(...squad(arc, 15.6, y + 0.9, 2, 2, 0.7).map((u) => ({ ...u, z: T[tid].platformM })));
    items.push(...squad([hop, hop2], 3.5, y + 2.6, 4, 4, 0.6));
  }
  const im = scene(24, land, items, 'BUILDINGS_walls_1x');
  writeImage(join(GREEK, 'GREEK_walls_tiers_1x.png'), crop(im, { x: 0, y: 200, w: im.w, h: im.h - 200 }));
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
  const ST = ['foundation', 'rising', 'scaffold', 'done', 'damaged'], im = fill(blank(ST.length * 300, 3 * 330));
  ['palisade', 'rampart', 'stone-wall'].forEach((id, r) => ST.forEach((s, c) => {
    const ox = c * 300 + 150, oy = r * 330 + 250, k = kit[id];
    const cells = new Set(['0,0', '1,0', '2,0', '3,0', '0,1', '0,2', '0,3', '3,1', '3,2']);
    for (const w of walls(id, s, cells, new Set()).sort((a, b) => a.x + a.y - b.x - b.y)) paste(im, frame(id, s, w.n), ox + (w.x - w.y) * 32 - k.tileOrigin.x, oy + (w.x + w.y) * 16 - k.tileOrigin.y);
  }));
  writeImage(join(OUT, 'BUILDINGS_seams_3x.png'), resizeNearest(im, im.w * 3 / 2, im.h * 3 / 2));
}
console.log('buildings preview ->', OUT);
