// End-to-end smoke test with real touch events (CDP) in a portrait phone viewport.
// Covers the campaign loop: new campaign -> march on the map -> encounter ->
// battle -> back to the map -> recruit in a village -> spend a stat point and
// take perks -> use an ability in battle; plus formation drag and pinch zoom.
// Usage: node scripts/smoke.mjs [baseUrl]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
const cdp = await ctx.newCDPSession(page);
const wait = (ms) => page.waitForTimeout(ms);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
async function tap(x, y) {
  await touch('touchStart', [[x, y]]);
  await wait(60);
  await touch('touchEnd', []);
  await wait(250);
}
async function drag(x0, y0, x1, y1, steps = 10) {
  await touch('touchStart', [[x0, y0]]);
  for (let i = 1; i <= steps; i++) {
    await touch('touchMove', [[x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps]]);
    await wait(16);
  }
  await touch('touchEnd', []);
  await wait(250);
}
const ev = (fn, arg) => page.evaluate(fn, arg);
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
  if (!ok) failures++;
};
const active = (key) => ev((k) => window.__game.scene.isActive(k), key);
async function until(fn, ms = 15000, step = 250) {
  for (let t = 0; t < ms; t += step) {
    if (await fn()) return true;
    await wait(step);
  }
  return false;
}

/** Screen centre of the first Button in a scene matching a label or icon (searches containers). */
async function btn(sceneKey, match) {
  return ev(([k, m]) => {
    const s = window.__game.scene.getScene(k);
    const found = [];
    const walk = (list) => {
      for (const o of list) {
        if (o.opts && o.visible && ((m.label && o.opts.label && o.opts.label.toUpperCase().startsWith(m.label.toUpperCase())) || (m.icon && o.opts.icon === m.icon))) found.push(o);
        if (o.list) walk(o.list);
      }
    };
    walk(s.children.list);
    const b = found[m.index ?? found.length - 1];
    if (!b) return null;
    const r = b.getBounds();
    return [r.centerX, r.centerY];
  }, [sceneKey, match]);
}
async function tapBtn(sceneKey, match) {
  const p = await btn(sceneKey, match);
  if (!p) {
    console.log(`  (no button ${JSON.stringify(match)} in ${sceneKey})`);
    return false;
  }
  await tap(p[0], p[1]);
  return true;
}

await page.goto(base);
await ev(() => localStorage.clear());
await page.goto(base);
await wait(2500);
check('menu active', await active('Menu'));

// ---- new campaign
await tapBtn('Menu', { label: 'New campaign' });
check('world map via New campaign', await until(() => active('World'), 8000));
const start = await ev(() => {
  const c = window.__state.campaign;
  return { heroes: c.data.heroes.length, gold: c.data.gold, x: c.world.s.x, y: c.world.s.y, t: c.world.s.time };
});
check('new campaign: three heroes, little gold', start.heroes === 3 && start.gold <= 80, JSON.stringify(start));

// ---- march: tap a passable spot a few tiles away
const target = await ev(() => {
  const s = window.__game.scene.getScene('World');
  const w = s.w;
  w.s.safeUntil = w.s.time + 1000; // no ambush during this leg
  for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4], [3, 3], [-3, 3], [3, -3], [-3, -3]]) {
    const t = w.nearestPassable(Math.floor(w.s.x) + dx, Math.floor(w.s.y) + dy, 1);
    if (!t) continue;
    const cam = s.cameras.main;
    return [((t.x + 0.5) * 8 - cam.worldView.x) * cam.zoom, ((t.y + 0.5) * 8 - cam.worldView.y) * cam.zoom];
  }
  return null;
});
await tap(target[0], target[1]);
check('tap on the map plans a route', await ev(() => window.__state.campaign.world.route.length > 0));
await wait(2000);
const moved = await ev(() => window.__state.campaign.world.s);
check('party marched and time passed', Math.hypot(moved.x - start.x, moved.y - start.y) > 0.5 && moved.time > start.t, `${start.x.toFixed(1)},${start.y.toFixed(1)} -> ${moved.x.toFixed(1)},${moved.y.toFixed(1)}`);

