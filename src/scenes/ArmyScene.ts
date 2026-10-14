import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { ScrollArea, addIcon, scaleIcon, tappable } from '../ui/kit';
import { addScrollHint, confirmDialog, firstTimeHint, toast } from '../ui/widgets';
import { uiClip, uiCollapsed, uiIgnore, uiId, uiLayout } from '../ui/layout';
import { layoutVariant, masterDetail, type Box as PaneBox } from '../ui/mosaic/layout/geometry';
import { focusPane } from '../ui/focusRing';
import { CONTENT_MAX } from '../ui/sizeClass';
import { wrapText } from '../ui/textfit';
import { ensureFonts } from '../ui/fonts';
import { equipRefusal, DragDrop, defaultStashState, groupName, itemName, openItemCard, saleText, uiBoundsOf, type StashState } from '../ui/sheet';
import { state } from '../state';
import { scrapValue } from '../game/campaign';
import { itemDef, type Item, type Slot } from '../data/items';
import type { Hero } from '../data/units';
import { heroClass } from '../sim/stats';
import { haptic, hapticNotify } from '../platform/haptics';
import { addSyncBadge } from '../ui/online';
import { uiCoin } from '../audio/hooks';
import { MOSAIC, TEXT_MIN } from '../ui/tokens';
import { queryRoster, ROSTER_FILTERS, ROSTER_SORTS, type RosterFilter, type RosterSort } from '../game/gear';
import { GAP, MButton, MChip, MStashGrid, SegmentedSwitch, SWITCH_H, TAP, addParchmentEmpty, addSubShell, addSwitchBadge, mosaicImage, mtext, type FramedSubShell, type Box } from '../ui/mosaic';
import {
  ARMY_LH, ARMY_ROW_H, HEAD_NICHE, ArmyFooter, addArmyHead, addMiniHead, addRosterRow, armyBack, campaignArmy, collapsed, ensureBusts, openOptionSheet, tappableRow, type ArmyOrigin, type ArmySource,
} from '../ui/army';
import { t, type TKey } from '../i18n';
import { heroName } from '../i18n/names';
import { placeName } from '../i18n/places';

export { RARITY_COLOR } from '../ui/theme';

interface ArmyData {
  heroId?: string;
  /** Scene that opened the Army (Back returns there): 'Menu', 'World', 'Settlement' with its id, 'Camp'. */
  from?: string;
  id?: number;
  tab?: 'roster' | 'stash';
  /** Pick mode (the Drillmaster, abilities.md R7): a tap on a man opens his perks to retrain a tier. */
  pick?: 'retrain';
}

/**
 * The Army (screens-campaign.md C-7) on the one Army template (src/ui/army), campaign source.
 * The page scrolls as one under the top bar: the situation line and chips, the selected hero's
 * card (it collapses to a one-line header once scrolled away, P21), Roster | Stash, then the
 * roster (filter and sort sheets, rows) or the stash grid (filters, compare, equip by tap or drag,
 * repair, sell in towns, scrap in camp). The footer: Dismiss and Sheet. Back is the top bar's (or
 * Telegram's) only, to the screen that opened the Army (BACK_RULES origin).
 */
export class ArmyScene extends BaseScene {
  /** Migrated to the size classes (ADR-0013, V6-RSCR-05): master and detail side by side outside compact portrait. */
  protected override readonly responsive = true;
  private src: ArmySource = campaignArmy;
  /** The detail pane (the selected hero's card) beside the list, outside compact portrait. */
  private detail: ScrollArea | null = null;
  private heroId = '';
  private tab: 'roster' | 'stash' = 'roster';
  private origin: ArmyOrigin = {};
  private pick: 'retrain' | null = null;
  private shell!: FramedSubShell;
  private box!: Box;
  private area: ScrollArea | null = null;
  private page: Phaser.GameObjects.Container | null = null;
  private footer: ArmyFooter | null = null;
  private mini: Phaser.GameObjects.Container | null = null;
  /** What the layout check takes as the scroll viewport: the page under the collapsed header. */
  private clip: Phaser.GameObjects.Zone | null = null;
  private stash: MStashGrid | null = null;
  private stashState: StashState = defaultStashState();
  private sort: RosterSort = 'power';
  private filter: RosterFilter = 'all';
  private drag!: DragDrop;
  private slotObjs = new Map<Slot, Phaser.GameObjects.GameObject>();
  private cardTop = 0;

