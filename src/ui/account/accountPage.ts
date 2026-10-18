/**
 * AU-09 Account page (design/ux/accounts-v6.md §8.2, V6-ACCT-07): a page of the Settings sheet (the
 * sheet's title becomes "Account", the chevron or Back return to Settings). Both platforms read
 * GET /api/account; what shows depends on the session and on what the platform can do, never on which
 * platform it is (UXA-04).
 *
 * - Signed in: Profile (name with Rename → AU-18, the public-boards switch), Sign-in methods (Telegram
 *   and email with their actions, LINK-05), Devices (Signed-in devices → AU-17, and Log out on this
 *   device where the session is a cookie), Privacy (the notice, and Delete account → AU-19, LINK-07).
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
import { MButton, mtext, openParchmentSheet, GAP, SHEET_TITLE_H } from '../mosaic';
import { AccountRow, type AccountRowOpts } from '../mosaic/AccountRow';
import type { UiScene } from '../mosaic/subShell';
import { SURFACE } from '../tokens';
import { ellipsize, measureText, wrapText } from '../textfit';
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
import { forgetAddPending, methodRows, readAddPending, type MethodKind } from './methods';
import { openAddEmail } from './addEmail';
import { openChangeEmail } from './changeEmail';
import { openChangePassword } from './changePassword';
import { confirmRemove } from './removeMethod';
import { openLinkTelegram } from './linkTelegram';
import { checkTelegramConflicts } from './conflict';
import { openRename } from './rename';
import { renameOff } from './nameRules';
import { noticeModeration } from './nameSheet';
import { openDeleteAccount } from './deleteAccount';

/** Where the page's data comes from: the server (live) or a stand-in (Kit, layout check). */
export interface AccountSource {
  /** 'live': a session; 'guest': none, and this platform can sign in with a form; 'offline' otherwise. */
  session(): Promise<'live' | 'guest' | 'offline' | 'banned'>;
  load(): Promise<AccountSummary>;
  setBoards(on: boolean): Promise<boolean>;
  /** The sign-up waiting for its link on this device (a hint), or null. */
  pending(): Promise<string | null>;
  /** The add-email link sent from this device (its masked address, a hint), or null (V6-LINK-05). */
  addPending(): Promise<string | null>;
  forgetAddPending(): Promise<void>;
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
    addPending: () => readAddPending(d.kv, d.now()),
    forgetAddPending: () => forgetAddPending(d.kv),
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

/**
 * In-memory account (Kit, layout check): signed in, a guest, or a guest waiting for an email link; and
 * (V6-LINK-05) a Telegram-only account with no email, and the same with an add-email link waiting.
 */
export function demoAccountSource(kind: 'live' | 'guest' | 'pending' | 'telegram' | 'waiting' | 'renamed' = 'live'): AccountSource {
  const tgOnly = (['telegram', 'waiting'] as const).some((k) => k === kind);
  const now = Date.now();
  let boards = true;
  let sessions: SessionInfo[] = [
    { handle: 'aaaaaaaaaaaa', transport: 'cookie', method: 'password', device: 'Chrome on macOS', createdAt: now - 3 * 864e5, lastSeenAt: now, current: true },
    { handle: 'bbbbbbbbbbbb', transport: 'bearer', method: 'telegram', device: 'Telegram on iOS', createdAt: now - 9 * 864e5, lastSeenAt: now - 864e5, current: false },
    { handle: 'cccccccccccc', transport: 'cookie', method: 'password', device: null, createdAt: now - 20 * 864e5, lastSeenAt: now - 6 * 864e5, current: false },
  ];
  return {
    session: async () => (kind === 'guest' || kind === 'pending' ? 'guest' : 'live'),
    load: async () => ({
      displayName: 'SwiftArcher4821',
      identities: tgOnly
        ? [{ kind: 'telegram', telegramUsername: 'nikias_k' }]
        : [
            { kind: 'telegram', telegramUsername: 'nikias_k' },
            { kind: 'password', emailMasked: 'j***@g***.com' },
          ],
      publicBoards: boards,
      sessions: sessions.length,
      hasPurchases: kind === 'renamed',
      // 'renamed' (V6-LINK-07): renamed 18 days ago, so Rename is off with the next date
      name: kind === 'renamed' ? { freeChange: false, nextChangeAt: now + 12 * 864e5, lockedUntil: null, moderatedAt: null } : { freeChange: true, nextChangeAt: null, lockedUntil: null, moderatedAt: null },
    }),
    setBoards: async (on) => (boards = on),
    pending: async () => (kind === 'pending' ? 'name@example.com' : null),
    addPending: async () => (kind === 'waiting' ? 'a***@e***.com' : null),
    forgetAddPending: async () => undefined,
    canLogOut: () => !tgOnly,
    logOut: async () => true,
    sessions: async () => sessions,
    revoke: async (h) => void (sessions = sessions.filter((s) => s.handle !== h)),
    logOutEverywhere: async () => true,
  };
}

const ROW_H = 24;
/** Full-width page buttons stop growing here (V6-092: a wide sheet keeps them thumb-sized). */
const WIDE_MAX = 240;
const STEP = ROW_H + GAP;
const SECTION_H = 22;
const SECTION_ICON: Record<string, string> = { profile: 'people', methods: 'flag', devices: 'gear', privacy: 'eye' };

/** Opens the page (from Settings → Account, `/#account` or `startapp=account`). */
export function openAccountPage(scene: UiScene, o: { source?: AccountSource; onClose?: () => void; d?: AccountDeps } = {}): Phaser.GameObjects.Container {
  const src = o.source ?? liveAccountSource(o.d);
  const d = o.d ?? accountDeps();
  const { VH } = scene.m;
  const w = settingsSheetW(scene);
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
  /** `wrapSub`: the quieter line wraps to two lines (the row grows) instead of being cut (§13.6). */
  const row = (into: Phaser.GameObjects.Container, yy: number, label: string, sub: string | null, right: number, wrapSub = false): number => {
    const room = iw - right - 14;
    const subLines = sub ? (wrapSub ? wrapText(sub, room, 2, false, 6.5).lines : [ellipsize(sub, room, false, 6.5)]) : [];
    const rh = ROW_H + Math.max(0, subLines.length - 1) * 9;
    into.add(mosaicPanelImage(scene, 0, yy, iw - 4, rh - 1, 'parchmentWell'));
    if (sub) {
      into.add(addText(scene, 6, yy + 2, ellipsize(label, room, false, 6.5), 'pInk').setFontSize(6.5));
      into.add(addText(scene, 6, yy + 12, subLines.join('\n'), 'pMuted').setFontSize(6.5).setLineSpacing(-1));
    } else into.add(addText(scene, 6, yy + 8, measureText(label) <= room ? label : ellipsize(label, room, false, 6.5), 'pInk'));
    return yy + rh + GAP;
  };
  const say = (into: Phaser.GameObjects.Container, yy: number, text: string, font: 'pInk' | 'pMuted' | 'pBad' = 'pInk'): number => {
    const tx = mtext(scene, 0, yy, text, font, { size: 7, maxW: iw - 4, wrap: true });
    into.add(tx);
    return yy + tx.height + 6;
  };
  /** A full-width action, at most 240 wide and centred on a wide sheet (V6-092). */
  const wide = (into: Phaser.GameObjects.Container, yy: number, label: string, variant: 'primary' | 'secondary' | 'neutral' | 'destructive', id: string, onClick: () => void): number => {
    const bw = Math.min(iw - 4, WIDE_MAX);
    const bx = Math.round((iw - 4 - bw) / 2);
    into.add(variant === 'destructive' ? new Button(scene, bx, yy, bw, ROW_H, { label, variant, id, onClick }) : new MButton(scene, bx, yy, bw, ROW_H, { label, variant, id, onClick }));
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
  /** The Sign-in methods rows (§8.2): Remove (off with its reason for the last one), Add, the ⋯ menu. */
  const methods = (into: Phaser.GameObjects.Container, yy: number, a: AccountSummary, waiting: string | null): number => {
    const hasPassword = a.identities.some((i) => i.kind === 'password');
    const emailMasked = a.identities.find((i) => i.kind === 'password')?.emailMasked;
    const after = { onReload: reopen, onDone: reopen };
    const remove = (kind: MethodKind) => confirmRemove(scene, d, { kind, emailMasked, hasPassword, onDone: reopen });
    for (const r of methodRows(a, waiting)) {
      const tg = r.kind !== 'password';
      const off = r.last ? t('account.remove.last') : undefined;
      let action: AccountRowOpts['action'];
      if (r.action === 'remove') action = { kind: 'button', label: t('account.remove'), off, id: 'account.tg.remove', onClick: () => remove('telegram') };
      else if (r.action === 'add') action = { kind: 'button', label: t('account.add'), id: 'account.email.add', onClick: () => void openAddEmail(scene, d, after) };
      else if (r.action === 'menu')
        action = {
          kind: 'more',
          label: t('account.more'),
          id: 'account.email.more',
          onClick: () =>
            menu(t('account.email'), [
              { label: t('account.changeEmail'), id: 'account.email.change', onClick: () => void openChangeEmail(scene, d, after) },
              { label: t('account.changePassword'), id: 'account.email.password', onClick: () => void openChangePassword(scene, d, after) },
              { label: t('account.remove'), id: 'account.email.remove', off, onClick: () => remove('password') },
            ]),
        };
      // Link Telegram (AU-13, V6-LINK-06): only where it can complete, a web page that can open t.me (§8.2)
      else if (r.action === 'link' && canUsePasswordForms())
        action = { kind: 'button', label: t('account.link'), id: 'account.tg.link', onClick: () => openLinkTelegram(scene, { displayName: a.displayName, hasPassword, onDone: reopen }) };
      else if (r.action === 'pendingMenu')
        action = {
          kind: 'more',
          label: t('account.more'),
          id: 'account.email.more',
          onClick: () =>
            menu(t('account.email'), [
              { label: t('account.resend'), id: 'account.email.resend', onClick: () => void openAddEmail(scene, d, after) },
              // the hint only: the link itself simply expires (§8.2)
              { label: t('account.cancelPending'), id: 'account.email.cancel', onClick: () => void src.forgetAddPending().then(reopen) },
            ]),
        };
      const sub = 'text' in r.sub ? r.sub.text : t(r.sub.key, r.sub.params);
      const row = new AccountRow(scene, 0, yy, iw - 4, { mark: tg ? 'tg' : 'at', title: t(tg ? 'account.tg' : 'account.email'), sub, action });
      into.add(row);
      yy += row.h + GAP;
    }
    return yy;
  };
  /** A short list of actions over the page (the email's ⋯): one button each, a disabled one says why on tap. */
  const menu = (title: string, items: { label: string; id: string; onClick: () => void; off?: string }[]) => {
    const mw = Math.min(200, scene.m.VW - 16);
    const sh = openParchmentSheet(scene, { title, w: mw, h: SHEET_TITLE_H + items.length * STEP + 12, kind: 'confirm', id: 'account.methodMenu' });
    const { x, y } = sh.body;
    items.forEach((it, i) => {
      const b = new MButton(scene, x, y + i * STEP, mw - 16, ROW_H, {
        label: it.label,
        variant: 'secondary',
        id: it.id,
        disabledReason: it.off,
        onClick: () => {
          sh.close();
          it.onClick();
        },
      });
      if (it.off) b.setEnabled(false, it.off);
      sh.c.add(b);
    });
  };
  const showAccount = (a: AccountSummary, waiting: string | null = null) => {
    clear();
    const into = area!.content;
    let yy = section(into, 0, 'profile');
    // the name and Rename (AU-18, V6-LINK-07): off with its reason during the cooldown or a moderator's lock
    // the name gets all the room the label and Rename leave (16 characters fit on a phone)
    const nameW = Math.max(30, Math.min(measureText(a.displayName) + 4, iw - 4 - 72 - 6 - measureText(t('account.name')) - 18));
    const ny = yy;
    yy = row(into, yy, t('account.name'), null, nameW + 6 + 72);
    into.add(addText(scene, iw - 4 - 72 - 6, ny + 8, ellipsize(a.displayName, nameW, false), 'pInk', 1));
    const off = renameOff(a.name, d.now());
    const rename = new Button(scene, iw - 4 - 68, ny + 1, 68, 22, {
      label: t('account.rename'),
      inline: true,
      small: true,
      id: 'account.rename',
      disabledReason: off ? t(off.key, off.params) : undefined,
      onClick: () => openRename(scene, { current: a.displayName, status: a.name, now: d.now, onDone: reopen }),
    });
    if (off) rename.setEnabled(false, t(off.key, off.params));
    into.add(rename);
    // public boards (ADR-0010): its line says exactly what changes
    let boards = a.publicBoards;
    let busy = false;
    const ty = yy;
    yy = row(into, yy, t('account.boards'), t('account.boardsSub'), 38, true);
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
    // the sign-in methods and their actions (V6-LINK-05)
    yy = section(into, yy, 'methods');
    yy = methods(into, yy, a, waiting);
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
    yy = privacy(into, yy);
    // AU-19, the last row (§10.1): a danger button; the steps say what is lost before anything happens
    finish(wide(into, yy + 2, t('delete.title'), 'destructive', 'account.delete', () => openDeleteAccount(scene, d, { account: a, onReload: reopen })));
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
      const [a, waiting] = await Promise.all([src.load(), src.addPending().catch(() => null)]);
      // the link was opened: the hint has done its job
      if (waiting && a.identities.some((i) => i.kind === 'password')) void src.forgetAddPending();
      if (c.scene) showAccount(a, waiting);
      // a moderator reset the name since this device last said so (§9.5)
      if (c.scene && !o.source) void noticeModeration(scene, a, d.kv);
      // in the Mini App: a link conflict this Telegram account must decide opens over the page (V6-053)
      if (c.scene && !o.source) void checkTelegramConflicts(scene, { d });
    } catch (e) {
      if (!c.scene) return;
      if (isApiError(e) && e.status === 403 && e.code === 'banned') showBanned();
      else showProblem(t(isApiError(e) && e.status === 0 ? 'econ.offline' : 'account.err.load'));
    }
  };
  void load();
  return c;
}
