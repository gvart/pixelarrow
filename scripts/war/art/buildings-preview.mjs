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
const kit = Object.fromEntries(B.kits.map((k) => [k.id, { ...k, sheets: Object.fromEntries(Object.entries(k.states).map(([s, f]) => [s, readImage(join(BD, f))])), fronts: Object.fromEntries(Object.entries(k.front ?? {}).map(([s, f]) => [s, readImage(join(BD, f))])) }]));
const frame = (k, s, n, layer = 'back') => { const K = kit[k], c = K.columns ?? K.frames; return crop(layer === 'front' ? K.fronts[s] : K.sheets[s], { x: (n % c) * K.frame.w, y: Math.floor(n / c) * K.frame.h, w: K.frame.w, h: K.frame.h }); };

// ---- contact sheet: kit sheets (x1) per state, then every sprite
{
  const rows = B.kits.flatMap((k) => Object.keys(k.states).flatMap((s) => [[k.id, s, kit[k.id].sheets[s]], ...(k.front ? [[k.id, s, kit[k.id].fronts[s]]] : [])]));
  const objW = 2800, im = fill(blank(objW, rows.reduce((a, r) => a + r[2].h + 6, 0) + 3000)); let y = 4;
  for (const [, , sh] of rows) { paste(im, sh, 4, y); y += sh.h + 6; }
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
  const key = (it) => it.key ?? (it.kind === 'unit' ? it.x + it.y + 0.01 + (it.z ? 2.5 : 0) : it.kind === 'kit' ? it.x + it.y + 2 : it.x + it.y + spr[it.id].footprint[0] + spr[it.id].footprint[1] - 0.01);
  for (const it of [...items].sort((a, b) => key(a) - key(b))) {
    if (it.kind === 'kit') { const k = kit[it.id]; paste(img, frame(it.id, it.state, it.n, it.layer), sx(it.x, it.y) - k.tileOrigin.x, sy(it.x, it.y) - k.tileOrigin.y); }
    else if (it.kind === 'obj') { const o = spr[it.id]; paste(img, o.im, sx(it.x, it.y) - o.tileOrigin.x, sy(it.x, it.y) - o.tileOrigin.y); }
    else if (it.s) paste(img, it.s.im, Math.round(sx(it.x, it.y) - it.s.anchor.x), Math.round(sy(it.x, it.y) - (it.z ?? 0) * 33 - it.s.anchor.y)); // z: standing on a deck
  }
  writeImage(join(OUT, `${name}.png`), crop(img, { x: 0, y: 200, w: W, h: H - 200 }));
  return img;
}
// wall line helper: tiles of a wall run and its neighbour masks
// layered kits (W-28): solid (gates) count in the mask, open = Map "x,y" -> open sides (stair tops, joined towers); every
// tile gives a back item (key: its centre - 0.3) and a front item (centre + 0.3), units on it come between
function walls(id, state, cells, solid, open = new Map()) { // cells: set "x,y" of wall tiles; solid: extra "x,y" (gates/towers) that walls join
  const has = (x, y) => cells.has(`${x},${y}`) || solid.has(`${x},${y}`), K = kit[id];
  return [...cells].flatMap((c) => {
    const [x, y] = c.split(',').map(Number); const n = (has(x + 1, y) ? 1 : 0) | (has(x, y + 1) ? 2 : 0) | (has(x - 1, y) ? 4 : 0) | (has(x, y - 1) ? 8 : 0);
    if (!K.layered) return [{ kind: 'kit', id, state, n, x, y }];
    const f = K.frameOf[n | ((open.get(c) ?? 0) << 4)];
    return [{ kind: 'kit', id, state, n: f, x, y, key: x + y + 0.7 }, { kind: 'kit', id, state, n: f, x, y, layer: 'front', key: x + y + 1.3 }];
  });
}
// a unit standing on the tile it is in (between that tile's back and front layers); z: metres above the ground
const at = (s, x, y, z = 0) => ({ kind: 'unit', s, x, y, z, key: Math.floor(x) + Math.floor(y) + 1 + 0.05 * ((x % 1) + (y % 1)) });
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

