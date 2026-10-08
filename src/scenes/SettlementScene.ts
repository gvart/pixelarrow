import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, addIcon, addPanel, addScroll, addText } from '../ui/kit';
import { ItemIcon, ScrollList, Tabs, addEmptyState, confirmDialog, toast } from '../ui/widgets';
import { uiId } from '../ui/layout';
import { ellipsize, wrapText, LINE_H } from '../ui/textfit';
import { SIZE } from '../ui/theme';
import { ensureFonts, rarityFont } from '../ui/fonts';
import { StashGrid, addChip, className, defaultStashState, itemName, openClassCard, openItemCard, roleColor, roleName, roleTraits, type StashState } from '../ui/sheet';
import { ensurePortrait } from '../ui/sprites';
import { heroClass } from '../sim/stats';
import { dollFromHero } from '../art/paperdoll';
import { renderSettlement } from '../art/worldArt';
import { state } from '../state';
import { haptic, hapticNotify } from '../platform/telegram';
import { itemDef, itemValue, type Item } from '../data/items';
import { MAX_ARMY } from '../data/units';
import { WORLD_RULES } from '../world/world';
import { CULTURE_LABEL } from '../data/names';
import { uiCoin, uiError } from '../audio/hooks';
import { itemModLines } from '../game/gear';
import { t, tOr, type TKey } from '../i18n';

type Tab = 'recruits' | 'market' | 'sell' | 'rest';

/** Village / town screen: hire volunteers (class cards), buy and sell gear, rest and heal. */
export class SettlementScene extends BaseScene {
  private id = 0;
  private tab: Tab = 'recruits';
  private tabList: Tab[] = [];
  private body!: Phaser.GameObjects.Container;
  private list: ScrollList | null = null;
  private stash: StashGrid | null = null;
  private stashState: StashState = defaultStashState();
  private goldText!: Phaser.GameObjects.BitmapText;
  private armyText!: Phaser.GameObjects.BitmapText;
  private bodyTop = 0;

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
    const { VW, VH } = this.m;
    const compact = VH < 300;

