// Landmark guardians (ART-L) mock-ups at true scale (soldier art px, 33 px/m): every guardian sheet is drawn at its
// manifest scale / 0.55 (nearest), beside the landmark sprites (public/war/landmarks) and soldiers.
//   GUARD_lineup_1x.png     every guardian's south-west idle beside a hoplite, feet on one line
//   GUARD_drakon_citadel_1x.png   Drakon perched on the Citadel keep (P2), breathing fire on the yard, a hoplite line
//   GUARD_drakon_crash_1x.png     the crash (P3) in the yard: crash frames + crash dust, a hoplite line
//   GUARD_landmarks_1x.png  one panel per guardian at its landmark piece
// Usage: node scripts/war/art/guardians-preview.mjs [out dir]   (default shots/war/landmarks in the main checkout)
import { mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, crop } from '../../art/lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MAIN = ROOT.includes('/.claude/worktrees/') ? ROOT.split('/.claude/worktrees/')[0] : ROOT;
const OUT = process.argv[2] ?? join(MAIN, 'shots/war/landmarks');
mkdirSync(OUT, { recursive: true });

const sheets = new Map();
function sheet(cls) {
  if (!sheets.has(cls)) {
    const dir = join(ROOT, 'src/assets/sheets', cls);
    const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    sheets.set(cls, { m, img: readImage(join(dir, m.image)) });
  }
  return sheets.get(cls);
}
// one frame of a clip, scaled to soldier art px; returns { img, ax, ay } (the feet anchor in the scaled frame)
function frame(cls, anim, row, i = 0) {
  const { m, img } = sheet(cls);
  const a = m.anims[anim] ?? m.anims.idle;
  const col = a.col + Math.min(i, a.frames - 1), r = m.rows.indexOf(row), wrap = m.wrap ?? 1e9;
  const band = Math.floor(col / wrap);
  const f = crop(img, { x: (col % wrap) * m.frame.w, y: (band * m.rows.length + r) * m.frame.h, w: m.frame.w, h: m.frame.h });
  const k = m.scale / 0.55, an = m.anchors?.[row] ?? m.anchor;
  const W = Math.round(f.w * k), H = Math.round(f.h * k), o = blank(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = (Math.min(f.h - 1, Math.floor(y / k)) * f.w + Math.min(f.w - 1, Math.floor(x / k))) * 4;
    o.data.set(f.data.subarray(s, s + 4), (y * W + x) * 4);
  }
  return { img: o, ax: Math.round(an.x * k), ay: Math.round(an.y * k) };
}
function draw(c, img, x, y, flip = false) {
  for (let yy = 0; yy < img.h; yy++) for (let xx = 0; xx < img.w; xx++) {
    const s = (yy * img.w + (flip ? img.w - 1 - xx : xx)) * 4;
    const a = img.data[s + 3];
    if (!a) continue;
    const X = x + xx, Y = y + yy;
    if (X < 0 || Y < 0 || X >= c.w || Y >= c.h) continue;
    const d = (Y * c.w + X) * 4, t = a / 255;
    for (let k = 0; k < 3; k++) c.data[d + k] = Math.round(img.data[s + k] * t + c.data[d + k] * (1 - t));
    c.data[d + 3] = 255;
  }
}
const put = (c, f, x, y, flip = false) => draw(c, f.img, x - (flip ? f.img.w - f.ax : f.ax), y - f.ay, flip);
function ground(w, h) {
  const c = blank(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = ((x * 7 + y * 13) % 17) < 2 ? 4 : 0, v = y / h;
    c.data.set([26 + n + 14 * v, 23 + n + 12 * v, 20 + n + 9 * v, 255], (y * w + x) * 4);
  }
  return c;
}
const L = JSON.parse(readFileSync(join(ROOT, 'public/war/landmarks/landmarks.json'), 'utf8'));
const piece = (id) => {
  const o = L.objects.find((q) => q.id === id);
  return { o, img: readImage(join(ROOT, 'public/war/landmarks', o.file)) };
};
// a landmark piece with the centre of its footprint at (cx, cy) on the ground
function building(c, id, cx, cy) {
  const { o, img } = piece(id);
  const [fw, fh] = o.footprint;
  const gx = o.tileOrigin.x + (fw - fh) * 16, gy = o.tileOrigin.y + (fw + fh) * 8;
  draw(c, img, cx - gx, cy - gy);
  return { top: cy - gy, o };
}
const FX = JSON.parse(readFileSync(join(ROOT, 'public/war/fx/objects.json'), 'utf8'));
// an FX strip frame at `k` x its art size (Drakon's strips play at his sheet's 1.5 / 0.55: guardians.json fxScale)
function fx(c, id, i, x, y, flip = false, k = 1) {
  const t = FX.fx.find((q) => q.id === id), img = readImage(join(ROOT, 'public/war/fx', t.file));
  const f = crop(img, { x: (i % t.frames) * t.frame.w, y: 0, w: t.frame.w, h: t.frame.h });
  const W = Math.round(f.w * k), H = Math.round(f.h * k), g = blank(W, H);
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
    const s = (Math.min(f.h - 1, Math.floor(yy / k)) * f.w + Math.min(f.w - 1, Math.floor(xx / k))) * 4;
    g.data.set(f.data.subarray(s, s + 4), (yy * W + xx) * 4);
  }
  const ax = Math.round(t.anchor.x * k), ay = Math.round(t.anchor.y * k);
  draw(c, g, x - (flip ? W - ax : ax), y - ay, flip);
}
const DK = 1.5 / 0.55;
const men = (c, cls, n, x, y, dx, dy, row = 'north-east', anim = 'idle') => {
  for (let i = 0; i < n; i++) put(c, frame(cls, anim, row, (i * 5) % 12), x + i * dx, y + i * dy);
};

