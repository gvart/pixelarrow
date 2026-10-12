// Regression: the kit controls answer taps (production/qa/qa-plan-v5.md §5.3; tests/regression/SUITE.md).
// A control can draw perfectly and take no tap: the F-07 refactor dropped the Settings Toggle's hit box
// (7575ce6), every switch ignored taps, and neither the layout check nor a pixel diff could see it. Here each
// control is tapped like a finger (in-page touch at its centre, once it stands still) and something it does
// must follow:
//   1. Settings: every switch, tapped, flips its saved setting and saves (the save's seq moves on); tapped
//      again, it flips back. The language tabs (kit Tabs) pick a language; the sheet's X (MIconButton) closes it;
//   2. a sample of each kit control type on a few screens: MButton (Begin the march; the battle menu's Sound),
//      StoneTile (the hub's Army), MIconButton (a hero's group numeral), the tab bar (Duels), KeyButton (the
//      battle's zoom key and ⋯).
// Usage: node scripts/regression/controls.mjs [baseUrl]   (needs a running preview server)
import { launch, check, until, baseUrl, openGame, settled, running, startScene, steadyBtn, need, flow, done } from './lib.mjs';

const base = baseUrl();
const browser = await launch();
const t0 = Date.now();
const { errors, api, ok } = await openGame(browser, base);
check('boot: the Campaign hub settles', ok);

/** The settings record the save writes, and the save's sequence number. */
const saved = () => api.ev(() => ({ s: { ...window.__state.campaign.data.settings }, seq: window.__state.campaign.data.seq ?? 0 }));
/** A control by layout id in `scene`: its Toggle value and MIconButton variant (null when not there). */
const ctl = (scene, id) =>
  api.ev(
    ([k, id]) => {
      let b = null;
      const walk = (list) => list.forEach((o) => (o.visible && o.__uiId === id && (b = o), o.list && walk(o.list)));
      walk(window.__game.scene.getScene(k).children.list);
      return b && { value: b.value ?? null, variant: b.variant ?? null };
    },
    [scene, id],
  );

/**
 * Taps the control with layout id `id` like a finger once it stands still in view. In a scroll list it is
 * brought into view by short drags that end at rest (no fling); `down` false drags the other way.
 */
async function tapCtl(scene, id, { down = true } = {}) {
  for (let i = 0; i < 10; i++) {
    const p = await steadyBtn(api, scene, id, 10000);
    if (p) {
      await api.tap(p[0], p[1]);
      return true;
    }
    // the finger stops before it lifts: the list does not glide on
    const [a, b] = down ? [600, 420] : [420, 600];
    await api.swipe([[195, a], [195, b], [195, b]], { steps: 8, after: 300 });
  }
  return false;
}

// ---------------------------------------------------------------- 1. Settings: every switch, the language tabs, the X
/** The switches in the sheet's order (src/ui/settings.ts ROWS): the setting each one saves. */
const SWITCHES = ['sound', 'dmgNumbers', 'pauseContact', 'pauseFlank', 'pauseRout', 'pauseDeath', 'reduceMotion', 'reduceShake', 'reduceFlash', 'haptics', 'leftHand', 'analytics'];

await flow('settings', async () => {
  const n = '[settings]';
  await api.ev(() => window.__tg.pressSettings());
  need(`${n} the sheet opens`, await until(() => api.ev(() => window.__nav.layers() === 1), 10000, 150));

  // the language tabs (kit Tabs) sit above the battle switches: pick English, then back to Auto
  for (const lang of ['en', 'auto']) {
    need(`${n} tab ${lang} tapped`, await tapCtl('Menu', `settings.lang.${lang}`));
    check(`${n} tab ${lang}: the language setting follows`, await until(async () => (await saved()).s.lang === lang, 8000, 150), JSON.stringify((await saved()).s.lang));
  }

  for (const key of SWITCHES) {
    const id = `settings.toggle.${key}`;
    for (const round of ['flips', 'flips back']) {
      const before = await ctl('Menu', id);
      const s0 = await saved();
      if (!(await tapCtl('Menu', id))) {
        check(`${n} ${key}: the switch is there`, false);
        break;
      }
      const want = !before?.value;
      const ok = await until(async () => {
        const s1 = await saved();
        return s1.s[key] === want && s1.seq > s0.seq && (await ctl('Menu', id))?.value === want;
      }, 8000, 150);
      const s1 = await saved();
      check(`${n} ${key}: a tap ${round} the saved setting`, ok, JSON.stringify({ was: before?.value, now: s1.s[key], seq: [s0.seq, s1.seq] }));
      if (!ok) break;
    }
  }

  // the sheet's X (an MIconButton in the title) closes it
  const xId = await api.ev(() => {
    let id = null;
    const walk = (list) => list.forEach((o) => (o.visible && o.opts?.icon === 'xmark' && /\.close$/.test(o.__uiId ?? '') && (id = o.__uiId), o.list && walk(o.list)));
    walk(window.__game.scene.getScene('Menu').children.list);
    return id;
  });
  need(`${n} the sheet's X is there`, !!xId);
  need(`${n} the X tapped`, await tapCtl('Menu', xId));
  check(`${n} the X closes the sheet`, await until(() => api.ev(() => window.__nav.layers() === 0), 8000, 150), JSON.stringify(await api.ev(() => window.__nav.layers())));
});

