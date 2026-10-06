import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto('http://localhost:5173/');
await page.waitForTimeout(2000);
await page.evaluate(() => window.__game.scene.getScene('Menu').scene.start('Battle', { fresh: true }));
await page.waitForTimeout(1500);
await page.evaluate(() => { const s = window.__game.scene.getScene('Battle'); s.hideBanner(); s.startFight(); s.hideBanner();
  for (let i = 0; i < 20*7; i++) s.sim.step();
  for (const v of s.views) { v.px = v.u.x; v.py = v.u.y; }
  s.cameras.main.setZoom(3); s.cameras.main.centerOn(12*24, 17*12); s.setPaused(true); });
await page.waitForTimeout(500);
await page.screenshot({ path: process.argv[2] });
await browser.close();
