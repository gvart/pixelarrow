// Drives the game through every screen in a portrait mobile viewport and saves screenshots.
// Usage: node scripts/screenshots.mjs [baseUrl] [outDir]
// Requires a running dev/preview server. Uses the preinstalled Chromium (PLAYWRIGHT_BROWSERS_PATH).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`[console.error] ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('saved', `${out}/${name}.png`);
};
const scene = (key, data) => page.evaluate(([k, d]) => window.__game.scene.getScenes(true).forEach((s) => s.scene.start(k, d)), [key, data ?? {}]);
const call = (key, fn) => page.evaluate(([k, f]) => {
  const s = window.__game.scene.getScene(k);
  return new Function('s', f)(s);
}, [key, fn]);

// fresh campaign for reproducible shots
await page.goto(base);
await page.evaluate(() => localStorage.clear());
await page.goto(base);
await wait(2500);
await shot('01-menu');

// Army screen: select a stash item to show the comparison preview
await scene('Army');
await wait(800);
await shot('02-army-roster');
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Army');
  const st = window.__state;
  s.selItem = st.campaign.data.stash[0];
  s.tab = 'stash';
  s.refresh();
});
await wait(400);
await shot('03-army-stash-compare');

// Deployment
await scene('Battle', { fresh: true });
await wait(1500);
await shot('04-deploy');
await call('Battle', `s.openGroups(); return 1;`);
await wait(400);
await shot('05-deploy-groups');
await call('Battle', `s.overlay.destroy(); s.overlay = null; s.groupArea && s.groupArea.destroy(); s.buildHud(); return 1;`);

// Start the fight, advance the phalanx, loose the skirmishers
await call('Battle', `s.startFight(); s.selGroup = 0; s.command({kind:'order', group:-1, order:'advance'}); s.selGroup = 1; s.command({kind:'loose', group:-1, on:true}); s.selGroup = 0; s.speed = 2; return 1;`);
// let it run until contact (auto-pause) or a few seconds
for (let i = 0; i < 20; i++) {
  await wait(500);
  const paused = await call('Battle', `return s.paused;`);
  if (paused) break;
}
await shot('06-battle-contact');
await call('Battle', `s.setPaused(false); s.hideBanner(); s.speed = 2; s.command({kind:'order', group:-1, order:'charge'}); return 1;`);
for (let i = 0; i < 8; i++) {
  await wait(500);
  if (await call('Battle', `return s.paused;`)) await call('Battle', `s.setPaused(false); s.hideBanner(); return 1;`);
}
await call('Battle', `s.cameras.main.setZoom(3); const u = s.sim.units.find(u=>u.side===0 && u.state==='ready'); if (u) s.cameras.main.centerOn(u.x*24, u.y*12 - 10); return 1;`);
await wait(300);
await shot('07-battle-melee-zoom');
await call('Battle', `s.cameras.main.setZoom(2); return 1;`);

// Fast-forward to the end
await call('Battle', `s.paused = false; for (let i = 0; i < 20*400 && s.sim.phase === 'battle'; i++) s.sim.step(); return 1;`);
await wait(3000);
await shot('08-results');
await call('Results', `const o = window.__state.last.outcome; o.loot.slice(0, o.picks).forEach(it => s.chosen.add(it.uid)); s.toggle('none'); return 1;`).catch(() => {});
await wait(300);
await shot('09-results-picked');

console.log(problems.length ? problems.join('\n') : 'no console errors');
await browser.close();