  constructor() {
    super('Army');
  }

  create(data: ArmyData): void {
    this.initUi();
    ensureFonts(this);
    const heroes = this.src.heroes();
    this.heroId = data?.heroId && heroes.some((h) => h.id === data.heroId) ? data.heroId : heroes[0]?.id ?? '';
    this.pick = data?.pick ?? null;
    this.tab = this.pick ? 'roster' : data?.tab ?? 'roster';
    this.origin = { from: data?.from ?? 'World', id: data?.id };
    this.area = null;
    this.page = null;
    this.footer = null;
    this.mini = null;
    this.clip = null;
    this.stash = null;
    this.detail = null;
    this.screen({ back: () => this.goBack() });
    uiLayout(this, this.m.cls, this.m.land);
    const shell = addSubShell(this, { title: t('hub.army'), back: () => this.goBack(), id: 'army.topbar', scroll: false });
    this.box = shell.content;
    addSyncBadge(this, this.ui, shell.frame.topBar.x + shell.frame.topBar.w - 17 - (TAP + GAP * 2), shell.frame.topBar.y + 6);
    this.shell = shell;
    this.drag = new DragDrop(this);
    this.events.once('shutdown', () => this.clearPage());
    this.refresh();
    if (!this.pick) firstTimeHint(this, 'army', t('stash.dragHint'));
  }

  private hero(): Hero | undefined {
    return this.src.heroes().find((h) => h.id === this.heroId);
  }

  private goBack(): void {
    void state.save();
    const b = armyBack(this.origin);
    this.scene.start(b.scene, b.data);
  }

  openHero(tab?: string): void {
    const back = { from: this.origin.from, id: this.origin.id, ...(this.pick ? { pick: this.pick } : {}) };
    this.scene.start('Hero', { heroId: this.heroId, back, tab: this.pick ? 'perks' : tab, ...(this.pick ? { retrain: true } : {}) });
  }

  /** In a town the market buys stash items. */
  private inTown(): boolean {
    if (this.origin.from !== 'Settlement' || this.origin.id === undefined) return false;
    return state.campaign.world.settlement(this.origin.id)?.kind === 'town';
  }

  // ------------------------------------------------------------------ the page

  private clearPage(): void {
    this.stash?.destroy();
    this.stash = null;
    this.drag.targets = [];
    this.drag.cancel();
    this.page?.destroy();
    this.page = null;
    this.area?.destroy();
    this.area = null;
    this.detail?.destroy();
    this.detail = null;
    this.mini?.destroy();
    this.mini = null;
    this.clip?.destroy();
    this.clip = null;
    this.footer?.destroy();
    this.footer = null;
    this.slotObjs.clear();
  }

  /** Two panes (landscape-v6 §10.2): every layout but compact portrait, which keeps the v5 page. */
  private get split(): boolean {
    return layoutVariant(this.m) !== 'compactPortrait';
  }

  refresh(): void {
    if (this.split) {
      this.refreshSplit();
      return;
    }
    const keep = this.area?.scrollY ?? 0;
    this.clearPage();
    const box = this.box;
    let bottom = box.y + box.h;
    if (!this.pick) {
      this.footer = this.buildFooter();
      this.ui.add(this.footer);
      bottom = this.footer.top - 3;
    }
    const top = box.y + 4;
    const vx = box.x + 4;
    const vw = box.w - 8;
    const area = new ScrollArea(this, this.ui, vx, top, vw, bottom - top, this.m.S);
    this.area = area;
    addScrollHint(this, this.ui, area, MOSAIC.parch);
    const page = this.add.container(0, 0);
    area.content.add(page);
    this.page = page;
    const cw = vw - 3;
    let y = this.buildTip(page, cw, 0);
    this.cardTop = y;
    y = this.buildHead(page, cw, y);
    y = this.buildTabs(page, cw, y);
    y = this.tab === 'roster' ? this.buildRoster(page, cw, y) : this.buildStash(page, cw, y);
    area.setContentHeight(y + 4);
    area.setScroll(keep);
    // the card collapsed to one line over the top of the page (P21); the layout check's viewport shrinks under it
    const h = this.hero();
    this.clip = uiIgnore(this.add.zone(vx, top, vw, bottom - top).setOrigin(0, 0));
    this.ui.add(this.clip);
    uiClip(area.content, this.clip);
    if (h) {
      this.mini = addMiniHead(this, this.ui, vx, top, cw, h, this.src, () => area.setScroll(0));
      const sync = (s: number) => {
        const on = collapsed(s, this.cardTop);
        if (!this.mini || !this.clip) return;
        this.mini.setVisible(on);
        const mh = on ? this.mini.height + 3 : 0;
        this.clip.setPosition(vx, top + mh).setSize(vw, bottom - top - mh);
      };
      area.onScroll((s) => sync(s));
      sync(area.scrollY);
    }
    this.ui.bringToTop(this.shell.top);
    if (this.footer) this.ui.bringToTop(this.footer);
  }

