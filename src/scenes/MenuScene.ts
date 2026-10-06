import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, addPanel, addScroll, addText, addIcon } from '../ui/kit';
import { ensureDoll, dollFrame } from '../ui/sprites';
import { dollFromHero } from '../art/paperdoll';
import { state } from '../state';
import { haptic, inTelegram, setHaptics, telegramUserName } from '../platform/telegram';
import type { Settings } from '../game/save';
import { MAX_ARMY } from '../data/units';

export class MenuScene extends BaseScene {
  private dolls: { s: Phaser.GameObjects.Sprite; phase: number }[] = [];
  private overlay: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Menu');
  }

  create(): void {
    this.initUi();
    this.telegramBack(null);
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
    const mk = (i: number, label: string, icon: string, cb: () => void) =>
      this.ui.add(new Button(this, px, py + i * (bh + gap), pw, bh, { label, icon, onClick: cb }));
    mk(0, 'To battle', 'swords', () => this.scene.start('Battle', { fresh: true }));
    mk(1, 'Army', 'people', () => this.scene.start('Army'));
    mk(2, 'Settings', 'gear', () => this.openSettings());
    mk(3, 'New campaign', 'skull', () => this.confirmReset());

    // Footer status
    const fy = VH - 30;
    this.ui.add(addPanel(this, 8, fy, VW - 16, 22, 'inset'));
    this.ui.add(addIcon(this, 13, fy + 5, 'coin'));
    this.ui.add(addText(this, 28, fy + 7, `${c.gold}`, 'ink'));
    this.ui.add(addIcon(this, 62, fy + 5, 'people'));
    this.ui.add(addText(this, 77, fy + 7, `${c.heroes.length}/${MAX_ARMY}`, 'ink'));
    this.ui.add(addIcon(this, 116, fy + 5, 'star'));
    this.ui.add(addText(this, 131, fy + 7, `${c.won}/${c.fought}`, 'ink'));
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
    return { c, x, y, w };
  }

  private openSettings(): void {
    const s = state.campaign.data.settings;
    const rows: [keyof Settings, string][] = [
      ['pauseContact', 'Pause on first contact'],
      ['pauseFlank', 'Pause when flanked'],
      ['pauseRout', 'Pause when a group routs'],
      ['pauseDeath', 'Pause on hero death'],
      ['haptics', 'Haptic feedback'],
    ];
    const { c, x, y, w } = this.modal(30 + rows.length * 26 + 36, 'Settings');
    rows.forEach(([k, label], i) => {
      const by = y + 28 + i * 26;
      c.add(addText(this, x + 10, by + 7, label, 'ink', 0, w - 60));
      const b = new Button(this, x + w - 44, by, 34, 22, { label: s[k] ? 'On' : 'Off', style: s[k] ? 'buttonSel' : 'button' });
      b.on('pointerup', () => {
        s[k] = !s[k];
        b.setLabel(s[k] ? 'On' : 'Off');
        b.setSelected(s[k]);
        if (k === 'haptics') setHaptics(s.haptics);
        haptic('light');
        void state.save();
      });
      c.add(b);
    });
    c.add(new Button(this, x + w / 2 - 35, y + 30 + rows.length * 26, 70, 22, { label: 'Close', icon: 'check', onClick: () => this.closeOverlay() }));
  }

  private confirmReset(): void {
    const { c, x, y, w } = this.modal(96, 'New campaign?');
    c.add(addText(this, x + w / 2, y + 30, 'Your army and stash', 'ink', 0.5));
    c.add(addText(this, x + w / 2, y + 40, 'will be lost forever.', 'ink', 0.5));
    c.add(new Button(this, x + 12, y + 58, w / 2 - 18, 24, { label: 'Cancel', onClick: () => this.closeOverlay() }));
    c.add(
      new Button(this, x + w / 2 + 6, y + 58, w / 2 - 18, 24, {
        label: 'Begin',
        style: 'buttonSel',
        onClick: () => {
          void state.reset().then(() => this.scene.restart());
        },
      }),
    );
  }
}
