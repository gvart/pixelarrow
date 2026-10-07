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
await call('World', `window.__state.campaign.data.settings.seenGestureHint = true; s.attack(s.w.s.parties[0].id); return 1;`); // no controls hint in the shots
await wait(1800);

// Deployment
await shot('04-deploy');
await call('Battle', `s.openGroups(); return 1;`);
await wait(400);
await shot('05-deploy-groups');
await call('Battle', `s.closeGroups(true); return 1;`);

// Fight: advance, skirmishers loose; run until contact (auto-pause) or a few seconds
await call('Battle', `s.startFight(); s.selGroup = 0; s.command({kind:'order', group:-1, order:'advance'}); s.selGroup = 1; s.command({kind:'loose', group:-1, on:true}); s.selGroup = 0; s.buildHud(); s.speed = 2; return 1;`);
for (let i = 0; i < 24; i++) {
  await wait(500);
  if (await call('Battle', `return s.paused;`)) break;
}
await shot('06-battle-contact');
// the command panel: group cards, colour-coded categories, abilities (a rally cry recovering: its sweep)
await call('Battle', `s.selGroup = 0; s.selUnit = -1; s.cat = 'abilities'; s.useAbility('rally'); for (let i = 0; i < 20 * 4 && s.sim.phase === 'battle'; i++) { s.sim.step(); s.handleEvents(s.sim.drainEvents()); } s.setPaused(true); s.hideBanner(); s.buildHud(); return 1;`);
await wait(300);
await shot('30-battle-panel');

// Abilities and auras: fury, bashes and a rally cry in the melee
await call('Battle', `s.setPaused(false); s.hideBanner(); s.speed = 1; s.command({kind:'order', group:-1, order:'charge'}); return 1;`);
for (let i = 0; i < 10; i++) {
  await wait(400);
  if (await call('Battle', `return s.paused;`)) await call('Battle', `s.setPaused(false); s.hideBanner(); return 1;`);
  const n = await call('Battle', `return s.sim.units.filter(u => u.side === 0 && u.engaged).length;`);
  if (n >= 3) break;
}
await call('Battle', `s.selGroup = 0; s.selUnit = -1; s.cat = 'abilities'; s.buildHud(); s.useAbility('berserk'); s.useAbility('bash'); return 1;`);
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
await wait(2200);
await shot('32-battle-report');
await call('Results', `s.showPage('heroes'); return 1;`);
await wait(1600);
await shot('19-level-up');
await call('Results', `s.showPage('spoils'); return 1;`);
await wait(900);
await shot('08-results');
await wait(3000);
await call('Results', `const r = s.report; r.loot.slice(0, r.picks).forEach((it) => s.toggle(it.uid)); return 1;`);
await wait(300);
await shot('09-results-picked');
await call('Results', `s.finish(); return 1;`);
await wait(1500);

// Online deployment: 15 s countdown, the enemy's zone (not its men), Ready (a duel whose opponent is ready)
await page.evaluate(() => (window.__state.pending = null));
await scene('Battle', { fresh: true });
for (let i = 0; i < 20 && !(await active('Battle')); i++) await wait(250);
await wait(800);
await call('Battle', `const source = { setup: s.verifySetup, heroes: s.views.map((v) => v.hero), side: 0, label: 'vs Hektor', opponent: 'Hektor', onFinish() {}, onLeave() {}, lockstep: { attach() {}, issue() {}, ready() {}, canStep: () => false, beforeStep() {}, status: () => null, aborted: () => null, opponentReady: () => true } }; s.scene.restart({ source }); return 1;`);
await wait(4200);
await shot('31-online-deploy-countdown');

// Army: roster, the stash grid, a stash item compared with what the hero carries
await page.evaluate(() => (window.__state.campaign.data.settings.seenHints = ['*'])); // no first-visit hints over the shots
await scene('Army', { from: 'World' });
await wait(900);
await shot('02-army-roster');
await scene('Army', { from: 'World', tab: 'stash' });
await wait(800);
await call('Army', `s.openStashItem(window.__state.campaign.data.stash[0]); return 1;`);
await wait(500);
await shot('03-army-stash-compare');
await scene('Army', { from: 'World', tab: 'stash' });
await wait(900);
await shot('10-army-after-loot');

