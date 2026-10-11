import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { ScrollArea, addIcon, panelK } from '../ui/kit';
import { ScrollList, ItemIcon, addScrollHint, confirmDialog, toast } from '../ui/widgets';
import { uiId } from '../ui/layout';
import { measureText, wrapText, LINE_H } from '../ui/textfit';
import { ensureFonts } from '../ui/fonts';
import { className, defaultStashState, itemName, openItemCard, saleText, roleColor, roleName, roleTraits, type StashState } from '../ui/sheet';
import { addPortrait } from '../ui/sprites';
import { ARMY_LH, armyPill, armyPillW } from '../ui/army/parts';
import { canRetrainAny, openRecruitSheet, showUndoToast, undoHire } from '../ui/sheets/recruit';
import { heroClass } from '../sim/stats';
import { dollFromHero } from '../art/paperdoll';
import { renderGround } from '../art/ground';
import { renderSettlement } from '../art/worldArt';
import { state } from '../state';
import { haptic, hapticNotify } from '../platform/telegram';
import { itemDef, type Item } from '../data/items';
import { MAX_ARMY } from '../data/units';
import { RETRAIN_COST } from '../data/perks';
import { EV_KEY } from '../data/events';
import { VOLUNTEER_RULES, WORLD_RULES } from '../world/world';
import { CULTURE_LABEL } from '../data/names';
import { uiCoin, uiError } from '../audio/hooks';
import { itemModLines } from '../game/gear';
import { MOSAIC, TEXT_MIN } from '../ui/tokens';
import { MActionBar, MButton, MChip, MStashGrid, SegmentedSwitch, SWITCH_H, TAP, GAP, FrescoBanner, addParchmentEmpty, addSubShell, addPortraitWell, addRowFace, hasRaster, mtext, mw, rarityInk, wrapWords, type MButtonOpts } from '../ui/mosaic';
import { t, tOr, type TKey } from '../i18n';
import { openEventCard, type EventCardHandle } from '../ui/sheets/eventCard';

/** `rest` is Services in a town (V5-029) and Rest in a village. */
type Tab = 'recruits' | 'market' | 'sell' | 'rest';

const TAB_ICON: Record<Tab, string> = { recruits: 'plus', market: 'shop', sell: 'amphora', rest: 'tent' };
const TAB_KEY: Record<Tab, TKey> = { recruits: 'town.tab.hire', market: 'town.tab.buy', sell: 'town.tab.sell', rest: 'town.tab.rest' };

type Kind = 'village' | 'town';
type Culture = keyof typeof CULTURE_LABEL;

/** The painted vignette of a settlement kind and culture (AS-04, ART-006..011; audit SET-1). */
const vignetteKey = (kind: Kind, culture: Culture): string => `ui_vignette_${kind}_${culture}`;
const vignetteUrl = (kind: Kind, culture: Culture): string => `ui/vignette_${kind}_${culture}.jpg`;

/** Vignettes asked for (a file that failed to load is not asked for again). */
const askedVignettes = new Set<string>();

/** The last tab of the settlement page, so the Drillmaster's Army round trip lands back on Services. */
let lastTab: { id: number; tab: Tab } | null = null;

/** Village / town screen (screens-campaign.md C-6): hire volunteers, buy and sell gear, services (rest, provisions, physician, drillmaster). */
export class SettlementScene extends BaseScene {
  private id = 0;
  private tab: Tab = 'recruits';
  private tabList: Tab[] = [];
  private body!: Phaser.GameObjects.Container;
  private status!: Phaser.GameObjects.Container;
  private list: ScrollList | null = null;
  private stash: MStashGrid | null = null;
  private stashState: StashState = defaultStashState();
  /** The content column (UI px). */
  private ax = 0;
  private aw = 0;
  private bodyTop = 0;
  private bodyBottom = 0;
  private chipsY = 0;
  private restArea: ScrollArea | null = null;
  private eventCard: EventCardHandle | null = null;

  constructor() {
    super('Settlement');
  }

