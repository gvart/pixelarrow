// War sandbox screenshots: overview, height overlay, zoomed-in selection with a move order, squads
// pathing through the pass and the ford (test-ridge only), 600-unit brawl with perf, cost overlay.
// Usage: node scripts/war/sandbox-shots.mjs [baseUrl] [outDir] [region] [sim]
//   (default outDir: shots/war/sandbox, region: test-ridge, sim: real)
// Requires a running dev server (npm run dev).
import { launch, captureErrors, shotsDir } from '../lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = shotsDir('war/sandbox', process.argv[3]);
const region = process.argv[4] ?? 'test-ridge';
const sim = process.argv[5] ?? 'real';
const url = `${base}sandbox.html?region=${region}&sim=${sim}`;

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
await page.check('[data-ov=height]');
await wait(300);
await shot('01b-overlay-height');
await page.uncheck('[data-ov=height]');

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

// test-ridge: one squad has to detour through the pass in the mountain wall, one across the ford
if (region === 'test-ridge') {
  // spawn one squad, order a move, and shoot once one of its units stands inside the box (tiles)
  const crossing = async (name, spawn, to, box) => {
    await boot();
    await page.evaluate(([spawn, to, box]) => {
      const s = window.__sandbox;
      s.sim.spawn('you', 0, 'hoplite', 20, ...spawn);
      s.sim.order({ kind: 'move', squad: 0, x: to[0], y: to[1] });
      s.sim.speed(4);
      s.cameras.main.setZoom(2).centerOn((box[0] + box[2]) * 8, (box[1] + box[3]) * 8);
    }, [spawn, to, box]);
    await page.waitForFunction(([x0, y0, x1, y1]) => window.__sandbox.drawn.some((d) => d.x >= x0 && d.x <= x1 && d.y >= y0 && d.y <= y1), box, { timeout: 30000 });
    await wait(400);
    await shot(name);
  };
  await crossing('02b-pass', [60, 66], [60, 102], [37, 80, 42, 84]);
  await crossing('02c-ford', [80, 52], [122, 50], [97, 36, 103, 40]);
}

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
