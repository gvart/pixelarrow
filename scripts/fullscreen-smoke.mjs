// Telegram full screen, safe areas and native back navigation, with a fake
// Telegram.WebApp (Bot API 8.0, iOS). Reproduces an iPhone in full screen:
// status bar 59 px, Telegram's floating Back / ⋯ pills 46 px below it, home
// indicator 34 px; the insets arrive late (after ready()) like on a real
// device. Checks the canvas sits inside the safe area on every screen, that
// Back / Settings / closing confirmation follow the screens, and saves
// docs/screenshots/29-fullscreen-safe-area.png (menu, map, army, battle with
// the fake overlays drawn on top).
// Usage: node scripts/fullscreen-smoke.mjs [baseUrl] [outDir]   (needs a running dev/preview server)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });
const W = 390;
const H = 844;
const INSETS = { safeTop: 59, contentTop: 46, safeBottom: 34 };

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
  if (!ok) failures++;
};

function fakeTelegram(ins) {
  const store = new Map();
  const log = [];
  // One event bus for everything, like telegram-web-app.js: BackButton.onClick
  // is onEvent('backButtonClicked'), SettingsButton.onClick is
  // onEvent('settingsButtonClicked'); handlers run in a live loop.
  const handlers = new Map();
  const on = (ev, cb) => {
    if (!handlers.has(ev)) handlers.set(ev, []);
    const a = handlers.get(ev);
    if (!a.includes(cb)) a.push(cb);
  };
  const off = (ev, cb) => {
    const a = handlers.get(ev) || [];
    const i = a.indexOf(cb);
    if (i >= 0) a.splice(i, 1);
  };
  const emit = (ev, arg) => {
    const a = handlers.get(ev) || [];
    for (let i = 0; i < a.length; i++) {
      try {
        a[i].call(wa, arg);
      } catch (e) {
        console.error(e);
      }
    }
  };
  // Telegram re-reports the viewport and the safe areas whenever its header
  // changes (Close <-> Back, the ⋯ menu): several times, asynchronously and
  // with unchanged values; the window gets a resize event too.
  const relayoutBurst = () => {
    for (const ms of [16, 60, 150, 300]) {
      setTimeout(() => {
        emit('viewportChanged', { isStateStable: ms >= 150 });
        emit('contentSafeAreaChanged');
        emit('safeAreaChanged');
        if (ms === 60) dispatchEvent(new Event('resize'));
      }, ms);
    }
  };
  // Telegram's left pill reads "Back" while the BackButton is shown, else "Close".
  const pill = () => {
    const el = document.getElementById('tg-pill');
    if (el) el.textContent = wa.BackButton.isVisible ? '‹ Back' : '✕ Close';
  };
  const btn = (ev, name) => ({
    isVisible: false,
    show() {
      const was = this.isVisible;
      this.isVisible = true;
      log.push(name + '.show');
      pill();
      if (!was) relayoutBurst();
      return this;
    },
    hide() {
      const was = this.isVisible;
      this.isVisible = false;
      log.push(name + '.hide');
      pill();
      if (was) relayoutBurst();
      return this;
    },
    onClick(cb) {
      on(ev, cb);
      return this;
    },
    offClick(cb) {
      off(ev, cb);
      return this;
    },
  });
  const wa = {
    initData: 'query_id=AA&user=%7B%22id%22%3A1%2C%22first_name%22%3A%22Ana%22%7D&auth_date=1&hash=00',
    initDataUnsafe: { user: { first_name: 'Ana' } },
    version: '8.0',
    platform: 'ios',
    colorScheme: 'dark',
    themeParams: {},
    isFullscreen: false,
    isExpanded: false,
    isClosingConfirmationEnabled: false,
    safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
    contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
    isVersionAtLeast: (v) => parseFloat(v) <= 8.0,
    ready() { log.push('ready'); },
    expand() { log.push('expand'); wa.isExpanded = true; },
    setHeaderColor() {},
    setBackgroundColor() {},
    disableVerticalSwipes() { log.push('disableVerticalSwipes'); },
    lockOrientation() { log.push('lockOrientation'); },
    enableClosingConfirmation() { wa.isClosingConfirmationEnabled = true; },
    disableClosingConfirmation() { wa.isClosingConfirmationEnabled = false; },
    requestFullscreen() {
      log.push('requestFullscreen');
      // Like a phone: full screen first, the insets a moment later and in
      // pieces (device safe area, then Telegram's controls), with viewport
      // events in between and repeated afterwards.
      setTimeout(() => {
        wa.isFullscreen = true;
        wa.isExpanded = true;
        emit('fullscreenChanged');
        emit('viewportChanged', { isStateStable: false });
      }, 50);
      setTimeout(() => {
        wa.safeAreaInset = { top: ins.safeTop, bottom: ins.safeBottom, left: 0, right: 0 };
        emit('safeAreaChanged');
        emit('viewportChanged', { isStateStable: false });
      }, 250);
      setTimeout(() => {
        wa.contentSafeAreaInset = { top: ins.contentTop, bottom: 0, left: 0, right: 0 };
        emit('contentSafeAreaChanged');
        emit('viewportChanged', { isStateStable: true });
      }, 400);
      setTimeout(relayoutBurst, 700);
    },
    onEvent: on,
    offEvent: off,
    HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() { log.push('selection'); } },
    BackButton: btn('backButtonClicked', 'back'),
    SettingsButton: btn('settingsButtonClicked', 'settings'),
    CloudStorage: {
      getItem: (k, cb) => setTimeout(() => cb(null, store.get(k) ?? '')),
      setItem: (k, v, cb) => setTimeout(() => (store.set(k, v), cb?.(null, true))),
      removeItem: (k, cb) => setTimeout(() => (store.delete(k), cb?.(null, true))),
    },
  };
  window.Telegram = { WebApp: wa };
  window.__tg = {
    log,
    pressBack: () => emit('backButtonClicked'),
    pressSettings: () => emit('settingsButtonClicked'),
    backHandlers: () => (handlers.get('backButtonClicked') || []).length,
    relayoutBurst,
  };
  // Draw what Telegram and iOS put over the webview, on top of everything.
  addEventListener('DOMContentLoaded', () => {
    const box = (css, html = '') => {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;left:0;right:0;z-index:99;pointer-events:none;font:600 15px -apple-system,system-ui,sans-serif;color:#fff;' + css;
      d.innerHTML = html;
      document.body.appendChild(d);
    };
    setTimeout(pill, 0);
    box(`top:0;height:${ins.safeTop}px;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:space-between;padding:0 28px;box-sizing:border-box`, '<span>9:41</span><span>5G ▮</span>');
    box(
      `top:${ins.safeTop}px;height:${ins.contentTop}px;display:flex;align-items:center;justify-content:space-between;padding:0 10px;box-sizing:border-box`,
      '<span id="tg-pill" style="background:rgba(30,50,80,.85);border-radius:16px;padding:6px 14px">✕ Close</span><span style="background:rgba(30,50,80,.85);border-radius:16px;padding:6px 14px">⌄ ⋯</span>',
    );
    box(`bottom:0;height:${ins.safeBottom}px;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center`, '<span style="width:134px;height:5px;border-radius:3px;background:#fff"></span>');
  });
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await ctx.addInitScript(fakeTelegram, INSETS);
await page.route('**/api/**', (r) => r.fulfill({ status: 503, body: '{"error":"down"}', contentType: 'application/json' }));
await page.goto(base + '#tgWebAppVersion=8.0&tgWebAppPlatform=ios');
await page.waitForTimeout(3000);