// ---------------------------------------------------------------- 2. a sample of each control type
await flow('hub', async () => {
  const n = '[hub]';
  need(`${n} Menu settles`, (await startScene(api, 'Menu', {}), await settled(api, 'Menu')));
  // MButton: Begin the march
  need(`${n} MButton Begin the march tapped`, await tapCtl('Menu', 'menu.new'));
  check(`${n} MButton Begin the march opens the map`, await settled(api, 'World', 30000), JSON.stringify(await running(api)));
  // StoneTile: the hub's Army (enabled once a campaign is saved)
  await startScene(api, 'Menu', {});
  need(`${n} Menu settles again`, await settled(api, 'Menu'));
  need(`${n} StoneTile Army tapped`, await tapCtl('Menu', 'menu.army'));
  check(`${n} StoneTile Army opens the Army`, await settled(api, 'Army', 20000), JSON.stringify(await running(api)));
  // the tab bar: Duels
  await startScene(api, 'Menu', {});
  need(`${n} Menu settles a third time`, await settled(api, 'Menu'));
  need(`${n} tab Duels tapped`, await tapCtl('Menu', 'tab.duels'));
  check(`${n} tab Duels opens the Duels hub`, await settled(api, 'Duel', 20000), JSON.stringify(await running(api)));
});

await flow('army', async () => {
  const n = '[army]';
  await startScene(api, 'Army', { from: 'Menu' });
  need(`${n} the Army settles`, await settled(api, 'Army'));
  // MIconButton: the hero card's group numerals; an unlit one, tapped, puts the hero in that group (lit)
  need(`${n} the group numerals`, await until(async () => !!(await ctl('Army', 'army.group.0')), 10000, 150));
  const id = await api.ev(() => {
    let id = null;
    const walk = (list) => list.forEach((o) => (o.visible && /^army\.group\.\d$/.test(o.__uiId ?? '') && o.variant === 'secondary' && !id && (id = o.__uiId), o.list && walk(o.list)));
    walk(window.__game.scene.getScene('Army').children.list);
    return id;
  });
  need(`${n} an unlit group numeral`, !!id);
  need(`${n} MIconButton ${id} tapped`, await tapCtl('Army', id));
  check(`${n} MIconButton ${id} puts the hero in that group`, await until(async () => (await ctl('Army', id))?.variant === 'lit', 8000, 150), JSON.stringify(await ctl('Army', id)));
});

await flow('battle', async () => {
  const n = '[battle]';
  await api.ev(() => {
    window.__state.pending = null;
    window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', { fresh: true }));
  });
  need(`${n} the deployment settles`, (await settled(api, 'Battle', 30000)) && (await until(() => api.call('Battle', 'return !!s.sim && !!s.hud;'), 20000, 200)));
  await api.call('Battle', 's.hint?.destroy?.(); s.hint = null; return 1;');
  // KeyButton: the zoom key steps the zoom
  const z0 = await api.call('Battle', 'return s.zoomTo;');
  need(`${n} KeyButton zoom tapped`, await tapCtl('Battle', 'battle.zoom'));
  check(`${n} KeyButton zoom steps the zoom`, await until(async () => (await api.call('Battle', 'return s.zoomTo;')) !== z0, 8000, 150), JSON.stringify([z0, await api.call('Battle', 'return s.zoomTo;')]));
  // KeyButton: ⋯ opens the battle menu; MButton: its Sound row switches the sound
  need(`${n} KeyButton ⋯ tapped`, await tapCtl('Battle', 'battle.menu'));
  need(`${n} KeyButton ⋯ opens the menu`, await until(() => api.call('Battle', 'return !!s.menu && !s.menu.closed;'), 8000, 150));
  const s0 = await saved();
  need(`${n} MButton Sound tapped`, await tapCtl('Battle', 'battle.menu.sound'));
  check(`${n} MButton Sound switches the sound`, await until(async () => (await saved()).s.sound === !s0.s.sound, 8000, 150), JSON.stringify([s0.s.sound, (await saved()).s.sound]));
});

check('no page or console errors', errors.length === 0, errors.join(' | ').slice(0, 600));
console.log(`controls: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await done(browser);
