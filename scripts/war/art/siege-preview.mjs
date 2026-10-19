// Siege art preview (Siege, PROMPTS_ART.md): contact sheet of public/war/siege and a 1:1 mock-up on the global tiles with
// the build-mode walls and soldiers: a ram at the Lion Gate with its crew, a raised ladder with a climber, a stone thrower
// firing, a burning palisade with smoke, a breach with rubble. Usage: node scripts/war/art/siege-preview.mjs [out dir]
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, crop, paste, resizeNearest } from '../../art/lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = process.argv[2] ?? '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/pixellab/siege';
mkdirSync(OUT, { recursive: true });
const SD = join(ROOT, 'public/war/siege'), BD = join(ROOT, 'public/war/buildings'), TD = join(ROOT, 'public/war/tiles');
const S = JSON.parse(readFileSync(join(SD, 'objects.json'))), B = JSON.parse(readFileSync(join(BD, 'objects.json'))), T = JSON.parse(readFileSync(join(TD, 'tiles.json')));
const BG = [22, 17, 13, 255];
const fill = (im, c = BG) => { for (let i = 0; i < im.w * im.h; i++) im.data.set(c, i * 4); return im; };
const spr = Object.fromEntries([...B.objects.map((o) => [o.id, { ...o, im: readImage(join(BD, o.file)) }]), ...S.objects.map((o) => [o.id, { ...o, im: readImage(join(SD, o.file)) }])]);
const kit = Object.fromEntries(B.kits.map((k) => [k.id, { ...k, sheets: Object.fromEntries(Object.entries(k.states).map(([s, f]) => [s, readImage(join(BD, f))])), fronts: Object.fromEntries(Object.entries(k.front ?? {}).map(([s, f]) => [s, readImage(join(BD, f))])) }]));
const frame = (k, s, n, layer = 'back') => { const K = kit[k], c = K.columns ?? K.frames; return crop(layer === 'front' ? K.fronts[s] : K.sheets[s], { x: (n % c) * K.frame.w, y: Math.floor(n / c) * K.frame.h, w: K.frame.w, h: K.frame.h }); };
const stripFrame = (t, n) => ({ im: crop(readImage(join(SD, t.file)), { x: n * t.frame.w, y: 0, w: t.frame.w, h: t.frame.h }), tileOrigin: t.tileOrigin, anchor: t.anchor });
const fxOf = (id) => S.fx.find((f) => f.id === id);

// ---- contact sheet: every sprite, then every strip
{
  const objW = 2400, im = fill(blank(objW, 4200)); let x = 4, y = 4, rowH = 0;
  const put = (o) => { if (x + o.w > objW) { x = 4; y += rowH + 10; rowH = 0; } paste(im, o, x, y); x += o.w + 10; rowH = Math.max(rowH, o.h); };
  for (const o of S.objects) put(spr[o.id].im);
  x = 4; y += rowH + 20; rowH = 0;
  const strips = [...S.engines.flatMap((e) => Object.values(e.anims).flatMap((a) => Object.values(a))), ...Object.values(S.ladders.pushOff).slice(0, 2), ...S.fx];
  for (const t of strips) put(readImage(join(SD, t.file)));
  writeImage(join(OUT, 'SIEGE_contact.png'), crop(im, { x: 0, y: 0, w: objW, h: y + rowH + 6 }));
}

