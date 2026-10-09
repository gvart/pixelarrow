import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { ScrollArea, panelK } from '../ui/kit';
import { ScrollList, ItemIcon, addScrollHint, confirmDialog, toast } from '../ui/widgets';
import { uiId } from '../ui/layout';
import { measureText, wrapText } from '../ui/textfit';
import { ensureFonts } from '../ui/fonts';
import { className, defaultStashState, itemName, openClassCard, openItemCard, saleText, roleColor, roleName, roleTraits, type StashState } from '../ui/sheet';
import { addPortrait } from '../ui/sprites';
import { heroClass } from '../sim/stats';
import { dollFromHero } from '../art/paperdoll';
import { renderGround } from '../art/ground';
import { renderSettlement } from '../art/worldArt';
import { state } from '../state';
import { haptic, hapticNotify } from '../platform/telegram';
import { itemDef, type Item } from '../data/items';
import { MAX_ARMY } from '../data/units';
import { WORLD_RULES } from '../world/world';
import { CULTURE_LABEL } from '../data/names';
import { uiCoin, uiError } from '../audio/hooks';
import { itemModLines } from '../game/gear';
import { MOSAIC } from '../ui/tokens';
import { ActionBar, MButton, MChip, MStashGrid, SegmentedSwitch, SWITCH_H, TAP, GAP, addFramedArt, addPartyEmpty, addPartyShell, addPill, addPortraitWell, addRowFace, mtext, mw, rarityInk, type MButtonOpts } from '../ui/mosaic';
import { t, tOr, type TKey } from '../i18n';

type Tab = 'recruits' | 'market' | 'sell' | 'rest';

const TAB_ICON: Record<Tab, string> = { recruits: 'plus', market: 'shop', sell: 'amphora', rest: 'tent' };
const TAB_KEY: Record<Tab, TKey> = { recruits: 'town.tab.hire', market: 'town.tab.buy', sell: 'town.tab.sell', rest: 'town.tab.rest' };

