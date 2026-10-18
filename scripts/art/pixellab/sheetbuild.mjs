// Promote a class's reviewed PixelLab clips to a game sheet (I3a): src/assets/sheets/<class>/{<class>.png,
// manifest.json} in the v2 manifest format (docs/v5/art/SHEET_FORMAT.md: one image, colorGroups, tiers, hold,
// strike, per-row anchors, wrap). Generating is not shipping: only what the spec lists, with its fixes, lands here.
// Usage: node scripts/art/pixellab/sheetbuild.mjs <spec.json> [--out dir] [--report report.json]
//
// spec: {
//   "class", "raw": "<raw dir with clips/>", "out": "src/assets/sheets/<class>",
//   "scale": 0.55, "rowsFeet": { "<dir>": [x, y] } (the feet point in the 68 rotation of each facing),
//   "canvases": { "<name>": { "<dir>": [dx, dy] } } (where the rotation sits in each clip's first frame),
//   "anims": { "<anim>": { "fps", "hold"?, "strike"?, "canvas", "spear": "upright" | "level", "align"? (default true:
//              each clip is re-anchored on its frame 0's feet and shins, which PixelLab redraws a few px off),
//              "dirs": { "<dir>": { "attempt", "fixes"?: [{ "frame", "op": "copy", "from" } | { "frame", "op": "clear", "box", "red"? }],
//                                    "frames"?: [indices to keep, in order] } } } },
//   "parts"?: { "<ramp>" | "<ramp>:<step>" | "<ramp>:<from>-<to>": "<part>" } (overrides the default ramp -> part map,
//              docs/v5/art/STYLE_LOCK.md › Colour),
//   "crest"?: false, "emblem"?: false (no crest / no shield emblem: that crimson stays cloak),
//   "stature"?: { "skipTop"?: rows, "from"?: "any", "px"?, "tol"? } (read by qc.mjs --spec: how helmet top to feet is
//              measured and its target, default 58 ± 3),
//   "tiers": { "veteran": { "<group>": [anchor hex dark->light] }, "elite": { ... } }
// }
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeImage } from '../lib/png.mjs';
import { blank, hexToRgb } from '../lib/ops.mjs';
import { loadClip } from './gif.mjs';
import { splitFrame, rampMapper, exclusivePalette, lum, HOPLITE_RAMPS, LEVEL } from './groups.mjs';

const ROWS = ['south-east', 'north-east', 'south-west', 'north-west'];
const MAX_W = 4096;

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const specPath = args.find((a) => a.endsWith('.json') && !a.startsWith('--'));
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const outDir = opt('out', spec.out);
const map = rampMapper(spec.ramps ?? HOPLITE_RAMPS);

