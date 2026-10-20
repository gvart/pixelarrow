// World map art (M4c): paints public/war/world/base.png (+ @2x), borders.png (+ @2x), regions.json, and trims the
// PixelLab glyphs, markers and banners into public/war/world/. Deterministic: rerun = same bytes.
// Usage: SHOTS=<repo>/shots node scripts/war/world-art/paint.mjs   (raws from fetch.mjs; SHOTS defaults to ./shots)
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { LW, LH, SCALE, OX, OY, CELL } from './layout.mjs';
import { buildRegions, OUT, ROOT } from './regions.mjs';
import { warp, noise, distanceField, BORDER as WARP } from './raster.mjs';
import { BIOMES, SEA, COAST, WATER, BORDER, ALLIANCES } from './biomes.mjs';

const SHOTS = process.env.SHOTS || join(ROOT, 'shots');
const RAW = join(SHOTS, 'war/pixellab/worldmap/raw');
const jobs = JSON.parse(readFileSync(new URL('./jobs.json', import.meta.url), 'utf8'));

const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- sprites ----------
function trimHard(img) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const i = (y * img.w + x) * 4;
    img.data[i + 3] = img.data[i + 3] >= 128 ? 255 : 0; // pixel art: hard alpha
    if (img.data[i + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((y0 + y) * img.w + x0) * 4, ((y0 + y) * img.w + x1 + 1) * 4), y * w * 4);
  return { w, h, data };
}
function upscale(img, n) {
  const w = img.w * n, h = img.h * n, data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (((y / n) | 0) * img.w + ((x / n) | 0)) * 4;
    data.set(img.data.subarray(s, s + 4), (y * w + x) * 4);
  }
  return { w, h, data };
}
function loadSprites() {
  const s = {};
  for (const group of ['glyphs', 'markers', 'banners']) {
    s[group] = {};
    for (const name of Object.keys(jobs[group])) {
      // raws (fetch.mjs) when present, else the trimmed 1x copy this script ships, so a fresh checkout rebuilds
      const raw = join(RAW, group, `${name}.png`);
      s[group][name] = trimHard(readImage(existsSync(raw) ? raw : join(OUT, 'src', group, `${name}.png`)));
    }
  }
  return s;
}

