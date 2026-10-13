// End-to-end smoke test with real touch events (CDP) in a portrait phone viewport.
// Covers the campaign loop: new campaign -> march on the map -> encounter ->
// battle -> back to the map -> recruit in a village -> spend a stat point and
// take perks -> equip from the stash -> use an ability in battle; plus the touch controls (pan vs order, drag to move, the facing knob to turn, tap to move) and pinch zoom.
// Usage: node scripts/smoke.mjs [baseUrl]
import { launch, phoneContext, captureErrors, makePageApi, check, finish } from './lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const browser = await launch();
const ctx = await phoneContext(browser);
const page = await ctx.newPage();
const errors = captureErrors(page);
// taps dispatched inside the page (harness.mjs tap: a CDP tap read as a long-press in slow software WebGL)
// Under load (many agents, CI) the game runs at a few frames a second: every step waits on a state
// with a generous deadline, never on a fixed sleep (a screen still building, a scene not started yet).
const { ev, wait, touch, tap, swipe, pinch, active, until, btn, tapBtn } = makePageApi(page, { tapWait: 150, step: 250, btnIndex: -1, btnWaitMs: 15000 });
/** A check the steps after it build on (a screen open, a battle running): on a FAIL the run stops here, named, instead of failing on in a wrong state (it crashed in openStashItem with no Hero screen open). */
async function need(name, ok, detail = '') {
  check(name, ok, detail);
  if (ok) return;
  console.log(`ABORT after "${name}": the remaining steps depend on it`);
  await finish({ browser });
}

// A fresh context starts with empty storage: one load. (It loaded, cleared localStorage and loaded again, but
// a first launch writes its fresh campaign (GameState.load) once boot gets there; under load that write
// landed after the clear, the reload found a save, and the menu offered Continue, not Begin the march.)
await page.goto(base);
// boot is slow under load: wait for the game object and its menu (a fixed 2.5 s sleep failed, unnamed, on window.__rs())
await need('menu active', await until(() => ev(() => !!window.__game?.scene.isActive('Menu')), 60000));
// The menu enters with a slide and fade (BaseScene.enterMotion). Since FL-02 a tap lands during it (V5-067,
// checked by scripts/regression/hub-flows.mjs), but the slide moves the buttons: wait until the menu is fully in
// so the taps below hit where they aim.
await need('menu entered', await until(() => ev(() => { const ui = window.__game.scene.getScene('Menu').ui; return ui.alpha === 1 && ui.x === 0; }), 15000, 100));
const RS = await ev(() => window.__rs());
// The event deck is on (EV-03): a card (after a battle, on arrival, on the march) waits for an answer and
// pauses the map. Answer any card with its free choice and close the result, as a player would; the
// event card itself is covered by its own play test and the layout check.
await ev(() => setInterval(() => {
  for (const k of ['World', 'Settlement', 'Camp']) {
    const c = window.__game.scene.isActive(k) && window.__game.scene.getScene(k).eventCard;
    if (c && !c.choose(c.freeKey)) c.close();
  }
}, 250));
/** No event card open on `key` (the answer above takes a moment). */
const noEventCard = (key) => until(() => ev((k) => !window.__game.scene.getScene(k).eventCard && !window.__state.campaign.world.s.pendingEvent, key), 10000, 100);

// ---- new campaign
await tapBtn('Menu', { label: 'Begin the march' });
await need('world map via Begin the march', await until(() => active('World'), 30000));
const start = await ev(() => {
  const c = window.__state.campaign;
  return { heroes: c.data.heroes.length, gold: c.data.gold, x: c.world.s.x, y: c.world.s.y, t: c.world.s.time };
});
check('new campaign: the 8-man opening, little gold', start.heroes === 8 && start.gold <= 80, JSON.stringify(start));

