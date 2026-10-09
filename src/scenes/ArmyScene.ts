import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { ScrollArea, addIcon, tappable } from '../ui/kit';
import { ScrollList, addScrollHint, confirmDialog, firstTimeHint, toast } from '../ui/widgets';
import { uiId } from '../ui/layout';
import { wrapText } from '../ui/textfit';
import { ensureFonts } from '../ui/fonts';
import {
  equipRefusal,
  DragDrop, ROMAN, Stage, addGroupBadge, addStars, className, defaultStashState,
  groupName, itemName, openItemCard, saleText, roleColor, roleName, uiBoundsOf, type StashState,
} from '../ui/sheet';
import { addPortrait } from '../ui/sprites';
import { dollFromHero } from '../art/paperdoll';
import { state } from '../state';
import { scrapValue } from '../game/campaign';
import { itemDef, SLOTS, type Item, type Slot } from '../data/items';
import { MAX_ARMY, type Hero } from '../data/units';
import { perkSlots } from '../data/perks';
import { heroClass } from '../sim/stats';
import { haptic, hapticNotify } from '../platform/telegram';
import { addSyncBadge } from '../ui/online';
import { uiCoin } from '../audio/hooks';
import { ACCENT, MOSAIC } from '../ui/tokens';
import { cycle, hasPending, heroStars, powerRating, queryRoster, ROSTER_FILTERS, ROSTER_SORTS, type RosterFilter, type RosterSort } from '../game/gear';
import {
  MActionBar, GAP, GearSlot, MBadge, MButton, MChip, MStashGrid, SegmentedSwitch, MIconButton, SWITCH_H, TAP,
  addNiche, slotGrid, addParchmentEmpty, addSubShell, addPill, addSwitchBadge, type FramedSubShell, addPortraitWell, addRowFace, mosaicImage, mountSlot, mtext, type Box, type MButtonOpts,
} from '../ui/mosaic';
import { t, type TKey } from '../i18n';

export { RARITY_COLOR } from '../ui/theme';

interface ArmyData {
  heroId?: string;
  /** Scene to return to ('World' by default, or 'Settlement' with its id). */
  from?: string;
  id?: number;
  tab?: 'roster' | 'stash';
}

const LEVEL_PILL = MOSAIC.bronze;

/**
 * The army: the selected hero on a parchment card (his figure in a stone niche,
 * group buttons and identity, his slots as drop targets); then the roster
 * (portraits, level, rank, power, wounds, group badges; sort and filter) or the
 * stash grid (filters, compare, equip by tap or drag and drop, repair, sell in
 * towns).
 */
export class ArmyScene extends BaseScene {
  private heroId = '';
  private tab: 'roster' | 'stash' = 'roster';
  private back: ArmyData = {};
  private head!: Phaser.GameObjects.Container;
  private body!: Phaser.GameObjects.Container;
  private bar: MActionBar | null = null;
  private shell!: FramedSubShell;
  private list: ScrollList | null = null;
  private stash: MStashGrid | null = null;
  private stashState: StashState = defaultStashState();
  private sort: RosterSort = 'power';
  private filter: RosterFilter = 'all';
  private roster: Hero[] = [];
  private drag!: DragDrop;
  private slotObjs = new Map<Slot, Phaser.GameObjects.GameObject>();
  private box!: Box;
  private bodyTop = 0;
  private bodyBottom = 0;
  /** Where the columns start and how wide they are (UI px; local to the scroll area in scroll mode). */
  private ox = 0;
  private oy = 0;
  private cw = 0;
  /** A short screen: everything under the top bar scrolls as one page. */
  private area: ScrollArea | null = null;

  constructor() {
    super('Army');
  }

