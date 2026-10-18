// Audio smoke test (Playwright, portrait phone, real touch events):
//  1. without any Web Audio (AudioContext removed) the game runs, taps work,
//     the settings modal opens and nothing logs an error;
//  2. with Web Audio the first tap unlocks the context, menu music runs,
//     effects play, Sound off suspends the context and a hidden page suspends it too;
//     FL-03: the dB buses (music, SFX, UI), the juice tiers' sounds through the real
//     battle hook, ducking under the army-break horns, and a paused battle that
//     keeps only UI sounds; SND-02: a disabled tap, the deployment Undo and a destructive
//     confirm play their UI sounds through the real kit taps;
//  3. the Sound toggle and the Effects volume survive a reload.
// Platform modes (scripts/lib/platform.mjs): telegram (fake WebApp) and web (no request to telegram.org).
// Usage: node scripts/audio-smoke.mjs <baseUrl> [--platform telegram|web|both]
import { launch, phoneContext, captureErrors, apiDown, makePageApi, check, failureCount, until, settled, nextFrame, steady } from './lib/harness.mjs';
import { cliArgs, platformMode, applyPlatform, launchUrl, checkPlatform, noTelegramRequests } from './lib/platform.mjs';
import { untilInPage } from './lib/settle.mjs';

// Every step waits on a state, never on a fixed sleep (docs/FLAKY.md F3): under load (software WebGL at a
// few frames a second, an audio clock that lags the wall clock) the old 150-3000 ms sleeps ran out before the
// game or the Web Audio graph got there. The context's resume() and suspend() are asynchronous, gain ramps run on
// the audio clock, and sheets slide in: each is polled until it holds, with a generous deadline.

const cli = cliArgs(process.argv.slice(2), 'scripts/audio-smoke.mjs');
const mode = await platformMode(import.meta.url, cli);
const base = launchUrl(cli.base, mode);
const browser = await launch();
const plats = [];

/** The page CSS centre of the object with layout id `id` in scene `key` (null if absent). */
const idPos = (ev, key, id) =>
  ev(
    ([k, want]) => {
      const s = window.__game.scene.getScene(k);
      let b = null;
      const walk = (list) => {
        for (const o of list) {
          if (o.__uiId === want) b = o;
          if (o.list) walk(o.list);
        }
      };
      walk(s.children.list);
      if (!b) return null;
      // its own box (a container holding only a Graphics has no reliable getBounds)
      const m = b.getWorldTransformMatrix();
      return window.__css(m.tx + (b.w * m.a) / 2, m.ty + (b.h * m.d) / 2);
    },
    [key, id],
  );

/** The menu is up and fully in (boot is slow under load). */
const menuIn = (api) => settled(api, 'Menu', 60000);

