import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, Meter, ScrollArea, addIcon, addPanel, addText } from '../ui/kit';
import { StatBar, Tabs, addEmptyState, addScrollHint, confirmDialog, firstTimeHint, openModal, showTooltip, toast } from '../ui/widgets';
import { uiId } from '../ui/layout';
import { ellipsize, wrapText, LINE_H } from '../ui/textfit';
import { SIZE, COLOR, CATEGORY_COLOR } from '../ui/theme';
import { CommandStrip, SituationBar, type SitNumber } from '../ui/strategos';
import { ensureFonts } from '../ui/fonts';
import {
  DragDrop, Stage, StashGrid, addChip, addTabBadge, frameScrollTexts, addMountTile, addSlotTile, addStars, className, defaultStashState, itemName, openItemCard, roleColor, roleName,
  uiBoundsOf, type StashState,
} from '../ui/sheet';
import { P } from '../art/palette';
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
  private sit: SituationBar | null = null;
  private strip: CommandStrip | null = null;

  constructor() {
    super('Hero');
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
    this.ui.add(this.add.rectangle(0, 0, VW, VH, P.bg).setOrigin(0, 0));
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
    // the situation bar: who he is and what there is to spend; the strip below: back, confirm / next hero, previous
    this.sit?.destroy();
    this.sit = new SituationBar(this, VW, { sentence: '', compact: this.compact, id: 'hero.situation' });
    L.add(this.sit);
    this.refreshSituation();
    this.refreshStrip();
    if (!h) return;

    // dark header: the stage with the slots, identity, XP (a parchment page below)
    const compact = this.compact;
    const cls = heroClass(h);
    const top = this.sit!.bottom;
    const y0 = top + 3;
    const headBg = this.add.container(0, 0);
    L.add(headBg);
    let y: number;
    if (!compact) {
      // the stage between two columns of slots
      const ss = 28;
      const stageH = VH >= 400 ? 124 : 112;
      const sgap = Math.floor((stageH - 3 * ss) / 2);
      const sx0 = 4 + ss + 4;
      const sw = VW - 2 * sx0;
      L.add(new Stage(this, sx0, y0, sw, stageH, h, { scale: 2 }));
      (['helmet', 'armor', 'trinket'] as Slot[]).forEach((s, i) => this.slot(L, 4, y0 + i * (ss + sgap), s, h, ss));
      (['weapon', 'shield'] as Slot[]).forEach((s, i) => this.slot(L, VW - 4 - ss, y0 + i * (ss + sgap), s, h, ss));
      addMountTile(this, L, VW - 4 - ss, y0 + 2 * (ss + sgap), h, ss);
      addChip(this, L, sx0 + 3, y0 + 3, t('hero.level', { n: h.level }), 0x8c2f25);
      addStars(this, L, sx0 + sw - 3 - 39, y0 + 5, heroStars(h));
      if (h.wound > 0) this.woundChip(L, sx0 + 3, y0 + stageH - 16, sw - 6);
      y = y0 + stageH + 4;
      // class and power
      const pwW = this.power(L, VW - 5, y, h);
      L.add(addText(this, 5, y + 1, ellipsize(className(h), VW - 14 - pwW - 4), 'gold'));
      y += 12;
      const chipW = addChip(this, L, 5, y, roleName(cls.role), roleColor(cls.role), Math.floor(VW / 2));
      const traits = h.traits.map((k) => tOr(`trait.${k}.name`, TRAITS[k].name)).join(', ');
      if (traits) L.add(addText(this, 5 + chipW + 4, y + 2, ellipsize(traits, VW - 14 - chipW - 4), 'title'));
      y += 14;
      const need = xpToNext(h.level);
      const xpT = addText(this, VW - 5, y, t('hero.xp', { xp: Math.floor(h.xp), need }), 'title', 1);
      L.add(xpT);
      L.add(new Meter(this, 5, y + 2, VW - 10 - xpT.width - 4, 5, COLOR.xp).setValue(h.xp, need));
      y += 12;
    } else {
      // short screens: a small stage beside the identity, the slots in one row below
      const sw = 50;
      const stageH = 60;
      L.add(new Stage(this, 4, y0, sw, stageH, h, { scale: 1 }));
      if (h.wound > 0) this.woundChip(L, 6, y0 + stageH - 15, sw - 4);
      const tx = 4 + sw + 5;
      const tw = VW - tx - 5;
      L.add(addText(this, tx, y0 + 1, ellipsize(className(h), tw), 'gold'));
      addChip(this, L, tx, y0 + 12, roleName(cls.role), roleColor(cls.role), tw);
      const lvW = addChip(this, L, tx, y0 + 26, t('hero.level', { n: h.level }), 0x8c2f25, 40);
      addStars(this, L, tx + lvW + 4, y0 + 28, heroStars(h));
      const need = xpToNext(h.level);
      L.add(new Meter(this, tx, y0 + 40, tw, 4, COLOR.xp).setValue(h.xp, need));
      L.add(addText(this, VW - 5, y0 + 48, ellipsize(t('hero.power', { n: powerRating(h) }), tw), 'title', 1));
      y = y0 + stageH + 3;
      const slots: Slot[] = ['weapon', 'shield', 'helmet', 'armor', 'trinket'];
      const n = slots.length + (cls.mount ? 1 : 0);
      const ss = Math.min(24, Math.floor((VW - 8 - (n - 1) * SIZE.gap) / n));
      const step = Math.floor((VW - 8 - ss) / (n - 1));
      slots.forEach((s, i) => this.slot(L, 4 + i * step, y, s, h, ss));
      if (cls.mount) addMountTile(this, L, 4 + slots.length * step, y, h, ss);
      y += ss + 4;
    }
    headBg.add(addPanel(this, 0, top, VW, y - top + 1, 'dark'));
    y += 2;
    // the page under the tabs is parchment, down to the strip
    headBg.add(addPanel(this, 0, y + SIZE.tabH - 2, VW, this.pageBottom() - y - SIZE.tabH + 2, 'parch'));

    // tabs with badges for what there is to spend
    const perkFree = Math.max(0, perkSlots(h.level) - h.perks.length);
    this.tabs = new Tabs(this, 4, y, VW - 8, TABS.map((k) => t(`hero.tab.${k}` as TKey)), {
      selected: TABS.indexOf(this.tab),
      ids: TABS.map((k) => `hero.tab.${k}`),
      icons: compact ? ['plus', 'shield', 'star', 'bash'] : undefined,
      onChange: (i) => this.setTab(TABS[i]),
    });
    L.add(this.tabs);
    if (h.points > 0) addTabBadge(this, L, 4, y, VW - 8, TABS.length, 0, h.points);
    if (perkFree > 0) addTabBadge(this, L, 4, y, VW - 8, TABS.length, 2, perkFree);
    this.pageTop = y + SIZE.tabH + 4;
    this.buildPage();
  }

  /** Bottom edge of the page (the strip starts there). */
  private pageBottom(): number {
    return (this.strip?.top ?? this.m.VH) - 2;
  }

  /** The sentence: who he is, what there is to spend (or that he is hurt); numbers: power, points, perks. */
  private refreshSituation(): void {
    const h = this.hero();
    if (!this.sit) return;
    if (!h) {
      this.sit.setSentence(t('hero.title'));
      return;
    }
    const perkFree = Math.max(0, perkSlots(h.level) - h.perks.length);
    const free = h.points - this.spent();
    const parts = [t('hero.sit.who', { name: h.name, lv: h.level, cls: className(h) })];
    if (free > 0) parts.push(t('hero.sit.points', { n: free }));
    if (perkFree > 0) parts.push(t('hero.sit.perks', { n: perkFree }));
    if (h.wound > 0) parts.push(t('hero.sit.hurt', { h: Math.ceil(h.wound) }));
    if (free <= 0 && perkFree <= 0 && h.wound <= 0) parts.push(t('hero.sit.fine'));
    const nums: SitNumber[] = [{ icon: 'star', value: `${powerRating(h)}`, word: t('strat.power'), tip: t('hero.powerTip') }];
    if (free > 0) nums.push({ icon: 'plus', value: `${free}`, word: t('hero.points', { n: free }).replace(/^\d+\s*/, ''), tip: t('hero.pointsTip'), font: 'good' });
    if (perkFree > 0) nums.push({ icon: 'star', value: `${perkFree}`, word: t('hero.tab.perks').toLowerCase(), font: 'good' });
    this.sit.setSentence(parts.join(' '), free > 0 || perkFree > 0);
    this.sit.setNumbers(nums);
  }

  /** The strip: back; confirm the pending points (stats) or the next hero; undo or the previous hero. */
  private refreshStrip(): void {
    if (!this.strip) return;
    const h = this.hero();
    const many = this.src.heroes().length > 1;
    const pend = this.tab === 'stats' && this.spent() > 0;
    const next = this.src.heroes()[(this.src.heroes().findIndex((x) => x.id === this.heroId) + 1) % Math.max(1, this.src.heroes().length)];
    this.strip.set({
      left: { label: t('strat.back'), icon: 'back', id: 'hero.back', onClick: () => this.back() },
      main: pend
        ? { label: t('hero.strip.confirm', { n: this.spent() }), icon: 'check', id: 'hero.confirm', onClick: () => this.confirmPoints() }
        : many && h
          ? { label: `${t('strat.next')}: ${next?.name ?? ''}`, icon: 'people', secondary: true, tip: t('hero.next'), id: 'hero.next', onClick: () => this.cycleHero(1) }
          : null,
      right: pend
        ? { label: t('hero.undo'), icon: 'back', id: 'hero.undo', onClick: () => this.resetPoints() }
        : many
          ? { label: t('strat.prev'), icon: 'back', tip: t('hero.prev'), id: 'hero.prev', onClick: () => this.cycleHero(-1) }
          : null,
    });
  }

  /** "Power N" (tap: what it means), right-aligned at x; returns its width. */
  private power(L: Phaser.GameObjects.Container, x: number, y: number, h: Hero): number {
    const txt = addText(this, x, y + 1, t('hero.power', { n: powerRating(h) }), 'title', 1);
    const z = this.add.zone(x - txt.width - 2, y - 5, txt.width + 4, 22).setOrigin(0, 0).setInteractive();
    uiId(z, 'hero.power');
    z.on('pointerup', () => showTooltip(this, t('hero.powerTip'), z));
    L.add([z, txt]);
    return txt.width;
  }

  private woundChip(L: Phaser.GameObjects.Container, x: number, y: number, w: number): void {
    const h = this.hero()!;
    const z = this.add.zone(x - 1, y - 5, w + 2, 22).setOrigin(0, 0).setInteractive();
    uiId(z, 'hero.wound');
    z.on('pointerup', () => showTooltip(this, t('hero.woundedTip', { h: Math.ceil(h.wound) }), z));
    L.add(z);
    addChip(this, L, x, y, t('hero.wounded', { h: Math.ceil(h.wound) }), COLOR.bad, w);
  }

  private slot(L: Phaser.GameObjects.Container, x: number, y: number, slot: Slot, h: Hero, size: number): void {
    const o = addSlotTile(this, L, x, y, slot, h.equip[slot], { size, onTap: () => this.tapSlot(slot) });
    this.slotRects.set(slot, o);
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
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
    c.add(addText(this, 0, y + 1, head.lines.join('\n'), free > 0 ? 'gold' : 'dim'));
    y += 2 + head.lines.length * LINE_H;
    const next = previewAttrs(h, this.pending);
    ATTR_IDS.forEach((k) => {
      c.add(addPanel(this, 0, y, w, 25, 'inset'));
      c.add(addText(this, 5, y + 4, t(`attr.${k}.short` as TKey), 'red'));
      const val = h.attrs[k] + this.pending[k];
      c.add(addText(this, 40, y + 4, `${val}`, this.pending[k] ? 'good' : 'ink', 1));
      const descW = w - 46 - 2 * 24 - SIZE.gap - 6;
      c.add(addText(this, 45, y + 4, ellipsize(t(`attr.${k}` as TKey), descW), 'ink'));
      c.add(addText(this, 45, y + 14, ellipsize(t(`attr.${k}.desc` as TKey), descW), 'dim'));
      const minus = new Button(this, w - 2 * 24 - SIZE.gap - 1, y + 2, 24, 22, { label: '-', tip: t('hero.lower'), id: `attr.${k}.minus`, onClick: () => this.removePoint(k) });
      minus.setEnabled(this.pending[k] > 0, t('hero.noPoints'));
      const plus = new Button(this, w - 24 - 1, y + 2, 24, 22, { label: '+', tip: t('hero.raise'), id: `attr.${k}.plus`, variant: free > 0 && val < ATTR_MAX ? 'primary' : 'secondary', onClick: () => this.addPoint(k) });
      plus.setEnabled(free > 0 && val < ATTR_MAX, free > 0 ? `${ATTR_MAX}` : t('hero.noPoints'));
      c.add([minus, plus]);
      y += 25 + SIZE.gap;
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
    c.add(addText(this, 0, y, t('hero.record'), 'red'));
    y += 11;
    const rec = `${t('hero.kills')} ${h.kills}   ${t('hero.battles')} ${h.battles}`;
    c.add(addText(this, 0, y, ellipsize(rec, w), 'ink'));
    y += 11;
    c.add(addText(this, 0, y, (h.wound > 0 ? t('hero.wounded', { h: Math.ceil(h.wound) }) : t('hero.fit')), h.wound > 0 ? 'red' : 'good'));
    y += 13;
    c.add(addText(this, 0, y, t('hero.traits'), 'red'));
    y += 11;
    if (!h.traits.length) {
      c.add(addText(this, 0, y, t('hero.noTraits'), 'dim'));
      y += 11;
    }
    for (const k of h.traits) {
      const tr = TRAITS[k];
      c.add(addText(this, 0, y, ellipsize(tOr(`trait.${k}.name`, tr.name), w), tr.negative ? 'red' : 'ink'));
      const wr = wrapText(tOr(`trait.${k}.desc`, tr.desc), w - 6, 2);
      c.add(addText(this, 6, y + 10, wr.lines.join('\n'), 'dim'));
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
    c.add(addText(this, w / 2, y + 1, ellipsize(head, w), free > 0 ? 'gold' : 'dim', 0.5));
    y += 13;
    const rowH = 34;
    const g = this.add.graphics();
    c.add(g);
    tree.forEach((id, i) => {
      const p = PERKS[id];
      const known = h.perks.includes(id);
      const blocker = perkBlocker(h, id);
      const open = !known && blocker === null;
      const ry = y + i * (rowH + SIZE.gap);
      // the trunk joining the nodes
      if (i > 0) {
        g.fillStyle(known ? P.red : 0x8a7a6a, 1);
        g.fillRect(28 + 11, ry - SIZE.gap - 6, 3, SIZE.gap + 8);
      }
      c.add(addPanel(this, 0, ry, w, rowH, known ? 'parch' : open ? 'parch' : 'inset'));
      // level requirement on the left
      c.add(addText(this, 8, ry + 13, `${PERK_LEVELS[i]}`, h.level >= PERK_LEVELS[i] ? 'ink' : 'dim', 0.5));
      // node button with the perk icon
      const node = new Button(this, 26, ry + 5, 26, 24, {
        icon: perkIcon(p),
        label: tOr(`perk.${id}.name`, p.name),
        iconOnly: true,
        style: known ? 'buttonSel' : 'button',
        id: `perk:${id}`,
        onClick: () => this.openPerk(h, p, tree),
      });
      if (!known && !open) {
        // locked: dimmed, still opens the perk's card
        const dim = this.add.rectangle(27, ry + 6, 24, 21, 0x6e5a44, 0.45).setOrigin(0, 0);
        node.add(dim.setPosition(1, 1));
      }
      c.add(node);
      if (open) {
        const ring = this.add.rectangle(25, ry + 4, 28, 26).setOrigin(0, 0).setStrokeStyle(2, P.gold);
        c.add(ring);
        this.tweens.add({ targets: ring, alpha: { from: 1, to: 0.25 }, duration: 520, yoyo: true, repeat: -1 });
      }
      // tree colour pip
      const pip = this.add.graphics();
      pip.fillStyle(TREES[p.tree].color, 1);
      pip.fillRect(17, ry + 4, 3, rowH - 8);
      c.add(pip);
      const tx = 57;
      const tw = w - tx - 4;
      const status = known ? t('hero.perk.learned') : open ? t('hero.perk.available') : blocker ? blockerText(blocker, tree, i) : '';
      const st = addText(this, w - 4, ry + 4, ellipsize(status, Math.floor(tw / 2)), known ? 'good' : open ? 'gold' : 'dim', 1);
      c.add(st);
      c.add(addText(this, tx, ry + 4, ellipsize(tOr(`perk.${id}.name`, p.name), tw - st.width - 4), known ? 'red' : 'ink'));
      const wr = wrapText(tOr(`perk.${id}.desc`, p.desc), tw, 2);
      c.add(addText(this, tx, ry + 14, wr.lines.join('\n'), 'dim'));
      // the whole row opens the perk too (beside the node)
      const z = this.add.zone(tx - 2, ry, w - tx + 2, rowH).setOrigin(0, 0).setInteractive();
      uiId(z, `perkrow:${id}`);
      z.on('pointerup', () => !area.moved && this.openPerk(h, p, tree));
      c.add(z);
    });
    y += tree.length * (rowH + SIZE.gap) + 4;
    const note = wrapText(t('hero.abilityUse'), w, 2);
    c.add(addText(this, 0, y, note.lines.join('\n'), 'dim'));
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
      icon: known ? 'check' : 'star',
      variant: 'primary',
      id: 'hero.perk.learn',
      onClick: () => {
        m.close();
        confirmDialog(this, { title: t('hero.perk.learnTitle', { name }), body: t('hero.perk.learnBody'), ok: t('hero.perk.learn'), cancel: t('common.cancel'), okIcon: 'star', onOk: () => this.takePerk(p.id) });
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
      if (p.ability && !s.abilities.includes(p.ability)) rows.push({ kind: 'ability', id: p.ability, has: false, source: `${tOr(`perk.${id}.name`, p.name)} · ${t('hero.level', { n: PERK_LEVELS[i] })}` });
      if (p.aura && !s.auras.includes(p.aura)) rows.push({ kind: 'aura', id: p.aura, has: false, source: `${tOr(`perk.${id}.name`, p.name)} · ${t('hero.level', { n: PERK_LEVELS[i] })}` });
    });
    if (!rows.length) {
      this.page.add(addEmptyState(this, 4, top, VW - 8, this.pageBottom() - top, { icon: 'bash', title: t('hero.noAbilities'), hint: t('hero.noAbilitiesHint'), action: { label: t('hero.tab.perks'), icon: 'star', onClick: () => this.tabs?.select(2) } }));
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
      c.add(addPanel(this, 0, y, w, hh, r.has ? 'parch' : 'inset'));
      // gold ability tile (the battle panel's abilities colour)
      const tile = this.add.graphics();
      tile.fillStyle(0x1d140f, 1);
      tile.fillRect(4, y + 4, 24, 24);
      tile.fillStyle(r.has ? CATEGORY_COLOR.abilities : 0x8a7a6a, 1);
      tile.fillRect(5, y + 5, 22, 22);
      c.add(tile);
      c.add(addIcon(this, 10, y + 10, isAb ? (def as (typeof ABILITIES)[AbilityId]).icon : 'aura', r.has ? '' : 'D'));
      let right = w - 4;
      if (isAb) {
        const cd = Math.round((def as (typeof ABILITIES)[AbilityId]).cooldown * s.cdMult);
        const cw = addChip(this, c, w - 4, y + 4, t('hero.cooldownShort', { n: cd }), 0x5a4232, 60, true);
        right = w - 4 - cw - 4;
      }
      c.add(addText(this, 32, y + 5, ellipsize(name, right - 32), r.has ? 'red' : 'dim'));
      c.add(addText(this, 32, y + 15, ellipsize(`${isAb ? t('hero.ability') : t('hero.aura')}${r.source ? ' · ' + r.source : ''}`, w - 36), r.has ? 'gold' : 'dim'));
      c.add(addText(this, 32, y + 26, wr.lines.join('\n'), r.has ? 'ink' : 'dim'));
      y += hh + SIZE.gap;
    }
    const note = wrapText(`${t('hero.abilityUse')} ${t('hero.auraUse')}`, w, 3);
    c.add(addText(this, 0, y + 2, note.lines.join('\n'), 'dim'));
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
  if (p.aura) return 'aura';
  return p.tree === 'hoplite' ? 'shield' : p.tree === 'skirmisher' ? 'spear' : p.tree === 'rider' ? 'advance' : 'swords';
}

function blockerText(b: string, tree: readonly PerkId[], tier: number): string {
  if (b === 'Known') return t('hero.perk.learned');
  if (b === 'No perk point') return t('hero.perk.noPoint');
  if (b.startsWith('Needs Lv')) return t('hero.perk.needsLevel', { n: PERK_LEVELS[tier] });
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

