// The battle camera's framing check (design/ux/landscape-v6.md §7.3, §16.6; V6-RSCR-02):
// in a live fight with Follow on, a marching group's centre must stay inside the camera's
// framing rect (the field the HUD's rails and bars leave) for 10 s, never under a rail.
// Also checks the opening fit (both armies inside the framing rect at deployment) and that
// the recentre (a card double tap) lands the group at the framing rect's centre.
//
// Usage: node scripts/dev/battle-follow.mjs [baseUrl] [--sizes 844x390,1280x800] [--out dir]
// Needs a running dev or preview server. Exit code 1 on a failure.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, prepContext, shotsDir } from '../lib/harness.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const base = args.find((a) => /^https?:/.test(a)) ?? 'http://localhost:5173/';
const sizes = opt('sizes', '844x390,1280x800').split(',').map((s) => s.split('x').map(Number));
const out = shotsDir('battle-follow', opt('out', ''));

/** In the page: the selected group's centre and the framing rect, both in UI px. */
function probe() {
  const s = window.__game.scene.getScene('Battle');
  const cam = s.cameras.main;
  const S = s.m.S;
  const mem = s.sim.activeMembers(s.selGroup);
  if (!mem.length) return null;
  let x = 0;
  let y = 0;
  for (const u of mem) {
    const p = s.project(u.x, u.y);
    x += p.x;
    y += p.y;
  }
  x /= mem.length;
  y /= mem.length;
  const vp = s.fieldViewport();
  return {
    c: { x: ((x - cam.worldView.x) * cam.zoom) / S, y: ((y - cam.worldView.y) * cam.zoom) / S },
    f: { x: vp.left / S, y: vp.top / S, w: (vp.right - vp.left) / S, h: (vp.bottom - vp.top) / S },
    mode: s.hm,
  };
}

const inside = (p, f) => p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h;
let failed = 0;
const report = [];
const browser = await launch();
for (const [W, H] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => (window.__noFirstRun = true));
  await prepContext(ctx);
  const page = await ctx.newPage();
  await page.goto(`${base}${base.includes('?') ? '&' : '?'}lang=en`);
  await page.waitForFunction(() => window.__game?.scene.isActive('Menu'), null, { timeout: 20000 });
  await page.evaluate(() => {
    const st = window.__state;
    st.campaign.data.settings.seenGestureHint = true;
    st.campaign.data.settings.seenHints = ['*'];
    st.pending = null;
    window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', { fresh: true }));
  });
  await page.waitForFunction(() => window.__game.scene.isActive('Battle'), null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const size = `${W}x${H}`;
  // the opening fit: both armies' men inside the framing rect
  const open = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Battle');
    const cam = s.cameras.main;
    const S = s.m.S;
    const vp = s.fieldViewport();
    const f = { x: vp.left / S, y: vp.top / S, w: (vp.right - vp.left) / S, h: (vp.bottom - vp.top) / S };
    const outside = s.sim.units.filter((u) => {
      const p = s.project(u.x, u.y);
      const x = ((p.x - cam.worldView.x) * cam.zoom) / S;
      const y = ((p.y - cam.worldView.y) * cam.zoom) / S;
      return !(x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h);
    }).length;
    return { outside, zoom: cam.zoom, f, mode: s.hm };
  });
  await page.screenshot({ path: join(out, `${size}-open.png`) });
  // the fight: group I advances, Follow on, 10 s of real time
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('Battle');
    s.startFight();
    s.selGroup = s.sim.groups.find((g) => g.side === s.me && !g.individual && s.sim.activeMembers(g.id).length > 0).id;
    s.command({ kind: 'order', group: -1, order: 'advance' });
    s.setPaused(false);
    s.hideBanner();
    s.setFollow(true);
    s.buildHud();
  });
  const samples = [];
  const t0 = await page.evaluate(() => window.__game.scene.getScene('Battle').sim.tick);
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250);
    // an auto-pause (first contact) or a lost focus would stop the march: the check keeps the fight running
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('Battle');
      if (s.paused && s.sim.phase === 'battle') {
        s.setPaused(false);
        s.hideBanner();
        s.setFollow(true);
      }
    });
    const p = await page.evaluate(probe);
    if (p) samples.push(p);
  }
  const ticks = (await page.evaluate(() => window.__game.scene.getScene('Battle').sim.tick)) - t0;
  await page.screenshot({ path: join(out, `${size}-follow.png`) });
  const misses = samples.filter((p) => !inside(p.c, p.f));
  // the recentre: a card double tap glides the group to the framing rect's centre
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('Battle');
    s.setPaused(true);
    s.setFollow(false);
    s.cameras.main.scrollX += 400;
    s.recentre('group');
  });
  await page.waitForTimeout(600);
  const rc = await page.evaluate(probe);
  const dx = rc ? Math.abs(rc.c.x - (rc.f.x + rc.f.w / 2)) : 999;
  const dy = rc ? Math.abs(rc.c.y - (rc.f.y + rc.f.h / 2)) : 999;
  // the march moved the group across the field (sim seconds) and the camera with it
  const moved = samples.length > 1 ? Math.round(Math.hypot(samples.at(-1).c.x - samples[0].c.x, samples.at(-1).c.y - samples[0].c.y)) : 0;
  const ok = open.outside === 0 && samples.length >= 30 && misses.length === 0 && inside(rc.c, rc.f) && ticks >= 20 * 6;
  if (!ok) failed++;
  const line = { size, mode: open.mode, framing: open.f, openingOutside: open.outside, openingZoom: open.zoom, samples: samples.length, simSeconds: ticks / 20, outsideFraming: misses.length, onScreenDrift: moved, recentreOff: { dx: Math.round(dx), dy: Math.round(dy) }, ok };
  report.push(line);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${size} (${open.mode}): opening fit ${open.outside} men outside; ${ticks / 20} sim s of march, follow ${samples.length - misses.length}/${samples.length} samples inside the framing rect; recentre ${Math.round(dx)},${Math.round(dy)} UI px from its centre`);
  await ctx.close();
}
await browser.close();
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
process.exit(failed ? 1 : 0);