  /** The settlement's painted vignette, downloaded on the first visit to a place of that kind and people. */
  preload(): void {
    const w = state.campaign.world;
    const data = this.sys.settings.data as { id?: number } | undefined;
    const def = w.settlement(data?.id ?? w.s.inside);
    if (!def || def.kind === 'lair') return;
    const key = vignetteKey(def.kind, def.culture);
    if (this.textures.exists(key) || askedVignettes.has(key)) return;
    askedVignettes.add(key);
    this.load.image(key, vignetteUrl(def.kind, def.culture));
  }

  create(data: { id?: number; tab?: Tab }): void {
    this.initUi();
    ensureFonts(this);
    const camp = state.campaign;
    const w = camp.world;
    this.id = data?.id ?? w.s.inside;
    const def = w.settlement(this.id);
    if (!def || def.kind === 'lair') {
      this.scene.start('World', {});
      return;
    }
    w.s.inside = this.id;
    this.tabList = def.kind === 'town' ? ['recruits', 'market', 'sell', 'rest'] : ['recruits', 'rest'];
    const back = lastTab?.id === this.id ? lastTab.tab : undefined;
    const want = data?.tab ?? back;
    this.tab = want && this.tabList.includes(want) ? want : 'recruits';
    this.list = null;
    this.stash = null;
    this.screen({ back: () => this.leave() });
    const { VH } = this.m;
    const compact = VH < 300;

    const shell = addSubShell(this, { title: def.name, back: () => this.leave(), id: 'town.topbar', scroll: false });
    const b = shell.content;
    this.ax = b.x + 4;
    this.aw = b.w - 8;
    let y = b.y + 4;

    // the settlement's painted vignette in the fresco frame (the map tile drawn large until it has loaded)
    // shorter on a short screen, so the tab's first rows (the Drillmaster in Services) stay in view
    const artH = compact ? 38 : VH < 380 ? 58 : 78;
    const vk = vignetteKey(def.kind, def.culture);
    const art = hasRaster(this, vk) ? { image: vk } : { pixelKey: this.artTexture(def, this.aw - 8, artH - 8) };
    this.ui.add(new FrescoBanner(this, this.ax, y, this.aw, artH, { ...art, label: def.name, id: 'town.art' }));
    y += artH + 3;
    const people = tOr(`culture.${def.culture}`, CULTURE_LABEL[def.culture]);
    this.ui.add(mtext(this, b.x + b.w / 2, y + 1, t(def.kind === 'town' ? 'town.town' : 'town.village', { people }), 'pSec', { size: TEXT_MIN, align: 0.5, maxW: this.aw, box: { owner: this.ui, w: this.m.VW, h: VH } }));
    y += 11;

    // gold, men, wounded
    this.chipsY = y;
    y += 18 + 3;

    // tabs: Hire / Buy / Sell / Services in a town, Hire / Rest in a village (V5-029)
    const town = def.kind === 'town';
    this.ui.add(
      new SegmentedSwitch(this, this.ax, y, this.aw, {
        options: this.tabList.map((k) => ({ id: k, label: t(k === 'rest' && town ? 'set.tab.services' : TAB_KEY[k]), icon: TAB_ICON[k] })),
        selected: this.tab,
        onChange: (id) => this.setTab(id as Tab),
        id: 'town.tab',
      }),
    );
    y += SWITCH_H + 4;
    this.bodyTop = y;

    this.body = this.add.container(0, 0);
    this.ui.add(this.body);
    // (after the body: scripts that look for the first coin button find a hire button, not the gold chip)
    this.status = this.add.container(0, 0);
    this.ui.add(this.status);

    // Leave is bronze (SET-3): the page's primary is per tab (Hire, Buy, Sell, Rest 8 hours)
    const actions: MButtonOpts[] = [
      { label: t('town.party'), icon: 'people', variant: 'secondary', id: 'town.party', onClick: () => this.scene.start('Army', { from: 'Settlement', id: this.id }) },
      { label: t('town.leave'), icon: 'map', variant: 'secondary', id: 'town.leave', onClick: () => this.leave() },
    ];
    const bar = new MActionBar(this, b.w, b.y + b.h, { surface: 'parchment', x: b.x }).set(actions);
    this.ui.add(bar);
    this.bodyBottom = bar.top - 3;
    this.events.once('shutdown', () => this.clearBody());
    this.refresh();
    // an arrival event (campaign-events.md R3) is answered before the page is used (screens-campaign.md C-6)
    this.eventCard = null;
    this.openEvent();
  }

