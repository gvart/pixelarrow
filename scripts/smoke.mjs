// End-to-end smoke test with real touch events (CDP) in a portrait phone viewport.
// Covers the campaign loop: new campaign -> march on the map -> encounter ->
// battle -> back to the map -> recruit in a village -> spend a stat point and
// take perks -> equip from the stash -> use an ability in battle; plus the touch controls (pan vs order, slingshot formation, tap to move) and pinch zoom.
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

// ---- touch controls in deployment (field coords projected through the battle camera)
check('one-time controls hint on the first deployment', await ev(() => !!window.__game.scene.getScene('Battle').hint));
await tap(195, 120);
check('hint dismissed and remembered', await ev(() => !window.__game.scene.getScene('Battle').hint && window.__state.campaign.data.settings.seenGestureHint));
await wait(300);
/** Screen points for field points, plus the selected group's state. */
const geo = (pts, frame = true) =>
  ev(([pts, frame]) => {
    const s = window.__game.scene.getScene('Battle');
    const cam = s.cameras.main;
    const toScreen = ([x, y]) => { const p = s.project(x, y); return [(p.x - cam.worldView.x) * cam.zoom, (p.y - cam.worldView.y) * cam.zoom]; };
    const g = s.sim.groups[s.selGroup];
    const f = g.formation;
    // frame: (a, b) = a paces to the group's right, b paces behind its front-rank centre
    const P = (a, b) => (frame ? [f.cx - f.fy * a - f.fx * b, f.cy + f.fx * a - f.fy * b] : [f.cx + a, f.cy + b]);
    return { sel: s.selGroup, f: { ...f }, zoom: cam.zoom, scroll: [cam.scrollX, cam.scrollY], z: s.sim.deployZone(0), pts: pts.map(([a, b]) => toScreen(P(a, b))) };
  }, [pts, frame]);
/** One finger along a polyline of screen points (touchStart .. touchEnd). */
async function swipe(points, steps = 8) {
  await touch('touchStart', [points[0]]);
  for (let k = 1; k < points.length; k++) {
    const [x0, y0] = points[k - 1];
    const [x1, y1] = points[k];
    for (let i = 1; i <= steps; i++) {
      await touch('touchMove', [[x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps]]);
      await wait(16);
    }
  }
  await touch('touchEnd', []);
  await wait(250);
}
const orders = () => ev(() => window.__game.scene.getScene('Battle').sim.orderLog.length);
// scripted touch events can stall under load; a stall must not read as the finger resting
await ev(() => { window.__game.scene.getScene('Battle').dwellMs = 5000; });
let G0 = await geo([]);
check('a group is selected in deployment', G0.sel >= 0);
// sprites are drawn at native size: a man is ~34 px tall at zoom 1
check('readable default zoom (a man is at least 30 px tall)', G0.zoom * 34 >= 30, `zoom ${G0.zoom}`);

// 1) one-finger drag on empty ground pans, even with a group selected
const emptyPt = await ev(() => {
  const s = window.__game.scene.getScene('Battle');
  const cam = s.cameras.main;
  const H = s.scale.height;
  const W = s.scale.width;
  const own = s.views.filter((v) => v.u.side === 0).map((v) => [(v.spr.x - cam.worldView.x) * cam.zoom, (v.spr.y - 10 - cam.worldView.y) * cam.zoom]);
  for (let y = H * 0.25; y < H * 0.6; y += 20)
    for (let x = 40; x < W - 40; x += 20) if (own.every(([a, b]) => Math.hypot(a - x, b - y) > 90) && s.input.hitTestPointer({ x, y, camera: null }).length === 0) return [x, y];
  return [W / 2, H * 0.3];
});
const o0 = await orders();
await swipe([emptyPt, [emptyPt[0] - 60, emptyPt[1] + 50]]);
let G1 = await geo([]);
check('drag on empty ground pans the camera with a group selected', Math.hypot(G1.scroll[0] - G0.scroll[0], G1.scroll[1] - G0.scroll[1]) > 20 && (await orders()) === o0, JSON.stringify([G0.scroll, G1.scroll]));
check('pan gave no order', G1.f.cx === G0.f.cx && G1.f.cy === G0.f.cy && G1.f.fx === G0.f.fx);

// 2) slingshot: press on the group, carry it 2 paces forward, pull back to the right: faces away (forward-left)
const cy0 = G1.f.cy;
let g = await geo([[0, 0], [0, -2], [1.5, -0.5]]);
await swipe(g.pts);
let F = (await geo([])).f;
check('slingshot: the group stands where it was carried', Math.abs(F.cx - G1.f.cx) < 0.4 && Math.abs(F.cy - (cy0 - 2)) < 0.4, JSON.stringify([F.cx.toFixed(2), F.cy.toFixed(2)]));
check('slingshot: soldiers face AWAY from the pull', F.fx < -0.6 && F.fy < -0.6, JSON.stringify([F.fx.toFixed(2), F.fy.toFixed(2)]));

