// Keyboard smoke (V6-INP-06; design/ux/input-v6.md §6, §8, §11; ADR-0012 browser list): played with real key
// presses (page.keyboard) and the mouse at the laptop sizes, in both platform modes.
//   1. desktop (1280x800, 1920x1080): no keycaps before a key; after the first key the battle HUD shows them with
//      the bound labels (FIGHT Enter, Shape S, Groups A, ⋯ M, zoom =; the order bar Q W E R T once a group is
//      selected by its number); a hover tip names the key; Show key hints off hides them; a rebound key shows
//      at once on its keycap and in the sheet; ? opens the shortcuts sheet, Esc closes it; in the fight the sheet
//      pauses and Esc lets the fight run on; F1 and Tab work on the Campaign hub.
//   2. a Russian layout (a fake Keyboard Layout Map): keycaps read Ы for S and Й for Q.
//   3. touch (390x844, no key pressed): no keycaps and no Controls rows in Settings.
//   4. hybrid (1280x800 with touch): a finger tap adds no keycaps; the first key does.
// Usage: node scripts/keyboard-smoke.mjs <baseUrl> [--platform telegram|web|both] [--shots <dir>]
import { launch, check, until, settled, need, flow, done, usePlatform, entryUrl, baseUrl, scriptArgs } from './regression/lib.mjs';
import { PHONE, apiDown, captureErrors, makePageApi, prepContext } from './lib/harness.mjs';

const base = baseUrl();
const args = scriptArgs();
const shotsDir = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const browser = await launch();
const t0 = Date.now();

/** A Russian ЙЦУКЕН Keyboard Layout Map, as Chromium gives one (only the keys the checks read). */
const RU_LAYOUT = { KeyQ: 'й', KeyW: 'ц', KeyE: 'у', KeyR: 'к', KeyT: 'е', KeyS: 'ы', KeyA: 'ф', KeyM: 'ь', KeyF: 'а', KeyU: 'г', KeyP: 'з', KeyG: 'п', Equal: '=', Slash: '.' };

/** Opens the game in a fresh context; resolves once the Campaign hub has settled. */
async function open({ viewport, touch = false, layout = null, lang = 'en' }) {
  const ctx = await browser.newContext(touch === 'phone' ? { ...PHONE } : { viewport, deviceScaleFactor: 1, hasTouch: !!touch });
  await ctx.addInitScript(() => (window.__noFirstRun = true));
  await prepContext(ctx);
  await usePlatform(ctx, { languageCode: lang });
  // no Keyboard Layout Map unless the run gives one (the US table), so labels do not depend on the host machine
  await ctx.addInitScript((l) => {
    const kb = l ? { getLayoutMap: async () => new Map(Object.entries(l)) } : undefined;
    Object.defineProperty(Navigator.prototype, 'keyboard', { configurable: true, get: () => kb });
  }, layout);
  const page = await ctx.newPage();
  const errors = captureErrors(page, { ignoreNetwork: true, stack: true });
  await apiDown(page);
  const api = makePageApi(page, { tapWait: 150, step: 200, btnWaitMs: 15000 });
  await page.goto(lang === 'en' ? entryUrl(base) : `${entryUrl(base, `?lang=${lang}`)}`, { timeout: 60000 });
  const ok = (await until(() => api.ev(() => !!window.__game?.scene.isActive('Menu')), 60000, 250)) && (await settled(api, 'Menu'));
  return { ctx, page, api, errors, ok };
}

/** The keycaps in a scene: action → label. */
const keycaps = (api, scene) =>
  api.ev((k) => {
    const out = {};
    const walk = (list) =>
      list.forEach((o) => {
        if (o.visible && typeof o.name === 'string' && o.name.startsWith('keycap.')) out[o.name.slice(7)] = o.list.find((c) => c.text !== undefined)?.text ?? '';
        if (o.list) walk(o.list);
      });
    walk(window.__game.scene.getScene(k).children.list);
    return out;
  }, scene);

/** A fresh deployment (the default battle), settled with its HUD; the deploy hint closed. */
async function battle(api) {
  await api.ev(() => {
    window.__state.pending = null;
    // no auto-pauses: a contact pause would read as "the sheet left the fight paused"
    Object.assign(window.__state.campaign.data.settings, { pauseContact: false, pauseFlank: false, pauseRout: false, pauseDeath: false });
    window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', { fresh: true }));
  });
  const ok = (await settled(api, 'Battle', 30000)) && (await until(() => api.call('Battle', 'return !!s.sim && !!s.hud;'), 20000, 200));
  await api.call('Battle', 's.hint?.destroy?.(); s.hint = null; return 1;');
  return ok;
}

const rebuild = (api) => api.call('Battle', 's.buildHud(); return 1;');
const layers = (api) => api.ev(() => window.__nav.layers());
const shortcutsShown = (api, scene) =>
  api.ev((k) => {
    let found = false;
    const walk = (list) => list.forEach((o) => ((o.__uiId === 'shortcuts.edit' && o.visible && (found = true)), o.list && walk(o.list)));
    walk(window.__game.scene.getScene(k).children.list);
    return found;
  }, scene);
