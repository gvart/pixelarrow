// Beast close-ups at zoom 1 (one screen px per world px): each mob scenario's pack framed as it closes on the men, a
// crop round the pack, plus one whole fight at 1520x750. Used to check sheets drawn at a whole scale (crisp pixels).
// Usage: node scripts/war/beast-closeups.mjs <baseUrl> <outDir> <tag> [kinds,comma,separated]
import { launch, shotsDir } from '../lib/harness.mjs';

const [base = 'http://localhost:5194/', outArg, tag = 'after', only] = process.argv.slice(2);
const out = shotsDir('war/beast-closeups', outArg);
const KINDS = only ? only.split(',') : ['wolf', 'jackal', 'boar', 'bear', 'lion', 'ibex', 'serpent', 'scorpion', 'harpy', 'drake'];
const browser = await launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1520, height: 750 } });
const boot = async (q) => {
  await page.goto(`${base}sandbox.html?region=test-ridge&sim=real&offline=1&${q}`);
  await page.waitForFunction(() => window.__sandbox?.sim?.cur, null, { timeout: 120000 });
  await page.waitForFunction(() => !document.getElementById('rfLoad'), null, { timeout: 120000 });
  await page.evaluate(() => window.__sandbox.setFog?.(false));
};
/** Centre of the team-1 units (tile coords). */
const pack = () => page.evaluate(() => {
  const c = window.__sandbox.sim.cur, foe = new Set(c.squads.filter((q) => q.team === 1).map((q) => q.id));
  const us = c.units.filter((u) => foe.has(u.squad) && u.hp > 0);
  const n = us.length || 1;
  return [us.reduce((a, u) => a + u.x, 0) / n, us.reduce((a, u) => a + u.y, 0) / n];
});
for (const kind of KINDS) {
  await boot(`scenario=mob-${kind}`);
  await page.waitForTimeout(kind === 'ibex' ? 1500 : 3500);
  const [x, y] = await pack();
  await page.evaluate(([x, y]) => window.__sandbox.focus(x, y, 1), [x, y]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${tag}_${kind}_z1.png`, clip: { x: 760 - 260, y: 375 - 160, width: 520, height: 320 } });
  console.log('saved', `${out}/${tag}_${kind}_z1.png`);
  if (kind === 'wolf' || kind === 'bear') {
    await page.waitForTimeout(3000);
    const [fx, fy] = await pack();
    await page.evaluate(([x, y]) => window.__sandbox.focus(x, y, 1), [fx, fy]);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${tag}_fight_${kind}_1520x750.png` });
    console.log('saved', `${out}/${tag}_fight_${kind}_1520x750.png`);
  }
}
await browser.close();