// 2c) W-28 wall-walks at 1:1 (walls2/): walls two tiles deep drawn back -> units -> front, stairs and towers joined level,
// a ladder up a wood tower; the three tiers side by side; every new piece in every state
const W2 = join(OUT, 'walls2'); mkdirSync(W2, { recursive: true });
const pc = (id, p) => kit[id].pieces.indexOf(p);
const towerAt = (id, state, x, y, open = 0) => [{ kind: 'kit', id, state, n: open, x, y, key: x + y + 0.7 }, { kind: 'kit', id, state, n: open, x, y, layer: 'front', key: x + y + 3.3 }];
const stairAt = (id, state, p, x, y) => ({ kind: 'kit', id, state, n: pc(id, p), x, y, key: x + y + 0.7 });
const ladderAt = (p, state, x, y) => ({ kind: 'kit', id: 'ladder', state, n: pc('ladder', p), x, y, key: x + y + 1.6 });
const box2 = (x0, x1, y0, y1) => { const c = new Set(); for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) c.add(`${x},${y}`); return c; };
const S = (cls, row, col) => soldier(cls, row, col);
const arcSE = S('archer', 'south-east', 104), arcSW = S('archer', 'south-west', 104), hopSE = S('hoplite', 'south-east', 0), hopSW = S('hoplite', 'south-west', 0);
const walkSE = S('hoplite', 'south-east', 44), walkNW = S('hoplite', 'north-west', 47), climbNE = [S('hoplite', 'north-east', 41), S('hoplite', 'north-east', 45), S('hoplite', 'north-east', 49)];
const climbNW = [S('hoplite', 'north-west', 42), S('hoplite', 'north-west', 46)];
{ // stone: a cyclopean wall 2 deep with an L, a stone tower joined level at its end, stone stairs on both axes
  const cells = new Set([...box2(4, 13, 6, 7), ...box2(4, 5, 8, 14)]), open = new Map([['13,6', 1], ['13,7', 1], ['9,7', 2], ['5,11', 1]]);
  const W = kit['stone-wall'].walkwayM, P = kit['tower-stone'].platformM, items = [...walls('stone-wall', 'done', cells, new Set(), open)];
  items.push(...towerAt('tower-stone', 'done', 14, 6, 4), stairAt('stair-stone', 'done', 'y-3', 9, 8), stairAt('stair-stone', 'done', 'x-2', 6, 11), ladderAt('stone-wall-n', 'done', 12, 8));
  for (const [i, x] of [5.3, 6.0, 6.7, 7.4].entries()) items.push(at(i % 2 ? arcSW : arcSE, x, 7.62, W)); // archers along the front parapet
  items.push(at(arcSE, 5.6, 6.7, W), at(arcSE, 6.9, 6.75, W));
  items.push(at(walkSE, 10.7, 6.55, W), at(walkNW, 11.3, 7.45, W)); // two men passing on the 4 m walk
  for (const [i, y] of [10.55, 9.85, 9.15, 8.45].entries()) items.push(at(climbNE[i % 3], 9.5, y, (W * (11 - y)) / 3)); // a file up the stair
  for (const [i, x] of [7.4, 6.6].entries()) items.push(at(climbNW[i], x, 11.5, (W * (8 - x)) / 2)); // x-2: rising towards -x, low end at x = 8
  items.push(at(arcSE, 14.7, 6.8, P), at(arcSW, 15.5, 7.4, P), at(hopSE, 4.6, 9.5, W), at(hopSW, 5.3, 10.2, W));
  for (const [i, x] of [8.2, 8.9, 10.6, 11.3].entries()) items.push(at(i % 2 ? hopSW : hopSE, x, 13.4));
  scene(20, land, items, 'walls2/WALLS2_stone_1x');
}
{ // wood: a timber rampart 2 deep, a wood tower joined level at its end, a wood ramp-stair; a free wood tower with its ladder
  const cells = box2(3, 10, 4, 5), open = new Map([['10,4', 1], ['10,5', 1], ['6,5', 2]]);
  const W = kit.rampart.walkwayM, P = kit['tower-wood'].platformM, items = [...walls('rampart', 'done', cells, new Set(), open)];
  items.push(...towerAt('tower-wood', 'done', 11, 4, 4), stairAt('stair-wood', 'done', 'y-2', 6, 6), ...towerAt('tower-wood', 'done', 13, 9, 2), ladderAt('tower-wood-n', 'done', 13, 11), ladderAt('rampart-n', 'done', 9, 6));
  for (const [i, x] of [3.4, 4.1, 4.8, 7.6, 8.3].entries()) items.push(at(i % 2 ? arcSW : arcSE, x, 5.62, W));
  items.push(at(walkSE, 8.6, 4.55, W), at(walkNW, 9.3, 5.4, W));
  for (const [i, y] of [7.6, 7.0, 6.4].entries()) items.push(at(climbNE[i], 6.5, y, (W * (8 - y)) / 2));
  items.push(at(arcSE, 11.6, 4.8, P), at(arcSW, 12.4, 5.4, P), at(arcSE, 13.8, 9.9, P));
  items.push(at(climbNE[1], 13.5, 12.6), at(hopSE, 11.2, 12.4), at(hopSW, 5.2, 9.2), at(hopSE, 5.9, 9.6));
  scene(18, land, items, 'walls2/WALLS2_wood_1x');
}
{ // the three tiers: palisade line, rampart and stone wall 2 deep, each with its tower
  const items = [];
  const pal = new Set(); for (let x = 3; x <= 12; x++) pal.add(`${x},3`);
  items.push(...walls('palisade', 'done', pal, new Set(['13,3', '14,3', '13,4', '14,4'])), { kind: 'obj', id: 'wood-tower-done', x: 13, y: 3, key: 13 + 3 + 3.3 });
  items.push(...walls('rampart', 'done', box2(3, 12, 9, 10), new Set(), new Map([['12,9', 1], ['12,10', 1], ['7,10', 2]])), ...towerAt('tower-wood', 'done', 13, 9, 4), stairAt('stair-wood', 'done', 'y-2', 7, 11));
  items.push(...walls('stone-wall', 'done', box2(3, 12, 16, 17), new Set(), new Map([['12,16', 1], ['12,17', 1], ['7,17', 2]])), ...towerAt('tower-stone', 'done', 13, 16, 4), stairAt('stair-stone', 'done', 'y-3', 7, 18));
  for (const [y, z] of [[10.6, kit.rampart.walkwayM], [17.6, kit['stone-wall'].walkwayM]]) for (const [i, x] of [3.5, 4.3, 5.1, 9.2, 10.0].entries()) items.push(at(i % 2 ? arcSW : arcSE, x, y, z), at(i % 2 ? hopSE : hopSW, x + 0.3, y - 1, z));
  const im = scene(24, land, items, 'BUILDINGS_walls_1x');
  writeImage(join(GREEK, 'GREEK_walls_tiers_1x.png'), crop(im, { x: 0, y: 200, w: im.w, h: im.h - 200 }));
  writeImage(join(W2, 'WALLS2_tiers_1x.png'), crop(im, { x: 0, y: 200, w: im.w, h: im.h - 200 }));
}
{ // every new piece in every state: a 3 x 2 wall block per walk tier, the towers, stairs (y-3 / y-2) and a ladder on a tower
  const ST = ['foundation', 'rising', 'scaffold', 'done', 'damaged'], cw = 330, rh = 330, rows = [];
  const comp = (items, w, h, ox, oy) => { const im = fill(blank(w, h)); for (const it of [...items].sort((a, b) => a.key - b.key)) { const k = kit[it.id]; paste(im, frame(it.id, it.state, it.n, it.layer), ox + (it.x - it.y) * 32 - k.tileOrigin.x, oy + (it.x + it.y) * 16 - k.tileOrigin.y); } return im; };
  for (const id of ['rampart', 'stone-wall']) rows.push((s) => comp(walls(id, s, box2(0, 2, 0, 1), new Set()), cw, rh, 150, 230));
  for (const id of ['tower-stone', 'tower-wood']) rows.push((s) => comp(towerAt(id, s, 0, 0, 0), cw, rh, 150, 250));
  rows.push((s) => comp([stairAt('stair-stone', s, 'y-3', 0, 0), stairAt('stair-wood', s, 'y-2', 3, -1)], cw, rh, 130, 210));
  rows.push((s) => comp([...towerAt('tower-wood', s === 'damaged' ? 'damaged' : 'done', 0, 0, 2), ladderAt('tower-wood-n', s, 0, 2)], cw, rh, 150, 230));
  const im = fill(blank(cw * ST.length, rh * rows.length));
  rows.forEach((f, r) => ST.forEach((s, c) => paste(im, f(s), c * cw, r * rh)));
  writeImage(join(W2, 'WALLS2_states_1x.png'), im);
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
    for (const w of walls(id, s, cells, new Set()).sort((a, b) => (a.key ?? a.x + a.y) - (b.key ?? b.x + b.y))) paste(im, frame(id, s, w.n, w.layer), ox + (w.x - w.y) * 32 - k.tileOrigin.x, oy + (w.x + w.y) * 16 - k.tileOrigin.y);
  }));
  writeImage(join(OUT, 'BUILDINGS_seams_3x.png'), resizeNearest(im, im.w * 3 / 2, im.h * 3 / 2));
}
console.log('buildings preview ->', OUT);
