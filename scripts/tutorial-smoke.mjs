// Tutorial smoke test with real touch events (CDP) in a portrait phone viewport.
// A first launch offers the tutorial; the whole guided battle is played as old
// Nikias asks (select, pan, pinch zoom, drag to move, Fight, tap to
// move, shield wall, slingers loose, charge, Shield Bash, turning the line by its knob to a
// flank), then the reward (gold + a common item) and the modes screen. Also:
// an interrupted tutorial is offered again (resume), skip asks first and sticks,
// and a finished tutorial is not offered again.
// Saves shots/42-tutorial-narrator.png, 43-tutorial-gesture.png, 44-first-run.png
// (git-ignored; $SHOTS overrides the folder).
// Usage: node scripts/tutorial-smoke.mjs [baseUrl]
import { launch, phoneContext, captureErrors, apiDown, makePageApi, check, finish, shotsDir, until as untilNode } from './lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const shots = shotsDir();
const browser = await launch();

// a first launch: the onboarding is on
const ctx = await phoneContext(browser, { noFirstRun: false });
const page = await ctx.newPage();
const errors = captureErrors(page, { ignoreNetwork: true, echo: true });
await apiDown(page);
// taps dispatched inside the page (harness.mjs tap: a CDP tap read as a long-press in slow software WebGL)
const { ev, wait, tap, swipe: swipe0, pinch, until, active, tapLabel: tapBtn } = makePageApi(page, { tapWait: 250, step: 200 });
/** One finger along a polyline of screen points. */
const swipe = (points, steps = 8) => swipe0(points, { steps, hold: 30, after: 300 });

/** The tutorial's state. */
const tut = () =>
  ev(() => {
    const s = window.__game?.scene.getScene('Battle');
    const t = s?.tutorial;
    if (!s || !s.sys.isActive() || !t) return null;
    const h = t.spot.hole;
    // the lit hole (UI px) as a page rect (CSS px)
    const hole = h ? (([x, y], [x1, y1]) => ({ x, y, w: x1 - x, h: y1 - y }))(window.__css(h.x * s.m.S, h.y * s.m.S), window.__css((h.x + h.w) * s.m.S, (h.y + h.h) * s.m.S)) : null;
    return { step: t.step, phase: t.phase, typing: t.narrator.typing, hole };
  });
