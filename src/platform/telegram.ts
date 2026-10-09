/**
 * Telegram Mini App integration. Everything is optional: outside Telegram all
 * calls are no-ops. The SDK script is only loaded when the page was launched
 * from Telegram (launch params in the URL hash or a Telegram webview proxy).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

type Haptic = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type Notify = 'error' | 'success' | 'warning';
export type InvoiceStatus = 'paid' | 'cancelled' | 'failed' | 'pending';

export interface TgWebApp {
  ready(): void;
  expand(): void;
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  isVersionAtLeast(v: string): boolean;
  setHeaderColor?(c: string): void;
  setBackgroundColor?(c: string): void;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation?(): void;
  disableClosingConfirmation?(): void;
  /** Bot API 8.0+: full screen, orientation lock and safe areas. */
  requestFullscreen?(): void;
  isFullscreen?: boolean;
  lockOrientation?(): void;
  safeAreaInset?: Partial<Insets>;
  contentSafeAreaInset?: Partial<Insets>;
  SettingsButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: { impactOccurred(s: Haptic): void; notificationOccurred(t: Notify): void; selectionChanged(): void };
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  CloudStorage?: {
    getItem(key: string, cb: (err: string | null, value?: string) => void): void;
    setItem(key: string, value: string, cb?: (err: string | null, ok?: boolean) => void): void;
    removeItem(key: string, cb?: (err: string | null, ok?: boolean) => void): void;
  };
  initData?: string;
  initDataUnsafe?: { user?: { first_name?: string; username?: string; language_code?: string }; start_param?: string };
  openTelegramLink?(url: string): void;
  openLink?(url: string): void;
  openInvoice?(url: string, cb?: (status: InvoiceStatus) => void): void;
  onEvent?(ev: string, cb: (arg?: any) => void): void;
  offEvent?(ev: string, cb: (arg?: any) => void): void;
}

/** Insets in CSS pixels. */
export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

let app: TgWebApp | null = null;
let hapticsEnabled = true;
let backHandler: (() => void) | null = null;
let settingsHandler: (() => void) | null = null;
let closingConfirm: boolean | null = null;
const MOBILE = new Set(['ios', 'android', 'android_x']);

function launchedFromTelegram(): boolean {
  const w = window as any;
  return /tgWebApp/i.test(location.hash) || /tgWebApp/i.test(location.search) || !!w.TelegramWebviewProxy || !!w.Telegram?.WebApp?.initData;
}

function loadScript(src: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    const t = setTimeout(resolve, timeoutMs);
    s.onload = () => {
      clearTimeout(t);
      resolve();
    };
    s.onerror = () => {
      clearTimeout(t);
      resolve();
    };
    document.head.appendChild(s);
  });
}

export async function initTelegram(): Promise<boolean> {
  const w = window as any;
  if (!w.Telegram?.WebApp && launchedFromTelegram()) {
    await loadScript('https://telegram.org/js/telegram-web-app.js', 4000);
  }
  const wa: TgWebApp | undefined = w.Telegram?.WebApp;
  if (!wa || !launchedFromTelegram()) return false;
  attachWebApp(wa);
  return true;
}

/**
 * Set up an already-loaded WebApp: ready, expand, full screen on phones
 * (Bot API 8.0+), portrait lock, no vertical swipe-to-close, colours and the
 * safe-area insets. Exported for tests.
 */
export function attachWebApp(wa: TgWebApp): void {
  app = wa;
  backHandler = null;
  settingsHandler = null;
  closingConfirm = null;
  const safe = (f: () => void) => {
    try {
      f();
    } catch {
      /* older clients */
    }
  };
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
  // Full screen only on phones: on desktop it would take over the whole monitor.
  if (v8 && MOBILE.has(wa.platform) && typeof wa.requestFullscreen === 'function' && !wa.isFullscreen) {
    safe(() => wa.requestFullscreen!());
  }
  if (v8 && typeof wa.lockOrientation === 'function' && window.innerHeight >= window.innerWidth) safe(() => wa.lockOrientation!());
  const relayout = () => emitInsets();
  for (const ev of ['safeAreaChanged', 'contentSafeAreaChanged', 'viewportChanged', 'fullscreenChanged']) safe(() => wa.onEvent?.(ev, relayout));
  // Not supported or refused: expand() above already gave us the tallest normal view.
  safe(() => wa.onEvent?.('fullscreenFailed', () => (safe(() => wa.expand()), relayout())));
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', relayout);
  // Mini App minimised / restored (Bot API 8.0+): audio suspends and resumes.
  for (const ev of ['activated', 'deactivated']) safe(() => wa.onEvent?.(ev, () => activeListeners.forEach((cb) => cb(ev === 'activated'))));
  emitInsets();
}

const activeListeners = new Set<(active: boolean) => void>();

/** Called when Telegram reports the Mini App went to the background (false) or came back (true). */
export function onAppActive(cb: (active: boolean) => void): () => void {
  activeListeners.add(cb);
  return () => activeListeners.delete(cb);
}

// ---- safe areas

const insetListeners = new Set<(device: Insets, content: Insets) => void>();

function readInsets(src: Partial<Insets> | undefined): Insets {
  const n = (v: unknown) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : 0);
  return { top: n(src?.top), bottom: n(src?.bottom), left: n(src?.left), right: n(src?.right) };
}

/** Device safe area (notch, status bar, home indicator) as Telegram reports it; zero outside Telegram. */
export function deviceInsets(): Insets {
  return readInsets(app?.safeAreaInset);
}

/** Area covered by Telegram's own floating controls (full screen Close/Back and the menu pills). */
export function contentInsets(): Insets {
  return readInsets(app?.contentSafeAreaInset);
}

