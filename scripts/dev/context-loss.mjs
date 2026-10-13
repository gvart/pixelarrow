// QA-05: does the game survive a real WebGL context loss? (docs/v5/qa/PERF.md)
// Loses and restores the context (WEBGL_lose_context) on the hub and mid-battle, then checks that
// no page error was thrown, the game loop kept running, the battle went on, and the canvas still
// draws the screen (a screenshot before and after: the share of matching pixels).
// Usage: node scripts/dev/context-loss.mjs <baseUrl> [outDir]   exit 1 on a failed check
import { launch, phoneContext, makePageApi, until, captureErrors, shotsDir } from '../lib/harness.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:4173/';
const out = shotsDir('context-loss', process.argv[3]);
const browser = await launch();
const ctx = await phoneContext(browser);
const page = await ctx.newPage();
const errors = captureErrors(page, { prefix: true, ignoreNetwork: true });
await page.route('**/api/**', (q) => q.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"not_configured","message":"down"}}' }));
const api = makePageApi(page);
let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' ' + detail : ''}`);
  if (!ok) failed++;
};

/** Lose the context, wait, restore it, wait for the restore event and a few frames. */
const loseAndRestore = () =>
  page.evaluate(
    () =>
      new Promise((done) => {
        const g = window.__game;
        const gl = g.renderer.gl;
        const ext = gl.getExtension('WEBGL_lose_context');
        if (!ext) return done({ ok: false, why: 'no WEBGL_lose_context' });
        const canvas = g.canvas;
        const t = { lost: false, restored: false };
        canvas.addEventListener('webglcontextlost', () => (t.lost = true), { once: true });
        canvas.addEventListener('webglcontextrestored', () => (t.restored = true), { once: true });
        const f0 = g.loop.frame;
        ext.loseContext();
        setTimeout(() => {
          const lostFrames = g.loop.frame - f0;
          ext.restoreContext();
          const t1 = performance.now();
          const wait = () => {
            if (t.restored && performance.now() - t1 > 1500) return done({ ok: true, ...t, loopRanWhileLost: lostFrames > 0, contextLost: g.renderer.contextLost });
            if (performance.now() - t1 > 10000) return done({ ok: false, why: 'no restore event', ...t });
            requestAnimationFrame(wait);
          };
          wait();
        }, 1000);
      }),
  );

/** Share of equal pixels between two PNG screenshots (same size), by sampling raw bytes after decode in the page. */
async function similarity(a, b) {
  return page.evaluate(
    async ([a, b]) => {
      const load = (b64) =>
        new Promise((ok) => {
          const i = new Image();
          i.onload = () => ok(i);
          i.src = 'data:image/png;base64,' + b64;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const px = (img) => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        return x.getImageData(0, 0, c.width, c.height).data;
      };
      const pa = px(ia);
      const pb = px(ib);
      let same = 0;
      for (let i = 0; i < pa.length; i += 4) if (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) < 24) same++;
      return same / (pa.length / 4);
    },
    [a, b],
  );
}

await page.goto(base);
check('hub up', await until(() => page.evaluate(() => !!window.__game && window.__game.scene.isActive('Menu')).catch(() => false), 60000, 100));
await api.wait(2000);
const hubBefore = join(out, 'hub-before.png');
await page.screenshot({ path: hubBefore });
const r1 = await loseAndRestore();
check('hub: context lost and restored', r1.ok && r1.lost && r1.restored && !r1.contextLost, JSON.stringify(r1));
await api.wait(500);
const hubAfter = join(out, 'hub-after.png');
await page.screenshot({ path: hubAfter });
const s1 = await similarity(readFileSync(hubBefore).toString('base64'), readFileSync(hubAfter).toString('base64'));
check('hub draws the same screen after the restore', s1 > 0.97, `${(s1 * 100).toFixed(1)}% pixels equal`);
check('no page errors on the hub', errors.length === 0, errors.slice(0, 3).join(' | '));

// a sheet opened after the restore (new textures, masks)
await api.call('Menu', 's.openSettings(); return 1;');
await api.wait(1500);
await page.screenshot({ path: join(out, 'hub-sheet-after.png') });
await api.start('Menu');
await api.wait(1000);

// battle: a fresh skirmish, advancing; lose the context mid-fight
await page.evaluate(() => {
  window.__state.pending = null;
  window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', { fresh: true }));
});
await until(() => page.evaluate(() => window.__game.scene.isActive('Battle')), 30000, 150);
await api.wait(1000);
await api.call('Battle', `s.startFight(); for (const g of s.sim.groups) if (g.side === 0) s.sim.issue(0, { kind: 'order', group: g.id, order: 'advance' }); s.paused = false; return 1;`);
// offline fights pause themselves on events (RD-02): keep this one running through the loss
await page.evaluate(() => {
  const b = window.__game.scene.getScene('Battle');
  const run = () => {
    if (!b.sys.isActive()) return;
    if (b.paused && b.sim.phase === 'battle') b.setPaused(false);
    requestAnimationFrame(run);
  };
  run();
});
await api.wait(2500);
const tick0 = await api.call('Battle', 'return s.sim.tick;');
await page.screenshot({ path: join(out, 'battle-before.png') });
const r2 = await loseAndRestore();
check('battle: context lost and restored', r2.ok && r2.lost && r2.restored && !r2.contextLost, JSON.stringify(r2));
await api.wait(1500);
const tick1 = await api.call('Battle', 'return s.sim.tick;');
check('the battle went on through the loss', tick1 > tick0 + 20, `tick ${tick0} -> ${tick1}`);
await page.screenshot({ path: join(out, 'battle-after.png') });
// the battle's own textures after the restore: the ground, the men (a frame of a living sprite)
const drawn = await api.call('Battle', 'const t = s.textures.list; return Object.keys(t).filter((k) => k.startsWith("isoground_")).length;');
check('battle ground texture still registered', drawn === 1, `${drawn}`);
// lost while a screen is built (a phone backgrounded mid-transition): the world map and the army
// draw their textures with no context; the restore must upload them
const lostWhile = (key) =>
  page.evaluate(
    (key) =>
      new Promise((done) => {
        const g = window.__game;
        const ext = g.renderer.gl.getExtension('WEBGL_lose_context');
        let restored = false;
        g.canvas.addEventListener('webglcontextrestored', () => (restored = true), { once: true });
        ext.loseContext();
        setTimeout(() => {
          g.scene.getScenes(true).forEach((s) => s.scene.start(key, {}));
          setTimeout(() => {
            ext.restoreContext();
            const t = performance.now();
            const wait = () => (restored && performance.now() - t > 1500) || performance.now() - t > 10000 ? done({ restored, active: g.scene.isActive(key) }) : requestAnimationFrame(wait);
            wait();
          }, 1500);
        }, 300);
      }),
    key,
  );
for (const key of ['World', 'Army']) {
  const r = await lostWhile(key);
  check(`${key} built while the context was lost, then restored`, r.restored && r.active, JSON.stringify(r));
  await page.screenshot({ path: join(out, `${key.toLowerCase()}-built-while-lost.png`) });
  check(`no page errors after ${key}`, errors.length === 0, errors.slice(0, 3).join(' | '));
}

// leave and come back to the hub: new scenes after the restore
await api.start('Menu');
check('hub again after the battle', await until(() => page.evaluate(() => window.__game.scene.isActive('Menu')), 15000, 150));
await api.wait(1500);
await page.screenshot({ path: join(out, 'hub-end.png') });
check('no page errors through it all', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
console.log(failed ? `FAILED ${failed}` : 'ALL PASS', `(shots in ${out})`);
process.exit(failed ? 1 : 0);
