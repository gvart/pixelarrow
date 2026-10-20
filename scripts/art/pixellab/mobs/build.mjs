// Build a mob (neutral-region creature) as a soldier-format v2 sheet (docs/v5/art/SHEET_FORMAT.md):
// src/assets/sheets/<class>/{<class>.png, manifest.json}. PixelLab pro draws every animal to fill its 68 canvas, so
// each frame is shrunk to true scale (33 px/m, the 58 px soldier) by `shrink` with the mob's own rotation palette.
// Usage: node scripts/art/pixellab/mobs/build.mjs <spec.json>
//
// spec: {
//   "class": "mob_wolf", "raw": "<raw dir: zip/ from fetch.mjs, clips/ from fetchjobs.mjs>",
//   "shrink": 0.55, "scale": 0.55, "canvas": [80, 80], "pad": [6, 8] (where the 68 rotation sits in a job's canvas),
//   "clips": { "<anim>": { "fps", "strike"?, "hold"?,
//     "template": "<animation folder prefix in the character zip>" |
//     "job": { "<dir>": "<attempt>" } (clips/<anim>/<dir>/<attempt>/) |
//     "of": "<anim>", "frames": [indices of that clip] (e.g. a hit made from a death's first frames),
//     "keep"?: [frame indices to keep, in order] | { "<dir>": [...] } } },
//   "tint"?: { "hue", "chroma", "lift"? } (recolour the palette: a mob drawn from another's frames, see tint())
//   "shadow"?: true (cut the flat grey ground shadow PixelLab draws under some views)
//   "rotations"?: "<dir with <facing>.png>" (a base made by editing, not a fetched character: palette from these)
// }
// A clip job may be "mirror:<facing>": that facing's frames flipped left-right (civilians: two facings generated).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { alphaBox, blank, crop, paste } from '../../lib/ops.mjs';
import { paletteOf, shrink } from './shrink.mjs';
import { oklab } from '../remap.mjs';

const ROWS = ['south-east', 'north-east', 'south-west', 'north-west'];
const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [CW, CH] = spec.canvas;
const [PX, PY] = spec.pad;
const frames = (dir) => readdirSync(dir).filter((f) => /^frame_\d+\.png$/.test(f)).sort().map((f) => readImage(join(dir, f)));

function zipState() {
  const z = join(spec.raw, 'zip');
  const st = readdirSync(z).find((d) => existsSync(join(z, d, 'animations')));
  return join(z, st);
}

function templateFrames(prefix, dir) {
  const a = join(zipState(), 'animations');
  for (const name of readdirSync(a).filter((n) => n.startsWith(prefix)).sort()) {
    const d = join(a, name, dir);
    if (existsSync(d)) return frames(d);
  }
  throw new Error(`no template clip ${prefix} for ${dir}`);
}

function onCanvas(img, dx, dy) {
  const c = blank(CW, CH);
  paste(c, img, dx, dy);
  return inpaint(c);
}