  /**
   * Compact landscape, medium and expanded (landscape-v6 §10.2, §3.3): the master pane on the left (the
   * sentence and chips, Roster | Stash, filter and sort, the rows or the stash grid), the detail pane on
   * the right (the selected hero's card with his slots, the footer under it). Each pane scrolls on its own;
   * stash items drag from the master grid onto the detail's slots. The collapsed one-line header is not
   * needed: the card is a fixed pane (registered as collapsed into his first slot).
   */
  private refreshSplit(): void {
    const keepM = this.area?.scrollY ?? 0;
    const keepD = this.detail?.scrollY ?? 0;
    this.clearPage();
    const b = this.box;
    // the panes region is at most CONTENT_MAX wide (§2.3), centred in the frame
    const iw = Math.min(b.w - 8, CONTENT_MAX);
    const inner: PaneBox = { x: b.x + 4 + Math.floor((b.w - 8 - iw) / 2), y: b.y + 4, w: iw, h: b.h - 7 };
    const md = masterDetail(inner, this.m);
    const M = md.master;
    const D = md.detail ?? md.master;
    // detail first: the stash's drop targets are the card's slots
    const dw = Math.min(D.w, DETAIL_MAX);
    const dx = D.x + Math.floor((D.w - dw) / 2);
    const head = this.add.container(0, 0);
    let headH = this.buildHead(head, dw - 3, 0);
    const h = this.hero();
    if (h) {
      // beside the list, his figure opens his sheet (perks in pick mode), as the row's second tap does
      const fig = this.add.zone(HEAD_NICHE.x, HEAD_NICHE.y, HEAD_NICHE.w, HEAD_NICHE.h).setOrigin(0, 0).setInteractive();
      tappable(fig, null, () => this.openHero(), t('army.sheetTip'));
      head.add(uiId(fig, 'army.figure'));
    }
    if (this.pick && h) {
      // pick mode: the row's tap opens his perks; the detail says so with the same action (nothing new)
      head.add(new MButton(this, 0, headH, dw - 3, TAP + 2, { label: t('hero.tab.perks'), icon: 'aura', variant: 'primary', id: 'army.pickPerks', onClick: () => this.openHero() }));
      headH += TAP + 2 + 4;
    }
    const footH = this.pick ? 0 : FOOT_H + 1;
    // the card and the footer as one group, centred in the pane's height when they fit (as the Menu's panes)
    const fits = headH + footH <= D.h;
    const top = fits ? D.y + Math.floor((D.h - headH - footH) / 2) : D.y;
    let viewBottom = fits ? top + headH : D.y + D.h;
    if (!this.pick) {
      // the footer under the card when both fit; else on the pane's floor, the card scrolling above it
      this.footer = this.buildFooter(dx, fits ? top + headH + footH : D.y + D.h, dw);
      this.ui.add(this.footer);
      viewBottom = this.footer.top - 1;
    }
    const detail = new ScrollArea(this, this.ui, dx, top, dw, viewBottom - top, this.m.S);
    this.detail = detail;
    addScrollHint(this, this.ui, detail, MOSAIC.parch);
    detail.content.add(head);
    detail.setContentHeight(headH);
    // on the stash the slots are the drop targets: the card scrolls to them (a short pane shows the name above)
    detail.setScroll(this.tab === 'stash' ? headH : keepD);
    // master
    const area = new ScrollArea(this, this.ui, M.x, M.y, M.w, M.h, this.m.S);
    this.area = area;
    addScrollHint(this, this.ui, area, MOSAIC.parch);
    const page = this.add.container(0, 0);
    area.content.add(page);
    this.page = page;
    const cw = M.w - 3;
    let y = this.buildTip(page, cw, 0, true);
    this.cardTop = 0;
    y = this.buildTabs(page, cw, y);
    y = this.tab === 'roster' ? this.buildRoster(page, cw, y) : this.buildStash(page, cw, y);
    area.setContentHeight(y + 4);
    area.setScroll(keepM);
    if (this.hero()) uiCollapsed(this, 'army.mini', 'slot:helmet');
    // Tab reads the top bar, the master pane, the detail pane, then the footer (landscape-v6 §4)
    eachChild(head, (o) => focusPane(o, 1));
    if (this.footer) eachChild(this.footer, (o) => focusPane(o, 2));
    this.ui.bringToTop(this.shell.top);
    if (this.footer) this.ui.bringToTop(this.footer);
  }

