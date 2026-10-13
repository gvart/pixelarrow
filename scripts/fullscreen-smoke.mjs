// Telegram full screen, safe areas and native back navigation, with a fake
// Telegram.WebApp (Bot API 8.0, iOS). Reproduces an iPhone in full screen:
// status bar 59 px, Telegram's floating Back / ⋯ pills 46 px below it, home
// indicator 34 px; the insets arrive late (after ready()) like on a real
// device. Checks the canvas sits inside the safe area on every screen, that
// Back / Settings / closing confirmation follow the screens, and saves
// shots/29-fullscreen-safe-area.png (git-ignored; menu, map, army, battle with
// the fake overlays drawn on top).
// Platform modes (scripts/lib/platform.mjs): `telegram` is all of the above; `web` is the plain web page's
// counterpart: the canvas fills the viewport, there is no Telegram object and no request to telegram.org,
// and the browser's Back (a history entry the web adapter guards) closes a layer instead of leaving.
// Usage: node scripts/fullscreen-smoke.mjs <baseUrl> [outDir] [--platform telegram|web|both]   (needs a running dev/preview server)
import { launch, phoneContext, captureErrors, makePageApi, check, finish, shotsDir, apiDown, settled } from './lib/harness.mjs';
import { cliArgs, platformMode, applyPlatform, checkPlatform, noTelegramRequests } from './lib/platform.mjs';

const cli = cliArgs(process.argv.slice(2), 'scripts/fullscreen-smoke.mjs');
const mode = await platformMode(import.meta.url, cli);
const base = cli.base;
const out = shotsDir('', cli.args.find((a) => !a.startsWith('--')));
const W = 390;
const H = 844;
const INSETS = { safeTop: 59, contentTop: 46, safeBottom: 34 };

const browser = await launch();
if (mode === 'web') await webRun();

/** The web counterpart (see the header); ends the process. */
async function webRun() {
  const wctx = await phoneContext(browser, { viewport: { width: W, height: H } });
  const plat = await applyPlatform(wctx, 'web');
  const page = await wctx.newPage();
  const errors = captureErrors(page, { ignoreNetwork: true });
  await apiDown(page);
  await page.goto(base, { timeout: 60000 });
  const api = makePageApi(page, { btnWaitMs: 15000 });
  check('[web] menu settles', await settled(api, 'Menu', 60000));
  await checkPlatform(page, 'web');
  const r = await api.ev(() => { const c = document.querySelector('#game canvas').getBoundingClientRect(); return { top: c.top, bottom: innerHeight - c.bottom, left: c.left, right: innerWidth - c.right }; });
  check('[web] the canvas fills the viewport (no insets on the web)', Math.abs(r.top) < 1 && Math.abs(r.bottom) < 1 && Math.abs(r.left) < 1 && Math.abs(r.right) < 1, JSON.stringify(r));
  const nav = () => api.ev(() => ({ layers: window.__nav.layers(), back: window.__nav.canGoBack(), href: location.href, menu: window.__game.scene.isActive('Menu') }));
  const n0 = await nav();
  check('[web] the menu is a root: nothing to go back to', n0.layers === 0 && !n0.back, JSON.stringify(n0));
  check('[web] Settings opens', await api.tapLabel('Menu', 'Settings'));
  check('[web] Settings is a layer that Back closes', await api.until(async () => { const n = await nav(); return n.layers === 1 && n.back; }, 10000, 150), JSON.stringify(await nav()));
  // the browser's Back: a popstate on the guard entry the web adapter pushed (src/platform/web/back.ts)
  const popped = await api.ev(() => new Promise((done) => { addEventListener('popstate', () => done(true), { once: true }); history.back(); setTimeout(() => done(false), 5000); }));
  check('[web] the browser Back pops the guard entry', popped);
  check('[web] Back closes Settings and stays in the game', await api.until(async () => { const n = await nav(); return n.layers === 0 && n.menu && n.href.startsWith(base); }, 10000, 150), JSON.stringify(await nav()));
  check('[web] no page errors', errors.length === 0, errors.join(' | '));
  noTelegramRequests(plat);
  await finish({ browser });
}
const ctx = await phoneContext(browser, { viewport: { width: W, height: H } });
await applyPlatform(ctx, 'telegram', { insets: INSETS, fullscreen: 'request', relayout: true, overlays: true });
const page = await ctx.newPage();
const errors = captureErrors(page, { ignoreNetwork: true });
// (above) a phone in Telegram: full screen on request, the insets late, header changes re-report the viewport
await page.route('**/api/**', (r) => r.fulfill({ status: 503, body: '{"error":"down"}', contentType: 'application/json' }));
await page.goto(base + '#tgWebAppVersion=8.0&tgWebAppPlatform=ios');
await page.waitForTimeout(3000);

