// W-35 fire-arrow art mock-up at 1:1 (PROMPTS_ART.md "Buildings", brazier and pitch kiln): a lit brazier on a stone
// wall walk between archers, one lit on the ground, the pitch kiln working (smoke from the vent, flame in the mouth),
// placed by public/war/buildings/objects.json (fx[state] at sprite px `at`). Also every state of both at 1:1.
// Writes BRAZIER_mock_1x.png, BRAZIER_mock_2x_crop.png, BRAZIER_states_1x.png, BRAZIER.gif (ffmpeg).
// Usage: node scripts/war/art/brazier-preview.mjs [out dir]
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, crop, resizeNearest, resizeArea } from '../../art/lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = process.argv[2] ?? '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/pixellab/brazier';
mkdirSync(OUT, { recursive: true });
const SD = join(ROOT, 'public/war/siege'), BD = join(ROOT, 'public/war/buildings'), TD = join(ROOT, 'public/war/tiles');
const S = JSON.parse(readFileSync(join(SD, 'objects.json'))), B = JSON.parse(readFileSync(join(BD, 'objects.json'))), T = JSON.parse(readFileSync(join(TD, 'tiles.json')));
const FX = Object.fromEntries(S.fx.map((f) => [f.id, { ...f, im: readImage(join(SD, f.file)) }]));
const SPR = Object.fromEntries(B.objects.map((o) => [o.id, { ...o, im: readImage(join(BD, o.file)) }]));
const BLD = Object.fromEntries(B.buildings.map((b) => [b.id, b]));
const WALL = B.kits.find((k) => k.id === 'stone-wall'), WB = readImage(join(BD, WALL.states.done)), WF = readImage(join(BD, WALL.front.done));
const gs = T.sheets.find((q) => q.pair === 'grass-shallow'), GRASS = crop(readImage(join(TD, gs.file)), { x: gs.maskToFrame[15] * 64, y: 0, w: 64, h: 48 });

function draw(dst, src, x, y, { n = 0, fw = src.w, alpha = 1, blend = 'normal' } = {}) {
  for (let yy = 0; yy < src.h; yy++) { const dy = y + yy; if (dy < 0 || dy >= dst.h) continue;
    for (let xx = 0; xx < fw; xx++) { const dx = x + xx; if (dx < 0 || dx >= dst.w) continue;
      const s = (yy * src.w + n * fw + xx) * 4; if (!src.data[s + 3]) continue; const o = (dy * dst.w + dx) * 4;
      for (let c = 0; c < 3; c++) dst.data[o + c] = blend === 'add' ? Math.min(255, dst.data[o + c] + src.data[s + c] * alpha) : Math.round(src.data[s + c] * alpha + dst.data[o + c] * (1 - alpha));
    } }
}
// archers (runtime scale from the manifest), one frame per facing / anim column
const AM = JSON.parse(readFileSync(join(ROOT, 'src/assets/sheets/archer/manifest.json'))), ASH = readImage(join(ROOT, 'src/assets/sheets/archer', AM.image));
function archer(row, col) {
  const r = AM.rows.indexOf(row), band = Math.floor(col / AM.wrap), k = AM.scale;
  const fr = crop(ASH, { x: (col % AM.wrap) * AM.frame.w, y: (band * AM.rows.length + r) * AM.frame.h, w: AM.frame.w, h: AM.frame.h });
  const im = resizeArea(fr, Math.round(fr.w * k), Math.round(fr.h * k)); for (let i = 3; i < im.data.length; i += 4) im.data[i] = im.data[i] >= 128 ? 255 : 0;
  const a = AM.anchors?.[row] ?? AM.anchor; return { im, anchor: { x: Math.round(a.x * k), y: Math.round(a.y * k) } };
}

