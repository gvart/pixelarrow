// Screenshots of the war-table hex map on the local demo shard (src/online/demoShard.ts;
// no backend needed): docs/screenshots/39-war-table-map.png, 40-hex-panel.png and
// 41-fog-and-armies.png. (23-online-map.png comes from scripts/online-e2e.mjs, on a real server.)
// Usage: node scripts/war-table-shots.mjs [baseUrl] [outDir]   (needs a running dev/preview server)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => (window.__noFirstRun = true)); // no onboarding here (scripts/tutorial-smoke.mjs covers it)
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/api/**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"not_configured","message":"down"}}' }));
await page.goto(base);
const ev = (fn, arg) => page.evaluate(fn, arg);
const until = async (fn, ms = 10000) => {
  for (let t = 0; t < ms; t += 150) {
    if (await ev(fn)) return true;
    await page.waitForTimeout(150);
  }
  return false;
};
await until(() => !!window.__game && window.__game.scene.isActive('Menu'), 15000);
await ev(() => {
  const s = window.__state.campaign?.data.settings;
  if (s) s.seenHints = ['*'];
});

async function shot(name, preview, setup) {
  await ev((p) => window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Online', { preview: p })), preview);
  await until(() => !!window.__game.scene.getScene('Online').map);
  if (['neutral', 'town', 'own', 'rival', 'far'].includes(preview)) await until(() => !!window.__game.scene.getScene('Online').detail);
  if (setup) await ev(setup);
  // let the camera settle, clouds drift, smoke rise and the marching army move
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${out}/${name}` });
  console.log('saved', `${out}/${name}`);
}

await shot('39-war-table-map.png', 'map');
await shot('40-hex-panel.png', 'town');
await shot('41-fog-and-armies.png', 'map', () => {
  const s = window.__game.scene.getScene('Online');
  const cam = s.cameras.main;
  cam.setZoom(Math.max(1, cam.zoom - 1));
  const raider = s.map.armies.find((a) => a.path && a.player !== s.map.you.id);
  s.centerOn(raider ?? s.profile.army);
});

await browser.close();
if (errors.length) {
  console.log('page errors:\n' + errors.join('\n'));
  process.exit(1);
}
