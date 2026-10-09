// Audio smoke test (Playwright, portrait phone, real touch events):
//  1. without any Web Audio (AudioContext removed) the game runs, taps work,
//     the settings modal opens and nothing logs an error;
//  2. with Web Audio the first tap unlocks the context, menu music runs,
//     effects play, Sound off suspends the context and a hidden page suspends it too.
// Usage: node scripts/audio-smoke.mjs [baseUrl]
import { launch, phoneContext, captureErrors, makePageApi, check, failureCount } from './lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const browser = await launch();

async function run(label, { noAudio }) {
  const ctx = await phoneContext(browser);
  if (noAudio) {
    await ctx.addInitScript(() => {
      delete window.AudioContext;
      delete window.webkitAudioContext;
      delete window.OfflineAudioContext;
    });
  }
  const page = await ctx.newPage();
  const errors = captureErrors(page);
  // taps dispatched inside the page (harness.mjs tap: a CDP tap read as a long-press in slow software WebGL)
  const { ev, wait, tap, tapLabel } = makePageApi(page, { tapWait: 300 });
  const dbg = () => ev(() => window.__audio.debug());

  await page.goto(base);
  await ev(() => localStorage.clear());
  await page.goto(base);
  await wait(2500);
  check(`[${label}] menu active`, await ev(() => window.__game.scene.isActive('Menu')));
  check(`[${label}] no context before a gesture`, (await dbg()).state === 'none');
  await tap(195, 40);
  const d = await dbg();
  if (noAudio) {
    check(`[${label}] audio reported unavailable`, d.available === false, JSON.stringify(d));
    check(`[${label}] play is a no-op`, (await ev(() => window.__audio.play('coin'))) === false);
  } else {
    check(`[${label}] first tap unlocks the context`, d.state === 'running', JSON.stringify(d));
    await wait(400);
    check(`[${label}] menu music playing`, (await dbg()).track === 'menu');
    check(`[${label}] effects play`, (await ev(() => window.__audio.play('coin'))) === true);
  }
  check(`[${label}] settings opens`, await tapLabel('Menu', 'Settings'));
  await wait(300);
  // the Sound switch of the settings sheet (by its layout id)
  const soundBtn = await ev(() => {
    const s = window.__game.scene.getScene('Menu');
    let b = null;
    const walk = (list) => {
      for (const o of list) {
        if (o.__uiId === 'settings.toggle.sound') b = o;
        if (o.list) walk(o.list);
      }
    };
    walk(s.children.list);
    if (!b) return null;
    // its own box (a container holding only a Graphics has no reliable getBounds)
    const m = b.getWorldTransformMatrix();
    return window.__css(m.tx + (b.w * m.a) / 2, m.ty + (b.h * m.d) / 2);
  });
  check(`[${label}] sound toggle present`, !!soundBtn);
  if (soundBtn) {
    await tap(soundBtn[0], soundBtn[1]);
    const s = await ev(() => window.__state.campaign.data.settings.sound);
    check(`[${label}] sound toggled off and saved in settings`, s === false);
    if (!noAudio) {
      await wait(200);
      check(`[${label}] muted suspends the context`, (await dbg()).state === 'suspended', JSON.stringify(await dbg()));
    }
    await tap(soundBtn[0], soundBtn[1]);
    await wait(200);
    if (!noAudio) check(`[${label}] unmuted runs again`, (await dbg()).state === 'running', JSON.stringify(await dbg()));
  }
  if (!noAudio) {
    await ev(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await wait(200);
    check(`[${label}] hidden page suspends`, (await dbg()).state === 'suspended');
    await ev(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await wait(200);
    check(`[${label}] visible again resumes`, (await dbg()).state === 'running');
  }
  if (!noAudio) {
    // a battle: deployment music, the battle track, effects under the voice cap, the result stinger
    await tapLabel('Menu', 'Close');
    await tapLabel('Menu', 'Begin the march');
    await wait(2500);
    check(`[${label}] world map plays the menu music`, (await dbg()).want === 'menu');
    await ev(() => {
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
      p.power = s.info.power * 1.4;
    });
    await tapLabel('World', 'Camp');
    for (let i = 0; i < 40 && !(await ev(() => !!window.__game.scene.getScene('World').dialog)); i++) await wait(250);
    await tapLabel('World', 'Attack');
    await wait(1500);
    check(`[${label}] deployment music`, (await dbg()).want === 'deploy', JSON.stringify(await dbg()));
    await tapLabel('Battle', 'Fight');
    await wait(500);
    check(`[${label}] battle music`, (await dbg()).want === 'battle');
    const before = (await dbg()).played;
    let maxVoices = 0;
    for (let i = 0; i < 150; i++) {
      const done = await ev(() => {
        const s = window.__game.scene.getScene('Battle');
        if (!s || !s.sim || s.sim.phase !== 'battle') return true;
        // march the lines into each other quickly (test staging), a few sim steps per frame
        for (let k = 0; k < 20 && s.sim.phase === 'battle'; k++) s.sim.step();
        return false;
      });
      maxVoices = Math.max(maxVoices, (await dbg()).voices);
      if (done || (await dbg()).played - before > 40) break;
      await wait(50);
    }
    const after = await dbg();
    check(`[${label}] battle sounds played`, after.played - before > 10, `played ${after.played - before}, dropped ${after.dropped}`);
    check(`[${label}] voice cap held`, maxVoices <= 12, `max ${maxVoices}`);
  }
  check(`[${label}] no console errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

try {
  await run('no Web Audio', { noAudio: true });
  await run('Web Audio', { noAudio: false });
} finally {
  await browser.close();
}
if (failureCount()) {
  console.log(`${failureCount()} failure(s)`);
  process.exit(1);
}
console.log('audio smoke OK');
