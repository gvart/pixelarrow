// W-51 tile approach for landmarks (PROMPTS_ART.md 40h): fetch the PixelLab raws of the crag + cliff kit, rubble ground,
// debris and street dressing (tile-art-jobs.json), and render 1:1 mock-ups of a crag citadel and a butte city laid out
// from the built tiles, cliff faces, objects and landmark pieces the way the region view draws them (heights in 2 m levels,
// cliff strips stacked per level: the lip under the edge, faces below, darker toward the foot).
// Usage: node scripts/war/art/tile-art.mjs --fetch      (raws into shots/war/pixellab/<batch>/raw, git-ignored)
//        node scripts/war/art/tile-art.mjs [out dir]    (mock-ups, default shots/war/tile-art/)
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, crop, resizeArea } from '../../art/lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const PIX = '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/pixellab';
const args = process.argv.slice(2);
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

if (args.includes('--fetch')) {
  const J = read('scripts/war/art/tile-art-jobs.json'), USER = '8842657e-a1a9-4211-968e-4924a65fa8ac';
  const get = async (url, f) => { if (existsSync(f) && !args.includes('--force')) return; const r = await fetch(url); if (!r.ok) { console.log(`skip ${f}: ${r.status}`); return; } mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, Buffer.from(await r.arrayBuffer())); console.log('->', f); };
  for (const [k, id] of Object.entries(J.tiles)) { const [b, dir] = k.split('/'); for (let i = 0; i < 16; i++) await get(`https://backblaze.pixellab.ai/file/pixellab-tiles/${USER}/${id}/tile_${i}.png`, join(PIX, b, 'raw/tiles', dir, `tile_${i}.png`)); }
  for (const [k, id] of Object.entries(J.objects)) { const [b, n] = k.split('/'); await get(`https://api.pixellab.ai/mcp/map-objects/${id}/download`, join(PIX, b, 'raw/objects', `${n}.png`)); }
  process.exit(0);
}

