/**
 * The Telegram Mini App adapter. init() loads the SDK when the page was
 * launched from Telegram, then attaches it: ready, expand, full screen on
 * phones (Bot API 8.0+), portrait lock, colours and the event wiring. Without
 * the SDK (it failed to load) every call degrades to a no-op; the game never
 * switches to the web adapter mid-session.
 */
import type { PlatformEnv } from '../core/env';
import type { Platform } from '../core/platform';
import type { Insets } from '../core/safeArea';
import type { KV } from '../core/storage';
import { browserCommandKey, browserInputHints, copyText, localKV, openTab, PLAY_URL, queryLaunchParam } from '../web/dom';
import { createTelegramBack } from './back';
import { createTelegramPayments } from './payments';
import { launchedFromTelegram, loadScript, safe, sdk, SDK_URL, type TgWebApp } from './sdk';
import { cloudKV, mirroredKV, type CloudHealth } from './storage';

export type { TgWebApp } from './sdk';

/** The Telegram adapter, plus what the telegram.ts shim still needs until M10 deletes it. */
export interface TelegramPlatform extends Platform {
  readonly id: 'telegram';
  /** Set up an already-loaded WebApp (init() does this; tests call it with a fake). */
  attach(wa: TgWebApp): void;
  /** The attached WebApp, or null (not launched from Telegram, or the SDK failed). */
  webApp(): TgWebApp | null;
  /** Opens a t.me link inside Telegram, else a new tab; false when nothing opened. */
  openTelegramLink(url: string): boolean;
}

const MOBILE = new Set(['ios', 'android', 'android_x']);
/** Clients that run on a computer, where a keyboard is likely. */
const DESKTOP = new Set(['tdesktop', 'macos', 'weba']);
/** Clients on Apple systems, where the shortcut modifier is ⌘. */
const APPLE_CLIENTS = new Set(['macos', 'ios']);
const ZERO: Insets = { top: 0, bottom: 0, left: 0, right: 0 };

function readInsets(src: Partial<Insets> | undefined): Insets {
  const n = (v: unknown) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : 0);
  return src ? { top: n(src.top), bottom: n(src.bottom), left: n(src.left), right: n(src.right) } : { ...ZERO };
}

