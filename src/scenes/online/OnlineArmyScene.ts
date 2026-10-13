/**
 * The War army (design/ux/screens-modes.md M-9, S19) on the one Army template
 * (src/ui/army, NAV D6) with the war source: the server's heroes, gear and
 * battle groups, the stash, recruiting and (opened from a hex) choosing a
 * garrison. Every change is a request; the screen redraws from the server's
 * answer. The page scrolls as one under the top bar: the purse chips (war
 * gold, food, energy), the selected hero's card (collapsing to one line,
 * P21) or the garrison head, Roster | Stash, then the rows or the stash grid.
 * The footer: Recruit (the primary), Market and Shop, three labels at one
 * size (OAR-2); in garrison mode Station. Back is the top bar's (or
 * Telegram's) only, to the screen that opened it (BACK_RULES origin).
 */
import Phaser from 'phaser';
import { BaseScene } from '../BaseScene';
import { ScrollArea } from '../../ui/kit';
import { ScrollList, addScrollHint, confirmDialog, toast } from '../../ui/widgets';
import { uiClip, uiId, uiIgnore } from '../../ui/layout';
import { ensureFonts } from '../../ui/fonts';
import { GAP, MButton, MChip, MStashGrid, SegmentedSwitch, SWITCH_H, TAP, addParchmentEmpty, addSubShell, mosaicImage, mtext, mw, openParchmentSheet, type Box, type FramedSubShell, type MButtonOpts } from '../../ui/mosaic';
import { MOSAIC, TEXT_MIN } from '../../ui/tokens';
import { wrapText } from '../../ui/textfit';
import { ARMY_LH, ARMY_ROW_H, addArmyHead, addMiniHead, addRosterRow, armyPill, collapsed, ensureBusts, tappableRow, type ArmySource, type HeroStatus } from '../../ui/army';
import { armyPillH } from '../../ui/army/parts';
import { equipRefusal, DragDrop, className, defaultStashState, groupName, itemName, openClassCard, openItemCard, roleColor, roleName, roleTraits, uiBoundsOf, type StashState } from '../../ui/sheet';
import { addEconState } from '../../ui/econ/widgets';
import { addPortrait } from '../../ui/sprites';
import { dollFromHero } from '../../art/paperdoll';
import { haptic, hapticNotify } from '../../platform/haptics';
import { resolveBack, type BackTarget } from '../../platform/nav';
import { isBound, itemDef, normalizeEquip, normalizeItem, salvageValue, type Item, type Slot } from '../../data/items';
import type { Hero } from '../../data/units';
import { heroClass } from '../../sim/stats';
import { Rng } from '../../sim/rng';
import { ONLINE_RULES, RECRUIT_ARCHETYPES } from '../../online/rules';
import { errorText, onlineApi, type OwnedHeroView, type ProfileView, type RegionDetail } from '../../online/client';
import { getMap, hasMap } from '../../online/world';
import { makeHero, type Archetype } from '../../game/heroes';
import { econState, type EconState } from '../../game/economy';
import { fmtNum } from '../../util/format';
import { fmtDuration } from '../../util/format';
import { t } from '../../i18n';
import { heroName } from '../../i18n/names';
import { placeName } from '../../i18n/places';

export interface WarArmyData {
  /** Garrison mode: pick who holds this hex (its loc; 0 is a hex like any other, OAR-5). */
  garrison?: number;
  tab?: 'roster' | 'stash';
  /** The screen that opened the War army (Back returns there; BACK_RULES origin, fallback the War hub). */
  back?: BackTarget;
}

/** Seconds a hire can be undone before it is sent (N21: nothing is spent until then). */
export const HIRE_UNDO_MS = 4000;

/** Back from the War army: the garrison's hex on the War hub, else the screen that opened it (War hub by default). */
export function warArmyBack(d: WarArmyData): BackTarget {
  if (d.garrison !== undefined && d.garrison !== null) return { scene: 'Online', data: { focus: d.garrison, select: true } };
  return resolveBack('OnlineArmy', d.back ?? null) ?? { scene: 'Online', data: {} };
}

/**
 * The war army as the template's source (screens-modes.md M-9): read from the last server profile; changes
 * go to the server through `send` (the scene redraws from its answer), so the sync answers say "asked".
 * The status reads busy (in battle), wounded (the one loss: error ink) and holding a hex.
 */
