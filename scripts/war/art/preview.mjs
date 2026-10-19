// War art preview (ART-5/6): contact sheet of public/war/tiles + objects (or of a biome with --biome <name>, plus a 1:1
// biome patch with soldiers), a 1:1 variants field (same field without and
// with variant fills), and 1:1 renders of test-ridge windows autotiled with the tiles.json fallback rule, with objects
// and soldiers. Flat (heights are the renderer's job). Usage: node scripts/war/art/preview.mjs [out dir]
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, crop, paste, resizeNearest } from '../../art/lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
// --biome <name>: contact sheet of public/war/biomes/<name>/ and a 1:1 patch of that biome drawn with the global + biome set.
const argv = process.argv.slice(2), bi = argv.indexOf('--biome');
const BIOME = bi >= 0 ? argv.splice(bi, 2)[1] : null, PFX = BIOME ? BIOME.toUpperCase() : 'ART5';
const OUT = argv[0] ?? `/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/pixellab/${BIOME ?? 'art5'}`;
mkdirSync(OUT, { recursive: true });
const GDIR = join(ROOT, 'public/war/tiles'), ODIR = join(ROOT, 'public/war/objects'), BDIR = BIOME && join(ROOT, 'public/war/biomes', BIOME);
const tag = (list, dir) => (list ?? []).map((e) => ({ ...e, dir }));
const G = JSON.parse(readFileSync(join(GDIR, 'tiles.json'))), GO = JSON.parse(readFileSync(join(ODIR, 'objects.json')));
const BT = BIOME && JSON.parse(readFileSync(join(BDIR, 'tiles.json'))), BO = BIOME && JSON.parse(readFileSync(join(BDIR, 'objects.json')));
// T / O = what gets drawn (biome: global + biome, a biome variant list replaces the global one); C / CO = what the contact sheet shows
const bVar = new Set((BT?.variants ?? []).map((v) => v.terrain));
const T = BIOME
  ? { ...G, sheets: [...tag(G.sheets, GDIR), ...tag(BT.sheets, BDIR)], variants: [...tag(G.variants, GDIR).filter((v) => !bVar.has(v.terrain)), ...tag(BT.variants, BDIR)], cliffs: [...tag(G.cliffs, GDIR), ...tag(BT.cliffs, BDIR)], fallback: BT.fallback }
  : { ...G, sheets: tag(G.sheets, GDIR), variants: tag(G.variants, GDIR), cliffs: tag(G.cliffs, GDIR) };
const O = { objects: [...tag(GO.objects, ODIR), ...tag(BO?.objects, BDIR)] };
const C = BIOME ? { sheets: T.sheets.filter((s) => s.dir === BDIR), variants: T.variants.filter((v) => v.dir === BDIR), cliffs: T.cliffs.filter((c) => c.dir === BDIR) } : T;
const { w: TW, h: TH } = T.tile, HW = TW / 2, HH = T.tile.topH / 2;
const BG = [22, 17, 13, 255];
const fill = (im) => { for (let i = 0; i < im.w * im.h; i++) im.data.set(BG, i * 4); return im; };
const frames = (e, n) => { const im = readImage(join(e.dir, e.file)); return [...Array(n)].map((_, i) => crop(im, { x: i * TW, y: 0, w: TW, h: TH })); };
const sheets = Object.fromEntries(T.sheets.map((s) => [s.pair, { ...s, f: frames(s, 16) }]));
const variants = Object.fromEntries((T.variants ?? []).map((v) => [v.terrain, frames(v, v.frames)]));
const objs = Object.fromEntries(O.objects.map((o) => [o.id, { ...o, im: readImage(join(o.dir, o.file)) }]));
const CO = BIOME ? BO.objects.map((o) => objs[o.id]) : Object.values(objs);
const hash = (x, y, k = 0) => (((x * 73856093) ^ (y * 19349663) ^ (k * 83492791)) >>> 0);

