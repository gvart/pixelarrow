// War sandbox screenshots at real scale (iso, 64 x 32 tiles, 1:1 soldier sprites): soldiers at
// zoom 1 at the ford, a squad on the plateau rim, box selection and a right-click order on a hill
// (checks the picked tile), a 600-unit brawl at mid zoom (sprites), at dot zoom and at the
// overview (squad banners) with fps for each, the height overlay. Spots come from the scene
// (src/war/regions/test-ridge.spots.ts), so this targets test-ridge.
// Then each ?scenario= preset (src/war/scenarios): its opening, the player side playing a simple
// plan at 4x speed, a mid-fight shot and the end-of-fight score from the panel.
// Usage: node scripts/war/sandbox-shots.mjs [baseUrl] [outDir] [sim] [all|scenarios]
//   (default outDir: shots/war/sandbox, sim: real). Requires a running dev server (npm run dev).
import { launch, captureErrors, shotsDir } from '../lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = shotsDir('war/sandbox', process.argv[3]);
const sim = process.argv[4] ?? 'real';
const mode = process.argv[5] ?? 'all';
const url = `${base}sandbox.html?region=test-ridge&sim=${sim}`;

const browser = await launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = captureErrors(page, { prefix: true });
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('saved', `${out}/${name}.png`);
};
const boot = async (q = '') => {
  await page.goto(url + q);
  await page.waitForFunction(() => window.__sandbox?.sim?.cur && document.getElementById('dev'), null, { timeout: 60000 });
};
/** Average and minimum fps over n half seconds. */
const fps = async (label, n = 12) => {
  const v = [];
  for (let i = 0; i < n; i++) {
    await wait(500);
    v.push(await page.evaluate(() => window.__sandbox.game.loop.actualFps));
  }
  const st = await page.evaluate(() => ({ ...window.__sandbox.sim.stats, zoom: window.__sandbox.cameras.main.zoom }));
  console.log(`${label}: zoom ${st.zoom.toFixed(3)} fps avg ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)} min ${Math.min(...v).toFixed(1)}; sim ${st.stepMs.toFixed(2)} ms/step; units ${st.units}`);
};

if (mode === 'all') {
// 1. soldiers at 1:1 at the ford: own hoplites wading east, enemy swordsmen waiting on the far bank
await boot();
await page.evaluate(() => {
  const s = window.__sandbox, { ford, fordW, fordE } = s.spots;
  s.sim.spawn('you', 0, 'hoplite', 20, fordW[0] - 2, fordW[1]);
  s.sim.spawn('you', 0, 'archer', 16, fordW[0] - 8, fordW[1] + 6);
  s.sim.spawn('bot', 1, 'celt_sword', 20, fordE[0] + 6, fordE[1]);
  s.sim.order({ kind: 'move', squad: 0, x: ford[0], y: ford[1] });
  s.focus((fordW[0] + ford[0]) / 2, (fordW[1] + ford[1]) / 2, 1);
});
await page.waitForFunction(() => {
  const s = window.__sandbox, [fx, fy] = s.spots.ford;
  return s.drawn.some((d) => d.u.squad === 0 && Math.hypot(d.x - fx, d.y - fy) < 6);
}, null, { timeout: 30000 });
await wait(600);
await shot('01-ford-1x');

// 2. a squad on the plateau rim, the cliff below it toward the viewer
await boot();
const rim = await page.evaluate(() => {
  const s = window.__sandbox, r = s.region, [px, py] = s.spots.plateauTop;
  const H = (x, y) => r.height[Math.floor(y) * r.w + Math.floor(x)];
  // walk south-east (screen down) from the plateau top to its edge, then step back inside
  let t = 0;
  while (H(px + t, py + t) === 5 && t < 60) t += 0.5;
  const x = px + t - 4, y = py + t - 4;
  s.sim.spawn('you', 0, 'hoplite', 20, x, y);
  s.focus(x + 2, y + 2, 1);
  return { x, y, t };
});
await page.waitForFunction(() => window.__sandbox.drawn.length >= 20);
await wait(1500);
console.log(`plateau rim squad at (${rim.x.toFixed(1)}, ${rim.y.toFixed(1)}), edge ${rim.t} tiles from plateauTop`);
await shot('02-plateau-edge');

// 3. two own squads on the ridge's gentle side, an enemy below; box-select ours, right-click the crest
await boot();
const pts = await page.evaluate(() => {
  const s = window.__sandbox, { ridgeCrest: c, ridgeFoot: f } = s.spots;
  const at = (k) => [c[0] + (f[0] - c[0]) * k, c[1] + (f[1] - c[1]) * k];
  const a = at(0.3), b = at(0.4), e = at(0.75), t = at(0.08);
  s.sim.spawn('you', 0, 'hoplite', 20, a[0] - 4, a[1]);
  s.sim.spawn('you', 0, 'archer', 16, b[0] + 4, b[1]);
  s.sim.spawn('bot', 1, 'celt_sword', 20, e[0], e[1]);
  s.focus((a[0] + e[0]) / 2, (a[1] + e[1]) / 2, 1 / 2);
  return t;
});
await page.waitForFunction(() => window.__sandbox.drawn.length >= 56);
await page.evaluate(() => window.__sandbox.sim.speed(0));
await wait(300);
const bb = await page.evaluate(() => {
  const s = window.__sandbox, p = s.drawn.filter((d) => d.team === 0).map((d) => s.toScreen(d.x, d.y));
  const xs = p.map((q) => q.x), ys = p.map((q) => q.y);
  return { x0: Math.min(...xs) - 20, y0: Math.min(...ys) - 40, x1: Math.max(...xs) + 20, y1: Math.max(...ys) + 10 };
});
await page.mouse.move(bb.x0, bb.y0);
await page.mouse.down();
await page.mouse.move(bb.x1, bb.y1, { steps: 8 });
await page.mouse.up();
const sel = await page.evaluate(() => window.__sandbox.selected.size);
const tp = await page.evaluate(([x, y]) => window.__sandbox.toScreen(x, y), pts);
await page.mouse.click(tp.x, tp.y, { button: 'right' });
await wait(100);
const cmd = await page.evaluate(() => window.__sandbox.lastCommand);
const ok = sel === 2 && cmd && Math.hypot(cmd.x - pts[0], cmd.y - pts[1]) < 0.5;
console.log(`selection: ${sel} squads; right-click at tile (${pts[0].toFixed(2)}, ${pts[1].toFixed(2)}) -> ordered (${cmd?.x.toFixed(2)}, ${cmd?.y.toFixed(2)}) ${ok ? 'OK' : 'MISS'}`);
if (!ok) problems.push('iso selection / order picking missed');
await page.evaluate(() => window.__sandbox.sim.speed(1));
await wait(1500);
await shot('03-ridge-selection');

// 4. 600 units fighting through the ford: mid zoom (sprites), dot zoom, overview (banners)
await boot();
await page.click('#brawl');
await page.waitForFunction(() => window.__sandbox.sim.stats.units >= 600);
await page.evaluate(() => {
  const s = window.__sandbox, q = s.sim.cur.squads;
  const mine = q.filter((x) => x.team === 0), foes = q.filter((x) => x.team === 1);
  mine.forEach((x, i) => s.sim.order({ kind: 'attack', squad: x.id, target: foes[i % foes.length].id }));
  s.focus(s.spots.ford[0], s.spots.ford[1], 1 / 2);
});
await wait(6000);
await fps('brawl 600, sprites');
await shot('04-brawl-600-mid');
await page.evaluate(() => window.__sandbox.focus(window.__sandbox.spots.ford[0], window.__sandbox.spots.ford[1], 1 / 6));
await fps('brawl 600, dots', 6);
await shot('05-brawl-600-dots');
await page.waitForFunction(() => window.__sandbox.overviewReady, null, { timeout: 60000 });
await page.evaluate(() => {
  const s = window.__sandbox, cam = s.cameras.main;
  cam.setZoom(1 / 24).centerOn(s.iso.W / 2, s.iso.H / 2);
});
await fps('brawl 600, overview');
await shot('06-overview-banners');

// height overlay at the overview
await page.check('[data-ov=height]');
await page.waitForFunction(() => window.__sandbox.overviewReady, null, { timeout: 60000 });
await wait(300);
await shot('07-overlay-height');
}

