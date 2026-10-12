import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { ScrollArea, addIcon, scaleIcon } from '../ui/kit';
import { addScrollHint, confirmDialog, firstTimeHint, toast } from '../ui/widgets';
import { uiClip, uiId, uiIgnore } from '../ui/layout';
import { wrapText } from '../ui/textfit';
import { COLOR } from '../ui/theme';
import { addMedallion, addSwipe } from '../ui/mosaic';
import { ACCENT, MOSAIC, MOTION, RESOURCES, TEXT_MIN } from '../ui/tokens';
import { fadeIn, pulse } from '../ui/motion';
import { ensureFonts } from '../ui/fonts';
import { makePressable } from '../ui/mosaic/base';
import {
  equipRefusal,
  DragDrop, Stage, addLegend, frameScrollTexts, addStars, className, defaultStashState, itemName, openItemCard, roleColor, roleName,
  uiBoundsOf, type StashState,
} from '../ui/sheet';
import { ARMY_LH, SLOT_ORDER, armyPill, armyPillW } from '../ui/army';
import { campaignHeroes, heroTiers, type HeroSource, type PerkTier } from './heroSource';
import { haptic, hapticNotify } from '../platform/telegram';
import { MAX_LEVEL, xpToNext, type Hero } from '../data/units';
import { TRAITS } from '../data/traits';
import { itemDef, type Item, type Slot } from '../data/items';
import {
  ABILITIES, ATTR_IDS, ATTR_MAX, AURAS, PERK_LEVELS, PERKS, RALLY_WILL, TREES, perkBlocker, perkSlots,
  type AbilityId, type AttrId, type AuraId, type PerkDef, type PerkId,
} from '../data/perks';
import { computeStats, heroClass } from '../sim/stats';
import { STATS, fmtStat, heroStars, powerRating, previewAttrs, sheetStats } from '../game/gear';
import {
  MActionBar, GAP, GearSlot, MButton, MChip, MStashGrid, PAGER_W, MBar, MPager, SegmentedSwitch, SectionTitle, SECTION_TITLE_H, MIconButton, SWITCH_H, TAP,
  addNiche, slotGrid, addParchmentEmpty, mw, wrapWords, MBadge, addSubShell, addSwitchBadge, mosaicImage, mountSlot, mtext, openParchmentSheet, SHEET_TITLE_H,
  type Box, type MButtonOpts, type FramedSubShell,
} from '../ui/mosaic';
import { t, tOr, type TKey } from '../i18n';
import { heroName } from '../i18n/names';
import { localDecimals } from '../i18n/numbers';

type Tab = 'stats' | 'gear' | 'perks' | 'skills';
type C = Phaser.GameObjects.Container;
type TierView = PerkTier;
const TABS: Tab[] = ['stats', 'gear', 'perks', 'skills'];
const TAB_ICON: Record<Tab, string> = { stats: 'plus', gear: 'shield', perks: 'aura', skills: 'bash' };
/** Line pitch of 6.5 text (A11Y-09: no meaningful text under 6.5 UI px = 13 CSS px). */
const LH = ARMY_LH;
/** How much of a tab's page stays in view when a tab opens: its lead line, a tier heading and a row of cards (UI px). */
const PAGE_PEEK = 110;

interface HeroData {
  heroId?: string;
  back?: Record<string, unknown>;
  tab?: Tab;
  /** Whose heroes (default: the offline campaign's). */
  source?: HeroSource;
  /** Opened by a town drillmaster (ArmyScene pick mode): taken perk tiers can be retrained for gold (abilities.md R7). */
  retrain?: boolean;
}

/**
 * The hero's character sheet (screens-campaign.md C-8): his figure at an integer scale in a stone
 * niche with the gear slots around it, the pager under the niche, class, role, traits and XP; then
 * four tabs: Stats (attribute points with a live preview of every stat), Gear (the stash with
 * compare and drag and drop), Perks (each tier a row of two cards, path A and B, abilities.md R1)
 * and Skills (abilities, auras and the standard). The whole sheet scrolls as one page: the head
 * scrolls away and the tabs stay pinned under the top bar (HRO-1, G9). Opened by a drillmaster (or
 * with a free retrain owed), a taken tier can be retrained after a confirm that states the cost (R7, F3).
 */
export class HeroScene extends BaseScene {
  private heroId = '';
  private src: HeroSource = campaignHeroes;
  private from: Record<string, unknown> = {};
  private pending: Record<AttrId, number> = { str: 0, agi: 0, end: 0, wil: 0 };
  private tab: Tab = 'stats';
  private drill = false;
  private shell!: FramedSubShell;
  private box!: Box;
  private head!: C;
  private page!: C;
  private sticky: C | null = null;
  private clip: Phaser.GameObjects.Zone | null = null;
  private bar: MActionBar | null = null;
  private areas: { destroy(): void }[] = [];
  private stash: MStashGrid | null = null;
  private stashState: StashState = defaultStashState();
  private drag!: DragDrop;
  private slotRects = new Map<Slot, Phaser.GameObjects.GameObject>();
  /** Top of the tab bar and of the tab's page in the scrolled content (UI px). */
  private tabsY = 0;
  private pageTop = 0;
  private ox = 0;
  private cw = 0;
  /** The tab bar's width: the scroll area's whole width, so every label fits uncut (V5-063). */
  private tabW = 0;
  /** The page: head, tabs and the tab's content scroll as one. */
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
    this.src.onChange = () => this.sys.isActive() && this.build(true);
    this.src.onError = (msg) => {
      if (!this.sys.isActive()) return;
      hapticNotify('error');
      toast(this, msg, 'bad');
    };
    this.from = data?.back ?? {};
    // Stats is the default (C-8); a caller may open another tab
    this.tab = data?.tab && TABS.includes(data.tab) ? data.tab : 'stats';
    this.drill = !!data?.retrain;
    this.pending = { str: 0, agi: 0, end: 0, wil: 0 };
    this.areas = [];
    this.stash = null;
    this.sticky = null;
    this.clip = null;
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

  /** Retraining is open: a drillmaster opened the sheet, or an event left a free retrain (abilities.md R7). */
  private retrainOpen(): boolean {
    const r = this.src.retrain;
    return !!r && (this.drill || r.free() > 0);
  }

  // ------------------------------------------------------------------ the page: head, tabs, content

  private build(keepScroll = false): void {
    const keep = keepScroll ? this.outer?.scrollY ?? 0 : 0;
    this.layout();
    // a caller that opens another tab wants its page, not the head (on a short screen the head fills it)
    this.outer?.setScroll(keepScroll || this.tab === 'stats' ? keep : this.pageInView(keep));
  }

  /** The scroll that keeps the page's first card in view under the tabs (S3-6: the head fills a 320x640 screen). */
  private pageInView(scroll: number): number {
    const view = this.outer?.viewHeight ?? 0;
    return Math.max(scroll, Math.min(this.tabsY, this.pageTop + PAGE_PEEK - view));
  }

