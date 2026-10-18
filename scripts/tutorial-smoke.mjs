// Tutorial smoke test with real touch events (CDP) in a portrait phone viewport.
// A first launch offers the tutorial; the whole guided battle is played as old
// Nikias asks (TUT-02): select, pan, pinch zoom, drag to move, Undo, Fight; then,
// paused, a plan (the slingers' Shoot, their focus on the javelin-men, Play), tap to
// move with a queued Then… Charge, Shield Bash, the morale glyph, and the reserve
// (IV) turned by its knob to the wave on its flank; then the reward (gold + a common
// item) and the modes screen. The guided battle is played twice: on a 390x844 phone
// and at 320x568 (in Telegram mode: Telegram full screen, the narrator must leave
// every lit control clear and in reach there too).
// Platform modes (scripts/lib/platform.mjs): `telegram` runs every page in the fake
// Telegram WebApp, `web` as a plain web page (no request to telegram.org).
// At every step: the lit control is never under the narrator (TUT-1), and the step
// is done by a tap or a drag on what is lit (nothing swallows it). Also: ✕ only hides
// the bubble (its "Nikias" key brings it back) and "Skip" asks first (TUT-2); an
// interrupted tutorial is offered again (resume), skip sticks, and a finished
// tutorial is not offered again; the online coach marks.
// Saves shots/<mode>/42-tutorial-narrator.png, 43-tutorial-gesture.png, 44-first-run*.png
// (git-ignored; $SHOTS overrides the folder).
// Usage: node scripts/tutorial-smoke.mjs <baseUrl> [--platform telegram|web|both]
import { launch, phoneContext, captureErrors, apiDown, makePageApi, check, finish, shotsDir, until as untilNode, realClock } from './lib/harness.mjs';
import { cliArgs, platformMode, applyPlatform, launchUrl, checkPlatform, noTelegramRequests } from './lib/platform.mjs';

const cli = cliArgs(process.argv.slice(2), 'scripts/tutorial-smoke.mjs');
const mode = await platformMode(import.meta.url, cli);
const base = cli.base;
const shots = shotsDir(mode);
const errors = [];
/** Every context's platform probe: web mode checks none of them asked telegram.org for anything. */
const plats = [];

/**
 * The guided battle, start to reward. `tag` names the run in the checks; `main`
 * also takes the screenshots and checks the reward and what follows it.
 */
