import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, addIcon, addPanel, addText } from '../ui/kit';
import { ScrollList, Tabs, addEmptyState, confirmDialog, firstTimeHint, toast } from '../ui/widgets';
import { uiId } from '../ui/layout';
import { ellipsize } from '../ui/textfit';
import { SIZE, COLOR, STRAT } from '../ui/theme';
import { CommandStrip, SituationBar, type SitNumber } from '../ui/strategos';
import { ensureFonts, FONT_RED_LIGHT } from '../ui/fonts';
import {
  DragDrop, ROMAN, Stage, StashGrid, addChip, addGroupBadge, addMountTile, addSlotTile, addStars, addTabBadge, className, defaultStashState,
  groupName, itemName, openItemCard, roleColor, uiBoundsOf, type StashState,
} from '../ui/sheet';
import { addPortrait } from '../ui/sprites';
import { dollFromHero } from '../art/paperdoll';
import { state } from '../state';
import { scrapValue } from '../game/campaign';
import { itemDef, itemValue, SLOTS, type Item, type Slot } from '../data/items';
import { MAX_ARMY, type Hero } from '../data/units';
import { perkSlots } from '../data/perks';
import { heroClass } from '../sim/stats';
import { P } from '../art/palette';
import { haptic, hapticNotify } from '../platform/telegram';
import { addSyncBadge } from '../ui/online';
import { uiCoin } from '../audio/hooks';
import { cycle, hasPending, heroStars, powerRating, queryRoster, ROSTER_FILTERS, ROSTER_SORTS, type RosterFilter, type RosterSort } from '../game/gear';
import { t, type TKey } from '../i18n';

export { RARITY_COLOR } from '../ui/theme';

interface ArmyData {
  heroId?: string;
  /** Scene to return to ('World' by default, or 'Settlement' with its id). */
  from?: string;
  id?: number;
  tab?: 'roster' | 'stash';
}

/**
 * The army: the selected hero on a small stage with his slots (drop targets),
 * group buttons and identity; then the roster (portraits, level, stars,
 * power, wounds, group badges; sort and filter) or the stash grid (filters,
 * compare, equip by tap or drag and drop, repair, sell in towns).
 */
