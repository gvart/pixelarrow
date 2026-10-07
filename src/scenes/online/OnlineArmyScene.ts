/**
 * The online army (server-owned): heroes with their gear and battle group,
 * the stash, recruiting, and (opened from a hex) choosing a garrison. Every
 * change is a request; the screen redraws from the server's answer.
 */
import Phaser from 'phaser';
import { BaseScene } from '../BaseScene';
import { Button, ScrollArea, addPanel, addText, tappable } from '../../ui/kit';
import { dollFrame, ensureDoll } from '../../ui/sprites';
import { dollFromHero } from '../../art/paperdoll';
import { hapticNotify } from '../../platform/telegram';
import { itemDef, RARITY_LABEL, SLOTS, type Item, type Slot } from '../../data/items';
import { GROUP_NAMES } from '../../data/units';
import { heroPower } from '../../sim/stats';
import { ONLINE_RULES, RECRUIT_ARCHETYPES } from '../../online/rules';
import { errorText, onlineApi, type Axial, type HexDetail, type OwnedHeroView, type ProfileView } from '../../online/client';
import type { Archetype } from '../../game/heroes';
import { addResourceBar, button, fmtDuration, lines, openModal, type Modal } from './common';

const ROMAN = ['I', 'II', 'III', 'IV'];

export class OnlineArmyScene extends BaseScene {
  private profile: ProfileView | null = null;
  private sel: string | null = null;
  private garrisonHex: Axial | null = null;
  private garrisonPick = new Set<string>();
  private hexDetail: HexDetail | null = null;
  private area: ScrollArea | null = null;
  private modal: Modal | null = null;
  private msg = 'Loading...';
  private busy = false;

  constructor() {
    super('OnlineArmy');
  }

  create(data: { garrison?: Axial }): void {
    this.garrisonHex = data?.garrison ?? null;
    this.garrisonPick = new Set();
    this.profile = null;
    this.sel = null;
    this.modal = null;
    this.area = null;
    this.initUi();
    this.screen({ back: () => this.back() });
    this.render();
    void this.fetchData();
  }

  private back(): void {
    if (this.modal) return this.closeModal();
    this.scene.start('Online', this.garrisonHex ? { focus: this.garrisonHex } : {});
  }

  private async fetchData(): Promise<void> {
    try {
      const [p, d] = await Promise.all([onlineApi.profile(), this.garrisonHex ? onlineApi.hex(this.garrisonHex) : Promise.resolve(null)]);
      if (!this.sys.isActive()) return;
      this.profile = p;
      this.hexDetail = d;
      if (this.garrisonHex) {
        const g = this.garrisonHex;
        this.garrisonPick = new Set(p.heroes.filter((h) => h.garrison && h.garrison.q === g.q && h.garrison.r === g.r).map((h) => h.hero.id));
      }
      if (!this.sel || !p.heroes.some((h) => h.hero.id === this.sel)) this.sel = p.heroes[0]?.hero.id ?? null;
      this.render();
    } catch (e) {
      if (!this.sys.isActive()) return;
      this.msg = errorText(e);
      this.render();
    }
  }

