// P4 gate bench: hub open, Settings sheet open and battle FPS at 390x844 (DPR 2),
// with Chrome DevTools CPU throttling as a phone proxy.
// Usage: node docs/v5/spike/p4/bench.mjs <baseUrl> [--rate 4] [--gpu] [--runs 3]
//   --gpu  Metal ANGLE (a real GPU, like a phone) instead of SwiftShader (software GL)
// Prints one JSON line: medians and all samples.
import { launch, phoneContext, makePageApi, until } from '../../../../scripts/lib/harness.mjs';

const args = process.argv.slice(2);
const base = args.find((a) => /^https?:/.test(a)) ?? 'http://localhost:5173/';
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const rate = Number(opt('rate', '1'));
const runs = Number(opt('runs', '3'));
const gpu = args.includes('--gpu');
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

const browser = await launch(gpu ? { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } : {});
const out = { base, rate, gpu, hubMs: [], sheetMs: [], sheetWarmMs: [], battleFps: [], errors: [] };

for (let r = 0; r < runs; r++) {
  const ctx = await phoneContext(browser);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => out.errors.push(e.message));
  await page.route('**/api/**', (q) => q.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"not_configured","message":"down"}}' }));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const api = makePageApi(page);

  // hub: navigation to the Menu being active and two frames drawn
  const t0 = Date.now();
  await page.goto(base);
  await until(() => page.evaluate(() => !!window.__game && window.__game.scene.isActive('Menu')).catch(() => false), 60000, 50);
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  out.hubMs.push(Date.now() - t0);
  await api.wait(1500);

  // sheet: openSettings until the sheet's close button stops moving (the slide-in tween ended);
  // cold = first open in the session, warm = second open (shaders and framebuffers exist)
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

  // battle: a fresh skirmish, advance, frames over 6 s
  await page.evaluate(() => {
    window.__state.pending = null;
    window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', { fresh: true }));
  });
  await until(() => page.evaluate(() => window.__game.scene.isActive('Battle')), 30000, 150);
  await api.wait(1000);
  await api.call('Battle', `s.startFight(); for (const g of s.sim.groups) if (g.side === 0) s.sim.issue(0, { kind: 'order', group: g.id, order: 'advance' }); s.paused = false; return 1;`);
  await api.wait(1500);
  out.battleFps.push(
    await page.evaluate(
      () =>
        new Promise((done) => {
          let f = 0;
          const t = performance.now();
          const tick = () => {
            f++;
            if (performance.now() - t < 6000) requestAnimationFrame(tick);
            else done(+(f / ((performance.now() - t) / 1000)).toFixed(1));
          };
          requestAnimationFrame(tick);
        }),
    ),
  );
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify({ ...out, med: { hubMs: median(out.hubMs), sheetMs: median(out.sheetMs), sheetWarmMs: median(out.sheetWarmMs), battleFps: median(out.battleFps) } }));
