/**
 * UI kit gallery (debug): every component of src/ui/widgets.ts on three tabs.
 * Not linked from the menu; open it with `?scene=Kit` or from a script
 * (`__game.scene.start('Kit')`). The layout check visits it, so the kit
 * itself stays within the rules (docs/UI_KIT.md).
 */
import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, addPanel, addText } from '../ui/kit';
import { Badge, Card, CountUp, Grid, ItemIcon, Label, ScrollList, StatBar, Tabs, addEmptyState, confirmDialog, stackCards, toast, type IconSubject } from '../ui/widgets';
import { ScrollArea } from '../ui/kit';
import { addScrollHint } from '../ui/widgets';
import { ITEM_LIST, RARITIES } from '../data/items';
import { CONSUMABLE_ICON_IDS, RESOURCE_ICON_IDS } from '../art/goodsIcons';
import { SIZE, CATEGORY_COLOR, type BattleCategory } from '../ui/theme';
import { t } from '../i18n';
import { ellipsize } from '../ui/textfit';

interface KitData {
  tab?: number;
}

export class KitScene extends BaseScene {
  private page: Phaser.GameObjects.Container | null = null;
  private cleanup: (() => void)[] = [];
  private tab = 0;

  constructor() {
    super('Kit');
  }

  create(data: KitData): void {
    this.initUi();
    this.tab = data?.tab ?? 0;
    this.screen({ back: () => this.scene.start('Menu') });
    const { VW } = this.m;
    this.ui.add(addPanel(this, 0, 0, VW, this.m.VH, 'parch'));
    this.ui.add(addText(this, VW / 2, 6, 'UI KIT', 'red', 0.5));
    const tabs = new Tabs(this, 6, 18, VW - 12, ['Controls', 'Items', 'Lists'], { selected: this.tab, onChange: (i) => this.show(i) });
    this.ui.add(tabs);
    this.show(this.tab);
  }

  private show(i: number): void {
    this.tab = i;
    this.cleanup.forEach((f) => f());
    this.cleanup = [];
    this.page?.destroy();
    this.page = this.add.container(0, 0);
    this.ui.add(this.page);
    if (i === 0) this.controls(this.page);
    else if (i === 1) this.items(this.page);
    else this.lists(this.page);
  }

