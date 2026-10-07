import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, Meter, ScrollArea, addIcon, addPanel, addText, fitText, tappable, type FontKey } from '../ui/kit';
import { dollFrame, dollGeomOf, dollOrigin, ensureDoll, ensureItemIcon, ensurePortrait } from '../ui/sprites';
import { heroClass } from '../sim/stats';
import { dollFromHero } from '../art/paperdoll';
import { state } from '../state';
import { itemDef, itemValue, RARITY_LABEL, SLOTS, type Item, type Rarity, type Slot } from '../data/items';
import { MAX_ARMY, xpToNext, GROUP_NAMES, type Hero } from '../data/units';
import { perkSlots } from '../data/perks';
import { TRAITS } from '../data/traits';
import { computeStats, type CombatStats } from '../sim/stats';
import { P } from '../art/palette';
import { haptic, hapticNotify } from '../platform/telegram';
import { EMBLEM_NAMES } from '../art/emblems';
import { addSupporterTrim, addSyncBadge } from '../ui/online';

const SLOT_ICON: Record<Slot, string> = { weapon: 'spear', shield: 'shield', helmet: 'helmet', armor: 'armor', trinket: 'ring' };
export const RARITY_COLOR: Record<Rarity, number> = { common: 0x9a8a7a, fine: 0x5f8a45, rare: 0x4a6b9a, heroic: 0xd8a840 };
const ROMAN = ['I', 'II', 'III', 'IV'];

interface ArmyData {
  heroId?: string;
  /** Scene to return to ('World' by default, or 'Settlement' with its id). */
  from?: string;
  id?: number;
}

export class ArmyScene extends BaseScene {
  private heroId = '';
  private tab: 'roster' | 'stash' = 'roster';
  private selItem: Item | null = null; // stash item under consideration
  private selSlot: Slot | null = null; // equipped slot selected
  private heroLayer!: Phaser.GameObjects.Container;
  private listArea: ScrollArea | null = null;
  private listParent!: Phaser.GameObjects.Container;
  private tabButtons: Button[] = [];
  private goldText!: Phaser.GameObjects.BitmapText;
  private skillsBtn!: Button;
  private back: ArmyData = {};
  private preview: Phaser.GameObjects.Sprite | null = null;
  private dismissArmed = false;
  private ghost: Phaser.GameObjects.Image | null = null;
  private heroPanelRect = { x: 0, y: 0, w: 0, h: 0 };

  constructor() {
    super('Army');
  }