const api = makePageApi(page);
const { ev, wait, active, call, start, swipe, tap, btn } = api;
/** Until `key` is in front, its art loaded and its entry motion over (scripts/regression/lib.mjs): a fixed wait loses on a loaded machine. */
const ready = (key) => settled(api, key, 30000);
await ready('Menu');
const tg = () => ev(() => ({ back: window.Telegram.WebApp.BackButton.isVisible, settings: window.Telegram.WebApp.SettingsButton.isVisible, handlers: window.__tg.backHandlers(), confirm: window.Telegram.WebApp.isClosingConfirmationEnabled, layers: window.__nav.layers() }));
const pressBack = async () => {
  await ev(() => window.__tg.pressBack());
  await wait(500);
};
/**
 * The canvas must fill exactly the safe rect. The game size is in device px:
 * the safe rect (CSS px) x RS, RS = devicePixelRatio rounded to 0.25, capped
 * at 3 (src/platform/renderScale.ts).
 */
const top = INSETS.safeTop + INSETS.contentTop;
const checkLayout = async (name) => {
  const r = await ev(() => {
    const c = document.querySelector('#game canvas').getBoundingClientRect();
    const rs = Math.max(1, Math.min(3, Math.round(devicePixelRatio * 4) / 4));
    return { top: c.top, bottom: innerHeight - c.bottom, left: c.left, right: innerWidth - c.right, gw: window.__game.scale.width, gh: window.__game.scale.height, rs };
  });
  check(`${name}: canvas below status bar and Telegram buttons`, Math.abs(r.top - top) < 1, `top=${r.top}`);
  check(`${name}: canvas above home indicator`, Math.abs(r.bottom - INSETS.safeBottom) < 1, `bottom=${r.bottom}`);
  check(`${name}: game size = safe rect x RS`, r.gw === Math.floor(W * r.rs) && r.gh === Math.floor((H - top - INSETS.safeBottom) * r.rs), `${r.gw}x${r.gh} RS ${r.rs}`);
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
await ready('Menu');
/** Finger tap (touchstart/touchend at one point) on a kit Button by label. */
const tapButton = async (key, label) => {
  const p = await btn(key, label);
  if (!p) throw new Error(`no button ${label} in ${key}`);
  await page.touchscreen.tap(p[0], p[1]);
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
{
  // the shop is a mode tab: it stays, it is a root (Close, no Back), the Campaign tab returns to the menu
  const n0 = await logLen();
  await tapButton('Menu', 'Shop');
  await ready('Shop');
  await probe('Shop');
  const r = await stays('Shop', 0);
  check('tap Shop: the shop screen stays (no auto back)', r === '', r);
  const f = await backFlips(n0);
  check('tap Shop: no BackButton on a tab root', f === 0, `flips=${f}`);
  await tapButton('Shop', 'Campaign');
  await ready('Menu');
  check('tap Shop: the Campaign tab returns to the menu', (await active('Menu')) && (await tg()).layers === 0);
}
for (const label of ['Settings']) {
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
await ready('World');
await probe('World');
const rc = await stays('World', 0);
check('tap Continue: the map stays (no auto back to the menu)', rc === '', rc);
const fc = await backFlips(n1);
check('tap Continue: BackButton shown once, no Close/Back flicker', fc === 1, `flips=${fc}`);
await pressBack();
check('map: Back -> menu', await active('Menu'));
await wait(500);

await start('World');
await ready('World');
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
await ready('World');
await start('Army', { from: 'World' });
await ready('Army');
await checkLayout('army');
check('army: no in-game back arrow', await noArrow('Army'));
await shot('Army');
await call('Army', 's.openHero(); return 1;');
await ready('Hero');
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
await ready('Battle');
await checkLayout('battle');
// ---- touch controls inside the safe area (real touch events, canvas offset by the insets)
check('battle: one-time controls hint shown', await call('Battle', 'return !!s.hint;'));
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
      // inside the visible field (BattleScene.fieldViewport, game px): the field spans the width under the top bar
      for (let x = c.left + (s.fieldViewport().left + 8) * k; !empty && x < c.width - 40; x += 20) if (own.every(([a, b]) => Math.hypot(a - x, b - y) > 90)) empty = [x, y];
    return { f: { ...f }, scroll: [cam.scrollX, cam.scrollY], empty, orders: s.sim.orderLog.length, pts: pts.map(([a, b]) => toPage([f.cx - f.fy * a - f.fx * b, f.cy + f.fx * a - f.fy * b])) };
  }, pts);
/**
 * The field after an order: the men step into their new places and shove a neighbour out of the way, and
 * the sprites ease after them. Waits until the men (as the hit test sees them) stand still.
 */
const fieldStill = async () => {
  const men = () => call('Battle', 'return JSON.stringify(s.hitState().units.map((u) => [Math.round(u.x), Math.round(u.y)]));');
  let last = await men();
  for (let i = 0; i < 40; i++) {
    await wait(300);
    const now = await men();
    if (now === last) return true;
    last = now;
  }
  return false;
};
/**
 * The page point of the first candidate (right, back paces in the selected group's frame) where a press
 * means `want`: 'turn' (the facing knob grabs it) or 'ground' (no man, no tag in reach: a tap moves the
 * group). Mirrors src/ui/input/hitTest.ts on the scene's own hit state: a man of another own group in
 * reach beats the knob (PLAY C1), and a neighbour the last order shoved can stand in reach of the knob's
 * centre, so the press point is chosen, not assumed. Null when no candidate qualifies.
 */
const pickPt = (want, cands) =>
  ev(([want, cands]) => {
    const s = window.__game.scene.getScene('Battle');
    const cam = s.cameras.main;
    const c = document.querySelector('#game canvas').getBoundingClientRect();
    const k = c.width / window.__game.scale.width;
    const f = s.sim.groups[s.selGroup].formation;
    const hs = s.hitState();
    const man = (p) => {
      let best = null;
      let bd = hs.unitR;
      for (const u of hs.units) {
        const d = u.big ? Math.sqrt((u.x - p.x) ** 2 + ((u.y - p.y) * 1.6) ** 2) * 0.7 : Math.hypot(u.x - p.x, u.y - p.y);
        if (d < bd) [bd, best] = [d, u];
      }
      return best;
    };
    const ok = (p) => {
      const m = man(p);
      if (want === 'ground') return !m && hs.tags.every((t) => Math.hypot(t.x - p.x, t.y - p.y) > hs.tagR);
      if (!hs.knob || (m && m.side === hs.me && m.group !== hs.sel)) return false;
      const kd = Math.hypot(hs.knob.x - p.x, hs.knob.y - p.y);
      return kd < hs.grabR && hs.body.every((q) => kd <= Math.hypot(q.x - p.x, q.y - p.y));
    };
    for (const [a, b] of cands) {
      const sp = s.project(f.cx - f.fy * a - f.fx * b, f.cy + f.fx * a - f.fy * b);
      const p = { x: (sp.x - cam.worldView.x) * cam.zoom, y: (sp.y - cam.worldView.y) * cam.zoom };
      if (ok(p)) return { ab: [a, b], page: [c.left + p.x * k, c.top + p.y * k] };
    }
    return null;
  }, [want, cands]);
/** Candidate points: `b0` .. `b1` paces back (negative: ahead), `a` paces right/left of the line. */
const around = (b0, b1, step, as) => {
  const out = [];
  for (let b = b0; Math.abs(b - b0) <= Math.abs(b1 - b0) + 1e-9; b += step) for (const a of as) out.push([a, +b.toFixed(2)]);
  return out;
};
// the deployment opens on both armies (QA-03 S3-3), under 1x on a small screen: the gestures below are measured in paces at 1x
if ((await call('Battle', 'return s.cameras.main.zoom / window.__rs();')) < 0.99) {
  await api.tapBtn('Battle', { id: 'battle.zoom' });
  check('battle: the zoom key takes the overview to 1x', await api.until(() => call('Battle', 'return Math.abs(s.cameras.main.zoom / window.__rs() - 1) < 0.01;'), 5000, 100));
}
const b0 = await bgeo([]);
await swipe([b0.empty, [b0.empty[0] + 50, b0.empty[1] - 40]]);
let b1 = await bgeo([]);
check('battle: drag on empty ground pans (group selected), no order', Math.hypot(b1.scroll[0] - b0.scroll[0], b1.scroll[1] - b0.scroll[1]) > 15 && b1.orders === b0.orders, JSON.stringify([b0.scroll, b1.scroll]));
// 2 paces forward, else back or aside: where no other group stands (the deployment's overlap guard, QA-03 S3-8, would slide it)
let step = [0, -2];
for (const [a, b] of [[0, -2], [0, 2], [-2, 0], [2, 0]]) {
  const clear = await call('Battle', `const f = s.sim.groups[s.selGroup].formation; const cx = f.cx - f.fy * ${a} - f.fx * ${b}; const cy = f.cy + f.fx * ${a} - f.fy * ${b}; const o = s.freeDrop({ kind: 'form', group: -1, cx, cy, fx: f.fx, fy: f.fy, frontage: f.frontage }); return !!o && Math.abs(o.cx - cx) < 1e-6 && Math.abs(o.cy - cy) < 1e-6;`);
  if (clear) {
    step = [a, b];
    break;
  }
}
b1 = await bgeo([[0, 0], step]);
await swipe(b1.pts);
const b2 = await bgeo([]);
const want = [b1.f.cx - b1.f.fy * step[0] - b1.f.fx * step[1], b1.f.cy + b1.f.fx * step[0] - b1.f.fy * step[1]];
check('battle: dragging the group moves it there', Math.hypot(b2.f.cx - want[0], b2.f.cy - want[1]) < 0.5 && b2.orders > b1.orders, JSON.stringify([b2.f.cx.toFixed(2), b2.f.cy.toFixed(2), step]));
check('battle: the move keeps facing and shape', b2.f.fx === b1.f.fx && b2.f.fy === b1.f.fy && b2.f.frontage === b1.f.frontage);
// the facing knob is KNOB_PACES ahead of the front: swing it to the group's right. The move above shoved
// a man of the next group toward the knob; once the field is still, press where the knob takes the press
check('battle: the field settles after the move', await fieldStill());
const kp = await pickPt('turn', around(-3, -3.9, -0.15, [0, -0.3, 0.3, -0.6, 0.6]));
check('battle: the facing knob can be grabbed clear of other groups', !!kp, JSON.stringify(kp));
const bk = await bgeo([[1.8, -2], [3.2, 0.3]]);
await swipe([kp?.page ?? bk.pts[0], ...bk.pts]);
const b2t = await bgeo([]);
check('battle: the facing knob turns the group toward the finger', b2t.f.fx * -bk.f.fy + b2t.f.fy * bk.f.fx > 0.9 && b2t.f.frontage === bk.f.frontage, JSON.stringify([b2t.f.fx.toFixed(2), b2t.f.fy.toFixed(2)]));
await call('Battle', 's.frameArmies(); return 1;');
await fieldStill();
// a tap on bare ground (no man, no tag in reach), dispatched in the page: a CDP tap on a slow software-GL
// frame can last past the 450 ms long press, which on deployment ground explains the terrain, no move
const gp = await pickPt('ground', around(-3, -6, -0.5, [0, -1, 1, -2, 2]));
const b3 = await bgeo([]);
if (gp) await tap(gp.page[0], gp.page[1], 300);
const b4 = await bgeo([]);
check('battle: tap on the ground moves the group, shape kept', !!gp && b4.orders > b3.orders && Math.hypot(b4.f.cx - b3.f.cx, b4.f.cy - b3.f.cy) > 1 && b4.f.frontage === b3.f.frontage, JSON.stringify([gp?.ab, b4.f.cx.toFixed(2), b4.f.cy.toFixed(2)]));

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

await finish({ browser });
