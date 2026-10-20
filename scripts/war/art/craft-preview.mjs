// ART-C crafting art preview (PROMPTS_ART.md "Crafting art"): the six workplace chains by level and state, the new
// engines in every facing and state, the fortifications, and a 1:1 mock-up of a siege on the global tiles.
// Usage: node scripts/war/art/craft-preview.mjs [out dir]   -> CRAFT_workplaces.png, CRAFT_states.png, CRAFT_engines.png,
// CRAFT_forts.png, CRAFT_icons.png, CRAFT_mock_1x.png, CRAFT_mock_2x_crop.png
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, crop, paste, resizeNearest } from '../../art/lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = process.argv[2] ?? '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/craft-art';
mkdirSync(OUT, { recursive: true });
const SD = join(ROOT, 'public/war/siege'), BD = join(ROOT, 'public/war/buildings'), TD = join(ROOT, 'public/war/tiles'), UD = join(ROOT, 'public/war/ui');
const S = JSON.parse(readFileSync(join(SD, 'objects.json'))), B = JSON.parse(readFileSync(join(BD, 'objects.json'))), T = JSON.parse(readFileSync(join(TD, 'tiles.json')));
const BG = [22, 17, 13, 255];
const fill = (im, c = BG) => { for (let i = 0; i < im.w * im.h; i++) im.data.set(c, i * 4); return im; };
const spr = Object.fromEntries([...B.objects.map((o) => [o.id, { ...o, im: readImage(join(BD, o.file)) }]), ...S.objects.map((o) => [o.id, { ...o, im: readImage(join(SD, o.file)) }])]);
const kit = Object.fromEntries(B.kits.map((k) => [k.id, { ...k, sheets: Object.fromEntries(Object.entries(k.states).map(([s, f]) => [s, readImage(join(BD, f))])), fronts: Object.fromEntries(Object.entries(k.front ?? {}).map(([s, f]) => [s, readImage(join(BD, f))])) }]));
const frame = (k, s, n, layer = 'back') => { const K = kit[k], c = K.columns ?? K.frames; return crop(layer === 'front' ? K.fronts[s] : K.sheets[s], { x: (n % c) * K.frame.w, y: Math.floor(n / c) * K.frame.h, w: K.frame.w, h: K.frame.h }); };
const sheetOf = (pair) => { const s = T.sheets.find((q) => q.pair === pair); const im = readImage(join(TD, s.file)); return [...Array(16)].map((_, m) => crop(im, { x: s.maskToFrame[m] * 64, y: 0, w: 64, h: 48 })); };
const GS = sheetOf('grass-shallow');
const fxOf = (id) => S.fx.find((f) => f.id === id);
const stripFrame = (file, fw, n) => crop(readImage(join(SD, file)), { x: n * fw, y: 0, w: fw, h: readImage(join(SD, file)).h });
function soldier(cls, row, col) {
  const dir = join(ROOT, 'src/assets/sheets', cls); if (!existsSync(dir)) return null;
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'))), sh = readImage(join(dir, m.image));
  const r = m.rows.indexOf(row), wrap = m.wrap ?? 1e9, band = Math.floor(col / wrap);
  const im = crop(sh, { x: (col % wrap) * m.frame.w, y: (band * m.rows.length + r) * m.frame.h, w: m.frame.w, h: m.frame.h });
  const a = m.anchors?.[row] ?? m.anchor; return { im, anchor: { x: a.x, y: a.y } };
}
// a grass field of n x m tiles with items drawn back to front by key; item: { o: sprite with tileOrigin | kit frame, x, y, z, key }
function scene(n, m, items, top = 420) {
  const W = (n + m) * 32 + 64, H = (n + m) * 16 + top + 60, OX = m * 32 + 32, OY = top, img = fill(blank(W, H));
  const sx = (x, y) => OX + (x - y) * 32, sy = (x, y) => OY + (x + y) * 16;
  for (let x = 0; x < n; x++) for (let y = 0; y < m; y++) paste(img, GS[15], sx(x, y) - 32, sy(x, y));
  for (const it of [...items].sort((a, b) => a.key - b.key)) {
    if (it.kit) { const k = kit[it.kit]; paste(img, frame(it.kit, it.state, it.n, it.layer), sx(it.x, it.y) - k.tileOrigin.x, sy(it.x, it.y) - k.tileOrigin.y); continue; }
    if (it.fx) { const f = fxOf(it.fx); paste(img, stripFrame(f.file, f.frame.w, it.n ?? 0), Math.round(it.px - f.anchor.x), Math.round(it.py - f.anchor.y)); continue; }
    const o = it.o; if (!o) continue;
    const ax = o.tileOrigin ?? { x: o.anchor.x, y: o.anchor.y }; paste(img, o.im, Math.round(sx(it.x, it.y) - ax.x), Math.round(sy(it.x, it.y) - (it.z ?? 0) * 33 - ax.y));
  }
  return { img, sx, sy };
}
const label = () => {}; // (no text renderer: rows are in the order the doc lists)