// PixelLab paints blood and sparks whatever the prompt says: saturated pixels (OKLab chroma over 0.14) are cut; the
// holes this leaves inside the body (a red mouth, a splat on the flank) are refilled from their neighbours, while cut
// pixels open to the outside (spray) stay transparent
function inpaint(c) {
  const { w, h, data } = c;
  const cut = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const k = i * 4;
    if (!data[k + 3]) continue;
    const [, A, B] = oklab([data[k], data[k + 1], data[k + 2]]);
    if (Math.hypot(A, B) > 0.14) { data[k + 3] = 0; cut[i] = 1; }
  }
  if (spec.shadow) {
    // PixelLab's ground shadow under some views: a flat neutral grey (chroma under 0.012, L 0.3-0.6) ringed by a
    // thin outline; the grey goes, then the ring: pixels next to a cut one with at most two opaque 4-neighbours
    const gone = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const k = i * 4;
      if (!data[k + 3]) continue;
      const [L, A, B] = oklab([data[k], data[k + 1], data[k + 2]]);
      if (Math.hypot(A, B) < 0.012 && L > 0.3 && L < 0.6) { data[k + 3] = 0; gone[i] = 1; }
    }
    const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 0;
    for (let pass = 0; pass < 3; pass++) {
      const drop = [];
      for (let i = 0; i < w * h; i++) {
        if (!data[i * 4 + 3]) continue;
        const x = i % w, y = (i - x) / w;
        let near = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && gone[ny * w + nx]) near = true;
        }
        if (!near) continue;
        const n = op(x - 1, y) + op(x + 1, y) + op(x, y - 1) + op(x, y + 1);
        if (n <= 2) drop.push(i);
      }
      for (const i of drop) { data[i * 4 + 3] = 0; gone[i] = 1; }
    }
  }
  // transparent pixels reachable from the border are outside
  const out = new Uint8Array(w * h);
  const st = [];
  for (let x = 0; x < w; x++) st.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
  while (st.length) {
    const p = st.pop();
    if (out[p] || data[p * 4 + 3]) continue;
    out[p] = 1;
    const x = p % w, y = (p - x) / w;
    if (x > 0) st.push(p - 1);
    if (x < w - 1) st.push(p + 1);
    if (y > 0) st.push(p - w);
    if (y < h - 1) st.push(p + w);
  }
  let holes = [];
  for (let i = 0; i < w * h; i++) if (cut[i] && !out[i]) holes.push(i);
  while (holes.length) {
    const next = [];
    const fill = [];
    for (const p of holes) {
      const x = p % w, y = (p - x) / w;
      let r = 0, g = 0, b = 0, n = 0;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        const qx = q % w;
        if (q < 0 || q >= w * h || Math.abs(qx - x) > 1 || !data[q * 4 + 3]) continue;
        r += data[q * 4]; g += data[q * 4 + 1]; b += data[q * 4 + 2]; n++;
      }
      if (n) fill.push([p, r / n, g / n, b / n]); else next.push(p);
    }
    if (!fill.length) break;
    for (const [p, r, g, b] of fill) data.set([Math.round(r), Math.round(g), Math.round(b), 255], p * 4);
    holes = next;
  }
  return c;
}

function rawClip(name, c, dir) {
  if (c.job?.[dir]?.startsWith('mirror:')) return rawClip(name, c, c.job[dir].slice(7)).map(flip);
  if (c.template && !c.job?.[dir]) return templateFrames(c.template, dir).map((f) => onCanvas(f, PX, PY));
  if (c.job) return frames(join(spec.raw, 'clips', name, dir, c.job[dir])).map((f) => onCanvas(f, 0, 0));
  throw new Error(`clip ${name}: template or job`);
}

function flip(img) {
  const o = blank(img.w, img.h);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const i = (y * img.w + x) * 4, j = (y * img.w + img.w - 1 - x) * 4;
    o.data.set(img.data.subarray(i, i + 4), j);
  }
  return o;
}

// palette: the four game-facing rotations (the pro character's own colours)
const rot = (dir) => readImage(spec.rotations ? join(spec.rotations, `${dir}.png`) : join(spec.raw, 'zip', ...findRotation(dir)));
function findRotation(dir) {
  const z = join(spec.raw, 'zip');
  for (const st of readdirSync(z)) if (existsSync(join(z, st, 'rotations', `${dir}.png`))) return [st, 'rotations', `${dir}.png`];
  throw new Error(`no rotation ${dir}`);
}
const pal = paletteOf(ROWS.map(rot));
if (spec.tint) for (const p of pal) p.rgb = tint(p.lab, spec.tint);
const cache = new Map();
function dropSpecks(s) {
  const { w, h, data } = s;
  const seen = new Uint8Array(w * h);
  const comps = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || !data[i * 4 + 3]) continue;
    const comp = [i];
    seen[i] = 1;
    for (let k = 0; k < comp.length; k++) {
      const p = comp[k], x = p % w, y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, q = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[q] || !data[q * 4 + 3]) continue;
        seen[q] = 1;
        comp.push(q);
      }
    }
    comps.push(comp);
  }
  // keep the body: drop bits under 4 px and any bit under a tenth of the biggest (dust, spray)
  const big = Math.max(0, ...comps.map((c) => c.length));
  for (const comp of comps) if (comp.length < 4 || comp.length < big / 10) for (const p of comp) data[p * 4 + 3] = 0;
  return s;
}
const small = (img) => {
  return dropSpecks(shrink(img, spec.shrink, pal, cache));
};