// ---- march: tap a passable spot a few tiles away
const findTarget = () => ev(() => {
  const s = window.__game.scene.getScene('World');
  const w = s.w;
  w.s.safeUntil = w.s.time + 1000; // no ambush during this leg
  // a tap on a town's picture (give or take SITE_TAP_MARGIN) or its name plate enters it (WorldScene.tapWorld):
  // march to open ground clear of every site
  const onSite = (px, py) =>
    w.map.settlements.some((st) => {
      if (Math.hypot(st.x * 8 + 4 - px, st.y * 8 - py) < 11) return true;
      const site = s.siteOf(st.id);
      return !!site && px > site.x - 6 && px < site.x + site.w + 6 && py > site.y - 6 && py < Math.max(site.y + site.h, site.ly + 12) + 6;
    });
  const cam = s.cameras.main;
  const view = cam.worldView;
  const rs = window.__rs();
  for (const r of [4, 6, 8, 10]) {
    for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]]) {
      const t = w.nearestPassable(Math.floor(w.s.x) + dx, Math.floor(w.s.y) + dy, 1);
      if (!t || onSite((t.x + 0.5) * 8, (t.y + 0.5) * 8)) continue;
      // on screen, clear of the HUD (top bar, bottom bar; CSS px x RS)
      const sy = ((t.y + 0.5) * 8 - view.y) * cam.zoom;
      if ((t.x + 0.5) * 8 < view.x || (t.x + 0.5) * 8 > view.right || sy < 90 * rs || sy > s.scale.height - 120 * rs) continue;
      return window.__css(((t.x + 0.5) * 8 - view.x) * cam.zoom, sy);
    }
  }
  return null;
});
// the map may still be settling (camera, fog) right after it opens: look again until open ground shows
let target = null;
check('open ground to march to', await until(async () => (target = await findTarget()) !== null, 20000));
if (target) await tap(target[0], target[1]);
check('tap on the map plans a route', await until(() => ev(() => window.__state.campaign.world.route.length > 0), 10000, 100));
// the march runs on game time: wait until the party has walked, not a fixed 2 s
await until(() => ev(([x, y, t]) => { const s = window.__state.campaign.world.s; return Math.hypot(s.x - x, s.y - y) > 0.5 && s.time > t; }, [start.x, start.y, start.t]), 30000);
const moved = await ev(() => window.__state.campaign.world.s);
check('party marched and time passed', Math.hypot(moved.x - start.x, moved.y - start.y) > 0.5 && moved.time > start.t, `${start.x.toFixed(1)},${start.y.toFixed(1)} -> ${moved.x.toFixed(1)},${moved.y.toFixed(1)}`);

// ---- encounter: a band steps out next to us; camping lets time run until it attacks
async function ambush(melee = false) {
  await ev((melee) => {
    const s = window.__game.scene.getScene('World');
    const w = s.w;
    w.stop();
    w.s.safeUntil = 0;
    // camps keep clear of settlements (src/world/camp.ts campBlocker): stage the party on campable ground
    const x0 = Math.floor(w.s.x);
    const y0 = Math.floor(w.s.y);
    search: for (let r = 0; r < 30; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          w.s.x = x0 + dx + 0.5;
          w.s.y = y0 + dy + 0.5;
          if (!w.campBlocker() && w.nearestPassable(x0 + dx + 2, y0 + dy, 3)) break search;
        }
      }
    }
    w.reveal(w.s.x, w.s.y, 6);
    s.cameras.main.centerOn(w.s.x * 8, w.s.y * 8);
    const p = w.s.parties[0];
    const t = w.nearestPassable(Math.floor(w.s.x) + 2, Math.floor(w.s.y), 3);
    p.x = t.x + 0.5;
    p.y = t.y + 0.5;
    p.idle = 0;
    p.power = s.info.power * 1.4; // strong enough to hunt us
    // a melee band for the shield-bash check: skirmishers or riders can keep out of reach for the
    // whole run, and the check needs a man in front of the basher (scripts/dev/screenshots.mjs stages the same)
    if (melee) {
      p.kind = 'raiders';
      p.culture = 'celtic';
    }
    // Only the staged band may attack. The starter zone (AR-01, World.spawnStarterBands) puts 2-3
    // small bands 5-11 tiles from the starting town, where this staging happens, at a seed-dependent
    // spot: one often stood 1-3 tiles off, and when it reached contact first (World.checkContact
    // takes the first band in reach) the encounter, and then the battle, was against it, not the
    // staged band ("battle against the band" failed). A band with idle time neither moves nor attacks.
    for (const q of w.s.parties) if (q !== p) q.idle = 1e9;
  }, melee);
  await tapBtn('World', { label: 'Camp' });
  // game time runs slower than the wall clock when frames are slow (software GL on CI runners)
  return until(() => ev(() => !!window.__game.scene.getScene('World').dialog), 60000);
}
await need('band attacks: encounter dialog', await ambush());
const bandId = await ev(() => window.__state.campaign.world.s.parties[0].id);
await tapBtn('World', { label: 'Attack' });
await need('Attack opens the deployment', await until(() => active('Battle'), 30000));
const fought = await ev(() => window.__state.pending?.partyId);
check('battle against the band', fought === bandId, JSON.stringify({ bandId, fought }));

