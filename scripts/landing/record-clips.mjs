// Records the landing page's gameplay clips (docs/v6/landing/STRUCTURE.md › Clips needed) from the
// REAL game: deterministic, frame by frame, at the clip's final size.
//
//   npx vite --config scripts/landing/vite.record.config.mjs --port <p> --strictPort   (a dev server: the
//                                                    staging below imports game modules from /src)
//   node scripts/landing/record-clips.mjs http://localhost:<p>/ [--only H1,G1] [--out <dir>]
//   bash scripts/landing/encode-clips.sh [<dir>]     (WebM + MP4 + posters into landing/assets-staging/video/)
//
// How: Playwright's fake clock (page.clock) drives the game's requestAnimationFrame, Date and
// performance.now, so the game advances exactly 1/30 s between two screenshots however slow the
// machine is: no dropped or doubled frames, and the same seed gives the same clip. Each clip is a
// folder of PNG frames plus clip.env (size, fps, loop crossfade, poster frame) for the encoder.
//
// Staging goes through the game's debug handles only (window.__game / __state, as
// scripts/dev/screenshots.mjs does): an army built for the shot, a seeded battle, auto-pause off, the
// HUD camera hidden where a clean shot reads better. Nothing is drawn that the game does not draw.
// The game's portrait column (index.html caps #game at 0.64 x height) is widened to the clip's frame
// by a style injected into the page: the game lays itself out for that size (Phaser RESIZE).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, prepContext, apiDown, ROOT } from '../lib/harness.mjs';

const args = process.argv.slice(2);
const base = (args.find((a) => !a.startsWith('--') && /^https?:/.test(a)) ?? 'http://localhost:5173/').replace(/\/?$/, '/');
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const only = opt('--only')?.split(',');
const OUT = opt('--out') ?? join(ROOT, 'shots', 'landing-clips');
const FPS = 30;

const browser = await launch();

// ------------------------------------------------------------------ page set-up

/** A desktop page (no touch) of w x h CSS px at 1 device px, the game widened to the whole viewport. */
async function openGame(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    window.__noFirstRun = true;
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = '#game{width:100vw!important;left:0!important;top:0!important;bottom:0!important;transform:none!important}';
      document.head.appendChild(s);
    });
  });
  await prepContext(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (process.env.DEBUG_REC) {
    page.on('framenavigated', (f) => f === page.mainFrame() && console.log('navigated', f.url()));
    page.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 160)));
    page.on('crash', () => console.log('PAGE CRASH'));
    page.on('close', () => console.log('PAGE CLOSE'));
  }
  await apiDown(page);
  await page.route('**/telegram.org/**', (r) => r.abort());
  await page.clock.install();
  await page.goto(base + '?lang=en');
  await page.waitForFunction(() => window.__game?.scene.isActive('Menu'), null, { timeout: 90000 });
  // the game sizes itself to the widened #game (as it does on a safe-area change, src/main.ts)
  await page.waitForFunction(([w, h]) => {
    const g = window.__game;
    g.scale.getParentBounds();
    g.scale.refresh();
    return Math.round(g.scale.width) === w && Math.round(g.scale.height) === h;
  }, [w, h], { timeout: 15000, polling: 250 });
  // a fixed campaign, no hints, no auto-pause banners over the action
  await page.evaluate(async () => {
    const st = window.__state;
    st.campaign = st.campaign.constructor.fresh(20261006);
    st.hasSave = true;
    Object.assign(st.campaign.data.settings, { seenHints: ['*'], seenGestureHint: true, pauseContact: false, pauseDeath: false, pauseFlank: false, pauseRout: false });
  });
  return { ctx, page, errors };
}

const ev = (page, fn, arg) => page.evaluate(fn, arg);
const scene = (page, key) => page.waitForFunction((k) => window.__game.scene.isActive(k), key, { timeout: 30000 });

/**
 * Captures `seconds` of game time as PNG frames. `perFrame(i, t)` runs before frame i (camera moves,
 * scripted orders). The clock is paused for the capture and flows again afterwards.
 */