/** Called with the new insets whenever Telegram reports a change (and once on attach). */
export function onInsetsChanged(cb: (device: Insets, content: Insets) => void): () => void {
  insetListeners.add(cb);
  return () => insetListeners.delete(cb);
}

function emitInsets(): void {
  const d = deviceInsets();
  const c = contentInsets();
  for (const cb of insetListeners) {
    try {
      cb(d, c);
    } catch {
      /* ignore */
    }
  }
}

export function isFullscreen(): boolean {
  return !!app?.isFullscreen;
}

/** The ⋯ menu's "Settings" item (Bot API 7.0+); null hides it. */
export function setSettingsButton(cb: (() => void) | null): void {
  const sb = app?.SettingsButton;
  if (!sb || !app?.isVersionAtLeast?.('7.0')) return;
  if (cb === settingsHandler) return; // unchanged: no show()/hide() churn
  try {
    if (settingsHandler) sb.offClick(settingsHandler);
    settingsHandler = cb;
    if (cb) {
      sb.onClick(cb);
      sb.show();
    } else sb.hide();
  } catch {
    /* ignore */
  }
}

/** Ask before closing the Mini App (Bot API 6.2+). Only calls Telegram when the value changes. */
export function setClosingConfirmation(on: boolean): void {
  if (!app || closingConfirm === on || !app.isVersionAtLeast?.('6.2')) return;
  closingConfirm = on;
  try {
    if (on) app.enableClosingConfirmation?.();
    else app.disableClosingConfirmation?.();
  } catch {
    /* ignore */
  }
}

export function inTelegram(): boolean {
  return app !== null;
}

/** Telegram client platform ("ios", "android", "tdesktop", "weba", ...) and Bot API version, or "web" outside Telegram. */
export function telegramClient(): { platform: string; version?: string } {
  return app ? { platform: app.platform || 'unknown', version: app.version } : { platform: 'web' };
}

export function telegramUserName(): string | undefined {
  return app?.initDataUnsafe?.user?.first_name;
}

/** The Telegram user's IETF language tag (e.g. "ru", "en-US"), if known. */
export function telegramLanguage(): string | undefined {
  return app?.initDataUnsafe?.user?.language_code;
}

export function themeColor(name: string): string | undefined {
  return app?.themeParams?.[name];
}

export function setHaptics(on: boolean): void {
  hapticsEnabled = on;
}

export function haptic(kind: Haptic = 'light'): void {
  if (!hapticsEnabled) return;
  try {
    app?.HapticFeedback?.impactOccurred(kind);
  } catch {
    /* ignore */
  }
}

export function hapticNotify(kind: Notify): void {
  if (!hapticsEnabled) return;
  try {
    app?.HapticFeedback?.notificationOccurred(kind);
  } catch {
    /* ignore */
  }
}

export function hapticSelect(): void {
  if (!hapticsEnabled) return;
  try {
    app?.HapticFeedback?.selectionChanged();
  } catch {
    /* ignore */
  }
}

/** Telegram's header BackButton is available (Bot API 6.1+). */
export function hasNativeBack(): boolean {
  return !!app?.BackButton && !!app.isVersionAtLeast?.('6.1');
}

/** Show Telegram's native back button with a handler, or hide it when cb is null. */
export function setBackButton(cb: (() => void) | null): void {
  const bb = app?.BackButton;
  if (!bb || !app?.isVersionAtLeast?.('6.1')) return;
  if (cb === backHandler) return; // unchanged: no show()/hide() churn
  try {
    if (backHandler) bb.offClick(backHandler);
    backHandler = cb;
    if (cb) {
      bb.onClick(cb);
      bb.show();
    } else bb.hide();
  } catch {
    /* ignore */
  }
}

export function cloudStorage(): TgWebApp['CloudStorage'] | undefined {
  if (!app || !app.isVersionAtLeast?.('6.9')) return undefined;
  return app.CloudStorage;
}

/** Signed launch data for POST /api/auth/telegram, or null outside Telegram. */
export function telegramInitData(): string | null {
  const d = app?.initData;
  return typeof d === 'string' && d.length > 0 ? d : null;
}

/** Opens a Telegram Stars invoice link; resolves with Telegram's final status. */
export function openInvoice(link: string): Promise<InvoiceStatus> {
  return new Promise((resolve) => {
    if (!app?.openInvoice || !app.isVersionAtLeast?.('6.1')) return resolve('failed');
    try {
      app.openInvoice(link, (status) => resolve(status));
    } catch {
      resolve('failed');
    }
  });
}

/**
 * The Mini App launch parameter (t.me/<bot>/<app>?startapp=<param>), or the
 * `startapp` query parameter of the page URL (bot /start buttons, browsers).
 */
export function startParam(): string | null {
  const p = app?.initDataUnsafe?.start_param;
  if (typeof p === 'string' && p) return p;
  try {
    const q = new URLSearchParams(location.search).get('startapp') ?? new URLSearchParams(location.search).get('tgWebAppStartParam');
    return q || null;
  } catch {
    return null;
  }
}

/** Opens a t.me link inside Telegram (e.g. the share sheet); in a browser, a new tab. Returns false if nothing opened. */
export function openTelegramLink(url: string): boolean {
  try {
    if (app?.openTelegramLink && app.isVersionAtLeast?.('6.1')) {
      app.openTelegramLink(url);
      return true;
    }
    return !!window.open(url, '_blank');
  } catch {
    return false;
  }
}

/** Opens a web page (Telegram's in-app browser inside Telegram, a new tab elsewhere). Returns false if nothing opened. */
export function openExternalLink(url: string): boolean {
  try {
    if (app?.openLink) {
      app.openLink(url);
      return true;
    }
    return !!window.open(url, '_blank', 'noopener');
  } catch {
    return false;
  }
}