// 3) grab and pull back (and a little right): re-aims in place, facing opposite to the pull
g = await geo([[0, 0], [0.6, 1.5]]);
await swipe(g.pts);
let F2 = (await geo([])).f;
// expected: -(0.6 right + 1.5 back) = 1.5 forward - 0.6 right
const ex = [1.5 * F.fx - 0.6 * -F.fy, 1.5 * F.fy - 0.6 * F.fx];
const el = Math.hypot(ex[0], ex[1]);
check('pull back from the group: aims in place, facing opposite to the pull', Math.abs(F2.cx - F.cx) < 0.3 && Math.abs(F2.cy - F.cy) < 0.3 && (F2.fx * ex[0] + F2.fy * ex[1]) / el > 0.97, JSON.stringify([F2.cx.toFixed(2), F2.cy.toFixed(2), F2.fx.toFixed(2), F2.fy.toFixed(2)]));

// 4) keep pulling further back: more ranks (a narrower, deeper block)
g = await geo([[0, 0], [0, 1.4], [0, 3.8]]);
const fr0 = g.f.frontage;
await swipe(g.pts);
let F3 = (await geo([])).f;
check('pulling further back adds ranks (facing kept)', F3.frontage < fr0 && F3.fx * F2.fx + F3.fy * F2.fy > 0.97, `${fr0} -> ${F3.frontage}`);
// ...and sideways widens the line again
g = await geo([[0, 0], [0, 1.4], [2.6, 1.4]]);
await swipe(g.pts);
let F4 = (await geo([])).f;
check('pushing sideways widens the line', F4.frontage > F3.frontage, `${F3.frontage} -> ${F4.frontage}`);

// 5) drag back onto the start point cancels
const o1 = await orders();
g = await geo([[0, 0], [0, -2.5], [0, 0]]);
await swipe(g.pts);
check('drag back onto the start point = no order', (await orders()) === o1);

// 6) a second finger cancels a half-done formation drag
g = await geo([[0, 0], [0, -2]]);
await touch('touchStart', [g.pts[0]]);
for (let i = 1; i <= 6; i++) {
  await touch('touchMove', [[g.pts[0][0] + ((g.pts[1][0] - g.pts[0][0]) * i) / 6, g.pts[0][1] + ((g.pts[1][1] - g.pts[0][1]) * i) / 6]]);
  await wait(16);
}
await touch('touchMove', [g.pts[1], [g.pts[1][0] + 80, g.pts[1][1] + 40]]);
await wait(16);
await touch('touchMove', [g.pts[1], [g.pts[1][0] + 100, g.pts[1][1] + 60]]);
await touch('touchEnd', []);
await wait(400);
check('pinch start cancels the pending formation order', (await orders()) === o1);

// 7) tap on the ground moves the group there, keeping its shape, facing the enemy
await ev(() => { const s = window.__game.scene.getScene('Battle'); s.frameArmies(); });
await wait(200);
g = await geo([]);
// three to six paces in front of the group (clear of its men and of the group tags), inside the deployment zone
let dest = null;
let dpt = null;
for (const d of [3, 4, 5, 6]) {
  const c = [g.f.cx + g.f.fx * d, Math.min(g.z.y1 - 0.5, Math.max(g.z.y0 + 0.5, g.f.cy + g.f.fy * d))];
  const q = await geo([[c[0] - g.f.cx, c[1] - g.f.cy]], false);
  const free = await ev(([x, y]) => {
    const s = window.__game.scene.getScene('Battle');
    const cam = s.cameras.main;
    // not on a soldier (a tap there selects him) nor on a tag
    const clear = s.views.every((v) => v.u.state === 'dead' || Math.hypot((v.spr.x - cam.worldView.x) * cam.zoom - x, (v.spr.y - v.tall * 0.45 - cam.worldView.y) * cam.zoom - y) > 34);
    // group tags are map markers: a tap near one selects its group
    const offTags = [...s.tagPos.values()].every((t) => Math.hypot(t.x * s.m.S - x, t.y * s.m.S - y) > 26);
    return clear && offTags && s.input.hitTestPointer({ x, y, camera: null }).length === 0;
  }, q.pts[0]);
  if (free || d === 6) {
    dest = c;
    dpt = q;
    if (free) break;
  }
}
await tap(dpt.pts[0][0], dpt.pts[0][1]);
F = (await geo([])).f;
check('tap on the ground moves the selected group there', Math.abs(F.cx - dest[0]) < 0.3 && Math.abs(F.cy - dest[1]) < 0.3 && F.frontage === g.f.frontage, JSON.stringify([F.cx.toFixed(2), F.cy.toFixed(2), dest]));
check('tap-to-move faces the enemy', F.fy < -0.5, JSON.stringify([F.fx.toFixed(2), F.fy.toFixed(2)]));


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
// fast-forward: the band is worn out (test staging), the sim runs to the end.
// The player's few men are made unbreakable too: they only hold their ground,
// and a big band could otherwise wear down their nerve (not their hit points)
// until they routed - the battle was then lost and the band stayed on the map
// (the old ~1-in-5 flake of "defeated band is gone").
const ff = await ev(() => {
  const s = window.__game.scene.getScene('Battle');
  s.sim.units.filter((u) => u.side === 1).forEach((u) => { u.hp = 1; u.morale = Math.min(u.morale, u.stats.morale * 0.3); });
  s.sim.units.filter((u) => u.side === 0).forEach((u) => { u.hp = u.stats.maxHp * 5; u.stats.moraleLoss = 0; u.morale = u.stats.morale; });
  for (const g of s.sim.groups) if (g.side === 0 && !g.disbanded) s.sim.issue(0, { kind: 'order', group: g.id, order: 'charge' });
  for (let i = 0; i < 20 * 300 && s.sim.phase === 'battle'; i++) s.sim.step();
  return { winner: s.sim.winner, tick: s.sim.tick };
});
check('results screen', await until(() => active('Results'), 8000), JSON.stringify(ff));
await wait(1500);
check('report: victory banner and count-up tiles', await ev(() => { const s = window.__game.scene.getScene('Results'); return s.report.result === 'victory' && s.report.kills > 0; }));
// the bottom button leads to the spoils first (cards turn over), then takes them
if (await btn('Results', { icon: 'coin' })) {
  await tapBtn('Results', { icon: 'coin' });
  await wait(1200);
  check('report: spoils page with loot cards', await ev(() => { const s = window.__game.scene.getScene('Results'); return s.page === 'spoils' && s.revealed.size > 0; }));
}
await tapBtn('Results', { icon: 'check' });
check('back on the map after the battle', await until(() => active('World'), 5000));
const gone = await ev((id) => ({ gone: !window.__state.campaign.world.party(id), victory: window.__state.last?.outcome?.victory, parties: window.__state.campaign.world.s.parties.map((p) => p.id) }), bandId);
check('defeated band is gone', gone.gone, JSON.stringify({ bandId, ...gone }));