const ev = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const active = (k) => ev((key) => window.__game.scene.isActive(key), k);
const call = (key, fn) => ev(([k, f]) => new Function('s', f)(window.__game.scene.getScene(k)), [key, fn]);
const start = (key, data) => ev(([k, d]) => window.__game.scene.getScenes(true).forEach((s) => s.scene.start(k, d)), [key, data ?? {}]);
const tg = () => ev(() => ({ back: window.Telegram.WebApp.BackButton.isVisible, settings: window.Telegram.WebApp.SettingsButton.isVisible, handlers: window.__tg.backHandlers(), confirm: window.Telegram.WebApp.isClosingConfirmationEnabled, layers: window.__nav.layers() }));
const pressBack = async () => {
  await ev(() => window.__tg.pressBack());
  await wait(500);
};
/** The canvas must fill exactly the safe rect. */
const top = INSETS.safeTop + INSETS.contentTop;
const checkLayout = async (name) => {
  const r = await ev(() => {
    const c = document.querySelector('#game canvas').getBoundingClientRect();
    return { top: c.top, bottom: innerHeight - c.bottom, left: c.left, right: innerWidth - c.right, gw: window.__game.scale.width, gh: window.__game.scale.height };
  });
  check(`${name}: canvas below status bar and Telegram buttons`, Math.abs(r.top - top) < 1, `top=${r.top}`);
  check(`${name}: canvas above home indicator`, Math.abs(r.bottom - INSETS.safeBottom) < 1, `bottom=${r.bottom}`);
  check(`${name}: game size = safe rect`, r.gw === W && r.gh === H - top - INSETS.safeBottom, `${r.gw}x${r.gh}`);
};
/** No arrow-only back button: Telegram's header button replaces it. */
const noArrow = (key) =>
  ev((k) => {
    let n = 0;
    const walk = (list) => list.forEach((o) => (o.opts && o.opts.icon === 'back' && !o.opts.label && n++, o.list && walk(o.list)));
    walk(window.__game.scene.getScene(k).children.list);
    return n === 0;
  }, key);