// ---- terrain + scene (as buildings-preview: grass, depth by key)
const sheet = (pair) => { const s = T.sheets.find((q) => q.pair === pair); const im = readImage(join(TD, s.file)); return [...Array(16)].map((_, m) => crop(im, { x: s.maskToFrame[m] * 64, y: 0, w: 64, h: 48 })); };
const GS = sheet('grass-shallow');
function soldier(cls, row, col) {
  const dir = join(ROOT, 'src/assets/sheets', cls); if (!existsSync(dir)) return null;
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'))), sh = readImage(join(dir, m.image));
  const r = m.rows.indexOf(row), wrap = m.wrap ?? 1e9, band = Math.floor(col / wrap);
  const im = crop(sh, { x: (col % wrap) * m.frame.w, y: (band * m.rows.length + r) * m.frame.h, w: m.frame.w, h: m.frame.h });
  const a = m.anchors?.[row] ?? m.anchor; return { im, anchor: { x: a.x, y: a.y } };
}
function scene(n, items, name, cropY = 200) {
  const W = n * 64 + 64, H = n * 32 + 520, OX = n * 32 + 32, OY = 460, img = fill(blank(W, H));
  const sx = (x, y) => OX + (x - y) * 32, sy = (x, y) => OY + (x + y) * 16;
  for (let d = 0; d <= 2 * (n - 1); d++) for (let x = 0; x < n; x++) { const y = d - x; if (y < 0 || y >= n) continue; paste(img, GS[15], sx(x, y) - 32, sy(x, y)); }
  for (const it of [...items].sort((a, b) => a.key - b.key)) {
    if (it.kind === 'kit') { const k = kit[it.id]; paste(img, frame(it.id, it.state, it.n, it.layer), sx(it.x, it.y) - k.tileOrigin.x, sy(it.x, it.y) - k.tileOrigin.y); }
    else if (it.kind === 'obj') { const o = it.o ?? spr[it.id]; paste(img, o.im, Math.round(sx(it.x, it.y) - o.tileOrigin.x), Math.round(sy(it.x, it.y) - (it.z ?? 0) * 33 - o.tileOrigin.y)); }
    else if (it.kind === 'fx') { const f = stripFrame(fxOf(it.id), it.n ?? 0); paste(img, f.im, Math.round(sx(it.x, it.y) - f.anchor.x), Math.round(sy(it.x, it.y) - (it.z ?? 0) * 33 - f.anchor.y)); }
    else if (it.s) paste(img, it.s.im, Math.round(sx(it.x, it.y) - it.s.anchor.x), Math.round(sy(it.x, it.y) - (it.z ?? 0) * 33 - it.s.anchor.y));
  }
  const out = crop(img, { x: 0, y: cropY, w: W, h: H - cropY }); writeImage(join(OUT, `${name}.png`), out); return out;
}
function walls(id, state, cells, solid, open = new Map(), only = null) {
  const has = (x, y) => cells.has(`${x},${y}`) || solid.has(`${x},${y}`), K = kit[id];
  return [...cells].filter((c) => !only || only.has(c)).flatMap((c) => {
    const [x, y] = c.split(',').map(Number); const n = (has(x + 1, y) ? 1 : 0) | (has(x, y + 1) ? 2 : 0) | (has(x - 1, y) ? 4 : 0) | (has(x, y - 1) ? 8 : 0);
    if (!K.layered) return [{ kind: 'kit', id, state, n, x, y, key: x + y + 1 }];
    const f = K.frameOf[n | ((open.get(c) ?? 0) << 4)];
    return [{ kind: 'kit', id, state, n: f, x, y, key: x + y + 0.7 }, { kind: 'kit', id, state, n: f, x, y, layer: 'front', key: x + y + 1.3 }];
  });
}
const at = (s, x, y, z = 0) => ({ kind: 'unit', s, x, y, z, key: x + y + 0.02 });
const obj = (id, x, y, key, z = 0) => ({ kind: 'obj', id, x, y, z, key: key ?? x + y + spr[id].footprint[0] + spr[id].footprint[1] - 0.01 });
const hopNE = [0, 4, 8].map((c) => soldier('hoplite', 'north-east', 41 + c)), hopSE = soldier('hoplite', 'south-east', 0), hopSW = soldier('hoplite', 'south-west', 0), arcSE = soldier('archer', 'south-east', 104), arcSW = soldier('archer', 'south-west', 104);
const climb = soldier('hoplite', 'north-east', 45), hopNW = soldier('hoplite', 'north-west', 0);

