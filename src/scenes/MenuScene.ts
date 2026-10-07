import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, addPanel, addScroll, addText, addIcon } from '../ui/kit';
import { ensureDoll, dollFrame, dollOrigin } from '../ui/sprites';
import { dollFromHero } from '../art/paperdoll';
import { state } from '../state';
import { inTelegram, telegramUserName } from '../platform/telegram';
import { openSettings } from '../ui/settings';
import { demoNotifySource, openAbout, openNotifySettings } from '../ui/notifySettings';
import { MAX_ARMY } from '../data/units';
import { addSyncBadge } from '../ui/online';
import { confirmDialog } from '../ui/widgets';
import { ellipsize } from '../ui/textfit';
import { SIZE } from '../ui/theme';
import { t } from '../i18n';

export class MenuScene extends BaseScene {
  private dolls: { s: Phaser.GameObjects.Sprite; phase: number }[] = [];
  private overlay: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Menu');
  }

  create(data?: { settings?: 'notify' }): void {
    this.initUi();
    this.screen({ back: null }); // root: Telegram shows Close
    const { VW, VH } = this.m;
    const c = state.campaign.data;
    this.addGrassBackdrop(11);

    // Menu panel anchored above the footer; the title scroll on top and
    // soldiers in between. Short screens (small phones inside Telegram's
    // safe area) get a compact layout: a plain title, tighter buttons and no
    // soldiers, so nothing overlaps.
    const pw = Math.min(VW - 24, 150);
    const px = Math.round((VW - pw) / 2);
    const bh = 24;
    let gap = 5;
    let panelH = bh * 5 + gap * 4 + 12;
    let py = Math.min(Math.round(VH * 0.55), VH - 30 - 16 - panelH + 6);
    const compact = py - 6 < 74;
    const tw = Math.min(VW - 16, 176);
    const tx = Math.round((VW - tw) / 2);
    if (compact) {
      gap = SIZE.gap;
      panelH = bh * 5 + gap * 4 + 12;
      const titleBottom = 20;
      py = Math.max(titleBottom + 6 + 2, Math.round((titleBottom + VH - 30 - 13 - panelH) / 2) + 6);
      this.ui.add(addText(this, VW / 2, 6, 'Pixelarrow', 'title', 0.5));
    } else {
      addScroll(this, this.ui, tx, 14, tw, 56);
      const title = addText(this, VW / 2, 27, 'Pixelarrow', 'red', 0.5);
      title.setFontSize(14);
      this.ui.add(title);
      this.ui.add(addText(this, VW / 2, 50, ellipsize(t('menu.subtitle').toUpperCase(), tw - 16), 'ink', 0.5));
    }
    const top = 74;
    const room = compact ? 0 : py - 6 - top;

    // Soldiers standing in line on the plain
    this.dolls = [];
    // the figures are drawn at their true size (a man is ~34 px): no upscaling
    const scale = 1;
    const rows = compact ? 0 : room >= 80 ? 2 : 1;
    const perRow = 7;
    const heroes = c.heroes.slice(0, perRow * rows);
    const step = 22;
    const rowGap = 18;
    const base = Math.round(top + (room - (rows - 1) * rowGap) / 2 + 17);
    heroes.forEach((h, i) => {
      const key = ensureDoll(this, dollFromHero(h), [0]);
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const n = Math.min(perRow, heroes.length - row * perRow);
      const x = Math.round(VW / 2 - ((n - 1) / 2) * step + col * step + (row ? 6 : 0));
      const y = base + row * rowGap;
      const sh = this.add.image(x, y, 'shadow').setAlpha(0.35).setScale(scale);
      const sp = this.add.sprite(x, y, key, dollFrame(0, 0)).setOrigin(...dollOrigin(key)).setScale(scale);
      this.ui.add(sh);
      this.ui.add(sp);
      this.dolls.push({ s: sp, phase: i * 0.37 });
    });

    this.ui.add(addPanel(this, px - 6, py - 6, pw + 12, panelH, 'parch'));
    const mk = (i: number, label: string, icon: string, cb: () => void) => {
      const b = new Button(this, px, py + i * (bh + gap), pw, bh, { label, icon, onClick: cb });
      this.ui.add(b);
      return b;
    };
    const cont = mk(0, t('menu.continue'), 'map', () => this.continueCampaign());
    cont.setSelected(state.hasSave);
    cont.setEnabled(state.hasSave, t('menu.noSave'));
    mk(1, t('menu.newCampaign'), 'flag', () => (state.hasSave ? this.confirmReset() : this.newCampaign()));
    mk(2, t('menu.online'), 'swords', () => this.scene.start('Online', {}));
    // the shop and the Beast trial share a row
    const half = Math.floor((pw - SIZE.gap) / 2);
    this.ui.add(new Button(this, px, py + 3 * (bh + gap), half, bh, { label: t('menu.shop'), icon: 'coin', onClick: () => this.openShop() }));
    this.ui.add(new Button(this, px + half + SIZE.gap, py + 3 * (bh + gap), pw - half - SIZE.gap, bh, { label: t('menu.trial'), icon: 'beast', onClick: () => this.openTrial() }));
    mk(4, t('menu.settings'), 'gear', () => this.openSettings());

    // Footer status
    const fy = VH - 30;
    this.ui.add(addPanel(this, 8, fy, VW - 16, 22, 'inset'));
    // three stats spread over the bar, the sync badge at its right end
    const stats: [string, string][] = [
      ['coin', `${c.gold}`],
      ['people', `${c.heroes.length}/${MAX_ARMY}`],
      ['star', state.hasSave ? t('common.day', { n: Math.floor(c.world.time / 24) + 1 }) : `${c.won}/${c.fought}`],
    ];
    const cellW = Math.floor((VW - 16 - 6 - 18) / stats.length);
    stats.forEach(([icon, text], i) => {
      const sx = 13 + i * cellW;
      this.ui.add(addIcon(this, sx, fy + 5, icon));
      this.ui.add(addText(this, sx + 15, fy + 7, ellipsize(text.toUpperCase(), cellW - 18), 'ink'));
    });
    addSyncBadge(this, this.ui, VW - 26, fy + 8);
    const who = telegramUserName();
    const saveLabel = inTelegram() ? (who ? t('menu.cloudSaveOf', { name: who }) : t('menu.cloudSave')) : t('menu.localSave');
    this.ui.add(addText(this, VW / 2, fy - 11, ellipsize(saveLabel.toUpperCase(), VW - 16, true), 'light', 0.5));
    // Opened from a bot message's "Open in the game" (startapp=settings).
    if (data?.settings === 'notify') this.openNotifications();
  }

  /** Settings with the notification switches on top (`demo`: in-memory switches, for the layout check). */
  openNotifications(demo = false): void {
    this.openSettings();
    openNotifySettings(this, demo ? { source: demoNotifySource() } : {});
  }

  /** Settings → About (terms, privacy, refunds). */
  openAboutPage(): void {
    this.openSettings();
    openAbout(this);
  }

  update(time: number): void {
    for (const d of this.dolls) {
      const f = Math.floor(time / 600 + d.phase) % 2;
      d.s.setFrame(dollFrame(0, f));
    }
  }

  private closeOverlay(): void {
    this.overlay?.destroy();
    this.overlay = null;
  }

  /** The shop scene (wallet, cosmetics, consumables, season pass). */
  openShop(): void {
    this.closeOverlay();
    this.scene.start('Shop', { back: { scene: 'Menu' } });
  }

  /** The Beast trial: fight any mythical beast offline. */
  openTrial(): void {
    this.closeOverlay();
    this.scene.start('BeastTrial');
  }

  private openSettings(): void {
    this.closeOverlay();
    openSettings(this);
  }

  private continueCampaign(): void {
    const w = state.campaign.world;
    if (w.s.inside >= 0) this.scene.start('Settlement', { id: w.s.inside });
    else this.scene.start('World');
  }

  private newCampaign(): void {
    void state.reset().then(() => this.scene.start('World'));
  }

  private confirmReset(): void {
    const prev = this.overlay;
    const c = confirmDialog(this, {
      title: t('menu.resetTitle'),
      body: t('menu.resetBody'),
      cancel: t('common.cancel'),
      ok: t('menu.resetOk'),
      destructive: true,
      onOk: () => this.newCampaign(),
    });
    this.overlay = c;
    c.once('destroy', () => this.overlay === c && (this.overlay = null));
    prev?.destroy();
  }
}