    // backdrop: the plain and the settlement drawn large (a short band on small screens)
    this.addGrassBackdrop(def.id + 30);
    const artH = compact ? 50 : 92;
    const key = `wm_setbig_${def.kind}_${def.id % 2}_${def.coastal ? 1 : 0}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, renderSettlement(def.kind, def.id, def.coastal).toCanvas());
    this.ui.add(this.add.image(VW / 2, artH, key).setScale(compact ? (def.kind === 'town' ? 1 : 2) : def.kind === 'town' ? 2 : 3).setOrigin(0.5, 1));

    addScroll(this, this.ui, 8, 4, VW - 16, compact ? 28 : 34);
    const people = tOr(`culture.${def.culture}`, CULTURE_LABEL[def.culture]);
    this.ui.add(addText(this, VW / 2, compact ? 9 : 11, ellipsize(def.name, VW - 32), 'red', 0.5));
    this.ui.add(addText(this, VW / 2, compact ? 19 : 23, ellipsize(t(def.kind === 'town' ? 'town.town' : 'town.village', { people }), VW - 32), 'dim', 0.5));

    // status strip: gold, army, wounded
    const sy = artH + 2;
    this.ui.add(addPanel(this, 4, sy, VW - 8, 16, 'parch'));
    this.ui.add(addIcon(this, 8, sy + 2, 'coin'));
    this.goldText = addText(this, 23, sy + 4, '', 'ink');
    this.ui.add(this.goldText);
    this.ui.add(addIcon(this, Math.round(VW / 2) - 10, sy + 2, 'people'));
    this.armyText = addText(this, Math.round(VW / 2) + 5, sy + 4, '', 'ink');
    this.ui.add(this.armyText);

    // tabs
    const ty = sy + 19;
    const tabs = new Tabs(this, 4, ty, VW - 8, this.tabList.map((k) => t(`town.tab.${k === 'recruits' ? 'hire' : k === 'market' ? 'buy' : k}` as TKey)), {
      selected: this.tabList.indexOf(this.tab),
      icons: ['plus', 'coin', 'shield', 'tent'].filter((_, i) => def.kind === 'town' || i === 0 || i === 3),
      ids: this.tabList.map((k) => `town.tab.${k}`),
      onChange: (i) => this.setTab(this.tabList[i]),
    });
    this.ui.add(addPanel(this, 0, ty + SIZE.tabH - 2, VW, VH - ty - SIZE.tabH - 30, 'parch'));
    this.ui.add(tabs);
    this.bodyTop = ty + SIZE.tabH + 4;

    this.body = this.add.container(0, 0);
    this.ui.add(this.body);

    const by = VH - 28;
    this.ui.add(addPanel(this, 0, by - 4, VW, 32, 'parch'));
    const bw = Math.floor((VW - 8 - SIZE.gap) / 2);
    this.ui.add(new Button(this, 4, by, bw, SIZE.btnH, { label: t('town.party'), icon: 'people', id: 'town.party', onClick: () => this.scene.start('Army', { from: 'Settlement', id: this.id }) }));
    this.ui.add(new Button(this, 4 + bw + SIZE.gap, by, VW - 8 - bw - SIZE.gap, SIZE.btnH, { label: t('town.leave'), icon: 'map', variant: 'primary', id: 'town.leave', onClick: () => this.leave() }));
    this.events.once('shutdown', () => this.clearBody());
    this.refresh();
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
    this.goldText.setText(`${camp.data.gold}`);
    const wounded = camp.wounded().length;
    this.armyText.setText(ellipsize(`${camp.data.heroes.length}/${MAX_ARMY}${wounded ? ` ${t('town.hurt', { n: wounded })}` : ''}`, this.m.VW - 8 - this.armyText.x));
    this.buildBody();
  }

  private clearBody(): void {
    this.list?.destroy();
    this.list = null;
    this.stash?.destroy();
    this.stash = null;
    this.body.removeAll(true);
  }

  private buildBody(): void {
    const keep = this.list?.area.scrollY ?? 0;
    this.clearBody();
    const { VH } = this.m;
    const y = this.bodyTop;
    const h = VH - 34 - y;
    if (this.tab === 'recruits') this.buildRecruits(y, h);
    else if (this.tab === 'market') this.buildMarket(y, h);
    else if (this.tab === 'sell') this.buildSell(y, h);
    else this.buildRest(y, h);
    this.list?.area.setScroll(keep);
  }

  // ------------------------------------------------------------------ hire: class cards

  private buildRecruits(y: number, h: number): void {
    const { VW } = this.m;
    const camp = state.campaign;
    const w = camp.world;
    const pool = w.recruits(this.id, camp.data.heroes);
    const refresh = Math.ceil(w.refreshIn(this.id));
    if (!pool.length) {
      this.body.add(addEmptyState(this, 4, y, VW - 8, h, { icon: 'people', title: t('town.noVolunteers'), hint: t('town.moreIn', { h: refresh }) }));
      return;
    }
    const full = camp.data.heroes.length >= MAX_ARMY;
    const rowH = 50;
    this.list = new ScrollList(this, this.body, 4, y, VW - 8, h, {
      count: pool.length + 1,
      rowH,
      render: (i, row, rw) => {
        if (i === pool.length) {
          row.add(addText(this, rw / 2, 8, ellipsize(t('town.newVolunteers', { h: refresh }), rw), 'dim', 0.5));
          return;
        }
        const r = pool[i];
        const hero = r.hero;
        const cls = heroClass(hero);
        row.add(addPanel(this, 0, 0, rw, rowH, 'button'));
        // portrait in its role colour: tap for the class card
        const pf = this.add.graphics();
        pf.fillStyle(0x1d140f, 1);
        pf.fillRect(3, 3, 30, 30);
        pf.fillStyle(roleColor(cls.role), 1);
        pf.fillRect(4, 4, 28, 28);
        row.add(pf);
        const img = this.add.image(6, 6, ensurePortrait(this, dollFromHero(hero))).setOrigin(0, 0).setInteractive();
        uiId(img, 'recruit.card');
        row.add(img);
        img.on('pointerup', () => !this.list?.area.moved && this.openRecruit(r.index));
        const can = camp.data.gold >= r.price && !full;
        const bw = 46;
        const b = new Button(this, rw - bw - 3, 13, bw, SIZE.btnH, {
          label: `${r.price}`,
          icon: 'coin',
          variant: can ? 'primary' : 'secondary',
          id: 'town.hire',
          tip: t('town.hire'),
          onClick: () => this.hire(r.index),
        });
        b.setEnabled(can, full ? t('town.armyFull') : t('stash.noGold'));
        row.add(b);
        const tx = 38;
        const tw = rw - tx - bw - 8;
        row.add(addText(this, tx, 3, ellipsize(`${hero.name} · ${t('hero.level', { n: hero.level })}`, tw), 'ink'));
        row.add(addText(this, tx, 13, ellipsize(className(hero), tw), 'red'));
        const rt = roleTraits(cls.role);
        addChip(this, row, tx, 24, roleName(cls.role), roleColor(cls.role), tw);
        row.add(addText(this, tx, 38, ellipsize(`+${rt.good}`, tw), 'good'));
      },
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
    const { VW } = this.m;
    const camp = state.campaign;
    const w = camp.world;
    const wares = w.wares(this.id);
    const refresh = Math.ceil(w.refreshIn(this.id));
    if (!wares.length) {
      this.body.add(addEmptyState(this, 4, y, VW - 8, h, { icon: 'coin', title: t('town.soldOut'), hint: t('town.newWares', { h: refresh }) }));
      return;
    }
    const rowH = 30;
    this.list = new ScrollList(this, this.body, 4, y, VW - 8, h, {
      count: wares.length + 1,
      rowH,
      render: (i, row, rw, rh, area) => {
        if (i === wares.length) {
          row.add(addText(this, rw / 2, 8, ellipsize(t('town.newWares', { h: refresh }), rw), 'dim', 0.5));
          return;
        }
        const ware = wares[i];
        const it = ware.item;
        row.add(addPanel(this, 0, 0, rw, rh, 'button'));
        row.add(new ItemIcon(this, 3, 3, { item: it }, { area, onTap: () => this.openWare(ware.index) }));
        const can = camp.data.gold >= ware.price;
        const bw = 46;
        const b = new Button(this, rw - bw - 3, 3, bw, SIZE.btnH, { label: `${ware.price}`, icon: 'coin', id: 'town.buy', variant: can ? 'secondary' : 'secondary', onClick: () => this.buy(ware.index) });
        b.setEnabled(can, t('stash.noGold'));
        row.add(b);
        const tw = rw - 32 - bw - 6;
        row.add(addText(this, 31, 5, ellipsize(itemName(it), tw), rarityFont(it.rarity)));
        const def = itemDef(it.def);
        const ml = itemModLines(it).slice(0, 2).map((m) => `${tOr(`mod.${m.key}`, m.key)} ${m.text}`).join(' ');
        row.add(addText(this, 31, 16, ellipsize(`${t(`slot.${def.slot}` as TKey)} · ${ml}`, tw), 'dim'));
      },
    });
  }

  openWare(index: number): void {
    const camp = state.campaign;
    const ware = camp.world.wares(this.id).find((x) => x.index === index);
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
    const { VW } = this.m;
    this.stash = new StashGrid(this, this.body, 4, y, VW - 8, h, {
      items: () => state.campaign.data.stash,
      state: this.stashState,
      onTap: (it) => this.openSell(it),
    });
  }

  openSell(it: Item): void {
    const val = itemValue(it);
    openItemCard(this, {
      item: it,
      hero: state.campaign.data.heroes[0],
      notes: [{ text: t('town.sellHint') }],
      actions: [
        {
          label: t('stash.sell', { n: val }),
          icon: 'coin',
          variant: 'primary',
          id: 'stash.sell',
          onClick: () => confirmDialog(this, { title: t('stash.sellTitle', { name: itemName(it) }), body: t('stash.sellBody', { n: val }), ok: t('stash.sell', { n: val }), cancel: t('common.cancel'), onOk: () => this.sell(it, val) }),
        },
      ],
    });
  }

  private sell(it: Item, val: number): void {
    state.campaign.sell(it.uid, val);
    haptic('medium');
    uiCoin();
    toast(this, t('stash.sold', { n: val }), 'good');
    void state.save();
    this.refresh();
  }

  // ------------------------------------------------------------------ rest

  private buildRest(y: number, h: number): void {
    const camp = state.campaign;
    const def = camp.world.settlement(this.id)!;
    const { VW } = this.m;
    const rate = def.kind === 'town' ? WORLD_RULES.healTown : WORLD_RULES.healVillage;
    const wounded = camp.wounded();
    const w = VW - 8;
    const town = def.kind === 'town';
    // On a short screen Rest and Physician share a row, and then the headline
    // goes (the top bar already counts the hurt): the actions always fit.
    const rowsH = (rows: number) => (SIZE.btnH + SIZE.gap) * rows + 4 + 12;
    const pair = town && h < 12 + rowsH(3);
    const actionsH = rowsH(town && !pair ? 3 : 2);
    const showHead = h >= 12 + actionsH;
    let cy = y;
    const head = wounded.length ? `${t('town.wounded')}: ${wounded.length}` : t('town.allFit');
    if (showHead) {
      this.body.add(addText(this, VW / 2, cy + 1, ellipsize(head, w), wounded.length ? 'red' : 'good', 0.5));
      cy += 12;
    }
    // the wounded list, the healing rate under it when there is room
    const room = y + h - actionsH - cy;
    const noteLines = wrapText(t('town.restRate', { n: rate }), w - 8, 3);
    const noteH = noteLines.lines.length * LINE_H + 4;
    const listH = wounded.length ? Math.floor((room - (room - noteH >= 52 ? noteH : 0)) / 29) * 29 - 3 : 0;
    if (wounded.length && listH >= 26) {
      this.list = new ScrollList(this, this.body, 4, cy, w, listH, {
        count: wounded.length,
        rowH: 26,
        render: (i, row, rw, rh) => {
          const hero = wounded[i];
          row.add(addPanel(this, 0, 0, rw, rh, 'inset'));
          row.add(this.add.image(2, 1, ensurePortrait(this, dollFromHero(hero))).setOrigin(0, 0));
          const hrs = addText(this, rw - 4, 9, t('town.restHours', { h: Math.ceil(hero.wound) }), 'red', 1);
          row.add(hrs);
          row.add(addText(this, 29, 9, ellipsize(hero.name, rw - 33 - hrs.width - 4), 'ink'));
        },
      });
      cy += listH + 3;
    }
    if (y + h - actionsH - cy >= noteH) this.body.add(addText(this, VW / 2, cy + 2, noteLines.lines.join('\n'), 'dim', 0.5).setCenterAlign());
    let by = y + h - actionsH + 4;
    // provisions: rations for the march, supplies for the field camp
    const w0 = camp.world;
    this.body.add(addText(this, VW / 2, by, ellipsize(t('town.provisions', { food: Math.floor(w0.food), sup: Math.floor(w0.supplies) }), w), 'dim', 0.5));
    by += 12;
    const half = Math.floor((w - SIZE.gap) / 2);
    (['food', 'supplies'] as const).forEach((kind, i) => {
      const price = camp.provisionPrice(kind, this.id);
      const b = new Button(this, 4 + i * (half + SIZE.gap), by, half, SIZE.btnH, {
        label: `${t(kind === 'food' ? 'town.buyFood' : 'town.buySupplies')} ${price}`,
        icon: kind === 'food' ? 'food' : 'wood',
        id: `town.buy.${kind}`,
        tip: t(kind === 'food' ? 'town.foodTip' : 'town.supplyTip'),
        onClick: () => this.provision(kind),
      });
      b.setEnabled(camp.data.gold >= price, t('stash.noGold'));
      this.body.add(b);
    });
    by += SIZE.btnH + SIZE.gap;
    this.body.add(new Button(this, 4, by, pair ? half : w, SIZE.btnH, { label: t('town.rest8'), icon: 'tent', id: 'town.rest', onClick: () => this.rest(8) }));
    if (!pair) by += SIZE.btnH + SIZE.gap;
    if (town) {
      const cost = camp.healCost();
      const label = cost > 0 ? t('town.physician', { n: cost }) : t('town.noPatients');
      const b = new Button(this, pair ? 4 + half + SIZE.gap : 4, by, pair ? half : w, SIZE.btnH, {
        label,
        tip: pair ? label : undefined,
        icon: 'cross',
        variant: cost > 0 && camp.data.gold >= cost ? 'primary' : 'secondary',
        id: 'town.physician',
        onClick: () => this.physician(),
      });
      b.setEnabled(cost > 0 && camp.data.gold >= cost, cost > 0 ? t('stash.noGold') : t('town.allFit'));
      this.body.add(b);
    }
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