export class ArmyScene extends BaseScene {
  private heroId = '';
  private tab: 'roster' | 'stash' = 'roster';
  private back: ArmyData = {};
  private head!: Phaser.GameObjects.Container;
  private body!: Phaser.GameObjects.Container;
  private tabs: Tabs | null = null;
  private list: ScrollList | null = null;
  private stash: StashGrid | null = null;
  private stashState: StashState = defaultStashState();
  private sort: RosterSort = 'power';
  private filter: RosterFilter = 'all';
  private roster: Hero[] = [];
  private drag!: DragDrop;
  private slotObjs = new Map<Slot, Phaser.GameObjects.GameObject>();
  private bodyTop = 0;
  private sit!: SituationBar;
  private strip!: CommandStrip;

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
    this.screen({ back: () => this.goBack() });
    const { VW, VH } = this.m;
    this.ui.add(this.add.rectangle(0, 0, VW, VH, P.bg).setOrigin(0, 0));
    // the situation bar: how the army fares, numbers with words; the command strip at the bottom
    this.sit = new SituationBar(this, VW, { sentence: '', compact: VH < STRAT.compactVH, id: 'army.situation' });
    this.ui.add(this.sit);
    addSyncBadge(this, this.ui, VW - 16, 4);
    this.strip = new CommandStrip(this, VW, VH, {});
    this.head = this.add.container(0, 0);
    this.body = this.add.container(0, 0);
    this.ui.add([this.head, this.body]);
    this.drag = new DragDrop(this);
    this.ui.add(this.strip);
    this.events.once('shutdown', () => this.clearBody());
    this.refresh();
    firstTimeHint(this, 'army', t('stash.dragHint'));
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
    this.refreshSituation();
    this.buildFoot();
    this.buildHead();
    this.buildBody();
  }

  /** The sentence: men, wounds, points to spend; on the stash tab what the stash holds. */
  private refreshSituation(): void {
    const c = state.campaign.data;
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
    const nums: SitNumber[] = [
      { icon: 'people', value: `${c.heroes.length}`, word: t('strat.menWord', { n: c.heroes.length }), tip: t('menu.tip.army') },
      { icon: 'coin', value: `${c.gold}`, word: t('strat.gold'), tip: t('menu.tip.gold') },
    ];
    if (hurt.length) nums.splice(1, 0, { icon: 'cross', value: `${hurt.length}`, word: t('strat.hurtWord', { n: hurt.length }), font: 'red' });
    this.sit.setSentence(parts.join(' '), pend.length > 0 && this.tab !== 'stash');
    this.sit.setNumbers(nums);
  }

  /** The command strip: back to the map / town, the sheet (points to spend lead there), the group on short screens, dismiss. */
  private buildFoot(): void {
    const c = state.campaign.data;
    const h = this.hero();
    const pend = h ? hasPending(h, perkSlots) : false;
    const backLabel = this.back.from === 'Settlement' ? t('army.town') : this.back.from === 'Camp' ? t('army.camp') : t('army.map');
    this.strip.set({
      left: { label: backLabel, icon: 'map', id: 'army.back', onClick: () => this.goBack() },
      main: { label: t('army.sheet'), icon: 'star', badge: pend ? '!' : 0, tip: pend ? `${t('army.sheetTip')} ${t('army.pending')}.` : t('army.sheetTip'), id: 'army.sheet', off: h ? undefined : t('army.noHeroes'), onClick: () => this.openHero() },
      extra: this.compact && h ? { label: ROMAN[h.group], tip: `${t('army.group')}: ${groupName(h.group)}. ${t('army.groupTip')}`, id: 'army.group', onClick: () => this.setGroup((h.group + 1) % 4) } : null,
      right: { label: t('army.dismiss'), icon: 'skull', destructive: true, id: 'army.dismiss', off: c.heroes.length > 1 ? undefined : t('army.dismissLast'), onClick: () => this.dismiss() },
    });
  }

  // ------------------------------------------------------------------ the selected hero

  private buildHead(): void {
    this.head.removeAll(true);
    this.slotObjs.clear();
    const L = this.head;
    const { VW } = this.m;
    const h = this.hero();
    const compact = this.compact;
    const top = this.sit.bottom;
    const y0 = top + 2;
    if (!h) {
      L.add(addPanel(this, 0, top, VW, 60, 'dark'));
      L.add(addText(this, VW / 2, y0 + 30, t('army.noHeroes'), 'title', 0.5));
      this.bodyTop = top + 62;
      return;
    }
    const cls = heroClass(h);
    let slotY: number;
    let ss: number;
    if (!compact) {
      const sw = 58;
      const sh = 80;
      this.head.add(new Stage(this, 4, y0, sw, sh, h, { scale: 1 }));
      if (h.wound > 0) addChip(this, L, 6, y0 + sh - 14, t('hero.wounded', { h: Math.ceil(h.wound) }), COLOR.bad, sw - 4);
      const tx = 4 + sw + 5;
      const tw = VW - tx - 5;
      // name and stars, class, level, role and power
      L.add(addText(this, tx, y0 + 1, ellipsize(h.name, tw - 44), 'title'));
      addStars(this, L, VW - 5 - 39, y0 + 1, heroStars(h));
      L.add(addText(this, tx, y0 + 11, ellipsize(className(h), tw), 'gold'));
      const lvW = addChip(this, L, tx, y0 + 21, t('hero.level', { n: h.level }), 0x8c2f25, 40);
      const pw = addText(this, VW - 5, y0 + 23, t('hero.power', { n: powerRating(h) }), 'title', 1);
      L.add(pw);
      const roomRole = VW - 5 - pw.width - 4 - (tx + lvW + 3);
      if (roomRole > 30) addChip(this, L, tx + lvW + 3, y0 + 21, t(`role.${cls.role}` as TKey), roleColor(cls.role), roomRole);
      // group buttons with the group's name
      const gy = y0 + 36;
      const gw = Math.max(22, Math.min(30, Math.floor((tw - 3 * SIZE.gap) / 4)));
      ROMAN.forEach((_r, g) => L.add(this.groupButton(tx + g * (gw + SIZE.gap), gy, gw, g, h)));
      const gx = tx + 4 * (gw + SIZE.gap);
      if (VW - 5 - gx > 30) L.add(addText(this, gx + 2, gy + 7, ellipsize(groupName(h.group), VW - 5 - gx - 2), 'title'));
      ss = 26;
      slotY = y0 + sh + 4;
    } else {
      // short screens: portrait, name, class and power on two lines; the group button sits in the bottom bar
      L.add(addPortrait(this, dollFromHero(h), 4, y0));
      const tx = 31;
      const tw = VW - tx - 5;
      L.add(addText(this, tx, y0 + 1, ellipsize(h.name, tw - 42), 'title'));
      addStars(this, L, VW - 5 - 39, y0 + 1, heroStars(h));
      const lvW = addChip(this, L, tx, y0 + 12, t('hero.level', { n: h.level }), 0x8c2f25, 40);
      const pw = addText(this, VW - 5, y0 + 14, `${powerRating(h)}`, 'title', 1);
      L.add(pw);
      const sub = h.wound > 0 ? t('hero.wounded', { h: Math.ceil(h.wound) }) : className(h);
      L.add(addText(this, tx + lvW + 3, y0 + 14, ellipsize(sub, VW - 5 - pw.width - 4 - (tx + lvW + 3)), h.wound > 0 ? FONT_RED_LIGHT : 'gold'));
      ss = 22;
      slotY = y0 + 27;
    }
    // the slots: tap for the item card, drop stash items on them
    const n = SLOTS.length + (cls.mount && !compact ? 1 : 0);
    ss = Math.min(ss, Math.floor((VW - 8 - (n - 1) * SIZE.gap) / n));
    const step = Math.min(ss + 8, Math.floor((VW - 8 - ss) / (n - 1)));
    const x0 = Math.round((VW - (ss + step * (n - 1))) / 2);
    SLOTS.forEach((s, i) => {
      const o = addSlotTile(this, L, x0 + i * step, slotY, s, h.equip[s], { size: ss, onTap: () => this.tapSlot(s) });
      this.slotObjs.set(s, o);
    });
    if (cls.mount && !compact) addMountTile(this, L, x0 + SLOTS.length * step, slotY, h, ss);
    this.bodyTop = slotY + ss + 5;
    // the dark panel down to the slots
    L.addAt(addPanel(this, 0, top, VW, this.bodyTop - top - 1, 'dark'), 0);
  }

  private groupButton(x: number, y: number, w: number, g: number, h: Hero): Button {
    const r = ROMAN[g];
    return new Button(this, x, y, w, 22, {
      label: r,
      style: h.group === g ? 'buttonSel' : 'button',
      tip: `${t('army.group')} ${r}: ${groupName(g)}. ${t('army.groupTip')}`,
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
      this.buildBody();
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
    this.body.removeAll(true);
  }

  private buildBody(): void {
    const keep = this.tab === 'roster' ? this.list?.area.scrollY ?? 0 : 0;
    this.clearBody();
    const { VW } = this.m;
    const c = state.campaign.data;
    const y = this.bodyTop;
    this.tabs = new Tabs(this, 4, y, VW - 8, [t('army.roster', { n: c.heroes.length, max: MAX_ARMY }), t('army.stash', { n: c.stash.length })], {
      selected: this.tab === 'roster' ? 0 : 1,
      ids: ['army.tab.roster', 'army.tab.stash'],
      onChange: (i) => {
        this.tab = i === 0 ? 'roster' : 'stash';
        this.refreshSituation();
        this.buildBody();
      },
    });
    const foot = this.strip.top;
    this.body.add(addPanel(this, 0, y + SIZE.tabH - 2, VW, foot - (y + SIZE.tabH - 2), 'parch'));
    this.body.add(this.tabs);
    const pend = c.heroes.filter((h) => hasPending(h, perkSlots)).length;
    if (pend) addTabBadge(this, this.body, 4, y, VW - 8, 2, 0, pend);
    const top = y + SIZE.tabH + 4;
    const bottom = foot - 3;
    if (this.tab === 'roster') this.buildRoster(top, bottom, keep);
    else this.buildStash(top, bottom);
  }

  private buildRoster(top: number, bottom: number, keep: number): void {
    const { VW } = this.m;
    const w = VW - 8;
    const bw = Math.floor((w - SIZE.gap) / 2);
    const fLabel = this.filter === 'all' ? t('army.filter.all') : t(`army.filter.${this.filter}` as TKey);
    this.body.add(new Button(this, 4, top, bw, SIZE.btnH, { label: fLabel, icon: 'eye', tip: t('army.filterTip'), id: 'army.filter', onClick: () => ((this.filter = cycle(ROSTER_FILTERS, this.filter)), this.buildBody()) }));
    this.body.add(new Button(this, 4 + bw + SIZE.gap, top, w - bw - SIZE.gap, SIZE.btnH, { label: t(`army.sort.${this.sort}` as TKey), icon: 'flag', tip: t('army.sortTip'), id: 'army.sort', onClick: () => ((this.sort = cycle(ROSTER_SORTS, this.sort)), this.buildBody()) }));
    const ly = top + SIZE.btnH + SIZE.gap;
    this.roster = queryRoster(state.campaign.data.heroes, this.sort, this.filter);
    if (!this.roster.length) {
      this.body.add(addEmptyState(this, 4, ly, w, bottom - ly, { icon: 'people', title: t('army.noHeroes'), hint: t('army.noHeroesHint'), action: { label: t('army.filter.all'), onClick: () => ((this.filter = 'all'), this.buildBody()) } }));
      return;
    }
    this.list = new ScrollList(this, this.body, 4, ly, w, bottom - ly, {
      count: this.roster.length,
      rowH: 30,
      render: (i, row, rw, rh) => this.rosterRow(this.roster[i], row, rw, rh),
      onTap: (i) => this.select(this.roster[i].id),
      id: (i) => `roster:${i}`,
    });
    this.list.area.setScroll(keep);
  }

  private rosterRow(h: Hero, row: Phaser.GameObjects.Container, w: number, rh: number): void {
    const sel = h.id === this.heroId;
    row.add(addPanel(this, 0, 0, w, rh, sel ? 'buttonSel' : 'button'));
    // portrait in a frame tinted by role
    const cls = heroClass(h);
    const ps = rh - 4;
    const fr = this.add.graphics();
    fr.fillStyle(0x1d140f, 1);
    fr.fillRect(1, 1, ps + 2, ps + 2);
    fr.fillStyle(roleColor(cls.role), 1);
    fr.fillRect(2, 2, ps, ps);
    row.add(fr);
    row.add(addPortrait(this, dollFromHero(h), 2, 2, { size: ps }));
    if (h.wound > 0) {
      const wg = this.add.graphics();
      wg.fillStyle(0x000000, 0.45);
      wg.fillRect(2, 2, ps, ps);
      row.add(wg);
      row.add(addIcon(this, 2 + (ps - 12) / 2, 2 + (ps - 12) / 2, 'cross', 'L'));
    }
    const light = sel;
    const x = ps + 7;
    const right = w - 4;
    // group badge on the right, power under it
    addGroupBadge(this, row, right - 12, 3, h.group);
    const pw = addText(this, right, 18, `${powerRating(h)}`, light ? 'light' : 'ink', 1);
    row.add(pw);
    const pend = hasPending(h, perkSlots);
    const nameW = right - 16 - x - (pend ? 12 : 0);
    const name = addText(this, x, 4, ellipsize(h.name, nameW), light ? 'light' : 'ink');
    row.add(name);
    if (pend) addChip(this, row, x + name.width + 3, 3, '!', 0xd8a840);
    const sub = h.wound > 0 ? t('hero.wounded', { h: Math.ceil(h.wound) }) : `${t('hero.level', { n: h.level })} ${cls.short}`;
    const subT = addText(this, x, 17, ellipsize(sub, right - pw.width - 4 - x - 42), light ? 'light' : h.wound > 0 ? 'red' : 'dim');
    row.add(subT);
    if (h.wound <= 0) addStars(this, row, Math.min(x + subT.width + 4, right - pw.width - 4 - 39), 19, heroStars(h));
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

  private buildStash(top: number, bottom: number): void {
    const { VW } = this.m;
    this.stash = new StashGrid(this, this.body, 4, top, VW - 8, bottom - top, {
      items: () => state.campaign.data.stash,
      state: this.stashState,
      hero: () => this.hero(),
      drag: this.drag,
      onTap: (it) => this.openStashItem(it),
    });
    for (const [slot, o] of this.slotObjs) {
      this.drag.targets.push({
        rect: () => uiBoundsOf(this, o as unknown as Phaser.GameObjects.Components.Transform & { w?: number; h?: number; width?: number; height?: number }),
        accepts: (it) => itemDef(it.def).slot === slot,
        drop: (it) => this.equip(it),
      });
    }
  }

  openStashItem(it: Item): void {
    const h = this.hero();
    const camp = state.campaign;
    const cost = camp.repairCost(it);
    const actions = [];
    if (this.inTown()) {
      const val = itemValue(it);
      actions.push({
        label: t('stash.sell', { n: val }),
        icon: 'coin',
        id: 'stash.sell',
        onClick: () => confirmDialog(this, { title: t('stash.sellTitle', { name: itemName(it) }), body: t('stash.sellBody', { n: val }), ok: t('stash.sell', { n: val }), cancel: t('common.cancel'), onOk: () => this.sell(it, val) }),
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
    if (h) actions.push({ label: t('stash.equip'), icon: 'check', variant: 'primary' as const, id: 'stash.equip', onClick: () => this.equip(it) });
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
    state.campaign.sell(it.uid, val);
    haptic('medium');
    uiCoin();
    toast(this, t('stash.sold', { n: val }), 'good');
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
