/**
 * AU-09 Account page (design/ux/accounts-v6.md §8.2, V6-ACCT-07): a page of the Settings sheet (the
 * sheet's title becomes "Account", the chevron or Back return to Settings). Both platforms read
 * GET /api/account; what shows depends on the session and on what the platform can do, never on which
 * platform it is (UXA-04).
 *
 * - Signed in: Profile (name, the public-boards switch), Sign-in methods (Telegram and email, read
 *   only here: LINK-05 adds their actions), Devices (Signed-in devices → AU-17, and Log out on this
 *   device where the session is a cookie), Privacy (the notice; Delete account comes with LINK-07).
 * - Guest (a platform with email forms and no session): the guest card with Create account and Log
 *   in, then the privacy notice. A sign-up waiting for its link: Resend link and Use another email.
 * - Loading, error and offline states, each with Retry; a banned account says so (§14 Q4).
 *
 * `source` stands in for the server in the Kit and the layout check.
 */
import Phaser from 'phaser';
import { lang, t, type TKey } from '../../i18n';
import { Button, ScrollArea, addIcon, addText, mosaicPanelImage } from '../kit';
import { Toggle } from '../mosaic/toggles';
import { MButton, mtext, GAP } from '../mosaic';
import type { UiScene } from '../mosaic/subShell';
import { SURFACE } from '../tokens';
import { ellipsize, measureText } from '../textfit';
import { legalUrl } from '../legal';
import { openSettingsPage, settingsSheetW } from '../notifySettings';
import { confirmDialog, toast } from '../widgets';
import { isApiError, type AccountSummary, type SessionInfo } from '../../platform/api';
import { platform } from '../../platform';
import { online } from '../../platform/cloud';
import { haptic } from '../../platform/haptics';
import { canUsePasswordForms, logOut, openAccountForm } from './index';
import { accountDeps, type AccountDeps } from './deps';
import { readPending } from './flows';
import { openResend } from './checkEmail';
import { openDevices } from './devices';

/** Where the page's data comes from: the server (live) or a stand-in (Kit, layout check). */
export interface AccountSource {
  /** 'live': a session; 'guest': none, and this platform can sign in with a form; 'offline' otherwise. */
  session(): Promise<'live' | 'guest' | 'offline' | 'banned'>;
  load(): Promise<AccountSummary>;
  setBoards(on: boolean): Promise<boolean>;
  /** The sign-up waiting for its link on this device (a hint), or null. */
  pending(): Promise<string | null>;
  /** The page offers Log out on this device (a cookie session). */
  canLogOut(): boolean;
  logOut(): Promise<boolean>;
  sessions(): Promise<SessionInfo[]>;
  revoke(handle: string): Promise<void>;
  logOutEverywhere(): Promise<boolean>;
}

export function liveAccountSource(d: AccountDeps = accountDeps()): AccountSource {
  return {
    async session() {
      const s = await online.ensureSession();
      if (s === 'live') return 'live';
      if (online.banned) return 'banned';
      return s === 'signed_out' && canUsePasswordForms() ? 'guest' : 'offline';
    },
    load: () => online.api.account(),
    setBoards: async (on) => (await online.api.setPublicBoards(on)).publicBoards,
    pending: async () => (await readPending(d.kv, d.now()))?.email ?? null,
    canLogOut: () => platform.auth.transport === 'cookie',
    logOut: () => logOut(d),
    sessions: async () => (await online.api.sessions()).sessions,
    revoke: async (handle) => {
      try {
        await online.api.revokeSession(handle);
      } catch (e) {
        // already gone counts as done
        if (!(isApiError(e) && e.status === 404)) throw e;
      }
    },
    logOutEverywhere: () => logOut(d, true),
  };
}

/** In-memory account (Kit, layout check): signed in, a guest, or a guest waiting for an email link. */
export function demoAccountSource(kind: 'live' | 'guest' | 'pending' = 'live'): AccountSource {
  const now = Date.now();
  let boards = true;
  let sessions: SessionInfo[] = [
    { handle: 'aaaaaaaaaaaa', transport: 'cookie', method: 'password', device: 'Chrome on macOS', createdAt: now - 3 * 864e5, lastSeenAt: now, current: true },
    { handle: 'bbbbbbbbbbbb', transport: 'bearer', method: 'telegram', device: 'Telegram on iOS', createdAt: now - 9 * 864e5, lastSeenAt: now - 864e5, current: false },
    { handle: 'cccccccccccc', transport: 'cookie', method: 'password', device: null, createdAt: now - 20 * 864e5, lastSeenAt: now - 6 * 864e5, current: false },
  ];
  return {
    session: async () => (kind === 'live' ? 'live' : 'guest'),
    load: async () => ({
      displayName: 'SwiftArcher4821',
      identities: [
        { kind: 'telegram', telegramUsername: 'nikias_k' },
        { kind: 'password', emailMasked: 'j***@g***.com' },
      ],
      publicBoards: boards,
      sessions: sessions.length,
      hasPurchases: false,
      name: { freeChange: true, nextChangeAt: null, lockedUntil: null, moderatedAt: null },
    }),
    setBoards: async (on) => (boards = on),
    pending: async () => (kind === 'pending' ? 'name@example.com' : null),
    canLogOut: () => true,
    logOut: async () => true,
    sessions: async () => sessions,
    revoke: async (h) => void (sessions = sessions.filter((s) => s.handle !== h)),
    logOutEverywhere: async () => true,
  };
}

