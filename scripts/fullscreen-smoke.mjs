// Telegram full screen, safe areas and native back navigation, with a fake
// Telegram.WebApp (Bot API 8.0, iOS). Reproduces an iPhone in full screen:
// status bar 59 px, Telegram's floating Back / ⋯ pills 46 px below it, home
// indicator 34 px; the insets arrive late (after ready()) like on a real
// device. Checks the canvas sits inside the safe area on every screen, that
// Back / Settings / closing confirmation follow the screens, and saves
// shots/29-fullscreen-safe-area.png (git-ignored; menu, map, army, battle with
// the fake overlays drawn on top).
// Usage: node scripts/fullscreen-smoke.mjs [baseUrl] [outDir]   (needs a running dev/preview server)
import { launch, phoneContext, captureErrors, makePageApi, check, finish, shotsDir } from './lib/harness.mjs';
import { fakeTelegram } from './lib/fakeTelegram.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = shotsDir('', process.argv[3]);
const W = 390;
const H = 844;
const INSETS = { safeTop: 59, contentTop: 46, safeBottom: 34 };

const browser = await launch();
const ctx = await phoneContext(browser, { viewport: { width: W, height: H } });
const page = await ctx.newPage();
const errors = captureErrors(page, { ignoreNetwork: true });
// a phone in Telegram: full screen on request, the insets late, header changes re-report the viewport
await ctx.addInitScript(fakeTelegram, { insets: INSETS, fullscreen: 'request', relayout: true, overlays: true });
await page.route('**/api/**', (r) => r.fulfill({ status: 503, body: '{"error":"down"}', contentType: 'application/json' }));
await page.goto(base + '#tgWebAppVersion=8.0&tgWebAppPlatform=ios');
await page.waitForTimeout(3000);

const { ev, wait, active, call, start, swipe, btn } = makePageApi(page);
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
await wait(1500);
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
  // the shop is its own screen: it stays, Back returns to the menu
  const n0 = await logLen();
  await tapButton('Menu', 'Shop');
  await wait(300);
  await probe('Shop');
  const r = await stays('Shop', 0);
  check('tap Shop: the shop screen stays (no auto back)', r === '', r);
  const f = await backFlips(n0);
  check('tap Shop: BackButton shown once, no Close/Back flicker', f === 1, `flips=${f}`);
  await pressBack();
  await wait(300);
  check('tap Shop: Back returns to the menu', (await active('Menu')) && (await tg()).layers === 0);
}
for (const label of ['Settings', 'New campaign']) {
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
const b0 = await bgeo([]);
await swipe([b0.empty, [b0.empty[0] + 50, b0.empty[1] - 40]]);
let b1 = await bgeo([]);
check('battle: drag on empty ground pans (group selected), no order', Math.hypot(b1.scroll[0] - b0.scroll[0], b1.scroll[1] - b0.scroll[1]) > 15 && b1.orders === b0.orders, JSON.stringify([b0.scroll, b1.scroll]));
b1 = await bgeo([[0, 0], [0, -2]]);
await swipe(b1.pts);
const b2 = await bgeo([]);
check('battle: dragging the group moves it forward', Math.hypot(b2.f.cx - (b1.f.cx + b1.f.fx * 2), b2.f.cy - (b1.f.cy + b1.f.fy * 2)) < 0.5 && b2.orders > b1.orders, JSON.stringify([b2.f.cx.toFixed(2), b2.f.cy.toFixed(2)]));
check('battle: the move keeps facing and shape', b2.f.fx === b1.f.fx && b2.f.fy === b1.f.fy && b2.f.frontage === b1.f.frontage);
// the facing knob is KNOB_PACES ahead of the front: swing it to the group's right
const bk = await bgeo([[0, -3], [1.8, -2], [3.2, 0.3]]);
await swipe(bk.pts);
const b2t = await bgeo([]);
check('battle: the facing knob turns the group toward the finger', b2t.f.fx * -bk.f.fy + b2t.f.fy * bk.f.fx > 0.9 && b2t.f.frontage === bk.f.frontage, JSON.stringify([b2t.f.fx.toFixed(2), b2t.f.fy.toFixed(2)]));
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

await finish({ browser });
