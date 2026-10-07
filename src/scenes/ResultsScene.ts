import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, Meter, ScrollArea, addIcon, addPanel, addScroll, addText, tappable } from '../ui/kit';
import { xpToNext } from '../data/units';
import type { HeroOutcome } from '../game/loot';
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
  private lootY = 0;
  private lootH = 0;
  private bars: { o: HeroOutcome; meter: Meter; x: number; y: number; w: number; level: number; t: number; shown: number; lvlText: Phaser.GameObjects.BitmapText; flash: number }[] = [];
  private bigPop: Phaser.GameObjects.BitmapText | null = null;
  private xpPanelY = 0;
  private xpTitle: Phaser.GameObjects.BitmapText | null = null;
  private confetti: { r: Phaser.GameObjects.Rectangle; x: number; y: number; vx: number; vy: number; life: number }[] = [];
  private animStart = 0;

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
    this.screen({ back: () => this.finish() });

    addScroll(this, this.ui, 8, 8, VW - 16, 48);
    const title = addText(this, VW / 2, 18, o.victory ? 'Victory' : o.draw ? 'Stalemate' : o.retreated ? 'Retreat' : 'Defeat', 'red', 0.5);
    title.setFontSize(14);
    this.ui.add(title);
    this.ui.add(addText(this, VW / 2, 38, `vs ${CULTURE_LABEL[last.enemy.culture]}`, 'dim', 0.5));

    // summary
    let y = 60;
    this.ui.add(addPanel(this, 4, y, VW - 8, 46, 'parch'));
    const line = (icon: string, text: string, xx: number, yy: number, font: 'ink' | 'red' = 'ink') => {
      this.ui.add(addIcon(this, xx, yy - 2, icon));
      this.ui.add(addText(this, xx + 15, yy, text, font, 0, VW - 40));
    };
    line('swords', `Slain ${o.enemyKilled}/${o.enemyTotal}`, 9, y + 6);
    line('coin', `Gold +${o.gold}`, VW / 2 + 4, y + 6);
    const wounded = o.heroes.filter((h) => h.wounded).length;
    line('skull', `Fallen ${o.lost}`, 9, y + 19, o.lost > 0 ? 'red' : 'ink');
    line('cross', `Wounded ${wounded}`, VW / 2 + 4, y + 19, wounded > 0 ? 'red' : 'ink');
    const fallen = last.fallen.map((h) => h.name);
    if (fallen.length) line('skull', `RIP ${fallen.slice(0, 4).join(', ')}${fallen.length > 4 ? ` +${fallen.length - 4}` : ''}`, 9, y + 32, 'red');
    else line('heart', 'No heroes lost', 9, y + 32);
    y += 49;
    y = this.buildXp(y);

    // loot
    this.ui.add(addPanel(this, 4, y, VW - 8, VH - y - 36, 'parch'));
    this.counter = addText(this, VW / 2, y + 6, '', 'red', 0.5);
    this.ui.add(this.counter);
    this.lootLayer = this.add.container(0, 0);
    this.ui.add(this.lootLayer);
    this.lootY = y + 18;
    this.lootH = VH - y - 36 - 22;
    this.buildLoot(this.lootY, this.lootH);

    const label = o.picks > 0 ? 'Take spoils' : 'Return';
    this.ui.add(new Button(this, VW / 2 - 60, VH - 32, 120, 26, { label, icon: 'check', style: 'buttonSel', onClick: () => this.finish() }));
  }

  private buildLoot(y: number, h: number): void {
    const o = state.last!.outcome;
    this.lootLayer.removeAll(true);
    this.area?.destroy();
    const { VW, S } = this.m;
    if (o.picks === 0) {
      this.counter.setText(o.victory ? 'No spoils to take' : o.retreated ? 'No spoils in retreat' : 'No spoils in defeat');
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
    this.buildLoot(this.lootY, this.lootH);
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
    if (last?.partyId !== undefined) this.scene.start('World');
    else this.scene.start('Army', { from: 'World' });
  }

  /** Survivors' XP bars (two columns), animated from their old XP; level-ups flash and throw confetti. */
  private buildXp(y: number): number {
    const o = state.last!.outcome;
    const { VW } = this.m;
    const alive = o.heroes.filter((h) => !h.died).sort((a, b) => b.levelsGained - a.levelsGained);
    this.bars = [];
    if (alive.length === 0) return y;
    const shown = alive.slice(0, 8);
    const rows = Math.ceil(shown.length / 2);
    const h = 13 + rows * 13;
    this.ui.add(addPanel(this, 4, y, VW - 8, h, 'parch'));
    this.xpTitle = addText(this, VW / 2, y + 4, alive.length > 8 ? `Experience (+${alive.length - 8} more)` : 'Experience', 'red', 0.5);
    this.ui.add(this.xpTitle);
    const colW = Math.floor((VW - 16) / 2);
    shown.forEach((ho, i) => {
      const x = 8 + (i % 2) * colW;
      const ry = y + 14 + Math.floor(i / 2) * 13;
      const name = ho.name.length > 8 ? ho.name.slice(0, 7) + '.' : ho.name;
      this.ui.add(addText(this, x, ry, name, ho.wounded ? 'red' : 'ink'));
      const lvlText = addText(this, x + colW - 6, ry, `${ho.levelBefore ?? '?'}`, 'dim', 1);
      this.ui.add(lvlText);
      const meter = new Meter(this, x + 44, ry + 1, colW - 66, 5, P.gold);
      this.ui.add(meter);
      const lb = ho.levelBefore ?? 1;
      meter.setValue(ho.xpBefore ?? 0, xpToNext(lb));
      this.bars.push({ o: ho, meter, x: x + 44, y: ry, w: colW - 66, level: lb, t: 0, shown: ho.xpBefore ?? 0, lvlText, flash: 0 });
    });
    this.animStart = this.time.now + 400;
    this.bigPop = null;
    this.xpPanelY = y;
    return y + h + 3;
  }

  update(time: number, delta: number): void {
    // XP bars fill at a steady rate; crossing a level flashes the bar and pops the text
    for (const b of this.bars) {
      if (time < this.animStart) break;
      const target = this.totalXp(b.o.levelBefore ?? 1, b.o.xpBefore ?? 0) + b.o.xp;
      const cur = this.totalXp(b.level, b.shown);
      if (cur >= target) continue;
      const step = Math.max(1, (b.o.xp / 1.2) * (delta / 1000));
      let total = Math.min(target, cur + step);
      // convert the cumulative total back to level + xp
      let lvl = 1;
      while (lvl < 10 && total >= xpToNext(lvl)) {
        total -= xpToNext(lvl);
        lvl++;
      }
      if (lvl > b.level) this.levelUp(b, lvl);
      b.level = lvl;
      b.shown = total;
      b.meter.setValue(total, xpToNext(lvl), b.flash > time ? 0xffffff : P.gold);
    }
    const dt = delta / 1000;
    for (const c of this.confetti) {
      c.life -= dt;
      c.vy += 120 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.r.setPosition(Math.round(c.x), Math.round(c.y)).setVisible(c.life > 0);
    }
    if (this.confetti.length && this.confetti.every((c) => c.life <= 0)) {
      for (const c of this.confetti) c.r.destroy();
      this.confetti = [];
    }
  }

  private totalXp(level: number, xp: number): number {
    let t = xp;
    for (let l = 1; l < level; l++) t += xpToNext(l);
    return t;
  }

  private levelUp(b: (typeof this.bars)[number], lvl: number): void {
    hapticNotify('success');
    // the row: level number turns gold and pops, the bar flashes white
    b.lvlText.setText(`${lvl}`).setFont('font_gold');
    b.lvlText.setScale(2);
    this.time.delayedCall(80, () => b.lvlText.setScale(1.5));
    this.time.delayedCall(160, () => b.lvlText.setScale(1));
    b.flash = this.time.now + 180;
    // one big "Level up!" over the panel for the whole screen
    if (!this.bigPop) {
      const { VW } = this.m;
      this.xpTitle?.setVisible(false);
      const pop = addText(this, VW / 2, this.xpPanelY - 3, 'Level up!', 'gold', 0.5);
      this.ui.add(pop);
      this.bigPop = pop;
      pop.setScale(3);
      this.time.delayedCall(70, () => pop.setScale(2.5));
      this.time.delayedCall(140, () => pop.setScale(2));
    }
    const colors = [P.gold, P.red, 0x6fae5a, 0x6d8fae, P.cream];
    for (let i = 0; i < 26 && this.confetti.length < 140; i++) {
      const r = this.add.rectangle(0, 0, i % 3 ? 1 : 2, i % 4 ? 1 : 2, colors[i % colors.length]).setOrigin(0, 0);
      this.ui.add(r);
      const a = Math.random() * Math.PI * 2;
      const v = 20 + Math.random() * 45;
      this.confetti.push({ r, x: b.x + b.w / 2, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 50, life: 1 + Math.random() * 0.8 });
    }
  }
}