  create(data: ArmyData): void {
    this.initUi();
    const c = state.campaign;
    this.heroId = data?.heroId && c.hero(data.heroId) ? data.heroId : c.data.heroes[0]?.id ?? '';
    this.selItem = null;
    this.selSlot = null;
    this.tab = 'roster';
    this.listArea = null;
    this.back = { from: data?.from ?? 'World', id: data?.id };
    this.screen({ back: () => this.goBack() });
    const { VW, VH } = this.m;

    this.ui.add(this.add.rectangle(0, 0, VW, VH, P.bg).setOrigin(0, 0));
    // top bar
    this.ui.add(addPanel(this, 0, 0, VW, 24, 'parch'));
    if (this.inGameBack) this.ui.add(new Button(this, 3, 2, 26, 20, { icon: 'back', onClick: () => this.goBack() }));
    const title = addText(this, VW / 2, 8, 'Army', 'red', 0.5);
    this.ui.add(title);
    addSupporterTrim(this, this.ui, VW, 24, VW / 2, title.width);
    addSyncBadge(this, this.ui, 34, 9);
    this.ui.add(addIcon(this, VW - 52, 6, 'coin'));
    this.goldText = addText(this, VW - 37, 8, '', 'ink');
    this.ui.add(this.goldText);

    this.heroLayer = this.add.container(0, 0);
    this.ui.add(this.heroLayer);

    const tabY = 208;
    const tw = Math.floor((VW - 12) / 2);
    this.tabButtons = [
      new Button(this, 4, tabY, tw, 20, { label: 'Roster', icon: 'people', onClick: () => this.setTab('roster') }),
      new Button(this, 8 + tw, tabY, tw, 20, { label: 'Stash', icon: 'shield', onClick: () => this.setTab('stash') }),
    ];
    this.tabButtons.forEach((b) => this.ui.add(b));

    this.listParent = this.add.container(0, 0);
    this.ui.add(this.listParent);

    // bottom bar
    const by = VH - 30;
    this.ui.add(addPanel(this, 0, by - 3, VW, 33, 'parch'));
    this.skillsBtn = new Button(this, 4, by, Math.floor(VW / 2) - 6, 26, { label: 'Skills', icon: 'star', onClick: () => this.openHero() });
    this.ui.add(this.skillsBtn);
    const backLabel = this.back.from === 'Settlement' ? 'Town' : 'Map';
    this.ui.add(new Button(this, Math.floor(VW / 2) + 2, by, Math.floor(VW / 2) - 6, 26, { label: backLabel, icon: 'map', style: 'buttonSel', onClick: () => this.goBack() }));

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.ghost) this.ghost.setPosition(p.x / this.m.S, p.y / this.m.S);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.endDrag(p));
    this.refresh();
  }

  update(time: number): void {
    if (this.preview) this.preview.setFrame(dollFrame(0, Math.floor(time / 600) % 2));
  }

  private hero(): Hero | undefined {
    return state.campaign.hero(this.heroId);
  }

  private setTab(t: 'roster' | 'stash'): void {
    this.tab = t;
    if (t === 'roster') this.selItem = null;
    this.refresh();
  }

  private persist(): void {
    void state.save();
  }

  private goBack(): void {
    void state.save();
    if (this.back.from === 'Settlement') this.scene.start('Settlement', { id: this.back.id });
    else this.scene.start(this.back.from ?? 'World');
  }

  private openHero(): void {
    this.scene.start('Hero', { heroId: this.heroId, back: { from: this.back.from, id: this.back.id } });
  }

  refresh(): void {
    const c = state.campaign.data;
    this.goldText.setText(`${c.gold}`);
    const h = this.hero();
    const pend = h ? h.points > 0 || h.perks.length < perkSlots(h.level) : false;
    this.skillsBtn.setLabel(pend ? 'Skills !' : 'Skills').setSelected(pend);
    this.tabButtons[0].setSelected(this.tab === 'roster').setLabel(`Roster ${c.heroes.length}/${MAX_ARMY}`);
    this.tabButtons[1].setSelected(this.tab === 'stash').setLabel(`Stash ${c.stash.length}`);
    this.buildHeroPanel();
    this.buildList();
  }

  // ------------------------------------------------------------ hero panel

  private buildHeroPanel(): void {
    this.heroLayer.removeAll(true);
    this.preview = null;
    const L = this.heroLayer;
    const { VW } = this.m;
    const h = this.hero();
    const x0 = 4;
    const y0 = 28;
    const w = VW - 8;
    const hp = 176;
    this.heroPanelRect = { x: x0, y: y0, w, h: hp };
    L.add(addPanel(this, x0, y0, w, hp, 'parch'));
    if (!h) {
      L.add(addText(this, VW / 2, y0 + 60, 'No heroes left', 'ink', 0.5));
      return;
    }
    // portrait
    // a narrower portrait on small phones leaves the stats room
    const pw = w < 200 ? 40 : 60;
    const pcx = x0 + 5 + pw / 2;
    L.add(addPanel(this, x0 + 5, y0 + 5, pw, 86, 'inset'));
    const grass = this.add.rectangle(x0 + 7, y0 + 60, pw - 4, 29, P.grass[1]).setOrigin(0, 0);
    L.add(grass);
    const key = ensureDoll(this, dollFromHero(h), [0]);
    const big = dollGeomOf(key).fw > 48;
    L.add(this.add.image(pcx, y0 + 83, big ? 'shadow_big' : 'shadow').setScale(big ? 1 : 2).setAlpha(0.35));
    this.preview = this.add.sprite(pcx, y0 + 87, key, dollFrame(0, 0)).setOrigin(...dollOrigin(key)).setScale(big ? 1 : 2);
    // framed by the portrait box (60 x 86 on screen)
    if (big) this.preview.setCrop(48 - pw / 2, 0, pw, 84);
    else this.preview.setCrop(24 - pw / 4, 11, pw / 2, 39);
    L.add(this.preview);

    // name + level
    const tx = x0 + pw + 10;
    const right = x0 + w - 5;
    const grp = addText(this, right, y0 + 7, `${GROUP_NAMES[h.group] ?? ''}`, 'dim', 1);
    L.add(grp);
    L.add(fitText(addText(this, tx, y0 + 7, h.name, 'red'), right - tx - grp.width - 4));
    L.add(addText(this, tx, y0 + 18, `Lv ${h.level}`, 'ink'));
    const xpM = new Meter(this, tx + 30, y0 + 19, right - tx - 30, 5, P.gold).setValue(h.xp, xpToNext(h.level));
    L.add(xpM);
    // class: its portrait icon, name and role
    const cls = heroClass(h);
    L.add(this.add.image(tx - 1, y0 + 26, ensurePortrait(this, dollFromHero(h))).setOrigin(0, 0).setScale(0.5));
    L.add(fitText(addText(this, tx + 14, y0 + 28, `${cls.name}`, 'ink'), right - tx - 14));
    const traits = h.traits.map((t) => TRAITS[t].name).join(', ') || 'No traits';

    // stats with preview deltas
    const base = computeStats(h);
    let cmp: CombatStats | null = null;
    if (this.selItem) cmp = computeStats(previewEquip(h, this.selItem));
    else if (this.selSlot && h.equip[this.selSlot]) {
      const clone: Hero = { ...h, equip: { ...h.equip } };
      delete clone.equip[this.selSlot];
      cmp = computeStats(clone);
    }
    const rows: [string, (s: CombatStats) => number, number][] = [
      ['HP', (s) => s.maxHp, 0],
      ['Dmg', (s) => s.dmg, 1],
      ['Arm', (s) => s.armor, 1],
      ['Blk', (s) => Math.round(s.block * 100), 0],
      ['Mor', (s) => s.morale, 0],
      ['Sta', (s) => s.stamina, 0],
      ['Spd', (s) => s.speed, 2],
      [base.range > 0 ? 'Rng' : 'Rch', (s) => (base.range > 0 ? s.range : s.reach), 1],
    ];
    const colW = Math.min(58, Math.floor((right - tx) / 2));
    const valX = colW < 56 ? 19 : 22;
    rows.forEach(([label, f, dp], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const sx = tx + col * colW;
      const sy = y0 + 40 + row * 11;
      const v = f(base);
      L.add(addText(this, sx, sy, label, 'dim'));
      L.add(addText(this, sx + valX, sy, fmt(v, dp), 'ink'));
      if (cmp) {
        const d = f(cmp) - v;
        if (Math.abs(d) > 0.004) L.add(addText(this, sx + 52, sy, `${d > 0 ? '+' : ''}${fmt(d, dp)}`, d > 0 ? 'gold' : 'red', 1).setX(sx + colW - 2).setOrigin(1, 0));
      }
    });
    const kit = base.ammo > 0 ? `ammo ${base.ammo}` : base.canShieldWall ? 'shield wall' : base.mount ? (base.mount === 'chariot' ? 'chariot' : 'mounted') : '';
    L.add(fitText(addText(this, tx, y0 + 85, h.wound > 0 ? `Wounded: ${Math.ceil(h.wound)}h rest` : `${traits}${kit ? ' - ' + kit : ''}`, h.wound > 0 ? 'red' : 'dim'), right - tx));

    // equipment slots
    const slotY = y0 + 96;
    const sw = 26;
    const gap = Math.floor((w - 10 - sw * 5) / 4);
    SLOTS.forEach((slot, i) => {
      const sx = x0 + 5 + i * (sw + gap);
      const it = h.equip[slot];
      const sel = this.selSlot === slot || (!!this.selItem && itemDef(this.selItem.def).slot === slot);
      const bg = addPanel(this, sx, slotY, sw, sw, sel ? 'slotSel' : 'slot');
      bg.setInteractive();
      tappable(bg, null, () => this.selectSlot(slot));
      L.add(bg);
      if (it) {
        L.add(this.add.image(sx + 5, slotY + 4, ensureItemIcon(this, it)).setOrigin(0, 0));
        const cm = new Meter(this, sx + 3, slotY + sw - 5, sw - 6, 3, condColor(it.cond)).setValue(it.cond, 100);
        L.add(cm);
        L.add(this.add.rectangle(sx + 2, slotY + 2, 3, 3, RARITY_COLOR[it.rarity]).setOrigin(0, 0));
      } else {
        L.add(addIcon(this, sx + 7, slotY + 7, SLOT_ICON[slot], 'D'));
      }
    });

    // info + actions
    const iy = slotY + sw + 4;
    const info = this.selItem ?? (this.selSlot ? h.equip[this.selSlot] : undefined);
    if (info) {
      const def = itemDef(info.def);
      L.add(this.add.rectangle(x0 + 6, iy + 2, 4, 4, RARITY_COLOR[info.rarity]).setOrigin(0, 0));
      L.add(addText(this, x0 + 13, iy, `${def.name}`, 'red'));
      L.add(addText(this, x0 + w - 6, iy, `${RARITY_LABEL[info.rarity]} ${Math.round(info.cond)}%`, 'dim', 1));
      const extra = info.paint?.emblem ? ` ${EMBLEM_NAMES[info.paint.emblem] ?? ''} emblem.` : '';
      L.add(addText(this, x0 + 6, iy + 10, def.desc + extra, 'ink', 0, w - 70));
      const bx = x0 + w - 60;
      if (this.selItem) {
        L.add(new Button(this, bx, iy + 9, 56, 18, { label: 'Equip', icon: 'check', style: 'buttonSel', onClick: () => this.equipSelected() }));
        L.add(addText(this, bx + 28, iy + 31, `worth ${itemValue(this.selItem)}`, 'dim', 0.5));
      } else if (this.selSlot) {
        L.add(new Button(this, bx, iy + 9, 56, 18, { label: 'Remove', onClick: () => this.unequip() }));
        const cost = state.campaign.repairCost(info);
        if (cost > 0) {
          const rb = new Button(this, bx, iy + 29, 56, 16, { label: `Fix ${cost}`, icon: 'repair', onClick: () => this.repair(info) });
          rb.setEnabled(state.campaign.data.gold >= cost);
          L.add(rb);
        }
      }
    } else {
      L.add(addText(this, x0 + 6, iy + 1, 'Tap a slot or a stash item', 'dim', 0, w - 12));
      L.add(addText(this, x0 + 6, iy + 24, `Battles ${h.battles}  Kills ${h.kills}`, 'ink'));
      const db = new Button(this, x0 + w - 62, iy + 16, 58, 18, {
        label: this.dismissArmed ? 'Sure?' : 'Dismiss',
        icon: 'skull',
        style: this.dismissArmed ? 'buttonSel' : 'button',
        onClick: () => this.dismiss(),
      });
      db.setEnabled(state.campaign.data.heroes.length > 1);
      L.add(db);
    }
  }

  private selectSlot(slot: Slot): void {
    this.selSlot = this.selSlot === slot ? null : slot;
    this.selItem = null;
    this.dismissArmed = false;
    if (this.selSlot) this.tab = 'stash';
    this.refresh();
  }

  private equipSelected(): void {
    if (!this.selItem) return;
    const ok = state.campaign.equip(this.heroId, this.selItem.uid);
    if (ok) {
      haptic('medium');
      this.selItem = null;
      this.selSlot = null;
      this.persist();
    }
    this.refresh();
  }

  private unequip(): void {
    if (!this.selSlot) return;
    state.campaign.unequip(this.heroId, this.selSlot);
    haptic('light');
    this.persist();
    this.refresh();
  }

  private repair(it: Item): void {
    if (state.campaign.repair(it)) {
      hapticNotify('success');
      this.persist();
    }
    this.refresh();
  }

  private dismiss(): void {
    if (!this.dismissArmed) {
      this.dismissArmed = true;
      this.buildHeroPanel();
      return;
    }
    this.dismissArmed = false;
    state.campaign.dismiss(this.heroId);
    this.heroId = state.campaign.data.heroes[0]?.id ?? '';
    this.persist();
    this.refresh();
  }

  // ------------------------------------------------------------ lists

  private buildList(): void {
    const keepScroll = this.listArea && this.listParent.getData('tab') === this.tab ? this.listArea.scrollY : 0;
    this.listParent.removeAll(true);
    this.listArea?.destroy();
    const { VW, VH, S } = this.m;
    const y = 232;
    const h = VH - 34 - y;
    this.listParent.add(addPanel(this, 4, y - 1, VW - 8, h + 2, 'inset'));
    const area = new ScrollArea(this, this.listParent, 6, y + 1, VW - 12, h - 2, S);
    this.listArea = area;
    this.listParent.setData('tab', this.tab);
    const content = area.content;
    let cy = 0;
    if (this.tab === 'roster') {
      for (const hero of state.campaign.data.heroes) {
        this.rosterRow(content, area, hero, cy, VW - 12);
        cy += 26;
      }
    } else {
      const filter = this.selSlot;
      const items = state.campaign.data.stash
        .filter((i) => !filter || itemDef(i.def).slot === filter)
        .slice()
        .sort((a, b) => SLOTS.indexOf(itemDef(a.def).slot) - SLOTS.indexOf(itemDef(b.def).slot) || itemDef(b.def).tier - itemDef(a.def).tier);
      if (filter) {
        const t = addText(this, 4, cy + 3, `Showing ${filter} - tap slot again for all`, 'dim');
        content.add(t);
        cy += 14;
      }
      if (items.length === 0) content.add(addText(this, (VW - 12) / 2, cy + 10, 'Nothing here. Win battles for loot.', 'dim', 0.5));
      for (const it of items) {
        this.stashRow(content, area, it, cy, VW - 12);
        cy += 24;
      }
    }
    area.setContentHeight(cy + 2);
    area.setScroll(keepScroll);
  }

  private rosterRow(parent: Phaser.GameObjects.Container, area: ScrollArea, hero: Hero, y: number, w: number): void {
    const sel = hero.id === this.heroId;
    const bg = addPanel(this, 0, y, w, 24, sel ? 'buttonSel' : 'button').setInteractive();
    parent.add(bg);
    tappable(bg, area, () => {
      this.heroId = hero.id;
      this.selItem = null;
      this.selSlot = null;
      this.dismissArmed = false;
      this.refresh();
    });
    const img = this.add.image(5, y, ensurePortrait(this, dollFromHero(hero))).setOrigin(0, 0);
    parent.add(img);
    const font: FontKey = sel ? 'light' : 'ink';
    parent.add(addText(this, 34, y + 4, hero.name, font));
    const pend = hero.points > 0 || hero.perks.length < perkSlots(hero.level);
    const traits = hero.traits.map((t) => TRAITS[t].name);
    const wpnLen = (hero.equip.weapon ? itemDef(hero.equip.weapon.def).name : 'Unarmed').length;
    // keep the line clear of the weapon name on the right
    let tr = traits.join(' ');
    if (tr.length + wpnLen > 16) tr = traits[0] ?? '';
    if (tr.length + wpnLen > 16) tr = '';
    const sub = hero.wound > 0 ? `Lv${hero.level} wounded ${Math.ceil(hero.wound)}h` : `Lv${hero.level}${pend ? ' !' : ''} ${heroClass(hero).short} ${tr}`;
    parent.add(addText(this, 34, y + 13, sub, sel ? 'light' : hero.wound > 0 ? 'red' : 'dim'));
    parent.add(addText(this, w - 6, y + 4, ROMAN[hero.group] ?? '', sel ? 'light' : 'red', 1));
    const wpn = hero.equip.weapon ? itemDef(hero.equip.weapon.def).name : 'Unarmed';
    parent.add(addText(this, w - 6, y + 13, wpn, sel ? 'light' : 'dim', 1));
  }

  private stashRow(parent: Phaser.GameObjects.Container, area: ScrollArea, it: Item, y: number, w: number): void {
    const def = itemDef(it.def);
    const sel = this.selItem?.uid === it.uid;
    const bg = addPanel(this, 0, y, w, 22, sel ? 'buttonSel' : 'button').setInteractive();
    parent.add(bg);
    tappable(bg, area, () => {
      this.selItem = sel ? null : it;
      this.dismissArmed = false;
      this.buildHeroPanel();
      this.buildList();
    });
    // long-press to drag onto the hero
    let timer: Phaser.Time.TimerEvent | null = null;
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      timer = this.time.delayedCall(320, () => {
        if (!p.isDown || area.moved) return;
        this.startDrag(it, p);
      });
    });
    bg.on('pointerup', () => timer?.remove());
    parent.add(this.add.image(4, y + 3, ensureItemIcon(this, it)).setOrigin(0, 0));
    parent.add(this.add.rectangle(23, y + 4, 3, 3, RARITY_COLOR[it.rarity]).setOrigin(0, 0));
    parent.add(addText(this, 29, y + 3, def.name, sel ? 'light' : 'ink'));
    parent.add(addText(this, 29, y + 12, `${def.slot} ${summary(it)}`, sel ? 'light' : 'dim'));
    parent.add(addText(this, w - 5, y + 7, `${Math.round(it.cond)}%`, sel ? 'light' : it.cond < 40 ? 'red' : 'dim', 1));
  }

  private startDrag(it: Item, p: Phaser.Input.Pointer): void {
    this.selItem = it;
    this.buildHeroPanel();
    haptic('light');
    this.ghost = this.add.image(p.x / this.m.S, p.y / this.m.S, ensureItemIcon(this, it)).setScale(2).setAlpha(0.9);
    this.ui.add(this.ghost);
  }

  private endDrag(p: Phaser.Input.Pointer): void {
    if (!this.ghost) return;
    this.ghost.destroy();
    this.ghost = null;
    const x = p.x / this.m.S;
    const y = p.y / this.m.S;
    const r = this.heroPanelRect;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) this.equipSelected();
  }
}

function previewEquip(h: Hero, it: Item): Hero {
  const def = itemDef(it.def);
  const clone: Hero = { ...h, equip: { ...h.equip } };
  clone.equip[def.slot] = it;
  if (def.slot === 'weapon' && def.twoHanded) delete clone.equip.shield;
  if (def.slot === 'shield' && clone.equip.weapon && itemDef(clone.equip.weapon.def).twoHanded) delete clone.equip.weapon;
  return clone;
}

function fmt(v: number, dp: number): string {
  return dp === 0 ? `${Math.round(v)}` : v.toFixed(dp).replace(/\.?0+$/, '') || '0';
}

function condColor(c: number): number {
  return c > 66 ? P.good : c > 33 ? P.gold : P.bad;
}

function summary(it: Item): string {
  const d = itemDef(it.def);
  const m = d.mods;
  if (d.slot === 'weapon') return m.range ? `rng ${m.range}` : `dmg ${m.dmg}`;
  if (d.slot === 'shield') return `blk ${Math.round((m.block ?? 0) * 100)}`;
  if (d.slot === 'trinket') return '';
  return `arm ${m.armor}`;
}