export function createTelegramPlatform(env: PlatformEnv, opts: { bot?: string; app?: string } = {}): TelegramPlatform {
  let app: TgWebApp | null = null;
  let enabled = true; // the Settings haptics toggle
  const insetSubs = new Set<(device: Insets, content: Insets) => void>();
  const activeSubs = new Set<(active: boolean) => void>();
  const back = createTelegramBack(() => app);
  const mirror = localKV(env);
  const cloudHealth: CloudHealth = { down: false };
  let saveKV: { cs: NonNullable<TgWebApp['CloudStorage']>; kv: KV } | null = null;
  // the macOS and iOS clients use ⌘; Telegram Desktop and Web follow the OS they run on
  const input = browserInputHints(env, () => DESKTOP.has(app?.platform ?? ''), () => (APPLE_CLIENTS.has(app?.platform ?? '') ? 'meta' : browserCommandKey(env)));

  const v = (ver: string): boolean => !!app?.isVersionAtLeast?.(ver);
  const insets = () => ({ device: readInsets(app?.safeAreaInset), content: readInsets(app?.contentSafeAreaInset) });
  const emitInsets = (): void => {
    const { device, content } = insets();
    for (const cb of insetSubs) safe(() => cb(device, content));
  };
  const haptic = (f: (h: NonNullable<TgWebApp['HapticFeedback']>) => void): void => {
    if (!enabled) return;
    const h = app?.HapticFeedback;
    if (h) safe(() => f(h));
  };
  const cloud = () => (v('6.9') && app?.CloudStorage ? app.CloudStorage : null);
  const openTelegramLink = (url: string): boolean => {
    try {
      if (app?.openTelegramLink && v('6.1')) {
        app.openTelegramLink(url);
        return true;
      }
    } catch {
      return false;
    }
    return openTab(env, url);
  };

  const attach = (wa: TgWebApp): void => {
    app = wa;
    back.reset();
    safe(() => wa.ready());
    safe(() => wa.expand());
    safe(() => {
      if (wa.isVersionAtLeast?.('7.7')) wa.disableVerticalSwipes?.();
    });
    safe(() => {
      if (wa.isVersionAtLeast?.('6.1')) {
        // the game's own dark identity (src/ui/tokens.ts SURFACE.bg), not the Telegram theme
        wa.setHeaderColor?.('#14100c');
        wa.setBackgroundColor?.('#14100c');
      }
    });
    const v8 = !!wa.isVersionAtLeast?.('8.0');
    const win = env.window;
    // Full screen only on phones: on desktop it would take over the whole monitor.
    if (v8 && MOBILE.has(wa.platform) && typeof wa.requestFullscreen === 'function' && !wa.isFullscreen) safe(() => wa.requestFullscreen!());
    if (v8 && typeof wa.lockOrientation === 'function' && win && win.innerHeight >= win.innerWidth) safe(() => wa.lockOrientation!());
    for (const ev of ['safeAreaChanged', 'contentSafeAreaChanged', 'viewportChanged', 'fullscreenChanged']) safe(() => wa.onEvent?.(ev, emitInsets));
    // Not supported or refused: expand() above already gave us the tallest normal view.
    safe(() => wa.onEvent?.('fullscreenFailed', () => (safe(() => wa.expand()), emitInsets())));
    win?.addEventListener('resize', emitInsets);
    win?.addEventListener('orientationchange', emitInsets);
    // Mini App minimised / restored (Bot API 8.0+): audio suspends and resumes.
    for (const ev of ['activated', 'deactivated']) safe(() => wa.onEvent?.(ev, () => activeSubs.forEach((cb) => cb(ev === 'activated'))));
    emitInsets();
  };

  return {
    id: 'telegram',
    async init() {
      input.listen();
      if (!sdk(env) && launchedFromTelegram(env)) await loadScript(env, SDK_URL, 4000);
      const wa = sdk(env);
      if (wa && launchedFromTelegram(env)) attach(wa);
    },
    attach,
    webApp: () => app,
    openTelegramLink,
    auth: {
      transport: 'bearer',
      methods: () => ['telegram'],
      silentProof() {
        const d = app?.initData;
        return typeof d === 'string' && d.length > 0 ? { kind: 'telegram', initData: d } : null;
      },
      // the Mini App's own direct link relaunches it with fresh initData, straight into the account page
      reopen: () => !!app && !!opts.bot && openTelegramLink(`https://t.me/${opts.bot}/${opts.app ?? 'play'}?startapp=account`),
    },
    payments: createTelegramPayments(() => app, v),
    storage: {
      save() {
        const cs = cloud();
        if (!cs) return mirror;
        // one per CloudStorage: its write queue keeps the cloud copy in order
        if (saveKV?.cs !== cs) saveKV = { cs, kv: mirroredKV(cloudKV(env, cs, cloudHealth), mirror, cloudHealth) };
        return saveKV.kv;
      },
      device: () => mirror,
      get roams() {
        return !!cloud();
      },
    },
    haptics: {
      impact: (s) => haptic((h) => h.impactOccurred(s)),
      notify: (t) => haptic((h) => h.notificationOccurred(t)),
      select: () => haptic((h) => h.selectionChanged()),
      setEnabled(on) {
        enabled = on;
      },
    },
    back,
    share: {
      inviteUrl: (param) => (opts.bot ? `https://t.me/${opts.bot}/${opts.app ?? 'play'}?startapp=${encodeURIComponent(param)}` : `${PLAY_URL}?startapp=${encodeURIComponent(param)}`),
      async invite(url, text) {
        if (app && openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`)) return 'shared';
        return (await copyText(env, url)) ? 'copied' : 'failed';
      },
      openExternal(url) {
        try {
          if (app?.openLink) {
            app.openLink(url);
            return true;
          }
        } catch {
          return false;
        }
        return openTab(env, url, 'noopener');
      },
    },
    safeArea: {
      current: insets,
      onChange(cb) {
        insetSubs.add(cb);
        return () => insetSubs.delete(cb);
      },
    },
    input,
    notifications: { channels: () => ['telegram_bot'] },
    onActive(cb) {
      activeSubs.add(cb);
      return () => activeSubs.delete(cb);
    },
    launchParam() {
      const p = app?.initDataUnsafe?.start_param;
      return typeof p === 'string' && p ? p : queryLaunchParam(env);
    },
    client: () => (app ? { platform: app.platform || 'unknown', version: app.version, language: app.initDataUnsafe?.user?.language_code } : { platform: 'web' }),
    closeApp() {
      if (!app?.close) return false;
      try {
        app.close();
        return true;
      } catch {
        return false;
      }
    },
  };
}
