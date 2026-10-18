/**
 * AU-19 Delete account (V6-LINK-07; design/ux/accounts-v6.md §10.1; ADR-0009 §7, M-DL-1), from the last
 * row of the Account page (the bot's /delete_my_data opens that page; it never opens this by itself).
 *
 * 1. What happens: the account's name, every group that is deleted, what is kept without the name and
 *    for how long, the paid-items warning when the account has purchases (with Refunds), the unlink
 *    alternative when it has two sign-in methods, and the privacy notice. Cancel or Continue.
 * 2. Confirm: an HTML form where the word (DELETE, or УДАЛИТЬ in Russian) is typed; its danger button
 *    stays off until the word matches. The request always carries `confirm: 'DELETE'`. Confirm it's you
 *    comes up when the server asks (withReauth). Back returns to step 1 until the final press.
 * 3. The result: deleted → this device forgets the session (nothing more is uploaded), the campaign,
 *    the hints and the pending-email notes, keeping language, sound and accessibility (UXA-11); then a
 *    card says so (Start over on the web: a first run as a guest; Close in Telegram). Busy or failed:
 *    the form says nothing changed; the server is idempotent, so pressing again is safe.
 *
 * There is no grace period (ADR-0009 §7): the copy says "immediate and can't be undone".
 */
import { lang, t } from '../../i18n';
import type { AccountSummary, ApiClient } from '../../platform/api';
import { platform } from '../../platform';
import { online } from '../../platform/cloud';
import { state } from '../../state';
import { AuthHost, type AuthForm } from '../form/authForm';
import { legalUrl } from '../legal';
import type { UiScene } from '../mosaic/subShell';
import type { AccountDeps } from './deps';
import { alternativeTo, deleteFail, deleteWordMatches, GONE, KEPT, PURCHASE_RETENTION_YEARS } from './deletion';
import { PENDING_KEY } from './flows';
import { ADD_PENDING_KEY, ReauthCancelled } from './methods';
import { MOD_SEEN_KEY } from './nameSheet';
import { openLinkSheet } from './linkSheet';
import { sensitive } from './reauth';
import { confirmRemove } from './removeMethod';

export interface DeleteOpts {
  account: AccountSummary;
  api?: Pick<ApiClient, 'deleteAccount'>;
  /** After the server deleted the account: this device forgets it (stand-ins skip it). */
  forget?: (d: AccountDeps) => Promise<void>;
  /** The page changed under the sheet (an unlink was chosen instead): re-read it. */
  onReload: () => void;
}

/** UXA-11: the device keeps nothing of the deleted account but the player's own preferences. */
export async function forgetDeletedAccount(d: AccountDeps): Promise<void> {
  await online.forgetSession();
  await state.forgetCampaign();
  for (const k of [PENDING_KEY, ADD_PENDING_KEY, MOD_SEEN_KEY]) await d.kv.remove(k).catch(() => undefined);
}

