/**
 * What the sign-in screens talk to (V6-ACCT-05): the API, the session, the platform's human check and
 * this device's storage. The game passes the real ones (accountDeps); the Kit's Forms page and tests
 * pass stand-ins, so every form state can be shown without a server.
 */
import type { ApiClient } from '../../platform/api';
import type { HumanCheck } from '../../platform/core/auth';
import type { KV } from '../../game/save';
import { platform } from '../../platform';
import { online } from '../../platform/cloud';
import { deviceKV } from '../../platform/storage';
import { LoginGuard, ResendGate } from './flows';

export interface AccountDeps {
  api: Pick<ApiClient, 'signup' | 'login' | 'resetRequest' | 'resendVerify' | 'logout'>;
  /** online.recheckSession() after a log-in or log-out (V6-073); playerName for the "Signed in as" toast. */
  session: { recheckSession(): Promise<boolean>; readonly playerName: string | null };
  /** The platform's human check (web: Turnstile); absent on Telegram. */
  humanCheck?: HumanCheck;
  /** Device-local storage: the pending sign-up email (accounts-v6.md §5.5). */
  kv: KV;
  now: () => number;
  /** The client's failed log-in count and the resend gate, kept for the page's life. */
  guard: LoginGuard;
  resend: ResendGate;
}

let real: AccountDeps | null = null;

/** The game's own: the Worker API, the Online session, the platform's check, localStorage. */
export function accountDeps(): AccountDeps {
  real ??= {
    api: online.api,
    session: online,
    get humanCheck() {
      return platform.auth.humanCheck;
    },
    kv: deviceKV,
    now: () => Date.now(),
    guard: new LoginGuard(),
    resend: new ResendGate(),
  };
  return real;
}