async function run(label, { noAudio }) {
  const ctx = await phoneContext(browser);
  plats.push(await applyPlatform(ctx, mode, { languageCode: 'en' }));
  if (noAudio) {
    await ctx.addInitScript(() => {
      delete window.AudioContext;
      delete window.webkitAudioContext;
      delete window.OfflineAudioContext;
    });
  }
  const page = await ctx.newPage();
  // the API down (503): in Telegram the online layer signs in, and no step may depend on a backend (the
  // preview server's /api proxy answered 502); the browser's own "Failed to load resource" lines are expected
  const errors = captureErrors(page, { ignoreNetwork: true });
  await apiDown(page);
  // taps dispatched inside the page (harness.mjs tap: a CDP tap read as a long-press in slow software WebGL)
  const api = makePageApi(page, { tapWait: 300 });
  const { ev, tap, btn } = api;
  const dbg = () => ev(() => window.__audio.debug());
  /** Polls a page function (no closure) on every frame until it holds. */
  const holds = (fn, ms = 15000) => untilInPage(page, fn, ms);
  /** Taps a button once it stands still (see steady); false if it never shows. */
  const tapLabel = async (key, label) => {
    const p = await steady(ev, () => btn(key, { label }));
    if (p) await tap(p[0], p[1]);
    return !!p;
  };

  // A fresh context starts with empty storage: one load. (A load, a clear and a reload raced the first launch's
  // own save under load, as in scripts/smoke.mjs, and the menu then offered Continue.)
  await page.goto(base);
  check(`[${label}] menu active`, await menuIn(api));
  if (!noAudio) await checkPlatform(page, mode, `[${label}] `);
  check(`[${label}] no context before a gesture`, (await dbg()).state === 'none');
  await tap(195, 40);
  // resume() is asynchronous: the context reports 'running' a moment after the gesture
  if (!noAudio) await holds(() => window.__audio.debug().state === 'running');
  const d = await dbg();
  if (noAudio) {
    check(`[${label}] audio reported unavailable`, d.available === false, JSON.stringify(d));
    check(`[${label}] play is a no-op`, (await ev(() => window.__audio.play('coin'))) === false);
  } else {
    check(`[${label}] first tap unlocks the context`, d.state === 'running', JSON.stringify(d));
    // the music player starts its track on its next tick once the context runs
    check(`[${label}] menu music playing`, await holds(() => window.__audio.debug().track === 'menu'), JSON.stringify(await dbg()));
    check(`[${label}] effects play`, (await ev(() => window.__audio.play('coin'))) === true);
  }
  check(`[${label}] settings opens`, await tapLabel('Menu', 'Settings'));
  // the Sound switch of the settings sheet (by its layout id), once the sheet has slid in
  const soundBtn = await steady(ev, () => idPos(ev, 'Menu', 'settings.toggle.sound'));
  check(`[${label}] sound toggle present`, !!soundBtn);
  if (soundBtn) {
    await tap(soundBtn[0], soundBtn[1]);
    const s = await ev(() => window.__state.campaign.data.settings.sound);
    check(`[${label}] sound toggled off and saved in settings`, s === false);
    // suspend() and resume() are asynchronous: poll the context's state
    if (!noAudio) check(`[${label}] muted suspends the context`, await holds(() => window.__audio.debug().state === 'suspended'), JSON.stringify(await dbg()));
    await tap(soundBtn[0], soundBtn[1]);
    if (!noAudio) check(`[${label}] unmuted runs again`, await holds(() => window.__audio.debug().state === 'running'), JSON.stringify(await dbg()));
  }
  if (!noAudio) {
    await ev(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    check(`[${label}] hidden page suspends`, await holds(() => window.__audio.debug().state === 'suspended'), JSON.stringify(await dbg()));
    await ev(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    check(`[${label}] visible again resumes`, await holds(() => window.__audio.debug().state === 'running'), JSON.stringify(await dbg()));
  }
  if (!noAudio) {
    // FL-03: the mix in dB, three buses; Effects drives SFX and UI
    const m = (await dbg()).mix;
    check(`[${label}] buses in dB: music, SFX, UI`, [m.musicDb, m.sfxDb, m.uiDb].every((v) => Number.isFinite(v) && v <= 2 && v > -30), JSON.stringify(m));
    check(`[${label}] UI sounds on the UI bus`, (await ev(() => window.__audio.play('click'))) === true && (await dbg()).byId.click >= 1);
  }
  if (!noAudio) {
    // a battle: deployment music, the battle track, effects under the voice cap, the result stinger
    await tapLabel('Menu', 'Close');
    // the sheet slides out: wait until it is gone, so the next tap reaches the menu
    await until(async () => !(await idPos(ev, 'Menu', 'settings.toggle.sound')), 15000, 100);
    await tapLabel('Menu', 'Begin the march');
    check(`[${label}] world map`, await settled(api, 'World', 30000));
    check(`[${label}] world map plays the menu music`, (await dbg()).want === 'menu', JSON.stringify(await dbg()));
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
    // game time runs slower than the wall clock when frames are slow: wait for the band's attack itself
    check(`[${label}] band attacks: encounter dialog`, await holds(() => !!window.__game.scene.getScene('World').dialog, 60000));
    await tapLabel('World', 'Attack');
    check(`[${label}] deployment`, await settled(api, 'Battle', 30000));
    check(`[${label}] deployment music`, await holds(() => window.__audio.debug().want === 'deploy'), JSON.stringify(await dbg()));

    // SND-02: the UI sounds through the real kit taps (deployment: the Undo chip and the Reset all confirm)
    const n = async (id) => (await dbg()).byId[id] ?? 0;
    const tapId = async (id) => {
      const p = await steady(ev, () => idPos(ev, 'Battle', id));
      if (p) await tap(p[0], p[1]);
      return !!p;
    };
    /** Polls sound `id`'s count until it reaches `want`; the count then. */
    const counted = async (id, want) => (await until(async () => (await n(id)) >= want, 15000, 100), n(id));
    const was0 = { nope: await n('nope'), undo: await n('undo'), destroy: await n('destroy') };
    // nothing to undo yet: the chip is disabled, and a tap is the soft "no"
    check(`[${label}] deployment Undo chip present`, await tapId('battle.undo'));
    const nope = await counted('nope', was0.nope + 1);
    check(`[${label}] a disabled tap plays the soft no`, nope === was0.nope + 1, `nope ${was0.nope} -> ${nope}`);
    // one deployment step to take back (an empty inverse: the chip's sound is what is checked)
    await ev(() => {
      const s = window.__game.scene.getScene('Battle');
      s.deployUndo.push([], [0], s.chipNow());
      s.buildHud();
    });
    await tapId('battle.undo');
    const undo = await counted('undo', was0.undo + 1);
    check(`[${label}] the deployment Undo plays the reverse swish`, undo === was0.undo + 1, `undo ${was0.undo} -> ${undo}`);
    await ev(() => window.__game.scene.getScene('Battle').resetDeploy());
    check(`[${label}] Reset all confirm opens`, await tapLabel('Battle', 'Reset all'));
    const destroy = await counted('destroy', was0.destroy + 1);
    check(`[${label}] a confirmed destructive action plays the low drum`, destroy === was0.destroy + 1, `destroy ${was0.destroy} -> ${destroy}`);

    await tapLabel('Battle', 'Fight');
    check(`[${label}] battle music`, await holds(() => window.__game.scene.getScene('Battle').sim.phase === 'battle' && window.__audio.debug().want === 'battle', 20000), JSON.stringify(await dbg()));

    // FL-03: every juice tier through the real hook (battleAudio, as drainLogged feeds it).
    // FLAKY.md F3: they were fed into the live fight, and the voice limiter (12 voices, src/audio/voices.ts) could
    // still hold the UI taps and the battle-start horns, whose ends are on the audio clock; a full limiter drops
    // the weakest newcomers, and thud and splinter (7 + 1) are the two weakest tiers (standardFall 8 + 2, groan
    // 8 + 1, hornChord 10 + 3). A live impact also spends the tier's 300 ms gap (HAPTIC_GAP_MS). Now: hold the
    // field (paused: no live events), wait until every earlier voice has ended and a tier gap of game time has
    // passed, then resume, feed the tiers and pause again in one evaluate, so no frame of the fight runs between.
    await ev(() => {
      const s = window.__game.scene.getScene('Battle');
      s.setPaused(true);
      window.__tierFrom = s.time.now;
    });
    check(`[${label}] the field holds: no voice playing, a tier gap passed`, await holds(() => window.__audio.debug().voices === 0 && window.__game.scene.getScene('Battle').time.now - window.__tierFrom > 300, 30000), JSON.stringify(await dbg()));
    const tiers = ['thud', 'splinter', 'standardFall', 'groan', 'hornChord'];
    const was = (await dbg()).byId;
    await ev(() => {
      const s = window.__game.scene.getScene('Battle');
      s.setPaused(false);
      const sim = s.sim;
      const g = sim.groups.find((x) => !x.disbanded) ?? sim.groups[0];
      const u = sim.units.find((x) => x.group === g.id) ?? sim.units[0];
      const foe = sim.units.find((x) => x.side !== u.side) ?? u;
      window.__audioBattle(s, sim, [
        { type: 'impact', tick: sim.tick, unit: u.id, by: foe.id },
        { type: 'stakesBreak', tick: sim.tick, unit: foe.id, x: u.x, y: u.y },
        { type: 'standardLost', tick: sim.tick, side: u.side, unit: u.id },
        { type: 'rout', tick: sim.tick, side: g.side, group: g.id },
        { type: 'armyBreak', tick: sim.tick, side: g.side },
      ], s.me);
      // pause at once: no new horn from the live fight muddies the duck below
      s.setPaused(true);
    });
    const d1 = await dbg();
    const now = d1.byId;
    const missing = tiers.filter((id) => !((now[id] ?? 0) > (was[id] ?? 0)));
    check(`[${label}] juice tiers sound: impact, stakes, standard, rout, army break`, missing.length === 0, `missing ${missing.join(', ')} ${JSON.stringify({ voices: d1.voices, dropped: d1.dropped, stolen: d1.stolen, gated: d1.gated, state: d1.state })}`);
    // the duck's gain ramps on the audio clock: poll it (the duck lasts as long as the horns sound)
    await holds(() => { const m = window.__audio.debug().mix; return m.duckMusicDb <= -6 && m.liveMusicDuck < 0.6; });
    let mix = (await dbg()).mix;
    check(`[${label}] the army-break horns duck the music`, mix.duckMusicDb <= -6 && mix.liveMusicDuck < 0.6, JSON.stringify(mix));

    // FL-03: paused, only UI sounds
    await holds(() => { const m = window.__audio.debug().mix; return m.paused === true && m.liveWorld < 0.05; });
    mix = (await dbg()).mix;
    check(`[${label}] paused: the world gate closes`, mix.paused === true && mix.liveWorld < 0.05, JSON.stringify(mix));
    check(`[${label}] paused: no field sound`, (await ev(() => window.__audio.play('clash'))) === false);
    const quiet = await ev(() => {
      const s = window.__game.scene.getScene('Battle');
      const before = window.__audio.stats.played;
      window.__audioBattle(s, s.sim, [{ type: 'armyBreak', tick: s.sim.tick, side: 1 }], s.me);
      return window.__audio.stats.played - before;
    });
    check(`[${label}] paused: battle events stay silent`, quiet === 0, `played ${quiet}`);
    check(`[${label}] paused: UI sounds still play`, (await ev(() => window.__audio.play('click'))) === true);
    await holds(() => { const m = window.__audio.debug().mix; return m.duckMusicDb === 0 && m.liveMusicDuck > 0.85; }, 30000);
    mix = (await dbg()).mix;
    check(`[${label}] the music comes back after the horns`, mix.duckMusicDb === 0 && mix.liveMusicDuck > 0.85, JSON.stringify(mix));
    // the first enemy blow auto-pauses once (QA-03 S3-9): spend it here, so it does not close the gate checked below
    await ev(() => {
      const s = window.__game.scene.getScene('Battle');
      s.firstContact.seen = true;
      s.setPaused(false);
    });
    await holds(() => { const m = window.__audio.debug().mix; return m.paused === false && m.liveWorld > 0.9; });
    mix = (await dbg()).mix;
    check(`[${label}] play: the world gate opens again`, mix.paused === false && mix.liveWorld > 0.9, JSON.stringify(mix));
    check(`[${label}] play: field sounds again`, (await ev(() => window.__audio.play('clash', { pri: 9 }))) === true);
    const before = (await dbg()).played;
    let maxVoices = 0;
    for (let i = 0; i < 150; i++) {
      const done = await ev(() => {
        const s = window.__game.scene.getScene('Battle');
        if (!s || !s.sim || s.sim.phase !== 'battle') return true;
        // a flank or a rout of ours auto-pauses (default on): the steps below would run on under a closed
        // world gate, and the scene drains their events only after the battle ends, every one gated.
        // Which fight comes up (and when it breaks) varies run to run: resume, as a player taps Play.
        if (s.paused) s.setPaused(false);
        // march the lines into each other quickly (test staging), a few sim steps per frame
        for (let k = 0; k < 20 && s.sim.phase === 'battle'; k++) s.sim.step();
        return false;
      });
      maxVoices = Math.max(maxVoices, (await dbg()).voices);
      if (done || (await dbg()).played - before > 40) break;
      // the scene drains the sim's events (and plays them) on its next frame
      await nextFrame(ev);
    }
    const after = await dbg();
    check(`[${label}] battle sounds played`, after.played - before > 10, `played ${after.played - before}, dropped ${after.dropped}, gated ${after.gated}`);
    check(`[${label}] voice cap held`, maxVoices <= 12, `max ${maxVoices}`);
  }
  check(`[${label}] no console errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/** FL-03: the Sound toggle and the Effects volume persist across a reload. */
async function persist() {
  const label = 'persist';
  const ctx = await phoneContext(browser);
  plats.push(await applyPlatform(ctx, mode, { languageCode: 'en' }));
  const page = await ctx.newPage();
  // the API down (503): in Telegram the online layer signs in, and no step may depend on a backend (the
  // preview server's /api proxy answered 502); the browser's own "Failed to load resource" lines are expected
  const errors = captureErrors(page, { ignoreNetwork: true });
  await apiDown(page);
  const api = makePageApi(page, { tapWait: 300 });
  const { ev, tap, btn } = api;
  const dbg = () => ev(() => window.__audio.debug());
  await page.goto(base);
  check(`[${label}] menu active`, await menuIn(api));
  await tap(195, 40);
  const settingsBtn = await steady(ev, () => btn('Menu', { label: 'Settings' }));
  if (settingsBtn) await tap(settingsBtn[0], settingsBtn[1]);
  check(`[${label}] settings opens`, !!settingsBtn);
  const down = await steady(ev, () => idPos(ev, 'Menu', 'settings.sfxVol.down'));
  check(`[${label}] Effects stepper present`, !!down);
  const db0 = (await dbg()).mix.sfxDb;
  if (down) {
    await tap(down[0], down[1]);
    await until(() => ev(() => window.__state.campaign.data.settings.sfxVol === 6), 15000, 100);
    await tap(down[0], down[1]);
    await until(() => ev(() => window.__state.campaign.data.settings.sfxVol === 5), 15000, 100);
  }
  const vol = await ev(() => window.__state.campaign.data.settings.sfxVol);
  const db1 = (await dbg()).mix.sfxDb;
  check(`[${label}] Effects down two steps: 4 dB quieter`, vol === 5 && Math.abs(db0 - db1 - 4) < 1e-9, `vol ${vol}, ${db0} -> ${db1} dB`);
  const sound = await idPos(ev, 'Menu', 'settings.toggle.sound');
  if (sound) await tap(sound[0], sound[1]);
  check(`[${label}] Sound off`, (await ev(() => window.__state.campaign.data.settings.sound)) === false);
  // reload once the settings are written: GameState.save chains its writes on `saving` (src/state.ts)
  await ev(() => window.__state.saving);
  await page.reload();
  check(`[${label}] menu active after the reload`, await menuIn(api));
  const st = await ev(() => ({ s: window.__state.campaign.data.settings, a: window.__audio.current }));
  check(`[${label}] after a reload Sound is still off`, st.s.sound === false && st.a.sound === false, JSON.stringify(st.a));
  check(`[${label}] after a reload Effects is still 5`, st.s.sfxVol === 5 && st.a.sfxVol === 5, JSON.stringify(st.a));
  await tap(195, 40);
  check(`[${label}] muted: a tap creates no context`, (await dbg()).state === 'none', JSON.stringify(await dbg()));
  check(`[${label}] no console errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

try {
  await run('no Web Audio', { noAudio: true });
  await run('Web Audio', { noAudio: false });
  await persist();
  for (const p of plats) noTelegramRequests(p);
} finally {
  await browser.close();
}
if (failureCount()) {
  console.log(`${failureCount()} failure(s)`);
  process.exit(1);
}
console.log('audio smoke OK');
