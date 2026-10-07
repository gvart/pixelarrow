/**
 * The duel hub (docs/DUELS.md): the persistent duel army, its Glory and
 * account level, and three tabs: Ladder (the PvE floors: farm Glory, XP and
 * gear), Team (who fights, inside the point budget; a tap opens the hero
 * sheet; recruiting) and Shop (daily offers, the gear catalogue, selling).
 * Every change is a request to the duel source; the screen redraws from the
 * answer. Started with `{ preview: true }` it runs on the in-memory demo.
 */
import Phaser from 'phaser';
import { BaseScene } from '../BaseScene';
import { Button, addIcon, addPanel, addText, Meter } from '../../ui/kit';
import { ItemIcon, ScrollList, Tabs, addEmptyState, confirmDialog, openModal, toast } from '../../ui/widgets';
import { ellipsize } from '../../ui/textfit';
import { uiId } from '../../ui/layout';
import { SIZE, COLOR } from '../../ui/theme';
import { ensureFonts } from '../../ui/fonts';
import {
  DragDrop, StashGrid, addChip, addGroupBadge, addStars, className, defaultStashState, itemName, openClassCard, openItemCard, rarityColor, roleColor, roleName,
  type StashState,
} from '../../ui/sheet';
import { addEconState } from '../../ui/econ/widgets';
import { ensurePortrait } from '../../ui/sprites';
import { dollFromHero } from '../../art/paperdoll';
import { P } from '../../art/palette';
import { hapticNotify } from '../../platform/telegram';
import { RARITY_LABEL, SLOTS, itemDef, normalizeEquip, normalizeItem, type Item, type Slot } from '../../data/items';
import type { Hero } from '../../data/units';
import { CLASSES } from '../../data/classes';
import { heroClass } from '../../sim/stats';
import type { Battle } from '../../sim/battle';
import { econState, type EconState } from '../../game/economy';
import { heroStars } from '../../game/gear';
import { buildReport, lastBattle, resultFor, type BattleReport } from '../../game/report';
import { attackSubmission } from '../../online/battle';
import type { BattleSource } from '../../online/battleSource';
import { errorText } from '../../online/client';
import {
  DUEL_CLASSES, DUEL_RULES, catalogue, classPoints, dailyOffers, duelRecruit, heroPoints, levelProgress, recruitPrice, sellPrice, teamPoints, teamProblem, type ShopOffer,
} from '../../duel/rules';
import { LADDER, floorBudget, isBoss, ladderFloor } from '../../duel/ladder';
import { duelSource, type DuelProfileView, type DuelSource, type LadderReport, type LadderTicket } from '../../duel/client';
import { DuelHeroSource } from '../../duel/heroSource';
import { showReport } from '../ResultsScene';
import { makeItem } from '../../game/heroes';
import { Rng } from '../../sim/rng';
import { t, tOr, type TKey } from '../../i18n';

export type DuelTab = 'ladder' | 'team' | 'shop';
type ShopTab = 'offers' | 'gear' | 'sell';

export interface DuelSceneData {
  tab?: DuelTab;
  shop?: ShopTab;
  /** Run on the in-memory demo (layout check, previews). */
  preview?: boolean;
  /** A message to show on arrival (a failed battle report...). */
  error?: string;
}

const TABS: DuelTab[] = ['ladder', 'team', 'shop'];
const SHOP_TABS: ShopTab[] = ['offers', 'gear', 'sell'];

export class DuelScene extends BaseScene {
  private src!: DuelSource;
  private profile: DuelProfileView | null = null;
  private st: EconState | 'loading' | 'ready' = 'loading';
  private busy = false;
  private tab: DuelTab = 'ladder';
  private shopTab: ShopTab = 'offers';
  private gearSlot: Slot = 'weapon';
  private head!: Phaser.GameObjects.Container;
  private body!: Phaser.GameObjects.Container;
  private list: ScrollList | null = null;
  private stash: StashGrid | null = null;
  private stashState: StashState = defaultStashState();
  private drag!: DragDrop;
  private bodyTop = 0;

  constructor() {
    super('Duel');
  }

  create(data: DuelSceneData = {}): void {
    // the demo stays on while the screens it opened (hero sheet, battle) come back here
    const prev = this.src;
    this.src = duelSource(data.preview);
    // the last profile shows at once while it reloads (not another source's)
    if (prev !== this.src) this.profile = null;
    this.tab = data.tab ?? this.tab;
    this.shopTab = data.shop ?? this.shopTab;
    this.st = this.profile ? 'ready' : 'loading';
    this.list = null;
    this.stash = null;
    this.initUi();
    ensureFonts(this);
    this.screen({ back: () => this.back() });
    const { VW, VH } = this.m;
    this.ui.add(this.add.rectangle(0, 0, VW, VH, P.bg).setOrigin(0, 0));
    this.head = this.add.container(0, 0);
    this.body = this.add.container(0, 0);
    this.ui.add([this.head, this.body]);
    this.drag = new DragDrop(this);
    this.events.once('shutdown', () => this.clearBody());
    this.render();
    void this.fetchData();
    if (data.error) toast(this, data.error, 'bad', 3500);
  }

