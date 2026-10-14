/**
 * The sign-in screens' doors (V6-ACCT-05). Everything is capability-gated, never platform-gated
 * (UXA-04): the email forms open only where `platform.auth.methods()` includes 'password' (the web).
 *
 * Hooks for the next stories:
 * - AU-01 "Sign in to play online" and the guest tip (ACCT-07): `openAccountForm(scene, 'signup' | 'login', { onSignedIn })`.
 * - The Account page's Log out (ACCT-07): `logOut()`, then re-render (the session is re-read).
 * - The /auth/* pages (ACCT-06) link back to `/#login` and `/#forgot`: Boot opens the menu with
 *   `data.account.view`, and the menu calls `openAccountRoute`.
 * - Check your email for add / change email (LINK-05): `openCheckEmail` is ready for more variants.
 */
import { platform } from '../../platform';
import { isApiError } from '../../platform/api';
import type { AuthForm } from '../form/authForm';
import type { UiScene } from '../mosaic/subShell';
import { accountDeps, type AccountDeps } from './deps';
import { openForgot } from './forgot';
import { openLogin, type SignInOpts } from './login';
import { openSignup } from './signup';

export type { AccountDeps } from './deps';
export type { SignInOpts } from './login';
export { openCheckEmail } from './checkEmail';

export type AccountForm = 'login' | 'signup' | 'forgot';

/** This platform signs in with email and password (the web). */
export const canUsePasswordForms = (): boolean => platform.auth.methods().includes('password');

/** Opens a sign-in form over `scene`; null where the platform has no email forms (Telegram). */
export function openAccountForm(scene: UiScene, form: AccountForm, o: SignInOpts = {}, d: AccountDeps = accountDeps()): AuthForm | null {
  if (!canUsePasswordForms()) return null;
  return form === 'login' ? openLogin(scene, d, o) : form === 'signup' ? openSignup(scene, d, o) : openForgot(scene, d, o);
}

/**
 * A launch route of src/online/deeplink.ts (`data.account` of the menu): `#login` and `#forgot` open
 * their form, once (the hash is cleared so a reload doesn't reopen it). Other views (`account`,
 * `conflict`, `link`) belong to the account page stories; false when this didn't handle the route.
 */
export function openAccountRoute(scene: UiScene, route: { view?: string } | undefined, o: SignInOpts = {}): boolean {
  const view = route?.view;
  if (view !== 'login' && view !== 'forgot') return false;
  try {
    if (location.hash === `#${view}`) history.replaceState(history.state, '', location.pathname + location.search);
  } catch {
    /* no history: the route stays in the address */
  }
  return !!openAccountForm(scene, view, o);
}

/**
 * Log out on this device (accounts-v6.md §6.3): ends the cookie session on the server, then re-reads
 * it so every screen sees the player signed out. True when the device is signed out afterwards; a
 * session that had already ended counts as done.
 */
export async function logOut(d: AccountDeps = accountDeps()): Promise<boolean> {
  try {
    await d.api.logout();
  } catch (e) {
    if (!(isApiError(e) && e.status === 401)) return false;
  }
  return !(await d.session.recheckSession());
}
