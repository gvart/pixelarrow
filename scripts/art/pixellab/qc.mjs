// QC of a promoted sheet (I3a, docs/v5/art/STYLE_LOCK.md › QC): reads src/assets/sheets/<class>/manifest.json and its
// image and checks, frame by frame:
//   palette      every colour is a PA-WORLD-DARK ramp colour (or its 1-step group nudge): no invented colour;
//                colour groups exclusive (no colour in two groups or in a group and a metal group); every listed
//                colour is used; tier ramps have the group's length
//   stature      helmet top to feet of the idle frames against the style lock (58 px) and against H4 / E3
//   feet         the lowest body pixel of every standing frame on the anchor row (± 2)
//   clipping     no opaque pixel on a frame's border (the art was cut by the frame)
//   spear        the spear (longest thin straight line): where both its ends stick out into free space, the wider
//                one (the head) must lead (on top when upright, towards the facing when levelled); both ends wide =
//                a double-ended spear suspect. A heuristic: it flags frames for the eye, it does not pass them
// and writes a contact sheet of every clip and a line-up of the class beside E3 and H4.
// Usage: node scripts/art/pixellab/qc.mjs <manifest.json> [--out dir] [--spec spec.json] [--ref-h4 rot.png] [--ref-e3 rot.png]
//   --spec  the sheetbuild spec: which clips hold the spear upright or levelled (default: by name)
// Exit code 1 when a hard check fails.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readImage, writeImage } from '../lib/png.mjs';
import { blank, crop, hexToRgb } from '../lib/ops.mjs';
import { buildSheet } from './sheet.mjs';
import { loadRamps } from './remap.mjs';
import { findSpear, LEVEL } from './groups.mjs';
import { STATURE_PX } from './rig.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const manPath = args.find((a) => a.endsWith('manifest.json'));
const out = opt('out', 'qc');
mkdirSync(out, { recursive: true });
const m = JSON.parse(readFileSync(manPath, 'utf8'));
const img = readImage(join(dirname(manPath), m.image));
const spec = opt('spec') ? JSON.parse(readFileSync(opt('spec'), 'utf8')) : null;
const LEVEL_ANIMS = new Set(['ready', 'charge', 'brace', 'block', 'thrust', 'stagger', 'fallBack', 'fallFwd']);
const spearOf = (a) => spec?.anims?.[a]?.spear ?? (LEVEL_ANIMS.has(a) ? 'level' : 'upright');
const STANDING = new Set(['idle', 'look', 'adjust', 'ready', 'block', 'brace', 'thrust', 'cheer', 'walk']);

const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const fails = [];
const warns = [];
const fail = (s) => fails.push(s);
const warn = (s) => warns.push(s);

// ---- frames
const FW = m.frame.w, FH = m.frame.h, wrap = m.wrap ?? 1e9, R = m.rows.length;
function frameAt(row, col) {
  const x = (col % wrap) * FW, y = (Math.floor(col / wrap) * R + row) * FH;
  return crop(img, { x, y, w: FW, h: FH });
}

// ---- palette
const groupOf = new Map();
for (const [g, cols] of Object.entries(m.colorGroups ?? {})) for (const c of cols) {
  if (groupOf.has(c)) fail(`colour ${c} in groups ${groupOf.get(c)} and ${g}`);
  groupOf.set(c, g);
}
for (const [i, g] of (m.metal ?? []).entries()) for (const c of g.colors) {
  if (groupOf.has(c)) fail(`metal colour ${c} also in group ${groupOf.get(c)}`);
  groupOf.set(c, `metal${i}`);
}
for (const [t, groups] of Object.entries(m.tiers ?? {})) for (const [g, ramp] of Object.entries(groups)) {
  if (!m.colorGroups?.[g]) fail(`tier ${t} recolours missing group ${g}`);
  else if (ramp.length !== m.colorGroups[g].length) fail(`tier ${t} ${g}: ${ramp.length} colours, group has ${m.colorGroups[g].length}`);
}
const ramps = loadRamps().flatMap((r) => r.cols.map((c) => c.rgb));
const legal = (rgb) => ramps.some((c) => Math.abs(c[0] - rgb[0]) <= 3 && Math.abs(c[1] - rgb[1]) <= 3 && Math.abs(c[2] - rgb[2]) <= 3);
const used = new Map();
for (let i = 0; i < img.data.length; i += 4) {
  if (!img.data[i + 3]) continue;
  if (img.data[i + 3] !== 255) { fail('semi-transparent pixels in the image'); break; }
  const h = hex(img.data[i], img.data[i + 1], img.data[i + 2]);
  used.set(h, (used.get(h) ?? 0) + 1);
}
const illegal = [...used.keys()].filter((h) => !legal(hexToRgb(h)));
if (illegal.length) fail(`colours outside PA-WORLD-DARK: ${illegal.join(' ')}`);
for (const c of groupOf.keys()) if (!used.has(c)) warn(`group colour ${c} (${groupOf.get(c)}) unused`);
const ungrouped = [...used].filter(([h]) => !groupOf.has(h));