  private back(): void {
    this.scene.start('Menu');
  }

  /** Load from the source, or show a given profile (tests, layout check). */
  async fetchData(given?: DuelProfileView): Promise<void> {
    try {
      const p = given ?? (await this.src.profile());
      if (!this.sys.isActive()) return;
      this.setProfile(p);
      this.st = 'ready';
    } catch (e) {
      if (!this.sys.isActive()) return;
      this.st = econState(e, (e as { code?: string } | null)?.code !== 'outside');
    }
    this.render();
  }

  private setProfile(p: DuelProfileView): void {
    for (const h of p.heroes) normalizeEquip(h);
    p.stash.forEach((it) => normalizeItem(it));
    this.profile = p;
  }

  private async act<T extends { profile: DuelProfileView }>(fn: () => Promise<T>, ok?: (r: T) => string): Promise<T | null> {
    if (this.busy) return null;
    this.busy = true;
    try {
      const r = await fn();
      if (!this.sys.isActive()) return r;
      this.setProfile(r.profile);
      if (ok) {
        hapticNotify('success');
        toast(this, ok(r), 'good');
      }
      this.render();
      return r;
    } catch (e) {
      if (this.sys.isActive()) {
        hapticNotify('error');
        toast(this, errorText(e), 'bad');
      }
      return null;
    } finally {
      this.busy = false;
    }
  }

  private teamHeroes(p: DuelProfileView): Hero[] {
    return p.team.map((id) => p.heroes.find((h) => h.id === id)).filter((h): h is Hero => !!h);
  }

  /**
   * A tap target over a list row left of its button (`right`: where the
   * button starts), so the row and its button never overlap; ignores taps
   * that ended a scroll drag.
   */
  private rowTap(list: () => ScrollList | null, row: Phaser.GameObjects.Container, right: number, h: number, id: string, cb: () => void): void {
    const z = this.add.zone(0, 0, Math.max(10, right - 4), h).setOrigin(0, 0).setInteractive();
    uiId(z, id);
    z.on('pointerup', () => !list()?.area.moved && cb());
    row.add(z);
  }

  // ------------------------------------------------------------------ layout

  private render(): void {
    this.head.removeAll(true);
    const { VW, VH } = this.m;
    const H = this.head;
    const p = this.profile;
    H.add(addPanel(this, 0, 0, VW, 26, 'parch'));
    let left = 6;
    if (this.inGameBack) {
      H.add(new Button(this, 3, 2, 26, 22, { icon: 'back', onClick: () => this.back() }));
      left = 33;
    }
    let rx = VW - 6;
    if (p) {
      const g = addText(this, rx, 9, `${p.glory}`, 'ink', 1);
      H.add(g);
      H.add(addIcon(this, rx - g.width - 13, 7, 'star'));
      rx -= g.width + 18;
    }
    const title = this.src.demo ? `${t('duels.title')} · ${t('duels.demo')}` : t('duels.title');
    H.add(addText(this, left, 9, ellipsize(title, rx - left - 4), 'red'));
    if (this.st !== 'ready' || !p) {
      this.clearBody();
      addEconState(this, this.body, 4, 30, VW - 8, VH - 34, this.st as EconState | 'loading', () => {
        this.st = 'loading';
        this.render();
        void this.fetchData();
      });
      return;
    }
    // account level and its XP
    H.add(addPanel(this, 0, 26, VW, 24, 'dark'));
    const lp = levelProgress(p.xp);
    const lvW = addChip(this, H, 5, 31, t('duels.level', { n: lp.level }), 0x8c2f25, 70);
    const stat = addText(this, VW - 5, 33, ellipsize(t('duels.record', { w: p.wins, b: p.battles }), 80), 'title', 1);
    H.add(stat);
    const mx = 5 + lvW + 5;
    const mw = VW - 5 - stat.width - 6 - mx;
    if (mw > 20) H.add(new Meter(this, mx, 36, mw, 5, COLOR.xp).setValue(lp.need ? lp.into : 1, lp.need || 1));
    this.bodyTop = 52;
    this.buildBody();
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
    const { VW, VH } = this.m;
    let y = this.bodyTop;
    const tabs = new Tabs(this, 4, y, VW - 8, TABS.map((k) => t(`duels.tab.${k}` as TKey)), {
      selected: TABS.indexOf(this.tab),
      ids: TABS.map((k) => `duel.tab.${k}`),
      onChange: (i) => {
        this.tab = TABS[i];
        this.buildBody();
      },
    });
    const footY = VH - 36;
    this.body.add(addPanel(this, 0, y + SIZE.tabH - 2, VW, footY - (y + SIZE.tabH - 2), 'parch'));
    this.body.add(tabs);
    y += SIZE.tabH + 4;
    const h = footY - 3 - y;
    if (this.tab === 'ladder') this.buildLadder(p, y, h, keep);
    else if (this.tab === 'team') this.buildTeam(p, y, h, keep);
    else this.buildShop(p, y, h);
    this.buildFoot(p, footY);
  }

