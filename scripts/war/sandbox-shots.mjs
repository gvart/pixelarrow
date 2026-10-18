// War sandbox screenshots (iso view): overview, height overlay, plateau edge close-up, box selection
// and a right-click order on a hill (checks the picked tile), squads pathing through the pass and
// the ford (test-ridge only), 600-unit brawl with perf, cost overlay.
// Usage: node scripts/war/sandbox-shots.mjs [baseUrl] [outDir] [region] [sim]
//   (default outDir: shots/war/sandbox, region: test-ridge, sim: real)
// Requires a running dev server (npm run dev).
import { launch, captureErrors, shotsDir } from '../lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = shotsDir('war/sandbox', process.argv[3]);
const region = process.argv[4] ?? 'test-ridge';
const sim = process.argv[5] ?? 'real';
const url = `${base}sandbox.html?region=${region}&sim=${sim}`;
const ridge = region === 'test-ridge';

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

// plateau edge: the round hill (levels 1..5) with the mountain wall (level 6) beyond
await page.evaluate((ridge) => {
  const s = window.__sandbox, { w, h } = s.region;
  if (ridge) s.focus(48, 58, 1); else s.focus(w * 0.4, h * 0.45, 2);
}, ridge);
await wait(800);
await shot('02a-plateau-edge');

// two own squads up on the hill and an enemy squad below; box-select ours, right-click a hilltop tile
const [ax, ay, bx, by, ex, ey, tx, ty] = ridge ? [36, 38, 44, 43, 58, 48, 46.5, 37.5] : [64, 72, 64, 88, 99, 80, 75.5, 70.5];
await page.evaluate(([ax, ay, bx, by, ex, ey]) => {
  const s = window.__sandbox;
  s.sim.spawn('you', 0, 'hoplite', 20, ax, ay);
  s.sim.spawn('you', 0, 'archer', 16, bx, by);
  s.sim.spawn('bot', 1, 'celt_sword', 20, ex, ey);
  s.focus((ax + ex) / 2, (ay + ey) / 2, 2);
}, [ax, ay, bx, by, ex, ey]);
await page.waitForFunction(() => window.__sandbox.drawn.length >= 56);
await page.evaluate(() => window.__sandbox.sim.speed(0));
await wait(300);
const bb = await page.evaluate(() => {
  const s = window.__sandbox, pts = s.drawn.filter((d) => d.team === 0).map((d) => s.toScreen(d.x, d.y));
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs) - 15, y0: Math.min(...ys) - 25, x1: Math.max(...xs) + 15, y1: Math.max(...ys) + 10 };
});
await page.mouse.move(bb.x0, bb.y0);
await page.mouse.down();
await page.mouse.move(bb.x1, bb.y1, { steps: 8 });
await page.mouse.up();
const sel = await page.evaluate(() => window.__sandbox.selected.size);
const tp = await page.evaluate(([x, y]) => window.__sandbox.toScreen(x, y), [tx, ty]);
await page.mouse.click(tp.x, tp.y, { button: 'right' });
await wait(100);
const cmd = await page.evaluate(() => window.__sandbox.lastCommand);
const lvl = await page.evaluate(([x, y]) => window.__sandbox.iso.zAt(x, y), [tx, ty]);
const ok = sel === 2 && cmd && Math.hypot(cmd.x - tx, cmd.y - ty) < 0.5;
console.log(`selection: ${sel} squads; right-click at tile (${tx}, ${ty}) level ${lvl} -> ordered (${cmd?.x.toFixed(2)}, ${cmd?.y.toFixed(2)}) ${ok ? 'OK' : 'MISS'}`);
if (!ok) problems.push('iso selection / order picking missed');
await page.evaluate(() => window.__sandbox.sim.speed(1));
await wait(1500);
await shot('02-zoom-selection');

if (ridge) {
  // spawn one squad, order a move, and shoot once one of its units stands inside the box (tiles)
  const crossing = async (name, spawn, to, box) => {
    await boot();
    await page.evaluate(([spawn, to, box]) => {
      const s = window.__sandbox;
      s.sim.spawn('you', 0, 'hoplite', 20, ...spawn);
      s.sim.order({ kind: 'move', squad: 0, x: to[0], y: to[1] });
      s.sim.speed(4);
      s.focus((box[0] + box[2]) / 2, (box[1] + box[3]) / 2, 2);
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
await page.evaluate((ridge) => {
  const s = window.__sandbox;
  const mine = s.sim.cur.squads.filter((q) => q.team === 0);
  const foes = s.sim.cur.squads.filter((q) => q.team === 1);
  mine.forEach((q, i) => s.sim.order({ kind: 'attack', squad: q.id, target: foes[i % foes.length].id }));
  if (ridge) s.focus(100, 75, 0.5);
}, ridge);
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
