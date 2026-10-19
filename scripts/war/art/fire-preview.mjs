// Fire v2 mock-up at 1:1 (PROMPTS_ART.md "Siege", fire redo): palisade runs burning at low / medium / high, one dying
// (smoulder), and a burning wooden tower, placed by public/war/siege/objects.json fireNote (emitters, glow, smoke, char
// overlays; 'add' fx blended additively). Writes FIRE2_mock_1x.png, FIRE2_mock_2x_crop.png, FIRE2.gif (ffmpeg).
// Usage: node scripts/war/art/fire-preview.mjs [out dir]
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, crop, resizeNearest } from '../../art/lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = process.argv[2] ?? '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/pixellab/siege/fire2';
mkdirSync(OUT, { recursive: true });
const SD = join(ROOT, 'public/war/siege'), BD = join(ROOT, 'public/war/buildings'), TD = join(ROOT, 'public/war/tiles');
const S = JSON.parse(readFileSync(join(SD, 'objects.json'))), B = JSON.parse(readFileSync(join(BD, 'objects.json'))), T = JSON.parse(readFileSync(join(TD, 'tiles.json')));
const FX = Object.fromEntries(S.fx.map((f) => [f.id, { ...f, im: readImage(join(SD, f.file)) }]));
const kit = (id) => B.kits.find((k) => k.id === id), sheet = (f) => readImage(join(BD, f));
const charOf = (k, level, layer) => { const c = S.char.find((q) => q.kit === k && q.level === level && q.layer === layer); return c && readImage(join(SD, c.file)); };
const gs = T.sheets.find((q) => q.pair === 'grass-shallow'), GIM = readImage(join(TD, gs.file)), GRASS = crop(GIM, { x: gs.maskToFrame[15] * 64, y: 0, w: 64, h: 48 });

// draw src (or its frame n of width fw) at x, y: normal (alpha) or add
function draw(dst, src, x, y, { n = 0, fw = src.w, alpha = 1, blend = 'normal', flip = false } = {}) {
  for (let yy = 0; yy < src.h; yy++) { const dy = y + yy; if (dy < 0 || dy >= dst.h) continue;
    for (let xx = 0; xx < fw; xx++) { const dx = x + xx; if (dx < 0 || dx >= dst.w) continue;
      const s = (yy * src.w + n * fw + (flip ? fw - 1 - xx : xx)) * 4; if (!src.data[s + 3]) continue; const o = (dy * dst.w + dx) * 4;
      for (let c = 0; c < 3; c++) dst.data[o + c] = blend === 'add' ? Math.min(255, dst.data[o + c] + src.data[s + c] * alpha) : Math.round(src.data[s + c] * alpha + dst.data[o + c] * (1 - alpha));
    } }
}
let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// scene: palisade runs along x (row y = 10), x 4-7 low, 9-12 medium, 14-17 high, 19-22 dying; wooden tower at 25,8
const N = 30, OX = N * 32 + 32, OY = 300, W = N * 64 + 64, H = N * 32 + 360;
const sx = (x, y) => OX + (x - y) * 32, sy = (x, y) => OY + (x + y) * 16;
const RUNS = [{ x0: 4, k: 'low' }, { x0: 9, k: 'medium' }, { x0: 14, k: 'high' }, { x0: 19, k: 'dying' }], RY = 10;
const ZMAX = { low: 0.25, medium: 0.6, high: 0.95 }, CHAR = { low: 'scorch', medium: 'charred', high: 'smoulder', dying: 'smoulder' };
const PAL = kit('palisade'), PALS = sheet(PAL.states.done), TOW = kit('tower-wood'), TOWB = sheet(TOW.states.done), TOWF = sheet(TOW.front.done);
const TX = 25, TY = 8;

