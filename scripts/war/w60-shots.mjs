// W-60 screenshots: the hunger mark on the soldier card, a soul in the world with the claim prompt, the local Town store
// tab. Usage: node scripts/war/w60-shots.mjs [baseUrl] [outDir]. Requires a running dev server.
import { launch } from '../lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'shots/war/w60';
const browser = await launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
const wait = (ms) => page.waitForTimeout(ms);
const boot = async (id) => {
  await page.goto(`${base}sandbox.html?region=test-ridge&scenario=${id}&seed=1`);
  await page.waitForFunction(() => window.__sandbox?.sim?.cur && document.getElementById('dev'), null, { timeout: 120000 });
  await wait(2500);
};
const select = (squad) => page.evaluate((q) => { const s = window.__sandbox; s.sel.set(s.sim.cur.squads[q].units); }, squad);

// 1. a soul in the world with the claim prompt
await boot('limit-soul');
await page.evaluate(() => { const s = window.__sandbox, so = s.sim.cur.souls[0]; s.focus(so.x - 6, so.y + 2, 1); });
await select(0);
await wait(1500);
await page.screenshot({ path: `${out}/soul-claim.png` });
// claim him; then the second soul refused at 12
await page.click('#rfSoul [data-act="claim"]');
await page.waitForFunction(() => (window.__sandbox.sim.cur.souls ?? [])[0]?.claim > 0.3, null, { timeout: 60000 });
await page.evaluate(() => { const s = window.__sandbox, so = s.sim.cur.souls[0]; s.focus(so.x, so.y, 2); });
await wait(300);
await page.screenshot({ path: `${out}/soul-claiming.png` });
await page.screenshot({ path: `${out}/minimap.png`, clip: { x: 0, y: 580, width: 220, height: 220 } });
await page.waitForFunction(() => (window.__sandbox.sim.cur.souls ?? []).length === 1, null, { timeout: 60000 });
await wait(1200);
await page.evaluate(() => { const s = window.__sandbox, so = s.sim.cur.souls[0]; s.focus(so.x + 4, so.y, 1); });
await select(0);
await wait(800);
await page.click('#rfSoul [data-act="claim"]');
await wait(600);
await page.screenshot({ path: `${out}/soul-refused.png` });

// 2. hunger on the soldier card (a starving archer) and the roster
await boot('food-hunger');
await page.keyboard.press('r');
await wait(800);
await page.evaluate(() => document.querySelector('.rr-row .hg-2')?.closest('.rr-row')?.click());
await wait(800);
await page.screenshot({ path: `${out}/hunger-card.png` });
await page.keyboard.press('Escape'); // the card
await page.keyboard.press('r'); // the roster

// 3. the local Town store: the hoplites by the camp, the chest's Town store tab
await select(0);
await page.evaluate(() => { const s = window.__sandbox, b = s.sim.cur.buildings.find((x) => x.type === 'camp'); s.focus(b.x, b.y, 1); });
await page.keyboard.press('i');
await wait(600);
await page.click('#rfChest [data-tab="town"]');
await wait(600);
await page.screenshot({ path: `${out}/town-store.png` });
await browser.close();
