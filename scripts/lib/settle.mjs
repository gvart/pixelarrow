// State waits for the layout check (scripts/layout-check.mjs, V6-GATE-01b): `settle(page, ms)` returns
// once the game is quiet, and after `ms` at the latest, so it never waits longer than the fixed sleep it
// replaces. Quiet: no scene starting or loading, no camera fade / pan / zoom, no finite tween playing, no
// timer (Phaser time event or setTimeout) due before the deadline, no fetch outstanding;
// seen on two animation frames in a row, at least two game frames after the wait began.

/** Init script: tracks what the page is still waiting for (setTimeout due times, fetches). */
export function trackPending() {
  const due = new Map();
  const st = window.setTimeout.bind(window);
  const ct = window.clearTimeout.bind(window);
  window.setTimeout = (fn, ms, ...rest) => {
    if (typeof fn !== 'function') return st(fn, ms, ...rest);
    const id = st((...a) => (due.delete(id), fn(...a)), ms, ...rest);
    due.set(id, { at: performance.now() + (Number(ms) || 0), ms: Number(ms) || 0 });
    return id;
  };
  window.clearTimeout = (id) => (due.delete(id), ct(id));
  const fetches = new Map();
  let fid = 0;
  const f = window.fetch.bind(window);
  window.fetch = (...a) => {
    const id = ++fid;
    fetches.set(id, String(a[0]?.url ?? a[0]));
    return f(...a).finally(() => fetches.delete(id));
  };
  // (Workers are not waited for: the game's one worker bakes war-map ground chunks, map content the check
  // never compares, and the fixed sleeps never waited for it either.)
  /** What the page still waits for within `horizon` ms ('' when nothing): a timeout or a fetch. */
  window.__pending = (horizon) => {
    const now = performance.now();
    for (const t of due.values()) if (t.at - now <= horizon) return `setTimeout ${t.ms} ms`;
    for (const u of fetches.values()) return `fetch ${u.replace(/^https?:\/\/[^/]+/, '').slice(0, 40)}`;
    return '';
  };
}

/** Page function: what keeps the game busy for the next `horizon` ms (see the header), '' when it is quiet. */
export function quietNow(horizon) {
  const g = window.__game;
  if (!g || !window.__pending) return '';
  const m = g.scene;
  if (m._pending.length || m._start.length || m._queue.length) return 'scene queue';
  // Phaser.Scenes: START 2, LOADING 3, CREATING 4 (INIT 1 is a scene added but never started)
  const starting = m.scenes.find((s) => s.sys.settings.status >= 2 && s.sys.settings.status <= 4);
  if (starting) return `${starting.sys.settings.key} starting`;
  for (const s of m.getScenes(true)) {
    const k = s.sys.settings.key;
    if (s.load.isLoading()) return `${k} loading`;
    if (s.cameras.cameras.some((c) => c.fadeEffect.isRunning || c.panEffect.isRunning || c.zoomEffect.isRunning)) return `${k} camera`;
    if (s.tweens.getTweens().some((t) => t.isPlaying() && t.loop !== -1 && !t.data.some((d) => d.repeat === -1))) return `${k} tween`;
    const scale = s.time.timeScale || 1;
    for (const e of [...s.time._active, ...s.time._pendingInsertion])
      if (!e.paused && !e.loop && e.repeat !== -1 && !e.hasDispatched && (e.delay - e.elapsed) / scale <= horizon) return `${k} timer`;
  }
  return window.__pending(horizon);
}

/**
 * Page function: resolves once the game has been quiet on two animation frames in a row, at least two
 * game frames after the call, or at `ms` at the latest, with what kept it busy then ('' when it settled).
 * Checking in the page on every frame costs no round trips to the browser.
 */
export function settleInPage(ms) {
  const end = performance.now() + ms;
  const f0 = window.__game?.loop.frame ?? 0;
  return new Promise((done) => {
    let calm = 0;
    const tick = () => {
      const now = performance.now();
      const busy = window.__quiet(end - now) || ((window.__game?.loop.frame ?? 0) < f0 + 2 ? 'frames' : '');
      calm = busy ? 0 : calm + 1;
      if (calm >= 2) return done('');
      if (now >= end) return done(busy || 'one more frame');
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/** Installs the trackers, `window.__quiet(horizon)` and `window.__settle(ms)` in every page of a browser context. */
export async function installSettle(ctx) {
  await ctx.addInitScript(trackPending);
  await ctx.addInitScript(`window.__quiet = ${quietNow.toString()}; window.__settle = ${settleInPage.toString()};`);
}

/**
 * Polls a page function (no arguments, no closure) on every animation frame inside the page until it is
 * truthy, `ms` at most: true, or false at the deadline. The same answer as polling it from Node, without
 * a round trip per poll (each one waits for the page's main thread, slow when software WebGL is drawing).
 */
export function untilInPage(page, fn, ms) {
  return page.evaluate(
    ([src, m]) =>
      new Promise((done, fail) => {
        const f = new Function(`return (${src})();`);
        const end = performance.now() + m;
        const tick = () => {
          let v;
          try {
            v = f();
          } catch (e) {
            return fail(e);
          }
          if (v) return done(true);
          if (performance.now() >= end) return done(false);
          requestAnimationFrame(tick);
        };
        tick();
      }),
    [fn.toString(), ms],
  );
}

/**
 * Waits until the game is quiet (see settleInPage), `ms` at most. Returns the ms waited and, when the
 * deadline came first, what kept the game busy (`busy`, '' when it settled).
 */
export async function settle(page, ms) {
  const t0 = Date.now();
  const busy = await page.evaluate((m) => (window.__settle ? window.__settle(m) : new Promise((r) => setTimeout(() => r(''), m))), ms);
  return { ms: Date.now() - t0, busy };
}
