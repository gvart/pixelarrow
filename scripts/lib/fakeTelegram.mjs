// A fake Telegram.WebApp (Bot API 8.0, iOS) for the browser checks:
//   await ctx.addInitScript(fakeTelegram, { ...options });
// It runs inside the page, so it must stay self-contained (no imports, no
// closures over module scope): addInitScript serializes the function source.
//
// Options (all optional):
//   insets      { safeTop, contentTop, safeBottom } in CSS px (default all 0)
//   fullscreen  'request'  requestFullscreen() works like a phone: full screen
//                          first, the insets a moment later and in pieces
//               'launch'   already full screen with the insets reported at launch
//               'none'     (default) no requestFullscreen / lockOrientation
//   relayout    Telegram re-reports the viewport and safe areas (several
//               times, asynchronously) whenever its header changes
//               (BackButton shown / hidden) (default false)
//   overlays    draw iOS's status bar, Telegram's Back / ⋯ pills and the home
//               indicator over the page (default false)
//   languageCode  initDataUnsafe.user.language_code
//   invoices    openInvoice() reports links containing "invoice" as paid (default false)
//
// One event bus for everything, like telegram-web-app.js: BackButton.onClick
// is onEvent('backButtonClicked'), SettingsButton.onClick is
// onEvent('settingsButtonClicked'); handlers run in a live loop.
// Test handles on window.__tg: log (calls made), pressBack(), pressSettings(),
// backHandlers(), relayoutBurst().
export function fakeTelegram(opts) {
  const o = opts || {};
  const ins = Object.assign({ safeTop: 0, contentTop: 0, safeBottom: 0 }, o.insets);
  const mode = o.fullscreen || 'none';
  const store = new Map();
  const log = [];
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
      if (!was && o.relayout) relayoutBurst();
      return this;
    },
    hide() {
      const was = this.isVisible;
      this.isVisible = false;
      log.push(name + '.hide');
      pill();
      if (was && o.relayout) relayoutBurst();
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
  const zero = { top: 0, bottom: 0, left: 0, right: 0 };
  const atLaunch = mode === 'launch';
  const user = { first_name: 'Ana' };
  if (o.languageCode) user.language_code = o.languageCode;
  const wa = {
    initData: 'query_id=AA&user=%7B%22id%22%3A1%2C%22first_name%22%3A%22Ana%22%7D&auth_date=1&hash=00',
    initDataUnsafe: { user },
    version: '8.0',
    platform: 'ios',
    colorScheme: 'dark',
    themeParams: {},
    isFullscreen: atLaunch,
    isExpanded: atLaunch,
    isClosingConfirmationEnabled: false,
    safeAreaInset: atLaunch ? { top: ins.safeTop, bottom: ins.safeBottom, left: 0, right: 0 } : { ...zero },
    contentSafeAreaInset: atLaunch ? { top: ins.contentTop, bottom: 0, left: 0, right: 0 } : { ...zero },
    isVersionAtLeast: (v) => parseFloat(v) <= 8.0,
    ready() { log.push('ready'); },
    expand() { log.push('expand'); wa.isExpanded = true; },
    setHeaderColor() {},
    setBackgroundColor() {},
    disableVerticalSwipes() { log.push('disableVerticalSwipes'); },
    enableClosingConfirmation() { wa.isClosingConfirmationEnabled = true; },
    disableClosingConfirmation() { wa.isClosingConfirmationEnabled = false; },
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
  if (mode !== 'none') {
    wa.lockOrientation = () => log.push('lockOrientation');
    wa.requestFullscreen = () => {
      log.push('requestFullscreen');
      if (mode !== 'request') return;
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
    };
  }
  if (o.invoices) wa.openInvoice = (link, cb) => setTimeout(() => cb(link.includes('invoice') ? 'paid' : 'failed'), 300);
  window.Telegram = { WebApp: wa };
  window.__tg = {
    log,
    pressBack: () => emit('backButtonClicked'),
    pressSettings: () => emit('settingsButtonClicked'),
    backHandlers: () => (handlers.get('backButtonClicked') || []).length,
    relayoutBurst,
  };
  if (!o.overlays) return;
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