/** Village / town screen: hire volunteers (class cards), buy and sell gear, rest and heal. */
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

  constructor() {
    super('Settlement');
  }

  create(data: { id?: number; tab?: Tab }): void {
    this.initUi();
    ensureFonts(this);
    const camp = state.campaign;
    const w = camp.world;
    this.id = data?.id ?? w.s.inside;
    const def = w.settlement(this.id);
    if (!def || def.kind === 'lair') {
      this.scene.start('World');
      return;
    }
    w.s.inside = this.id;
    this.tabList = def.kind === 'town' ? ['recruits', 'market', 'sell', 'rest'] : ['recruits', 'rest'];
    this.tab = data?.tab && this.tabList.includes(data.tab) ? data.tab : 'recruits';
    this.list = null;
    this.stash = null;
    this.screen({ back: () => this.leave() });
    const { VH } = this.m;
    const compact = VH < 300;

    const shell = addPartyShell(this, { title: def.name, back: () => this.leave(), id: 'town.topbar' });
    const b = shell.body;
    this.ax = b.x + 4;
    this.aw = b.w - 8;
    let y = b.y + 4;

    // the settlement, drawn large, in the fresco frame
    const artH = compact ? 38 : 78;
    addFramedArt(this, this.ui, this.ax, y, this.aw, artH, this.artTexture(def, this.aw - 8, artH - 8));
    y += artH + 3;
    const people = tOr(`culture.${def.culture}`, CULTURE_LABEL[def.culture]);
    this.ui.add(mtext(this, b.x + b.w / 2, y + 1, t(def.kind === 'town' ? 'town.town' : 'town.village', { people }), 'pSec', { size: 6.5, align: 0.5, maxW: this.aw, box: { owner: this.ui, w: this.m.VW, h: VH } }));
    y += 11;

    // gold, men, wounded
    this.chipsY = y;
    y += 18 + 3;

    // tabs
    this.ui.add(
      new SegmentedSwitch(this, this.ax, y, this.aw, {
        options: this.tabList.map((k) => ({ id: k, label: t(TAB_KEY[k]), icon: TAB_ICON[k] })),
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

    const actions: MButtonOpts[] = [
      { label: t('town.party'), icon: 'people', variant: 'secondary', id: 'town.party', onClick: () => this.scene.start('Army', { from: 'Settlement', id: this.id }) },
      { label: t('town.leave'), icon: 'map', variant: 'primary', id: 'town.leave', onClick: () => this.leave() },
    ];
    const bar = new ActionBar(this, b, actions);
    this.ui.add(bar);
    this.bodyBottom = bar.top - 3;
    this.events.once('shutdown', () => this.clearBody());
    this.refresh();
  }

  /** The settlement over the plain, at the frame's inside size and the screen's pixel density. */
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
    this.refresh();
  }

  private leave(): void {
    const w = state.campaign.world;
    w.s.inside = -1;
    w.s.safeUntil = Math.max(w.s.safeUntil, w.s.time + 0.5);
    void state.save();
    this.scene.start('World');
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
    const keep = this.list?.area.scrollY ?? 0;
    this.clearBody();
    const y = this.bodyTop;
    const h = this.bodyBottom - y;
    if (this.tab === 'recruits') this.buildRecruits(y, h);
    else if (this.tab === 'market') this.buildMarket(y, h);
    else if (this.tab === 'sell') this.buildSell(y, h);
    else this.buildRest(y, h);
    this.list?.area.setScroll(keep);
  }

  private newList(y: number, h: number, count: number, rowH: number, render: ConstructorParameters<typeof ScrollList>[6]['render']): ScrollList {
    return new ScrollList(this, this.body, this.ax, y, this.aw, h, { count, rowH, render, fade: MOSAIC.parch });
  }

  // ------------------------------------------------------------------ hire: class cards

  private buildRecruits(y: number, h: number): void {
    const camp = state.campaign;
    const w = camp.world;
    const pool = w.recruits(this.id, camp.data.heroes);
    const refresh = Math.ceil(w.refreshIn(this.id));
    if (!pool.length) {
      this.body.add(addPartyEmpty(this, this.ax, y, this.aw, h, { icon: 'people', title: t('town.noVolunteers'), hint: t('town.moreIn', { h: refresh }) }));
      return;
    }
    const full = camp.data.heroes.length >= MAX_ARMY;
    const rowH = 46;
    this.list = this.newList(y, h, pool.length + 1, rowH, (i, row, rw) => {
      const box = { owner: row, w: rw, h: rowH };
      if (i === pool.length) {
        row.add(mtext(this, rw / 2, 8, t('town.newVolunteers', { h: refresh }), 'pMuted', { size: 6, align: 0.5, maxW: rw - 4, box }));
        return;
      }
      const r = pool[i];
      const hero = r.hero;
      const cls = heroClass(hero);
      addRowFace(this, row, rw, rowH);
      // portrait in its role colour: tap for the class card
      const ps = 30;
      const py = Math.round((rowH - ps) / 2);
      addPortraitWell(this, row, 5, py, ps, roleColor(cls.role));
      const img = addPortrait(this, dollFromHero(hero), 5, py, { size: ps }).setInteractive();
      uiId(img, 'recruit.card');
      row.add(img);
      img.on('pointerup', () => !this.list?.area.moved && this.openRecruit(r.index));
      const can = camp.data.gold >= r.price && !full;
      const bw = 50;
      row.add(
        new MButton(this, rw - bw - 4, Math.round((rowH - TAP) / 2), bw, TAP, {
          label: `${r.price}`,
          icon: 'coin',
          variant: can ? 'secondary' : 'disabled',
          disabledReason: full ? t('town.armyFull') : t('stash.noGold'),
          id: 'town.hire',
          tip: t('town.hire'),
          onClick: () => this.hire(r.index),
        }),
      );
      const tx = 5 + ps + 6;
      const tw = rw - tx - bw - 8;
      row.add(mtext(this, tx, 4, `${hero.name} · ${t('hero.level', { n: hero.level })}`, 'rInk', { size: 6.5, maxW: tw, box }));
      row.add(mtext(this, tx, 14, className(hero), 'pSec', { size: 6, maxW: tw, box }));
      addPill(this, row, tx, 24, roleName(cls.role), roleColor(cls.role), tw);
      const good = `+${roleTraits(cls.role).good}`;
      row.add(mtext(this, tx, 37, good, 'pGood', { size: 6, maxW: tw, box }));
    });
  }

  openRecruit(index: number): void {
    const camp = state.campaign;
    const r = camp.world.recruits(this.id, camp.data.heroes).find((x) => x.index === index);
    if (!r) return;
    const full = camp.data.heroes.length >= MAX_ARMY;
    const a = r.hero.attrs;
    openClassCard(this, {
      hero: r.hero,
      title: r.hero.name,
      price: `${t('attr.str.short')} ${a.str} · ${t('attr.agi.short')} ${a.agi} · ${t('attr.end.short')} ${a.end} · ${t('attr.wil.short')} ${a.wil}`,
      action: { label: `${t('town.hire')} ${r.price}`, icon: 'coin', id: 'town.hireCard', disabled: full ? t('town.armyFull') : camp.data.gold < r.price ? t('stash.noGold') : undefined, onClick: () => this.hire(index) },
    });
  }

  private hire(index: number): void {
    const h = state.campaign.hire(this.id, index);
    if (!h) {
      hapticNotify('error');
      return;
    }
    hapticNotify('success');
    uiCoin();
    toast(this, t('town.hired', { name: h.name }), 'good');
    void state.save();
    this.refresh();
  }

  // ------------------------------------------------------------------ buy

  private buildMarket(y: number, h: number): void {
    const camp = state.campaign;
    const w = camp.world;
    const wares = w.wares(this.id, camp.armyClasses());
    const refresh = Math.ceil(w.refreshIn(this.id));
    if (!wares.length) {
      this.body.add(addPartyEmpty(this, this.ax, y, this.aw, h, { icon: 'coin', title: t('town.soldOut'), hint: t('town.newWares', { h: refresh }) }));
      return;
    }
    const rowH = 40;
    this.list = this.newList(y, h, wares.length + 1, rowH, (i, row, rw, rh, area) => {
      const box = { owner: row, w: rw, h: rh };
      if (i === wares.length) {
        row.add(mtext(this, rw / 2, 8, t('town.newWares', { h: refresh }), 'pMuted', { size: 6, align: 0.5, maxW: rw - 4, box }));
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
          onClick: () => this.buy(ware.index),
        }),
      );
      const tx = 5 + isz + 6;
      const tw = rw - tx - bw - 8;
      row.add(mtext(this, tx, 5, itemName(it), rarityInk(this, it.rarity), { size: 6.5, maxW: tw, box }));
      const def = itemDef(it.def);
      // the slot, then its main stats on their own line (whole; a long one drops before it is cut)
      const mods = itemModLines(it).slice(0, 2).map((m) => `${tOr(`mod.${m.key}`, m.key)} ${m.text}`);
      const ml = measureText(mods.join(' · ')) <= tw ? mods.join(' · ') : (mods[0] ?? '');
      row.add(mtext(this, tx, 16, t(`slot.${def.slot}` as TKey), 'pSec', { size: 6, maxW: tw, box }));
      row.add(mtext(this, tx, 26, ml, 'pMuted', { size: 6, maxW: tw, box }));
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
      actions: [{ label: `${ware.price}`, icon: 'coin', variant: 'primary', id: 'town.buyCard', disabled: camp.data.gold < ware.price ? t('stash.noGold') : undefined, onClick: () => this.buy(index) }],
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

  // ------------------------------------------------------------------ rest

  private buildRest(y: number, h: number): void {
    const camp = state.campaign;
    const def = camp.world.settlement(this.id)!;
    const rate = def.kind === 'town' ? WORLD_RULES.healTown : WORLD_RULES.healVillage;
    const wounded = camp.wounded();
    const w = this.aw;
    const x0 = this.ax;
    const cx = x0 + w / 2;
    const town = def.kind === 'town';
    const BH = TAP + 2;
    const box = { owner: this.body, w: this.m.VW, h: this.m.VH };
    // On a short screen Rest and Physician share a row, and then the headline
    // goes (the top bar already counts the hurt): the actions always fit.
    const rowsH = (rows: number) => (BH + GAP) * rows + 4 + 12;
    // not even the two rows of actions fit: the whole tab scrolls
    if (h < 12 + rowsH(town ? 2 : 2) + 20) {
      this.buildRestScroll(y, h);
      return;
    }
    const pair = town && h < 12 + rowsH(3);
    const actionsH = rowsH(town && !pair ? 3 : 2);
    const showHead = h >= 12 + actionsH;
    let cy = y;
    const head = wounded.length ? `${t('town.wounded')}: ${wounded.length}` : t('town.allFit');
    if (showHead) {
      this.body.add(mtext(this, cx, cy + 1, head, wounded.length ? 'pBad' : 'pGood', { size: 7, align: 0.5, maxW: w, box }));
      cy += 12;
    }
    // the wounded list, the healing rate under it when there is room
    const room = y + h - actionsH - cy;
    const noteLines = wrapText(t('town.restRate', { n: rate }), w - 8, 3, false, 6);
    const noteH = noteLines.lines.length * 8 + 4;
    const listH = wounded.length ? Math.floor((room - (room - noteH >= 52 ? noteH : 0)) / 29) * 29 - 3 : 0;
    if (wounded.length && listH >= 26) {
      this.list = this.newList(cy, listH, wounded.length, 26, (i, row, rw, rh) => {
        const hero = wounded[i];
        const rb = { owner: row, w: rw, h: rh };
        addRowFace(this, row, rw, rh);
        addPortraitWell(this, row, 3, 2, rh - 4, roleColor(heroClass(hero).role));
        row.add(addPortrait(this, dollFromHero(hero), 3, 2, { size: rh - 4 }));
        const hrs = t('town.restHours', { h: Math.ceil(hero.wound) });
        row.add(mtext(this, rw - 5, Math.round((rh - 7) / 2), hrs, 'pBad', { align: 1, box: rb }));
        row.add(mtext(this, rh + 3, Math.round((rh - 7) / 2), hero.name, 'rInk', { size: 6.5, maxW: rw - rh - 8 - mw(hrs, 'pBad'), box: rb }));
      });
      cy += listH + 3;
    }
    if (y + h - actionsH - cy >= noteH) noteLines.lines.forEach((l, i) => this.body.add(mtext(this, cx, cy + 2 + i * 8, l, 'pMuted', { size: 6, align: 0.5, box })));
    let by = y + h - actionsH + 4;
    // provisions: rations for the march, supplies for the field camp
    const w0 = camp.world;
    this.body.add(mtext(this, cx, by, t('town.provisions', { food: Math.floor(w0.food), sup: Math.floor(w0.supplies) }), 'pSec', { size: 6, align: 0.5, maxW: w, box }));
    by += 12;
    const half = Math.floor((w - GAP) / 2);
    (['food', 'supplies'] as const).forEach((kind, i) => {
      const price = camp.provisionPrice(kind, this.id);
      this.body.add(
        new MButton(this, x0 + i * (half + GAP), by, i === 0 ? half : w - half - GAP, BH, {
          label: `${t(kind === 'food' ? 'town.buyFood' : 'town.buySupplies')} ${price}`,
          icon: kind === 'food' ? 'food' : 'wood',
          variant: camp.data.gold >= price ? 'secondary' : 'disabled',
          disabledReason: t('stash.noGold'),
          id: `town.buy.${kind}`,
          tip: t(kind === 'food' ? 'town.foodTip' : 'town.supplyTip'),
          onClick: () => this.provision(kind),
        }),
      );
    });
    by += BH + GAP;
    this.body.add(new MButton(this, x0, by, pair ? half : w, BH, { label: t('town.rest8'), icon: 'tent', variant: 'secondary', id: 'town.rest', onClick: () => this.rest(8) }));
    if (!pair) by += BH + GAP;
    if (town) {
      const cost = camp.healCost();
      const label = cost > 0 ? t('town.physician', { n: cost }) : t('town.noPatients');
      const can = cost > 0 && camp.data.gold >= cost;
      this.body.add(
        new MButton(this, pair ? x0 + half + GAP : x0, by, pair ? w - half - GAP : w, BH, {
          label,
          tip: pair ? label : undefined,
          icon: 'cross',
          variant: can ? 'secondary' : 'disabled',
          disabledReason: cost > 0 ? t('stash.noGold') : t('town.allFit'),
          id: 'town.physician',
          onClick: () => this.physician(),
        }),
      );
    }
  }

  /** The rest tab as one scrolling page (a short screen): headline, the wounded, the note, provisions and the actions in a column. */
  private buildRestScroll(y: number, h: number): void {
    const camp = state.campaign;
    const def = camp.world.settlement(this.id)!;
    const town = def.kind === 'town';
    const rate = town ? WORLD_RULES.healTown : WORLD_RULES.healVillage;
    const wounded = camp.wounded();
    const area = new ScrollArea(this, this.body, this.ax, y, this.aw, h, this.m.S);
    this.restArea = area;
    addScrollHint(this, this.body, area, MOSAIC.parch);
    const c = area.content;
    const w = this.aw - 3;
    const box = { owner: c, w: this.aw, h: 100000 };
    const BH = TAP + 2;
    let cy = 0;
    c.add(mtext(this, w / 2, cy + 1, wounded.length ? `${t('town.wounded')}: ${wounded.length}` : t('town.allFit'), wounded.length ? 'pBad' : 'pGood', { size: 7, align: 0.5, maxW: w, box }));
    cy += 12;
    wounded.forEach((hero) => {
      const rh = 26;
      const row = this.add.container(0, cy);
      const rb = { owner: row, w, h: rh };
      addRowFace(this, row, w, rh);
      addPortraitWell(this, row, 3, 2, rh - 4, roleColor(heroClass(hero).role));
      row.add(addPortrait(this, dollFromHero(hero), 3, 2, { size: rh - 4 }));
      const hrs = t('town.restHours', { h: Math.ceil(hero.wound) });
      row.add(mtext(this, w - 5, Math.round((rh - 7) / 2), hrs, 'pBad', { align: 1, box: rb }));
      row.add(mtext(this, rh + 3, Math.round((rh - 7) / 2), hero.name, 'rInk', { size: 6.5, maxW: w - rh - 8 - mw(hrs, 'pBad'), box: rb }));
      c.add(row);
      cy += rh + GAP;
    });
    wrapText(t('town.restRate', { n: rate }), w - 8, 3, false, 6).lines.forEach((l, i) => c.add(mtext(this, w / 2, cy + 2 + i * 8, l, 'pMuted', { size: 6, align: 0.5, box })));
    cy += wrapText(t('town.restRate', { n: rate }), w - 8, 3, false, 6).lines.length * 8 + 6;
    c.add(mtext(this, w / 2, cy, t('town.provisions', { food: Math.floor(camp.world.food), sup: Math.floor(camp.world.supplies) }), 'pSec', { size: 6, align: 0.5, maxW: w, box }));
    cy += 12;
    (['food', 'supplies'] as const).forEach((kind) => {
      const price = camp.provisionPrice(kind, this.id);
      c.add(
        new MButton(this, 0, cy, w, BH, {
          label: `${t(kind === 'food' ? 'town.buyFood' : 'town.buySupplies')} ${price}`,
          icon: kind === 'food' ? 'food' : 'wood',
          variant: camp.data.gold >= price ? 'secondary' : 'disabled',
          disabledReason: t('stash.noGold'),
          id: `town.buy.${kind}`,
          tip: t(kind === 'food' ? 'town.foodTip' : 'town.supplyTip'),
          onClick: () => this.provision(kind),
        }),
      );
      cy += BH + GAP;
    });
    c.add(new MButton(this, 0, cy, w, BH, { label: t('town.rest8'), icon: 'tent', variant: 'secondary', id: 'town.rest', onClick: () => this.rest(8) }));
    cy += BH + GAP;
    if (town) {
      const cost = camp.healCost();
      const label = cost > 0 ? t('town.physician', { n: cost }) : t('town.noPatients');
      c.add(
        new MButton(this, 0, cy, w, BH, {
          label,
          icon: 'cross',
          variant: cost > 0 && camp.data.gold >= cost ? 'secondary' : 'disabled',
          disabledReason: cost > 0 ? t('stash.noGold') : t('town.allFit'),
          id: 'town.physician',
          onClick: () => this.physician(),
        }),
      );
      cy += BH + GAP;
    }
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