// ---- workplaces: one row per chain, levels left to right (done), on grass
{
  const chains = [...new Set(B.buildings.filter((b) => b.chain).map((b) => b.chain))];
  const rows = chains.map((c) => B.buildings.filter((b) => b.chain === c).sort((a, b) => a.level - b.level));
  const items = []; let y = 0;
  for (const r of rows) { let x = 0; const fh = Math.max(...r.map((b) => b.footprint[1])); for (const b of r) { items.push({ o: spr[b.states.done], x, y, key: x + y }); x += b.footprint[0] + 2; } y += fh + 3; }
  const { img } = scene(18, y, items, 320); writeImage(join(OUT, 'CRAFT_workplaces.png'), img);
}
// ---- grid composites: cells of layered sprites (each { o } placed by its tileOrigin on one origin), rows bottom-aligned
function grid(rows, pad = 10, scale = 1) {
  const cell = (parts) => { const xs = parts.map((q) => -q.o.tileOrigin.x), ys = parts.map((q) => -q.o.tileOrigin.y); const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...parts.map((q, i) => xs[i] + q.o.im.w)), y1 = Math.max(...parts.map((q, i) => ys[i] + q.o.im.h)); const im = blank(x1 - x0, y1 - y0); parts.forEach((q, i) => paste(im, q.o.im, xs[i] - x0, ys[i] - y0)); return im; };
  const Rs = rows.map((r) => r.map((c) => cell(c.filter((q) => q.o))));
  const W = Math.max(...Rs.map((r) => r.reduce((t, im) => t + im.w + pad, pad))), H = Rs.reduce((t, r) => t + Math.max(...r.map((im) => im.h)) + pad, pad), img = fill(blank(W, H), [58, 54, 46, 255]);
  let y = pad; for (const r of Rs) { const rh = Math.max(...r.map((im) => im.h)); let x = pad; for (const im of r) { paste(img, im, x, y + rh - im.h); x += im.w + pad; } y += rh + pad; }
  return scale === 1 ? img : resizeNearest(img, W * scale, H * scale);
}
const ORDER = ['foundation', 'rising', 'scaffold', 'done', 'damaged'];
// ---- states: every workplace level (rows), foundation .. damaged
writeImage(join(OUT, 'CRAFT_states.png'), grid(B.buildings.filter((b) => b.chain).map((b) => ORDER.map((st) => [{ o: spr[b.states[st]] }]))));
// ---- engines: per engine the four facings (done, back + front), the states facing e, then its anim strips (facing s)
{
  const rows = [];
  for (const id of ['mantlet', 'covered-ram', 'oxybeles', 'siege-tower']) {
    const e = S.engines.find((q) => q.id === id), c = (f, st) => [{ o: spr[e.states[f][st]] }, { o: spr[e.front?.[f]?.[st]] }];
    rows.push([...e.facings.map((f) => c(f, 'done')), ...['foundation', 'rising', 'scaffold', 'damaged', 'destroyed'].map((st) => c('e', st))]);
    for (const a of Object.values(e.anims.s ?? {})) { const sh = readImage(join(SD, a.file)); rows.push([...Array(a.frames)].map((_, n) => [...(a.layer === 'front' ? [{ o: spr[e.states.s.done] }] : []), { o: { im: crop(sh, { x: n * a.frame.w, y: 0, w: a.frame.w, h: a.frame.h }), tileOrigin: a.tileOrigin } }, ...(a.layer === 'back' && e.front?.s?.done ? [{ o: spr[e.front.s.done] }] : [])])); }
  }
  writeImage(join(OUT, 'CRAFT_engines.png'), grid(rows));
}
// ---- fortifications: ditch states and joins, stake field states, gates plain / iron-bound, wet hides on a palisade and a rampart
{
  const kf = (id, st, n, layer) => ({ o: { im: frame(id, st, n, layer), tileOrigin: kit[id].tileOrigin } }), rf = kit.rampart.frameOf[5];
  const bo = (id, st = 'done') => ({ o: spr[B.buildings.find((b) => b.id === id).states[st]] });
  writeImage(join(OUT, 'CRAFT_forts.png'), grid([
    [...ORDER.map((st) => [kf('ditch', st, 5)]), [kf('ditch', 'done', 3)], [kf('ditch', 'done', 15)]],
    ORDER.map((st) => [bo('stakes', st)]),
    ['stone-gate-x', 'stone-gate-x-iron', 'wood-gate-x', 'wood-gate-x-iron', 'stone-gate-y-iron'].map((id) => [bo(id)]),
    [[kf('palisade', 'done', 5)], [kf('palisade', 'done', 5), kf('hides-palisade', 'done', 5)], [kf('rampart', 'done', rf), kf('rampart', 'done', rf, 'front')], [kf('rampart', 'done', rf), kf('hides-rampart', 'done', rf), kf('rampart', 'done', rf, 'front'), kf('hides-rampart', 'done', rf, 'front')]],
  ], 12, 2));
}
// ---- icons: goods, badges, then one row per profession tree; 32 and 24 px, shown x3
{
  const U = JSON.parse(readFileSync(join(UD, 'ui.json'))), ic = (id, sz) => readImage(join(UD, U.icons[id][sz]));
  const rows = [Object.keys(U.icons).filter((k) => U.icons[k].goodTier), Object.keys(U.icons).filter((k) => U.icons[k].group === 'badge'), ...Object.entries(U.craftNodes).map(([t, ns]) => ns.map((n) => `node-${t}-${n}`))];
  for (const sz of [32, 24]) { const ims = rows.map((r) => r.map((id) => ic(id, sz))), W = Math.max(...ims.map((r) => r.length)) * (sz + 6) + 6, H = ims.length * (sz + 6) + 6, img = fill(blank(W, H), [23, 16, 13, 255]); ims.forEach((r, j) => r.forEach((im, i) => paste(img, im, 6 + i * (sz + 6), 6 + j * (sz + 6)))); writeImage(join(OUT, `CRAFT_icons_${sz}_3x.png`), resizeNearest(img, W * 3, H * 3)); }
}
// ---- 1:1 mock-ups on the global tiles
const civ = (cls, anim, row, f = 0) => { const dir = join(ROOT, 'src/assets/sheets', cls); if (!existsSync(dir)) return null; const m = JSON.parse(readFileSync(join(dir, 'manifest.json'))); return soldier(cls, row, (m.anims[anim]?.col ?? 0) + f); };
function blendFx(img, id, px, py, n, alpha = 1) {
  const f = fxOf(id); if (!f) return; const fr = stripFrame(f.file, f.frame.w, n % f.frames), x0 = Math.round(px - f.anchor.x), y0 = Math.round(py - f.anchor.y), add = f.blend === 'add';
  for (let y = 0; y < fr.h; y++) for (let x = 0; x < fr.w; x++) { const i = (y * fr.w + x) * 4; if (!fr.data[i + 3]) continue; const X = x0 + x, Y = y0 + y; if (X < 0 || Y < 0 || X >= img.w || Y >= img.h) continue; const j = (Y * img.w + X) * 4; for (let c = 0; c < 3; c++) img.data[j + c] = Math.min(255, Math.round(add ? img.data[j + c] + fr.data[i + c] * alpha * 0.6 : img.data[j + c] * (1 - alpha) + fr.data[i + c] * alpha)); }
}
{ // the workplace quarter: top levels and two first levels at work, crafters by them, working fx
  const W = (id) => B.buildings.find((b) => b.id === id), items = [], fxs = [];
  for (const [id, x, y] of [['forge3', 1, 1], ['cookhouse2', 6, 1], ['infirmary3', 10, 1], ['workshop3', 1, 6], ['market-stall2', 6, 6], ['sorting-floor2', 9, 6], ['forge', 14, 1], ['cookhouse', 14, 6]]) { const b = W(id); items.push({ o: spr[b.states.done], x, y, key: x + y + b.footprint[0] + b.footprint[1] - 2 }); for (const f of b.fx?.working ?? []) fxs.push({ ...f, b, x, y }); }
  for (const [cls, anim, x, y] of [['civ_smith', 'forge', 2.5, 4.4], ['civ_cook', 'cook', 7.5, 3.4], ['civ_physician', 'heal', 11.5, 4.4], ['civ_engineer', 'build', 3, 9.4], ['civ_merchant', 'trade', 6.8, 8.4], ['civ_forager', 'idle', 10.5, 9.4], ['civ_smith', 'forge', 15.5, 4.2]]) { const c = civ(cls, anim, 'south-west', 3); if (c) items.push({ o: c, x, y, key: x + y + 0.5 }); }
  const { img, sx, sy } = scene(18, 11, items, 340);
  fxs.forEach((f, i) => { const o = spr[f.b.states.done]; blendFx(img, f.id, sx(f.x, f.y) - o.tileOrigin.x + f.at.x, sy(f.x, f.y) - o.tileOrigin.y + f.at.y, 3 + i, f.alpha ?? 1); });
  writeImage(join(OUT, 'CRAFT_quarter_1x.png'), img);
}
{ // the siege: a stone wall 2 deep along x with the iron-bound Lion Gate, the siege tower docked on it, the covered ram at
  // the gate, an oxybeles and two mantlets with archers, a ditch and stakes before the wall, a wet-hide palisade
  const items = [], cells = new Set(), gate = new Set(['10,5', '11,5', '10,6', '11,6']), K = (x, y) => `${x},${y}`;
  for (let x = 2; x < 20; x++) for (const y of [5, 6]) if (!gate.has(K(x, y))) cells.add(K(x, y));
  const has = (x, y) => cells.has(K(x, y)) || gate.has(K(x, y)), sw = kit['stone-wall'];
  for (const c of cells) { const [x, y] = c.split(',').map(Number), m = (has(x + 1, y) ? 1 : 0) | (has(x, y + 1) ? 2 : 0) | (has(x - 1, y) ? 4 : 0) | (has(x, y - 1) ? 8 : 0), n = sw.frameOf[m]; items.push({ kit: 'stone-wall', state: 'done', n, x, y, key: x + y + 1 }, { kit: 'stone-wall', state: 'done', n, layer: 'front', x, y, key: x + y + 1.6 }); }
  items.push({ o: spr[B.buildings.find((b) => b.id === 'stone-gate-x-deep-n-iron').states.done], x: 10, y: 5, key: 10 + 5 + 3.5 });
  const T = S.engines.find((e) => e.id === 'siege-tower'), tb = T.anims.n.bridge, tsh = readImage(join(SD, tb.file));
  items.push({ o: { im: crop(tsh, { x: (tb.frames - 1) * tb.frame.w, y: 0, w: tb.frame.w, h: tb.frame.h }), tileOrigin: tb.tileOrigin }, x: 4, y: 7, key: 4 + 7 + 3 }, { o: spr[T.front.n.done], x: 4, y: 7, key: 4 + 7 + 3.7 });
  for (const [x, y] of [[4.6, 6.1], [5.2, 5.6]]) { const h = soldier('hoplite', 'north-west', 0); if (h) items.push({ o: h, x, y, z: 6.2, key: 4 + 7 + 3.5 }); }
  const CR = S.engines.find((e) => e.id === 'covered-ram'); items.push({ o: spr[CR.states.n.done], x: 10, y: 7, key: 10 + 7 + 4 }, { o: spr[CR.front.n.done], x: 10, y: 7, key: 10 + 7 + 5.6 });
  const OXE = S.engines.find((e) => e.id === 'oxybeles'), M = S.engines.find((e) => e.id === 'mantlet'); items.push({ o: spr[OXE.states.n.done], x: 15, y: 11, key: 15 + 11 + 2 });
  for (const c of OXE.crew.n) { const s2 = civ('civ_engineer', 'idle', 'north-west', 0); if (s2) items.push({ o: s2, x: 15 + c[0], y: 11 + c[1], key: 15 + 11 + c[0] + c[1] }); }
  for (const [x, y] of [[13, 9], [17, 9]]) { items.push({ o: spr[M.states.n.done], x, y, key: x + y + 0.9 }); const a = soldier('archer', 'north-west', 0); if (a) items.push({ o: a, x: x + 0.5, y: y + 0.85, key: x + y + 1.4 }); }
  for (let x = 0; x < 9; x++) { const m = (x < 8 ? 1 : 0) | (x > 0 ? 4 : 0); items.push({ kit: 'ditch', state: 'done', n: m, x, y: 12, key: -100 + x }); if (x % 2 === 0) items.push({ o: spr[B.buildings.find((b) => b.id === 'stakes').states.done], x, y: 14, key: x + 14 + 1 }); }
  for (let x = 13; x < 20; x++) { const m = (x < 19 ? 1 : 0) | (x > 13 ? 4 : 0); items.push({ kit: 'palisade', state: 'done', n: m, x, y: 15, key: x + 15 + 1 }, { kit: 'hides-palisade', state: 'done', n: m, x, y: 15, key: x + 15 + 1.1 }); }
  for (const [x, y] of [[8, 5], [9, 5], [14, 5]]) { const h = soldier('hoplite', 'south-east', 0); if (h) items.push({ o: h, x: x + 0.5, y: y + 0.5, z: 5, key: x + y + 1.3 }); }
  const { img } = scene(21, 17, items, 470); writeImage(join(OUT, 'CRAFT_mock_1x.png'), img);
  const cr = crop(img, { x: 300, y: 80, w: 760, h: 560 }); writeImage(join(OUT, 'CRAFT_mock_2x_crop.png'), resizeNearest(cr, cr.w * 2, cr.h * 2));
}
