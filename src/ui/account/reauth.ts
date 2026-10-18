/**
 * AU-10 Confirm it's you (design/ux/accounts-v6.md §1.4, §8.6; ADR-0009 §1): the proof a sensitive action
 * asks for after `401 reauth_required`. Telegram's initData goes first, silently; when it is older than
 * 10 minutes the form offers Reopen (a relaunch with fresh initData), and an account with an email can
 * type its password instead. On the web the form asks for the password.
 *
 * The form opens over the form that asked (Add email, Change email) or on its own (Remove), and Back
 * returns to the asking form with its fields kept. A wrong password counts toward the address's lockout.
 */
import { t } from '../../i18n';
import { AuthHost, type AuthForm } from '../form/authForm';
import type { UiScene } from '../mosaic/subShell';
import { toast } from '../widgets';
import type { AccountDeps } from './deps';
import { manageError, passwordFailed, proveSilently, ReauthCancelled, reauthStep, withReauth, type ManageError, type ManageOp } from './methods';

/** Shows a failed submit under its field (emptied and focused for a wrong password) or in the banner. */
export function showManageError(form: AuthForm, m: ManageError, params?: Record<string, number | string>): void {
  const msg = t(m.key, m.params ?? params);
  if (m.field) {
    if (m.clear) form.setValue(m.field, '');
    form.setFieldError(m.field, msg);
    form.focus(m.field);
    return;
  }
  form.setBanner(msg);
}

/**
 * Proves it's the player: Telegram's initData silently, else AU-10. Resolves true once the server took the
 * proof, false when the player backed out (or nothing can prove it here; a toast says why).
 */
export async function confirmItsYou(scene: UiScene, d: AccountDeps, o: { hasPassword: boolean }): Promise<boolean> {
  const silent = await proveSilently(d.api, d.proof());
  const step = reauthStep(silent, { hasPassword: o.hasPassword, canReopen: !!d.reopen });
  if (step === 'done') return true;
  const refused = !silent.ok && silent.why === 'error' ? manageError(silent.error, 'reauth') : null;
  if (step === 'error') {
    if (scene.sys.isActive()) toast(scene, t(refused?.key ?? 'reauth.err.telegram'), 'bad');
    return false;
  }
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (v: boolean) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const host = AuthHost.open();
    const reopen = () => {
      if (!d.reopen?.()) form.setBanner(t('reauth.reopenFailed'));
    };
    const onlyReopen = step === 'reopen';
    const form = host.push({
      id: 'reauth',
      title: t('reauth.title'),
      intro: t(onlyReopen ? 'reauth.reopen' : 'reauth.body'),
      fields: onlyReopen ? [] : [{ name: 'password', kind: 'currentPassword', label: t('auth.field.password') }],
      footLinks: step === 'passwordReopen' ? [{ id: 'reopen', label: t('reauth.reopenAlt'), onClick: reopen }] : undefined,
      submitLabel: t(onlyReopen ? 'reauth.reopenBtn' : 'menu.continue'),
      onDispose: () => done(false),
      async onSubmit(v, f) {
        if (onlyReopen) return reopen();
        try {
          await d.api.reauthWith({ password: v.password });
        } catch (e) {
          return showManageError(f, passwordFailed(manageError(e, 'reauth'), d.guard, d.now()));
        }
        d.guard.success();
        done(true);
        // back to the form that asked (busy with its retry), or closed when this was the only one
        f.setBusy(false);
        host.back();
      },
    });
    // the silent try was refused (not just stale): say so above the password
    if (refused && step === 'password') form.setBanner(t(refused.key));
  });
}

/** `call`, with Confirm it's you and one retry on `401 reauth_required` (§1.4). Throws ReauthCancelled when the player backs out. */
export function sensitive<T>(scene: UiScene, d: AccountDeps, hasPassword: boolean, call: () => Promise<T>): Promise<T> {
  return withReauth(call, () => confirmItsYou(scene, d, { hasPassword }));
}

export interface ManageOpts {
  /** Prefill (Resend reopens the form with the address). */
  email?: string;
  /** The account page is out of date, or the session ended: re-read it. */
  onReload: () => void;
  /** Done: re-render the page. */
  onDone?: () => void;
}

/** A failed action in a form: nothing when the player backed out of AU-10; a page that must catch up closes the form, says why and reloads. */
export function failForm(scene: UiScene, form: AuthForm, e: unknown, op: ManageOp, o: Pick<ManageOpts, 'onReload'>): void {
  if (e instanceof ReauthCancelled) return;
  const m = manageError(e, op);
  if (!m.reload) return showManageError(form, m);
  AuthHost.top()?.close();
  if (scene.sys.isActive()) toast(scene, t(m.key, m.params), 'info');
  o.onReload();
}