  private buildFoot(p: DuelProfileView, by: number): void {
    const { VW } = this.m;
    this.body.add(addPanel(this, 0, by - 2, VW, 38, 'parch'));
    const y = by + 3;
    const team = this.teamHeroes(p);
    if (this.tab === 'team') {
      const bw = Math.floor((VW - 8 - SIZE.gap) / 2);
      this.body.add(new Button(this, 4, y, bw, 30, { label: t('duels.recruit'), icon: 'plus', variant: 'primary', id: 'duel.recruit', onClick: () => this.openRecruit() }));
      this.body.add(new Button(this, 4 + bw + SIZE.gap, y, VW - 8 - bw - SIZE.gap, 30, { label: t('duels.dismiss'), icon: 'close', id: 'duel.dismiss', onClick: () => this.openDismiss() }));
      return;
    }
    // ladder and shop: the team at a glance
    const pts = teamPoints(team);
    const line = t('duels.teamLine', { n: team.length, max: DUEL_RULES.teamMax, pts });
    const bw = VW < 180 ? 30 : 66;
    this.body.add(addIcon(this, 6, y + 8, 'people'));
    this.body.add(addText(this, 21, y + 10, ellipsize(line, VW - 21 - 8 - bw), 'ink'));
    this.body.add(new Button(this, VW - 4 - bw, y, bw, 30, { label: t('duels.tab.team'), icon: 'shield', iconOnly: VW < 180, id: 'duel.toTeam', onClick: () => ((this.tab = 'team'), this.buildBody()) }));
  }

  // ------------------------------------------------------------------ ladder

  private buildLadder(p: DuelProfileView, y: number, h: number, keep: number): void {
    const { VW } = this.m;
    const farm = t('duels.farmLeft', { n: p.ladder.farmLeft, max: p.ladder.farmCap });
    const cleared = t('duels.cleared', { n: p.ladder.cleared, max: LADDER.floors });
    this.body.add(addText(this, 6, y + 1, ellipsize(cleared, Math.floor((VW - 12) / 2)), 'red'));
    this.body.add(addText(this, VW - 6, y + 1, ellipsize(farm, Math.floor((VW - 12) / 2)), p.ladder.farmLeft > 0 ? 'ink' : 'dim', 1));
    y += 13;
    h -= 13;
    const top = Math.min(LADDER.floors, p.ladder.cleared + 1);
    const floors = Array.from({ length: top }, (_, i) => top - i);
    const team = this.teamHeroes(p);
    this.list = new ScrollList(this, this.body, 4, y, VW - 8, h, {
      count: floors.length,
      rowH: 34,
      render: (i, row, rw, rh) => this.floorRow(p, team, floors[i], row, rw, rh),
    });
    this.list.area.setScroll(keep);
  }

