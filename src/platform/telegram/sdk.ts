/**
 * The Telegram WebApp SDK: its type, the launch hints and the script loader.
 * The only place (with the rest of this folder) that touches the Telegram globals.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { EnvWindow, PlatformEnv } from '../core/env';
import type { Insets } from '../core/safeArea';

export type InvoiceStatus = 'paid' | 'cancelled' | 'failed' | 'pending';
type Button = { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };

export interface TgWebApp {
  ready(): void;
  expand(): void;
  close?(): void;
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
  SettingsButton?: Button;
  HapticFeedback?: { impactOccurred(s: string): void; notificationOccurred(t: string): void; selectionChanged(): void };
  BackButton?: Button;
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

type TgWindow = EnvWindow & { Telegram?: { WebApp?: TgWebApp }; TelegramWebviewProxy?: unknown };

export const SDK_URL = 'https://telegram.org/js/telegram-web-app.js';

/** The SDK object, if its script has loaded. */
export function sdk(env: PlatformEnv): TgWebApp | undefined {
  return (env.window as TgWindow | undefined)?.Telegram?.WebApp;
}

/**
 * Telegram puts its launch data in the URL hash (or query), its native clients
 * add a webview proxy, and a loaded SDK has signed initData; a plain web visit
 * has none of these.
 */
export function telegramLaunchHints(env: PlatformEnv): { hash: string; search: string; webviewProxy: boolean; sdkInitData: boolean } {
  const w = env.window as TgWindow | undefined;
  return { hash: w?.location.hash ?? '', search: w?.location.search ?? '', webviewProxy: !!w?.TelegramWebviewProxy, sdkInitData: !!w?.Telegram?.WebApp?.initData };
}

/** The hints say the page was launched from Telegram. */
export function isTelegramLaunch(h: ReturnType<typeof telegramLaunchHints>): boolean {
  return /tgWebApp/i.test(h.hash) || /tgWebApp/i.test(h.search) || h.webviewProxy || h.sdkInitData;
}

export function launchedFromTelegram(env: PlatformEnv): boolean {
  return isTelegramLaunch(telegramLaunchHints(env));
}

/** Adds the script; resolves on load, error or after timeoutMs, whichever comes first. */
export function loadScript(env: PlatformEnv, src: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const doc = env.document;
    if (!doc?.createElement || !doc.head) return resolve();
    const s = doc.createElement('script');
    s.src = src;
    s.async = true;
    const t = env.setTimeout(resolve, timeoutMs);
    s.onload = () => {
      env.clearTimeout(t);
      resolve();
    };
    s.onerror = () => {
      env.clearTimeout(t);
      resolve();
    };
    doc.head.appendChild(s);
  });
}

/** Runs f, ignoring what older clients throw. */
export function safe(f: () => void): void {
  try {
    f();
  } catch {
    /* older clients */
  }
}
