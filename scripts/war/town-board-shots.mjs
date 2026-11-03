// W-184 the Town board tab, whole screen at the two sizes owners play on (offline stub, a real home region).
// Usage: node scripts/war/town-board-shots.mjs [baseUrl] [outDir]. Requires a running dev server.
import { launch, captureErrors, shotsDir } from '../lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = shotsDir('war/town-board', process.argv[3]);
const browser = await launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--mute-audio'] });

for (const [w, h] of [[1280, 720], [1920, 1080]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const problems = captureErrors(page, { prefix: true });
  const wait = (ms) => page.waitForTimeout(ms);
  const shot = async (name) => {
    await page.screenshot({ path: `${out}/${name}_${w}x${h}.png` });
    console.log('saved', `${out}/${name}_${w}x${h}.png`);
  };

  await page.goto(`${base}sandbox.html?region=dodona&sim=real`);
  await page.waitForFunction(() => window.__sandbox?.sim?.cur && document.getElementById('rfMarketBtn'), null, { timeout: 180000 });
  await page.waitForFunction(() => !document.getElementById('rfLoad'), null, { timeout: 180000 });
  await wait(1500);

  // away from the town: he can read it, not take
  await page.keyboard.press('k');
  await wait(600);
  await page.click('#rfMarket [data-tab="Board"]');
  await wait(800);
  await shot('board_1_away');

  // his men at the town
  await page.evaluate(() => window.__sandbox.sim.spawn('you', 0, 'hoplite', 6, 312, 338));
  await wait(1500);
  await page.click('#rfMarket [data-tab="Town"]');
  await wait(300);
  await page.click('#rfMarket [data-tab="Board"]');
  await wait(800);
  await shot('board_2_at_town');

  // he takes the first job
  await page.click('#rfMarket [data-act="bdTake"]');
  await wait(800);
  await shot('board_3_taken');
  if (problems.length) console.log('problems', problems);
  await page.close();
}
await browser.close();