// ---- contact sheet: every tile set row, the variant rows, cliffs (x2) and every object (x1) on dark ground
{
  const rows = C.sheets.length + (C.variants ?? []).length, cw = 16 * 68;
  const objW = CO.reduce((s, o) => s + o.w + 12, 0), objH = Math.max(...CO.map((o) => o.h));
  const im = fill(blank(Math.max(cw, Math.min(objW, 2000)), rows * 52 + 70 + (objH + 8) * Math.ceil(objW / 2000) + 20));
  C.sheets.forEach((s, r) => sheets[s.pair].f.forEach((t, i) => paste(im, t, i * 68 + 2, r * 52 + 2)));
  (C.variants ?? []).forEach((v, r) => variants[v.terrain].forEach((t, i) => paste(im, t, i * 68 + 2, (C.sheets.length + r) * 52 + 2)));
  let x = 2, y = rows * 52 + 8;
  (C.cliffs ?? []).forEach((c) => { const ci = readImage(join(c.dir, c.file)); for (let k = 0; k < 3; k++) paste(im, ci, x, y + k * 16); x += 72; });
  x = 2; y += 64; let rowH = 0;
  for (const o of CO) { if (x + o.w > im.w) { x = 2; y += rowH + 8; rowH = 0; } paste(im, o.im, x, y); x += o.w + 12; rowH = Math.max(rowH, o.h); }
  const out = crop(im, { x: 0, y: 0, w: im.w, h: Math.min(im.h, y + rowH + 4) });
  writeImage(join(OUT, `${PFX}_contact.png`), resizeNearest(out, out.w * 2, out.h * 2));
}

// ---- the fallback rule of tiles.json on a vertex grid V (terrain per vertex), then autotile
const pairOf = new Map(T.sheets.map((s) => [[s.first, s.second].sort().join('|'), s]));
const WATER = new Set(['deep', 'shallow']);
const rank = (t) => T.fallback.order.indexOf(t);
const BUF = T.fallback.buffer?.land ?? 'grass'; // the land buffer terrain (grass; sand in a desert biome)
function resolve(V, n) {
  const at = (x, y) => (x >= 0 && y >= 0 && x <= n && y <= n ? V[y * (n + 1) + x] : null);
  const set = (x, y, t) => { V[y * (n + 1) + x] = t; };
  for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) { // (1) shores get a shallow band
    if (at(x, y) !== 'deep') continue;
    let land = false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = at(x + dx, y + dy); if (t && !WATER.has(t)) land = true; }
    if (land) set(x, y, 'shallow');
  }
  for (let pass = 0, changed = true; changed && pass < 30; pass++) { // (2) pairs with no sheet get a buffer (grass); 3+ terrains: minority joins the majority
    changed = false;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const c = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]], ts = c.map(([a, b]) => at(a, b)), kinds = [...new Set(ts)];
      if (kinds.length < 2) continue;
      for (let i = 0; i < kinds.length; i++) for (let j = i + 1; j < kinds.length; j++) {
        const a = kinds[i], b = kinds[j]; if (pairOf.has([a, b].sort().join('|'))) continue;
        const lose = WATER.has(a) !== WATER.has(b) ? (WATER.has(a) ? b : a) : rank(a) < rank(b) ? a : b;
        c.forEach(([u, v], k) => { if (ts[k] === lose) { set(u, v, BUF); changed = true; } });
      }
      const ts2 = c.map(([a, b]) => at(a, b)), cnt = {}; ts2.forEach((t) => (cnt[t] = (cnt[t] ?? 0) + 1));
      const ks = Object.keys(cnt); if (ks.length < 3) continue;
      // 3+ terrains: buffer corners give way to the commonest other terrain (the buffer only shrinks, so this ends); else the rarest gives way
      const lose = cnt[BUF] ? BUF : ks.sort((a, b) => cnt[a] - cnt[b] || rank(a) - rank(b))[0];
      const to = ks.filter((k) => k !== lose).sort((a, b) => cnt[b] - cnt[a] || rank(b) - rank(a))[0];
      c.forEach(([u, v], k) => { if (ts2[k] === ks[0]) { set(u, v, to); changed = true; } });
    }
  }
  return at;
}
function tileFor(at, x, y, useVariants) {
  const c = [at(x, y), at(x + 1, y), at(x, y + 1), at(x + 1, y + 1)], kinds = [...new Set(c)];
  if (kinds.length === 1) {
    const t = kinds[0];
    if (useVariants && variants[t]) return variants[t][hash(x, y) % variants[t].length];
    const s = T.sheets.find((s) => s.first === t || s.second === t); return s ? sheets[s.pair].f[s.first === t ? 15 : 0] : null;
  }
  // last resort (the rule did not settle here): the commonest pair with a sheet, other corners count as its first terrain
  const cnt = {}; c.forEach((t) => (cnt[t] = (cnt[t] ?? 0) + 1));
  const ranked = kinds.sort((a, b) => cnt[b] - cnt[a]);
  let s = null; for (let i = 0; i < ranked.length && !s; i++) for (let j = i + 1; j < ranked.length && !s; j++) s = pairOf.get([ranked[i], ranked[j]].sort().join('|')) ?? null;
  if (!s) return null;
  if (kinds.length > 2) approx++;
  const m = c.reduce((m, t, i) => m | ((t !== s.second) << (3 - i)), 0);
  return sheets[s.pair].f[s.maskToFrame[m]];
}
let approx = 0;
function render(at, n, items = [], useVariants = true) {
  const W = 2 * n * HW + 40, H = 2 * n * HH + 440, OX = n * HW + 20, OY = 400;
  const img = fill(blank(W, H)); let missing = 0;
  const sx = (x, y) => OX + (x - y) * HW, sy = (x, y) => OY + (x + y) * HH;
  for (let d = 0; d <= 2 * (n - 1); d++) for (let x = 0; x < n; x++) {
    const y = d - x; if (y < 0 || y >= n) continue;
    const t = tileFor(at, x, y, useVariants); if (!t) { missing++; if (process.env.DEBUG) console.log("no sheet", x, y, [at(x, y), at(x + 1, y), at(x, y + 1), at(x + 1, y + 1)].join(",")); continue; }
    paste(img, t, Math.round(sx(x, y) - HW), Math.round(sy(x, y)));
  }
  items.sort((a, b) => a[1] + a[2] - (b[1] + b[2]));
  for (const [s, x, y] of items) paste(img, s.im, Math.round(sx(x, y) - s.anchor.x), Math.round(sy(x, y) + HH - s.anchor.y));
  return { img, missing };
}
function soldier(cls, row, col) {
  const dir = join(ROOT, 'src/assets/sheets', cls); if (!existsSync(dir)) return null;
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'))); const sheet = readImage(join(dir, m.image));
  const r = m.rows.indexOf(row), wrap = m.wrap ?? 1e9, band = Math.floor(col / wrap);
  const im = crop(sheet, { x: (col % wrap) * m.frame.w, y: (band * m.rows.length + r) * m.frame.h, w: m.frame.w, h: m.frame.h });
  const a = m.anchors?.[row] ?? m.anchor; return { im, anchor: { x: a.x, y: a.y } };
}