// scenarios: opening, the player's plan, mid fight, end score
const PLANS = {
  'pass-ambush': 'stand', // hold the pass where placed
  'ford-crossing': 'attack',
  'hill-assault': 'attack',
  'bridge-vs-ford': 'ford', // block the ford, then hunt the rest
  'brawl-600': 'attack',
  free: null,
};
const attackAll = () => page.evaluate(() => {
  const s = window.__sandbox, q = [...s.sim.squads.values()], alive = new Set(s.drawn.filter((d) => d.u.state !== 'dead').map((d) => d.u.squad));
  const foes = q.filter((x) => x.team !== 0 && alive.has(x.id));
  q.filter((x) => x.team === 0).forEach((x, i) => foes.length && s.sim.order({ kind: 'attack', squad: x.id, target: foes[i % foes.length].id }));
});
const score = () => page.evaluate(() => document.getElementById('score').textContent);
for (const [id, plan] of Object.entries(PLANS)) {
  await boot(`&scenario=${id}`);
  if (plan) await page.waitForFunction(() => window.__sandbox.sim.squads.size > 0);
  await wait(2500);
  await shot(`s-${id}-1-open`);
  if (!plan) continue;
  await page.evaluate(() => window.__sandbox.sim.speed(4));
  if (plan === 'attack') await attackAll();
  if (plan === 'ford') {
    await page.evaluate(() => {
      const s = window.__sandbox, [x, y] = s.spots.fordW;
      [...s.sim.squads.values()].filter((q) => q.team === 0).forEach((q, i) => s.sim.order({ kind: 'move', squad: q.id, x: x - 4 - Math.floor(i / 3) * 6, y: y + ((i % 3) - 1) * 6 }));
    });
  }
  // mid fight: the first moment a tenth of the units are down, framed on the melee
  await page.waitForFunction(() => {
    const d = window.__sandbox.drawn;
    return d.length && d.filter((x) => x.u.state === 'dead').length >= d.length / 10;
  }, null, { timeout: 240000, polling: 500 }).catch(() => console.log(id, 'no casualties yet'));
  await page.evaluate(() => {
    const s = window.__sandbox, f = s.drawn.filter((x) => x.u.state === 'attack');
    const c = f.length ? f : s.drawn;
    s.focus(c.reduce((a, x) => a + x.x, 0) / c.length, c.reduce((a, x) => a + x.y, 0) / c.length, 1 / 2);
  });
  await wait(1500);
  await shot(`s-${id}-2-mid`);
  // play on to the end (bots that won their fight stand; then the player hunts the rest)
  for (let i = 0; i < 60 && !/won|all down/.test(await score()); i++) {
    await wait(4000);
    if (plan !== 'stand' && i % 3 === 2) await attackAll();
  }
  console.log(`${id}:\n${await score()}`);
  await shot(`s-${id}-3-end`);
}

await browser.close();
if (problems.length) {
  console.log(problems.join('\n'));
  process.exit(1);
}
