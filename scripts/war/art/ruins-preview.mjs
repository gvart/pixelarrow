// ART-L mock-ups at true scale (PROMPTS_ART.md "Landmarks" 40b): the town pieces intact / damaged / ruined beside
// soldiers, the stone wall, tower and gate kits in their states, and the landmark FX (Drakon's breath on a yard, his
// crash, Scylla's strike in the sea) over a scene, plus a GIF of the FX.
// Writes RUINS_town_1x.png, RUINS_town_2x_crop.png, RUINS_walls_1x.png, FX_scene_1x.png, FX_scene.gif, FX_strips_1x.png.
// Usage: node scripts/war/art/ruins-preview.mjs [out dir]
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, crop, resizeNearest, resizeArea } from '../../art/lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = process.argv[2] ?? '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/landmarks';
mkdirSync(OUT, { recursive: true });
const ED = join(ROOT, 'public/war/biomes/elaia'), BD = join(ROOT, 'public/war/buildings'), TD = join(ROOT, 'public/war/tiles'), XD = join(ROOT, 'public/war/fx');
const E = JSON.parse(readFileSync(join(ED, 'objects.json'))), B = JSON.parse(readFileSync(join(BD, 'objects.json'))), T = JSON.parse(readFileSync(join(TD, 'tiles.json'))), X = JSON.parse(readFileSync(join(XD, 'objects.json')));
const EO = Object.fromEntries(E.objects.map((o) => [o.id, { ...o, im: readImage(join(ED, o.file)) }]));
const BO = Object.fromEntries(B.objects.map((o) => [o.id, { ...o, im: readImage(join(BD, o.file)) }]));
const FX = Object.fromEntries(X.fx.map((f) => [f.id, { ...f, im: readImage(join(XD, f.file)) }]));
const tile = (pair, mask) => { const s = T.sheets.find((q) => q.pair === pair); return crop(readImage(join(TD, s.file)), { x: s.maskToFrame[mask] * 64, y: 0, w: 64, h: 48 }); };
const GRASS = tile('grass-shallow', 15), DIRT = tile('grass-dirt', 0), DEEP = tile('shallow-deep', 0), SHALLOW = tile('grass-shallow', 0);

function draw(dst, src, x, y, { n = 0, fw = src.w, flip = false } = {}) {
  x = Math.round(x); y = Math.round(y);
  for (let yy = 0; yy < src.h; yy++) { const dy = y + yy; if (dy < 0 || dy >= dst.h) continue;
    for (let xx = 0; xx < fw; xx++) { const dx = x + xx; if (dx < 0 || dx >= dst.w) continue;
      const s = (yy * src.w + n * fw + (flip ? fw - 1 - xx : xx)) * 4; if (!src.data[s + 3]) continue; dst.data.set(src.data.subarray(s, s + 4), (dy * dst.w + dx) * 4);
    } }
}
// soldiers and bandits at their runtime scale (manifest scale), one frame
const SHEETS = {};
function man(cls, row, col) {
  const M = (SHEETS[cls] ??= { m: JSON.parse(readFileSync(join(ROOT, `src/assets/sheets/${cls}/manifest.json`))), im: null });
  M.im ??= readImage(join(ROOT, `src/assets/sheets/${cls}`, M.m.image));
  const m = M.m, r = m.rows.indexOf(row), band = Math.floor(col / (m.wrap ?? 1e9)), k = m.scale;
  const fr = crop(M.im, { x: (col % (m.wrap ?? 1e9)) * m.frame.w, y: (band * m.rows.length + r) * m.frame.h, w: m.frame.w, h: m.frame.h });
  const im = resizeArea(fr, Math.round(fr.w * k), Math.round(fr.h * k)); for (let i = 3; i < im.data.length; i += 4) im.data[i] = im.data[i] >= 128 ? 255 : 0;
  const a = m.anchors?.[row] ?? m.anchor; return { im, anchor: { x: Math.round(a.x * k), y: Math.round(a.y * k) } };
}
const ground = (im, t, ox, oy, N) => { for (let d = 0; d <= 2 * (N - 1); d++) for (let x = 0; x < N; x++) { const y = d - x; if (y >= 0 && y < N) draw(im, t(x, y), ox + (x - y) * 32 - 32, oy + (x + y) * 16); } };
const bg = (w, h) => { const im = blank(w, h); for (let i = 0; i < w * h; i++) im.data.set([22, 17, 13, 255], i * 4); return im; };