// ---------- painting ----------
export function paint() {
  const { war, ids, lab, index, regions } = buildRegions();
  const sprites = loadSprites();
  const N = LW * LH;
  const img = new Uint8Array(N * 4);
  const water = new Uint8Array(N); // 1 river/lake, 2 lagoon/salt (not blocking glyphs differently)
  const put = (i, c) => { img[i * 4] = c[0]; img[i * 4 + 1] = c[1]; img[i * 4 + 2] = c[2]; img[i * 4 + 3] = 255; };
  const L = (id) => index.get(id);
  const half = (p) => [p[0] / SCALE, p[1] / SCALE];

  // sea + shelf + waves
  const seaDist = new Float32Array(N).fill(1e9);
  { const q = []; for (let i = 0; i < N; i++) if (lab[i] > 0) { seaDist[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) { const i = q[h], x = i % LW, y = (i / LW) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < LW - 1 ? i + 1 : -1, y > 0 ? i - LW : -1, y < LH - 1 ? i + LW : -1]) {
        if (j >= 0 && seaDist[j] > seaDist[i] + 1) { seaDist[j] = seaDist[i] + 1; q.push(j); } } } }
  const deep = rgb(SEA.deep), shelf = rgb(SEA.shelf), wave = rgb(SEA.wave);
  for (let i = 0; i < N; i++) if (lab[i] === 0) put(i, seaDist[i] <= 7 && !(seaDist[i] === 7 && (i + ((i / LW) | 0)) & 1) ? shelf : deep);
  const wr = rng(5);
  for (let k = 0; k < 260; k++) {
    const x = (wr() * (LW - 8)) | 0, y = (wr() * LH) | 0;
    if ([0, 1, 2, 3, 4].every((d) => lab[y * LW + x + d] === 0 && seaDist[y * LW + x + d] > 14)) for (let d = 0; d < 4; d++) put(y * LW + x + d + (d === 3 ? 0 : 0), wave);
  }

  // land: flat fill with a patchy 2-colour checker dither
  for (let i = 0; i < N; i++) {
    const r = lab[i];
    if (r <= 0) continue;
    const b = BIOMES[ids[r - 1]];
    const x = i % LW, y = (i / LW) | 0;
    const patch = noise(x / 26, y / 26, 31 + r) + 0.5 * noise(x / 9, y / 9, 77 + r);
    put(i, patch > 0.35 && (x + y) & 1 ? rgb(b.alt) : rgb(b.fill));
  }
  // coast sand edge
  const sand = rgb(COAST);
  for (let i = 0; i < N; i++) if (lab[i] > 0 && seaDist[i] === 0) {
    const x = i % LW, y = (i / LW) | 0;
    if ((x > 0 && lab[i - 1] === 0) || (x < LW - 1 && lab[i + 1] === 0) || (y > 0 && lab[i - LW] === 0) || (y < LH - 1 && lab[i + LW] === 0)) put(i, sand);
  }

  const dist = distanceField(lab);
  const labelBox = {};
  for (const r of war) {
    const [ax, ay] = half(regions[r.id].label);
    const w = r.name.length * 5 + 14;
    labelBox[r.id] = [ax - w / 2, ay - 10, ax + w / 2, ay + 10];
  }
  const inBox = (x, y, b, pad = 0) => x >= b[0] - pad && x <= b[2] + pad && y >= b[1] - pad && y <= b[3] + pad;

  // ---- water features ----
  const wfill = rgb(WATER.fill), wedge = rgb(WATER.edge), wlight = rgb(WATER.light);
  const inv = (q) => { let p = q.slice(); for (let k = 0; k < 6; k++) { const w = warp(p[0], p[1], WARP, 11); p = [p[0] - (w[0] - q[0]) * 0.8, p[1] - (w[1] - q[1]) * 0.8]; } return p; };
  const disc = (cx, cy, rad, kind = 1) => {
    for (let y = Math.floor(cy - rad - 1); y <= cy + rad + 1; y++) for (let x = Math.floor(cx - rad - 1); x <= cx + rad + 1; x++) {
      if (x < 0 || y < 0 || x >= LW || y >= LH) continue;
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rad * rad) { const i = y * LW + x; if (lab[i] > 0) water[i] = kind; }
    }
  };
  const stroke = (pts, width) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
      for (let s = 0; s <= n; s++) disc(x0 + (x1 - x0) * s / n, y0 + (y1 - y0) * s / n, width / 2);
    }
  };
  const blob = (cx, cy, rx, ry, seed, kind = 1) => {
    for (let y = Math.floor(cy - ry * 1.4); y <= cy + ry * 1.4; y++) for (let x = Math.floor(cx - rx * 1.4); x <= cx + rx * 1.4; x++) {
      if (x < 0 || y < 0 || x >= LW || y >= LH) continue;
      const a = Math.atan2(y - cy, x - cx);
      const k = 1 + 0.18 * noise(Math.cos(a) * 2 + seed, Math.sin(a) * 2, seed);
      if (((x - cx) / (rx * k)) ** 2 + ((y - cy) / (ry * k)) ** 2 <= 1) { const i = y * LW + x; if (lab[i] > 0) water[i] = kind; }
    }
  };
  // Great River (Achelous): plateau -> gorge -> ford -> delta fan
  const riverX = OX + 16 * CELL, top = OY + 12 * CELL, sea = OY + 24 * CELL + 30;
  const main = [];
  for (let y = top + 20; y <= OY + 21.3 * CELL; y += 3) main.push(inv([riverX + 5 * Math.sin((y - top) / 21) + 3 * Math.sin((y - top) / 7), y]));
  stroke(main, 4);
  const fork = main[main.length - 1];
  for (const dx of [-38, -12, 14, 40]) {
    const ch = [];
    for (let t = 0; t <= 1.0001; t += 0.05) ch.push([fork[0] + dx * t * t + 3 * Math.sin(t * 9 + dx), fork[1] + t * (sea - OY - 21.3 * CELL)]);
    stroke(ch, dx === -12 || dx === 14 ? 3 : 2);
  }
  // River Ladon: Erymanthos springs -> Lake Stymphalia -> Siren estuary
  const ladon = [];
  for (let x = OX + 12.6 * CELL; x >= OX - 30; x -= 3) ladon.push(inv([x, OY + 12 * CELL + 4 * Math.sin(x / 17) + 2 * Math.sin(x / 6)]));
  for (let k = 0; k < ladon.length - 1; k++) { const t = k / ladon.length; stroke([ladon[k], ladon[k + 1]], t > 0.85 ? 3 + (t - 0.85) * 40 : 2.6); }
  // lakes (placed clear of the label)
  const placeLake = (id, rx, ry, seed) => {
    const k = L(id);
    const [cx0, cy0] = half(regions[id].centroid);
    for (let rad = 0; rad < 60; rad += 2) for (let a = 0; a < 6.28; a += 0.4) {
      const cx = cx0 + rad * Math.cos(a), cy = cy0 + rad * Math.sin(a) * 0.7;
      let ok = true;
      for (let y = cy - ry - 3; y <= cy + ry + 3 && ok; y += 2) for (let x = cx - rx - 3; x <= cx + rx + 3 && ok; x += 2) {
        if (((x - cx) / (rx + 3)) ** 2 + ((y - cy) / (ry + 3)) ** 2 > 1) continue;
        const i = Math.round(y) * LW + Math.round(x);
        if (lab[i] !== k || dist[i] < 4 || inBox(x, y, labelBox[id], 2)) ok = false;
      }
      if (ok) { blob(cx, cy, rx, ry, seed); return [cx, cy]; }
    }
    throw new Error(`no room for the lake in ${id}`);
  };
  const feats = {};
  for (const r of war) for (const e of BIOMES[r.id].extra) {
    if (e === 'lake:stymphalia') feats.stymphalia = placeLake('stymphalia', 30, 17, 3);
    if (e === 'lake:dodona') feats.dodonaLake = placeLake('dodona', 13, 8, 5);
    if (e === 'lake:omphalos') feats.crater = placeLake('omphalos', 11, 8, 7);
    if (e === 'pool:kyrene') feats.pool = placeLake('kyrene', 6, 4, 9);
    if (e === 'oasis') feats.oasis = placeLake('ammos', 6, 4, 11);
    if (e === 'salt-lake') { const p = placeLake('ammon', 20, 11, 13); feats.salt = p; }
    if (e === 'ponds') { for (const s of [17, 19, 23]) { try { placeLake('elaia-n', 6 + (s % 4), 4, s); } catch { /* fine */ } } }
    if (e === 'lagoons') {
      const k = L(r.id), rr = rng(41);
      let n = 0;
      for (let t = 0; t < 4000 && n < 3; t++) {
        const i = (rr() * N) | 0;
        if (lab[i] !== k || dist[i] < 3 || dist[i] > 9) continue;
        const x = i % LW, y = (i / LW) | 0;
        if (inBox(x, y, labelBox[r.id], 14)) continue;
        blob(x, y, 9, 4, 50 + n, 2); n++;
      }
    }
  }
  // paint water: edge ring, fill, a few light glints; salt lake and lagoons get their own tones
  const lagoon = rgb('#5f9a9c'), salt = rgb('#b9cbc6');
  for (let i = 0; i < N; i++) {
    if (!water[i]) continue;
    const x = i % LW, y = (i / LW) | 0;
    const edge = [i - 1, i + 1, i - LW, i + LW].some((j) => !water[j] && lab[j] > 0);
    const inAmmon = lab[i] === L('ammon');
    if (inAmmon) put(i, edge ? rgb('#9fb3ae') : salt);
    else if (water[i] === 2) put(i, edge ? wedge : lagoon);
    else put(i, edge ? wedge : (x * 7 + y * 13) % 53 === 0 ? wlight : wfill);
  }

  // ---- glyphs ----
  const placed = []; // [x0,y0,x1,y1]
  const draws = [];
  const fits = (g, x, y, k, id) => { // x,y = top-left
    if (x < 0 || y < 0 || x + g.w > LW || y + g.h > LH) return false;
    for (const b of placed) if (x < b[2] && x + g.w > b[0] && y < b[3] && y + g.h > b[1]) return false;
    if (id && x < labelBox[id][2] + 6 && x + g.w > labelBox[id][0] - 6 && y < labelBox[id][3] + 4 && y + g.h > labelBox[id][1] - 4) return false;
    for (let yy = 0; yy < g.h; yy++) for (let xx = 0; xx < g.w; xx++) {
      if (!g.data[(yy * g.w + xx) * 4 + 3]) continue;
      const i = (y + yy) * LW + x + xx;
      if (lab[i] !== k || dist[i] < 3 || water[i]) return false;
    }
    return true;
  };
  const take = (g, x, y) => { placed.push([x - 1, y - 1, x + g.w + 1, y + g.h + 1]); draws.push([g, x, y]); };
  // landmarks first: towns above the label, temple, pass, ford, oasis palms
  const above = (id, g, dy = 2) => {
    const b = labelBox[id], k = L(id);
    const cx = Math.round((b[0] + b[2]) / 2 - g.w / 2);
    for (const [ox, oy] of [[0, b[1] - g.h - dy], [0, b[3] + dy], [-g.w, b[1] - g.h], [g.w, b[1] - g.h], [-g.w, b[3]], [g.w, b[3]]]) {
      const x = cx + ox, y = Math.round(oy);
      if (fits(g, x, y, k, null)) { take(g, x, y); return true; }
    }
    console.warn(`no room for a landmark in ${id}`);
    return false;
  };
  for (const r of war) for (const e of BIOMES[r.id].extra) {
    if (e === 'town') above(r.id, sprites.glyphs.town);
    if (e === 'temple') above(r.id, sprites.glyphs.temple);
    if (e === 'pass') above(r.id, sprites.glyphs.pass);
  }
  { // ford: on the Great River, just above the Achelous label
    const g = sprites.glyphs.ford, b = labelBox.achelous;
    let best = main[0];
    for (const p of main) if (Math.abs(p[1] - (b[1] - 18)) < Math.abs(best[1] - (b[1] - 18))) best = p;
    const x = Math.round(best[0] - g.w / 2), y = Math.round(best[1] - g.h / 2);
    take(g, x, y);
  }
  const nearPalm = (id, at) => {
    if (!at) return;
    const g = sprites.glyphs.palm, k = L(id);
    let n = 0;
    for (const [ox, oy] of [[8, -g.h + 2], [-g.w - 6, -g.h + 4], [10, -4], [-g.w - 8, -6]]) {
      const x = Math.round(at[0] + ox), y = Math.round(at[1] + oy);
      if (n < 2 && fits(g, x, y, k, id)) { take(g, x, y); n++; }
    }
  };
  nearPalm('kyrene', feats.pool);
  nearPalm('ammos', feats.oasis);
  // scatter
  for (const r of war) {
    const b = BIOMES[r.id], k = L(r.id), rr = rng(1000 + k * 17);
    const area = regions[r.id].area / (SCALE * SCALE);
    const want = Math.round((area / 10000) * b.density);
    const total = b.glyphs.reduce((s, g) => s + g[1], 0);
    let got = 0;
    for (let t = 0; t < want * 60 && got < want; t++) {
      let pick = rr() * total, name = b.glyphs[0][0];
      for (const [gname, wgt] of b.glyphs) { if ((pick -= wgt) < 0) { name = gname; break; } }
      const g = sprites.glyphs[name];
      const i = (rr() * N) | 0;
      if (lab[i] !== k) { t--; continue; }
      const x = (i % LW) - (g.w >> 1), y = ((i / LW) | 0) - g.h;
      if (fits(g, x, y, k, r.id)) { take(g, x, y); got++; }
    }
  }
  draws.sort((a, b) => a[2] + a[0].h - (b[2] + b[0].h));
  for (const [g, x, y] of draws) for (let yy = 0; yy < g.h; yy++) for (let xx = 0; xx < g.w; xx++) {
    const s = (yy * g.w + xx) * 4;
    if (g.data[s + 3]) put((y + yy) * LW + x + xx, [g.data[s], g.data[s + 1], g.data[s + 2]]);
  }

  // ---- borders overlay ----
  const bord = new Uint8Array(N * 4);
  const dark = rgb(BORDER.dark), light = rgb(BORDER.light);
  const setB = (i, c, a) => { if (bord[i * 4 + 3] >= a) return; bord[i * 4] = c[0]; bord[i * 4 + 1] = c[1]; bord[i * 4 + 2] = c[2]; bord[i * 4 + 3] = a; };
  const isEdge = (i) => { const v = lab[i]; if (v <= 0) return false; const x = i % LW, y = (i / LW) | 0;
    return (x > 0 && lab[i - 1] > 0 && lab[i - 1] !== v) || (x < LW - 1 && lab[i + 1] > 0 && lab[i + 1] !== v) ||
      (y > 0 && lab[i - LW] > 0 && lab[i - LW] !== v) || (y < LH - 1 && lab[i + LW] > 0 && lab[i + LW] !== v); };
  const edge = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (isEdge(i)) edge[i] = 1;
  for (let i = 0; i < N; i++) {
    if (edge[i]) { setB(i, dark, 255); continue; }
    if (lab[i] <= 0) continue;
    const x = i % LW, y = (i / LW) | 0;
    if ((x > 0 && edge[i - 1]) || (x < LW - 1 && edge[i + 1]) || (y > 0 && edge[i - LW]) || (y < LH - 1 && edge[i + LW])) setB(i, light, 150);
  }
  for (let i = 0; i < N; i++) { // coast: dark line on the sea side
    if (lab[i] !== 0) continue;
    const x = i % LW, y = (i / LW) | 0;
    if ((x > 0 && lab[i - 1] > 0) || (x < LW - 1 && lab[i + 1] > 0) || (y > 0 && lab[i - LW] > 0) || (y < LH - 1 && lab[i + LW] > 0)) setB(i, dark, 255);
  }

  // ---- write ----
  mkdirSync(OUT, { recursive: true });
  const base = { w: LW, h: LH, data: img }, borders = { w: LW, h: LH, data: bord };
  writeImage(join(OUT, 'base.png'), upscale(base, SCALE));
  writeImage(join(OUT, 'base@2x.png'), upscale(base, SCALE * 2));
  writeImage(join(OUT, 'borders.png'), upscale(borders, SCALE));
  writeImage(join(OUT, 'borders@2x.png'), upscale(borders, SCALE * 2));
  // region ids raster (1 px per logical px, R = 1-based index in regions.json order; 0 = sea) for exact hit tests
  const idImg = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) { idImg[i * 4] = Math.max(0, lab[i]); idImg[i * 4 + 3] = 255; }
  writeImage(join(OUT, 'region-ids.png'), { w: LW, h: LH, data: idImg });
  for (const group of ['glyphs', 'markers', 'banners']) {
    mkdirSync(join(OUT, 'src', group), { recursive: true });
    for (const [name, im] of Object.entries(sprites[group])) writeImage(join(OUT, 'src', group, `${name}.png`), im);
  }
  for (const group of ['markers', 'banners']) {
    mkdirSync(join(OUT, group), { recursive: true });
    for (const [name, im] of Object.entries(sprites[group])) {
      writeImage(join(OUT, group, `${name}.png`), upscale(im, SCALE));
      writeImage(join(OUT, group, `${name}@2x.png`), upscale(im, SCALE * 2));
    }
  }
  const doc = {
    note: 'World map (W-02, M4c). Coordinates are map px of base.png (2048x1536; @2x files are the same art at 4096x3072). Layers, bottom up: base.png (biome fills, coast, rivers, lakes, glyphs), ownership tints (the view fills polygon with the alliance colour, ~35% alpha), borders.png (region borders + coast line), labels at label, markers. polygon: outer outline, clockwise; centroid: area centre; label: name anchor (glyph-free box round it); crossings[neighbour]: point on the shared border where a transfer crosses. region-ids.png: 1024x768, red channel = 1-based index in this file\'s region order (0 = sea), scale by 2 for map px. Built by scripts/war/world-art (regions.mjs, paint.mjs) from docs/WAR.md; do not hand-edit.',
    size: [LW * SCALE, LH * SCALE],
    alliances: ALLIANCES,
    order: ids,
    regions,
  };
  writeFileSync(join(OUT, 'regions.json'), JSON.stringify(doc, null, 1).replace(/\[\s+(-?\d+),\s+(-?\d+)\s+\]/g, '[$1,$2]'));
  // colour balance check: neighbouring fills must differ enough to read as separate regions
  const close = [];
  for (const r of war) for (const n of r.adjacent) if (r.id < n) {
    const a = rgb(BIOMES[r.id].fill), b = rgb(BIOMES[n].fill);
    const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    if (d < 28) close.push(`${r.id}/${n} ${d.toFixed(0)}`);
  }
  if (close.length) console.warn('neighbour fills too close: ' + close.join(', '));
  console.log(`world map: ${ids.length} regions, ${draws.length} glyphs`);
}

paint();