// ---- mountains (ART-8), 1:1: a stretch of the Iron Teeth with the Kleisoura Pass. The mountain mass is massif sprites (kind
// 'massif') over the impassable rock area instead of stacked cliff levels: footprint [fw, fh] tiles at (x0, y0) is rock
// ground, drawn flat; the sprite's anchor sits on the footprint's south vertex (x0 + fw, y0 + fh). An object is hidden by a
// massif when it stands in the massif's back quadrant (x < x0 + fw and y < y0 + fh); otherwise it is drawn after it.
if (BIOME === 'mountains') {
  const n = 56, V = [];
  const vn = (x, y, s, k) => { const X = Math.floor(x / s), Y = Math.floor(y / s), fx = x / s - X, fy = y / s - Y, h = (a, b) => (hash(a, b, k) % 1000) / 1000, sm = (t) => t * t * (3 - 2 * t), u = sm(fx), v = sm(fy); return (h(X, Y) * (1 - u) + h(X + 1, Y) * u) * (1 - v) + (h(X, Y + 1) * (1 - u) + h(X + 1, Y + 1) * u) * v; };
  // two chains along the tile x axis, north and south of the pass, plus single peaks at the ends
  // north: a back row and a front row, staggered; south: the front row of the other side (its peaks rise over the pass)
  const M = [['massif-high-x', -8, -2], ['massif-high-x', 9, -3], ['massif-high-x', 26, -2], ['massif-high-x', 43, -3],
    ['massif-c-x', -2, 5], ['massif-high-x', 15, 5], ['massif-c-x', 33, 6], ['peak-d', 50, 7],
    ['massif-b-x', -6, 13], ['peak-big-x', 10, 13], ['massif-a-x', 16, 14], ['ridge-c-x', 33, 14], ['massif-c-x', 42, 13],
    ['massif-a-x', -4, 36], ['massif-c-x', 13, 37], ['peak-twin-x', 29, 36], ['massif-a-x', 34, 37], ['massif-b-x', 50, 36],
    ['massif-c-x', 4, 42], ['massif-a-x', 22, 43], ['massif-b-x', 40, 42], ['massif-a-x', -8, 48], ['massif-c-x', 12, 49], ['massif-a-x', 30, 48], ['massif-b-x', 46, 49]]
    .map(([id, x0, y0]) => ({ s: objs[id], x0, y0, fw: objs[id].footprint[0], fh: objs[id].footprint[1] }));
  const inM = (x, y, pad = 0) => M.some((m) => x >= m.x0 - pad && x < m.x0 + m.fw + pad && y >= m.y0 - pad && y < m.y0 + m.fh + pad);
  const road = (x) => 26 + Math.round(2.5 * Math.sin(x / 4)); // a winding track along x
  const at0 = (x, y) => {
    if (inM(x, y)) return 'rock';
    if (Math.abs(y - road(x)) <= 0 || Math.abs(y - road(x + 1)) <= 0) return 'road';
    if (Math.abs(y - road(x)) <= 2 && vn(x, y, 3, 5) > 0.5) return 'gravel';
    if (inM(x, y, 1 + Math.round(2 * vn(x, y, 3, 1)))) return 'scree';
    if (y < 21 || y > 31) return vn(x, y, 5, 3) > 0.35 ? 'meadow' : 'grass';
    return vn(x, y, 6, 4) > 0.7 ? 'meadow' : 'grass';
  };
  for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) V.push(at0(x, y));
  const at = resolve(V, n), cell = (x, y) => { const c = [at(x, y), at(x + 1, y), at(x, y + 1), at(x + 1, y + 1)]; return c.every((t) => t === c[0]) ? c[0] : null; };
  const items = [], used = new Set();
  const put = (id, x, y, ox = 0.5, oy = 0.5) => { if (!objs[id] || used.has(`${x},${y}`) || inM(x, y)) return false; used.add(`${x},${y}`); items.push([objs[id], x + ox, y + oy]); return true; };
  const pick = (ids, x, y) => ids[hash(x, y, 9) % ids.length];
  // the pass: watch post on a knoll, cairns and road edges along the road, a rockfall, the tin and iron nodes, a squad
  for (const x of [12, 20, 33, 45]) put('road-edge', x, road(x) + 2, 0.5, 0.2);
  put('watch-post', 30, 21); put('cairn', 22, road(22) - 1); put('cairn', 40, road(40) + 2); put('cairn', 9, road(9) - 1);
  put('rockfall', 17, road(17) + 3); put('boulder-field', 35, road(35) - 4); put('tin-ore', 24, 33); put('iron-ore', 8, 20);
  put('eagle-nest', 39, 20); put('ibex', 21, 21); put('ibex', 47, 33); put('bear', 50, 21); put('alpine-grass', 24, 27);
  const hop = soldier('hoplite', 'south-east', 0), hop2 = soldier('hoplite', 'south-west', 40), arc = soldier('archer', 'south-east', 0);
  const sq = [27, road(27)]; for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) hop && items.push([(i + j) % 2 && hop2 ? hop2 : hop, sq[0] - 1 + i * 0.6, sq[1] + 0.2 + j * 0.5]);
  if (arc) items.push([arc, sq[0] + 2.4, sq[1] + 0.3], [arc, sq[0] + 2.9, sq[1] + 0.8]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const t = cell(x, y), h = hash(x, y, 7) % 1000; if (!t || Math.abs(y - road(x)) <= 3) continue;
    let id = null;
    if ((t === 'grass' || t === 'meadow') && inM(x, y, 5) && h < 200) id = pick(['fir', 'fir', 'black-pine', 'fir-snow', 'fir'], x, y);
    else if (t === 'meadow' && h < 90) id = pick(['juniper', 'rhododendron', 'alpine-grass', 'alpine-grass'], x, y);
    else if (t === 'grass' && h < 40) id = pick(['juniper', 'black-pine', 'alpine-grass'], x, y);
    else if (t === 'scree' && h < 40) id = pick(['juniper', 'cairn', 'boulder-field'], x, y);
    if (id) put(id, x, y, 0.3 + (hash(x, y, 3) % 40) / 100, 0.3 + (hash(x, y, 5) % 40) / 100);
  }
  // draw: ground, objects behind a massif, massifs back to front, the rest
  const W = 2 * n * HW + 40, H = 2 * n * HH + 600, OX = n * HW + 20, OY = 560, img = fill(blank(W, H));
  const sx = (x, y) => OX + (x - y) * HW, sy = (x, y) => OY + (x + y) * HH;
  for (let d = 0; d <= 2 * (n - 1); d++) for (let x = 0; x < n; x++) { const y = d - x; if (y < 0 || y >= n) continue; const t = tileFor(at, x, y, true); if (t) paste(img, t, Math.round(sx(x, y) - HW), Math.round(sy(x, y))); }
  const drawItem = ([s, x, y]) => paste(img, s.im, Math.round(sx(x, y) - s.anchor.x), Math.round(sy(x, y) + HH - s.anchor.y));
  const behind = ([, x, y]) => M.some((m) => x < m.x0 + m.fw && y < m.y0 + m.fh && x > m.x0 - 8 && y > m.y0 - 8);
  const byDepth = (a, b) => a[1] + a[2] - (b[1] + b[2]);
  items.filter(behind).sort(byDepth).forEach(drawItem);
  [...M].sort((a, b) => a.x0 + a.fw + a.y0 + a.fh - (b.x0 + b.fw + b.y0 + b.fh)).forEach((m) => drawItem([m.s, m.x0 + m.fw - 0.5, m.y0 + m.fh - 0.5]));
  items.filter((i) => !behind(i)).sort(byDepth).forEach(drawItem);
  const out = crop(img, { x: 0, y: 40, w: img.w, h: img.h - 120 });
  writeImage(join(OUT, 'MOUNTAINS_range_1x.png'), out);
  const z = crop(img, { x: Math.round(sx(27, 25)) - 800, y: Math.round(sy(27, 25)) - 560, w: 1600, h: 900 });
  writeImage(join(OUT, 'MOUNTAINS_pass_1x.png'), z);
  console.log(`mountains range ${n}x${n}: ${M.length} massifs, ${items.length} items ->`, OUT);
  process.exit(0);
}

