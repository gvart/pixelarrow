import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, Meter, addPanel, addText } from '../ui/kit';
import { dollFrame, ensureDoll } from '../ui/sprites';
import { dollFromHero } from '../art/paperdoll';
import { P } from '../art/palette';
import { state } from '../state';
import { haptic, hapticNotify } from '../platform/telegram';
import { xpToNext, type Hero } from '../data/units';
import { TRAITS } from '../data/traits';
import {
  ABILITIES, ATTRS, ATTR_IDS, ATTR_MAX, AURAS, PERK_LEVELS, PERKS, TREES, TREE_IDS,
  perkBlocker, perkSlots, treePerks, type AttrId, type PerkDef, type PerkId,
} from '../data/perks';
import { computeStats, type CombatStats } from '../sim/stats';

const ARCH_LABEL: Record<string, string> = { raw: 'Levy', hoplite: 'Hoplite', swordsman: 'Swordsman', axeman: 'Axeman', peltast: 'Peltast', slinger: 'Slinger', archer: 'Archer' };

/** Hero detail: spend attribute points (with a preview of every derived stat) and pick perks. */
export class HeroScene extends BaseScene {
  private heroId = '';
  private from: Record<string, unknown> = {};
  private pending: Record<AttrId, number> = { str: 0, agi: 0, end: 0, wil: 0 };
  private selPerk: PerkId | null = null;
  private layer!: Phaser.GameObjects.Container;
  private doll: Phaser.GameObjects.Sprite | null = null;

  constructor() {
    super('Hero');
  }

  create(data: { heroId?: string; back?: Record<string, unknown> }): void {
    this.initUi();
    const camp = state.campaign;
    this.heroId = data?.heroId && camp.hero(data.heroId) ? data.heroId : camp.data.heroes[0]?.id ?? '';
    this.from = data?.back ?? {};
    this.pending = { str: 0, agi: 0, end: 0, wil: 0 };
    this.selPerk = null;
    this.screen({ back: () => this.back() });
    const { VW, VH } = this.m;
    this.ui.add(this.add.rectangle(0, 0, VW, VH, P.bg).setOrigin(0, 0));
    this.layer = this.add.container(0, 0);
    this.ui.add(this.layer);
    this.build();
  }

  update(time: number): void {
    this.doll?.setFrame(dollFrame(0, Math.floor(time / 600) % 2));
  }

  private hero(): Hero | undefined {
    return state.campaign.hero(this.heroId);
  }

  private back(): void {
    this.scene.start('Army', { ...this.from, heroId: this.heroId });
  }

  private cycle(d: number): void {
    const hs = state.campaign.data.heroes;
    const i = hs.findIndex((h) => h.id === this.heroId);
    this.heroId = hs[(i + d + hs.length) % hs.length].id;
    this.pending = { str: 0, agi: 0, end: 0, wil: 0 };
    this.selPerk = null;
    haptic('light');
    this.build();
  }

  private spent(): number {
    return ATTR_IDS.reduce((a, k) => a + this.pending[k], 0);
  }