  private layout(): void {
    this.clearPage();
    this.head?.destroy();
    this.page?.destroy();
    this.outer?.destroy();
    this.sticky?.destroy();
    this.clip?.destroy();
    this.outer = null;
    this.sticky = null;
    this.clip = null;
    this.slotRects.clear();
    const h = this.hero();
    const b = this.box;
    // the plaque carries his name; where it would cut it (a long name on a 274 px canvas) the head does
    const cut = h ? this.titleName(h) : (this.shell.retitle(t('hero.title')), false);
    this.refreshBar();
    const top = b.y + 4;
    // the scroll area reaches 2 px from the frame so the tab bar can take its whole width (ru "Умения" uncut at 320);
    // everything else keeps the 4 px inset (ox = 2)
    const vx = b.x + 2;
    const vw = b.w - 4;
    const bottom = this.bottomEdge();
    const outer = new ScrollArea(this, this.ui, vx, top, vw, bottom - top, this.m.S);
    this.outer = outer;
    addScrollHint(this, this.ui, outer, MOSAIC.parch);
    this.ox = 2;
    this.cw = vw - 7;
    this.tabW = vw;
    this.head = this.add.container(0, 0);
    this.page = this.add.container(0, 0);
    outer.content.add([this.head, this.page]);
    if (!h) {
      this.ui.bringToTop(this.shell.top);
      return;
    }
    let top0 = 0;
    if (cut) {
      const nl = classLines(heroName(h.name), this.cw - 4, 8);
      nl.forEach((l, i) => this.head.add(mtext(this, this.ox + this.cw / 2, i * 11, l, 'rInk', { size: 8, align: 0.5, box: { owner: this.head, w: this.tabW, h: 100000 } })));
      top0 = nl.length * 11 + 3;
    }
    const ey = this.compact ? this.headCompact(h, top0) : this.headFull(h, top0);
    // tabs, badged with what there is to spend (the badges stand above the track: clear of the slots)
    this.tabsY = ey + 5;
    this.addTabs(this.head, 0, this.tabsY, 'hero.tab', h);
    this.pageTop = this.tabsY + SWITCH_H + 4;
    this.buildPage();
    // the tabs stay pinned under the top bar once the head has scrolled away; the layout check's viewport shrinks under them
    this.clip = uiIgnore(this.add.zone(vx, top, vw, bottom - top).setOrigin(0, 0));
    this.ui.add(this.clip);
    uiClip(outer.content, this.clip);
    const pinH = SWITCH_H + 6;
    // the pinned copy exists only while the tabs have scrolled away (scripts and the layout check see one tab bar)
    const sync = (s: number) => {
      if (!this.clip) return;
      const on = s > this.tabsY - 4;
      if (on && !this.sticky) {
        const pin = this.add.container(vx, top);
        pin.add(mosaicImage(this, 0, 0, vw, pinH, 'parchment'));
        this.addTabs(pin, 0, 4, 'hero.pinTab', h);
        // just above the page, under the action bar and any sheet or card open over the screen
        this.ui.addAt(pin, this.ui.getIndex(this.clip) + 1);
        this.sticky = pin;
      } else if (!on && this.sticky) {
        this.sticky.destroy();
        this.sticky = null;
      }
      const mh = on ? pinH : 0;
      this.clip.setPosition(vx, top + mh).setSize(vw, bottom - top - mh);
    };
    outer.onScroll((s) => sync(s));
    sync(outer.scrollY);
    this.ui.bringToTop(this.shell.top);
    if (this.bar) this.ui.bringToTop(this.bar);
  }

  /** Put his name on the top bar's plaque; true when the plaque had to cut it (then it says "Hero" and the head shows the name). */
  private titleName(h: Hero): boolean {
    this.shell.retitle(heroName(h.name));
    const cut = (c: C): boolean => c.list.some((o) => (o instanceof Phaser.GameObjects.BitmapText && o.text.endsWith('…')) || (o instanceof Phaser.GameObjects.Container && cut(o)));
    if (!cut(this.shell.top)) return false;
    this.shell.retitle(t('hero.title'));
    return true;
  }

  /**
   * The four tabs with their count badges (points on Stats, perk points on Perks). Equal segments while every
   * label fits them; on a canvas too narrow for that (ru at 274 px) each tab gets its label's width instead,
   * so no label is ever cut (V5-063: a tab keeps its name at every width).
   */
  private addTabs(parent: C, x: number, y: number, id: string, h: Hero): void {
    const perkFree = Math.max(0, perkSlots(h.level) - h.perks.length);
    const counts: (number | null)[] = [h.points > 0 ? h.points : null, null, perkFree > 0 ? perkFree : null, null];
    const sw = new SegmentedSwitch(this, x, y, this.tabW, {
      options: TABS.map((k) => ({ id: k, label: t(`hero.tab.${k}` as TKey), icon: this.compact ? TAB_ICON[k] : undefined })),
      selected: this.tab,
      onChange: (k) => this.setTab(k as Tab),
      id,
    });
    const cut = (c: C): boolean => c.list.some((o) => (o instanceof Phaser.GameObjects.BitmapText && o.text.endsWith('…')) || (o instanceof Phaser.GameObjects.Container && cut(o)));
    if (!cut(sw)) {
      parent.add(sw);
      counts.forEach((n, i) => n && addSwitchBadge(this, parent, x, y, this.tabW, 4, i, n));
      return;
    }
    sw.destroy();
    const labels = TABS.map((k) => t(`hero.tab.${k}` as TKey));
    const widths = tabWidths(labels.map((l) => mw(l, 'pInk', TEXT_MIN)), this.tabW - 2);
    const bar = this.add.container(x, y);
    bar.add(mosaicImage(this, 0, 0, this.tabW, SWITCH_H, 'track'));
    let sx = 1;
    TABS.forEach((k, i) => {
      const on = this.tab === k;
      const w = widths[i];
      if (on) bar.add(mosaicImage(this, sx, 1, w, SWITCH_H - 2, 'trackSel'));
      const lw = mw(labels[i], on ? 'pInk' : 'gold', TEXT_MIN);
      bar.add(mtext(this, Math.round(sx + (w - lw) / 2), Math.round((SWITCH_H - 8) / 2), labels[i], on ? 'pInk' : 'gold', { size: TEXT_MIN, box: { owner: bar, w: this.tabW, h: SWITCH_H } }));
      const hit = this.add.container(sx, 0);
      hit.add(this.add.rectangle(0, 0, w, SWITCH_H, 0, 0).setOrigin(0, 0));
      makePressable(hit, { w, h: SWITCH_H, inset: 1, onTap: () => k !== this.tab && this.setTab(k) });
      uiId(hit, `${id}.${k}`);
      Object.assign(hit, { opts: { label: labels[i] } });
      bar.add(hit);
      if (counts[i]) bar.add(new MBadge(this, sx + w - 5, -2, counts[i]!));
      sx += w;
    });
    uiId(bar, id);
    parent.add(bar);
  }

