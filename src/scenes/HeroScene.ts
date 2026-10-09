import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, ScrollArea, addIcon, addPanel, addText, scaleIcon } from '../ui/kit';
import { StatBar, Tabs, addEmptyState, addScrollHint, confirmDialog, firstTimeHint, openModal, toast } from '../ui/widgets';
import { uiId, uiIgnore } from '../ui/layout';
import { ellipsize, wrapText, LINE_H } from '../ui/textfit';
import { SIZE, COLOR } from '../ui/theme';
import { CommandStrip } from '../ui/strategos';
import { InfoChip, Pager, ProgressBar, ScreenHeader, addClaimGlow, addSection, addSwipe, addTipLine, layChips } from '../ui/v3';
import { ACCENT, RESOURCES, SURFACE } from '../ui/tokens';
import { fadeIn } from '../ui/motion';
import { ensureFonts } from '../ui/fonts';
import {
  DragDrop, Stage, StashGrid, addChip, frameScrollTexts, addMountTile, addSlotTile, addStars, className, defaultStashState, itemName, openItemCard, roleColor, roleName,
  uiBoundsOf, type StashState,
} from '../ui/sheet';
import { campaignHeroes, type HeroSource } from './heroSource';
import { haptic, hapticNotify } from '../platform/telegram';
import { xpToNext, type Hero } from '../data/units';
import { TRAITS } from '../data/traits';
import { itemDef, type Item, type Slot } from '../data/items';
import {
  ABILITIES, ATTR_IDS, ATTR_MAX, AURAS, PERK_LEVELS, PERKS, RALLY_WILL, TREES, heroTree, perkBlocker, perkSlots,
  type AbilityId, type AttrId, type AuraId, type PerkDef, type PerkId,
} from '../data/perks';
import { computeStats, heroClass } from '../sim/stats';
import { STATS, fmtStat, heroStars, powerRating, previewAttrs, sheetStats } from '../game/gear';
import { t, tOr, type TKey } from '../i18n';

type Tab = 'stats' | 'gear' | 'perks' | 'skills';
const TABS: Tab[] = ['stats', 'gear', 'perks', 'skills'];

interface HeroData {
  heroId?: string;
  back?: Record<string, unknown>;
  tab?: Tab;
  /** Whose heroes (default: the offline campaign's). */
  source?: HeroSource;
}