const talkingAt = (id, ms = 30000) => until(async () => {
  const x = await tut();
  return !!x && x.step === id && x.phase === 'talk';
}, ms);
/** Tap the middle of the lit element until the step changes. */
async function tapSpot(id, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const x = await tut();
    if (!x || x.step !== id || x.phase !== 'talk') return true;
    if (x.hole) await tap(x.hole.x + x.hole.w / 2, x.hole.y + x.hole.h / 2);
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

// ------------------------------------------------------------------ first launch

await page.goto(base);
await ev(() => localStorage.clear());
await page.goto(base);
check('first launch: the tutorial is offered', await until(() => active('FirstRun'), 15000));
check('offer screen', await ev(() => window.__game.scene.getScene('FirstRun').mode === 'offer'));
await wait(500);
await page.screenshot({ path: `${shots}/44-first-run.png` });
const gold0 = await ev(() => window.__state.campaign.data.gold);
check('Tutorial (recommended) starts the battle', (await tapBtn('FirstRun', 'Tutorial')) && (await until(() => active('Battle'), 8000)));
await until(async () => !!(await tut()), 8000);
check('narrator: intro', await talkingAt('intro', 8000));
// scripted touch events can stall under load; a stall must not read as the finger resting
await ev(() => { window.__game.scene.getScene('Battle').dwellMs = 5000; });

// intro (info): the first tap shows the whole line, the next goes on
await tap(195, 300);
await wait(200);
if ((await tut()).step === 'intro') await tap(195, 300);
check('select: hoplites card lit', await talkingAt('select', 8000));
await wait(1500);
await page.screenshot({ path: `${shots}/42-tutorial-narrator.png` });
// a tap outside the lit card does nothing
await tap(195, 400);
check('blocked outside the spotlight', (await tut()).step === 'select');
check('select done: tapped the card', await tapSpot('select'));

// pan: one finger on empty ground
check('pan step', await talkingAt('pan', 8000));
const emptyPt = await ev(() => {
  const s = window.__game.scene.getScene('Battle');
  const p = s.tutorial.emptySpot();
  return window.__css(p.x * s.m.S, p.y * s.m.S);
});
await swipe([emptyPt, [emptyPt[0] + (emptyPt[0] > 195 ? -100 : 100), emptyPt[1] + 20]]);
check('pan done', await doneWith('pan'));

// pinch zoom
check('zoom step', await talkingAt('zoom', 8000));
await pinch(170, 220, 360, 10);
check('pinch done', await doneWith('zoom'));

// the formation drag: carry the hoplites to the flag
check('move-drag step', await talkingAt('sling', 8000));
await ev(() => window.__game.scene.getScene('Battle').tutorial.narrator.finishTyping()); // the whole line in the screenshot
// the ghost hand half-way through its demonstration
await until(() => ev(() => { const g = window.__game.scene.getScene('Battle').tutorial.ghost; const t = window.__game.loop.time - g.start; return g.hands[0].visible && g.segs.length > 1 && t > g.segs[1].t0 + 150 && t < g.segs[1].t1; }), 12000, 50);
await page.screenshot({ path: `${shots}/43-tutorial-gesture.png` });
const sling = await ghostPts('slingDemo');
const o0 = await ev(() => window.__game.scene.getScene('Battle').sim.orderLog.length);
await swipe(sling, 10);
check('drag done (carried to the flag)', await doneWith('sling'), JSON.stringify(await ev(() => window.__game.scene.getScene('Battle').sim.orderLog.slice(-1))));
check('the drag gave a formation order', (await ev(() => window.__game.scene.getScene('Battle').sim.orderLog.length)) > o0);

// Fight!
check('fight step', await talkingAt('fight', 8000));
check('Fight! starts the battle', await tapSpot('fight'));
check('battle running', (await ev(() => window.__game.scene.getScene('Battle').sim.phase)) === 'battle');

// tap to move: on the flag
check('move step (battle paused)', await talkingAt('move', 10000));
check('paused while the narrator talks', await ev(() => window.__game.scene.getScene('Battle').paused));
const flag = await ev(() => {
  const s = window.__game.scene.getScene('Battle');
  const f = s.tutorial.flag;
  const p = s.tutorialHost().toUi(f.x, f.y);
  return window.__css(p.x * s.m.S, p.y * s.m.S);
});
await tap(flag[0], flag[1]);
check('tap to move done', await doneWith('move'));

// panel steps: the lit element each time (card, tab, command)
for (const id of ['wall', 'loose', 'charge']) {
  check(`${id} step`, await talkingAt(id, 15000));
  check(`${id} done through the lit buttons`, await tapSpot(id, 8));
}
check('ability step (in melee)', await talkingAt('ability', 40000));
check('Shield Bash used', await tapSpot('ability', 8));

// the flank: swing the facing knob toward the wave
check('flank step', await talkingAt('flank', 70000));
const turn = await ghostPts('turnDemo');
await swipe(turn, 10);
check('the line turned to face the flank', await doneWith('flank'), JSON.stringify(await ev(() => window.__game.scene.getScene('Battle').sim.groups[0].formation)));

// fight it out (fast-forward)
await ev(() => { window.__game.scene.getScene('Battle').speed = 3; });
check('victory', await talkingAt('victory', 150000), JSON.stringify(await tut()));
await wait(1500);
await tap(195, 400);
await wait(200);
if (await active('Battle')) await tap(195, 400);
check('reward screen', await until(() => ev(() => window.__game.scene.isActive('FirstRun') && window.__game.scene.getScene('FirstRun').mode === 'reward'), 8000));
const after = await ev(() => ({ gold: window.__state.campaign.data.gold, stash: window.__state.campaign.data.stash.map((i) => `${i.def}:${i.rarity}`), tut: window.__state.campaign.data.settings.tutorial }));
check('reward: gold', after.gold === gold0 + 60, `${gold0} -> ${after.gold}`);
check('reward: a common item', after.stash.includes('chalcidian:common'), after.stash.join(','));
check('tutorial done and saved', after.tut.status === 'done' && after.tut.rewarded === true);
await wait(1500);
check('Continue -> the two modes', (await tapBtn('FirstRun', 'Continue')) && (await until(() => ev(() => window.__game.scene.getScene('FirstRun').mode === 'modes'), 4000)));
await wait(800);
await page.screenshot({ path: `${shots}/44-first-run-modes.png` });
check('Campaign opens the map', (await tapBtn('FirstRun', 'Campaign')) && (await until(() => active('World'), 8000)));
await wait(800);
await page.reload();
check('done: no offer on the next launch', await until(() => active('Menu'), 15000));

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
check('coach mark: Next goes on', (await tapBtn('Online', 'Next')) && (await until(() => ev(() => window.__game.scene.getScene('Online').coach.current === null), 3000)));
await coachOn('map', 'neighbour');
const nb = await ev(() => {
  const s = window.__game.scene.getScene('Online');
  const r = s.coach.target().rect;
  return window.__css((r.x + r.w / 2) * s.m.S, (r.y + r.h / 2) * s.m.S);
});
await tap(nb[0], nb[1]);
check('coach mark: tapping the ringed neighbour opens it and goes on', await until(() => ev(() => window.__game.scene.getScene('Online').coach.current === null), 5000), JSON.stringify(await ev(() => window.__game.scene.getScene('Online').selected)));

// ------------------------------------------------------------------ resume and skip

const ctx2 = await phoneContext(browser, { noFirstRun: false, viewport: { width: 375, height: 667 } });
const p2 = await ctx2.newPage();
captureErrors(p2, { into: errors, console: false });
await apiDown(p2, '{}');
const api2 = makePageApi(p2, { tapWait: 0 });
const ev2 = api2.ev;
const until2 = (fn, ms = 15000) => untilNode(() => ev2(fn), ms, 200);
await p2.goto(base);
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
// skip asks first
await ev2(() => window.__game.scene.getScene('Battle').tutorial.askSkip());
check('skip asks first', await until2(() => window.__game.scene.getScene('Battle').tutorial.dialog !== null, 3000));
const skipAt = await ev2(() => {
  const s = window.__game.scene.getScene('Battle');
  let hit = null;
  const walk = (l) => l.forEach((o) => { if (o.opts && o.opts.label === 'Skip' && o.visible) hit = o; if (o.list) walk(o.list); });
  walk(s.children.list);
  const r = hit.getBounds();
  return window.__css(r.centerX, r.centerY);
});
await api2.tap(skipAt[0], skipAt[1]);
check('skipped: the modes screen', await until2(() => window.__game.scene.isActive('FirstRun') && window.__game.scene.getScene('FirstRun').mode === 'modes', 5000));
check('skip is saved', await ev2(() => window.__state.campaign.data.settings.tutorial.status === 'skipped'));
await p2.waitForTimeout(800);
await p2.reload();
check('skipped: not offered again', await until2(() => window.__game?.scene.isActive('Menu')));
await ctx2.close();

check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await finish({ browser, pass: 'TUTORIAL SMOKE PASSED', fail: (n) => `TUTORIAL SMOKE FAILED (${n})` });