  private build(): void {
    this.layer.removeAll(true);
    this.doll = null;
    const L = this.layer;
    const h = this.hero();
    const { VW, VH } = this.m;
    // top bar
    L.add(addPanel(this, 0, 0, VW, 24, 'parch'));
    if (this.inGameBack) L.add(new Button(this, 3, 2, 26, 20, { icon: 'back', onClick: () => this.back() }));
    L.add(addText(this, VW / 2, 8, 'Hero', 'red', 0.5));
    if (state.campaign.data.heroes.length > 1) {
      L.add(new Button(this, VW - 54, 2, 24, 20, { label: '<', onClick: () => this.cycle(-1) }));
      L.add(new Button(this, VW - 28, 2, 24, 20, { label: '>', onClick: () => this.cycle(1) }));
    }
    if (!h) return;

    // header
    let y = 27;
    L.add(addPanel(this, 4, y, VW - 8, 46, 'parch'));
    L.add(addPanel(this, 8, y + 4, 30, 38, 'inset'));
    const key = ensureDoll(this, dollFromHero(h));
    this.doll = this.add.sprite(23, y + 42, key, dollFrame(0, 0)).setOrigin(0.5, 38 / 40);
    L.add(this.doll);
    L.add(addText(this, 43, y + 4, h.name, 'red'));
    L.add(addText(this, 43, y + 13, `Lv ${h.level} ${ARCH_LABEL[h.arch ?? 'raw'] ?? ''}`, 'ink'));
    L.add(new Meter(this, 43, y + 23, VW - 56, 5, P.gold).setValue(h.xp, xpToNext(h.level)));
    const traits = h.traits.map((t) => TRAITS[t].name).join(', ');
    const free = h.points - this.spent();
    const perkFree = perkSlots(h.level) - h.perks.length;
    L.add(addText(this, 43, y + 31, `${traits ? traits + '  ' : ''}`, 'dim'));
    L.add(addText(this, VW - 10, y + 4, free > 0 ? `${free} pt` : '', 'gold', 1));
    L.add(addText(this, VW - 10, y + 13, perkFree > 0 ? `${perkFree} perk` : '', 'gold', 1));
    if (h.wound > 0) L.add(addText(this, VW - 10, y + 31, `wounded ${Math.ceil(h.wound)}h`, 'red', 1));

    // attributes (with what they do), then every derived stat with its change
    y += 49;
    const ah = 4 * 13 + 2 * 11 + 22;
    L.add(addPanel(this, 4, y, VW - 8, ah, 'parch'));
    const next: Hero = { ...h, attrs: { ...h.attrs } };
    for (const k of ATTR_IDS) next.attrs[k] += this.pending[k];
    const cur = computeStats(h);
    const prev = computeStats(next);
    const HINT: Record<AttrId, string> = { str: 'dmg, hp, charge', agi: 'speed, aim, tempo', end: 'hp, stamina, survive', wil: 'morale, auras, shouts' };
    ATTR_IDS.forEach((k, i) => {
      const ry = y + 4 + i * 13;
      L.add(addText(this, 9, ry + 2, ATTRS[k].short, 'dim'));
      L.add(addText(this, 30, ry + 2, `${h.attrs[k] + this.pending[k]}`, this.pending[k] ? 'gold' : 'ink'));
      const can = free > 0 && h.attrs[k] + this.pending[k] < ATTR_MAX;
      L.add(new Button(this, 44, ry, 16, 12, { label: '+', style: can ? 'button' : 'buttonOff', onClick: () => this.addPoint(k) }));
      if (this.pending[k] > 0) L.add(new Button(this, 62, ry, 16, 12, { label: '-', onClick: () => this.removePoint(k) }));
      L.add(addText(this, 82, ry + 2, HINT[k], 'dim'));
    });
    const rows: [string, (s: CombatStats) => number, number][] = [
      ['HP', (s) => s.maxHp, 0],
      ['Dmg', (s) => s.dmg, 1],
      ['Mor', (s) => s.morale, 0],
      ['Sta', (s) => s.stamina, 0],
      ['Spd', (s) => s.speed, 2],
      ['Acc', (s) => s.accuracy * 100, 0],
      ['Atk', (s) => s.atkTime, 2],
      ['KO', (s) => s.koChance * 100, 0],
    ];
    const gy = y + 4 + 4 * 13 + 2;
    L.add(this.add.rectangle(8, gy - 2, VW - 16, 1, P.parchDark).setOrigin(0, 0));
    const cw = Math.floor((VW - 14) / 4);
    rows.forEach(([label, f, dp], i) => {
      const sx = 9 + (i % 4) * cw;
      const sy = gy + 1 + Math.floor(i / 4) * 11;
      const d = f(prev) - f(cur);
      const changed = Math.abs(d) > 0.004;
      L.add(addText(this, sx, sy, label, 'dim'));
      L.add(addText(this, sx + cw - 8, sy, fmt(f(prev), dp), changed ? ((label === 'Atk' ? d < 0 : d > 0) ? 'gold' : 'red') : 'ink', 1));
    });
    if (this.spent() > 0) {
      L.add(new Button(this, 9, y + ah - 17, 34, 14, { label: 'Undo', onClick: () => this.resetPoints() }));
      L.add(addText(this, 50, y + ah - 14, 'gold: new', 'dim'));
      L.add(new Button(this, VW - 64, y + ah - 17, 55, 14, { label: 'Confirm', icon: 'check', style: 'buttonSel', onClick: () => this.confirmPoints() }));
    } else {
      const abil = cur.abilities.map((a) => ABILITIES[a].short).concat(cur.auras.map((a) => AURAS[a].name.split(' ')[0]));
      L.add(addText(this, 9, y + ah - 14, abil.length ? `Has: ${abil.join(', ')}` : free > 0 ? 'Tap + to raise an attribute' : 'Points come with each level', 'dim', 0, VW - 20));
    }

    // perk trees
    y += ah + 3;
    const ph = 5 * 24 + 15;
    L.add(addPanel(this, 4, y, VW - 8, ph, 'parch'));
    const colW = Math.floor((VW - 26) / 3);
    const g = this.add.graphics();
    L.add(g);
    TREE_IDS.forEach((tree, ci) => {
      const cx = 20 + ci * colW + colW / 2;
      L.add(addText(this, cx, y + 4, TREES[tree].name, 'red', 0.5));
      const perks = treePerks(tree);
      perks.forEach((p, ri) => {
        const ny = y + 14 + ri * 24;
        if (ri > 0) {
          g.fillStyle(h.perks.includes(p.id) ? P.red : P.parchDark, 1);
          g.fillRect(Math.round(cx) - 1, ny - 4, 2, 4);
        }
        this.perkNode(p, Math.round(cx - 12), ny, h);
      });
    });
    PERK_LEVELS.forEach((lvl, ri) => L.add(addText(this, 8, y + 20 + ri * 24, `${lvl}`, h.level >= lvl ? 'ink' : 'dim')));

    // perk detail
    y += ph + 3;
    const dh = VH - y - 4;
    L.add(addPanel(this, 4, y, VW - 8, dh, 'parch'));
    const sel = this.selPerk ? PERKS[this.selPerk] : null;
    if (!sel) {
      L.add(addText(this, VW / 2, y + 8, perkFree > 0 ? 'Tap a perk to read it' : `Next perk at Lv ${PERK_LEVELS.find((l) => l > h.level) ?? '-'}`, 'dim', 0.5));
      L.add(addText(this, 9, y + 22, 'Perks unlock in order down each tree. Abilities are used from the battle bar; auras work on their own.', 'dim', 0, VW - 18));
      return;
    }
    L.add(addText(this, 9, y + 5, sel.name, 'red'));
    L.add(addText(this, VW - 9, y + 5, `${TREES[sel.tree].name} - Lv ${PERK_LEVELS[sel.tier]}`, 'dim', 1));
    const extra = sel.ability ? ` ${ABILITIES[sel.ability].desc} Cooldown ${ABILITIES[sel.ability].cooldown}s.` : sel.aura ? ` ${AURAS[sel.aura].desc}` : '';
    L.add(addText(this, 9, y + 16, sel.desc + extra, 'ink', 0, VW - 18));
    const blocker = perkBlocker(h, sel.id);
    if (h.perks.includes(sel.id)) L.add(addText(this, VW / 2, y + dh - 14, 'Known', 'gold', 0.5));
    else if (blocker) L.add(addText(this, VW / 2, y + dh - 14, blocker, 'dim', 0.5));
    else L.add(new Button(this, VW / 2 - 40, y + dh - 22, 80, 18, { label: 'Take perk', icon: 'star', style: 'buttonSel', onClick: () => this.takePerk(sel.id) }));
  }

