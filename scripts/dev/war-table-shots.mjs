// Screenshots of the war map on the local demo shard (src/online/demoShard.ts;
// no backend needed): shots/39-war-table-map.png, 40-hex-panel.png and
// 41-fog-and-armies.png (git-ignored). (23-online-map.png comes from scripts/online-e2e.mjs, on a real server.)
// Usage: node scripts/dev/war-table-shots.mjs [baseUrl] [outDir]   (needs a running dev/preview server)
import { launch, phoneContext, captureErrors, apiDown, makePageApi, shotsDir } from '../lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = shotsDir('', process.argv[3]);

const browser = await launch();
const ctx = await phoneContext(browser, { prep: false });
const page = await ctx.newPage();
const errors = captureErrors(page, { console: false });
await apiDown(page);
await page.goto(base);
const api = makePageApi(page);
const ev = api.ev;
const until = (fn, ms = 10000) => api.untilPage(fn, ms, 150);
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
  s.centerOn(raider ? raider.loc : s.profile.army.loc);
});

await browser.close();
if (errors.length) {
  console.log('page errors:\n' + errors.join('\n'));
  process.exit(1);
}
