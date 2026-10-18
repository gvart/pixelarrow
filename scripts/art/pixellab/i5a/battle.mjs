// I5a: screenshots of a real battle with given classes on both sides (the campaign's fresh skirmish, the men's classes
// swapped), to see the new sheets in the game: at deploy, marching, and in contact. Needs the dev server.
// Usage: node scripts/art/pixellab/i5a/battle.mjs <out dir> --mine royal_guard,sacred_band --foe hoplite,militia
//          [--url http://localhost:5191] [--shots 4] [--every 2500] [--size 844x390] [--name battle]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const out = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const base = opt('url', 'http://localhost:5191');
const mine = opt('mine', 'royal_guard').split(',');
const foe = opt('foe', 'hoplite').split(',');
const [W, H] = opt('size', '390x844').split('x').map(Number);
const name = opt('name', 'battle');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.addInitScript(() => { window.__noFirstRun = true; });
await page.goto(base);
const until = async (fn, ms = 60000, arg) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await page.waitForTimeout(300); } return false; };
if (!(await until(() => !!window.__game?.scene.getScenes(true).length))) throw new Error('game did not boot');
// a fresh skirmish makes the enemy army; then every man's class is swapped and the battle restarted on it
await page.evaluate(() => { window.__state.pending = null; window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', { fresh: true })); });
await until(() => { const s = window.__game.scene.getScene('Battle'); return s.sys.isActive() && !!s.sim; });
await page.evaluate(([mine, foe]) => {
  const st = window.__state;
  st.campaign.data.settings.seenGestureHint = true;
  st.campaign.data.heroes.forEach((h, i) => { h.cls = mine[i % mine.length]; h.wound = 0; h.reserve = false; });
  st.pending.enemy.heroes.forEach((h, i) => { h.cls = foe[i % foe.length]; });
  window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', {}));
}, [mine, foe]);
await page.waitForTimeout(500);
await until(() => { const s = window.__game.scene.getScene('Battle'); return s.sys.isActive() && !!s.sim && !!s.hud; });
await page.waitForTimeout(2500);
await page.screenshot({ path: join(out, `${name}_0_deploy.png`) });
await page.evaluate(() => { const s = window.__game.scene.getScene('Battle'); s.startFight(); s.hideBanner?.(); });
const n = Number(opt('shots', 4)), every = Number(opt('every', 2500));
const zoom = Number(opt('zoom', 0));
for (let i = 1; i <= n; i++) {
  await page.waitForTimeout(every);
  // optionally a closer camera on the fight (the middle of the two armies)
  if (zoom) await page.evaluate((z) => {
    const s = window.__game.scene.getScene('Battle');
    const cam = s.cameras.main;
    const us = s.sim.units.filter((u) => u.hp > 0);
    const p = us.map((u) => s.unitScreen?.(u) ?? null).filter(Boolean);
    cam.setZoom(z);
    if (p.length) cam.centerOn(p.reduce((a, q) => a + q.x, 0) / p.length, p.reduce((a, q) => a + q.y, 0) / p.length);
  }, zoom).catch(() => {});
  await page.screenshot({ path: join(out, `${name}_${i}.png`) });
  // the first contact pauses the battle for orders: play on
  await page.evaluate(() => { const s = window.__game.scene.getScene('Battle'); s.setPaused?.(false); s.hideBanner?.(); }).catch(() => {});
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no console errors');