// ---- village: stand next to one, tap it, march in, hire a volunteer
const village = await ev(() => {
  const s = window.__game.scene.getScene('World');
  const w = s.w;
  w.stop();
  w.s.safeUntil = w.s.time + 1000;
  window.__state.campaign.data.gold = 600; // enough for any volunteer
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
await wait(400);
const before = await ev(() => ({ n: window.__state.campaign.data.heroes.length, gold: window.__state.campaign.data.gold }));
await tapBtn('Settlement', { icon: 'coin', index: 0 });
const hired = await ev(() => ({ n: window.__state.campaign.data.heroes.length, gold: window.__state.campaign.data.gold }));
check('recruited a volunteer', hired.n === before.n + 1 && hired.gold < before.gold, JSON.stringify([before, hired]));

// ---- hero skills: a veteran reaches level 4; raise STR and take two perks
await ev(() => {
  const h = window.__state.campaign.data.heroes[0];
  h.level = 4;
  h.points += 4;
  h.wound = 0; // make sure he fights in the next battle
});
await tapBtn('Settlement', { label: 'Army' });
check('army screen', await until(() => active('Army'), 3000));
await tapBtn('Army', { label: 'Sheet' });
check('hero screen', await until(() => active('Hero'), 3000));
const hero0 = await ev(() => { const h = window.__state.campaign.data.heroes[0]; return { str: h.attrs.str, id: h.id }; });
await tapBtn('Hero', { label: '+', index: 0 });
await tapBtn('Hero', { label: 'Confirm' });
// perks: the Perks tab, a node of the tree, its card's Learn, then the confirmation
await tapBtn('Hero', { label: 'Perks' });
async function takePerk(name) {
  await tapBtn('Hero', { label: name });
  await until(() => btn('Hero', { label: 'Learn' }), 3000, 100);
  await tapBtn('Hero', { label: 'Learn' });
  await wait(200);
  await tapBtn('Hero', { label: 'Learn' });
  await wait(300);
}
await takePerk('Shield Drill');
await takePerk('Shield Bash');
const hero1 = await ev(() => { const h = window.__state.campaign.data.heroes[0]; return { str: h.attrs.str, perks: h.perks }; });
check('spent a stat point', hero1.str === hero0.str + 1, `${hero0.str} -> ${hero1.str}`);
check('took perks Shield Drill and Shield Bash', hero1.perks.includes('shield_drill') && hero1.perks.includes('shield_bash'), JSON.stringify(hero1.perks));

// ---- equip from the stash: the Gear tab, a stash item's compare card, Equip
await ev(() => window.__state.campaign.data.stash.push({ uid: 'smoke_helm', def: 'chalcidian', rarity: 'epic', cond: 100 }));
await tapBtn('Hero', { label: 'Gear' });
await ev(() => {
  const s = window.__game.scene.getScene('Hero');
  s.openStashItem(window.__state.campaign.data.stash.find((i) => i.uid === 'smoke_helm'));
});
await wait(300);
await tapBtn('Hero', { label: 'Equip' });
const helm = await ev(() => ({ on: window.__state.campaign.data.heroes[0].equip.helmet?.uid, inStash: window.__state.campaign.data.stash.some((i) => i.uid === 'smoke_helm') }));
check('equipped a helmet from the stash', helm.on === 'smoke_helm' && !helm.inStash, JSON.stringify(helm));

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
  s.cat = 'abilities';
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