async function guided(tag, ctxOpts, fake, main) {
  const t0 = Date.now();
  // a browser of its own: the parts run side by side, and one browser draws its pages one after another
  const browser = await launch();
  const ctx = await phoneContext(browser, { noFirstRun: false, ...ctxOpts });
  await realClock(ctx); // the game on real frame time, not in slow motion under load (harness.mjs)
  plats.push(await applyPlatform(ctx, mode, fake));
  const page = await ctx.newPage();
  captureErrors(page, { into: errors, ignoreNetwork: true, echo: true });
  await apiDown(page);
  // taps dispatched inside the page (harness.mjs tap: a CDP tap read as a long-press in slow software WebGL)
  const { ev, wait, tap, swipe: swipe0, pinch, until, active, tapLabel: tapBtn } = makePageApi(page, { tapWait: 250, step: 200 });
  /** One finger along a polyline of screen points. */
  const swipe = (points, steps = 8) => swipe0(points, { steps, hold: 30, after: 300 });
  const c = (name, ok, detail) => check(`${tag}: ${name}`, ok, detail);

  /** The tutorial's state: the step, the lit hole and the narrator (page CSS px). */
  const tut = () =>
    ev(() => {
      const s = window.__game?.scene.getScene('Battle');
      const t = s?.tutorial;
      if (!s || !s.sys.isActive() || !t) return null;
      const css = (r) => (r ? (([x, y], [x1, y1]) => ({ x, y, w: x1 - x, h: y1 - y }))(window.__css(r.x * s.m.S, r.y * s.m.S), window.__css((r.x + r.w) * s.m.S, (r.y + r.h) * s.m.S)) : null);
      const n = t.narratorRect();
      return { step: t.step, phase: t.phase, typing: t.narrator.typing, hole: css(t.spot.hole), narrator: css(n), folded: t.narrator.folded };
    });
  const talkingAt = (id, ms = 30000) => until(async () => {
    const x = await tut();
    return !!x && x.step === id && x.phase === 'talk';
  }, ms);
  const meets = (a, b) => !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  /** The lit control is never under the narrator (TUT-1, O2). */
  const clear = async (id) => {
    const x = await tut();
    c(`${id}: the narrator leaves the lit control clear`, !!x && !meets(x.hole, x.narrator), JSON.stringify(x));
  };
  /** Tap the middle of the lit element until the step changes (each tap must reach it). */
  async function tapSpot(id, tries = 6) {
    for (let i = 0; i < tries; i++) {
      const x = await tut();
      if (!x || x.step !== id || x.phase !== 'talk') return true;
      if (!meets(x.hole, x.narrator) && x.hole) await tap(x.hole.x + x.hole.w / 2, x.hole.y + x.hole.h / 2);
      await wait(350);
    }
    const x = await tut();
    return !x || x.step !== id || x.phase !== 'talk';
  }
  const doneWith = (id, ms = 4000) => until(async () => {
    const x = await tut();
    return !x || x.step !== id || x.phase !== 'talk';
  }, ms);
  /** A ghost demonstration's points (UI px) as page (CSS px) points. */
  const ghostPts = (fn) =>
    ev((f) => {
      const s = window.__game.scene.getScene('Battle');
      const g = s.tutorial[f]();
      return g ? g.pts.map((p) => window.__css(p.x * s.m.S, p.y * s.m.S)) : null;
    }, fn);
  /** A field point (paces) as a page point. */
  const fieldPt = (fn) =>
    ev((code) => {
      const s = window.__game.scene.getScene('Battle');
      const p = new Function('s', code)(s);
      const u = s.tutorialHost().toUi(p.x, p.y);
      return window.__css(u.x * s.m.S, u.y * s.m.S);
    }, fn);
  /** Tap a visible button of the Battle scene by its label (a sheet's row). */
  const tapObj = async (label) => {
    const at = await ev((l) => {
      const s = window.__game.scene.getScene('Battle');
      let hit = null;
      const walk = (list) => list.forEach((o) => { if (((o.opts && o.opts.label === l) || (o.o && o.o.label === l)) && o.visible) hit = o; if (o.list) walk(o.list); });
      walk(s.children.list);
      if (!hit) return null;
      const r = hit.getBounds();
      return window.__css(r.centerX, r.centerY);
    }, label);
    if (at) await tap(at[0], at[1]);
    return !!at;
  };

  // ---------------------------------------------------------------- first launch
  await page.goto(launchUrl(base, mode));
  await ev(() => localStorage.clear());
  await page.reload();
  if (main) await checkPlatform(page, mode);
  c('first launch: the tutorial is offered', await until(() => active('FirstRun'), 15000));
  c('offer screen', await ev(() => window.__game.scene.getScene('FirstRun').mode === 'offer'));
  await wait(500);
  if (main) await page.screenshot({ path: `${shots}/44-first-run.png` });
  const gold0 = await ev(() => window.__state.campaign.data.gold);
  c('Tutorial (recommended) starts the battle', (await tapBtn('FirstRun', 'Tutorial')) && (await until(() => active('Battle'), 8000)));
  await until(async () => !!(await tut()), 8000);
  c('narrator: intro', await talkingAt('intro', 8000));
  // scripted touch events can stall under load; a stall must not read as the finger resting
  await ev(() => { window.__game.scene.getScene('Battle').dwellMs = 5000; });
  c('the generic hint is hidden: Nikias says what to do', await ev(() => (window.__game.scene.getScene('Battle').hintPill?.list.length ?? 0) === 0));

  // intro (info): the first tap shows the whole line, the next goes on
  const n0 = (await tut()).narrator;
  await tap(n0.x + n0.w / 2, n0.y + n0.h - 6);
  await wait(200);
  if ((await tut()).step === 'intro') await tap(n0.x + n0.w / 2, n0.y + n0.h - 6);
  c('select: hoplites card lit', await talkingAt('select', 8000));
  await wait(1500);
  if (main) await page.screenshot({ path: `${shots}/42-tutorial-narrator.png` });
  await clear('select');
  // ✕ only hides the bubble; its "Nikias" key brings the line back (TUT-2)
  await tapObj('Hide');
  c('✕ folds the bubble, the step goes on', await until(async () => { const x = await tut(); return !!x && x.folded && x.step === 'select' && x.phase === 'talk'; }, 3000));
  await tapObj('Nikias');
  c('the Nikias key brings him back', await until(async () => { const x = await tut(); return !!x && !x.folded && x.step === 'select'; }, 3000));
  // a tap outside the lit card does nothing
  const hs = (await tut()).hole;
  await tap(hs.x + hs.w / 2, Math.max(hs.y - 60, (await tut()).narrator.y + (await tut()).narrator.h + 10));
  c('blocked outside the spotlight', (await tut()).step === 'select');
  c('select done: tapped the card', await tapSpot('select'));

  // pan: one finger on empty ground
  c('pan step', await talkingAt('pan', 8000));
  const emptyPt = await ev(() => {
    const s = window.__game.scene.getScene('Battle');
    const p = s.tutorial.emptySpot();
    return window.__css(p.x * s.m.S, p.y * s.m.S);
  });
  await swipe([emptyPt, [emptyPt[0] + (emptyPt[0] > 160 ? -90 : 90), emptyPt[1] + 10]]);
  c('pan done', await doneWith('pan'));

  // pinch zoom, in the lit field
  c('zoom step', await talkingAt('zoom', 8000));
  const hz = (await tut()).hole;
  await pinch(hz.x + hz.w / 2 - 20, hz.x + hz.w / 2 + 20, hz.y + hz.h / 2, (ctxOpts.viewport?.width ?? 390) < 390 ? 30 : 60);
  if (!(await doneWith('zoom', 1500))) await ev(() => window.__game.scene.getScene('Battle').stepZoom()); // the zoom key, the single-tap way (A11Y-14)
  c('zoom done', await doneWith('zoom'));

  // the formation drag: carry the hoplites to the flag
  c('move-drag step', await talkingAt('sling', 8000));
  await ev(() => window.__game.scene.getScene('Battle').tutorial.narrator.finishTyping()); // the whole line in the screenshot
  // the ghost hand half-way through its demonstration, for the screenshot (only the main run takes one: at a frame a
  // second the window is often missed, and the wait's 240 polls each last a frame, minutes at 1920x1080)
  if (main) await until(() => ev(() => { const g = window.__game.scene.getScene('Battle').tutorial.ghost; const t = window.__game.loop.time - g.start; return g.hands[0].visible && g.segs.length > 1 && t > g.segs[1].t0 + 150 && t < g.segs[1].t1; }), 12000, 50);
  if (main) await page.screenshot({ path: `${shots}/43-tutorial-gesture.png` });
  const sling = await ghostPts('slingDemo');
  const o0 = await ev(() => window.__game.scene.getScene('Battle').sim.orderLog.length);
  await swipe(sling, 10);
  c('drag done (carried to the flag)', await doneWith('sling'), JSON.stringify(await ev(() => window.__game.scene.getScene('Battle').sim.orderLog.slice(-1))));
  c('the drag gave a formation order', (await ev(() => window.__game.scene.getScene('Battle').sim.orderLog.length)) > o0);

  // Undo: the lit chip takes the drag back
  c('undo step', await talkingAt('undo', 8000));
  await clear('undo');
  const before = await ev(() => { const f = window.__game.scene.getScene('Battle').sim.groups[0].formation; return [f.cx, f.cy]; });
  c('Undo done through the lit chip', await tapSpot('undo'));
  c('Undo took the drag back', await ev((b) => { const f = window.__game.scene.getScene('Battle').sim.groups[0].formation; return Math.hypot(f.cx - b[0], f.cy - b[1]) > 0.5; }, before));

  // Fight!
  c('fight step', await talkingAt('fight', 8000));
  await clear('fight');
  c('Fight! starts the battle', await tapSpot('fight'));
  c('battle running', (await ev(() => window.__game.scene.getScene('Battle').sim.phase)) === 'battle');

  // planning while paused: the slingers' Shoot and focus wait as a plan, Play gives it
  c('loose step (battle paused)', await talkingAt('loose', 10000));
  c('paused while the narrator talks', await ev(() => window.__game.scene.getScene('Battle').paused));
  await clear('loose');
  c('Shoot planned through the lit card and key', await tapSpot('loose', 8));
  c('Shoot waits in the plan, not given yet', await ev(() => { const s = window.__game.scene.getScene('Battle'); return !s.sim.groups[1].fireAtWill && s.plan.orders.some((o) => o.kind === 'loose' && o.group === 1); }));
  c('focus step', await talkingAt('focus', 8000));
  const jav = await fieldPt(`const m = s.sim.activeMembers(5); return { x: m.reduce((a, u) => a + u.x, 0) / m.length, y: m.reduce((a, u) => a + u.y, 0) / m.length - 0.3 };`);
  const hf = (await tut()).hole;
  c('the javelin-men are in the lit field', !!hf && jav[0] > hf.x && jav[0] < hf.x + hf.w && jav[1] > hf.y && jav[1] < hf.y + hf.h, JSON.stringify({ jav, hf }));
  await tap(jav[0], jav[1]);
  c('focus planned by tapping the javelin-men', await doneWith('focus'), JSON.stringify(await ev(() => window.__game.scene.getScene('Battle').plan.orders)));
  c('play step', await talkingAt('play', 8000));
  await clear('play');
  c('Play through the lit key', await tapSpot('play'));
  c('the plan went out: Shoot on, focus on the javelin-men', await ev(() => { const g = window.__game.scene.getScene('Battle').sim.groups[1]; return g.fireAtWill && g.focus === 5; }));

  // tap to move: on the flag, then Then… and Charge
  c('move step', await talkingAt('move', 10000));
  const flag = await fieldPt('return s.tutorial.flag;');
  await tap(flag[0], flag[1]);
  c('tap to move done', await doneWith('move'));
  c('then step', await talkingAt('then', 4000));
  await clear('then');
  c('Then… and Charge through the lit chip and key', await tapSpot('then', 8));
  c('the charge is queued for the arrival', await ev(() => window.__game.scene.getScene('Battle').thenQ.get(0) === 'charge'));

  // Shield Bash: its medallion, or on a short field the More key and the sheet's row
  c('ability step (in melee)', await talkingAt('ability', 60000));
  await clear('ability');
  const bash = await ev(() => window.__game.scene.getScene('Battle').tutorialHost().cmdBtns.has('bash'));
  if (bash) c('Shield Bash used', await tapSpot('ability', 8));
  else {
    const hm = (await tut()).hole;
    await tap(hm.x + hm.w / 2, hm.y + hm.h / 2);
    await wait(700);
    const name = await ev(() => { const s = window.__game.scene.getScene('Battle'); return s.abilityDefs().find((d) => d.key === 'bash')?.label ?? 'Shield Bash'; });
    c('Shield Bash used from the More sheet', (await tapObj(name)) && (await doneWith('ability')));
  }

  // the morale glyph: lit on the enemy badge, a tap goes on
  // the step waits up to 45 s of its own clock for a group to waver (preTimeout), then goes on without it. That
  // clock takes at most 100 ms a frame, so at a few frames a second (1920x1080 under load) 45 s is minutes of
  // wall time: wait on the tutorial's clock, not the wall's (a stalled clock still fails after 20 s)
  const moraleSeen = async () => {
    let last = -1;
    let stalled = Date.now();
    for (;;) {
      const x = await ev(() => { const t = window.__game.scene.getScene('Battle')?.tutorial; return t ? { step: t.step, phase: t.phase, timer: t.timer } : null; });
      if (!x || x.step !== 'morale') return 'skipped';
      if (x.phase === 'talk') return 'talk';
      if (x.timer !== last) { last = x.timer; stalled = Date.now(); }
      if (Date.now() - stalled > 20000) return 'stalled';
      await wait(300);
    }
  };
  await talkingAt('morale', 70000);
  const morale = (await tut())?.step === 'morale' ? await moraleSeen() : 'skipped';
  if (morale === 'skipped') c('morale: no group wavered within its 45 s, the lesson went on without it (preTimeout)', ['flank', 'win', 'victory'].includes((await tut())?.step), JSON.stringify(await tut()));
  else if (morale === 'talk') {
    await clear('morale');
    const nm = (await tut()).narrator;
    await tap(nm.x + nm.w / 2, nm.y + nm.h - 6);
    await wait(200);
    if ((await tut())?.step === 'morale') await tap(nm.x + nm.w / 2, nm.y + nm.h - 6);
    c('morale: a tap goes on', await doneWith('morale'));
  } else c('morale step (an enemy group wavers)', false, JSON.stringify(await tut()));

  // the flank: pick the reserve (IV), swing its knob toward the wave on its flank (O3: an unengaged line)
  c('flank step', await talkingAt('flank', 70000));
  await clear('flank');
  c('the reserve is not in melee', await ev(() => { const s = window.__game.scene.getScene('Battle'); return !s.sim.activeMembers(3).some((u) => u.engaged); }));
  c('the wave on its flank shows an arc', await ev(() => window.__game.scene.getScene('Battle').threats.get(3)?.length > 0));
  await tapSpot('flank', 1);
  c('IV picked through its lit card', await until(() => ev(() => window.__game.scene.getScene('Battle').selGroup === 3), 3000));
  await wait(400);
  await clear('flank (the knob)');
  const turn = await ghostPts('turnDemo');
  await swipe(turn, 10);
  c('IV turned to face the wave', await doneWith('flank'), JSON.stringify(await ev(() => window.__game.scene.getScene('Battle').sim.groups[3].formation)));

  // fight it out (fast-forward)
  await ev(() => { window.__game.scene.getScene('Battle').speed = 3; });
  c('victory', await talkingAt('victory', 150000), JSON.stringify(await tut()));
  await wait(1500);
  const nv = (await tut()).narrator;
  await tap(nv.x + nv.w / 2, nv.y + nv.h - 6);
  await wait(200);
  if (await active('Battle')) await tap(nv.x + nv.w / 2, nv.y + nv.h - 6);
  c('reward screen', await until(() => ev(() => window.__game.scene.isActive('FirstRun') && window.__game.scene.getScene('FirstRun').mode === 'reward'), 8000));
  const after = await ev(() => ({ gold: window.__state.campaign.data.gold, stash: window.__state.campaign.data.stash.map((i) => `${i.def}:${i.rarity}`), tut: window.__state.campaign.data.settings.tutorial }));
  c('reward: gold', after.gold === gold0 + 60, `${gold0} -> ${after.gold}`);
  c('reward: a common item', after.stash.includes('chalcidian:common'), after.stash.join(','));
  c('tutorial done and saved', after.tut.status === 'done' && after.tut.rewarded === true);
  if (main) {
    await wait(1500);
    c('Continue -> the two modes', (await tapBtn('FirstRun', 'Continue')) && (await until(() => ev(() => window.__game.scene.getScene('FirstRun').mode === 'modes'), 4000)));
    await wait(800);
    await page.screenshot({ path: `${shots}/44-first-run-modes.png` });
    c('Campaign opens the map', (await tapBtn('FirstRun', 'Campaign')) && (await until(() => active('World'), 8000)));
    await wait(800);
    await page.reload();
    c('done: no offer on the next launch', await until(() => active('Menu'), 15000));
  }
  console.log(`  (${tag}: ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  return { close: () => browser.close(), page, ev, wait, tap, until, tapBtn };
}

/** The 390x844 lesson (the screenshots, the reward and what follows), then the online coach marks on its page. */
async function phone() {
  const run = await guided('390', {}, { languageCode: 'en' }, true);
  const { ev, wait, tap, until } = run;
  const page = run.page;

  // ------------------------------------------------------------------ online coach marks (local demo shard)

  const coachOn = async (preview, coach) => {
    await ev(([p, c]) => window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Online', { preview: p, coach: c })), [preview, coach]);
    await until(() => ev(() => !!window.__game.scene.getScene('Online').map), 8000);
    if (preview === 'neutral') await until(() => ev(() => !!window.__game.scene.getScene('Online').detail), 5000);
    await wait(900);
  };
  await coachOn('neutral', 'attack');
  check('coach mark: Attack explained', await ev(() => window.__game.scene.getScene('Online').coach?.current === 'attack'));
  await page.screenshot({ path: `${shots}/45-online-coach.png` });
  await coachOn('map', 'home');
  check('coach mark: Next goes on', (await run.tapBtn('Online', 'Next')) && (await until(() => ev(() => window.__game.scene.getScene('Online').coach.current === null), 3000)));
  await coachOn('map', 'neighbour');
  const nb = await ev(() => {
    const s = window.__game.scene.getScene('Online');
    const r = s.coach.target().rect;
    return window.__css((r.x + r.w / 2) * s.m.S, (r.y + r.h / 2) * s.m.S);
  });
  await tap(nb[0], nb[1]);
  check('coach mark: tapping the ringed neighbour opens it and goes on', await until(() => ev(() => window.__game.scene.getScene('Online').coach.current === null), 5000), JSON.stringify(await ev(() => window.__game.scene.getScene('Online').selected)));
  await run.close();
}

// ------------------------------------------------------------------ Telegram full screen at 320x568: the whole lesson again

async function small() {
  // Telegram mode: in Telegram full screen (status bar and Telegram's pills over the top, the home indicator below)
  const run = await guided(mode === 'telegram' ? '320 TG' : '320 web', { viewport: { width: 320, height: 568 } }, { insets: { safeTop: 59, contentTop: 46, safeBottom: 34 }, fullscreen: 'launch', languageCode: 'en' }, false);
  await run.close();
}

// ------------------------------------------------------------------ phone landscape, laptop and full HD: the whole lesson again

// landscape-v6.md §13.1 (V6-RSCR-08): the HUD moved (thumb rail, bottom-centre orders), the narrator docks
// top-left of the field, and every lit control must still be clear of it and in reach
const wide = async (w, h) => {
  const run = await guided(`${w}x${h}`, { viewport: { width: w, height: h } }, { languageCode: 'en' }, false);
  await run.close();
};

// ------------------------------------------------------------------ resume and skip

async function resumeAndSkip() {
  const browser = await launch();
  const ctx2 = await phoneContext(browser, { noFirstRun: false, viewport: { width: 375, height: 667 } });
  await realClock(ctx2);
  plats.push(await applyPlatform(ctx2, mode, { languageCode: 'en' }));
  const p2 = await ctx2.newPage();
  captureErrors(p2, { into: errors, console: false });
  await apiDown(p2, '{}');
  const api2 = makePageApi(p2, { tapWait: 0 });
  const ev2 = api2.ev;
  const until2 = (fn, ms = 15000) => untilNode(() => ev2(fn), ms, 200);
  await p2.goto(launchUrl(base, mode));
  await until2(() => window.__game?.scene.isActive('FirstRun'));
  await ev2(() => window.__game.scene.getScene('FirstRun').startTutorial());
  await until2(() => window.__game.scene.getScene('Battle')?.tutorial?.step === 'intro');
  // learn two steps, then the app "closes"
  await ev2(() => { const t = window.__game.scene.getScene('Battle').tutorial; t.narrator.finishTyping(); t.tapInfo(); });
  await until2(() => window.__game.scene.getScene('Battle').tutorial.step === 'select');
  await ev2(() => { const s = window.__game.scene.getScene('Battle'); s.tutorialHost().select(0); });
  await until2(() => window.__game.scene.getScene('Battle').tutorial.step === 'pan');
  await p2.waitForTimeout(800);
  await p2.reload();
  check('interrupted: resume offered', await until2(() => window.__game?.scene.isActive('FirstRun') && window.__game.scene.getScene('FirstRun').mode === 'resume'));
  await ev2(() => window.__game.scene.getScene('FirstRun').startTutorial());
  check('resumed past the learned steps (pan next)', await until2(() => window.__game.scene.getScene('Battle')?.tutorial?.step === 'pan'), JSON.stringify(await ev2(() => window.__game.scene.getScene('Battle')?.tutorial?.plan)));
  // the narrator's Skip asks first (TUT-2)
  await until2(() => window.__game.scene.getScene('Battle').tutorial.talking, 5000);
  const skipKey = await ev2(() => {
    const s = window.__game.scene.getScene('Battle');
    let hit = null;
    const walk = (l) => l.forEach((o) => { if (o.opts && o.opts.label === 'Skip' && o.visible) hit = o; if (o.list) walk(o.list); });
    walk(s.tutorial.overlay.list);
    const r = hit.getBounds();
    return window.__css(r.centerX, r.centerY);
  });
  await api2.tap(skipKey[0], skipKey[1]);
  check('skip asks first', await until2(() => window.__game.scene.getScene('Battle').tutorial.dialog !== null, 3000));
  const skipAt = await ev2(() => {
    const s = window.__game.scene.getScene('Battle');
    let hit = null;
    const walk = (l) => l.forEach((o) => { if (o.opts && o.opts.label === 'Skip' && o.visible) hit = o; if (o.list) walk(o.list); });
    walk(s.tutorial.dialog.list);
    const r = hit.getBounds();
    return window.__css(r.centerX, r.centerY);
  });
  await api2.tap(skipAt[0], skipAt[1]);
  check('skipped: the modes screen', await until2(() => window.__game.scene.isActive('FirstRun') && window.__game.scene.getScene('FirstRun').mode === 'modes', 5000));
  check('skip is saved', await ev2(() => window.__state.campaign.data.settings.tutorial.status === 'skipped'));
  await p2.waitForTimeout(800);
  await p2.reload();
  check('skipped: not offered again', await until2(() => window.__game?.scene.isActive('Menu')));
  await browser.close();
}

// ------------------------------------------------------------------ the parts, `--jobs` at a time

// Each part has its own browser (its own storage and save), so they can run side by side
// (V6-QA-SPEED): `--jobs N` at a time (default 2; 1 = one after another), the longest first. Every check
// names its part.
const jobsArg = cli.args.indexOf('--jobs');
const JOBS = Math.max(1, Number(jobsArg >= 0 ? cli.args[jobsArg + 1] : 2) || 1);
const parts = [() => wide(1920, 1080), () => wide(1280, 800), phone, () => wide(844, 390), small, resumeAndSkip];
await Promise.all(
  Array.from({ length: Math.min(JOBS, parts.length) }, async () => {
    while (parts.length) await parts.shift()();
  }),
);


check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
for (const p of plats) noTelegramRequests(p);
await finish({ pass: 'TUTORIAL SMOKE PASSED', fail: (n) => `TUTORIAL SMOKE FAILED (${n})` });
