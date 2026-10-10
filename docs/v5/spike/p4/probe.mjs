// P4 spike probe: boot + render screenshots (hub, battle, ?scene=Kit) at 390x844
// and a rough battle FPS. Usage: node docs/v5/spike/p4/probe.mjs <baseUrl> <tag>
// Writes docs/v5/spike/p4/<tag>-{hub,battle,kit}.png and prints JSON metrics.
// PROBE_GPU=1 asks Chromium for the Metal ANGLE backend (macOS) instead of SwiftShader.
import { launch, phoneContext, captureErrors, makePageApi, until } from '../../../../scripts/lib/harness.mjs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] ?? 'http://localhost:5173/';
const tag = process.argv[3] ?? 'run';
const out = dirname(fileURLToPath(import.meta.url));
const gpu = process.env.PROBE_GPU === '1';
const browser = await launch(gpu ? { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } : {});
const ctx = await phoneContext(browser);
const page = await ctx.newPage();
const errors = captureErrors(page, { prefix: true, ignoreNetwork: true });
await page.route('**/api/**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"not_configured","message":"down"}}' }));
const api = makePageApi(page);
const m = { tag, renderer: null, bootMs: null, fps: null, errors };

const t0 = Date.now();
await page.goto(base);
const booted = await until(() => page.evaluate(() => !!window.__game && window.__game.scene.isActive('Menu')).catch(() => false), 30000, 100);
m.bootMs = booted ? Date.now() - t0 : null;
m.renderer = await page
  .evaluate(() => {
    const r = window.__game.renderer;
    const gl = r.gl;
    const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return { type: r.type === 2 ? 'WEBGL' : r.type === 1 ? 'CANVAS' : r.type, gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null, size: [window.__game.scale.width, window.__game.scale.height] };
  })
  .catch((e) => String(e));
await api.wait(1500);
await page.screenshot({ path: `${out}/${tag}-hub.png` });

// Battle: fresh skirmish, start the fight, advance, sample FPS for 6 s.
try {
  await page.evaluate(() => {
    window.__state.pending = null;
    window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', { fresh: true }));
  });
  await until(() => page.evaluate(() => window.__game.scene.isActive('Battle')), 15000, 150);
  await api.wait(800);
  await api.call('Battle', `s.startFight(); for (const g of s.sim.groups) if (g.side === 0) s.sim.issue(0, { kind: 'order', group: g.id, order: 'advance' }); s.paused = false; return 1;`);
  await api.wait(1500);
  m.fps = await page.evaluate(
    () =>
      new Promise((done) => {
        let frames = 0;
        const t = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - t < 6000) requestAnimationFrame(tick);
          else done({ rafFps: +(frames / ((performance.now() - t) / 1000)).toFixed(1), loopActualFps: +window.__game.loop.actualFps.toFixed(1) });
        };
        requestAnimationFrame(tick);
      }),
  );
} catch (e) {
  errors.push('[probe] battle: ' + e.message);
}
await page.screenshot({ path: `${out}/${tag}-battle.png` });

// Kit gallery
await page.goto(base + '?scene=Kit');
await until(() => page.evaluate(() => !!window.__game && window.__game.scene.isActive('Kit')).catch(() => false), 30000, 150);
await api.wait(1500);
await page.screenshot({ path: `${out}/${tag}-kit.png` });

await browser.close();
console.log(JSON.stringify(m, null, 2));