  create(data: ArmyData): void {
    this.initUi();
    ensureFonts(this);
    const c = state.campaign;
    this.heroId = data?.heroId && c.hero(data.heroId) ? data.heroId : c.data.heroes[0]?.id ?? '';
    this.tab = data?.tab ?? 'roster';
    this.back = { from: data?.from ?? 'World', id: data?.id };
    this.list = null;
    this.stash = null;
    this.bar = null;
    this.screen({ back: () => this.goBack() });
    const shell = addSubShell(this, { title: t('hub.army'), back: () => this.goBack(), id: 'army.topbar', scroll: false });
    this.box = shell.content;
    addSyncBadge(this, this.ui, shell.frame.topBar.x + shell.frame.topBar.w - 17 - (TAP + GAP), shell.frame.topBar.y + 6);
    this.shell = shell;
    this.drag = new DragDrop(this);
    this.events.once('shutdown', () => this.clearBody());
    this.refresh();
    firstTimeHint(this, 'army', t('stash.dragHint'));
    // once after the class-limits update: gear some heroes' classes may no longer use went to the stash
    if (c.data.gearMoved?.length) {
      toast(this, t('army.gearMoved', { names: c.data.gearMoved.join(', ') }), 'info', 5000);
      delete c.data.gearMoved;
      void state.save();
    }
  }

  private hero(): Hero | undefined {
    return state.campaign.hero(this.heroId);
  }

  private get compact(): boolean {
    return this.m.VH < 300;
  }

  private goBack(): void {
    void state.save();
    if (this.back.from === 'Settlement') this.scene.start('Settlement', { id: this.back.id });
    else if (this.back.from === 'Camp') this.scene.start('Camp', { mode: 'field' });
    else this.scene.start(this.back.from ?? 'World');
  }

  openHero(tab?: string): void {
    this.scene.start('Hero', { heroId: this.heroId, back: { from: this.back.from, id: this.back.id }, tab });
  }

  /** In a town the market buys stash items. */
  private inTown(): boolean {
    if (this.back.from !== 'Settlement' || this.back.id === undefined) return false;
    return state.campaign.world.settlement(this.back.id)?.kind === 'town';
  }

  refresh(): void {
    this.build(false);
    // too little room for the roster or the stash under the hero: the whole page scrolls instead
    if (this.bodyBottom - this.bodyTop < SWITCH_H + 4 + TAP + GAP + 56) this.build(true);
  }

  private build(scroll: boolean): void {
    this.clearBody();
    this.head?.destroy();
    this.body?.destroy();
    this.area?.destroy();
    this.area = null;
    this.slotObjs.clear();
    this.bar?.destroy();
    this.bar = null;
    this.buildFoot();
    if (scroll) {
      const top = this.box.y + 4;
      this.area = new ScrollArea(this, this.ui, this.box.x + 4, top, this.box.w - 8, this.bodyBottom - top, this.m.S);
      addScrollHint(this, this.ui, this.area, MOSAIC.parch);
      this.ox = 0;
      this.oy = 0;
      this.cw = this.box.w - 8 - 3;
      this.head = this.add.container(0, 0);
      this.body = this.add.container(0, 0);
      this.area.content.add([this.head, this.body]);
      // the top bar stays on top of what scrolls under it
      this.ui.bringToTop(this.shell.top);
      this.ui.bringToTop(this.bar!);
    } else {
      this.ox = this.box.x + 4;
      this.oy = this.box.y + 4;
      this.cw = this.box.w - 8;
      this.head = this.add.container(0, 0);
      this.body = this.add.container(0, 0);
      this.ui.add([this.head, this.body]);
      this.ui.bringToTop(this.bar!);
    }
    let y = this.oy;
    y = this.buildTip(y);
    y = this.buildHead(y);
    this.bodyTop = y;
    this.buildBody();
  }