// ---- touch controls in deployment (field coords projected through the battle camera)
check('one-time controls hint on the first deployment', await until(() => ev(() => !!window.__game.scene.getScene('Battle').hint), 15000));
await tap(195, 120);
check('hint dismissed and remembered', await until(() => ev(() => !window.__game.scene.getScene('Battle').hint && window.__state.campaign.data.settings.seenGestureHint), 15000, 100));
await wait(300);
/** Page (CSS px) points for field points, plus the selected group's state. */
const geo = (pts, frame = true) =>
  ev(([pts, frame]) => {
    const s = window.__game.scene.getScene('Battle');
    const cam = s.cameras.main;
    const toScreen = ([x, y]) => { const p = s.project(x, y); return window.__css((p.x - cam.worldView.x) * cam.zoom, (p.y - cam.worldView.y) * cam.zoom); };
    const g = s.sim.groups[s.selGroup];
    const f = g.formation;
    // frame: (a, b) = a paces to the group's right, b paces behind its front-rank centre
    const P = (a, b) => (frame ? [f.cx - f.fy * a - f.fx * b, f.cy + f.fx * a - f.fy * b] : [f.cx + a, f.cy + b]);
    return { sel: s.selGroup, f: { ...f }, zoom: cam.zoom, scroll: [cam.scrollX, cam.scrollY], z: s.sim.deployZone(0), pts: pts.map(([a, b]) => toScreen(P(a, b))) };
  }, [pts, frame]);
const orders = () => ev(() => window.__game.scene.getScene('Battle').sim.orderLog.length);
let G0 = await geo([]);
check('a group is selected in deployment', G0.sel >= 0);
// CT-05 AC1 (QA-03 S3-3): the deployment opens with both armies in the field band, between the HUD bars
const framed = await ev(() => {
  const s = window.__game.scene.getScene('Battle');
  const cam = s.cameras.main;
  const vp = s.fieldViewport();
  const out = s.sim.units.filter((u) => u.state === 'ready').map((u) => { const p = s.project(u.x, u.y); return [(p.x - cam.worldView.x) * cam.zoom, (p.y - cam.worldView.y) * cam.zoom]; }).filter(([x, y]) => x < 0 || x > s.scale.width || y < vp.top || y > vp.bottom);
  return { out: out.length, zoom: cam.zoom / window.__rs() };
});
check('deployment opens with both armies in view', framed.out === 0, JSON.stringify(framed));
// the touch checks below measure their gestures in paces at 1x: the zoom key leaves the overview for 1x
if (framed.zoom < 0.99) {
  await tapBtn('Battle', { id: 'battle.zoom' });
  check('the zoom key takes the overview to 1x', await until(() => ev(() => Math.abs(window.__game.scene.getScene('Battle').cameras.main.zoom / window.__rs() - 1) < 0.01), 5000, 100));
}
// the opening frames both armies, so the group may sit near the bottom sheet: centre it, so a drag back stays on the field
await ev(() => { const s = window.__game.scene.getScene('Battle'); const c = s.groupCentre(); if (c) s.centerCam(c.x, c.y); });
G0 = await geo([]);
/** Would a deployment drop of the selected group at (cx, cy) land as it is (true), or does the overlap guard slide it off another group (QA-03 S3-8)? */
const dropsClear = (cx, cy) =>
  ev(([cx, cy]) => {
    const s = window.__game.scene.getScene('Battle');
    const f = s.sim.groups[s.selGroup].formation;
    const o = s.freeDrop({ kind: 'form', group: -1, cx, cy, fx: f.fx, fy: f.fy, frontage: f.frontage });
    return !!o && Math.abs(o.cx - cx) < 1e-6 && Math.abs(o.cy - cy) < 1e-6;
  }, [cx, cy]);

