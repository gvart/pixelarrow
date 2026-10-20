// M6k market panels (offline stub): the `market` sandbox scenario, each Market tab after a real action (rent, stow,
// list, take from the board, post a contract, offer a letter) and the hand-off window through to done.
// Usage: node scripts/war/market-shots.mjs [baseUrl] [outDir]. Requires a running dev server.
import { launch, captureErrors, shotsDir } from '../lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = shotsDir('war/market', process.argv[3]);
const browser = await launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = captureErrors(page, { prefix: true });
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('saved', `${out}/${name}.png`);
};
const act = async (sel) => { await page.click(sel); await wait(350); };
const fill = async (sel, v) => { await page.fill(sel, String(v)); await page.dispatchEvent(sel, 'input'); };

await page.goto(`${base}sandbox.html?region=test-ridge&sim=real&scenario=market`);
await page.waitForFunction(() => window.__sandbox?.sim?.cur && document.getElementById('rfMarketBtn') && (window.__sandbox.sim.cur.stock?.[0]?.coin ?? 0) > 0, null, { timeout: 120000 });
await wait(2500);
// select the militia in the court
await page.evaluate(() => { const s = window.__sandbox; for (const q of s.sim.squads.values()) if (q.team === 0 && q.owner === 'you') { s.selected.add(q.id); break; } });
await page.keyboard.press('k');
await wait(600);
await shot('market_1_stall_empty');
await act('#rfMarket [data-act="rent"][data-k="stall"]');
await act('#rfMarket [data-act="rent"][data-k="warehouse"]');
await page.selectOption('#rfMarket [data-f="stowRes"]', 'coin');
await fill('#rfMarket [data-f="stowN"]', 400);
await act('#rfMarket [data-act="stowIn"]');
await page.selectOption('#rfMarket [data-f="stowRes"]', 'iron');
await fill('#rfMarket [data-f="stowN"]', 40);
await act('#rfMarket [data-act="stowIn"]');
await act('#rfMarket [data-act="upgrade"]');
await shot('market_2_stall_rented');
await act('#rfMarket [data-tab="Offers"]');
await page.selectOption('#rfMarket [data-f="res"]', 'iron');
await fill('#rfMarket [data-f="n"]', 25);
await fill('#rfMarket [data-f="price"]', 9);
await act('#rfMarket [data-act="list"]');
await act('#rfMarket [data-act="side"][data-v="buy"]');
await page.selectOption('#rfMarket [data-f="res"]', 'tin');
await fill('#rfMarket [data-f="n"]', 15);
await fill('#rfMarket [data-f="price"]', 10);
await act('#rfMarket [data-act="list"]');
await shot('market_3_offers');
await act('#rfMarket [data-tab="Board"]');
await act('#rfMarket [data-act="fill"]:not([disabled])');
await shot('market_4_board');
await act('#rfMarket [data-tab="Contracts"]');
await page.selectOption('#rfMarket [data-f="cKind"]', 'supply');
await wait(200);
await fill('#rfMarket [data-f="cReward"]', 80);
await act('#rfMarket [data-act="post"]');
await act('#rfMarket [data-act="take"]:not([disabled])');
await shot('market_5_contracts');
await act('#rfMarket [data-tab="Letters"]');
await fill('#rfMarket [data-f="lAmount"]', 40);
await act('#rfMarket [data-act="offerL"]');
await act('#rfMarket [data-act="buyL"]:not([data-id="form"])');
await shot('market_6_letters');
// the hand-off window: my half in, their half comes, both confirm
await act('#rfMarket [data-act="handoff"]');
await page.selectOption('#rfHandoff [data-h="res"]', 'hides');
await fill('#rfHandoff [data-h="n"]', 20);
await act('#rfHandoff [data-act="hAdd"]');
await act('#rfHandoff [data-act="hOffer"]');
await wait(1200);
await shot('market_7_handoff_open');
await act('#rfHandoff [data-act="hConfirm"]');
await wait(1200);
await shot('market_8_handoff_done');
console.log(problems.length ? problems.join('\n') : 'no page errors');
await browser.close();
