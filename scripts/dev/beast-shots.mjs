// Screenshots of the mythical beasts (docs/screenshots/46-50).
// Usage: node scripts/beast-shots.mjs [baseUrl] [outDir] [only]   (needs a running dev server)
// Stages Beast trial battles with a sensible army (both sides bot-driven), runs
// them until the signature move is on screen, pauses and saves the frame; then
// the world boss raid panel and a beast lair on the war-table map.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'docs/screenshots';
const only = process.argv[4];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => (window.__noFirstRun = true)); // no onboarding here (scripts/tutorial-smoke.mjs covers it)
const page = await ctx.newPage();
const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(`[console.error] ${m.text()}`));
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
const wait = (ms) => page.waitForTimeout(ms);
const until = async (fn, arg, ms = 30000) => {
  for (let t = 0; t < ms; t += 100) {
    if (await page.evaluate(fn, arg)) return true;
    await wait(100);
  }
  return false;
};

await page.goto(base + '?lang=en');
await page.evaluate(() => localStorage.clear());
await page.goto(base + '?lang=en');
await until(() => !!window.__game?.scene.isActive('Menu'));
await wait(800);

/** A beast trial battle with the sensible army; `moment` (page fn of the scene) says when to stop. */
async function beastBattle(enc, file, moment, opts = {}) {
  await page.evaluate(async ([enc, seed]) => {
    const bb = await import('/src/dev/beastBalance.ts');
    const D = await import('/src/data/beasts.ts');
    const st = window.__state;
    st.campaign = st.campaign.constructor.fresh(20261007);
    Object.assign(st.campaign.data.settings, { seenGestureHint: true, pauseContact: false, pauseFlank: false, pauseRout: false, pauseDeath: false, dmgNumbers: false });
    const level = D.lairLevel(enc, 3);
    st.campaign.data.heroes = bb.compHeroes(bb.BEAST_COMPS[enc].good, level - 1, seed).map((h) => ({ ...h, id: `p_${h.id}` }));
    window.__game.scene.getScenes(true).forEach((s) => s.scene.start('BeastTrial'));
  }, [enc, 77]);
  await until(() => window.__game.scene.isActive('BeastTrial'));
  await wait(300);
  await page.evaluate(async ([enc, seed0]) => {
    let seed = seed0;
    // a fixed seed and an open plain, so the shot is the same every time
    const G = await import('/src/game/beasts.ts');
    const BF = await import('/src/world/battlefield.ts');
    const T = await import('/src/data/terrain.ts');
    const t = window.__game.scene.getScene('BeastTrial');
    const st = window.__state;
    // the field with the fewest trees and stones in the middle, so nothing hides the fight
    const site0 = { base: enc === 'kraken' ? 'beach' : 'plain', river: false, coast: enc === 'kraken', rocky: false, woods: 0 };
    const clutter = (sd) => {
      const g = BF.generateBattlefield(sd, site0);
      let n = 0;
      for (let y = 6; y < 30; y++) for (let x = 2; x < 22; x++) {
        const c = g.cells[y * g.w + x];
        if (c === T.TERRAIN.forest.code || c === T.TERRAIN.rocks.code) n++;
      }
      return n;
    };
    for (let k = 1, best = Infinity; k < 40; k++) {
      const c = clutter(k * 7919);
      if (c < best) {
        best = c;
        seed = k * 7919;
      }
    }
    const enemy = G.beastEnemy(enc, t.level(enc), seed, st.campaign.data);
    st.pending = { enemy, seed, label: enc, site: site0 };
    t.scene.start('Battle');
  }, [enc, opts.seed ?? 4]);
  await until(() => window.__game.scene.isActive('Battle') && !!window.__game.scene.getScene('Battle').sim);
  await wait(500);
  await page.evaluate(async (speed) => {
    const { BotAI } = await import('/src/sim/ai.ts');
    const s = window.__game.scene.getScene('Battle');
    const bot = new BotAI(0, 99);
    bot.deploy(s.sim);
    s.sim.bots.push(bot);
    s.startFight();
    s.hideBanner();
    s.speed = speed;
  }, opts.speed ?? 2);
  const ok = await until(moment, null, opts.ms ?? 60000);
  await page.evaluate((zoom) => {
    const s = window.__game.scene.getScene('Battle');
    s.setPaused(true);
    s.hideBanner();
    s.follow = false;
    const ids = s.sim.units.filter((u) => u.side === 1 && u.state !== 'dead' && u.stats.boss);
    const u = ids[0] ?? s.sim.units.find((x) => x.side === 1);
    // frame the beast and the men it fights (or the boulder's target)
    const f = s.sim.myth?.flights.find((x) => !x.done);
    const mine = s.sim.units.filter((x) => x.side === 0 && x.state === 'ready');
    let tx = mine.reduce((a, x) => a + x.x, 0) / Math.max(1, mine.length);
    let ty = mine.reduce((a, x) => a + x.y, 0) / Math.max(1, mine.length);
    if (f) [tx, ty] = [f.tx, f.ty];
    const p = s.project(mine.length || f ? (u.x * 0.55 + tx * 0.45) : u.x, mine.length || f ? (u.y * 0.55 + ty * 0.45) : u.y);
    s.cameras.main.setZoom(zoom);
    s.centerCam(p.x, p.y - 10);
  }, opts.zoom ?? 2);
  await wait(400);
  await page.screenshot({ path: `${out}/${file}` });
  console.log('saved', `${out}/${file}`, ok ? '' : '(moment not reached)');
}