// 1) one-finger drag on empty ground pans, even with a group selected
const emptyPt = await ev(() => {
  const s = window.__game.scene.getScene('Battle');
  const cam = s.cameras.main;
  const H = s.scale.height;
  const W = s.scale.width;
  const rs = window.__rs();
  const own = s.views.filter((v) => v.u.side === 0).map((v) => [(v.spr.x - cam.worldView.x) * cam.zoom, (v.spr.y - 10 - cam.worldView.y) * cam.zoom]);
  for (let y = H * 0.25; y < H * 0.6; y += 20)
    for (let x = 40 * rs; x < W - 40 * rs; x += 20) if (own.every(([a, b]) => Math.hypot(a - x, b - y) > 90 * rs) && s.input.hitTestPointer({ x, y, camera: null }).length === 0) return window.__css(x, y);
  return window.__css(W / 2, H * 0.3);
});
const o0 = await orders();
await swipe([emptyPt, [emptyPt[0] - 60, emptyPt[1] + 50]]);
let G1 = await geo([]);
check('drag on empty ground pans the camera with a group selected', Math.hypot(G1.scroll[0] - G0.scroll[0], G1.scroll[1] - G0.scroll[1]) > 20 && (await orders()) === o0, JSON.stringify([G0.scroll, G1.scroll]));
check('pan gave no order', G1.f.cx === G0.f.cx && G1.f.cy === G0.f.cy && G1.f.fx === G0.f.fx);

// 2) drag the group: it moves 2 paces (forward, else back or aside: where no other group stands), facing and shape kept
let step = [0, -2];
for (const [a, b] of [[0, -2], [0, 2], [-2, 0], [2, 0]]) {
  const f = G1.f;
  if (await dropsClear(f.cx - f.fy * a - f.fx * b, f.cy + f.fx * a - f.fy * b)) {
    step = [a, b];
    break;
  }
}
const want = [G1.f.cx - G1.f.fy * step[0] - G1.f.fx * step[1], G1.f.cy + G1.f.fx * step[0] - G1.f.fy * step[1]];
let g = await geo([[0, 0], step]);
await swipe(g.pts);
let F = (await geo([])).f;
check('drag: the group stands where it was dragged', Math.abs(F.cx - want[0]) < 0.4 && Math.abs(F.cy - want[1]) < 0.4, JSON.stringify([F.cx.toFixed(2), F.cy.toFixed(2), want, step]));
check('drag: facing and shape kept', F.fx === G1.f.fx && F.fy === G1.f.fy && F.frontage === G1.f.frontage, JSON.stringify([F.fx, F.fy, F.frontage]));

// 3) drag the facing knob (ahead of the front) round to the right: the men face TOWARD the finger, in place
// The battle seed is random: on some deployments a man of another of our groups stands within tap
// reach of the knob centre, and a press there picks him (src/ui/input/hitTest.ts grabAt), so the drag
// panned instead of turning. Press inside the knob's grab circle, clear of other groups' men, by the
// scene's own hit state (screen px; a horse is reached along its body, as nearestMan does).
const kn = await ev(() => {
  const s = window.__game.scene.getScene('Battle');
  const h = s.hitState();
  const k = h.knob;
  const reach = (u, p) => (u.big ? Math.hypot(u.x - p.x, (u.y - p.y) * 1.6) * 0.7 : Math.hypot(u.x - p.x, u.y - p.y));
  for (const r of [0, 0.3, 0.6])
    for (let a = 0; a < 8; a++) {
      const p = { x: k.x + Math.cos((a * Math.PI) / 4) * r * h.grabR, y: k.y + Math.sin((a * Math.PI) / 4) * r * h.grabR };
      const man = h.units.filter((u) => reach(u, p) < h.unitR).sort((u, v) => reach(u, p) - reach(v, p))[0];
      if (man && man.side === h.me && man.group !== h.sel) continue;
      const dk = Math.hypot(k.x - p.x, k.y - p.y);
      if (h.body.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < dk)) continue;
      return window.__css(p.x, p.y);
    }
  return window.__css(k.x, k.y);
});
const side = await geo([[1.6, -1.6], [3, 0.3]]);
await swipe([kn, ...side.pts]);
let F2 = (await geo([])).f;
const right = [-F.fy, F.fx];
check('knob: the group turns to face the finger (to its right)', F2.fx * right[0] + F2.fy * right[1] > 0.9, JSON.stringify([F2.fx.toFixed(2), F2.fy.toFixed(2)]));
check('knob: the turn keeps the shape', F2.frontage === F.frontage, `${F.frontage} -> ${F2.frontage}`);

