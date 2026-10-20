// ART-T trade art preview (PROMPTS_ART.md "Trade art"): contact sheets (carts by facing and state, cargo overlays, the mule
// team, chest / strongbox / board / piles, the stall chain and the warehouse, the icons) and 1:1 mock-ups on the global
// tiles: an escorted wagon on a road, a looted handcart with a loot pile, an agora with stalls, a warehouse and the board.
// Usage: node scripts/war/art/trade-preview.mjs [out dir]   -> TRADE_carts.png, TRADE_cargo.png, TRADE_things.png,
// TRADE_icons_3x.png, TRADE_mock_road_1x.png, TRADE_mock_loot_1x.png, TRADE_mock_agora_1x.png, TRADE_mock_2x_crop.png, TRADE_wagon.gif-less strips
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, crop, paste, resizeNearest } from '../../art/lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = process.argv[2] ?? '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/trade-art';
mkdirSync(OUT, { recursive: true });
const TD = join(ROOT, 'public/war/trade'), BD = join(ROOT, 'public/war/buildings'), SD = join(ROOT, 'public/war/siege'), GD = join(ROOT, 'public/war/tiles'), UD = join(ROOT, 'public/war/ui');
const T = JSON.parse(readFileSync(join(TD, 'objects.json'))), B = JSON.parse(readFileSync(join(BD, 'objects.json'))), S = JSON.parse(readFileSync(join(SD, 'objects.json'))), G = JSON.parse(readFileSync(join(GD, 'tiles.json')));
const BG = [22, 17, 13, 255];
const fill = (im, c = BG) => { for (let i = 0; i < im.w * im.h; i++) im.data.set(c, i * 4); return im; };
const spr = Object.fromEntries([...T.objects.map((o) => [o.id, { ...o, im: readImage(join(TD, o.file)) }]), ...B.objects.map((o) => [o.id, { ...o, im: readImage(join(BD, o.file)) }])]);
const sheetOf = (pair) => { const s = G.sheets.find((q) => q.pair === pair); if (!s) return null; const im = readImage(join(GD, s.file)); return [...Array(16)].map((_, m) => crop(im, { x: s.maskToFrame[m] * 64, y: 0, w: 64, h: 48 })); };
const GRASS = sheetOf('grass-shallow');
const roadPair = G.sheets.find((q) => /road|dirt|path/.test(q.pair) && /grass/.test(q.pair));
const ROAD = roadPair ? sheetOf(roadPair.pair) : null;
const fxOf = (id) => S.fx.find((f) => f.id === id);
const fxFrame = (f, n) => { const im = readImage(join(SD, f.file)); return crop(im, { x: (n % f.frames) * f.frame.w, y: 0, w: f.frame.w, h: f.frame.h }); };
const stripFrame = (a, n) => { const im = readImage(join(TD, a.file)); return { im: crop(im, { x: n * a.frame.w, y: 0, w: a.frame.w, h: a.frame.h }), tileOrigin: a.tileOrigin }; };
const mule = (f, anim = 'walk', n = 0) => { const M = T.mules; if (!M?.file) return null; const im = readImage(join(TD, M.file)), row = M.rows.indexOf(M.facingRow[f]), col = M.anims[anim].col + (n % M.anims[anim].frames); return { im: crop(im, { x: col * M.frame.w, y: row * M.frame.h, w: M.frame.w, h: M.frame.h }), anchor: M.anchors[M.facingRow[f]] }; };
function soldier(cls, row, col = 0, anim = null) {
  const dir = join(ROOT, 'src/assets/sheets', cls); if (!existsSync(dir)) return null;
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'))), sh = readImage(join(dir, m.image)); const c = (anim && m.anims?.[anim]?.col ? m.anims[anim].col : 0) + col;
  const r = m.rows.indexOf(row), wrap = m.wrap ?? 1e9, band = Math.floor(c / wrap);
  const im = crop(sh, { x: (c % wrap) * m.frame.w, y: (band * m.rows.length + r) * m.frame.h, w: m.frame.w, h: m.frame.h });
  const a = m.anchors?.[row] ?? m.anchor; return { im, anchor: { x: a.x, y: a.y } };
}
// a grass field n x m with optional road tiles; items drawn by key: { o: { im, tileOrigin | anchor }, x, y, z, key } or fx
function scene(n, m, items, top = 300, road = null) {
  const W = (n + m) * 32 + 64, H = (n + m) * 16 + top + 60, OX = m * 32 + 32, OY = top, img = fill(blank(W, H));
  const sx = (x, y) => OX + (x - y) * 32, sy = (x, y) => OY + (x + y) * 16;
  for (let x = 0; x < n; x++) for (let y = 0; y < m; y++) { const t = road && ROAD ? road(x, y) : 15; paste(img, (t !== 15 && ROAD ? ROAD : GRASS)[t === 15 ? 15 : t], sx(x, y) - 32, sy(x, y)); }
  for (const it of [...items].sort((a, b) => a.key - b.key)) {
    if (it.fx) { const f = fxOf(it.fx); if (!f) continue; blend(img, fxFrame(f, it.n ?? 0), Math.round(it.px - f.anchor.x), Math.round(it.py - f.anchor.y), it.alpha ?? 1, f.blend === 'add'); continue; }
    const o = it.o; if (!o) continue;
    const ax = o.tileOrigin ?? o.anchor; paste(img, o.im, Math.round(sx(it.x, it.y) - ax.x), Math.round(sy(it.x, it.y) - (it.z ?? 0) * 33 - ax.y));
  }
  return { img, sx, sy };
}
function blend(img, fr, x0, y0, alpha, add) {
  for (let y = 0; y < fr.h; y++) for (let x = 0; x < fr.w; x++) { const i = (y * fr.w + x) * 4; if (!fr.data[i + 3]) continue; const X = x0 + x, Y = y0 + y; if (X < 0 || Y < 0 || X >= img.w || Y >= img.h) continue; const j = (Y * img.w + X) * 4; for (let c = 0; c < 3; c++) img.data[j + c] = Math.min(255, Math.round(add ? img.data[j + c] + fr.data[i + c] * alpha * 0.6 : img.data[j + c] * (1 - alpha) + fr.data[i + c] * alpha)); }
}
// grid of cells; a cell = parts drawn at one origin by their tileOrigin
function grid(rows, pad = 10, scale = 1) {
  const cell = (parts) => { parts = parts.filter((q) => q && q.o); const xs = parts.map((q) => -(q.o.tileOrigin ?? q.o.anchor).x + (q.dx ?? 0)), ys = parts.map((q) => -(q.o.tileOrigin ?? q.o.anchor).y + (q.dy ?? 0)); const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...parts.map((q, i) => xs[i] + q.o.im.w)), y1 = Math.max(...parts.map((q, i) => ys[i] + q.o.im.h)); const im = blank(x1 - x0, y1 - y0); parts.forEach((q, i) => paste(im, q.o.im, xs[i] - x0, ys[i] - y0)); return im; };
  const Rs = rows.map((r) => r.map(cell));
  const W = Math.max(...Rs.map((r) => r.reduce((t, im) => t + im.w + pad, pad))), H = Rs.reduce((t, r) => t + Math.max(...r.map((im) => im.h)) + pad, pad), img = fill(blank(W, H), [58, 54, 46, 255]);
  let y = pad; for (const r of Rs) { const rh = Math.max(...r.map((im) => im.h)); let x = pad; for (const im of r) { paste(img, im, x, y + rh - im.h); x += im.w + pad; } y += rh + pad; }
  return scale === 1 ? img : resizeNearest(img, W * scale, H * scale);
}
const cart = (id) => T.carts.find((c) => c.id === id);
// ---- carts: per cart, rows: facings x (halted, burning + fx frame, wrecked, burnt, moving frames 0, 2, 4, 6)
{
  const rows = [];
  for (const c of T.carts) for (const f of c.facings) rows.push([...['halted', 'burning', 'wrecked', 'burnt'].map((s) => [{ o: spr[c.states[f][s]] }]), ...[0, 2, 4, 6].map((n) => [{ o: stripFrame(c.moving[f], n) }]), ...(c.team ? [[{ o: spr[c.states[f].halted] }, { o: spr[c.cargo[f]['amphorae-full']] }]] : [])]);
  writeImage(join(OUT, 'TRADE_carts.png'), grid(rows, 10, 2));
}
// ---- cargo: per cart facing s and e, every kind half / full over the halted cart
{
  const rows = [];
  for (const c of T.carts) for (const f of ['e', 's']) rows.push(Object.entries(c.cargo[f]).map(([k, id]) => [{ o: spr[c.states[f].halted] }, { o: spr[id] }]));
  writeImage(join(OUT, 'TRADE_cargo.png'), grid(rows, 8, 2));
}
// ---- things, piles, stall chain + warehouse, mule rows
{
  const st = (id, s) => ({ o: spr[`${id}-${s}`] });
  const rows = [
    [...T.things.flatMap((t) => Object.values(t.states).map((s) => [{ o: spr[s] }]))],
    T.piles.map((p) => [{ o: spr[p.sprite] }]),
    ['foundation', 'rising', 'scaffold', 'done', 'damaged'].map((s) => [st('warehouse', s)]),
    ['market-stall', 'market-stall2', 'market-stall3'].map((id) => [st(id, 'done')]),
  ];
  if (T.mules?.file) { const M = T.mules, im = readImage(join(TD, M.file)); rows.push(...M.rows.map((r, j) => [...Array(M.anims.walk.col + M.anims.walk.frames)].map((_, i) => [{ o: { im: crop(im, { x: i * M.frame.w, y: j * M.frame.h, w: M.frame.w, h: M.frame.h }), anchor: M.anchors[r] } }]))); }
  writeImage(join(OUT, 'TRADE_things.png'), grid(rows, 10, 2));
}
// ---- icons
{
  const U = JSON.parse(readFileSync(join(UD, 'ui.json'))), ids = U.tradeIcons ?? [];
  if (ids.length) for (const sz of [32]) { const W = ids.length * (sz + 6) + 6, H = 2 * (sz + 6) + 6, img = fill(blank(W, H), [23, 16, 13, 255]); ids.forEach((id, i) => { paste(img, readImage(join(UD, U.icons[id][32])), 6 + i * (sz + 6), 6); paste(img, readImage(join(UD, U.icons[id][24])), 6 + i * (sz + 6) + 4, 6 + sz + 10); }); writeImage(join(OUT, 'TRADE_icons_3x.png'), resizeNearest(img, W * 3, H * 3)); }
}

