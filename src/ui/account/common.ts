/** Pieces the sign-in forms share (V6-ACCT-05). */
import { lang, t } from '../../i18n';
import type { HumanCheckAction } from '../../platform/core/auth';
import type { AuthForm, AuthFormSpec } from '../form/authForm';
import { legalUrl } from '../legal';
import type { AccountDeps } from './deps';
import type { FlowDeps, FormError } from './flows';

/** The form's human check with `action`, or none where the platform has no check. */
export function humanCheckOf(d: AccountDeps, action: HumanCheckAction): AuthFormSpec['humanCheck'] {
  const check = d.humanCheck;
  // the privacy notice's processors section names Cloudflare (accounts-v6.md §1.3)
  return check ? { check, action, privacyUrl: `${legalUrl('privacy', lang())}#processors` } : undefined;
}

/** The submit's dependencies for `form`: the API and the form's own human-check token. */
export const flowDeps = (d: AccountDeps, form: AuthForm): FlowDeps => ({ api: d.api, token: () => form.token(), now: d.now });

/** Shows a failed submit: under its field (focused) or in the banner, with the follow-ups it asks for. */
export function showError(form: AuthForm, e: FormError): void {
  if (e.clearPassword) form.setValue('password', '');
  if (e.offerReset) form.promoteLink('forgot');
  if (e.resetCheck) form.resetCheck();
  const msg = t(e.key, e.params);
  if (e.field) {
    form.setFieldError(e.field, msg);
    form.focusFirstInvalid();
    return;
  }
  form.setBanner(msg, e.retryCheck ? { label: t('auth.retry'), onClick: () => form.retryCheck() } : undefined);
  if (e.clearPassword) form.focus('password');
}