// 4) the shape comes from the Formation buttons only: a drag never changes it
g = await geo([[0, 0], [0, 1.4], [2.6, 1.4]]);
await swipe(g.pts);
let F3 = (await geo([])).f;
check('a drag never reshapes the group', F3.frontage === F2.frontage && F3.fx === F2.fx && F3.fy === F2.fy, `${F2.frontage} -> ${F3.frontage}`);

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
  const free = await ev(([px, py]) => {
    const s = window.__game.scene.getScene('Battle');
    const cam = s.cameras.main;
    const [x, y] = window.__gamePt(px, py);
    const rs = window.__rs();
    // not on a soldier (a tap there selects him) nor on a tag
    const clear = s.views.every((v) => v.u.state === 'dead' || Math.hypot((v.spr.x - cam.worldView.x) * cam.zoom - x, (v.spr.y - v.tall * 0.45 - cam.worldView.y) * cam.zoom - y) > 34 * rs);
    // group tags are map markers: a tap near one selects its group
    const offTags = [...s.tagPos.values()].every((t) => Math.hypot(t.x * s.m.S - x, t.y * s.m.S - y) > 26 * rs);
    return clear && offTags && s.input.hitTestPointer({ x, y, camera: null }).length === 0;
  }, q.pts[0]) && (await dropsClear(c[0], c[1]));
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
await pinch(150, 240, 300, 12);
const z1 = await ev(() => window.__game.scene.getScene('Battle').cameras.main.zoom);
check('pinch zoom', z1 > z0, `${z0} -> ${z1}`);

await tapBtn('Battle', { id: 'battle.fight' });
await need('battle started', await until(async () => (await ev(() => window.__game.scene.getScene('Battle').sim.phase)) === 'battle', 20000, 100));
// sprites are drawn at native size: a man is ~34 CSS px tall at zoom 1 (camera zoom RS); the fight starts at 1x or closer
await wait(400);
const zf = await ev(() => window.__game.scene.getScene('Battle').cameras.main.zoom);
check('readable fight zoom (a man is at least 30 px tall)', (zf / RS) * 34 >= 30, `zoom ${zf / RS} (camera ${zf}, RS ${RS})`);
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
  // the worn-out band must be beaten, not quit the field: its bot retreats (R5 retreatAt) once its
  // routing men reach the doctrine's share, and whether that came before the last man fell depended on
  // the tick this staging began (the band then stayed on the map: "defeated band is gone" failed)
  for (const b of s.sim.bots) if (b.side === 1) b.doctrine = { ...b.doctrine, retreatAt: 0 };
  // held every step: a long fight against a big band could still break their nerve once
  const mine = s.sim.units.filter((u) => u.side === 0 && u.state === 'ready');
  for (let i = 0; i < 20 * 300 && s.sim.phase === 'battle'; i++) {
    for (const u of mine) if (u.state === 'ready') { u.hp = Math.max(u.hp, u.stats.maxHp); u.morale = u.stats.morale; }
    s.sim.step();
  }
  return { winner: s.sim.winner, tick: s.sim.tick, retreated: s.sim.retreated };
});
await need('results screen', await until(() => active('Results'), 60000), JSON.stringify(ff));
// the report is built after the scene starts: wait for it rather than a fixed 1.5 s (it threw on an undefined report)
await until(() => ev(() => !!window.__game.scene.getScene('Results').report), 20000);
check('report: victory banner and count-up tiles', await ev(() => { const s = window.__game.scene.getScene('Results'); return s.report?.result === 'victory' && s.report.kills > 0; }));
// the bottom button leads to the spoils first (cards turn over), then takes them
if (await btn('Results', { icon: 'chest' })) {
  await tapBtn('Results', { icon: 'chest' });
  // the cards turn over on a timer (game time): wait for the first one
  check('report: spoils page with loot cards', await until(() => ev(() => { const s = window.__game.scene.getScene('Results'); return s.page === 'spoils' && s.revealed.size > 0; }), 15000));
}
await tapBtn('Results', { icon: 'check' });
await need('back on the map after the battle', await until(() => active('World'), 30000));
await noEventCard('World');
const gone = await ev((id) => ({ gone: !window.__state.campaign.world.party(id), victory: window.__state.last?.outcome?.victory, parties: window.__state.campaign.world.s.parties.map((p) => p.id) }), bandId);
check('defeated band is gone', gone.gone, JSON.stringify({ bandId, ...gone }));

