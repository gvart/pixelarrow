/**
 * Compatibility shim (ADR-0006 M1): the names game code imported from the old
 * Telegram module, now delegating to `platform` (src/platform/index.ts).
 * Migration steps M2 to M8 move the importers off it; M10 deletes it. Do not
 * add importers.
 */
import { platform } from './index';
import type { Insets } from './core/safeArea';
import type { TelegramPlatform, TgWebApp } from './telegram/index';

export type { InvoiceStatus, TgWebApp } from './telegram/index';
export type { Insets };
export { haptic, hapticNotify, hapticSelect, setHaptics } from './haptics';

/** The Telegram adapter when it is this session's platform (only this shim asks). */
function tg(): TelegramPlatform | null {
  return platform.id === 'telegram' ? (platform as TelegramPlatform) : null;
}

/** Set up an already-loaded WebApp. For tests. */
export function attachWebApp(wa: TgWebApp): void {
  tg()?.attach(wa);
}

/** Called with the new insets whenever they change (and once on attach). */
export function onInsetsChanged(cb: (device: Insets, content: Insets) => void): () => void {
  return platform.safeArea.onChange(cb);
}

/** Device safe area (notch, status bar, home indicator). */
export function deviceInsets(): Insets {
  return platform.safeArea.current().device;
}

export function setSettingsButton(cb: (() => void) | null): void {
  platform.back.setSettings(cb);
}

export function setClosingConfirmation(on: boolean): void {
  platform.back.setClosingConfirmation(on);
}

export function inTelegram(): boolean {
  return !!tg()?.webApp();
}

export function hasNativeBack(): boolean {
  return platform.back.native;
}

export function setBackButton(cb: (() => void) | null): void {
  platform.back.setBack(cb);
}

export function openInvoice(link: string): Promise<'paid' | 'cancelled' | 'failed' | 'pending'> {
  return platform.payments.pay({ provider: 'telegram_stars', link });
}

export function startParam(): string | null {
  return platform.launchParam();
}

/** Opens a t.me link inside Telegram (e.g. the share sheet); elsewhere, a new tab. False if nothing opened. */
export function openTelegramLink(url: string): boolean {
  const t = tg();
  if (t) return t.openTelegramLink(url);
  try {
    return !!window.open(url, '_blank');
  } catch {
    return false;
  }
}

export function openExternalLink(url: string): boolean {
  return platform.share.openExternal(url);
}
