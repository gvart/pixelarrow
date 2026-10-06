// Drives the game through every screen in a portrait mobile viewport and saves screenshots.
// Usage: node scripts/screenshots.mjs [baseUrl] [outDir]
// Requires a running dev/preview server. Uses the preinstalled Chromium (PLAYWRIGHT_BROWSERS_PATH).
// Some shots stage the campaign through the debug handles (more heroes, perks,
// a band placed next to the party) so every feature is visible; real play is untouched.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`[console.error] ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('saved', `${out}/${name}.png`);
};
const scene = (key, data) => page.evaluate(([k, d]) => window.__game.scene.getScenes(true).forEach((s) => s.scene.start(k, d)), [key, data ?? {}]);
const call = (key, fn) => page.evaluate(([k, f]) => {
  const s = window.__game.scene.getScene(k);
  return new Function('s', f)(s);
}, [key, fn]);
const active = (k) => page.evaluate((key) => window.__game.scene.isActive(key), k);

// Procedural sprite sheets (/preview.html, served by the dev server and the build)
try {
  await page.setViewportSize({ width: 1260, height: 1300 });
  await page.goto(base + 'preview.html?s=3');
  await wait(1200);
  if ((await page.locator('canvas').count()) > 0) {
    await page.screenshot({ path: `${out}/00-sprite-sheets.png`, fullPage: true });
    console.log('saved', `${out}/00-sprite-sheets.png`);
  }
} catch {
  /* not available on a production preview */
}
await page.setViewportSize({ width: 390, height: 844 });

// fresh campaign on a fixed seed for reproducible shots
await page.goto(base);
await page.evaluate(() => localStorage.clear());
await page.goto(base);
await wait(2000);
await page.evaluate(async () => {
  const st = window.__state;
  st.campaign = st.campaign.constructor.fresh(20261006);
  st.hasSave = true;
  await st.save();
});
await scene('World');
await wait(2500);

// A grown army for the battle shots: recruits, levels, perks (staging).
await page.evaluate(() => {
  const c = window.__state.campaign;
  c.data.gold = 2000;
  while (c.data.heroes.length < 9) c.recruit();
  const perks = [
    ['shield_drill', 'shield_bash', 'phalangite', 'steady_presence'],
    ['brawler', 'berserk', 'bloodlust', 'rally_cry'],
    ['shield_drill', 'shield_bash'],
    ['brawler', 'berserk'],
  ];
  c.data.heroes.forEach((h, i) => {
    h.group = i < 7 ? 0 : 1;
    if (i < 4) {
      h.level = 8;
      h.perks = perks[i];
    } else h.level = 2;
  });
  c.data.heroes[4].wound = 20;
  c.data.gold = 240;
});

// World map with a band in sight
await page.evaluate(() => {
  const s = window.__game.scene.getScene('World');
  const w = s.w;
  s.info = window.__state.campaign.playerInfo();
  w.s.safeUntil = w.s.time + 1000;
  const t = w.nearestPassable(Math.floor(w.s.x) + 5, Math.floor(w.s.y) - 4, 4);
  const p = w.s.parties[0];
  p.x = t.x + 0.5;
  p.y = t.y + 0.5;
  p.idle = 5;
  const goal = w.nearestPassable(Math.floor(w.s.x) - 6, Math.floor(w.s.y) - 9, 5);
  w.setDestination(goal.x, goal.y);
  s.buildHud();
});
await wait(1200);
await call('World', `s.w.stop(); s.refreshHud(); return 1;`);
await wait(300);
await page.evaluate(() => {
  const s = window.__game.scene.getScene('World');
  const w = s.w;
  const goal = w.nearestPassable(Math.floor(w.s.x) - 7, Math.floor(w.s.y) - 10, 5);
  w.setDestination(goal.x, goal.y);
});
await wait(200);
await call('World', `s.dialog = {}; s.renderWorld(16); s.dialog = null; return 1;`);
await shot('13-world-map');

// Main menu (Continue now offered) and settings
await scene('Menu');
await wait(800);
await shot('01-menu');
await call('Menu', `s.openSettings(); return 1;`);
await wait(300);
await shot('11-settings');
await scene('World');
await wait(1500);

// Encounter: a strong band bars the way
await page.evaluate(() => {
  const s = window.__game.scene.getScene('World');
  const w = s.w;
  w.stop();
  w.s.safeUntil = 0;
  const p = w.s.parties[0];
  const t = w.nearestPassable(Math.floor(w.s.x) + 2, Math.floor(w.s.y), 3);
  p.x = t.x + 0.5;
  p.y = t.y + 0.5;
  p.idle = 0;
  p.size = 11;
  p.kind = 'raiders';
  p.name = 'Galatae raiders';
  p.culture = 'celtic';
  p.power = s.info.power * 1.05;
  s.setWaiting(true);
});
for (let i = 0; i < 40 && !(await call('World', `return !!s.dialog;`)); i++) await wait(250);
await shot('14-encounter');
await call('World', `s.attack(s.w.s.parties[0].id); return 1;`);
await wait(1800);

// Deployment
await shot('04-deploy');
await call('Battle', `s.openGroups(); return 1;`);
await wait(400);
await shot('05-deploy-groups');
await call('Battle', `s.overlay.destroy(); s.overlay = null; s.groupArea && s.groupArea.destroy(); s.buildHud(); return 1;`);

