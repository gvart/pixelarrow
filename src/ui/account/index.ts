/**
 * The sign-in screens' doors (V6-ACCT-05). Everything is capability-gated, never platform-gated
 * (UXA-04): the email forms open only where `platform.auth.methods()` includes 'password' (the web).
 *
 * Hooks for the next stories:
 * - AU-01 "Sign in to play online" and the guest tip (ACCT-07): `openAccountForm(scene, 'signup' | 'login', { onSignedIn })`.
 * - The Account page's Log out (ACCT-07): `logOut()`, then re-render.
 * - The /auth/* pages (ACCT-06) link back to `/#login` and `/#forgot`: Boot opens the menu with
 *   `data.account.view`, and the menu calls `openAccountRoute`.
 * - Check your email for add / change email (LINK-05): `openCheckEmail` is ready for more variants.
 */
import { platform } from '../../platform';
import type { AuthForm } from '../form/authForm';
import type { UiScene } from '../mosaic/subShell';
import { accountDeps, type AccountDeps } from './deps';
import { openForgot } from './forgot';
import { openLogin, type SignInOpts } from './login';
import { openSignup } from './signup';
import { openLinkRequest } from './linkRequest';
import { openWebConflict } from './conflict';

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
 * A launch route of src/online/deeplink.ts (`data.account` of the menu), once (a hash route is cleared so
 * a reload doesn't reopen it): `#login` and `#forgot` open their form; `link` (startapp=link_<code>)
 * opens AU-14 where the platform has a signed proof to complete it with (the Mini App); `conflict`
 * (`#account/conflict/<id>`) opens AU-16 where the player signs in with a password (the web). False when
 * this didn't handle the route (`account` belongs to the menu).
 */
export function openAccountRoute(scene: UiScene, route: { view?: string; id?: string; code?: string } | undefined, o: SignInOpts = {}): boolean {
  const view = route?.view;
  const clear = (hash: string) => {
    try {
      if (location.hash === hash) history.replaceState(history.state, '', location.pathname + location.search);
    } catch {
      /* no history: the route stays in the address */
    }
  };
  if (view === 'link' && route?.code) {
    if (!accountDeps().proof()) return false;
    openLinkRequest(scene, route.code);
    return true;
  }
  if (view === 'conflict' && route?.id) {
    clear(`#account/conflict/${route.id}`);
    if (!canUsePasswordForms()) return false;
    openWebConflict(scene, route.id, { hasPassword: true, onDone: () => o.onSignedIn?.() });
    return true;
  }
  if (view !== 'login' && view !== 'forgot') return false;
  clear(`#${view}`);
  return !!openAccountForm(scene, view, o);
}

/**
 * Log out (accounts-v6.md §6.3): uploads what the campaign has waiting, ends the session on the server
 * (`everywhere`: every session of the player, this one included, §14 Q6), and keeps the campaign on
 * this device as a guest save with its sync metadata removed. True when it is done; a session that had
 * already ended counts as done. Telegram signs in again silently after `everywhere`.
 */
export async function logOut(d: AccountDeps = accountDeps(), everywhere = false): Promise<boolean> {
  return d.session.signOut(() => (everywhere ? d.api.logoutAll() : d.api.logout()));
}