  private floorRow(p: DuelProfileView, team: Hero[], n: number, row: Phaser.GameObjects.Container, w: number, rh: number): void {
    const next = n > p.ladder.cleared;
    const boss = isBoss(n);
    row.add(addPanel(this, 0, 0, w, rh, next ? 'buttonSel' : 'button'));
    const g = this.add.graphics();
    g.fillStyle(0x1d140f, 1);
    g.fillRect(3, 3, 28, 28);
    g.fillStyle(boss ? 0x8c2f25 : next ? 0xd8a840 : 0x5a4232, 1);
    g.fillRect(4, 4, 26, 26);
    row.add(g);
    row.add(addText(this, 17, 13, `${n}`, 'light', 0.5));
    const budget = floorBudget(n);
    const reward = next ? ladderFloor(n).reward.firstGlory : ladderFloor(n).reward.farmGlory;
    const problem = teamProblem(team, budget);
    const narrow = w < 180;
    const bw = narrow ? 26 : 46;
    const fight = new Button(this, w - bw - 3, 6, bw, 22, {
      label: t('duels.fight'),
      icon: 'swords',
      iconOnly: narrow,
      variant: next ? 'primary' : 'secondary',
      id: next ? 'duel.fightNext' : 'duel.fight',
      onClick: () => void this.fight(n),
    });
    fight.setEnabled(!problem, problem ? t(`duels.why.${problem}` as TKey, { n: budget }) : undefined);
    this.rowTap(() => this.list, row, w - bw - 3, rh, 'duel.floorRow', () => this.profile && this.openFloor(this.profile, n));
    row.add(fight);
    const tx = 36;
    const right = w - bw - 8;
    // the Glory a win pays (first clear on the next floor, farm Glory below it), right of the name
    const rw = addText(this, right, 5, `+${reward}`, next ? 'light' : 'ink', 1);
    row.add(rw);
    if (!narrow) row.add(addIcon(this, right - rw.width - 13, 3, 'star', next ? '' : 'D'));
    const nameW = right - rw.width - (narrow ? 4 : 16) - tx;
    const name = ellipsize(boss ? t('duels.floorBoss', { n }) : t('duels.floor', { n }), nameW - (next ? 0 : 14));
    const nt = addText(this, tx, 4, name, next ? 'light' : 'ink');
    row.add(nt);
    if (!next) row.add(addIcon(this, tx + nt.width + 3, 3, 'check'));
    const sub = next ? `${t('duels.budget', { n: budget })} · ${t('duels.firstWin')}` : t('duels.budget', { n: budget });
    row.add(addText(this, tx, 18, ellipsize(sub, right - tx), next ? 'light' : problem ? 'red' : 'dim'));
  }

  /** A floor's card: the enemy army and the rewards. */
  openFloor(p: DuelProfileView, n: number): void {
    const { VW, VH } = this.m;
    const f = ladderFloor(n);
    const w = Math.min(VW - 12, 210);
    const inner = w - 16;
    const rowH = 16;
    const m = openModal(this, { title: f.boss ? t('duels.floorBoss', { n }) : t('duels.floor', { n }), w, h: Math.min(VH - 12, 26 + 36 + f.heroes.length * rowH + SIZE.btnH + 20) });
    const { c, x } = m;
    let y = m.y + 22;
    const next = n > p.ladder.cleared;
    c.add(addText(this, x + 8, y, ellipsize(t('duels.enemy', { pts: f.points, n: f.heroes.length }), inner), 'red'));
    y += 11;
    c.add(addText(this, x + 8, y, ellipsize(`${t('duels.budget', { n: f.budget })} · ${t('duels.note.glory', { n: next ? f.reward.firstGlory : f.reward.farmGlory })}${next ? ` (${t('duels.firstWin')})` : ''}`, inner), 'ink'));
    y += 14;
    const by = m.y + m.h - 8 - SIZE.btnH;
    const list = new ScrollList(this, c, x + 8, y, inner, by - 4 - y, {
      count: f.heroes.length,
      rowH,
      render: (i, row, rw) => {
        const e = f.heroes[i];
        const cls = heroClass(e);
        addChip(this, row, 0, 2, cls.short, roleColor(cls.role), 50);
        row.add(addText(this, 44, 3, ellipsize(className(e), rw - 44 - 60), 'ink'));
        row.add(addText(this, rw, 3, `${t('hero.level', { n: e.level })} · ${heroPoints(e)}`, 'dim', 1));
      },
    });
    c.once('destroy', () => list.destroy());
    const half = Math.floor((inner - SIZE.gap) / 2);
    c.add(new Button(this, x + 8, by, half, SIZE.btnH, { label: t('common.close'), onClick: () => m.close() }));
    const problem = teamProblem(this.teamHeroes(p), f.budget);
    const b = new Button(this, x + 8 + half + SIZE.gap, by, inner - half - SIZE.gap, SIZE.btnH, { label: t('duels.fight'), icon: 'swords', variant: 'primary', id: 'duel.floorFight', onClick: () => (m.close(), void this.fight(n)) });
    b.setEnabled(!problem, problem ? t(`duels.why.${problem}` as TKey, { n: f.budget }) : undefined);
    c.add(b);
  }

