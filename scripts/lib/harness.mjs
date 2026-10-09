// Shared Playwright harness for the smoke tests, the layout check and the dev
// screenshot tools: the browser and phone context, the canvas coordinate
// helpers, error capture, PASS/FAIL bookkeeping and touch input.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root. */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Where screenshots and other generated media go: the git-ignored `shots/`
 * at the repository root (or $SHOTS), plus an optional subfolder. `override`
 * (a script's [outDir] argument) wins. The folder is created.
 */
export function shotsDir(sub = '', override) {
  const dir = override ? resolve(override) : join(process.env.SHOTS ? resolve(process.env.SHOTS) : join(ROOT, 'shots'), sub);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Chromium; PW_CHROMIUM picks a specific binary, else Playwright's own (PLAYWRIGHT_BROWSERS_PATH). */
export const launch = (opts = {}) => chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, ...opts });

/** A portrait phone (iPhone 12-14 size). */
export const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

/**
 * A phone browser context. `noFirstRun` (default on) skips the onboarding
 * (scripts/tutorial-smoke.mjs covers it); `prep` runs prepContext.
 * Other options go to browser.newContext (e.g. a different viewport).
 */
export async function phoneContext(browser, { noFirstRun = true, prep = true, ...opts } = {}) {
  const ctx = await browser.newContext({ ...PHONE, ...opts });
  if (noFirstRun) await ctx.addInitScript(() => (window.__noFirstRun = true));
  if (prep) await prepContext(ctx);
  return ctx;
}

/**
 * The canvas renders at device pixels (src/platform/renderScale.ts RS): game
 * px (scale.width, getBounds(), camera projections, UI px * m.S) are CSS px *
 * RS. Touches and page.mouse are CSS px. `__css(x, y)` maps game px to page
 * (CSS) px through the canvas rect, `__gamePt(x, y)` back, `__rs()` is RS.
 * Also: no Vite HMR socket, so a source edit elsewhere cannot reload the page
 * mid-run (the scripts run against a live dev server).
 */
export async function prepContext(c) {
  await c.routeWebSocket((u) => u.searchParams.has('token'), () => {});
  await c.addInitScript(() => {
    const geo = () => {
      const r = window.__game.canvas.getBoundingClientRect();
      return { r, k: r.width / window.__game.scale.width };
    };
    window.__css = (x, y) => { const { r, k } = geo(); return [r.left + x * k, r.top + y * k]; };
    window.__gamePt = (x, y) => { const { r, k } = geo(); return [(x - r.left) / k, (y - r.top) / k]; };
    window.__rs = () => 1 / geo().k;
  });
}

/**
 * Collects console errors and page errors of a page into `into` (returned).
 *   ignoreNetwork  skip the browser's own "Failed to load resource" lines (pushed to `network` instead, when given)
 *   console        false: page errors only
 *   prefix         tag lines as [console.error] / [pageerror]
 *   stack          page errors with their stack
 *   echo           also print page errors as they happen
 */
export function captureErrors(page, { into = [], ignoreNetwork = false, network = null, console: withConsole = true, prefix = false, stack = false, echo = false } = {}) {
  if (withConsole)
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      if (ignoreNetwork && /Failed to load resource/.test(m.text())) return void network?.push(m.text());
      into.push(prefix ? `[console.error] ${m.text()}` : m.text());
    });
  page.on('pageerror', (e) => {
    const msg = stack ? (e.stack ?? e.message) : e.message;
    into.push(prefix ? `[pageerror] ${msg}` : msg);
    if (echo) console.log('PAGE ERROR', e.message);
  });
  return into;
}