// ---- village: stand next to one, tap it, march in, hire a volunteer
const village = await ev(() => {
  const s = window.__game.scene.getScene('World');
  const w = s.w;
  w.stop();
  w.s.safeUntil = w.s.time + 1000;
  window.__state.campaign.data.gold = 600; // enough for any volunteer
  // still camped where the band attacked: strike it (a tap elsewhere would ask first) and reveal the village
  if (w.camp) {
    w.breakCamp();
    s.renderCamp();
    s.buildHud();
  }
  const v = w.map.settlements.find((x) => x.kind === 'village');
  w.reveal(v.x + 0.5, v.y + 0.5, 4);
  const t = w.nearestPassable(v.x + 2, v.y, 3);
  w.s.x = t.x + 0.5;
  w.s.y = t.y + 0.5;
  const cam = s.cameras.main;
  cam.centerOn(v.x * 8, v.y * 8);
  s.follow = false;
  return { id: v.id };
});
await wait(200);
// discovering a settlement plays a short camera cut that ignores taps (WorldScene.cine): let it finish
await until(() => ev(() => !window.__game.scene.getScene('World').cine), 20000, 100);
await wait(300);
const vpos = await ev((id) => {
  const s = window.__game.scene.getScene('World');
  const v = s.w.map.settlements[id];
  const cam = s.cameras.main;
  return window.__css(((v.x * 8 + 4) - cam.worldView.x) * cam.zoom, (v.y * 8 - cam.worldView.y) * cam.zoom);
}, village.id);
await tap(vpos[0], vpos[1]);
await need('entered the village', await until(() => active('Settlement'), 30000));
await noEventCard('Settlement');
await wait(400);
const before = await ev(() => ({ n: window.__state.campaign.data.heroes.length, gold: window.__state.campaign.data.gold }));
await tapBtn('Settlement', { icon: 'coin', index: 0 });
await until(() => ev((n) => window.__state.campaign.data.heroes.length > n, before.n), 10000, 100);
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
await need('army screen', await until(() => active('Army'), 15000));
await tapBtn('Army', { label: 'Sheet' });
await need('hero screen', await until(() => active('Hero'), 15000));
const hero0 = await ev(() => { const h = window.__state.campaign.data.heroes[0]; return { str: h.attrs.str, id: h.id }; });
await tapBtn('Hero', { label: '+', index: 0 });
await tapBtn('Hero', { label: 'Confirm' });
await until(() => ev((s0) => window.__state.campaign.data.heroes[0].attrs.str > s0, hero0.str), 3000, 100);
// perks: the Perks tab, a node of the tree, its card's Learn, then the confirmation
await tapBtn('Hero', { label: 'Perks' });
const hasPerk = (id) => ev((i) => window.__state.campaign.data.heroes[0].perks.includes(i), id);
async function takePerk(name, id) {
  await tapBtn('Hero', { label: name });
  await until(() => btn('Hero', { label: 'Learn' }), 3000, 100);
  // the card's Learn opens the confirmation, whose Learn takes the perk
  for (let i = 0; i < 3 && !(await hasPerk(id)); i++) {
    await tapBtn('Hero', { label: 'Learn' });
    await until(() => hasPerk(id), 1500, 100);
  }
  // the dialogs close after taking it
  await until(async () => !(await btn('Hero', { label: 'Learn' })), 3000, 100);
}
await takePerk('Shield Drill', 'shield_drill');
await takePerk('Shield Bash', 'shield_bash');
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
await until(() => ev(() => window.__state.campaign.data.heroes[0].equip.helmet?.uid === 'smoke_helm'), 3000, 100);
const helm = await ev(() => ({ on: window.__state.campaign.data.heroes[0].equip.helmet?.uid, inStash: window.__state.campaign.data.stash.some((i) => i.uid === 'smoke_helm') }));
check('equipped a helmet from the stash', helm.on === 'smoke_helm' && !helm.inStash, JSON.stringify(helm));