// Hero: the character sheet (points pending, previewed), the perk tree, the stash grid and the compare popup
await page.evaluate(() => {
  const c = window.__state.campaign.data;
  const h = c.heroes[0];
  h.points = Math.max(h.points, 3);
  h.level = Math.max(h.level, 4);
  h.xp = 90;
  h.kills = Math.max(h.kills, 7);
  h.battles = Math.max(h.battles, 3);
  if (!h.perks.length) h.perks.push('shield_drill');
  // a varied stash to show rarities
  const defs = [['falcata', 'legendary'], ['aspis', 'epic'], ['corinthian', 'rare'], ['scale', 'uncommon'], ['laurel', 'epic'], ['cretan_bow', 'rare'], ['chalcidian', 'legendary'], ['mail', 'epic'], ['owl_amulet', 'uncommon'], ['kopis', 'common']];
  defs.forEach(([def, rarity], i) => c.stash.push({ uid: `shot${i}`, def, rarity, cond: 100 - ((i * 23) % 50) }));
  window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Hero', { heroId: h.id, back: { from: 'World' }, tab: 'stats' }));
});
await wait(900);
await call('Hero', `s.addPoint('str'); s.addPoint('end'); return 1;`);
await wait(300);
await shot('33-hero-sheet');
await call('Hero', `s.tabs.select(2); return 1;`);
await wait(400);
await shot('17-hero-perks');
await call('Hero', `s.tabs.select(1); return 1;`);
await wait(500);
await shot('34-stash-grid');
await call('Hero', `s.openStashItem(window.__state.campaign.data.stash.find((i) => i.uid === 'shot1')); return 1;`);
await wait(500);
await shot('35-item-compare');

// Economy screens (the in-memory demo economy, as in the layout check)
await scene('Shop', { demo: true, tab: 'shop' });
await wait(1000);
await shot('36-shop');
await scene('Shop', { demo: true, tab: 'pass' });
await wait(1000);
await shot('37-season-pass');
await scene('Market', { demo: true, tab: 'browse' });
await wait(1000);
await shot('38-marketplace');

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

// Battle terrain: a river ford in wooded hills, with the long-press terrain tooltip
await page.evaluate(() => {
  const st = window.__state;
  st.pending = null;
  window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', { fresh: true }));
});
await wait(800);
await page.evaluate(() => {
  const st = window.__state;
  st.pending = { ...st.pending, seed: 11, site: { base: 'hills', river: true, coast: true, rocky: true, woods: 0.4 } };
  window.__game.scene.getScene('Battle').scene.restart({});
});
await wait(2500);
await call('Battle', `s.hideBanner(); s.cameras.main.setZoom(1); s.centerCam(s.project(12, 18).x, s.project(12, 18).y); const u = s.sim.units.find((x) => x.side === 0); const p = s.project(u.x - 1, u.y + 1); const cam = s.cameras.main; const sx = (p.x - cam.worldView.x) * cam.zoom, sy = (p.y - cam.worldView.y) * cam.zoom; s.showTerrainInfo(p.x, p.y, sx, sy); return 1;`);
await wait(300);
await shot('21-battle-terrain');

// Unit classes: a town's recruits, each with its class icon, name and role
await page.evaluate(() => {
  const w = window.__state.campaign.world;
  window.__state.campaign.data.gold = 900;
  const towns = w.map.settlements.filter((x) => x.kind === 'town');
  // the town with the most varied pool
  let best = towns[0];
  let bn = 0;
  for (const t of towns) {
    const n = new Set(w.recruits(t.id, []).map((r) => r.hero.cls)).size;
    if (n > bn) {
      bn = n;
      best = t;
    }
  }
  window.__game.scene.getScenes(true).forEach((sc) => sc.scene.start('Settlement', { id: best.id, tab: 'recruits' }));
});
await wait(1200);
await shot('26-classes');

