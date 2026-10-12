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
// Usage: node scripts/audio-smoke.mjs [baseUrl]
import { launch, phoneContext, captureErrors, makePageApi, check, failureCount } from './lib/harness.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const browser = await launch();

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
  const soundBtn = await idPos(ev, 'Menu', 'settings.toggle.sound');
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
    // FL-03: the mix in dB, three buses; Effects drives SFX and UI
    const m = (await dbg()).mix;
    check(`[${label}] buses in dB: music, SFX, UI`, [m.musicDb, m.sfxDb, m.uiDb].every((v) => Number.isFinite(v) && v <= 2 && v > -30), JSON.stringify(m));
    check(`[${label}] UI sounds on the UI bus`, (await ev(() => window.__audio.play('click'))) === true && (await dbg()).byId.click >= 1);
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

    // SND-02: the UI sounds through the real kit taps (deployment: the Undo chip and the Reset all confirm)
    const n = async (id) => (await dbg()).byId[id] ?? 0;
    const tapId = async (id) => {
      const p = await idPos(ev, 'Battle', id);
      if (p) await tap(p[0], p[1]);
      return !!p;
    };
    const was0 = { nope: await n('nope'), undo: await n('undo'), destroy: await n('destroy') };
    // nothing to undo yet: the chip is disabled, and a tap is the soft "no"
    check(`[${label}] deployment Undo chip present`, await tapId('battle.undo'));
    check(`[${label}] a disabled tap plays the soft no`, (await n('nope')) === was0.nope + 1, `nope ${was0.nope} -> ${await n('nope')}`);
    // one deployment step to take back (an empty inverse: the chip's sound is what is checked)
    await ev(() => {
      const s = window.__game.scene.getScene('Battle');
      s.deployUndo.push([], [0], s.chipNow());
      s.buildHud();
    });
    await wait(200);
    await tapId('battle.undo');
    check(`[${label}] the deployment Undo plays the reverse swish`, (await n('undo')) === was0.undo + 1, `undo ${was0.undo} -> ${await n('undo')}`);
    await ev(() => window.__game.scene.getScene('Battle').resetDeploy());
    await wait(300);
    check(`[${label}] Reset all confirm opens`, await tapLabel('Battle', 'Reset all'));
    await wait(200);
    check(`[${label}] a confirmed destructive action plays the low drum`, (await n('destroy')) === was0.destroy + 1, `destroy ${was0.destroy} -> ${await n('destroy')}`);

    await tapLabel('Battle', 'Fight');
    await wait(500);
    check(`[${label}] battle music`, (await dbg()).want === 'battle');

    // FL-03 (first, while the fight is fresh and running): every juice tier through the real hook (battleAudio, as drainLogged feeds it)
    await ev(() => window.__game.scene.getScene('Battle').setPaused(false));
    const tiers = ['thud', 'splinter', 'standardFall', 'groan', 'hornChord'];
    const was = (await dbg()).byId;
    await ev(() => {
      const s = window.__game.scene.getScene('Battle');
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
    const now = (await dbg()).byId;
    const missing = tiers.filter((id) => !((now[id] ?? 0) > (was[id] ?? 0)));
    check(`[${label}] juice tiers sound: impact, stakes, standard, rout, army break`, missing.length === 0, `missing ${missing.join(', ')}`);
    await wait(150);
    let mix = (await dbg()).mix;
    check(`[${label}] the army-break horns duck the music`, mix.duckMusicDb <= -6 && mix.liveMusicDuck < 0.6, JSON.stringify(mix));

    // FL-03: paused, only UI sounds
    await wait(450);
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
    await wait(3000);
    mix = (await dbg()).mix;
    check(`[${label}] the music comes back after the horns`, mix.duckMusicDb === 0 && mix.liveMusicDuck > 0.85, JSON.stringify(mix));
    await ev(() => window.__game.scene.getScene('Battle').setPaused(false));
    await wait(600);
    mix = (await dbg()).mix;
    check(`[${label}] play: the world gate opens again`, mix.paused === false && mix.liveWorld > 0.9, JSON.stringify(mix));
    check(`[${label}] play: field sounds again`, (await ev(() => window.__audio.play('clash', { pri: 9 }))) === true);
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

/** FL-03: the Sound toggle and the Effects volume persist across a reload. */
async function persist() {
  const label = 'persist';
  const ctx = await phoneContext(browser);
  const page = await ctx.newPage();
  const errors = captureErrors(page);
  const { ev, wait, tap, tapLabel } = makePageApi(page, { tapWait: 300 });
  const dbg = () => ev(() => window.__audio.debug());
  await page.goto(base);
  await ev(() => localStorage.clear());
  await page.goto(base);
  await wait(2500);
  await tap(195, 40);
  check(`[${label}] settings opens`, await tapLabel('Menu', 'Settings'));
  await wait(300);
  const down = await idPos(ev, 'Menu', 'settings.sfxVol.down');
  check(`[${label}] Effects stepper present`, !!down);
  const db0 = (await dbg()).mix.sfxDb;
  if (down) {
    await tap(down[0], down[1]);
    await tap(down[0], down[1]);
  }
  const vol = await ev(() => window.__state.campaign.data.settings.sfxVol);
  const db1 = (await dbg()).mix.sfxDb;
  check(`[${label}] Effects down two steps: 4 dB quieter`, vol === 5 && Math.abs(db0 - db1 - 4) < 1e-9, `vol ${vol}, ${db0} -> ${db1} dB`);
  const sound = await idPos(ev, 'Menu', 'settings.toggle.sound');
  if (sound) await tap(sound[0], sound[1]);
  check(`[${label}] Sound off`, (await ev(() => window.__state.campaign.data.settings.sound)) === false);
  await wait(800);
  await page.reload();
  await wait(2500);
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
} finally {
  await browser.close();
}
if (failureCount()) {
  console.log(`${failureCount()} failure(s)`);
  process.exit(1);
}
console.log('audio smoke OK');
