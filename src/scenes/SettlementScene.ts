import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, ScrollArea, addIcon, addPanel, addScroll, addText } from '../ui/kit';
import { dollFrame, ensureDoll, ensureItemIcon } from '../ui/sprites';
import { dollFromHero } from '../art/paperdoll';
import { renderSettlement } from '../art/worldArt';
import { state } from '../state';
import { haptic, hapticNotify } from '../platform/telegram';
import { itemDef, itemValue, RARITY_LABEL } from '../data/items';
import { MAX_ARMY } from '../data/units';
import { TRAITS } from '../data/traits';
import { CULTURE_LABEL } from '../data/names';
import { RARITY_COLOR } from './ArmyScene';
import { WORLD_RULES } from '../world/world';

type Tab = 'recruits' | 'market' | 'sell' | 'rest';

const ARCH_LABEL: Record<string, string> = { raw: 'Levy', hoplite: 'Hoplite', swordsman: 'Swordsman', axeman: 'Axeman', peltast: 'Peltast', slinger: 'Slinger', archer: 'Archer' };

/** Village / town screen: hire volunteers, trade at the market, rest and heal. */
export class SettlementScene extends BaseScene {
  private id = 0;
  private tab: Tab = 'recruits';
  private body!: Phaser.GameObjects.Container;
  private area: ScrollArea | null = null;
  private goldText!: Phaser.GameObjects.BitmapText;
  private armyText!: Phaser.GameObjects.BitmapText;
  private tabBtns = new Map<Tab, Button>();

  constructor() {
    super('Settlement');
  }

