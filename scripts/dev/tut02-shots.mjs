// TUT-02 screenshots: the tutorial's new steps (undo, the plan, focus, Play, Then…, the morale glyph, the flank),
// en and ru at 390x844 and in Telegram full screen at 320x568, one contact sheet per language and size.
// The run plays the tutorial through the scene's own methods (the touch run is scripts/tutorial-smoke.mjs).
// Usage: node scripts/dev/tut02-shots.mjs [baseUrl] [outDir] [steps,comma,separated]   (needs a running server)
import { launch, captureErrors, apiDown, makePageApi } from '../lib/harness.mjs';
import { fakeTelegram } from '../lib/fakeTelegram.mjs';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'shots/tut02';
// 'flank-knob': the flank step once IV is picked (the ghost hand swings its knob)
const STEPS = (process.argv[4] ?? 'undo,loose,focus,play,then,morale,flank,flank-knob').split(',');
const CONFIGS = [
  ['en', 390, 844, false],
  ['ru', 390, 844, false],
  ['en', 320, 568, true],
  ['ru', 320, 568, true],
];
mkdirSync(out, { recursive: true });
const raw = join(out, 'raw');
mkdirSync(raw, { recursive: true });
const browser = await launch();
const problems = [];

/** Do what the step asks, through the scene (no touches): the next step comes. */
const ACT = `
  const t = s.tutorial, G = { hop: 0, sling: 1, pelt: 3 };
  const id = t.step;
  const f = (g) => s.sim.groups[g].formation;
  if (id === 'intro' || id === 'morale' || id === 'victory') { t.narrator.finishTyping(); t.tapInfo(); }
  else if (id === 'select') s.tutorialHost().select(G.hop);
  else if (id === 'pan') s.events.emit('tutorial', { kind: 'pan', px: 60 });
  else if (id === 'zoom') s.events.emit('tutorial', { kind: 'zoom' });
  else if (id === 'sling') { const p = t.flag; s.command({ kind: 'form', group: -1, cx: p.x, cy: p.y, fx: f(G.hop).fx, fy: f(G.hop).fy, frontage: f(G.hop).frontage }); s.events.emit('tutorial', { kind: 'sling', carried: true, aimed: false, fx: 0, fy: -1, group: G.hop }); }
  else if (id === 'undo') s.undo();
  else if (id === 'fight') s.startFight();
  else if (id === 'loose') { s.tutorialHost().select(G.sling); s.toggleThrow(); }
  else if (id === 'focus') s.setFocus(5);
  else if (id === 'play') s.togglePause();
  else if (id === 'move') { const p = t.flag; s.command({ kind: 'form', group: -1, cx: p.x, cy: p.y, fx: 0, fy: -1, frontage: f(G.hop).frontage }); s.events.emit('tutorial', { kind: 'tapmove' }); }
  else if (id === 'then') { s.toggleThen(); s.queueThen('charge'); }
  else if (id === 'ability') { s.tutorialHost().select(G.hop); s.useAbility('bash'); }
  else if (id === 'flank') { s.tutorialHost().select(G.pelt); const a = s.sim.groups[7]; const d = (() => { const c = (g) => { const m = s.sim.activeMembers(g); return { x: m.reduce((q, u) => q + u.x, 0) / m.length, y: m.reduce((q, u) => q + u.y, 0) / m.length }; }; const p = c(G.pelt), w = c(a.id); const l = Math.hypot(w.x - p.x, w.y - p.y); return { x: (w.x - p.x) / l, y: (w.y - p.y) / l }; })(); s.command({ kind: 'face', group: -1, fx: d.x, fy: d.y }); s.events.emit('tutorial', { kind: 'sling', carried: false, aimed: true, fx: d.x, fy: d.y, group: G.pelt }); }
  return id;
`;

