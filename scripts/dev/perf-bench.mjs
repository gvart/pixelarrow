// QA-05 perf bench (docs/v5/qa/PERF.md). The P4 protocol (docs/v5/spike/p4/bench.mjs: hub open,
// first and second Settings sheet open, a fresh skirmish advancing) plus frame-time percentiles,
// long frames, boot timings and the JS heap after 10 battles (leak check).
// Usage: node scripts/dev/perf-bench.mjs <baseUrl> [--rate 4] [--gpu] [--runs 3] [--battles 10]
//   --gpu      Metal ANGLE (a real GPU) instead of SwiftShader; with --rate, the phone proxy
//   --battles  battles fought in the leak run (0 skips it)
// The battle is unpaused every frame while measured (offline fights pause on contact, RD-02).
//   --men      recruit the campaign up to this many men first (the field takes up to 12 a side)
// Prints one JSON line: per-run samples and medians.
import { launch, phoneContext, makePageApi, until } from '../lib/harness.mjs';

const args = process.argv.slice(2);
const base = args.find((a) => /^https?:/.test(a)) ?? 'http://localhost:4173/';
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const rate = Number(opt('rate', '1'));
const runs = Number(opt('runs', '3'));
const battles = Number(opt('battles', '10'));
const men = Number(opt('men', '0'));
const gpu = args.includes('--gpu');
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);

const browser = await launch(gpu ? { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } : {});
const out = { base, rate, gpu, menAsked: men, bootMs: [], hubMs: [], sheetMs: [], sheetWarmMs: [], battleFps: [], p50Fps: [], p5Fps: [], longFrames: [], men: [], heapMB: [], errors: [] };

async function newPage() {
  const ctx = await phoneContext(browser);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => out.errors.push(e.message));
  await page.route('**/api/**', (q) => q.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"not_configured","message":"down"}}' }));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  return { ctx, page, cdp, api: makePageApi(page) };
}

async function openMenu(page) {
  const t0 = Date.now();
  await page.goto(base);
  // boot: the Boot scene running (first frames of the app)
  await until(() => page.evaluate(() => !!window.__game && window.__game.scene.isActive('Boot')).catch(() => false), 60000, 20);
  const boot = Date.now() - t0;
  await until(() => page.evaluate(() => !!window.__game && window.__game.scene.isActive('Menu')).catch(() => false), 60000, 50);
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  return { boot, hub: Date.now() - t0 };
}

const startBattle = async (page, api) => {
  await page.evaluate((n) => {
    const c = window.__state.campaign;
    if (n) {
      c.data.gold = 1e6;
      while (c.data.heroes.length < n && c.recruit()) {}
    }
    window.__state.pending = null;
    window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', { fresh: true }));
  }, men);
  await until(() => page.evaluate(() => window.__game.scene.isActive('Battle')), 30000, 150);
  await api.wait(1000);
  return api.call('Battle', `s.startFight(); for (const g of s.sim.groups) if (g.side === 0) s.sim.issue(0, { kind: 'order', group: g.id, order: 'advance' }); s.paused = false; return s.sim.units.filter((u) => u.side === 0).length + '+' + s.sim.units.filter((u) => u.side !== 0).length;`);
};

for (let r = 0; r < runs; r++) {
  const { ctx, page, api } = await newPage();
  const t = await openMenu(page);
  out.bootMs.push(t.boot);
  out.hubMs.push(t.hub);
  await api.wait(1500);

  // sheet: openSettings until the close button stops moving (as P4's bench)
  const openSheet = () =>
    page.evaluate(
      () =>
        new Promise((done) => {
          const s = window.__game.scene.getScene('Menu');
          const find = () => {
            let y;
            const walk = (l) => l.forEach((o) => { if (o.__uiId === 'sheet.close') y = o.getBounds().y; if (o.list) walk(o.list); });
            walk(s.children.list);
            return y;
          };
          const t = performance.now();
          s.openSettings();
          let last = null;
          let still = 0;
          const tick = () => {
            const y = find();
            if (y !== undefined && last !== null && Math.abs(y - last) < 0.5 && y < s.scale.height / 2) still++;
            else still = 0;
            last = y ?? null;
            if (still >= 2) return done(Math.round(performance.now() - t));
            if (performance.now() - t > 10000) return done(-1);
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
  out.sheetMs.push(await openSheet());
  await api.start('Menu');
  await api.wait(1500);
  out.sheetWarmMs.push(await openSheet());

  out.men.push(await startBattle(page, api));
  await api.wait(1500);
  await api.call('Battle', 'if (s.paused) s.setPaused ? s.setPaused(false) : (s.paused = false); return 1;');
  const f = await page.evaluate(
    () =>
      new Promise((done) => {
        const dts = [];
        const t = performance.now();
        let last = t;
        // the fight runs on: offline battles pause themselves on events (RD-02 autoPause)
        const b = window.__game.scene.getScene('Battle');
        const tick = (now) => {
          if (b.paused) b.setPaused ? b.setPaused(false) : (b.paused = false);
          dts.push(now - last);
          last = now;
          if (now - t < 6000) requestAnimationFrame(tick);
          else done({ dts: dts.slice(1), total: now - t });
        };
        requestAnimationFrame(tick);
      }),
  );
  const s = [...f.dts].sort((a, b) => a - b);
  const pct = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  out.battleFps.push(+((f.dts.length + 1) / (f.total / 1000)).toFixed(1));
  out.p50Fps.push(+(1000 / pct(50)).toFixed(1));
  out.p5Fps.push(+(1000 / pct(95)).toFixed(1));
  out.longFrames.push(f.dts.filter((d) => d > 50).length);
  await ctx.close();
}

// leak run: battles fought one after another (start, 3 s of fighting, back to the menu); the heap
// after a forced GC once the first battle is over and after the last one
if (battles > 0) {
  const { ctx, page, api, cdp } = await newPage();
  await openMenu(page);
  await cdp.send('HeapProfiler.enable');
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const h = await cdp.send('Runtime.getHeapUsage');
    return +(h.usedSize / 1048576).toFixed(1);
  };
  const samples = [];
  for (let b = 0; b < battles; b++) {
    await startBattle(page, api);
    await api.wait(3000);
    await api.start('Menu');
    await until(() => page.evaluate(() => window.__game.scene.isActive('Menu')), 30000, 150);
    await api.wait(800);
    if (b === 0 || b === battles - 1) samples.push(await heap());
  }
  out.heapMB = samples;
  await ctx.close();
}
await browser.close();
console.log(
  JSON.stringify({
    ...out,
    med: {
      bootMs: median(out.bootMs),
      hubMs: median(out.hubMs),
      sheetMs: median(out.sheetMs),
      sheetWarmMs: median(out.sheetWarmMs),
      battleFps: median(out.battleFps),
      p50Fps: median(out.p50Fps),
      p5Fps: median(out.p5Fps),
      longFrames: median(out.longFrames),
      men: median(out.men),
    },
  }),
);