  create(data: { id?: number; tab?: Tab }): void {
    this.initUi();
    const camp = state.campaign;
    const w = camp.world;
    this.id = data?.id ?? w.s.inside;
    const def = w.settlement(this.id);
    if (!def || def.kind === 'lair') {
      this.scene.start('World');
      return;
    }
    w.s.inside = this.id;
    this.tab = data?.tab ?? 'recruits';
    this.area = null;
    this.tabBtns = new Map();
    this.telegramBack(() => this.leave());
    const { VW, VH } = this.m;

    // backdrop: plain + the settlement drawn large
    this.addGrassBackdrop(def.id + 30);
    const key = `wm_setbig_${def.kind}_${def.id % 2}_${def.coastal ? 1 : 0}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, renderSettlement(def.kind, def.id, def.coastal).toCanvas());
    this.ui.add(this.add.image(VW / 2, 92, key).setScale(def.kind === 'town' ? 3 : 3).setOrigin(0.5, 1));

    addScroll(this, this.ui, 8, 6, VW - 16, 34);
    const title = addText(this, VW / 2, 12, def.name, 'red', 0.5);
    this.ui.add(title);
    this.ui.add(addText(this, VW / 2, 24, `${def.kind === 'town' ? 'Town' : 'Village'} of the ${CULTURE_LABEL[def.culture]}`, 'dim', 0.5));

    // status line
    const sy = 96;
    this.ui.add(addPanel(this, 4, sy, VW - 8, 16, 'parch'));
    this.ui.add(addIcon(this, 8, sy + 2, 'coin'));
    this.goldText = addText(this, 23, sy + 4, '', 'ink');
    this.ui.add(this.goldText);
    this.ui.add(addIcon(this, VW / 2 - 6, sy + 2, 'people'));
    this.armyText = addText(this, VW / 2 + 9, sy + 4, '', 'ink');
    this.ui.add(this.armyText);

    // tabs
    const tabs: [Tab, string, string][] = [['recruits', 'Recruit', 'plus']];
    if (def.kind === 'town') tabs.push(['market', 'Buy', 'coin'], ['sell', 'Sell', 'shield']);
    tabs.push(['rest', 'Rest', 'tent']);
    const tw = Math.floor((VW - 8 - (tabs.length - 1) * 3) / tabs.length);
    tabs.forEach(([t, label, icon], i) => {
      const b = new Button(this, 4 + i * (tw + 3), sy + 19, tw, 22, { label, icon, onClick: () => this.setTab(t) });
      this.tabBtns.set(t, b);
      this.ui.add(b);
    });

    this.body = this.add.container(0, 0);
    this.ui.add(this.body);

    const by = VH - 30;
    this.ui.add(addPanel(this, 0, by - 3, VW, 33, 'parch'));
    const bw = Math.floor((VW - 12) / 2);
    this.ui.add(new Button(this, 4, by, bw, 26, { label: 'Party', icon: 'people', onClick: () => this.scene.start('Army', { from: 'Settlement', id: this.id }) }));
    this.ui.add(new Button(this, 8 + bw, by, bw, 26, { label: 'Leave', icon: 'map', style: 'buttonSel', onClick: () => this.leave() }));
    this.refresh();
  }

  private setTab(t: Tab): void {
    this.tab = t;
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
    this.armyText.setText(`${camp.data.heroes.length}/${MAX_ARMY}${wounded ? ` (${wounded} hurt)` : ''}`.toUpperCase());
    for (const [t, b] of this.tabBtns) b.setSelected(t === this.tab);
    this.buildBody();
  }

  private buildBody(): void {
    this.body.removeAll(true);
    this.area?.destroy();
    this.area = null;
    const { VW, VH, S } = this.m;
    const y = 142;
    const h = VH - 36 - y;
    this.body.add(addPanel(this, 4, y - 1, VW - 8, h + 2, 'inset'));
    if (this.tab === 'rest') {
      this.buildRest(y, h);
      return;
    }
    const area = new ScrollArea(this, this.body, 6, y + 1, VW - 12, h - 2, S);
    this.area = area;
    const rw = VW - 12;
    let cy = 0;
    const camp = state.campaign;
    const w = camp.world;
    if (this.tab === 'recruits') {
      const pool = w.recruits(this.id, camp.data.heroes);
      if (pool.length === 0) area.content.add(addText(this, rw / 2, 12, `No volunteers. More in ${Math.ceil(w.refreshIn(this.id))}h.`, 'dim', 0.5));
      for (const r of pool) {
        const row = this.add.container(0, cy);
        row.add(addPanel(this, 0, 0, rw, 40, 'button'));
        const img = this.add.image(4, -6, ensureDoll(this, dollFromHero(r.hero)), dollFrame(0, 0)).setOrigin(0, 0);
        img.setCrop(4, 8, 26, 30);
        row.add(img);
        row.add(addText(this, 34, 4, r.hero.name, 'ink'));
        const traits = r.hero.traits.map((t) => TRAITS[t].name).join(' ');
        row.add(addText(this, 34, 13, `Lv${r.hero.level} ${ARCH_LABEL[r.hero.arch ?? 'raw'] ?? ''} ${traits}`, 'dim'));
        const wpn = r.hero.equip.weapon ? itemDef(r.hero.equip.weapon.def).name : 'Unarmed';
        const a = r.hero.attrs;
        row.add(addText(this, 34, 23, `${wpn}`, 'dim'));
        row.add(addText(this, 34, 31, `S${a.str} A${a.agi} E${a.end} W${a.wil}`, 'dim'));
        const can = camp.data.gold >= r.price && camp.data.heroes.length < MAX_ARMY;
        const b = new Button(this, rw - 54, 9, 50, 22, { label: `${r.price}`, icon: 'coin', style: can ? 'buttonSel' : 'buttonOff', onClick: () => this.hire(r.index) });
        row.add(b);
        area.content.add(row);
        cy += 43;
      }
      area.content.add(addText(this, rw / 2, cy + 4, `New volunteers in ${Math.ceil(w.refreshIn(this.id))}h`, 'dim', 0.5));
      cy += 16;
    } else if (this.tab === 'market') {
      const wares = w.wares(this.id);
      if (wares.length === 0) area.content.add(addText(this, rw / 2, 12, 'Sold out.', 'dim', 0.5));
      for (const ware of wares) {
        this.itemRow(area, ware.item, cy, rw, `${ware.price}`, camp.data.gold >= ware.price, () => this.buy(ware.index));
        cy += 25;
      }
      area.content.add(addText(this, rw / 2, cy + 4, `New wares in ${Math.ceil(w.refreshIn(this.id))}h`, 'dim', 0.5));
      cy += 16;
    } else if (this.tab === 'sell') {
      const stash = camp.data.stash;
      if (stash.length === 0) area.content.add(addText(this, rw / 2, 12, 'Your stash is empty.', 'dim', 0.5));
      for (const it of stash) {
        const val = itemValue(it);
        this.itemRow(area, it, cy, rw, `${val}`, true, () => this.sell(it.uid, val));
        cy += 25;
      }
    }
    area.setContentHeight(cy + 4);
  }

  private itemRow(area: ScrollArea, it: import('../data/items').Item, y: number, rw: number, price: string, can: boolean, onBuy: () => void): void {
    const def = itemDef(it.def);
    const row = this.add.container(0, y);
    row.add(addPanel(this, 0, 0, rw, 23, 'button'));
    row.add(this.add.image(4, 3, ensureItemIcon(this, it)).setOrigin(0, 0));
    row.add(this.add.rectangle(23, 4, 3, 3, RARITY_COLOR[it.rarity]).setOrigin(0, 0));
    row.add(addText(this, 29, 3, def.name, 'ink'));
    row.add(addText(this, 29, 12, `${RARITY_LABEL[it.rarity]} ${def.slot} ${Math.round(it.cond)}%`, 'dim'));
    row.add(new Button(this, rw - 50, 2, 46, 19, { label: price, icon: 'coin', style: can ? 'button' : 'buttonOff', onClick: () => (area.moved ? undefined : onBuy()) }));
    area.content.add(row);
  }

  private buildRest(y: number, _h: number): void {
    const camp = state.campaign;
    const def = camp.world.settlement(this.id)!;
    const { VW } = this.m;
    const rate = def.kind === 'town' ? WORLD_RULES.healTown : WORLD_RULES.healVillage;
    const wounded = camp.wounded();
    let cy = y + 6;
    this.body.add(addText(this, VW / 2, cy, wounded.length ? 'The wounded' : 'Everyone is fit to fight', 'red', 0.5));
    cy += 12;
    for (const h of wounded.slice(0, 8)) {
      this.body.add(addIcon(this, 10, cy - 2, 'cross'));
      this.body.add(addText(this, 26, cy, h.name, 'ink'));
      this.body.add(addText(this, VW - 10, cy, `${Math.ceil(h.wound)}h of rest`, 'dim', 1));
      cy += 11;
    }
    if (wounded.length > 8) {
      this.body.add(addText(this, 26, cy, `+${wounded.length - 8} more`, 'dim'));
      cy += 11;
    }
    cy += 6;
    this.body.add(addText(this, VW / 2, cy, `Resting here heals ${rate}x faster than marching.`, 'dim', 0.5, VW - 16));
    cy += 14;
    const bw = VW - 24;
    this.body.add(new Button(this, 12, cy, bw, 26, { label: 'Rest 8 hours', icon: 'tent', onClick: () => this.rest(8) }));
    cy += 30;
    if (def.kind === 'town') {
      const cost = camp.healCost();
      const b = new Button(this, 12, cy, bw, 26, { label: cost > 0 ? `Physician: heal all ${cost}` : 'Physician: no patients', icon: 'cross', style: cost > 0 && camp.data.gold >= cost ? 'buttonSel' : 'buttonOff', onClick: () => this.physician() });
      this.body.add(b);
      cy += 30;
    }
    const w = camp.world;
    const day = Math.floor(w.s.time / 24) + 1;
    this.body.add(addText(this, VW / 2, cy + 4, `Day ${day}, ${String(Math.floor(w.hour)).padStart(2, '0')}:00`, 'dim', 0.5));
  }

  private hire(index: number): void {
    const h = state.campaign.hire(this.id, index);
    if (!h) {
      hapticNotify('error');
      return;
    }
    hapticNotify('success');
    void state.save();
    this.refresh();
  }

  private buy(index: number): void {
    if (!state.campaign.buy(this.id, index)) {
      hapticNotify('error');
      return;
    }
    haptic('medium');
    void state.save();
    this.refresh();
  }

  private sell(uid: string, val: number): void {
    state.campaign.sell(uid, val);
    haptic('medium');
    void state.save();
    this.refresh();
  }

  private rest(hours: number): void {
    state.campaign.rest(hours);
    haptic('light');
    void state.save();
    this.refresh();
  }

  private physician(): void {
    if (!state.campaign.healAll()) {
      hapticNotify('error');
      return;
    }
    hapticNotify('success');
    void state.save();
    this.refresh();
  }
}