// ---- biome patch, 1:1: an Elaia hillside over a bay (dry grass, terra rossa vineyard, olive grove behind dry-stone walls,
// marble outcrops with the quarry and the marble node, a pebble beach), its objects, goats, a boar and a squad of soldiers.
// Organic borders come from value noise; the tiles.json fallback settles the pairs with no sheet.
if (BIOME) {
  const n = 40, V = [];
  const vn = (x, y, s, k) => { // smooth value noise in 0..1
    const X = Math.floor(x / s), Y = Math.floor(y / s), fx = x / s - X, fy = y / s - Y, h = (a, b) => (hash(a, b, k) % 1000) / 1000;
    const sm = (t) => t * t * (3 - 2 * t), u = sm(fx), v = sm(fy);
    return (h(X, Y) * (1 - u) + h(X + 1, Y) * u) * (1 - v) + (h(X, Y + 1) * (1 - u) + h(X + 1, Y + 1) * u) * v;
  };
  const elaiaAt = (x, y) => {
    const coast = 0.42 * n - Math.hypot(x - n - 2, y - n + 4) + 7 * (vn(x, y, 5, 1) - 0.5); // a round bay in the south corner
    if (coast > 7) return 'deep'; if (coast > 3.5) return 'shallow'; if (coast > 0) return 'sand';
    if (Math.hypot(x - 8, y - 9) < 6.5 + 4 * (vn(x, y, 4, 2) - 0.5)) return 'marble';
    if (x > 17 && x < 32 && y > 3 && y < 15 && vn(x, y, 5, 3) > 0.25) return 'grove';
    if (Math.hypot(x - 9, y - 27) < 6 + 3 * (vn(x, y, 4, 4) - 0.5)) return 'rossa';
    if (vn(x, y, 7, 5) > 0.5) return 'dry';
    return 'grass';
  };
  // Kyrene: an oasis pool ringed by oasis grass on desert sand, dunes to the north-east, a red-rock shelf with a mesa and
  // the copper node to the south-east, a hardpan pan, stony reg and a salt flat in the west corner.
  const kyreneAt = (x, y) => {
    const pool = Math.hypot(x - 12, y - 13) + 2 * (vn(x, y, 3, 1) - 0.5);
    if (pool < 3) return 'shallow';
    if (pool < 8 + 3 * (vn(x, y, 4, 2) - 0.5)) return 'oasis';
    if (Math.hypot(x - 30, y - 29) < 8 + 4 * (vn(x, y, 4, 3) - 0.5)) return 'redrock';
    if (Math.hypot(x - 7, y - 33) < 5.5 + 3 * (vn(x, y, 3, 4) - 0.5)) return 'salt';
    if (Math.hypot(x - 18, y - 32) < 4.5 + 2 * (vn(x, y, 3, 6) - 0.5)) return 'hardpan';
    if (x > 22 && y < 20 && vn(x, y, 5, 5) > 0.35) return 'dune';
    if (vn(x, y, 6, 7) > 0.72) return 'reg';
    return 'sand';
  };
  const terrainAt = BIOME === 'kyrene' ? kyreneAt : elaiaAt;
  for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) V.push(terrainAt(x, y));
  const at = resolve(V, n), cell = (x, y) => { const c = [at(x, y), at(x + 1, y), at(x, y + 1), at(x + 1, y + 1)]; return c.every((t) => t === c[0]) ? c[0] : null; };
  const items = [], used = new Set(), free = (x, y, w = 1, h = 1) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (used.has(`${x + i},${y + j}`)) return false; return true; };
  const put = (id, x, y, w = 1, h = 1, ox = 0.5, oy = 0.5) => { if (!objs[id] || !free(x, y, w, h)) return false; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) used.add(`${x + i},${y + j}`); items.push([objs[id], x + ox, y + oy]); return true; };
  const pick = (ids, x, y) => ids[hash(x, y, 9) % ids.length];
  const hop = soldier('hoplite', 'south-east', 0), hop2 = soldier('hoplite', 'south-west', 40), arc = soldier('archer', 'south-east', 0);
  const squad = (sq) => { // 2 files of 4 hoplites and 2 archers
    for (let j = -2; j <= 5; j++) for (let i = -2; i <= 4; i++) used.add(`${sq[0] + i},${sq[1] + j}`);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) hop && items.push([(i + j) % 2 && hop2 ? hop2 : hop, sq[0] - 1 + i * 0.55 + j * 0.5, sq[1] + 1 - i * 0.55 + j * 0.5]);
    if (arc) items.push([arc, sq[0] + 2, sq[1] + 2], [arc, sq[0] + 2.5, sq[1] + 2.4]);
  };
  let placed = 0;
  const jitter = (id, x, y) => put(id, x, y, 1, 1, 0.3 + (hash(x, y, 3) % 40) / 100, 0.3 + (hash(x, y, 5) % 40) / 100) && placed++;
  if (BIOME === 'kyrene') {
    // set pieces: the mesa, pillar, copper node and boulders on the red rock; spring, well, tent and camels round the oasis
    put('mesa', 26, 26, 8, 8, 4, 4); put('rock-pillar', 21, 35); put('copper-ore', 35, 29, 2, 1, 1, 0.5); put('boulder-red', 27, 24); put('rocks-red', 35, 35); // the mesa is a 33 m ridge across the shelf
    put('oasis-spring', 15, 7, 2, 1, 1, 0.5); put('well', 20, 14); put('nomad-tent', 22, 7, 2, 2, 1, 1); put('camels', 25, 10, 2, 1, 1, 0.5);
    put('ruin-wall', 4, 22, 2, 1, 1, 0.5); put('ruin-corner', 6, 24, 2, 2, 1, 1); put('gazelle', 36, 12); put('jackal', 13, 30);
    squad([14, 21]);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const t = cell(x, y), h = hash(x, y, 7) % 1000; if (!t) continue;
      const shore = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => at(x + dx, y + dy) === 'shallow' || at(x + 1 + dx, y + 1 + dy) === 'shallow');
      let id = null;
      if (t === 'oasis' && shore && h < 600) id = 'reeds';
      else if (t === 'oasis' && (x + 2 * y) % 3 === 0 && h < 700) id = pick(['date-palm-tall', 'date-palm-mid', 'date-palm-fruit', 'doum-palm', 'date-palm-young', 'date-palm-clump', 'tamarisk'], x, y);
      else if (t === 'oasis' && h < 120) id = pick(['saltbush', 'reeds', 'dry-grass'], x, y);
      else if (t === 'redrock' && h < 60) id = pick(['rocks-red', 'boulder-red', 'camelthorn'], x, y);
      else if (t === 'dune' && h < 25) id = pick(['dry-grass', 'camelthorn'], x, y);
      else if (t === 'reg' && h < 50) id = pick(['saltbush', 'camelthorn', 'dry-grass', 'rocks-red'], x, y);
      else if (t === 'hardpan' && h < 30) id = pick(['dry-grass', 'thorn-tree'], x, y);
      else if (t === 'sand' && h < 45) id = pick(['acacia', 'acacia-old', 'thorn-tree', 'broom', 'saltbush', 'camelthorn', 'dry-grass', 'dry-grass', 'tamarisk'], x, y);
      if (id) jitter(id, x, y);
    }
  } else {
  // set pieces first: quarry + marble node + crags + goats, the grove's walls, harvest spot, shrine and hives, vineyard rows
  put('marble-quarry', 6, 6, 2, 2, 1, 1); put('marble-deposit', 9, 9, 2, 1, 1, 0.5); put('marble-outcrop-a', 3, 11, 2, 1, 1, 0.5); put('goats', 11, 13, 2, 1, 1, 0.5);
  for (let x = 18; x < 32; x += 2) put('wall-b', x, 16, 2, 1, 1.9, 0.5); // wall-b runs along x, wall-a along y; anchor = lower end
  for (let y = 4; y < 16; y += 2) put('wall-a', 16, y, 1, 2, 0.5, 1.9);
  put('olive-harvest', 24, 10); put('shrine', 19, 19); put('beehives', 23, 18);
  for (let x = 4; x <= 14; x += 2) for (let y = 21; y <= 32; y += 2) if (cell(x, y) === 'rossa' && cell(x, y + 1) === 'rossa') put('vines', x, y, 1, 2, 0.5, 1.9); // rows along y
  squad([14, 18]); // on open ground in the middle
  // scatter by terrain
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const t = cell(x, y), h = hash(x, y, 7) % 1000; if (!t) continue;
    let id = null;
    if (t === 'grove' && x % 3 === 0 && y % 3 === 1) id = pick(['olive-ancient', 'olive-orchard', 'olive-tall', 'olive-orchard'], x, y);
    else if (t === 'marble' && h < 70) id = pick(['marble-outcrop-b', 'herbs', 'maquis-a', 'marble-outcrop-b'], x, y);
    else if (t === 'dry' && h < 45) id = pick(['maquis-a', 'maquis-b', 'maquis-c', 'herbs', 'herbs', 'olive-orchard'], x, y);
    else if (t === 'grass' && h < 30) id = pick(['cypress-tall', 'cypress-flame', 'stone-pine', 'holm-oak', 'maquis-a', 'olive-tall'], x, y);
    else if (t === 'sand' && h < 15) id = 'herbs';
    if (id) jitter(id, x, y);
  }
  for (const [x, y] of [[30, 2], [31, 4], [33, 3]]) put(pick(['cypress-tall', 'cypress-flame'], x, y), x, y); // a cypress line behind the grove
  if (!put('boar', 27, 21)) put('boar', 26, 19);
  }
  approx = 0;
  const { img, missing } = render(at, n, items, true);
  writeImage(join(OUT, `${PFX}_patch_1x.png`), crop(img, { x: 0, y: 160, w: img.w, h: img.h - 180 }));
  const z = crop(img, { x: Math.round(img.w / 2) - 420, y: 400 + 32 * HH - 240, w: 760, h: 420 });
  writeImage(join(OUT, `${PFX}_patch_zoom2x.png`), resizeNearest(z, z.w * 2, z.h * 2));
  console.log(`${BIOME} patch ${n}x${n}: ${missing} tiles without a sheet, ${approx} 3-terrain tiles drawn as a pair, ${placed} scattered objects, ${items.length} items ->`, OUT);
  process.exit(0); // the variants field and the test-ridge windows below are for the global set
}