// a mob drawn from another's frames (the jackal from the wolf): every palette colour keeps its lightness (plus `lift`)
// and takes the hue `hue` (degrees, OKLab) at chroma `chroma`; colours darker than L 0.22 (outline) stay as they are
function tint([L, A, B], { hue, chroma, lift = 0 }) {
  if (L < 0.22) return labToRgb([L, A, B]);
  const h = (hue * Math.PI) / 180;
  const k = Math.min(1, (L - 0.22) / 0.2);
  return labToRgb([L + lift * k, chroma * k * Math.cos(h), chroma * k * Math.sin(h)]);
}
function labToRgb([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return lin.map((v) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))));
}

// clips[anim][row] = shrunk frames
const clips = {};
for (const [name, c] of Object.entries(spec.clips)) {
  if (c.of) continue;
  clips[name] = {};
  for (const dir of ROWS) {
    let fs = rawClip(name, c, dir);
    const keep = Array.isArray(c.keep) ? c.keep : c.keep?.[dir];
    if (keep) fs = keep.map((i) => fs[i]);
    clips[name][dir] = fs.map(small);
  }
}
for (const [name, c] of Object.entries(spec.clips)) {
  if (!c.of) continue;
  clips[name] = Object.fromEntries(ROWS.map((dir) => [dir, c.frames.map((i) => clips[c.of][dir][i])]));
}

// one frame box for all: union of opaque boxes, 1 px margin
let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
for (const byDir of Object.values(clips)) for (const fs of Object.values(byDir)) for (const f of fs) {
  const b = alphaBox(f);
  if (!b.w) continue;
  x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
}
x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 += 1; y1 += 1;
const FW = x1 - x0;
const FH = y1 - y0;

const order = Object.keys(spec.clips);
const anims = {};
let col = 0;
for (const name of order) {
  const c = spec.clips[name];
  const n = clips[name][ROWS[0]].length;
  anims[name] = { col, frames: n, fps: c.fps };
  if (c.strike !== undefined) anims[name].strike = c.strike;
  if (c.hold !== undefined) anims[name].hold = c.hold;
  col += n;
}
// sheets wider than 4096 px wrap into bands (SHEET_FORMAT "wrap")
const WRAP = col * FW > 4096 ? Math.floor(4096 / FW) : 0;
const bands = WRAP ? Math.ceil(col / WRAP) : 1;
const sheet = blank((WRAP || col) * FW, bands * ROWS.length * FH);
for (const name of order) {
  ROWS.forEach((dir, r) => clips[name][dir].forEach((f, i) => {
    const c = anims[name].col + i;
    const band = WRAP ? Math.floor(c / WRAP) : 0;
    paste(sheet, crop(f, { x: x0, y: y0, w: FW, h: FH }), (WRAP ? c % WRAP : c) * FW, (band * ROWS.length + r) * FH);
  }));
}

// feet: bottom-centre of each row's first idle frame
const anchors = {};
ROWS.forEach((dir) => {
  const b = alphaBox(clips.idle[dir][0]);
  anchors[dir] = { x: Math.round(b.x + b.w / 2 - x0), y: b.y + b.h - y0 };
});

const out = join('src/assets/sheets', spec.class);
mkdirSync(out, { recursive: true });
writeImage(join(out, `${spec.class}.png`), sheet);
const manifest = {
  version: 2,
  class: spec.class,
  image: `${spec.class}.png`,
  frame: { w: FW, h: FH },
  anchor: anchors['south-west'],
  anchors,
  scale: spec.scale,
  rows: ROWS,
  ...(WRAP ? { wrap: WRAP } : {}),
  colorGroups: {},
  tiers: { basic: {} },
  anims,
  metal: [],
  variation: { skin: false, shade: false },
  rarity: { metal: false },
};
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');

// strips for gifs and the contact sheet: <raw>/strips/<anim>_<dir>.png
const strips = join(spec.raw, 'strips');
mkdirSync(strips, { recursive: true });
for (const name of order) for (const dir of ROWS) {
  const fs = clips[name][dir];
  const s = blank(fs.length * FW, FH);
  fs.forEach((f, i) => paste(s, crop(f, { x: x0, y: y0, w: FW, h: FH }), i * FW, 0));
  writeImage(join(strips, `${name}_${dir}.png`), s);
}
console.log(`${spec.class}: ${col} columns, frame ${FW}x${FH}, sheet ${sheet.w}x${sheet.h}, anchors ${JSON.stringify(anchors)}`);
