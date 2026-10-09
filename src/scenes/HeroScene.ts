import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { ScrollArea, addIcon, scaleIcon } from '../ui/kit';
import { addScrollHint, confirmDialog, firstTimeHint, openModal, toast } from '../ui/widgets';
import { uiId, uiIgnore } from '../ui/layout';
import { Button } from '../ui/kit';
import { wrapText } from '../ui/textfit';
import { SIZE, COLOR } from '../ui/theme';
import { addMedallion, addSwipe } from '../ui/v3';
import { MOSAIC, RESOURCES } from '../ui/tokens';
import { fadeIn } from '../ui/motion';
import { ensureFonts } from '../ui/fonts';
import {
  equipRefusal,
  DragDrop, Stage, addLegend, frameScrollTexts, addStars, className, defaultStashState, itemName, openItemCard, roleColor, roleName,
  uiBoundsOf, type StashState,
} from '../ui/sheet';
import { campaignHeroes, type HeroSource } from './heroSource';
import { haptic, hapticNotify } from '../platform/telegram';
import { MAX_LEVEL, xpToNext, type Hero } from '../data/units';
import { TRAITS } from '../data/traits';
import { SLOTS, itemDef, type Item, type Slot } from '../data/items';
import {
  ABILITIES, ATTR_IDS, ATTR_MAX, AURAS, PERK_LEVELS, PERKS, RALLY_WILL, TREES, heroTree, perkBlocker, perkSlots,
  type AbilityId, type AttrId, type AuraId, type PerkDef, type PerkId,
} from '../data/perks';
import { computeStats, heroClass } from '../sim/stats';
import { STATS, fmtStat, heroStars, powerRating, previewAttrs, sheetStats } from '../game/gear';
import {
  MActionBar, GAP, GearSlot, MButton, MChip, MStashGrid, PAGER_W, MBar, MPager, SegmentedSwitch, SectionTitle, SECTION_TITLE_H, MIconButton, SWITCH_H, TAP,
  addNiche, slotGrid, addParchmentEmpty, addSubShell, addPill, addSwitchBadge, mosaicImage, mountSlot, mtext, pillWidth, type Box, type MButtonOpts, type FramedSubShell,
} from '../ui/mosaic';
import { t, tOr, type TKey } from '../i18n';

type Tab = 'stats' | 'gear' | 'perks' | 'skills';
const TABS: Tab[] = ['stats', 'gear', 'perks', 'skills'];
const TAB_ICON: Record<Tab, string> = { stats: 'plus', gear: 'shield', perks: 'aura', skills: 'bash' };

interface HeroData {
  heroId?: string;
  back?: Record<string, unknown>;
  tab?: Tab;
  /** Whose heroes (default: the offline campaign's). */
  source?: HeroSource;
}

/**
 * The hero's character sheet (docs/DESIGN_V2.md "Army and hero screen"): the
 * animated figure in his actual gear in a stone niche with the equipment slots
 * around it, class, role, rank, level and power; then four tabs:
 * Stats (attribute points with a live preview of every stat), Gear (the stash
 * with compare and drag and drop), Perks (the class tree) and Skills
 * (abilities and auras with cooldowns).
 */
export class HeroScene extends BaseScene {
  private heroId = '';
  private src: HeroSource = campaignHeroes;
  private from: Record<string, unknown> = {};
  private pending: Record<AttrId, number> = { str: 0, agi: 0, end: 0, wil: 0 };
  private tab: Tab = 'stats';
  private shell!: FramedSubShell;
  private box!: Box;
  private head!: Phaser.GameObjects.Container;
  private page!: Phaser.GameObjects.Container;
  private switcher: SegmentedSwitch | null = null;
  private bar: MActionBar | null = null;
  private areas: { destroy(): void }[] = [];
  private stash: MStashGrid | null = null;
  private stashState: StashState = defaultStashState();
  private drag!: DragDrop;
  private slotRects = new Map<Slot, Phaser.GameObjects.GameObject>();
  private pageTop = 0;
  /** Where the columns start and how wide they are (UI px; local to the page's scroll area in scroll mode). */
  private ox = 0;
  private oy = 0;
  private cw = 0;
  /** A short screen: the whole sheet scrolls as one page. */
  private outer: ScrollArea | null = null;

  constructor() {
    super('Hero');
  }

  /** Showing the campaign's army (not a server-backed one, e.g. the duel army). */
  get campaignArmy(): boolean {
    return this.src === campaignHeroes;
  }

  create(data: HeroData): void {
    this.initUi();
    ensureFonts(this);
    this.src = data?.source ?? campaignHeroes;
    const all = this.src.heroes();
    this.heroId = data?.heroId && all.some((h) => h.id === data.heroId) ? data.heroId : all[0]?.id ?? '';
    // a server-backed source redraws when its answer arrives
    this.src.onChange = () => this.sys.isActive() && this.build();
    this.src.onError = (msg) => {
      if (!this.sys.isActive()) return;
      hapticNotify('error');
      toast(this, msg, 'bad');
    };
    this.from = data?.back ?? {};
    this.tab = data?.tab && TABS.includes(data.tab) ? data.tab : this.tab;
    this.pending = { str: 0, agi: 0, end: 0, wil: 0 };
    this.areas = [];
    this.stash = null;
    this.switcher = null;
    this.bar = null;
    this.outer = null;
    this.screen({ back: () => this.back() });
    this.shell = addSubShell(this, { title: t('hero.title'), back: () => this.back(), id: 'hero.header', scroll: false });
    this.box = this.shell.content;
    this.drag = new DragDrop(this);
    this.events.once('shutdown', () => this.clearPage());
    this.build();
    firstTimeHint(this, 'hero', t('hero.gearHint'));
  }