  /** The pending event's card over the page; it comes back until the event is answered (no soft-lock). */
  private openEvent(): void {
    if (this.eventCard) return;
    this.eventCard = openEventCard(this, {
      onDone: () => {
        this.eventCard = null;
        if (!this.scene.isActive()) return;
        this.refresh();
        if (state.campaign.world.s.pendingEvent) this.time.delayedCall(0, () => this.openEvent());
      },
    });
  }

  /** The settlement over the plain, at the frame's inside size and the screen's pixel density (until its vignette loads). */
  private artTexture(def: { kind: 'village' | 'town' | 'lair'; id: number; coastal: boolean }, w: number, h: number): string {
    const K = panelK(this);
    const key = `set_art_${def.kind}_${def.id % 2}_${def.coastal ? 1 : 0}_${w}x${h}@${K}`;
    if (this.textures.exists(key)) return key;
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * K);
    cv.height = Math.round(h * K);
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(renderGround(w, h, { originX: 0, originY: w, fieldW: 1e6, fieldH: 1e6, seed: def.id + 30 }).toCanvas(), 0, 0, cv.width, cv.height);
    const art = renderSettlement(def.kind, def.id, def.coastal).toCanvas();
    // the largest whole scale that leaves a little ground round it
    const s = Math.max(1, Math.min(3, Math.floor(Math.min((h - 2) / art.height, w / art.width) * 2) / 2));
    const dw = art.width * s * K;
    const dh = art.height * s * K;
    ctx.drawImage(art, Math.round((cv.width - dw) / 2), cv.height - dh - Math.round(K), dw, dh);
    this.textures.addCanvas(key, cv);
    return key;
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    lastTab = { id: this.id, tab };
    this.refresh();
  }

  private leave(): void {
    const w = state.campaign.world;
    lastTab = null;
    w.s.inside = -1;
    w.s.safeUntil = Math.max(w.s.safeUntil, w.s.time + 0.5);
    void state.save();
    this.scene.start('World', {});
  }

  private refresh(): void {
    const camp = state.campaign;
    this.status.removeAll(true);
    const wounded = camp.wounded().length;
    const chips = [
      new MChip(this, 0, 0, { icon: 'coin', value: camp.data.gold, tip: t('menu.tip.gold'), id: 'town.gold' }),
      new MChip(this, 0, 0, { icon: 'people', value: `${camp.data.heroes.length}/${MAX_ARMY}`, tip: t('menu.tip.army'), id: 'town.men' }),
    ];
    if (wounded) {
      // the word goes before the chip does not fit
      const room = this.aw - chips.reduce((a, c) => a + c.w, 0) - GAP * 2;
      const word = t('town.hurt', { n: wounded });
      const value = MChip.width({ icon: 'cross', value: word }) <= room ? word : `${wounded}`;
      chips.push(new MChip(this, 0, 0, { icon: 'cross', value, tip: t('town.wounded'), id: 'town.hurt' }));
    }
    const total = chips.reduce((a, c) => a + c.w, 0) + GAP * (chips.length - 1);
    let x = Math.round(this.ax + (this.aw - total) / 2);
    for (const c of chips) {
      c.x = x;
      c.y = this.chipsY;
      this.status.add(c);
      x += c.w + GAP;
    }
    this.buildBody();
  }

  private clearBody(): void {
    this.restArea?.destroy();
    this.restArea = null;
    this.list?.destroy();
    this.list = null;
    this.stash?.destroy();
    this.stash = null;
    this.body.removeAll(true);
  }

  private buildBody(): void {
    const keep = this.list?.area.scrollY ?? this.restArea?.scrollY ?? 0;
    this.clearBody();
    const y = this.bodyTop;
    const h = this.bodyBottom - y;
    if (this.tab === 'recruits') this.buildRecruits(y, h);
    else if (this.tab === 'market') this.buildMarket(y, h);
    else if (this.tab === 'sell') this.buildSell(y, h);
    else this.buildServices(y, h);
    this.list?.area.setScroll(keep);
    this.restArea?.setScroll(keep);
  }

  private newList(y: number, h: number, count: number, rowH: number, render: ConstructorParameters<typeof ScrollList>[6]['render']): ScrollList {
    return new ScrollList(this, this.body, this.ax, y, this.aw, h, { count, rowH, render, fade: MOSAIC.parch });
  }

  /**
   * A sacked or event-closed settlement (campaign-arc.md R5.3, campaign-events closeSettlement): Hire
   * and Buy say why and when they reopen; Services stay. True when it drew that state.
   */
  private closedState(y: number, h: number, icon: string): boolean {
    const w = state.campaign.world;
    if (!w.isClosed(this.id)) return false;
    const sacked = w.isSacked(this.id);
    const until = sacked ? (w.s.arc.sackedUntil ?? w.s.time) / 24 : w.s.eventCd[EV_KEY.closed(this.id)] ?? w.s.time / 24;
    const n = Math.max(1, Math.ceil(until - w.s.time / 24));
    const hint = `${t('set.reopens', { n })}. ${t('set.servicesStay')}`;
    this.body.add(addParchmentEmpty(this, this.ax, y, this.aw, h, { icon, title: t(sacked ? 'set.sacked' : 'set.closed'), hint }));
    uiId(this.body.list[this.body.list.length - 1], sacked ? 'town.sacked' : 'town.closed');
    return true;
  }

  // ------------------------------------------------------------------ hire

  private buildRecruits(y: number, h: number): void {
    const camp = state.campaign;
    const w = camp.world;
    if (this.closedState(y, h, 'fire')) return;
    const pool = w.recruits(this.id, camp.data.heroes);
    const refresh = Math.ceil(w.refreshIn(this.id));
    if (!pool.length) {
      this.body.add(addParchmentEmpty(this, this.ax, y, this.aw, h, { icon: 'people', title: t('town.noVolunteers'), hint: t('town.moreIn', { h: refresh }) }));
      return;
    }
    const full = camp.data.heroes.length >= MAX_ARMY;
    // name and class across the row; the role pill beside the price; the trait whole under them (SET-2)
    const ps = this.aw < 150 ? 30 : 40;
    const tx = 5 + ps + 6;
    const fw = this.aw - 3 - tx - 5;
    const trait = (cls: string) => wrapWords(`+${roleTraits(cls).good}`, fw, (s) => mw(s, 'pGood', TEXT_MIN)).slice(0, 2);
    const lines = Math.max(1, ...pool.map((r) => trait(heroClass(r.hero).role).length));
    // the pills beside the price when they fit there, else on a line of their own under it (narrow screens)
    const bw = 50;
    const pillsW = (r: (typeof pool)[number]) => armyPillW(roleName(heroClass(r.hero).role)) + (r.index >= VOLUNTEER_RULES.floorIndex ? armyPillW(t('set.volunteer')) + 3 : 0);
    const below = (r: (typeof pool)[number]) => pillsW(r) > fw - bw - 4;
    const extra = pool.some(below) ? 16 : 0;
    const rowH = 51 + extra + lines * ARMY_LH + 3;
    this.list = this.newList(y, h, pool.length + 1, rowH, (i, row, rw) => {
      const box = { owner: row, w: rw, h: rowH };
      if (i === pool.length) {
        row.add(mtext(this, rw / 2, 8, t('town.newVolunteers', { h: refresh }), 'pMuted', { size: TEXT_MIN, align: 0.5, maxW: rw - 4, box }));
        return;
      }
      const r = pool[i];
      const hero = r.hero;
      const cls = heroClass(hero);
      addRowFace(this, row, rw, rowH);
      // his own portrait in his role colour: tap for the recruit sheet
      addPortraitWell(this, row, 5, 5, ps, roleColor(cls.role));
      const img = addPortrait(this, dollFromHero(hero), 5, 5, { size: ps }).setInteractive();
      uiId(img, 'recruit.card');
      row.add(img);
      img.on('pointerup', () => !this.list?.area.moved && this.openRecruit(r.index));
      const can = camp.data.gold >= r.price && !full;
      const w0 = rw - tx - 5;
      row.add(mtext(this, tx, 4, `${hero.name} · ${t('hero.level', { n: hero.level })}`, 'rInk', { size: 7, maxW: w0, box }));
      row.add(mtext(this, tx, 15, className(hero), 'pSec', { size: TEXT_MIN, maxW: w0, box }));
      row.add(
        new MButton(this, rw - bw - 4, 26, bw, TAP, {
          label: `${r.price}`,
          icon: 'coin',
          variant: can ? 'secondary' : 'disabled',
          disabledReason: full ? t('town.armyFull') : t('stash.noGold'),
          id: 'town.hire',
          tip: t('town.hire'),
          onClick: () => this.hire(r.index),
        }),
      );
      // the role pill (earth tone, G4); a volunteer of the floor says so (campaign-arc.md R1.5)
      const low = below(r);
      const py = low ? 50 : 27;
      const pr = low ? w0 : w0 - bw - 4;
      const vol = r.index >= VOLUNTEER_RULES.floorIndex;
      const pw = armyPill(this, row, tx, py, roleName(cls.role), roleColor(cls.role), pr);
      if (vol) armyPill(this, row, tx + pw + 3, py, t('set.volunteer'), MOSAIC.bronze, pr - pw - 3);
      trait(cls.role).forEach((l, k) => row.add(mtext(this, tx, 51 + (low ? extra : 0) + k * ARMY_LH, l, 'pGood', { size: TEXT_MIN, maxW: w0, box })));
    });
  }

  openRecruit(index: number): void {
    const camp = state.campaign;
    const r = camp.world.recruits(this.id, camp.data.heroes).find((x) => x.index === index);
    if (!r) return;
    const full = camp.data.heroes.length >= MAX_ARMY;
    openRecruitSheet(this, {
      hero: r.hero,
      price: r.price,
      volunteer: r.index >= VOLUNTEER_RULES.floorIndex,
      blocked: full ? t('town.armyFull') : camp.data.gold < r.price ? t('stash.noGold') : undefined,
      onHire: () => this.hire(index),
    });
  }

  /** Hire at once (no confirm) with a 4 s Undo toast (controls.md R4.3). */
  private hire(index: number): void {
    const camp = state.campaign;
    const offer = camp.world.recruits(this.id, camp.data.heroes).find((x) => x.index === index);
    const h = offer ? camp.hire(this.id, index) : null;
    if (!offer || !h) {
      hapticNotify('error');
      return;
    }
    hapticNotify('success');
    uiCoin();
    void state.save();
    this.refresh();
    const receipt = { sid: this.id, index, heroId: h.id, price: offer.price };
    showUndoToast(this, t('town.hired', { name: h.name }), this.bodyBottom, () => {
      if (!undoHire(state.campaign, receipt)) return;
      haptic('light');
      void state.save();
      this.refresh();
      toast(this, t('set.undone', { name: h.name, n: receipt.price }), 'info');
    });
  }

  // ------------------------------------------------------------------ buy

  private buildMarket(y: number, h: number): void {
    const camp = state.campaign;
    const w = camp.world;
    if (this.closedState(y, h, 'fire')) return;
    const wares = w.wares(this.id, camp.armyClasses());
    const refresh = Math.ceil(w.refreshIn(this.id));
    if (!wares.length) {
      this.body.add(addParchmentEmpty(this, this.ax, y, this.aw, h, { icon: 'coin', title: t('town.soldOut'), hint: t('town.newWares', { h: refresh }) }));
      return;
    }
    const rowH = 42;
    this.list = this.newList(y, h, wares.length + 1, rowH, (i, row, rw, rh, area) => {
      const box = { owner: row, w: rw, h: rh };
      if (i === wares.length) {
        row.add(mtext(this, rw / 2, 8, t('town.newWares', { h: refresh }), 'pMuted', { size: TEXT_MIN, align: 0.5, maxW: rw - 4, box }));
        return;
      }
      const ware = wares[i];
      const it = ware.item;
      addRowFace(this, row, rw, rh);
      const isz = 28;
      row.add(new ItemIcon(this, 5, Math.round((rh - isz) / 2), { item: it }, { size: isz, area, glow: false, onTap: () => this.openWare(ware.index) }));
      const can = camp.data.gold >= ware.price;
      const bw = 50;
      row.add(
        new MButton(this, rw - bw - 4, Math.round((rh - TAP) / 2), bw, TAP, {
          label: `${ware.price}`,
          icon: 'coin',
          variant: can ? 'secondary' : 'disabled',
          disabledReason: t('stash.noGold'),
          id: 'town.buy',
          onClick: () => this.askBuy(ware.index),
        }),
      );
      const tx = 5 + isz + 6;
      const tw = rw - tx - bw - 8;
      row.add(mtext(this, tx, 4, itemName(it), rarityInk(this, it.rarity), { size: 7, maxW: tw, box }));
      const def = itemDef(it.def);
      // the slot, then its main stats on their own line (whole; a long one drops before it is cut)
      const mods = itemModLines(it).slice(0, 2).map((m) => `${tOr(`mod.${m.key}`, m.key)} ${m.text}`);
      const fits = (s: string) => measureText(s, false, TEXT_MIN) <= tw;
      const ml = fits(mods.join(' · ')) ? mods.join(' · ') : (mods[0] ?? '');
      row.add(mtext(this, tx, 16, t(`slot.${def.slot}` as TKey), 'pSec', { size: TEXT_MIN, maxW: tw, box }));
      row.add(mtext(this, tx, 27, ml, 'pMuted', { size: TEXT_MIN, maxW: tw, box }));
    });
  }

  openWare(index: number): void {
    const camp = state.campaign;
    const ware = camp.world.wares(this.id, camp.armyClasses()).find((x) => x.index === index);
    if (!ware) return;
    const hero = camp.data.heroes[0];
    openItemCard(this, {
      item: ware.item,
      hero,
      title: t('town.buyTitle', { name: itemName(ware.item) }),
      actions: [{ label: `${ware.price}`, icon: 'coin', variant: 'primary', id: 'town.buyCard', disabled: camp.data.gold < ware.price ? t('stash.noGold') : undefined, onClick: () => this.askBuy(index) }],
    });
  }

  /** Buying confirms (C-6 AC: Sell and Buy confirm): name, price and the gold left to judge by. */
  private askBuy(index: number): void {
    const camp = state.campaign;
    const ware = camp.world.wares(this.id, camp.armyClasses()).find((x) => x.index === index);
    if (!ware) return;
    const name = itemName(ware.item);
    confirmDialog(this, {
      title: t('town.buyTitle', { name }),
      body: t('set.buyBody', { name, n: ware.price, gold: camp.data.gold }),
      ok: `${t('town.tab.buy')} ${ware.price}`,
      cancel: t('common.cancel'),
      onOk: () => this.buy(index),
    });
  }

  private buy(index: number): void {
    const it = state.campaign.buy(this.id, index);
    if (!it) {
      hapticNotify('error');
      uiError();
      return;
    }
    haptic('medium');
    uiCoin();
    toast(this, t('town.bought', { name: itemName(it) }), 'good');
    void state.save();
    this.refresh();
  }

  // ------------------------------------------------------------------ sell (the stash grid)

  private buildSell(y: number, h: number): void {
    this.stash = new MStashGrid(this, this.body, this.ax, y, this.aw, h, {
      items: () => state.campaign.data.stash,
      state: this.stashState,
      onTap: (it) => this.openSell(it),
    });
  }

  openSell(it: Item): void {
    const s = saleText(it);
    openItemCard(this, {
      item: it,
      hero: state.campaign.data.heroes[0],
      notes: [{ text: s.bound ? t('stash.boundHint') : t('town.sellHint') }],
      actions: [
        {
          label: s.label,
          icon: 'coin',
          variant: 'primary',
          id: 'stash.sell',
          onClick: () => confirmDialog(this, { title: s.title, body: s.body, ok: s.label, cancel: t('common.cancel'), onOk: () => this.sell(it, s.value) }),
        },
      ],
    });
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

  // ------------------------------------------------------------------ services (towns) / rest (villages)

  /**
   * One scrolling page (SET-4): how many are hurt; in a town the Physician and the Drillmaster
   * (abilities.md R7); provisions with Food +10 and Supplies +10; then every wounded man and the healing
   * rate. Each service is a row with a coin price button. Rest 8 hours is the tab's primary, pinned under it.
   */
  private buildServices(y: number, h: number): void {
    const camp = state.campaign;
    const def = camp.world.settlement(this.id)!;
    const town = def.kind === 'town';
    const rate = town ? WORLD_RULES.healTown : WORLD_RULES.healVillage;
    const wounded = camp.wounded();
    const BH = TAP + 2;
    // the primary, pinned at the foot of the tab
    this.body.add(new MButton(this, this.ax, y + h - BH, this.aw, BH, { label: t('town.rest8'), icon: 'tent', variant: 'primary', id: 'town.rest', onClick: () => this.rest(8) }));
    const area = new ScrollArea(this, this.body, this.ax, y, this.aw, h - BH - GAP, this.m.S);
    this.restArea = area;
    addScrollHint(this, this.body, area, MOSAIC.parch);
    const c = area.content;
    const w = this.aw - 3;
    const box = { owner: c, w: this.aw, h: 100000 };
    let cy = 2;
    const head = wounded.length ? `${t('town.wounded')}: ${wounded.length}` : t('town.allFit');
    const row = (o: { icon: string; title: string; sub: string; button: MButtonOpts; bw?: number }) => {
      const bw = o.bw ?? 50;
      const tx = 24;
      const tw = w - tx - bw - 8;
      // the line under the title wraps rather than cut (A11Y-10)
      const sub = wrapWords(o.sub, tw, (z) => mw(z, 'pSec', TEXT_MIN)).slice(0, 3);
      const rh = Math.max(36, 18 + sub.length * ARMY_LH + 5);
      const r = this.add.container(0, cy);
      const rb = { owner: r, w, h: rh };
      addRowFace(this, r, w, rh);
      r.add(addIcon(this, 6, Math.round((rh - 12) / 2), o.icon));
      r.add(mtext(this, tx, 5, o.title, 'rInk', { size: 7, maxW: tw, box: rb }));
      sub.forEach((l, i) => r.add(mtext(this, tx, 17 + i * ARMY_LH, l, 'pSec', { size: TEXT_MIN, maxW: tw, box: rb })));
      r.add(new MButton(this, w - bw - 4, Math.round((rh - TAP) / 2), bw, TAP, o.button));
      c.add(r);
      cy += rh + GAP;
    };
    // the town's services first (the Drillmaster in view, C-6 acceptance), then provisions, then who is hurt
    if (town) {
      const cost = camp.healCost();
      row({
        icon: 'cross',
        title: t('set.physician'),
        sub: cost > 0 ? t('set.physicianSub', { n: wounded.length }) : t('set.noPatients'),
        button: {
          label: cost > 0 ? `${cost}` : '-',
          icon: cost > 0 ? 'coin' : undefined,
          variant: cost > 0 && camp.data.gold >= cost ? 'secondary' : 'disabled',
          disabledReason: cost > 0 ? t('stash.noGold') : t('town.allFit'),
          id: 'town.physician',
          tip: cost > 0 ? t('town.physician', { n: cost }) : t('town.noPatients'),
          onClick: () => this.physician(),
        },
      });
      // the Drillmaster (abilities.md R7): Army in pick mode, then the man's perks in retrain mode
      const free = camp.freeRetrains();
      const go = t('set.drillGo');
      row({
        icon: 'swords',
        title: t('set.drill'),
        sub: free > 0 ? t('set.drillFree', { n: free }) : t('set.drillSub', { n: RETRAIN_COST }),
        bw: Math.max(50, Math.ceil(mw(go, 'rInk', 7)) + 22),
        button: {
          label: go,
          variant: canRetrainAny(camp.data.heroes) ? 'secondary' : 'disabled',
          disabledReason: t('set.drillNone'),
          id: 'town.drill',
          tip: t('set.drillTip'),
          onClick: () => this.scene.start('Army', { from: 'Settlement', id: this.id, pick: 'retrain' }),
        },
      });
    }
    const w0 = camp.world;
    c.add(mtext(this, w / 2, cy + 2, t('town.provisions', { food: Math.floor(w0.food), sup: Math.floor(w0.supplies) }), 'pSec', { size: TEXT_MIN, align: 0.5, maxW: w, box }));
    cy += 13;
    (['food', 'supplies'] as const).forEach((kind) => {
      const price = camp.provisionPrice(kind, this.id);
      row({
        icon: kind === 'food' ? 'food' : 'wood',
        title: t(kind === 'food' ? 'town.buyFood' : 'town.buySupplies'),
        sub: t(kind === 'food' ? 'set.foodHave' : 'set.supHave', { n: Math.floor(kind === 'food' ? w0.food : w0.supplies) }),
        button: {
          label: `${price}`,
          icon: 'coin',
          variant: camp.data.gold >= price ? 'secondary' : 'disabled',
          disabledReason: t('stash.noGold'),
          id: `town.buy.${kind}`,
          tip: t(kind === 'food' ? 'town.foodTip' : 'town.supplyTip'),
          onClick: () => this.provision(kind),
        },
      });
    });
    // the wounded, every one (the list is as long as they are, SET-4), and how fast rest heals here
    c.add(mtext(this, w / 2, cy + 2, head, wounded.length ? 'pBad' : 'pGood', { size: 7, align: 0.5, maxW: w, box }));
    cy += 14;
    wounded.forEach((hero) => {
      const rh = 26;
      const r = this.add.container(0, cy);
      const rb = { owner: r, w, h: rh };
      addRowFace(this, r, w, rh);
      addPortraitWell(this, r, 3, 2, rh - 4, roleColor(heroClass(hero).role));
      r.add(addPortrait(this, dollFromHero(hero), 3, 2, { size: rh - 4 }));
      const hrs = t('town.restHours', { h: Math.ceil(hero.wound) });
      r.add(mtext(this, w - 5, Math.round((rh - 7) / 2), hrs, 'pBad', { align: 1, box: rb }));
      r.add(mtext(this, rh + 3, Math.round((rh - 7) / 2), hero.name, 'rInk', { size: 7, maxW: w - rh - 8 - mw(hrs, 'pBad'), box: rb }));
      c.add(r);
      cy += rh + GAP;
    });
    const note = wrapText(t('town.restRate', { n: rate }), w - 8, 3, false, TEXT_MIN).lines;
    note.forEach((l, i) => c.add(mtext(this, w / 2, cy + 2 + i * LINE_H, l, 'pMuted', { size: TEXT_MIN, align: 0.5, box })));
    cy += note.length * LINE_H + 6;
    area.setContentHeight(cy + 2);
  }

  private rest(hours: number): void {
    state.campaign.rest(hours);
    haptic('light');
    toast(this, t('town.rested'), 'good');
    void state.save();
    this.refresh();
  }

  private provision(kind: 'food' | 'supplies'): void {
    const camp = state.campaign;
    if (!camp.buyProvisions(kind, this.id)) {
      hapticNotify('error');
      toast(this, t(camp.data.gold < camp.provisionPrice(kind, this.id) ? 'stash.noGold' : 'town.storesFull'), 'bad');
      return;
    }
    haptic('light');
    toast(this, t('town.bought10', { what: t(kind === 'food' ? 'res.food' : 'town.buySupplies').replace(/\s*\+10$/, '') }), 'good');
    void state.save();
    this.refresh();
  }

  private physician(): void {
    if (!state.campaign.healAll()) {
      hapticNotify('error');
      return;
    }
    hapticNotify('success');
    toast(this, t('town.healed'), 'good');
    void state.save();
    this.refresh();
  }
}