const N = 16, OX = N * 32 + 32, OY = 300, W = N * 64 + 64, H = N * 32 + 360;
const sx = (x, y) => OX + (x - y) * 32, sy = (x, y) => OY + (x + y) * 16;
const items = [];
// the wall: 2 deep along x (rows y 1-2), x 2-10; the walk at walkwayPx
const cells = new Set(); for (let x = 2; x <= 10; x++) for (const y of [1, 2]) cells.add(`${x},${y}`);
for (const c of cells) {
  const [x, y] = c.split(',').map(Number), has = (a, b) => cells.has(`${a},${b}`);
  const f = WALL.frameOf[(has(x + 1, y) ? 1 : 0) | (has(x, y + 1) ? 2 : 0) | (has(x - 1, y) ? 4 : 0) | (has(x, y - 1) ? 8 : 0)];
  const X = sx(x, y) - WALL.tileOrigin.x, Y = sy(x, y) - WALL.tileOrigin.y, col = f % WALL.columns, row = Math.floor(f / WALL.columns);
  const fr = (im) => crop(im, { x: col * WALL.frame.w, y: row * WALL.frame.h, w: WALL.frame.w, h: WALL.frame.h });
  items.push({ key: x + y + 0.7, f: (im) => draw(im, fr(WB), X, Y) }, { key: x + y + 1.3, f: (im) => draw(im, fr(WF), X, Y) });
}
const unit = (s, x, y, z = 0) => items.push({ key: Math.floor(x) + Math.floor(y) + 1.0 + (x % 1 + y % 1) * 0.01, f: (im) => draw(im, s.im, Math.round(sx(x, y) - s.anchor.x), Math.round(sy(x, y) - z * 33 - s.anchor.y)) });
// a building state on tile (x, y), lifted zPx; with its fx for `fxState`
function building(id, state, x, y, zPx = 0, fxState = null, key = null) {
  const b = BLD[id], o = SPR[b.states[state]], X = sx(x, y) - o.tileOrigin.x, Y = sy(x, y) - zPx - o.tileOrigin.y;
  const k = key ?? x + y + b.footprint[0] + b.footprint[1] - 1;
  items.push({ key: k, f: (im) => draw(im, o.im, X, Y) });
  (b.fx?.[fxState ?? ''] ?? []).forEach((e, i) => items.push({ key: k + 0.01 + (FX[e.id].blend === 'add' || e.id.startsWith('smoke') ? 50 : 0), f: (im, t) => {
    const F = FX[e.id], n = (Math.floor((t * F.fps) / 12) + i * 5 + x * 3) % F.frames;
    draw(im, F.im, X + e.at.x - F.anchor.x, Y + e.at.y - F.anchor.y, { n, fw: F.frame.w, alpha: e.alpha ?? 1, blend: F.blend });
  } }));
}
const WZ = WALL.walkwayPx / 33;
// on the walk: archers at the outer (-y) parapet, a lit brazier on the inner row between them
const ne = archer('north-east', 104), ne2 = archer('north-east', 108), se = archer('south-east', 0);
unit(ne, 3.6, 1.45, WZ); unit(ne2, 4.7, 1.4, WZ); unit(ne, 7.4, 1.45, WZ); unit(ne2, 8.5, 1.4, WZ);
building('brazier', 'lit', 6, 1, WALL.walkwayPx, 'lit', 6 + 1 + 0.9); unit(se, 5.7, 1.9, WZ);
// on the ground: a lit brazier with archers dipping, the kiln working with a stoker
building('brazier', 'lit', 4, 6, 0, 'lit'); unit(ne, 3.4, 6.2); unit(archer('north-west', 104), 5.7, 6.5);
building('pitch-kiln', 'done', 7, 6, 0, 'working'); unit(archer('north-west', 0), 8.4, 8.4);
building('brazier', 'unlit', 11, 5); building('brazier', 'destroyed', 11, 7);
items.sort((a, b) => a.key - b.key);

function frame(t) {
  const im = blank(W, H); for (let i = 0; i < W * H; i++) im.data.set([22, 17, 13, 255], i * 4);
  for (let d = 0; d <= 2 * (N - 1); d++) for (let x = 0; x < N; x++) { const y = d - x; if (y >= 0 && y < N) draw(im, GRASS, sx(x, y) - 32, sy(x, y)); }
  for (const it of items) it.f(im, t);
  return crop(im, { x: 420, y: 90, w: 480, h: 540 });
}
const tmp = join(OUT, 'frames'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp);
for (let t = 0; t < 36; t++) { const im = frame(t); writeImage(join(tmp, `f${String(t).padStart(3, '0')}.png`), im); if (t === 0) { writeImage(join(OUT, 'BRAZIER_mock_1x.png'), im); writeImage(join(OUT, 'BRAZIER_mock_2x_crop.png'), resizeNearest(crop(im, { x: 40, y: 60, w: 400, h: 340 }), 800, 680)); } }
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '12', '-i', join(tmp, 'f%03d.png'), '-vf', 'split[a][b];[a]palettegen=max_colors=255[p];[b][p]paletteuse=dither=none', '-loop', '0', join(OUT, 'BRAZIER.gif')]);
rmSync(tmp, { recursive: true, force: true });
// every state at 1:1 on grass
{
  const st = [['brazier', 'unlit'], ['brazier', 'lit'], ['brazier', 'destroyed'], ...['foundation', 'rising', 'scaffold', 'done', 'damaged'].map((s) => ['pitch-kiln', s])];
  const cw = 170, img = blank(cw * st.length, 230); for (let i = 0; i < img.w * img.h; i++) img.data.set([22, 17, 13, 255], i * 4);
  st.forEach(([id, s], i) => { const b = BLD[id], o = SPR[b.states[s]], X = i * cw + cw / 2, Y = 120;
    for (let a = 0; a < b.footprint[0]; a++) for (let c = 0; c < b.footprint[1]; c++) draw(img, GRASS, X + (a - c) * 32 - 32, Y + (a + c) * 16);
    draw(img, o.im, X - o.tileOrigin.x, Y - o.tileOrigin.y);
    for (const e of b.fx?.[s === 'done' ? 'working' : s] ?? []) { const F = FX[e.id]; draw(img, F.im, X - o.tileOrigin.x + e.at.x - F.anchor.x, Y - o.tileOrigin.y + e.at.y - F.anchor.y, { fw: F.frame.w, alpha: e.alpha ?? 1, blend: F.blend }); } });
  writeImage(join(OUT, 'BRAZIER_states_1x.png'), img); writeImage(join(OUT, 'BRAZIER_states_4x_brazier.png'), resizeNearest(crop(img, { x: 30, y: 40, w: 460, h: 140 }), 1840, 560));
}
console.log('brazier preview ->', OUT);
