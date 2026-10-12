// Shared helpers for the regression scripts (QA-02, scripts/regression/*.mjs).
//
// Everything waits on a real condition, never on a fixed sleep: the suite runs
// on a loaded machine where the game draws a few frames a second.
//   - a scene is "settled" when it is active and running, its loader is idle
//     (late art such as the clan fresco has landed) and its entry motion is over
//     (BaseScene.enterMotion: ui.alpha 0 -> 1 and ui.x -> 0; until then Phaser
//     drops a touch on anything inside ui, FIXER-5);
//   - Back is Telegram's header Back (the fake WebApp's BackButton), the path a
//     player takes, so the nav stack is tested through its real host.
import { launch, phoneContext, captureErrors, apiDown, makePageApi, check, until } from '../lib/harness.mjs';
import { fakeTelegram } from '../lib/fakeTelegram.mjs';

/** The base URL from argv[2] (the runner passes the preview server's), with a trailing slash. */
export const baseUrl = () => (process.argv[2] ?? 'http://localhost:8047/').replace(/\/?$/, '/');

/**
 * A fresh phone page on `base`: fake Telegram (Back and Settings through its
 * buttons), the API down (503, so no step depends on a backend), first run
 * skipped. Waits until the Campaign hub has settled.
 */
export async function openGame(browser, base, { lang = 'en', viewport } = {}) {
  const ctx = await phoneContext(browser, viewport ? { viewport } : {});
  await ctx.addInitScript(fakeTelegram, { languageCode: lang });
  const page = await ctx.newPage();
  const errors = captureErrors(page, { ignoreNetwork: true, stack: true });
  await apiDown(page);
  await page.route('**/telegram.org/**', (r) => r.abort());
  const api = makePageApi(page, { tapWait: 150, step: 200, btnWaitMs: 15000 });
  await page.goto(base, { timeout: 60000 });
  const ok = await until(() => api.ev(() => !!window.__game?.scene.isActive('Menu')), 60000, 250);
  return { ctx, page, errors, api, ok: ok && (await settled(api, 'Menu')) };
}

/** True once `key` is the scene in front and has settled (see the header); polls up to `ms`. */
export function settled(api, key, ms = 20000) {
  return until(
    () =>
      api.ev((k) => {
        const g = window.__game;
        const s = g?.scene.getScene(k);
        // isActive: the scene's status is RUNNING (not starting or shutting down)
        if (!s || !s.sys.isActive()) return false;
        if (s.load.isLoading()) return false;
        return !s.ui || (s.ui.alpha === 1 && s.ui.x === 0);
      }, key),
    ms,
    150,
  );
}

/** The keys of the running scenes, in order. */
export const running = (api) => api.ev(() => window.__game.scene.getScenes(true).map((s) => s.scene.key));

/** Telegram's header Back (the fake WebApp's BackButton). */
export const pressBack = (api) => api.ev(() => window.__tg.pressBack());

/** What the nav stack offers now: Back shown, open layers. */
export const navState = (api) => api.ev(() => ({ back: window.__nav.canGoBack(), layers: window.__nav.layers(), tgBack: window.Telegram.WebApp.BackButton.isVisible }));

/** Starts scene `key` with `data` in place of every running scene (a door the script cannot reach by a tap). */
export const startScene = (api, key, data = {}) => api.start(key, data);

/** Taps a kit button found by its layout id; false when it is not on screen. */
export const tapId = (api, scene, id) => api.tapBtn(scene, { id });

/** A named check whose failure stops the steps that build on it (they would fail on in a wrong state). */
export function need(name, ok, detail = '') {
  check(name, ok, detail);
  if (!ok) throw new NeedFailed(name);
}
export class NeedFailed extends Error {
  constructor(name) {
    super(`ABORT after "${name}": the remaining steps of this flow depend on it`);
  }
}

/**
 * Runs one flow; a failed `need` ends that flow (named), not the script, so
 * the other flows still report. A crash is a FAIL with its message.
 */
export async function flow(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
  } catch (e) {
    if (e instanceof NeedFailed) console.log(`  ${e.message}`);
    else check(`${name}: ran to the end`, false, String(e?.stack ?? e).split('\n').slice(0, 3).join(' | '));
  }
  console.log(`  (${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

export { launch, check, until };
