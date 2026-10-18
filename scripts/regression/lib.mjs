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
//   - Back is the host's Back, the path a player takes, so the nav stack is
//     tested through its real host: in Telegram mode the header Back (the fake
//     WebApp's BackButton), on the web the browser's Back (history.back() on the
//     guard entry of src/platform/web/back.ts).
//
// Platform modes (scripts/lib/platform.mjs): every script takes
// `<baseUrl> [--platform telegram|web|both]`; with `both` it runs itself once
// per mode. `platform()` is this process's mode.
import { pathToFileURL } from 'node:url';
import { launch, phoneContext, captureErrors, apiDown, makePageApi, check, finish, until, settled, realClock } from '../lib/harness.mjs';
import { cliArgs, platformMode, applyPlatform, launchUrl, noTelegramRequests } from '../lib/platform.mjs';

const cli = cliArgs(process.argv.slice(2), 'scripts/regression/<script>.mjs');
// with `both`, the script that was run (argv[1]) runs again once per mode
const mode = await platformMode(pathToFileURL(process.argv[1]).href, cli);
/** This run's platform mode: 'telegram' or 'web'. */
export const platform = () => mode;
/** The script's own arguments (argv without the base URL and --platform). */
export const scriptArgs = () => cli.args;
/** The base URL (required: the runner passes its preview server's), with a trailing slash. */
export const baseUrl = () => cli.base;
/** Every context this run opened: web mode checks none of them asked telegram.org for anything (done()). */
const plats = [];
/** Puts a context in this run's platform mode (Telegram: the fake WebApp with `fake` options). */
export async function usePlatform(ctx, fake = {}) {
  const p = await applyPlatform(ctx, mode, fake);
  plats.push(p);
  return p;
}
/** The URL a launch opens in this mode (Telegram adds its launch hash). */
export const entryUrl = (base, path = '') => launchUrl(base, mode, path);

/**
 * A fresh phone page on `base` in this run's mode (Telegram: the fake WebApp,
 * Back and Settings through its buttons; web: a plain page), the API down (503,
 * so no step depends on a backend), first run skipped. Waits until the
 * Campaign hub has settled. `real`: the game clock on real frame time (harness.mjs realClock), so timers
 * and tweens do not crawl when the machine draws a few frames a second.
 */
export async function openGame(browser, base, { lang = 'en', viewport, real = false } = {}) {
  const ctx = await phoneContext(browser, viewport ? { viewport } : {});
  if (real) await realClock(ctx);
  await usePlatform(ctx, { languageCode: lang });
  const page = await ctx.newPage();
  const errors = captureErrors(page, { ignoreNetwork: true, stack: true });
  await apiDown(page);
  const api = makePageApi(page, { tapWait: 150, step: 200, btnWaitMs: 15000 });
  await page.goto(mode === 'web' && lang !== 'en' ? `${base}?lang=${lang}` : entryUrl(base), { timeout: 60000 });
  const ok = await until(() => api.ev(() => !!window.__game?.scene.isActive('Menu')), 60000, 250);
  return { ctx, page, errors, api, ok: ok && (await settled(api, 'Menu')) };
}

/** The keys of the running scenes, in order. */
export const running = (api) => api.ev(() => window.__game.scene.getScenes(true).map((s) => s.scene.key));

/**
 * The host's Back. Telegram: its header Back (the fake WebApp's BackButton). Web: the browser's Back, which
 * pops the guard entry the web adapter keeps while the game has somewhere to go back to; at a root there is
 * none and the browser would leave the page (by design, V6-033), so nothing is pressed there.
 */
export const pressBack = (api) =>
  mode === 'telegram'
    ? api.ev(() => window.__tg.pressBack())
    : api.ev(() => {
        if (!window.__nav.canGoBack() && !window.__nav.layers()) return false;
        return new Promise((done) => {
          addEventListener('popstate', () => done(true), { once: true });
          history.back();
          setTimeout(() => done(false), 5000);
        });
      });

/** The host's Settings entry: Telegram's ⋯ menu item, on the web the Campaign hub's Settings button. */
export const openSettings = (api) => (mode === 'telegram' ? api.ev(() => (window.__tg.pressSettings(), true)) : api.tapLabel('Menu', 'Settings'));

/**
 * What the nav stack offers now: Back shown, open layers, and `tgBack`, the host's Back armed (Telegram:
 * its header BackButton shown; web: the game has somewhere to go back to, so the browser's Back stays in it).
 */
export const navState = (api) =>
  api.ev((web) => ({ back: window.__nav.canGoBack(), layers: window.__nav.layers(), tgBack: web ? window.__nav.canGoBack() || window.__nav.layers() > 0 : window.Telegram.WebApp.BackButton.isVisible }), mode === 'web');

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
        let r = b.getBounds();
        // a container drawn with Graphics only (the Toggle) has no bounds: its own size through its transform
        if (!r.width && b.w && b.h) {
          const m = b.getWorldTransformMatrix();
          const c = m.transformPoint(b.w / 2, b.h / 2);
          r = { centerX: c.x, centerY: c.y };
        }
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
export const done = (browser) => (plats.forEach((p) => noTelegramRequests(p)), finish({ browser, pass: knownOpen ? `ALL PASS except ${knownOpen} KNOWN bug check(s)` : 'ALL PASS' }));

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

export { launch, check, until, settled };