  /** The sentence and the numbers: men, gold, wounds; on the stash tab what the stash holds. Returns the y below. */
  private buildTip(y0: number): number {
    const c = state.campaign.data;
    const L = this.head;
    const w = this.cw;
    const x = this.ox;
    const hurt = c.heroes.filter((h) => (h.wound ?? 0) > 0);
    const pend = c.heroes.filter((h) => hasPending(h, perkSlots));
    const parts: string[] = [];
    if (this.tab === 'stash') parts.push(c.stash.length ? t('army.sit.stash', { n: c.stash.length }) : t('army.sit.empty'));
    else {
      // what needs doing first: points to spend, then wounds, then the count
      if (pend.length) parts.push(t('army.sit.pending', { n: pend.length, name: pend[0].name, more: pend.length - 1 }));
      if (hurt.length) parts.push(t('army.sit.hurt', { n: hurt.length }));
      if (!pend.length || !hurt.length) parts.push(t('army.sit.men', { n: c.heroes.length }));
    }
    let y = y0;
    if (!this.compact) {
      const lines = wrapText(parts.join(' '), w - 4, 2, false, 6).lines;
      lines.forEach((l, i) => L.add(mtext(this, x + w / 2, y + i * 8, l, pend.length && this.tab !== 'stash' ? 'pInk' : 'pSec', { size: 6, align: 0.5, box: { owner: this.ui, w: this.m.VW, h: this.m.VH } })));
      y += lines.length * 8 + 3;
    }
    const chips = [
      new MChip(this, 0, 0, { icon: 'people', value: `${c.heroes.length}`, tip: t('menu.tip.army'), id: 'army.chip.men' }),
      new MChip(this, 0, 0, { icon: 'coin', value: `${c.gold}`, tip: t('menu.tip.gold'), id: 'army.chip.gold' }),
    ];
    if (hurt.length) chips.push(new MChip(this, 0, 0, { icon: 'cross', value: `${hurt.length}`, tip: t('army.sit.hurt', { n: hurt.length }), id: 'army.chip.hurt' }));
    const total = chips.reduce((a, k) => a + k.w, 0) + GAP * (chips.length - 1);
    let cx = Math.round(x + (w - total) / 2);
    for (const k of chips) {
      k.x = cx;
      k.y = y;
      L.add(k);
      cx += k.w + GAP;
    }
    return y + 18 + 4;
  }

  /** The action bar: back to the map / town, the sheet (points to spend lead there), dismiss. */
  private buildFoot(): void {
    const c = state.campaign.data;
    const h = this.hero();
    const pend = h ? hasPending(h, perkSlots) : false;
    const backLabel = this.back.from === 'Settlement' ? t('army.town') : this.back.from === 'Camp' ? t('army.camp') : t('army.map');
    const actions: MButtonOpts[] = [
      { label: backLabel, icon: 'map', variant: 'secondary', id: 'army.back', onClick: () => this.goBack() },
      {
        label: t('army.sheet'),
        icon: 'people',
        variant: h ? 'primary' : 'disabled',
        badge: pend ? '!' : 0,
        tip: pend ? `${t('army.sheetTip')} ${t('army.pending')}.` : t('army.sheetTip'),
        disabledReason: t('army.noHeroes'),
        id: 'army.sheet',
        onClick: () => this.openHero(),
      },
      { label: t('army.dismiss'), icon: 'skull', variant: c.heroes.length > 1 ? 'neutral' : 'disabled', disabledReason: t('army.dismissLast'), id: 'army.dismiss', onClick: () => this.dismiss() },
    ];
    this.bar = new MActionBar(this, this.box.w, this.box.y + this.box.h, { surface: 'parchment', x: this.box.x }).set(actions);
    this.ui.add(this.bar);
    this.bodyBottom = this.bar.top - 3;
  }

  // ------------------------------------------------------------------ the selected hero