  private perkNode(p: PerkDef, x: number, y: number, h: Hero): void {
    const known = h.perks.includes(p.id);
    const open = !known && perkBlocker(h, p.id) === null;
    const icon = p.ability ? ABILITIES[p.ability].icon : p.aura ? 'aura' : 'star';
    const b = new Button(this, x, y, 24, 21, { icon, style: known ? 'buttonSel' : open ? 'button' : 'buttonOff', onClick: () => this.selectPerk(p.id) });
    this.layer.add(b);
    if (open) {
      const r = this.add.rectangle(x - 1, y - 1, 26, 23).setOrigin(0, 0).setStrokeStyle(1, P.gold);
      this.layer.add(r);
      this.tweens.add({ targets: r, alpha: { from: 1, to: 0.3 }, duration: 500, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [3] });
    }
    if (this.selPerk === p.id) this.layer.add(this.add.rectangle(x - 2, y - 2, 28, 25).setOrigin(0, 0).setStrokeStyle(1, P.ink));
  }

  private selectPerk(id: PerkId): void {
    this.selPerk = this.selPerk === id ? null : id;
    this.build();
  }

  private addPoint(k: AttrId): void {
    const h = this.hero();
    if (!h || h.points - this.spent() <= 0 || h.attrs[k] + this.pending[k] >= ATTR_MAX) {
      hapticNotify('error');
      return;
    }
    this.pending[k]++;
    haptic('light');
    this.build();
  }

  private removePoint(k: AttrId): void {
    if (this.pending[k] <= 0) return;
    this.pending[k]--;
    this.build();
  }

  private resetPoints(): void {
    this.pending = { str: 0, agi: 0, end: 0, wil: 0 };
    this.build();
  }

  private confirmPoints(): void {
    const camp = state.campaign;
    for (const k of ATTR_IDS) for (let i = 0; i < this.pending[k]; i++) camp.spendPoint(this.heroId, k);
    this.pending = { str: 0, agi: 0, end: 0, wil: 0 };
    hapticNotify('success');
    void state.save();
    this.build();
  }

  private takePerk(id: PerkId): void {
    if (!state.campaign.takePerk(this.heroId, id)) {
      hapticNotify('error');
      return;
    }
    hapticNotify('success');
    void state.save();
    this.build();
  }
}

function fmt(v: number, dp: number): string {
  return dp === 0 ? `${Math.round(v)}` : v.toFixed(dp).replace(/\.?0+$/, '') || '0';
}
