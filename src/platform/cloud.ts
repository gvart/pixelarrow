/** The game's single Online instance, wired to the real API, storage and the platform. */
import { ApiClient } from './api';
import type { Auth } from './core/auth';
import type { Payments } from './core/payments';
import { platform } from './index';
import { Online } from './online';
import { deviceKV, gameKV } from './storage';

const env = (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env ?? {};

/** The selected platform's Auth, read at each use (selectPlatform() runs after this module loads). */
const auth: Auth = {
  get transport() {
    return platform.auth.transport;
  },
  methods: () => platform.auth.methods(),
  silentProof: () => platform.auth.silentProof(),
};

/** The selected platform's Payments, read at each use. */
const payments: Payments = {
  status: () => platform.payments.status(),
  pay: (invoice) => platform.payments.pay(invoice),
};

export const online = new Online({
  api: new ApiClient({ transport: () => auth.transport }),
  kv: gameKV,
  cache: deviceKV,
  auth,
  // `VITE_DEV_AUTH=1 npm run dev` signs in as the DEV_AUTH test user of a local wrangler dev.
  devAuth: env.DEV === true && env.VITE_DEV_AUTH === '1',
  devUser: devUser(),
  payments,
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