const OUT = args[0] ?? join('/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/tile-art');
mkdirSync(OUT, { recursive: true });
const TW = 64, HW = 32, HH = 16, LH = 16;
const hash = (x, y, k = 0) => { let h = (x * 374761393 + y * 668265263 + k * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const vnoise = (x, y, k) => { const X = Math.floor(x), Y = Math.floor(y), fx = x - X, fy = y - Y, s = (t) => t * t * (3 - 2 * t), u = s(fx), v = s(fy); return (hash(X, Y, k) * (1 - u) + hash(X + 1, Y, k) * u) * (1 - v) + (hash(X, Y + 1, k) * (1 - u) + hash(X + 1, Y + 1, k) * u) * v; };
const fbm = (x, y, k) => 0.55 * vnoise(x, y, k) + 0.3 * vnoise(2 * x, 2 * y, k + 7) + 0.15 * vnoise(4 * x, 4 * y, k + 13);

/** The art of one biome: global + biome sheets, variants, cliffs and objects, plus the landmark sprites. */
function library(biome) {
  const G = read('public/war/tiles/tiles.json'), B = read(`public/war/biomes/${biome}/tiles.json`);
  const GO = read('public/war/objects/objects.json'), BO = read(`public/war/biomes/${biome}/objects.json`), L = read('public/war/landmarks/landmarks.json');
  const gd = 'public/war/tiles', bd = `public/war/biomes/${biome}`, img = new Map();
  const im = (f) => img.get(f) ?? img.set(f, readImage(join(ROOT, f))).get(f);
  const sheets = new Map();
  for (const [T, d] of [[G, gd], [B, bd]]) for (const s of T.sheets) sheets.set([s.first, s.second].sort().join('|'), { ...s, f: join(d, s.file) });
  const bv = new Set(B.variants.map((v) => v.terrain)), variants = new Map();
  for (const v of G.variants) if (!bv.has(v.terrain)) variants.set(v.terrain, { ...v, f: join(gd, v.file) });
  for (const v of B.variants) variants.set(v.terrain, { ...v, f: join(bd, v.file) });
  const cliffs = new Map();
  for (const [T, d] of [[G, gd], [B, bd]]) for (const c of T.cliffs ?? []) cliffs.set(c.id, { ...c, f: join(d, c.file) });
  const objs = new Map();
  for (const o of GO.objects) objs.set(o.id, { ...o, f: join('public/war/objects', o.file) });
  for (const o of BO.objects) objs.set(o.id, { ...o, f: join(bd, o.file) });
  for (const o of L.objects) objs.set(o.id, { ...o, f: join('public/war/landmarks', o.file) });
  return { sheets, variants, cliffs, objs, im, order: B.fallback.order };
}

/**
 * A scene: W x H tiles, z(x, y) levels (2 m), vt(x, y) vertex terrain (x 0..W, y 0..H), cliff(x, y) the material of the
 * faces under tile (x, y), items [{ id, x, y }] (an object at a ground point, tile units) or [{ id, x0, y0, fp }] (a
 * landmark sprite on its footprint). Drawn row by row, objects after the tiles of their front row.
 */
function render(lib, S, name, scale = 0.5) {
  const { W, H } = S, Z = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : S.z[y * W + x]);
  let zMax = 0; for (const v of S.z) zMax = Math.max(zMax, v);
  const top = zMax * LH + 420, OX = H * HW + 8, OY = top;
  const img = blank((W + H) * HW + 16, (W + H) * HH + top + 80), d = img.data;
  for (let i = 0; i < img.w * img.h; i++) d.set(S.bg ?? [24, 22, 26, 255], i * 4);
  const sx = (x, y) => OX + (x - y) * HW, sy = (x, y, z) => OY + (x + y) * HH - z * LH;
  const blit = (src, x0, y0, sxo, syo, w, h, dx, dy, shade = 1) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const X = dx + x, Y = dy + y; if (X < 0 || Y < 0 || X >= img.w || Y >= img.h) continue;
      const j = ((syo + y) * src.w + sxo + x) * 4; if (!src.data[j + 3]) continue;
      const t = (Y * img.w + X) * 4; for (let c = 0; c < 3; c++) d[t + c] = Math.round(src.data[j + c] * shade); d[t + 3] = 255;
    }
  };
  const tileImg = (x, y) => {
    const c = [S.vt(x, y), S.vt(x + 1, y), S.vt(x, y + 1), S.vt(x + 1, y + 1)]; // NW NE SW SE
    const n = new Map(); c.forEach((t) => n.set(t, (n.get(t) ?? 0) + 1));
    let ts = [...n.keys()].sort((a, b) => n.get(b) - n.get(a) || lib.order.indexOf(b) - lib.order.indexOf(a));
    if (ts.length > 2) { const keep = ts.slice(0, 2); for (let i = 0; i < 4; i++) if (!keep.includes(c[i])) c[i] = keep[0]; ts = keep; }
    if (ts.length === 2) {
      const s = lib.sheets.get([...ts].sort().join('|'));
      if (s) { const m = (c[0] === s.first) << 3 | (c[1] === s.first) << 2 | (c[2] === s.first) << 1 | (c[3] === s.first); return [lib.im(s.f), s.maskToFrame[m]]; }
      ts = [ts[0]];
    }
    const v = lib.variants.get(ts[0]);
    if (v) return [lib.im(v.f), Math.floor(hash(x, y, 5) * v.frames)];
    for (const s of lib.sheets.values()) if (s.first === ts[0] || s.second === ts[0]) return [lib.im(s.f), s.first === ts[0] ? s.maskToFrame[15] : s.maskToFrame[0]];
    throw new Error(`no tile for ${ts[0]}`);
  };
  const items = new Map();
  for (const it of S.items) {
    const o = lib.objs.get(it.id); if (!o) { console.log(`${name}: no sprite ${it.id}`); continue; }
    const row = it.fp ? it.x0 + it.fp[0] - 1 + it.y0 + it.fp[1] - 1 : Math.floor(it.x) + Math.floor(it.y);
    (items.get(row) ?? items.set(row, []).get(row)).push({ ...it, o });
  }
  for (let v = 0; v <= W + H - 2; v++) {
    for (let x = Math.max(0, v - H + 1); x <= Math.min(W - 1, v); x++) {
      const y = v - x, z = Z(x, y), tx = sx(x, y) - HW, ty = sy(x, y, z);
      const [t, f] = tileImg(x, y); blit(t, 0, 0, f * TW, 0, TW, 48, tx, ty);
      const drop = z - Math.min(Z(x + 1, y), Z(x, y + 1));
      if (drop > 0) {
        const c = lib.cliffs.get(S.cliff(x, y)), ci = lib.im(c.f), roles = c.roles ?? { face: [0] };
        for (let k = drop - 1; k >= 0; k--) {
          const role = k === 0 && roles.lip ? 'lip' : k >= drop - 1 && drop >= 3 && roles.low ? 'low' : 'face', list = roles[role];
          const fr = list[Math.floor(hash(x, y, k + 11) * list.length)];
          blit(ci, 0, 0, fr * TW, 0, TW, 32, tx, ty + HH + k * LH, 1 - 0.32 * (k / Math.max(1, drop)) - 0.04 * hash(x, y, k));
        }
      }
    }
    const its = (items.get(v) ?? []).sort((a, b) => (a.fp ? a.x0 + a.y0 : a.x + a.y) - (b.fp ? b.x0 + b.y0 : b.x + b.y));
    for (const it of its) {
      const o = it.o, im = lib.im(o.f);
      if (it.fp) { const z = it.z ?? Z(it.x0, it.y0); blit(im, 0, 0, 0, 0, im.w, im.h, sx(it.x0, it.y0) - o.tileOrigin.x, sy(it.x0, it.y0, z) - o.tileOrigin.y); }
      else { const z = it.z ?? Z(Math.floor(it.x), Math.floor(it.y)); blit(im, 0, 0, 0, 0, im.w, im.h, Math.round(sx(it.x, it.y) - o.anchor.x), Math.round(sy(it.x, it.y, z) - o.anchor.y)); }
    }
  }
  const cut = crop(img, { x: 0, y: Math.max(0, OY - zMax * LH - 380), w: img.w, h: img.h - Math.max(0, OY - zMax * LH - 380) });
  writeImage(join(OUT, `${name}.png`), cut);
  writeImage(join(OUT, `${name}-half.png`), resizeArea(cut, Math.round(cut.w * scale), Math.round(cut.h * scale)));
  console.log(`${name}: ${cut.w}x${cut.h}`);
}

