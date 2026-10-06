// End-to-end smoke test with real touch events (CDP) in a portrait phone viewport.
// Usage: node scripts/smoke.mjs [baseUrl]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
const cdp = await ctx.newCDPSession(page);
const wait = (ms) => page.waitForTimeout(ms);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
async function tap(x, y) {
  await touch('touchStart', [[x, y]]);
  await wait(60);
  await touch('touchEnd', []);
  await wait(250);
}
async function drag(x0, y0, x1, y1, steps = 10) {
  await touch('touchStart', [[x0, y0]]);
  for (let i = 1; i <= steps; i++) {
    await touch('touchMove', [[x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps]]);
    await wait(16);
  }
  await touch('touchEnd', []);
  await wait(250);
}
const ev = (fn, arg) => page.evaluate(fn, arg);
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
  if (!ok) failures++;
};

await page.goto(base);
await ev(() => localStorage.clear());
await page.goto(base);
await wait(2500);
check('menu active', await ev(() => window.__game.scene.isActive('Menu')));

// The menu's first button ("To battle") sits at 55% of the virtual height.
const m = await ev(() => {
  const s = window.__game.scene.getScene('Menu');
  return s.m;
});
await tap(195, Math.round(m.VH * 0.55 + 12) * m.S);
await wait(1200);
check('battle scene via tap', await ev(() => window.__game.scene.isActive('Battle')));

// Draw a formation line for the selected group on the ground (deploy zone).
const before = await ev(() => ({ ...window.__game.scene.getScene('Battle').sim.groups[0].formation }));
const pt = await ev(() => {
  const s = window.__game.scene.getScene('Battle');
  const cam = s.cameras.main;
  const toScreen = (x, y) => [(x * 24 - cam.worldView.x) * cam.zoom, (y * 12 - cam.worldView.y) * cam.zoom];
  return { a: toScreen(9.5, 26), b: toScreen(14.5, 26) };
});
await drag(pt.a[0], pt.a[1], pt.b[0], pt.b[1]);
const after = await ev(() => ({ ...window.__game.scene.getScene('Battle').sim.groups[0].formation }));
check('formation drag moved group', Math.abs(after.cx - 12) < 1 && Math.abs(after.cy - 26) < 1.2, JSON.stringify({ before: [before.cx, before.cy, before.frontage], after: [after.cx.toFixed(2), after.cy.toFixed(2), after.frontage] }));
check('formation faces enemy', after.fy < -0.9);

// Pinch to zoom in
const z0 = await ev(() => window.__game.scene.getScene('Battle').cameras.main.zoom);
await touch('touchStart', [[150, 300], [240, 300]]);
for (let i = 1; i <= 8; i++) {
  await touch('touchMove', [[150 - i * 12, 300], [240 + i * 12, 300]]);
  await wait(16);
}
await touch('touchEnd', []);
await wait(400);
const z1 = await ev(() => window.__game.scene.getScene('Battle').cameras.main.zoom);
check('pinch zoom', z1 > z0, `${z0} -> ${z1}`);

// Fight! button (deploy HUD: third button of the first order row)
const hud = await ev(() => window.__game.scene.getScene('Battle').m);
const by = hud.VH - (2 * 26 + 22 + 14);
const w3 = Math.floor((hud.VW - 12) / 3);
await tap((8 + 2 * w3 + w3 / 2) * hud.S, (by + 4 + 25 + 13) * hud.S);
check('battle started', (await ev(() => window.__game.scene.getScene('Battle').sim.phase)) === 'battle');

// Advance order button
const by2 = hud.VH - (3 * 26 + 18 + 6);
const bw = Math.floor((hud.VW - 8 - 10) / 6);
await tap((4 + (bw + 2) + bw / 2) * hud.S, (by2 + 4 + 25 + 13) * hud.S);
await wait(300);
check('advance order applied', (await ev(() => window.__game.scene.getScene('Battle').sim.groups[0].order)) === 'advance');

// Pause button
await tap(16 * hud.S, 12 * hud.S);
check('paused', await ev(() => window.__game.scene.getScene('Battle').paused));
await tap(16 * hud.S, 12 * hud.S);
check('unpaused', !(await ev(() => window.__game.scene.getScene('Battle').paused)));

// Tap a soldier of the selected group twice: selects that hero alone; Solo detaches him.
await ev(() => {
  const s = window.__game.scene.getScene('Battle');
  s.setPaused(true);
  const u = s.sim.units.find((u) => u.side === 0 && u.group === 0 && u.state === 'ready');
  s.cameras.main.setZoom(2);
  s.cameras.main.centerOn(u.x * 24, u.y * 12 - 40);
});
await wait(200);
const unitPt = await ev(() => {
  const s = window.__game.scene.getScene('Battle');
  const cam = s.cameras.main;
  const v = s.views.find((v) => v.u.side === 0 && v.u.group === 0 && v.u.state === 'ready');
  s.renderUnits(1);
  return { id: v.u.id, x: (v.spr.x - cam.worldView.x) * cam.zoom, y: (v.spr.y - 12 - cam.worldView.y) * cam.zoom };
});
await tap(unitPt.x, unitPt.y);
const afterFirst = await ev(() => window.__game.scene.getScene('Battle').selUnit);
if (afterFirst !== unitPt.id) await tap(unitPt.x, unitPt.y);
const selUnit = await ev(() => window.__game.scene.getScene('Battle').selUnit);
check('hero selected alone', selUnit === unitPt.id, `sel=${selUnit} want=${unitPt.id}`);
await tap((4 + 5 * (bw + 2) + bw / 2) * hud.S, (by2 + 4 + 25 + 28 + 13) * hud.S);
const indiv = await ev((id) => { const s = window.__game.scene.getScene('Battle'); return s.sim.groups[s.sim.units[id].group].individual; }, unitPt.id);
check('solo detaches hero', indiv === true);
await tap(16 * hud.S, 12 * hud.S);
await wait(3000);
check('sim advanced', (await ev(() => window.__game.scene.getScene('Battle').sim.tick)) > 20);
check('no console errors', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(failures ? 1 : 0);