  private hero(): Hero | undefined {
    return this.src.heroes().find((h) => h.id === this.heroId);
  }

  back(): void {
    this.src.back(this, this.heroId, this.from);
  }

  private cycleHero(d: number): void {
    const hs = this.src.heroes();
    const i = hs.findIndex((h) => h.id === this.heroId);
    this.heroId = hs[(i + d + hs.length) % hs.length].id;
    this.pending = { str: 0, agi: 0, end: 0, wil: 0 };
    haptic('light');
    this.build();
  }

  private spent(): number {
    return ATTR_IDS.reduce((a, k) => a + this.pending[k], 0);
  }

  private get compact(): boolean {
    return this.m.VH < 300;
  }

  // ------------------------------------------------------------------ header: stage, slots, identity

  private build(keepScroll = false): void {
    const keep = keepScroll ? this.outer?.scrollY ?? 0 : 0;
    this.layout(false);
    // too little room for the page under the sheet's head: the whole sheet scrolls instead
    if (this.hero() && this.bottomEdge() - this.pageTop < 100) this.layout(true);
    if (this.outer) this.outer.setScroll(keep);
  }

  private layout(scroll: boolean): void {
    this.clearPage();
    this.head?.destroy();
    this.page?.destroy();
    this.outer?.destroy();
    this.outer = null;
    this.slotRects.clear();
    const h = this.hero();
    const { VH } = this.m;
    const b = this.box;
    // the plaque carries his name
    this.shell.retitle(h ? h.name : t('hero.title'));
    this.refreshBar();
    if (scroll) {
      const top = b.y + 4;
      this.outer = new ScrollArea(this, this.ui, b.x + 4, top, b.w - 8, this.bottomEdge() - top, this.m.S);
      addScrollHint(this, this.ui, this.outer, MOSAIC.parch);
      this.ox = 0;
      this.oy = 0;
      this.cw = b.w - 8 - 3;
      this.head = this.add.container(0, 0);
      this.page = this.add.container(0, 0);
      this.outer.content.add([this.head, this.page]);
      this.ui.bringToTop(this.shell.top);
      if (this.bar) this.ui.bringToTop(this.bar);
    } else {
      this.ox = b.x + 4;
      this.oy = b.y + 4;
      this.cw = b.w - 8;
      this.head = this.add.container(0, 0);
      this.page = this.add.container(0, 0);
      this.ui.add([this.head, this.page]);
      if (this.bar) this.ui.bringToTop(this.bar);
    }
    const L = this.head;
    const x0 = this.ox;
    const cw = this.cw;
    if (!h) return;
    const compact = this.compact;
    const cls = heroClass(h);
    let y = this.oy;
    const all = this.src.heroes();
    const idx = Math.max(0, all.findIndex((x) => x.id === this.heroId));
    const pager = all.length > 1 ? { index: idx, count: all.length, onPrev: () => this.cycleHero(-1), onNext: () => this.cycleHero(1), prevTip: t('hero.prev'), nextTip: t('hero.next') } : null;
    // power at the head of the sheet (and the pager on short screens)
    const power = new MChip(this, 0, 0, { icon: 'power', value: compact && pager ? `${powerRating(h)}` : t('hero.power', { n: powerRating(h) }), tip: t('hero.powerTip'), id: 'hero.power' });
    power.x = compact && pager ? x0 : Math.round(x0 + (cw - power.w) / 2);
    power.y = y;
    L.add(power);
    if (compact && pager) L.add(new MPager(this, x0 + cw - PAGER_W, y - 2, pager));
    y += (compact && pager ? TAP : 18) + 3;
    // hurt: the one thing worth a line of its own (points and perks are badges on their tabs)
    if (h.wound > 0) {
      L.add(addIcon(this, x0 + 2, y - 1, 'heart'));
      L.add(mtext(this, x0 + 16, y + 1, t('hero.woundedTip', { h: Math.ceil(h.wound) }), 'pBad', { size: 6, maxW: cw - 18, box: { owner: this.ui, w: this.m.VW, h: VH } }));
      y += 11;
    }
    let ey: number;
    if (!compact) {
      // the niche between two columns of slots (swipe it for the next hero)
      const ss = 28;
      const stageH = VH >= 400 ? 124 : 112;
      const sgap = Math.floor((stageH - 3 * ss) / 2);
      const sx0 = x0 + ss + 4;
      const sw = cw - 2 * (ss + 4);
      L.add(new Stage(this, sx0, y, sw, stageH, h, { scale: 2 }));
      addNiche(this, L, sx0, y, sw, stageH);
      this.swipeZone(L, sx0, y, sw, stageH);
      (['helmet', 'armor', 'trinket'] as Slot[]).forEach((s, i) => this.slot(L, x0, y + i * (ss + sgap), s, h, ss));
      (['weapon', 'shield'] as Slot[]).forEach((s, i) => this.slot(L, x0 + cw - ss, y + i * (ss + sgap), s, h, ss));
      const m = mountSlot(this, x0 + cw - ss, y + 2 * (ss + sgap), h, ss);
      if (m) L.add(m);
      addPill(this, L, sx0 + 3, y + 3, t('hero.level', { n: h.level }), MOSAIC.bronze, 40);
      addStars(this, L, sx0 + sw - 3 - 39, y + 5, heroStars(h), 5, {});
      // the pager on the niche's foot: ‹ 7 / 9 › (a swipe does the same)
      if (pager) L.add(new MPager(this, Math.round(sx0 + sw / 2 - PAGER_W / 2), y + stageH - TAP - 3, pager));
      ey = y + stageH + 5;
      // class, role, traits
      L.add(mtext(this, x0 + 2, ey, className(h), 'rInk', { size: 8, maxW: cw - 4, box: { owner: this.ui, w: this.m.VW, h: VH } }));
      ey += 12;
      const chipW = addPill(this, L, x0 + 2, ey, roleName(cls.role), roleColor(cls.role), Math.floor(cw / 2));
      const traits = h.traits.map((k) => tOr(`trait.${k}.name`, TRAITS[k].name)).join(', ');
      if (traits) L.add(mtext(this, x0 + 2 + chipW + 4, ey + 2, traits, 'pSec', { size: 6, maxW: cw - 8 - chipW, box: { owner: this.ui, w: this.m.VW, h: VH } }));
      ey += 15;
      const need = xpToNext(h.level);
      const xp = new MBar(this, x0 + 2, ey, cw - 4, { value: h.xp, max: need, h: 5, size: 6, color: RESOURCES.xp.color, label: t('hero.xpTo', { n: h.level + 1 }), right: t('hero.xp', { xp: Math.floor(h.xp), need }) });
      L.add(xp);
      ey += xp.h + 5;
    } else {
      // short screens: a small niche beside the identity, the slots in rows below
      const sw = 50;
      const stageH = 64;
      L.add(new Stage(this, x0, y, sw, stageH, h, { scale: 1 }));
      addNiche(this, L, x0, y, sw, stageH);
      this.swipeZone(L, x0, y, sw, stageH);
      const tx = x0 + sw + 5;
      const tw = x0 + cw - tx;
      const box = { owner: this.ui, w: this.m.VW, h: VH };
      L.add(mtext(this, tx, y, className(h), 'rInk', { size: 7, maxW: tw, box }));
      addPill(this, L, tx, y + 11, roleName(cls.role), roleColor(cls.role), tw);
      const lvW = addPill(this, L, tx, y + 25, t('hero.level', { n: h.level }), MOSAIC.bronze, 40);
      // the rank beside the level when it fits, else under it
      const stars = lvW + 4 + 39 <= tw;
      addStars(this, L, stars ? tx + lvW + 4 : tx, stars ? y + 27 : y + 38, heroStars(h), 5, {});
      const need = xpToNext(h.level);
      L.add(new MBar(this, tx, y + (stars ? 42 : 51), tw, { value: h.xp, max: need, h: 5, color: RESOURCES.xp.color }));
      ey = y + stageH + 4;
      const n = SLOTS.length + (cls.mount ? 1 : 0);
      const grid = slotGrid(cw, n, 24);
      SLOTS.forEach((s, i) => {
        const p = grid.pos(i);
        this.slot(L, x0 + p.x, ey + p.y, s, h, grid.ss);
      });
      if (cls.mount) {
        const p = grid.pos(SLOTS.length);
        const m = mountSlot(this, x0 + p.x, ey + p.y, h, grid.ss);
        if (m) L.add(m);
      }
      ey += grid.h + 4;
    }

    // tabs, badged with what there is to spend
    const perkFree = Math.max(0, perkSlots(h.level) - h.perks.length);
    this.switcher = new SegmentedSwitch(this, x0, ey, cw, {
      options: TABS.map((k) => ({ id: k, label: t(`hero.tab.${k}` as TKey), icon: compact ? TAB_ICON[k] : undefined })),
      selected: this.tab,
      onChange: (id) => this.setTab(id as Tab),
      id: 'hero.tab',
    });
    L.add(this.switcher);
    if (h.points > 0) addSwitchBadge(this, L, x0, ey, cw, 4, 0, h.points);
    if (perkFree > 0) addSwitchBadge(this, L, x0, ey, cw, 4, 2, perkFree);
    this.pageTop = ey + SWITCH_H + 4;
    this.buildPage();
  }