// ---- RUINS_town: one column per piece, rows intact / damaged / ruined, a man beside each for scale
{
  const ids = ['house-a', 'house-b', 'cottage', 'temple', 'stoa', 'statue', 'well', 'jetty', 'olive-press', 'tower', 'gate-x', 'wall-x'];
  const cols = ids.map((id) => Math.max(...['', '-damaged', '-ruined'].map((s) => EO[`town-${id}${s}`]?.w ?? 0)) + 40);
  const rowH = [0, 1, 2].map((r) => Math.max(...ids.map((id) => EO[`town-${id}${['', '-damaged', '-ruined'][r]}`]?.h ?? 0)) + 30);
  const W = cols.reduce((a, b) => a + b, 40), H = rowH.reduce((a, b) => a + b, 40), im = bg(W, H);
  ground(im, (x, y) => ((x * 7 + y * 3) % 11 === 0 ? DIRT : GRASS), W / 2, -W / 4, Math.ceil((W + H) / 48) + 4);
  let y0 = 20;
  [0, 1, 2].forEach((r) => {
    let x0 = 20; const base = y0 + rowH[r] - 14;
    ids.forEach((id, i) => {
      const o = EO[`town-${id}${['', '-damaged', '-ruined'][r]}`]; if (o) draw(im, o.im, Math.round(x0 + cols[i] / 2 - o.anchor.x), base - o.anchor.y);
      const m = r === 2 ? man('mob_bandit', 'south-west', 0) : man('hoplite', 'south-west', 0); draw(im, m.im, Math.round(x0 + cols[i] - 18 - m.anchor.x), base - m.anchor.y);
      x0 += cols[i];
    });
    y0 += rowH[r];
  });
  writeImage(join(OUT, 'RUINS_town_1x.png'), im);
  writeImage(join(OUT, 'RUINS_town_2x_crop.png'), resizeNearest(crop(im, { x: 0, y: 0, w: Math.min(W, 900), h: H }), Math.min(W, 900) * 2, H * 2));
}

// ---- RUINS_walls: a 2-deep stone wall run with a tower and a gate, done / damaged / ruined side by side
{
  const WALL = B.kits.find((k) => k.id === 'stone-wall'), TOW = B.kits.find((k) => k.id === 'tower-stone');
  const W = 1500, H = 520, im = bg(W, H); ground(im, (x, y) => ((x + y * 5) % 9 === 0 ? DIRT : GRASS), W / 2, -260, 30);
  ['done', 'damaged', 'ruined'].forEach((s, k) => {
    const OX = 210 + k * 470, OY = 150, sx = (x, y) => OX + (x - y) * 32, sy = (x, y) => OY + (x + y) * 16, items = [];
    const WB = readImage(join(BD, WALL.states[s])), WF = readImage(join(BD, WALL.front[s]));
    const cells = new Set(); for (let x = 2; x <= 7; x++) for (const y of [1, 2]) cells.add(`${x},${y}`);
    for (const c of cells) {
      const [x, y] = c.split(',').map(Number), has = (a, b) => cells.has(`${a},${b}`);
      const f = WALL.frameOf[(has(x + 1, y) ? 1 : 0) | (has(x, y + 1) ? 2 : 0) | (has(x - 1, y) ? 4 : 0) | (has(x, y - 1) ? 8 : 0)];
      const fr = (src) => crop(src, { x: (f % WALL.columns) * WALL.frame.w, y: Math.floor(f / WALL.columns) * WALL.frame.h, w: WALL.frame.w, h: WALL.frame.h });
      items.push({ key: x + y + 0.7, f: () => draw(im, fr(WB), sx(x, y) - WALL.tileOrigin.x, sy(x, y) - WALL.tileOrigin.y) }, { key: x + y + 1.3, f: () => draw(im, fr(WF), sx(x, y) - WALL.tileOrigin.x, sy(x, y) - WALL.tileOrigin.y) });
    }
    const tw = BO[`stone-tower-${s}`]; items.push({ key: 8 + 1 + 3, f: () => draw(im, tw.im, sx(8, 1) - tw.tileOrigin.x, sy(8, 1) - tw.tileOrigin.y) });
    const gt = BO[`stone-gate-x-deep-s-${s}`] ?? BO[`stone-gate-x-deep-s-done`]; items.push({ key: 0 + 1 + 3, f: () => draw(im, gt.im, sx(0, 1) - gt.tileOrigin.x, sy(0, 1) - gt.tileOrigin.y) });
    for (const [x, y] of [[3, 3.6], [5.2, 3.8], [6.4, 3.5]]) { const m = man('hoplite', 'north-east', 0); items.push({ key: Math.floor(x) + Math.floor(y) + 1, f: () => draw(im, m.im, Math.round(sx(x, y) - m.anchor.x), Math.round(sy(x, y) - m.anchor.y)) }); }
    items.sort((a, b) => a.key - b.key).forEach((it) => it.f());
  });
  writeImage(join(OUT, 'RUINS_walls_1x.png'), im);
}