// ---- mock-ups
const items = (list) => list.filter((q) => q && q.o !== null);
const at = (o, x, y, key, z = 0) => ({ o, x, y, z, key });
{ // 1. an escorted wagon (full of amphorae, moving e) on a road with its mule team, a hoplite escort column round it, a
  // handcart with sacks pulled by two men behind it
  const list = [], road = (x, y) => (y >= 5 && y <= 6 ? 0 : 15);
  const W0 = cart('wagon'), f = 'e', wx = 4, wy = 5;
  const wm = stripFrame(W0.moving[f], 3); list.push(at(wm, wx, wy, wx + wy + 2.1), at(spr[W0.cargo[f]['amphorae-full']], wx, wy, wx + wy + 2.2));
  for (const [i, [tx, ty]] of W0.team[f].entries()) list.push(at(mule(f, 'walk', 2 + i * 3), wx + tx, wy + ty, wx + tx + wy + ty + 0.3));
  const dr = soldier('civ_merchant', 'south-east', 0); if (dr) list.push(at(soldier('civ_merchant', 'south-east', 1, 'walk') ?? dr, wx + W0.crew[f][0][0], wy + W0.crew[f][0][1], wx + W0.crew[f][0][0] + wy + W0.crew[f][0][1] + 0.4));
  const H = cart('handcart'), hx = 0, hy = 5; list.push(at(stripFrame(H.moving[f], 5), hx, hy, hx + hy + 1.1), at(spr[H.cargo[f]['sacks-full']], hx, hy, hx + hy + 1.2));
  for (const [cx, cy] of H.crew[f]) { const p = soldier('militia', 'south-east', 1, 'walk'); if (p) list.push(at(p, hx + cx, hy + cy, hx + cx + hy + cy + 0.4)); }
  for (const [x, y] of [[2.5, 3.6], [5.5, 3.6], [8.5, 3.6], [2.5, 7.4], [5.5, 7.4], [8.5, 7.4], [10.6, 5.4], [10.6, 6.6]]) { const h = soldier('hoplite', 'south-east', 1, 'walk'); if (h) list.push(at(h, x, y, x + y + 0.5)); }
  const { img } = scene(13, 11, items(list), 230, road); writeImage(join(OUT, 'TRADE_mock_road_1x.png'), img);
  const cr = crop(img, { x: 150, y: 220, w: 460, h: 280 }); writeImage(join(OUT, 'TRADE_mock_road_2x_crop.png'), resizeNearest(cr, cr.w * 2, cr.h * 2));
}
{ // 2. a looted handcart (wrecked) with a goods pile and a gear pile beside it, two raiders picking up, an open looted chest
  const list = [], H = cart('handcart'), f = 's';
  list.push(at(spr[H.states[f].wrecked], 3, 2, 3 + 2 + 1.5));
  list.push(at(spr['pile-goods-m'], 4, 3, 7.5), at(spr['pile-gear-l'], 2, 5, 7.5), at(spr['pile-gear-s'], 5, 5, 10.5), at(spr['chest-looted'], 7, 3, 10.5));
  const bc = cart('wagon'); list.push(at(spr[bc.states.e.burning], 8, 7, 8 + 7 + 2));
  const bs = spr[bc.states.e.burning]; const fxs = bc.fx.e.burning;
  for (const [cls, x, y, row] of [['bandit', 4.8, 4.1, 'north-west'], ['bandit', 3.2, 6.2, 'north-east'], ['hoplite', 1.2, 3.4, 'south-east']]) { const s = soldier(cls === 'bandit' ? 'mob_bandit' : cls, row, 0); if (s) list.push(at(s, x, y, x + y + 0.5)); }
  const sc = scene(10, 9, items(list), 200), img = sc.img;
  fxs.forEach((q, i) => { const fx = fxOf(q.id); if (!fx) return; blend(img, fxFrame(fx, 3 + i), Math.round(sc.sx(8, 7) - bs.tileOrigin.x + q.at.x - fx.anchor.x), Math.round(sc.sy(8, 7) - bs.tileOrigin.y + q.at.y - fx.anchor.y), q.alpha ?? 1, fx.blend === 'add'); });
  writeImage(join(OUT, 'TRADE_mock_loot_1x.png'), img);
  const cr = crop(img, { x: 180, y: 200, w: 360, h: 280 }); writeImage(join(OUT, 'TRADE_mock_loot_2x_crop.png'), resizeNearest(cr, cr.w * 2, cr.h * 2));
}
{ // 3. an agora court: stalls L1-L3 in a row, two warehouses, the price board, a strongbox, a halted wagon unloading
  const list = [], b = (id) => spr[`${id}-done`];
  for (const [id, x, y] of [['market-stall', 1, 1], ['market-stall2', 4, 1], ['market-stall3', 7, 1], ['warehouse', 1, 8], ['warehouse', 5, 8]]) { const bb = B.buildings.find((q) => q.id === id); list.push(at(b(id), x, y, x + y + bb.footprint[0] + bb.footprint[1] - 2)); }
  list.push(at(spr['price-board-done'], 6, 5, 11.5), at(spr['strongbox-open'], 10, 2, 12.6), at(spr['chest-open'], 9, 8, 17.3));
  const W0 = cart('wagon'), f = 's'; list.push(at(spr[W0.states[f].halted], 10, 3, 10 + 3 + 3), at(spr[W0.cargo[f]['crates-half']], 10, 3, 10 + 3 + 3.1));
  for (const [i, [tx, ty]] of W0.team[f].entries()) list.push(at(mule(f, 'halted', 0), 10 + tx, 3 + ty, 10 + tx + 3 + ty + 0.3));
  for (const [cls, anim, x, y, row] of [['civ_merchant', 'trade', 2.6, 4.2, 'south-west'], ['civ_merchant', 'idle', 5.4, 4.3, 'south-east'], ['civ_forager', 'idle', 9.4, 6.2, 'south-west'], ['militia', 'idle', 6.4, 6.6, 'north-west'], ['civ_engineer', 'idle', 3.5, 7.4, 'south-east']]) { const s = soldier(cls, row, 0, anim); if (s) list.push(at(s, x, y, x + y + 0.5)); }
  const { img } = scene(12, 11, items(list), 260); writeImage(join(OUT, 'TRADE_mock_agora_1x.png'), img);
  const cr = crop(img, { x: 180, y: 120, w: 520, h: 380 }); writeImage(join(OUT, 'TRADE_mock_2x_crop.png'), resizeNearest(cr, cr.w * 2, cr.h * 2));
}
console.log('trade preview ->', OUT);