// ---- Drakon's Citadel on its crag (reference: krios_h: a castle crowning a snowy rock crag, cliff faces, snow drifts)
function citadel() {
  const W = 46, H = 46, cx = 23, cy = 21, z = new Array(W * H).fill(0);
  const r = (x, y, k) => { const a = Math.atan2(y - cy, x - cx), d = Math.hypot(x - cx, (y - cy) * 1.1); return d / (1 + 0.5 * (fbm(Math.cos(a) * 1.8 + 3, Math.sin(a) * 1.8 + 3, 3 + k) - 0.5)); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { z[y * W + x] = r(x, y, 0) < 8.5 ? 15 : r(x, y, 1) < 12.5 ? 11 : r(x, y, 2) < 15.5 ? 7 : r(x, y, 3) < 17.5 ? 3 : 0; }
  // the switchback road up the south-east face: steps of one level a tile (no cliff), a hairpin on each terrace
  const road = new Set(), step = (x, y, h) => { z[y * W + x] = h; road.add(`${x},${y}`); };
  // leg 1 climbs north-west along x from the glacier to the 7 terrace, a hairpin, leg 2 climbs along y to the 11 terrace
  for (let i = 0; i < 8; i++) step(40 - i, 36, i);
  for (let i = 0; i < 5; i++) step(32, 35 - i, 7 + Math.min(4, i));
  const Zt = (x, y) => z[y * W + x];
  const vt = (x, y) => {
    if (x <= 0 || y <= 0 || x >= W || y >= H) return 'drift';
    const zs = [Zt(x - 1, y - 1), Zt(x, y - 1), Zt(x - 1, y), Zt(x, y)], hi = Math.max(...zs), n = fbm(x / 5, y / 5, 9);
    if ([[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]].some(([a, b]) => road.has(`${a},${b}`))) return 'road';
    if (hi === 0) return n > 0.68 ? 'rock' : 'drift';
    if (hi >= 15) return Math.hypot(x - cx, y - cy) < 6.5 ? 'road' : n > 0.55 ? 'drift' : 'rock';
    if (hi >= 11) return n > 0.5 ? 'drift' : 'rock';
    return n > 0.45 ? 'drift' : 'rock';
  };
  const cliff = (x, y) => { const n = hash(x, y, 4), h = Zt(x, y); return h <= 3 ? (n < 0.5 ? 'granite-ice' : 'granite-snow') : n < 0.35 ? 'granite-snow' : 'granite'; };
  const items = [
    { id: 'citadel-keep-intact', x0: cx - 3, y0: cy - 3, fp: [6, 6] },
    { id: 'citadel-tower-intact', x0: cx - 8, y0: cy - 6, fp: [3, 3] }, { id: 'citadel-tower-intact', x0: cx + 5, y0: cy - 7, fp: [3, 3] },
    { id: 'citadel-tower-ruined', x0: cx + 6, y0: cy + 4, fp: [3, 3] }, { id: 'citadel-tower-ruined', x0: cx - 7, y0: cy + 5, fp: [3, 3] },
    { id: 'citadel-curtain-x-intact', x0: cx - 5, y0: cy - 7, fp: [4, 2] }, { id: 'citadel-curtain-x-intact', x0: cx - 1, y0: cy - 7, fp: [4, 2] },
    { id: 'citadel-curtain-y-intact', x0: cx - 8, y0: cy - 3, fp: [2, 4] }, { id: 'citadel-curtain-y-intact', x0: cx - 8, y0: cy + 1, fp: [2, 4] },
    // the lower ward on the 10 terrace: barracks, stables, blocks
    { id: 'arch-barracks-damaged', x0: cx - 12, y0: cy - 2, fp: [6, 4] }, { id: 'arch-stables-intact', x0: cx + 9, y0: cy - 8, fp: [6, 3] },
    { id: 'arch-block-c-intact', x0: cx - 2, y0: cy + 9, fp: [4, 4] }, { id: 'arch-block-b-damaged', x0: cx + 3, y0: cy + 9, fp: [3, 3] },
    { id: 'arch-block-a-intact', x0: cx + 9, y0: cy + 2, fp: [2, 2] }, { id: 'citadel-gatehouse-x-intact', x0: cx + 4, y0: cy + 10, fp: [6, 3] },
    // the ruined village at the crag foot
    { id: 'arch-block-a-ruined', x0: 4, y0: 36, fp: [2, 2] }, { id: 'arch-block-b-ruined', x0: 7, y0: 39, fp: [3, 3] }, { id: 'arch-block-a-ruined', x0: 11, y0: 41, fp: [2, 2] },
  ];
  // talus and drifts along the crag foot and the terrace edges, ice on the glacier
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const h = Zt(x, y), up = Math.max(Zt(x - 1, y), Zt(x, y - 1)); if (up <= h) continue;
    const n = hash(x, y, 21);
    if (h === 0 && n < 0.32) items.push({ id: 'mountains/talus-granite', x: x + 0.5, y: y + 0.5 });
    else if (h > 0 && n < 0.25) items.push({ id: 'mountains/snow-drift', x: x + 0.5, y: y + 0.5 });
  }
  for (const [x, y] of [[6, 10], [38, 8], [41, 30], [10, 26], [34, 43]]) items.push({ id: 'mountains/ice-patch', x, y });
  const lib = library('mountains');
  for (const o of lib.objs.values()) if (o.id.startsWith('mountains/')) break;
  for (const [k, v] of [...lib.objs]) if (!k.includes('/') && read('public/war/biomes/mountains/objects.json').objects.some((o) => o.id === k)) lib.objs.set(`mountains/${k}`, v);
  render(lib, { W, H, z, vt, cliff, items, bg: [172, 184, 196, 255] }, 'citadel-crag');
}