  /** The footer: Dismiss (confirms) and Sheet (the primary; a count of points to spend). */
  private buildFooter(x = this.box.x, bottom = this.box.y + this.box.h, w = this.box.w): ArmyFooter {
    const h = this.hero();
    const pend = h ? this.src.pending(h) : 0;
    const blocked = h ? this.src.dismiss?.blocked(h.id) ?? null : t('army.noHeroes');
    return new ArmyFooter(
      this,
      x,
      bottom,
      w,
      { label: t('army.dismiss'), icon: 'skull', variant: blocked ? 'disabled' : 'secondary', disabledReason: blocked ?? undefined, id: 'army.dismiss', onClick: () => this.dismiss() },
      {
        label: t('army.sheet'),
        icon: 'people',
        variant: h ? 'primary' : 'disabled',
        badge: pend || 0,
        tip: pend ? `${t('army.sheetTip')} ${t('army.pending')}.` : t('army.sheetTip'),
        disabledReason: t('army.noHeroes'),
        id: 'army.sheet',
        onClick: () => this.openHero(),
      },
    );
  }

  /** The sentence (what needs doing first) and the chips: men, gold, wounds. Returns the y below. */
  private buildTip(L: Phaser.GameObjects.Container, w: number, y0: number, always = false): number {
    const heroes = this.src.heroes();
    const hurt = heroes.filter((h) => this.src.status(h)?.bad);
    const pend = heroes.filter((h) => this.src.pending(h) > 0);
    const parts: string[] = [];
    let urgent = false;
    if (this.pick) {
      parts.push(t('army5.pickTitle'), t('army5.pickHint'));
      urgent = true;
    } else if (this.tab === 'stash') parts.push(this.src.stash().length ? t('army.sit.stash', { n: this.src.stash().length }) : t('army.sit.empty'));
    else {
      // what needs doing first: points to spend, then wounds, then the count
      if (pend.length === 1) parts.push(t('army.sit.pendingOne', { n: this.src.pending(pend[0]), name: heroName(pend[0].name) }));
      else if (pend.length) parts.push(t('army.sit.pending', { n: pend.length, name: heroName(pend[0].name), more: pend.length - 1 }));
      if (hurt.length) parts.push(t('army.sit.hurt', { n: hurt.length }));
      if (!pend.length || !hurt.length) parts.push(t('army.sit.men', { n: heroes.length }));
      urgent = pend.length > 0;
    }
    let y = y0;
    if (this.m.VH >= 300 || this.pick || always) {
      const lines = wrapText(parts.join(' '), w - 4, 3, false, TEXT_MIN).lines;
      lines.forEach((l, i) => L.add(mtext(this, w / 2, y + i * ARMY_LH, l, urgent ? 'pInk' : 'pSec', { size: TEXT_MIN, align: 0.5, box: { owner: this.ui, w: this.m.VW, h: this.m.VH } })));
      y += lines.length * ARMY_LH + 3;
    }
    const gold = this.src.gold();
    const chips = [new MChip(this, 0, 0, { icon: 'people', value: `${heroes.length}`, tip: t('menu.tip.army'), id: 'army.chip.men' })];
    if (gold !== null) chips.push(new MChip(this, 0, 0, { icon: 'coin', value: `${gold}`, tip: t('menu.tip.gold'), id: 'army.chip.gold' }));
    if (hurt.length) chips.push(new MChip(this, 0, 0, { icon: 'cross', value: `${hurt.length}`, tip: t('army.sit.hurt', { n: hurt.length }), id: 'army.chip.hurt' }));
    const total = chips.reduce((a, k) => a + k.w, 0) + GAP * (chips.length - 1);
    let cx = Math.round((w - total) / 2);
    for (const k of chips) {
      k.x = cx;
      k.y = y;
      L.add(k);
      cx += k.w + GAP;
    }
    return y + 18 + 4;
  }