  /** Power, the wounded line; the niche between two columns of slots, the pager under it; class, role, traits, XP. Returns the y under it. */
  private headFull(h: Hero, y0: number): number {
    const L = this.head;
    const x0 = this.ox;
    const cw = this.cw;
    const VH = this.m.VH;
    const cls = heroClass(h);
    let y = this.powerAndWound(h, y0);
    const ss = 28;
    const stageH = VH >= 400 ? 124 : 112;
    const sgap = Math.floor((stageH - 3 * ss) / 2);
    const sx0 = x0 + ss + 4;
    const sw = cw - 2 * (ss + 4);
    // his own figure at the largest integer scale the niche holds (HRO-2, V5-045)
    L.add(new Stage(this, sx0, y, sw, stageH, h, { scale: 3 }));
    addNiche(this, L, sx0, y, sw, stageH);
    this.swipeZone(L, sx0, y, sw, stageH);
    // the shared slot order (ARM-8): helmet, armour, trinket on the left; weapon, shield (and the mount) on the right
    SLOT_ORDER.slice(0, 3).forEach((s, i) => this.slot(L, x0, y + i * (ss + sgap), s, h, ss));
    SLOT_ORDER.slice(3).forEach((s, i) => this.slot(L, x0 + cw - ss, y + i * (ss + sgap), s, h, ss));
    const m = mountSlot(this, x0 + cw - ss, y + 2 * (ss + sgap), h, ss);
    if (m) L.add(m);
    armyPill(this, L, sx0 + 3, y + 3, t('hero.level', { n: h.level }), MOSAIC.bronze, 40);
    addStars(this, L, sx0 + sw - 3 - 39, y + 5, heroStars(h), 5, { area: this.outer });
    y += stageH + 3;
    // the pager under the niche, clear of every slot (HRO-4): ‹ 7 / 9 › (a swipe does the same)
    const pager = this.pagerOpts();
    if (pager) {
      L.add(new MPager(this, Math.round(sx0 + sw / 2 - PAGER_W / 2), y, pager));
      y += TAP + 3;
    }
    return this.identity(h, cls, x0 + 2, y + 2, cw - 4);
  }

  /** Short screens: a small niche beside the identity, the pager under the niche, the slots in a row below. */
  private headCompact(h: Hero, y0: number): number {
    const L = this.head;
    const x0 = this.ox;
    const cw = this.cw;
    const cls = heroClass(h);
    let y = this.powerAndWound(h, y0);
    const sw = 56;
    const stageH = 72;
    const tx = x0 + sw + 5;
    const tw = x0 + cw - tx;
    const box = { owner: this.head, w: this.tabW, h: 100000 };
    // the class name beside the niche; a word too long for the column (THUREOPHOROS on a 274 px canvas) takes the full width above it
    const fitsIn = (ls: string[], size: number) => ls.every((l) => mw(l, 'rInk', size) <= tw);
    const size = fitsIn(classLines(className(h), tw, 7), 7) ? 7 : TEXT_MIN;
    const beside = fitsIn(classLines(className(h), tw, size), size);
    if (!beside) {
      const wide = classLines(className(h), cw - 4, 7);
      wide.forEach((l, i) => L.add(mtext(this, x0 + 2, y + i * 10, l, 'rInk', { size: 7, box })));
      y += wide.length * 10 + 2;
    }
    L.add(new Stage(this, x0, y, sw, stageH, h, { scale: 2 }));
    addNiche(this, L, x0, y, sw, stageH);
    this.swipeZone(L, x0, y, sw, stageH);
    const cl = beside ? classLines(className(h), tw, size) : [];
    cl.forEach((l, i) => L.add(mtext(this, tx, y + i * 10, l, 'rInk', { size, box })));
    let ty = y + cl.length * 10 + 1;
    const lvW = armyPill(this, L, tx, ty, t('hero.level', { n: h.level }), MOSAIC.bronze, 40);
    const role = roleName(cls.role);
    if (lvW + 3 + armyPillW(role) <= tw) armyPill(this, L, tx + lvW + 3, ty, role, roleColor(cls.role), tw - lvW - 3);
    else {
      ty += 15;
      armyPill(this, L, tx, ty, role, roleColor(cls.role), tw);
      // a long role name wraps inside its pill onto a second line
      if (armyPillW(role) > tw) ty += LH;
    }
    ty += 16;
    addStars(this, L, tx, ty, heroStars(h), 5, { area: this.outer });
    // the stars explain themselves on tap: their touch target reaches 14 below them
    ty += 18;
    y += stageH + 3;
    const pager = this.pagerOpts();
    if (pager) {
      L.add(new MPager(this, x0, Math.max(y, ty), pager));
      y = Math.max(y, ty) + TAP + 4;
    } else y = Math.max(y, ty);
    y = this.xpBar(h, x0 + 2, y, cw - 4);
    const traits = h.traits.map((k) => tOr(`trait.${k}.name`, TRAITS[k].name)).join(', ');
    if (traits) {
      const tl = wrapText(traits, cw - 4, 2, false, TEXT_MIN).lines;
      tl.forEach((l, i) => L.add(mtext(this, x0 + 2, y + i * LH, l, 'pSec', { size: TEXT_MIN, box })));
      y += tl.length * LH + 3;
    }
    const n = SLOT_ORDER.length + (cls.mount ? 1 : 0);
    const grid = slotGrid(cw, n, 24);
    SLOT_ORDER.forEach((s, i) => {
      const p = grid.pos(i);
      this.slot(L, x0 + p.x, y + p.y, s, h, grid.ss);
    });
    if (cls.mount) {
      const p = grid.pos(SLOT_ORDER.length);
      const mm = mountSlot(this, x0 + p.x, y + p.y, h, grid.ss);
      if (mm) L.add(mm);
    }
    return y + grid.h + 4;
  }

  private pagerOpts(): ConstructorParameters<typeof MPager>[3] | null {
    const all = this.src.heroes();
    if (all.length < 2) return null;
    const idx = Math.max(0, all.findIndex((x) => x.id === this.heroId));
    return { index: idx, count: all.length, onPrev: () => this.cycleHero(-1), onNext: () => this.cycleHero(1), prevTip: t('hero.prev'), nextTip: t('hero.next') };
  }

  /** Power at the head of the sheet, then the wounded line when he is hurt. Returns the y under them. */
  private powerAndWound(h: Hero, y: number): number {
    const L = this.head;
    const x0 = this.ox;
    const cw = this.cw;
    const power = new MChip(this, 0, 0, { icon: 'power', value: t('hero.power', { n: powerRating(h) }), tip: t('hero.powerTip'), id: 'hero.power' });
    power.x = Math.round(x0 + (cw - power.w) / 2);
    power.y = y;
    L.add(power);
    y += 21;
    // hurt: the one thing worth a line of its own (points and perks are badges on their tabs)
    if (h.wound > 0) {
      L.add(addIcon(this, x0 + 2, y - 1, 'heart'));
      L.add(mtext(this, x0 + 16, y + 1, t('hero.woundedTip', { h: Math.ceil(h.wound) }), 'pBad', { size: TEXT_MIN, maxW: cw - 18, box: { owner: this.head, w: this.tabW, h: 100000 } }));
      y += 12;
    }
    return y;
  }

