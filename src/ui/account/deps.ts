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
import type { UiScene } from '../mosaic/subShell';
import { afterSignIn } from './twoCampaigns';

export interface AccountDeps {
  api: Pick<ApiClient, 'signup' | 'login' | 'resetRequest' | 'resendVerify' | 'logout' | 'logoutAll'>;
  /**
   * online.recheckSession() after a log-in (V6-073); signOut() for Log out (it keeps the campaign as a guest
   * save, V6-ACCT-07); playerName for the "Signed in as" toast.
   */
  session: { recheckSession(): Promise<boolean>; signOut(end: () => Promise<unknown>): Promise<boolean>; readonly playerName: string | null };
  /** The platform's human check (web: Turnstile); absent on Telegram. */
  humanCheck?: HumanCheck;
  /** Device-local storage: the pending sign-up email (accounts-v6.md §5.5). */
  kv: KV;
  now: () => number;
  /** The client's failed log-in count and the resend gate, kept for the page's life. */
  guard: LoginGuard;
  resend: ResendGate;
  /**
   * After a log-in: the first sync of this device's campaign with the account (V6-ACCT-07: the guest
   * save goes up, or AU-08 asks), then `done`. Absent in stand-ins (the Kit, tests): `done` runs at once.
   */
  afterSignIn?: (scene: UiScene, done: () => void) => void;
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
    afterSignIn: (scene, done) => void afterSignIn(scene, done),
  };
  return real;
}