  // ------------------------------------------------------------------ the selected hero

  private buildHead(L: Phaser.GameObjects.Container, cw: number, y0: number): number {
    const h = this.hero();
    if (!h) {
      const card = this.add.container(0, y0);
      card.add(mosaicImage(this, 0, 0, cw, 40, 'parchment'));
      card.add(mtext(this, cw / 2, 15, t('army.noHeroes'), 'rInk', { size: 7.5, align: 0.5, maxW: cw - 8, box: { owner: card, w: cw, h: 40 } }));
      L.add(card);
      return y0 + 44;
    }
    const r = addArmyHead(this, L, 0, y0, cw, h, this.src, {
      onGroup: this.pick ? null : (g) => this.setGroup(g),
      onSlot: (s) => this.tapSlot(s),
      selectedSlot: this.tab === 'stash' ? this.stashState.slot : null,
    });
    for (const [s, o] of r.slots) this.slotObjs.set(s, o);
    // the painted class bust loads on first use and is drawn into this card when it arrives (no rebuild under a tap)
    ensureBusts(this, [heroClass(h).id], r.addBust);
    return y0 + r.h + 4;
  }

  private setGroup(g: number): void {
    const h = this.hero();
    if (!h || !this.src.setGroup(h.id, g)) return;
    haptic('light');
    toast(this, t('army.groupSet', { name: heroName(h.name), group: groupName(g) }), 'good');
    this.refresh();
  }

  private tapSlot(slot: Slot): void {
    const h = this.hero();
    if (!h || this.pick) return;
    if (this.tab !== 'stash' || this.stashState.slot !== slot) {
      this.stashState.slot = slot;
      this.tab = 'stash';
      this.refresh();
    }
    const it = h.equip[slot];
    if (!it) return;
    const cost = this.src.repairCost(it);
    const gold = this.src.gold() ?? 0;
    openItemCard(this, {
      item: it,
      hero: h,
      equipped: true,
      notes: [{ text: t('stash.equippedBy', { name: heroName(h.name) }) }],
      actions: [
        { label: t('stash.unequip'), icon: 'back', id: 'stash.unequip', onClick: () => this.unequip(slot) },
        cost > 0
          ? { label: t('stash.repair', { n: cost }), icon: 'repair', variant: 'primary', id: 'stash.repair', disabled: gold < cost ? t('stash.noGold') : undefined, onClick: () => this.repair(it) }
          : { label: t('stash.full'), icon: 'check', id: 'stash.full', disabled: t('stash.full'), onClick: () => {} },
      ],
    });
  }

  // ------------------------------------------------------------------ roster / stash

  /** Roster | Stash (pick mode: the roster only). Returns the y below. */
  private buildTabs(L: Phaser.GameObjects.Container, w: number, y: number): number {
    if (this.pick) return y;
    const heroes = this.src.heroes();
    L.add(
      new SegmentedSwitch(this, 0, y, w, {
        options: [
          { id: 'roster', label: t('army.roster', { n: heroes.length, max: this.src.maxArmy() }) },
          { id: 'stash', label: t('army.stash', { n: this.src.stash().length }) },
        ],
        selected: this.tab,
        onChange: (id) => {
          this.tab = id as 'roster' | 'stash';
          this.area?.setScroll(0);
          this.refresh();
        },
        id: 'army.tab',
      }),
    );
    // one badge per destination (G11): on the roster tab the rows carry the counts
    const pend = heroes.filter((h) => this.src.pending(h) > 0).length;
    if (pend && this.tab === 'stash') addSwitchBadge(this, L, 0, y, w, 2, 0, pend);
    return y + SWITCH_H + 4;
  }