  private controls(p: Phaser.GameObjects.Container): void {
    const { VW, VH } = this.m;
    const top = 48;
    const area = new ScrollArea(this, p, 6, top, VW - 12, VH - top - 6, this.m.S);
    this.cleanup.push(() => area.destroy());
    const c = area.content;
    const w = VW - 12 - 4;
    let y = 0;
    const bw = Math.floor((w - 2 * SIZE.gap) / 3);
    c.add(new Button(this, 0, y, bw, SIZE.btnH, { label: 'Primary', variant: 'primary', onClick: () => toast(this, 'Primary action', 'good') }));
    c.add(new Button(this, bw + SIZE.gap, y, bw, SIZE.btnH, { label: 'Secondary', onClick: () => toast(this, 'Secondary action') }));
    c.add(
      new Button(this, 2 * (bw + SIZE.gap), y, w - 2 * (bw + SIZE.gap), SIZE.btnH, {
        label: 'Delete',
        variant: 'destructive',
        onClick: () => confirmDialog(this, { title: 'Delete it?', body: 'This cannot be undone. The item is gone for good.', ok: 'Delete', destructive: true, onOk: () => toast(this, 'Deleted', 'bad') }),
      }),
    );
    y += SIZE.btnH + 6;
    const dis = new Button(this, 0, y, bw * 2 + SIZE.gap, SIZE.btnH, { label: 'Disabled', icon: 'cross', disabledReason: 'Needs 100 gold' });
    dis.setEnabled(false);
    c.add(dis);
    const withBadge = new Button(this, 2 * (bw + SIZE.gap), y, w - 2 * (bw + SIZE.gap), SIZE.btnH, { icon: 'flag', tip: 'Icon buttons explain themselves on a long press' });
    c.add(withBadge);
    c.add(new Badge(this, withBadge.x + withBadge.w - 3, y + 3, 3));
    y += SIZE.btnH + 8;
    const cats: BattleCategory[] = ['movement', 'attack', 'formation', 'abilities'];
    const cw = Math.floor((w - 3 * SIZE.gap) / 4);
    cats.forEach((k, i) => {
      c.add(this.add.rectangle(i * (cw + SIZE.gap), y, cw, 10, CATEGORY_COLOR[k]).setOrigin(0, 0));
      c.add(addText(this, i * (cw + SIZE.gap) + cw / 2, y + 12, ellipsize(t(`battle.cat.${k}`), cw - 2), 'dim', 0.5));
    });
    y += 26;
    const sb1 = new StatBar(this, 0, y, w, { label: 'Armour', max: 10, tip: 'Armour: damage taken is reduced by this much' });
    sb1.set(5, 7);
    c.add(sb1);
    y += 24;
    const sb2 = new StatBar(this, 0, y, w, { label: 'Speed', max: 2, format: (v) => v.toFixed(2), tip: 'Walking speed' });
    sb2.set(1.2, 1.05);
    c.add(sb2);
    y += 26;
    const tw = Math.floor((w - 2 * SIZE.gap) / 3);
    const tiles = [
      new CountUp(this, 0, y, tw, 44, { icon: 'skull', label: 'Kills', value: 27 }),
      new CountUp(this, tw + SIZE.gap, y, tw, 44, { icon: 'coin', label: 'Gold', value: 340, prefix: '+' }),
      new CountUp(this, 2 * (tw + SIZE.gap), y, w - 2 * (tw + SIZE.gap), 44, { icon: 'star', label: 'Experience', value: 1250 }),
    ];
    tiles.forEach((tile, i) => {
      c.add(tile);
      tile.start().updateTo('delay', i * 200);
    });
    y += 50;
    const lab = new Label(this, 0, y, 'A very long description that cannot fit on two lines of this narrow box, so it ends in an ellipsis and a tap shows it all.', { maxW: w, maxLines: 2 });
    c.add(lab);
    y += lab.h + 8;
    const cards: Card[] = [];
    const restack = () => {
      const h = stackCards(cards, y);
      area.setContentHeight(y + h + 8);
    };
    cards.push(new Card(this, 0, 0, w, { title: 'Expandable card', subtitle: 'Tap to read the details', icon: 'eye', body: 'Cards stay compact in a list and open on tap to show their details, here a few lines of wrapped text.', area, onToggle: restack }));
    cards.push(new Card(this, 0, 0, w, { title: 'Bronze-shod dory', subtitle: 'Weapon', icon: { item: { uid: 'k1', def: 'bronze_dory', rarity: 'epic', cond: 90 } }, right: '60', body: 'Long thrusting spear. Reach; braces against charges.', area, onToggle: restack }));
    cards.forEach((cd) => c.add(cd));
    restack();
    addScrollHint(this, p, area);
  }

  private items(p: Phaser.GameObjects.Container): void {
    const { VW, VH } = this.m;
    const subjects: IconSubject[] = [];
    ITEM_LIST.forEach((d, i) => subjects.push({ item: { uid: `k${i}`, def: d.id, rarity: RARITIES[i % RARITIES.length], cond: 100 } }));
    CONSUMABLE_ICON_IDS.forEach((id) => subjects.push({ consumable: id }));
    RESOURCE_ICON_IDS.forEach((id) => subjects.push({ resource: id }));
    const grid = new Grid(this, p, 6, 48, VW - 12, VH - 54, {
      count: subjects.length,
      render: (i, cell, _size, area) => cell.add(new ItemIcon(this, 0, 0, subjects[i], { area, qty: 'item' in subjects[i] ? undefined : 3 + i })),
    });
    this.cleanup.push(() => grid.destroy());
  }

  private lists(p: Phaser.GameObjects.Container): void {
    const { VW, VH } = this.m;
    const h = Math.round((VH - 54) * 0.5);
    const list = new ScrollList(this, p, 6, 48, VW - 12, h, {
      count: 500,
      rowH: SIZE.rowH,
      render: (i, row, w, rh) => {
        row.add(addPanel(this, 0, 0, w, rh, i % 2 ? 'inset' : 'parch'));
        row.add(addText(this, 6, 9, ellipsize(`Row ${i + 1} of 500 (virtualised)`, w - 12), 'ink'));
      },
      onTap: (i) => toast(this, `Row ${i + 1}`),
      tip: (i) => `Long-press on row ${i + 1}`,
      id: () => 'kit.row',
    });
    this.cleanup.push(() => list.destroy());
    p.add(addEmptyState(this, 6, 48 + h + 4, VW - 12, VH - 54 - h - 4, { icon: 'tent', title: 'Empty stash', hint: 'Win battles to take loot from the field.', action: { label: 'Find a fight', onClick: () => toast(this, 'Off to war') } }));
  }
}