// ---- FX: a yard of a ruined citadel (dirt, ruined wall pieces), a line of hoplites under Drakon's breath, his crash
// further back, and the sea with Scylla's strikes
{
  const W = 960, H = 620, N = 22, OX = W / 2, OY = -40, sx = (x, y) => OX + (x - y) * 32, sy = (x, y) => OY + (x + y) * 16;
  const sea = (x, y) => x - y > 9;
  const base = bg(W, H); ground(base, (x, y) => (sea(x, y) ? (x - y > 11 ? DEEP : SHALLOW) : (x * 5 + y * 3) % 7 === 0 ? GRASS : DIRT), OX, OY, N);
  const props = [];
  const tw = BO['stone-tower-ruined']; props.push({ key: 6 + 4 + 3, f: (im) => draw(im, tw.im, sx(6, 4) - tw.tileOrigin.x, sy(6, 4) - tw.tileOrigin.y) });
  const ho = EO['town-house-a-ruined']; props.push({ key: 13 + 12 + 5, f: (im) => draw(im, ho.im, sx(14, 13) - ho.anchor.x + 0, sy(14, 13) - ho.anchor.y + 48) });
  const men = []; for (let i = 0; i < 8; i++) men.push([11 + (i % 4) * 0.9, 7.4 + Math.floor(i / 4) * 1.4]); // a squad caught at the cone's end
  for (const [x, y] of men) { const m = man('hoplite', 'north-west', 0); props.push({ key: Math.floor(x) + Math.floor(y) + 1, f: (im) => draw(im, m.im, Math.round(sx(x, y) - m.anchor.x), Math.round(sy(x, y) - m.anchor.y)) }); }
  props.sort((a, b) => a.key - b.key);
  const breath = FX['breath-se-loop'], ign = FX['breath-se-ignite'], crashF = FX['crash-dust'], sc = FX['scylla-strike'];
  const mouth = { x: sx(3, 8), y: sy(3, 8) }, crashAt = { x: sx(5, 6), y: sy(5, 6) }, strikes = [[16, 4], [18, 8], [14, 2]];
  const frame = (t) => {
    const im = { w: W, h: H, data: new Uint8Array(base.data) };
    { const n = t % crashF.frames; draw(im, crashF.im, crashAt.x - crashF.anchor.x, crashAt.y - crashF.anchor.y, { n, fw: crashF.frame.w }); }
    for (const p of props) p.f(im);
    strikes.forEach(([x, y], i) => { const n = (t + i * 4) % (sc.frames + 6); if (n < sc.frames) draw(im, sc.im, sx(x, y) - sc.anchor.x, sy(x, y) - sc.anchor.y, { n, fw: sc.frame.w }); });
    const F = t < ign.frames ? ign : breath, n = t < ign.frames ? t : (t - ign.frames) % breath.frames;
    draw(im, F.im, mouth.x - F.anchor.x, mouth.y - F.anchor.y, { n, fw: F.frame.w });
    return im;
  };
  const tmp = join(OUT, 'frames'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp);
  for (let t = 0; t < 42; t++) { const im = frame(t); writeImage(join(tmp, `f${String(t).padStart(3, '0')}.png`), im); if (t === 19) writeImage(join(OUT, 'FX_scene_1x.png'), im); }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '14', '-i', join(tmp, 'f%03d.png'), '-vf', 'split[a][b];[a]palettegen=max_colors=255[p];[b][p]paletteuse=dither=none', '-loop', '0', join(OUT, 'FX_scene.gif')]);
  rmSync(tmp, { recursive: true, force: true });
}

// ---- FX_strips: every strip's frames side by side (every other frame) on dark ground
{
  const rows = X.fx.map((f) => ({ f, picks: [...Array(f.frames).keys()].filter((n) => n % 2 === 0 || n === f.frames - 1) }));
  const W = Math.max(...rows.map((r) => r.picks.length * (r.f.frame.w / 2 + 4))) + 8, H = rows.reduce((a, r) => a + r.f.frame.h / 2 + 8, 8), im = bg(W, H);
  let y = 4; for (const { f, picks } of rows) { picks.forEach((n, j) => { const fr = crop(FX[f.id].im, { x: n * f.frame.w, y: 0, w: f.frame.w, h: f.frame.h }), h = resizeArea(fr, f.frame.w / 2 | 0, f.frame.h / 2 | 0); for (let i = 3; i < h.data.length; i += 4) h.data[i] = h.data[i] >= 128 ? 255 : 0; draw(im, h, 4 + j * (f.frame.w / 2 + 4), y); }); y += f.frame.h / 2 + 8; }
  writeImage(join(OUT, 'FX_strips_half.png'), im);
}
console.log('landmarks preview ->', OUT);
