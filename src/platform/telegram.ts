/**
 * Telegram Mini App integration. Everything is optional: outside Telegram all
 * calls are no-ops. The SDK script is only loaded when the page was launched
 * from Telegram (launch params in the URL hash or a Telegram webview proxy).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

type Haptic = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type Notify = 'error' | 'success' | 'warning';
export type InvoiceStatus = 'paid' | 'cancelled' | 'failed' | 'pending';

interface TgWebApp {
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
  HapticFeedback?: { impactOccurred(s: Haptic): void; notificationOccurred(t: Notify): void; selectionChanged(): void };
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  CloudStorage?: {
    getItem(key: string, cb: (err: string | null, value?: string) => void): void;
    setItem(key: string, value: string, cb?: (err: string | null, ok?: boolean) => void): void;
    removeItem(key: string, cb?: (err: string | null, ok?: boolean) => void): void;
  };
  initData?: string;
  initDataUnsafe?: { user?: { first_name?: string; username?: string } };
  openInvoice?(url: string, cb?: (status: InvoiceStatus) => void): void;
  onEvent?(ev: string, cb: () => void): void;
}

let app: TgWebApp | null = null;
let hapticsEnabled = true;
let backHandler: (() => void) | null = null;

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
  app = wa;
  try {
    wa.ready();
    wa.expand();
    if (wa.isVersionAtLeast?.('7.7')) wa.disableVerticalSwipes?.();
    if (wa.isVersionAtLeast?.('6.1')) {
      wa.setHeaderColor?.('#2b1d1a');
      wa.setBackgroundColor?.('#2b1d1a');
    }
  } catch {
    /* older clients */
  }
  return true;
}

export function inTelegram(): boolean {
  return app !== null;
}

export function telegramUserName(): string | undefined {
  return app?.initDataUnsafe?.user?.first_name;
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

/** Show Telegram's native back button with a handler, or hide it when cb is null. */
export function setBackButton(cb: (() => void) | null): void {
  const bb = app?.BackButton;
  if (!bb) return;
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
