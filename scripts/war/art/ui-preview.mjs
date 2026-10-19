// UI kit previews (W-25): UI_contact.png (every frame, state, icon and cursor at 2x) and UI_hud_mock.png (1440x900: the kit
// laid over a sandbox screenshot as a HUD). Pages are HTML with CSS border-image 9-slices read from ui.json, so the
// recorded margins are what is drawn. Fonts: Cinzel / Cormorant SC / Inter from @fontsource (UI_KIT).
// Usage: node scripts/war/art/ui-preview.mjs [sandbox-bg.png]   (bg default: shots/war/ui/sandbox-bg.png, a 1440x900
//   sandbox shot of ?scenario=build-test with the DOM panels hidden) -> shots/war/ui/
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch, ROOT } from '../../lib/harness.mjs';

const UI = join(ROOT, 'public/war/ui');
const OUT = join(ROOT, 'shots/war/ui');
mkdirSync(OUT, { recursive: true });
const bg = resolve(process.argv[2] ?? join(OUT, 'sandbox-bg.png'));
const m = JSON.parse(readFileSync(join(UI, 'ui.json'), 'utf8'));
const NM = [join(ROOT, 'node_modules'), join(ROOT, '../../../node_modules')].find((p) => existsSync(join(p, '@fontsource')));
const u = (rel) => pathToFileURL(join(UI, rel)).href;
const u2 = (rel) => u(rel.replace('.png', '@2x.png'));
const font = (fam, file, w) => `@font-face{font-family:'${fam}';font-weight:${w};src:url(${pathToFileURL(join(NM, '@fontsource', file)).href})}`;
const S = 2; // UI scale: 1 art px = 2 CSS px
const CSS = `${font('Cinzel', 'cinzel/files/cinzel-latin-700-normal.woff2', 700)}${font('Cormorant SC', 'cormorant-sc/files/cormorant-sc-latin-700-normal.woff2', 700)}${font('Inter', 'inter/files/inter-latin-600-normal.woff2', 600)}
*{box-sizing:border-box;margin:0}body{background:#121014;color:#e8dcc4;font-family:Inter;image-rendering:pixelated}
img{image-rendering:pixelated;display:block}.abs{position:absolute}
.n{font-family:Inter;font-weight:600;font-variant-numeric:tabular-nums;text-shadow:0 2px 0 #0b0908}
.h{font-family:'Cormorant SC';font-weight:700;color:#e6c27a;text-shadow:0 2px 0 #0b0908}
.t{font-family:Cinzel;font-weight:700;color:#f0e2c2;text-shadow:0 2px 0 #0b0908;letter-spacing:.04em}`;