// ---- encounter: a band steps out next to us; camping lets time run until it attacks
async function ambush() {
  await ev(() => {
    const s = window.__game.scene.getScene('World');
    const w = s.w;
    w.stop();
    w.s.safeUntil = 0;
    const p = w.s.parties[0];
    const t = w.nearestPassable(Math.floor(w.s.x) + 2, Math.floor(w.s.y), 3);
    p.x = t.x + 0.5;
    p.y = t.y + 0.5;
    p.idle = 0;
    p.power = s.info.power * 1.4; // strong enough to hunt us
  });
  await tapBtn('World', { label: 'Camp' });
  return until(() => ev(() => !!window.__game.scene.getScene('World').dialog), 10000);
}
check('band attacks: encounter dialog', await ambush());
const bandId = await ev(() => window.__state.campaign.world.s.parties[0].id);
await tapBtn('World', { label: 'Attack' });
check('Attack opens the deployment', await until(() => active('Battle'), 5000));
check('battle against the band', await ev(() => window.__state.pending && window.__state.pending.partyId) === bandId);

// formation drag in deployment (field coords projected through the battle camera)
const pt = await ev(() => {
  const s = window.__game.scene.getScene('Battle');
  const cam = s.cameras.main;
  const g = s.sim.groups[0];
  const toScreen = (x, y) => { const p = s.project(x, y); return [(p.x - cam.worldView.x) * cam.zoom, (p.y - cam.worldView.y) * cam.zoom]; };
  return { a: toScreen(g.formation.cx - 1.5, 27), b: toScreen(g.formation.cx + 1.5, 27), zoom: cam.zoom };
});
check('readable default zoom', pt.zoom >= 2, `zoom ${pt.zoom}`);
await drag(pt.a[0], pt.a[1], pt.b[0], pt.b[1]);
const after = await ev(() => ({ ...window.__game.scene.getScene('Battle').sim.groups[0].formation }));
check('formation drag moved group', Math.abs(after.cy - 27) < 1.2 && after.fy < -0.9, JSON.stringify([after.cx.toFixed(2), after.cy.toFixed(2), after.frontage]));

// pinch to zoom in
const z0 = await ev(() => window.__game.scene.getScene('Battle').cameras.main.zoom);
await touch('touchStart', [[150, 300], [240, 300]]);
for (let i = 1; i <= 8; i++) {
  await touch('touchMove', [[150 - i * 12, 300], [240 + i * 12, 300]]);
  await wait(16);
}
await touch('touchEnd', []);
await wait(400);
const z1 = await ev(() => window.__game.scene.getScene('Battle').cameras.main.zoom);
check('pinch zoom', z1 > z0, `${z0} -> ${z1}`);

await tapBtn('Battle', { label: 'Fight' });
check('battle started', (await ev(() => window.__game.scene.getScene('Battle').sim.phase)) === 'battle');
// fast-forward: the band is worn out (test staging), the sim runs to the end
await ev(() => {
  const s = window.__game.scene.getScene('Battle');
  s.sim.units.filter((u) => u.side === 1).forEach((u) => { u.hp = 1; u.morale = Math.min(u.morale, u.stats.morale * 0.3); });
  for (let i = 0; i < 20 * 300 && s.sim.phase === 'battle'; i++) s.sim.step();
});
check('results screen', await until(() => active('Results'), 8000));
await wait(1500);
await tapBtn('Results', { icon: 'check' });
check('back on the map after the battle', await until(() => active('World'), 5000));
check('defeated band is gone', await ev((id) => !window.__state.campaign.world.party(id), bandId));

