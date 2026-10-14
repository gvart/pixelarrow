/**
 * AU-02 Log in (design/ux/accounts-v6.md §6): email, password with the eye, Forgot password?, the human
 * check, Cancel and Log in, then "New here? Create account". A wrong password, an unknown email and a
 * locked address all read the same (§6.2); from the 5th failure in a row the banner says "too many
 * attempts" and Forgot password? becomes a button. On success the session is re-read (V6-073), the form
 * closes with "Signed in as …", and the caller re-renders.
 */
import { t } from '../../i18n';
import { toast } from '../widgets';
import { AuthHost, type AuthForm } from '../form/authForm';
import type { UiScene } from '../mosaic/subShell';
import { flowDeps, humanCheckOf, showError } from './common';
import type { AccountDeps } from './deps';
import { forgetPending, runLogin } from './flows';
import { openForgot } from './forgot';
import { openSignup } from './signup';

export interface SignInOpts {
  /** Prefill the email (from another form). */
  email?: string;
  /** After a successful log-in, once the session is live: re-render the screen that asked. */
  onSignedIn?: () => void;
}

export function openLogin(scene: UiScene, d: AccountDeps, o: SignInOpts = {}): AuthForm {
  const host = AuthHost.open();
  const form = host.push({
    id: 'login',
    title: t('auth.login.title'),
    fields: [
      { name: 'email', kind: 'email', label: t('auth.field.email'), placeholder: t('auth.field.emailPh'), value: o.email },
      { name: 'password', kind: 'currentPassword', label: t('auth.field.password') },
    ],
    inlineLinks: [{ id: 'forgot', label: t('auth.login.forgot'), onClick: () => openForgot(scene, d, { ...o, email: form.values().email }) }],
    humanCheck: humanCheckOf(d, 'login'),
    submitLabel: t('auth.login.submit'),
    footLinks: [{ id: 'signup', label: t('auth.login.new'), onClick: () => openSignup(scene, d, { ...o, email: form.values().email }) }],
    async onSubmit(v, f) {
      const r = await runLogin(flowDeps(d, f), v.email, v.password, d.guard);
      if (!r.ok) return showError(f, r.error);
      // the server set the session cookie: read it back so every online screen sees it
      if (!(await d.session.recheckSession())) return showError(f, { key: 'auth.err.unavailable' });
      await forgetPending(d.kv);
      host.close();
      if (scene.sys.isActive()) toast(scene, t('auth.login.ok', { name: d.session.playerName ?? '' }), 'good');
      // the first sync with the account (the guest save goes up, or Two campaigns asks), then the caller
      const done = () => o.onSignedIn?.();
      if (d.afterSignIn) d.afterSignIn(scene, done);
      else done();
    },
  });
  return form;
}
