/**
 * AU-03 Create account (design/ux/accounts-v6.md §5.2): email and a new password with the eye and the
 * live length hint (no confirm field, UXA-07), the human check, the Terms and Privacy line, Cancel and
 * Create account, then "Already have an account? Log in". The reply is the same 202 whether or not the
 * address has an account, so the form always goes on to Check your email (§5.7 #1).
 */
import { lang, t } from '../../i18n';
import { AuthHost, type AuthForm } from '../form/authForm';
import { legalUrl } from '../legal';
import type { UiScene } from '../mosaic/subShell';
import { openCheckEmail } from './checkEmail';
import { flowDeps, humanCheckOf, showError } from './common';
import type { AccountDeps } from './deps';
import { rememberPending, runSignup } from './flows';
import { openLogin, type SignInOpts } from './login';

export function openSignup(scene: UiScene, d: AccountDeps, o: SignInOpts = {}): AuthForm {
  const host = AuthHost.open();
  const l = lang();
  const form = host.push({
    id: 'signup',
    title: t('auth.signup.title'),
    fields: [
      { name: 'email', kind: 'email', label: t('auth.field.email'), placeholder: t('auth.field.emailPh'), value: o.email },
      { name: 'password', kind: 'newPassword', label: t('auth.field.password') },
    ],
    humanCheck: humanCheckOf(d, 'signup'),
    legal: { text: t('auth.signup.legal'), links: { terms: { label: t('auth.link.terms'), href: legalUrl('terms', l) }, privacy: { label: t('auth.link.privacy'), href: legalUrl('privacy', l) } } },
    submitLabel: t('auth.signup.submit'),
    footLinks: [{ id: 'login', label: t('auth.signup.haveAccount'), onClick: () => openLogin(scene, d, { ...o, email: form.values().email }) }],
    async onSubmit(v, f) {
      const r = await runSignup(flowDeps(d, f), v.email, v.password);
      if (!r.ok) return showError(f, r.error);
      const now = d.now();
      await rememberPending(d.kv, r.email!, now);
      d.resend.sent(now);
      host.close();
      openCheckEmail(scene, d, { email: r.email!, variant: 'signup', signIn: o });
    },
  });
  return form;
}
