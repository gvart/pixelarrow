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
import { Button, addIcon, addPanel, addText, scaleIcon, tappable, Meter, type FontKey } from '../../ui/kit';
import { ItemIcon, ScrollList, Tabs, addEmptyState, confirmDialog, openModal, toast } from '../../ui/widgets';
import { BASE_FONT_SIZE, ellipsize, measureText } from '../../ui/textfit';
import { uiId } from '../../ui/layout';
import { SIZE, COLOR, BRONZE, STRAT } from '../../ui/theme';
import { ensureFonts, rarityFont } from '../../ui/fonts';
import { Chip, CommandStrip, ListRow, SituationBar, addFocusRing, addNumbers, type CommandStripOpts, type StripSlot } from '../../ui/strategos';
import {
  DragDrop, StashGrid, addChip, addGroupBadge, addStars, className, defaultStashState, itemName, openClassCard, openItemCard, roleColor, roleName,
  type StashState,
} from '../../ui/sheet';
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
import { LADDER, isBoss, ladderFloor } from '../../duel/ladder';
import {
  DemoDuelSource, LOADOUT_USES, duelSource, type AsyncTicket, type AsyncView, type AsyncLogEntry, type Board, type DemoMatch, type DuelProfileView, type DuelSource,
  type LadderReport, type LadderTicket, type LeaderboardView, type LoadoutUse, type QueueEvent, type RankedView, type SeasonView,
} from '../../duel/client';
import { RANKED, divisionRoman, leagueRank, type DuelMode, type League, type LeagueId } from '../../duel/rating';
import type { AsyncReport, MatchReport } from '../../duel/protocol';
import { ASYNC, SEASON, seasonMonth } from '../../duel/season';
import { addCosmetic } from '../../ui/econ/widgets';
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
  /** What the battle just played paid (a toast on arrival; `floor`: a ladder floor, `first`: its first clear). */
  result?: { glory: number; won: boolean; draw?: boolean; floor?: number; first?: boolean };
}

const TABS: DuelTab[] = ['ladder', 'ranked', 'team', 'shop'];
/**
 * Back is ignored this long after the hub opens: the Back (or a second tap)
 * that left the report or the hero sheet must not also leave the hub for the
 * menu.
 */
const BACK_GUARD_MS = 600;
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

/** The Arena pages' chip icons. */
const ARENA_ICONS = ['swords', 'flag', 'star'];

/**
 * A list height of whole rows: the scroll chevron then sits on the last
 * row's bottom edge and the gap, never on its text.
 */
function wholeRows(h: number, rowH: number, gap: number = SIZE.gap): number {
  const k = Math.floor(h / (rowH + gap));
  return k >= 1 ? k * (rowH + gap) : h;
}

/** Fit a Cormorant SC heading ('head' font) into a width. */
function fitHead(s: string, w: number): string {
  return ellipsize(s, w, false, BASE_FONT_SIZE, 'head');
}