const myth = (s) => s.sim.myth;
if (!only || only === 'hydra')
  await beastBattle('hydra', '46-hydra.png', () => {
    const s = window.__game.scene.getScene('Battle');
    const m = s.sim.myth;
    const heads = s.sim.units.filter((u) => u.stats.boss === 'hydra_head');
    return s.sim.tick > 20 * 18 && heads.some((h) => h.state === 'dead') && heads.filter((h) => h.engaged).length >= 2 && !!m;
  });
if (!only || only === 'cyclops')
  await beastBattle('cyclops', '47-cyclops.png', () => {
    const s = window.__game.scene.getScene('Battle');
    const f = s.sim.myth?.flights.find((x) => !x.done && s.sim.tick - x.t0 > x.dur * 0.4);
    return !!f && s.sim.tick > 20 * 9;
  }, { speed: 1, zoom: 1.5 });
if (!only || only === 'harpies')
  await beastBattle('harpies', '48-harpies.png', () => {
    const s = window.__game.scene.getScene('Battle');
    const hs = s.sim.units.filter((u) => u.stats.boss === 'harpy' && u.state === 'ready');
    return hs.some((u) => s.sim.myth.get(u).mode === 1 && s.sim.myth.get(u).alt > 0.3) && hs.some((u) => s.sim.myth.get(u).mode === 2);
  }, { speed: 1 });
if (!only || only === 'kraken')
  await beastBattle('kraken', '49-world-boss.png', () => {
    const s = window.__game.scene.getScene('Battle');
    const arms = s.sim.units.filter((u) => u.stats.boss === 'kraken_arm');
    return s.sim.tick > 20 * 8 && arms.filter((u) => u.engaged).length >= 2;
  }, { speed: 1, zoom: 1.5 });

/** The war-table map with beast lairs (and the world boss's HP bar), the lair panel open. */
async function lairMap(file, preview) {
  await page.evaluate((pv) => window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Online', { preview: pv })), preview);
  await until(() => !!window.__game.scene.getScene('Online').detail, 15000);
  await wait(600);
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('Online');
    const h = s.selected;
    const p = s.board.top(h);
    const cam = s.cameras.main;
    cam.setZoom(Math.min(3, cam.zoom * 1.6));
    cam.centerOn(p.x, p.y + 30);
  });
  await wait(700);
  await page.screenshot({ path: `${out}/${file}` });
  console.log('saved', `${out}/${file}`);
}
if (!only || only === 'map') await lairMap('50-beast-lair-map.png', 'lair');
void myth;
console.log(problems.length ? problems.join('\n') : 'no console errors');
await browser.close();