/** The game's API answering 503 "not configured" (no backend). */
export const apiDown = (page, body = '{"error":{"code":"not_configured","message":"down"}}') =>
  page.route('**/api/**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body }));

// ------------------------------------------------------------------ results

let failures = 0;
/** Logs PASS/FAIL; a FAIL makes finish() exit 1. */
export function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
  if (!ok) failures++;
}
export const failureCount = () => failures;
/** Closes the browser (if given), prints the verdict and exits 1 on any failure. */
export async function finish({ browser, pass = 'ALL PASS', fail = (n) => `${n} FAILED` } = {}) {
  if (browser) await browser.close();
  console.log(failures ? fail(failures) : pass);
  process.exit(failures ? 1 : 0);
}

// ------------------------------------------------------------------ waiting

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Polls `fn` (async, Node side) until it is truthy or `ms` have passed. */
export async function until(fn, ms = 15000, step = 250) {
  for (let t = 0; t < ms; t += step) {
    if (await fn()) return true;
    await sleep(step);
  }
  return false;
}

// ------------------------------------------------------------------ page API

/**
 * Helpers bound to one page.
 *   tapWait   ms to wait after a tap (default 150)
 *   swipeWait ms to wait after a swipe's touchEnd (default 250)
 *   step      until()'s poll step (default 250)
 *   btnIndex  which of several matching buttons btn() picks (0 = first, -1 = last)
 *   btnWaitMs how long tapBtn() waits for its button to appear (default 0: look once)
 */