const shot = async (page, name) => shotsDir && page.screenshot({ path: `${shotsDir}/${name}.jpg`, type: 'jpeg', quality: 70 });

// ---------------------------------------------------------------- 1. desktop sizes, keys only
for (const [w, h] of [
  [1280, 800],
  [1920, 1080],
]) {
  const size = `${w}x${h}`;
  await flow(`desktop ${size}`, async () => {
    const n = `[${size}]`;
    const { page, api, errors, ok, ctx } = await open({ viewport: { width: w, height: h } });
    need(`${n} boot: the Campaign hub settles`, ok);

    // the Campaign hub, keyboard only: Tab focuses a control, ? and F1 open the sheet, Esc closes it
    await page.keyboard.press('Tab');
    check(`${n} Tab: a control on the hub takes focus`, await until(() => api.ev(() => window.__focus.focused !== null), 5000, 150));
    await page.keyboard.press('Shift+Slash');
    check(`${n} ? opens the shortcuts sheet on the hub`, await until(() => shortcutsShown(api, 'Menu'), 8000, 150));
    await shot(page, `${size}-shortcuts-sheet`);
    await page.keyboard.press('Shift+Slash');
    check(`${n} a second ? opens no second sheet`, (await layers(api)) === 1, `layers ${await layers(api)}`);
    await page.keyboard.press('Escape');
    check(`${n} Esc closes the sheet`, await until(async () => (await layers(api)) === 0 && !(await shortcutsShown(api, 'Menu')), 8000, 150));
    await page.keyboard.press('F1');
    check(`${n} F1 opens the sheet too`, await until(() => shortcutsShown(api, 'Menu'), 8000, 150));
    await page.keyboard.press('Escape');
    need(`${n} Esc closes it again`, await until(async () => (await layers(api)) === 0, 8000, 150));

    // the battle: keycaps after the key presses above (the keyboard is known now)
    need(`${n} the deployment settles`, await battle(api));
    const caps = await keycaps(api, 'Battle');
    check(`${n} keycaps in deployment: FIGHT Enter, Shape S, Groups A, ⋯ M, zoom =`, caps['deploy.fight'] === 'Enter' && caps['deploy.shape'] === 'S' && caps['deploy.groups'] === 'A' && caps['menu.battle'] === 'M' && caps['cam.zoom.in'] === '=', JSON.stringify(caps));
    check(`${n} group cards show no keycap (their numeral is the key)`, !Object.keys(caps).some((k) => k.startsWith('group.')), JSON.stringify(caps));
    // a hover tip names the key: rest the mouse on ⋯
    const menuAt = await api.ev(() => {
      let b = null;
      const walk = (list) => list.forEach((o) => ((o.__uiId === 'battle.menu' && (b = o)), o.list && walk(o.list)));
      walk(window.__game.scene.getScene('Battle').children.list);
      const r = b.getBounds();
      return window.__css(r.centerX, r.centerY);
    });
    await page.mouse.move(menuAt[0] - 40, menuAt[1] + 40);
    await page.mouse.move(menuAt[0], menuAt[1], { steps: 4 });
    check(`${n} the ⋯ hover tip names its key "(M)"`, await until(async () => (await api.sceneText('Battle')).includes('(M)'), 6000, 200));
    await page.mouse.move(menuAt[0] - 200, menuAt[1] + 200);

    // Show key hints off: no keycaps; on again: back
    await api.ev(() => (window.__state.campaign.data.settings.keyHints = false));
    await rebuild(api);
    check(`${n} Show key hints off: no keycaps`, Object.keys(await keycaps(api, 'Battle')).length === 0, JSON.stringify(await keycaps(api, 'Battle')));
    await api.ev(() => (window.__state.campaign.data.settings.keyHints = true));
    await rebuild(api);
    check(`${n} Show key hints on: keycaps again`, Object.keys(await keycaps(api, 'Battle')).length > 0);

    // the fight: Enter starts it (no control focused); ? pauses it while the sheet is open, Esc lets it run on
    // Enter is FIGHT only with no control focused (§1.1): leave HUD focus first if a control kept it
    if (await api.ev(() => window.__focus.focused !== null)) await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    need(`${n} Enter: FIGHT`, await until(() => api.call('Battle', "return s.sim.phase === 'battle';"), 10000, 200));
    // the fight may open paused for planning: Space plays it, Space pauses it again, Space plays (P is the keycap)
    for (const want of [false, true, false]) {
      if ((await api.call('Battle', 'return s.paused;')) === want) continue;
      await page.keyboard.press('Space');
      check(`${n} Space ${want ? 'pauses' : 'plays'}`, await until(async () => (await api.call('Battle', 'return s.paused;')) === want, 5000, 150));
    }
    check(`${n} the Pause key's keycap reads P (the shorter of Space and P)`, (await keycaps(api, 'Battle'))['time.pause'] === 'P', JSON.stringify(await keycaps(api, 'Battle')));
    await page.keyboard.press('Shift+Slash');
    check(`${n} ? in the fight opens the sheet and pauses`, await until(async () => (await shortcutsShown(api, 'Battle')) && (await api.call('Battle', 'return s.paused;')), 8000, 150));
    await page.keyboard.press('Escape');
    check(`${n} Esc closes it and the fight runs on`, await until(async () => (await layers(api)) === 0 && !(await api.call('Battle', 'return s.paused;')), 8000, 150));
    // a group by its number: the order bar shows Q W E R (T when the group has a fifth order)
    await page.keyboard.press('Digit1');
    check(
      `${n} 1 selects a group in the fight; the order bar keycaps read Q W E R`,
      await until(async () => {
        const c = await keycaps(api, 'Battle');
        return c['order.advance'] === 'Q' && c['order.charge'] === 'W' && c['order.hold'] === 'E' && (c['order.shoot'] === undefined || c['order.shoot'] === 'R');
      }, 8000, 200),
      JSON.stringify(await keycaps(api, 'Battle')),
    );
    await shot(page, `${size}-battle-keycaps`);
    // rebinding shows at once: Advance on K, on its keycap and in the sheet
    await api.ev(() => {
      const k = window.__keys;
      k.setBindings({ ...k.bindings, 'order.advance': [{ code: 'KeyK' }, null] });
    });
    await rebuild(api);
    check(`${n} a rebound key shows on its keycap (Advance: K)`, (await keycaps(api, 'Battle'))['order.advance'] === 'K', JSON.stringify(await keycaps(api, 'Battle')));
    await page.keyboard.press('Shift+Slash');
    need(`${n} ? opens the sheet`, await until(() => shortcutsShown(api, 'Battle'), 8000, 150));
    check(`${n} the sheet lists the current binding (Advance K)`, await until(async () => /ADVANCE K\b/.test((await api.sceneText('Battle')).replace(/\s+/g, ' ')), 6000, 200), (await api.sceneText('Battle')).slice(-400));
    await page.keyboard.press('Escape');
    need(`${n} Esc closes the sheet in battle`, await until(async () => (await layers(api)) === 0, 8000, 150));
    await api.ev(() => window.__keys.setBindings({ ...window.__keys.bindings, 'order.advance': [{ code: 'KeyQ' }, null] }));

    check(`${n} no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  });
}

// ---------------------------------------------------------------- 2. a Russian layout: labels follow it
await flow('russian layout', async () => {
  const n = '[ru layout 1280x800]';
  const { page, api, errors, ok, ctx } = await open({ viewport: { width: 1280, height: 800 }, layout: RU_LAYOUT, lang: 'ru' });
  need(`${n} boot`, ok);
  await page.keyboard.press('Shift');
  need(`${n} the deployment settles`, await battle(api));
  check(`${n} keycaps read the layout's characters: Shape Ы, Groups Ф, ⋯ Ь`, await until(async () => {
    const c = await keycaps(api, 'Battle');
    return c['deploy.shape'] === 'Ы' && c['deploy.groups'] === 'Ф' && c['menu.battle'] === 'Ь';
  }, 8000, 200), JSON.stringify(await keycaps(api, 'Battle')));
  await page.keyboard.press('Enter');
  need(`${n} Enter: FIGHT`, await until(() => api.call('Battle', "return s.sim.phase === 'battle';"), 10000, 200));
  await page.keyboard.press('Digit1');
  check(`${n} the order bar: Й Ц У`, await until(async () => {
    const c = await keycaps(api, 'Battle');
    return c['order.advance'] === 'Й' && c['order.charge'] === 'Ц' && c['order.hold'] === 'У';
  }, 8000, 200), JSON.stringify(await keycaps(api, 'Battle')));
  await shot(page, 'ru-1280x800-battle-keycaps');
  check(`${n} no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
});

// ---------------------------------------------------------------- 3. touch: nothing keyboard-only shows
await flow('touch', async () => {
  const n = '[touch 390x844]';
  const { page, api, errors, ok, ctx } = await open({ touch: 'phone' });
  need(`${n} boot`, ok);
  need(`${n} the deployment settles`, await battle(api));
  check(`${n} no keycaps`, Object.keys(await keycaps(api, 'Battle')).length === 0, JSON.stringify(await keycaps(api, 'Battle')));
  await shot(page, 'touch-390x844-battle-no-keycaps');
  check(`${n} no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
});

// ---------------------------------------------------------------- 4. hybrid: a finger, then the keys
await flow('hybrid', async () => {
  const n = '[hybrid 1280x800 touch+keys]';
  const { page, api, errors, ok, ctx } = await open({ viewport: { width: 1280, height: 800 }, touch: true });
  need(`${n} boot`, ok);
  need(`${n} the deployment settles`, await battle(api));
  await api.tap(640, 300);
  check(`${n} a finger tap shows no keycaps`, Object.keys(await keycaps(api, 'Battle')).length === 0, JSON.stringify(await keycaps(api, 'Battle')));
  await page.keyboard.press('KeyG');
  check(`${n} the first key brings the keycaps`, await until(async () => Object.keys(await keycaps(api, 'Battle')).length > 0, 8000, 200));
  check(`${n} no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
});

console.log(`keyboard-smoke: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await done(browser);