// ---- village: stand next to one, tap it, march in, hire a volunteer
const village = await ev(() => {
  const s = window.__game.scene.getScene('World');
  const w = s.w;
  w.stop();
  w.s.safeUntil = w.s.time + 1000;
  window.__state.campaign.data.gold = 200;
  const v = w.map.settlements.find((x) => x.kind === 'village');
  const t = w.nearestPassable(v.x + 2, v.y, 3);
  w.s.x = t.x + 0.5;
  w.s.y = t.y + 0.5;
  const cam = s.cameras.main;
  cam.centerOn(v.x * 8, v.y * 8);
  s.follow = false;
  return { id: v.id };
});
await wait(200);
const vpos = await ev((id) => {
  const s = window.__game.scene.getScene('World');
  const v = s.w.map.settlements[id];
  const cam = s.cameras.main;
  return [((v.x * 8 + 4) - cam.worldView.x) * cam.zoom, (v.y * 8 - cam.worldView.y) * cam.zoom];
}, village.id);
await tap(vpos[0], vpos[1]);
check('entered the village', await until(() => active('Settlement'), 12000));
const before = await ev(() => ({ n: window.__state.campaign.data.heroes.length, gold: window.__state.campaign.data.gold }));
await tapBtn('Settlement', { icon: 'coin', index: 0 });
const hired = await ev(() => ({ n: window.__state.campaign.data.heroes.length, gold: window.__state.campaign.data.gold }));
check('recruited a volunteer', hired.n === before.n + 1 && hired.gold < before.gold, JSON.stringify([before, hired]));

// ---- hero skills: a veteran reaches level 4; raise STR and take two perks
await ev(() => {
  const h = window.__state.campaign.data.heroes[0];
  h.level = 4;
  h.points += 4;
});
await tapBtn('Settlement', { label: 'Party' });
check('army screen', await until(() => active('Army'), 3000));
await tapBtn('Army', { label: 'Skills' });
check('hero screen', await until(() => active('Hero'), 3000));
const hero0 = await ev(() => { const h = window.__state.campaign.data.heroes[0]; return { str: h.attrs.str, id: h.id }; });
await tapBtn('Hero', { label: '+', index: 0 });
await tapBtn('Hero', { label: 'Confirm' });
async function takePerk(id) {
  const icon = id === 'shield_bash' ? 'bash' : 'star';
  await tapBtn('Hero', { icon, index: 0 });
  await tapBtn('Hero', { label: 'Take perk' });
}
await takePerk('shield_drill');
await takePerk('shield_bash');
const hero1 = await ev(() => { const h = window.__state.campaign.data.heroes[0]; return { str: h.attrs.str, perks: h.perks }; });
check('spent a stat point', hero1.str === hero0.str + 1, `${hero0.str} -> ${hero1.str}`);
check('took perks Shield Drill and Shield Bash', hero1.perks.includes('shield_drill') && hero1.perks.includes('shield_bash'), JSON.stringify(hero1.perks));

// ---- use the ability in battle
await ev(() => window.__game.scene.getScene('Hero').back());
await wait(400);
await tapBtn('Army', { label: 'Town' });
await wait(400);
await tapBtn('Settlement', { label: 'Leave' });
check('left the village', await until(() => active('World'), 3000));
check('second encounter', await ambush());
await tapBtn('World', { label: 'Attack' });
await until(() => active('Battle'), 5000);
await tapBtn('Battle', { label: 'Fight' });
// run until the shield-basher has a man in front of him, then pause and select him
const ready = await ev((hid) => {
  const s = window.__game.scene.getScene('Battle');
  const u = s.sim.units.find((x) => x.heroId === hid);
  s.sim.units.filter((x) => x.side === 0).forEach((x) => { x.hp = x.stats.maxHp * 5; });
  for (const g of s.sim.groups) if (g.side === 0) s.sim.issue(0, { kind: 'order', group: g.id, order: 'charge' });
  for (let i = 0; i < 20 * 90 && s.sim.phase === 'battle'; i++) {
    s.sim.step();
    if (s.sim.abilityReady(u, 'bash')) break;
  }
  s.handleEvents(s.sim.drainEvents());
  s.setPaused(true);
  s.selGroup = u.group;
  s.selUnit = u.id;
  s.buildHud();
  return s.sim.abilityReady(u, 'bash');
}, hero0.id);
check('shield basher in contact', ready);
await wait(300);
await tapBtn('Battle', { icon: 'bash' });
const used = await ev(() => window.__game.scene.getScene('Battle').sim.orderLog.filter((o) => o.side === 0 && o.order.kind === 'ability').map((o) => o.order.ability));
check('ability used from the battle bar', used.includes('bash'), JSON.stringify(used));
await tap(16 * 2, 12 * 2); // unpause
await wait(1500);
check('no console errors', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(failures ? 1 : 0);