  /** Class, role pill and traits, then the XP bar (full layout). Returns the y under them. */
  private identity(h: Hero, cls: ReturnType<typeof heroClass>, x: number, y: number, w: number): number {
    const L = this.head;
    const box = { owner: this.head, w: this.tabW, h: 100000 };
    const cl = classLines(className(h), w, 8);
    cl.forEach((l, i) => L.add(mtext(this, x, y + i * 11, l, 'rInk', { size: 8, box })));
    y += cl.length * 11 + 1;
    const role = roleName(cls.role);
    const roleMax = Math.floor(w * 0.6);
    const chipW = armyPill(this, L, x, y, role, roleColor(cls.role), roleMax);
    const traits = h.traits.map((k) => tOr(`trait.${k}.name`, TRAITS[k].name)).join(', ');
    // a long role name wraps inside its pill onto a second line
    let rowH = armyPillW(role) > roleMax ? 15 + LH : 15;
    if (traits) {
      const tl = wrapText(traits, w - chipW - 4, 2, false, TEXT_MIN).lines;
      tl.forEach((l, i) => L.add(mtext(this, x + chipW + 4, y + 2 + i * LH, l, 'pSec', { size: TEXT_MIN, box })));
      rowH = Math.max(rowH, 3 + tl.length * LH);
    }
    return this.xpBar(h, x, y + rowH, w);
  }

  /** The XP bar: "XP to level n" and the count with its percentage, so an empty bar never reads as broken (HRO-5). */
  private xpBar(h: Hero, x: number, y: number, w: number): number {
    const need = xpToNext(h.level);
    const p = Math.floor((100 * h.xp) / Math.max(1, need));
    const label = t('hero.xpTo', { n: h.level + 1 });
    // the count and its percentage; on a narrow line the count goes first, the percentage never
    const fits = (r: string) => mw(label, 'pInk', TEXT_MIN) + 8 + mw(r, 'pInk', TEXT_MIN) <= w;
    const full = t('hero5.xp', { xp: Math.floor(h.xp), need, p });
    const right = h.level >= MAX_LEVEL ? t('hero.noMorePoints') : fits(full) ? full : `${p}%`;
    const xp = new MBar(this, x, y, w, { value: h.xp, max: need, h: 5, size: TEXT_MIN, trough: 'light', color: RESOURCES.xp.color, label, right });
    this.head.add(xp);
    return y + xp.h + 5;
  }