  /** The selected hero's card; returns the y below it. */
  private buildHead(y0: number): number {
    const h = this.hero();
    const L = this.head;
    const x0 = this.ox;
    const cw = this.cw;
    if (!h) {
      const card = this.add.container(x0, y0);
      card.add(mosaicImage(this, 0, 0, cw, 40, 'parchment'));
      card.add(mtext(this, cw / 2, 15, t('army.noHeroes'), 'rInk', { size: 7.5, align: 0.5, maxW: cw - 8, box: { owner: card, w: cw, h: 40 } }));
      L.add(card);
      return y0 + 44;
    }
    const cls = heroClass(h);
    const compact = this.compact;
    const P = 5;
    const card = this.add.container(x0, y0);
    const n = SLOTS.length + (cls.mount ? 1 : 0);
    const grid = slotGrid(cw - 2 * P, n, 26);
    let slotY: number;
    let ch: number;
    if (!compact) {
      const nw = 56;
      const nh = 72;
      slotY = P + nh + 6;
      ch = slotY + grid.h + P + 1;
      const box = { owner: card, w: cw, h: ch };
      card.add(mosaicImage(this, 0, 0, cw, ch, 'parchment'));
      card.add(new Stage(this, P, P, nw, nh, h, { scale: 1 }));
      addNiche(this, card, P, P, nw, nh);
      if (h.wound > 0) addPill(this, card, P + 2, P + nh - 15, t('hero.wounded', { h: Math.ceil(h.wound) }), ACCENT.dangerFill, nw - 4);
      const tx = P + nw + 7;
      const tw = cw - tx - P;
      card.add(mtext(this, tx, P, h.name, 'rInk', { size: 7.5, maxW: tw - 42, box }));
      addStars(this, card, cw - P - 39, P + 1, heroStars(h), 5, {});
      card.add(mtext(this, tx, P + 11, className(h), 'pSec', { size: 6.5, maxW: tw, box }));
      const lv = addPill(this, card, tx, P + 22, t('hero.level', { n: h.level }), LEVEL_PILL, 40);
      addPill(this, card, tx + lv + 3, P + 22, roleName(cls.role), roleColor(cls.role), tw - lv - 3);
      card.add(mtext(this, tx, P + 37, t('hero.power', { n: powerRating(h) }), 'rInk', { size: 7, maxW: tw, box }));
      // group buttons with the group's name
      const gy = P + 49;
      const gw = Math.max(TAP, Math.min(30, Math.floor((tw - 3 * GAP) / 4)));
      ROMAN.forEach((_r, g) => card.add(this.groupButton(tx + g * (gw + GAP), gy, gw, g, h)));
      const gx = tx + 4 * (gw + GAP);
      if (cw - P - gx > 28) card.add(mtext(this, gx + 1, gy + 8, groupName(h.group), 'pSec', { size: 6, maxW: cw - P - gx - 1, box }));
    } else {
      // short screens: portrait with name, level and power, rank, class; the groups on a row of their own, then the slots
      const ps = 28;
      const block = 46;
      const gy = P + block + 3;
      slotY = gy + TAP + 4;
      ch = slotY + grid.h + P + 1;
      const box = { owner: card, w: cw, h: ch };
      card.add(mosaicImage(this, 0, 0, cw, ch, 'parchment'));
      addPortraitWell(this, card, P, P, ps, roleColor(cls.role));
      card.add(addPortrait(this, dollFromHero(h), P, P, { size: ps }));
      const tx = P + ps + 6;
      const tw = cw - tx - P;
      card.add(mtext(this, tx, P, h.name, 'rInk', { size: 7, maxW: tw, box }));
      const lv = addPill(this, card, tx, P + 12, t('hero.level', { n: h.level }), LEVEL_PILL, 40);
      card.add(mtext(this, tx + lv + 4, P + 13, `${powerRating(h)}`, 'rInk', { size: 7, maxW: tw - lv - 4, box }));
      addStars(this, card, tx, P + 25, heroStars(h), 5, {});
      const sub = h.wound > 0 ? t('hero.wounded', { h: Math.ceil(h.wound) }) : className(h);
      card.add(mtext(this, tx, P + 36, sub, h.wound > 0 ? 'pBad' : 'pSec', { size: 6, maxW: tw, box }));
      const gw = Math.max(TAP, Math.min(30, Math.floor((cw - 2 * P - 3 * GAP) / 4)));
      ROMAN.forEach((_r, g) => card.add(this.groupButton(P + g * (gw + GAP), gy, gw, g, h)));
    }
    // the slots: tap for the item card, drop stash items on them
    const place = (o: Phaser.GameObjects.GameObject & { x: number; y: number }, i: number) => {
      const p = grid.pos(i);
      o.x = P + p.x;
      o.y = slotY + p.y;
    };
    SLOTS.forEach((s, i) => {
      const gs = new GearSlot(this, 0, 0, { slot: s, item: h.equip[s], size: grid.ss, selected: this.tab === 'stash' && this.stashState.slot === s, onTap: () => this.tapSlot(s) });
      place(gs, i);
      card.add(gs);
      this.slotObjs.set(s, gs);
    });
    if (cls.mount) {
      const m = mountSlot(this, 0, 0, h, grid.ss);
      if (m) {
        place(m, SLOTS.length);
        card.add(m);
      }
    }
    L.add(card);
    return y0 + ch + 4;
  }