  /** The filter and sort buttons (each opens a sheet), then the heroes; returns the y below the last row. */
  private buildRoster(L: Phaser.GameObjects.Container, w: number, top: number): number {
    const heroes = this.src.heroes();
    if (!heroes.length) {
      L.add(addParchmentEmpty(this, 0, top, w, 80, { icon: 'people', title: t('army5.emptyTitle'), hint: this.volunteersHint() }));
      return top + 80;
    }
    const bw = Math.floor((w - GAP) / 2);
    const filterLabel = (f: RosterFilter) => (f === 'all' ? t('army.filter.all') : t(`army.filter.${f}` as TKey));
    const frame = { x: this.box.x, w: this.box.w, bottom: this.box.y + this.box.h };
    L.add(
      new MButton(this, 0, top, bw, TAP, {
        label: filterLabel(this.filter),
        icon: 'eye',
        variant: 'secondary',
        tip: t('army.filterTip'),
        id: 'army.filter',
        onClick: () =>
          openOptionSheet(this, frame, { title: t('army5.filterTitle'), id: 'army.filterSheet', selected: this.filter, options: ROSTER_FILTERS.map((f) => ({ id: f, label: filterLabel(f) })), onPick: (f) => ((this.filter = f), this.refresh()) }),
      }),
    );
    L.add(
      new MButton(this, bw + GAP, top, w - bw - GAP, TAP, {
        label: t(`army.sort.${this.sort}` as TKey),
        icon: 'flag',
        variant: 'secondary',
        tip: t('army.sortTip'),
        id: 'army.sort',
        onClick: () =>
          openOptionSheet(this, frame, { title: t('army5.sortTitle'), id: 'army.sortSheet', selected: this.sort, options: ROSTER_SORTS.map((s) => ({ id: s, label: t(`army.sort.${s}` as TKey) })), onPick: (s) => ((this.sort = s), this.refresh()) }),
      }),
    );
    let y = top + TAP + GAP;
    const roster = queryRoster(heroes, this.sort, this.filter);
    if (!roster.length) {
      L.add(addParchmentEmpty(this, 0, y, w, 80, { icon: 'people', title: t('army.noHeroes'), hint: t('army.noHeroesHint'), action: { label: t('army.filter.all'), onClick: () => ((this.filter = 'all'), this.refresh()) } }));
      return y + 80;
    }
    // beside the detail pane the selected row also gets a bronze rim and a chevron pointing at it (§3.3: not colour alone)
    const rw = this.split ? w - CHEV_W : w;
    roster.forEach((h, i) => {
      const row = this.add.container(0, y);
      const on = h.id === this.heroId;
      addRosterRow(this, row, rw, ARMY_ROW_H, h, this.src, on);
      if (on && this.split) {
        const g = this.add.graphics();
        g.lineStyle(1.2, MOSAIC.bronze, 1);
        g.strokeRoundedRect(0.6, 0.6, rw - 1.2, ARMY_ROW_H - 1.2, 3);
        row.add(g);
        row.add(scaleIcon(addIcon(this, rw + 1, Math.round((ARMY_ROW_H - 9) / 2), 'chevR'), 0.75));
      }
      tappableRow(row, rw, ARMY_ROW_H, this.area!, () => this.select(h.id));
      uiId(row, `roster:${i}`);
      L.add(row);
      y += ARMY_ROW_H + GAP;
    });
    return y;
  }

  /** "Volunteers wait in {the nearest town}" for an army with no one left. */
  private volunteersHint(): string {
    const w = state.campaign.world;
    const towns = w.map.settlements.filter((s) => s.kind === 'town' || s.kind === 'village');
    let best: (typeof towns)[number] | null = null;
    let bd = Infinity;
    for (const s of towns) {
      const d = (s.x - w.s.x) ** 2 + (s.y - w.s.y) ** 2;
      if (d < bd) (bd = d), (best = s);
    }
    return best ? t('army5.emptyHint', { town: placeName(best.name) }) : t('army5.emptyHintAny');
  }