  /** Swipe the stage: the next or the previous hero. */
  private swipeZone(L: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number): void {
    if (this.src.heroes().length < 2) return;
    const z = this.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive();
    uiIgnore(z);
    addSwipe(z, () => this.cycleHero(1), () => this.cycleHero(-1));
    L.add(z);
  }

  /** Bottom edge of the page (the action bar starts there). */
  private pageBottom(): number {
    return this.bottomEdge();
  }

  /** The lowest y the sheet may use (above the action bar) in screen coordinates. */
  private bottomEdge(): number {
    return (this.bar?.top ?? this.box.y + this.box.h + 1) - 3;
  }

  /** The action bar: only while points wait to be confirmed (Confirm is the one terracotta action, Undo beside it), or the source's dismiss. */
  private refreshBar(): void {
    this.bar?.destroy();
    this.bar = null;
    const pend = this.tab === 'stats' && this.spent() > 0;
    const dis = this.src.dismiss;
    let actions: MButtonOpts[] = [];
    if (pend) {
      actions = [
        { label: t('hero.undo'), icon: 'back', variant: 'neutral', id: 'hero.undo', onClick: () => this.resetPoints() },
        { label: t('hero.strip.confirm', { n: this.spent() }), icon: 'check', variant: 'primary', id: 'hero.confirm', onClick: () => this.confirmPoints() },
      ];
    } else if (dis) {
      const why = dis.blocked(this.heroId);
      actions = [{ label: t('duels.dismissOne'), icon: 'bin', variant: why ? 'disabled' : 'neutral', disabledReason: why ?? undefined, id: 'hero.dismiss', onClick: () => this.askDismiss() }];
    }
    if (!actions.length) return;
    this.bar = new MActionBar(this, this.box.w, this.box.y + this.box.h, { surface: 'parchment', x: this.box.x }).set(actions);
    this.ui.add(this.bar);
  }

