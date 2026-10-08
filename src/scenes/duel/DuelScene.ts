/**
 * The duel hub (docs/DUELS.md): the persistent duel army, its Glory and
 * account level, and four tabs: Ladder (the PvE floors: farm Glory, XP and
 * gear), Arena (the season line, then Live: league and placements, the ranked
 * and unranked queues, live matches through src/duel/match.ts; Raids: async
 * attacks on other players' defence teams, the defence and the raid log; Top:
 * the leaderboards), Team (three saved teams and which one fights where; who
 * fights, inside the point budget; a tap opens the hero sheet; recruiting)
 * and Shop (daily offers, the gear catalogue, selling). A season's rewards
 * show in a popup on the first visit after it ended.
 * Every change is a request to the duel source; the screen redraws from the
 * answer. Started with `{ preview: true }` it runs on the in-memory demo.
 */
import Phaser from 'phaser';
import { BaseScene } from '../BaseScene';
import { Button, addIcon, addPanel, addText, Meter } from '../../ui/kit';
import { ItemIcon, ScrollList, Tabs, addEmptyState, confirmDialog, openModal, toast } from '../../ui/widgets';
import { ellipsize, measureText } from '../../ui/textfit';
import { uiId } from '../../ui/layout';
import { SIZE, COLOR } from '../../ui/theme';
import { ensureFonts } from '../../ui/fonts';
import {
  DragDrop, StashGrid, addChip, addGroupBadge, addStars, className, defaultStashState, itemName, openClassCard, openItemCard, rarityColor, roleColor, roleName,
  type StashState,
} from '../../ui/sheet';
import { addEconState } from '../../ui/econ/widgets';
import { addPortrait } from '../../ui/sprites';
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
import {
  DemoDuelSource, LOADOUT_USES, duelSource, type AsyncTicket, type AsyncView, type AsyncLogEntry, type Board, type DemoMatch, type DuelProfileView, type DuelSource,
  type LadderReport, type LadderTicket, type LeaderboardView, type LoadoutUse, type QueueEvent, type RankedView, type SeasonView,
} from '../../duel/client';
import { RANKED, divisionRoman, leagueRank, type DuelMode, type League, type LeagueId } from '../../duel/rating';
import type { AsyncReport, MatchReport } from '../../duel/protocol';
import { ASYNC, seasonMonth } from '../../duel/season';
import { cosmeticTexture } from '../../ui/econ/widgets';
import { MatchLink, matchSource, type MatchOutcome } from '../../duel/match';
import { LINE_H, wrapText } from '../../ui/textfit';
import { DuelHeroSource } from '../../duel/heroSource';
import { showReport } from '../ResultsScene';
import { makeItem } from '../../game/heroes';
import { Rng } from '../../sim/rng';
import { t, tOr, type TKey } from '../../i18n';

export type DuelTab = 'ladder' | 'ranked' | 'team' | 'shop';
type ShopTab = 'offers' | 'gear' | 'sell';
/** The Arena tab's pages: live matches, async raids, leaderboards. */
export type ArenaTab = 'live' | 'raid' | 'top';
const ARENA_TABS: ArenaTab[] = ['live', 'raid', 'top'];
const BOARDS: Board[] = ['live', 'async', 'legend'];

export interface DuelSceneData {
  tab?: DuelTab;
  shop?: ShopTab;
  /** Run on the in-memory demo (layout check, previews). */
  preview?: boolean;
  /** A message to show on arrival (a failed battle report...). */
  error?: string;
  /** Previews: the demo account's duel XP (0: below the ranked gate). */
  demoXp?: number;
  arena?: ArenaTab;
}

const TABS: DuelTab[] = ['ladder', 'ranked', 'team', 'shop'];
const TAB_ICONS = ['flag', 'swords', 'people', 'star'];

/** Badge colour of each league (placements: the plain frame). */
const LEAGUE_COLOR: Record<League['id'], number> = { bronze: 0x8a5a2b, silver: 0x8f9aa3, gold: 0xc89a30, hoplite: 0x8c2f25, strategos: 0x4a3a8c, legend: 0x2a7a6a };

/** "Gold II", "Legend". */
export function leagueName(l: League): string {
  const name = t(`duels.league.${l.id}` as TKey);
  return l.division ? t('duels.leagueDiv', { league: name, div: divisionRoman(l.division) }) : name;
}

/** "Gold II" of a league id alone (titles, rewards: the league, no division). */
export function leagueTitle(id: LeagueId): string {
  return t(`duels.league.${id}` as TKey);
}

/** "October 2026" of a season id. */
export function seasonName(id: number): string {
  const { year, month } = seasonMonth(id);
  return t('duels.seasonName', { month: t(`duels.month.${month}` as TKey), year });
}

/** "12d 5h" / "5h 20m" / "20m" until a time. */
export function leftText(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return t('duels.timeDH', { d, h });
  if (h > 0) return t('duels.timeHM', { h, m: m % 60 });
  return t('duels.timeM', { m });
}

/** "3h ago" of a past time. */
function agoText(ms: number): string {
  const m = Math.max(1, Math.floor(ms / 60_000));
  if (m < 60) return t('duels.ago.m', { n: m });
  if (m < 1440) return t('duels.ago.h', { n: Math.floor(m / 60) });
  return t('duels.ago.d', { n: Math.floor(m / 1440) });
}