  /** First tap selects, a second tap opens the sheet; in pick mode one tap picks. */
  private select(id: string): void {
    if (this.heroId === id || this.pick) {
      this.heroId = id;
      this.openHero();
      return;
    }
    this.heroId = id;
    haptic('light');
    this.refresh();
  }

  private buildStash(L: Phaser.GameObjects.Container, w: number, top: number): number {
    const v = layoutVariant(this.m);
    this.stash = new MStashGrid(this, L, 0, top, w, 0, {
      // larger cells where the pane has the room: a tablet's tall pane (touch), 6 columns on a laptop (§10.2)
      ...(v === 'medium' ? { cell: STASH_CELL_MEDIUM } : v === 'expanded' ? { cell: STASH_CELL_WIDE } : {}),
      items: () => this.src.stash(),
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
    return top + this.stash.height;
  }

  openStashItem(it: Item): void {
    const h = this.hero();
    const cost = this.src.repairCost(it);
    const gold = this.src.gold() ?? 0;
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
    if (this.origin.from === 'Camp') {
      // in camp: no market, but an item can be broken up for supplies
      const got = scrapValue(it);
      actions.push({
        label: t('cs.scrap', { n: got }),
        icon: 'wood',
        id: 'stash.scrap',
        onClick: () => confirmDialog(this, { title: t('cs.scrapTitle', { name: itemName(it) }), body: t('cs.scrapBody', { n: got }), ok: t('cs.scrap', { n: got }), cancel: t('common.cancel'), destructive: true, onOk: () => this.scrap(it) }),
      });
    }
    if (cost > 0) actions.push({ label: t('stash.repair', { n: cost }), icon: 'repair', id: 'stash.repair', disabled: gold < cost ? t('stash.noGold') : undefined, onClick: () => this.repair(it) });
    if (h) actions.push({ label: t('stash.equip'), icon: 'check', variant: 'primary' as const, id: 'stash.equip', disabled: equipRefusal(h, it), onClick: () => this.equip(it) });
    openItemCard(this, { item: it, hero: h, actions, notes: this.inTown() ? [] : [{ text: this.origin.from === 'Camp' ? t('cs.scrapHint') : t('stash.sellInTown') }] });
  }

  equip(it: Item): void {
    if (!this.src.equip(this.heroId, it.uid)) {
      hapticNotify('error');
      return;
    }
    hapticNotify('success');
    toast(this, t('army.equipped', { name: itemName(it) }), 'good');
    this.refresh();
  }

  private unequip(slot: Slot): void {
    this.src.unequip(this.heroId, slot);
    haptic('light');
    this.refresh();
  }

  private repair(it: Item): void {
    if (!this.src.repair(it)) {
      hapticNotify('error');
      toast(this, t('stash.noGold'), 'bad');
      return;
    }
    hapticNotify('success');
    toast(this, t('stash.repaired'), 'good');
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
    const d = this.src.dismiss;
    if (!h || !d || d.blocked(h.id)) return;
    confirmDialog(this, {
      title: t('army.dismissTitle', { name: heroName(h.name) }),
      body: t('army.dismissBody'),
      ok: t('army.dismiss'),
      cancel: t('common.cancel'),
      destructive: true,
      onOk: () => {
        d.run(h.id);
        this.heroId = this.src.heroes()[0]?.id ?? '';
        this.scene.restart({ ...this.origin, heroId: this.heroId });
      },
    });
  }
}

/** The detail pane's widest card (a hero card wider than this only stretches its rows of pills). */
const DETAIL_MAX = 340;
/** Room beside a roster row for the selected row's chevron, UI px. */
const CHEV_W = 10;
/** Stash cells in the master pane, UI px (28 at phone sizes). */
const STASH_CELL_MEDIUM = 40;
const STASH_CELL_WIDE = 34;
/** The footer's height (ArmyFooter.h). */
const FOOT_H = 32;

/** Every object under `c` (a container tree), `c` itself included. */
function eachChild(c: Phaser.GameObjects.GameObject, fn: (o: Phaser.GameObjects.GameObject) => void): void {
  fn(c);
  if (c instanceof Phaser.GameObjects.Container) for (const o of c.list) eachChild(o, fn);
}
