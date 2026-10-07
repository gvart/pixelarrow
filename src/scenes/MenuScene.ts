import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, addPanel, addScroll, addText, addIcon } from '../ui/kit';
import { ensureDoll, dollFrame } from '../ui/sprites';
import { dollFromHero } from '../art/paperdoll';
import { state } from '../state';
import { inTelegram, telegramUserName } from '../platform/telegram';
import { openSettings } from '../ui/settings';
import { MAX_ARMY } from '../data/units';
import { addSyncBadge, openShop } from '../ui/online';

export class MenuScene extends BaseScene {
  private dolls: { s: Phaser.GameObjects.Sprite; phase: number }[] = [];
  private overlay: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Menu');
  }

  create(): void {
    this.initUi();
    this.screen({ back: null }); // root: Telegram shows Close
    const { VW, VH } = this.m;
    const c = state.campaign.data;
    this.addGrassBackdrop(11);

    // Title scroll
    const tw = Math.min(VW - 16, 176);
    const tx = Math.round((VW - tw) / 2);
    addScroll(this, this.ui, tx, 14, tw, 56);
    const title = addText(this, VW / 2, 27, 'Pixelarrow', 'red', 0.5);
    title.setFontSize(14);
    this.ui.add(title);
    this.ui.add(addText(this, VW / 2, 50, 'Shields of the Middle Sea', 'ink', 0.5));

    // Menu panel anchored above the footer; soldiers fill the space between.
    const pw = Math.min(VW - 24, 150);
    const px = Math.round((VW - pw) / 2);
    const bh = 24;
    const gap = 5;
    const panelH = bh * 4 + gap * 3 + 12;
    const py = Math.min(Math.round(VH * 0.55), VH - 30 - 16 - panelH + 6);
    const top = 74;
    const room = py - 6 - top;

    // Soldiers standing in line on the plain
    this.dolls = [];
    const scale = room >= 70 ? 2 : 1;
    const rows = room >= 104 ? 2 : 1;
    const perRow = scale === 2 ? 5 : 8;
    const heroes = c.heroes.slice(0, perRow * rows);
    const step = scale === 2 ? 34 : 20;
    const rowGap = scale === 2 ? 26 : 13;
    const base = Math.round(top + (room - (rows - 1) * rowGap) / 2 + 38 * scale * 0.5);
    heroes.forEach((h, i) => {
      const key = ensureDoll(this, dollFromHero(h));
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const n = Math.min(perRow, heroes.length - row * perRow);
      const x = Math.round(VW / 2 - ((n - 1) / 2) * step + col * step + (row ? 6 : 0));
      const y = base + row * rowGap;
      const sh = this.add.image(x, y - 2, 'shadow').setAlpha(0.35).setScale(scale);
      const sp = this.add.sprite(x, y, key, dollFrame(0, 0)).setOrigin(0.5, 38 / 40).setScale(scale);
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
    const cont = mk(0, 'Continue', 'map', () => this.continueCampaign());
    cont.setSelected(state.hasSave);
    cont.setEnabled(state.hasSave);
    mk(1, 'New campaign', 'flag', () => (state.hasSave ? this.confirmReset() : this.newCampaign()));
    mk(2, 'Shop', 'coin', () => this.openShop());
    mk(3, 'Settings', 'gear', () => this.openSettings());

    // Footer status
    const fy = VH - 30;
    this.ui.add(addPanel(this, 8, fy, VW - 16, 22, 'inset'));
    this.ui.add(addIcon(this, 13, fy + 5, 'coin'));
    this.ui.add(addText(this, 28, fy + 7, `${c.gold}`, 'ink'));
    this.ui.add(addIcon(this, 62, fy + 5, 'people'));
    this.ui.add(addText(this, 77, fy + 7, `${c.heroes.length}/${MAX_ARMY}`, 'ink'));
    this.ui.add(addIcon(this, 116, fy + 5, 'star'));
    this.ui.add(addText(this, 131, fy + 7, state.hasSave ? `Day ${Math.floor(c.world.time / 24) + 1}` : `${c.won}/${c.fought}`, 'ink'));
    addSyncBadge(this, this.ui, VW - 26, fy + 8);
    const who = telegramUserName();
    this.ui.add(addText(this, VW / 2, fy - 11, inTelegram() ? `Cloud save${who ? ' - ' + who : ''}` : 'Local save', 'light', 0.5));
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

  private modal(h: number, title: string): { c: Phaser.GameObjects.Container; x: number; y: number; w: number } {
    this.closeOverlay();
    const { VW, VH } = this.m;
    const c = this.add.container(0, 0);
    this.ui.add(c);
    const shade = this.add.rectangle(0, 0, VW, VH, 0x000000, 0.55).setOrigin(0, 0).setInteractive();
    c.add(shade);
    const w = Math.min(VW - 16, 180);
    const x = Math.round((VW - w) / 2);
    const y = Math.round((VH - h) / 2);
    addScroll(this, c, x, y, w, h);
    c.add(addText(this, VW / 2, y + 12, title, 'red', 0.5));
    this.overlay = c;
    this.modalLayer(c, () => this.closeOverlay());
    return { c, x, y, w };
  }

  private openShop(): void {
    openShop(this, {
      modal: (h, title) => this.modal(h, title),
      close: () => this.closeOverlay(),
      isOpen: (c) => this.overlay === c,
    });
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
    const { c, x, y, w } = this.modal(96, 'New campaign?');
    c.add(addText(this, x + w / 2, y + 30, 'Your army, stash and map', 'ink', 0.5));
    c.add(addText(this, x + w / 2, y + 40, 'will be lost forever.', 'ink', 0.5));
    c.add(new Button(this, x + 12, y + 58, w / 2 - 18, 24, { label: 'Cancel', onClick: () => this.closeOverlay() }));
    c.add(
      new Button(this, x + w / 2 + 6, y + 58, w / 2 - 18, 24, {
        label: 'Begin',
        style: 'buttonSel',
        onClick: () => {
          this.newCampaign();
        },
      }),
    );
  }
}