const shots = {};
const shot = async (name) => (shots[name] = (await page.screenshot()).toString('base64'));

// ---- launch
const log = await ev(() => window.__tg.log);
check('requestFullscreen on Bot API 8.0 phone', log.includes('requestFullscreen'));
check('expand, disableVerticalSwipes, lockOrientation', ['expand', 'disableVerticalSwipes', 'lockOrientation'].every((x) => log.includes(x)));
check('menu active', await active('Menu'));
await checkLayout('menu');
let t = await tg();
check('menu is root: BackButton hidden (Telegram shows Close)', !t.back && t.handlers === 0, JSON.stringify(t));
check('Settings item shown', t.settings);
await shot('Menu');

// Settings from Telegram's ⋯ menu, closed by Back
await ev(() => window.__tg.pressSettings());
await wait(300);
t = await tg();
check('⋯ Settings opens the settings modal; Back shown to close it', t.layers === 1 && t.back, JSON.stringify(t));
await pressBack();
t = await tg();
check('Back closes settings, stays on menu', t.layers === 0 && !t.back && (await active('Menu')));

// ---- world map
await ev(async () => {
  const st = window.__state;
  st.campaign = st.campaign.constructor.fresh(20261006);
  st.hasSave = true;
  await st.save();
});

// ---- regression: menu buttons tapped with a finger must stay open while
// Telegram fires its header / viewport events (the BackButton appearing used
// to trigger scale refresh -> 'resize' -> scene restart, closing every modal).
await start('Menu');
await wait(1500);
/** Finger tap (touchstart/touchend at one point) on a kit Button by label. */
const tapButton = async (key, label) => {
  const p = await ev(
    ([k, l]) => {
      const s = window.__game.scene.getScene(k);
      let b = null;
      const walk = (list) => list.forEach((o) => (o.opts && o.opts.label === l && o.visible && (b = o), o.list && walk(o.list)));
      walk(s.children.list);
      if (!b) return null;
      const m = b.getWorldTransformMatrix();
      const c = document.querySelector('#game canvas').getBoundingClientRect();
      const k2 = c.width / window.__game.scale.width;
      return { x: c.left + (m.tx + (b.w * m.scaleX) / 2) * k2, y: c.top + (m.ty + (b.h * m.scaleY) / 2) * k2 };
    },
    [key, label],
  );
  if (!p) throw new Error(`no button ${label} in ${key}`);
  await page.touchscreen.tap(p.x, p.y);
};
/** Mark the scene's current UI root; a restart replaces it. */
const probe = (key) => ev((k) => ((window.__game.scene.getScene(k).ui.__probe = 1), 1), key);
/** The scene stays active, unrestarted, with `layers` dialogs open for `ms` while Telegram fires events. */
const stays = async (key, layers, ms = 2200) => {
  const t0 = Date.now();
  let burst = false;
  while (Date.now() - t0 < ms) {
    if (!burst && Date.now() - t0 > 700) {
      burst = true;
      await ev(() => window.__tg.relayoutBurst());
    }
    const ok = await ev(([k, n]) => window.__game.scene.isActive(k) && window.__game.scene.getScene(k).ui.__probe === 1 && window.__nav.layers() === n, [key, layers]);
    if (!ok) return `left after ${Date.now() - t0} ms: ${await ev(() => window.__game.scene.getScenes(true).map((s) => s.scene.key).join(',') + ' layers=' + window.__nav.layers())}`;
    await wait(200);
  }
  return '';
};
const backFlips = async (from) => (await ev(() => window.__tg.log)).slice(from).filter((x) => /^back\./.test(x)).length;
const logLen = async () => (await ev(() => window.__tg.log)).length;
for (const label of ['Settings', 'Shop', 'New campaign']) {
  const n0 = await logLen();
  await tapButton('Menu', label);
  await wait(150);
  await probe('Menu');
  const r = await stays('Menu', 1);
  check(`tap ${label}: its modal stays open (no auto back)`, r === '', r);
  const f = await backFlips(n0);
  check(`tap ${label}: BackButton shown once, no Close/Back flicker`, f === 1, `flips=${f}`);
  await pressBack();
  check(`tap ${label}: Back closes it`, (await active('Menu')) && (await tg()).layers === 0);
}
const n1 = await logLen();
await tapButton('Menu', 'Continue');
await wait(400);
await probe('World');
const rc = await stays('World', 0);
check('tap Continue: the map stays (no auto back to the menu)', rc === '', rc);
const fc = await backFlips(n1);
check('tap Continue: BackButton shown once, no Close/Back flicker', fc === 1, `flips=${fc}`);
await pressBack();
check('map: Back -> menu', await active('Menu'));
await wait(500);