const ROW_H = 24;
const STEP = ROW_H + GAP;
const SECTION_H = 22;
const SECTION_ICON: Record<string, string> = { profile: 'people', methods: 'flag', devices: 'gear', privacy: 'eye' };

/** Opens the page (from Settings → Account, `/#account` or `startapp=account`). */
export function openAccountPage(scene: UiScene, o: { source?: AccountSource; onClose?: () => void; d?: AccountDeps } = {}): Phaser.GameObjects.Container {
  const src = o.source ?? liveAccountSource(o.d);
  const d = o.d ?? accountDeps();
  const { VW, VH } = scene.m;
  const w = settingsSheetW(VW);
  const m = openSettingsPage(scene, { title: t('account.title'), h: Math.min(360, VH - 12), id: 'account', onClose: o.onClose });
  const { c, x, y, h } = m;
  const iw = w - 16;
  const top = y + 26;
  const viewH = h - 26 - 8;
  let area: ScrollArea | null = null;
  const clear = () => {
    area?.destroy();
    area = new ScrollArea(scene, c, x + 8, top, iw, viewH, scene.m.S);
  };
  c.once('destroy', () => area?.destroy());
  const reopen = () => {
    if (!c.scene) return;
    m.close();
    openAccountPage(scene, o);
  };
  const onSignedIn = () => reopen();

  /** A section title: its icon, the words and a bronze hairline (as in Settings). */
  const section = (into: Phaser.GameObjects.Container, yy: number, key: 'profile' | 'methods' | 'devices' | 'privacy'): number => {
    into.add(addIcon(scene, 0, yy + 6, SECTION_ICON[key]));
    into.add(addText(scene, 16, yy + 8, ellipsize(t(`account.sec.${key}` as TKey), iw - 16, false, 7, 'head'), 'hInk'));
    into.add(scene.add.rectangle(0, yy + 19, iw - 4, 1, SURFACE.line).setOrigin(0, 0));
    return yy + SECTION_H;
  };
  /** A setting row on its well: the label (and a quieter value or line under it), the control at the right. */
  const row = (into: Phaser.GameObjects.Container, yy: number, label: string, sub: string | null, right: number): number => {
    into.add(mosaicPanelImage(scene, 0, yy, iw - 4, ROW_H - 1, 'parchmentWell'));
    const room = iw - right - 14;
    if (sub) {
      into.add(addText(scene, 6, yy + 2, ellipsize(label, room, false, 6.5), 'pInk').setFontSize(6.5));
      into.add(addText(scene, 6, yy + 12, ellipsize(sub, room, false, 6.5), 'pMuted').setFontSize(6.5));
    } else into.add(addText(scene, 6, yy + 8, measureText(label) <= room ? label : ellipsize(label, room, false, 6.5), 'pInk'));
    return yy + STEP;
  };
  const say = (into: Phaser.GameObjects.Container, yy: number, text: string, font: 'pInk' | 'pMuted' | 'pBad' = 'pInk'): number => {
    const tx = mtext(scene, 0, yy, text, font, { size: 7, maxW: iw - 4, wrap: true });
    into.add(tx);
    return yy + tx.height + 6;
  };
  const wide = (into: Phaser.GameObjects.Container, yy: number, label: string, variant: 'primary' | 'secondary' | 'neutral', id: string, onClick: () => void): number => {
    into.add(new MButton(scene, 0, yy, iw - 4, ROW_H, { label, variant, id, onClick }));
    return yy + STEP;
  };
  const privacy = (into: Phaser.GameObjects.Container, yy: number): number => {
    yy = section(into, yy, 'privacy');
    const r = row(into, yy, t('account.privacy'), null, 70);
    into.add(new Button(scene, iw - 4 - 68, yy + 1, 68, 22, { label: t('settings.open'), icon: 'chevR', inline: true, small: true, id: 'account.privacy', onClick: () => platform.share.openExternal(legalUrl('privacy', lang())) }));
    return r;
  };
  const finish = (yy: number) => area?.setContentHeight(yy + 4);

  const showLoading = () => {
    clear();
    finish(say(area!.content, 0, t('common.loading'), 'pMuted'));
  };
  const showProblem = (text: string) => {
    clear();
    const into = area!.content;
    let yy = say(into, 0, text, 'pBad');
    yy = wide(into, yy, t('auth.retry'), 'secondary', 'account.retry', () => void load());
    finish(privacy(into, yy + 4));
  };
  const showBanned = () => {
    clear();
    const into = area!.content;
    let yy = say(into, 0, t('auth.banned.title'), 'pBad');
    yy = say(into, yy, t('auth.banned.body'));
    yy = wide(into, yy, t('auth.banned.support'), 'secondary', 'account.support', () => platform.share.openExternal(legalUrl('privacy', lang())));
    finish(privacy(into, yy + 4));
  };
  const showGuest = (pending: string | null) => {
    clear();
    const into = area!.content;
    let yy = say(into, 0, pending ? t('account.pending.body', { email: pending }) : t('account.guest.body'));
    if (pending) {
      yy = wide(into, yy, t('auth.check.resend'), 'secondary', 'account.resend', () => openResend(scene, d, pending));
      yy = wide(into, yy, t('auth.gate.otherEmail'), 'neutral', 'account.otherEmail', () => openAccountForm(scene, 'signup', { onSignedIn }, d));
      yy = wide(into, yy, t('auth.gate.login'), 'neutral', 'account.login', () => openAccountForm(scene, 'login', { onSignedIn }, d));
    } else {
      yy = wide(into, yy, t('auth.gate.create'), 'primary', 'account.create', () => openAccountForm(scene, 'signup', { onSignedIn }, d));
      yy = wide(into, yy, t('auth.gate.login'), 'secondary', 'account.login', () => openAccountForm(scene, 'login', { onSignedIn }, d));
    }
    finish(privacy(into, yy + 4));
  };
  const showAccount = (a: AccountSummary) => {
    clear();
    const into = area!.content;
    let yy = section(into, 0, 'profile');
    // the name (Rename comes with the nickname story)
    const nameW = Math.min(measureText(a.displayName) + 4, iw / 2);
    yy = row(into, yy, t('account.name'), null, nameW + 6);
    into.add(addText(scene, iw - 10, yy - STEP + 8, ellipsize(a.displayName, nameW, false), 'pInk', 1));
    // public boards (ADR-0010): its line says exactly what changes
    let boards = a.publicBoards;
    let busy = false;
    const ty = yy;
    yy = row(into, yy, t('account.boards'), t('account.boardsSub'), 38);
    const sw = new Toggle(scene, iw - 4 - 34, ty + 1, {
      on: boards,
      label: t('account.boards'),
      id: 'account.boards',
      onChange: (on) => {
        if (busy) return;
        busy = true;
        haptic('light');
        void src
          .setBoards(on)
          .then((v) => (boards = v))
          .catch(() => {
            if (c.scene) toast(scene, t('account.err.action'), 'bad');
            reopen();
          })
          .finally(() => (busy = false));
      },
    });
    into.add(sw);
    // the sign-in methods, as they are (their actions come with LINK-05)
    yy = section(into, yy, 'methods');
    // identities by their fields (an identity kind, not a platform check)
    let tgUser: string | null | undefined;
    let email: string | undefined;
    for (const i of a.identities) {
      if ('telegramUsername' in i) tgUser = i.telegramUsername;
      else if ('emailMasked' in i) email = i.emailMasked;
    }
    yy = row(into, yy, t('account.tg'), tgUser === undefined ? t('account.notLinked') : tgUser ? `@${tgUser}` : t('account.linked'), 4);
    yy = row(into, yy, t('account.email'), email ?? t('account.emailNone'), 4);
    // devices
    yy = section(into, yy, 'devices');
    const dy = yy;
    yy = row(into, yy, t('account.devices'), `${a.sessions}`, 70);
    into.add(new Button(scene, iw - 4 - 68, dy + 1, 68, 22, { label: t('settings.open'), icon: 'chevR', inline: true, small: true, id: 'account.devices', onClick: () => openDevices(scene, { source: src, onSignedOut: reopen }) }));
    if (src.canLogOut()) {
      const ly = yy;
      yy = row(into, yy, t('account.logoutHere'), null, 70);
      into.add(
        new Button(scene, iw - 4 - 68, ly + 1, 68, 22, {
          label: t('auth.logout'),
          icon: 'chevR',
          inline: true,
          small: true,
          id: 'account.logout',
          onClick: () =>
            confirmDialog(scene, {
              title: t('auth.logout.title'),
              body: t('auth.logout.body'),
              cancel: t('common.cancel'),
              ok: t('auth.logout'),
              onOk: () =>
                void src.logOut().then((ok) => {
                  if (!c.scene) return;
                  toast(scene, t(ok ? 'account.loggedOut' : 'account.err.action'), ok ? 'info' : 'bad');
                  if (ok) reopen();
                }),
            }),
        }),
      );
    }
    finish(privacy(into, yy));
  };

  const load = async (): Promise<void> => {
    showLoading();
    const s = await src.session().catch(() => 'offline' as const);
    if (!c.scene) return;
    if (s === 'banned') return showBanned();
    if (s === 'guest') {
      const p = await src.pending().catch(() => null);
      if (c.scene) showGuest(p);
      return;
    }
    if (s === 'offline') return showProblem(t('econ.offline'));
    try {
      const a = await src.load();
      if (c.scene) showAccount(a);
    } catch (e) {
      if (!c.scene) return;
      if (isApiError(e) && e.status === 403 && e.code === 'banned') showBanned();
      else showProblem(t(isApiError(e) && e.status === 0 ? 'econ.offline' : 'account.err.load'));
    }
  };
  void load();
  return c;
}