  /** Dismiss (a source that allows it): confirmed, then back to where the sheet was opened from. */
  private askDismiss(): void {
    const h = this.hero();
    const dis = this.src.dismiss;
    if (!h || !dis) return;
    confirmDialog(this, {
      title: t('duels.dismissConfirm', { name: h.name }),
      body: t('duels.dismissBody'),
      ok: t('duels.dismissOne'),
      cancel: t('common.cancel'),
      destructive: true,
      onOk: () =>
        void dis.run(h.id).then((ok) => {
          if (!ok || !this.sys.isActive()) return;
          toast(this, t('duels.dismissed', { name: h.name }), 'good');
          this.back();
        }),
    });
  }

  private slot(L: Phaser.GameObjects.Container, x: number, y: number, slot: Slot, h: Hero, size: number): void {
    const o = new GearSlot(this, x, y, { slot, item: h.equip[slot], size, selected: this.tab === 'gear' && this.stashState.slot === slot, onTap: () => this.tapSlot(slot) });
    L.add(o);
    this.slotRects.set(slot, o);
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    fadeIn(this, this.page);
    if (this.outer) {
      this.build(true);
      return;
    }
    // the action bar depends on the tab (pending points live on Stats): rebuild the page under it
    this.refreshBar();
    this.buildPage();
  }

  private clearPage(): void {
    for (const a of this.areas) a.destroy();
    this.areas = [];
    this.stash = null;
    this.drag.targets = [];
    this.drag.cancel();
    this.page?.removeAll(true);
  }

  private buildPage(): void {
    this.clearPage();
    const h = this.hero();
    if (!h) return;
    if (this.tab === 'stats') this.buildStats(h);
    else if (this.tab === 'gear') this.buildGear();
    else if (this.tab === 'perks') this.buildPerks(h);
    else this.buildSkills(h);
  }

  private scrollArea(y: number, h: number): ScrollArea {
    const outer = this.outer;
    if (outer) {
      // the sheet scrolls as a whole: the page is plain content under its head
      const content = this.add.container(this.ox, y);
      this.page.add(content);
      const pseudo = {
        content,
        get moved() {
          return outer.moved;
        },
        get scrollY() {
          return outer.scrollY;
        },
        contentHeight: 0,
        viewHeight: h,
        setContentHeight(ch: number) {
          pseudo.contentHeight = ch;
          outer.setContentHeight(y + ch);
        },
        setScroll() {},
        destroy() {},
      };
      return pseudo as unknown as ScrollArea;
    }
    const { S } = this.m;
    const a = new ScrollArea(this, this.page, this.ox, y, this.cw, h, S);
    this.areas.push(a);
    addScrollHint(this, this.page, a, MOSAIC.parch);
    return a;
  }

  // ------------------------------------------------------------------ stats: attributes with a live preview