// Fight: advance, skirmishers loose; run until contact (auto-pause) or a few seconds
await call('Battle', `s.startFight(); s.selGroup = 0; s.command({kind:'order', group:-1, order:'advance'}); s.selGroup = 1; s.command({kind:'loose', group:-1, on:true}); s.selGroup = 0; s.buildHud(); s.speed = 2; return 1;`);
for (let i = 0; i < 24; i++) {
  await wait(500);
  if (await call('Battle', `return s.paused;`)) break;
}
await shot('06-battle-contact');

// Abilities and auras: fury, bashes and a rally cry in the melee
await call('Battle', `s.setPaused(false); s.hideBanner(); s.speed = 1; s.command({kind:'order', group:-1, order:'charge'}); return 1;`);
for (let i = 0; i < 10; i++) {
  await wait(400);
  if (await call('Battle', `return s.paused;`)) await call('Battle', `s.setPaused(false); s.hideBanner(); return 1;`);
  const n = await call('Battle', `return s.sim.units.filter(u => u.side === 0 && u.engaged).length;`);
  if (n >= 3) break;
}
await call('Battle', `s.selGroup = 0; s.selUnit = -1; s.buildHud(); s.useAbility('berserk'); s.useAbility('bash'); return 1;`);
await wait(350);
await call('Battle', `s.useAbility('rally'); return 1;`);
await wait(250);
await call('Battle', `s.setPaused(true); const u = s.sim.units.find(u => u.side === 0 && u.berserk > 0) || s.sim.units.find(u => u.side === 0 && u.state === 'ready'); s.setFollow(false); s.cameras.main.setZoom(3); const p = s.project(u.x, u.y); s.centerCam(p.x, p.y - 14); return 1;`);
await wait(200);
await shot('18-battle-abilities');
await call('Battle', `s.setPaused(false); s.hideBanner(); return 1;`);
for (let i = 0; i < 6; i++) {
  await wait(500);
  if (await call('Battle', `return s.paused;`)) await call('Battle', `s.setPaused(false); s.hideBanner(); return 1;`);
}
await call('Battle', `s.setPaused(true); s.cameras.main.setZoom(4); const u = s.sim.units.find(u=>u.side===0 && u.state==='ready' && u.engaged) || s.sim.units.find(u=>u.side===0 && u.state==='ready'); if (u) { const p = s.project(u.x, u.y); s.centerCam(p.x, p.y - 12); } return 1;`);
await wait(300);
await shot('07-battle-melee-zoom');
await call('Battle', `s.cameras.main.setZoom(2); s.setPaused(false); return 1;`);

// Retreat confirmation (then stay and fight on)
await call('Battle', `s.frameArmies(); s.openRetreat(); return 1;`);
await wait(300);
await shot('12-retreat-confirm');
await call('Battle', `s.overlay.list.find((o) => o.opts && o.opts.label === 'Stay').opts.onClick(); return 1;`);

// Fast-forward to the end. For a representative victory screen the enemy is
// weakened first and the heroes are close to a level (staging only).
await call('Battle', `window.__state.campaign.data.heroes.forEach((h, i) => { if (i >= 4) h.xp = 60; }); s.sim.units.filter(u => u.side === 1 && u.state === 'ready').forEach(u => { u.hp = Math.min(u.hp, 4); u.morale = Math.min(u.morale, u.stats.morale * 0.4); }); s.paused = false; for (let i = 0; i < 20*400 && s.sim.phase === 'battle'; i++) s.sim.step(); return 1;`);
for (let i = 0; i < 20 && !(await active('Results')); i++) await wait(250);
await wait(900);
await shot('19-level-up');
await wait(2000);
await shot('08-results');
await call('Results', `const o = window.__state.last.outcome; const ids = o.loot.slice(0, o.picks).map(i => i.uid); ids.slice(0, -1).forEach(id => s.chosen.add(id)); if (ids.length) s.toggle(ids[ids.length - 1]); return 1;`);
await wait(300);
await shot('09-results-picked');
await call('Results', `s.finish(); return 1;`);
await wait(1500);

// Army: roster, stash with a comparison, after loot
await scene('Army', { from: 'World' });
await wait(800);
await shot('02-army-roster');
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Army');
  const st = window.__state;
  s.selItem = st.campaign.data.stash[0];
  s.tab = 'stash';
  s.refresh();
});
await wait(400);
await shot('03-army-stash-compare');
await call('Army', `s.selItem = null; s.setTab('stash'); return 1;`);
await wait(300);
await shot('10-army-after-loot');

// Hero skills: points to spend, perks taken and one selected
await page.evaluate(() => {
  const h = window.__state.campaign.data.heroes[0];
  h.points = Math.max(h.points, 3);
  window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Hero', { heroId: h.id, back: { from: 'World' } }));
});
await wait(800);
await call('Hero', `s.addPoint('str'); s.addPoint('wil'); s.selectPerk('steady_presence'); return 1;`);
await wait(300);
await shot('17-hero-perks');

// Village and town (market)
await page.evaluate(() => {
  const w = window.__state.campaign.world;
  const v = w.map.settlements.filter((x) => x.kind === 'village').sort((a, b) => Math.hypot(a.x - w.s.x, a.y - w.s.y) - Math.hypot(b.x - w.s.x, b.y - w.s.y))[0];
  window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Settlement', { id: v.id }));
});
await wait(1000);
await shot('15-village');
await page.evaluate(() => {
  const w = window.__state.campaign.world;
  window.__state.campaign.data.gold = 260;
  window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Settlement', { id: w.map.start, tab: 'market' }));
});
await wait(1000);
await shot('16-town-market');

console.log(problems.length ? problems.join('\n') : 'no console errors');
await browser.close();
