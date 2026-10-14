/** Telegram Stars: the server's invoice link opens in Telegram's payment sheet (Bot API 6.1+). */
import type { Payments } from '../core/payments';
import type { TgWebApp } from './sdk';

const PAY_RESULTS = new Set(['paid', 'cancelled', 'failed', 'pending']);

/** `app` is the attached WebApp (null before attach or when the SDK failed); `v` checks the client's Bot API version. */
export function createTelegramPayments(app: () => TgWebApp | null, v: (ver: string) => boolean): Payments {
  return {
    status: () => (app()?.openInvoice && v('6.1') ? { available: true, provider: 'telegram_stars' } : { available: false, reason: 'offline' }),
    pay: (invoice) =>
      new Promise((resolve) => {
        const wa = app();
        if (!wa?.openInvoice || !v('6.1')) return resolve('failed');
        try {
          wa.openInvoice(invoice.link, (status) => resolve(PAY_RESULTS.has(status) ? status : 'failed'));
        } catch {
          resolve('failed');
        }
      }),
  };
}