export function makePageApi(page, { tapWait = 150, swipeWait = 250, step = 250, btnIndex = 0, btnWaitMs = 0 } = {}) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  let cdp = null;
  /** A raw CDP touch event: points are [x, y] in CSS px, one id per finger. */
  const touch = async (type, pts) => {
    cdp ??= page.context().newCDPSession(page);
    return (await cdp).send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
  };
  const api = {
    page,
    ev,
    wait,
    touch,
    until: (fn, ms, st = step) => until(fn, ms, st),
    /** Polls a page function (evaluated in the page) until it is truthy. */
    untilPage: (fn, ms = 8000, st = 150) => until(() => ev(fn), ms, st),
    active: (key) => ev((k) => window.__game.scene.isActive(k), key),
    /** Runs `body` (a function body with the scene as `s`) in the page. */
    call: (key, body) => ev(([k, f]) => new Function('s', f)(window.__game.scene.getScene(k)), [key, body]),
    /** Starts scene `key` in place of every running scene. */
    start: (key, data) => ev(([k, d]) => window.__game.scene.getScenes(true).forEach((s) => s.scene.start(k, d)), [key, data ?? {}]),
    /** All text currently in a scene (nested containers included), upper case. */
    sceneText: (key) =>
      ev((k) => {
        const out = [];
        const walk = (list) => list.forEach((o) => (o.text !== undefined && out.push(o.text), o.list && walk(o.list)));
        walk(window.__game.scene.getScene(k).children.list);
        return out.join(' ').toUpperCase();
      }, key),

    /**
     * A tap: touchstart now, touchend one animation frame later, dispatched
     * inside the page. In headless software WebGL the game runs at a few frames
     * a second, and CDP touches (each acknowledged only after the renderer
     * handled it) then arrive several frames apart: a 60 ms tap became
     * 400-600 ms of game time and read as a long-press (450 ms: the tooltip,
     * no click). Gestures (swipes, pinch) still go through CDP.
     */
    async tap(x, y, after = tapWait) {
      await ev(
        ([tx, ty]) =>
          new Promise((done) => {
            const c = window.__game.canvas;
            const t = new Touch({ identifier: 7, target: c, clientX: tx, clientY: ty, pageX: tx, pageY: ty, screenX: tx, screenY: ty });
            const fire = (type) =>
              c.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
            fire('touchstart');
            requestAnimationFrame(() => {
              fire('touchend');
              requestAnimationFrame(() => done(true));
            });
          }),
        [x, y],
      );
      await wait(after);
    },
    /** One finger along a polyline of page points (touchStart .. touchEnd), `steps` moves per segment. */
    async swipe(points, { steps = 8, hold = 0, after = swipeWait } = {}) {
      await touch('touchStart', [points[0]]);
      if (hold) await wait(hold);
      for (let k = 1; k < points.length; k++) {
        const [x0, y0] = points[k - 1];
        const [x1, y1] = points[k];
        for (let i = 1; i <= steps; i++) {
          await touch('touchMove', [[x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps]]);
          await wait(16);
        }
      }
      await touch('touchEnd', []);
      await wait(after);
    },
    /** One finger from (x0, y0) to (x1, y1). */
    drag: (x0, y0, x1, y1, steps = 10) => api.swipe([[x0, y0], [x1, y1]], { steps }),
    /** Two fingers at (xa, y) and (xb, y) spreading `dx` px each per move (negative pinches in). */
    async pinch(xa, xb, y, dx, { steps = 8, after = 400 } = {}) {
      await touch('touchStart', [[xa, y], [xb, y]]);
      for (let i = 1; i <= steps; i++) {
        await touch('touchMove', [[xa - i * dx, y], [xb + i * dx, y]]);
        await wait(16);
      }
      await touch('touchEnd', []);
      await wait(after);
    },

    /**
     * Page (CSS px) centre of a visible kit Button in a scene (containers
     * searched): `match` is a label prefix (case-insensitive) or
     * { label, icon, id (layout id), index (negative counts from the end) }.
     */
    btn: (sceneKey, match) =>
      ev(
        ([k, m]) => {
          const s = window.__game.scene.getScene(k);
          const found = [];
          const walk = (list) => {
            for (const o of list) {
              if (o.visible && ((m.id && o.__uiId === m.id) || (o.opts && ((m.label && o.opts.label && o.opts.label.toUpperCase().startsWith(m.label.toUpperCase())) || (m.icon && o.opts.icon === m.icon))))) found.push(o);
              if (o.list) walk(o.list);
            }
          };
          walk(s.children.list);
          const b = found.at(m.index);
          if (!b) return null;
          const r = b.getBounds();
          return window.__css(r.centerX, r.centerY);
        },
        [sceneKey, { index: btnIndex, ...(typeof match === 'string' ? { label: match } : match) }],
      ),
    /** Taps a button (see btn); false (and a log line listing the scene's buttons) when there is none. */
    async tapBtn(sceneKey, match, { waitMs = btnWaitMs } = {}) {
      let p = await api.btn(sceneKey, match);
      // state-based: wait for the button to exist (a screen may still be building)
      if (!p && waitMs > 0) await until(async () => (p = await api.btn(sceneKey, match)) !== null, waitMs, 100);
      if (!p) {
        const labels = await ev((k) => {
          const o2 = [];
          const walk = (list) => list.forEach((o) => (o.opts && o2.push(`${o.opts.label ?? o.opts.icon}:${o.visible}`), o.list && walk(o.list)));
          walk(window.__game.scene.getScene(k)?.children.list ?? []);
          return o2.join(', ');
        }, sceneKey).catch(() => '?');
        console.log(`  (no button ${JSON.stringify(match)} in ${sceneKey}: ${labels})`);
        return false;
      }
      await api.tap(p[0], p[1]);
      return true;
    },
    /** tapBtn by label. */
    tapLabel: (sceneKey, label, opts) => api.tapBtn(sceneKey, { label }, opts),
  };
  return api;
}

// ------------------------------------------------------------------ dev tools

/**
 * For the dev tools that serve the game themselves: starts a Vite dev server
 * (random port) and Chromium, runs fn({ base, browser, server }) and shuts both
 * down afterwards.
 */
export async function withViteAndBrowser(fn, viteConfig = {}) {
  const { createServer } = await import('vite');
  const server = await createServer({ root: ROOT, server: { port: 0, host: '127.0.0.1' }, logLevel: 'warn', ...viteConfig });
  await server.listen();
  const base = server.resolvedUrls.local[0];
  const browser = await launch();
  try {
    return await fn({ base, browser, server });
  } finally {
    await browser.close();
    await server.close();
  }
}