// The scene: a cyclopean wall 2 deep along x (rows y 5-6) with the Lion Gate (x 7-8, 2-deep, the passage on the n side).
// Outside (+y, towards the viewer): the ram at the gate (pointing n), a long ladder raised on the face with a climber,
// a thrower firing at the wall, a breach (x 12-13) with rubble; to the east a burning palisade with smoke.
const frames = { ram: 6, throw: 3, fire: 2 };
function mock(tag, t) {
  const items = [], wallCells = new Set(), solid = new Set(), K = (x, y) => `${x},${y}`;
  for (let x = 1; x <= 15; x++) for (const y of [5, 6]) wallCells.add(K(x, y));
  for (const c of [K(7, 5), K(8, 5), K(7, 6), K(8, 6)]) { wallCells.delete(c); solid.add(c); }
  const breach = new Set([K(12, 5), K(12, 6), K(13, 5), K(13, 6)]); for (const c of breach) { wallCells.delete(c); solid.add(c); }
  const dmg = new Set([K(11, 5), K(11, 6), K(14, 5), K(14, 6)]);
  const W = kit['stone-wall'].walkwayM;
  items.push(...walls('stone-wall', 'done', wallCells, solid, new Map([[K(4, 6), 2]]), new Set([...wallCells].filter((c) => !dmg.has(c)))));
  items.push(...walls('stone-wall', 'damaged', wallCells, solid, new Map(), dmg));
  items.push(obj('stone-gate-x-deep-n-done', 7, 5, 7 + 5 + 2.6));
  items.push(obj('breach-stone-wall-x-a', 12, 5, 12 + 5 + 1.5), obj('breach-stone-wall-x-b', 13, 5, 13 + 5 + 1.5));
  // defenders on the walk
  for (const [i, x] of [2.4, 3.2, 4.9, 5.7, 9.6, 10.4].entries()) items.push({ ...at(i % 2 ? arcSW : arcSE, x, 6.62, W), key: Math.floor(x) + 6 + 1 + 0.05 });
  // the ram: pointing n at the gate, its head at the gate's face; crew between its layers
  const R = S.engines.find((e) => e.id === 'ram'), rx = 7, ry = 7.15, sw = R.anims.n.swing;
  items.push({ kind: 'obj', o: stripFrame(sw, (frames.ram + t) % sw.frames), x: rx, y: ry, key: rx + ry + 0.6 });
  for (const [cx, cy] of R.crew.n) items.push({ ...at(hopNE[Math.floor(cx * 7 + cy * 3) % 3], rx + cx, ry + cy), key: rx + ry + 0.8 + 0.01 * (cx + cy) });
  items.push(obj(R.front.n.done, rx, ry, rx + ry + 2 + 3 + 0.2));
  items.push(...[0, 1, 2, 3].map((i) => at(hopSE, 6 + 0.6 * i, 11.6 + 0.3 * (i % 2)))); // the escort
  // ladder raised on the face (its tile in front of the wall at x 4, y 7; the face on its n side) and a climber
  const L = S.ladders, lt = L.targets['stone-wall'];
  items.push(obj(L.pieces['stone-wall-n'], 4, 7, 4 + 7 + 0.9));
  for (const [i, z] of [2.6, 0].entries()) { const out = lt.footM * (1 - z / lt.topM); items.push({ ...at(i ? hopNE[1] : climb, 4.5, 7 + out / 2, z), key: 4 + 7 + 0.95 + 0.01 * i }); }
  items.push(...[0, 1, 2].map((i) => at(hopNE[i], 3.2 + 0.5 * i, 8.6 + 0.2 * i)));
  // a carried ladder coming up (lifted by carryPx), bearers under it
  const C = L.carry['stone-wall-y']; items.push(obj(C.sprite, 1, 9, 1 + 9 + 0.5, C.carryM)); for (const [bx, by] of C.bearers) items.push({ ...at(hopNE[0], 1 + bx, 9 + by), key: 1 + 9 + 0.4 });
  // thrower facing n, firing; the shot in flight
  const TT = S.engines.find((e) => e.id === 'thrower'), tx = 11, ty = 13, th = TT.anims.n.throw;
  items.push({ kind: 'obj', o: stripFrame(th, (frames.throw + t) % th.frames), x: tx, y: ty, key: tx + ty + 3 });
  items.push(at(hopSE, tx - 0.4, ty + 1.4), at(hopSW, tx + 1.3, ty + 2.2), at(hopNW, tx + 0.4, ty + 2.6));
  items.push(obj('stone-shot', 11.8, 9.5, 30, 6.5));
  // the breach: rubble with men climbing through
  items.push(at(hopNE[2], 12.6, 7.6, 0.5), at(hopNE[0], 13.3, 7.9, 0.4), at(hopNE[1], 12.9, 8.6));
  // burning palisade east (x 18-24, y 4) with flames, smoke and embers; a scorch decal in front
  const pal = new Set(); for (let y = 8; y <= 15; y++) pal.add(K(19, y)); const burning = new Set([K(19, 10), K(19, 11), K(19, 12)]);
  items.push(...walls('palisade', 'damaged', pal, new Set(), new Map(), burning), ...walls('palisade', 'done', pal, new Set(), new Map(), new Set([...pal].filter((c) => !burning.has(c)))));
  items.push({ kind: 'fx', id: 'scorch-cold', x: 20.4, y: 11.4, key: 0 });
  for (const [i, [y, id]] of [[10.4, 'flame-m'], [11.4, 'flame-l'], [12.4, 'flame-m'], [9.6, 'flame-s']].entries()) items.push({ kind: 'fx', id, n: (frames.fire + t + i * 3) % 8, x: 19.6, y, z: 0.4, key: 19 + y + 1.5 });
  items.push({ kind: 'fx', id: 'smoke', n: t % 16, x: 19.4, y: 11.2, z: 2.2, key: 40 }, { kind: 'fx', id: 'embers', n: t % 12, x: 19.6, y: 11.6, z: 1.2, key: 40.1 });
  items.push(at(arcSW, 21.5, 11.2), at(arcSE, 22.1, 12.0), at(arcSW, 21.7, 13.1)); // the archers who lit it
  // a burning ram wreck and a fire-arrow trail over the field
  items.push(obj(R.states.e.destroyed, 16, 10, 16 + 10 + 4.5), { kind: 'fx', id: 'flame-s', n: (t + 5) % 8, x: 17.2, y: 11, z: 0.3, key: 32 }, { kind: 'fx', id: 'fire-arrow-trail', n: t % 8, x: 15, y: 8, z: 4, key: 40 });
  return scene(26, items, tag);
}
const im = mock('SIEGE_mock_1x', 0);
writeImage(join(OUT, 'SIEGE_mock_2x_crop.png'), resizeNearest(crop(im, { x: 380, y: 230, w: 1000, h: 560 }), 2000, 1120));
// states of the engines (every facing x every state) at 1:1
{
  const cw = 280, rh = 260, rows = S.engines.flatMap((e) => e.facings.map((f) => [e, f])), st = [...S.buildOrder, 'damaged', 'destroyed'];
  const img = fill(blank(cw * st.length + 20, rh * rows.length + 20));
  rows.forEach(([e, f], r) => st.forEach((s, c) => { const o = spr[e.states[f][s]], fr = e.front?.[f]?.[s] && spr[e.front[f][s]]; const X = 10 + c * cw + 140, Y = 10 + r * rh + 170; paste(img, o.im, X - o.tileOrigin.x, Y - o.tileOrigin.y); if (fr) paste(img, fr.im, X - fr.tileOrigin.x, Y - fr.tileOrigin.y); }));
  writeImage(join(OUT, 'SIEGE_states_1x.png'), img);
}
console.log('siege preview ->', OUT);
