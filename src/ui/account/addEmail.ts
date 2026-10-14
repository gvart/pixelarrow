/**
 * AU-11 Add email and password (design/ux/accounts-v6.md §8.3; ADR-0009 §2): how a Telegram player takes
 * the account to the web. Email and a new password (the eye, the live hint), the privacy line, Send link.
 * No human check: the player is signed in and re-authed, and the Mini App can't run Turnstile. The
 * server answers 202 whether or not the address has its own account (the conflict is settled from the
 * link), so the form always goes on to Check your email, and the row reads "Waiting" on this device.
 */
import { lang, t } from '../../i18n';
import { AuthHost, type AuthForm } from '../form/authForm';
import { legalUrl } from '../legal';
import type { UiScene } from '../mosaic/subShell';
import { openCheckEmail } from './checkEmail';
import type { AccountDeps } from './deps';
import { newPasswordProblem, validEmail } from './flows';
import { rememberAddPending } from './methods';
import { failForm, sensitive, showManageError, type ManageOpts } from './reauth';

export function openAddEmail(scene: UiScene, d: AccountDeps, o: ManageOpts): AuthForm {
  const host = AuthHost.open();
  return host.push({
    id: 'addEmail',
    title: t('account.addEmail.title'),
    intro: t('account.addEmail.body'),
    fields: [
      { name: 'email', kind: 'email', label: t('auth.field.email'), placeholder: t('auth.field.emailPh'), value: o.email },
      { name: 'password', kind: 'newPassword', label: t('auth.field.password') },
    ],
    legal: { text: t('account.addEmail.legal'), links: { privacy: { label: t('auth.link.privacy'), href: legalUrl('privacy', lang()) } } },
    submitLabel: t('account.addEmail.submit'),
    async onSubmit(v, f) {
      if (!validEmail(v.email)) return showManageError(f, { field: 'email', key: 'auth.err.email' });
      const pw = newPasswordProblem(v.password, v.email);
      if (pw) return showManageError(f, { field: 'password', key: pw });
      const email = v.email.trim();
      try {
        // the account has no password yet: Telegram's initData (or Reopen) is the proof
        await sensitive(scene, d, false, () => d.api.addEmail(email, v.password));
      } catch (e) {
        return failForm(scene, f, e, 'addEmail', o);
      }
      const now = d.now();
      await rememberAddPending(d.kv, email, now);
      d.resend.sent(now);
      host.close();
      openCheckEmail(scene, d, { email, variant: 'addEmail', onResend: () => openAddEmail(scene, d, { ...o, email }) });
      o.onDone?.();
    },
  });
}
