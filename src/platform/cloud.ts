/** The game's single Online instance, wired to the real API, storage and Telegram. */
import { ApiClient } from './api';
import { Online } from './online';
import { gameKV, localKV } from './storage';
import { openInvoice, telegramInitData } from './telegram';

const env = (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env ?? {};

export const online = new Online({
  api: new ApiClient(),
  kv: () => gameKV().primary,
  cache: localKV(),
  initData: telegramInitData,
  // `VITE_DEV_AUTH=1 npm run dev` signs in as the DEV_AUTH test user of a local wrangler dev.
  devAuth: env.DEV === true && env.VITE_DEV_AUTH === '1',
  devUser: devUser(),
  openInvoice,
  timeZoneOffset: () => -new Date().getTimezoneOffset(),
});

/** `?devuser=<n>` picks another DEV_AUTH test user (dev builds only). */
function devUser(): { id: number; name: string } | undefined {
  if (!(env.DEV === true && env.VITE_DEV_AUTH === '1')) return undefined;
  try {
    const n = Number(new URLSearchParams(location.search).get('devuser'));
    if (Number.isInteger(n) && n > 0) return { id: n, name: `Dev${n}` };
  } catch {
    /* no location */
  }
  return undefined;
}