// ---- the Dead City of Ammon on its butte (reference: ammon_q: dense mudbrick blocks on a red butte, courtyards, palms)
function ammon() {
  const W = 50, H = 50, z = new Array(W * H).fill(0), x0 = 9, y0 = 8, x1 = 41, y1 = 41;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const e = Math.min(x - x0, x1 - x, y - y0, y1 - y) + 2.2 * (fbm(x / 4, y / 4, 2) - 0.5);
    z[y * W + x] = e > 0 ? (x > 27 && y < 20 && e > 3 && fbm(x / 6, y / 6, 8) > 0.38 ? 11 : 8) : 0;
  }
  const Zt = (x, y) => z[y * W + x];
  const av = (x, y) => Math.abs(x - 24) <= 1 || Math.abs(y - 26) <= 1; // two paved avenues
  const ruinedQ = (x, y) => x < 24 && y > 26; // the ruined quarter
  const vt = (x, y) => {
    if (x <= 0 || y <= 0 || x >= W || y >= H) return 'salt';
    const hi = Math.max(Zt(x - 1, y - 1), Zt(x, y - 1), Zt(x - 1, y), Zt(x, y)), n = fbm(x / 4, y / 4, 6);
    if (hi === 0) return n > 0.62 ? 'hardpan' : 'sand';
    if (av(x, y) && x > x0 + 2 && x < x1 - 2 && y > y0 + 2 && y < y1 - 2) return 'paving';
    if (ruinedQ(x, y)) return n > 0.42 ? 'rubble' : 'sand';
    return n > 0.7 ? 'rubble' : 'sand';
  };
  const cliff = () => 'sandstone';
  const items = [], used = new Set(), free = (a, b, w, h) => { for (let y = b; y < b + h; y++) for (let x = a; x < a + w; x++) if (used.has(`${x},${y}`) || av(x, y) || Zt(x, y) !== Zt(a, b) || Zt(x, y) === 0 || Math.min(x - x0, x1 - x, y - y0, y1 - y) < 3) return false; return true; };
  const take = (a, b, w, h) => { for (let y = b; y <= b + h; y++) for (let x = a; x <= a + w; x++) used.add(`${x},${y}`); }; // a lane on the near sides
  items.push({ id: 'ammon-palace-damaged', x0: 32, y0: 11, fp: [6, 6] }); take(32, 11, 6, 6);
  // dense blocks packed along lanes, a 1-tile lane between: intact in the north-east, ruined in the south-west
  const blocks = [['ammon-block-c', 4], ['ammon-block-d', 4], ['ammon-block-b', 3], ['ammon-block-a', 2], ['ammon-house-c', 4], ['ammon-house-a', 3], ['ammon-tenement', 4]];
  for (let b = y0 + 3; b < y1 - 3; b++) for (let a = x0 + 3; a < x1 - 3; a++) {
    const start = Math.floor(hash(a, b, 3) * blocks.length);
    let pick = null, fp = null;
    for (let t = 0; t < blocks.length && !pick; t++) { const p = blocks[(start + t) % blocks.length], f = p[0] === 'ammon-tenement' ? [4, 3] : [p[1], p[1]]; if (free(a, b, f[0], f[1])) { pick = p; fp = f; } }
    if (!pick) continue;
    const st = ruinedQ(a + 1, b + 1) ? (hash(a, b, 9) < 0.7 ? 'ruined' : 'damaged') : hash(a, b, 9) < 0.2 ? 'damaged' : 'intact';
    items.push({ id: `${pick[0]}-${st}`, x0: a, y0: b, fp }); take(a, b, fp[0], fp[1]);
  }
  // walls along the butte edge, towers at the corners, a gate on the south avenue
  for (let a = x0 + 3; a + 4 <= x1 - 3; a += 4) { items.push({ id: 'ammon-wall-x-intact', x0: a, y0: y0 + 1, fp: [4, 2] }); items.push({ id: `ammon-wall-x-${hash(a, 1) < 0.7 ? 'ruined' : 'damaged'}`, x0: a, y0: y1 - 2, fp: [4, 2] }); }
  for (let b = y0 + 3; b + 4 <= y1 - 3; b += 4) { items.push({ id: 'ammon-wall-y-intact', x0: x0 + 1, y0: b, fp: [2, 4] }); items.push({ id: `ammon-wall-y-${hash(b, 2) < 0.7 ? 'ruined' : 'damaged'}`, x0: x1 - 2, y0: b, fp: [2, 4] }); }
  for (const [a, b] of [[x0, y0], [x1 - 3, y0], [x0, y1 - 3], [x1 - 3, y1 - 3]]) items.push({ id: 'ammon-tower-intact', x0: a, y0: b, fp: [3, 3] });
  // street life and ruin dressing
  for (let i = 0; i < 260; i++) {
    const x = x0 + 3 + hash(i, 1, 40) * (x1 - x0 - 6), y = y0 + 3 + hash(i, 2, 40) * (y1 - y0 - 6), k = `${Math.floor(x)},${Math.floor(y)}`;
    if (used.has(k) || Zt(Math.floor(x), Math.floor(y)) === 0) continue;
    const ru = ruinedQ(x, y), n = hash(i, 3, 40);
    const id = av(Math.floor(x), Math.floor(y)) ? (n < 0.15 ? 'kyrene/stall-awning' : n < 0.25 ? 'kyrene/date-palm-mid' : null)
      : ru ? (n < 0.3 ? 'kyrene/debris-mud' : n < 0.45 ? 'kyrene/rubble-heap-mud' : n < 0.55 ? 'kyrene/wall-fallen-mud' : n < 0.62 ? 'kyrene/ruin-sanded' : null)
        : n < 0.18 ? 'kyrene/date-palm-young' : n < 0.26 ? 'kyrene/debris-mud' : null;
    if (id) { items.push({ id, x, y }); used.add(k); }
  }
  // talus at the cliff foot, the necropolis on the plain
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (Zt(x, y) === 0 && Math.max(Zt(x - 1, y), Zt(x, y - 1)) > 0 && hash(x, y, 31) < 0.4) items.push({ id: 'kyrene/talus-red', x: x + 0.5, y: y + 0.5 });
  for (const [a, b] of [[3, 44], [7, 45], [12, 45], [44, 3], [45, 8]]) items.push({ id: `ammon-tomb-${hash(a, b) < 0.5 ? 'ruined' : 'damaged'}`, x0: a, y0: b, fp: [3, 3] });
  const lib = library('kyrene');
  for (const o of read('public/war/biomes/kyrene/objects.json').objects) lib.objs.set(`kyrene/${o.id}`, lib.objs.get(o.id));
  render(lib, { W, H, z, vt, cliff, items, bg: [214, 206, 192, 255] }, 'ammon-butte');
}

citadel();
ammon();
