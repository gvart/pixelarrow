/**
 * AU-05 Forgot password (design/ux/accounts-v6.md §7.1): one email field (prefilled from Log in), the
 * human check and Send reset link. Always the same answer, so it always goes on to Check your email
 * (reset variant); there is no "no such account" error (§7.4 #1).
 */
import { t } from '../../i18n';
import { AuthHost, type AuthForm } from '../form/authForm';
import type { UiScene } from '../mosaic/subShell';
import { openCheckEmail } from './checkEmail';
import { flowDeps, humanCheckOf, showError } from './common';
import type { AccountDeps } from './deps';
import { runForgot } from './flows';
import type { SignInOpts } from './login';

export function openForgot(scene: UiScene, d: AccountDeps, o: SignInOpts = {}): AuthForm {
  const host = AuthHost.open();
  return host.push({
    id: 'forgot',
    title: t('auth.forgot.title'),
    intro: t('auth.forgot.body'),
    fields: [{ name: 'email', kind: 'email', label: t('auth.field.email'), placeholder: t('auth.field.emailPh'), value: o.email }],
    humanCheck: humanCheckOf(d, 'reset'),
    submitLabel: t('auth.forgot.submit'),
    async onSubmit(v, f) {
      const r = await runForgot(flowDeps(d, f), v.email);
      if (!r.ok) return showError(f, r.error);
      d.resend.sent(d.now());
      host.close();
      openCheckEmail(scene, d, { email: r.email!, variant: 'reset', signIn: o });
    },
  });
}
