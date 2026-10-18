/**
 * AU-15 Remove a sign-in method (design/ux/accounts-v6.md §8.8; ADR-0009 §4, N-LK-2): a destructive
 * confirm that says what changes, then Confirm it's you when the server asks. The last method is never
 * offered (Remove is off with its reason), and the server refuses it anyway (`409 last_login_method`).
 *
 * Removing the method this session came from ends the session: the campaign's waiting saves go up first,
 * then this device signs out (the web keeps the campaign as a guest's; in Telegram the next request
 * starts a new, empty player, which the confirm said).
 */
import { t } from '../../i18n';
import type { UiScene } from '../mosaic/subShell';
import { confirmDialog, toast } from '../widgets';
import type { AccountDeps } from './deps';
import { manageError, ReauthCancelled, type MethodKind } from './methods';
import { sensitive } from './reauth';

interface RemoveOpts {
  kind: MethodKind;
  /** The masked address, for the email body. */
  emailMasked?: string;
  /** The account has a password (AU-10 can ask for it). */
  hasPassword: boolean;
  /** Done (or the page is out of date): re-read the page. `signedOut`: this device is signed out now. */
  onDone: (signedOut: boolean) => void;
}

/** This session came from `kind`: removing it signs this device out. */
const endsThisSession = (kind: MethodKind, transport: 'bearer' | 'cookie'): boolean => (kind === 'password' ? transport === 'cookie' : transport === 'bearer');

export function confirmRemove(scene: UiScene, d: AccountDeps, o: RemoveOpts): void {
  const here = endsThisSession(o.kind, d.transport());
  const email = o.kind === 'password';
  const body = email ? t('unlink.email.body', { email: o.emailMasked ?? '' }) : t('unlink.tg.body');
  confirmDialog(scene, {
    title: t(email ? 'unlink.email.title' : 'unlink.tg.title'),
    body: here ? `${body} ${t('unlink.signedOutHere')}` : body,
    cancel: t('common.cancel'),
    ok: t('unlink.ok'),
    destructive: true,
    onOk: () => void run(),
  });

  const say = (text: string, kind: 'info' | 'bad' | 'good') => scene.sys.isActive() && toast(scene, text, kind);
  async function run(): Promise<void> {
    // the session ends with the method: the campaign's waiting saves go up while it still can
    if (here) await d.session.flush?.().catch(() => undefined);
    let signedOut: boolean;
    try {
      signedOut = (await sensitive(scene, d, o.hasPassword, () => d.api.removeMethod(o.kind))).signedOut;
    } catch (e) {
      if (e instanceof ReauthCancelled) return;
      const m = manageError(e, 'remove');
      say(t(m.key, m.params), m.reload ? 'info' : 'bad');
      if (m.reload) o.onDone(false);
      return;
    }
    // the server ended this session (and cleared its cookie): the device follows, keeping the campaign
    if (signedOut) await d.session.signOut(async () => undefined);
    say(t(signedOut ? 'unlink.doneSignedOut' : 'unlink.done'), 'good');
    o.onDone(signedOut);
  }
}
