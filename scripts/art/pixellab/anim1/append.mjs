// ANIM-1: add new clips to a shipped sheet without rebuilding it. The old clip jobs' downloads have expired (404), so
// sheetbuild.mjs cannot re-run a whole class; this builds only the new clips with sheetbuild.mjs (same ramps, parts and
// feet as the class's spec) and appends them to src/assets/sheets/<class>/.
// Usage: node scripts/art/pixellab/anim1/append.mjs <spec.json>
//   spec: a sheetbuild spec of only the new anims (raw = docs/v5/pixellab/ANIM1/raw/<class>) plus "base": the shipped
//   manifest. Existing frames are copied unchanged (re-centred if the frame grows); every new colour is mapped onto the
//   shipped sheet's own colours: a colour-group or metal colour to the nearest (OKLab) colour of the same group, any
//   other colour (outline, shadow) to the nearest ungrouped colour, so colorGroups, metal and tiers stay valid as they are.
//   An anim already in the base is replaced (its columns re-used when the frame count matches, else appended).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank, hexToRgb, rgbToHex } from '../../lib/ops.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_W = 4096;
const specPath = process.argv[2];
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const tmp = mkdtempSync(join(tmpdir(), 'anim1-'));
execFileSync('node', [join(HERE, '..', 'sheetbuild.mjs'), specPath, '--out', tmp], { stdio: 'inherit' });

const baseMan = JSON.parse(readFileSync(spec.base, 'utf8'));
const baseImg = readImage(join(dirname(spec.base), baseMan.image));
const newMan = JSON.parse(readFileSync(join(tmp, 'manifest.json'), 'utf8'));
const newImg = readImage(join(tmp, newMan.image));
const ROWS = baseMan.rows;

// ---- colours
const oklab = ([r, g, b]) => {
  const f = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [f(r), f(g), f(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const groupsOf = (man) => {
  const g = new Map(); // hex -> group key
  for (const [k, cs] of Object.entries(man.colorGroups ?? {})) for (const c of cs) g.set(c, k);
  (man.metal ?? []).forEach((m) => { for (const c of m.colors) g.set(c, `metal:${m.slots.join(',')}`); });
  return g;
};
const baseGroup = groupsOf(baseMan), newGroup = groupsOf(newMan);
const pool = new Map(); // group key ('' = ungrouped) -> [{hex, lab}]
const add = (key, hex) => {
  if (!pool.has(key)) pool.set(key, []);
  if (!pool.get(key).some((e) => e.hex === hex)) pool.get(key).push({ hex, lab: oklab(hexToRgb(hex)) });
};
for (const [hex, key] of baseGroup) add(key, hex);
for (let i = 0; i < baseImg.data.length; i += 4) if (baseImg.data[i + 3]) {
  const hex = rgbToHex([baseImg.data[i], baseImg.data[i + 1], baseImg.data[i + 2]]);
  if (!baseGroup.has(hex)) add('', hex);
}
const memo = new Map(), log = new Map();
const mapColour = (hex) => {
  if (memo.has(hex)) return memo.get(hex);
  let key = newGroup.get(hex) ?? '';
  if (!pool.has(key)) key = '';
  const lab = oklab(hexToRgb(hex));
  let best = null, bd = Infinity;
  for (const e of pool.get(key)) {
    const d = (e.lab[0] - lab[0]) ** 2 + (e.lab[1] - lab[1]) ** 2 + (e.lab[2] - lab[2]) ** 2;
    if (d < bd) { bd = d; best = e.hex; }
  }
  memo.set(hex, best);
  if (best !== hex) log.set(`${hex}->${best} (${key || 'ungrouped'})`, Math.sqrt(bd).toFixed(3));
  return best;
};

// ---- layout: one anchor per row for old and new frames
const bA = baseMan.anchors, nA = newMan.anchors;
const AY = Math.max(bA[ROWS[0]].y, nA[ROWS[0]].y);
const down = Math.max(baseMan.frame.h - bA[ROWS[0]].y, newMan.frame.h - nA[ROWS[0]].y);
const anchors = {}, right = {};
for (const r of ROWS) {
  anchors[r] = { x: Math.max(bA[r].x, nA[r].x), y: AY };
  right[r] = Math.max(baseMan.frame.w - bA[r].x, newMan.frame.w - nA[r].x);
}
const FW = Math.max(...ROWS.map((r) => anchors[r].x + right[r])), FH = AY + down;

const anims = { ...baseMan.anims };
let cols = Math.max(...Object.values(baseMan.anims).map((a) => a.col + a.frames));
const place = []; // [anim, colInNew, colInOut]
for (const [name, a] of Object.entries(newMan.anims)) {
  const old = anims[name];
  const col = old && old.frames === a.frames ? old.col : cols;
  if (col === cols) cols += a.frames;
  anims[name] = { ...a, col };
  for (let i = 0; i < a.frames; i++) place.push([a.col + i, col + i]);
}
const wrap = Math.floor(MAX_W / FW), bands = Math.ceil(cols / wrap);
const out = blank(Math.min(cols, wrap) * FW, bands * ROWS.length * FH);
const copy = (src, man, srcCol, dstCol, row, recolour) => {
  const sw = man.wrap ?? 1e9, a = man.anchors[ROWS[row]], A = anchors[ROWS[row]];
  const sx0 = (srcCol % sw) * man.frame.w, sy0 = (Math.floor(srcCol / sw) * ROWS.length + row) * man.frame.h;
  const dx0 = (dstCol % wrap) * FW + A.x - a.x, dy0 = (Math.floor(dstCol / wrap) * ROWS.length + row) * FH + A.y - a.y;
  for (let y = 0; y < man.frame.h; y++) for (let x = 0; x < man.frame.w; x++) {
    const i = ((sy0 + y) * src.w + sx0 + x) * 4;
    if (!src.data[i + 3]) continue;
    let rgb = [src.data[i], src.data[i + 1], src.data[i + 2]];
    if (recolour) rgb = hexToRgb(mapColour(rgbToHex(rgb)));
    out.data.set([...rgb, 255], ((dy0 + y) * out.w + dx0 + x) * 4);
  }
};
const replaced = new Set(place.map(([, c]) => c));
for (const a of Object.values(baseMan.anims)) for (let i = 0; i < a.frames; i++) {
  if (replaced.has(a.col + i)) continue;
  for (let r = 0; r < ROWS.length; r++) copy(baseImg, baseMan, a.col + i, a.col + i, r, false);
}
for (const [s, d] of place) for (let r = 0; r < ROWS.length; r++) copy(newImg, newMan, s, d, r, true);

const man = { ...baseMan, frame: { w: FW, h: FH }, anchor: anchors['south-west'], anchors, wrap, anims };
if (baseMan.portrait) {
  const sw = anchors['south-west'], bw = bA['south-west'];
  man.portrait = { ...baseMan.portrait, x: baseMan.portrait.x + sw.x - bw.x, y: baseMan.portrait.y + sw.y - bw.y };
}
writeImage(join(dirname(spec.base), baseMan.image), out);
writeFileSync(spec.base, JSON.stringify(man, null, 1) + '\n');
console.log(`${baseMan.class}: +${Object.keys(newMan.anims).join(', ')}; ${cols} columns of ${FW}x${FH} (was ${baseMan.frame.w}x${baseMan.frame.h}), wrap ${wrap} -> ${out.w}x${out.h}`);
const worst = [...log].sort((a, b) => b[1] - a[1]).slice(0, 8);
if (worst.length) console.log(`  ${log.size} colours remapped; furthest: ${worst.map(([k, v]) => `${k} ${v}`).join('; ')}`);
