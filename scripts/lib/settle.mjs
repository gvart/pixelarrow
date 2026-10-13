// State waits for the layout check (scripts/layout-check.mjs, V6-GATE-01b): `settle(page, ms)` returns
// once the game is quiet, and after `ms` at the latest, so it never waits longer than the fixed sleep it
// replaces. Quiet: no scene starting or loading, no camera fade / pan / zoom, no finite tween playing, no
// timer (Phaser time event or setTimeout) due before the deadline, no fetch or worker reply outstanding;
// seen on two polls in a row, at least two game frames after the wait began.

/** Init script: counts what the page is still waiting for (setTimeout due times, fetches, worker replies). */
export function trackPending() {
  const due = new Map();
  const st = window.setTimeout.bind(window);
  const ct = window.clearTimeout.bind(window);
  window.setTimeout = (fn, ms, ...rest) => {
    if (typeof fn !== 'function') return st(fn, ms, ...rest);
    const id = st((...a) => (due.delete(id), fn(...a)), ms, ...rest);
    due.set(id, performance.now() + (Number(ms) || 0));
    return id;
  };
  window.clearTimeout = (id) => (due.delete(id), ct(id));
  let fetches = 0;
  const f = window.fetch.bind(window);
  window.fetch = (...a) => {
    fetches++;
    return f(...a).finally(() => fetches--);
  };
  let replies = 0;
  const W = window.Worker;
  window.Worker = class extends W {
    constructor(...a) {
      super(...a);
      this.addEventListener('message', () => (replies = Math.max(0, replies - 1)));
    }
    postMessage(...a) {
      replies++;
      return super.postMessage(...a);
    }
  };
  /** How many things the page waits for that land within `horizon` ms. */
  window.__pending = (horizon) => {
    const now = performance.now();
    let n = fetches + replies;
    for (const t of due.values()) if (t - now <= horizon) n++;
    return n;
  };
}

/** Page function: whether the game is quiet for the next `horizon` ms (see the header). */
export function quietNow(horizon) {
  const g = window.__game;
  if (!g || !window.__pending) return true;
  const m = g.scene;
  if (m._pending.length || m._start.length || m._queue.length) return false;
  // Phaser.Scenes: INIT 1, START 2, LOADING 3, CREATING 4
  if (m.scenes.some((s) => s.sys.settings.status >= 1 && s.sys.settings.status <= 4)) return false;
  for (const s of m.getScenes(true)) {
    if (s.load.isLoading()) return false;
    if (s.cameras.cameras.some((c) => c.fadeEffect.isRunning || c.panEffect.isRunning || c.zoomEffect.isRunning)) return false;
    if (s.tweens.getTweens().some((t) => t.isPlaying() && t.loop !== -1 && !t.data.some((d) => d.repeat === -1))) return false;
    const scale = s.time.timeScale || 1;
    for (const e of [...s.time._active, ...s.time._pendingInsertion])
      if (!e.paused && !e.loop && e.repeat !== -1 && !e.hasDispatched && (e.delay - e.elapsed) / scale <= horizon) return false;
  }
  return window.__pending(horizon) === 0;
}

/** Installs the trackers and `window.__quiet(horizon)` in every page of a browser context. */
export async function installSettle(ctx) {
  await ctx.addInitScript(trackPending);
  await ctx.addInitScript(`window.__quiet = ${quietNow.toString()};`);
}

/** Waits until the game is quiet (two polls in a row, two frames on), `ms` at most; returns the ms waited. */
export async function settle(page, ms, step = 100) {
  const t0 = Date.now();
  const left = () => ms - (Date.now() - t0);
  let f0 = null;
  let calm = 0;
  while (left() > 0) {
    const { q, frame } = await page.evaluate((h) => ({ q: window.__quiet ? window.__quiet(h) : true, frame: window.__game?.loop.frame ?? 0 }), left());
    f0 ??= frame;
    calm = q ? calm + 1 : 0;
    if (calm >= 2 && frame >= f0 + 2) break;
    if (left() > 0) await page.waitForTimeout(Math.min(step, left()));
  }
  return Date.now() - t0;
}
