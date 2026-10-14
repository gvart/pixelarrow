/**
 * AU-17 Signed-in devices (design/ux/accounts-v6.md §8.9, V6-ACCT-07): a page over the Account page, one
 * row per session from GET /api/auth/sessions: the device family, "This device" on the current one, when
 * it signed in and was last active. Each other row has Log out (DELETE /api/auth/sessions/:handle, no
 * confirm: logging in again undoes it). Under the list, Log out everywhere (POST /api/auth/logout-all,
 * confirmed): the server ends every session, this one too (§14 Q6), so the label says "everywhere" and
 * this device goes to the signed-out state with its campaign kept. Only the handle is ever shown to the
 * code, never a token.
 */
import Phaser from 'phaser';
import { lang, t } from '../../i18n';
import { Button, ScrollArea, addText, mosaicPanelImage } from '../kit';
import { MButton, GAP, mtext } from '../mosaic';
import type { UiScene } from '../mosaic/subShell';
import { ellipsize } from '../textfit';
import { openSettingsPage, settingsSheetW } from '../notifySettings';
import { confirmDialog, toast } from '../widgets';
import type { SessionInfo } from '../../platform/api';
import type { AccountSource } from './accountPage';

const ROW_H = 26;
const STEP = ROW_H + GAP;
const DAY = 864e5;

/** "today", "yesterday" or the short date, in the game's language. */
export function whenLabel(at: number, now: number, l: string = lang()): string {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (at >= start.getTime()) return t('devices.today');
  if (at >= start.getTime() - DAY) return t('devices.yesterday');
  return shortDate(at, l);
}

export function shortDate(at: number, l: string = lang()): string {
  try {
    return new Intl.DateTimeFormat(l === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short' }).format(new Date(at));
  } catch {
    return new Date(at).toISOString().slice(0, 10);
  }
}

/** This device first, then the most recently active. */
export function orderSessions(list: SessionInfo[]): SessionInfo[] {
  return [...list].sort((a, b) => Number(b.current) - Number(a.current) || b.lastSeenAt - a.lastSeenAt);
}

export function openDevices(scene: UiScene, o: { source: AccountSource; onSignedOut?: () => void; onClose?: () => void }): Phaser.GameObjects.Container {
  const src = o.source;
  const { VW, VH } = scene.m;
  const w = settingsSheetW(VW);
  const m = openSettingsPage(scene, { title: t('devices.title'), h: Math.min(320, VH - 12), id: 'devices', onClose: o.onClose });
  const { c, x, y, h } = m;
  const iw = w - 16;
  let area: ScrollArea | null = null;
  const clear = (): Phaser.GameObjects.Container => {
    area?.destroy();
    area = new ScrollArea(scene, c, x + 8, y + 26, iw, h - 26 - 8, scene.m.S);
    return area.content;
  };
  c.once('destroy', () => area?.destroy());
  const say = (into: Phaser.GameObjects.Container, yy: number, text: string, font: 'pInk' | 'pMuted' | 'pBad' = 'pMuted'): number => {
    const tx = mtext(scene, 0, yy, text, font, { size: 7, maxW: iw - 4, wrap: true });
    into.add(tx);
    return yy + tx.height + 6;
  };

  const render = (list: SessionInfo[]): void => {
    const into = clear();
    const now = Date.now();
    let yy = 0;
    const rows = orderSessions(list);
    for (const s of rows) {
      into.add(mosaicPanelImage(scene, 0, yy, iw - 4, ROW_H - 1, s.current ? 'parchmentSel' : 'parchmentWell'));
      const right = s.current ? 4 : 62;
      const room = iw - right - 14;
      const name = s.device ?? t('devices.unknown');
      // the current one says so in words ("This device"), not by its lighter well alone
      const title = s.current ? `${name} · ${t('devices.this')}` : name;
      into.add(addText(scene, 6, yy + 3, ellipsize(title, room, false, 6.5), 'pInk').setFontSize(6.5));
      into.add(addText(scene, 6, yy + 14, ellipsize(t('devices.meta', { date: shortDate(s.createdAt), when: whenLabel(s.lastSeenAt, now) }), room, false, 6.5), 'pMuted').setFontSize(6.5));
      if (!s.current) {
        const handle = s.handle;
        const b = new Button(scene, iw - 4 - 60, yy + 2, 60, 22, {
          label: t('devices.logout'),
          small: true,
          id: `devices.logout.${handle}`,
          onClick: () => {
            b.setEnabled(false, t('auth.busy'));
            void src
              .revoke(handle)
              .catch(() => c.scene && toast(scene, t('account.err.action'), 'bad'))
              .then(() => c.scene && void load());
          },
        });
        into.add(b);
      }
      yy += STEP;
    }
    if (rows.filter((s) => !s.current).length === 0) yy = say(into, yy + 2, t('devices.onlyThis'));
    else {
      yy += 4;
      into.add(
        new MButton(scene, 0, yy, iw - 4, 24, {
          label: t('devices.logoutEverywhere'),
          variant: 'neutral',
          id: 'devices.logoutAll',
          onClick: () =>
            confirmDialog(scene, {
              title: t('devices.everywhereTitle'),
              body: t('devices.everywhereBody'),
              cancel: t('common.cancel'),
              ok: t('devices.logoutEverywhere'),
              destructive: true,
              onOk: () =>
                void src.logOutEverywhere().then((ok) => {
                  if (!c.scene) return;
                  toast(scene, t(ok ? 'account.loggedOut' : 'account.err.action'), ok ? 'info' : 'bad');
                  if (!ok) return;
                  m.close();
                  o.onSignedOut?.();
                }),
            }),
        }),
      );
      yy += 28;
    }
    area?.setContentHeight(yy + 4);
  };

  const load = async (): Promise<void> => {
    try {
      const list = await src.sessions();
      if (c.scene) render(list);
    } catch {
      if (!c.scene) return;
      const into = clear();
      let yy = say(into, 0, t('account.err.load'), 'pBad');
      into.add(new MButton(scene, 0, yy, iw - 4, 24, { label: t('auth.retry'), variant: 'secondary', id: 'devices.retry', onClick: () => void load() }));
      yy += 28;
      area?.setContentHeight(yy);
    }
  };
  say(clear(), 0, t('common.loading'));
  void load();
  return c;
}
