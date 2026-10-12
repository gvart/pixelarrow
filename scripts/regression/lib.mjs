// Shared helpers for the regression scripts (QA-02, scripts/regression/*.mjs).
//
// Everything waits on a real condition, never on a fixed sleep: the suite runs
// on a loaded machine where the game draws a few frames a second.
//   - a scene is "settled" when it is active and running, its loader is idle
//     (late art such as the clan fresco has landed) and its entry motion is over
//     (BaseScene.enterMotion: ui.alpha ENTRY_ALPHA -> 1 and ui.x -> 0, or a
//     camera fade through parchment into and out of a field). Taps land during
//     the entry (V5-067, the 'V5-067' flow in hub-flows.mjs); the wait keeps
//     positions and screenshots steady;
//   - Back is Telegram's header Back (the fake WebApp's BackButton), the path a
//     player takes, so the nav stack is tested through its real host.
import { launch, phoneContext, captureErrors, apiDown, makePageApi, check, finish, until } from '../lib/harness.mjs';
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
        if (s.cameras.cameras.some((c) => c.fadeEffect.isRunning)) return false;
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

/**
 * Page point of a kit button (found by layout id) once it stands still: the same on two reads at least two
 * game frames apart (a list a finger flung keeps gliding, a frame at a time; on a loaded machine for
 * seconds). In a scroll list the point must also lie in the list's window: rows are built a little beyond
 * it, under the clip, where a tap lands on whatever is drawn there. Null when it is not there once still.
 */
export async function steadyBtn(api, scene, id, ms = 15000) {
  const read = () =>
    api.ev(
      ([k, id]) => {
        const frame = window.__game.loop.frame;
        let b = null;
        const walk = (list) => list.forEach((o) => (o.visible && o.__uiId === id && (b = o), o.list && walk(o.list)));
        walk(window.__game.scene.getScene(k).children.list);
        if (!b) return { frame, p: null };
        const r = b.getBounds();
        // a scroll area's content sits in a container whose first child is the area's drag zone (src/ui/kit.ts ScrollArea)
        let view = true;
        for (let c = b.parentContainer; c; c = c.parentContainer) {
          const zone = c.mask && c.parentContainer?.list.find((o) => o.type === 'Zone' && o.input && o.x === c.x);
          if (!zone) continue;
          const z = zone.getBounds();
          view = r.centerY > z.top && r.centerY < z.bottom;
          break;
        }
        return { frame, p: [...window.__css(r.centerX, r.centerY), view] };
      },
      [scene, id],
    );
  let a = await read();
  for (let t = 0; t < ms; t += 200) {
    await api.wait(200);
    const b = await read();
    if (b.frame - a.frame < 2) continue;
    if (!a.p && !b.p) return null;
    if (a.p && b.p && Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]) < 0.5) return b.p[2] ? b.p.slice(0, 2) : null;
    a = b;
  }
  return null;
}

/**
 * A check for a reported, still open game bug (listed in tests/regression/SUITE.md "Known bugs"). It does
 * not fail the run, but never reads as a pass either: it prints KNOWN with the bug id, and once the bug is
 * fixed it prints a PASS that asks for the mark to go, so the check becomes a plain one.
 */
let knownOpen = 0;
export function known(bug, name, ok, detail = '') {
  if (!ok) knownOpen++;
  if (ok) console.log(`PASS ${name} (known bug ${bug} no longer reproduces: make this a plain check)`);
  else console.log(`KNOWN ${bug} ${name} ${detail}`);
}

/** Ends the run (closes the browser, exit 1 on any FAIL); the verdict line names the known bugs still open. */
export const done = (browser) => finish({ browser, pass: knownOpen ? `ALL PASS except ${knownOpen} KNOWN bug check(s)` : 'ALL PASS' });

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