export function warArmySource(p: ProfileView, o: { regionName: (loc: number) => string; send: (fn: () => Promise<unknown>, ok?: string) => void }): ArmySource {
  const owned = (id: string): OwnedHeroView | undefined => p.heroes.find((h) => h.hero.id === id);
  return {
    kind: 'war',
    heroes: () => p.heroes.map((h) => h.hero),
    stash: () => p.stash,
    maxArmy: () => ONLINE_RULES.maxArmy,
    gold: () => Math.floor(p.resources.gold),
    repairCost: () => 0,
    equip(heroId, uid) {
      const it = p.stash.find((x) => x.uid === uid);
      if (!it) return false;
      o.send(() => onlineApi.equip(heroId, itemDef(it.def).slot, uid), t('army.equipped', { name: itemName(it) }));
      return true;
    },
    unequip(heroId, slot) {
      o.send(() => onlineApi.equip(heroId, slot, null));
      return true;
    },
    repair: () => false,
    setGroup(heroId, g) {
      const h = owned(heroId);
      if (!h || h.hero.group === g) return false;
      o.send(() => onlineApi.army({ [heroId]: g }), t('army.groupSet', { name: heroName(h.hero.name), group: groupName(g) }));
      return true;
    },
    // war heroes have no sheet to spend points on from here: no count badge that leads nowhere (G11)
    pending: () => 0,
    status: (h) => warStatus(owned(h.id), p.now, o.regionName),
  };
}

/** A war hero's state: in battle, wounded (a loss: error ink) or holding a hex (ink, not red: OAR-4). */
export function warStatus(oh: OwnedHeroView | undefined, now: number, regionName: (loc: number) => string): HeroStatus | null {
  if (!oh) return null;
  if (oh.busy) return { text: t('oarmy.inBattle'), bad: false };
  if (oh.woundedUntil > now) return { text: t('oarmy.wounded', { t: fmtDuration(oh.woundedUntil - now) }), bad: true };
  if (oh.garrison !== null) return { text: t('oarmy.holds', { name: regionName(oh.garrison) }), bad: false };
  return null;
}

/**
 * The footer's three buttons at one label size (OAR-2: "Recr…" beside "SHOP" before): each as wide as its
 * capitals at 7 need, the rest shared out; icons only when all three keep them; when even the bare labels do
 * not fit, widths in proportion to them so the three shrink alike.
 */
export function footerWidths(labels: string[], room: number): { icons: boolean; widths: number[] } {
  const nat = (icon: boolean) => labels.map((l) => Math.ceil(mw(l.toUpperCase(), 'rCream', 7)) + 14 + (icon ? 14 : 0));
  const share = (n: number[]) => {
    const extra = Math.floor((room - n.reduce((a, x) => a + x, 0)) / n.length);
    return n.map((x) => x + extra);
  };
  const withIcons = nat(true);
  if (withIcons.reduce((a, x) => a + x, 0) <= room) return { icons: true, widths: share(withIcons) };
  const bare = nat(false);
  if (bare.reduce((a, x) => a + x, 0) <= room) return { icons: false, widths: share(bare) };
  const sum = bare.reduce((a, x) => a + x, 0);
  return { icons: false, widths: bare.map((x) => Math.floor((x * room) / sum)) };
}

export class OnlineArmyScene extends BaseScene {
  profile: ProfileView | null = null;
  private sel: string | null = null;
  private garrisonHex: number | null = null;
  private garrisonPick = new Set<string>();
  private hexDetail: RegionDetail | null = null;
  private st: EconState | 'loading' | 'ready' = 'loading';
  private busy = false;
  private tab: 'roster' | 'stash' = 'roster';
  private data0: WarArmyData = {};
  private src: ArmySource | null = null;
  private shell!: FramedSubShell;
  private box!: Box;
  private area: ScrollArea | null = null;
  private page: Phaser.GameObjects.Container | null = null;
  private footer: Phaser.GameObjects.Container | null = null;
  private mini: Phaser.GameObjects.Container | null = null;
  private clip: Phaser.GameObjects.Zone | null = null;
  private stateC: Phaser.GameObjects.Container | null = null;
  private stash: MStashGrid | null = null;
  private stashState: StashState = defaultStashState();
  private drag!: DragDrop;
  private slotObjs = new Map<Slot, Phaser.GameObjects.GameObject>();
  private cardTop = 0;
  /** A hire waiting out its undo window (N21): sent when the window ends or the screen closes. */
  private hire: { send: () => void; timer: Phaser.Time.TimerEvent; bar: Phaser.GameObjects.Container } | null = null;