async function session(lang, W, H, tg) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => (window.__noFirstRun = true));
  if (tg) await ctx.addInitScript(fakeTelegram, { insets: { safeTop: 59, contentTop: 46, safeBottom: 34 }, fullscreen: 'launch', languageCode: lang });
  const page = await ctx.newPage();
  captureErrors(page, { into: problems, ignoreNetwork: true, prefix: true });
  await apiDown(page);
  await page.route('**/telegram.org/**', (r) => r.abort());
  const api = makePageApi(page);
  await page.goto(`${base}?lang=${lang}${tg ? '#tgWebAppVersion=8.0&tgWebAppPlatform=ios' : ''}`);
  await api.untilPage(() => !!window.__game && window.__game.scene.isActive('Menu'), 20000);
  await page.evaluate(() => {
    window.__state.campaign.data.settings.tutorial = { status: 'offer', done: [] };
    window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', { tutorial: {} }));
  });
  await api.untilPage(() => !!window.__game.scene.getScene('Battle')?.tutorial?.talking, 10000);
  return { ctx, page, api };
}

const files = {};
for (const [lang, W, H, tg] of CONFIGS) {
  const key = `${W}${tg ? 'tg' : ''}-${lang}`;
  const { ctx, page, api } = await session(lang, W, H, tg);
  const want = new Set(STEPS);
  files[key] = [];
  for (let guard = 0; guard < 40 && want.size; guard++) {
    // wait for the next step to talk (the battle runs between them)
    await page.evaluate(() => { window.__game.scene.getScene('Battle').speed = 3; });
    const ok = await api.untilPage(() => { const s = window.__game.scene.getScene('Battle'); return !s?.sys.isActive() || s.tutorial?.talking; }, 90000);
    if (!ok) break;
    const step = await page.evaluate(() => window.__game.scene.getScene('Battle')?.tutorial?.step ?? null);
    if (!step) break;
    if (want.has(step)) {
      await page.evaluate(() => { const s = window.__game.scene.getScene('Battle'); s.speed = 1; s.tutorial.narrator.finishTyping(); });
      await page.waitForTimeout(900);
      const path = join(raw, `${key}-${step}.png`);
      await page.screenshot({ path });
      files[key].push([step, path]);
      want.delete(step);
    }
    if (step === 'flank' && want.has('flank-knob')) {
      await page.evaluate(() => window.__game.scene.getScene('Battle').tutorialHost().select(3));
      await page.waitForTimeout(1600);
      const path = join(raw, `${key}-flank-knob.png`);
      await page.screenshot({ path });
      files[key].push(['flank-knob', path]);
      want.delete('flank-knob');
    }
    await page.evaluate((code) => new Function('s', code)(window.__game.scene.getScene('Battle')), ACT);
    await page.waitForTimeout(300);
  }
  if (want.size) problems.push(`${key}: never reached ${[...want].join(', ')}`);
  await ctx.close();
}

// one contact sheet per language and size: the steps side by side, captioned
const sheetCtx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const sp = await sheetCtx.newPage();
for (const [key, list] of Object.entries(files)) {
  if (!list.length) continue;
  const imgs = list.map(([step, p]) => `<figure><img src="data:image/png;base64,${readFileSync(p).toString('base64')}"><figcaption>${step}</figcaption></figure>`).join('');
  const w = key.startsWith('390') ? 230 : 190;
  await sp.setContent(`<html><body style="margin:0;background:#1d1712;font:14px sans-serif;color:#eee"><div id="s" style="display:flex;gap:8px;padding:8px;width:max-content">${imgs}</div><style>figure{margin:0;text-align:center}img{width:${w}px;display:block}</style></body></html>`);
  await sp.waitForTimeout(200);
  await sp.locator('#s').screenshot({ path: join(out, `${key}.jpg`), type: 'jpeg', quality: 62 });
}
await sheetCtx.close();
if (!process.env.KEEP_RAW) rmSync(raw, { recursive: true, force: true });
await browser.close();
console.log(problems.length ? `problems:\n${problems.join('\n')}` : 'TUT-02 shots done');