/** "0:42" from milliseconds. */
function clockText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
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
  /** The ranked card (loaded with the profile). */
  ranked: RankedView | null = null;
  /** A queue search in progress. */
  private search: { mode: DuelMode; since: number; cancel: () => void } | null = null;
  /** The opponent the queue found (shown for foundHoldMs before the battle). */
  private found: { match: string; mode: DuelMode; name: string; league: League | null } | null = null;
  /** How long the "opponent found" card stays before the battle (previews keep it). */
  foundHoldMs = 1600;
  private searchText: Phaser.GameObjects.BitmapText | null = null;
  private arenaTab: ArenaTab = 'live';
  /** The raid card, the season and the open leaderboard (loaded with the Arena). */
  asyncView: AsyncView | null = null;
  season: SeasonView | null = null;
  board: Board = 'live';
  boardView: LeaderboardView | null = null;
  /** Hints stop above this y (the Arena page's bottom). */
  private pageBottom = Infinity;
  /** The season reward popup was shown in this visit. */
  private rewardShown = false;

  constructor() {
    super('Duel');
  }

  create(data: DuelSceneData = {}): void {
    // the demo stays on while the screens it opened (hero sheet, battle) come back here
    const prev = this.src;
    this.src = duelSource(data.preview);
    if (data.demoXp !== undefined && this.src instanceof DemoDuelSource) this.src.setXp(data.demoXp);
    // the last profile shows at once while it reloads (not another source's)
    if (prev !== this.src) this.profile = null;
    this.tab = data.tab ?? this.tab;
    this.shopTab = data.shop ?? this.shopTab;
    this.arenaTab = data.arena ?? this.arenaTab;
    if (prev !== this.src) (this.asyncView = null), (this.season = null), (this.boardView = null), (this.rewardShown = false);
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
    this.search = null;
    this.found = null;
    this.events.once('shutdown', () => {
      this.clearBody();
      this.search?.cancel();
      this.search = null;
    });
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickSearch() });
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
      void this.loadRanked();
      void this.loadSeason();
      if (this.tab === 'ranked' && this.arenaTab === 'raid') void this.loadAsync();
      if (this.tab === 'ranked' && this.arenaTab === 'top') void this.loadBoard();
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

  /** The heroes of the edited team, or of the team used for something (ladder, arena, defence). */
  private teamHeroes(p: DuelProfileView, use?: LoadoutUse): Hero[] {
    const ids = use ? (p.loadouts?.[p.use[use] - 1]?.team ?? p.team) : p.team;
    return ids.map((id) => p.heroes.find((h) => h.id === id)).filter((h): h is Hero => !!h);
  }

  /** "Team 2" or the name a loadout was given. */
  private loadoutName(p: DuelProfileView, slot: number): string {
    return p.loadouts?.[slot - 1]?.name || t('duels.loadout', { n: slot });
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
    const labels = TABS.map((k) => t(`duels.tab.${k}` as TKey));
    // four tabs on a narrow screen: icons (the labels become tips)
    const tabW = (VW - 8 - SIZE.gap * (TABS.length - 1)) / TABS.length;
    const narrow = labels.some((l) => measureText(l) + 10 > tabW);
    const tabs = new Tabs(this, 4, y, VW - 8, labels, {
      icons: narrow ? TAB_ICONS : undefined,
      iconOnly: narrow,
      selected: TABS.indexOf(this.tab),
      ids: TABS.map((k) => `duel.tab.${k}`),
      onChange: (i) => {
        this.tab = TABS[i];
        this.buildBody();
      },
    });
    // the Arena has no foot (its pages need the height on small screens)
    const foot = this.tab !== 'ranked';
    const footY = foot ? VH - 36 : VH;
    this.body.add(addPanel(this, 0, y + SIZE.tabH - 2, VW, footY - (y + SIZE.tabH - 2), 'parch'));
    this.body.add(tabs);
    y += SIZE.tabH + 4;
    const h = footY - 3 - y;
    this.searchText = null;
    if (this.tab === 'ladder') this.buildLadder(p, y, h, keep);
    else if (this.tab === 'ranked') this.buildRanked(p, y, h);
    else if (this.tab === 'team') this.buildTeam(p, y, h, keep);
    else this.buildShop(p, y, h);
    if (foot) this.buildFoot(p, footY);
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
    // ladder and shop: the team that fights there at a glance
    const use: LoadoutUse | undefined = this.tab === 'ladder' ? 'ladder' : undefined;
    const fighting = use ? this.teamHeroes(p, use) : team;
    const pts = teamPoints(fighting);
    const slot = use ? p.use[use] : p.loadout;
    const line = `${this.loadoutName(p, slot)} · ${t('duels.teamLine', { n: fighting.length, max: DUEL_RULES.teamMax, pts })}`;
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
    const team = this.teamHeroes(p, 'ladder');
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
    const problem = teamProblem(this.teamHeroes(p, 'ladder'), f.budget);
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

  // ------------------------------------------------------------------ ranked

  private async loadRanked(): Promise<void> {
    try {
      const r = await this.src.ranked();
      if (!this.sys.isActive()) return;
      this.ranked = r;
      if (this.tab === 'ranked' && this.arenaTab === 'live' && this.profile && this.st === 'ready') this.buildBody();
    } catch {
      // the card keeps what it had (the profile loaded, so this is a passing failure)
    }
  }

  private async loadAsync(): Promise<void> {
    try {
      const v = await this.src.asyncView();
      if (!this.sys.isActive()) return;
      this.asyncView = v;
      if (this.tab === 'ranked' && this.arenaTab === 'raid' && this.profile && this.st === 'ready' && !this.search && !this.found) this.buildBody();
    } catch {
      // keeps what it had
    }
  }

  private async loadBoard(): Promise<void> {
    const board = this.board;
    try {
      const v = await this.src.leaderboard(board);
      if (!this.sys.isActive() || board !== this.board) return;
      this.boardView = v;
      if (this.tab === 'ranked' && this.arenaTab === 'top' && this.profile && this.st === 'ready' && !this.search && !this.found) this.buildBody();
    } catch {
      // keeps what it had
    }
  }

  /** The season (and, once per visit, the popup of rewards not seen yet). */
  private async loadSeason(): Promise<void> {
    try {
      const v = await this.src.season();
      if (!this.sys.isActive()) return;
      this.season = v;
      if (this.tab === 'ranked' && this.profile && this.st === 'ready' && !this.search && !this.found) this.buildBody();
      if (v.rewards.length && !this.rewardShown) this.openSeasonRewards(v);
    } catch {
      // the season line waits for the next load
    }
  }

  private buildRanked(p: DuelProfileView, y: number, h: number): void {
    const { VW } = this.m;
    const x = 4;
    const w = VW - 8;
    // a search or a found opponent take the whole page (small screens have little room)
    if (this.found) return this.buildFound(this.found, x, y, w);
    if (this.search) return this.buildSearch(this.search, x, y, w);
    const top = y;
    this.pageBottom = y + h;
    y = this.buildSeasonLine(x, y, w);
    const tabs = new Tabs(this, x, y, w, ARENA_TABS.map((k) => t(`duels.arena.${k}` as TKey)), {
      selected: ARENA_TABS.indexOf(this.arenaTab),
      ids: ARENA_TABS.map((k) => `duel.arena.${k}`),
      onChange: (i) => this.openArena(ARENA_TABS[i]),
    });
    this.body.add(tabs);
    y += SIZE.tabH + 4;
    const left = h - (y - top);
    if (this.arenaTab === 'raid') this.buildRaid(p, x, y, w, left);
    else if (this.arenaTab === 'top') this.buildTop(x, y, w, left);
    else this.buildLive(p, x, y, w);
  }

  /** Switches the Arena page (and loads what it shows). */
  openArena(tab: ArenaTab): void {
    this.arenaTab = tab;
    this.tab = 'ranked';
    if (tab === 'raid') void this.loadAsync();
    if (tab === 'top') void this.loadBoard();
    if (tab === 'live') void this.loadRanked();
    if (this.profile && this.st === 'ready') this.buildBody();
  }

  /** "October 2026 · 24d 5h left" and the best league of the season; returns the y below. */
  private buildSeasonLine(x: number, y: number, w: number): number {
    const s = this.season;
    this.body.add(addIcon(this, x, y - 1, 'clock'));
    if (!s) {
      this.body.add(addText(this, x + 14, y + 1, '...', 'dim'));
      return y + 13;
    }
    const peak = this.arenaTab === 'raid' ? s.async.peak : s.live.peak;
    const left = t('duels.seasonLeft', { name: t(`duels.month.${seasonMonth(s.season.id).month}` as TKey), t: leftText(s.season.end - Date.now()) });
    // the peak only when both fit whole (the time left matters more)
    const right = peak ? t('duels.seasonPeak', { league: leagueName(peak) }) : '';
    const fits = right && measureText(left) + measureText(right) + 20 <= w;
    const rt = fits ? addText(this, x + w, y + 1, right, 'ink', 1) : null;
    if (rt) this.body.add(rt);
    this.body.add(addText(this, x + 14, y + 1, ellipsize(left, w - 14 - (rt ? rt.width + 6 : 0)), 'red'));
    return y + 13;
  }

  private buildLive(p: DuelProfileView, x: number, y: number, w: number): void {
    const r = this.ranked;
    const B = this.body;
    // the league card: badge, league (or placements) and record
    const ch = 38;
    B.add(addPanel(this, x, y, w, ch, 'inset'));
    const league = r?.league ?? null;
    const g = this.add.graphics();
    g.fillStyle(0x1d140f, 1);
    g.fillRect(x + 4, y + 4, 30, 30);
    g.fillStyle(league ? LEAGUE_COLOR[league.id] : 0x5a4232, 1);
    g.fillRect(x + 5, y + 5, 28, 28);
    B.add(g);
    B.add(addIcon(this, x + 12, y + 7, league?.id === 'legend' ? 'star' : 'shield', 'L'));
    if (league?.division) B.add(addText(this, x + 19, y + 23, divisionRoman(league.division), 'light', 0.5));
    const tx = x + 39;
    const tw = w - (tx - x) - 5;
    const title = !r ? '...' : league ? (league.id === 'legend' && r.rating !== null ? t('duels.legendRating', { n: r.rating }) : leagueName(league)) : t('duels.placements', { n: r.placements.played, max: r.placements.of });
    B.add(addText(this, tx, y + 5, ellipsize(title, tw), 'red'));
    if (r) {
      B.add(addText(this, tx, y + 16, ellipsize(t('duels.wl', { w: r.wins, l: r.losses }), tw), 'ink'));
      if (!league) B.add(new Meter(this, tx, y + 29, tw, 4, COLOR.xp).setValue(r.placements.played, r.placements.of));
      else B.add(addText(this, tx, y + 26, ellipsize(t('duels.payRanked', { w: RANKED.glory.ranked.win, l: RANKED.glory.ranked.loss }), tw), 'dim'));
    }
    y += ch + 4;
    const now = Date.now();
    const bh = 30;
    if (r?.match) {
      const m = r.match;
      B.add(new Button(this, x, y, w, bh, { label: t('duels.rejoin'), icon: 'swords', variant: 'primary', id: 'duel.rejoin', onClick: () => this.enterMatch(m.id, m.mode) }));
      this.hint(t('duels.rejoinHint'), x, y + bh + 3, w, 'dim', 2);
      return;
    }
    const cooldown = r && r.cooldownUntil > now ? r.cooldownUntil : 0;
    const locked = !!r && !r.unlocked;
    const problem = teamProblem(this.teamHeroes(p, 'arena'), DUEL_RULES.budget);
    const why = cooldown ? t('duels.unq.cooldown') : problem ? t(`duels.why.${problem}` as TKey, { n: DUEL_RULES.budget }) : !r ? t('duels.unq.error') : undefined;
    // ranked (wide, primary) and unranked side by side
    const uw = Math.max(54, Math.floor(w * 0.4));
    const rw = w - uw - SIZE.gap;
    const ranked = new Button(this, x, y, rw, bh, { label: t('duels.findMatch'), icon: 'swords', variant: 'primary', id: 'duel.findRanked', onClick: () => this.findMatch('ranked') });
    ranked.setEnabled(!why && !locked, why ?? (locked && r ? t('duels.rankedLocked', { n: r.unlockLevel }) : undefined));
    B.add(ranked);
    const un = new Button(this, x + rw + SIZE.gap, y, uw, bh, { label: t('duels.unranked'), id: 'duel.findUnranked', onClick: () => this.findMatch('unranked') });
    un.setEnabled(!why, why);
    B.add(un);
    y += bh + 4;
    if (cooldown) {
      y = this.hint(t('duels.cooldown', { t: clockText(cooldown - now) }), x, y, w, 'red', 1);
      this.hint(t('duels.cooldownHint'), x, y, w, 'dim', 1);
    } else if (locked && r) {
      y = this.hint(t('duels.rankedLocked', { n: r.unlockLevel }), x, y, w, 'red', 1);
      this.hint(t('duels.rankedLockedHint'), x, y, w, 'dim', 1);
    } else {
      // the arena team (which saved team fights here), then what unranked pays
      const team = this.teamHeroes(p, 'arena');
      y = this.hint(`${this.loadoutName(p, p.use.arena)} · ${t('duels.teamLine', { n: team.length, max: DUEL_RULES.teamMax, pts: teamPoints(team) })}`, x, y, w, 'ink', 1);
      this.hint(t('duels.payUnranked', { w: RANKED.glory.unranked.win, l: RANKED.glory.unranked.loss }), x, y, w, 'dim', 1);
    }
  }

  /** Wrapped lines of text; returns the y below them. */
  private hint(text: string, x: number, y: number, w: number, font: 'dim' | 'red' | 'ink', lines: number): number {
    // only the lines that fit above the page's bottom (short screens drop the last hints)
    lines = Math.min(lines, Math.floor((this.pageBottom - y) / LINE_H));
    if (lines <= 0) return y;
    const wr = wrapText(text, w - 4, lines);
    this.body.add(addText(this, x + 2, y, wr.lines.join('\n'), font));
    return y + wr.lines.length * LINE_H + 2;
  }

  private buildSearch(s: { mode: DuelMode; since: number }, x: number, y: number, w: number): void {
    const B = this.body;
    const wr = wrapText(t('duels.searchHint'), w - 12, 2);
    const ph = 34 + wr.lines.length * LINE_H + 3;
    B.add(addPanel(this, x, y, w, ph, 'button'));
    B.add(addIcon(this, x + 5, y + 4, 'hourglass'));
    B.add(addText(this, x + 20, y + 6, ellipsize(t(`duels.searchMode.${s.mode}` as TKey), w - 25), 'red'));
    this.searchText = addText(this, x + w / 2, y + 20, t('duels.searching', { t: clockText(Date.now() - s.since) }), 'ink', 0.5);
    B.add(this.searchText);
    B.add(addText(this, x + 6, y + 33, wr.lines.join('\n'), 'dim'));
    B.add(new Button(this, x, y + ph + 4, w, 30, { label: t('common.cancel'), icon: 'close', id: 'duel.cancelSearch', onClick: () => this.cancelSearch() }));
  }

  private buildFound(f: { name: string; league: League | null }, x: number, y: number, w: number): void {
    const B = this.body;
    B.add(addPanel(this, x, y, w, 66, 'buttonSel'));
    B.add(addIcon(this, x + 5, y + 4, 'swords', 'L'));
    B.add(addText(this, x + 20, y + 6, ellipsize(t('duels.found'), w - 25), 'light'));
    B.add(addText(this, x + w / 2, y + 21, ellipsize(t('battle.vs', { name: f.name }), w - 12), 'light', 0.5));
    if (f.league) {
      const label = leagueName(f.league);
      const cw = Math.min(w - 12, 96);
      addChip(this, B, x + w / 2 - cw / 2, y + 35, label, LEAGUE_COLOR[f.league.id], cw);
    }
    B.add(addText(this, x + w / 2, y + 52, ellipsize(t('duel.preparing'), w - 12), 'light', 0.5));
  }

  private tickSearch(): void {
    if (this.search && this.searchText?.active) this.searchText.setText(t('duels.searching', { t: clockText(Date.now() - this.search.since) }));
    // a running cooldown counts down on the card
    if (!this.search && !this.found && this.tab === 'ranked' && this.ranked?.cooldownUntil && this.profile && this.st === 'ready') {
      if (this.ranked.cooldownUntil <= Date.now()) this.ranked.cooldownUntil = 0;
      this.buildBody();
    }
  }

  /** Joins a queue: the card shows the search until a match is found or the server refuses. */
  findMatch(mode: DuelMode): void {
    if (this.search || this.found) return;
    const since = Date.now();
    this.search = { mode, since, cancel: () => undefined };
    this.search.cancel = this.src.queue(mode, (e) => this.onQueue(e));
    this.tab = 'ranked';
    this.arenaTab = 'live';
    if (this.profile && this.st === 'ready') this.buildBody();
  }

  cancelSearch(): void {
    this.search?.cancel();
    this.search = null;
    if (this.sys.isActive()) this.buildBody();
  }

  private onQueue(e: QueueEvent): void {
    if (!this.sys.isActive() || !this.search) return;
    if (e.type === 'match_found') {
      this.search = null;
      if (!e.opponent.name) return this.enterMatch(e.match, e.mode); // a live match to rejoin
      this.found = { match: e.match, mode: e.mode, name: e.opponent.name, league: e.opponent.league };
      hapticNotify('success');
      this.buildBody();
      this.time.delayedCall(this.foundHoldMs, () => this.found && this.enterMatch(e.match, e.mode));
    } else if (e.type === 'unqueued' || e.type === 'error') {
      this.search = null;
      if (e.type === 'error' || e.reason !== 'cancelled') {
        hapticNotify('error');
        toast(this, e.type === 'error' ? e.message : t(`duels.unq.${e.reason}` as TKey), 'bad', 3000);
      }
      this.buildBody();
      void this.loadRanked();
    }
  }

  /** Into the match's battle: the live socket, or the demo's local battle against the bot. */
  enterMatch(id: string, mode: DuelMode): void {
    this.found = null;
    if (this.src instanceof DemoDuelSource) {
      const m = this.src.demoMatch(id);
      if (!m) return this.buildBody();
      this.scene.start('Battle', { source: demoMatchSource(this.game, this.src, m) });
      return;
    }
    void playLiveMatch(this.game, this.src, id, mode);
  }

  /** Previews (layout check): the report of a won ranked match that was promoted. */
  previewMatchResult(): void {
    const p = this.profile;
    if (!p) return;
    const team = this.teamHeroes(p);
    lastBattle.heroes = team.map((h) => JSON.parse(JSON.stringify(h)) as Hero);
    lastBattle.side = 0;
    lastBattle.stats = [
      ...team.map((h, i) => ({ heroId: h.id, side: 0 as const, kills: i % 3, dmg: 20 + i * 9, dead: false, ko: i === 4, killedBy: -1 })),
      ...[0, 1, 2, 3, 4].map((i) => ({ heroId: `foe${i}`, side: 1 as const, kills: 0, dmg: 10, dead: i < 4, ko: false, killedBy: i < 4 ? 0 : -1 })),
    ];
    const report: MatchReport = {
      match: 'preview',
      mode: 'ranked',
      side: 0,
      names: ['You', 'Hektor'],
      winner: 0,
      end: 'battle',
      verified: true,
      ticks: 20 * 94,
      abandoned: false,
      glory: RANKED.glory.ranked.win,
      accountXp: RANKED.accountXp.win,
      rating: { before: 1388, after: 1406 },
      league: { before: { id: 'silver', division: 1 }, after: { id: 'gold', division: 3 } },
      placements: { played: 10, of: 10 },
      xp: team.map((h, i) => ({ heroId: h.id, name: h.name, kills: i % 3, xp: 24 + (i % 3) * 10, levelsGained: i === 0 ? 1 : 0, levelBefore: h.level, xpBefore: h.xp })),
    };
    showReport(this.game, rankedReport(report, t('battle.vs', { name: 'Hektor' }), this.src.demo), () => backToDuel(this.game, { tab: 'ranked', preview: this.src.demo }));
  }

  /** Previews (layout check): the report of a won raid. */
  previewRaidResult(): void {
    const p = this.profile;
    if (!p) return;
    const team = this.teamHeroes(p, 'arena');
    lastBattle.heroes = team.map((h) => JSON.parse(JSON.stringify(h)) as Hero);
    lastBattle.side = 0;
    lastBattle.stats = [
      ...team.map((h, i) => ({ heroId: h.id, side: 0 as const, kills: i % 2, dmg: 18 + i * 7, dead: false, ko: false, killedBy: -1 })),
      ...[0, 1, 2, 3, 4, 5].map((i) => ({ heroId: `foe${i}`, side: 1 as const, kills: 0, dmg: 8, dead: true, ko: false, killedBy: 0 })),
    ];
    const report: AsyncReport = {
      attack: 'preview',
      defender: { pid: 901, name: 'Lysander' },
      winner: 0,
      ticks: 20 * 71,
      verified: true,
      glory: ASYNC.glory.win,
      accountXp: ASYNC.accountXp.win,
      rating: { before: 1452, after: 1468 },
      league: { before: { id: 'gold', division: 3 }, after: { id: 'gold', division: 3 } },
      placements: { played: 10, of: 10 },
      xp: team.map((h, i) => ({ heroId: h.id, name: h.name, kills: i % 2, xp: 24 + (i % 2) * 10, levelsGained: 0, levelBefore: h.level, xpBefore: h.xp })),
    };
    showReport(this.game, raidReport(report, this.src.demo), () => backToDuel(this.game, { tab: 'ranked', arena: 'raid', preview: this.src.demo }));
  }

  // ------------------------------------------------------------------ raids (async defence ladder)

  private buildRaid(p: DuelProfileView, x: number, y: number, w: number, h: number): void {
    const B = this.body;
    const a = this.asyncView;
    const bottom = y + h;
    // the raid card: league (or placements), record, and raids left today
    const ch = 24;
    B.add(addPanel(this, x, y, w, ch, 'inset'));
    const league = a?.league ?? null;
    const g = this.add.graphics();
    g.fillStyle(0x1d140f, 1);
    g.fillRect(x + 3, y + 3, 18, 18);
    g.fillStyle(league ? LEAGUE_COLOR[league.id] : 0x5a4232, 1);
    g.fillRect(x + 4, y + 4, 16, 16);
    B.add(g);
    B.add(addIcon(this, x + 5, y + 5, 'flag', 'L'));
    const tx = x + 25;
    if (!a) {
      B.add(addText(this, tx, y + 8, '...', 'ink'));
      return;
    }
    // the defence and the log: icon buttons in the card on narrow screens, a row of their own otherwise
    const narrow = w < 180;
    const defLabel = a.defence ? t('duels.raid.defence', { team: this.loadoutName(p, p.use.defence) }) : t('duels.raid.noDefence');
    const defOpts = { label: defLabel, icon: 'shield', variant: (a.defence ? 'secondary' : 'primary') as 'secondary' | 'primary', id: 'duel.raid.defence', onClick: () => this.openDefence() };
    const logOpts = { label: t('duels.raid.log'), icon: 'eye', id: 'duel.raid.log', onClick: () => void this.openRaidLog() };
    let right = x + w - 4;
    if (narrow) {
      B.add(new Button(this, x + w - 22, y + 1, 22, 22, { ...logOpts, iconOnly: true }));
      B.add(new Button(this, x + w - 22 - SIZE.gap - 22, y + 1, 22, 22, { ...defOpts, iconOnly: true }));
      right = x + w - 2 * 22 - SIZE.gap - 4;
    }
    const left = t('duels.raid.left', { n: a.attacks.left, max: a.attacks.cap });
    const title = league ? (league.id === 'legend' && a.rating !== null ? t('duels.legendRating', { n: a.rating }) : leagueName(league)) : t('duels.placements', { n: a.placements.played, max: a.placements.of });
    const record = `${t('duels.wl', { w: a.wins, l: a.losses })} · ${t('duels.raid.held', { w: a.defenceWins, n: a.defences })}`;
    if (narrow) {
      // league above, raids left below (the record is on the wider layout and in the log)
      B.add(addText(this, tx, y + 3, ellipsize(title, right - tx), 'red'));
      B.add(addText(this, tx, y + 13, ellipsize(left, right - tx), a.attacks.left > 0 ? 'ink' : 'red'));
    } else {
      const lt = addText(this, right, y + 3, left, a.attacks.left > 0 ? 'ink' : 'red', 1);
      B.add(lt);
      B.add(addText(this, tx, y + 3, ellipsize(title, right - tx - lt.width - 4), 'red'));
      B.add(addText(this, tx, y + 13, ellipsize(record, right - tx), 'dim'));
    }
    y += ch + 4;
    if (!narrow) {
      const bw = Math.floor((w - SIZE.gap) / 2);
      B.add(new Button(this, x, y, bw, SIZE.btnH, defOpts));
      B.add(new Button(this, x + bw + SIZE.gap, y, w - bw - SIZE.gap, SIZE.btnH, logOpts));
      y += SIZE.btnH + 4;
    }
    if (!a.unlocked) {
      y = this.hint(t('duels.raid.locked', { n: a.unlockLevel }), x, y, w, 'red', 1);
      this.hint(t('duels.raid.lockedHint'), x, y, w, 'dim', 2);
      return;
    }
    if (a.attacks.left <= 0) {
      y = this.hint(t('duels.raid.capped'), x, y, w, 'red', 1);
      this.hint(t('duels.raid.cappedHint'), x, y, w, 'dim', 2);
      return;
    }
    if (!a.candidates.length) {
      y = this.hint(t('duels.raid.none'), x, y, w, 'ink', 1);
      this.hint(t('duels.raid.noneHint'), x, y, w, 'dim', 2);
      return;
    }
    const team = this.teamHeroes(p, 'arena');
    const problem = teamProblem(team, DUEL_RULES.budget);
    const list = a.candidates;
    this.list = new ScrollList(this, this.body, x, y, w, Math.max(30, bottom - y), {
      count: list.length,
      rowH: 30,
      render: (i, row, rw, rh) => {
        const c = list[i];
        row.add(addPanel(this, 0, 0, rw, rh, 'button'));
        const narrow = rw < 180;
        const bw2 = narrow ? 28 : 50;
        const b = new Button(this, rw - bw2 - 3, 4, bw2, 22, {
          label: t('duels.raid.attack'),
          icon: 'swords',
          iconOnly: narrow,
          variant: 'primary',
          id: 'duel.raid.attack',
          onClick: () => void this.raid(c.pid),
        });
        b.setEnabled(!problem, problem ? t(`duels.why.${problem}` as TKey, { n: DUEL_RULES.budget }) : undefined);
        row.add(b);
        const right = rw - bw2 - 8;
        let chipW = 0;
        if (c.league) {
          const label = c.league.id === 'legend' && c.rating !== null ? `${c.rating}` : leagueName(c.league);
          chipW = addChip(this, row, right, 3, label, LEAGUE_COLOR[c.league.id], Math.floor(right * 0.5), true);
        }
        row.add(addText(this, 5, 4, ellipsize(c.name, right - 5 - chipW - 4), 'ink'));
        row.add(addText(this, 5, 17, ellipsize(t('duels.raid.foe', { n: c.heroes, pts: c.points }), right - 5), 'dim'));
      },
    });
  }

  /** Starts a raid on a defender: the battle scene, then the report and back to Raids. */
  async raid(defender: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const tk = await this.src.asyncStart(defender);
      if (!this.sys.isActive()) return;
      this.scene.start('Battle', { source: raidSource(this.game, this.src, tk) });
    } catch (e) {
      if (this.sys.isActive()) {
        hapticNotify('error');
        toast(this, errorText(e), 'bad');
        void this.loadAsync();
      }
    } finally {
      this.busy = false;
    }
  }

  /** Which saved team defends (the bot plays it when others raid you). */
  openDefence(): void {
    const p = this.profile;
    if (!p) return;
    const { VW, VH } = this.m;
    const w = Math.min(VW - 12, 210);
    const inner = w - 16;
    const rowH = 28;
    const wr = wrapText(t('duels.def.hint', { n: DUEL_RULES.budget }), inner, 3);
    const m = openModal(this, { title: t('duels.def.title'), w, h: Math.min(VH - 12, 26 + wr.lines.length * LINE_H + 6 + 3 * (rowH + SIZE.gap) + SIZE.btnH + 14) });
    const { c, x } = m;
    let y = m.y + 24;
    c.add(addText(this, x + 8, y, wr.lines.join('\n'), 'dim'));
    y += wr.lines.length * LINE_H + 6;
    for (const l of p.loadouts) {
      const heroes = l.team.map((id) => p.heroes.find((h) => h.id === id)).filter((h): h is Hero => !!h);
      const pts = teamPoints(heroes);
      const problem = teamProblem(heroes, DUEL_RULES.budget);
      const on = p.use.defence === l.slot && !!p.defence;
      const b = new Button(this, x + 8, y, inner, rowH - 2, {
        label: `${this.loadoutName(p, l.slot)} · ${t('duels.teamLine', { n: heroes.length, max: DUEL_RULES.teamMax, pts })}`,
        icon: on ? 'check' : 'shield',
        style: on ? 'buttonSel' : 'button',
        id: `duel.def.${l.slot}`,
        onClick: () => (m.close(), void this.act(() => this.src.loadout({ slot: l.slot, use: ['defence'] }), () => t('duels.def.set', { team: this.loadoutName(p, l.slot) })).then(() => this.loadAsync())),
      });
      b.setEnabled(!problem, problem ? t(`duels.why.${problem}` as TKey, { n: DUEL_RULES.budget }) : undefined);
      c.add(b);
      y += rowH + SIZE.gap;
    }
    c.add(new Button(this, x + 8, m.y + m.h - 8 - SIZE.btnH, inner, SIZE.btnH, { label: t('common.close'), onClick: () => m.close() }));
  }

  /** The raid log: your raids and the raids on your defence. */
  async openRaidLog(given?: AsyncLogEntry[]): Promise<void> {
    let entries = given;
    if (!entries) {
      try {
        entries = (await this.src.asyncLog()).entries;
      } catch (e) {
        if (this.sys.isActive()) toast(this, errorText(e), 'bad');
        return;
      }
    }
    if (!this.sys.isActive()) return;
    const { VW, VH } = this.m;
    const w = Math.min(VW - 12, 220);
    const inner = w - 16;
    const rowH = 30;
    const m = openModal(this, { title: t('duels.log.title'), w, h: Math.min(VH - 12, 26 + Math.max(1, entries.length) * rowH + SIZE.btnH + 18) });
    const { c, x } = m;
    const top = m.y + 24;
    const by = m.y + m.h - 8 - SIZE.btnH;
    const now = Date.now();
    const list = entries;
    if (!list.length) c.add(addText(this, x + w / 2, top + 8, ellipsize(t('duels.log.empty'), inner), 'ink', 0.5));
    else {
      const sl = new ScrollList(this, c, x + 8, top, inner, by - 4 - top, {
        count: list.length,
        rowH,
        render: (i, row, rw, rh) => {
          const e = list[i];
          row.add(addPanel(this, 0, 0, rw, rh - 2, e.role === 'defence' ? 'inset' : 'button'));
          row.add(addIcon(this, 3, 3, e.role === 'defence' ? 'shield' : 'swords'));
          const res = e.score === 1 ? t('duels.log.won') : e.score === 0.5 ? t('duels.log.draw') : t('duels.log.lost');
          const d = e.delta >= 0 ? `+${e.delta}` : `${e.delta}`;
          const rt = addText(this, rw - 4, 3, `${res} ${d}`, e.score === 1 ? 'good' : e.score === 0 ? 'red' : 'ink', 1);
          row.add(rt);
          const who = e.role === 'defence' ? t('duels.log.defence', { name: e.name }) : t('duels.log.attack', { name: e.name });
          row.add(addText(this, 17, 3, ellipsize(who, rw - 17 - rt.width - 8), 'ink'));
          const sub = e.glory ? `${agoText(now - e.at)} · ${t('duels.note.glory', { n: e.glory })}` : agoText(now - e.at);
          row.add(addText(this, 17, 15, ellipsize(sub, rw - 21), 'dim'));
        },
      });
      c.once('destroy', () => sl.destroy());
    }
    c.add(new Button(this, x + 8, by, inner, SIZE.btnH, { label: t('common.close'), onClick: () => m.close() }));
  }

  // ------------------------------------------------------------------ leaderboards

  private buildTop(x: number, y: number, w: number, h: number): void {
    const B = this.body;
    const bottom = y + h;
    const bw = Math.floor((w - 2 * SIZE.gap) / 3);
    BOARDS.forEach((b, i) =>
      B.add(
        new Button(this, x + i * (bw + SIZE.gap), y, i === 2 ? w - 2 * (bw + SIZE.gap) : bw, 22, {
          label: t(`duels.board.${b}` as TKey),
          style: this.board === b ? 'buttonSel' : 'button',
          id: `duel.board.${b}`,
          onClick: () => {
            this.board = b;
            this.boardView = null;
            void this.loadBoard();
            this.buildBody();
          },
        }),
      ),
    );
    y += 26;
    const v = this.boardView && this.boardView.board === this.board ? this.boardView : null;
    const title = this.season?.title;
    // the title line only when at least five rows still fit
    if (title && bottom - y - 12 - 24 >= 5 * 20) {
      this.body.add(addText(this, x + 2, y, ellipsize(t('duels.titleLine', { title: t('duels.titleOf', { league: leagueTitle(title.league), season: seasonName(title.season) }) }), w - 4), 'dim'));
      y += 12;
    }
    if (!v) {
      B.add(addText(this, x + w / 2, y + 8, '...', 'ink', 0.5));
      return;
    }
    const rowH = 20;
    const meH = v.me || this.board !== 'legend' ? rowH + 4 : 0;
    if (!v.rows.length) {
      this.hint(t('duels.board.empty'), x, y + 4, w, 'ink', 2);
    } else {
      this.list = new ScrollList(this, this.body, x, y, w, Math.max(rowH, bottom - meH - y), {
        count: v.rows.length,
        rowH,
        render: (i, row, rw, rh) => this.boardRow(v.rows[i], row, rw, rh, false),
      });
    }
    if (meH) {
      const row = this.add.container(x, bottom - rowH);
      B.add(row);
      if (v.me) this.boardRow(v.me, row, w, rowH, true);
      else {
        row.add(addPanel(this, 0, 0, w, rowH - 2, 'inset'));
        row.add(addText(this, 5, 4, ellipsize(t('duels.board.notPlaced', { n: RANKED.placements }), w - 10), 'dim'));
      }
    }
  }

  private boardRow(r: LeaderboardView['rows'][number], row: Phaser.GameObjects.Container, w: number, rh: number, me: boolean): void {
    row.add(addPanel(this, 0, 0, w, rh - 2, me ? 'buttonSel' : r.rank <= 3 ? 'button' : 'inset'));
    const rank = addText(this, 4, 4, `#${r.rank}`, me ? 'light' : r.rank <= 3 ? 'red' : 'ink');
    row.add(rank);
    const label = r.rating !== null ? `${r.rating}` : leagueName(r.league);
    const chipW = addChip(this, row, w - 3, 3, label, LEAGUE_COLOR[r.league.id], Math.floor(w * 0.45), true);
    const nx = Math.max(26, rank.width + 8);
    row.add(addText(this, nx, 4, ellipsize(me ? t('duels.board.you') : r.name, w - nx - chipW - 8), me ? 'light' : 'ink'));
  }

  // ------------------------------------------------------------------ season rewards

  /** The popup after a season ended: what each ladder's peak league paid (already in the purse and the wallet). */
  openSeasonRewards(v: SeasonView): void {
    this.rewardShown = true;
    const { VW, VH } = this.m;
    const w = Math.min(VW - 12, 220);
    const inner = w - 16;
    const rowH = 42;
    const best = v.title;
    const m = openModal(this, {
      title: t('duels.reward.title'),
      w,
      h: Math.min(VH - 12, 26 + 14 + v.rewards.length * (rowH + SIZE.gap) + (best ? 14 : 0) + SIZE.btnH + 16),
      onClose: () => void this.src.seasonSeen().catch(() => undefined),
    });
    const { c, x } = m;
    let y = m.y + 24;
    c.add(addText(this, x + w / 2, y, ellipsize(seasonName(v.rewards[0].season), inner), 'ink', 0.5));
    y += 14;
    for (const r of v.rewards) {
      c.add(addPanel(this, x + 8, y, inner, rowH, 'button'));
      const pf = this.add.graphics();
      pf.fillStyle(0x1d140f, 1);
      pf.fillRect(x + 11, y + 7, 28, 28);
      pf.fillStyle(LEAGUE_COLOR[r.league], 1);
      pf.fillRect(x + 12, y + 8, 26, 26);
      c.add(pf);
      c.add(this.add.image(x + 12, y + 8, cosmeticTexture(this, r.cosmetic, r.cosmetic.startsWith('duel_banner') ? 'banner' : 'emblem')).setOrigin(0, 0).setDisplaySize(26, 26));
      const tx = x + 43;
      const tw = x + 8 + inner - tx - 4;
      c.add(addText(this, tx, y + 4, ellipsize(t('duels.reward.line', { ladder: t(`duels.board.${r.ladder}` as TKey), league: leagueTitle(r.league) }), tw), 'red'));
      c.add(addText(this, tx, y + 16, ellipsize(t('duels.note.glory', { n: r.glory }), tw), 'ink'));
      c.add(addText(this, tx, y + 28, ellipsize(tOr(`cosmetic.${r.cosmetic}`, r.cosmetic), tw), 'dim'));
      y += rowH + SIZE.gap;
    }
    if (best) c.add(addText(this, x + w / 2, y + 2, ellipsize(t('duels.titleLine', { title: t('duels.titleOf', { league: leagueTitle(best.league), season: seasonName(best.season) }) }), inner), 'dim', 0.5));
    c.add(new Button(this, x + 8, m.y + m.h - 8 - SIZE.btnH, inner, SIZE.btnH, { label: t('duels.reward.ok'), variant: 'primary', id: 'duel.reward.ok', onClick: () => m.close() }));
  }

  // ------------------------------------------------------------------ team

  private buildTeam(p: DuelProfileView, y: number, h: number, keep: number): void {
    const { VW } = this.m;
    const team = this.teamHeroes(p);
    const pts = teamPoints(team);
    const over = pts > DUEL_RULES.budget;
    // the saved teams (the selected one is edited below) and which one fights where
    const slots = p.loadouts?.length ?? 1;
    const uw = VW < 180 ? 30 : 56;
    const sw = Math.floor((VW - 8 - uw - slots * SIZE.gap) / slots);
    for (let i = 0; i < slots; i++) {
      const slot = i + 1;
      this.body.add(
        new Button(this, 4 + i * (sw + SIZE.gap), y, sw, 22, {
          label: VW < 180 ? String(slot) : this.loadoutName(p, slot),
          tip: this.loadoutName(p, slot),
          style: p.loadout === slot ? 'buttonSel' : 'button',
          id: `duel.loadout.${slot}`,
          onClick: () => p.loadout !== slot && void this.act(() => this.src.loadout({ slot, edit: true })),
        }),
      );
    }
    this.body.add(new Button(this, VW - 4 - uw, y, uw, 22, { label: t('duels.uses'), icon: 'flag', iconOnly: VW < 180, id: 'duel.loadoutUses', onClick: () => this.openUses() }));
    y += 25;
    h -= 25;
    // the edited team's size and where it fights, then its points
    const uses = LOADOUT_USES.filter((u) => p.use?.[u] === p.loadout).map((u) => t(`duels.use.${u}` as TKey));
    const ptsT = addText(this, VW - 6, y + 1, t('duels.points', { n: pts, max: DUEL_RULES.budget }), over ? 'red' : 'ink', 1);
    this.body.add(ptsT);
    const count = `${t('duels.teamCount', { n: team.length, max: DUEL_RULES.teamMax })}${uses.length ? ` · ${uses.join(', ')}` : ''}`;
    this.body.add(addText(this, 6, y + 1, ellipsize(count, VW - 12 - ptsT.width - 6), 'red'));
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
    row.add(addPortrait(this, dollFromHero(h), 3, 3));
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

  /** Which saved team fights on the ladder, in the arena (live and raids) and defends. */
  openUses(): void {
    const p = this.profile;
    if (!p?.loadouts) return;
    const { VW, VH } = this.m;
    const w = Math.min(VW - 12, 210);
    const inner = w - 16;
    const rowH = 38;
    const m = openModal(this, { title: t('duels.usesTitle'), w, h: Math.min(VH - 12, 26 + LOADOUT_USES.length * rowH + SIZE.btnH + 16) });
    const { c, x } = m;
    let y = m.y + 24;
    const n = p.loadouts.length;
    const bw = Math.floor((inner - (n - 1) * SIZE.gap) / n);
    for (const u of LOADOUT_USES) {
      c.add(addText(this, x + 8, y, ellipsize(t(`duels.use.${u}` as TKey), inner), 'red'));
      p.loadouts.forEach((l, i) => {
        const on = p.use[u] === l.slot;
        const heroes = l.team.map((id) => p.heroes.find((h) => h.id === id)).filter((h): h is Hero => !!h);
        const problem = u === 'defence' ? teamProblem(heroes, DUEL_RULES.budget) : heroes.length ? null : 'empty';
        const b = new Button(this, x + 8 + i * (bw + SIZE.gap), y + 11, i === n - 1 ? inner - (n - 1) * (bw + SIZE.gap) : bw, 22, {
          label: VW < 180 ? String(l.slot) : this.loadoutName(p, l.slot),
          tip: this.loadoutName(p, l.slot),
          icon: on ? 'check' : undefined,
          style: on ? 'buttonSel' : 'button',
          id: `duel.use.${u}.${l.slot}`,
          onClick: () => (m.close(), void this.act(() => this.src.loadout({ slot: l.slot, use: [u] }), () => t('duels.useSet', { team: this.loadoutName(p, l.slot), use: t(`duels.use.${u}` as TKey) }))),
        });
        b.setEnabled(on || !problem, problem ? t(`duels.why.${problem}` as TKey, { n: DUEL_RULES.budget }) : undefined);
        c.add(b);
      });
      y += rowH;
    }
    c.add(new Button(this, x + 8, m.y + m.h - 8 - SIZE.btnH, inner, SIZE.btnH, { label: t('common.close'), onClick: () => m.close() }));
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
        row.add(addPortrait(this, dollFromHero(sample), 6, 6).setAlpha(locked ? 0.5 : 1));
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
          row.add(addPortrait(this, dollFromHero(h), 2, 2));
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

// ------------------------------------------------------------------ live matches

/** Opens the match socket and starts the battle (or shows the report of a match already over). */
export async function playLiveMatch(game: Phaser.Game, src: DuelSource, id: string, _mode: DuelMode): Promise<void> {
  const link = new MatchLink(id);
  try {
    const first = await link.open();
    if (!('type' in first)) {
      link.close();
      showReport(game, rankedReport(first, t('battle.vs', { name: first.names[1 - first.side] })), () => backToDuel(game, { tab: 'ranked' }));
      return;
    }
    for (const sc of game.scene.getScenes(true)) if (sc.scene.key !== 'Battle') game.scene.stop(sc.scene.key);
    game.scene.start('Battle', { source: matchSource(link, first, (o) => finishMatch(game, src, id, o)) });
  } catch {
    link.close();
    backToDuel(game, { tab: 'ranked', error: t('duels.live.unreachable') });
  }
}

/** The battle is over: the settled report (asked for again if the socket missed it), then back to the Ranked tab. */
function finishMatch(game: Phaser.Game, src: DuelSource, id: string, o: MatchOutcome): void {
  const label = t('battle.vs', { name: o.names[1 - o.side] });
  if (o.report) return showReport(game, rankedReport(o.report, label), () => backToDuel(game, { tab: 'ranked' }));
  src
    .matchReport(id)
    .then((r) => showReport(game, rankedReport(r.report, label), () => backToDuel(game, { tab: 'ranked' })))
    .catch((e) => backToDuel(game, { tab: 'ranked', error: errorText(e) }));
}

/** The demo's live match: the same screens, a local battle against the bot, settled by the demo source. */
export function demoMatchSource(game: Phaser.Game, src: DemoDuelSource, m: DemoMatch): BattleSource {
  return {
    setup: m.setup,
    heroes: [...m.heroes[0], ...m.heroes[1]],
    side: 0,
    label: t('battle.vs', { name: m.names[1] }),
    opponent: m.names[1],
    onFinish(sim: Battle) {
      const r = src.demoSettle(m.id, sim.result());
      showReport(game, rankedReport(r, this.label, true), () => backToDuel(game, { tab: 'ranked', preview: true }));
    },
    onLeave() {
      backToDuel(game, { tab: 'ranked', preview: true });
    },
  };
}

/** The battle scene's source for a raid: submit the order log, then the report and back to Raids. */
export function raidSource(game: Phaser.Game, src: DuelSource, tk: AsyncTicket): BattleSource {
  return {
    setup: tk.setup,
    heroes: [...tk.team, ...tk.enemies],
    side: 0,
    label: t('battle.vs', { name: tk.defender.name }),
    opponent: tk.defender.name,
    onFinish(sim: Battle, deployOrders: number) {
      const sub = attackSubmission(sim, deployOrders);
      src
        .asyncSubmit(tk.ticket, sub, sim.result())
        .then((r) => showReport(game, raidReport(r.report, src.demo), () => backToDuel(game, { tab: 'ranked', arena: 'raid', preview: src.demo })))
        .catch((e) => backToDuel(game, { tab: 'ranked', arena: 'raid', preview: src.demo, error: errorText(e) }));
    },
    onLeave() {
      void src.asyncAbandon(tk.ticket).catch(() => undefined);
      backToDuel(game, { tab: 'ranked', arena: 'raid', preview: src.demo });
    },
  };
}

/** The post-battle report of a raid: the raid rating change, league, Glory and XP (no deaths in duels). */
export function raidReport(r: AsyncReport, demo = false): BattleReport {
  const notes: string[] = [];
  const d = r.rating.after - r.rating.before;
  const ds = d >= 0 ? `+${d}` : `-${-d}`;
  const { before, after } = r.league;
  notes.push(after?.id === 'legend' ? t('duels.note.raidLegend', { n: r.rating.after, d: ds }) : t('duels.note.raidRating', { d: ds }));
  if (r.placements.played < r.placements.of) notes.push(t('duels.note.placement', { n: r.placements.played, max: r.placements.of }));
  else if (after && !before) notes.push(t('duels.note.placed', { league: leagueName(after) }));
  else if (after && before && leagueRank(after) > leagueRank(before)) notes.push(t('duels.note.leagueUp', { league: leagueName(after) }));
  else if (after && before && leagueRank(after) < leagueRank(before)) notes.push(t('duels.note.leagueDown', { league: leagueName(after) }));
  if (r.accountXp) notes.push(t('duels.note.xp', { n: r.accountXp }));
  if (demo) notes.push(t('duels.note.demo'));
  return buildReport({
    result: resultFor(r.winner, 0),
    vs: t('battle.vs', { name: r.defender.name }),
    ticks: r.ticks,
    side: 0,
    stats: lastBattle.stats,
    heroes: lastBattle.heroes,
    outcomes: r.xp.map((x) => ({ heroId: x.heroId, name: x.name, died: false, wounded: false, xp: x.xp, levelsGained: x.levelsGained, levelBefore: x.levelBefore, xpBefore: x.xpBefore })),
    gold: 0,
    glory: r.glory,
    verified: demo ? null : r.verified,
    online: 'duel',
    notes,
  });
}

/** The post-battle report of a live match: rating change, league, placements, Glory and XP (no deaths in duels). */
export function rankedReport(r: MatchReport, label: string, demo = false): BattleReport {
  const notes: string[] = [];
  const foe = r.names[1 - r.side];
  if (r.end === 'void') notes.push(t('duels.note.void'));
  else if (r.abandoned) notes.push(t('duels.note.abandoned'));
  else if (r.end === 'forfeit' && r.winner === r.side) notes.push(t('duels.note.forfeitWin', { name: foe }));
  if (r.rating && r.league) {
    const d = r.rating.after - r.rating.before;
    const ds = d >= 0 ? `+${d}` : `-${-d}`;
    const { before, after } = r.league;
    notes.push(after?.id === 'legend' ? t('duels.note.ratingLegend', { n: r.rating.after, d: ds }) : t('duels.note.rating', { d: ds }));
    if (r.placements && r.placements.played < r.placements.of) notes.push(t('duels.note.placement', { n: r.placements.played, max: r.placements.of }));
    else if (after && !before) notes.push(t('duels.note.placed', { league: leagueName(after) }));
    else if (after && before && leagueRank(after) > leagueRank(before)) notes.push(t('duels.note.leagueUp', { league: leagueName(after) }));
    else if (after && before && leagueRank(after) < leagueRank(before)) notes.push(t('duels.note.leagueDown', { league: leagueName(after) }));
    else if (after) notes.push(t('duels.note.league', { league: leagueName(after) }));
  } else if (r.mode === 'unranked' && r.end !== 'void') notes.push(t('duels.note.unranked'));
  if (r.accountXp) notes.push(t('duels.note.xp', { n: r.accountXp }));
  if (demo) notes.push(t('duels.note.demo'));
  return buildReport({
    result: r.end === 'void' ? 'draw' : resultFor(r.winner, r.side),
    vs: label,
    ticks: r.ticks,
    side: r.side,
    stats: lastBattle.stats,
    heroes: lastBattle.heroes,
    outcomes: r.xp.map((x) => ({ heroId: x.heroId, name: x.name, died: false, wounded: false, xp: x.xp, levelsGained: x.levelsGained, levelBefore: x.levelBefore, xpBefore: x.xpBefore })),
    gold: 0,
    glory: r.glory,
    verified: demo ? null : r.verified,
    online: 'duel',
    notes,
  });
}