// ---- use the ability in battle
await ev(() => window.__game.scene.getScene('Hero').back());
await wait(400);
// the Army has no footer back (N3, ARM-01): its top-bar back returns to the town that opened it
await tapBtn('Army', { id: 'army.topbar.back' });
await wait(400);
await tapBtn('Settlement', { label: 'Leave' });
await need('left the village', await until(() => active('World'), 15000));
await need('second encounter', await ambush(true));
await tapBtn('World', { label: 'Attack' });
// the staging below steps the sim only in the 'battle' phase: unchecked 5 s waits here let it run in deployment
// under load (no steps, no contact), which failed "shield basher in contact" and then "ability used"
await need('second deployment', await until(() => active('Battle'), 30000));
await tapBtn('Battle', { id: 'battle.fight' });
await need('second battle started', await until(async () => (await ev(() => window.__game.scene.getScene('Battle').sim.phase)) === 'battle', 20000, 100));
// stage a man in front of the shield-basher, then pause and select him.
// Contact is staged, not waited for (QA-05): a charge run until bash came ready failed whenever the AI
// never brought a foe into his front arc before the fight ended. The same staging run off the browser over
// 120 raider bands failed 37 times: the band's men routed one by one (their own
// morale: retreatAt only stops the bot's withdrawal) and the field emptied, or the basher stood behind
// his own front rank for the whole 90 s. Now nobody on either side falls, breaks or withdraws, and the
// nearest standing foe is put one pace ahead of him, inside bash range and his facing arc.
const ready = await ev((hid) => {
  const s = window.__game.scene.getScene('Battle');
  const u = s.sim.units.find((x) => x.heroId === hid);
  s.sim.units.forEach((x) => { x.hp = x.stats.maxHp * 5; x.stats.moraleLoss = 0; x.morale = x.stats.morale; });
  for (const b of s.sim.bots) if (b.side === 1) b.doctrine = { ...b.doctrine, retreatAt: 0 };
  const d2 = (e) => (e.x - u.x) ** 2 + (e.y - u.y) ** 2;
  const foe = s.sim.units.filter((x) => x.side !== 0 && x.state === 'ready').sort((a, b) => d2(a) - d2(b))[0];
  if (foe) (foe.x = u.x + u.fx), (foe.y = u.y + u.fy);
  for (let i = 0; i < 20 * 10 && s.sim.phase === 'battle' && !s.sim.abilityReady(u, 'bash'); i++) s.sim.step();
  s.handleEvents(s.sim.drainEvents());
  s.setPaused(true);
  s.selGroup = u.group;
  s.selUnit = u.id;
  s.buildHud();
  return { ready: s.sim.abilityReady(u, 'bash'), phase: s.sim.phase, t: s.sim.tick / 20 };
}, hero0.id);
check('shield basher in contact', ready.ready, JSON.stringify(ready));
await wait(300);
await tapBtn('Battle', { id: 'battle.cmd.bash' }); // the ability medallion
const usedBash = () => ev(() => window.__game.scene.getScene('Battle').sim.orderLog.some((o) => o.side === 0 && o.order.kind === 'ability' && o.order.ability === 'bash'));
await until(usedBash, 15000, 100);
const used = await ev(() => window.__game.scene.getScene('Battle').sim.orderLog.filter((o) => o.side === 0 && o.order.kind === 'ability').map((o) => o.order.ability));
check('ability used from the battle bar', used.includes('bash'), JSON.stringify(used));
await tapBtn('Battle', { id: 'battle.play' }); // unpause
await wait(1500);
check('no console errors', errors.length === 0, errors.join(' | '));
await finish({ browser });