/** The pay of a finished match or raid, for the toast on the way back (`side`: the player's). */
function matchResult(glory: number, winner: number, side: number, draw = false): NonNullable<DuelSceneData['result']> {
  return { glory, won: winner === side, draw: draw || winner === -1 };
}

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
  /** Which page the list belongs to (its scroll is kept only on a rebuild of the same page). */
  private listKey = '';
  private stash: StashGrid | null = null;
  private stashState: StashState = defaultStashState();
  private drag!: DragDrop;
  /** The situation sentence and the numbers (Glory, duel level, the team's points). */
  private sit: SituationBar | null = null;
  /** The fixed bottom strip: Back, the one red action, a shortcut. */
  private strip!: CommandStrip;
  private stripOpts: CommandStripOpts = {};
  /** Top of the page under the hub tabs. */
  private pageTop = 0;
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
  /** The defender picked on the Raids page (the strip's Raid). */
  private raidPick: number | null = null;
  /** The next-floor card (the focus ring after a cleared floor). */
  private nextCard: { y: number; h: number } | null = null;
  /** What the battle just played paid (a toast once the profile is in). */
  private arrival: DuelSceneData['result'] | null = null;
  /** The season reward popup was shown in this visit. */
  private rewardShown = false;
  /** Bumped by every visit (not a relayout): answers that arrive after the player left are dropped. */
  private visit = 0;
  /** The next create is a relayout (new screen size): the queue search and a found match carry over. */
  private relayout = false;
  /** A live match being opened (playLiveMatch): no second search or rejoin until the battle starts. */
  private entering: string | null = null;
  /** The raid log is loading (a second tap must not open it twice). */
  private logLoading = false;
  /** When this visit began (Date.now()): see BACK_GUARD_MS. */
  private openedAt = 0;

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
    // a relayout keeps the search, the found match and the requests in flight
    const relayout = this.relayout;
    this.relayout = false;
    if (!relayout) {
      this.visit++;
      this.openedAt = Date.now();
      this.busy = false;
      this.arrival = data.error ? null : data.result ?? null;
    }
    this.list = null;
    this.listKey = '';
    this.stash = null;
    this.sit = null;
    this.initUi();
    ensureFonts(this);
    this.screen({ back: () => this.back() });
    const { VW, VH } = this.m;
    this.ui.add(this.add.rectangle(0, 0, VW, VH, P.bg).setOrigin(0, 0));
    this.head = this.add.container(0, 0);
    this.body = this.add.container(0, 0);
    this.ui.add([this.head, this.body]);
    this.strip = new CommandStrip(this, VW, VH, {});
    this.ui.add(this.strip);
    this.stripOpts = {};
    this.drag = new DragDrop(this);
    if (!relayout) {
      this.search = null;
      this.found = null;
      this.entering = null;
    }
    this.events.once('shutdown', () => {
      this.clearBody();
      if (this.relayout) return;
      this.search?.cancel();
      this.search = null;
    });
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickSearch() });
    // the found opponent's hold timer went with the old layout
    if (relayout && this.found) this.holdFound(this.found);
    this.render();
    void this.fetchData();
    if (data.error) toast(this, data.error, 'bad', 3500);
  }

  private back(): void {
    if (Date.now() - this.openedAt < BACK_GUARD_MS) return;
    this.scene.start('Menu');
  }

  /**
   * A new screen size rebuilds the hub where the player is (tab, Arena page)
   * without leaving the queue or dropping a found match (the default restart
   * would cancel the search, and a found match never entered is abandoned).
   */
  protected onResized(): void {
    this.relayout = true;
    this.scene.restart({ tab: this.tab, shop: this.shopTab, arena: this.arenaTab, preview: this.src.demo } satisfies DuelSceneData);
  }

  /** Whether an answer still belongs on screen: the scene runs and it is the visit that asked. */
  private current(visit: number): boolean {
    return this.sys.isActive() && visit === this.visit;
  }

  /** Load from the source, or show a given profile (tests, layout check). */
  async fetchData(given?: DuelProfileView): Promise<void> {
    const visit = this.visit;
    try {
      const p = given ?? (await this.src.profile());
      if (!this.current(visit)) return;
      this.setProfile(p);
      void this.loadRanked();
      void this.loadSeason();
      if (this.tab === 'ranked' && this.arenaTab === 'raid') void this.loadAsync();
      if (this.tab === 'ranked' && this.arenaTab === 'top') void this.loadBoard();
      this.st = 'ready';
    } catch (e) {
      if (!this.current(visit)) return;
      this.st = econState(e, (e as { code?: string } | null)?.code !== 'outside');
    }
    this.render();
    this.showArrival();
  }

  private setProfile(p: DuelProfileView): void {
    for (const h of p.heroes) normalizeEquip(h);
    p.stash.forEach((it) => normalizeItem(it));
    this.profile = p;
  }

  /** The strip's main action waits (a request runs), or is back to what the page set. */
  private hold(on: boolean): void {
    if (!this.sys.isActive()) return;
    if (on) this.strip.buttons.main?.setEnabled(false, t('duels.why.busy'));
    else this.strip.set(this.stripOpts);
  }

  private async act<T extends { profile: DuelProfileView }>(fn: () => Promise<T>, ok?: (r: T) => string): Promise<T | null> {
    if (this.busy) return null;
    this.busy = true;
    this.hold(true);
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
      this.hold(false);
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

  // ------------------------------------------------------------------ frame

  /** The content column: full width on phones, a readable centred column on tablets. */
  private get cw(): number {
    return Math.min(this.m.VW - 8, 236);
  }

  private get cx(): number {
    return Math.round((this.m.VW - this.cw) / 2);
  }

  /** Short screens (landscape phones): one-line situation bar, smaller cards. */
  private get compact(): boolean {
    return this.m.VH < STRAT.compactVH;
  }

  /** Bottom of the page: above the strip, and above the strip's reason line when its main action is off. */
  private get bottom(): number {
    const o = this.stripOpts;
    const why = o.main ? (o.why ?? o.main.off) : undefined;
    return this.strip.top - 3 - (why ? 11 : 0);
  }

  private backSlot(): StripSlot {
    return { label: t('strat.back'), icon: 'back', id: 'duel.back', onClick: () => this.back() };
  }

  /** The strip's Team shortcut (narrow screens keep the middle slot wide instead: the Team tab is one tap away). */
  private teamSlot(): StripSlot | null {
    if (this.m.VW < 150) return null;
    return { label: t('duels.tab.team'), icon: 'people', id: 'duel.toTeam', onClick: () => this.openTab('team') };
  }

  private openTab(tab: DuelTab): void {
    if (this.search || this.found) return;
    this.tab = tab;
    if (this.profile && this.st === 'ready') this.buildBody();
  }

  /** The page's sentence, its numbers (`team`: the team that fights on this page) and the strip. */
  private chrome(sentence: string, strip: CommandStripOpts, o: { urgent?: boolean; team?: Hero[]; budget?: number } = {}): void {
    const p = this.profile;
    this.say(sentence, o.urgent);
    if (p && this.sit) {
      const lp = levelProgress(p.xp);
      const budget = o.budget ?? DUEL_RULES.budget;
      const pts = teamPoints(o.team ?? this.teamHeroes(p));
      this.sit.setNumbers([
        { icon: 'star', value: `${p.glory}`, word: t('duels.num.glory'), font: 'gold' },
        { icon: 'flag', value: `${lp.level}`, word: t('duels.num.level') },
        { icon: 'people', value: `${pts}/${budget}`, word: t('duels.num.pts'), font: pts > budget ? 'red' : 'ink' },
      ]);
    }
    this.stripOpts = { left: this.backSlot(), ...strip };
    this.strip.set(this.stripOpts);
    if (this.busy) this.strip.buttons.main?.setEnabled(false, t('duels.why.busy'));
  }

  private say(sentence: string, urgent = false): void {
    this.sit?.setSentence(this.src.demo ? `${sentence}${t('duels.sit.demoSuffix')}` : sentence, urgent);
  }

  private render(): void {
    this.head.removeAll(true);
    const { VW } = this.m;
    const p = this.profile;
    this.sit = new SituationBar(this, VW, { sentence: '', compact: this.compact, id: 'duel.situation' });
    this.head.add(this.sit);
    // duel level XP: a thin bar along the bar's foot
    if (p) {
      const lp = levelProgress(p.xp);
      this.head.add(new Meter(this, 6, this.sit.h - 4, VW - 12, 2, COLOR.xp).setValue(lp.need ? lp.into : 1, lp.need || 1));
    }
    if (this.st !== 'ready' || !p) {
      this.clearBody();
      this.buildState();
      return;
    }
    this.buildBody();
  }

  /** Loading (skeleton rows) and the unavailable states, in the duel's own words. */
  private buildState(): void {
    const { VW } = this.m;
    const B = this.body;
    const st = this.st;
    const retry = () => {
      this.st = 'loading';
      this.render();
      void this.fetchData();
    };
    const outside = st === 'outside';
    this.chrome(st === 'loading' ? t('duels.sit.loading') : t('duels.sit.unavailable'), {
      main: st === 'loading' || outside ? null : { label: t('econ.retry'), icon: 'repair', id: 'duel.retry', onClick: retry },
    });
    const top = this.sit!.bottom + 4;
    B.add(addPanel(this, 0, top - 2, VW, this.strip.top - (top - 2), 'parch'));
    const { cx, cw } = this;
    const bottom = this.bottom;
    if (st === 'loading') {
      for (let i = 0; i < 4 && top + 4 + i * 34 + 30 <= bottom; i++) {
        const sk = addPanel(this, cx, top + 4 + i * 34, cw, 30, 'inset');
        B.add(sk);
        this.tweens.add({ targets: sk, alpha: { from: 1, to: 0.5 }, duration: 600, yoyo: true, repeat: -1, delay: i * 120 });
      }
      return;
    }
    const title = outside ? t('econ.outside') : st === 'offline' ? t('econ.offline') : st === 'closed' ? t('duels.closed') : t('econ.error');
    const hint = outside ? t('duels.outsideHint') : st === 'closed' ? t('duels.closedHint') : t('duels.offlineHint');
    B.add(addEmptyState(this, cx, top, cw, bottom - top, { icon: outside ? 'swords' : 'tent', title, hint }));
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

  /** The page key of the list (the scroll carries over only within one page). */
  private pageKey(): string {
    return `${this.tab}:${this.arenaTab}:${this.shopTab}:${this.gearSlot}:${this.board}`;
  }

  buildBody(): void {
    const key = this.pageKey();
    const keep = key === this.listKey ? (this.list?.area.scrollY ?? 0) : 0;
    this.clearBody();
    const p = this.profile;
    if (!p || !this.sit) return;
    this.listKey = key;
    const { VW } = this.m;
    const ty = this.sit.bottom + 3;
    const labels = TABS.map((k) => t(`duels.tab.${k}` as TKey));
    // icon and word where both fit, the word alone where only it fits, else icons (the words become tips)
    const tabW = (VW - 8 - SIZE.gap * (TABS.length - 1)) / TABS.length;
    const narrow = labels.some((l) => measureText(l) + 10 > tabW);
    const withIcons = !labels.some((l) => measureText(l) > tabW - 21);
    const tabs: Tabs = new Tabs(this, 4, ty, VW - 8, labels, {
      icons: narrow || withIcons ? TAB_ICONS : undefined,
      iconOnly: narrow,
      selected: TABS.indexOf(this.tab),
      ids: TABS.map((k) => `duel.tab.${k}`),
      onChange: (i) => {
        // the search (or the found opponent) holds the page: no way to lose track of it
        if (this.search || this.found) {
          tabs.select(TABS.indexOf(this.tab), false);
          toast(this, this.found ? t('duel.preparing') : t('duels.why.searching'), 'bad');
          return;
        }
        this.tab = TABS[i];
        this.buildBody();
      },
    });
    const top = ty + SIZE.tabH;
    this.body.add(addPanel(this, 0, top - 2, VW, this.strip.top - (top - 2), 'parch'));
    this.body.add(tabs);
    this.pageTop = top + 4;
    this.searchText = null;
    this.nextCard = null;
    if (this.tab === 'ladder') this.buildLadder(p, keep);
    else if (this.tab === 'ranked') this.buildRanked(p, keep);
    else if (this.tab === 'team') this.buildTeam(p, keep);
    else this.buildShop(p, keep);
  }

  /** After a battle: what it paid, and the new next floor ringed. */
  private showArrival(): void {
    const a = this.arrival;
    this.arrival = null;
    if (!a || !this.profile || this.st !== 'ready') return;
    if (a.floor) {
      const text = !a.won ? t('duels.backLost', { n: a.floor }) : a.first ? t('duels.backWon', { n: a.floor, g: a.glory }) : t('duels.backReplay', { n: a.floor, g: a.glory });
      toast(this, text, a.won ? 'good' : 'info', 2800, 'bottom');
      const c = this.nextCard;
      if (a.won && a.first && this.tab === 'ladder' && c) {
        const ring = addFocusRing(this, this.body, this.cx, c.y, this.cw, c.h);
        this.time.delayedCall(2200, () => ring.active && ring.destroy());
      }
      return;
    }
    const text = a.draw ? t('duels.backMatchDraw', { g: a.glory }) : a.won ? t('duels.backMatchWon', { g: a.glory }) : t('duels.backMatchLost', { g: a.glory });
    toast(this, text, a.won && !a.draw ? 'good' : 'info', 2800, 'bottom');
  }

  // ------------------------------------------------------------------ ladder

  private buildLadder(p: DuelProfileView, keep: number): void {
    const { cx, cw } = this;
    const B = this.body;
    const team = this.teamHeroes(p, 'ladder');
    const done = p.ladder.cleared >= LADDER.floors;
    const n = Math.min(LADDER.floors, p.ladder.cleared + 1);
    const f = ladderFloor(n);
    const problem = done ? null : teamProblem(team, f.budget);
    const why = problem ? t(`duels.why.${problem}` as TKey, { n: f.budget }) : undefined;
    const capped = p.ladder.farmLeft <= 0;
    const sentence = problem === 'over_budget' ? t('duels.sit.ladderOver', { n, b: f.budget }) : why ?? (done ? (capped ? t('duels.sit.ladderCapped') : t('duels.sit.ladderDone')) : t('duels.sit.ladder', { n, g: f.reward.firstGlory }));
    this.chrome(
      sentence,
      {
        main: done ? null : { label: t('duels.fightFloor', { n }), icon: 'swords', id: 'duel.fightNext', off: why, onClick: () => void this.fight(n) },
        right: this.teamSlot(),
      },
      { urgent: !!problem, team, budget: done ? DUEL_RULES.budget : f.budget },
    );
    let y = this.pageTop;
    const bottom = this.bottom;
    if (done) {
      const eh = Math.min(64, Math.max(40, Math.floor((bottom - y) / 2)));
      B.add(addEmptyState(this, cx, y, cw, eh, { icon: 'star', title: t('duels.ladderDone'), hint: t('duels.ladderDoneHint', { n: LADDER.floors }) }));
      y += eh + 6;
    } else {
      const ch = this.compact ? 44 : 56;
      this.buildNextFloor(f, cx, y, cw, ch, why);
      this.nextCard = { y, h: ch };
      y += ch + 6;
    }
    // the cleared floors (replays), the next boss ahead first
    const rows: number[] = [];
    const boss = Math.ceil((n + 1) / 10) * 10;
    if (!done && boss <= LADDER.floors && boss > n) rows.push(boss);
    for (let i = p.ladder.cleared; i >= 1; i--) rows.push(i);
    if (y + 12 + 30 > bottom || !rows.length) return;
    const head = addText(this, cx + 2, y, fitHead(t('duels.clearedTitle', { n: p.ladder.cleared, max: LADDER.floors }), cw - 4), 'head');
    B.add(head);
    // the farm Glory left only when it fits whole beside the heading
    const farm = capped ? t('duels.farmUsed') : t('duels.farmLeftLong', { n: p.ladder.farmLeft });
    if (measureText(farm) <= cw - head.width - 12) B.add(addText(this, cx + cw - 2, y + 1, farm, 'dim', 1));
    y += 13;
    this.list = new ScrollList(this, B, cx, y, cw, wholeRows(bottom - y, 30), {
      count: rows.length,
      rowH: 30,
      render: (i, row, rw) => this.floorRow(p, rows[i], row, rw),
      onTap: (i) => this.profile && this.openFloor(this.profile, rows[i]),
      id: (i) => (rows[i] > p.ladder.cleared ? 'duel.bossRow' : 'duel.floorRow'),
    });
    this.list.area.setScroll(keep);
  }

  /** The next floor: its number on a medallion, the reward and budget, the enemy; a tap opens the floor's card. */
  private buildNextFloor(f: ReturnType<typeof ladderFloor>, x: number, y: number, w: number, h: number, why: string | undefined): void {
    const B = this.body;
    const compact = h < 50;
    B.add(addPanel(this, x, y, w, h, 'slotSel'));
    const ms = compact ? 32 : 40;
    const mx = x + 6;
    const my = y + Math.round((h - ms) / 2);
    B.add(addPanel(this, mx, my, ms, ms, f.boss ? 'buttonDanger' : 'inset'));
    if (f.boss) {
      B.add(addIcon(this, mx + ms / 2 - 6, my + 3, 'skull', 'L'));
      B.add(addText(this, mx + ms / 2, my + ms - 12, `${f.floor}`, 'light', 0.5));
    } else {
      B.add(addText(this, mx + ms / 2, my + ms / 2 - 6, `${f.floor}`, 'head', 0.5).setScale(1.5));
    }
    const tx = mx + ms + 7;
    const tw = x + w - 6 - tx;
    const ly = compact ? [4, 17, 30] : [6, 21, 37];
    B.add(addText(this, tx, y + ly[0], fitHead(f.boss ? t('duels.floorBoss', { n: f.floor }) : t('duels.floor', { n: f.floor }), tw), 'head'));
    addNumbers(this, B, tx, y + ly[1], tw, [
      { icon: 'star', value: `+${f.reward.firstGlory}`, word: t('duels.num.glory'), font: 'gold' },
      { icon: 'helmet', value: `${f.budget}`, word: t('duels.num.budgetPts') },
    ]);
    // what the floor fields, and the gear its first clear drops when that fits too
    const foes = t('duels.enemy', { n: f.heroes.length, pts: f.points });
    const full = `${foes} · ${t('duels.firstDrop')}`;
    const enemy = measureText(full) <= tw ? full : foes;
    B.add(addText(this, tx, y + ly[2], ellipsize(why ?? enemy, tw), why ? 'red' : 'dim'));
    const z = this.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive();
    uiId(z, 'duel.nextFloor');
    tappable(z, null, () => this.profile && this.openFloor(this.profile, f.floor));
    B.add(z);
  }

  /** A cleared floor (a replay for farm Glory), or the next boss ahead (greyed). */
  private floorRow(p: DuelProfileView, n: number, row: Phaser.GameObjects.Container, rw: number): void {
    const w = rw - 3; // the scrollbar's gutter
    const boss = isBoss(n);
    const ahead = n > p.ladder.cleared;
    row.add(addPanel(this, 0, 0, w, 27, ahead ? 'inset' : 'button'));
    row.add(addPanel(this, 3, 3, 21, 21, 'inset'));
    if (boss) row.add(addIcon(this, 7, 7, 'skull', ahead ? 'D' : ''));
    else row.add(addText(this, 13, 9, `${n}`, 'ink', 0.5));
    row.add(addText(this, w - 5, 9, '>', 'dim', 1));
    const tw = w - 30 - 12;
    row.add(addText(this, 30, 4, ellipsize(boss ? t('duels.floorBoss', { n }) : t('duels.floor', { n }), tw), ahead ? 'dim' : 'ink'));
    const f = ladderFloor(n);
    const sub = ahead
      ? t('duels.bossAhead', { n: n - p.ladder.cleared - 1, b: f.budget })
      : p.ladder.farmLeft <= 0
        ? t('duels.replayCapped')
        : t('duels.replayLine', { g: f.reward.farmGlory, b: f.budget });
    row.add(addText(this, 30, 15, ellipsize(sub, tw), 'dim'));
  }

  /** A floor's card: the enemy army and the rewards. */
  openFloor(p: DuelProfileView, n: number): void {
    const { VW, VH } = this.m;
    const f = ladderFloor(n);
    const w = Math.min(VW - 12, 230);
    const inner = w - 16;
    const rowH = 16;
    const m = openModal(this, { title: f.boss ? t('duels.floorBoss', { n }) : t('duels.floor', { n }), w, h: Math.min(VH - 12, 26 + 36 + f.heroes.length * rowH + SIZE.btnH + 20) });
    const { c, x } = m;
    let y = m.y + 22;
    const next = n > p.ladder.cleared;
    c.add(addText(this, x + 8, y, ellipsize(t('duels.enemy', { pts: f.points, n: f.heroes.length }), inner), 'ink'));
    y += 13;
    addNumbers(this, c, x + 8, y, inner, [
      { icon: 'star', value: `+${next ? f.reward.firstGlory : f.reward.farmGlory}`, word: t('duels.num.glory'), font: 'gold' },
      { icon: 'helmet', value: `${f.budget}`, word: t('duels.num.budgetPts') },
    ]);
    y += 13;
    const by = m.y + m.h - 8 - SIZE.btnH;
    const list = new ScrollList(this, c, x + 8, y, inner, by - 4 - y, {
      count: f.heroes.length,
      rowH,
      render: (i, row, rw) => {
        const e = f.heroes[i];
        const cls = heroClass(e);
        // the level and points first (measured), the role chip and the class name share the rest
        const lv = addText(this, rw - 4, 3, t('duels.lvPts', { l: e.level, p: heroPoints(e) }), 'dim', 1);
        row.add(lv);
        const room = rw - 4 - lv.width - 6;
        const chip = addChip(this, row, 0, 2, roleName(cls.role), roleColor(cls.role), Math.max(20, Math.min(70, room - 40)));
        const nameW = room - chip - 4;
        if (nameW >= 20) row.add(addText(this, chip + 4, 3, ellipsize(className(e), nameW), 'ink'));
      },
    });
    c.once('destroy', () => list.destroy());
    const half = Math.floor((inner - SIZE.gap) / 2);
    c.add(new Button(this, x + 8, by, half, SIZE.btnH, { label: t('common.close'), onClick: () => m.close() }));
    const locked = n > p.ladder.cleared + 1;
    const problem = teamProblem(this.teamHeroes(p, 'ladder'), f.budget);
    const b = new Button(this, x + 8 + half + SIZE.gap, by, inner - half - SIZE.gap, SIZE.btnH, { label: t('duels.fight'), icon: 'swords', variant: 'primary', id: 'duel.floorFight', onClick: () => (m.close(), void this.fight(n)) });
    const why = locked ? t('duels.floorLocked', { n: n - 1 }) : problem ? t(`duels.why.${problem}` as TKey, { n: f.budget }) : undefined;
    b.setEnabled(!why, why);
    c.add(b);
  }

  private async fight(n: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.hold(true);
    const visit = this.visit;
    let started = false;
    try {
      const tk = await this.src.ladderStart(n);
      // left meanwhile (Back, then maybe Duels again): no battle out of nowhere; the ticket resumes on the next tap
      if (!this.current(visit)) return;
      this.scene.start('Battle', { source: ladderSource(this.game, this.src, tk) });
      // the switch happens on the next frame: a second tap before it must not start a second battle
      started = true;
    } catch (e) {
      if (this.current(visit)) {
        hapticNotify('error');
        toast(this, errorText(e), 'bad');
      }
    } finally {
      if (!started) {
        this.busy = false;
        if (this.current(visit)) this.hold(false);
      }
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
    const visit = this.visit;
    try {
      const v = await this.src.season();
      if (!this.current(visit)) return;
      this.season = v;
      if (this.tab === 'ranked' && this.profile && this.st === 'ready' && !this.search && !this.found) this.buildBody();
      if (v.rewards.length && !this.rewardShown) this.openSeasonRewards(v);
    } catch {
      // the season line waits for the next load
    }
  }

  private buildRanked(p: DuelProfileView, keep: number): void {
    // a search or a found opponent take the whole page (the tabs wait)
    if (this.found) return this.buildFound(p, this.found);
    if (this.search) return this.buildSearch(p, this.search);
    const { cx, cw } = this;
    let y = this.pageTop;
    // the Arena's pages: one row of chips (not a second tab bar)
    const gap = SIZE.gap;
    const chw = Math.floor((cw - 2 * gap) / 3);
    ARENA_TABS.forEach((k, i) =>
      this.body.add(
        new Chip(this, cx + i * (chw + gap), y, i === 2 ? cw - 2 * (chw + gap) : chw, {
          label: t(`duels.arena.${k}` as TKey),
          icon: ARENA_ICONS[i],
          selected: this.arenaTab === k,
          id: `duel.arena.${k}`,
          onClick: () => this.openArena(k),
        }),
      ),
    );
    y += 26;
    if (!this.compact && this.arenaTab !== 'top') y = this.buildSeasonLine(cx, y, cw);
    if (this.arenaTab === 'raid') this.buildRaid(p, y, keep);
    else if (this.arenaTab === 'top') this.buildTop(y, keep);
    else this.buildLive(p, y);
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

  /** "October · 24d 5h left" and the best league of the season; returns the y below. */
  private buildSeasonLine(x: number, y: number, w: number): number {
    const s = this.season;
    this.body.add(addIcon(this, x + 1, y - 2, 'clock', 'D'));
    if (!s) {
      this.body.add(addText(this, x + 16, y, '...', 'dim'));
      return y + 14;
    }
    const peak = this.arenaTab === 'raid' ? s.async.peak : s.live.peak;
    const left = t('duels.seasonLeftShort', { month: t(`duels.month.${seasonMonth(s.season.id).month}` as TKey), t: leftText(s.season.end - Date.now()) });
    // the season best only when both fit whole (the time left matters more)
    const right = peak ? t('duels.seasonBest', { league: leagueName(peak) }) : '';
    const fits = right && 16 + measureText(left) + measureText(right) + 10 <= w;
    if (fits) this.body.add(addText(this, x + w - 2, y, right, 'dim', 1));
    this.body.add(addText(this, x + 16, y, ellipsize(left, w - 18), 'dim'));
    return y + 14;
  }

  /** A league's crest (the season reward art), or an hourglass during placements. */
  private addCrest(parent: Phaser.GameObjects.Container, x: number, y: number, size: number, league: League | null): void {
    if (league) {
      const cos = SEASON.rewards[league.id].cosmetic;
      parent.add(addCosmetic(this, x, y, cos, cos.startsWith('duel_banner') ? 'banner' : 'emblem', size));
      return;
    }
    parent.add(addPanel(this, x, y, size, size, 'slot'));
    parent.add(addIcon(this, x + size / 2 - 6, y + size / 2 - 6, 'hourglass', 'D'));
  }

  /**
   * The league card of a ladder (live or raids): crest, league (or
   * placements), won and lost, what a match pays (or the placement bar).
   * Returns its height.
   */
  private buildLeagueCard(x: number, y: number, w: number, v: { league: League | null; rating: number | null; placements: { played: number; of: number }; wins: number; losses: number; pay: string; right?: { text: string; font: FontKey } } | null): number {
    const B = this.body;
    const compact = this.compact;
    const h = compact ? 40 : 52;
    B.add(addPanel(this, x, y, w, h, 'inset'));
    const cs = compact ? 28 : 36;
    this.addCrest(B, x + 8, y + Math.round((h - cs) / 2), cs, v?.league ?? null);
    const tx = x + 8 + cs + 8;
    const tw = x + w - 6 - tx;
    const ly = compact ? [4, 16, 28] : [6, 21, 37];
    if (!v) {
      B.add(addText(this, tx, y + ly[0], '...', 'dim'));
      return h;
    }
    let rw = 0;
    if (v.right) {
      const rt = addText(this, x + w - 6, y + ly[0] + 1, v.right.text, v.right.font, 1);
      B.add(rt);
      rw = rt.width + 6;
    }
    const l = v.league;
    const title = l ? (l.id === 'legend' && v.rating !== null ? t('duels.legendRating', { n: v.rating }) : leagueName(l)) : t('duels.placements', { n: v.placements.played, max: v.placements.of });
    B.add(addText(this, tx, y + ly[0], fitHead(title, tw - rw), 'head'));
    addNumbers(this, B, tx, y + ly[1], tw, [
      { icon: 'swords', value: `${v.wins}`, word: t('duels.num.won') },
      { icon: 'skull', value: `${v.losses}`, word: t('duels.num.lost') },
    ]);
    if (!l) B.add(new Meter(this, tx, y + ly[2] + 2, tw, 3, COLOR.xp).setValue(v.placements.played, v.placements.of));
    else B.add(addText(this, tx, y + ly[2], ellipsize(v.pay, tw), 'dim'));
    return h;
  }

  /** An inset card with an icon, a line and wrapped dim lines (lock, cooldown, a match to rejoin); returns its height (0: no room). */
  private infoCard(x: number, y: number, w: number, maxH: number, icon: string, line: string, font: FontKey, hint: string, meter?: [number, number]): number {
    const tw = w - 28;
    const head = wrapText(line, tw, 2);
    const meterH = meter ? 7 : 0;
    const fixed = 6 + head.lines.length * LINE_H + meterH + 4;
    if (fixed > maxH) return 0;
    const wr = wrapText(hint, tw, Math.max(1, Math.min(3, Math.floor((maxH - fixed) / LINE_H))));
    const hintLines = fixed + LINE_H <= maxH ? wr.lines : [];
    const h = fixed + hintLines.length * LINE_H;
    const B = this.body;
    B.add(addPanel(this, x, y, w, h, 'inset'));
    B.add(addIcon(this, x + 6, y + 5, icon, 'D'));
    let ty = y + 6;
    B.add(addText(this, x + 22, ty, head.lines.join('\n'), font));
    ty += head.lines.length * LINE_H;
    if (meter) {
      B.add(new Meter(this, x + 22, ty + 1, tw, 3, COLOR.xp).setValue(meter[0], meter[1]));
      ty += meterH;
    }
    if (hintLines.length) B.add(addText(this, x + 22, ty, hintLines.join('\n'), 'dim'));
    return h;
  }

  private buildLive(p: DuelProfileView, y: number): void {
    const { cx, cw } = this;
    const r = this.ranked;
    const B = this.body;
    const now = Date.now();
    const team = this.teamHeroes(p, 'arena');
    const problem = teamProblem(team, DUEL_RULES.budget);
    const cooldown = r && r.cooldownUntil > now ? r.cooldownUntil : 0;
    const locked = !!r && !r.unlocked;
    const match = r?.match ?? null;
    const why = this.entering ? t('duel.preparing') : cooldown ? t('duels.unq.cooldown') : problem ? t(`duels.why.${problem}` as TKey, { n: DUEL_RULES.budget }) : !r ? t('duels.unq.error') : undefined;
    const sentence = match
      ? t('duels.sit.rejoin')
      : cooldown
        ? t('duels.sit.cooldown', { t: clockText(cooldown - now) })
        : problem === 'over_budget'
          ? t('duels.sit.arenaOver', { n: DUEL_RULES.budget })
          : problem
            ? t(`duels.why.${problem}` as TKey, { n: DUEL_RULES.budget })
            : locked && r
              ? t('duels.sit.liveLocked', { n: r.unlockLevel, l: p.level })
              : t('duels.sit.live');
    const main: StripSlot = match
      ? { label: t('duels.rejoin'), icon: 'swords', id: 'duel.rejoin', off: this.entering ? t('duel.preparing') : undefined, onClick: () => this.enterMatch(match.id, match.mode) }
      : { label: t('duels.findMatch'), icon: 'swords', id: 'duel.findRanked', off: why ?? (locked && r ? t('duels.rankedLocked', { n: r.unlockLevel }) : undefined), onClick: () => this.findMatch('ranked') };
    // locked: the card under the league says why (no second line over the strip)
    this.chrome(sentence, { main, right: this.teamSlot(), why: locked && !why && !match ? '' : undefined }, { urgent: !!match || !!cooldown || !!problem, team });
    const bottom = this.bottom;
    y += this.buildLeagueCard(cx, y, cw, r ? { league: r.league, rating: r.rating, placements: r.placements, wins: r.wins, losses: r.losses, pay: t('duels.payRanked', { w: RANKED.glory.ranked.win, l: RANKED.glory.ranked.loss }) } : null) + 6;
    if (match) {
      this.infoCard(cx, y, cw, bottom - y, 'swords', t('duels.matchOn'), 'ink', t('duels.rejoinHint'));
      return;
    }
    if (cooldown) {
      const h = this.infoCard(cx, y, cw, bottom - y - 30, 'hourglass', t('duels.cooldown', { t: clockText(cooldown - now) }), 'red', t('duels.cooldownHint'));
      if (h) y += h + 6;
    } else if (locked && r) {
      const lp = levelProgress(p.xp);
      const h = this.infoCard(cx, y, cw, bottom - y - 30, 'shield', t('duels.rankedLocked', { n: r.unlockLevel }), 'ink', t('duels.lockedProgress', { l: lp.level, n: r.unlockLevel }), [Math.min(lp.level, r.unlockLevel), r.unlockLevel]);
      if (h) y += h + 6;
    }
    // unranked: try a build, Glory without rating
    if (y + SIZE.btnH > bottom) return;
    const un = new Button(this, cx, y, cw, SIZE.btnH, { label: t('duels.unrankedLong', { w: RANKED.glory.unranked.win }), icon: 'swords', id: 'duel.findUnranked', onClick: () => this.findMatch('unranked') });
    un.setEnabled(!why, why);
    B.add(un);
    y += SIZE.btnH + 6;
    // the arena team (which saved team fights here)
    if (y + 26 > bottom) return;
    B.add(
      new ListRow(this, cx, y, cw, {
        label: t('duels.arenaTeam', { team: this.loadoutName(p, p.use.arena) }),
        sub: t('duels.teamSub', { n: team.length, max: DUEL_RULES.teamMax, pts: teamPoints(team), b: DUEL_RULES.budget }),
        icon: 'people',
        id: 'duel.arenaTeam',
        onClick: () => this.openUses(),
      }),
    );
  }

  private searchSentence(s: { mode: DuelMode; since: number }): string {
    return t(`duels.sit.searching.${s.mode}` as TKey, { t: clockText(Date.now() - s.since) });
  }

  private buildSearch(p: DuelProfileView, s: { mode: DuelMode; since: number }): void {
    this.chrome(this.searchSentence(s), {
      left: { ...this.backSlot(), off: t('duels.why.searching') },
      main: { label: t('common.cancel'), icon: 'close', secondary: true, id: 'duel.cancelSearch', onClick: () => this.cancelSearch() },
    }, { team: this.teamHeroes(p, 'arena') });
    const B = this.body;
    const { cx, cw } = this;
    const mid = cx + cw / 2;
    const bottom = this.bottom;
    let y = this.pageTop + 8;
    B.add(addText(this, mid, y, fitHead(t(`duels.searchMode.${s.mode}` as TKey), cw - 8), 'head', 0.5));
    y += 16;
    const big = bottom - y >= 130 ? 3 : 2;
    const glass = scaleIcon(addIcon(this, mid, y + 6 * big, 'hourglass'), big).setOrigin(0.5, 0.5);
    B.add(glass);
    this.tweens.add({ targets: glass, angle: { from: 0, to: 180 }, duration: 800, yoyo: true, repeat: -1, repeatDelay: 300, ease: 'Sine.easeInOut' });
    y += 12 * big + 6;
    this.searchText = addText(this, mid, y, t('duels.searching', { t: clockText(Date.now() - s.since) }), 'title', 0.5).setScale(1.5);
    B.add(this.searchText);
    y += 18;
    const lines = Math.min(3, Math.floor((bottom - y) / LINE_H));
    if (lines > 0) {
      const wr = wrapText(t('duels.searchHint'), cw - 16, lines);
      B.add(addText(this, mid, y, wr.lines.join('\n'), 'dim', 0.5).setCenterAlign());
      y += wr.lines.length * LINE_H + 8;
    }
    // your league under it (the page is not empty while you wait)
    const r = this.ranked;
    if (s.mode === 'ranked' && r && y + (this.compact ? 40 : 52) <= bottom) {
      const n = B.list.length;
      this.buildLeagueCard(cx, y, cw, { league: r.league, rating: r.rating, placements: r.placements, wins: r.wins, losses: r.losses, pay: t('duels.payRanked', { w: RANKED.glory.ranked.win, l: RANKED.glory.ranked.loss }) });
      for (const o of B.list.slice(n)) (o as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0.7);
    }
  }

  private buildFound(p: DuelProfileView, f: { name: string; league: League | null }): void {
    this.chrome(t('duels.sit.found', { name: f.name }), {
      left: null,
      main: { label: t('duel.preparing'), secondary: true, off: t('duel.preparing'), id: 'duel.preparing' },
      why: '',
    }, { team: this.teamHeroes(p, 'arena') });
    const B = this.body;
    const { cx, cw } = this;
    const y = this.pageTop + 8;
    const cs = this.compact ? 28 : 36;
    const ch = Math.min(this.bottom - y, cs + 60);
    B.add(addPanel(this, cx, y, cw, ch, 'slotSel'));
    const mid = cx + cw / 2;
    const sides: [number, string, League | null][] = [
      [cx + cw / 4, t('duels.board.you'), this.ranked?.league ?? null],
      [cx + (cw * 3) / 4, f.name, f.league],
    ];
    for (const [sx, name, league] of sides) {
      this.addCrest(B, Math.round(sx - cs / 2), y + 8, cs, league);
      B.add(addText(this, sx, y + 12 + cs, ellipsize(name, cw / 2 - 8), 'ink', 0.5));
      if (league) {
        // centred on the column: measure first (the chip sizes itself to its word)
        const label = leagueName(league);
        const lw = Math.min(cw / 2 - 8, measureText(label, true) + 6);
        addChip(this, B, Math.round(sx - lw / 2), y + 24 + cs, label, LEAGUE_COLOR[league.id], lw);
      }
    }
    B.add(addText(this, mid, y + 8 + cs / 2 - 4, 'vs', 'head', 0.5));
    const prep = addText(this, mid, y + ch - 13, ellipsize(t('duel.preparing'), cw - 12), 'dim', 0.5);
    B.add(prep);
    this.tweens.add({ targets: prep, alpha: { from: 1, to: 0.4 }, duration: 700, yoyo: true, repeat: -1 });
  }

  private tickSearch(): void {
    if (this.search && this.searchText?.active) {
      this.searchText.setText(t('duels.searching', { t: clockText(Date.now() - this.search.since) }));
      this.say(this.searchSentence(this.search));
    }
    // a running cooldown counts down on the card
    // (only the Live page shows it: rebuilding Raids or Top every second would reset their lists)
    if (!this.search && !this.found && this.tab === 'ranked' && this.arenaTab === 'live' && this.ranked?.cooldownUntil && this.profile && this.st === 'ready') {
      if (this.ranked.cooldownUntil <= Date.now()) this.ranked.cooldownUntil = 0;
      this.buildBody();
    }
  }

  /** Joins a queue: the card shows the search until a match is found or the server refuses. */
  findMatch(mode: DuelMode): void {
    if (this.search || this.found || this.entering) return;
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
    if (!this.sys.isActive()) return;
    if (e.type === 'match_found') {
      // also right after Cancel: the server was already pairing, and a match never joined is abandoned
      if (this.found || this.entering) return;
      this.search = null;
      if (!e.opponent.name) return this.enterMatch(e.match, e.mode); // a live match to rejoin
      this.found = { match: e.match, mode: e.mode, name: e.opponent.name, league: e.opponent.league };
      this.tab = 'ranked';
      this.arenaTab = 'live';
      hapticNotify('success');
      this.buildBody();
      this.holdFound(this.found);
    } else if (this.search && (e.type === 'unqueued' || e.type === 'error')) {
      this.search = null;
      if (e.type === 'error' || e.reason !== 'cancelled') {
        hapticNotify('error');
        toast(this, e.type === 'error' ? e.message : t(`duels.unq.${e.reason}` as TKey), 'bad', 3000);
      }
      this.buildBody();
      void this.loadRanked();
    }
  }

  /** The found opponent shows for foundHoldMs, then the battle. */
  private holdFound(f: NonNullable<DuelScene['found']>): void {
    this.time.delayedCall(this.foundHoldMs, () => this.found === f && this.enterMatch(f.match, f.mode));
  }

  /**
   * Into the match's battle: the live socket, or the demo's local battle
   * against the bot. While the socket opens the found card stays and Find
   * match / Rejoin are off (a second tap would open the match twice).
   */
  enterMatch(id: string, mode: DuelMode): void {
    if (this.src instanceof DemoDuelSource) {
      this.found = null;
      const m = this.src.demoMatch(id);
      if (!m) return this.buildBody();
      this.scene.start('Battle', { source: demoMatchSource(this.game, this.src, m) });
      return;
    }
    if (this.entering) return;
    this.entering = id;
    if (this.profile && this.st === 'ready') this.buildBody();
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

  private buildRaid(p: DuelProfileView, y: number, keep: number): void {
    const { cx, cw } = this;
    const B = this.body;
    const compact = this.compact;
    const a = this.asyncView;
    const team = this.teamHeroes(p, 'arena');
    const problem = teamProblem(team, DUEL_RULES.budget);
    const cands = a?.candidates ?? [];
    // the middle candidate by default (the server sorts them easier, closest, harder)
    if (cands.length && !cands.some((c) => c.pid === this.raidPick)) this.raidPick = cands[Math.floor(cands.length / 2)].pid;
    const pick = cands.find((c) => c.pid === this.raidPick) ?? null;
    const why = !a
      ? undefined
      : !a.unlocked
        ? t('duels.raid.locked', { n: a.unlockLevel })
        : a.attacks.left <= 0
          ? t('duels.raid.capped')
          : problem
            ? t(`duels.why.${problem}` as TKey, { n: DUEL_RULES.budget })
            : !pick
              ? t('duels.why.noCandidates')
              : undefined;
    const sentence = !a
      ? t('duels.sit.loading')
      : !a.unlocked
        ? t('duels.sit.raidLocked', { n: a.unlockLevel, l: p.level })
        : !a.defence
          ? t('duels.sit.raidNoDefence')
          : a.attacks.left <= 0
            ? t('duels.sit.raidCapped')
            : t('duels.sit.raid', { n: a.attacks.left, max: a.attacks.cap });
    this.chrome(
      sentence,
      {
        main: a ? { label: pick && this.m.VW >= 170 ? t('duels.raid.go', { name: pick.name }) : t('duels.raid.attack'), icon: 'swords', id: 'duel.raid.attack', off: why, onClick: () => pick && void this.raid(pick.pid) } : null,
        right: { label: t('duels.raid.log'), icon: 'eye', id: 'duel.raid.log', onClick: () => void this.openRaidLog() },
      },
      { urgent: !!a && a.unlocked && !a.defence, team },
    );
    const bottom = this.bottom;
    const left = a ? t('duels.raid.leftLong', { n: a.attacks.left, max: a.attacks.cap }) : '';
    // the raid card (short screens: its league and raids left move into the defence row)
    if (!compact || !a) {
      y += this.buildLeagueCard(cx, y, cw, a ? { league: a.league, rating: a.rating, placements: a.placements, wins: a.wins, losses: a.losses, pay: t('duels.payRaid', { w: ASYNC.glory.win, l: ASYNC.glory.loss }), right: { text: left, font: a.attacks.left > 0 ? 'ink' : 'red' } } : null) + 4;
    }
    if (!a) return;
    const def = a.defence;
    const title = a.league ? (a.league.id === 'legend' && a.rating !== null ? t('duels.legendRating', { n: a.rating }) : leagueName(a.league)) : t('duels.placements', { n: a.placements.played, max: a.placements.of });
    const defSub = compact
      ? `${title} · ${left}`
      : def
        ? t('duels.raid.defSub', { n: def.heroes, pts: def.points, w: a.defenceWins, d: a.defences })
        : t('duels.raid.noDefenceSub');
    B.add(
      new ListRow(this, cx, y, cw, {
        label: def ? t('duels.raid.defence', { team: this.loadoutName(p, p.use.defence) }) : t('duels.raid.noDefence'),
        sub: defSub,
        icon: 'shield',
        primary: !def,
        id: 'duel.raid.defence',
        onClick: () => this.openDefence(),
      }),
    );
    y += 26 + 6;
    const empty = !a.unlocked
      ? { icon: 'shield', title: t('duels.raid.locked', { n: a.unlockLevel }), hint: t('duels.raid.lockedHint') }
      : a.attacks.left <= 0
        ? { icon: 'hourglass', title: t('duels.raid.capped'), hint: t('duels.raid.cappedHint') }
        : !cands.length
          ? { icon: 'flag', title: t('duels.raid.none'), hint: t('duels.raid.noneHint') }
          : null;
    if (empty) {
      if (bottom - y >= 24) B.add(addEmptyState(this, cx, y, cw, bottom - y, empty));
      return;
    }
    if (!compact && bottom - y >= 12 + 30) {
      B.add(addText(this, cx + 2, y, fitHead(t('duels.raid.pick'), cw - 4), 'head'));
      y += 13;
    }
    const tiers = cands.length === 3 ? (['lo', 'eq', 'hi'] as const) : null;
    this.list = new ScrollList(this, B, cx, y, cw, wholeRows(bottom - y, 30), {
      count: cands.length,
      rowH: 30,
      render: (i, row, rw) => {
        const c = cands[i];
        const w = rw - 3;
        row.add(addPanel(this, 0, 0, w, 27, c.pid === this.raidPick ? 'slotSel' : 'button'));
        let tw = 0;
        if (tiers) {
          const tt = addText(this, w - 6, 4, t(`duels.raid.tier.${tiers[i]}` as TKey), 'dim', 1);
          row.add(tt);
          tw = tt.width + 6;
        }
        row.add(addText(this, 6, 4, ellipsize(c.name, w - 12 - tw), 'ink'));
        const league = c.league ? (c.league.id === 'legend' && c.rating !== null ? `${c.rating}` : leagueName(c.league)) : null;
        const sub = league ? t('duels.raid.foeLong', { league, n: c.heroes, pts: c.points }) : t('duels.raid.foe', { n: c.heroes, pts: c.points });
        row.add(addText(this, 6, 15, ellipsize(sub, w - 12), 'dim'));
      },
      onTap: (i) => {
        this.raidPick = cands[i].pid;
        this.buildBody();
      },
      id: () => 'duel.raid.pick',
    });
    this.list.area.setScroll(keep);
  }

  /** Starts a raid on a defender: the battle scene, then the report and back to Raids. */
  async raid(defender: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.hold(true);
    const visit = this.visit;
    let started = false;
    try {
      const tk = await this.src.asyncStart(defender);
      if (!this.current(visit)) return;
      this.scene.start('Battle', { source: raidSource(this.game, this.src, tk) });
      started = true;
    } catch (e) {
      if (this.current(visit)) {
        hapticNotify('error');
        toast(this, errorText(e), 'bad');
        void this.loadAsync();
      }
    } finally {
      if (!started) {
        this.busy = false;
        if (this.current(visit)) this.hold(false);
      }
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
    // the hint gets the lines the teams and Close leave (short screens: fewer, or none)
    const fixed = 26 + 6 + 3 * (rowH + SIZE.gap) + SIZE.btnH + 14;
    const hintLines = Math.max(0, Math.min(3, Math.floor((VH - 12 - fixed) / LINE_H)));
    const wr = hintLines ? wrapText(t('duels.def.hint', { n: DUEL_RULES.budget }), inner, hintLines) : { lines: [] as string[] };
    const m = openModal(this, { title: t('duels.def.title'), w, h: Math.min(VH - 12, fixed + wr.lines.length * LINE_H) });
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
        inline: true,
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
    const visit = this.visit;
    if (!entries) {
      // a second tap while the log loads would open it twice
      if (this.logLoading) return;
      this.logLoading = true;
      try {
        entries = (await this.src.asyncLog()).entries;
      } catch (e) {
        if (this.current(visit)) toast(this, errorText(e), 'bad');
        return;
      } finally {
        this.logLoading = false;
      }
    }
    if (!this.current(visit)) return;
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
          const pw = rw - 3;
          row.add(addPanel(this, 0, 0, pw, rh - 2, e.role === 'defence' ? 'inset' : 'button'));
          row.add(addIcon(this, 3, 3, e.role === 'defence' ? 'shield' : 'swords'));
          const res = e.score === 1 ? t('duels.log.won') : e.score === 0.5 ? t('duels.log.draw') : t('duels.log.lost');
          const d = e.delta >= 0 ? `+${e.delta}` : `${e.delta}`;
          const rt = addText(this, pw - 4, 3, res, e.score === 1 ? 'good' : e.score === 0 ? 'red' : 'ink', 1);
          row.add(rt);
          const who = e.role === 'defence' ? t('duels.log.defence', { name: e.name }) : t('duels.log.attack', { name: e.name });
          row.add(addText(this, 17, 3, ellipsize(who, pw - 17 - rt.width - 8), 'ink'));
          const sub = [agoText(now - e.at), t('duels.log.delta', { d }), ...(e.glory ? [t('duels.note.glory', { n: e.glory })] : [])].join(' · ');
          row.add(addText(this, 17, 15, ellipsize(sub, pw - 21), 'dim'));
        },
      });
      c.once('destroy', () => sl.destroy());
    }
    c.add(new Button(this, x + 8, by, inner, SIZE.btnH, { label: t('common.close'), onClick: () => m.close() }));
  }

  // ------------------------------------------------------------------ leaderboards

  private buildTop(y: number, keep: number): void {
    const { cx, cw } = this;
    const B = this.body;
    this.chrome(t('duels.sit.top', { season: this.season ? seasonName(this.season.season.id) : '...' }), { right: this.teamSlot() });
    const bottom = this.bottom;
    // the board: one chip that cycles Live ladder > Raid ladder > Legend
    const next = BOARDS[(BOARDS.indexOf(this.board) + 1) % BOARDS.length];
    const label = t('duels.board.pick', { board: t(`duels.boardName.${this.board}` as TKey) });
    const chW = Math.min(cw, measureText(`${label} >`) + 14);
    B.add(
      new Chip(this, cx, y, chW, {
        label,
        chevron: true,
        id: `duel.board.${this.board}`,
        tip: t(`duels.boardName.${next}` as TKey),
        onClick: () => {
          this.board = next;
          this.boardView = null;
          void this.loadBoard();
          this.buildBody();
        },
      }),
    );
    const title = this.season?.title;
    const titleText = title ? t('duels.titleLine', { title: t('duels.titleOf', { league: leagueTitle(title.league), season: seasonName(title.season) }) }) : '';
    y += 26;
    if (titleText) {
      if (measureText(titleText) <= cw - chW - 10) B.add(addText(this, cx + cw - 2, y - 19, titleText, 'dim', 1));
      else if (bottom - y - 12 - 24 >= 5 * 24) {
        B.add(addText(this, cx + 2, y, ellipsize(titleText, cw - 4), 'dim'));
        y += 13;
      }
    }
    const v = this.boardView && this.boardView.board === this.board ? this.boardView : null;
    if (!v) {
      B.add(addText(this, cx + cw / 2, y + 8, '...', 'ink', 0.5));
      return;
    }
    const rowH = 22;
    const meH = v.me || this.board !== 'legend' ? rowH + 3 : 0;
    if (!v.rows.length) {
      const wr = wrapText(t('duels.board.empty'), cw - 8, 2);
      B.add(addText(this, cx + 4, y + 4, wr.lines.join('\n'), 'ink'));
    } else {
      this.list = new ScrollList(this, B, cx, y, cw, wholeRows(Math.max(rowH, bottom - meH - y), rowH), {
        count: v.rows.length,
        rowH,
        render: (i, row, rw) => this.boardRow(v.rows[i], row, rw - 3, false),
      });
      this.list.area.setScroll(keep);
    }
    if (meH) {
      const row = this.add.container(cx, bottom - rowH + 2);
      B.add(row);
      if (v.me) this.boardRow(v.me, row, cw - 6, true);
      else {
        row.add(addPanel(this, 0, 0, cw - 6, rowH - 2, 'inset'));
        row.add(addText(this, 6, 6, ellipsize(t('duels.board.notPlaced', { n: RANKED.placements }), cw - 18), 'dim'));
      }
    }
  }

  private boardRow(r: LeaderboardView['rows'][number], row: Phaser.GameObjects.Container, w: number, me: boolean): void {
    row.add(addPanel(this, 0, 0, w, 20, me ? 'slotSel' : 'inset'));
    row.add(addText(this, 24, 6, `#${r.rank}`, r.rank <= 3 ? 'gold' : 'ink', 1));
    let rw = 0;
    if (r.rating !== null) {
      const rt = addText(this, w - 6, 6, `${r.rating}`, 'ink', 1);
      row.add(rt);
      rw = rt.width + 6;
    } else rw = addChip(this, row, w - 4, 4, leagueName(r.league), LEAGUE_COLOR[r.league.id], Math.floor(w * 0.45), true) + 4;
    row.add(addText(this, 29, 6, ellipsize(me ? t('duels.board.you') : r.name, w - 29 - rw - 6), 'ink'));
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
      c.add(addPanel(this, x + 11, y + 7, 28, 28, 'slot'));
      c.add(addCosmetic(this, x + 12, y + 8, r.cosmetic, r.cosmetic.startsWith('duel_banner') ? 'banner' : 'emblem', 26));
      const tx = x + 43;
      const tw = x + 8 + inner - tx - 4;
      c.add(addText(this, tx, y + 4, fitHead(t('duels.reward.line', { ladder: t(`duels.board.${r.ladder}` as TKey), league: leagueTitle(r.league) }), tw), 'head'));
      c.add(addText(this, tx, y + 16, ellipsize(t('duels.note.glory', { n: r.glory }), tw), 'gold'));
      c.add(addText(this, tx, y + 28, ellipsize(tOr(`cosmetic.${r.cosmetic}`, r.cosmetic), tw), 'dim'));
      y += rowH + SIZE.gap;
    }
    if (best) c.add(addText(this, x + w / 2, y + 2, ellipsize(t('duels.titleLine', { title: t('duels.titleOf', { league: leagueTitle(best.league), season: seasonName(best.season) }) }), inner), 'dim', 0.5));
    c.add(new Button(this, x + 8, m.y + m.h - 8 - SIZE.btnH, inner, SIZE.btnH, { label: t('duels.reward.ok'), variant: 'primary', id: 'duel.reward.ok', onClick: () => m.close() }));
  }

  // ------------------------------------------------------------------ team

  private buildTeam(p: DuelProfileView, keep: number): void {
    const { cx, cw } = this;
    const B = this.body;
    const team = this.teamHeroes(p);
    const pts = teamPoints(team);
    const budget = DUEL_RULES.budget;
    const over = pts > budget;
    this.chrome(
      over ? t('duels.sit.teamOver', { n: pts - budget, b: budget }) : t('duels.sit.team'),
      {
        main: { label: t('duels.recruit'), icon: 'plus', id: 'duel.recruit', onClick: () => this.openRecruit() },
        right: { label: t('duels.dismiss'), icon: 'close', id: 'duel.dismiss', onClick: () => this.openDismiss() },
        extra: this.m.VW >= 150 ? { label: t('duels.usesShort'), icon: 'flag', id: 'duel.loadoutUses', onClick: () => this.openUses() } : null,
      },
      { urgent: over, team },
    );
    const bottom = this.bottom;
    let y = this.pageTop;
    // the saved teams: the selected one is edited below
    const slots = p.loadouts?.length ?? 1;
    const gap = SIZE.gap;
    const sw = Math.floor((cw - (slots - 1) * gap) / slots);
    for (let i = 0; i < slots; i++) {
      const slot = i + 1;
      B.add(
        new Chip(this, cx + i * (sw + gap), y, i === slots - 1 ? cw - i * (sw + gap) : sw, {
          label: this.loadoutName(p, slot),
          selected: p.loadout === slot,
          id: `duel.loadout.${slot}`,
          onClick: () => p.loadout !== slot && void this.act(() => this.src.loadout({ slot, edit: true })),
        }),
      );
    }
    y += 24;
    // where it fights (a tap: which team fights where), its points and the budget bar
    const uses = LOADOUT_USES.filter((u) => p.use?.[u] === p.loadout).map((u) => t(`duels.use.${u}` as TKey));
    const ptsT = addText(this, cx + cw - 2, y + 3, t('duels.points', { n: pts, max: budget }), over ? 'red' : 'ink', 1);
    B.add(ptsT);
    const usesT = addText(this, cx + 2, y + 3, ellipsize(uses.length ? t('duels.fightsOn', { uses: uses.join(', ') }) : t('duels.notUsed'), cw - ptsT.width - 10), 'dim');
    B.add(usesT);
    const z = this.add.zone(cx, y, Math.max(44, usesT.width + 8), 22).setOrigin(0, 0).setInteractive();
    uiId(z, 'duel.usesLine');
    tappable(z, null, () => this.openUses());
    B.add(z);
    B.add(new Meter(this, cx, y + 14, cw, 3, over ? COLOR.bad : COLOR.xp).setValue(Math.min(pts, budget), budget));
    y += 22;
    if (!this.compact) {
      B.add(addText(this, cx + 2, y, fitHead(t('duels.inTeam', { n: team.length, max: DUEL_RULES.teamMax }), cw - 4), 'head'));
      y += 13;
    } else y += 2;
    // team first (in team order), then the bench under its heading
    const bench = p.heroes.filter((x) => !p.team.includes(x.id));
    const rows: (Hero | string)[] = [...team, ...(bench.length ? [t('duels.benchHead', { n: bench.length })] : []), ...bench];
    if (!p.heroes.length) {
      B.add(addEmptyState(this, cx, y, cw, bottom - y, { icon: 'people', title: t('army.noHeroes'), hint: t('duels.recruitHint'), action: { label: t('duels.recruit'), icon: 'plus', onClick: () => this.openRecruit() } }));
      return;
    }
    this.list = new ScrollList(this, B, cx, y, cw, wholeRows(bottom - y, 32), {
      count: rows.length,
      rowH: 32,
      render: (i, row, rw) => {
        const r = rows[i];
        if (typeof r === 'string') {
          row.add(addText(this, 2, 16, fitHead(r, rw - 8), 'head'));
          row.add(this.add.rectangle(2, 27, rw - 7, 1, BRONZE.dark).setOrigin(0, 0));
          return;
        }
        this.heroRow(p, r, row, rw);
      },
    });
    this.list.area.setScroll(keep);
  }

  private heroRow(p: DuelProfileView, h: Hero, row: Phaser.GameObjects.Container, rw: number): void {
    const w = rw - 3; // the scrollbar's gutter
    const inTeam = p.team.includes(h.id);
    row.add(addPanel(this, 0, 0, w, 29, inTeam ? 'slotSel' : 'button'));
    const cls = heroClass(h);
    row.add(addPanel(this, 3, 3, 23, 23, 'slot'));
    row.add(addPortrait(this, dollFromHero(h), 3, 3));
    row.add(this.add.rectangle(4, 23, 21, 2, roleColor(cls.role)).setOrigin(0, 0));
    // narrow rows (landscape phones): a slimmer toggle, the points under the name
    const narrow = w < 160;
    const bw = narrow ? 24 : 32;
    const tog = new Button(this, w - bw - 3, 3, bw, 23, {
      icon: inTeam ? 'check' : 'plus',
      label: inTeam ? t('duels.bench') : t('duels.toTeam'),
      tip: inTeam ? t('duels.benchTip') : t('duels.toTeam'),
      iconOnly: true,
      style: inTeam ? 'buttonSel' : 'button',
      id: inTeam ? 'duel.bench' : 'duel.addToTeam',
      onClick: () => this.toggleTeam(p, h),
    });
    if (!inTeam && p.team.length >= DUEL_RULES.teamMax) tog.setEnabled(false, t('duels.why.too_many'));
    this.rowTap(() => this.list, row, w - bw - 3, 29, 'duel.heroRow', () => this.openHero(h.id));
    row.add(tog);
    const right = w - bw - 8;
    const x = 31;
    const plus = h.points > 0 ? 14 : 0;
    const ptsText = t('duels.pts', { n: heroPoints(h) });
    let ptsW = 0;
    if (!narrow) {
      const pts = addText(this, right, 5, ptsText, 'ink', 1);
      row.add(pts);
      addGroupBadge(this, row, right - pts.width - 16, 3, h.group);
      ptsW = pts.width + 20;
    }
    const name = addText(this, x, 5, ellipsize(h.name, right - ptsW - x - plus), 'ink');
    row.add(name);
    // unspent points: a gold marker after the name
    if (plus) addChip(this, row, x + name.width + 3, 4, '+', 0xd8a840, 20);
    const stars = w >= 220;
    const sub = narrow ? `${ptsText} · ${t('hero.level', { n: h.level })}` : `${t('hero.level', { n: h.level })} · ${className(h)}`;
    const subT = addText(this, x, 17, ellipsize(sub, right - x - (stars ? 43 : 0)), 'dim');
    row.add(subT);
    if (stars) addStars(this, row, right - 39, 19, heroStars(h));
  }

  /** Which saved team fights on the ladder, in the arena (live and raids) and defends. */
  openUses(): void {
    const p = this.profile;
    if (!p?.loadouts) return;
    const { VW, VH } = this.m;
    const w = Math.min(VW - 12, 210);
    const inner = w - 16;
    const rowH = 38;
    const empties = p.loadouts.filter((l) => !l.team.some((id) => p.heroes.some((h) => h.id === id)));
    const note = empties.length ? wrapText(empties.map((l) => t('duels.emptyTeam', { team: this.loadoutName(p, l.slot) })).join('. '), inner, 2) : null;
    // the note only where it fits above Close
    const noteH = note && 26 + LOADOUT_USES.length * rowH + note.lines.length * LINE_H + 4 + SIZE.btnH + 16 <= VH - 12 ? note.lines.length * LINE_H + 4 : 0;
    const m = openModal(this, { title: t('duels.usesTitle'), w, h: Math.min(VH - 12, 26 + LOADOUT_USES.length * rowH + noteH + SIZE.btnH + 16) });
    const { c, x } = m;
    let y = m.y + 24;
    const n = p.loadouts.length;
    const bw = Math.floor((inner - (n - 1) * SIZE.gap) / n);
    for (const u of LOADOUT_USES) {
      c.add(addText(this, x + 8, y, fitHead(t(`duels.use.${u}` as TKey), inner), 'head'));
      p.loadouts.forEach((l, i) => {
        const on = p.use[u] === l.slot;
        const heroes = l.team.map((id) => p.heroes.find((h) => h.id === id)).filter((h): h is Hero => !!h);
        const problem = u === 'defence' ? teamProblem(heroes, DUEL_RULES.budget) : heroes.length ? null : 'empty';
        const b = new Button(this, x + 8 + i * (bw + SIZE.gap), y + 11, i === n - 1 ? inner - (n - 1) * (bw + SIZE.gap) : bw, 22, {
          label: this.loadoutName(p, l.slot),
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
    if (note && noteH) c.add(addText(this, x + 8, y, note.lines.join('\n'), 'dim'));
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
    const w = Math.min(VW - 12, 220);
    const inner = w - 16;
    // narrow (landscape phones): the price button goes under the name
    const narrow = inner - 3 - 34 - 44 - 8 < 60;
    const rowH = narrow ? 50 : 34;
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
        const pw = rw - 3;
        row.add(addPanel(this, 0, 0, pw, rh - 2, locked ? 'inset' : 'button'));
        row.add(addPanel(this, 3, 3, 26, 26, 'slot'));
        row.add(addPortrait(this, dollFromHero(sample), 4, 4).setAlpha(locked ? 0.5 : 1));
        row.add(this.add.rectangle(4, 26, 24, 2, locked ? 0x5a4232 : roleColor(cls.role)).setOrigin(0, 0));
        const bw = 44;
        const why = locked ? t('duels.unlocksAt', { n: level }) : full ? t('duels.why.roster_full') : p.glory < price ? t('duels.noGlory') : undefined;
        const tx = 34;
        if (locked) {
          // what opens it, in place of the price
          row.add(addIcon(this, pw - 16, 4, 'shield', 'D'));
          row.add(addText(this, tx, 4, ellipsize(className(sample), pw - tx - 20), 'dim'));
          row.add(addText(this, tx, 17, ellipsize(t('duels.duelLevel', { n: level }), pw - tx - 6), 'dim'));
          this.rowTap(() => list, row, pw, rh - 2, 'duel.classCard', () => openClassCard(this, { hero: sample, title: className(sample) }));
          return;
        }
        const b = new Button(this, narrow ? tx : pw - bw - 3, narrow ? 24 : 4, bw, narrow ? 22 : 24, {
          label: `${price}`,
          icon: 'star',
          inline: true,
          id: 'duel.hire',
          tip: t('duels.hireTip', { name: className(sample), n: price }),
          onClick: () => (m.close(), void this.act(() => this.src.recruit(id), () => t('town.hired', { name: className(sample) }))),
        });
        b.setEnabled(!why, why);
        this.rowTap(() => list, row, narrow ? pw : pw - bw - 3, narrow ? 22 : rh - 2, 'duel.classCard', () => openClassCard(this, { hero: sample, title: className(sample) }));
        row.add(b);
        if (narrow) {
          row.add(addText(this, tx, 3, ellipsize(className(sample), pw - tx - 4), 'ink'));
          row.add(addText(this, tx, 13, ellipsize(t('duels.pts', { n: classPoints(id) }), pw - tx - 4), 'dim'));
          return;
        }
        const tw = pw - tx - bw - 8;
        // the full class name on top; its points and role under it
        row.add(addText(this, tx, 4, ellipsize(className(sample), tw), 'ink'));
        const ptsT = addText(this, tx, 18, t('duels.pts', { n: classPoints(id) }), 'dim');
        row.add(ptsT);
        addChip(this, row, tx + ptsT.width + 4, 16, roleName(cls.role), roleColor(cls.role), Math.max(20, tw - ptsT.width - 4));
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
    const w = Math.min(VW - 12, 220);
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
          const pw = rw - 3;
          row.add(addPanel(this, 0, 0, pw, rh, 'button'));
          row.add(addPortrait(this, dollFromHero(h), 2, 2));
          const bw = 50;
          const b = new Button(this, pw - bw - 3, 3, bw, 22, {
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
          row.add(addText(this, 30, 4, ellipsize(h.name, pw - 30 - bw - 8), 'ink'));
          row.add(addText(this, 30, 15, ellipsize(`${t('hero.level', { n: h.level })} · ${className(h)}`, pw - 30 - bw - 8), 'dim'));
        },
      });
      c.once('destroy', () => list.destroy());
    }
    c.add(new Button(this, x + 8, by, inner, SIZE.btnH, { label: t('common.close'), onClick: () => m.close() }));
  }

  // ------------------------------------------------------------------ shop

  private buildShop(p: DuelProfileView, keep: number): void {
    const { cx, cw } = this;
    const B = this.body;
    this.chrome(t(`duels.sit.${this.shopTab}` as TKey), { right: this.teamSlot() });
    const bottom = this.bottom;
    let y = this.pageTop;
    // Today | Gear | Sell: chips (not a second tab bar)
    const gap = SIZE.gap;
    const chw = Math.floor((cw - 2 * gap) / 3);
    SHOP_TABS.forEach((k, i) =>
      B.add(
        new Chip(this, cx + i * (chw + gap), y, i === 2 ? cw - 2 * (chw + gap) : chw, {
          label: t(`duels.shop.${k}` as TKey),
          selected: this.shopTab === k,
          id: `duel.shop.${k}`,
          onClick: () => {
            this.shopTab = k;
            this.buildBody();
          },
        }),
      ),
    );
    y += 26;
    if (this.shopTab === 'sell') {
      this.stash = new StashGrid(this, B, cx, y, cw, bottom - y, {
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
      // new offers at the next UTC midnight
      const day = 86_400_000;
      B.add(addIcon(this, cx + 1, y - 2, 'clock', 'D'));
      B.add(addText(this, cx + 16, y, ellipsize(t('duels.offersIn', { t: leftText(day - (Date.now() % day)) }), cw - 18), 'dim'));
      y += 14;
    } else {
      // slot chooser (icons; the slot's name on long-press), then that slot's items at every shop rarity
      const sw = Math.floor((cw - (SLOTS.length - 1) * gap) / SLOTS.length);
      const slotIcon = (s: Slot) => (s === 'weapon' ? 'sword' : s === 'trinket' ? 'ring' : s);
      if (sw < 22) {
        // too narrow for five targets: one chip that cycles the slot
        const nextSlot = SLOTS[(SLOTS.indexOf(this.gearSlot) + 1) % SLOTS.length];
        B.add(new Chip(this, cx, y, cw, { label: t(`slot.${this.gearSlot}` as TKey), icon: slotIcon(this.gearSlot), chevron: true, id: 'duel.slot.cycle', tip: t(`slot.${nextSlot}` as TKey), onClick: () => ((this.gearSlot = nextSlot), this.buildBody()) }));
      } else SLOTS.forEach((s, i) =>
        B.add(
          new Button(this, cx + i * (sw + gap), y, i === SLOTS.length - 1 ? cw - i * (sw + gap) : sw, 22, {
            icon: slotIcon(s),
            label: t(`slot.${s}` as TKey),
            iconOnly: true,
            style: this.gearSlot === s ? 'buttonSel' : 'button',
            id: `duel.slot.${s}`,
            onClick: () => ((this.gearSlot = s), this.buildBody()),
          }),
        ),
      );
      y += 26;
      offers = catalogue().filter((o) => itemDef(o.def).slot === this.gearSlot);
    }
    const daily = this.shopTab === 'offers';
    this.list = new ScrollList(this, B, cx, y, cw, wholeRows(bottom - y, 32), {
      count: offers.length,
      rowH: 32,
      render: (i, row, rw) => this.offerRow(p, offers[i], row, rw, daily),
      onTap: (i) => this.profile && this.openOffer(this.profile, offers[i]),
      id: () => 'duel.offerRow',
    });
    this.list.area.setScroll(keep);
  }

  /** An offer: the item in its rarity colour, its price as a tag (the card's Buy is the action). */
  private offerRow(p: DuelProfileView, o: ShopOffer, row: Phaser.GameObjects.Container, rw: number, daily: boolean): void {
    const it = sample(o);
    const sold = p.bought.includes(o.id);
    const w = rw - 3; // the scrollbar's gutter
    row.add(addPanel(this, 0, 0, w, 29, sold ? 'inset' : 'button'));
    row.add(new ItemIcon(this, 4, 3, { item: it }, { size: 24, tip: false }));
    row.add(addText(this, w - 5, 11, '>', 'dim', 1));
    const right = w - 14;
    const tag = addText(this, right, 11, sold ? t('duels.soldOut') : `${o.price}`, sold ? 'dim' : p.glory >= o.price ? 'gold' : 'red', 1);
    row.add(tag);
    row.add(addIcon(this, right - tag.width - 14, 9, sold ? 'check' : 'star', sold ? 'D' : ''));
    const left = right - tag.width - 18;
    const tx = 32;
    let chip = 0;
    if (daily && !sold) chip = addChip(this, row, left, 16, '-20%', COLOR.good, 40, true) + 4;
    row.add(addText(this, tx, 5, ellipsize(itemName(it), left - tx), rarityFont(o.rarity, true)));
    const label = `${tOr(`rarity.${o.rarity}`, RARITY_LABEL[o.rarity])} · ${t(`slot.${itemDef(o.def).slot}` as TKey)}`;
    row.add(addText(this, tx, 17, ellipsize(label, left - tx - chip), 'dim'));
  }

  private openOffer(p: DuelProfileView, o: ShopOffer): void {
    const sold = p.bought.includes(o.id);
    openItemCard(this, {
      item: sample(o),
      title: t('duels.shopItem'),
      worth: false,
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
      title: t('duels.shopItem'),
      worth: false,
      notes: [{ text: t('duels.sellFor', { n: price }), font: 'gold' }],
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

/**
 * Stops whatever runs and opens the duel hub (from the battle scene's
 * callbacks). These run outside the hub (timers, sockets, promises), so an
 * error here must not leave every scene stopped (a blank screen): the menu
 * opens instead.
 */
export function backToDuel(game: Phaser.Game, data: DuelSceneData): void {
  for (const sc of game.scene.getScenes(true)) game.scene.stop(sc.scene.key);
  try {
    game.scene.start('Duel', data);
  } catch (e) {
    console.error('[duel] the hub failed to open', e);
    game.scene.stop('Duel');
    game.scene.start('Menu');
  }
}

/** The report of a finished duel battle, then back to the hub; a report that cannot be shown goes straight back. */
export function reportThenHub(game: Phaser.Game, build: () => BattleReport, data: DuelSceneData): void {
  try {
    showReport(game, build(), () => backToDuel(game, data));
  } catch (e) {
    console.error('[duel] the report failed', e);
    backToDuel(game, { ...data, error: errorText(e) });
  }
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
        .then((r) => reportThenHub(game, () => ladderReport(r, this.label, src.demo), { tab: 'ladder', preview: src.demo, result: { glory: r.glory, won: r.won, floor: r.floor, first: r.firstClear } }))
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

/** The live match whose socket is opening (a second open would run two links on one match). */
let opening: string | null = null;

/** Opens the match socket and starts the battle (or shows the report of a match already over). */
export async function playLiveMatch(game: Phaser.Game, src: DuelSource, id: string, _mode: DuelMode): Promise<void> {
  if (opening === id) return;
  opening = id;
  const link = new MatchLink(id);
  try {
    const first = await link.open();
    if (!('type' in first)) {
      link.close();
      reportThenHub(game, () => rankedReport(first, t('battle.vs', { name: first.names[1 - first.side] })), { tab: 'ranked', arena: 'live', result: matchResult(first.glory, first.winner, first.side, first.end === 'void') });
      return;
    }
    for (const sc of game.scene.getScenes(true)) if (sc.scene.key !== 'Battle') game.scene.stop(sc.scene.key);
    game.scene.start('Battle', { source: matchSource(link, first, (o) => finishMatch(game, src, id, o)) });
  } catch {
    link.close();
    backToDuel(game, { tab: 'ranked', error: t('duels.live.unreachable') });
  } finally {
    opening = null;
  }
}

/** How often, and how far apart, a report still being settled is asked for again. */
const REPORT_TRIES = 5;
const REPORT_RETRY_MS = 2000;

/**
 * The battle is over: the settled report (asked for again if the socket
 * missed it; the server may still be settling, 409 match_live), then back to
 * the Ranked tab.
 */
export function finishMatch(game: Phaser.Game, src: DuelSource, id: string, o: MatchOutcome, tries = 1): void {
  const label = t('battle.vs', { name: o.names[1 - o.side] });
  const report = o.report;
  if (report) return reportThenHub(game, () => rankedReport(report, label), { tab: 'ranked', arena: 'live', result: matchResult(report.glory, report.winner, report.side, report.end === 'void') });
  src
    .matchReport(id)
    .then((r) => reportThenHub(game, () => rankedReport(r.report, label), { tab: 'ranked', arena: 'live', result: matchResult(r.report.glory, r.report.winner, r.report.side, r.report.end === 'void') }))
    .catch((e) => {
      if ((e as { code?: string } | null)?.code === 'match_live' && tries < REPORT_TRIES) {
        setTimeout(() => finishMatch(game, src, id, o, tries + 1), REPORT_RETRY_MS);
        return;
      }
      backToDuel(game, { tab: 'ranked', arena: 'live', error: errorText(e) });
    });
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
      const label = this.label;
      const r = src.demoSettle(m.id, sim.result());
      reportThenHub(game, () => rankedReport(r, label, true), { tab: 'ranked', preview: true, result: matchResult(r.glory, r.winner, r.side, r.end === 'void') });
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
        .then((r) => reportThenHub(game, () => raidReport(r.report, src.demo), { tab: 'ranked', arena: 'raid', preview: src.demo, result: matchResult(r.report.glory, r.report.winner, 0) }))
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