  private buildStats(h: Hero): void {
    const pend = this.spent() > 0;
    const free = h.points - this.spent();
    const top = this.pageTop;
    const area = this.scrollArea(top, this.pageBottom() - top);
    const c = area.content;
    const cw = this.cw;
    const w = this.outer ? cw : cw - 3;
    let y = 0;
    const box = { owner: c, w: cw, h: 100000 };
    // points header (it may wrap on narrow screens: the rows below start after it)
    const nextPoint = h.level >= MAX_LEVEL ? t('hero.noMorePoints') : t('hero.nextPoint', { n: h.level + 1 });
    const head = wrapText(free > 0 ? t('hero.points', { n: free }) : h.points > 0 ? t('hero.preview') : nextPoint, w, 2, false, 6.5);
    head.lines.forEach((l, i) => c.add(mtext(this, w / 2, y + 1 + i * 9, l, free > 0 ? 'pGood' : 'pSec', { size: 6.5, align: 0.5, box })));
    y += 3 + head.lines.length * 9;
    const next = previewAttrs(h, this.pending);
    ATTR_IDS.forEach((k) => {
      // the short name and value, the name, one line of what it does (the whole text on tap)
      const rh = 28;
      c.add(mosaicImage(this, 0, y, w, rh, 'parchment'));
      c.add(mtext(this, 5, y + 9, t(`attr.${k}.short` as TKey), 'rInk', { size: 8, box }));
      const val = h.attrs[k] + this.pending[k];
      c.add(mtext(this, 44, y + 9, `${val}`, this.pending[k] ? 'pGood' : 'pInk', { size: 8, align: 1, box }));
      // the steppers only while there are points to spend (or pending ones to take back)
      const spendable = h.points > 0;
      const descW = w - 50 - (spendable ? 2 * TAP + GAP + 6 : 4);
      const desc = t(`attr.${k}.desc` as TKey);
      c.add(mtext(this, 50, y + 5, t(`attr.${k}` as TKey), 'pInk', { size: 6.5, maxW: descW, box }));
      c.add(mtext(this, 50, y + 15, desc, 'pSec', { size: 6, maxW: descW, box }));
      addLegend(this, c, 0, y, 50 + descW, rh, `${t(`attr.${k}` as TKey)}: ${desc}`, area, `attr.${k}.info`);
      if (spendable) {
        const by = y + Math.round((rh - TAP) / 2);
        c.add(new MIconButton(this, w - 2 * TAP - GAP - 3, by, TAP, TAP, { text: '-', variant: 'neutral', label: t('hero.lower'), off: this.pending[k] > 0 ? undefined : t('hero.lowerNothing'), id: `attr.${k}.minus`, onClick: () => this.removePoint(k) }));
        const canPlus = free > 0 && val < ATTR_MAX;
        c.add(new MIconButton(this, w - TAP - 3, by, TAP, TAP, { text: '+', variant: 'secondary', label: t('hero.raise'), off: canPlus ? undefined : free > 0 ? t('hero.attrMax', { n: ATTR_MAX }) : t('hero.allSpent'), id: `attr.${k}.plus`, onClick: () => this.addPoint(k) }));
      }
      y += rh + GAP;
    });
    y += 4;
    // every derived stat, previewing the pending points
    const cur = computeStats(h);
    const nxt = computeStats(next);
    for (const id of sheetStats(cur)) {
      const d = STATS[id];
      const fmt = (v: number) => fmtStat(id, v);
      const has = pend && Math.abs(d.get(nxt) - d.get(cur)) > 1e-6;
      const better = has && d.get(nxt) > d.get(cur) !== !!d.lowerIsBetter;
      const sb = new MBar(this, 0, y, w, {
        label: t(`stat.${id}` as TKey),
        right: has ? `${fmt(d.get(cur))} > ${fmt(d.get(nxt))}` : fmt(d.get(cur)),
        rightTone: has ? (better ? 'good' : 'bad') : undefined,
        value: d.get(cur),
        max: d.max,
        color: barColor(id),
        h: 6,
        size: 6.5,
        preview: has ? d.get(nxt) : undefined,
        worse: has && !better,
        tip: t(`stat.${id}.tip` as TKey),
        id: `stat:${t(`stat.${id}` as TKey)}`,
      });
      c.add(sb);
      y += 22 + GAP;
    }
    // record and traits
    y += 4;
    c.add(new SectionTitle(this, 0, y, w, t('hero.record'), { size: 7.5 }));
    y += SECTION_TITLE_H + 2;
    const rec = `${t('hero.kills')} ${h.kills}   ${t('hero.battles')} ${h.battles}`;
    c.add(mtext(this, 2, y, rec, 'pInk', { maxW: w - 4, box }));
    y += 11;
    c.add(mtext(this, 2, y, h.wound > 0 ? t('hero.wounded', { h: Math.ceil(h.wound) }) : t('hero.fit'), h.wound > 0 ? 'pBad' : 'pGood', { box }));
    y += 15;
    c.add(new SectionTitle(this, 0, y, w, t('hero.traits'), { size: 7.5 }));
    y += SECTION_TITLE_H + 2;
    if (!h.traits.length) {
      c.add(mtext(this, 2, y, t('hero.noTraits'), 'pMuted', { maxW: w - 4, box }));
      y += 11;
    }
    for (const k of h.traits) {
      const tr = TRAITS[k];
      c.add(mtext(this, 2, y, tOr(`trait.${k}.name`, tr.name), tr.negative ? 'pBad' : 'pInk', { maxW: w - 4, box }));
      const wr = wrapText(tOr(`trait.${k}.desc`, tr.desc), w - 10, 2, false, 6);
      wr.lines.forEach((l, i) => c.add(mtext(this, 8, y + 10 + i * 8, l, 'pSec', { size: 6, box })));
      y += 10 + wr.lines.length * 8 + 3;
    }
    const rs = this.src.respec;
    if (rs) {
      // duel heroes: buy back every attribute point and perk
      y += 4;
      const price = rs.price(h);
      const can = h.level > 1 || h.perks.length > 0;
      c.add(
        new MButton(this, 0, y, w, TAP + 2, {
          label: t('hero.respec', { n: price }),
          icon: 'back',
          variant: can ? 'secondary' : 'disabled',
          disabledReason: t('hero.respecNothing'),
          id: 'hero.respec',
          tip: t('hero.respecTip'),
          onClick: () =>
            confirmDialog(this, {
              title: t('hero.respecTitle', { name: h.name }),
              body: t('hero.respecBody', { n: price }),
              ok: t('hero.respecOk'),
              cancel: t('common.cancel'),
              okIcon: 'back',
              onOk: () => {
                this.pending = { str: 0, agi: 0, end: 0, wil: 0 };
                if (!rs.run(h.id)) {
                  hapticNotify('error');
                  toast(this, t('duels.noGlory'), 'bad');
                }
              },
            }),
        }),
      );
      y += TAP + 2 + 4;
    }
    area.setContentHeight(y + 4);
    frameScrollTexts(area, cw);
  }

  // ------------------------------------------------------------------ gear: the stash for this hero

  private buildGear(): void {
    const top = this.pageTop;
    const outer = this.outer;
    this.stash = new MStashGrid(this, this.page, this.ox, top, this.cw, outer ? 0 : this.pageBottom() - top, {
      items: () => this.src.stash(),
      state: this.stashState,
      hero: () => this.hero(),
      drag: this.drag,
      onTap: (it) => this.openStashItem(it),
      inline: outer ?? undefined,
    });
    this.areas.push(this.stash);
    outer?.setContentHeight(top + this.stash.height + 4);
    // drop targets: the slots around the niche
    for (const [slot, o] of this.slotRects) {
      this.drag.targets.push({
        rect: () => uiBoundsOf(this, o as unknown as Phaser.GameObjects.Components.Transform & { w?: number; h?: number; width?: number; height?: number }),
        accepts: (it) => itemDef(it.def).slot === slot,
        drop: (it) => this.equip(it),
      });
    }
  }

  private tapSlot(slot: Slot): void {
    const h = this.hero();
    if (!h) return;
    const it = h.equip[slot];
    if (this.tab !== 'gear' || this.stashState.slot !== slot) {
      this.stashState.slot = slot;
      this.tab = 'gear';
      this.build();
    }
    if (it) this.openEquipped(h, slot, it);
  }

  private openEquipped(h: Hero, slot: Slot, it: Item): void {
    const gold = this.src.gold();
    const cost = this.src.repairCost(it);
    openItemCard(this, {
      item: it,
      hero: h,
      equipped: true,
      notes: [{ text: t('stash.equippedBy', { name: h.name }) }],
      actions: [
        { label: t('stash.unequip'), icon: 'back', id: 'stash.unequip', onClick: () => this.unequip(slot) },
        // gear that never wears (duels) has no repair button
        ...(gold === null
          ? []
          : [
              cost > 0
                ? { label: t('stash.repair', { n: cost }), icon: 'repair', id: 'stash.repair', variant: 'primary' as const, disabled: gold < cost ? t('stash.noGold') : undefined, onClick: () => this.repair(it) }
                : { label: t('stash.full'), icon: 'check', id: 'stash.full', disabled: t('stash.full'), onClick: () => {} },
            ]),
      ],
    });
  }

