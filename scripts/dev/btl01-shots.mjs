// BTL-01 screenshots: the battle HUD, the ⋯ menu, the works tray and the badge markers, en and ru at 390 and 320.
// Usage: node scripts/dev/btl01-shots.mjs [baseUrl] [outDir]   (needs a running dev server)
import { launch, captureErrors, apiDown, makePageApi } from '../lib/harness.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'shots/btl01';
mkdirSync(out, { recursive: true });
const only = process.argv[4];
const browser = await launch();
const problems = [];

async function session(lang, W, H) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => (window.__noFirstRun = true));
  const page = await ctx.newPage();
  captureErrors(page, { into: problems, ignoreNetwork: true, prefix: true });
  await apiDown(page);
  await page.route('**/telegram.org/**', (r) => r.abort());
  const api = makePageApi(page);
  await page.goto(`${base}?lang=${lang}`);
  await api.untilPage(() => !!window.__game && window.__game.scene.isActive('Menu'), 20000);
  await page.evaluate(async () => {
    const st = window.__state;
    st.campaign = st.campaign.constructor.fresh(20261006);
    st.hasSave = true;
    const c = st.campaign;
    c.data.settings.seenGestureHint = true;
    c.data.settings.seenHints = ['*'];
    c.data.gold = 2000;
    while (c.data.heroes.length < 9) c.recruit();
    c.data.heroes.forEach((h, i) => {
      h.group = i < 7 ? 0 : 1;
      h.level = i < 4 ? 6 : 2;
    });
    c.world.s.supplies = 40;
    c.world.setFlag('@works', 1);
  });
  return { ctx, page, api };
}

async function battle(api, page, online) {
  await page.evaluate(() => {
    window.__state.pending = null;
    window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', { fresh: true }));
  });
  await api.untilPage(() => window.__game.scene.isActive('Battle'), 15000);
  await page.waitForTimeout(700);
  if (online) {
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('Battle');
      const source = { setup: s.verifySetup, heroes: s.views.map((v) => v.hero), side: 0, label: 'vs Brigands', opponent: 'Hektor', onFinish() {}, onLeave() {} };
      s.scene.restart({ source });
    });
    await page.waitForTimeout(800);
  }
}

const shot = (page, name) => page.screenshot({ path: join(out, `${name}.jpg`), type: 'jpeg', quality: 70 });

const SHOTS = {
  // the live fight: the top bar (menu, clock, Pause, speed), the strength row, the order bar, cards
  hud: async ({ api, page }) => {
    await battle(api, page);
    await api.call('Battle', `s.startFight(); s.command({kind:'order', group:-1, order:'advance'}); for (let i = 0; i < 20 * 8 && s.sim.phase === 'battle'; i++) { s.sim.step(); s.handleEvents(s.sim.drainEvents()); } s.hideBanner(); s.setPaused(true); s.buildHud(); return 1;`);
    await page.waitForTimeout(600);
  },
  // the medallion rail capped at 3 (2 on a short field) with the More key: the horn and four abilities on group I
  rail: async ({ api, page }) => {
    await battle(api, page);
    await api.call(
      'Battle',
      `s.startFight(); for (let i = 0; i < 20 * 2; i++) { s.sim.step(); s.handleEvents(s.sim.drainEvents()); }
       const g = s.sim.groups.find((x) => x.side === s.me && !x.disbanded && s.sim.members(x.id).length > 0);
       const mem = s.sim.members(g.id);
       mem[0].abil = ['bash', 'volley']; mem[1].abil = ['berserk', 'rally'];
       s.selGroup = g.id; s.selUnit = -1; s.hideBanner(); s.setPaused(true); s.buildHud(); return 1;`,
    );
    await page.waitForTimeout(600);
  },
  menu: async ({ api, page }) => {
    await battle(api, page);
    await api.call('Battle', `s.startFight(); s.hideBanner(); s.openMenu(); return 1;`);
    await page.waitForTimeout(700);
  },
  works: async ({ api, page }) => {
    await battle(api, page);
    await api.call('Battle', `s.openWorks(true); s.pickWork('stakes'); s.placeWork(); s.hideBanner(); s.buildHud(); return 1;`);
    await page.waitForTimeout(600);
  },
  // badges: group I feinting (forced), group II with a queued Then… step
  badges: async ({ api, page }) => {
    await battle(api, page);
    await api.call(
      'Battle',
      `s.startFight(); s.command({kind:'order', group:-1, order:'advance'}); for (let i = 0; i < 20 * 3; i++) { s.sim.step(); s.handleEvents(s.sim.drainEvents()); }
       const mine = s.sim.groups.filter((g) => g.side === s.me && !g.disbanded && s.sim.members(g.id).length > 0);
       mine[0].order = 'feint';
       if (mine[1]) s.thenQ.arm(mine[1].id, 'charge', s.sim);
       s.hideBanner(); s.setPaused(true); s.cameras.main.setZoom(s.cameras.main.zoom * 1.6); s.recentre('group'); s.buildHud(); return 1;`,
    );
    await page.waitForTimeout(800);
  },
};

for (const lang of ['en', 'ru']) {
  for (const [W, H] of [
    [390, 844],
    [320, 568],
  ]) {
    const sess = await session(lang, W, H);
    for (const [name, run] of Object.entries(SHOTS)) {
      if (only && !only.split(',').includes(name)) continue;
      try {
        await run(sess);
        await shot(sess.page, `${W}-${lang}-${name}`);
      } catch (e) {
        problems.push(`${lang} ${W} ${name}: ${e.message}`);
      }
    }
    await sess.ctx.close();
  }
}
await browser.close();
if (problems.length) console.log(problems.join('\n'));
console.log('done');