await start('World');
await wait(2500);
await checkLayout('map');
t = await tg();
check('map: Back shown, one handler', t.back && t.handlers === 1, JSON.stringify(t));
check('map: no in-game back arrow', await noArrow('World'));
await shot('Map');
await pressBack();
check('map: Back -> menu', await active('Menu'));
check('haptic selection on Back', (await ev(() => window.__tg.log)).includes('selection'));

// ---- army (from the map)
await start('World');
await wait(1500);
await start('Army', { from: 'World' });
await wait(800);
await checkLayout('army');
check('army: no in-game back arrow', await noArrow('Army'));
await shot('Army');
await call('Army', 's.openHero(); return 1;');
await wait(600);
check('army -> hero', await active('Hero'));
await pressBack();
check('hero: Back -> army', await active('Army'));
await pressBack();
check('army: Back -> map', await active('World'));

// ---- battle (fresh skirmish)
await ev(() => {
  window.__state.pending = null;
  window.__game.scene.getScenes(true).forEach((s) => s.scene.start('Battle', { fresh: true }));
});
await wait(1500);
await checkLayout('battle');
// ---- touch controls inside the safe area (real touch events, canvas offset by the insets)
check('battle: one-time controls hint shown', await call('Battle', 'return !!s.hint;'));
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
/** One finger along a polyline of page points. */
const swipe = async (points, steps = 8) => {
  await touch('touchStart', [points[0]]);
  for (let k = 1; k < points.length; k++) {
    const [x0, y0] = points[k - 1];
    const [x1, y1] = points[k];
    for (let i = 1; i <= steps; i++) {
      await touch('touchMove', [[x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps]]);
      await wait(16);
    }
  }
  await touch('touchEnd', []);
  await wait(250);
};
await page.touchscreen.tap(W / 2, H / 2);
await wait(300);
check('battle: hint dismissed by a tap and remembered', await call('Battle', 'return !s.hint && window.__state.campaign.data.settings.seenGestureHint;'));
/** Page points for (right, back) paces in the selected group's frame; also its formation, the camera scroll and an empty spot. */
const bgeo = (pts) =>
  ev((pts) => {
    const s = window.__game.scene.getScene('Battle');
    const cam = s.cameras.main;
    const c = document.querySelector('#game canvas').getBoundingClientRect();
    const k = c.width / window.__game.scale.width;
    const f = s.sim.groups[s.selGroup].formation;
    const toPage = ([x, y]) => { const p = s.project(x, y); return [c.left + (p.x - cam.worldView.x) * cam.zoom * k, c.top + (p.y - cam.worldView.y) * cam.zoom * k]; };
    const own = s.views.filter((v) => v.u.side === 0).map((v) => [c.left + (v.spr.x - cam.worldView.x) * cam.zoom * k, c.top + (v.spr.y - 10 - cam.worldView.y) * cam.zoom * k]);
    let empty = null;
    for (let y = c.top + c.height * 0.25; !empty && y < c.top + c.height * 0.6; y += 20)
      for (let x = 40; !empty && x < c.width - 40; x += 20) if (own.every(([a, b]) => Math.hypot(a - x, b - y) > 90)) empty = [x, y];
    return { f: { ...f }, scroll: [cam.scrollX, cam.scrollY], empty, orders: s.sim.orderLog.length, pts: pts.map(([a, b]) => toPage([f.cx - f.fy * a - f.fx * b, f.cy + f.fx * a - f.fy * b])) };
  }, pts);