  private async fight(n: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const tk = await this.src.ladderStart(n);
      if (!this.sys.isActive()) return;
      this.scene.start('Battle', { source: ladderSource(this.game, this.src, tk) });
    } catch (e) {
      if (this.sys.isActive()) {
        hapticNotify('error');
        toast(this, errorText(e), 'bad');
      }
    } finally {
      this.busy = false;
    }
  }

  // ------------------------------------------------------------------ team

  private buildTeam(p: DuelProfileView, y: number, h: number, keep: number): void {
    const { VW } = this.m;
    const team = this.teamHeroes(p);
    const pts = teamPoints(team);
    const over = pts > DUEL_RULES.budget;
    this.body.add(addText(this, 6, y + 1, ellipsize(t('duels.teamCount', { n: team.length, max: DUEL_RULES.teamMax }), Math.floor((VW - 12) / 2)), 'red'));
    this.body.add(addText(this, VW - 6, y + 1, ellipsize(t('duels.points', { n: pts, max: DUEL_RULES.budget }), Math.floor((VW - 12) / 2)), over ? 'red' : 'ink', 1));
    y += 13;
    h -= 13;
    // team first (in team order), then the bench
    const heroes = [...team, ...p.heroes.filter((x) => !p.team.includes(x.id))];
    if (!heroes.length) {
      this.body.add(addEmptyState(this, 4, y, VW - 8, h, { icon: 'people', title: t('army.noHeroes'), hint: t('duels.recruitHint') }));
      return;
    }
    this.list = new ScrollList(this, this.body, 4, y, VW - 8, h, {
      count: heroes.length,
      rowH: 30,
      render: (i, row, rw, rh) => this.heroRow(p, heroes[i], row, rw, rh),
    });
    this.list.area.setScroll(keep);
  }

  private heroRow(p: DuelProfileView, h: Hero, row: Phaser.GameObjects.Container, w: number, rh: number): void {
    const inTeam = p.team.includes(h.id);
    row.add(addPanel(this, 0, 0, w, rh, inTeam ? 'buttonSel' : 'button'));
    const cls = heroClass(h);
    const fr = this.add.graphics();
    fr.fillStyle(0x1d140f, 1);
    fr.fillRect(3, 3, 24, 24);
    fr.fillStyle(roleColor(cls.role), 1);
    fr.fillRect(4, 4, 22, 22);
    row.add(fr);
    row.add(this.add.image(3, 3, ensurePortrait(this, dollFromHero(h))).setOrigin(0, 0));
    const bw = 28;
    const tog = new Button(this, w - bw - 3, 4, bw, 22, {
      icon: inTeam ? 'check' : 'plus',
      label: inTeam ? t('duels.bench') : t('duels.toTeam'),
      iconOnly: true,
      variant: inTeam ? 'secondary' : 'primary',
      id: inTeam ? 'duel.bench' : 'duel.addToTeam',
      onClick: () => this.toggleTeam(p, h),
    });
    if (!inTeam && p.team.length >= DUEL_RULES.teamMax) tog.setEnabled(false, t('duels.why.too_many'));
    this.rowTap(() => this.list, row, w - bw - 3, rh, 'duel.heroRow', () => this.openHero(h.id));
    row.add(tog);
    const right = w - bw - 8;
    addGroupBadge(this, row, right - 12, 3, h.group);
    const pts = addText(this, right, 18, t('duels.pts', { n: heroPoints(h) }), inTeam ? 'light' : 'ink', 1);
    row.add(pts);
    const x = 31;
    row.add(addText(this, x, 4, ellipsize(h.name, right - 16 - x), inTeam ? 'light' : 'ink'));
    const sub = `${t('hero.level', { n: h.level })} ${cls.short}${h.points > 0 ? ' +' : ''}`;
    const subT = addText(this, x, 17, ellipsize(sub, right - pts.width - 4 - x - 42), inTeam ? 'light' : h.points > 0 ? 'gold' : 'dim');
    row.add(subT);
    addStars(this, row, Math.min(x + subT.width + 4, right - pts.width - 4 - 39), 19, heroStars(h));
  }

  private toggleTeam(p: DuelProfileView, h: Hero): void {
    const ids = p.team.includes(h.id) ? p.team.filter((x) => x !== h.id) : [...p.team, h.id];
    void this.act(() => this.src.team({ heroIds: ids }));
  }

  /** The hero sheet on the duel army (stats, gear, perks, skills, respec). */
  openHero(id: string): void {
    if (!this.profile) return;
    this.scene.start('Hero', { heroId: id, source: new DuelHeroSource(this.src, this.profile), tab: 'stats' });
  }

  openRecruit(): void {
    const p = this.profile;
    if (!p) return;
    const { VW, VH } = this.m;
    const w = Math.min(VW - 12, 210);
    const inner = w - 16;
    const rowH = 34;
    const m = openModal(this, { title: t('duels.recruitTitle'), w, h: Math.min(VH - 12, 26 + 16 + DUEL_CLASSES.length * (rowH + SIZE.gap) + SIZE.btnH + 14) });
    const { c, x } = m;
    c.add(addText(this, x + 8, m.y + 22, ellipsize(t('duels.recruitInfo', { n: p.glory, have: p.heroes.length, max: DUEL_RULES.rosterMax }), inner), 'dim'));
    const by = m.y + m.h - 8 - SIZE.btnH;
    const top = m.y + 34;
    const full = p.heroes.length >= DUEL_RULES.rosterMax;
    const list = new ScrollList(this, c, x + 8, top, inner, by - 4 - top, {
      count: DUEL_CLASSES.length,
      rowH,
      render: (i, row, rw, rh) => {
        const { cls: id, level } = DUEL_CLASSES[i];
        const sample = duelRecruit(7 + i, { nextId: 1 }, 'sample_', id, []);
        const cls = CLASSES[id];
        const locked = p.level < level;
        const price = recruitPrice(id);
        row.add(addPanel(this, 0, 0, rw, rh, locked ? 'inset' : 'button'));
        const pf = this.add.graphics();
        pf.fillStyle(0x1d140f, 1);
        pf.fillRect(3, 3, 30, 30);
        pf.fillStyle(locked ? 0x5a4232 : roleColor(cls.role), 1);
        pf.fillRect(4, 4, 28, 28);
        row.add(pf);
        row.add(this.add.image(6, 6, ensurePortrait(this, dollFromHero(sample))).setOrigin(0, 0).setAlpha(locked ? 0.5 : 1));
        const bw = 26;
        const why = locked ? t('duels.unlocksAt', { n: level }) : full ? t('duels.why.roster_full') : p.glory < price ? t('duels.noGlory') : undefined;
        const b = new Button(this, rw - bw - 3, 5, bw, SIZE.btnH, {
          label: t('town.hire'),
          icon: 'plus',
          iconOnly: true,
          variant: why ? 'secondary' : 'primary',
          id: 'duel.hire',
          tip: t('duels.hireTip', { name: className(sample), n: price }),
          onClick: () => (m.close(), void this.act(() => this.src.recruit(id), () => t('town.hired', { name: className(sample) }))),
        });
        b.setEnabled(!why, why);
        this.rowTap(() => list, row, rw - bw - 3, rh, 'duel.classCard', () => openClassCard(this, { hero: sample, title: className(sample) }));
        row.add(b);
        const tx = 38;
        const tw = rw - tx - bw - 8;
        row.add(addText(this, tx, 4, ellipsize(className(sample), tw), locked ? 'dim' : 'red'));
        // the price first (it decides), then the points and the role
        let sx = tx;
        if (!locked) {
          row.add(addIcon(this, tx - 1, 16, 'star', p.glory < price ? 'D' : ''));
          sx = tx + 12;
        }
        const sub = locked ? t('duels.unlocksAt', { n: level }) : `${price} · ${t('duels.pts', { n: classPoints(id) })} · ${roleName(cls.role)}`;
        row.add(addText(this, sx, 18, ellipsize(sub, tw - (sx - tx)), locked ? 'dim' : p.glory < price ? 'red' : 'ink'));
      },
    });
    c.once('destroy', () => list.destroy());
    c.add(new Button(this, x + 8, by, inner, SIZE.btnH, { label: t('common.close'), onClick: () => m.close() }));
  }

  /** Dismiss a hero (bench only; their gear goes to the stash). */
  openDismiss(): void {
    const p = this.profile;
    if (!p) return;
    const { VW, VH } = this.m;
    const bench = p.heroes.filter((h) => !p.team.includes(h.id));
    const w = Math.min(VW - 12, 210);
    const inner = w - 16;
    const rowH = 28;
    const m = openModal(this, { title: t('duels.dismissTitle'), w, h: Math.min(VH - 12, 26 + 16 + Math.max(1, bench.length) * (rowH + SIZE.gap) + SIZE.btnH + 16) });
    const { c, x } = m;
    c.add(addText(this, x + 8, m.y + 22, ellipsize(t('duels.dismissHint'), inner), 'dim'));
    const by = m.y + m.h - 8 - SIZE.btnH;
    const top = m.y + 34;
    if (!bench.length) c.add(addText(this, x + w / 2, top + 6, ellipsize(t('duels.benchEmpty'), inner), 'ink', 0.5));
    else {
      const list = new ScrollList(this, c, x + 8, top, inner, by - 4 - top, {
        count: bench.length,
        rowH,
        render: (i, row, rw, rh) => {
          const h = bench[i];
          row.add(addPanel(this, 0, 0, rw, rh, 'button'));
          row.add(this.add.image(2, 2, ensurePortrait(this, dollFromHero(h))).setOrigin(0, 0));
          const bw = 50;
          const b = new Button(this, rw - bw - 3, 3, bw, 22, {
            label: t('duels.dismissOne'),
            variant: 'destructive',
            id: 'duel.dismissOne',
            onClick: () =>
              confirmDialog(this, {
                title: t('duels.dismissConfirm', { name: h.name }),
                body: t('duels.dismissBody'),
                ok: t('duels.dismissOne'),
                cancel: t('common.cancel'),
                destructive: true,
                onOk: () => (m.close(), void this.act(() => this.src.dismiss(h.id), () => t('duels.dismissed', { name: h.name }))),
              }),
          });
          row.add(b);
          row.add(addText(this, 30, 4, ellipsize(h.name, rw - 30 - bw - 8), 'ink'));
          row.add(addText(this, 30, 15, ellipsize(`${t('hero.level', { n: h.level })} ${heroClass(h).short}`, rw - 30 - bw - 8), 'dim'));
        },
      });
      c.once('destroy', () => list.destroy());
    }
    c.add(new Button(this, x + 8, by, inner, SIZE.btnH, { label: t('common.close'), onClick: () => m.close() }));
  }

  // ------------------------------------------------------------------ shop

  private buildShop(p: DuelProfileView, y: number, h: number): void {
    const { VW } = this.m;
    const tabs = new Tabs(this, 4, y, VW - 8, SHOP_TABS.map((k) => t(`duels.shop.${k}` as TKey)), {
      selected: SHOP_TABS.indexOf(this.shopTab),
      ids: SHOP_TABS.map((k) => `duel.shop.${k}`),
      onChange: (i) => {
        this.shopTab = SHOP_TABS[i];
        this.buildBody();
      },
    });
    this.body.add(tabs);
    y += SIZE.tabH + 4;
    h -= SIZE.tabH + 4;
    if (this.shopTab === 'sell') {
      this.stash = new StashGrid(this, this.body, 4, y, VW - 8, h, {
        items: () => p.stash,
        state: this.stashState,
        onTap: (it) => this.openSell(it),
        empty: { title: t('stash.emptyTitle'), hint: t('duels.sellEmpty') },
      });
      return;
    }
    let offers: ShopOffer[];
    if (this.shopTab === 'offers') {
      offers = dailyOffers(p.day);
      this.body.add(addText(this, 6, y, ellipsize(t('duels.offersHint'), VW - 12), 'dim'));
      y += 12;
      h -= 12;
    } else {
      // slot chooser, then that slot's items at every shop rarity
      const sw = Math.floor((VW - 8 - (SLOTS.length - 1) * SIZE.gap) / SLOTS.length);
      SLOTS.forEach((s, i) =>
        this.body.add(
          new Button(this, 4 + i * (sw + SIZE.gap), y, sw, 22, {
            icon: s === 'weapon' ? 'sword' : s === 'trinket' ? 'ring' : s,
            label: t(`slot.${s}` as TKey),
            iconOnly: true,
            style: this.gearSlot === s ? 'buttonSel' : 'button',
            id: `duel.slot.${s}`,
            onClick: () => ((this.gearSlot = s), this.buildBody()),
          }),
        ),
      );
      y += 26;
      h -= 26;
      offers = catalogue().filter((o) => itemDef(o.def).slot === this.gearSlot);
    }
    this.list = new ScrollList(this, this.body, 4, y, VW - 8, h, {
      count: offers.length,
      rowH: 30,
      render: (i, row, rw, rh) => this.offerRow(p, offers[i], row, rw, rh),
    });
  }

  private offerRow(p: DuelProfileView, o: ShopOffer, row: Phaser.GameObjects.Container, w: number, rh: number): void {
    const it = sample(o);
    const sold = p.bought.includes(o.id);
    row.add(addPanel(this, 0, 0, w, rh, 'button'));
    row.add(new ItemIcon(this, 3, 3, { item: it }, { size: 24, tip: false }));
    const bw = 50;
    const b = new Button(this, w - bw - 3, 4, bw, 22, {
      label: sold ? t('duels.soldOut') : `${o.price}`,
      icon: sold ? 'check' : 'star',
      variant: !sold && p.glory >= o.price ? 'primary' : 'secondary',
      id: 'duel.buy',
      onClick: () => this.buy(o),
    });
    b.setEnabled(!sold && p.glory >= o.price, sold ? t('duels.soldOut') : t('duels.noGlory'));
    this.rowTap(() => this.list, row, w - bw - 3, rh, 'duel.offerRow', () => this.openOffer(p, o));
    row.add(b);
    const tx = 31;
    const tw = w - tx - bw - 8;
    row.add(addText(this, tx, 4, ellipsize(itemName(it), tw), 'ink'));
    const label = tOr(`rarity.${o.rarity}`, RARITY_LABEL[o.rarity]);
    const r = addText(this, tx, 17, ellipsize(label, tw), 'dim');
    r.setTint(rarityColor(it));
    row.add(r);
  }

  private openOffer(p: DuelProfileView, o: ShopOffer): void {
    const sold = p.bought.includes(o.id);
    openItemCard(this, {
      item: sample(o),
      notes: [{ text: t('duels.price', { n: o.price }), font: 'red' }],
      actions: [{ label: sold ? t('duels.soldOut') : t('duels.buyFor', { n: o.price }), icon: 'star', variant: 'primary', id: 'duel.buyCard', disabled: sold ? t('duels.soldOut') : p.glory < o.price ? t('duels.noGlory') : undefined, onClick: () => this.buy(o) }],
    });
  }

  private buy(o: ShopOffer): void {
    void this.act(() => this.src.buy(o.id), (r) => t('duels.bought', { name: itemName(r.item) }));
  }

  private openSell(it: Item): void {
    const price = sellPrice(it);
    openItemCard(this, {
      item: it,
      notes: [{ text: t('duels.sellFor', { n: price }), font: 'red' }],
      actions: [
        {
          label: t('duels.sell', { n: price }),
          icon: 'star',
          id: 'duel.sell',
          onClick: () =>
            confirmDialog(this, {
              title: t('duels.sellTitle', { name: itemName(it) }),
              body: t('duels.sellBody', { n: price }),
              ok: t('duels.sell', { n: price }),
              cancel: t('common.cancel'),
              onOk: () => void this.act(() => this.src.sell(it.uid), () => t('duels.sold', { n: price })),
            }),
        },
      ],
    });
  }
}

