// W-140, W-146 the Town tab of the market and the hunt contract, whole screen at the two sizes owners play on (offline
// stub, a real home region). Usage: node scripts/war/npc-market-shots.mjs [baseUrl] [outDir]. Requires a running dev server.
import { launch, captureErrors, shotsDir } from '../lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = shotsDir('war/npc-market', process.argv[3]);
const browser = await launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--mute-audio'] });

for (const [w, h] of [[1280, 720], [1920, 1080]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const problems = captureErrors(page, { prefix: true });
  const wait = (ms) => page.waitForTimeout(ms);
  const shot = async (name) => {
    await page.screenshot({ path: `${out}/${name}_${w}x${h}.png` });
    console.log('saved', `${out}/${name}_${w}x${h}.png`);
  };
  const act = async (sel) => { await page.click(sel); await wait(350); };

  await page.goto(`${base}sandbox.html?region=dodona&sim=real`);
  await page.waitForFunction(() => window.__sandbox?.sim?.cur && document.getElementById('rfMarketBtn'), null, { timeout: 180000 });
  await page.waitForFunction(() => !document.getElementById('rfLoad'), null, { timeout: 180000 });
  await wait(1500);

  // away from the town first: the hint, everything disabled
  await page.keyboard.press('k');
  await wait(800);
  await shot('town_1_away');

  // his men at the town, coin and goods at hand
  await page.evaluate(() => {
    const s = window.__sandbox;
    s.sim.spawn('you', 0, 'militia', 4, 312, 338);
    s.sim.addStock(0, 'coin', 800);
    s.sim.addStock(0, 'iron', 60);
    s.sim.addStock(0, 'wood', 60);
  });
  await wait(1500);
  await page.evaluate(() => { const b = document.querySelector('#rfMarket [data-tab="Town"]'); b?.click(); });
  await wait(600);
  await shot('town_2_at_town');
  await act('#rfMarket [data-act="nPick"][data-r="iron"]');
  await act('#rfMarket [data-act="nSell"]');
  await act('#rfMarket [data-act="nHire"]');
  await shot('town_3_dealt');

  // the hunt contract: posting, then on the board
  await act('#rfMarket [data-tab="Contracts"]');
  await act('#rfMarket [data-act="postView"]');
  await act('#rfMarket [data-act="ckind"][data-v="hunt"]');
  await shot('hunt_1_post');
  await act('#rfMarket [data-act="post"]');
  await wait(400);
  await shot('hunt_2_board');
  if (problems.length) console.log('problems', problems);
  await page.close();
}
await browser.close();