// Staged battles: cavalry on the flank, then beasts (debug handles; real play is untouched)
async function stagedBattle(mode) {
  // leave any battle first (its end-of-battle timer must not fire into the new one)
  await scene('World');
  await wait(800);
  await page.evaluate(async (mode) => {
    const st = window.__state;
    const c = st.campaign;
    const mod = await import('/src/game/heroes.ts');
    const enemyMod = await import('/src/game/enemy.ts');
    const { Rng } = await import('/src/sim/rng.ts');
    const rng = new Rng(mode === 'cav' ? 5 : 9);
    const mk = (cls, n, group, culture = 'greek') => Array.from({ length: n }, () => mod.makeHero(rng, c.data, culture, cls, 4, 2, group, c.data.heroes));
    c.data.heroes = [];
    const add = (hs) => hs.forEach((h) => c.data.heroes.push(h));
    if (mode === 'cav') {
      add(mk('hoplite', 8, 0));
      add(mk('archer', 3, 1));
      add(mk('companion', 4, 3));
    } else {
      add(mk('militia', 6, 0));
      add(mk('hoplite', 4, 0));
      add(mk('slinger', 3, 1));
    }
    const ids = { nextId: 5000 };
    let foes = [];
    const e = (cls, n, group, culture) => { for (let i = 0; i < n; i++) foes.push(mod.makeHero(rng, ids, culture, cls, 4, 2, group, foes)); };
    if (mode === 'cav') {
      e('celt_sword', 7, 0, 'celtic');
      e('javelineer', 3, 1, 'celtic');
      e('gallic', 3, 2, 'celtic');
    } else foes = [...enemyMod.beastPack(rng, ids, 'wolf', 7, 3), ...enemyMod.beastPack(rng, ids, 'boar', 2, 3), ...enemyMod.beastPack(rng, ids, 'bear', 1, 3)];
    st.pending = { enemy: { culture: 'celtic', heroes: foes, power: 1, targetPower: 1 }, seed: mode === 'cav' ? 31 : 41, label: mode === 'cav' ? 'Galatae' : 'Wolves of the oak wood', site: { base: mode === 'cav' ? 'plain' : 'scrub', river: false, coast: false, rocky: false, woods: mode === 'cav' ? 0.1 : 0.25 } };
    window.__game.scene.getScenes(true).forEach((sc) => sc.scene.start('Battle', {}));
  }, mode);
  await wait(2500);
}
await stagedBattle('cav');
// the player's line advances, the Companions wait, then ride round the flank and charge (bot tactics for the riders)
await call('Battle', `s.hideBanner(); s.startFight(); s.sim.issue(0, { kind: 'order', group: 0, order: 'advance' }); return 1;`);
const cavShot = await call('Battle', `
  const sim = s.sim;
  const cav = sim.units.filter((u) => u.side === 0 && u.stats.mount);
  let impact = -1;
  for (let i = 0; i < 20 * 90 && sim.phase === 'battle'; i++) {
    // the riders follow the bot's cavalry tactics: wide round the flank, then the charge
    if (i === 60) for (const g of sim.groups) if (g.side === 0 && g.role === 'flank') { const f = g.formation; sim.issue(0, { kind: 'form', group: g.id, cx: 21, cy: 14, fx: -0.2, fy: -1, frontage: 4 }); }
    if (i === 260) for (const g of sim.groups) if (g.side === 0 && g.role === 'flank') { const e = sim.units.filter((u) => u.side === 1 && u.state === 'ready'); const t = e.reduce((a, u) => (u.x > a.x ? u : a), e[0]); sim.issue(0, { kind: 'form', group: g.id, cx: g.formation.cx, cy: g.formation.cy, fx: t.x - g.formation.cx, fy: t.y - g.formation.cy, frontage: 4 }); sim.issue(0, { kind: 'order', group: g.id, order: 'charge' }); }
    sim.step();
    for (const ev of sim.drainEvents()) { s.handleEvents([ev]); if (ev.type === 'impact' && cav.some((u) => u.id === ev.by) && impact < 0) impact = i; }
    if (impact >= 0 && i > impact + 6) break;
  }
  s.setPaused(true); s.hideBanner(); s.setFollow(false);
  for (let k = 0; k < 20; k++) s.fx.update(100); // let the floating ability icons run out
  s.cameras.main.setZoom(2);
  const c = cav.filter((u) => u.state !== 'dead');
  const u = c[0] || cav[0];
  const p = s.project(u.x, u.y); s.centerCam(p.x - 10, p.y - 20);
  return impact;`);
console.log('cavalry impact at step', cavShot);
await wait(500);
await shot('27-cavalry-charge');

await stagedBattle('animals');
await call('Battle', `s.hideBanner(); s.startFight(); for (const g of s.sim.groups) if (g.side === 0 && !g.individual && g.role === 'main') s.sim.issue(0, { kind: 'order', group: g.id, order: 'advance' }); for (let i = 0; i < 20 * 22 && s.sim.phase === 'battle'; i++) { s.sim.step(); s.handleEvents(s.sim.drainEvents()); } s.setPaused(true); s.hideBanner(); s.setFollow(false); s.cameras.main.setZoom(2); const f = s.focusPoint(); s.centerCam(f.x, f.y); return 1;`);
await wait(500);
await shot('28-animals');

console.log(problems.length ? problems.join('\n') : 'no console errors');
await browser.close();