  private groupButton(x: number, y: number, w: number, g: number, h: Hero): MIconButton {
    const r = ROMAN[g];
    return new MIconButton(this, x, y, w, TAP, {
      text: r,
      variant: h.group === g ? 'secondary' : 'neutral',
      label: `${t('army.group')} ${r}: ${groupName(g)}. ${t('army.groupTip')}`,
      id: `army.group.${g}`,
      onClick: () => this.setGroup(g),
    });
  }

  private setGroup(g: number): void {
    const h = this.hero();
    if (!h || h.group === g) return;
    h.group = g;
    haptic('light');
    toast(this, t('army.groupSet', { name: h.name, group: groupName(g) }), 'good');
    void state.save();
    this.refresh();
  }

  private tapSlot(slot: Slot): void {
    const h = this.hero();
    if (!h) return;
    if (this.tab !== 'stash' || this.stashState.slot !== slot) {
      this.stashState.slot = slot;
      this.tab = 'stash';
      this.refresh();
    }
    const it = h.equip[slot];
    if (!it) return;
    const camp = state.campaign;
    const cost = camp.repairCost(it);
    openItemCard(this, {
      item: it,
      hero: h,
      equipped: true,
      notes: [{ text: t('stash.equippedBy', { name: h.name }) }],
      actions: [
        { label: t('stash.unequip'), icon: 'back', id: 'stash.unequip', onClick: () => this.unequip(slot) },
        cost > 0
          ? { label: t('stash.repair', { n: cost }), icon: 'repair', variant: 'primary', id: 'stash.repair', disabled: camp.data.gold < cost ? t('stash.noGold') : undefined, onClick: () => this.repair(it) }
          : { label: t('stash.full'), icon: 'check', id: 'stash.full', disabled: t('stash.full'), onClick: () => {} },
      ],
    });
  }

  // ------------------------------------------------------------------ roster / stash

  private clearBody(): void {
    this.list?.destroy();
    this.list = null;
    this.stash?.destroy();
    this.stash = null;
    this.drag.targets = [];
    this.drag.cancel();
    this.body?.removeAll(true);
  }

  private buildBody(): void {
    const keep = this.tab === 'roster' ? this.list?.area.scrollY ?? 0 : 0;
    this.clearBody();
    const c = state.campaign.data;
    const x = this.ox;
    const w = this.cw;
    const y = this.bodyTop;
    const sw = new SegmentedSwitch(this, x, y, w, {
      options: [
        { id: 'roster', label: t('army.roster', { n: c.heroes.length, max: MAX_ARMY }) },
        { id: 'stash', label: t('army.stash', { n: c.stash.length }) },
      ],
      selected: this.tab,
      onChange: (id) => {
        this.tab = id as 'roster' | 'stash';
        this.refresh();
      },
      id: 'army.tab',
    });
    this.body.add(sw);
    const pend = c.heroes.filter((h) => hasPending(h, perkSlots)).length;
    if (pend) addSwitchBadge(this, this.body, x, y, w, 2, 0, pend);
    const top = y + SWITCH_H + 4;
    // in scroll mode the page is as tall as its content; else the list takes what the action bar leaves
    const bottom = this.area ? -1 : this.bodyBottom;
    const end = this.tab === 'roster' ? this.buildRoster(top, bottom, keep) : this.buildStash(top, bottom);
    this.area?.setContentHeight(end + 4);
  }