// 1. lineup
{
  const order = ['mob_bandit_archer', 'mob_bandit_guard', 'mob_bandit_captain', 'mob_bandit_king', 'mob_maenad', 'mob_maenad_queen', 'mob_chimera', 'mob_scylla_head', 'mob_brontes', 'mob_gyges', 'mob_drakon'];
  const fs = order.map((c) => frame(c, 'idle', 'south-west'));
  const man = frame('hoplite', 'idle', 'south-west');
  const W = fs.reduce((s, f) => s + f.img.w - 20, man.img.w + 60), H = Math.max(...fs.map((f) => f.ay)) + 60;
  const c = ground(W, H);
  let x = 30;
  put(c, man, x + man.ax, H - 30); x += man.img.w;
  for (const f of fs) { put(c, f, x + f.ax - 10, H - 30); x += f.img.w - 20; }
  writeImage(join(OUT, 'GUARD_lineup_1x.png'), c);
}

// 2. Drakon on the keep roof (P2) breathing on the yard; 3. the crash (P3)
{
  const c = ground(1600, 1500);
  const keep = building(c, 'citadel-keep-intact', 1000, 1360);
  const roofY = 1360 - keep.o.metres * 33 + 60;
  put(c, frame('mob_drakon', 'brace', 'south-west', 7), 960, roofY);
  men(c, 'hoplite', 7, 240, 1420, 44, -22);
  men(c, 'archer', 4, 180, 1300, 40, -20, 'north-east');
  writeImage(join(OUT, 'GUARD_drakon_citadel_1x.png'), c);

  const d = ground(1900, 1000);
  building(d, 'citadel-keep-damaged', 1620, 600);
  put(d, frame('mob_drakon', 'shoot', 'south-west', 7), 1260, 680);
  fx(d, 'breath-se-loop', 5, 920, 560, true, DK);
  men(d, 'hoplite', 9, 120, 900, 46, -10);
  writeImage(join(OUT, 'GUARD_drakon_breath_1x.png'), d);

  const e = ground(1500, 900);
  fx(e, 'crash-dust', 6, 760, 640, false, DK);
  put(e, frame('mob_drakon', 'charge', 'south-west', 6), 760, 640);
  men(e, 'hoplite', 8, 180, 860, 50, -12);
  writeImage(join(OUT, 'GUARD_drakon_crash_1x.png'), e);
}

// 4. a panel per landmark guardian
{
  const P = 640, c = ground(P * 3, P * 2);
  const panel = (i, fn) => fn(Math.floor(i % 3) * P, Math.floor(i / 3) * P);
  panel(0, (x, y) => { building(c, 'cyclops-gatehouse-x-intact', x + 360, y + 470); put(c, frame('mob_brontes', 'shoot', 'south-west', 3), x + 360, y + 330); men(c, 'hoplite', 5, x + 60, y + 610, 40, -10); });
  panel(1, (x, y) => { building(c, 'titan-anvil-intact', x + 420, y + 420); put(c, frame('mob_gyges', 'attack', 'south-west', 4), x + 320, y + 520); men(c, 'hoplite', 5, x + 60, y + 610, 40, -10); });
  panel(2, (x, y) => { building(c, 'obsidian-kiln-intact', x + 460, y + 360); put(c, frame('mob_chimera', 'attack', 'south-west', 5), x + 330, y + 470); men(c, 'hoplite', 5, x + 60, y + 610, 40, -10); });
  panel(3, (x, y) => { building(c, 'rim-beacon-intact', x + 480, y + 400); for (let k = 0; k < 4; k++) put(c, frame('mob_scylla_head', k % 2 ? 'attack' : 'idle', 'south-west', 3 + k * 2), x + 140 + k * 90, y + 420 + (k % 2) * 40); fx(c, 'scylla-strike', 5, x + 230, y + 460); men(c, 'hoplite', 4, x + 80, y + 610, 44, -8); });
  panel(4, (x, y) => { building(c, 'ammon-palace-intact', x + 400, y + 470); put(c, frame('mob_bandit_king', 'slash', 'south-west', 3), x + 300, y + 540); men(c, 'mob_bandit_guard', 6, x + 160, y + 560, 30, 10, 'south-west'); men(c, 'mob_bandit_archer', 3, x + 470, y + 520, 26, 8, 'south-west', 'shoot'); men(c, 'mob_bandit_captain', 1, x + 120, y + 500, 0, 0, 'south-west'); });
  panel(5, (x, y) => { building(c, 'oracle-shrine-intact', x + 420, y + 380); put(c, frame('mob_maenad_queen', 'idle', 'south-west', 4), x + 330, y + 470); men(c, 'mob_maenad', 6, x + 150, y + 520, 34, 12, 'south-west', 'slash'); men(c, 'hoplite', 4, x + 360, y + 620, 40, -8); });
  writeImage(join(OUT, 'GUARD_landmarks_1x.png'), c);
}
console.log(`guardian mock-ups -> ${OUT}`);