  private async act(fn: () => Promise<unknown>, ok?: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await fn();
      if (ok) hapticNotify('success');
      await this.fetchData();
    } catch (e) {
      if (!this.sys.isActive()) return;
      hapticNotify('error');
      this.flash(errorText(e));
    } finally {
      this.busy = false;
    }
  }

  private flash(text: string): void {
    const { VW } = this.m;
    const c = this.add.container(0, 0);
    const t = addText(this, VW / 2, 46, text, 'red', 0.5, VW - 30);
    c.add(addPanel(this, 8, 41, VW - 16, t.height + 10, 'parch'));
    c.add(t);
    this.ui.add(c);
    this.time.delayedCall(2200, () => c.destroy());
  }

  /** A parchment modal that Back (Telegram's or ours) closes. */
  private openM(h: number, title: string): Modal {
    const md = openModal(this, this.ui, this.m.VW, this.m.VH, h, title);
    this.modalLayer(md.c, () => this.closeModal());
    return md;
  }

  private closeModal(): void {
    this.modal?.c.destroy();
    this.modal = null;
  }

  private render(): void {
    this.area?.destroy();
    this.area = null;
    this.ui.removeAll(true);
    this.modal = null;
    const { VW, VH, S } = this.m;
    this.addGrassBackdrop(5).setAlpha(0.6);
    const p = this.profile;
    this.ui.add(addPanel(this, 0, 0, VW, 24, 'parch'));
    if (this.inGameBack) this.ui.add(new Button(this, 3, 2, 24, 20, { icon: 'back', onClick: () => this.back() }));
    this.ui.add(addText(this, 32, 4, this.garrisonHex ? 'Garrison' : 'Online army', 'red'));
    if (!p) {
      this.ui.add(addText(this, VW / 2, 60, this.msg, 'ink', 0.5, VW - 20));
      return;
    }
    const field = p.heroes.filter((h) => !h.garrison).length;
    this.ui.add(addText(this, 32, 13, this.garrisonHex ? `Hex ${this.garrisonHex.q},${this.garrisonHex.r} - tap heroes to station` : `${p.heroes.length}/${ONLINE_RULES.maxArmy} heroes - ${field} in the field`, 'dim'));
    addResourceBar(this, this.ui, 3, 26, VW - 6, p.resources, p.energy, p.energyMax);
    const now = Date.now() - (Date.now() - p.now);
    // hero list
    const listY = 42;
    const detailH = this.garrisonHex ? 0 : 118;
    const listH = VH - listY - detailH - 32;
    const area = new ScrollArea(this, this.ui, 3, listY, VW - 6, listH, S);
    this.area = area;
    let y = 0;
    const heroes = this.garrisonHex ? p.heroes.filter((h) => !h.garrison || (h.garrison.q === this.garrisonHex!.q && h.garrison.r === this.garrisonHex!.r)) : p.heroes;
    for (const oh of heroes) {
      area.content.add(this.heroRow(oh, y, VW - 6, now));
      y += 27;
    }
    area.setContentHeight(y);
    // bottom
    const by = VH - 30;
    this.ui.add(addPanel(this, 0, by - 2, VW, 32, 'parch'));
    if (this.garrisonHex) {
      const d = this.hexDetail;
      const others = (d?.garrison ?? []).filter((g) => !p.heroes.some((h) => h.hero.id === g.hero.id)).length;
      this.ui.add(addText(this, 8, by + 4, `${this.garrisonPick.size + others}/${ONLINE_RULES.maxGarrison} stationed`, 'ink'));
      if (others) this.ui.add(addText(this, 8, by + 14, `${others} from clan mates`, 'dim'));
      this.ui.add(new Button(this, VW - 84, by + 2, 80, 26, { label: 'Station', icon: 'check', style: 'buttonSel', onClick: () => void this.saveGarrison() }));
      return;
    }
    this.buildDetail(VH - 30 - detailH, detailH);
    const n = 3;
    const bw = Math.floor((VW - 8 - (n - 1) * 3) / n);
    this.ui.add(new Button(this, 4, by + 2, bw, 26, { label: 'Recruit', icon: 'plus', onClick: () => this.openRecruit() }));
    this.ui.add(new Button(this, 7 + bw, by + 2, bw, 26, { label: `Stash ${p.stash.length}`, icon: 'helmet', onClick: () => this.openStash(null) }));
    this.ui.add(new Button(this, 10 + 2 * bw, by + 2, bw, 26, { label: 'Map', icon: 'map', onClick: () => this.back() }));
  }

  private heroRow(oh: OwnedHeroView, y: number, w: number, now: number): Phaser.GameObjects.Container {
    const h = oh.hero;
    const row = this.add.container(0, y);
    const sel = this.garrisonHex ? this.garrisonPick.has(h.id) : this.sel === h.id;
    const bg = addPanel(this, 0, 0, w, 25, sel ? 'buttonSel' : 'inset').setInteractive();
    row.add(bg);
    const img = this.add.image(2, -8, ensureDoll(this, dollFromHero(h)), dollFrame(0, 0)).setOrigin(0, 0);
    img.setCrop(4, 10, 26, 23);
    row.add(img);
    const font = sel ? 'light' : 'ink';
    row.add(addText(this, 30, 4, `${h.name} - lv ${h.level}`, font));
    const wpn = h.equip.weapon ? itemDef(h.equip.weapon.def).name : 'Unarmed';
    const state = oh.busy ? 'in battle' : oh.woundedUntil > now ? `wounded ${fmtDuration(oh.woundedUntil - now)}` : oh.garrison ? `holds ${oh.garrison.q},${oh.garrison.r}` : `group ${ROMAN[h.group] ?? 'I'}`;
    row.add(addText(this, 30, 14, `${wpn} - ${state}`, sel ? 'light' : 'dim'));
    row.add(addText(this, w - 6, 4, `${Math.round(heroPower(h))}`, font, 1));
    tappable(bg, this.area, () => {
      if (this.garrisonHex) {
        if (oh.busy) return;
        if (this.garrisonPick.has(h.id)) this.garrisonPick.delete(h.id);
        else this.garrisonPick.add(h.id);
      } else this.sel = h.id;
      const scroll = this.area?.scrollY ?? 0;
      this.render();
      this.area?.setScroll(scroll);
    });
    return row;
  }

  private buildDetail(y: number, h: number): void {
    const { VW } = this.m;
    const p = this.profile!;
    const oh = p.heroes.find((x) => x.hero.id === this.sel);
    this.ui.add(addPanel(this, 3, y, VW - 6, h - 2, 'parch'));
    if (!oh) return;
    const hero = oh.hero;
    this.ui.add(addText(this, 9, y + 5, hero.name, 'red'));
    // battle group
    ROMAN.forEach((r, i) => {
      const b = new Button(this, VW - 6 - (4 - i) * 21, y + 3, 19, 16, {
        label: r,
        style: hero.group === i ? 'buttonSel' : 'button',
        onClick: () => void this.act(() => onlineApi.army({ [hero.id]: i })),
      });
      this.ui.add(b);
    });
    this.ui.add(addText(this, 9, y + 14, `${GROUP_NAMES[hero.group] ?? ''} - ${hero.kills} kills - ${hero.battles} battles`, 'dim'));
    SLOTS.forEach((slot, i) => {
      const sy = y + 25 + i * 17;
      const it = hero.equip[slot];
      const label = it ? `${itemDef(it.def).name}${it.rarity !== 'common' ? ` (${RARITY_LABEL[it.rarity]})` : ''} ${it.cond}%` : '-';
      this.ui.add(addText(this, 9, sy + 4, slot, 'dim'));
      const b = new Button(this, 52, sy, VW - 62, 15, { label, onClick: () => this.openStash(slot) });
      this.ui.add(b);
    });
  }

  /** Stash picker: for a slot of the selected hero (or just browsing). */
  private openStash(slot: Slot | null): void {
    const { VW } = this.m;
    const p = this.profile!;
    const hero = p.heroes.find((x) => x.hero.id === this.sel)?.hero;
    const items = p.stash.filter((it) => !slot || itemDef(it.def).slot === slot).slice(0, 8);
    const worn = slot && hero ? hero.equip[slot] : undefined;
    const rows = items.length + (worn ? 1 : 0);
    this.modal = this.openM(56 + Math.max(1, rows) * 20 + 10, slot ? `${slot} for ${hero?.name ?? ''}` : 'Stash');
    const md = this.modal;
    let y = md.y + 26;
    if (items.length === 0 && !worn) lines(this, md.c, VW / 2, y + 4, ['Nothing here. Win battles for loot.'], 'dim');
    if (worn && hero) {
      button(this, md.c, md.x + 8, y, md.w - 16, 18, `Take off ${itemDef(worn.def).name}`, () => {
        this.closeModal();
        void this.act(() => onlineApi.equip(hero.id, slot!, null));
      });
      y += 20;
    }
    for (const it of items) {
      const def = itemDef(it.def);
      const txt = `${def.name}${it.rarity !== 'common' ? ` (${RARITY_LABEL[it.rarity]})` : ''} ${it.cond}%`;
      button(this, md.c, md.x + 8, y, md.w - 16, 18, slot ? txt : `${def.slot}: ${txt}`, () => {
        if (!hero) return;
        this.closeModal();
        void this.act(() => onlineApi.equip(hero.id, def.slot, (it as Item).uid), 'ok');
      });
      y += 20;
    }
    button(this, md.c, VW / 2 - 35, md.y + md.h - 30, 70, 22, 'Close', () => this.closeModal(), { icon: 'check' });
  }

  private openRecruit(): void {
    const { VW } = this.m;
    const p = this.profile!;
    const cost = ONLINE_RULES.recruitCost;
    this.modal = this.openM(60 + Math.ceil(RECRUIT_ARCHETYPES.length / 2) * 26 + 30, 'Recruit');
    const md = this.modal;
    lines(this, md.c, VW / 2, md.y + 26, [`${cost.gold} gold, ${cost.food} food, 1 recruit each`, `You have ${p.resources.gold}g ${p.resources.food}f ${Math.floor(p.resources.recruits)}r`], 'dim');
    const bw = Math.floor((md.w - 22) / 2);
    RECRUIT_ARCHETYPES.forEach((a, i) => {
      const bx = md.x + 8 + (i % 2) * (bw + 6);
      const by = md.y + 50 + Math.floor(i / 2) * 26;
      button(this, md.c, bx, by, bw, 22, a, () => {
        this.closeModal();
        void this.act(() => onlineApi.recruit(a as Archetype), 'ok');
      });
    });
    button(this, md.c, VW / 2 - 35, md.y + md.h - 30, 70, 22, 'Close', () => this.closeModal(), { icon: 'close' });
  }

  private async saveGarrison(): Promise<void> {
    const h = this.garrisonHex!;
    await this.act(() => onlineApi.garrison(h, [...this.garrisonPick]), 'ok');
    if (this.sys.isActive() && !this.busy) this.scene.start('Online', { focus: h });
  }
}