const samples = new Map<string, Item>();
/** A display copy of an offer's item (fixed paint, perfect condition). */
function sample(o: ShopOffer): Item {
  let it = samples.get(o.id);
  if (!it) {
    it = makeItem(new Rng(11), { nextId: 1 }, o.def, o.rarity, 100);
    it.uid = `offer_${o.id}`;
    samples.set(o.id, it);
  }
  return it;
}


// ------------------------------------------------------------------ battle

/** Stops whatever runs and opens the duel hub (from the battle scene's callbacks). */
export function backToDuel(game: Phaser.Game, data: DuelSceneData): void {
  for (const sc of game.scene.getScenes(true)) game.scene.stop(sc.scene.key);
  game.scene.start('Duel', data);
}

/** The battle scene's source for a ladder floor: submit the order log, then the report and back to the ladder. */
export function ladderSource(game: Phaser.Game, src: DuelSource, tk: LadderTicket): BattleSource {
  const label = tk.boss ? t('duels.floorBoss', { n: tk.floor }) : t('duels.floor', { n: tk.floor });
  return {
    setup: tk.setup,
    heroes: [...tk.team, ...tk.enemies],
    side: 0,
    label: t('battle.vs', { name: label }),
    onFinish(sim: Battle, deployOrders: number) {
      const sub = attackSubmission(sim, deployOrders);
      src
        .ladderSubmit(tk.ticket, sub, sim.result())
        .then((r) => showReport(game, ladderReport(r, this.label, src.demo), () => backToDuel(game, { tab: 'ladder', preview: src.demo })))
        .catch((e) => backToDuel(game, { tab: 'ladder', preview: src.demo, error: errorText(e) }));
    },
    onLeave() {
      void src.ladderAbandon(tk.ticket).catch(() => undefined);
      backToDuel(game, { tab: 'ladder', preview: src.demo });
    },
  };
}

/** The post-battle report of a ladder floor (Glory and account XP as notes; no deaths in duels). */
export function ladderReport(r: LadderReport, label: string, demo = false): BattleReport {
  const notes: string[] = [];
  if (r.firstClear) notes.push(t('duels.note.first', { n: r.floor }));
  if (r.capped > 0) notes.push(t('duels.note.capped'));
  notes.push(t('duels.note.xp', { n: r.accountXp }));
  if (demo) notes.push(t('duels.note.demo'));
  return buildReport({
    result: resultFor(r.winner, 0),
    vs: label,
    ticks: r.ticks,
    side: 0,
    stats: lastBattle.stats,
    heroes: lastBattle.heroes,
    outcomes: r.xp.map((x) => ({ heroId: x.heroId, name: x.name, died: false, wounded: false, xp: x.xp, levelsGained: x.levelsGained, levelBefore: x.levelBefore, xpBefore: x.xpBefore })),
    gold: 0,
    glory: r.glory,
    loot: r.drop ? [r.drop] : [],
    picks: 0,
    lootInStash: !!r.drop,
    verified: demo ? null : true,
    online: 'attack',
    notes,
  });
}
