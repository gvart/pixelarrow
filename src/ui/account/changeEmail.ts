/**
 * AU-12 Change email (design/ux/accounts-v6.md §8.4; ADR-0009 §4): one field, the new address, then
 * Confirm it's you when the server asks, then Check your email. The old address keeps working until the
 * link is opened. A taken address gets the same 202 (the server mails that address instead), so nothing
 * here says whether another account uses it.
 */
import { t } from '../../i18n';
import { AuthHost, type AuthForm } from '../form/authForm';
import type { UiScene } from '../mosaic/subShell';
import { openCheckEmail } from './checkEmail';
import type { AccountDeps } from './deps';
import { validEmail } from './flows';
import { failForm, sensitive, showManageError, type ManageOpts } from './reauth';

export function openChangeEmail(scene: UiScene, d: AccountDeps, o: ManageOpts): AuthForm {
  const host = AuthHost.open();
  return host.push({
    id: 'changeEmail',
    title: t('account.changeEmail'),
    intro: t('account.changeEmail.body'),
    fields: [{ name: 'email', kind: 'email', label: t('account.changeEmail.field'), placeholder: t('auth.field.emailPh'), value: o.email }],
    submitLabel: t('account.addEmail.submit'),
    async onSubmit(v, f) {
      if (!validEmail(v.email)) return showManageError(f, { field: 'email', key: 'auth.err.email' });
      const email = v.email.trim();
      try {
        await sensitive(scene, d, true, () => d.api.changeEmail(email));
      } catch (e) {
        return failForm(scene, f, e, 'changeEmail', o);
      }
      d.resend.sent(d.now());
      host.close();
      openCheckEmail(scene, d, { email, variant: 'changeEmail', onResend: () => openChangeEmail(scene, d, { ...o, email }) });
    },
  });
}