/**
 * The hero's character sheet (docs/DESIGN_V2.md "Army and hero screen"): the
 * animated figure in his actual gear on a lit stage with the equipment slots
 * around it, class, role, rank stars, level and power; then four tabs:
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
  private head!: Phaser.GameObjects.Container;
  private page!: Phaser.GameObjects.Container;
  private tabs: Tabs | null = null;
  private areas: { destroy(): void }[] = [];
  private stash: StashGrid | null = null;
  private stashState: StashState = defaultStashState();
  private drag!: DragDrop;
  private slotRects = new Map<Slot, Phaser.GameObjects.GameObject>();
  private pageTop = 0;
  private strip: CommandStrip | null = null;

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
    this.tabs = null;
    this.screen({ back: () => this.back() });
    const { VW, VH } = this.m;
    this.ui.add(this.add.rectangle(0, 0, VW, VH, SURFACE.bg).setOrigin(0, 0));
    this.head = this.add.container(0, 0);
    this.page = this.add.container(0, 0);
    this.ui.add([this.head, this.page]);
    this.strip = new CommandStrip(this, VW, VH, {});
    this.ui.add(this.strip);
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

  private build(): void {
    this.head.removeAll(true);
    this.slotRects.clear();
    const L = this.head;
    const h = this.hero();
    const { VW, VH } = this.m;
    // the header (his name; the back arrow only outside Telegram), then power and the pager
    const hdr = new ScreenHeader(this, VW, { title: h ? h.name : t('hero.title'), back: () => this.back(), id: 'hero.header' });
    L.add(hdr);
    this.refreshStrip();
    if (!h) return;
    const compact = this.compact;
    const cls = heroClass(h);
    let top = hdr.bottom + 3;
    const all = this.src.heroes();
    const idx = Math.max(0, all.findIndex((x) => x.id === this.heroId));
    layChips(L, [new InfoChip(this, 0, 0, { icon: 'power', value: powerRating(h), word: t('strat.power'), tip: t('hero.powerTip'), id: 'hero.power' })], 4, top, VW - 8 - 84);
    if (all.length > 1) L.add(new Pager(this, VW - 4 - 80, top - 1, { index: idx, count: all.length, onPrev: () => this.cycleHero(-1), onNext: () => this.cycleHero(1), prevTip: t('hero.prev'), nextTip: t('hero.next') }));
    top += 22 + 3;
    // hurt: the one thing worth a line of its own (points and perks are badges on their tabs)
    if (h.wound > 0) {
      const th = addTipLine(this, L, 4, top, VW - 8, { text: t('hero.woundedTip', { h: Math.ceil(h.wound) }), tone: 'warn', icon: 'heart', maxLines: 1 });
      top += th + 3;
    }
    const y0 = top;
    const headBg = this.add.container(0, 0);
    L.add(headBg);
    let y: number;
    if (!compact) {
      // the stage between two columns of slots (swipe it for the next hero)
      const ss = 28;
      const stageH = VH >= 400 ? 124 : 112;
      const sgap = Math.floor((stageH - 3 * ss) / 2);
      const sx0 = 4 + ss + 4;
      const sw = VW - 2 * sx0;
      L.add(new Stage(this, sx0, y0, sw, stageH, h, { scale: 2 }));
      this.swipeZone(L, sx0, y0, sw, stageH);
      (['helmet', 'armor', 'trinket'] as Slot[]).forEach((s, i) => this.slot(L, 4, y0 + i * (ss + sgap), s, h, ss));
      (['weapon', 'shield'] as Slot[]).forEach((s, i) => this.slot(L, VW - 4 - ss, y0 + i * (ss + sgap), s, h, ss));
      addMountTile(this, L, VW - 4 - ss, y0 + 2 * (ss + sgap), h, ss);
      addChip(this, L, sx0 + 3, y0 + 3, t('hero.level', { n: h.level }), 0x5c4325);
      addStars(this, L, sx0 + sw - 3 - 39, y0 + 5, heroStars(h));
      y = y0 + stageH + 4;
      // class, role, traits
      L.add(addText(this, 5, y + 1, ellipsize(className(h), VW - 10, false, 7, 'head'), 'head'));
      y += 12;
      const chipW = addChip(this, L, 5, y, roleName(cls.role), roleColor(cls.role), Math.floor(VW / 2));
      const traits = h.traits.map((k) => tOr(`trait.${k}.name`, TRAITS[k].name)).join(', ');
      if (traits) L.add(addText(this, 5 + chipW + 4, y + 2, ellipsize(traits, VW - 14 - chipW - 4), 'sec'));
      y += 15;
      const need = xpToNext(h.level);
      const xp = new ProgressBar(this, 5, y, VW - 10, { value: h.xp, max: need, h: 4, color: RESOURCES.xp.color, label: t('hero.xpTo', { n: h.level + 1 }), right: t('hero.xp', { xp: Math.floor(h.xp), need }) });
      L.add(xp);
      y += xp.h + 5;
    } else {
      // short screens: a small stage beside the identity, the slots in one row below
      const sw = 50;
      const stageH = 60;
      L.add(new Stage(this, 4, y0, sw, stageH, h, { scale: 1 }));
      this.swipeZone(L, 4, y0, sw, stageH);
      const tx = 4 + sw + 5;
      const tw = VW - tx - 5;
      L.add(addText(this, tx, y0 + 1, ellipsize(className(h), tw, false, 7, 'head'), 'head'));
      addChip(this, L, tx, y0 + 12, roleName(cls.role), roleColor(cls.role), tw);
      const lvW = addChip(this, L, tx, y0 + 26, t('hero.level', { n: h.level }), 0x5c4325, 40);
      addStars(this, L, tx + lvW + 4, y0 + 28, heroStars(h));
      const need = xpToNext(h.level);
      L.add(new ProgressBar(this, tx, y0 + 42, tw, { value: h.xp, max: need, h: 4, color: RESOURCES.xp.color }));
      y = y0 + stageH + 3;
      const slots: Slot[] = ['weapon', 'shield', 'helmet', 'armor', 'trinket'];
      const n = slots.length + (cls.mount ? 1 : 0);
      const ss = Math.min(24, Math.floor((VW - 8 - (n - 1) * SIZE.gap) / n));
      const step = Math.floor((VW - 8 - ss) / (n - 1));
      slots.forEach((s, i) => this.slot(L, 4 + i * step, y, s, h, ss));
      if (cls.mount) addMountTile(this, L, 4 + slots.length * step, y, h, ss);
      y += ss + 4;
    }
    headBg.add(addPanel(this, 0, y0 - 2, VW, y - y0 + 2, 'header'));
    y += 2;

    // tabs, badged with what there is to spend
    const perkFree = Math.max(0, perkSlots(h.level) - h.perks.length);
    this.tabs = new Tabs(this, 4, y, VW - 8, TABS.map((k) => t(`hero.tab.${k}` as TKey)), {
      selected: TABS.indexOf(this.tab),
      ids: TABS.map((k) => `hero.tab.${k}`),
      icons: compact ? ['plus', 'shield', 'aura', 'bash'] : undefined,
      onChange: (i) => this.setTab(TABS[i]),
    });
    L.add(this.tabs);
    if (h.points > 0) this.tabs.badge(0, h.points);
    if (perkFree > 0) this.tabs.badge(2, perkFree);
    this.pageTop = y + SIZE.tabH + 5;
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

  /** Bottom edge of the page (the strip starts there). */
  private pageBottom(): number {
    return (this.strip?.top ?? this.m.VH) - 2;
  }

  /** The header and its chips are rebuilt with the sheet: nothing to refresh on its own. */
  private refreshSituation(): void {}

  /** The strip: only while points wait to be confirmed (Confirm is the one red action, Undo beside it); the pager moves between heroes. */
  private refreshStrip(): void {
    if (!this.strip) return;
    const pend = this.tab === 'stats' && this.spent() > 0;
    this.strip.set(
      pend
        ? {
            main: { label: t('hero.strip.confirm', { n: this.spent() }), icon: 'check', id: 'hero.confirm', onClick: () => this.confirmPoints() },
            right: { label: t('hero.undo'), icon: 'back', id: 'hero.undo', onClick: () => this.resetPoints() },
          }
        : {},
    );
  }

  private slot(L: Phaser.GameObjects.Container, x: number, y: number, slot: Slot, h: Hero, size: number): void {
    const o = addSlotTile(this, L, x, y, slot, h.equip[slot], { size, onTap: () => this.tapSlot(slot) });
    this.slotRects.set(slot, o);
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    fadeIn(this, this.page);
    this.buildPage();
  }

  private clearPage(): void {
    for (const a of this.areas) a.destroy();
    this.areas = [];
    this.stash = null;
    this.drag.targets = [];
    this.drag.cancel();
    this.page.removeAll(true);
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
    const { VW, S } = this.m;
    const a = new ScrollArea(this, this.page, 4, y, VW - 8, h, S);
    this.areas.push(a);
    addScrollHint(this, this.page, a);
    return a;
  }

  // ------------------------------------------------------------------ stats: attributes with a live preview

  private buildStats(h: Hero): void {
    const { VW } = this.m;
    const pend = this.spent() > 0;
    const free = h.points - this.spent();
    const top = this.pageTop;
    const area = this.scrollArea(top, this.pageBottom() - top);
    const c = area.content;
    const w = VW - 8 - 3;
    let y = 0;
    // points header (it may wrap on narrow screens: the rows below start after it)
    const head = wrapText(free > 0 ? t('hero.points', { n: free }) : h.points > 0 ? t('hero.preview') : t('hero.noPoints'), w, 2);
    c.add(addText(this, 0, y + 1, head.lines.join('\n'), free > 0 ? 'reward' : 'sec'));
    y += 2 + head.lines.length * LINE_H;
    const next = previewAttrs(h, this.pending);
    ATTR_IDS.forEach((k) => {
      c.add(addPanel(this, 0, y, w, 33, 'card'));
      c.add(addText(this, 5, y + 4, t(`attr.${k}.short` as TKey), 'head'));
      const val = h.attrs[k] + this.pending[k];
      c.add(addText(this, 40, y + 4, `${val}`, this.pending[k] ? 'good' : 'ink', 1));
      // the steppers only while there are points to spend (or pending ones to take back)
      const spendable = h.points > 0;
      const descW = w - 46 - (spendable ? 2 * 24 + SIZE.gap + 6 : 4);
      c.add(addText(this, 45, y + 4, ellipsize(t(`attr.${k}` as TKey), descW), 'ink'));
      const dw = wrapText(t(`attr.${k}.desc` as TKey), descW, 2, false, 6);
      c.add(addText(this, 45, y + 14, dw.lines.join('\n'), 'sec').setFontSize(6).setLineSpacing(-1));
      if (spendable) {
        const minus = new Button(this, w - 2 * 24 - SIZE.gap - 1, y + 5, 24, 22, { label: '-', tip: t('hero.lower'), id: `attr.${k}.minus`, onClick: () => this.removePoint(k) });
        minus.setEnabled(this.pending[k] > 0, t('hero.lowerNothing'));
        const plus = new Button(this, w - 24 - 1, y + 5, 24, 22, { label: '+', tip: t('hero.raise'), id: `attr.${k}.plus`, onClick: () => this.addPoint(k) });
        plus.setEnabled(free > 0 && val < ATTR_MAX, free > 0 ? t('hero.attrMax', { n: ATTR_MAX }) : t('hero.allSpent'));
        c.add([minus, plus]);
      }
      y += 33 + SIZE.gap;
    });
    y += 4;
    // every derived stat, previewing the pending points
    const cur = computeStats(h);
    const nxt = computeStats(next);
    for (const id of sheetStats(cur)) {
      const d = STATS[id];
      const sb = new StatBar(this, 0, y, w, { label: t(`stat.${id}` as TKey), max: d.max, color: barColor(id), tip: t(`stat.${id}.tip` as TKey), format: (v) => fmtStat(id, v), lowerIsBetter: d.lowerIsBetter });
      sb.set(d.get(cur), pend ? d.get(nxt) : undefined);
      c.add(sb);
      y += 22 + SIZE.gap;
    }
    // record and traits
    y += 4;
    y = addSection(this, c, 0, y, w, t('hero.record'));
    const rec = `${t('hero.kills')} ${h.kills}   ${t('hero.battles')} ${h.battles}`;
    c.add(addText(this, 0, y, ellipsize(rec, w), 'ink'));
    y += 11;
    c.add(addText(this, 0, y, (h.wound > 0 ? t('hero.wounded', { h: Math.ceil(h.wound) }) : t('hero.fit')), h.wound > 0 ? 'bad' : 'good'));
    y += 15;
    y = addSection(this, c, 0, y, w, t('hero.traits'));
    if (!h.traits.length) {
      c.add(addText(this, 0, y, t('hero.noTraits'), 'muted'));
      y += 11;
    }
    for (const k of h.traits) {
      const tr = TRAITS[k];
      c.add(addText(this, 0, y, ellipsize(tOr(`trait.${k}.name`, tr.name), w), tr.negative ? 'bad' : 'ink'));
      const wr = wrapText(tOr(`trait.${k}.desc`, tr.desc), w - 6, 2);
      c.add(addText(this, 6, y + 10, wr.lines.join('\n'), 'sec'));
      y += 10 + wr.lines.length * LINE_H + 3;
    }
    const rs = this.src.respec;
    if (rs) {
      // duel heroes: buy back every attribute point and perk
      y += 4;
      const price = rs.price(h);
      const b = new Button(this, 0, y, w, SIZE.btnH, {
        label: t('hero.respec', { n: price }),
        icon: 'back',
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
      });
      b.setEnabled(h.level > 1 || h.perks.length > 0, t('hero.respecNothing'));
      c.add(b);
      y += SIZE.btnH + 4;
    }
    area.setContentHeight(y + 4);
    frameScrollTexts(area, VW - 8);
    this.refreshSituation();
    this.refreshStrip();
  }

  // ------------------------------------------------------------------ gear: the stash for this hero

  private buildGear(): void {
    const { VW } = this.m;
    const top = this.pageTop;
    this.stash = new StashGrid(this, this.page, 4, top, VW - 8, this.pageBottom() - top, {
      items: () => this.src.stash(),
      state: this.stashState,
      hero: () => this.hero(),
      drag: this.drag,
      onTap: (it) => this.openStashItem(it),
    });
    this.areas.push(this.stash);
    // drop targets: the slots around the stage
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
      this.tabs?.select(TABS.indexOf('gear'), false);
      this.buildPage();
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
        { label: t('stash.equip'), icon: 'check', variant: 'primary' as const, id: 'stash.equip', onClick: () => this.equip(it) },
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
    const { VW } = this.m;
    const top = this.pageTop;
    const tree = heroTree({ cls: heroClass(h).id });
    const area = this.scrollArea(top, this.pageBottom() - top);
    const c = area.content;
    const w = VW - 8 - 3;
    const free = Math.max(0, perkSlots(h.level) - h.perks.length);
    let y = 0;
    const nextLvl = PERK_LEVELS.find((l) => l > h.level);
    const head = free > 0 ? t('hero.perk.free', { n: free }) : nextLvl ? t('hero.perk.nextAt', { n: nextLvl }) : t('hero.perkTree', { cls: className(h) });
    c.add(addText(this, w / 2, y + 1, ellipsize(head, w), free > 0 ? 'reward' : 'sec', 0.5));
    y += 13;
    const rowH = 49;
    const g = this.add.graphics();
    c.add(g);
    tree.forEach((id, i) => {
      const p = PERKS[id];
      const known = h.perks.includes(id);
      const blocker = perkBlocker(h, id);
      const open = !known && blocker === null;
      const ry = y + i * (rowH + SIZE.gap);
      // the trunk joining the nodes: gold through what is learned
      if (i > 0) {
        g.fillStyle(known ? ACCENT.gold : SURFACE.line, 1);
        g.fillRect(28 + 11, ry - SIZE.gap - 6, 3, SIZE.gap + 8);
      }
      c.add(addPanel(this, 0, ry, w, rowH, known ? 'cardSel' : open ? 'cardRaised' : 'cardLocked'));
      // the level it needs, on the left
      c.add(addText(this, 9, ry + 18, `${PERK_LEVELS[i]}`, h.level >= PERK_LEVELS[i] ? 'ink' : 'muted', 0.5));
      if (open) addClaimGlow(this, c, 26, ry + 11, 26, 24);
      const node = new Button(this, 26, ry + 11, 26, 24, {
        icon: perkIcon(p),
        label: tOr(`perk.${id}.name`, p.name),
        iconOnly: true,
        style: known ? 'buttonSel' : undefined,
        variant: known || open ? undefined : 'ghost',
        id: `perk:${id}`,
        onClick: () => this.openPerk(h, p, tree),
      });
      c.add(node);
      const pip = this.add.graphics();
      pip.fillStyle(TREES[p.tree].color, 1);
      pip.fillRect(17, ry + 5, 3, rowH - 10);
      c.add(pip);
      const tx = 57;
      const tw = w - tx - 6;
      // name, then its state on a line of its own (never cut), then what it does
      c.add(addText(this, tx, ry + 5, ellipsize(tOr(`perk.${id}.name`, p.name), tw), known ? 'head' : open ? 'ink' : 'sec'));
      const status = known ? t('hero.perk.learned') : open ? t('hero.perk.available') : blocker ? blockerText(blocker, tree, i) : '';
      if (!known && !open) c.add(scaleIcon(addIcon(this, tx, ry + 15, 'lock', 'D'), 0.75));
      if (known) c.add(scaleIcon(addIcon(this, tx, ry + 15, 'check'), 0.75));
      c.add(addText(this, tx + 11, ry + 16, ellipsize(status, tw - 11), known ? 'good' : open ? 'reward' : 'muted'));
      const wr = wrapText(tOr(`perk.${id}.desc`, p.desc), tw, 2);
      c.add(addText(this, tx, ry + 26, wr.lines.join('\n'), known || open ? 'sec' : 'muted'));
      const z = this.add.zone(tx - 2, ry, w - tx + 2, rowH).setOrigin(0, 0).setInteractive();
      uiId(z, `perkrow:${id}`);
      z.on('pointerup', () => !area.moved && this.openPerk(h, p, tree));
      c.add(z);
    });
    y += tree.length * (rowH + SIZE.gap) + 4;
    const note = wrapText(t('hero.abilityUse'), w, 2);
    c.add(addText(this, 0, y, note.lines.join('\n'), 'muted'));
    y += note.lines.length * LINE_H;
    area.setContentHeight(y + 4);
    frameScrollTexts(area, VW - 8);
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
    const m = openModal(this, { title: name, w, h: 26 + 16 + body.lines.length * LINE_H + 12 + SIZE.btnH + 12 });
    const { c, x, y } = m;
    c.add(addIcon(this, x + 10, y + 24, perkIcon(p)));
    c.add(addText(this, x + 26, y + 26, ellipsize(`${tOr(`tree.${p.tree}`, TREES[p.tree].name)} · ${t('hero.level', { n: PERK_LEVELS[tier] })}`, w - 36), 'dim'));
    c.add(addText(this, x + 10, y + 40, body.lines.join('\n'), 'ink'));
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
    const { VW } = this.m;
    const top = this.pageTop;
    const s = computeStats(h);
    const tree = heroTree({ cls: heroClass(h).id });
    type Row = { kind: 'ability' | 'aura'; id: AbilityId | AuraId; has: boolean; source: string };
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
      const when = h.level < PERK_LEVELS[i] ? t('hero.perk.unlocksAt', { n: PERK_LEVELS[i] }) : t('hero.fromPerk', { name: tOr(`perk.${id}.name`, p.name) });
      if (p.ability && !s.abilities.includes(p.ability)) rows.push({ kind: 'ability', id: p.ability, has: false, source: when });
      if (p.aura && !s.auras.includes(p.aura)) rows.push({ kind: 'aura', id: p.aura, has: false, source: when });
    });
    if (!rows.length) {
      this.page.add(addEmptyState(this, 4, top, VW - 8, this.pageBottom() - top, { icon: 'bash', title: t('hero.noAbilities'), hint: t('hero.noAbilitiesHint'), action: { label: t('hero.tab.perks'), icon: 'aura', onClick: () => this.tabs?.select(2) } }));
      return;
    }
    const area = this.scrollArea(top, this.pageBottom() - top);
    const c = area.content;
    const w = VW - 8 - 3;
    let y = 0;
    for (const r of rows) {
      const isAb = r.kind === 'ability';
      const def = isAb ? ABILITIES[r.id as AbilityId] : AURAS[r.id as AuraId];
      const name = isAb ? tOr(`ability.${r.id}.name`, def.name) : tOr(`aura.${r.id}.name`, def.name);
      const desc = isAb ? tOr(`ability.${r.id}.desc`, def.desc) : tOr(`aura.${r.id}.desc`, def.desc);
      const wr = wrapText(desc, w - 34, 4);
      const hh = Math.max(36, 26 + wr.lines.length * LINE_H + 2);
      c.add(addPanel(this, 0, y, w, hh, r.has ? 'card' : 'cardLocked'));
      // the ability's own picture on a gold tile; a skill not learned yet: dimmed in a well, with a lock
      c.add(addPanel(this, 4, y + 4, 24, 24, r.has ? 'thumb' : 'well'));
      const icon = isAb ? (def as (typeof ABILITIES)[AbilityId]).icon : `aura_${r.id}`;
      c.add(addIcon(this, 10, y + 10, icon, r.has ? '' : 'D'));
      if (!r.has) c.add(scaleIcon(addIcon(this, 20, y + 20, 'lock', 'D'), 0.67));
      let right = w - 4;
      if (isAb) {
        const cd = Math.round((def as (typeof ABILITIES)[AbilityId]).cooldown * s.cdMult);
        const cw = addChip(this, c, w - 4, y + 4, t('hero.cooldownShort', { n: cd }), 0x3a2f25, 60, true);
        right = w - 4 - cw - 4;
      }
      c.add(addText(this, 32, y + 5, ellipsize(name, right - 32), r.has ? 'head' : 'sec'));
      c.add(addText(this, 32, y + 15, ellipsize(`${isAb ? t('hero.ability') : t('hero.aura')}${r.source ? ' · ' + r.source : ''}`, w - 36), r.has ? 'reward' : 'muted'));
      c.add(addText(this, 32, y + 26, wr.lines.join('\n'), r.has ? 'ink' : 'muted'));
      y += hh + SIZE.gap;
    }
    const note = wrapText(`${t('hero.abilityUse')} ${t('hero.auraUse')}`, w, 3);
    c.add(addText(this, 0, y + 2, note.lines.join('\n'), 'muted'));
    y += 2 + note.lines.length * LINE_H;
    area.setContentHeight(y + 4);
    frameScrollTexts(area, VW - 8);
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
    this.build();
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