  /** The filter row, then the heroes; returns the y below (scroll mode: below the last row). */
  private buildRoster(top: number, bottom: number, keep: number): number {
    const x = this.ox;
    const w = this.cw;
    const bw = Math.floor((w - GAP) / 2);
    const fLabel = this.filter === 'all' ? t('army.filter.all') : t(`army.filter.${this.filter}` as TKey);
    this.body.add(new MButton(this, x, top, bw, TAP, { label: fLabel, icon: 'eye', variant: 'neutral', tip: t('army.filterTip'), id: 'army.filter', onClick: () => ((this.filter = cycle(ROSTER_FILTERS, this.filter)), this.buildBody()) }));
    this.body.add(new MButton(this, x + bw + GAP, top, w - bw - GAP, TAP, { label: t(`army.sort.${this.sort}` as TKey), icon: 'flag', variant: 'neutral', tip: t('army.sortTip'), id: 'army.sort', onClick: () => ((this.sort = cycle(ROSTER_SORTS, this.sort)), this.buildBody()) }));
    const ly = top + TAP + GAP;
    this.roster = queryRoster(state.campaign.data.heroes, this.sort, this.filter);
    if (!this.roster.length) {
      const eh = bottom >= 0 ? bottom - ly : 70;
      this.body.add(addParchmentEmpty(this, x, ly, w, eh, { icon: 'people', title: t('army.noHeroes'), hint: t('army.noHeroesHint'), action: { label: t('army.filter.all'), onClick: () => ((this.filter = 'all'), this.buildBody()) } }));
      return ly + eh;
    }
    const rowH = 34;
    if (this.area) {
      // the whole page scrolls: plain rows
      let y = ly;
      this.roster.forEach((h, i) => {
        const row = this.add.container(x, y);
        row.setSize(w, rowH);
        this.rosterRow(h, row, w, rowH);
        row.setInteractive(new Phaser.Geom.Rectangle(w / 2, rowH / 2, w, rowH), Phaser.Geom.Rectangle.Contains);
        tappable(row, this.area, () => this.select(h.id));
        uiId(row, `roster:${i}`);
        this.body.add(row);
        y += rowH + GAP;
      });
      return y;
    }
    this.list = new ScrollList(this, this.body, x, ly, w, bottom - ly, {
      count: this.roster.length,
      rowH,
      render: (i, row, rw, rh) => this.rosterRow(this.roster[i], row, rw, rh),
      onTap: (i) => this.select(this.roster[i].id),
      id: (i) => `roster:${i}`,
      fade: MOSAIC.parch,
    });
    this.list.area.setScroll(keep);
    return bottom;
  }

  private rosterRow(h: Hero, row: Phaser.GameObjects.Container, w: number, rh: number): void {
    const sel = h.id === this.heroId;
    const box = { owner: row, w, h: rh };
    // the selected hero: the lit parchment with a bronze rim (terracotta is the screen's one action, Hero sheet)
    addRowFace(this, row, w, rh, sel);
    // portrait in a frame tinted by role
    const cls = heroClass(h);
    const ps = rh - 8;
    const py = Math.round((rh - ps) / 2);
    addPortraitWell(this, row, 5, py, ps, roleColor(cls.role));
    row.add(addPortrait(this, dollFromHero(h), 5, py, { size: ps }));
    if (h.wound > 0) {
      const wg = this.add.graphics();
      wg.fillStyle(0x000000, 0.5);
      wg.fillRect(5, py, ps, ps);
      row.add(wg);
      row.add(addIcon(this, 5 + (ps - 12) / 2, py + (ps - 12) / 2, 'cross', 'L'));
    }
    const x = ps + 12;
    const right = w - 6;
    // group badge on the right, power under it
    addGroupBadge(this, row, right - 12, 4, h.group);
    const pw = `${powerRating(h)}`;
    const pt = mtext(this, right, 19, pw, 'rInk', { size: 7, align: 1, box });
    row.add(pt);
    const pend = hasPending(h, perkSlots);
    const nameW = right - 16 - x - (pend ? 12 : 0);
    const name = mtext(this, x, 5, h.name, 'rInk', { size: 7, maxW: nameW, box });
    row.add(name);
    if (pend) row.add(new MBadge(this, x + name.width + 8, 8, '!'));
    const sub = h.wound > 0 ? t('hero.wounded', { h: Math.ceil(h.wound) }) : `${t('hero.level', { n: h.level })} ${cls.short}`;
    const subT = mtext(this, x, 19, sub, h.wound > 0 ? 'pBad' : 'pSec', { size: 6, maxW: right - pt.width - 4 - x - 42, box });
    row.add(subT);
    if (h.wound <= 0) addStars(this, row, Math.min(x + subT.width + 4, right - pt.width - 4 - 39), 20, heroStars(h));
    uiId(name, 'roster.name');
  }

  private select(id: string): void {
    if (this.heroId === id) {
      this.openHero();
      return;
    }
    this.heroId = id;
    haptic('light');
    this.refresh();
  }

