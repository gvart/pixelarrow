import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, ScrollArea, addIcon, addPanel, addScroll, addText, tappable } from '../ui/kit';
import { ensureItemIcon } from '../ui/sprites';
import { state } from '../state';
import { itemDef, RARITY_LABEL } from '../data/items';
import { takeLoot } from '../game/loot';
import { P } from '../art/palette';
import { RARITY_COLOR } from './ArmyScene';
import { hapticNotify, hapticSelect } from '../platform/telegram';
import { CULTURE_LABEL } from '../data/names';

export class ResultsScene extends BaseScene {
  private chosen = new Set<string>();
  private lootLayer!: Phaser.GameObjects.Container;
  private area: ScrollArea | null = null;
  private counter!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('Results');
  }

  create(): void {
    this.initUi();
    this.area = null;
    this.chosen = new Set(this.chosen);
    const last = state.last;
    const { VW, VH } = this.m;
    this.ui.add(this.add.rectangle(0, 0, VW, VH, P.bg).setOrigin(0, 0));
    if (!last) {
      this.scene.start('Army');
      return;
    }
    const o = last.outcome;
    this.telegramBack(() => this.finish());

    addScroll(this, this.ui, 8, 8, VW - 16, 48);
    const title = addText(this, VW / 2, 18, o.victory ? 'Victory' : o.draw ? 'Stalemate' : 'Defeat', 'red', 0.5);
    title.setFontSize(14);
    this.ui.add(title);
    this.ui.add(addText(this, VW / 2, 38, `vs ${CULTURE_LABEL[last.enemy.culture]}`, 'dim', 0.5));

    // summary
    let y = 62;
    this.ui.add(addPanel(this, 4, y, VW - 8, 86, 'parch'));
    const line = (icon: string, text: string, yy: number, font: 'ink' | 'red' = 'ink') => {
      this.ui.add(addIcon(this, 10, yy - 2, icon));
      this.ui.add(addText(this, 26, yy, text, font, 0, VW - 40));
    };
    line('swords', `Enemies slain ${o.enemyKilled}/${o.enemyTotal}`, y + 7);
    line('skull', `Your fallen ${o.lost}`, y + 21, o.lost > 0 ? 'red' : 'ink');
    line('coin', `Gold +${o.gold}`, y + 35);
    const ups = o.heroes.filter((h) => h.levelsGained > 0).map((h) => h.name);
    line('star', ups.length ? `Level up: ${ups.join(', ')}` : `XP to ${o.heroes.filter((h) => !h.died).length} survivors`, y + 49);
    const fallen = last.fallen.map((h) => h.name);
    if (fallen.length) line('skull', `RIP ${fallen.slice(0, 5).join(', ')}${fallen.length > 5 ? ` +${fallen.length - 5}` : ''}`, y + 63, 'red');
    else line('heart', 'No heroes lost', y + 63);
    y += 92;

    // loot
    this.ui.add(addPanel(this, 4, y, VW - 8, VH - y - 36, 'parch'));
    this.counter = addText(this, VW / 2, y + 6, '', 'red', 0.5);
    this.ui.add(this.counter);
    this.lootLayer = this.add.container(0, 0);
    this.ui.add(this.lootLayer);
    this.buildLoot(y + 18, VH - y - 36 - 22);

    const label = o.picks > 0 ? 'Take spoils' : 'Return';
    this.ui.add(new Button(this, VW / 2 - 60, VH - 32, 120, 26, { label, icon: 'check', style: 'buttonSel', onClick: () => this.finish() }));
  }

  private buildLoot(y: number, h: number): void {
    const o = state.last!.outcome;
    this.lootLayer.removeAll(true);
    this.area?.destroy();
    const { VW, S } = this.m;
    if (o.picks === 0) {
      this.counter.setText(o.victory ? 'No spoils to take' : 'No spoils in defeat');
      this.lootLayer.add(addText(this, VW / 2, y + 20, o.victory ? 'Kill foes to strip their gear.' : 'Survivors retreat to camp.', 'dim', 0.5));
      return;
    }
    this.counter.setText(`Choose spoils ${this.chosen.size}/${o.picks}`);
    const area = new ScrollArea(this, this.lootLayer, 8, y, VW - 16, h, S);
    this.area = area;
    const cols = 3;
    const cw = Math.floor((VW - 16 - (cols - 1) * 3) / cols);
    const ch = 44;
    o.loot.forEach((it, i) => {
      const def = itemDef(it.def);
      const cx = (i % cols) * (cw + 3);
      const cy = Math.floor(i / cols) * (ch + 3);
      const sel = this.chosen.has(it.uid);
      const card = this.add.container(cx, cy);
      const bg = addPanel(this, 0, 0, cw, ch, sel ? 'buttonSel' : 'button').setInteractive();
      tappable(bg, area, () => this.toggle(it.uid));
      card.add(bg);
      card.add(this.add.image(4, 4, ensureItemIcon(this, it)).setOrigin(0, 0));
      card.add(this.add.rectangle(cw - 7, 4, 3, 3, RARITY_COLOR[it.rarity]).setOrigin(0, 0));
      card.add(addText(this, cw - 4, 12, `${Math.round(it.cond)}%`, sel ? 'light' : 'dim', 1));
      card.add(addText(this, 4, 23, def.name, sel ? 'light' : 'ink', 0, cw - 6));
      if (def.name.length * 5 < cw - 8) card.add(addText(this, 4, 33, RARITY_LABEL[it.rarity], sel ? 'light' : 'dim'));
      area.content.add(card);
    });
    area.setContentHeight(Math.ceil(o.loot.length / cols) * (ch + 3));
  }

  private toggle(uid: string): void {
    const o = state.last!.outcome;
    if (this.chosen.has(uid)) this.chosen.delete(uid);
    else if (this.chosen.size < o.picks) this.chosen.add(uid);
    else {
      hapticNotify('warning');
      return;
    }
    hapticSelect();
    const scroll = this.area?.scrollY ?? 0;
    const { VH } = this.m;
    const y = 62 + 92 + 18;
    this.buildLoot(y, VH - (62 + 92) - 36 - 22);
    this.area?.setScroll(scroll);
  }

  private finish(): void {
    const last = state.last;
    if (last) {
      const items = takeLoot(last.outcome, [...this.chosen]);
      state.campaign.data.stash.push(...items);
      state.last = null;
      void state.save();
    }
    this.chosen.clear();
    this.scene.start('Army');
  }
}
