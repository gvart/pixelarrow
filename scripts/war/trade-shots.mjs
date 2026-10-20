// M6k / M6l trade screenshots: the `loot` and `caravan` sandbox scenarios (piles, a foe handcart, the holder panel and
// hover card, the radial on a pile, the escorted wagon under the ambush) and the world map with mock convoys (cart icons,
// the haul planner, the price board in the hover card, the season panel's trade score).
// Usage: node scripts/war/trade-shots.mjs [baseUrl] [outDir] [loot|caravan|world|all]. Requires a running dev server.
import { launch, captureErrors, shotsDir } from '../lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = shotsDir('war/trade', process.argv[3]);
const mode = process.argv[4] ?? 'all';
const browser = await launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = captureErrors(page, { prefix: true });
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('saved', `${out}/${name}.png`);
};
const boot = async (q) => {
  await page.goto(`${base}sandbox.html?region=test-ridge&sim=real&${q}`);
  await page.waitForFunction(() => window.__sandbox?.sim?.cur && document.getElementById('dev'), null, { timeout: 90000 });
};
/** Canvas px of a tile point. */
const scr = (x, y) => page.evaluate(([x, y]) => window.__sandbox.toScreen(x, y), [x, y]);

if (mode === 'all' || mode === 'loot') {
  await boot('scenario=loot');
  await page.waitForFunction(() => (window.__sandbox.sim.cur?.piles?.length ?? 0) > 0 && window.__sandbox.sim.cur.sieges?.some((e) => e.type === 'handcart'), null, { timeout: 120000 });
  await wait(2500);
  await shot('loot_1_field');
  await page.evaluate(() => { const s = window.__sandbox, p = s.sim.cur.piles[0]; s.focus(p.x, p.y, 2); });
  await wait(1200);
  await shot('loot_1b_piles_2x');
  await page.evaluate(() => { const s = window.__sandbox, p = s.sim.cur.piles[0]; s.focus(p.x + 2, p.y + 1, 1 / 2); });
  await wait(800);
  // select the hoplites and the smith, hover the biggest pile (hover card), then hold E for the radial
  const pile = await page.evaluate(() => {
    const s = window.__sandbox, ps = s.sim.cur.piles.slice().sort((a, b) => b.loads - a.loads);
    for (const q of s.sim.squads.values()) if (q.team === 0 && q.owner === 'you') s.selected.add(q.id);
    return ps[0];
  });
  const pp = await scr(Math.floor(pile.x) + 0.5, Math.floor(pile.y) + 0.5);
  await page.mouse.move(pp.x, pp.y);
  await wait(600);
  await shot('loot_2_hover_pile');
  await page.keyboard.down('e');
  await wait(500);
  await shot('loot_3_radial_pile');
  await page.keyboard.up('e'); // tap ran the pick: pick up
  await wait(300);
  // click the pile: the holder panel
  await page.mouse.click(pp.x, pp.y);
  await wait(800);
  await shot('loot_4_panel_pile');
  // the foe handcart: hover card and capture
  const cart = await page.evaluate(() => window.__sandbox.sim.cur.sieges.find((e) => e.type === 'handcart'));
  const cp = await scr(cart.x, cart.y);
  await page.mouse.move(cp.x, cp.y);
  await wait(600);
  await shot('loot_5_hover_cart');
  await page.keyboard.down('e');
  await wait(400);
  await shot('loot_6_radial_cart');
  await page.keyboard.up('e');
  await page.evaluate(() => window.__sandbox.sim.speed(4));
  await wait(9000);
  await page.mouse.click(cp.x, cp.y);
  await wait(800);
  await shot('loot_7_cart_after');
  // the Trade build tab
  await page.keyboard.press('b');
  await page.click('[data-tab="Trade"]');
  await page.hover('#bt-Trade1');
  await wait(400);
  await shot('loot_8_build_trade');
  await page.keyboard.press('Escape');
}

if (mode === 'all' || mode === 'caravan') {
  await boot('scenario=caravan');
  await page.waitForFunction(() => window.__sandbox.sim.cur.sieges?.some((e) => e.type === 'wagon' && (e.loads ?? 0) > 0), null, { timeout: 120000 });
  await wait(1500);
  await page.evaluate(() => { const s = window.__sandbox, w = s.sim.cur.sieges.find((e) => e.type === 'wagon'); s.focus(w.x, w.y, 1); });
  await wait(1200);
  await shot('caravan_1_wagon_1x');
  await page.evaluate(() => { const s = window.__sandbox; s.selected.clear(); s.selected.add(2); });
  await wait(600);
  await shot('caravan_2_card_escort');
  // fast-forward (the machine may be slow): the wagon reaches the ambush, then later
  const ff = async (ticks, name) => {
    await page.evaluate((t) => window.__sandbox.sim.skip(t), ticks);
    await wait(2500);
    await page.evaluate(() => { const s = window.__sandbox, w = s.sim.cur.sieges.find((e) => e.type === 'wagon'); if (w) s.focus(w.x, w.y, 1 / 2); });
    await wait(1500);
    await shot(name);
  };
  await ff(1300, 'caravan_3_ambush');
  await ff(500, 'caravan_4_fight');
  await ff(1200, 'caravan_5_later');
}

if (mode === 'all' || mode === 'world') {
  await page.goto(`${base}world.html?offline=1`);
  await page.waitForFunction(() => window.__world?.st?.regions?.size > 0, null, { timeout: 30000 });
  await wait(1500);
  await shot('world_1_map');
  // the haul planner: Dodona to Ammos by wagon
  await page.evaluate(() => window.__world.haul('dodona', 'ammos', 'wagon'));
  await wait(800);
  await shot('world_2_haul');
  // a market town's hover card with its last-seen price board
  await page.evaluate(() => { const w = window.__world, [x, y] = w.map.toScreen(...w.map.art.regions.stymphalia.centroid); w.hover('stymphalia', x, y); });
  await wait(500);
  await shot('world_3_board');
}

console.log(problems.length ? problems.join('\n') : 'no console errors');
await browser.close();