  private buildStash(top: number, bottom: number): number {
    const inline = !!this.area;
    this.stash = new MStashGrid(this, this.body, this.ox, top, this.cw, inline ? 0 : bottom - top, {
      items: () => state.campaign.data.stash,
      state: this.stashState,
      hero: () => this.hero(),
      drag: this.drag,
      onTap: (it) => this.openStashItem(it),
      inline: this.area ?? undefined,
    });
    for (const [slot, o] of this.slotObjs) {
      this.drag.targets.push({
        rect: () => uiBoundsOf(this, o as unknown as Phaser.GameObjects.Components.Transform & { w?: number; h?: number; width?: number; height?: number }),
        accepts: (it) => itemDef(it.def).slot === slot,
        drop: (it) => this.equip(it),
      });
    }
    return inline ? top + this.stash.height : bottom;
  }

  openStashItem(it: Item): void {
    const h = this.hero();
    const camp = state.campaign;
    const cost = camp.repairCost(it);
    const actions = [];
    if (this.inTown()) {
      const s = saleText(it);
      actions.push({
        label: s.label,
        icon: 'coin',
        id: 'stash.sell',
        onClick: () => confirmDialog(this, { title: s.title, body: s.body, ok: s.label, cancel: t('common.cancel'), onOk: () => this.sell(it, s.value) }),
      });
    }
    if (this.back.from === 'Camp') {
      // in camp: no market, but an item can be broken up for supplies
      const got = scrapValue(it);
      actions.push({
        label: t('cs.scrap', { n: got }),
        icon: 'wood',
        id: 'stash.scrap',
        onClick: () => confirmDialog(this, { title: t('cs.scrapTitle', { name: itemName(it) }), body: t('cs.scrapBody', { n: got }), ok: t('cs.scrap', { n: got }), cancel: t('common.cancel'), destructive: true, onOk: () => this.scrap(it) }),
      });
    }
    if (cost > 0) actions.push({ label: t('stash.repair', { n: cost }), icon: 'repair', id: 'stash.repair', disabled: camp.data.gold < cost ? t('stash.noGold') : undefined, onClick: () => this.repair(it) });
    if (h) actions.push({ label: t('stash.equip'), icon: 'check', variant: 'primary' as const, id: 'stash.equip', disabled: equipRefusal(h, it), onClick: () => this.equip(it) });
    openItemCard(this, { item: it, hero: h, actions, notes: this.inTown() ? [] : [{ text: this.back.from === 'Camp' ? t('cs.scrapHint') : t('stash.sellInTown') }] });
  }

  equip(it: Item): void {
    if (!state.campaign.equip(this.heroId, it.uid)) {
      hapticNotify('error');
      return;
    }
    hapticNotify('success');
    toast(this, t('army.equipped', { name: itemName(it) }), 'good');
    void state.save();
    this.refresh();
  }

  private unequip(slot: Slot): void {
    state.campaign.unequip(this.heroId, slot);
    haptic('light');
    void state.save();
    this.refresh();
  }

  private repair(it: Item): void {
    if (!state.campaign.repair(it)) {
      hapticNotify('error');
      toast(this, t('stash.noGold'), 'bad');
      return;
    }
    hapticNotify('success');
    toast(this, t('stash.repaired'), 'good');
    void state.save();
    this.refresh();
  }

  private scrap(it: Item): void {
    const got = state.campaign.scrap(it.uid);
    if (got < 0) return;
    haptic('medium');
    toast(this, t('cs.scrapped', { name: itemName(it), n: got }), 'good');
    void state.save();
    this.refresh();
  }

  private sell(it: Item, val: number): void {
    const done = saleText(it).done;
    state.campaign.sell(it.uid, val);
    haptic('medium');
    uiCoin();
    toast(this, done, 'good');
    void state.save();
    this.refresh();
  }

  private dismiss(): void {
    const h = this.hero();
    if (!h) return;
    confirmDialog(this, {
      title: t('army.dismissTitle', { name: h.name }),
      body: t('army.dismissBody'),
      ok: t('army.dismiss'),
      cancel: t('common.cancel'),
      destructive: true,
      onOk: () => {
        state.campaign.dismiss(h.id);
        this.heroId = state.campaign.data.heroes[0]?.id ?? '';
        void state.save();
        this.scene.restart({ ...this.back, heroId: this.heroId });
      },
    });
  }
}