/** A 9-slice box from a frame or button entry (border-image with the @2x art, so 1 art px = 2 CSS px). */
function nine(e, file, x, y, w, h, extra = '') {
  const s = e.slice ?? { l: 0, t: 0, r: 0, b: 0 };
  const rep = e.edges === 'tile' ? 'round' : 'stretch';
  return `<div class="abs" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-style:solid;border-width:${s.t * S}px ${s.r * S}px ${s.b * S}px ${s.l * S}px;border-image:url(${u2(file)}) ${s.t * S} ${s.r * S} ${s.b * S} ${s.l * S} fill / ${s.t * S}px ${s.r * S}px ${s.b * S}px ${s.l * S}px ${rep};${extra}"></div>`;
}
const img = (file, x, y, extra = '') => { const e = readFileSync(join(UI, file)); const w = e.readUInt32BE(16), h = e.readUInt32BE(20); return `<img class="abs" src="${u2(file)}" style="left:${x}px;top:${y}px;width:${w * S}px;height:${h * S}px;${extra}">`; };
const icon = (id, x, y, size = 32) => img(m.icons[id][size], x, y);
const iconBtn = (id, x, y, state = 'normal', size = 32) => { const b = m.buttons['button-icon']; return img(b.states[state], x, y) + icon(id, x + ((b.w - size) / 2) * S, y + ((b.h - size) / 2) * S + (state === 'pressed' ? S : 0), size); };
const bar = (x, y, w, v, kind) => { const t = m.bars.track; const f = t.fill; return nine(t, t.file, x, y, w, t.h * S) + `<img class="abs" src="${u2(m.bars['fill-' + kind].file)}" style="left:${x + f.x * S}px;top:${y + f.y * S}px;width:${Math.round((w - 2 * f.x * S) * v)}px;height:${f.h * S}px">`; };
const page = (w, h, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body style="width:${w}px;height:${h}px;position:relative;overflow:hidden">${body}</body></html>`;

// ---------- contact sheet ----------
let c = '', y = 16;
const label = (t, x, yy) => `<div class="abs h" style="left:${x}px;top:${yy}px;font-size:22px">${t}</div>`;
c += label('Frames (9-slice, drawn at 2x and stretched)', 16, y); y += 36;
c += nine(m.frames.panel, m.frames.panel.file, 16, y, 560, 330) + nine(m.frames['panel-small'], m.frames['panel-small'].file, 592, y, 300, 200) + nine(m.frames.tooltip, m.frames.tooltip.file, 908, y, 260, 120) + nine(m.frames.label, m.frames.label.file, 908, y + 140, 260, 62) + img(m.frames.minimap.file, 1184, y) + img(m.frames['minimap-round'].file, 1184, y + 290 - 10, 'display:none');
c += nine(m.frames.bar, m.frames.bar.file, 592, y + 216, 560, 100) + nine(m.frames.plaque, m.frames.plaque.file, 16, y + 346, 560, 82) + nine(m.frames.divider, m.frames.divider.file, 592, y + 340, 560, 30) + img(m.frames['divider-ornament'].file, 592 + 280 - m.frames['divider-ornament'].w, y + 340 + 15 - m.frames['divider-ornament'].h);
y += 450;
c += label('Buttons: normal, hover, pressed, disabled', 16, y); y += 36;
let x = 16;
for (const s of ['normal', 'hover', 'pressed', 'disabled']) { c += nine(m.buttons.button, m.buttons.button.states[s], x, y, 220, 82) + `<div class="abs t" style="left:${x}px;top:${y + 24 + (s === 'pressed' ? 2 : 0)}px;width:220px;text-align:center;font-size:22px;${s === 'disabled' ? 'color:#8a8580' : ''}">Assign 8</div>`; x += 236; }
for (const s of ['normal', 'hover', 'pressed', 'disabled']) { c += iconBtn('act-build', x, y, s); x += 96; }
y += 98; x = 16;
for (const s of ['normal', 'hover', 'pressed', 'disabled']) { c += nine(m.buttons['button-small'], m.buttons['button-small'].states[s], x, y, 140, 56) + `<div class="abs n" style="left:${x}px;top:${y + 15}px;width:140px;text-align:center;font-size:18px">Stop</div>`; x += 156; }
for (const s of ['active', 'inactive', 'hover']) { c += nine(m.buttons.tab, m.buttons.tab.states[s], x, y - 4, 190, 66) + `<div class="abs h" style="left:${x}px;top:${y + 14}px;width:190px;text-align:center;font-size:20px">Walls</div>`; x += 200; }
for (const s of ['on', 'off', 'disabled']) { c += img(m.buttons.toggle.states[s], x, y - 4); x += 160; }
y += 90; x = 16;
for (const [k, v] of [['hp', 0.7], ['construction', 0.45], ['burn', 0.3], ['ok', 0.9], ['water', 0.6]]) { c += bar(x, y, 250, v, k); x += 270; }
y += 60;
c += nine(m.bars['slider-track'], m.bars['slider-track'].file, 16, y, 400, 50) + img(m.bars['slider-knob'].file, 16 + 220, y);
y += 76;
for (const g of ['resource', 'unit', 'building', 'action']) {
  c += label(`Icons: ${g} (32 and 24)`, 16, y); y += 36; x = 16;
  for (const [id, e] of Object.entries(m.icons).filter(([, e]) => e.group === g)) {
    if (x > 1360) { x = 16; y += 120; }
    c += img(e[32], x, y) + img(e[24], x + 8, y + 70) + `<div class="abs" style="left:${x - 6}px;top:${y + 122}px;width:76px;text-align:center;font-size:10px;color:#a89c88">${id.replace(/^[a-z]+-/, '')}</div>`;
    x += 84;
  }
  y += 150;
}
c += label('Cursors (hotspot = red dot)', 16, y); y += 36; x = 16;
for (const [id, e] of Object.entries(m.cursors)) { c += img(e.file, x, y) + `<div class="abs" style="left:${x + e.hotspot[0] * S - 2}px;top:${y + e.hotspot[1] * S - 2}px;width:4px;height:4px;background:#ff3030"></div><div class="abs" style="left:${x - 6}px;top:${y + 70}px;width:76px;text-align:center;font-size:11px;color:#a89c88">${id}</div>`; x += 96; }
y += 100;
const CH = y;
writeFileSync(join(OUT, 'contact.html'), page(1440, CH, c));

// ---------- HUD mock-up ----------
const W = 1440, H = 900;
let h = `<img class="abs" src="${pathToFileURL(bg).href}" style="left:0;top:0;width:${W}px;height:${H}px">`;
// top resource bar
const RES = [['food', 412], ['wood', 238], ['stone', 120], ['marble', 0], ['copper', 36], ['tin', 12], ['iron', 18], ['bronze', 24], ['silver', 9], ['salt', 30], ['olives', 64]];
h += nine(m.frames.bar, m.frames.bar.file, 0, 0, W, 72);
x = 28;
for (const [r, v] of RES) { h += icon('res-' + r, x, 12, 24) + `<div class="abs n" style="left:${x + 54}px;top:22px;font-size:20px;${v ? '' : 'color:#8a7f70'}">${v}</div>`; x += 54 + String(v).length * 13 + 26; }
h += `<div class="abs n" style="right:28px;top:24px;font-size:16px;color:#a89c88">60 fps</div>`;
// minimap bottom-left
const mm = m.frames.minimap;
h += `<div class="abs" style="left:${16 + mm.window.x * S}px;top:${H - 16 - mm.h * S + mm.window.y * S}px;width:${mm.window.w * S}px;height:${mm.window.h * S}px;background:url(${pathToFileURL(bg).href}) -40px -40px / ${mm.window.w * S + 120}px auto;filter:saturate(.8) brightness(.9)"></div>`;
h += `<div class="abs" style="left:${16 + mm.window.x * S + 76}px;top:${H - 16 - mm.h * S + mm.window.y * S + 52}px;width:50px;height:34px;border:2px solid #e6c27a"></div>`;
h += img(mm.file, 16, H - 16 - mm.h * S);
// command card bottom-centre
const cx = 330, cw = 560, ch = 200, cy = H - ch - 8;
h += nine(m.frames['panel-small'], m.frames['panel-small'].file, cx, cy, cw, ch);
h += iconBtn('unit-hoplite', cx + 24, cy + 26);
h += `<div class="abs h" style="left:${cx + 120}px;top:${cy + 22}px;font-size:26px">Hoplites</div><div class="abs n" style="left:${cx + 260}px;top:${cy + 30}px;font-size:16px;color:#c8bca4">22 / 24 · line</div>`;
h += bar(cx + 120, cy + 58, 410, 0.82, 'hp');
x = cx + 24;
for (const [id, st] of [['act-move', 'normal'], ['act-attack', 'normal'], ['act-hold', 'pressed'], ['act-line', 'pressed'], ['act-column', 'normal'], ['act-wedge', 'normal']]) { h += iconBtn(id, x, cy + 110, st, 24); x += 86; }
// build toolbar bottom-right, with tabs and a tooltip
const bx = 908, bw = 516, bh = 200, by = H - bh - 8;
for (const [i, t] of ['Camp', 'Walls', 'Siege'].entries()) h += nine(m.buttons.tab, m.buttons.tab.states[i === 1 ? 'active' : 'inactive'], bx + 20 + i * 150, by - 50, 146, 60) + `<div class="abs h" style="left:${bx + 20 + i * 150}px;top:${by - 34}px;width:146px;text-align:center;font-size:20px;${i === 1 ? '' : 'color:#a8936a'}">${t}</div>`;
h += nine(m.frames.bar, m.frames.bar.file, bx, by, bw, bh);
x = bx + 22;
const BLD = ['bld-palisade', 'bld-rampart', 'bld-stone-wall', 'bld-gate', 'bld-tower-wood', 'bld-tower-stone', 'bld-stairs-wood', 'bld-stairs-stone', 'bld-ladder', 'bld-bridge-wood'];
BLD.forEach((id, i) => { h += iconBtn(id, bx + 22 + (i % 5) * 96, by + 18 + Math.floor(i / 5) * 86, id === 'bld-stone-wall' ? 'hover' : id === 'bld-bridge-wood' ? 'disabled' : 'normal'); });
// tooltip over the stone wall button
const tx = bx + 22 + 2 * 96 - 70, ty = by - 210;
h += nine(m.frames.tooltip, m.frames.tooltip.file, tx, ty, 290, 150);
h += `<div class="abs" style="left:${tx + 22}px;top:${ty + 16}px;font-family:'Cormorant SC';font-weight:700;font-size:24px;color:#3a2414">Stone wall</div><div class="abs" style="left:${tx + 22}px;top:${ty + 50}px;width:250px;font-size:14px;line-height:19px;color:#4a3622">Tall wall with a walkway. Fireproof.</div>`;
h += icon('res-stone', tx + 20, ty + 100, 24) + `<div class="abs" style="left:${tx + 72}px;top:${ty + 110}px;font-size:16px;font-weight:600;color:#3a2414">40</div>` + icon('res-wood', tx + 120, ty + 100, 24) + `<div class="abs" style="left:${tx + 172}px;top:${ty + 110}px;font-size:16px;font-weight:600;color:#3a2414">10 · 3 min</div>`;
// site: construction bar over the camp site, and a hover label with the context action over the enemy
h += bar(730, 300, 120, 0.4, 'construction');
h += nine(m.frames.label, m.frames.label.file, 860, 228, 280, 62) + icon('act-attack', 884, 243, 24) + `<div class="abs n" style="left:${940}px;top:${246}px;font-size:18px">Attack · Archers</div>`;
h += img(m.cursors.attack.file, 924 - 6, 290 - 6);
writeFileSync(join(OUT, 'hud.html'), page(W, H, h));

const browser = await launch();
const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const [name, file, hh] of [['UI_contact', 'contact.html', CH], ['UI_hud_mock', 'hud.html', H]]) {
  await p.setViewportSize({ width: 1440, height: hh });
  await p.goto(pathToFileURL(join(OUT, file)).href);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  await p.screenshot({ path: join(OUT, name + '.png') });
  console.log('saved', join(OUT, name + '.png'));
}
await browser.close();
