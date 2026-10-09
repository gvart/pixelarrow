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
import { HEADER_H, InfoChip, Pager, ProgressBar, ScreenHeader, Stepper, Tile, Toggle, addLocked, addTipLine, confirmPurchase, layChips, openSheet, purchaseButton, resourceChip } from '../ui/v3';
import { SURFACE } from '../ui/tokens';
import { ellipsize } from '../ui/textfit';
import { BottomPanel, FrescoBanner, MButton, MChip, ParchmentCard, ParchmentRow, ProfileCard, QuestCard, ScreenFrame, SectionTitle, SegmentedSwitch, StoneTile, TabBar, TAB_H, TopBar, ROW_H, SECTION_TITLE_H, SWITCH_H, type TabId } from '../ui/mosaic';

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
    this.ui.add(this.add.rectangle(0, 0, VW, this.m.VH, SURFACE.bg).setOrigin(0, 0));
    this.ui.add(addText(this, VW / 2, 6, 'UI KIT', 'head', 0.5));
    // a narrow canvas fits five 44 pt tabs no more: it keeps the three newest pages (the rest open with `data.tab`)
    const pages = VW >= 150 ? [0, 1, 2, 3, 4] : [0, 3, 4];
    const names = ['Controls', 'Items', 'Lists', 'V3', 'Mosaic'];
    const tabs = new Tabs(this, 6, 18, VW - 12, pages.map((i) => names[i]), { selected: Math.max(0, pages.indexOf(this.tab)), onChange: (i) => this.show(pages[i]) });
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
    else if (i === 2) this.lists(this.page);
    else if (i === 3) this.v3(this.page);
    else this.mosaic(this.page);
  }

  /** The v3 component layer (src/ui/v3.ts): header, chips, tip, tiles, switches, progress, locked state, pager, real money. */
  private v3(p: Phaser.GameObjects.Container): void {
    const { VW, VH } = this.m;
    const top = 48;
    const area = new ScrollArea(this, p, 6, top, VW - 12, VH - top - 6, this.m.S);
    this.cleanup.push(() => area.destroy());
    addScrollHint(this, p, area, SURFACE.bg);
    const c = area.content;
    const w = VW - 12 - 4;
    let y = 0;
    c.add(new ScreenHeader(this, w, { title: 'Screen title', actions: [{ icon: 'people', label: 'Team', badge: '!', onClick: () => toast(this, 'Team') }, { icon: 'shop', label: 'Shop', onClick: () => toast(this, 'Shop') }] }));
    y += HEADER_H + 4;
    layChips(c, [resourceChip(this, 0, 0, 'glory', 640, { word: true }), resourceChip(this, 0, 0, 'drachmae', 340, { word: true }), new InfoChip(this, 0, 0, { icon: 'xp', value: 'Duel Lv 2', progress: 0.4, tip: '35 / 100 XP to duel level 3' })], 0, y, w);
    y += 26;
    layChips(c, [resourceChip(this, 0, 0, 'gold', 240, { word: true, tipKey: 'res.tip.gold.campaign' }), resourceChip(this, 0, 0, 'power', 539), resourceChip(this, 0, 0, 'wins', 3), resourceChip(this, 0, 0, 'stars', 250, { word: true })], 0, y, w);
    y += 26;
    y += addTipLine(this, c, 0, y, w, { text: 'A chest is ready to claim: tap the glowing chest.', tone: 'reward' }) + 4;
    y += addTipLine(this, c, 0, y, w, { text: 'Your team is over this floor\'s budget.', tone: 'warn' }) + 4;
    const tw = Math.floor((w - 8) / 3);
    ['swords', 'map', 'beast'].forEach((icon, i) => c.add(new Tile(this, i * (tw + 4), y, i === 2 ? w - 2 * (tw + 4) : tw, 50, { icon, label: ['Duels', 'Online', 'Beasts'][i], raised: true, locked: i === 2 ? 'Unlocks at level 3' : undefined, onClick: () => toast(this, 'Tile') })));
    y += 54;
    c.add(new Toggle(this, 0, y, { on: true, label: 'Sound', onChange: () => undefined }));
    c.add(new Toggle(this, 40, y, { on: false, label: 'Music', onChange: () => undefined }));
    y += 26;
    c.add(new Stepper(this, 0, y, { value: 6, min: 0, max: 10, label: 'Volume', onChange: () => undefined }));
    y += 26;
    const pb = new ProgressBar(this, 0, y, w, { value: 35, max: 100, label: 'Duel level 3', right: '35 / 100 XP' });
    c.add(pb);
    y += pb.h + 6;
    y += addLocked(this, c, 0, y, w, { title: 'Ranked matches', icon: 'trophy', reason: 'Unlocks at duel level 5', progress: { value: 2, max: 5, label: 'Duel level' }, how: 'Win ladder floors and unranked matches to earn duel XP.' }) + 6;
    c.add(new Pager(this, 0, y, { index: 1, count: 8, onPrev: () => toast(this, 'Prev'), onNext: () => toast(this, 'Next') }));
    c.add(new Button(this, 86, y, w - 86, 24, { label: 'Ghost action', variant: 'ghost', onClick: () => toast(this, 'Ghost') }));
    y += 28;
    c.add(purchaseButton(this, 0, y, Math.floor(w / 2) - 2, 26, { stars: 250, onClick: () => confirmPurchase(this, { what: '275 Drachmae', stars: 250, onOk: () => toast(this, 'Paid', 'good') }) }));
    c.add(new Button(this, Math.floor(w / 2) + 2, y, w - Math.floor(w / 2) - 2, 26, { label: 'Open a sheet', onClick: () => openSheet(this, { title: 'Bottom sheet', h: 90 }) }));
    y += 30;
    area.setContentHeight(y + 4);
  }

  /** The v4 "Mosaic & Parchment" components (src/ui/mosaic/): a screen frame with a top bar, every component in its states, the tab bar at the bottom. */
  private mosaic(p: Phaser.GameObjects.Container): void {
    const { VW, VH } = this.m;
    const frame = new ScreenFrame(this, VW, VH, { tabBar: TAB_H, y: 46 });
    p.add(frame);
    const bar = new TopBar(this, frame.topBar, { title: 'Pixelarrow', back: this.inGameBack ? () => toast(this, 'Back') : undefined, actions: [{ icon: 'gear', label: 'Settings', onClick: () => toast(this, 'Settings'), badge: 2 }] });
    p.add(bar);
    const c0 = frame.content;
    const area = new ScrollArea(this, p, c0.x + 4, c0.y + 3, c0.w - 8, c0.h - 3, this.m.S);
    this.cleanup.push(() => area.destroy());
    const c = area.content;
    const w = c0.w - 8 - 4;
    const G = 4;
    let y = 2;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => (c.add(o), o);
    add(new SectionTitle(this, 0, y, w, 'Campaign Hub'));
    y += SECTION_TITLE_H + 4;
    const prof = add(new ProfileCard(this, 0, y, w, { portrait: 'ui_portrait_leader', name: 'Strategos Epameinon', subtitle: 'Day 1 on the march', stats: [{ icon: 'coin', text: '240 Gold', right: { icon: 'trophy', text: '0 Trophies' } }, { icon: 'people', text: 'Warband 9 Men' }] }));
    y += prof.h + G;
    const quest = add(new QuestCard(this, 0, y, w, { title: 'First steps (2 of 4)', total: 4, done: 2, next: 'Finish the tutorial' }));
    y += quest.h + G;
    add(new FrescoBanner(this, 0, y, w, Math.round(w / 2.4), { image: 'ui_banner_campaign', label: 'Banner', onClick: () => toast(this, 'Banner') }));
    y += Math.round(w / 2.4) + G + 2;
    add(new MButton(this, 0, y, w, 30, { label: 'Continue the march', variant: 'primaryHero', onClick: () => toast(this, 'March', 'good') }));
    y += 30 + G + 2;
    const tw = Math.floor((w - 2 * G) / 3);
    const camp = new StoneTile(this, 2 * (tw + G), y, w - 2 * (tw + G), tw, { icon: 'tent', label: 'Camp', disabled: 'Pitch camp on the map' });
    add(new StoneTile(this, 0, y, tw, tw, { icon: 'helmet', label: 'Army', badge: '!', onClick: () => toast(this, 'Army') }));
    add(new StoneTile(this, tw + G, y, tw, tw, { icon: 'chest', label: 'Stash', variant: 'bronze', onClick: () => toast(this, 'Stash') }));
    add(camp);
    y += camp.totalH + G + 4;
    add(new SectionTitle(this, 0, y, w, 'Buttons', { size: 8 }));
    y += SECTION_TITLE_H + 2;
    const bw = Math.floor((w - G) / 2);
    add(new MButton(this, 0, y, bw, 24, { label: 'Fight', icon: 'swords', variant: 'primary', onClick: () => toast(this, 'Fight') }));
    add(new MButton(this, bw + G, y, w - bw - G, 24, { label: 'Collect', icon: 'coin', variant: 'secondary', onClick: () => toast(this, 'Collect') }));
    y += 24 + G;
    add(new MButton(this, 0, y, bw, 24, { label: 'Back', variant: 'neutral', onClick: () => toast(this, 'Back') }));
    add(new MButton(this, bw + G, y, w - bw - G, 24, { label: 'Garrison', icon: 'helmet', variant: 'disabled', disabledReason: 'Needs a settlement' }));
    y += 24 + G;
    add(new MButton(this, 0, y, bw, 24, { label: '250 Stars', icon: 'tgstar', variant: 'purchase', onClick: () => toast(this, 'Pay') }));
    add(new MButton(this, bw + G, y, w - bw - G, 24, { label: 'Army with a very long label', variant: 'primary', badge: 3, onClick: () => toast(this, 'Long') }));
    y += 24 + G + 4;
    add(new SectionTitle(this, 0, y, w, 'Tiles and chips', { size: 8 }));
    y += SECTION_TITLE_H + 2;
    add(new StoneTile(this, 0, y, tw, tw, { icon: 'swords', label: 'Duels', variant: 'terracotta', onClick: () => toast(this, 'Duels') }));
    add(new StoneTile(this, tw + G, y, tw, tw, { icon: 'map', label: 'World', variant: 'glaze', onClick: () => toast(this, 'World') }));
    add(new StoneTile(this, 2 * (tw + G), y, w - 2 * (tw + G), tw, { icon: 'shield', label: 'Garrison settlement', disabled: 'Locked until day 3' }));
    y += tw + 20;
    const stoneChips = [new MChip(this, 0, y, { icon: 'laurel', value: 640, surface: 'stone' }), new MChip(this, 0, y, { icon: 'coin', value: '1.2K', surface: 'stone', onClick: () => toast(this, 'Gold') })];
    let cx = 0;
    stoneChips.forEach((ch) => {
      ch.x = cx;
      cx += ch.w + G;
      add(ch);
    });
    y += 22 + G;
    cx = 0;
    for (const [icon, v] of [['coin', '240'], ['trophy', '3'], ['people', '9 men']] as const) {
      const ch = add(new MChip(this, cx, y, { icon, value: v }));
      cx += ch.w + G;
    }
    y += 18 + G + 4;
    add(new SectionTitle(this, 0, y, w, 'Switches and rows', { size: 8 }));
    y += SECTION_TITLE_H + 2;
    add(new SegmentedSwitch(this, 0, y, w, { options: [{ id: 'l', label: 'Ladder', icon: 'ladder' }, { id: 'a', label: 'Arena', icon: 'arena' }], selected: 'l', onChange: (id) => toast(this, id) }));
    y += SWITCH_H + G;
    add(new SegmentedSwitch(this, 0, y, w, { options: [{ id: 'a', label: 'Gear' }, { id: 'b', label: 'Perks' }, { id: 'c', label: 'Skills' }], selected: 'b', onChange: (id) => toast(this, id) }));
    y += SWITCH_H + G + 2;
    for (const o of [
      { icon: 'helmet', title: 'Next: Floor 5', subtitle: 'Team 43 pts, cap 76', value: '+80', onClick: () => toast(this, 'Row') },
      { icon: 'people', title: 'Selected row', subtitle: 'The one you picked', selected: true, badge: 2, onClick: () => toast(this, 'Row') },
      { icon: 'lock', title: 'Chapter 2', subtitle: 'Clear floor 10 to open', disabled: 'Clear floor 10 to open' },
      { title: 'A row with a very long title that cannot fit on one line', value: '12', onClick: () => toast(this, 'Row') },
    ] as const) {
      add(new ParchmentRow(this, 0, y, w, { ...o }));
      y += ROW_H + G;
    }
    const sel = add(new ParchmentCard(this, 0, y, w, 24, { selected: true }));
    sel.add(addText(this, w / 2, 8, 'Selected parchment card', 'pInk', 0.5, w - 8));
    y += 24 + G;
    const panel = new BottomPanel(this, VW, 0, {
      title: 'Helvian Pastures, Tier 1',
      w,
      bodyH: 34,
      animate: false,
      actions: [{ label: 'Collect', icon: 'coin', variant: 'secondary', onClick: () => toast(this, 'Collect') }, { label: 'Garrison', variant: 'disabled', disabledReason: 'Needs a settlement' }, { label: 'March 9m', variant: 'primary', onClick: () => toast(this, 'March') }],
    });
    panel.x = 0;
    panel.y = y;
    c.add(panel);
    const lines = ['Yours', 'Per hour: gold +2, food +6', 'Waiting: Gold +12, Food +6'];
    lines.forEach((l, i) => panel.add(addText(this, panel.area.x, panel.area.y + i * 11, l, i === 2 ? 'pGood' : 'pInk', 0, panel.area.w)));
    y += panel.h + G;
    area.setContentHeight(y + 4);
    const tabs = new TabBar(this, VW, VH, { active: 'campaign', badges: { duels: 3 }, onSelect: (id: TabId) => (tabs.select(id), toast(this, id)) });
    p.add(tabs);
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
      new CountUp(this, 2 * (tw + SIZE.gap), y, w - 2 * (tw + SIZE.gap), 44, { icon: 'xp', label: 'Experience', value: 1250 }),
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
