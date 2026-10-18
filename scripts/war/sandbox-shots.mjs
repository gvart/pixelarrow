// War sandbox screenshots: overview, zoomed-in selection with a move order, 600-unit brawl with perf.
// Usage: node scripts/war/sandbox-shots.mjs [baseUrl] [outDir] [region]   (default outDir: shots/war/sandbox)
// Requires a running dev server (npm run dev).
import { launch, captureErrors, shotsDir } from '../lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = shotsDir('war/sandbox', process.argv[3]);
const region = process.argv[4] ?? '';
const url = `${base}sandbox.html${region ? `?region=${region}` : ''}`;

const browser = await launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = captureErrors(page, { prefix: true });
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('saved', `${out}/${name}.png`);
};
const boot = async () => {
  await page.goto(url);
  await page.waitForFunction(() => window.__sandbox?.sim?.cur && document.getElementById('dev'));
};

await boot();
await wait(500);
await shot('01-overview');

// zoomed in: two own squads and an enemy squad, box-select the own ones, right-click a move
await page.evaluate(() => {
  const s = window.__sandbox, { w, h } = s.region;
  s.sim.spawn('you', 0, 'hoplite', 20, w * 0.4, h * 0.45);
  s.sim.spawn('you', 0, 'archer', 16, w * 0.4, h * 0.55);
  s.sim.spawn('bot', 1, 'celt_sword', 20, w * 0.62, h * 0.5);
  s.cameras.main.setZoom(2).centerOn(w * 0.47 * 16, h * 0.5 * 16);
});
await wait(800);
await page.mouse.move(250, 70);
await page.mouse.down();
await page.mouse.move(460, 860, { steps: 8 });
await page.mouse.up();
await page.mouse.click(1000, 470, { button: 'right' });
await wait(350);
await shot('02-zoom-selection');

// 600 units fighting, perf panel in view
await boot();
await page.click('#brawl');
await wait(1500);
await page.evaluate(() => {
  const s = window.__sandbox;
  const mine = s.sim.cur.squads.filter((q) => q.team === 0);
  const foes = s.sim.cur.squads.filter((q) => q.team === 1);
  mine.forEach((q, i) => s.sim.order({ kind: 'attack', squad: q.id, target: foes[i % foes.length].id }));
});
const fps = [];
for (let i = 0; i < 18; i++) {
  await wait(500);
  fps.push(await page.evaluate(() => window.__sandbox.game.loop.actualFps));
}
const stats = await page.evaluate(() => window.__sandbox.sim.stats);
await shot('03-brawl-600');
console.log(`fps avg ${(fps.reduce((a, b) => a + b, 0) / fps.length).toFixed(1)} min ${Math.min(...fps).toFixed(1)}; sim ${stats.stepMs.toFixed(2)} ms/step; units ${stats.units}`);

// move-cost overlay
await page.check('[data-ov=cost]');
await wait(300);
await shot('04-overlay-cost');

await browser.close();
if (problems.length) {
  console.log(problems.join('\n'));
  process.exit(1);
}