  constructor() {
    super('OnlineArmy');
  }

  create(data: WarArmyData): void {
    this.data0 = data ?? {};
    this.garrisonHex = data?.garrison ?? null;
    this.garrisonPick = new Set();
    this.profile = null;
    this.src = null;
    this.sel = null;
    this.st = 'loading';
    this.tab = data?.tab ?? 'roster';
    this.area = null;
    this.page = null;
    this.footer = null;
    this.mini = null;
    this.clip = null;
    this.stateC = null;
    this.stash = null;
    this.hire = null;
    this.initUi();
    ensureFonts(this);
    this.screen({ back: () => this.back() });
    this.shell = addSubShell(this, { title: this.garrisonHex !== null ? t('oarmy.garrison') : t('war5.armyTitle'), back: () => this.back(), id: 'oarmy.topbar', scroll: false });
    this.box = this.shell.content;
    this.drag = new DragDrop(this);
    this.events.once('shutdown', () => {
      this.flushHire();
      this.clearPage();
    });
    this.render();
    void this.fetchData();
  }

  private back(): void {
    const b = warArmyBack(this.data0);
    this.scene.start(b.scene, b.data);
  }

  /** Load from the API, or show a given profile (tests, layout check). */
  async fetchData(given?: ProfileView): Promise<void> {
    try {
      const g = this.garrisonHex;
      const [p, d] = given ? [given, null] : await Promise.all([onlineApi.profile(), g !== null ? onlineApi.region(g) : Promise.resolve(null)]);
      if (!this.sys.isActive()) return;
      for (const oh of p.heroes) normalizeEquip(oh.hero);
      p.stash.forEach((it) => normalizeItem(it));
      this.profile = p;
      this.hexDetail = d;
      this.st = 'ready';
      this.src = warArmySource(p, { regionName: (l) => this.regionName(l), send: (fn, ok) => void this.act(fn, ok) });
      if (g !== null) this.garrisonPick = new Set(p.heroes.filter((h) => h.garrison === g).map((h) => h.hero.id));
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
      if (ok && this.sys.isActive()) {
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

  /** A region's name on this season's map. */
  private regionName(loc: number): string {
    const id = this.profile?.shard.map;
    return id && hasMap(id) && getMap(id).has(loc) ? placeName(getMap(id).info(loc).name) : `#${loc}`;
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
    this.mini?.destroy();
    this.mini = null;
    this.clip?.destroy();
    this.clip = null;
    this.footer?.destroy();
    this.footer = null;
    this.stateC?.destroy();
    this.stateC = null;
    this.slotObjs.clear();
  }

  private render(): void {
    const p = this.profile;
    if (this.st !== 'ready' || !p) {
      this.clearPage();
      const b = this.box;
      this.stateC = this.add.container(0, 0);
      this.ui.add(this.stateC);
      addEconState(this, this.stateC, b.x + 4, b.y + 4, b.w - 8, b.h - 8, this.st as EconState | 'loading', () => {
        this.st = 'loading';
        this.render();
        void this.fetchData();
      });
      return;
    }
    this.refresh();
  }

  refresh(): void {
    const p = this.profile;
    if (!p) return;
    const keep = this.area?.scrollY ?? 0;
    this.clearPage();
    const box = this.box;
    this.footer = this.buildFooter(p);
    this.ui.add(this.footer);
    const bottom = this.footer.y - 3;
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
    let y = this.buildChips(page, cw, 0, p);
    this.cardTop = y;
    y = this.garrisonHex !== null ? this.buildGarrisonHead(page, cw, y, p) : this.buildHead(page, cw, y);
    y = this.buildTabs(page, cw, y, p);
    y = this.tab === 'stash' && this.garrisonHex === null ? this.buildStash(page, cw, y, p) : this.buildRoster(page, cw, y, p);
    area.setContentHeight(y + 4);
    area.setScroll(keep);
    // the card collapsed to one line over the top of the page (P21); the layout check's viewport shrinks under it
    this.clip = uiIgnore(this.add.zone(vx, top, vw, bottom - top).setOrigin(0, 0));
    this.ui.add(this.clip);
    uiClip(area.content, this.clip);
    const oh = this.selected();
    if (oh && this.garrisonHex === null && this.src) {
      this.mini = addMiniHead(this, this.ui, vx, top, cw, oh.hero, this.src, () => area.setScroll(0));
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
    this.ui.bringToTop(this.footer);
    if (this.hire) this.ui.bringToTop(this.hire.bar);
  }

  /** The purse: war gold, food (the wheat, OAR-3) and energy, compact numbers, never cut (G14). Returns the y below. */
  private buildChips(L: Phaser.GameObjects.Container, w: number, y: number, p: ProfileView): number {
    const parts = [
      { icon: 'wargold', value: fmtNum(p.resources.gold), tip: `${t('res.gold')}: ${Math.floor(p.resources.gold)}` },
      { icon: 'food', value: fmtNum(p.resources.food), tip: `${t('res.food')}: ${Math.floor(p.resources.food)}` },
      { icon: 'bolt', value: `${Math.floor(p.energy)}`, tip: t('online.energyTip', { n: Math.floor(p.energy), max: p.energyMax, rate: ONLINE_RULES.energyPerHour }) },
    ];
    const cw = Math.floor((w - GAP * (parts.length - 1)) / parts.length);
    parts.forEach((o, i) => L.add(new MChip(this, i * (cw + GAP), y, { ...o, surface: 'stone', w: cw, id: `oarmy.chip.${o.icon}` })));
    return y + TAP + 4;
  }

  /** The selected hero's card on the Army template (groups, slots, the class bust). */
  private buildHead(L: Phaser.GameObjects.Container, cw: number, y0: number): number {
    const oh = this.selected();
    const src = this.src;
    if (!oh || !src) {
      const card = this.add.container(0, y0);
      card.add(mosaicImage(this, 0, 0, cw, 40, 'parchment'));
      card.add(mtext(this, cw / 2, 15, t('army.noHeroes'), 'rInk', { size: 7.5, align: 0.5, maxW: cw - 8, box: { owner: card, w: cw, h: 40 } }));
      L.add(card);
      return y0 + 44;
    }
    const h = oh.hero;
    // the card's status pill is the loss colour; a hero in battle or on a hex wears a calm one instead (OAR-4)
    const calm = { ...src, status: (x: Hero) => (src.status(x)?.bad ? src.status(x) : null) };
    const r = addArmyHead(this, L, 0, y0, cw, h, calm, {
      onGroup: (g) => {
        if (src.setGroup(h.id, g)) haptic('light');
      },
      onSlot: (s) => this.tapSlot(s),
      selectedSlot: this.tab === 'stash' ? this.stashState.slot : null,
    });
    const st = src.status(h);
    if (st && !st.bad) {
      // over the niche's lower edge, where the template puts its own status pill
      const pw = 52;
      armyPill(this, L, 7, y0 + 5 + 72 - armyPillH(st.text, pw) - 2, st.text, oh.busy ? MOSAIC.bronze : MOSAIC.teal, pw);
    }
    for (const [s, o] of r.slots) this.slotObjs.set(s, o);
    ensureBusts(this, [heroClass(h).id], r.addBust);
    return y0 + r.h + 4;
  }

  /** Garrison mode: which hex, how to pick, how many stand there (with clan mates). */
  private buildGarrisonHead(L: Phaser.GameObjects.Container, cw: number, y0: number, p: ProfileView): number {
    const g = this.garrisonHex!;
    const others = (this.hexDetail?.garrison ?? []).filter((x) => !p.heroes.some((h) => h.hero.id === x.hero.id)).length;
    const hint = wrapText(t('oarmy.garrisonHint', { name: this.regionName(g) }), cw - 12, 3, false, TEXT_MIN).lines;
    const line = `${t('oarmy.stationed', { n: this.garrisonPick.size + others, max: ONLINE_RULES.maxGarrison })}${others ? ` · ${t('oarmy.clanMates', { n: others })}` : ''}`;
    const h = 6 + hint.length * ARMY_LH + 3 + 10 + 5;
    const card = this.add.container(0, y0);
    card.add(mosaicImage(this, 0, 0, cw, h, 'parchment'));
    const box = { owner: card, w: cw, h };
    hint.forEach((l, i) => card.add(mtext(this, 6, 5 + i * ARMY_LH, l, 'pSec', { size: TEXT_MIN, box })));
    card.add(uiId(mtext(this, 6, 6 + hint.length * ARMY_LH + 3, line, 'rInk', { size: 7, maxW: cw - 12, box }), 'oarmy.stationed'));
    L.add(card);
    return y0 + h + 4;
  }

  /** Roster | Stash (garrison mode: the roster only). */
  private buildTabs(L: Phaser.GameObjects.Container, w: number, y: number, p: ProfileView): number {
    if (this.garrisonHex !== null) return y;
    L.add(
      new SegmentedSwitch(this, 0, y, w, {
        options: [
          { id: 'roster', label: t('army.roster', { n: p.heroes.length, max: ONLINE_RULES.maxArmy }) },
          { id: 'stash', label: t('army.stash', { n: p.stash.length }) },
        ],
        selected: this.tab,
        id: 'oarmy.tab',
        onChange: (id) => {
          this.tab = id === 'stash' ? 'stash' : 'roster';
          this.area?.setScroll(0);
          this.refresh();
        },
      }),
    );
    return y + SWITCH_H + 4;
  }

  private rosterHeroes(p: ProfileView): OwnedHeroView[] {
    const g = this.garrisonHex;
    return g !== null ? p.heroes.filter((h) => h.garrison === null || h.garrison === g) : p.heroes;
  }

  private buildRoster(L: Phaser.GameObjects.Container, w: number, top: number, p: ProfileView): number {
    const heroes = this.rosterHeroes(p);
    const src = this.src!;
    if (!heroes.length) {
      L.add(addParchmentEmpty(this, 0, top, w, 80, { icon: 'people', title: t('army.noHeroes'), hint: t('army.noHeroesHint') }));
      return top + 80;
    }
    let y = top;
    heroes.forEach((oh, i) => {
      const row = this.add.container(0, y);
      const picked = this.garrisonHex !== null ? this.garrisonPick.has(oh.hero.id) : this.sel === oh.hero.id;
      addRosterRow(this, row, w, ARMY_ROW_H, oh.hero, src, picked);
      tappableRow(row, w, ARMY_ROW_H, this.area!, () => this.tapHero(oh));
      uiId(row, `oroster:${i}`);
      L.add(row);
      y += ARMY_ROW_H + GAP;
    });
    return y;
  }

  private tapHero(oh: OwnedHeroView): void {
    const id = oh.hero.id;
    if (this.garrisonHex !== null) {
      if (oh.busy) {
        toast(this, t('oarmy.inBattle'), 'bad');
        return;
      }
      if (this.garrisonPick.has(id)) this.garrisonPick.delete(id);
      else this.garrisonPick.add(id);
    } else this.sel = id;
    haptic('light');
    this.refresh();
  }

  /** The footer: Recruit (the primary), Market, Shop at one label size (OAR-2); in garrison mode Station. No back here: the top bar's is the one. */
  private buildFooter(p: ProfileView): Phaser.GameObjects.Container {
    const b = this.box;
    const H = 32;
    const c = this.add.container(b.x, b.y + b.h - H);
    c.add(mosaicImage(this, 0, 0, b.w, H, 'sheet'));
    uiId(c, 'oarmy.footer');
    if (this.garrisonHex !== null) {
      c.add(new MButton(this, 4, 4, b.w - 8, 24, { label: t('oarmy.station'), icon: 'check', variant: 'primary', id: 'oarmy.station', onClick: () => void this.saveGarrison() }));
      return c;
    }
    const specs: MButtonOpts[] = [
      { label: t('army.recruit'), icon: 'plus', variant: 'primary', id: 'oarmy.recruit', onClick: () => this.openRecruit(p) },
      { label: t('oarmy.market'), icon: 'coin', variant: 'secondary', id: 'oarmy.market', onClick: () => this.scene.start('Market', { back: { scene: 'OnlineArmy' } }) },
      { label: t('shop.title'), icon: 'shop', variant: 'secondary', id: 'oarmy.shop', onClick: () => this.scene.start('Shop', { back: { scene: 'OnlineArmy' } }) },
    ];
    const room = b.w - 8 - GAP * 2;
    const f = footerWidths(specs.map((s) => s.label), room);
    // Recruit leads as the screen's purpose (M-9); the three keep their places
    let x = 4;
    specs.forEach((s, i) => {
      const w = i === 2 ? b.w - 4 - x : f.widths[i];
      c.add(new MButton(this, x, 4, w, 24, { ...s, icon: f.icons ? s.icon : undefined }));
      x += w + GAP;
    });
    return c;
  }

  // ------------------------------------------------------------------ gear

  private tapSlot(slot: Slot): void {
    const oh = this.selected();
    if (!oh) return;
    if (this.tab !== 'stash' || this.stashState.slot !== slot) {
      this.stashState.slot = slot;
      this.tab = 'stash';
      this.refresh();
    }
    const it = oh.hero.equip[slot];
    if (!it) return;
    openItemCard(this, {
      item: it,
      hero: oh.hero,
      equipped: true,
      notes: [{ text: t('stash.equippedBy', { name: heroName(oh.hero.name) }) }],
      actions: [{ label: t('stash.unequip'), icon: 'back', id: 'stash.unequip', onClick: () => this.src?.unequip(oh.hero.id, slot) }],
    });
  }

  private buildStash(L: Phaser.GameObjects.Container, w: number, top: number, p: ProfileView): number {
    this.stash = new MStashGrid(this, L, 0, top, w, 0, {
      items: () => p.stash,
      state: this.stashState,
      hero: () => this.selected()?.hero,
      drag: this.drag,
      onTap: (it) => this.openStashItem(it),
      inline: this.area ?? undefined,
      empty: { title: t('stash.emptyTitle'), hint: t('market.sellEmptyHint') },
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
    if (oh) this.src?.equip(oh.hero.id, it.uid);
  }

  // ------------------------------------------------------------------ recruit: class cards, then the undo window

  private sample(a: Archetype): Hero {
    return makeHero(new Rng(7 + RECRUIT_ARCHETYPES.indexOf(a)), { nextId: 1 }, 'greek', a, 1, 0);
  }

  openRecruit(p: ProfileView): void {
    const { VW, VH } = this.m;
    const cost = ONLINE_RULES.recruitCost;
    const w = Math.min(VW - 12, 220);
    const inner = w - 16;
    const rowH = 50;
    // the price (ink), then what you have (secondary), each on its own lines
    const costL = wrapText(t('oarmy.recruitCost', { gold: cost.gold, food: cost.food }), inner, 2, false, TEXT_MIN).lines;
    const haveL = wrapText(t('oarmy.youHave', { gold: Math.floor(p.resources.gold), food: Math.floor(p.resources.food), rec: Math.floor(p.resources.recruits) }), inner, 3, false, TEXT_MIN).lines;
    const head = [...costL.map((l) => ({ l, f: 'pInk' as const })), ...haveL.map((l) => ({ l, f: 'pSec' as const }))];
    const headH = head.length * ARMY_LH + 4;
    const m = openParchmentSheet(this, { title: t('oarmy.recruitTitle'), w, h: Math.min(VH - 12, 26 + headH + RECRUIT_ARCHETYPES.length * (rowH + GAP) + 10), id: 'oarmy.recruitSheet' });
    const { c, x } = m;
    const box = { owner: c, w: VW, h: VH };
    head.forEach((r, i) => c.add(mtext(this, x + 8, m.body.y + i * ARMY_LH, r.l, r.f, { size: TEXT_MIN, box })));
    const pending = this.hire ? 1 : 0;
    const can = p.resources.gold >= cost.gold && p.resources.food >= cost.food && p.resources.recruits >= 1 + pending && p.heroes.length + pending < ONLINE_RULES.maxArmy;
    const why = p.heroes.length + pending >= ONLINE_RULES.maxArmy ? t('town.armyFull') : t('econ.noFunds');
    const top = m.body.y + headH;
    const list = new ScrollList(this, c, x + 8, top, inner, m.y + m.h - 8 - top, {
      count: RECRUIT_ARCHETYPES.length,
      rowH,
      fade: MOSAIC.parch,
      render: (i, row, rw, rh) => {
        const a = RECRUIT_ARCHETYPES[i];
        const hero = this.sample(a);
        const cls = heroClass(hero);
        const rbox = { owner: row, w: rw, h: rh };
        row.add(mosaicImage(this, 0, 0, rw, rh, 'parchment'));
        const pf = this.add.graphics();
        pf.fillStyle(0x1d140f, 1);
        pf.fillRect(3, 3, 30, 30);
        pf.fillStyle(roleColor(cls.role), 1);
        pf.fillRect(4, 4, 28, 28);
        row.add(pf);
        const img = addPortrait(this, dollFromHero(hero), 4, 4, { size: 28 }).setInteractive();
        uiId(img, 'recruit.card');
        const hire = () => (m.close(), this.hireWithUndo(a, className(hero)));
        img.on('pointerup', () => !list.area.moved && openClassCard(this, { hero, title: className(hero), action: { label: t('town.hire'), icon: 'plus', id: 'oarmy.recruitCard', disabled: can ? undefined : why, onClick: hire } }));
        row.add(img);
        const bw = Math.max(44, Math.ceil(mw(t('town.hire').toUpperCase(), 'rCream', 7)) + 14);
        row.add(new MButton(this, rw - bw - 3, Math.round((rh - TAP) / 2), bw, TAP, { label: t('town.hire'), variant: can ? 'primary' : 'disabled', disabledReason: can ? undefined : why, id: 'oarmy.hire', onClick: hire }));
        const tx = 38;
        const tw = rw - tx - bw - 8;
        row.add(mtext(this, tx, 3, className(hero), 'pInk', { size: 7, maxW: tw, box: rbox }));
        armyPill(this, row, tx, 13, roleName(cls.role), roleColor(cls.role), tw);
        row.add(mtext(this, tx, 13 + armyPillH(roleName(cls.role), tw) + 2, `+${roleTraits(cls.role).good}`, 'pGood', { size: TEXT_MIN, maxW: tw, box: rbox }));
      },
    });
    c.once('destroy', () => list.destroy());
  }

  /**
   * Hire with an undo window (N21): the bar says who was hired with Undo for a few seconds; nothing is sent
   * (or spent) until the window ends, the bar's time runs out or the screen closes.
   */
  hireWithUndo(a: Archetype, name: string): void {
    this.flushHire();
    // sent on its own (not through act: a hire never waits behind another request, and still goes when the screen has closed)
    const send = () =>
      void onlineApi
        .recruit(a)
        .then(() => {
          if (!this.sys.isActive()) return;
          toast(this, t('town.hired', { name }), 'good');
          void this.fetchData();
        })
        .catch((e) => {
          if (!this.sys.isActive()) return;
          hapticNotify('error');
          toast(this, errorText(e), 'bad');
        });
    const b = this.box;
    const bar = this.add.container(b.x + 4, (this.footer?.y ?? b.y + b.h - 32) - 4 - TAP - 4);
    const w = b.w - 8;
    const h = TAP + 4;
    bar.add(mosaicImage(this, 0, 0, w, h, 'parchmentSel'));
    const uw = Math.max(52, mw(t('undo.chip').toUpperCase(), 'rCream', 7) + 18);
    bar.add(mtext(this, 6, Math.round((h - 9) / 2), t('war5.hired', { name }), 'rInk', { size: 7, maxW: w - uw - 14, box: { owner: bar, w, h } }));
    bar.add(
      new MButton(this, w - uw - 2, 2, uw, TAP, {
        label: t('undo.chip'),
        icon: 'back',
        variant: 'secondary',
        id: 'oarmy.hireUndo',
        onClick: () => {
          if (!this.hire) return;
          this.hire.timer.remove();
          this.hire.bar.destroy();
          this.hire = null;
          haptic('light');
          toast(this, t('war5.hireUndone'), 'good');
        },
      }),
    );
    uiId(bar, 'oarmy.hireBar');
    this.ui.add(bar);
    const timer = this.time.delayedCall(HIRE_UNDO_MS, () => this.flushHire());
    this.hire = { send, timer, bar };
    hapticNotify('success');
  }

  /** Send a hire still waiting in its undo window. */
  private flushHire(): void {
    const h = this.hire;
    if (!h) return;
    this.hire = null;
    h.timer.remove();
    if (h.bar.scene) h.bar.destroy();
    h.send();
  }

  private async saveGarrison(): Promise<void> {
    const h = this.garrisonHex!;
    await this.act(() => onlineApi.garrison(h, [...this.garrisonPick]), t('oarmy.station'));
    if (this.sys.isActive() && !this.busy) this.scene.start('Online', { focus: h, select: true });
  }
}
