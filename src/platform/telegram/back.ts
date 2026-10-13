/** Telegram's header BackButton (6.1+), the ⋯ menu Settings item (7.0+) and the closing confirmation (6.2+). */
import type { BackButton } from '../core/back';
import type { TgWebApp } from './sdk';

export interface TgBack extends BackButton {
  /** Forget the handlers (a new WebApp was attached). */
  reset(): void;
}

export function createTelegramBack(app: () => TgWebApp | null): TgBack {
  let backHandler: (() => void) | null = null;
  let settingsHandler: (() => void) | null = null;
  let closingConfirm: boolean | null = null;

  /** Show the button with cb, or hide it on null; only touches Telegram when cb changes. */
  const wire = (btn: TgWebApp['BackButton'], current: (() => void) | null, cb: (() => void) | null): (() => void) | null => {
    if (!btn || cb === current) return current;
    try {
      if (current) btn.offClick(current);
      if (cb) {
        btn.onClick(cb);
        btn.show();
      } else btn.hide();
    } catch {
      /* ignore */
    }
    return cb;
  };

  return {
    get native() {
      const a = app();
      return !!a?.BackButton && !!a.isVersionAtLeast?.('6.1');
    },
    setBack(cb) {
      const a = app();
      if (a?.isVersionAtLeast?.('6.1')) backHandler = wire(a.BackButton, backHandler, cb);
    },
    setSettings(cb) {
      const a = app();
      if (a?.isVersionAtLeast?.('7.0')) settingsHandler = wire(a.SettingsButton, settingsHandler, cb);
    },
    setClosingConfirmation(on) {
      const a = app();
      if (!a || closingConfirm === on || !a.isVersionAtLeast?.('6.2')) return;
      closingConfirm = on;
      try {
        if (on) a.enableClosingConfirmation?.();
        else a.disableClosingConfirmation?.();
      } catch {
        /* ignore */
      }
    },
    reset() {
      backHandler = null;
      settingsHandler = null;
      closingConfirm = null;
    },
  };
}
