/**
 * The online army (server-owned): heroes with their gear and battle group,
 * the stash, recruiting, and (opened from a hex) choosing a garrison. Every
 * change is a request; the screen redraws from the server's answer. Same
 * kit and pieces as the campaign army (src/ui/sheet.ts).
 */
import Phaser from 'phaser';
import { BaseScene } from '../BaseScene';
import { addIcon, addText } from '../../ui/kit';
import { MButton, type MButtonVariant, MChip, SegmentedSwitch, SWITCH_H, TAP, mosaicImage } from '../../ui/mosaic';
import { ScrollList, addEmptyState, confirmDialog, toast } from '../../ui/widgets';
import { addSubShell } from './common';
import { openWarSheet } from './warSheet';
import { uiId } from '../../ui/layout';
import { ellipsize } from '../../ui/textfit';
import { SIZE, COLOR } from '../../ui/theme';
import { MOSAIC } from '../../ui/tokens';
import { ensureFonts } from '../../ui/fonts';
import {
  equipRefusal,
  DragDrop, ROMAN, Stage, StashGrid, addChip, addGroupBadge, addSlotTile, addStars, className, defaultStashState, groupName, itemName,
  openClassCard, openItemCard, roleColor, roleName, roleTraits, uiBoundsOf, type StashState,
} from '../../ui/sheet';
import { addEconState } from '../../ui/econ/widgets';
import { addPortrait } from '../../ui/sprites';
import { dollFromHero } from '../../art/paperdoll';
import { hapticNotify } from '../../platform/telegram';
import { isBound, itemDef, normalizeEquip, normalizeItem, salvageValue, SLOTS, type Item, type Slot } from '../../data/items';
import type { Hero } from '../../data/units';
import { heroClass } from '../../sim/stats';
import { Rng } from '../../sim/rng';
import { ONLINE_RULES, RECRUIT_ARCHETYPES } from '../../online/rules';
import { errorText, onlineApi, type OwnedHeroView, type ProfileView, type RegionDetail } from '../../online/client';
import { getMap, hasMap } from '../../online/world';
import { makeHero, type Archetype } from '../../game/heroes';
import { econState, type EconState } from '../../game/economy';
import { heroStars, powerRating } from '../../game/gear';
import { fmtDuration } from './common';
import { t } from '../../i18n';

export class OnlineArmyScene extends BaseScene {
  private profile: ProfileView | null = null;
  private sel: string | null = null;
  private garrisonHex: number | null = null;
  private garrisonPick = new Set<string>();
  private hexDetail: RegionDetail | null = null;
  private st: EconState | 'loading' | 'ready' = 'loading';
  private busy = false;
  private tab: 'roster' | 'stash' = 'roster';
  private head!: Phaser.GameObjects.Container;
  private body!: Phaser.GameObjects.Container;
  private list: ScrollList | null = null;
  private stash: StashGrid | null = null;
  private stashState: StashState = defaultStashState();
  private drag!: DragDrop;
  private slotObjs = new Map<Slot, Phaser.GameObjects.GameObject>();
  private bodyTop = 0;
  /** The content area inside the v4 frame (the head and the body lay out in it), UI px. */
  private cw = 0;
  private ch = 0;

  constructor() {
    super('OnlineArmy');
  }

  create(data: { garrison?: number; tab?: 'roster' | 'stash' }): void {
    this.garrisonHex = data?.garrison ?? null;
    this.garrisonPick = new Set();
    this.profile = null;
    this.sel = null;
    this.st = 'loading';
    this.tab = data?.tab ?? 'roster';
    this.list = null;
    this.stash = null;
    this.initUi();
    ensureFonts(this);
    this.screen({ back: () => this.back() });
    const { content: c } = addSubShell(this, this.garrisonHex !== null ? t('oarmy.garrison') : t('oarmy.title'), () => this.back(), 'oarmy.topbar');
    this.cw = c.w;
    this.ch = c.h;
    this.head = this.add.container(c.x, c.y);
    this.body = this.add.container(c.x, c.y);
    this.ui.add([this.head, this.body]);
    this.drag = new DragDrop(this);
    this.events.once('shutdown', () => this.clearBody());
    this.render();
    void this.fetchData();
  }

  private back(): void {
    this.scene.start('Online', this.garrisonHex !== null ? { focus: this.garrisonHex } : {});
  }