  private openStashItem(it: Item): void {
    const h = this.hero();
    const gold = this.src.gold();
    const cost = this.src.repairCost(it);
    openItemCard(this, {
      item: it,
      hero: h,
      actions: [
        ...(gold !== null && cost > 0 ? [{ label: t('stash.repair', { n: cost }), icon: 'repair', id: 'stash.repair', disabled: gold < cost ? t('stash.noGold') : undefined, onClick: () => this.repair(it) }] : []),
        { label: t('stash.equip'), icon: 'check', variant: 'primary' as const, id: 'stash.equip', disabled: h ? equipRefusal(h, it) : undefined, onClick: () => this.equip(it) },
      ],
    });
  }

  equip(it: Item): void {
    if (!this.src.equip(this.heroId, it.uid)) {
      hapticNotify('error');
      return;
    }
    hapticNotify('success');
    toast(this, t('army.equipped', { name: itemName(it) }), 'good');
    this.build();
  }

  private unequip(slot: Slot): void {
    this.src.unequip(this.heroId, slot);
    haptic('light');
    this.build();
  }

  private repair(it: Item): void {
    if (!this.src.repair(it)) {
      hapticNotify('error');
      toast(this, t('stash.noGold'), 'bad');
      return;
    }
    hapticNotify('success');
    toast(this, t('stash.repaired'), 'good');
    this.build();
  }

  // ------------------------------------------------------------------ perks: the class tree

  private buildPerks(h: Hero): void {
    const top = this.pageTop;
    const tree = heroTree({ cls: heroClass(h).id });
    const area = this.scrollArea(top, this.pageBottom() - top);
    const c = area.content;
    const cw = this.cw;
    const w = this.outer ? cw : cw - 3;
    const box = { owner: c, w: cw, h: 100000 };
    const free = Math.max(0, perkSlots(h.level) - h.perks.length);
    let y = 0;
    const nextLvl = PERK_LEVELS.find((l) => l > h.level);
    const head = free > 0 ? t('hero.perk.free', { n: free }) : nextLvl ? t('hero.perk.nextAt', { n: nextLvl }) : t('hero.perkTree', { cls: className(h) });
    c.add(mtext(this, w / 2, y + 1, head, free > 0 ? 'pGood' : 'pSec', { size: 6.5, align: 0.5, maxW: w, box }));
    y += 13;
    const rowH = 51;
    const g = this.add.graphics();
    c.add(g);
    tree.forEach((id, i) => {
      const p = PERKS[id];
      const known = h.perks.includes(id);
      const blocker = perkBlocker(h, id);
      const open = !known && blocker === null;
      const locked = !known && !open;
      const ry = y + i * (rowH + GAP);
      // the trunk joining the nodes: gold through what is learned
      if (i > 0) {
        g.fillStyle(known ? MOSAIC.segDone : MOSAIC.bronzeLo, 1);
        g.fillRect(28 + 11, ry - GAP - 6, 3, GAP + 8);
      }
      c.add(mosaicImage(this, 0, ry, w, rowH, known ? 'parchmentSel' : 'parchment'));
      // locked: the stone shows through
      if (locked) c.add(this.add.rectangle(0, ry, w, rowH, MOSAIC.parchLo, 0.5).setOrigin(0, 0));
      // the level it needs, on the left
      c.add(mtext(this, 10, ry + 19, `${PERK_LEVELS[i]}`, h.level >= PERK_LEVELS[i] ? 'rInk' : 'pOff', { size: 7, align: 0.5, box }));
      // the node: the perk's medallion (learned lit, available pulsing, locked faded with a lock); a tap opens it
      addMedallion(this, c, 27, ry + 13, 24, perkIcon(p), known ? 'learned' : open ? 'available' : 'locked');
      const node = this.add.zone(25, ry + 11, 28, 28).setOrigin(0, 0).setInteractive();
      uiId(node, `perk:${id}`);
      // (like a Button: `opts.label` names it for scripts and the tutorial)
      Object.assign(node, { opts: { label: tOr(`perk.${id}.name`, p.name) } });
      node.on('pointerup', () => !area.moved && this.openPerk(h, p, tree));
      c.add(node);
      const pip = this.add.graphics();
      pip.fillStyle(TREES[p.tree].color, 1);
      pip.fillRect(18, ry + 6, 3, rowH - 12);
      c.add(pip);
      const tx = 58;
      const tw = w - tx - 6;
      // name, then its state on a line of its own (never cut), then what it does
      c.add(mtext(this, tx, ry + 5, tOr(`perk.${id}.name`, p.name), known ? 'rInk' : open ? 'pInk' : 'pMuted', { size: 7, maxW: tw, box }));
      const status = known ? t('hero.perk.learned') : open ? t('hero.perk.available') : blocker ? blockerText(blocker, tree, i) : '';
      if (locked) c.add(scaleIcon(addIcon(this, tx, ry + 16, 'lock', 'D'), 0.75));
      if (known) c.add(scaleIcon(addIcon(this, tx, ry + 16, 'check'), 0.75));
      c.add(mtext(this, tx + 11, ry + 17, status, known || open ? 'pGood' : 'pOff', { size: 6, maxW: tw - 11, box }));
      const wr = wrapText(tOr(`perk.${id}.desc`, p.desc), tw, 2, false, 6);
      wr.lines.forEach((l, k) => c.add(mtext(this, tx, ry + 28 + k * 8, l, known || open ? 'pSec' : 'pMuted', { size: 6, box })));
      const z = this.add.zone(tx - 2, ry, w - tx + 2, rowH).setOrigin(0, 0).setInteractive();
      uiId(z, `perkrow:${id}`);
      z.on('pointerup', () => !area.moved && this.openPerk(h, p, tree));
      c.add(z);
    });
    y += tree.length * (rowH + GAP) + 4;
    const note = wrapText(t('hero.abilityUse'), w, 2, false, 6);
    note.lines.forEach((l, i) => c.add(mtext(this, 2, y + i * 8, l, 'pMuted', { size: 6, box })));
    y += note.lines.length * 8;
    area.setContentHeight(y + 4);
    frameScrollTexts(area, cw);
  }

