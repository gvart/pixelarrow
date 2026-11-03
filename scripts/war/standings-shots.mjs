// The world screen's standings panel and roll of honour (W-169, W-168), whole screen, offline mock: shots/standings-*.png.
// Usage: node scripts/war/standings-shots.mjs [port]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '5173';
mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ args: ['--mute-audio'] });
for (const [w, h] of [[1280, 720], [1920, 1080]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.log(`${w}x${h} pageerror: ${e.message}`));
  await page.goto(`http://localhost:${port}/world.html?offline=1`);
  await page.waitForSelector('#wvSeason .ld-row', { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `shots/standings-${w}x${h}.png` });
  await page.click('#wvSeason [data-ladder="builder"]');
  await page.screenshot({ path: `shots/standings-builder-${w}x${h}.png` });
  await page.keyboard.press('b');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/standings-roll-${w}x${h}.png` });
  const fit = await page.evaluate(() => {
    const r = document.querySelector('#wvSeason').getBoundingClientRect();
    return { season: [Math.round(r.top), Math.round(r.bottom)], h: innerHeight };
  });
  console.log(`${w}x${h}`, JSON.stringify(fit));
  await page.close();
}
await browser.close();