async function capture(page, id, seconds, perFrame) {
  const dir = join(OUT, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  await page.clock.pauseAt((await ev(page, () => Date.now())) + 1000); // a margin: the clock still flows meanwhile
  // a few unsaved frames first: the first camera placement (and the paused clock) settle before frame 0
  for (let k = 0; k < 3; k++) {
    if (perFrame) await perFrame(0, 0);
    await page.clock.runFor(Math.round(1000 / FPS));
    await page.screenshot({ type: 'jpeg', quality: 10 });
  }
  const n = Math.round(seconds * FPS);
  for (let i = 0; i < n; i++) {
    if (perFrame) await perFrame(i, i / FPS);
    await page.clock.runFor(Math.round(((i + 1) * 1000) / FPS) - Math.round((i * 1000) / FPS));
    await page.screenshot({ path: join(dir, `f${String(i).padStart(4, '0')}.png`) });
  }
  await page.clock.resume();
  return dir;
}

/** clip.env for scripts/landing/encode-clips.sh. */
function writeEnv(dir, o) {
  writeFileSync(join(dir, 'clip.env'), Object.entries(o).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
}

// ------------------------------------------------------------------ battle staging

/**
 * A seeded battle: `mine` and `foes` are [class, count, group, culture] rows. Starts the Battle scene
 * on its deployment, banner hidden.
 */
async function stageBattle(page, { mine, foes, seed, site, label }) {
  await ev(page, async ({ mine, foes, seed, site, label }) => {
    const st = window.__state;
    const c = st.campaign;
    const mod = await import('/src/game/heroes.ts');
    const { Rng } = await import('/src/sim/rng.ts');
    const rng = new Rng(seed);
    c.data.heroes = [];
    for (const [cls, n, group, culture, lv = 5] of mine) for (let i = 0; i < n; i++) c.data.heroes.push(mod.makeHero(rng, c.data, culture, cls, lv, 2, group, c.data.heroes));
    const ids = { nextId: 5000 };
    const enemy = [];
    for (const [cls, n, group, culture, lv = 5] of foes) for (let i = 0; i < n; i++) enemy.push(mod.makeHero(rng, ids, culture, cls, lv, 2, group, enemy));
    st.pending = { enemy: { culture: foes[0][3], heroes: enemy, power: 1, targetPower: 1 }, seed, label, site };
    window.__game.scene.getScenes(true).forEach((sc) => sc.scene.start('Battle', {}));
  }, { mine, foes, seed, site, label });
  await scene(page, 'Battle');
  await page.waitForFunction(() => !!window.__game.scene.getScene('Battle').sim, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await ev(page, () => { window.__game.scene.getScene('Battle').hideBanner(); });
}

/**
 * Installs a tick schedule on the running battle: `script` is a function body run before every sim step
 * with (s, sim, tick) — it issues the same orders at the same ticks whether the battle runs live or is
 * fast-forwarded, so the result is the same either way.
 */
const scriptBattle = (page, script) =>
  ev(page, (body) => {
    const s = window.__game.scene.getScene('Battle');
    const sim = s.sim;
    const fn = new Function('s', 'sim', 'tick', body);
    const step = sim.step.bind(sim);
    sim.step = () => { fn(s, sim, sim.tick); return step(); };
  }, script);

/** Runs the battle (no rendering) up to `tick`, the scene seeing every event as it would live. */
const fastForward = (page, tick) =>
  ev(page, (tick) => {
    const s = window.__game.scene.getScene('Battle');
    while (s.sim.tick < tick && s.sim.phase === 'battle') { s.sim.step(); s.handleEvents(s.sim.drainEvents()); }
    return s.sim.tick;
  }, tick);

/** Hides the battle HUD camera (field only). */
const hideBattleHud = (page) => ev(page, () => { window.__game.scene.getScene('Battle').uiCam.setVisible(false); });

/** The battle camera zoomed to `zoom` (zoom units) and held there: not following, the zoom tween settled. */
async function battleZoom(page, zoom) {
  await ev(page, (zoom) => {
    const s = window.__game.scene.getScene('Battle');
    s.setFollow(false);
    s.tweens.killTweensOf(s.cameras.main);
    s.cameras.main.setZoom(zoom);
  }, zoom);
  await page.waitForTimeout(300);
}

/** The battle camera centred on field point (x, y) (sim units). */
const battleLook = (page, x, y) =>
  ev(page, ([x, y]) => {
    const s = window.__game.scene.getScene('Battle');
    const p = s.project(x, y);
    s.cameras.main.centerOn(p.x, p.y); // the whole frame is field: no HUD margins to allow for
  }, [x, y]);

/** The centres of each side's first (main) group, men still standing, sim units. */
const armyCentres = (page) =>
  ev(page, () => {
    const s = window.__game.scene.getScene('Battle');
    const c = (side) => {
      const gid = s.sim.groups.find((g) => g.side === side && !g.individual).id;
      const a = s.sim.units.filter((u) => u.side === side && u.state === 'ready' && u.group === gid);
      return { x: a.reduce((t, u) => t + u.x, 0) / a.length, y: a.reduce((t, u) => t + u.y, 0) / a.length };
    };
    return [c(0), c(1)];
  });

/**
 * A camera that follows the front: each frame it eases (factor `ease`) toward the point between the
 * two main groups (or the player's group `bias` of the way toward it), plus an offset `off(k)` in sim
 * units for a slow drift, k = 0..1 over the clip. Returns a perFrame function for capture().
 */
const frontCam = (page, { ease = 0.06, bias = 0.5, off = () => ({ x: 0, y: 0 }), shift = [0, 0], melee = true, frames }) => (i) =>
  ev(page, ({ ease, bias, o, first, shift, melee }) => {
    const s = window.__game.scene.getScene('Battle');
    const c = (side) => {
      const gid = s.sim.groups.find((g) => g.side === side && !g.individual).id;
      let a = s.sim.units.filter((u) => u.side === side && u.state === 'ready' && u.group === gid);
      if (!a.length) a = s.sim.units.filter((u) => u.side === side && u.state !== 'dead');
      return { x: a.reduce((t, u) => t + u.x, 0) / a.length, y: a.reduce((t, u) => t + u.y, 0) / a.length };
    };
    const [a, b] = [c(0), c(1)];
    // the melee when there is one (routers running off would drag a group's centre away), else between the lines
    const m = melee ? s.sim.units.filter((u) => u.state === "ready" && u.engaged) : [];
    const at = m.length >= 4 ? { x: m.reduce((t, u) => t + u.x, 0) / m.length, y: m.reduce((t, u) => t + u.y, 0) / m.length } : { x: a.x + (b.x - a.x) * bias, y: a.y + (b.y - a.y) * bias };
    const want = { x: at.x + o.x, y: at.y + o.y };
    const cur = first || !window.__recCam ? want : window.__recCam;
    window.__recCam = { x: cur.x + (want.x - cur.x) * ease, y: cur.y + (want.y - cur.y) * ease };
    const p = s.project(window.__recCam.x, window.__recCam.y);
    // shift: world px, to frame a long line. Whole world px: the field then moves in whole art pixels, so
    // the encoder's motion search matches the grass exactly instead of seeing it resampled every frame.
    s.cameras.main.centerOn(Math.round(p.x + shift[0]), Math.round(p.y + shift[1]));
    s.shook = { x: 0, y: 0 }; // the impact shake (BattleScene.applyShake) builds on this scroll, not on the last one
  }, { ease, bias, o: off(i / frames), first: i === 0, shift, melee });

// ------------------------------------------------------------------ the clips

const PLAIN = { base: 'plain', river: false, coast: false, rocky: false, woods: 0.15 };

const CLIPS = {
  // Hero ambient: two lines close, javelins fly, the player's lattice under the hoplites; slow pan, no HUD.
  async H1() {
    const { page, ctx, errors } = await openGame(1280, 720);
    await stageBattle(page, {
      seed: 101,
      label: 'Galatae',
      site: PLAIN,
      mine: [['hoplite', 9, 0, 'greek'], ['peltast', 3, 1, 'greek']], // 12: the game's field cap (MUSTER.fieldCap)
      foes: [['celt_sword', 10, 0, 'celtic'], ['javelineer', 4, 1, 'celtic']],
    });
    await ev(page, () => {
      const s = window.__game.scene.getScene('Battle');
      s.startFight();
      s.sim.issue(0, { kind: 'order', group: 0, order: 'advance' });
      s.sim.issue(0, { kind: 'order', group: 1, order: 'advance' });
      s.sim.issue(0, { kind: 'loose', group: 1, on: true });
      s.selGroup = 0;
      s.speed = 1;
    });
    await hideBattleHud(page);
    // an ambient loop under the headline: the player's own "Reduce shake" setting keeps it calm
    await ev(page, () => { window.__state.campaign.data.settings.reduceShake = true; window.__game.scene.getScene("Battle").juice.shakeOff = true; });
    await fastForward(page, 95);
    await battleZoom(page, 3);
    // the camera rides the front between the two lines, drifting slowly along it
    const dir = await capture(page, 'H1', 8.5, frontCam(page, { frames: 8.5 * FPS, melee: false, bias: 0.5, shift: [0, -10], off: (k) => ({ x: (k - 0.5) * 3, y: -(k - 0.5) * 3 }) }));
    writeEnv(dir, { W: 1280, H: 720, XF: 0.5, POSTER: 4.0 });
    await ctx.close();
    return errors;
  },

  // A formation breaks: the Celts' line, pinned by the hoplites, is hit in the flank by the Companions and routs.
  async G1() {
    const { page, ctx, errors } = await openGame(960, 540);
    const start = async () => {
      await ev(page, () => { window.__cavGo = 0; window.__cavAt = null; window.__cavCharge = 0; });
      await stageBattle(page, FLANK_BATTLE);
      await scriptBattle(page, FLANK_SCRIPT);
      await ev(page, () => { const s = window.__game.scene.getScene('Battle'); s.startFight(); s.speed = 1; });
    };
    // a dry run finds the tick the Celts' line breaks (the sim is seeded: the take below repeats it)
    await start();
    const rout = await runUntil(page, `return sim.groups.some((g) => g.side === 1 && g.role === "main" && g.routed);`);
    const charge = await ev(page, () => window.__cavCharge);
    if (rout < 0) {
      const why = await ev(page, () => { const s = window.__game.scene.getScene('Battle'); const sim = s.sim; return { tick: sim.tick, phase: sim.phase, cavGo: window.__cavGo, groups: sim.groups.map((g) => [g.side, g.id, g.role, g.order, g.routed, g.individual, sim.units.filter((u) => u.group === g.id && u.state === 'ready').length]) }; });
      throw new Error('G1: the line never broke ' + JSON.stringify(why));
    }
    await start();
    await hideBattleHud(page);
    // from just before the riders' charge to past the rout, at the game's x2 speed (its own speed control)
    await fastForward(page, charge - 15);
    await ev(page, () => { window.__game.scene.getScene('Battle').speed = 2; });
    await battleZoom(page, 3);
    const dir = await capture(page, 'G1', 8.5, frontCam(page, { frames: 8.5 * FPS, bias: 0.6, ease: 0.05, shift: [0, -10] }));
    writeEnv(dir, { W: 960, H: 540, XF: 0.5, POSTER: 5.6 });
    await ctx.close();
    console.log(`G1: the riders charge at tick ${charge}, the line breaks at tick ${rout}`);
    return errors;
  },

  // The war map: M3 a short drift from home toward a rival army marching along its route; G2 a longer
  // pass, wider, over home, the rival's march and the regions beyond.
  async M3() {
    const { page, ctx, errors } = await openGame(960, 540);
    let a = await stageWar(page, 2);
    console.log('M3: anchors', JSON.stringify(a));
    const dir = await capture(page, 'M3', 6.5, panPath(page, 'Online', [a.me, { x: (a.me.x + a.raid.x) / 2, y: (a.me.y + a.raid.y) / 2 }], 6.5 * FPS));
    writeEnv(dir, { W: 960, H: 540, XF: 0.5, POSTER: 3.0 });
    a = await stageWar(page, 1);
    // the map draws its detailed ground in chunks as the camera reaches them: one pass first so the take
    // shows the finished map, not the coarse overview it starts from
    const path = [a.rival, a.me, a.raid];
    const warm = panPath(page, 'Online', path, 24);
    for (let i = 0; i < 24; i++) { await warm(i); await page.waitForTimeout(250); }
    const dir2 = await capture(page, 'G2', 8.5, panPath(page, 'Online', path, 8.5 * FPS));
    writeEnv(dir2, { W: 960, H: 540, XF: 0.5, POSTER: 4.0 });
    await ctx.close();
    return errors;
  },

  // Campaign: the party marches along the road toward a town on the overland map, a band (with its
  // strength plate) on the way; the map's HUD camera hidden.
  async M1() {
    const { page, ctx, errors } = await openGame(960, 540);
    await ev(page, () => window.__game.scene.getScenes(true).forEach((s) => s.scene.start('World', {})));
    await scene(page, 'World');
    await page.waitForTimeout(2500);
    // the event deck: answer any card with its free choice, as scripts/smoke.mjs does
    await ev(page, () => setInterval(() => {
      const c = window.__game.scene.isActive('World') && window.__game.scene.getScene('World').eventCard;
      if (c && !c.choose(c.freeKey)) c.close();
    }, 100));
    const plan = await ev(page, () => {
      const s = window.__game.scene.getScene('World');
      const w = s.w;
      w.s.safeUntil = w.s.time + 1000; // no ambush: the band stands by the road
      const here = { x: w.s.x, y: w.s.y };
      const d = (st) => Math.hypot(st.x - here.x, st.y - here.y);
      const town = w.map.settlements.filter((st) => d(st) > 7).sort((a, b) => d(a) - d(b))[0];
      // the ground between is explored: the march reads, the fog stays at the edges
      for (let k = 0; k <= 1; k += 0.1) w.reveal(here.x + (town.x - here.x) * k, here.y + (town.y - here.y) * k, 7);
      const p = w.s.parties[0];
      const t = w.nearestPassable(Math.round(here.x + (town.x - here.x) * 0.45) + 2, Math.round(here.y + (town.y - here.y) * 0.45) - 1, 4);
      p.x = t.x + 0.5;
      p.y = t.y + 0.5;
      p.idle = 50;
      s.uiCam.setVisible(false);
      s.setZoom(3); // the map's zoom key, one step in
      window.__recGoal = w.nearestPassable(town.x, town.y + 1, 3);
      return { from: here, to: { x: town.x, y: town.y, kind: town.kind, id: town.id }, band: { x: p.x, y: p.y, size: p.size, kind: p.kind } };
    });
    console.log('M1:', JSON.stringify(plan));
    // the fog lifts over the explored ground (it redraws over a moment), then the march begins
    await page.waitForTimeout(2500);
    await ev(page, () => { const s = window.__game.scene.getScene('World'); s.follow = false; s.w.setDestination(window.__recGoal.x, window.__recGoal.y); });
    // the camera rides with the party (as the map's own follow does, eased, whole pixels), a little ahead of it
    const dir = await capture(page, 'M1', 6.5, (i) => ev(page, (first) => {
      const s = window.__game.scene.getScene('World');
      const cam = s.cameras.main;
      const want = { x: s.w.s.x * 8 + 40, y: s.w.s.y * 8 };
      const cur = first ? want : { x: cam.midPoint.x, y: cam.midPoint.y };
      cam.centerOn(Math.round(cur.x + (want.x - cur.x) * 0.15), Math.round(cur.y + (want.y - cur.y) * 0.15));
    }, i === 0));
    writeEnv(dir, { W: 960, H: 540, XF: 0.5, POSTER: 3.0 });
    await ctx.close();
    return errors;
  },

  // The Forge: the Smith row of a town's Services tab (the only forge in the game), an item at the
  // Smith, a line picked and reforged by clicks on the real buttons. M4 square, G4 16:9.
  async M4() { return forgeClip('M4', 720, 720); },
  async G4() { return forgeClip('G4', 960, 540); },

  // One class up close: a Spartan hoplite on his base plate, braced and striking in a melee, at x4.
  async B1() {
    const { page, ctx, errors } = await openGame(360, 360);
    await stageBattle(page, {
      seed: 311,
      label: 'Galatae',
      site: { ...PLAIN, woods: 0 },
      mine: [['hoplite', 4, 0, 'greek']],
      foes: [['celt_sword', 3, 0, 'celtic', 2]],
    });
    await ev(page, () => { const s = window.__game.scene.getScene('Battle'); s.startFight(); s.sim.issue(0, { kind: 'order', group: s.sim.groups.find((g) => g.side === 0 && !g.individual).id, order: 'advance' }); });
    await hideBattleHud(page);
    const t = await runUntil(page, `return sim.units.some((u) => u.side === 0 && u.engaged);`);
    await fastForward(page, t + 10);
    await battleZoom(page, 4);
    const uid = await ev(page, () => window.__game.scene.getScene('Battle').sim.units.find((u) => u.side === 0 && u.engaged && u.state === 'ready').id);
    const dir = await capture(page, 'B1', 3.5, (i) => ev(page, ([uid, first]) => {
      const s = window.__game.scene.getScene('Battle');
      const a = s.sim.units.filter((v) => v.side === 0 && v.state === "ready"); // the hoplites, framed as a group of two or three
      const p = s.project((s.sim.units[uid].x * 2 + a.reduce((t, v) => t + v.x, 0) / a.length) / 3, (s.sim.units[uid].y * 2 + a.reduce((t, v) => t + v.y, 0) / a.length) / 3);
      const cam = s.cameras.main;
      const want = { x: p.x, y: p.y - 10 };
      const cur = first ? want : { x: cam.midPoint.x, y: cam.midPoint.y };
      cam.centerOn(Math.round(cur.x + (want.x - cur.x) * 0.2), Math.round(cur.y + (want.y - cur.y) * 0.2));
      s.shook = { x: 0, y: 0 };
    }, [uid, i === 0]));
    writeEnv(dir, { W: 360, H: 360, XF: 0.5, POSTER: 1.5 });
    await ctx.close();
    return errors;
  },

  // A ranked duel, one battle for two clips: M2 (wide) as the two duel armies close and meet, then G3
  // (closer) as the shield wall the phalanx formed on deployment takes the clash.
  async G3() {
    const { page, ctx, errors } = await openGame(960, 540);
    const info = await stageDuel(page);
    console.log('G3: duel', JSON.stringify(info));
    await hideBattleHud(page);
    await ev(page, () => {
      const s = window.__game.scene.getScene('Battle');
      // deployment: the phalanx closes into a shield wall (the Formation button's "wall"), then every group advances
      const g0 = s.sim.groups.find((g) => g.side === 0 && !g.individual).id;
      s.sim.issue(0, { kind: 'preset', group: g0, type: 'shieldwall' });
      s.startFight();
      s.speed = 1;
      for (const g of s.sim.groups) if (g.side === 0 && !g.individual) s.sim.issue(0, { kind: 'order', group: g.id, order: 'advance' });
    });
    // on to about three seconds before the first blow
    const near = await runUntil(page, `
      const a = sim.units.filter((u) => u.side === 0 && u.state === 'ready'), b = sim.units.filter((u) => u.side === 1 && u.state === 'ready');
      return a.some((u) => b.some((v) => Math.hypot(u.x - v.x, u.y - v.y) < 7));`);
    console.log('G3: the armies close at tick', near);
    await battleZoom(page, 2);
    const dir2 = await capture(page, 'M2', 6.5, frontCam(page, { frames: 6.5 * FPS, bias: 0.5, ease: 0.05, shift: [0, -10] }));
    writeEnv(dir2, { W: 960, H: 540, XF: 0.5, POSTER: 4.0 });
    await battleZoom(page, 3);
    const dir = await capture(page, 'G3', 8.5, frontCam(page, { frames: 8.5 * FPS, bias: 0.4, ease: 0.04, melee: false, shift: [0, -10] }));
    writeEnv(dir, { W: 960, H: 540, XF: 0.5, POSTER: 3.0 });
    await ctx.close();
    return errors;
  },
};

/** Steps the battle (no rendering) until `cond` (a body over s, sim) holds or `max` ticks; returns the tick or -1. */
const runUntil = (page, cond, max = 20 * 120) =>
  ev(page, ([body, max]) => {
    const s = window.__game.scene.getScene('Battle');
    const f = new Function('s', 'sim', body);
    while (s.sim.tick < max && s.sim.phase === 'battle') {
      s.sim.step();
      s.handleEvents(s.sim.drainEvents());
      if (f(s, s.sim)) return s.sim.tick;
    }
    return -1;
  }, [cond, max]);

// G1's skirmish: a hoplite line pins the Celts, the Companions ride round and hit their flank.
const FLANK_BATTLE = {
  seed: 207,
  label: 'Galatae',
  site: PLAIN,
  mine: [['hoplite', 7, 0, 'greek'], ['archer', 2, 1, 'greek'], ['companion', 3, 2, 'greek']], // 12: the field cap
  foes: [['celt_sword', 10, 0, 'celtic', 2], ['javelineer', 3, 1, 'celtic', 2]],
};
// tick 0: the line advances, the archers shoot; once the lines meet, the riders turn on the Celts' flank
const FLANK_SCRIPT = `
  const mine = sim.groups.filter((g) => g.side === 0 && !g.individual);
  const foe = sim.groups.find((g) => g.side === 1 && !g.individual);
  if (tick === 1) { sim.issue(0, { kind: 'order', group: mine[0].id, order: 'advance' }); sim.issue(0, { kind: 'loose', group: mine[1].id, on: true }); sim.issue(0, { kind: 'order', group: mine[1].id, order: 'advance' }); }
  const cav = mine[2];
  if (!window.__cavGo && sim.units.some((u) => u.side === 0 && u.group === mine[0].id && u.engaged)) window.__cavGo = tick;
  const centre = (side, gid) => {
    const a = sim.units.filter((u) => u.side === side && u.group === gid && u.state === 'ready');
    return { x: a.reduce((t, u) => t + u.x, 0) / a.length, y: a.reduce((t, u) => t + u.y, 0) / a.length };
  };
  // the riders swing wide to a point off the Celts' flank, a little behind it, then charge in
  if (window.__cavGo && tick === window.__cavGo + 5) {
    const e = centre(1, foe.id);
    const f = foe.formation;
    const fl = Math.hypot(f.fx, f.fy) || 1;
    const fx = f.fx / fl, fy = f.fy / fl;
    const c = centre(0, cav.id);
    // the side of the Celts' line the riders are already on
    const side = Math.sign((c.x - e.x) * -fy + (c.y - e.y) * fx) || 1;
    window.__cavAt = { x: e.x + -fy * side * 7 - fx * 3, y: e.y + fx * side * 7 - fy * 3 };
    sim.issue(0, { kind: 'form', group: cav.id, cx: window.__cavAt.x, cy: window.__cavAt.y, fx: e.x - window.__cavAt.x, fy: e.y - window.__cavAt.y, frontage: 5 });
  }
  if (window.__cavAt && !window.__cavCharge) {
    const c = centre(0, cav.id);
    if (Math.hypot(c.x - window.__cavAt.x, c.y - window.__cavAt.y) < 1.5 || tick > window.__cavGo + 200) {
      window.__cavCharge = tick;
      const e = centre(1, foe.id);
      sim.issue(0, { kind: 'form', group: cav.id, cx: c.x, cy: c.y, fx: e.x - c.x, fy: e.y - c.y, frontage: 5 });
      sim.issue(0, { kind: 'order', group: cav.id, order: 'charge' });
    }
  }
`;

/**
 * A ranked duel against the demo opponent, through the real duel hub (DuelScene, the in-memory demo
 * source the layout check uses): the demo duel army is filled to the duel cap with Glory recruits,
 * then "Find match" starts the battle. Returns once the duel battle is on its deployment.
 */
async function stageDuel(page) {
  await ev(page, () => window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Duel', { preview: true, tab: 'team' })));
  await page.waitForFunction(() => !!window.__game.scene.getScene('Duel').profile, null, { timeout: 30000 });
  for (const cls of ['hoplite', 'hoplite', 'peltast']) {
    const n = await ev(page, () => window.__game.scene.getScene('Duel').profile.heroes.length);
    await ev(page, (cls) => { const s = window.__game.scene.getScene('Duel'); void s.act(() => s.src.recruit(cls)); }, cls);
    await page.waitForFunction((n) => window.__game.scene.getScene('Duel').profile.heroes.length > n, n, { timeout: 10000 }).catch(() => {});
    await ev(page, () => {
      const s = window.__game.scene.getScene('Duel');
      const p = s.profile;
      const h = p.heroes[p.heroes.length - 1];
      if (!p.team.includes(h.id) && p.team.length < 10) s.toggleTeam(p, h);
    });
    await page.waitForTimeout(300);
  }
  await ev(page, () => { const s = window.__game.scene.getScene('Duel'); s.src.findDelayMs = 300; s.foundHoldMs = 300; s.openMode('ranked'); void s.fetchData(); });
  await page.waitForFunction(() => !!window.__game.scene.getScene('Duel').ranked, null, { timeout: 20000 });
  await ev(page, () => window.__game.scene.getScene('Duel').findMatch('ranked'));
  await page.waitForFunction(() => window.__game.scene.isActive('Battle') && !!window.__game.scene.getScene('Battle').sim, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  return ev(page, () => { const s = window.__game.scene.getScene('Battle'); s.hideBanner(); return { mine: s.sim.units.filter((u) => u.side === 0).length, foe: s.sim.units.filter((u) => u.side === 1).length, label: s.src?.label }; });
}

/**
 * The war map (OnlineScene) on its local demo shard (src/online/demoShard.ts, as
 * scripts/dev/war-table-shots.mjs uses), its UI camera hidden and the map camera given the whole frame.
 * Returns the world anchors of hexes `ids` (by role: 'me' = my army, 'raid' = the marching rival army,
 * 'rival' = the other army).
 */
async function stageWar(page, zoom) {
  await ev(page, () => window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Online', { preview: 'map' })));
  await page.waitForFunction(() => !!window.__game.scene.getScene('Online').map, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  return ev(page, (zoom) => {
    const s = window.__game.scene.getScene('Online');
    s.uiCam.setVisible(false);
    const cam = s.cameras.main;
    cam.setViewport(0, 0, s.scale.width, s.scale.height);
    cam.setZoom(zoom);
    const a = (h) => { const p = s.board.anchor(h); return { x: p.x, y: p.y, h }; };
    const m = s.map;
    const raid = m.armies.find((x) => x.path && x.player !== m.you.id);
    const rival = m.armies.find((x) => !x.path && x.player !== m.you.id);
    return { me: a(s.profile.army.loc), raid: a(raid.loc), raidTo: a(raid.path[raid.path.length - 1]), rival: a(rival.loc) };
  }, zoom);
}

/** A camera path through world points `pts` on scene `key`, eased in and out, whole world px. */
const panPath = (page, key, pts, frames) => (i) =>
  ev(page, ({ key, pts, k }) => {
    const s = window.__game.scene.getScene(key);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const f = e * (pts.length - 1);
    const j = Math.min(pts.length - 2, Math.floor(f));
    const t = f - j;
    const x = pts[j].x + (pts[j + 1].x - pts[j].x) * t;
    const y = pts[j].y + (pts[j + 1].y - pts[j].y) * t;
    s.cameras.main.centerOn(Math.round(x), Math.round(y));
  }, { key, pts, k: i / Math.max(1, frames - 1) });

/** The page-px centre of the UI element with id `id` (window.__layout, the layout check's handle), or null. */
const uiCentre = (page, id, nth = 0) =>
  ev(page, ([id, nth]) => {
    const el = window.__layout.collect().filter((e) => e.id === id && e.kind === 'interactive')[nth];
    if (!el) return null;
    const b = el.visible ?? el.rect; // canvas CSS px
    const r = window.__game.canvas.getBoundingClientRect();
    return [r.left + b.x + b.w / 2, r.top + b.y + b.h / 2];
  }, [id, nth]);

async function forgeClip(id, w, h) {
  const { page, ctx, errors } = await openGame(w, h);
  // a seeded item worth reforging (as the layout check stages it) and the gold to pay the Smith
  await ev(page, () => {
    const c = window.__state.campaign;
    c.data.gold = 1240;
    c.data.stash.push({ uid: 'rec-forge-1', def: 'falcata', rarity: 'legendary', cond: 90 });
    window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Settlement', { id: c.world.map.start, tab: 'rest' }));
  });
  await scene(page, 'Settlement');
  await page.waitForTimeout(1200);
  await ev(page, () => { const s = window.__game.scene.getScene('Settlement'); s.openForge(); s.openForgeItem('rec-forge-1'); });
  await page.waitForTimeout(900);
  const reforge = await uiCentre(page, 'forge.reforge');
  if (!reforge) throw new Error(`${id}: no Reforge button`);
  // pick the second line (a click on its row), then Reforge twice: the new value appears with its "was" note
  // the line rows are the sheet's unnamed interactive containers, in order
  const dir = await capture(page, id, 5.5, async (i) => {
    if (i === 20) { const p = await uiCentre(page, 'Container', 1); if (p) await page.mouse.click(p[0], p[1]); }
    if (i === 50 || i === 110) await page.mouse.click(reforge[0], reforge[1]);
  });
  writeEnv(dir, { W: w, H: h, XF: 0.5, POSTER: 2.4 });
  await ctx.close();
  return errors;
}

// ------------------------------------------------------------------ run

const ids = Object.keys(CLIPS).filter((k) => !only || only.includes(k));
let failed = 0;
for (const id of ids) {
  const t0 = Date.now();
  try {
    const errors = await CLIPS[id]();
    console.log(`${id}: ${((Date.now() - t0) / 1000).toFixed(0)} s${errors.length ? `, page errors: ${errors.join(' | ')}` : ''}`);
  } catch (e) {
    failed++;
    console.log(`${id}: FAILED ${e.stack ?? e}`);
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