// scripted touch events can stall under load; a stall must not read as the finger resting
await ev(() => { window.__game.scene.getScene('Battle').dwellMs = 5000; });
const b0 = await bgeo([]);
await swipe([b0.empty, [b0.empty[0] + 50, b0.empty[1] - 40]]);
let b1 = await bgeo([]);
check('battle: drag on empty ground pans (group selected), no order', Math.hypot(b1.scroll[0] - b0.scroll[0], b1.scroll[1] - b0.scroll[1]) > 15 && b1.orders === b0.orders, JSON.stringify([b0.scroll, b1.scroll]));
b1 = await bgeo([[0, 0], [0, -2], [-1.5, -0.5]]);
await swipe(b1.pts);
const b2 = await bgeo([]);
// carried 2 paces forward, then pulled back and to the left -> faces forward and to the right
const want = [-b1.f.fy * 1.5 + b1.f.fx * 1.5, b1.f.fx * 1.5 + b1.f.fy * 1.5].map((v) => v / Math.hypot(1.5, 1.5));
check('battle: slingshot from the group faces away from the pull', b2.f.fx * want[0] + b2.f.fy * want[1] > 0.97 && b2.orders > b1.orders, JSON.stringify([b2.f.fx.toFixed(2), b2.f.fy.toFixed(2), want.map((v) => v.toFixed(2))]));
check('battle: slingshot carries the group forward', Math.hypot(b2.f.cx - (b1.f.cx + b1.f.fx * 2), b2.f.cy - (b1.f.cy + b1.f.fy * 2)) < 0.5, JSON.stringify([b2.f.cx.toFixed(2), b2.f.cy.toFixed(2)]));
await call('Battle', 's.frameArmies(); return 1;');
await wait(200);
const b3 = await bgeo([[0, -3]]);
await page.touchscreen.tap(b3.pts[0][0], b3.pts[0][1]);
await wait(300);
const b4 = await bgeo([]);
check('battle: tap on the ground moves the group, shape kept', b4.orders > b3.orders && Math.hypot(b4.f.cx - b3.f.cx, b4.f.cy - b3.f.cy) > 1 && b4.f.frontage === b3.f.frontage, JSON.stringify([b4.f.cx.toFixed(2), b4.f.cy.toFixed(2)]));

check('deploy: no in-game back arrow', await noArrow('Battle'));
t = await tg();
check('battle: closing confirmation on', t.confirm);
await pressBack();
t = await tg();
check('deploy: Back asks before leaving', (await active('Battle')) && t.layers === 1, JSON.stringify(t));
await pressBack();
check('deploy: Back again keeps the deployment', (await active('Battle')) && (await tg()).layers === 0);
await call('Battle', 's.hideBanner(); s.startFight(); s.buildHud(); return 1;');
await wait(1200);
await pressBack();
check('battle: Back pauses and opens the retreat confirm', (await active('Battle')) && (await call('Battle', 'return s.paused && !!s.overlay;')));
await shot('Battle');
await pressBack();
check('battle: Back again = Stay', (await active('Battle')) && (await call('Battle', 'return !s.overlay && s.sim.phase === "battle";')));
await call('Battle', 's.setPaused(true); return 1;');
await ev(() => window.__tg.pressSettings());
await wait(300);
check('battle: ⋯ Settings opens settings over the paused battle', (await tg()).layers === 1 && (await call('Battle', 'return s.paused;')));
await pressBack();
check('handlers never stack', (await tg()).handlers === 1);

// ---- leave battle, confirmation off again
await start('Menu');
await wait(800);
t = await tg();
check('menu again: closing confirmation off, Back hidden', !t.confirm && !t.back && t.handlers === 0, JSON.stringify(t));

// ---- insets change (e.g. leaving full screen): canvas follows
await ev(() => {
  const wa = window.Telegram.WebApp;
  wa.isFullscreen = false;
  wa.safeAreaInset = { top: 0, bottom: 0, left: 0, right: 0 };
  wa.contentSafeAreaInset = { top: 0, bottom: 0, left: 0, right: 0 };
});
await ev(() => window.Telegram.WebApp.onEvent && null);
await page.evaluate(() => window.dispatchEvent(new Event('resize')));
await wait(900);
const full = await ev(() => document.querySelector('#game canvas').getBoundingClientRect().top);
check('insets back to 0: canvas at the top again', full === 0, `top=${full}`);

check('no page errors', errors.length === 0, errors.join(' | '));

// ---- composite screenshot
const comp = await ctx.newPage();
await comp.setViewportSize({ width: 4 * 300 + 5 * 12, height: 680 });
const cells = Object.entries(shots)
  .map(([k, b64]) => `<figure><img src="data:image/png;base64,${b64}"><figcaption>${k}</figcaption></figure>`)
  .join('');
await comp.setContent(
  `<style>body{margin:0;background:#141010;display:flex;gap:12px;padding:12px;font:600 14px system-ui;color:#e8d8c0}figure{margin:0}img{width:300px;height:${Math.round((300 * H) / W)}px;display:block;border-radius:22px}figcaption{text-align:center;padding-top:4px}</style>${cells}`,
);
await comp.screenshot({ path: `${out}/29-fullscreen-safe-area.png` });
console.log('saved', `${out}/29-fullscreen-safe-area.png`);

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exit(failures ? 1 : 0);