// emitters (fixed per piece, as the renderer keeps them): along a face from (ax, ay) to (bx, by), height hPx
const emit = [];
function face(ax, ay, bx, by, hPx, k, tiles, smokeZ = null) {
  const d = (q) => S.fx.filter((f) => f.id.startsWith(`tongue-${q}-`)).reduce((a, f) => Math.max(a, f.density.perTile[k] ?? 0), 0);
  for (let t = 0; t < tiles; t++) {
    for (const size of ['s', 'm', 'l']) for (let i = 0; i < d(size); i++) {
      const u = (t + rnd()) / tiles, top = size === 'l' && k === 'high' && i === 0 && rnd() < 0.6;
      const z = top ? hPx * (0.85 + 0.1 * rnd()) : hPx * ZMAX[k] * rnd() ** 2;
      emit.push({ id: `tongue-${size}-${'abc'[Math.floor(rnd() * 3)]}`, x: ax + (bx - ax) * u, y: ay + (by - ay) * u, z, ph: Math.floor(rnd() * 60) });
    }
    const axis = ay === by ? 'x' : 'y'; // the tile's face start (lower x / y)
    const st = axis === 'x' ? [Math.min(ax, bx) + t * Math.abs(bx - ax) / tiles, ay] : [ax, Math.min(ay, by) + t * Math.abs(by - ay) / tiles];
    if (k !== 'low') emit.push({ id: `fire-sheet-${axis}-${k === 'high' ? 'l' : 'm'}`, x: st[0], y: st[1], z: 0, ph: t * 3 + Math.floor(rnd() * 12), sheet: true });
    const mid = (t + 0.5) / tiles, px = ax + (bx - ax) * mid, py = ay + (by - ay) * mid, top = hPx * ZMAX[k] + 6;
    emit.push({ id: 'heat-glow', x: px, y: py + 0.2, z: 0, ph: t * 5, alpha: FX['heat-glow'].alpha[k], ground: true });
    if ((FX.embers.density.perTile[k] ?? 0) >= 1 || (k === 'medium' && t % 2 === 0)) emit.push({ id: 'embers', x: px, y: py, z: top, ph: t * 7, over: true });
    if (t % 2 === 0 && (k !== 'low' || t === 0)) emit.push({ id: `smoke-wisp-${'ab'[(t >> 1) % 2]}`, x: px + rnd() * 0.4, y: py, z: smokeZ ?? top + 4, ph: t * 9, alpha: FX['smoke-wisp-a'].alpha[k] * (0.8 + 0.2 * rnd()), over: true });
  }
}
for (const r of RUNS) {
  if (r.k === 'dying') { for (let t = 0; t < 4; t++) { for (let i = 0; i < 2; i++) emit.push({ id: 'smoulder', x: r.x0 + t + 0.25 + 0.5 * i, y: RY + 0.6, z: 0, ph: t * 5 + i * 3 }); if (t % 2) emit.push({ id: 'smoke-wisp-b', x: r.x0 + t + 0.5, y: RY + 0.6, z: 4, ph: t * 7, alpha: 0.3, over: true }); } continue; }
  face(r.x0, RY + 0.6, r.x0 + 4, RY + 0.6, PAL.heightM * 33, r.k, 4);
}
face(TX + 0.1, TY + 2, TX + 2, TY + 2, TOW.heightM * 33 * 0.62, 'high', 2, TOW.heightM * 33 - 4); // the tower's two visible faces, up to the platform
face(TX + 2, TY + 2, TX + 2, TY + 0.1, TOW.heightM * 33 * 0.62, 'high', 2, TOW.heightM * 33 - 4);
for (let i = 0; i < 3; i++) emit.push({ id: `tongue-m-${'abc'[i]}`, x: TX + 1.2 + 0.4 * i, y: TY + 1.9 - 0.4 * i, z: TOW.platformM * 33 + 2, ph: i * 13 }); // on the platform edge

function frame(f) {
  const im = blank(W, H); for (let i = 0; i < W * H; i++) im.data.set([22, 17, 13, 255], i * 4);
  for (let d = 0; d <= 2 * (N - 1); d++) for (let x = 0; x < N; x++) { const y = d - x; if (y >= 0 && y < N) draw(im, GRASS, sx(x, y) - 32, sy(x, y)); }
  const fxAt = (e, extra = {}) => { const F = FX[e.id], n = (Math.floor((f * F.fps) / 12) + e.ph) % F.frames, p = [sx(e.x, e.y), sy(e.x, e.y) - e.z];
    draw(im, F.im, Math.round(p[0] - F.anchor.x), Math.round(p[1] - F.anchor.y), { n, fw: F.frame.w, alpha: e.alpha ?? 1, blend: F.blend, ...extra }); };
  for (const e of emit.filter((q) => q.ground)) fxAt(e);
  for (const r of RUNS) for (let x = r.x0; x < r.x0 + 4; x++) { // the run, its char overlay
    const n = (x < r.x0 + 3 ? 1 : 0) | (x > r.x0 ? 4 : 0), X = sx(x, RY) - PAL.tileOrigin.x, Y = sy(x, RY) - PAL.tileOrigin.y;
    draw(im, PALS, X, Y, { n, fw: PAL.frame.w }); draw(im, charOf('palisade', CHAR[r.k], 'back'), X, Y, { n, fw: PAL.frame.w });
  }
  const tX = sx(TX, TY) - TOW.tileOrigin.x, tY = sy(TX, TY) - TOW.tileOrigin.y;
  draw(im, TOWB, tX, tY, { fw: TOW.frame.w }); draw(im, charOf('tower-wood', 'smoulder', 'back'), tX, tY, { fw: TOW.frame.w });
  draw(im, TOWF, tX, tY, { fw: TOW.frame.w }); draw(im, charOf('tower-wood', 'smoulder', 'front'), tX, tY, { fw: TOW.frame.w });
  for (const e of emit.filter((q) => q.sheet)) fxAt(e);
  for (const e of emit.filter((q) => !q.ground && !q.over && !q.sheet).sort((a, b) => a.x + a.y - (b.x + b.y))) fxAt(e);
  for (const e of emit.filter((q) => q.over)) fxAt(e);
  return crop(im, { x: 740, y: 220, w: 980, h: 720 });
}
const tmp = join(OUT, 'frames'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp);
for (let f = 0; f < 60; f++) { const im = frame(f); writeImage(join(tmp, `f${String(f).padStart(3, '0')}.png`), im); if (f === 0) { writeImage(join(OUT, 'FIRE2_mock_1x.png'), im); writeImage(join(OUT, 'FIRE2_mock_2x_crop.png'), resizeNearest(crop(im, { x: 470, y: 170, w: 500, h: 420 }), 1000, 840)); } }
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '12', '-i', join(tmp, 'f%03d.png'), '-vf', 'split[a][b];[a]palettegen=max_colors=255[p];[b][p]paletteuse=dither=none', '-loop', '0', join(OUT, 'FIRE2.gif')]);
rmSync(tmp, { recursive: true, force: true });
console.log('fire preview ->', OUT);