  private openPerk(h: Hero, p: PerkDef, tree: readonly PerkId[]): void {
    const { VW } = this.m;
    const known = h.perks.includes(p.id);
    const blocker = perkBlocker(h, p.id);
    const name = tOr(`perk.${p.id}.name`, p.name);
    const extra = p.ability ? abilityText(p.ability, computeStats(h).cdMult) : p.aura ? `${t('hero.aura')}: ${tOr(`aura.${p.aura}.desc`, AURAS[p.aura].desc)}` : '';
    const w = Math.min(VW - 16, 200);
    const body = wrapText(tOr(`perk.${p.id}.desc`, p.desc) + (extra ? `\n${extra}` : ''), w - 20, 9);
    const tier = Math.max(0, tree.indexOf(p.id));
    const lh = 9;
    const m = openModal(this, { title: name, w, h: 26 + 16 + body.lines.length * lh + 12 + SIZE.btnH + 12 });
    const { c, x, y } = m;
    c.add(addIcon(this, x + 10, y + 24, perkIcon(p)));
    c.add(mtext(this, x + 26, y + 26, `${tOr(`tree.${p.tree}`, TREES[p.tree].name)} · ${t('hero.level', { n: PERK_LEVELS[tier] })}`, 'dim', { maxW: w - 36 }));
    body.lines.forEach((l, i) => c.add(mtext(this, x + 10, y + 40 + i * lh, l, 'ink')));
    const by = m.y + m.h - 9 - SIZE.btnH;
    const bw = Math.floor((w - 12 - 6 - SIZE.gap) / 2);
    c.add(new Button(this, x + 6, by, bw, SIZE.btnH, { label: t('common.close'), onClick: () => m.close() }));
    const learn = new Button(this, x + w - 6 - bw, by, bw, SIZE.btnH, {
      label: known ? t('hero.perk.learned') : t('hero.perk.learn'),
      icon: known ? 'check' : 'aura',
      variant: 'primary',
      id: 'hero.perk.learn',
      onClick: () => {
        m.close();
        confirmDialog(this, { title: t('hero.perk.learnTitle', { name }), body: t('hero.perk.learnBody'), ok: t('hero.perk.learn'), cancel: t('common.cancel'), okIcon: 'check', onOk: () => this.takePerk(p.id) });
      },
    });
    if (known || blocker) learn.setEnabled(false, known ? t('hero.perk.learned') : blockerText(blocker!, tree, tier));
    c.add(learn);
  }

  takePerk(id: PerkId): void {
    if (!this.src.takePerk(this.heroId, id)) {
      hapticNotify('error');
      return;
    }
    hapticNotify('success');
    toast(this, t('hero.perk.learnedToast', { name: tOr(`perk.${id}.name`, PERKS[id].name) }), 'good');
    this.build();
  }

  // ------------------------------------------------------------------ skills: abilities and auras