// ---- 1. load, fix, split
const clips = []; // { anim, dir, frames: [{img, parts, spear}], origin: [x, y] }
for (const [anim, a] of Object.entries(spec.anims)) {
  for (const dir of ROWS) {
    const d = a.dirs[dir];
    if (!d) throw new Error(`${anim}: no ${dir}`);
    let fr = loadClip(join(spec.raw, 'clips', anim, dir, d.attempt));
    for (const f of d.fixes ?? []) {
      if (f.op === 'copy') fr[f.frame] = { ...fr[f.from], data: new Uint8Array(fr[f.from].data) };
      else if (f.op === 'clear') {
        const im = fr[f.frame];
        const [x0, y0, x1, y1] = f.box;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const i = (y * im.w + x) * 4;
          // red: only the crimson pixels (a blood splat over the figure)
          if (!f.red || im.data[i] > im.data[i + 1] * 1.6) im.data[i + 3] = 0;
        }
      } else throw new Error(`fix op ${f.op}`);
    }
    if (d.frames) fr = d.frames.map((i) => fr[i]);
    const [fx, fy] = spec.rowsFeet[dir];
    const [dx, dy] = spec.canvases[a.canvas]?.[dir] ?? [0, 0];
    const headDir = a.spear === 'level' ? LEVEL[dir] : [0, -1];
    let prev = null;
    const frames = fr.map((img) => {
      const r = splitFrame(img, map, { prev, headDir, parts: spec.parts, crest: spec.crest !== false, emblem: spec.emblem !== false });
      prev = r.parts;
      return { img, parts: r.parts, info: r.info, spear: r.spear, dropped: r.dropped };
    });
    // PixelLab redraws the figure a few px off where the first frame had it (skeleton-v3 lowers it by 4-6 px):
    // measure frame 0's feet (lowest body pixel) and shins' centre and move the clip's origin onto them
    const origin = [fx + dx, fy + dy];
    if (a.align !== false) {
      const f0 = frames[0];
      const body = (i) => f0.parts[i] && f0.parts[i] !== 'wood' && f0.parts[i] !== 'weaponMetal';
      const W0 = f0.img.w;
      let low = -1;
      for (let i = 0; i < f0.parts.length; i++) if (body(i)) low = Math.max(low, (i / W0) | 0);
      let lo = W0, hi = -1;
      for (let y = low - 8; y <= low - 3; y++) for (let x = 0; x < W0;) {
        if (!body(y * W0 + x)) { x++; continue; }
        let e = x;
        while (e < W0 && body(y * W0 + e)) e++;
        if (e - x >= 4) { lo = Math.min(lo, x); hi = Math.max(hi, e - 1); }
        x = e;
      }
      const shift = [hi >= 0 ? Math.round((lo + hi) / 2) - origin[0] : 0, low >= 0 ? low - origin[1] : 0];
      // only a small drift is corrected: a big one means the first frame is not standing (or the measure failed)
      if (Math.abs(shift[0]) <= 6 && Math.abs(shift[1]) <= 8) { origin[0] += shift[0]; origin[1] += shift[1]; }
      if (shift[0] || shift[1]) console.log(`  ${anim} ${dir}: frame 0 drifted ${shift[0]},${shift[1]} px${Math.abs(shift[0]) <= 6 && Math.abs(shift[1]) <= 8 ? ', re-anchored' : ', LEFT AS IS'}`);
    }
    clips.push({ anim, dir, frames, origin });
  }
}

// ---- 2. the exclusive palette
const usage = new Map();
for (const c of clips) for (const f of c.frames) f.parts.forEach((p, i) => {
  if (!p) return;
  const rgb = f.info[i].rgb;
  if (!usage.has(p)) usage.set(p, new Map());
  usage.get(p).set(rgb.join(','), { rgb, L: lum(rgb) });
});
const pal = exclusivePalette(usage);

// ---- 3. frame size and per-row anchors (the union of every frame's extent around its feet point)
const ext = Object.fromEntries(ROWS.map((r) => [r, { l: 0, r: 0, u: 0, d: 0 }]));
for (const c of clips) for (const f of c.frames) {
  const { w, h } = f.img;
  const e = ext[c.dir];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (f.parts[y * w + x]) {
    e.l = Math.max(e.l, c.origin[0] - x);
    e.r = Math.max(e.r, x - c.origin[0] + 1);
    e.u = Math.max(e.u, c.origin[1] - y);
    e.d = Math.max(e.d, y - c.origin[1] + 1);
  }
}
if (args.includes('--extents')) {
  // which clips set the frame size
  for (const c of clips) {
    const e = { l: 0, r: 0, u: 0, d: 0 };
    for (const f of c.frames) for (let i = 0; i < f.parts.length; i++) if (f.parts[i]) {
      const x = i % f.img.w, y = (i / f.img.w) | 0;
      e.l = Math.max(e.l, c.origin[0] - x); e.r = Math.max(e.r, x - c.origin[0] + 1); e.u = Math.max(e.u, c.origin[1] - y); e.d = Math.max(e.d, y - c.origin[1] + 1);
    }
    console.log(`  extent ${c.anim} ${c.dir}: left ${e.l} right ${e.r} up ${e.u} down ${e.d}`);
  }
}
const up = Math.max(...ROWS.map((r) => ext[r].u)), down = Math.max(...ROWS.map((r) => ext[r].d));
const FW = Math.max(...ROWS.map((r) => ext[r].l + ext[r].r)) + 2;
const FH = up + down + 2;
const anchors = Object.fromEntries(ROWS.map((r) => [r, { x: ext[r].l + 1, y: up + 1 }]));