  /** Swipe the stage: the next or the previous hero. */
  private swipeZone(L: C, x: number, y: number, w: number, h: number): void {
    if (this.src.heroes().length < 2) return;
    const z = this.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive();
    uiIgnore(z);
    addSwipe(z, () => this.cycleHero(1), () => this.cycleHero(-1));
    L.add(z);
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
        { label: t('hero.undo'), icon: 'back', variant: 'secondary', id: 'hero.undo', onClick: () => this.resetPoints() },
        { label: t('hero.strip.confirm', { n: this.spent() }), icon: 'check', variant: 'primary', id: 'hero.confirm', onClick: () => this.confirmPoints() },
      ];
    } else if (dis) {
      // bronze, not grey: grey means unavailable (G2, HRO-7); the confirm says it is final
      const why = dis.blocked(this.heroId);
      actions = [{ label: t('duels.dismissOne'), icon: 'bin', variant: why ? 'disabled' : 'secondary', disabledReason: why ?? undefined, id: 'hero.dismiss', onClick: () => this.askDismiss() }];
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
      title: t('duels.dismissConfirm', { name: heroName(h.name) }),
      body: t('duels.dismissBody'),
      ok: t('duels.dismissOne'),
      cancel: t('common.cancel'),
      destructive: true,
      onOk: () =>
        void dis.run(h.id).then((ok) => {
          if (!ok || !this.sys.isActive()) return;
          toast(this, t('duels.dismissed', { name: heroName(h.name) }), 'good');
          this.back();
        }),
    });
  }

  private slot(L: C, x: number, y: number, slot: Slot, h: Hero, size: number): void {
    const o = new GearSlot(this, x, y, { slot, item: h.equip[slot], size, selected: this.tab === 'gear' && this.stashState.slot === slot, onTap: () => this.tapSlot(slot) });
    L.add(o);
    this.slotRects.set(slot, o);
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    // the new tab starts at the top of its page: under the pinned tabs when the head had scrolled away
    const keep = Math.min(this.outer?.scrollY ?? 0, this.tabsY);
    this.layout();
    this.outer?.setScroll(this.pageInView(keep));
    fadeIn(this, this.page);
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
    const h = this.hero();
    if (!h) return;
    if (this.tab === 'stats') this.buildStats(h);
    else if (this.tab === 'gear') this.buildGear();
    else if (this.tab === 'perks') this.buildPerks(h);
    else this.buildSkills(h);
  }

  /** The tab's content: plain content under the head in the one scrolling page. */
  private section(y: number): { c: C; area: ScrollArea; done: (ch: number) => void } {
    const outer = this.outer!;
    const c = this.add.container(this.ox, y);
    this.page.add(c);
    return {
      c,
      area: outer,
      done: (ch: number) => {
        outer.setContentHeight(y + ch);
        frameScrollTexts({ content: c, viewHeight: outer.viewHeight, contentHeight: ch } as unknown as ScrollArea, this.cw);
      },
    };
  }

  // ------------------------------------------------------------------ stats: attributes with a live preview

  private buildStats(h: Hero): void {
    const pend = this.spent() > 0;
    const free = h.points - this.spent();
    const { c, area, done } = this.section(this.pageTop);
    const w = this.cw;
    let y = 0;
    const box = { owner: c, w, h: 100000 };
    // points header (it may wrap on narrow screens: the rows below start after it)
    const nextPoint = h.level >= MAX_LEVEL ? t('hero.noMorePoints') : t('hero.nextPoint', { n: h.level + 1 });
    const head = wrapText(free > 0 ? t('hero.points', { n: free }) : h.points > 0 ? t('hero.preview') : nextPoint, w, 2, false, TEXT_MIN);
    head.lines.forEach((l, i) => c.add(mtext(this, w / 2, y + 1 + i * LH, l, free > 0 ? 'pGood' : 'pSec', { size: TEXT_MIN, align: 0.5, box })));
    y += 3 + head.lines.length * LH;
    const next = previewAttrs(h, this.pending);
    const spendable = h.points > 0;
    ATTR_IDS.forEach((k) => {
      // the short name, value and name with the steppers; what it does under them, full width (HRO-3)
      const top = 26;
      const desc = t(`attr.${k}.desc` as TKey);
      const dl = wrapText(desc, w - 10, 3, false, TEXT_MIN).lines;
      const rh = top + dl.length * LH + 3;
      c.add(mosaicImage(this, 0, y, w, rh, 'parchment'));
      c.add(mtext(this, 5, y + 9, t(`attr.${k}.short` as TKey), 'rInk', { size: 8, box }));
      const val = h.attrs[k] + this.pending[k];
      c.add(mtext(this, 44, y + 9, `${val}`, this.pending[k] ? 'pGood' : 'pInk', { size: 8, align: 1, box }));
      const nameW = w - 50 - (spendable ? 2 * TAP + GAP + 6 : 4);
      c.add(mtext(this, 50, y + 9, t(`attr.${k}` as TKey), 'pInk', { size: 7, maxW: nameW, box }));
      dl.forEach((l, i) => c.add(mtext(this, 5, y + top + i * LH, l, 'pSec', { size: TEXT_MIN, box })));
      addLegend(this, c, 0, y, 50 + nameW, top, `${t(`attr.${k}` as TKey)}: ${desc}`, area, `attr.${k}.info`);
      // the steppers only while there are points to spend (or pending ones to take back); both bronze (HRO-5)
      if (spendable) {
        const by = y + Math.round((top - TAP) / 2) + 1;
        c.add(new MIconButton(this, w - 2 * TAP - GAP - 3, by, TAP, TAP, { text: '-', variant: 'secondary', label: t('hero.lower'), off: this.pending[k] > 0 ? undefined : t('hero.lowerNothing'), id: `attr.${k}.minus`, onClick: () => this.removePoint(k) }));
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
      const fmt = (v: number) => localDecimals(fmtStat(id, v));
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
        size: TEXT_MIN,
        trough: 'light',
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
      const wr = wrapText(tOr(`trait.${k}.desc`, tr.desc), w - 10, 3, false, TEXT_MIN);
      wr.lines.forEach((l, i) => c.add(mtext(this, 8, y + 10 + i * LH, l, 'pSec', { size: TEXT_MIN, box })));
      y += 10 + wr.lines.length * LH + 3;
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
              title: t('hero.respecTitle', { name: heroName(h.name) }),
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
    done(y + 4);
  }

  // ------------------------------------------------------------------ gear: the stash for this hero

  private buildGear(): void {
    const top = this.pageTop;
    const outer = this.outer!;
    this.stash = new MStashGrid(this, this.page, this.ox, top, this.cw, 0, {
      items: () => this.src.stash(),
      state: this.stashState,
      hero: () => this.hero(),
      drag: this.drag,
      onTap: (it) => this.openStashItem(it),
      inline: outer,
    });
    this.areas.push(this.stash);
    outer.setContentHeight(top + this.stash.height + 4);
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
      this.build(true);
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
      notes: [{ text: t('stash.equippedBy', { name: heroName(h.name) }) }],
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
    this.build(true);
  }

  private unequip(slot: Slot): void {
    this.src.unequip(this.heroId, slot);
    haptic('light');
    this.build(true);
  }

  private repair(it: Item): void {
    if (!this.src.repair(it)) {
      hapticNotify('error');
      toast(this, t('stash.noGold'), 'bad');
      return;
    }
    hapticNotify('success');
    toast(this, t('stash.repaired'), 'good');
    this.build(true);
  }

  // ------------------------------------------------------------------ perks: each tier a row of two cards, path A and B

  /** The hero's tiers: both options (one for a classless hero), what he took, the level each opens at. */
  private tiers(h: Hero): TierView[] {
    return heroTiers(h);
  }

  /** What a tier's header says: choose, chosen, or why it is closed. */
  private tierState(h: Hero, v: TierView): { text: string; good: boolean } {
    if (v.taken) return { text: t('hero5.chosen'), good: false };
    const b = perkBlocker(h, v.opts[0]);
    if (b === null) return { text: v.opts.length > 1 ? t('hero5.choose') : t('hero5.available'), good: true };
    if (b.startsWith('Needs Lv')) return { text: t('hero5.opensAt', { n: v.level }), good: false };
    if (b.startsWith('Needs ')) return { text: t('hero5.firstPrev', { n: PERK_LEVELS[v.tier - 1] }), good: false };
    if (b === 'No perk point') return { text: t('hero.perk.noPoint'), good: false };
    return { text: t('hero.perk.locked'), good: false };
  }

  private retrainCost(tier: number): { gold: number; free: boolean } {
    const r = this.src.retrain;
    if (!r) return { gold: 0, free: false };
    return r.free() > 0 ? { gold: 0, free: true } : { gold: r.cost(tier), free: false };
  }

  private costText(c: { gold: number; free: boolean }): string {
    return c.free ? t('hero5.costFree') : t('hero5.costGold', { n: c.gold });
  }

  private buildPerks(h: Hero): void {
    const { c, area, done } = this.section(this.pageTop);
    const w = this.cw;
    const box = { owner: c, w, h: 100000 };
    const free = Math.max(0, perkSlots(h.level) - h.perks.length);
    const retrain = this.retrainOpen();
    let y = 0;
    const nextLvl = PERK_LEVELS.find((l) => l > h.level);
    let head: string;
    let good = free > 0;
    if (retrain) {
      const r = this.src.retrain!;
      head = r.free() > 0 ? t('hero5.retrainHeadFree', { n: r.free() }) : t('hero5.retrainHead', { n: r.cost(0), gold: r.gold() });
      good = false;
    } else head = free > 0 ? t('hero5.perksHead', { n: free }) : nextLvl ? t('hero.perk.nextAt', { n: nextLvl }) : t('hero.perkTree', { cls: className(h) });
    const hl = wrapText(head, w - 4, 3, false, TEXT_MIN).lines;
    hl.forEach((l, i) => c.add(mtext(this, w / 2, y + 1 + i * LH, l, good ? 'pGood' : retrain ? 'pInk' : 'pSec', { size: TEXT_MIN, align: 0.5, box })));
    y += hl.length * LH + 4;
    for (const v of this.tiers(h)) y = this.tierRow(h, c, area, v, y, w, retrain) + GAP + 2;
    const note = wrapText(t('hero.abilityUse'), w - 2, 3, false, TEXT_MIN);
    note.lines.forEach((l, i) => c.add(mtext(this, 2, y + i * LH, l, 'pMuted', { size: TEXT_MIN, box })));
    y += note.lines.length * LH;
    done(y + 4);
  }

  /** One tier: "Lv n" and its state, then the two cards side by side (abilities.md Touch UI). Returns the y under it. */
  private tierRow(h: Hero, c: C, area: ScrollArea, v: TierView, y: number, w: number, retrain: boolean): number {
    const box = { owner: c, w, h: 100000 };
    const st = this.tierState(h, v);
    c.add(mtext(this, 2, y, t('hero.level', { n: v.level }), h.level >= v.level ? 'rInk' : 'pOff', { size: 7, box }));
    c.add(mtext(this, w - 2, y + 0.5, st.text, st.good ? 'pGood' : 'pSec', { size: TEXT_MIN, align: 1, maxW: w - 40, box }));
    y += 11;
    const n = v.opts.length;
    const cardW = Math.floor((w - GAP * (n - 1)) / n);
    const names = v.opts.map((id) => wrapText(tOr(`perk.${id}.name`, PERKS[id].name), cardW - 8, 2, false, TEXT_MIN).lines);
    const cardH = 3 + 18 + 3 + Math.max(...names.map((l) => l.length)) * LH + LH + 4;
    v.opts.forEach((id, i) => this.perkCard(h, c, area, v, id, i * (cardW + GAP), y, cardW, cardH, names[i], retrain));
    return y + cardH;
  }

  /**
   * A perk card: the medallion, the name and its state. Taken: lit with a check; the other option of a chosen
   * tier: dimmed and labelled "Not taken" (or "Retrain" while retraining is open); a free point pulses both
   * cards; a closed tier is faded with a lock. A tap opens the tier's sheet.
   */
  private perkCard(h: Hero, c: C, area: ScrollArea, v: TierView, id: PerkId, x: number, y: number, cw: number, ch: number, name: string[], retrain: boolean): void {
    const p = PERKS[id];
    const box = { owner: c, w: this.cw, h: 100000 };
    const known = v.taken === id;
    const other = !!v.taken && !known;
    const open = !v.taken && perkBlocker(h, id) === null;
    const locked = !known && !other && !open;
    const swap = other && retrain;
    c.add(mosaicImage(this, x, y, cw, ch, known ? 'parchmentSel' : 'parchment'));
    if (locked || (other && !swap)) c.add(this.add.rectangle(x, y, cw, ch, MOSAIC.parchLo, 0.55).setOrigin(0, 0));
    // a free point pulses the tier's cards: a gold rim
    if (open || swap) {
      const g = this.add.graphics();
      g.lineStyle(1.2, ACCENT.goldHi, 1);
      g.strokeRoundedRect(x + 0.6, y + 0.6, cw - 1.2, ch - 1.2, 3);
      c.add(g);
      pulse(this, g, 'alpha', 1, 0.35, MOTION.pulse);
    }
    // the tree colour as a stripe on the card's left edge
    const pip = this.add.graphics();
    pip.fillStyle(TREES[p.tree].color, 1);
    pip.fillRect(x + 2, y + 4, 2, ch - 8);
    c.add(pip);
    const md = 18;
    addMedallion(this, c, Math.round(x + (cw - md) / 2), y + 3, md, perkIcon(p), known ? 'learned' : open || swap ? 'available' : 'locked');
    const ink = known ? 'pInk' : open || swap ? 'pInk' : 'pMuted';
    name.forEach((l, k) => c.add(mtext(this, x + cw / 2, y + 24 + k * LH, l, ink, { size: TEXT_MIN, align: 0.5, box })));
    const sy = y + ch - LH - 3;
    const status = known ? t('hero5.taken') : swap ? t('hero5.retrainTag') : other ? t('hero5.notTaken') : open ? t('hero5.available') : '';
    if (status) {
      const icon = known ? 'check' : swap ? 'back' : null;
      const tone = known || open ? 'pGood' : swap ? 'pInk' : 'pOff';
      const tw = mtext(this, 0, 0, status, tone, { size: TEXT_MIN, maxW: cw - 16 });
      const iw = icon ? 10 : 0;
      const sx = Math.round(x + (cw - tw.width - iw) / 2);
      if (icon) c.add(scaleIcon(addIcon(this, sx, sy - 1, icon), 0.7));
      tw.setPosition(sx + iw, sy);
      c.add(tw);
    } else if (locked) c.add(scaleIcon(addIcon(this, Math.round(x + cw / 2 - 5), sy - 1, 'lock', 'D'), 0.75));
    const z = this.add.zone(x, y, cw, ch).setOrigin(0, 0).setInteractive();
    uiId(z, `perk:${id}`);
    // (like a Button: `opts.label` names it for scripts and the tutorial)
    Object.assign(z, { opts: { label: tOr(`perk.${id}.name`, p.name) } });
    z.on('pointerup', () => !area.moved && this.openTier(v.tier, id));
    c.add(z);
  }

  /**
   * The tier's sheet: both options with what each does and what it changes in his numbers (the delta
   * against neither), the tapped one picked; one button under them: Learn it, Retrain to it (the cost
   * stated, R7/F3), or why not ("Path chosen": a second pick in a tier is refused).
   */
  openTier(tier: number, pick?: PerkId): void {
    const h = this.hero();
    if (!h) return;
    const v = this.tiers(h)[tier];
    if (!v) return;
    let sel: PerkId = pick && v.opts.includes(pick) ? pick : v.taken ? v.opts.find((p) => p !== v.taken) ?? v.taken : v.opts[0];
    const { VW, VH } = this.m;
    const w = Math.min(VW - 12, 240);
    const pad = 8;
    const bw = w - 2 * pad;
    const blocks = v.opts.map((id) => this.optionLines(h, v, id, bw - 30));
    const blockH = (b: string[][]) => 22 + b.reduce((a, g) => a + g.length, 0) * LH + 4;
    const bodyH = blocks.reduce((a, b) => a + blockH(b) + GAP, 0);
    const sh = Math.min(VH - 12, SHEET_TITLE_H + bodyH + TAP + 2 + 16);
    const s = openParchmentSheet(this, { title: t('hero5.sheetTitle', { n: v.level }), w, h: sh, id: 'hero.perkSheet' });
    const body = this.add.container(0, 0);
    s.c.add(body);
    const draw = () => {
      body.removeAll(true);
      let y = s.body.y;
      v.opts.forEach((id, i) => {
        const bh = blockH(blocks[i]);
        this.optionBlock(body, h, v, id, i, s.x + pad, y, bw, bh, blocks[i], id === sel, () => {
          sel = id;
          draw();
        });
        y += bh + GAP;
      });
      body.add(this.sheetButton(h, v, sel, s.x + pad, s.y + s.h - pad - TAP - 2, bw, () => s.close()));
    };
    draw();
  }

  /** An option's text lines: what it does, its ability or aura, then the stat delta. */
  private optionLines(h: Hero, v: TierView, id: PerkId, w: number): string[][] {
    const p = PERKS[id];
    const wrap = (s: string, n: number) => wrapText(s, w, n, false, TEXT_MIN).lines;
    // an ability or aura says what it does in full (its cooldown too); a passive perk its one line
    const extra = p.ability ? abilityText(p.ability, computeStats(h).cdMult) : p.aura ? `${t('hero.aura')}: ${tOr(`aura.${p.aura}.desc`, AURAS[p.aura].desc)}` : '';
    const out: string[][] = [extra ? wrap(extra, 6) : wrap(tOr(`perk.${id}.desc`, p.desc), 3)];
    const d = statDelta(h, v, id);
    if (d.length) out.push([t('hero5.gives'), ...d.slice(0, 4)]);
    else if (!extra) out.push([t('hero5.noStatChange')]);
    return out;
  }

  private optionBlock(c: C, h: Hero, v: TierView, id: PerkId, i: number, x: number, y: number, w: number, bh: number, lines: string[][], on: boolean, onPick: () => void): void {
    const p = PERKS[id];
    const known = v.taken === id;
    c.add(mosaicImage(this, x, y, w, bh, on ? 'parchmentSel' : 'parchment'));
    if (on) {
      const g = this.add.graphics();
      g.lineStyle(1.2, MOSAIC.bronze, 1);
      g.strokeRoundedRect(x + 0.6, y + 0.6, w - 1.2, bh - 1.2, 3);
      c.add(g);
    }
    addMedallion(this, c, x + 5, y + 4, 18, perkIcon(p), known ? 'learned' : v.taken ? 'locked' : perkBlocker(h, id) === null ? 'available' : 'locked');
    const tx = x + 28;
    const tw = w - 32;
    c.add(mtext(this, tx, y + 3, tOr(`perk.${id}.name`, p.name), 'pInk', { size: 7, maxW: tw }));
    const tag = `${v.opts.length > 1 ? t(i === 0 ? 'hero5.pathA' : 'hero5.pathB') : ''}${known ? `${v.opts.length > 1 ? ' · ' : ''}${t('hero5.taken')}` : v.taken ? ` · ${t('hero5.notTaken')}` : ''}`;
    if (tag) c.add(mtext(this, tx, y + 12, tag, known ? 'pGood' : 'pSec', { size: TEXT_MIN, maxW: tw }));
    let ly = y + 22;
    lines.forEach((g, gi) =>
      g.forEach((l, k) => {
        const tone = gi === 0 ? 'pInk' : k > 0 ? 'pGood' : 'pSec';
        c.add(mtext(this, tx, ly, l, tone, { size: TEXT_MIN }));
        ly += LH;
      }),
    );
    // a tap picks this option for the button under the blocks (selection shown by a rim and a fill, not colour alone)
    if (v.opts.length > 1) {
      const z = this.add.zone(x, y, w, bh).setOrigin(0, 0).setInteractive();
      uiId(z, `perkopt:${id}`);
      z.on('pointerup', onPick);
      c.add(z);
    }
  }

  /** The sheet's one button for the picked option. */
  private sheetButton(h: Hero, v: TierView, sel: PerkId, x: number, y: number, w: number, close: () => void): MButton {
    const name = tOr(`perk.${sel}.name`, PERKS[sel].name);
    if (v.taken && v.taken !== sel && this.retrainOpen()) {
      const cost = this.retrainCost(v.tier);
      const short = !cost.free && (this.src.retrain?.gold() ?? 0) < cost.gold;
      return new MButton(this, x, y, w, TAP + 2, {
        label: t('hero5.retrainBtn', { cost: this.costText(cost) }),
        icon: 'back',
        variant: short ? 'disabled' : 'primary',
        disabledReason: short ? t('hero5.noGold') : undefined,
        id: 'hero.retrain',
        onClick: () => {
          close();
          this.askRetrain(v.tier);
        },
      });
    }
    const known = v.taken === sel;
    const blocker = known ? null : perkBlocker(h, sel);
    const why = known ? t('hero5.taken') : blocker === 'Path chosen' ? t('hero5.pathChosenWhy') : blocker ? blockerText(blocker, v) : undefined;
    return new MButton(this, x, y, w, TAP + 2, {
      label: known ? t('hero5.taken') : t('hero5.learnOne', { name }),
      icon: known ? 'check' : 'aura',
      variant: why ? 'disabled' : 'primary',
      disabledReason: why,
      id: 'hero.perk.learn',
      onClick: () => {
        close();
        confirmDialog(this, { title: t('hero5.takeTitle', { name }), body: t('hero5.takeBody'), ok: t('hero.perk.learn'), cancel: t('common.cancel'), okIcon: 'check', onOk: () => this.takePerk(sel) });
      },
    });
  }

  /** The retrain confirm: who, from what to what, and what it costs (abilities.md F3), or that it uses a free retrain. */
  askRetrain(tier: number): void {
    const h = this.hero();
    const r = this.src.retrain;
    if (!h || !r) return;
    const v = this.tiers(h)[tier];
    if (!v?.taken) return;
    const to = v.opts.find((p) => p !== v.taken);
    if (!to) return;
    const cost = this.retrainCost(tier);
    const nm = (id: PerkId) => tOr(`perk.${id}.name`, PERKS[id].name);
    const args = { hero: heroName(h.name), from: nm(v.taken), to: nm(to), n: cost.gold, gold: r.gold() };
    confirmDialog(this, {
      title: t('hero5.retrainTitle', { name: nm(to) }),
      body: cost.free ? t('hero5.retrainBodyFree', args) : t('hero5.retrainBody', args),
      ok: t('hero5.retrainOk'),
      cancel: t('common.cancel'),
      okIcon: 'back',
      onOk: () => {
        if (!r.run(h.id, tier, !cost.free)) {
          hapticNotify('error');
          toast(this, t('hero5.noGold'), 'bad');
          return;
        }
        hapticNotify('success');
        toast(this, t('hero5.retrainDone', { name: heroName(h.name) }), 'good');
        this.build(true);
      },
    });
  }

  takePerk(id: PerkId): void {
    if (!this.src.takePerk(this.heroId, id)) {
      hapticNotify('error');
      return;
    }
    hapticNotify('success');
    toast(this, t('hero.perk.learnedToast', { name: tOr(`perk.${id}.name`, PERKS[id].name) }), 'good');
    this.build(true);
  }

  // ------------------------------------------------------------------ skills: abilities, auras and the standard

  private buildSkills(h: Hero): void {
    const top = this.pageTop;
    const s = computeStats(h);
    const tiers = this.tiers(h);
    type Row = { kind: 'ability' | 'aura' | 'standard'; id: string; has: boolean; source: string; open?: boolean };
    const rows: Row[] = [];
    const perkName = (id: PerkId) => tOr(`perk.${id}.name`, PERKS[id].name);
    for (const a of s.abilities) {
      const perk = h.perks.map((id) => PERKS[id]).find((p) => p?.ability === a);
      rows.push({ kind: 'ability', id: a, has: true, source: perk ? t('hero.fromPerk', { name: perkName(perk.id) }) : t('hero.fromWill', { n: RALLY_WILL }) });
    }
    for (const a of s.auras) rows.push({ kind: 'aura', id: a, has: true, source: '' });
    if (s.standard) rows.push({ kind: 'standard', id: 'standard', has: true, source: h.perks.includes('standard_bearer') ? t('hero.fromPerk', { name: perkName('standard_bearer') }) : '' });
    // what the open tiers still hold (a chosen tier's other option is gone until a retrain)
    for (const v of tiers) {
      if (v.taken) continue;
      for (const id of v.opts) {
        const p = PERKS[id];
        const open = perkBlocker(h, id) === null;
        const when = open ? t('hero.skill.learnNow', { name: perkName(id) }) : h.level < v.level ? t('hero.perk.unlocksAt', { n: v.level }) : t('hero.fromPerk', { name: perkName(id) });
        if (p.ability && !s.abilities.includes(p.ability)) rows.push({ kind: 'ability', id: p.ability, has: false, source: when, open });
        if (p.aura && !s.auras.includes(p.aura)) rows.push({ kind: 'aura', id: p.aura, has: false, source: when, open });
        if ((p.standard || id === 'standard_bearer') && !s.standard) rows.push({ kind: 'standard', id: 'standard', has: false, source: when, open });
      }
    }
    if (!rows.length) {
      this.page.add(
        addParchmentEmpty(this, this.ox, top, this.cw, 90, {
          icon: 'bash',
          title: t('hero.noAbilities'),
          hint: t('hero.noAbilitiesHint'),
          action: { label: t('hero.tab.perks'), onClick: () => this.setTab('perks') },
        }),
      );
      this.outer?.setContentHeight(top + 94);
      return;
    }
    const { c, done } = this.section(top);
    const w = this.cw;
    const box = { owner: c, w, h: 100000 };
    let y = 0;
    for (const r of rows) {
      const ab = r.kind === 'ability' ? ABILITIES[r.id as AbilityId] : null;
      const au = r.kind === 'aura' ? AURAS[r.id as AuraId] : null;
      const name = ab ? tOr(`ability.${r.id}.name`, ab.name) : au ? tOr(`aura.${r.id}.name`, au.name) : t('hero5.standard');
      const desc = ab ? tOr(`ability.${r.id}.desc`, ab.desc) : au ? tOr(`aura.${r.id}.desc`, au.desc) : t('hero5.standardDesc');
      const kind = ab ? t('hero.ability') : au ? t('hero.aura') : t('hero5.standardKind');
      const wr = wrapText(desc, w - 42, 5, false, TEXT_MIN);
      const sub = wrapText(`${kind}${r.source ? ' · ' + r.source : ''}`, w - 42, 2, false, TEXT_MIN);
      const hh = Math.max(38, 16 + (sub.lines.length + wr.lines.length) * LH + 4);
      c.add(mosaicImage(this, 0, y, w, hh, r.has ? 'parchmentSel' : 'parchment'));
      if (!r.has && !r.open) c.add(this.add.rectangle(0, y, w, hh, MOSAIC.parchLo, 0.5).setOrigin(0, 0));
      // the skill as its battle medallion, in colour: learned (lit), available now (a pulsing ring), locked (faded, a lock)
      const icon = ab ? ab.icon : au ? `aura_${r.id}` : 'standard';
      addMedallion(this, c, 7, y + 7, 24, icon, r.has ? 'learned' : r.open ? 'available' : 'locked');
      let right = w - 5;
      if (ab) {
        const label = t('hero.cooldownShort', { n: Math.round(ab.cooldown * s.cdMult) });
        const pw = armyPillW(label);
        armyPill(this, c, w - 5 - pw, y + 4, label, 0x3a2f25, 60);
        right = w - 5 - pw - 4;
      }
      c.add(mtext(this, 38, y + 5, name, r.has ? 'pInk' : r.open ? 'pInk' : 'pMuted', { size: 7, maxW: right - 38, box }));
      let ly = y + 16;
      sub.lines.forEach((l) => {
        c.add(mtext(this, 38, ly, l, r.has || r.open ? 'pGood' : 'pOff', { size: TEXT_MIN, box }));
        ly += LH;
      });
      wr.lines.forEach((l) => {
        c.add(mtext(this, 38, ly, l, r.has ? 'pInk' : r.open ? 'pSec' : 'pMuted', { size: TEXT_MIN, box }));
        ly += LH;
      });
      y += hh + GAP;
    }
    const note = wrapText(`${t('hero.abilityUse')} ${t('hero.auraUse')}`, w - 2, 4, false, TEXT_MIN);
    note.lines.forEach((l, i) => c.add(mtext(this, 2, y + 2 + i * LH, l, 'pMuted', { size: TEXT_MIN, box })));
    y += 2 + note.lines.length * LH;
    done(y + 4);
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
    this.build(true);
  }

  private removePoint(k: AttrId): void {
    if (this.pending[k] <= 0) return;
    this.pending[k]--;
    this.build(true);
  }

  private resetPoints(): void {
    this.pending = { str: 0, agi: 0, end: 0, wil: 0 };
    this.build(true);
  }

  confirmPoints(): void {
    const ok = this.src.spendPoints(this.heroId, this.pending);
    this.pending = { str: 0, agi: 0, end: 0, wil: 0 };
    hapticNotify(ok ? 'success' : 'error');
    if (ok) toast(this, t('hero.pointsSaved'), 'good');
    this.build(true);
  }
}

/** The class name in Cinzel, wrapped to at most two lines by the face it is drawn in. */
function classLines(name: string, w: number, size: number): string[] {
  return wrapWords(name, w, (x) => mw(x, 'rInk', size)).slice(0, 2);
}

/** Tab widths for labels `lw` wide across `total`: each its label plus an equal share of what is left. */
export function tabWidths(lw: readonly number[], total: number): number[] {
  const spare = Math.max(0, total - lw.reduce((a, b) => a + b, 0));
  const ws = lw.map((w) => Math.floor(w + spare / lw.length));
  ws[ws.length - 1] += total - ws.reduce((a, b) => a + b, 0);
  return ws;
}

function perkIcon(p: PerkDef): string {
  if (p.ability) return ABILITIES[p.ability].icon;
  if (p.aura) return `aura_${p.aura}`;
  if (p.standard || p.id === 'standard_bearer') return 'standard';
  return p.tree === 'hoplite' ? 'shield' : p.tree === 'skirmisher' ? 'spear' : p.tree === 'rider' ? 'advance' : 'swords';
}

/**
 * What a perk adds to his numbers: every sheet stat with neither option of its tier against with this one
 * ("Block 30% > 36%"), so A and B compare on the same base.
 */
function statDelta(h: Hero, v: TierView, id: PerkId): string[] {
  const base = h.perks.filter((p) => !v.opts.includes(p));
  const a = computeStats({ ...h, perks: base });
  const b = computeStats({ ...h, perks: [...base, id] });
  const out: string[] = [];
  for (const sid of sheetStats(b)) {
    const d = STATS[sid];
    if (Math.abs(d.get(b) - d.get(a)) < 1e-6) continue;
    out.push(`${t(`stat.${sid}` as TKey)}: ${localDecimals(`${fmtStat(sid, d.get(a))} → ${fmtStat(sid, d.get(b))}`)}`);
  }
  return out;
}

function blockerText(b: string, v: TierView): string {
  if (b === 'Known') return t('hero5.taken');
  if (b === 'No perk point') return t('hero.perk.noPoint');
  if (b.startsWith('Needs Lv')) return t('hero.perk.unlocksAt', { n: v.level });
  if (b.startsWith('Needs ')) return t('hero5.firstPrev', { n: PERK_LEVELS[v.tier - 1] });
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