// ---- per frame
const rowsReport = [];
const contactRows = [];
const report = { anims: {} };
let stature = {};
for (const [anim, a] of Object.entries(m.anims)) {
  report.anims[anim] = {};
  m.rows.forEach((dir, row) => {
    const an = m.anchors?.[dir] ?? m.anchor;
    const frames = [];
    const issues = [];
    for (let i = 0; i < a.frames; i++) {
      const f = frameAt(row, a.col + i);
      frames.push(f);
      let any = false, edge = false, low = -1;
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (f.data[(y * FW + x) * 4 + 3]) {
        any = true;
        if (x === 0 || y === 0 || x === FW - 1 || y === FH - 1) edge = true;
        const g = groupOf.get(hex(f.data[(y * FW + x) * 4], f.data[(y * FW + x) * 4 + 1], f.data[(y * FW + x) * 4 + 2]));
        if (g !== 'wood' && g !== 'metal1') low = Math.max(low, y);
      }
      if (!any) issues.push(`f${i} empty`);
      if (edge) issues.push(`f${i} clipped by the frame`);
      if (STANDING.has(anim) && low >= 0 && Math.abs(low - an.y) > 2) issues.push(`f${i} feet ${low} vs anchor ${an.y}`);
      // spear
      const lvl = spearOf(anim) === 'level';
      const headDir = lvl ? LEVEL[dir] : [0, -1];
      const sp = findSpear(f, { candidate: () => true, headDir });
      if (!sp) issues.push(`f${i} no spear found`);
      else {
        // judge an end only when it sticks out into free space (3 px beyond it clear); an end inside the body or
        // the legs measures the body, not the spear
        const L = Math.hypot(sp.head[0] - sp.butt[0], sp.head[1] - sp.butt[1]) || 1;
        const u = [(sp.head[0] - sp.butt[0]) / L, (sp.head[1] - sp.butt[1]) / L];
        const clear = (E, s) => {
          for (let k = 2; k <= 4; k++) {
            const X = Math.round(E[0] + s * u[0] * k), Y = Math.round(E[1] + s * u[1] * k);
            if (X >= 0 && Y >= 0 && X < FW && Y < FH && f.data[(Y * FW + X) * 4 + 3]) return false;
          }
          return true;
        };
        const headFree = clear(sp.head, 1), buttFree = clear(sp.butt, -1);
        if (headFree && buttFree && sp.buttW >= sp.headW + 1.5 && sp.headW <= 3) issues.push(`f${i} spear: the leading end is the thin one (head ${sp.headW.toFixed(1)} vs butt ${sp.buttW.toFixed(1)}): reversed?`);
        if (headFree && buttFree && sp.buttW >= 4.5 && sp.headW >= 4.5) issues.push(`f${i} spear: both free ends wide: double-ended?`);
      }
    }
    // stature on idle frame 0
    if (anim === 'idle') {
      const f = frames[0];
      let top = -1;
      for (let y = 0; y < FH && top < 0; y++) for (let x = 0; x < FW; x++) {
        const k = (y * FW + x) * 4;
        if (!f.data[k + 3]) continue;
        const g = groupOf.get(hex(f.data[k], f.data[k + 1], f.data[k + 2]));
        // the helmet's top: the first metal / trim pixel (the crest and the spear are not counted)
        if (g === 'metal0' || g === 'trim') { top = y; break; }
      }
      stature[dir] = an.y - top;
      if (Math.abs(stature[dir] - STATURE_PX) > 3) fail(`${dir}: helmet top to feet ${stature[dir]} px, style lock ${STATURE_PX}`);
    }
    report.anims[anim][dir] = issues;
    for (const s of issues) (s.includes('clipped') || s.includes('empty') ? fail : warn)(`${anim} ${dir} ${s}`);
    contactRows.push({ label: `${anim} ${dir}`, imgs: frames });
  });
}
writeImage(join(out, `${m.class}_contact.png`), buildSheet(contactRows, { scale: 2 }));

// ---- line-up beside the references
const refs = [];
const lineRow = (label, f) => refs.push({ label, imgs: f });
const h4 = opt('ref-h4'), e3 = opt('ref-e3');
const idle0 = m.rows.map((d, row) => frameAt(row, m.anims.idle.col));
lineRow(`${m.class} idle f0: ${m.rows.join(' ')}`, idle0);
if (h4 && existsSync(h4)) lineRow('H4 rotation (style anchor)', [readImage(h4)]);
if (e3 && existsSync(e3)) lineRow('E3 rotation (I1b look)', [readImage(e3)]);
writeImage(join(out, `${m.class}_lineup.png`), buildSheet(refs, { scale: 4 }));

const summary = {
  class: m.class, frame: m.frame, image: { w: img.w, h: img.h, mb: +((img.w * img.h * 4) / 1048576).toFixed(1) },
  colours: used.size, ungrouped: Object.fromEntries(ungrouped), stature, fails, warns: warns.length, warnList: warns,
};
writeFileSync(join(out, `${m.class}_qc.json`), JSON.stringify({ ...summary, report }, null, 1));
console.log(`${m.class}: ${used.size} colours (${ungrouped.length} ungrouped), image ${img.w}x${img.h} (${summary.image.mb} MB decoded), stature ${JSON.stringify(stature)}`);
console.log(`${fails.length} failures, ${warns.length} warnings`);
for (const f of fails) console.log(`FAIL ${f}`);
for (const w of warns.slice(0, 60)) console.log(`warn ${w}`);
if (warns.length > 60) console.log(`... ${warns.length - 60} more warnings in ${m.class}_qc.json`);
process.exit(fails.length ? 1 : 0);
