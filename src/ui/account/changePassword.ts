/**
 * AU-12 Change password (design/ux/accounts-v6.md §8.4): the current password, a new one (the eye, the
 * live hint), Save. The current password is the proof (no AU-10). A wrong one is a field error that counts
 * toward the address's lockout; from the 5th in a row the generic "too many attempts". On success every
 * other device is signed out, and a toast says so.
 */
import { t } from '../../i18n';
import { AuthHost, type AuthForm } from '../form/authForm';
import type { UiScene } from '../mosaic/subShell';
import { toast } from '../widgets';
import type { AccountDeps } from './deps';
import { newPasswordProblem } from './flows';
import { manageError, passwordFailed } from './methods';
import { failForm, showManageError, type ManageOpts } from './reauth';

export function openChangePassword(scene: UiScene, d: AccountDeps, o: ManageOpts): AuthForm {
  const host = AuthHost.open();
  return host.push({
    id: 'changePassword',
    title: t('account.changePassword'),
    fields: [
      { name: 'current', kind: 'currentPassword', label: t('account.pw.current') },
      { name: 'next', kind: 'newPassword', label: t('auth.field.newPassword') },
    ],
    submitLabel: t('account.pw.submit'),
    async onSubmit(v, f) {
      // the server also refuses the account's own email as the password (matches_email)
      const pw = newPasswordProblem(v.next, '');
      if (pw) return showManageError(f, { field: 'next', key: pw });
      try {
        await d.api.changePassword(v.current, v.next);
      } catch (e) {
        const m = manageError(e, 'changePassword');
        if (m.clear) return showManageError(f, passwordFailed(m, d.guard, d.now()));
        return failForm(scene, f, e, 'changePassword', o);
      }
      d.guard.success();
      host.close();
      if (scene.sys.isActive()) toast(scene, t('account.pw.changed'), 'good');
      o.onDone?.();
    },
  });
}