export function openDeleteAccount(scene: UiScene, d: AccountDeps, o: DeleteOpts): void {
  const a = o.account;
  const api = o.api ?? online.api;
  const hasPassword = a.identities.some((i) => i.kind === 'password');
  const alt = alternativeTo(a, d.transport());
  const sheet = openLinkSheet(scene, { title: t('delete.title'), id: 'delete.sheet' });
  sheet.show((b) => {
    b.text(t('delete.lead', { name: a.displayName }));
    b.gap(2);
    b.text(t('delete.goneHead').toUpperCase(), 'pSec', 6.5);
    for (const k of GONE) b.text(`• ${t(k)}`, 'pInk', 6.5);
    b.gap(2);
    b.text(t('delete.keptHead').toUpperCase(), 'pSec', 6.5);
    for (const k of KEPT) b.text(`• ${t(k, { years: PURCHASE_RETENTION_YEARS })}`, 'pInk', 6.5);
    if (a.hasPurchases) {
      b.gap(2);
      b.text(t('delete.paid'), 'pBad', 8);
      b.button({ label: t('delete.refunds'), id: 'delete.refunds', variant: 'neutral', onClick: () => platform.share.openExternal(legalUrl('refunds', lang())) });
    }
    if (alt) {
      b.gap(2);
      b.text(t(alt === 'password' ? 'delete.altEmail' : 'delete.altTg'), 'pSec');
      b.button({
        label: t(alt === 'password' ? 'delete.altEmailBtn' : 'delete.altTgBtn'),
        id: 'delete.alt',
        variant: 'secondary',
        onClick: () => {
          sheet.close();
          const emailMasked = a.identities.find((i) => i.kind === 'password')?.emailMasked;
          confirmRemove(scene, d, { kind: alt, emailMasked, hasPassword, onDone: () => o.onReload() });
        },
      });
    }
    b.button({ label: t('account.privacy'), id: 'delete.privacy', variant: 'neutral', onClick: () => platform.share.openExternal(`${legalUrl('privacy', lang())}#deletion`) });
    b.gap(4);
    b.pair(
      { label: t('common.cancel'), id: 'delete.cancel', variant: 'secondary', onClick: () => sheet.close() },
      { label: t('menu.continue'), id: 'delete.continue', variant: 'destructive', onClick: () => void confirmStep() },
    );
  });

  const confirmStep = (): AuthForm => {
    const host = AuthHost.open();
    const word = t('delete.word');
    const form = host.push({
      id: 'deleteConfirm',
      title: t('delete.title'),
      intro: t('delete.lead', { name: a.displayName }),
      fields: [{ name: 'confirm', kind: 'confirmWord', label: t('delete.typeLabel', { word }), maxLength: 32 }],
      submitLabel: t('delete.go'),
      async onSubmit(v, f) {
        if (!deleteWordMatches(v.confirm)) {
          f.setFieldError('confirm', t('delete.typeMismatch', { word }));
          return f.focus('confirm');
        }
        try {
          await sensitive(scene, d, hasPassword, () => api.deleteAccount());
        } catch (e) {
          if (e instanceof ReauthCancelled) return;
          return f.setBanner(t(deleteFail(e).key));
        }
        await (o.forget ?? forgetDeletedAccount)(d).catch(() => undefined);
        host.close();
        sheet.close();
        openDeleteResult(scene, { hadEmail: hasPassword, telegram: d.transport() === 'bearer' });
      },
    });
    // the danger button waits for the word (§10.3: no single accidental tap deletes)
    const submit = form.el.querySelector<HTMLButtonElement>('[data-act=submit]');
    const input = form.el.querySelector<HTMLInputElement>('input[name=confirm]');
    const sync = () => submit && (submit.disabled = !deleteWordMatches(input?.value ?? ''));
    input?.addEventListener('input', sync);
    sync();
    return form;
  };
}

/**
 * Step 3: the account is gone. The web starts over as a guest (a reload: a first run); Telegram's Close
 * closes the Mini App (the next launch is a fresh campaign), or opens the menu when the app can't close.
 */
export function openDeleteResult(scene: UiScene, o: { hadEmail: boolean; telegram: boolean; onDone?: () => void }): void {
  const sheet = openLinkSheet(scene, { title: t('delete.title'), id: 'delete.done', closeButton: false, h: 170 });
  const done = o.onDone ?? (() => (o.telegram ? platform.closeApp() || scene.scene.start('Menu', {}) : location.reload()));
  sheet.show((b) => {
    b.text(t('delete.done'), 'pGood', 8);
    if (o.hadEmail) b.text(t('delete.doneEmail'));
    if (o.telegram) b.text(t('delete.doneTg'));
    b.gap(4);
    b.button({ label: t(o.telegram ? 'common.close' : 'delete.startOver'), id: 'delete.startOver', variant: 'primary', onClick: () => (sheet.close(), done()) });
  });
}