// ---- variants field: 24 x 24 of big single-terrain patches, without (left) and with (right) variant fills
{
  const n = 24, V = [];
  for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) {
    let t = 'grass';
    if (x < 9 && y < 10) t = 'forest';
    else if (x >= 15 && y < 11) t = 'marsh';
    else if (x < 10 && y >= 14) t = 'sand';
    else if (x >= 14 && y >= 15) t = 'dirt';
    V.push(t);
  }
  const at = resolve(V, n), a = render(at, n, [], false).img, b = render(at, n, [], true).img;
  const cut = (im) => crop(im, { x: 0, y: 380, w: im.w, h: im.h - 400 });
  const A = cut(a), B = cut(b), both = fill(blank(A.w * 2 + 20, A.h));
  paste(both, A, 0, 0); paste(both, B, A.w + 20, 0);
  writeImage(join(OUT, `${PFX}_variants_1x.png`), both);
}

// ---- test-ridge windows, 1:1
const R = JSON.parse(readFileSync(join(ROOT, 'src/war/regions/test-ridge.json')));
const cellT = (x, y) => { const i = y * R.w + x; return R.water[i] === 2 ? 'deep' : R.water[i] === 1 ? 'shallow' : R.terrain[i]; };
const hop = soldier('hoplite', 'south-east', 0), hop2 = soldier('hoplite', 'south-west', 40), arc = soldier('archer', 'south-east', 0);
const report = [];
for (const [name, x0, y0, n] of [['ford', 248, 104, 40], ['marsh-ridge', 264, 216, 40]]) {
  const V = []; for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) V.push(cellT(Math.min(R.w - 1, x0 + x), Math.min(R.h - 1, y0 + y)));
  const raw = V.slice(), at = resolve(V, n);
  const moved = V.filter((t, i) => t !== raw[i]).length;
  const items = []; let placed = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const t = at(x, y), h = hash(x + x0, y + y0, 7) % 1000, ox = (hash(x, y, 3) % 60) / 100, oy = (hash(x, y, 5) % 60) / 100;
    const pick = (ids) => objs[ids[hash(x, y, 9) % ids.length]];
    let o = null;
    if (t === 'forest' && h < 300) o = pick(['pine-a', 'pine-b', 'stone-pine', 'oak', 'pine-a', 'stone-pine']);
    else if (t === 'grass' && h < 22) o = pick(['olive-a', 'olive-b', 'bush-a', 'bush-b', 'stone-pine', 'cypress', 'dead-tree']);
    else if (t === 'marsh' && h < 140) o = pick(['reeds', 'reeds', 'bush-b']);
    else if (t === 'rock' && h < 50) o = pick(['boulder-a', 'boulder-b']);
    else if (t === 'sand' && h < 12) o = pick(['bush-a', 'boulder-b']);
    if (o) { items.push([o, x + ox + 0.2, y + oy + 0.2]); placed++; }
  }
  // a watchtower and a ruin on open grass near the middle, a file of hoplites and two archers
  const spot = (pred) => { for (let r = 0; r < n / 2; r++) for (let d = -r; d <= r; d++) for (const [x, y] of [[n / 2 + d, n / 2 - r], [n / 2 + r, n / 2 + d]]) { if (pred(x, y)) return [x, y]; } return null; };
  const open = (w) => (x, y) => { for (let dy = -w; dy <= w; dy++) for (let dx = -w; dx <= w; dx++) if (at(x + dx, y + dy) !== 'grass') return false; return true; };
  const tw = spot(open(2)); if (tw) items.push([objs.watchtower, tw[0] + 1, tw[1] + 1]);
  const ru = spot((x, y) => open(1)(x, y) && (!tw || Math.abs(x - tw[0]) + Math.abs(y - tw[1]) > 6)); if (ru) items.push([objs['wall-ruin'], ru[0] + 0.5, ru[1] + 0.5]);
  const sq = spot((x, y) => open(2)(x, y) && (!tw || Math.abs(x - tw[0]) + Math.abs(y - tw[1]) > 5) && (!ru || Math.abs(x - ru[0]) + Math.abs(y - ru[1]) > 4));
  if (sq) { for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) hop && items.push([(i + j) % 2 && hop2 ? hop2 : hop, sq[0] - 1 + i * 0.55 + j * 0.5, sq[1] + 1 - i * 0.55 + j * 0.5]); arc && items.push([arc, sq[0] + 2, sq[1] + 2], [arc, sq[0] + 2.5, sq[1] + 2.4]); }
  approx = 0;
  const { img, missing } = render(at, n, items, true);
  writeImage(join(OUT, `${PFX}_ridge_${name}_1x.png`), crop(img, { x: 0, y: 200, w: img.w, h: img.h - 220 }));
  const z = crop(img, { x: Math.round(img.w / 2) - 300, y: Math.round(img.h / 2) - 60, w: 600, h: 340 });
  writeImage(join(OUT, `${PFX}_ridge_${name}_zoom2x.png`), resizeNearest(z, z.w * 2, z.h * 2));
  report.push(`${name} (${x0},${y0} ${n}x${n}): ${moved} vertices moved by the fallback, ${missing} tiles without a sheet, ${approx} 3-terrain tiles drawn as a pair, ${placed} objects`);
}
console.log(report.join('\n') + '\n->', OUT);