// ---- 4. columns and packing (wrap)
let col = 0;
const anims = {};
const cols = {};
for (const [anim, a] of Object.entries(spec.anims)) {
  const n = Math.max(...clips.filter((c) => c.anim === anim).map((c) => c.frames.length));
  for (const c of clips.filter((c) => c.anim === anim)) if (c.frames.length !== n) throw new Error(`${anim} ${c.dir}: ${c.frames.length} frames, others ${n}`);
  anims[anim] = { col, frames: n, fps: a.fps, ...(a.hold !== undefined ? { hold: a.hold } : {}), ...(a.strike !== undefined ? { strike: a.strike } : {}) };
  cols[anim] = col;
  col += n;
}
const wrap = Math.floor(MAX_W / FW);
const bands = Math.ceil(col / wrap);
const sheet = blank(Math.min(col, wrap) * FW, bands * ROWS.length * FH);
const report = [];
for (const c of clips) {
  const row = ROWS.indexOf(c.dir);
  const an = anchors[c.dir];
  c.frames.forEach((f, i) => {
    const k = cols[c.anim] + i;
    const X0 = (k % wrap) * FW + an.x - c.origin[0];
    const Y0 = (Math.floor(k / wrap) * ROWS.length + row) * FH + an.y - c.origin[1];
    const { w, h } = f.img;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = f.parts[y * w + x];
      if (!p) continue;
      const rgb = pal.rgbOf(p, f.info[y * w + x].rgb);
      const X = X0 + x, Y = Y0 + y;
      sheet.data.set([...rgb, 255], (Y * sheet.w + X) * 4);
    }
    report.push({ anim: c.anim, dir: c.dir, frame: i, spear: f.spear && { head: f.spear.head.map((v) => +v.toFixed(1)), butt: f.spear.butt.map((v) => +v.toFixed(1)), headW: +f.spear.headW.toFixed(2), buttW: +f.spear.buttW.toFixed(2), len: Math.round(f.spear.len) }, headDir: spec.anims[c.anim].spear, dropped: f.dropped });
  });
}

// ---- 5. colour groups and tier ramps
const G = pal.groups;
const groupNames = { cloak: 'cloak', crest: 'crest', trim: 'trim', skin: 'skin', emblem: 'emblem', wood: 'wood' };
const colorGroups = {};
for (const [part, name] of Object.entries(groupNames)) if (G[part]?.length) colorGroups[name] = G[part];

/** A target ramp of n colours, dark->light, interpolated in OKLab over the anchors. */
function ramp(anchorsHex, n) {
  const A = anchorsHex.map((h) => hexToRgb(h));
  if (n === 1) return [anchorsHex[Math.floor(anchorsHex.length / 2)]];
  return Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) * (A.length - 1);
    const j = Math.min(A.length - 2, Math.floor(t)), u = t - j;
    const a = A[j], b = A[Math.min(A.length - 1, j + 1)];
    const c = a.map((v, k) => Math.round(v + (b[k] - v) * u));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  });
}
const tiers = { basic: {} };
for (const [t, groups] of Object.entries(spec.tiers ?? {})) {
  tiers[t] = {};
  for (const [g, anc] of Object.entries(groups)) if (colorGroups[g]) tiers[t][g] = ramp(anc, colorGroups[g].length);
}
const metal = [];
if (G.metal?.length) metal.push({ kind: 'bronze', colors: [...G.metal].reverse(), slots: ['shield', 'helmet', 'armor'] });
if (G.weaponMetal?.length) metal.push({ kind: 'bronze', colors: [...G.weaponMetal].reverse(), slots: ['weapon'] });

const manifest = {
  version: 2,
  class: spec.class,
  image: `${spec.class}.png`,
  frame: { w: FW, h: FH },
  anchor: anchors['south-west'],
  anchors,
  scale: spec.scale,
  rows: ROWS,
  facings: ROWS,
  wrap,
  anims,
  colorGroups,
  metal,
  tiers,
};
mkdirSync(outDir, { recursive: true });
writeImage(join(outDir, `${spec.class}.png`), sheet);
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
const rep = opt('report');
if (rep) writeFileSync(rep, JSON.stringify({ frame: manifest.frame, anchors, wrap, clips: report }, null, 0));
console.log(`${spec.class}: ${col} columns x ${ROWS.length} rows of ${FW}x${FH}, wrap ${wrap} (${bands} bands) -> ${sheet.w}x${sheet.h}, ${Object.keys(colorGroups).length} colour groups, ${metal.length} metal groups`);