  private buildSkills(h: Hero): void {
    const top = this.pageTop;
    const s = computeStats(h);
    const tree = heroTree({ cls: heroClass(h).id });
    type Row = { kind: 'ability' | 'aura'; id: AbilityId | AuraId; has: boolean; source: string; open?: boolean };
    const rows: Row[] = [];
    for (const a of s.abilities) {
      const perk = tree.map((id) => PERKS[id]).find((p) => p.ability === a && h.perks.includes(p.id));
      rows.push({ kind: 'ability', id: a, has: true, source: perk ? t('hero.fromPerk', { name: tOr(`perk.${perk.id}.name`, perk.name) }) : t('hero.fromWill', { n: RALLY_WILL }) });
    }
    for (const a of s.auras) rows.push({ kind: 'aura', id: a, has: true, source: '' });
    // what the tree still holds
    tree.forEach((id, i) => {
      const p = PERKS[id];
      if (h.perks.includes(id)) return;
      // available: its perk can be learned right now (a point and the level are there)
      const open = perkBlocker(h, id) === null;
      const when = open ? t('hero.skill.learnNow', { name: tOr(`perk.${id}.name`, p.name) }) : h.level < PERK_LEVELS[i] ? t('hero.perk.unlocksAt', { n: PERK_LEVELS[i] }) : t('hero.fromPerk', { name: tOr(`perk.${id}.name`, p.name) });
      if (p.ability && !s.abilities.includes(p.ability)) rows.push({ kind: 'ability', id: p.ability, has: false, source: when, open });
      if (p.aura && !s.auras.includes(p.aura)) rows.push({ kind: 'aura', id: p.aura, has: false, source: when, open });
    });
    if (!rows.length) {
      this.page.add(
        addParchmentEmpty(this, this.ox, top, this.cw, this.outer ? 90 : this.pageBottom() - top, {
          icon: 'bash',
          title: t('hero.noAbilities'),
          hint: t('hero.noAbilitiesHint'),
          action: { label: t('hero.tab.perks'), onClick: () => this.switcher?.pick('perks', true) },
        }),
      );
      this.outer?.setContentHeight(top + 94);
      return;
    }
    const area = this.scrollArea(top, this.pageBottom() - top);
    const c = area.content;
    const cw = this.cw;
    const w = this.outer ? cw : cw - 3;
    const box = { owner: c, w: cw, h: 100000 };
    let y = 0;
    for (const r of rows) {
      const isAb = r.kind === 'ability';
      const def = isAb ? ABILITIES[r.id as AbilityId] : AURAS[r.id as AuraId];
      const name = isAb ? tOr(`ability.${r.id}.name`, def.name) : tOr(`aura.${r.id}.name`, def.name);
      const desc = isAb ? tOr(`ability.${r.id}.desc`, def.desc) : tOr(`aura.${r.id}.desc`, def.desc);
      const wr = wrapText(desc, w - 38, 4, false, 6);
      const hh = Math.max(38, 28 + wr.lines.length * 8 + 3);
      c.add(mosaicImage(this, 0, y, w, hh, r.has ? 'parchmentSel' : 'parchment'));
      if (!r.has && !r.open) c.add(this.add.rectangle(0, y, w, hh, MOSAIC.parchLo, 0.5).setOrigin(0, 0));
      // the skill as its battle medallion, in colour: learned (lit), available now (a pulsing ring), locked (faded, a lock)
      const icon = isAb ? (def as (typeof ABILITIES)[AbilityId]).icon : `aura_${r.id}`;
      addMedallion(this, c, 7, y + 7, 24, icon, r.has ? 'learned' : r.open ? 'available' : 'locked');
      let right = w - 5;
      if (isAb) {
        const cd = Math.round((def as (typeof ABILITIES)[AbilityId]).cooldown * s.cdMult);
        const label = t('hero.cooldownShort', { n: cd });
        const cwid = pillWidth(label);
        addPill(this, c, w - 5 - cwid, y + 5, label, 0x3a2f25, 60);
        right = w - 5 - cwid - 4;
      }
      c.add(mtext(this, 38, y + 5, name, r.has ? 'rInk' : r.open ? 'pInk' : 'pMuted', { size: 7, maxW: right - 38, box }));
      c.add(mtext(this, 38, y + 16, `${isAb ? t('hero.ability') : t('hero.aura')}${r.source ? ' · ' + r.source : ''}`, r.has ? 'pGood' : r.open ? 'pGood' : 'pOff', { size: 6, maxW: w - 42, box }));
      wr.lines.forEach((l, i) => c.add(mtext(this, 38, y + 27 + i * 8, l, r.has ? 'pInk' : r.open ? 'pSec' : 'pMuted', { size: 6, box })));
      y += hh + GAP;
    }
    const note = wrapText(`${t('hero.abilityUse')} ${t('hero.auraUse')}`, w, 3, false, 6);
    note.lines.forEach((l, i) => c.add(mtext(this, 2, y + 2 + i * 8, l, 'pMuted', { size: 6, box })));
    y += 2 + note.lines.length * 8;
    area.setContentHeight(y + 4);
    frameScrollTexts(area, cw);
  }

  // ------------------------------------------------------------------ attribute points

  private addPoint(k: AttrId): void {
    const h = this.hero();
    if (!h || h.points - this.spent() <= 0 || h.attrs[k] + this.pending[k] >= ATTR_MAX) {
      hapticNotify('error');
      return;
    }
    this.pending[k]++;
    haptic('light');
    this.rebuildKeepScroll();
  }

  private removePoint(k: AttrId): void {
    if (this.pending[k] <= 0) return;
    this.pending[k]--;
    this.rebuildKeepScroll();
  }

  private rebuildKeepScroll(): void {
    const a = this.areas[0] as ScrollArea | undefined;
    const s = a instanceof ScrollArea ? a.scrollY : 0;
    this.build(true);
    const b = this.areas[0];
    if (b instanceof ScrollArea) b.setScroll(s);
  }

  private resetPoints(): void {
    this.pending = { str: 0, agi: 0, end: 0, wil: 0 };
    this.build();
  }

  confirmPoints(): void {
    const ok = this.src.spendPoints(this.heroId, this.pending);
    this.pending = { str: 0, agi: 0, end: 0, wil: 0 };
    hapticNotify(ok ? 'success' : 'error');
    if (ok) toast(this, t('hero.pointsSaved'), 'good');
    this.build();
  }
}

function perkIcon(p: PerkDef): string {
  if (p.ability) return ABILITIES[p.ability].icon;
  if (p.aura) return `aura_${p.aura}`;
  return p.tree === 'hoplite' ? 'shield' : p.tree === 'skirmisher' ? 'spear' : p.tree === 'rider' ? 'advance' : 'swords';
}

function blockerText(b: string, tree: readonly PerkId[], tier: number): string {
  if (b === 'Known') return t('hero.perk.learned');
  if (b === 'No perk point') return t('hero.perk.noPoint');
  if (b.startsWith('Needs Lv')) return t('hero.perk.unlocksAt', { n: PERK_LEVELS[tier] });
  if (b.startsWith('Needs ')) {
    const prev = tree[tier - 1];
    return t('hero.perk.needs', { name: prev ? tOr(`perk.${prev}.name`, PERKS[prev].name) : '' });
  }
  return t('hero.perk.locked');
}

function abilityText(a: AbilityId, cdMult: number): string {
  const d = ABILITIES[a];
  return `${t('hero.ability')}: ${tOr(`ability.${a}.desc`, d.desc)} ${t('hero.cooldown', { n: Math.round(d.cooldown * cdMult) })}.`;
}

function barColor(id: string): number {
  switch (id) {
    case 'hp':
    case 'ko':
      return COLOR.hp;
    case 'morale':
      return COLOR.morale;
    case 'stamina':
    case 'speed':
      return COLOR.stamina;
    case 'armor':
    case 'block':
      return 0x8f9496;
    default:
      return COLOR.xp;
  }
}