  /** Load from the API, or show a given profile (tests, layout check). */
  async fetchData(given?: ProfileView): Promise<void> {
    try {
      const [p, d] = given ? [given, null] : await Promise.all([onlineApi.profile(), this.garrisonHex !== null ? onlineApi.region(this.garrisonHex) : Promise.resolve(null)]);
      if (!this.sys.isActive()) return;
      for (const oh of p.heroes) normalizeEquip(oh.hero);
      p.stash.forEach((it) => normalizeItem(it));
      this.profile = p;
      this.hexDetail = d;
      this.st = 'ready';
      if (this.garrisonHex !== null) {
        const g = this.garrisonHex;
        this.garrisonPick = new Set(p.heroes.filter((h) => h.garrison === g).map((h) => h.hero.id));
      }
      if (!this.sel || !p.heroes.some((h) => h.hero.id === this.sel)) this.sel = p.heroes[0]?.hero.id ?? null;
    } catch (e) {
      if (!this.sys.isActive()) return;
      this.st = econState(e);
    }
    this.render();
  }

  private async act(fn: () => Promise<unknown>, ok?: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await fn();
      if (ok) {
        hapticNotify('success');
        toast(this, ok, 'good');
      }
      await this.fetchData();
    } catch (e) {
      if (!this.sys.isActive()) return;
      hapticNotify('error');
      toast(this, errorText(e), 'bad');
    } finally {
      this.busy = false;
    }
  }

  private selected(): OwnedHeroView | undefined {
    return this.profile?.heroes.find((x) => x.hero.id === this.sel);
  }

  private get compact(): boolean {
    return this.m.VH < 300;
  }

  // ------------------------------------------------------------------ layout

  private render(): void {
    this.head.removeAll(true);
    this.slotObjs.clear();
    const VW = this.cw;
    const VH = this.ch;
    const H = this.head;
    const p = this.profile;
    // resources: gold, food, energy (chips under the top bar)
    if (p) {
      const parts: { icon: string; value: string }[] = [
        { icon: 'wargold', value: `${Math.floor(p.resources.gold)}` },
        { icon: 'heart', value: `${Math.floor(p.resources.food)}` },
        { icon: 'stamina', value: `${Math.floor(p.energy)}` },
      ];
      const cw = Math.floor((VW - 8 - 2 * 3) / parts.length);
      parts.forEach((o, i) => H.add(new MChip(this, 4 + i * (cw + 3), 2, { ...o, surface: 'stone', w: cw, id: `oarmy.chip.${o.icon}` })));
    }
    if (this.st !== 'ready' || !p) {
      this.clearBody();
      addEconState(this, this.body, 4, 30, VW - 8, VH - 34, this.st as EconState | 'loading', () => {
        this.st = 'loading';
        this.render();
        void this.fetchData();
      });
      return;
    }
    if (this.garrisonHex) this.bodyTop = this.buildGarrisonHead(p);
    else this.bodyTop = this.buildHeroHead(p);
    this.buildBody();
  }

  private buildGarrisonHead(p: ProfileView): number {
    const VW = this.cw;
    const g = this.garrisonHex!;
    const d = this.hexDetail;
    const others = (d?.garrison ?? []).filter((x) => !p.heroes.some((h) => h.hero.id === x.hero.id)).length;
    this.head.add(mosaicImage(this, 3, 26, VW - 6, 26, 'parchment'));
    this.head.add(addText(this, 8, 31, ellipsize(t('oarmy.garrisonHint', { name: this.regionName(g) }), VW - 18), 'pSec'));
    const line = `${t('oarmy.stationed', { n: this.garrisonPick.size + others, max: ONLINE_RULES.maxGarrison })}${others ? ` · ${t('oarmy.clanMates', { n: others })}` : ''}`;
    this.head.add(addText(this, 8, 41, ellipsize(line, VW - 18), 'pInk'));
    return 54;
  }

  private buildHeroHead(p: ProfileView): number {
    const L = this.head;
    const VW = this.cw;
    const oh = this.selected();
    const y0 = 28;
    if (!oh) {
      L.add(mosaicImage(this, 3, 26, VW - 6, 30, 'parchment'));
      return 58;
    }
    const h = oh.hero;
    const compact = this.compact;
    let slotY: number;
    let ss: number;
    if (!compact) {
      const sw = 58;
      const sh = 80;
      L.add(new Stage(this, 4, y0, sw, sh, h, { scale: 1 }));
      const tx = 4 + sw + 5;
      const tw = VW - tx - 5;
      L.add(addText(this, tx, y0 + 1, ellipsize(h.name, tw - 44), 'pInk'));
      addStars(this, L, VW - 5 - 39, y0 + 1, heroStars(h));
      L.add(addText(this, tx, y0 + 11, ellipsize(className(h), tw), 'pSec'));
      const lvW = addChip(this, L, tx, y0 + 21, t('hero.level', { n: h.level }), 0x8c2f25, 40);
      const pw = addText(this, VW - 5, y0 + 23, t('hero.power', { n: powerRating(h) }), 'pInk', 1);
      L.add(pw);
      const status = this.status(oh, p.now);
      if (status) addChip(this, L, tx + lvW + 3, y0 + 21, status.text, status.color, VW - 5 - pw.width - 4 - (tx + lvW + 3));
      const gy = y0 + 36;
      const gw = Math.max(22, Math.min(30, Math.floor((tw - 3 * SIZE.gap) / 4)));
      ROMAN.forEach((r, g) =>
        L.add(
          new MButton(this, tx + g * (gw + SIZE.gap), gy, gw, TAP, {
            label: r,
            variant: h.group === g ? 'secondary' : 'neutral',
            tip: `${t('army.group')} ${r}: ${groupName(g)}. ${t('army.groupTip')}`,
            id: `oarmy.group.${g}`,
            onClick: () => h.group !== g && void this.act(() => onlineApi.army({ [h.id]: g }), t('army.groupSet', { name: h.name, group: groupName(g) })),
          }),
        ),
      );
      const gx = tx + 4 * (gw + SIZE.gap);
      if (VW - 5 - gx > 30) L.add(addText(this, gx + 2, gy + 7, ellipsize(groupName(h.group), VW - 5 - gx - 2), 'pInk'));
      ss = 26;
      slotY = y0 + sh + 4;
    } else {
      L.add(addPortrait(this, dollFromHero(h), 4, y0));
      const tx = 31;
      const tw = VW - tx - 5;
      L.add(addText(this, tx, y0 + 1, ellipsize(h.name, tw - 42), 'pInk'));
      addStars(this, L, VW - 5 - 39, y0 + 1, heroStars(h));
      const lvW = addChip(this, L, tx, y0 + 12, t('hero.level', { n: h.level }), 0x8c2f25, 40);
      const pw = addText(this, VW - 5, y0 + 14, `${powerRating(h)}`, 'pInk', 1);
      L.add(pw);
      const st = this.status(oh, p.now);
      L.add(addText(this, tx + lvW + 3, y0 + 14, ellipsize((st?.text ?? className(h)), VW - 5 - pw.width - 4 - (tx + lvW + 3)), st ? 'pBad' : 'pSec'));
      ss = 22;
      slotY = y0 + 27;
    }
    const n = SLOTS.length;
    ss = Math.min(ss, Math.floor((VW - 4 - (n - 1) * 2) / n));
    const step = Math.min(ss + 8, Math.floor((VW - 4 - ss) / (n - 1)));
    const x0 = Math.round((VW - (ss + step * (n - 1))) / 2);
    SLOTS.forEach((s, i) => this.slotObjs.set(s, addSlotTile(this, L, x0 + i * step, slotY, s, h.equip[s], { size: ss, onTap: () => this.tapSlot(s) })));
    const bottom = slotY + ss + 5;
    L.addAt(mosaicImage(this, 3, 26, VW - 6, bottom - 26 - 1, 'parchment'), 0);
    return bottom;
  }

  private status(oh: OwnedHeroView, now: number): { text: string; color: number } | null {
    if (oh.busy) return { text: t('oarmy.inBattle'), color: 0xd8a840 };
    if (oh.woundedUntil > now) return { text: t('oarmy.wounded', { t: fmtDuration(oh.woundedUntil - now) }), color: COLOR.bad };
    if (oh.garrison !== null) return { text: t('oarmy.holds', { name: this.regionName(oh.garrison) }), color: 0x4a6b9a };
    return null;
  }

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
    const keep = this.list?.area.scrollY ?? 0;
    this.clearBody();
    const p = this.profile!;
    const VW = this.cw;
    const VH = this.ch;
    let y = this.bodyTop;
    const footY = VH - 36;
    if (!this.garrisonHex) {
      const tabs = new SegmentedSwitch(this, 4, y, VW - 8, {
        options: [
          { id: 'roster', label: t('army.roster', { n: p.heroes.length, max: ONLINE_RULES.maxArmy }) },
          { id: 'stash', label: t('army.stash', { n: p.stash.length }) },
        ],
        selected: this.tab,
        id: 'oarmy.tab',
        onChange: (id) => ((this.tab = id === 'stash' ? 'stash' : 'roster'), this.buildBody()),
      });
      this.body.add(tabs);
      y += SWITCH_H + 4;
    }
    const h = footY - 3 - y;
    if (this.tab === 'stash' && !this.garrisonHex) this.buildStash(p, y, h);
    else this.buildRoster(p, y, h, keep);
    this.buildFoot(p, footY);
  }

  private rosterHeroes(p: ProfileView): OwnedHeroView[] {
    const g = this.garrisonHex;
    return g !== null ? p.heroes.filter((h) => h.garrison === null || h.garrison === g) : p.heroes;
  }

  private buildRoster(p: ProfileView, y: number, h: number, keep: number): void {
    const VW = this.cw;
    const heroes = this.rosterHeroes(p);
    if (!heroes.length) {
      this.body.add(addEmptyState(this, 4, y, VW - 8, h, { icon: 'people', title: t('army.noHeroes'), hint: t('army.noHeroesHint') }));
      return;
    }
    this.list = new ScrollList(this, this.body, 4, y, VW - 8, h, {
      count: heroes.length,
      rowH: 30,
      fade: MOSAIC.parch,
      render: (i, row, rw, rh) => this.heroRow(heroes[i], p.now, row, rw, rh),
      onTap: (i) => this.tapHero(heroes[i]),
      id: (i) => `oroster:${i}`,
    });
    this.list.area.setScroll(keep);
  }

  private heroRow(oh: OwnedHeroView, now: number, row: Phaser.GameObjects.Container, w: number, rh: number): void {
    const h = oh.hero;
    const sel = this.garrisonHex ? this.garrisonPick.has(h.id) : this.sel === h.id;
    row.add(mosaicImage(this, 0, 0, w, rh, sel ? 'parchmentSel' : 'parchment'));
    const cls = heroClass(h);
    const ps = rh - 4;
    const fr = this.add.graphics();
    fr.fillStyle(0x1d140f, 1);
    fr.fillRect(1, 1, ps + 2, ps + 2);
    fr.fillStyle(roleColor(cls.role), 1);
    fr.fillRect(2, 2, ps, ps);
    row.add(fr);
    row.add(addPortrait(this, dollFromHero(h), 2, 2, { size: ps }));
    const st = this.status(oh, now);
    const x = ps + 7;
    const right = w - 4;
    addGroupBadge(this, row, right - 12, 3, h.group);
    const pw = addText(this, right, 18, `${powerRating(h)}`, 'pInk', 1);
    row.add(pw);
    row.add(addText(this, x, 4, ellipsize(h.name, right - 16 - x), 'pInk'));
    const sub = st ? st.text : `${t('hero.level', { n: h.level })} ${cls.short}`;
    const subT = addText(this, x, 17, ellipsize(sub, right - pw.width - 4 - x - (st ? 0 : 42)), st ? 'pBad' : 'pSec');
    row.add(subT);
    if (!st) addStars(this, row, Math.min(x + subT.width + 4, right - pw.width - 4 - 39), 19, heroStars(h));
    if (oh.woundedUntil > now) row.add(addIcon(this, 9, 9, 'cross', 'L'));
  }

  private tapHero(oh: OwnedHeroView): void {
    const id = oh.hero.id;
    if (this.garrisonHex) {
      if (oh.busy) return;
      if (this.garrisonPick.has(id)) this.garrisonPick.delete(id);
      else this.garrisonPick.add(id);
    } else this.sel = id;
    const s = this.list?.area.scrollY ?? 0;
    this.render();
    this.list?.area.setScroll(s);
  }

  private buildFoot(p: ProfileView, by: number): void {
    const VW = this.cw;
    const y = by + 3;
    if (this.garrisonHex) {
      this.body.add(new MButton(this, 4, y, VW - 8, 30, { label: t('oarmy.station'), icon: 'check', variant: 'primary', id: 'oarmy.station', onClick: () => void this.saveGarrison() }));
      return;
    }
    // Recruit, Market and Shop by name; the way back to the map is an icon (its label is the long-press text)
    const mapW = TAP + 4;
    const bw = Math.floor((VW - 8 - mapW - 3 * SIZE.gap) / 3);
    const specs: [string, string, MButtonVariant, string, () => void][] = [
      [t('army.recruit'), 'plus', 'primary', 'oarmy.recruit', () => this.openRecruit(p)],
      [t('oarmy.market'), 'coin', 'secondary', 'oarmy.market', () => this.scene.start('Market', { back: { scene: 'OnlineArmy' } })],
      [t('shop.title'), 'shop', 'secondary', 'oarmy.shop', () => this.scene.start('Shop', { back: { scene: 'OnlineArmy' } })],
    ];
    specs.forEach(([label, icon, variant, id, onClick], i) => this.body.add(new MButton(this, 4 + i * (bw + SIZE.gap), y, bw, 30, { label, icon, variant, id, onClick })));
    this.body.add(new MButton(this, VW - 4 - mapW, y, mapW, 30, { label: '', icon: 'map', variant: 'secondary', tip: t('army.map'), id: 'oarmy.map', onClick: () => this.back() }));
  }

  // ------------------------------------------------------------------ gear

  private tapSlot(slot: Slot): void {
    const oh = this.selected();
    if (!oh) return;
    if (this.tab !== 'stash' || this.stashState.slot !== slot) {
      this.stashState.slot = slot;
      this.tab = 'stash';
      this.buildBody();
    }
    const it = oh.hero.equip[slot];
    if (!it) return;
    openItemCard(this, {
      item: it,
      hero: oh.hero,
      equipped: true,
      notes: [{ text: t('stash.equippedBy', { name: oh.hero.name }) }],
      actions: [{ label: t('stash.unequip'), icon: 'back', id: 'stash.unequip', onClick: () => void this.act(() => onlineApi.equip(oh.hero.id, slot, null)) }],
    });
  }

  private buildStash(p: ProfileView, y: number, h: number): void {
    const VW = this.cw;
    this.stash = new StashGrid(this, this.body, 4, y, VW - 8, h, {
      items: () => p.stash,
      state: this.stashState,
      hero: () => this.selected()?.hero,
      drag: this.drag,
      onTap: (it) => this.openStashItem(it),
      empty: { title: t('stash.emptyTitle'), hint: t('market.sellEmptyHint') },
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
    const oh = this.selected();
    openItemCard(this, {
      item: it,
      hero: oh?.hero,
      actions: [
        isBound(it) ? this.salvageAction(it) : { label: t('oarmy.market'), icon: 'coin', id: 'oarmy.sell', onClick: () => this.scene.start('Market', { tab: 'sell', back: { scene: 'OnlineArmy' } }) },
        ...(oh ? [{ label: t('stash.equip'), icon: 'check', variant: 'primary' as const, id: 'stash.equip', disabled: equipRefusal(oh.hero, it), onClick: () => this.equip(it) }] : []),
      ],
    });
  }

  /** Bound gear is never traded: it is salvaged for a quarter of its worth in gold (docs/ITEMS.md "Bound items"). */
  private salvageAction(it: Item) {
    const n = salvageValue(it);
    const label = t('stash.salvage', { n });
    return {
      label,
      icon: 'coin' as const,
      id: 'oarmy.salvage',
      onClick: () =>
        confirmDialog(this, {
          title: t('stash.salvageTitle', { name: itemName(it) }),
          body: t('stash.salvageBody', { n }),
          ok: label,
          cancel: t('common.cancel'),
          onOk: () => void this.act(() => onlineApi.salvage(it.uid), t('stash.salvaged', { n })),
        }),
    };
  }

  private equip(it: Item): void {
    const oh = this.selected();
    if (!oh) return;
    void this.act(() => onlineApi.equip(oh.hero.id, itemDef(it.def).slot, it.uid), t('army.equipped', { name: itemName(it) }));
  }

  // ------------------------------------------------------------------ recruit: class cards

  private sample(a: Archetype): Hero {
    const h = makeHero(new Rng(7 + RECRUIT_ARCHETYPES.indexOf(a)), { nextId: 1 }, 'greek', a, 1, 0);
    return h;
  }

  openRecruit(p: ProfileView): void {
    const { VW, VH } = this.m;
    const cost = ONLINE_RULES.recruitCost;
    const w = Math.min(VW - 12, 210);
    const inner = w - 16;
    const rowH = 44;
    const m = openWarSheet(this, { title: t('oarmy.recruitTitle'), w, h: Math.min(VH - 12, 26 + 22 + RECRUIT_ARCHETYPES.length * (rowH + SIZE.gap) + TAP + 14) });
    const { c, x } = m;
    c.add(addText(this, x + 8, m.y + 24, ellipsize(t('oarmy.recruitCost', { gold: cost.gold, food: cost.food }), inner), 'pInk'));
    c.add(addText(this, x + 8, m.y + 34, ellipsize(t('oarmy.youHave', { gold: Math.floor(p.resources.gold), food: Math.floor(p.resources.food), rec: Math.floor(p.resources.recruits) }), inner), 'pSec'));
    const can = p.resources.gold >= cost.gold && p.resources.food >= cost.food && p.resources.recruits >= 1 && p.heroes.length < ONLINE_RULES.maxArmy;
    const why = p.heroes.length >= ONLINE_RULES.maxArmy ? t('town.armyFull') : t('econ.noFunds');
    const by = m.y + m.h - 8 - TAP;
    const top = m.y + 46;
    const list = new ScrollList(this, c, x + 8, top, inner, by - 4 - top, {
      count: RECRUIT_ARCHETYPES.length,
      rowH,
      render: (i, row, rw, rh) => {
        const a = RECRUIT_ARCHETYPES[i];
        const hero = this.sample(a);
        const cls = heroClass(hero);
        row.add(mosaicImage(this, 0, 0, rw, rh, 'parchment'));
        const pf = this.add.graphics();
        pf.fillStyle(0x1d140f, 1);
        pf.fillRect(3, 3, 30, 30);
        pf.fillStyle(roleColor(cls.role), 1);
        pf.fillRect(4, 4, 28, 28);
        row.add(pf);
        const img = addPortrait(this, dollFromHero(hero), 4, 4, { size: 28 }).setInteractive();
        uiId(img, 'recruit.card');
        img.on('pointerup', () => !list.area.moved && openClassCard(this, { hero, title: className(hero), action: { label: t('town.hire'), icon: 'plus', id: 'oarmy.recruitCard', disabled: can ? undefined : why, onClick: () => (m.close(), void this.act(() => onlineApi.recruit(a), t('town.hired', { name: className(hero) }))) } }));
        row.add(img);
        const bw = 40;
        const b = new MButton(this, rw - bw - 3, 11, bw, TAP, { icon: 'plus', label: t('town.hire'), variant: can ? 'primary' : 'disabled', disabledReason: can ? undefined : why, id: 'oarmy.hire', onClick: () => (m.close(), void this.act(() => onlineApi.recruit(a), t('town.hired', { name: className(hero) }))) });
        row.add(b);
        const tx = 38;
        const tw = rw - tx - bw - 8;
        row.add(addText(this, tx, 4, ellipsize(className(hero), tw), 'pInk'));
        addChip(this, row, tx, 15, roleName(cls.role), roleColor(cls.role), tw);
        row.add(addText(this, tx, 30, ellipsize(`+${roleTraits(cls.role).good}`, tw), 'pGood'));
      },
    });
    c.once('destroy', () => list.destroy());
    c.add(new MButton(this, x + 8, by, inner, TAP, { label: t('common.close'), variant: 'secondary', onClick: () => m.close() }));
  }

  /** A region's name on this season's map. */
  private regionName(loc: number): string {
    const id = this.profile?.shard.map;
    return id && hasMap(id) && getMap(id).has(loc) ? getMap(id).info(loc).name : `#${loc}`;
  }

  private async saveGarrison(): Promise<void> {
    const h = this.garrisonHex!;
    await this.act(() => onlineApi.garrison(h, [...this.garrisonPick]), t('oarmy.station'));
    if (this.sys.isActive() && !this.busy) this.scene.start('Online', { focus: h });
  }
}
