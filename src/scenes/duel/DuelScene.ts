/**
 * The duel hub (docs/DUELS.md, docs/UI_KIT.md "Duels"), in the v4 "Mosaic &
 * Parchment" language (docs/redesign/V4_SPEC.md, mockup A2): the Duels mode
 * hub, the persistent duel army, its Glory and account level on a header row,
 * two game modes on a switch and two places of their own behind the header's
 * buttons.
 *
 * - **Ladder**: the next floor (Fight, the one terracotta button above the tab
 *   bar), then the 50 floors in 5 chapters of 10 (stars per floor, the boss
 *   last, chapter chests at 10 / 20 / 30 stars); a cleared floor is a replay
 *   for farm Glory.
 * - **Arena**: the season line, then a card per mode: Live PvP (league,
 *   placements, Find match and Unranked; the search and the opponent found
 *   take the page) and Raids (the async ladder: raids left, the defence team,
 *   Raid opens the defender picks). Each card's trophy opens its leaderboard.
 * - **Team** (header button, badged when a fighting hero has points or a perk to
 *   spend): the presets (up to five; rename, duplicate, delete, what each
 *   fights on), the point budget, the heroes (a tap: the hero sheet), recruit
 *   and dismiss.
 * - **Shop** (header button): today's offers, the gear catalogue, selling; each
 *   offer is a card with its main stats against what the team wears.
 *
 * The two modes are the hub (tab bar, no back arrow). Team, Shop, Raids, a
 * leaderboard, the search and the opponent found are sub-screens: a back
 * arrow to where the player came from and no tab bar. A season's rewards show
 * in a popup on the first visit after it ended. Every change is a request to
 * the duel source; the screen redraws from the answer. Started with `{ preview:
 * true }` it runs on the in-memory demo.
 */
import { SETS, setPieces } from '../../data/sets';
import Phaser from 'phaser';
import { BaseScene } from '../BaseScene';
import { ScrollArea, addIcon, fitCinzel, scaleIcon, tappable } from '../../ui/kit';
import { addModeBanner } from '../../ui/modeArt';
import { DragDrop, className, defaultStashState, itemName, openClassCard, openItemCard, roleName, type StashState } from '../../ui/sheet';
import { ItemIcon, confirmDialog, showTooltip, toast } from '../../ui/widgets';
import { LINE_H, ellipsize, measureText, wrapText } from '../../ui/textfit';
import { uiId } from '../../ui/layout';
import { ensureFonts } from '../../ui/fonts';
import { MODE_ICON, MOSAIC, RESOURCES, SPACE, TEXT_MIN } from '../../ui/tokens';
import { uiCoin } from '../../audio/hooks';
import { motion } from '../../ui/motion';
import { addChestSprite } from '../../art/menuSprites';
import {
  MBar, MButton, MIconButton, MStashGrid, FrescoBanner, addRarityPill, rarityInk, ParchmentCard, SECTION_TITLE_H, SectionTitle, SegmentedSwitch, MChip, addHubShell, addSubShell, addTipLine, mosaicImage, mtext, mw, openParchmentSheet, sheetActionsH, SHEET_TITLE_H,
  MBadge, TAP, buttonLabelSizes, type MButtonOpts,
} from '../../ui/mosaic';
import { ARMY_ROW_H, addGroupDisc, addRosterRow, armyPill, armyPillW, pendingPoints, type ArmySource } from '../../ui/army';
import { FRESCO_H, headerLayout, ladderArrival, ladderNotes, showChestTip, showFresco } from './hubLayout';
import { fmtCount, localDecimals } from '../../i18n/numbers';
import { hapticNotify } from '../../platform/telegram';
import { RARITY_LABEL, SLOTS, isBound, itemDef, normalizeEquip, normalizeItem, type Item, type Slot } from '../../data/items';
import type { Hero } from '../../data/units';
import { CLASSES } from '../../data/classes';
import { heroClass } from '../../sim/stats';
import { econState, type EconState } from '../../game/economy';
import { heroNeedsAttention } from '../../game/gear';
import { lastBattle, type BattleReport } from '../../game/report';
import type { BattleSource } from '../../online/battleSource';
import type { Battle } from '../../sim/battle';
import { apiErrorText, errorText } from '../../online/client';
import {
  DUEL_CLASSES, DUEL_RULES, catalogue, classPoints, cleanPresetName, dailyOffers, deltaParts, duelRecruit, heroPoints, levelProgress, offerSummary, recruitPrice, sellPrice, teamPoints, teamProblem,
  type ShopOffer,
} from '../../duel/rules';
import { CHAPTERS, CHEST_TIERS, LADDER, chapterFloors, chapterMaxStars, chapterOf, chapterStars, chestReward, chestState, isBoss, ladderFloor, type ChestState } from '../../duel/ladder';
import {
  DemoDuelSource, LOADOUT_USES, duelSource, type AsyncTicket, type AsyncView, type AsyncLogEntry, type Board, type ChestClaim, type DemoMatch, type DuelProfileView, type DuelSource,
  type LadderReport, type LadderTicket, type LeaderboardView, type Loadout, type LoadoutUse, type QueueEvent, type RankedView, type SeasonRewardView, type SeasonView,
} from '../../duel/client';
import { RANKED, divisionRoman, leagueRank, type DuelMode, type League, type LeagueId } from '../../duel/rating';
import type { AsyncReport, MatchReport } from '../../duel/protocol';
import { ASYNC, seasonMonth } from '../../duel/season';
import { addCosmetic } from '../../ui/econ/textures';
import { MatchLink, forgetMatch, matchSource, rememberMatch, type MatchOutcome } from '../../duel/match';
import { DuelHeroSource } from '../../duel/heroSource';
import { showReport } from '../ResultsScene';
import { buildReport, resultFor } from '../../game/report';
import { attackSubmission } from '../../online/battle';
import { makeItem } from '../../game/heroes';
import { Rng } from '../../sim/rng';
import { promptFields } from '../online/textInput';
import { ensureDuelIcons } from './duelIcons';
import {
  CHEST_H, CHEST_W, ChestSlot, FLOOR_H, FloorTile, PRESET_H, PresetChip, addCrest, addCrispIcon, addLeaguePill, addFace, addFocusRing, addLockedCard, addRankMedal, drawArrow, drawChevron, drawStars,
  inlineNumbers, ptext, pw, pwrap, type PFont,
} from './duelParts';
import { t, tOr, type TKey } from '../../i18n';
import { demoName, heroName } from '../../i18n/names';
import { fmtAgoText, fmtClock, fmtSigned } from '../../util/format';

/** The hub's views: the two game modes and the two places behind the header's buttons. */
export type DuelTab = 'ladder' | 'ranked' | 'team' | 'shop';
/** The game modes on the switch (Team and Shop go back to the last one). */
export type HubMode = 'ladder' | 'ranked';
type ShopTab = 'offers' | 'gear' | 'sell';
/** The Arena's views: the two mode cards, the defender picks of a raid, a leaderboard. */
export type ArenaTab = 'home' | 'raid' | 'board';

export interface DuelSceneData {
  tab?: DuelTab;
  /** Where Team and Shop go back to (default: the last mode). */
  mode?: HubMode;
  shop?: ShopTab;
  /** Run on the in-memory demo (layout check, previews). */
  preview?: boolean;
  /** A message to show on arrival (a failed battle report...). */
  error?: string;
  /** Previews: the demo account's duel XP (0: below the ranked gate). */
  demoXp?: number;
  arena?: ArenaTab;
  /** The leaderboard of the board view. */
  board?: Board;
  /**
   * What the battle just played paid (a toast on arrival; `floor`: a ladder
   * floor, `first`: its first clear, `stars` / `newBest`: the stars it earned
   * and whether they beat the floor's best).
   */
  result?: { glory: number; won: boolean; draw?: boolean; floor?: number; first?: boolean; stars?: number; newBest?: boolean; expired?: boolean };
  /** Boot after a reload: go straight back into this live match (or show its report). */
  rejoin?: { id: string; mode: DuelMode };
}

/**
 * Back is ignored this long after the hub opens: the Back (or a second tap)
 * that left the report or the hero sheet must not also leave the hub for the
 * menu.
 */
const BACK_GUARD_MS = 600;
const MODES: HubMode[] = ['ladder', 'ranked'];
const MODE_ICONS = [MODE_ICON.ladder, MODE_ICON.arena];
const USE_ICONS: Record<LoadoutUse, string> = { ladder: MODE_ICON.ladder, arena: MODE_ICON.arena, defence: MODE_ICON.defence };
/** Gap between neighbours on the page, UI px. */
const GAP = 3;
/** Height of the hub's one fixed action (Fight floor / Recruit / Raid / Cancel), UI px. */
const MAIN_H = 30;
/** The sheet's room for its title and the padding under its body, UI px (see ParchmentSheet). */
const SHEET_PAD = SHEET_TITLE_H + SPACE.sm;

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

const SHOP_TABS: ShopTab[] = ['offers', 'gear', 'sell'];
/** Height of an offer card (name, rarity, compare line, three stats, Buy). */
const OFFER_H = 104;

/** The pay of a finished match or raid, for the toast on the way back (`side`: the player's). */
function matchResult(glory: number, winner: number, side: number, draw = false): NonNullable<DuelSceneData['result']> {
  return { glory, won: winner === side, draw: draw || winner === -1 };
}

/** "Team 2" or the name a preset was given. */
export function presetLabel(l: Pick<Loadout, 'slot' | 'name'>): string {
  return l.name?.trim() || t('duels.loadout', { n: l.slot });
}

/**
 * The duel army as the Army template's source (src/ui/army, D6), for its roster rows: the heroes, their points to
 * spend, their cost in team points (on the status line), no purse. Gear, perks and respec go through the Hero sheet's DuelHeroSource (server calls),
 * so the template's synchronous changes are refused here.
 */
function duelArmy(p: DuelProfileView): ArmySource {
  return {
    kind: 'duel',
    heroes: () => p.heroes,
    stash: () => p.stash,
    maxArmy: () => DUEL_RULES.rosterMax,
    gold: () => null,
    repairCost: () => 0,
    equip: () => false,
    unequip: () => false,
    repair: () => false,
    setGroup: () => false,
    pending: pendingPoints,
    // in the duel what a hero costs matters more than his rank: his points take the stars' place on the row
    status: (h) => ({ text: t('duels.pts', { n: heroPoints(h) }), bad: false }),
  };
}

/** The one fixed action of a view. */
interface MainAction {
  label: string;
  icon?: string;
  id: string;
  /** Why it cannot be used (the button is off and says so on tap). */
  off?: string;
  /** A quiet look (Cancel) instead of the terracotta primary. */
  secondary?: boolean;
  onClick: () => void;
}

export class DuelScene extends BaseScene {
  private src!: DuelSource;
  private profile: DuelProfileView | null = null;
  private st: EconState | 'loading' | 'ready' = 'loading';
  private busy = false;
  /** The view on screen. */
  private tab: DuelTab = 'ladder';
  /** The game mode Team and Shop go back to. */
  private mode: HubMode = 'ladder';
  private shopTab: ShopTab = 'offers';
  private gearSlot: Slot = 'weapon';
  /** The hero the shop's stat changes compare with (null: the best item in the team). */
  private compareHero: string | null = null;
  /** The search page's range bar (ticks with the clock). */
  private searchBar: MBar | null = null;
  /** Everything of the page: the frame, the bars, the scroll area and the fixed action. */
  private body!: Phaser.GameObjects.Container;
  /** The page's scroll area (the shell's). */
  private area: ScrollArea | null = null;
  /** The fixed action above the tab bar (or the frame's lower edge) and what it was built from. */
  private mainBtn: MButton | null = null;
  private mainSpec: MainAction | null = null;
  /** Which page the scroll belongs to (its scroll is kept only on a rebuild of the same page). */
  private listKey = '';
  private stash: MStashGrid | null = null;
  private stashState: StashState = defaultStashState();
  private drag!: DragDrop;
  /** Glory as last shown (the chip counts from it to a new value). */
  private shownGlory: number | null = null;
  /** Glory the header keeps showing while a reward is on screen (it flies in when the popup closes). */
  private heldGlory: number | null = null;
  /** The header's Glory chip (the target of a reward's fly-in). */
  private gloryChip: MChip | null = null;
  /** The ranked card (loaded with the profile). */
  ranked: RankedView | null = null;
  /** A queue search in progress. */
  private search: { mode: DuelMode; since: number; cancel: () => void } | null = null;
  /** The opponent the queue found (shown for foundHoldMs before the battle). */
  private found: { match: string; mode: DuelMode; name: string; league: League | null } | null = null;
  /** How long the "opponent found" card stays before the battle (previews keep it). */
  foundHoldMs = 1600;
  private searchText: Phaser.GameObjects.BitmapText | null = null;
  private arenaTab: ArenaTab = 'home';
  /** The raid card, the season and the open leaderboard (loaded with the Arena). */
  asyncView: AsyncView | null = null;
  season: SeasonView | null = null;
  board: Board = 'live';
  boardView: LeaderboardView | null = null;
  /** The last load of the leaderboard / the raid picks failed with nothing to show: the view offers Retry (M-5, M-6). */
  boardFailed = false;
  asyncFailed = false;
  /** The defender picked on the Raids view (the fixed Raid action). */
  private raidPick: number | null = null;
  /** The next-floor card (the focus ring after a cleared floor). */
  private nextCard: { parent: Phaser.GameObjects.Container; x: number; y: number; w: number; h: number } | null = null;
  /** The ladder chapters shown open (null: the current one, until the player toggles one). */
  private ladderOpen: Set<number> | null = null;
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
  /** A rename prompt is open (a second tap must not open another). */
  private renaming = false;
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
    // the hub from the tab bar lands on a game mode, not on the Team or Shop view the player left from
    if (!data.tab && (this.tab === 'team' || this.tab === 'shop')) this.tab = this.mode;
    this.tab = data.tab ?? this.tab;
    if (data.mode) this.mode = data.mode;
    else if (this.tab === 'ladder' || this.tab === 'ranked') this.mode = this.tab;
    this.shopTab = data.shop ?? this.shopTab;
    this.arenaTab = data.arena ?? (data.tab ? 'home' : this.arenaTab);
    this.board = data.board ?? this.board;
    if (prev !== this.src) (this.asyncView = null), (this.season = null), (this.boardView = null), (this.rewardShown = false), (this.ladderOpen = null);
    this.st = this.profile ? 'ready' : 'loading';
    // a relayout keeps the search, the found match and the requests in flight
    const relayout = this.relayout;
    this.relayout = false;
    if (!relayout) {
      this.visit++;
      this.openedAt = Date.now();
      this.busy = false;
      this.renaming = false;
      this.arrival = data.error ? null : data.result ?? null;
    }
    this.area = null;
    this.mainBtn = null;
    this.mainSpec = null;
    this.listKey = '';
    this.stash = null;
    this.initUi();
    ensureFonts(this);
    ensureDuelIcons(this);
    this.screen({ back: () => this.back() });
    this.body = this.add.container(0, 0);
    this.ui.add(this.body);
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
    if (data.rejoin && !relayout && !this.src.demo) this.enterMatch(data.rejoin.id, data.rejoin.mode);
  }

  /** A sub-screen (Team, Shop, Raids, a leaderboard, the search, the opponent found): a back arrow, no tab bar. */
  private get subView(): boolean {
    return this.tab === 'team' || this.tab === 'shop' || (this.tab === 'ranked' && (this.arenaTab !== 'home' || !!this.search || !!this.found));
  }

  /** Back (the strip, Telegram's button): out of a full view first, then to the menu. */
  private back(): void {
    if (Date.now() - this.openedAt < BACK_GUARD_MS) return;
    if (this.subView && !this.search && !this.found && this.profile && this.st === 'ready') return this.up();
    this.scene.start('Menu', {});
  }

  /** The view's back arrow: a full view goes back to the mode it was opened from (a leaderboard or the raid picks to the Arena). */
  up(): void {
    if (this.blocked()) return;
    if (this.tab === 'ranked' && this.arenaTab !== 'home') this.openArena('home');
    else if (this.tab === 'team' || this.tab === 'shop') this.openMode(this.mode);
  }

  /** The search (or the found opponent) holds the page: no way to lose track of it. Says why and returns true. */
  private blocked(): boolean {
    if (!this.search && !this.found) return false;
    toast(this, this.found ? t('duel.preparing') : t('duels.why.searching'), 'info');
    return true;
  }

  /** Ladder or Arena (the switch). */
  openMode(mode: HubMode): void {
    if (this.blocked()) return;
    this.mode = mode;
    this.tab = mode;
    if (mode === 'ranked') return this.openArena('home');
    if (this.profile && this.st === 'ready') this.buildBody();
  }

  /** Team or Shop (the header's buttons); their back arrow returns to the mode they were opened from. */
  openView(view: 'team' | 'shop'): void {
    if (this.blocked() || this.tab === view) return;
    if (this.tab === 'ladder' || this.tab === 'ranked') this.mode = this.tab;
    this.tab = view;
    if (this.profile && this.st === 'ready') this.buildBody();
  }

  /**
   * A new screen size rebuilds the hub where the player is (view, Arena page)
   * without leaving the queue or dropping a found match (the default restart
   * would cancel the search, and a found match never entered is abandoned).
   */
  protected onResized(): void {
    this.relayout = true;
    this.relayingOut = true;
    this.events.once('create', () => (this.relayingOut = false));
    this.scene.restart({ tab: this.tab, mode: this.mode, shop: this.shopTab, arena: this.arenaTab, board: this.board, preview: this.src.demo } satisfies DuelSceneData);
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
      if (this.tab === 'ranked' && this.arenaTab !== 'board') void this.loadAsync();
      if (this.tab === 'ranked' && this.arenaTab === 'board') void this.loadBoard();
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

  /** The fixed action waits (a request runs), or is back to what the page set. */
  private hold(on: boolean): void {
    if (!this.sys.isActive() || !this.mainBtn?.active) return;
    const spec = this.mainSpec;
    if (on) this.mainBtn.setEnabled(false, t('duels.why.busy'));
    else if (spec) this.mainBtn.setEnabled(!spec.off, spec.off);
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

  /** A preset by its slot (slots may have gaps after a delete). */
  private preset(p: DuelProfileView, slot: number): Loadout | undefined {
    return p.loadouts?.find((l) => l.slot === slot);
  }

  /** The heroes of a list of ids (unknown ids dropped). */
  private heroesOf(p: DuelProfileView, ids: readonly string[]): Hero[] {
    return ids.map((id) => p.heroes.find((h) => h.id === id)).filter((h): h is Hero => !!h);
  }

  /** The heroes of the edited team, or of the team used for something (ladder, arena, defence). */
  private teamHeroes(p: DuelProfileView, use?: LoadoutUse): Hero[] {
    return this.heroesOf(p, use ? (this.preset(p, p.use[use])?.team ?? p.team) : p.team);
  }

  /** Every hero who fights somewhere: the edited team and the presets used on the ladder, in the arena and in defence. */
  private fightingHeroes(p: DuelProfileView): Hero[] {
    const ids = new Set(p.team);
    for (const u of LOADOUT_USES) for (const id of this.preset(p, p.use[u])?.team ?? []) ids.add(id);
    return p.heroes.filter((h) => ids.has(h.id));
  }

  /** "Team 2" or the name a preset was given. */
  private loadoutName(p: DuelProfileView, slot: number): string {
    const l = this.preset(p, slot);
    return l ? presetLabel(l) : t('duels.loadout', { n: slot });
  }

  /**
   * A tap target over a row left of its button (`right`: where the button
   * starts), so the row and its button never overlap; ignores taps that ended
   * a scroll drag.
   */
  private rowTap(parent: Phaser.GameObjects.Container, area: () => ScrollArea | null, w: number, h: number, id: string, cb: () => void, x = 0, y = 0): void {
    const z = this.add.zone(x, y, Math.max(10, w), h).setOrigin(0, 0).setInteractive();
    uiId(z, id);
    tappable(z, null, () => !area()?.moved && cb());
    parent.add(z);
  }

  // ------------------------------------------------------------------ frame

  /** The title of the view on its top bar (a sub-screen). */
  private viewTitle(): string {
    if (this.tab === 'team') return t('duels.view.team');
    if (this.tab === 'shop') return t('d5.armoury');
    if (this.tab === 'ranked' && this.arenaTab === 'raid') return t('duels.card.raids');
    // Live and Legend share one title: the switch under it is the only state (DUE-2)
    if (this.tab === 'ranked' && this.arenaTab === 'board') return this.board === 'async' ? t('duels.view.board.async') : t('d5.board');
    if (this.found) return t(`duels.searchMode.${this.found.mode}` as TKey);
    if (this.search) return t(`duels.searchMode.${this.search.mode}` as TKey);
    return t('dv.title');
  }

  /**
   * The page of a view: the framed screen (the hub with its tab bar, or a
   * sub-screen with a back arrow), its scroll area and, when there is one, the
   * fixed action (the one terracotta button of the view).
   */
  private openShell(hub: boolean, title: string, main: MainAction | null = null, extra = 0): { area: ScrollArea; c: Phaser.GameObjects.Container; w: number } {
    const reserve = (main ? MAIN_H + GAP : 0) + extra;
    const sh = hub
      ? addHubShell(this, { title: 'Pixelarrow', active: 'duels', reserve, parent: this.body })
      : // no back arrow while searching or found: Cancel is the only exit (E326, N5, DUE-6)
        addSubShell(this, { title, back: this.search || this.found ? undefined : () => this.up(), reserve, parent: this.body, id: 'duel.topbar' });
    this.area = sh.area;
    this.mainSpec = main;
    this.mainBtn = null;
    if (main) {
      const box = sh.content;
      const b = new MButton(this, box.x + 5, box.y + box.h - MAIN_H - 1, box.w - 10, MAIN_H, {
        label: main.label,
        icon: main.icon,
        variant: main.secondary ? 'secondary' : 'primaryHero',
        id: main.id,
        disabledReason: main.off,
        onClick: main.onClick,
      });
      if (main.off) b.setEnabled(false, main.off);
      if (this.busy) b.setEnabled(false, t('duels.why.busy'));
      this.body.add(b);
      this.mainBtn = b;
    }
    return { area: sh.area, c: sh.area.content, w: sh.w };
  }

  /** Ends a page: the scroll area's height and where it starts (kept when the same page is rebuilt). */
  private finishPage(y: number, scroll: number): void {
    const area = this.area;
    if (!area) return;
    area.setContentHeight(y + 2);
    area.setScroll(Math.max(0, scroll));
  }

  private render(): void {
    const p = this.profile;
    if (this.st !== 'ready' || !p) {
      this.clearBody();
      this.buildState();
      return;
    }
    this.buildBody();
  }

  /** Loading (skeleton cards) and the unavailable states, in the duel's own words, inside the hub. */
  private buildState(): void {
    const st = this.st;
    const retry = () => {
      this.st = 'loading';
      this.render();
      void this.fetchData();
    };
    const outside = st === 'outside';
    const main: MainAction | null = st === 'loading' || outside ? null : { label: t('econ.retry'), icon: 'repair', id: 'duel.retry', onClick: retry };
    const { c, w } = this.openShell(true, '', main);
    let y = 2;
    c.add(new SectionTitle(this, 1, y, w, t('dv.title')));
    y += SECTION_TITLE_H + 4;
    if (st === 'loading') {
      for (let i = 0; i < 4; i++) {
        const sk = new ParchmentCard(this, 1, y, w, 30);
        c.add(sk);
        this.tweens.add({ targets: sk, alpha: { from: 1, to: 0.5 }, duration: 600, yoyo: true, repeat: -1, delay: i * 120 });
        y += 34;
      }
      this.finishPage(y, 0);
      return;
    }
    const title = outside ? t('econ.outside') : st === 'offline' ? t('econ.offline') : st === 'closed' ? t('duels.closed') : t('econ.error');
    const hint = outside ? t('duels.outsideHint') : st === 'closed' ? t('duels.closedHint') : t('duels.offlineHint');
    const wr = wrapText(hint, w - SPACE.lg * 2, 5);
    const h = SPACE.lg + 26 + 14 + wr.lines.length * LINE_H + SPACE.lg;
    const card = new ParchmentCard(this, 1, y, w, h, { id: 'duel.state' });
    c.add(card);
    const ic = scaleIcon(addIcon(this, 0, 0, outside ? 'swords' : 'tent', 'D'), 2);
    ic.setPosition(Math.round((w - ic.displayWidth) / 2), SPACE.lg);
    card.add(ic);
    ptext(this, card, w / 2, SPACE.lg + 28, title, 'head', { size: 8.5, align: 0.5, maxW: w - 12 });
    const body = ptext(this, card, w / 2, SPACE.lg + 28 + 14, wr.lines.join('\n'), 'sec', { align: 0.5 });
    body.setCenterAlign();
    y += h + GAP;
    this.finishPage(y, 0);
  }

  private clearBody(): void {
    this.area?.destroy();
    this.area = null;
    this.stash?.destroy();
    this.stash = null;
    this.mainBtn = null;
    this.mainSpec = null;
    this.gloryChip = null;
    this.drag.targets = [];
    this.drag.cancel();
    this.body.removeAll(true);
  }

  /** The page key of the list (the scroll carries over only within one page). */
  private pageKey(): string {
    return `${this.tab}:${this.arenaTab}:${this.shopTab}:${this.gearSlot}:${this.board}:${this.search ? 's' : ''}${this.found ? 'f' : ''}`;
  }

  buildBody(): void {
    const key = this.pageKey();
    const keep = key === this.listKey ? (this.area?.scrollY ?? 0) : -1;
    this.clearBody();
    const p = this.profile;
    if (!p) return;
    this.listKey = key;
    this.searchText = null;
    this.searchBar = null;
    this.nextCard = null;
    if (this.tab === 'ladder') this.buildLadder(p, keep);
    else if (this.tab === 'ranked') this.buildRanked(p, keep);
    else if (this.tab === 'team') this.buildTeam(p, keep);
    else this.buildShop(p, keep);
  }

  // ------------------------------------------------------------------ header

  /**
   * Glory, the duel level with its XP line (a tap explains it) and, on the
   * hub, the Team and Armoury buttons: all on ONE row (M-2, DUE-4). Team is
   * badged when a fighting hero has points or a perk to spend. A button whose
   * label does not fit its share is icon-only (its name in its tip). The Team
   * and Armoury views show the chips alone: no cross-links (D11). Returns the
   * height.
   */
  private headerRow(c: Phaser.GameObjects.Container, y: number, w: number, p: DuelProfileView, o: { links?: boolean } = {}): number {
    const lp = levelProgress(p.xp);
    const shown = this.heldGlory ?? this.shownGlory ?? p.glory;
    const lv = t('dv.lvShort', { n: lp.level });
    const buttons: { label: string; icon: string; id: string; tip: string; badge?: string; go: 'team' | 'shop' }[] = o.links
      ? [
          { label: t('dv.team'), icon: 'people', id: 'duel.team', tip: t('d5.teamTip'), badge: this.fightingHeroes(p).some(heroNeedsAttention) ? '!' : undefined, go: 'team' },
          { label: t('d5.armoury'), icon: 'helmet', id: 'duel.shop', tip: t('d5.armouryTip'), go: 'shop' },
        ]
      : [];
    // without the buttons the two chips share the row
    const gw = o.links ? MChip.width({ icon: 'laurel', value: fmtCount(Math.max(shown, p.glory)), tall: true }, 36) : Math.floor((w - 2) / 2);
    const lw = o.links ? MChip.width({ icon: 'xp', value: lv, tall: true }, 40) : w - gw - 2;
    const sizes = buttonLabelSizes(TAP);
    // a button keeps its label while it fits at 6.5 or more (the icon goes first, inside MButton)
    const fits = (i: number, bw: number) => !fitCinzel(buttons[i].label, 'rCream', bw - 14, sizes).truncated;
    const lay = headerLayout(w, [gw, lw], buttons.length, fits);
    const [gBox, lBox] = lay.chips;
    const gc = new MChip(this, 1 + gBox.x, y, { w: gBox.w, tall: true, pad: lay.tight ? 6 : undefined, surface: 'stone', icon: 'laurel', value: fmtCount(shown), id: 'duel.glory', tip: t('res.glory') });
    c.add(gc);
    this.gloryChip = gc;
    c.add(new MChip(this, 1 + lBox.x, y, { w: lBox.w, tall: true, pad: lay.tight ? 6 : undefined, surface: 'stone', icon: 'xp', value: lv, progress: lp.need ? lp.into / lp.need : 1, progressColor: RESOURCES.xp.color, onClick: () => this.openLevel(), tip: t('dv.lvTitle', { n: lp.level }), id: 'duel.level' }));
    // the narrowest screens (320x568 in Telegram) put the buttons on a row of their own
    const by = lay.rows === 2 ? y + TAP + GAP : y;
    lay.buttons.forEach((box, i) => {
      const bt = buttons[i];
      const go = () => this.openView(bt.go);
      c.add(
        box.label
          ? new MButton(this, 1 + box.x, by, box.w, TAP, { label: bt.label, icon: bt.icon, variant: 'secondary', badge: bt.badge, tip: bt.tip, id: bt.id, onClick: go })
          : new MIconButton(this, 1 + box.x, by, box.w, TAP, { icon: bt.icon, label: bt.label, tip: `${bt.label}: ${bt.tip}`, badge: bt.badge, id: bt.id, onClick: go }),
      );
    });
    // Glory counts to its new value after a change (the chip's count writes plain digits: only below 1000)
    if (this.heldGlory === null) {
      if (this.shownGlory !== null && this.shownGlory !== p.glory) {
        if (Math.max(this.shownGlory, p.glory) < 1000) gc.setValue(p.glory);
        else this.redrawGlory(p.glory);
      }
      this.shownGlory = p.glory;
    }
    return lay.rows === 2 ? TAP + GAP + TAP : TAP;
  }

  /** The Glory chip shows `v` at once, grouped ("12 400"): the chip's own count-up writes plain digits. */
  private redrawGlory(v: number): void {
    const chip = this.gloryChip;
    const parent = chip?.parentContainer;
    if (!chip?.active || !parent) return;
    const n = new MChip(this, chip.x, chip.y, { w: chip.w, tall: true, surface: 'stone', icon: 'laurel', value: fmtCount(v), id: 'duel.glory', tip: t('res.glory') });
    parent.addAt(n, parent.getIndex(chip));
    chip.destroy();
    this.gloryChip = n;
  }

  /** The duel level: XP to the next one, where duel XP comes from, what the next levels open. */
  openLevel(): void {
    const p = this.profile;
    if (!p) return;
    const lp = levelProgress(p.xp);
    const next = Math.min(LADDER.floors, p.ladder.cleared + 1);
    const how = t('dv.lvHow', { f: ladderFloor(next).reward.xp, w: RANKED.accountXp.win, l: RANKED.accountXp.loss, r: ASYNC.accountXp.win });
    const unlocks: string[] = [];
    if (lp.level < DUEL_RULES.rankedLevel) unlocks.push(t('dv.unlock.ranked', { n: DUEL_RULES.rankedLevel }));
    const byLevel = new Map<number, number>();
    for (const c of DUEL_CLASSES) if (c.level > lp.level) byLevel.set(c.level, (byLevel.get(c.level) ?? 0) + 1);
    const firstNew = [...byLevel.keys()].sort((a, b) => a - b)[0];
    if (firstNew) unlocks.push(t('dv.unlock.classes', { n: byLevel.get(firstNew)!, l: firstNew }));
    const nextLine = t('dv.lvNext', { what: unlocks.length ? unlocks.join('; ') : t('dv.unlock.none') });
    const w = Math.min(this.m.VW - 12, 240);
    const inner = w - (SPACE.lg + 2) * 2;
    const wHow = wrapText(how, inner, 5);
    const wNext = wrapText(nextLine, inner, 4);
    const bodyH = 20 + 6 + wHow.lines.length * LINE_H + 5 + wNext.lines.length * LINE_H + 2;
    const m = openParchmentSheet(this, { title: t('dv.lvTitle', { n: lp.level }), w, h: SHEET_PAD + bodyH, id: 'duel.levelSheet' });
    const { c, body: b } = m;
    let y = b.y;
    c.add(new MBar(this, b.x, y, b.w, { value: lp.need ? lp.into : 1, max: lp.need || 1, color: RESOURCES.xp.color, label: lp.need ? t('dv.lvXp', { a: fmtCount(lp.into), b: fmtCount(lp.need), n: lp.level + 1 }) : t('dv.lvMax'), h: 5 }));
    y += 20 + 6;
    ptext(this, c, b.x, y, wHow.lines.join('\n'), 'ink');
    y += wHow.lines.length * LINE_H + 5;
    ptext(this, c, b.x, y, wNext.lines.join('\n'), 'sec');
  }

  /** The hub's top: the title, the one header row, the mode's fresco (tall screens only) and the Ladder | Arena switch. Returns the y below. */
  private hubTop(c: Phaser.GameObjects.Container, y: number, w: number, p: DuelProfileView, art: 'ladder' | 'arena'): number {
    c.add(new SectionTitle(this, 1, y, w, t('dv.title')));
    if (this.src.demo) {
      const note = ptext(this, c, w, y + 2, t('dv.demo'), 'muted', { size: TEXT_MIN, align: 1 });
      const zw = Math.max(22, Math.ceil(note.width) + 8);
      const z = this.add.zone(w + 1 - zw, y - 2, zw, 22).setOrigin(0, 0).setInteractive();
      uiId(z, 'duel.demo');
      tappable(z, null, () => showTooltip(this, t('dv.demoTip'), z));
      c.add(z);
    }
    y += SECTION_TITLE_H + (this.src.demo ? 6 : 2);
    y += this.headerRow(c, y, w, p, { links: true }) + GAP;
    // the mode's illustrated banner, small and only on a tall screen: the floors come first (M-2, DUE-1)
    if (showFresco(this.m.VH)) {
      c.add(new FrescoBanner(this, 1, y, w, FRESCO_H, { label: art, id: `duel.banner.${art}`, art: (parent, ax, ay, aw, ah) => addModeBanner(this, parent, ax, ay, aw, ah, art) }));
      y += FRESCO_H + GAP;
    }
    c.add(
      new SegmentedSwitch(this, 1, y, w, {
        options: MODES.map((k, i) => ({ id: k, label: t(`duels.tab.${k}` as TKey), icon: MODE_ICONS[i] })),
        selected: this.mode,
        id: 'duel.mode',
        onChange: (id) => this.openMode(id as HubMode),
      }),
    );
    return y + 24 + GAP + 1;
  }

  /** After a battle: what it paid (and the stars a ladder floor earned), and the new next floor ringed. */
  private showArrival(): void {
    const a = this.arrival;
    this.arrival = null;
    if (!a || !this.profile || this.st !== 'ready') return;
    if (a.floor) {
      toast(this, ladderArrival({ ...a, floor: a.floor }), a.won && !a.expired ? 'good' : 'info', a.expired ? 4200 : 3200, 'bottom');
      const c = this.nextCard;
      if (a.won && a.first && this.tab === 'ladder' && c) {
        const ring = addFocusRing(this, c.parent, c.x, c.y, c.w, c.h);
        this.time.delayedCall(2200, () => ring.active && ring.destroy());
      }
      return;
    }
    const g = fmtCount(a.glory);
    const text = a.draw ? t('duels.backMatchDraw', { g }) : a.won ? t('duels.backMatchWon', { g }) : t('duels.backMatchLost', { g });
    toast(this, text, a.won && !a.draw ? 'good' : 'info', 2800, 'bottom');
  }

  // ------------------------------------------------------------------ ladder

  /** The chapter of the next floor (the last one once all are cleared). */
  private currentChapter(p: DuelProfileView): number {
    return chapterOf(Math.min(LADDER.floors, p.ladder.cleared + 1));
  }

  private chapterOpen(p: DuelProfileView, ch: number): boolean {
    return this.ladderOpen ? this.ladderOpen.has(ch) : ch === this.currentChapter(p);
  }

  /** A chapter chest ready to claim, if any (the sentence points at it). */
  private readyChest(p: DuelProfileView): { ch: number; tier: number } | null {
    for (let ch = 1; ch <= CHAPTERS; ch++) for (let tier = 1; tier <= CHEST_TIERS; tier++) if (chestState(p.ladder.stars, p.ladder.chests, ch, tier) === 'ready') return { ch, tier };
    return null;
  }

  private buildLadder(p: DuelProfileView, keep: number): void {
    const team = this.teamHeroes(p, 'ladder');
    const done = p.ladder.cleared >= LADDER.floors;
    const n = Math.min(LADDER.floors, p.ladder.cleared + 1);
    const f = ladderFloor(n);
    const problem = done ? null : teamProblem(team, f.budget);
    const why = problem ? t(`duels.why.${problem}` as TKey, { n: f.budget }) : undefined;
    const capped = p.ladder.farmLeft <= 0;
    const chest = this.readyChest(p);
    // a tip only when there is something to do about it: a team problem (always), a chest to claim (where it leaves the floors in view)
    const chestTip = !!chest && showChestTip(this.m.VH);
    const sentence = problem === 'over_budget' ? t('duels.sit.ladderOver', { n, b: f.budget }) : (why ?? (chestTip ? t('duels.sit.chestReady', { n: chest!.ch }) : ''));
    // Fight sits in the flow under the next floor, so nothing hides under it (M-2, DUE-1)
    const { area, c, w } = this.openShell(true, '');
    let y = this.hubTop(c, 2, w, p, 'ladder');
    if (sentence) y += addTipLine(this, c, 1, y, w, { text: sentence, tone: problem ? 'warn' : 'reward', id: 'duel.tip' }) + GAP;
    const top = y;
    if (done) {
      const card = new ParchmentCard(this, 1, y, w, 44, { id: 'duel.ladderDone' });
      c.add(card);
      const ic = scaleIcon(addIcon(this, 0, 0, 'trophy'), 1.6);
      ic.setPosition(SPACE.lg, 12);
      card.add(ic);
      ptext(this, card, SPACE.lg + 26, 8, t('duels.ladderDone'), 'head', { size: 8, maxW: w - 40 });
      pwrap(this, card, SPACE.lg + 26, 20, t('duels.ladderDoneHint', { n: LADDER.floors }), w - 40, 2);
      y += 44 + GAP;
    } else {
      y += this.buildNextFloor(c, p, f, 1, y, w) + GAP;
      const fight = new MButton(this, 1, y, w, MAIN_H, { label: t('duels.fightFloor', { n }), icon: 'swords', variant: 'primaryHero', id: 'duel.fightNext', disabledReason: why, onClick: () => void this.fight(n) });
      if (why) fight.setEnabled(false, why);
      if (this.busy) fight.setEnabled(false, t('duels.why.busy'));
      c.add(fight);
      this.mainBtn = fight;
      this.mainSpec = { label: fight.opts.label, id: 'duel.fightNext', off: why, onClick: () => void this.fight(n) };
      y += MAIN_H + GAP + 1;
    }
    let headY = y;
    for (let ch = 1; ch <= CHAPTERS; ch++) {
      if (ch === this.currentChapter(p)) headY = y;
      y += this.chapterBlock(c, p, ch, y, w, area);
      // farm Glory left today, under the chapter of the next floor (the replays it pays for)
      if (ch === this.currentChapter(p)) {
        c.add(new MBar(this, 3, y, w - 4, { label: capped ? t('duels.farmUsed') : t('dv.farmBar'), right: `${fmtCount(p.ladder.farmLeft)} / ${fmtCount(p.ladder.farmCap)}`, value: p.ladder.farmLeft, max: p.ladder.farmCap, color: RESOURCES.glory.color, h: 4, quiet: capped, id: 'duel.farm' }));
        y += 15 + GAP + 3;
      }
    }
    // a first look starts at the next floor when the current chapter is a later one
    this.finishPage(y, keep >= 0 ? keep : this.currentChapter(p) > 1 && headY > area.viewHeight - 90 ? top : 0);
  }

  /** "Your team 68 pts · this floor allows 72": the cap belongs to the floor (the Arena has its own). */
  private teamVsCap(p: DuelProfileView, cap: number, where: 'floor' | 'arena', use: LoadoutUse): { text: string; over: boolean } {
    const pts = teamPoints(this.teamHeroes(p, use));
    return { text: t(where === 'floor' ? 'dv.teamVsCap' : 'dv.teamVsArena', { n: pts, cap }), over: pts > cap };
  }

  /**
   * The next floor: the medallion, "Next: floor 5 · +80 Glory", the team against
   * the cap with a tick or a cross. A tap opens the floor's sheet (its chevron
   * says so). Returns the card's height.
   */
  private buildNextFloor(c: Phaser.GameObjects.Container, p: DuelProfileView, f: ReturnType<typeof ladderFloor>, x: number, y: number, w: number): number {
    const h = 38;
    const card = new ParchmentCard(this, x, y, w, h, { id: 'duel.nextCard' });
    c.add(card);
    const ms = h - 10;
    card.add(mosaicImage(this, 5, 5, ms, ms, f.boss ? 'tileBronze' : 'tileTerra'));
    if (f.boss) {
      const sk = scaleIcon(addIcon(this, 0, 0, 'skull', 'L'), 1.4);
      sk.setPosition(Math.round(5 + (ms - sk.displayWidth) / 2), Math.round(5 + (ms - sk.displayHeight) / 2));
      card.add(sk);
    } else card.add(mtext(this, 5 + ms / 2, 5 + Math.round((ms - 12) / 2), `${f.floor}`, 'rCream', { size: 11, align: 0.5 }));
    const tx = 5 + ms + 7;
    const tw = w - 18 - tx;
    const glory = `+${fmtCount(f.reward.firstGlory)}`;
    const gw = pw(glory) + 16;
    // "Next: floor 5 · Boss", shorter forms where it does not fit: the floor's number is never cut (G14)
    const forms = [t('duels.nextFloor', { n: f.floor }), t('duels.floor', { n: f.floor })].flatMap((x) => (f.boss ? [`${x} · ${t('duels.boss')}`, x] : [x]));
    const title = forms.find((x) => pw(x, 'head', 8) <= tw - gw) ?? forms[forms.length - 1];
    const head = ptext(this, card, tx, 7, title, 'head', { size: 8, maxW: tw - gw });
    const gx = tx + Math.ceil(head.width) + 5;
    const ic = addIcon(this, gx, 6, 'laurel');
    card.add(ic);
    ptext(this, card, gx + 15, 8, glory, 'ink');
    // your team against this floor's cap: a tick when it fits, a cross when over
    const cap = this.teamVsCap(p, f.budget, 'floor', 'ladder');
    const mine = teamPoints(this.teamHeroes(p, 'ladder'));
    // the whole line where it fits, then shorter forms: the numbers are never cut (G14)
    const capText = [cap.text, t('dv.teamCapShort', { n: mine, cap: f.budget }), t('d5.capTiny', { n: mine, cap: f.budget })].find((s) => measureText(s) <= tw - 14) ?? t('d5.capTiny', { n: mine, cap: f.budget });
    card.add(addIcon(this, tx - 1, 21, cap.over ? 'close' : 'check'));
    ptext(this, card, tx + 13, 23, capText, cap.over ? 'bad' : 'good', { maxW: tw - 13 });
    const chev = scaleIcon(addIcon(this, 0, 0, 'chevR'), 0.9);
    chev.setPosition(w - 15, Math.round((h - chev.displayHeight) / 2));
    card.add(chev);
    const z = this.add.zone(0, 0, w, h).setOrigin(0, 0).setInteractive();
    uiId(z, 'duel.nextFloor');
    tappable(z, null, () => !this.area?.moved && this.profile && this.openFloor(this.profile, f.floor));
    card.add(z);
    this.nextCard = { parent: c, x, y, w, h };
    return h;
  }

  /** A chapter: its heading card (open or closed, its stars and its three chests) and, open, its floors in rows of five. Returns the height. */
  private chapterBlock(c: Phaser.GameObjects.Container, p: DuelProfileView, ch: number, y: number, w: number, area: ScrollArea): number {
    const [first] = chapterFloors(ch);
    const reached = first <= p.ladder.cleared + 1;
    const open = this.chapterOpen(p, ch);
    const stars = chapterStars(p.ladder.stars, ch);
    const max = chapterMaxStars(ch);
    const chests = reached;
    const chestsW = CHEST_TIERS * CHEST_W + (CHEST_TIERS - 1) * GAP;
    // the chests share the heading's row while the title keeps 56 px beside them (at 320 too: the floors stay in view, DUE-1)
    const narrow = w - chestsW - 8 < 56;
    const h = !chests ? 31 : narrow ? 8 + 22 + GAP + CHEST_H + 5 : CHEST_H + 8;
    const card = new ParchmentCard(this, 1, y, w, h, { id: `duel.chapterCard.${ch}` });
    c.add(card);
    const left = narrow || !chests ? w - 6 : w - chestsW - 8;
    if (!reached) card.add(this.add.rectangle(0, 0, w, h, MOSAIC.parchLo, 0.45).setOrigin(0, 0));
    if (reached) {
      const g = this.add.graphics();
      drawChevron(g, 6, 8, open);
      card.add(g);
    } else card.add(scaleIcon(addIcon(this, 4, 5, 'lock', 'D'), 0.8));
    const title = t('duels.chapter', { n: ch });
    ptext(this, card, 17, 6, title, reached ? 'head' : 'off', { size: 8, maxW: left - 20 });
    if (reached) {
      card.add(scaleIcon(addIcon(this, 17, 17, 'star'), 0.75));
      const full = t('duels.chapterStars', { n: stars, max });
      ptext(this, card, 28, 18, measureText(full) <= left - 30 ? full : `${stars}/${max}`, stars >= max ? 'good' : 'sec', { maxW: left - 30 });
    } else ptext(this, card, 17, 18, t('dv.chapterLocked', { n: first - 1 }), 'off', { maxW: left - 20 });
    // narrow: the chests sit on their own row below the heading; the heading's zone stops short of them
    const chestTop = 8 + 22 + GAP - 6;
    const hz = this.add.zone(0, 0, left, narrow && chests ? chestTop - 3 : h).setOrigin(0, 0).setInteractive();
    uiId(hz, 'duel.chapter');
    tappable(hz, null, () => !area.moved && this.toggleChapter(ch));
    card.add(hz);
    const slot = (tier: number, sx: number, sy: number, sw: number) => {
      const st = chestState(p.ladder.stars, p.ladder.chests, ch, tier);
      card.add(new ChestSlot(this, sx, sy, sw, { state: st, need: LADDER.chestStars[tier - 1], id: `duel.chest.${tier}`, onClick: () => !area.moved && this.tapChest(ch, tier) }));
    };
    if (!chests) {
      // a chapter not reached yet: its chests show once it opens
    } else if (narrow) {
      const cwid = Math.floor((w - 12 - 2 * GAP) / 3);
      for (let tier = 1; tier <= CHEST_TIERS; tier++) slot(tier, 6 + (tier - 1) * (cwid + GAP), chestTop, cwid);
    } else for (let tier = 1; tier <= CHEST_TIERS; tier++) slot(tier, w - chestsW - 4 + (tier - 1) * (CHEST_W + GAP), Math.round((h - CHEST_H) / 2), CHEST_W);
    let used = h + GAP;
    if (!open) return used;
    // five tiles a row, each a touch target (22 UI px) 2 px apart; the narrowest screens (320x568 in Telegram) take four
    const per = w >= 5 * TAP + 4 * 2 ? 5 : 4;
    const tg = Math.max(2, Math.min(GAP, Math.floor((w - per * TAP) / (per - 1))));
    const tw = Math.floor((w - (per - 1) * tg) / per);
    const [a, b] = chapterFloors(ch);
    for (let from = a; from <= b; from += per) {
      for (let i = 0; i < per && from + i <= b; i++) {
        const n = from + i;
        const x = 1 + i * (tw + tg);
        const tileW = i === per - 1 ? w - i * (tw + tg) : tw;
        const cleared = n <= p.ladder.cleared;
        const next = n === p.ladder.cleared + 1;
        const boss = isBoss(n);
        c.add(
          new FloorTile(this, x, y + used, tileW, {
            n,
            state: next ? 'next' : cleared ? 'cleared' : 'locked',
            boss,
            stars: p.ladder.stars[n - 1] ?? 0,
            id: next ? 'duel.floorNext' : cleared ? 'duel.floorDone' : 'duel.floorLocked',
            onClick: () => !area.moved && this.tapFloor(n),
          }),
        );
      }
      used += FLOOR_H + GAP;
    }
    return used + 2;
  }

  private toggleChapter(ch: number): void {
    const p = this.profile;
    if (!p) return;
    const open = this.ladderOpen ?? new Set([this.currentChapter(p)]);
    if (open.has(ch)) open.delete(ch);
    else open.add(ch);
    this.ladderOpen = open;
    this.buildBody();
  }

  /** A floor tile: the floor's card (a cleared floor is a replay for farm Glory); a locked one says what opens it. */
  private tapFloor(n: number): void {
    const p = this.profile;
    if (!p) return;
    if (n > p.ladder.cleared + 1) return void toast(this, t('duels.floorLocked', { n: n - 1 }), 'info');
    this.openFloor(p, n);
  }

  private tapChest(ch: number, tier: number): void {
    const p = this.profile;
    if (!p) return;
    const st = chestState(p.ladder.stars, p.ladder.chests, ch, tier);
    if (st === 'ready') return void this.claimChest(ch, tier);
    this.openChestPreview(p, ch, tier, st);
  }

  /** What a chest holds before it is opened (locked: the stars it needs and how far along; claimed: that it is done). */
  openChestPreview(p: DuelProfileView, ch: number, tier: number, st: ChestState): void {
    const r = chestReward(ch, tier);
    const need = LADDER.chestStars[tier - 1];
    const have = chapterStars(p.ladder.stars, ch);
    const w = Math.min(this.m.VW - 4, 230);
    const bodyH = 36 + (st === 'locked' ? 18 + 4 + LINE_H : LINE_H);
    const m = openParchmentSheet(this, { title: this.sheetTitle(t('dv.chestTitle', { ch, n: need }), t('duels.chapter', { n: ch }), w), w, h: SHEET_PAD + bodyH, id: 'duel.chestSheet' });
    const { c, body: b } = m;
    let y = b.y;
    c.add(mosaicImage(this, b.x, y, 36, 30, 'parchmentWell'));
    c.add(addChestSprite(this, b.x + 2, y + 2, st === 'claimed' ? 'claimed' : 'locked', 2));
    const tx = b.x + 44;
    c.add(addIcon(this, tx, y + 1, 'laurel'));
    ptext(this, c, tx + 15, y + 3, `+${fmtCount(r.glory)} ${t('res.glory')}`, 'ink');
    if (r.item) ptext(this, c, tx, y + 17, t('dv.chestItem'), 'sec', { maxW: b.x + b.w - tx });
    y += 38;
    if (st === 'locked') {
      c.add(new MBar(this, b.x, y, b.w, { value: Math.min(have, need), max: need, label: t('dv.chestStars', { ch }), right: `${have} / ${need}`, color: MOSAIC.segDone, h: 4 }));
      y += 15 + 4;
      ptext(this, c, b.x, y, t('dv.chestHow', { n: need - have }), 'sec', { maxW: b.w });
    } else ptext(this, c, b.x, y, t('duels.chest.claimed'), 'muted', { maxW: b.w });
  }

  /** A sheet's title, or its short form where the long one would drop under 6.5 on a `w`-wide sheet (the X and margins take 52). */
  private sheetTitle(full: string, short: string, w: number): string {
    const room = Math.min(w, this.m.VW - 16) - 52;
    return measureText(full, false, TEXT_MIN, 'roman') <= room ? full : short;
  }

  /** Claims a ready chest: the reward popup once the server answers. */
  async claimChest(ch: number, tier: number): Promise<void> {
    // the header keeps the old Glory until the chest is opened and its coins fly in
    this.heldGlory = this.profile?.glory ?? null;
    const r = await this.act(() => this.src.ladderChest(ch, tier));
    if (r && this.sys.isActive()) {
      hapticNotify('success');
      this.openChestReward(r);
    } else this.releaseGlory();
  }

  /** The held Glory goes to the header: flying from (x, y) when given, else it just counts. */
  private releaseGlory(from?: { x: number; y: number }): void {
    const p = this.profile;
    this.heldGlory = null;
    if (!p || !this.sys.isActive()) return;
    const chip = this.gloryChip;
    if (chip?.active && from) this.flyGlory(from.x, from.y, chip, p.glory);
    else chip?.active && chip.setValue(p.glory);
    this.shownGlory = p.glory;
  }

  /** Laurels fly from (x, y) to the Glory chip, which then counts to `value`. */
  private flyGlory(x: number, y: number, chip: MChip, value: number): void {
    if (motion.reduced || !chip.scene) return void chip.setValue(value);
    const m = chip.getWorldTransformMatrix();
    const S = this.m.S;
    const tx = m.tx / S + 6;
    const ty = m.ty / S + (chip.h - 12) / 2;
    for (let i = 0; i < 5; i++) {
      const img = scaleIcon(addIcon(this, x, y, 'laurel'), 1.4).setOrigin(0.5, 0.5);
      this.ui.add(img);
      this.tweens.add({ targets: img, x: tx + 6, y: ty + 6, scale: img.scale * 0.6, duration: 520, delay: i * 60, ease: 'Cubic.easeIn', onComplete: () => img.destroy() });
    }
    this.time.delayedCall(520 + 4 * 60, () => chip.scene && chip.setValue(value));
  }

  /** What a chest held: its Glory and (the 30-star chest) an item; a tap on the item opens its card. */
  openChestReward(r: ChestClaim): void {
    const { VW } = this.m;
    const w = Math.min(VW - 4, 210);
    const art = 3;
    const ah = 13 * art;
    let chestAt = { x: VW / 2, y: this.m.VH / 2 };
    const actions: MButtonOpts[] = [{ label: t('duels.reward.ok'), variant: 'primary', id: 'duel.chest.ok', onClick: () => m.close() }];
    const m = openParchmentSheet(this, { title: this.sheetTitle(t('duels.chest.title', { n: r.chapter }), t('duels.chapter', { n: r.chapter }), w), w, h: SHEET_PAD + 8 + ah + 8 + 22 + (r.item ? 38 : 0) + sheetActionsH(actions, w), actions, id: 'duel.rewardSheet', onClose: () => this.releaseGlory(chestAt) });
    const { c, body: b } = m;
    let y = b.y + 8;
    // the chest: closed, it shakes, it opens on its gold (instantly under reduced motion)
    const cx = Math.round(m.x + w / 2 - 8 * art);
    chestAt = { x: cx + 8 * art, y: y + ah / 2 };
    const closed = addChestSprite(this, cx, y, 'ready', art);
    const open = addChestSprite(this, cx, y, 'full', art).setVisible(false);
    c.add([closed, open]);
    const sparks = Array.from({ length: 10 }, (_, i) => {
      const sq = this.add.rectangle(cx + 8 * art, y + 5 * art, 2, 2, i % 3 ? MOSAIC.gold : MOSAIC.goldHi).setVisible(false);
      c.add(sq);
      return sq;
    });
    y += ah + 8;
    const gw = 24 + 4 + measureText(`+${fmtCount(r.glory)}`) * 1.5;
    const gx = Math.round(m.x + w / 2 - gw / 2);
    c.add(scaleIcon(addIcon(this, gx, y, 'laurel'), 2));
    const gt = ptext(this, c, gx + 28, y + 6, `+${fmtCount(r.glory)}`, 'ink').setScale(1.5);
    const reveal = () => {
      if (!closed.active) return;
      closed.setVisible(false);
      open.setVisible(true);
      uiCoin();
      if (motion.reduced) return;
      sparks.forEach((sq, i) => {
        const a = (i / sparks.length) * Math.PI * 2;
        sq.setVisible(true);
        this.tweens.add({ targets: sq, x: sq.x + Math.cos(a) * 26, y: sq.y + Math.sin(a) * 18 - 8, alpha: 0, duration: 520, ease: 'Cubic.easeOut' });
      });
      const n = { v: 0 };
      this.tweens.add({ targets: n, v: r.glory, duration: 600, ease: 'Cubic.easeOut', onUpdate: () => gt.active && gt.setText(`+${fmtCount(n.v)}`) });
      this.tweens.add({ targets: open, y: { from: open.y - 3, to: open.y }, duration: 220, ease: 'Bounce.easeOut' });
    };
    if (motion.reduced) reveal();
    else {
      gt.setText('+0');
      this.tweens.add({ targets: closed, x: { from: closed.x - 1.5, to: closed.x + 1.5 }, duration: 60, yoyo: true, repeat: 4, onComplete: reveal });
    }
    y += 30;
    const it = r.item;
    if (it) {
      const rowW = b.w;
      c.add(mosaicImage(this, b.x, y, rowW, 32, 'parchmentWell'));
      c.add(new ItemIcon(this, b.x + 4, y + 4, { item: it }, { size: 24, tip: false }));
      ptext(this, c, b.x + 32, y + 6, itemName(it), 'ink', { maxW: rowW - 36 });
      ptext(this, c, b.x + 32, y + 18, `${tOr(`rarity.${it.rarity}`, RARITY_LABEL[it.rarity])} · ${t(`slot.${itemDef(it.def).slot}` as TKey)}`, 'sec', { maxW: rowW - 36 });
      const z = this.add.zone(b.x, y, rowW, 32).setOrigin(0, 0).setInteractive();
      uiId(z, 'duel.chest.item');
      tappable(z, null, () => openItemCard(this, { item: it, title: t('duels.chest.inStash'), worth: false, actions: [] }));
      c.add(z);
    }
  }

  /**
   * A floor's sheet, docked full width to the lower edge (DUE-12): the reward,
   * your team's points against the enemy's and the floor's cap (so the player
   * can judge the fight), that the fight can pause (controls.md R10), the best
   * stars and the whole stars rule, the enemy army with earth role pills (G4);
   * Fight (or Farm).
   */
  openFloor(p: DuelProfileView, n: number): void {
    const { VW, VH } = this.m;
    const f = ladderFloor(n);
    const w = VW;
    // the sheet's body: a docked sheet keeps 4 px off each side, its body 8 more (ParchmentSheet)
    const inner = VW - 8 - 16;
    const rowH = 28;
    const gap = 3;
    const next = n > p.ladder.cleared;
    const team = this.teamHeroes(p, 'ladder');
    const mine = teamPoints(team);
    const over = mine > f.budget;
    const rule = wrapText(t('dv.starsRule'), inner - 32, 4);
    const pause = wrapText(t('d5.pausable', { m: LADDER.ticketMin }), inner - 16, 3);
    const farm = next ? null : wrapText(p.ladder.farmLeft > 0 ? t('duels.farmToday', { n: fmtCount(p.ladder.farmLeft), max: fmtCount(p.ladder.farmCap) }) : t('duels.replayCapped'), inner, 2);
    const overLine = over ? wrapText(t('dv.overCap', { n: mine - f.budget, cap: f.budget }), inner - 4, 2) : null;
    const ruleH = Math.max(14, rule.lines.length * LINE_H) + 6;
    const pauseH = pause.lines.length * LINE_H + 6;
    const farmH = farm ? farm.lines.length * LINE_H + 4 : 0;
    const locked = n > p.ladder.cleared + 1;
    const problem = teamProblem(team, f.budget);
    const why = locked ? t('duels.floorLocked', { n: n - 1 }) : problem ? t(`duels.why.${problem}` as TKey, { n: f.budget }) : undefined;
    const actions: MButtonOpts[] = [{ label: next ? t('duels.fight') : t('duels.farm'), icon: 'swords', variant: 'primary', id: 'duel.floorFight', disabledReason: why, onClick: () => (m.close(), void this.fight(n)) }];
    // fixed: the title, the reward, the numbers, (over the cap) and the action; under them one scroll (short screens):
    // pausable, the stars rule, (farm), the enemy heading and the list
    const fixed = SHEET_PAD + 16 + 34 + 6 + (overLine ? overLine.lines.length * LINE_H + 6 : 0) + sheetActionsH(actions, w);
    const full = f.heroes.length * (rowH + gap) - gap;
    const contentH = pauseH + ruleH + farmH + 16 + 6 + full;
    const listH = Math.max(rowH, Math.min(contentH, VH - 12 - fixed));
    const m = openParchmentSheet(this, { title: f.boss ? t('duels.floorBoss', { n }) : t('duels.floor', { n }), w, h: fixed + listH, actions, dock: 'bottom', id: 'duel.floorSheet' });
    if (why) m.buttons[0].setEnabled(false, why);
    const { c, body: b } = m;
    let y = b.y;
    // what it pays (a replay: the farm Glory)
    c.add(addIcon(this, b.x, y - 2, 'laurel'));
    const g = ptext(this, c, b.x + 15, y, `+${fmtCount(next ? f.reward.firstGlory : f.reward.farmGlory)} ${t('res.glory')}`, 'ink');
    ptext(this, c, b.x + 15 + g.width + 8, y, next ? t('duels.firstDrop') : t('dv.replay'), 'sec', { maxW: inner - 23 - g.width });
    y += 16;
    // your team (a tick within the cap, a cross over it), the enemy, the cap
    const cols: [string, number, PFont][] = [
      [t('dv.yourTeam'), mine, over ? 'bad' : 'good'],
      [t('dv.enemy'), f.points, 'ink'],
      [t('dv.allowed'), f.budget, 'sec'],
    ];
    const cw3 = Math.floor((inner - 2 * 4) / 3);
    cols.forEach(([label, v, font], i) => {
      const x = b.x + i * (cw3 + 4);
      c.add(mosaicImage(this, x, y, cw3, 30, 'parchmentWell'));
      const num = ptext(this, c, x + cw3 / 2, y + 3, fmtCount(v), font, { size: 10, align: 0.5 });
      if (i === 0) c.add(addIcon(this, Math.round(x + cw3 / 2 + num.displayWidth / 2 + 2), y + 3, over ? 'close' : 'check'));
      ptext(this, c, x + cw3 / 2, y + 19, label, 'sec', { size: TEXT_MIN, align: 0.5, maxW: cw3 - 6 });
    });
    y += 34 + 6;
    if (overLine) {
      ptext(this, c, b.x + 2, y, overLine.lines.join('\n'), 'bad');
      y += overLine.lines.length * LINE_H + 6;
    }
    const sa = new ScrollArea(this, c, b.x, y, inner, listH, this.m.S);
    c.once('destroy', () => sa.destroy());
    const k = sa.content;
    let ky = 1;
    // a ladder fight may pause and change speed, within its ticket's time (controls.md R10)
    k.add(scaleIcon(addIcon(this, 0, ky - 1, 'pause'), 0.9));
    ptext(this, k, 16, ky, pause.lines.join('\n'), 'ink');
    ky += pauseH;
    // the stars: the best so far, and the whole rule (never cut)
    const best = p.ladder.stars[n - 1] ?? 0;
    k.add(mosaicImage(this, 0, ky - 1, 28, 12, 'parchmentWell'));
    const sg = this.add.graphics();
    drawStars(sg, 14, ky + 2, best);
    k.add(sg);
    ptext(this, k, 32, ky, rule.lines.join('\n'), 'sec');
    ky += ruleH;
    if (farm) {
      ptext(this, k, 0, ky, farm.lines.join('\n'), p.ladder.farmLeft > 0 ? 'sec' : 'muted');
      ky += farmH;
    }
    // the enemy army: a heading and a hairline, then the list
    ptext(this, k, 0, ky, t('dv.enemyArmy', { n: f.heroes.length }), 'head', { size: 7.5, maxW: inner });
    k.add(this.add.rectangle(0, ky + 12, inner - 3, 1, MOSAIC.parchEdge, 0.5).setOrigin(0, 0));
    ky += 16 + 6;
    f.heroes.forEach((e, i) => {
      const cls = heroClass(e);
      const ry = ky + i * (rowH + gap);
      const ww = inner - 3;
      k.add(new ParchmentCard(this, 0, ry, ww, rowH));
      addFace(this, k, 3, ry + 3, rowH - 6, e);
      const tx = rowH + 2;
      const lv = ptext(this, k, ww - 6, ry + 4, t('duels.lvPts', { l: e.level, p: heroPoints(e) }), 'sec', { align: 1 });
      ptext(this, k, tx, ry + 4, className(e), 'ink', { maxW: ww - 6 - lv.width - 6 - tx });
      // the role in an earth pill: blue is for money only (G4)
      armyPill(this, k, tx, ry + 14, roleName(cls.role), MOSAIC.bronze, ww - tx - 6);
    });
    sa.setContentHeight(contentH + 1);
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

  // ------------------------------------------------------------------ arena

  private async loadRanked(): Promise<void> {
    try {
      const r = await this.src.ranked();
      if (!this.sys.isActive()) return;
      this.ranked = r;
      if (this.tab === 'ranked' && this.arenaTab === 'home' && this.profile && this.st === 'ready') this.buildBody();
    } catch {
      // the card keeps what it had (the profile loaded, so this is a passing failure)
    }
  }

  private async loadAsync(): Promise<void> {
    this.asyncFailed = false;
    try {
      const v = await this.src.asyncView();
      if (!this.sys.isActive()) return;
      this.asyncView = v;
      if (this.tab === 'ranked' && this.arenaTab !== 'board' && this.profile && this.st === 'ready' && !this.search && !this.found) this.buildBody();
    } catch {
      // keeps what it had; with nothing yet, the raid picks offer Retry
      if (!this.sys.isActive() || this.asyncView) return;
      this.asyncFailed = true;
      if (this.tab === 'ranked' && this.arenaTab === 'raid' && this.profile && this.st === 'ready' && !this.search && !this.found) this.buildBody();
    }
  }

  private async loadBoard(): Promise<void> {
    const board = this.board;
    this.boardFailed = false;
    try {
      const v = await this.src.leaderboard(board);
      if (!this.sys.isActive() || board !== this.board) return;
      this.boardView = v;
      if (this.tab === 'ranked' && this.arenaTab === 'board' && this.profile && this.st === 'ready' && !this.search && !this.found) this.buildBody();
    } catch {
      // keeps what it had; with nothing yet, the board offers Retry
      if (!this.sys.isActive() || board !== this.board || this.boardView?.board === board) return;
      this.boardFailed = true;
      if (this.tab === 'ranked' && this.arenaTab === 'board' && this.profile && this.st === 'ready' && !this.search && !this.found) this.buildBody();
    }
  }

  /** Loading: parchment rows that breathe (the M-5 and M-6 loading state; still under reduced motion). Returns the y below. */
  private skeletonRows(c: Phaser.GameObjects.Container, y: number, w: number, n: number, h: number): number {
    for (let i = 0; i < n; i++) {
      const sk = new ParchmentCard(this, 1, y, w, h);
      c.add(sk);
      if (!motion.reduced) this.tweens.add({ targets: sk, alpha: { from: 1, to: 0.5 }, duration: 600, yoyo: true, repeat: -1, delay: i * 120 });
      else sk.setAlpha(0.7);
      y += h + GAP;
    }
    return y;
  }

  /**
   * A card that says a list is empty or did not load: an icon, a title, a
   * hint and, when given, a bronze Retry inside the card (the view's fixed
   * action stays its own). Returns its height.
   */
  private noticeCard(c: Phaser.GameObjects.Container, y: number, w: number, o: { icon: string; title: string; hint: string; id: string; retry?: () => void }): number {
    const wr = wrapText(o.hint, w - SPACE.lg * 2, 4);
    const btnH = o.retry ? 26 + SPACE.md : 0;
    const h = SPACE.lg + 22 + 14 + wr.lines.length * LINE_H + btnH + SPACE.lg;
    const card = new ParchmentCard(this, 1, y, w, h, { id: o.id });
    c.add(card);
    const ic = scaleIcon(addIcon(this, 0, 0, o.icon, 'D'), 1.6);
    ic.setPosition(Math.round((w - ic.displayWidth) / 2), SPACE.lg);
    card.add(ic);
    ptext(this, card, w / 2, SPACE.lg + 24, o.title, 'head', { size: 8, align: 0.5, maxW: w - 12 });
    pwrap(this, card, SPACE.lg, SPACE.lg + 24 + 14, o.hint, w - SPACE.lg * 2, 4, 'sec', 0.5);
    if (o.retry) {
      const label = t('econ.retry');
      const bw = Math.min(w - 16, Math.max(96, Math.ceil(mw(label.toUpperCase(), 'rCream', 7)) + 34));
      card.add(new MButton(this, Math.round((w - bw) / 2), h - SPACE.lg - 26, bw, 26, { icon: 'repair', label, variant: 'secondary', id: `${o.id}.retry`, onClick: o.retry }));
    }
    return h;
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
    // a search or a found opponent take the whole page (the switch waits)
    if (this.found) return this.buildFound(p, this.found);
    if (this.search) return this.buildSearch(p, this.search);
    if (this.arenaTab === 'raid') this.buildRaid(p, keep);
    else if (this.arenaTab === 'board') this.buildBoard(keep);
    else this.buildArenaHome(p, keep);
  }

  /** The Arena's views: its two cards, the raid picks, a leaderboard (and loads what it shows). */
  openArena(view: ArenaTab): void {
    if (this.blocked()) return;
    this.arenaTab = view;
    this.tab = 'ranked';
    this.mode = 'ranked';
    if (view !== 'board') void this.loadAsync();
    if (view === 'board') void this.loadBoard();
    if (view === 'home') void this.loadRanked();
    if (this.profile && this.st === 'ready') this.buildBody();
  }

  /** A leaderboard as its own view (Live, with its Legend filter, or Raids). */
  openBoard(board: Board): void {
    if (board !== this.board) this.boardView = null;
    this.board = board;
    this.openArena('board');
  }

  /** "October · 24d 5h left" and the best league of the season; returns the y below. */
  private buildSeasonLine(c: Phaser.GameObjects.Container, x: number, y: number, w: number): number {
    const s = this.season;
    c.add(addIcon(this, x + 1, y - 2, 'season'));
    if (!s) {
      ptext(this, c, x + 16, y, '...', 'muted');
      return y + 14;
    }
    const peak = s.live.peak ?? s.async.peak;
    const left = t('duels.seasonLeftShort', { month: t(`duels.month.${seasonMonth(s.season.id).month}` as TKey), t: leftText(s.season.end - Date.now()) });
    // the season best only when both fit whole (the time left matters more)
    const right = peak ? t('duels.seasonBest', { league: leagueName(peak) }) : '';
    const fits = right && 16 + pw(left) + pw(right, 'sec') + 10 <= w;
    if (fits) ptext(this, c, x + w - 2, y, right, 'sec', { align: 1 });
    ptext(this, c, x + 16, y, left, 'ink', { maxW: w - 18 });
    return y + 14;
  }

  /** "Gold II", "Legend · 2104" or "Placements 3/10". */
  private standing(v: { league: League | null; rating: number | null; placements: { played: number; of: number } }): string {
    const l = v.league;
    return l ? (l.id === 'legend' && v.rating !== null ? t('duels.legendRating', { n: fmtCount(v.rating) }) : leagueName(l)) : t('duels.placements', { n: fmtCount(v.placements.played), max: fmtCount(v.placements.of) });
  }

  /** A card of the Arena: `build` lays its content into a container (card coordinates) and returns the height; the card is made to fit. */
  private arenaCard(c: Phaser.GameObjects.Container, x: number, y: number, w: number, id: string, build: (k: Phaser.GameObjects.Container) => number): number {
    const k = this.add.container(0, 0);
    const h = build(k);
    const card = new ParchmentCard(this, x, y, w, h, { id });
    card.add(k);
    c.add(card);
    return h;
  }

  /** A mode card's title row: its icon and name, and its leaderboard ("Top", labelled). Returns the y below. */
  private cardTitle(k: Phaser.GameObjects.Container, w: number, o: { title: string; icon: string; board?: Board; id: string }): number {
    let right = w - 8;
    if (o.board) {
      const label = t('dv.top');
      const bw = Math.max(46, Math.ceil(mw(label.toUpperCase(), 'rCream', 7)) + 30);
      right -= bw;
      const board = o.board;
      k.add(new MButton(this, right, 5, bw, 22, { icon: 'podium', label, variant: 'secondary', id: `${o.id}.board`, tip: t(`duels.view.board.${board}` as TKey), onClick: () => this.openBoard(board) }));
    }
    k.add(addIcon(this, 8, 10, o.icon));
    ptext(this, k, 24, 11, o.title, 'head', { size: 8, maxW: right - 24 - 4 });
    return 34;
  }

  /** The crest, the standing and won / lost (and the placement bar). Returns the y below. */
  private standingRow(k: Phaser.GameObjects.Container, y: number, w: number, v: { league: League | null; rating: number | null; placements: { played: number; of: number }; wins: number; losses: number }): number {
    const cs = 30;
    addCrest(this, k, 8, y, cs, v.league);
    const tx = 8 + cs + 7;
    const tw = w - 8 - tx;
    ptext(this, k, tx, y + 1, this.standing(v), 'ink', { maxW: tw });
    inlineNumbers(this, k, tx, y + 13, tw, [
      { icon: 'trophy', value: fmtCount(v.wins), word: t('duels.num.won') },
      { icon: 'skull', value: fmtCount(v.losses), word: t('duels.num.lost') },
    ]);
    if (!v.league) k.add(new MBar(this, tx, y + 25, tw, { value: v.placements.played, max: v.placements.of, color: MOSAIC.gold, h: 4 }));
    return y + cs + 6;
  }

  /** The Arena: the season, then Live PvP and Raids; a locked mode is a progress card, never live stats. */
  private buildArenaHome(p: DuelProfileView, keep: number): void {
    const r = this.ranked;
    const a = this.asyncView;
    const now = Date.now();
    const team = this.teamHeroes(p, 'arena');
    const problem = teamProblem(team, DUEL_RULES.budget);
    const cooldown = r && r.cooldownUntil > now ? r.cooldownUntil : 0;
    const match = r?.match ?? null;
    const noDefence = !!a && a.unlocked && !a.defence;
    const sentence = match
      ? t('duels.sit.rejoin')
      : cooldown
        ? t('duels.sit.cooldown', { t: fmtClock((cooldown - now) / 1000) })
        : problem === 'over_budget'
          ? t('duels.sit.arenaOver', { n: DUEL_RULES.budget })
          : problem
            ? t(`duels.why.${problem}` as TKey, { n: DUEL_RULES.budget })
            : noDefence
              ? t('duels.sit.raidNoDefence')
              : '';
    const { c, w } = this.openShell(true, '');
    let y = this.hubTop(c, 2, w, p, 'arena');
    const urgent = !!cooldown || !!problem;
    if (sentence && (urgent || match || noDefence)) y += addTipLine(this, c, 1, y, w, { text: sentence, tone: urgent ? 'warn' : match ? 'reward' : 'info', dismissId: !urgent && !match ? 'duel.raid.noDefence' : undefined, id: 'duel.tip' }) + GAP;
    y = this.buildSeasonLine(c, 1, y, w) + 2;
    // ranked and raids closed at the same level: one card says so, with one bar (not two identical ones)
    const together = !!r && !r.unlocked && !r.match && !!a && !a.unlocked && r.unlockLevel === a.unlockLevel;
    y += this.liveCard(c, p, 1, y, w, together) + GAP;
    if (!together) y += this.raidCard(c, p, 1, y, w) + GAP;
    this.finishPage(y, keep);
  }

  /**
   * Live PvP. Ranked open: the standing, what a win pays, Find match (the one
   * terracotta action) and Unranked. Ranked locked: Play unranked is the
   * primary and ranked is a progress card (duel level x of 5, what to do).
   */
  private liveCard(c: Phaser.GameObjects.Container, p: DuelProfileView, x: number, y: number, w: number, withRaids = false): number {
    const r = this.ranked;
    const now = Date.now();
    const team = this.teamHeroes(p, 'arena');
    const problem = teamProblem(team, DUEL_RULES.budget);
    const cooldown = r && r.cooldownUntil > now ? r.cooldownUntil : 0;
    const locked = !!r && !r.unlocked;
    const match = r?.match ?? null;
    const level = levelProgress(p.xp).level;
    const iw = w - 16;
    const why = this.entering ? t('duel.preparing') : cooldown ? t('duels.unq.cooldown') : problem ? t(`duels.why.${problem}` as TKey, { n: DUEL_RULES.budget }) : !r ? t('duels.unq.error') : undefined;
    let h = this.arenaCard(c, x, y, w, 'duel.liveCard', (k) => {
      let ly = this.cardTitle(k, w, { title: t('duels.card.live'), icon: MODE_ICON.arena, board: 'live', id: 'duel.live' });
      const line = (text: string, font: 'ink' | 'sec' | 'bad') => {
        ly += pwrap(this, k, 8, ly, text, iw, 2, font) + 4;
      };
      if (!r) {
        ptext(this, k, 8, ly, '...', 'sec');
        ly += 14;
      } else if (locked && !match) {
        line(t('dv.unrankedLine', { w: fmtSigned(RANKED.glory.unranked.win), l: fmtSigned(RANKED.glory.unranked.loss) }), 'sec');
        if (cooldown) line(t('duels.cooldown', { t: fmtClock((cooldown - now) / 1000) }), 'bad');
        else if (problem) line(why!, 'bad');
        const un = new MButton(this, 8, ly, iw, 26, { label: t('dv.playUnranked'), icon: 'swords', variant: 'primary', id: 'duel.findUnranked', tip: t('duels.unrankedTip', { w: fmtSigned(RANKED.glory.unranked.win), l: fmtSigned(RANKED.glory.unranked.loss) }), onClick: () => this.findMatch('unranked') });
        if (why) un.setEnabled(false, why);
        k.add(un);
        ly += 26 + 7;
      } else {
        ly = this.standingRow(k, ly, w, r);
        if (match) line(t('duels.rejoinHint'), 'ink');
        else if (cooldown) line(t('duels.cooldown', { t: fmtClock((cooldown - now) / 1000) }), 'bad');
        else if (problem) line(why!, 'bad');
        else line(t('duels.payRanked', { w: fmtSigned(RANKED.glory.ranked.win), l: fmtSigned(RANKED.glory.ranked.loss) }), 'sec');
        const unLabel = t('duels.unranked');
        const uw = match ? 0 : Math.min(Math.floor(iw / 2), Math.ceil(mw(unLabel.toUpperCase(), 'rCream', 7)) + 18);
        const mwid = iw - (uw ? uw + GAP : 0);
        const findLabel = t('duels.findMatch');
        const main = match
          ? new MButton(this, 8, ly, mwid, 26, { label: t('duels.rejoin'), icon: 'swords', variant: 'primary', id: 'duel.rejoin', onClick: () => this.enterMatch(match.id, match.mode) })
          : new MButton(this, 8, ly, mwid, 26, { label: findLabel, icon: 'swords', variant: 'primary', id: 'duel.findRanked', onClick: () => this.findMatch('ranked') });
        const mainOff = match ? (this.entering ? t('duel.preparing') : undefined) : why;
        if (mainOff) main.setEnabled(false, mainOff);
        k.add(main);
        if (uw) {
          const un = new MButton(this, 8 + mwid + GAP, ly, uw, 26, { label: unLabel, variant: 'secondary', id: 'duel.findUnranked', tip: t('duels.unrankedTip', { w: fmtSigned(RANKED.glory.unranked.win), l: fmtSigned(RANKED.glory.unranked.loss) }), onClick: () => this.findMatch('unranked') });
          if (why) un.setEnabled(false, why);
          k.add(un);
        }
        ly += 26 + 7;
      }
      return ly;
    });
    // ranked closed: where the player stands on the way to it
    if (r && locked && !match) {
      h += GAP;
      h += addLockedCard(this, c, x, y + h, w, {
        title: withRaids ? t('dv.unlocksAt', { n: r.unlockLevel }) : t('dv.rankedTitle'),
        icon: withRaids ? 'xp' : 'trophy',
        reason: withRaids ? t('dv.unlocksBoth') : t('dv.unlockReason', { n: r.unlockLevel }),
        progress: { value: Math.min(level, r.unlockLevel), max: r.unlockLevel, label: t('dv.lvProgress') },
        how: t('dv.rankedHow'),
      });
    }
    return h;
  }

  /** Raids: the standing, raids left today, the defence (a tap edits it), the defender picks and the log; locked: a progress card. */
  private raidCard(c: Phaser.GameObjects.Container, p: DuelProfileView, x: number, y: number, w: number): number {
    const a = this.asyncView;
    if (a && !a.unlocked) {
      const level = levelProgress(p.xp).level;
      return addLockedCard(this, c, x, y, w, {
        title: t('dv.raidsTitle'),
        icon: 'raid',
        reason: t('dv.unlockReason', { n: a.unlockLevel }),
        progress: { value: Math.min(level, a.unlockLevel), max: a.unlockLevel, label: t('dv.lvProgress') },
        how: t('dv.raidsHow'),
      });
    }
    const iw = w - 16;
    return this.arenaCard(c, x, y, w, 'duel.raidCard', (k) => {
      let ly = this.cardTitle(k, w, { title: t('duels.card.raids'), icon: MODE_ICON.raid, board: 'async', id: 'duel.raids' });
      if (!a) {
        ptext(this, k, 8, ly, '...', 'sec');
        ly += 14;
      } else {
        ly = this.standingRow(k, ly, w, a);
        ptext(this, k, 8, ly, t('duels.raid.leftToday', { n: a.attacks.left, max: a.attacks.cap }), a.attacks.left > 0 ? 'ink' : 'muted', { maxW: iw });
        ly += 13;
        ly += this.defenceRow(k, p, a, 8, ly, iw) + 4;
        const lw = Math.max(50, Math.ceil(mw(t('dv.log').toUpperCase(), 'rCream', 7)) + 30);
        k.add(new MButton(this, 8, ly, iw - lw - GAP, 26, { label: t('duels.raid.pickBtn'), icon: 'raid', variant: 'secondary', id: 'duel.raid.open', onClick: () => this.openArena('raid') }));
        k.add(new MButton(this, 8 + iw - lw, ly, lw, 26, { icon: 'log', label: t('dv.log'), variant: 'neutral', id: 'duel.raid.log', tip: t('duels.raid.log'), onClick: () => void this.openRaidLog() }));
        ly += 26 + 7;
      }
      return ly;
    });
  }

  /** The defence team as a tappable row: two lines that wrap (never cut), a chevron. Returns its height. */
  private defenceRow(parent: Phaser.GameObjects.Container, p: DuelProfileView, a: AsyncView, x: number, y: number, w: number): number {
    const def = a.defence;
    const label = def ? t('duels.raid.defence', { team: this.loadoutName(p, p.use.defence) }) : t('duels.raid.noDefence');
    const sub = def ? t('duels.raid.defSub', { n: def.heroes, pts: fmtCount(def.points), w: fmtCount(a.defenceWins), d: fmtCount(a.defences) }) : t('duels.raid.noDefenceSub');
    const tw = w - 22 - 18;
    const wl = wrapText(label, tw, 1);
    const ws = wrapText(sub, tw, 2);
    const h = Math.max(26, 6 + LINE_H + ws.lines.length * LINE_H + 4);
    parent.add(mosaicImage(this, x, y, w, h, def ? 'parchmentWell' : 'parchmentSel'));
    parent.add(addIcon(this, x + 5, Math.round(y + (h - 12) / 2), 'shield'));
    // no defence yet is a task, not an alert: ink on the lit card (A11Y-05: red only for alerts)
    ptext(this, parent, x + 22, y + 5, wl.lines[0] ?? '', 'ink');
    ptext(this, parent, x + 22, y + 5 + LINE_H, ws.lines.join('\n'), 'sec');
    parent.add(addIcon(this, x + w - 15, Math.round(y + (h - 12) / 2), 'chevR'));
    const z = this.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive();
    uiId(z, 'duel.raid.defence');
    tappable(z, null, () => !this.area?.moved && this.openDefence());
    parent.add(z);
    return h;
  }

  /**
   * The search takes the page: a pulsing arena with rings that widen like the
   * search range, the clock, how the range widens (a bar that fills until
   * anyone will do) and your lineup in pixels; ranked adds your league.
   * Navigation waits (Cancel is the fixed action).
   */
  private buildSearch(p: DuelProfileView, s: { mode: DuelMode; since: number }): void {
    const { area, c, w } = this.openShell(false, this.viewTitle(), { label: t('common.cancel'), icon: 'xmark', secondary: true, id: 'duel.cancelSearch', onClick: () => this.cancelSearch() });
    const mid = 1 + w / 2;
    let y = 6;
    // the arena and its rings (tweens on two graphics: nothing is created per frame)
    const big = area.viewHeight >= 230 ? 3 : 2;
    const r = 6 * big + 10;
    const cy = y + r + 2;
    const rings = [0, 1].map(() => {
      const g = this.add.graphics({ x: mid, y: cy });
      g.lineStyle(1.5, MOSAIC.bronze, 0.9);
      g.strokeCircle(0, 0, r);
      c.add(g);
      return g;
    });
    const disc = this.add.graphics({ x: mid, y: cy });
    disc.fillStyle(MOSAIC.stone1, 1);
    disc.fillCircle(0, 0, r - 3);
    disc.lineStyle(1.2, MOSAIC.meander, 0.9);
    disc.strokeCircle(0, 0, r - 3);
    c.add(disc);
    // painted at its shown size, not a 12 px icon blown up (DUE-6)
    const icon = addCrispIcon(this, mid, cy, MODE_ICON.arena, 12 * big);
    c.add(icon);
    if (!motion.reduced) {
      rings.forEach((g, i) => this.tweens.add({ targets: g, scale: { from: 1, to: 1.9 }, alpha: { from: 0.9, to: 0 }, duration: 1800, delay: i * 900, repeat: -1, ease: 'Cubic.easeOut' }));
      this.tweens.add({ targets: icon, scale: { from: icon.scale, to: icon.scale * 1.08 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else rings.forEach((g) => g.setAlpha(0));
    y = cy + r + 8;
    const clock = t('duels.searching', { t: '00:00' });
    const clockSize = [12, 11, 10, 9, 8].find((z) => mw(clock, 'rInk', z) <= w - 8) ?? 8;
    this.searchText = ptext(this, c, mid, y, t('duels.searching', { t: fmtClock((Date.now() - s.since) / 1000) }), 'head', { size: clockSize, align: 0.5 });
    y += 20;
    // how the range widens: a bar that fills until anyone will do (an honest wait, not a guess)
    const openMs = RANKED.window[s.mode].openAfterMs;
    const el = Date.now() - s.since;
    // the label goes when it would be cut beside the longest countdown (G14): the hint under the bar says the same
    const longest = t('dv.searchOpensIn', { t: fmtClock(openMs / 1000) });
    const label = pw(t('dv.searchRange'), 'sec') + 8 + pw(longest) <= w - 16 ? t('dv.searchRange') : undefined;
    this.searchBar = new MBar(this, 9, y, w - 16, { value: Math.min(el, openMs), max: openMs, h: 4, label, right: el >= openMs ? t('dv.searchAnyone') : t('dv.searchOpensIn', { t: fmtClock((openMs - el) / 1000) }), color: MOSAIC.gold });
    c.add(this.searchBar);
    y += this.searchBar.h + 6;
    y += pwrap(this, c, mid - (w - 16) / 2, y, t(`duels.searchHint.${s.mode}` as TKey, { t: fmtClock(openMs / 1000) }), w - 16, 3, 'sec', 0.5) + 8;
    // your lineup: the arena team in pixels (who is about to fight)
    const team = this.teamHeroes(p, 'arena');
    if (team.length) {
      const per = Math.min(5, Math.max(1, team.length));
      const ps = Math.min(26, Math.floor((w - 16 - (per - 1) * 3) / per));
      const rowsN = Math.ceil(team.length / per);
      const lh = 18 + rowsN * (ps + 3) + 4;
      const card = new ParchmentCard(this, 1, y, w, lh, { id: 'duel.lineup' });
      c.add(card);
      ptext(this, card, 8, 5, t('dv.searchTeam', { n: team.length, pts: fmtCount(teamPoints(team)), cap: fmtCount(DUEL_RULES.budget) }), 'sec', { maxW: w - 16 });
      team.forEach((h, i) => addFace(this, card, 8 + (i % per) * (ps + 3), 17 + Math.floor(i / per) * (ps + 3), ps, h));
      y += lh + GAP + 3;
    }
    // ranked: your league under it
    const rv = this.ranked;
    if (s.mode === 'ranked' && rv) {
      y += this.arenaCard(c, 1, y, w, 'duel.myLeague', (k) => {
        const cs = 30;
        addCrest(this, k, 8, 8, cs, rv.league);
        const tx = 8 + cs + 7;
        ptext(this, k, tx, 9, this.standing(rv), 'ink', { maxW: w - 8 - tx });
        inlineNumbers(this, k, tx, 22, w - 8 - tx, [
          { icon: 'trophy', value: fmtCount(rv.wins), word: t('duels.num.won') },
          { icon: 'skull', value: fmtCount(rv.losses), word: t('duels.num.lost') },
        ]);
        return cs + 16;
      }) + GAP;
    }
    this.finishPage(y, 0);
  }

  private buildFound(p: DuelProfileView, f: { name: string; league: League | null }): void {
    void p;
    const { c, w } = this.openShell(false, this.viewTitle(), { label: t('duel.preparing'), secondary: true, off: t('duel.preparing'), id: 'duel.preparing', onClick: () => undefined });
    const cs = 36;
    const h = cs + 66;
    const card = new ParchmentCard(this, 1, 8, w, h, { selected: true, id: 'duel.foundCard' });
    c.add(card);
    const mid = w / 2;
    const sides: [number, string, League | null][] = [
      [w / 4, t('duels.board.you'), this.ranked?.league ?? null],
      [(w * 3) / 4, f.name, f.league],
    ];
    for (const [sx, name, league] of sides) {
      addCrest(this, card, Math.round(sx - cs / 2), 10, cs, league);
      ptext(this, card, sx, 14 + cs, name, 'ink', { align: 0.5, maxW: w / 2 - 8 });
      if (league) {
        // centred on the column: measure first (the chip sizes itself to its word)
        const label = leagueName(league);
        const lw = Math.min(w / 2 - 8, armyPillW(label));
        addLeaguePill(this, card, Math.round(sx - lw / 2), 26 + cs, league, label, w / 2 - 8);
      }
    }
    ptext(this, card, mid, 10 + cs / 2 - 5, t('battle.vsShort'), 'head', { size: 9, align: 0.5, maxW: w / 2 - cs - 4 }); // between the crests ('против' is wide)
    const prep = ptext(this, card, mid, h - 14, t('duel.preparing'), 'sec', { align: 0.5, maxW: w - 12 });
    this.tweens.add({ targets: prep, alpha: { from: 1, to: 0.4 }, duration: 700, yoyo: true, repeat: -1 });
    this.finishPage(8 + h + GAP, 0);
  }

  private tickSearch(): void {
    if (this.search && this.searchText?.active) {
      this.searchText.setText(t('duels.searching', { t: fmtClock((Date.now() - this.search.since) / 1000) }));
      const openMs = RANKED.window[this.search.mode].openAfterMs;
      const el = Date.now() - this.search.since;
      if (this.searchBar?.active) this.searchBar.setValue(Math.min(el, openMs), openMs, el >= openMs ? t('dv.searchAnyone') : t('dv.searchOpensIn', { t: fmtClock((openMs - el) / 1000) }));
    }
    // a running cooldown counts down on the Live card (only the Arena's cards: other views keep their lists)
    if (!this.search && !this.found && this.tab === 'ranked' && this.arenaTab === 'home' && this.ranked?.cooldownUntil && this.profile && this.st === 'ready') {
      if (this.ranked.cooldownUntil <= Date.now()) this.ranked.cooldownUntil = 0;
      this.buildBody();
    }
  }

  /** Joins a queue: the Arena shows the search until a match is found or the server refuses. */
  findMatch(mode: DuelMode): void {
    if (this.search || this.found || this.entering) return;
    const since = Date.now();
    this.search = { mode, since, cancel: () => undefined };
    this.search.cancel = this.src.queue(mode, (e) => this.onQueue(e));
    this.tab = 'ranked';
    this.mode = 'ranked';
    this.arenaTab = 'home';
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
      this.mode = 'ranked';
      this.arenaTab = 'home';
      hapticNotify('success');
      this.buildBody();
      this.holdFound(this.found);
    } else if (this.search && (e.type === 'unqueued' || e.type === 'error')) {
      this.search = null;
      if (e.type === 'error' || e.reason !== 'cancelled') {
        hapticNotify('error');
        toast(this, e.type === 'error' ? apiErrorText(400, e.code ?? '', e.message) : t(`duels.unq.${e.reason}` as TKey), 'bad', 3000);
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
    showReport(this.game, rankedReport(report, t('battle.vs', { name: demoName('Hektor') }), this.src.demo), () => backToDuel(this.game, { tab: 'ranked', arena: 'home', preview: this.src.demo }));
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
      defender: { pid: 901, name: demoName('Lysander') },
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

  /** Previews: the report of a won ladder floor (`expired`: reported after the 30-minute ticket, so it paid nothing), then the hub's toast. */
  previewLadderResult(expired = true): void {
    const p = this.profile;
    if (!p) return;
    const team = this.teamHeroes(p, 'ladder');
    const n = Math.min(LADDER.floors, p.ladder.cleared + 1);
    lastBattle.heroes = team.map((h) => JSON.parse(JSON.stringify(h)) as Hero);
    lastBattle.side = 0;
    lastBattle.stats = team.map((h, i) => ({ heroId: h.id, side: 0 as const, kills: i % 2, dmg: 18 + i * 7, dead: false, ko: false, killedBy: -1 }));
    const f = ladderFloor(n);
    const r: LadderReport = {
      floor: n, boss: f.boss, won: true, firstClear: !expired, winner: 0, ticks: 20 * 64,
      glory: expired ? 0 : f.reward.firstGlory, capped: 0, accountXp: expired ? 0 : f.reward.xp,
      xp: team.map((h) => ({ heroId: h.id, name: h.name, kills: 0, xp: expired ? 0 : 20, levelsGained: 0, levelBefore: h.level, xpBefore: h.xp })),
      drop: null, enemies: { dead: f.heroes.length, total: f.heroes.length }, stars: expired ? 0 : 3, lost: 0.1,
      prevStars: 0, bestStars: expired ? 0 : 3, newBest: !expired, expired, profile: p,
    };
    const label = t('battle.vs', { name: f.boss ? t('duels.floorBoss', { n }) : t('duels.floor', { n }) });
    showReport(this.game, ladderReport(r, label, this.src.demo), () => backToDuel(this.game, { tab: 'ladder', preview: this.src.demo, result: { glory: r.glory, won: r.won, floor: r.floor, first: r.firstClear, stars: r.stars, newBest: r.newBest, expired } }));
  }

  // ------------------------------------------------------------------ raids (async defence ladder)

  /** The raid picks: raids left, the defence team, the three defenders (the fixed action raids the picked one). */
  private buildRaid(p: DuelProfileView, keep: number): void {
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
        ? t('duels.sit.raidLocked', { n: a.unlockLevel, l: levelProgress(p.xp).level })
        : !a.defence
          ? t('duels.sit.raidNoDefence')
          : a.attacks.left <= 0
            ? t('duels.sit.raidCapped')
            : t('d5.sit.raid');
    const main: MainAction | null = a ? { label: pick && this.m.VW >= 170 ? t('duels.raid.go', { name: pick.name }) : t('duels.raid.attack'), icon: 'swords', id: 'duel.raid.attack', off: why, onClick: () => pick && void this.raid(pick.pid) } : null;
    const { area, c, w } = this.openShell(false, this.viewTitle(), main);
    let y = 2;
    y += this.headerRow(c, y, w, p, {}) + GAP;
    if (!a) {
      // loading rows, or the picks did not load: Retry
      if (this.asyncFailed) y += this.noticeCard(c, y, w, { icon: 'tent', title: t('econ.error'), hint: t('d5.raidError'), id: 'duel.raid.error', retry: () => this.openArena('raid') }) + GAP;
      else y = this.skeletonRows(c, y, w, 4, 28);
      this.finishPage(y, 0);
      return;
    }
    // what the page says now (no defence yet, or the raids left): a task, not an alert, so never red (A11Y-05)
    y += addTipLine(this, c, 1, y, w, { text: sentence, tone: 'info', id: 'duel.tip', maxLines: 3 }) + GAP;
    // raids left and the raid league on one line
    const left = t('duels.raid.leftLong', { n: fmtCount(a.attacks.left), max: fmtCount(a.attacks.cap) });
    const lt = ptext(this, c, w - 1, y, left, a.attacks.left > 0 ? 'ink' : 'bad', { align: 1 });
    ptext(this, c, 3, y, this.standing(a), 'sec', { maxW: w - lt.width - 14 });
    y += 14;
    y += this.defenceRow(c, p, a, 1, y, w) + GAP + 2;
    const empty = !a.unlocked
      ? { icon: 'shield', title: t('duels.raid.locked', { n: a.unlockLevel }), hint: t('duels.raid.lockedHint') }
      : a.attacks.left <= 0
        ? { icon: 'hourglass', title: t('duels.raid.capped'), hint: t('duels.raid.cappedHint') }
        : !cands.length
          ? { icon: 'flag', title: t('duels.raid.none'), hint: t('duels.raid.noneHint') }
          : null;
    // the heading, with the log beside it
    const lw = Math.max(50, Math.ceil(mw(t('dv.log').toUpperCase(), 'rCream', 7)) + 30);
    c.add(new MButton(this, 1 + w - lw, y, lw, 22, { icon: 'log', label: t('dv.log'), variant: 'neutral', id: 'duel.raid.logStrip', tip: t('duels.raid.log'), onClick: () => void this.openRaidLog() }));
    // the heading steps down to 6.5, and is left out rather than cut beside the log (G14): the tip above says the same
    const pickHead = t('duels.raid.pick');
    const headSize = [7.5, 7, TEXT_MIN].find((z) => pw(pickHead, 'head', z) <= w - lw - 8);
    if (!empty && headSize) ptext(this, c, 3, y + 7, pickHead, 'head', { size: headSize });
    y += 22 + GAP + 2;
    if (empty) {
      // nobody in range can change: that one offers Retry (M-6)
      const retry = a.unlocked && a.attacks.left > 0 ? () => this.openArena('raid') : undefined;
      const h = this.noticeCard(c, y, w, { ...empty, id: 'duel.raid.empty', retry });
      this.finishPage(y + h + GAP, keep);
      return;
    }
    const tiers = cands.length === 3 ? (['lo', 'eq', 'hi'] as const) : null;
    cands.forEach((cd, i) => {
      const rowH = 28;
      const sel = cd.pid === this.raidPick;
      const row = new ParchmentCard(this, 1, y, w, rowH, { selected: sel, id: `duel.raid.row.${i}` });
      c.add(row);
      let tw = 0;
      if (tiers) {
        const tt = ptext(this, row, w - 8, 5, t(`duels.raid.tier.${tiers[i]}` as TKey), 'sec', { align: 1 });
        tw = tt.width + 6;
      }
      // the pick is lit and checked, never colour alone (G13)
      const nx = sel ? 22 : 8;
      if (sel) row.add(addIcon(this, 7, 3, 'check'));
      ptext(this, row, nx, 5, cd.name, sel ? 'head' : 'ink', { maxW: w - nx - 8 - tw });
      const league = cd.league ? (cd.league.id === 'legend' && cd.rating !== null ? fmtCount(cd.rating) : leagueName(cd.league)) : null;
      const sub = league ? t('duels.raid.foeLong', { league, n: cd.heroes, pts: fmtCount(cd.points) }) : t('duels.raid.foe', { n: cd.heroes, pts: fmtCount(cd.points) });
      ptext(this, row, 8, 16, sub, 'sec', { maxW: w - 16 });
      this.rowTap(row, () => area, w, rowH, 'duel.raid.pick', () => {
        this.raidPick = cd.pid;
        this.buildBody();
      });
      y += rowH + GAP;
    });
    this.finishPage(y, keep);
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
    const w = Math.min(VW - 12, 220);
    const inner = w - (SPACE.lg + 2) * 2;
    const rowH = 26;
    const n = p.loadouts.length;
    // the hint gets the lines the teams leave (short screens: fewer, or none)
    const fixed = SHEET_PAD + 6 + n * (rowH + GAP);
    const hintLines = Math.max(0, Math.min(3, Math.floor((VH - 12 - fixed) / LINE_H)));
    const wr = hintLines ? wrapText(t('duels.def.hint', { n: DUEL_RULES.budget }), inner, hintLines) : { lines: [] as string[] };
    const m = openParchmentSheet(this, { title: t('duels.def.title'), w, h: fixed + wr.lines.length * LINE_H, id: 'duel.defSheet' });
    const { c, body: b } = m;
    let y = b.y;
    if (wr.lines.length) ptext(this, c, b.x, y, wr.lines.join('\n'), 'sec');
    y += wr.lines.length * LINE_H + 6;
    for (const l of p.loadouts) {
      const heroes = this.heroesOf(p, l.team);
      const pts = teamPoints(heroes);
      const problem = teamProblem(heroes, DUEL_RULES.budget);
      const on = p.use.defence === l.slot && !!p.defence;
      const btn = new MButton(this, b.x, y, inner, rowH, {
        label: `${presetLabel(l)} · ${t('duels.teamLine', { n: heroes.length, max: DUEL_RULES.teamMax, pts })}`,
        icon: on ? 'check' : 'shield',
        variant: on ? 'secondary' : 'neutral',
        id: `duel.def.${l.slot}`,
        onClick: () => (m.close(), void this.act(() => this.src.loadout({ slot: l.slot, use: ['defence'] }), () => t('duels.def.set', { team: presetLabel(l) })).then(() => this.loadAsync())),
      });
      if (problem) btn.setEnabled(false, t(`duels.why.${problem}` as TKey, { n: DUEL_RULES.budget }));
      c.add(btn);
      y += rowH + GAP;
    }
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
    const w = Math.min(VW - 12, 230);
    const rowH = 30;
    const list = entries;
    const listH = Math.min(Math.max(1, list.length) * (rowH + 2), VH - 12 - SHEET_PAD - 4);
    const m = openParchmentSheet(this, { title: t('duels.log.title'), w, h: SHEET_PAD + listH + 4, id: 'duel.logSheet' });
    const { c, body: b } = m;
    const now = Date.now();
    if (!list.length) ptext(this, c, m.x + w / 2, b.y + 8, t('duels.log.empty'), 'ink', { align: 0.5, maxW: b.w });
    else {
      const sa = new ScrollArea(this, c, b.x, b.y, b.w, listH, this.m.S);
      c.once('destroy', () => sa.destroy());
      list.forEach((e, i) => {
        const pwid = b.w - 3;
        const y = i * (rowH + 2);
        sa.content.add(new ParchmentCard(this, 0, y, pwid, rowH));
        sa.content.add(addIcon(this, 4, y + 4, e.role === 'defence' ? 'shield' : 'swords'));
        const res = e.score === 1 ? t('duels.log.won') : e.score === 0.5 ? t('duels.log.draw') : t('duels.log.lost');
        const d = e.delta >= 0 ? `+${e.delta}` : `${e.delta}`;
        const rt = ptext(this, sa.content, pwid - 6, y + 4, res, e.score === 1 ? 'good' : e.score === 0 ? 'bad' : 'ink', { align: 1 });
        const who = e.role === 'defence' ? t('duels.log.defence', { name: e.name }) : t('duels.log.attack', { name: e.name });
        ptext(this, sa.content, 19, y + 4, who, 'ink', { maxW: pwid - 19 - rt.width - 10 });
        const sub = [fmtAgoText(now - e.at), t('duels.log.delta', { d }), ...(e.glory ? [t('duels.note.glory', { n: e.glory })] : [])].join(' · ');
        ptext(this, sa.content, 19, y + 16, sub, 'sec', { maxW: pwid - 23 });
      });
      sa.setContentHeight(list.length * (rowH + 2));
    }
  }

  // ------------------------------------------------------------------ leaderboards

  /** A leaderboard: the season's title line, the top 50, your own row pinned under it. */
  private buildBoard(keep: number): void {
    const rowH = 27;
    const v = this.boardView && this.boardView.board === this.board ? this.boardView : null;
    // "You" is pinned at the bottom always (M-5): your row, or why you have none
    const pinned = !!v;
    const { c, w } = this.openShell(false, this.viewTitle(), null, pinned ? rowH + GAP : 0);
    let y = 2;
    // the Live board's second level: everyone, or the Legend league only
    if (this.board !== 'async') {
      const boards: Board[] = ['live', 'legend'];
      c.add(
        new SegmentedSwitch(this, 1, y, w, {
          options: [{ id: 'live', label: t('dv.board.live') }, { id: 'legend', label: t('dv.board.legend') }],
          selected: this.board,
          id: 'duel.board',
          onChange: (id) => this.openBoard(boards.find((b) => b === id) ?? 'live'),
        }),
      );
      y += 24 + GAP + 1;
    }
    // the season line wraps rather than being cut (DUE-3)
    const sentence = t('duels.sit.top', { season: this.season ? seasonName(this.season.season.id) : '...' });
    y += pwrap(this, c, 3, y, sentence, w - 6, 2, 'sec') + 3;
    const title = this.season?.title;
    if (title) {
      y += pwrap(this, c, 3, y, t('duels.titleLine', { title: t('duels.titleOf', { league: leagueTitle(title.league), season: seasonName(title.season) }) }), w - 6, 2, 'sec') + 3;
    }
    y += 2;
    if (!v) {
      // loading rows, or the board did not load: Retry (M-5 states)
      if (this.boardFailed) y += this.noticeCard(c, y, w, { icon: 'tent', title: t('econ.error'), hint: t('d5.boardError'), id: 'duel.board.error', retry: () => this.openBoard(this.board) }) + GAP;
      else y = this.skeletonRows(c, y, w, 5, rowH - 1);
      this.finishPage(y, 0);
      return;
    }
    if (!v.rows.length) {
      y += this.noticeCard(c, y, w, { icon: 'podium', title: t('d5.boardEmpty'), hint: t('duels.board.empty'), id: 'duel.board.empty' }) + GAP;
    } else {
      for (const r of v.rows) {
        this.boardRow(r, c, 1, y, w, r.pid === v.me?.pid);
        y += rowH + GAP - 1;
      }
    }
    this.finishPage(y, keep);
    const box = this.area!.bounds;
    const holder = this.add.container(box.x + 1, box.y + box.h + 2);
    this.body.add(holder);
    if (v.me) this.boardRow(v.me, holder, 0, 0, w, true, true);
    else {
      holder.add(new ParchmentCard(this, 0, 0, w, rowH - 1, { id: 'duel.board.me' }));
      const why = this.board === 'legend' ? t('d5.board.notLegend') : t('duels.board.notPlaced', { n: fmtCount(RANKED.placements) });
      ptext(this, holder, 8, 8, why, 'sec', { maxW: w - 16 });
    }
  }

  /**
   * A leaderboard row: the rank on a medal (gold, silver, bronze for the top
   * three; a plain well below), the league's crest, the name, the rating (or
   * the league where there is none). Your own row is lit (in the list and
   * pinned under it) and says "You" by your name; a pinned row has the id
   * `duel.board.me`.
   */
  private boardRow(r: LeaderboardView['rows'][number], parent: Phaser.GameObjects.Container, x: number, y: number, w: number, me: boolean, pin = false): void {
    const h = 26;
    const row = new ParchmentCard(this, x, y, w, h, { selected: me, id: pin ? 'duel.board.me' : `duel.board.${r.rank}` });
    parent.add(row);
    addRankMedal(this, row, 14, h / 2, r.rank);
    addCrest(this, row, 29, 3, h - 6, r.league);
    let rw = 0;
    if (r.rating !== null) {
      const rt = ptext(this, row, w - 8, 9, fmtCount(r.rating), 'ink', { align: 1 });
      rw = rt.width + 6;
    } else rw = addLeaguePill(this, row, w - 6, 7, r.league, leagueName(r.league), Math.floor(w * 0.45), true) + 4;
    const nx = 29 + h - 6 + 6;
    ptext(this, row, nx, 9, me ? t('duels.board.you') : r.name, me ? 'head' : 'ink', { maxW: w - nx - rw - 8 });
  }

  // ------------------------------------------------------------------ season rewards

  /** The popup after a season ended: what each ladder's peak league paid (already in the purse and the wallet). */
  openSeasonRewards(v: SeasonView): void {
    this.rewardShown = true;
    const { VW } = this.m;
    const w = Math.min(VW - 12, 230);
    const inner = w - (SPACE.lg + 2) * 2;
    const rowH = 42;
    const best = v.title;
    const pick = v.rewards.find((r) => r.pick);
    // what the set piece is, whole (DUE-10: it was cut at "piece of yo…")
    const pickLine = pick?.pick ? t('duels.reward.pickLine', { set: tOr(`set.${pick.pick}.name`, SETS[pick.pick]?.name ?? pick.pick) }) : '';
    // a set piece to choose (Strategos and Legend): the button opens the choice; the popup comes back until it is made
    const actions: MButtonOpts[] = [
      pick
        ? { label: t('duels.reward.pick'), variant: 'primary', id: 'duel.reward.pick', onClick: () => (m.close(), this.openSeasonPick(pick)) }
        : { label: t('duels.reward.ok'), variant: 'primary', id: 'duel.reward.ok', onClick: () => m.close() },
    ];
    // nothing on the sheet is cut (G14, DUE-10): the cosmetic's name and the title line wrap, and a row grows with its name
    const tw = inner - 42;
    // every row's heading in one face and size: Cinzel at the largest size all of them fit, else all in Inter
    const lineOf = (r: SeasonRewardView) => t('duels.reward.line', { ladder: t(`duels.board.${r.ladder}` as TKey), league: leagueTitle(r.league) });
    const size = [7.5, 7, TEXT_MIN].find((z) => v.rewards.every((r) => pw(lineOf(r), 'head', z) <= tw));
    const rowsOf = (cosLines: number) =>
      v.rewards.map((r) => {
        const line = lineOf(r);
        const cos = wrapText(tOr(`cosmetic.${r.cosmetic}`, r.cosmetic), tw, cosLines).lines;
        return { r, line, cos, h: rowH + (cos.length - 1) * LINE_H };
      });
    const pickH = pickLine ? wrapText(pickLine, inner, 2).lines.length * LINE_H + 4 : 0;
    const fixedH = SHEET_PAD + 14 + pickH + sheetActionsH(actions, w);
    const rowsH = (rs: ReturnType<typeof rowsOf>) => rs.reduce((s, x) => s + x.h + GAP, 0);
    // the shortest screens keep the cosmetic's name to one line rather than push the button off
    let rows = rowsOf(2);
    if (fixedH + rowsH(rows) > this.m.VH - 12) rows = rowsOf(1);
    const needH = fixedH + rowsH(rows);
    // the season title is on the leaderboard too: it gives way on a screen too short for the whole sheet
    const best0 = best ? t('duels.titleLine', { title: t('duels.titleOf', { league: leagueTitle(best.league), season: seasonName(best.season) }) }) : '';
    const best0H = best0 ? wrapText(best0, inner, 2).lines.length * LINE_H + 4 : 0;
    const titleLine = needH + best0H <= this.m.VH - 12 ? best0 : '';
    const titleH = titleLine ? best0H : 0;
    const m = openParchmentSheet(this, {
      title: this.sheetTitle(t('duels.reward.title'), t('d5.seasonOver'), w),
      w,
      h: needH + titleH,
      actions,
      id: 'duel.rewardsSheet',
      onClose: () => void this.src.seasonSeen().catch(() => undefined),
    });
    const { c, body: b } = m;
    let y = b.y;
    ptext(this, c, m.x + w / 2, y, seasonName(v.rewards[0].season), 'ink', { align: 0.5, maxW: inner });
    y += 14;
    for (const { r, line, cos, h } of rows) {
      c.add(new ParchmentCard(this, b.x, y, inner, h));
      c.add(mosaicImage(this, b.x + 3, y + 7, 28, 28, 'parchmentWell'));
      c.add(addCosmetic(this, b.x + 4, y + 8, r.cosmetic, r.cosmetic.startsWith('duel_banner') ? 'banner' : 'emblem', 26));
      const tx = b.x + 36;
      if (size) ptext(this, c, tx, y + 5, line, 'head', { size });
      else ptext(this, c, tx, y + 5, line, 'ink', { maxW: tw });
      c.add(addIcon(this, tx, y + 15, 'laurel'));
      ptext(this, c, tx + 15, y + 17, t('duels.note.glory', { n: fmtCount(r.glory) }), 'ink', { maxW: tw - 15 });
      ptext(this, c, tx, y + 29, cos.join('\n'), 'sec');
      y += h + GAP;
    }
    if (titleLine) pwrap(this, c, m.x + (w - inner) / 2, y + 2, titleLine, inner, 2, 'sec', 0.5);
    if (pickLine) pwrap(this, c, m.x + (w - inner) / 2, y + 2 + titleH, pickLine, inner, 2, 'good', 0.5);
  }

  /** The season reward's set piece of choice: one button per piece of the set. */
  openSeasonPick(r: SeasonRewardView): void {
    if (!r.pick) return;
    const set = r.pick;
    const { VW } = this.m;
    const w = Math.min(VW - 12, 220);
    const actions: MButtonOpts[] = setPieces(set).map((def) => ({
      label: itemName({ uid: `pick_${def}`, def, rarity: SETS[set].rarity, cond: 100 }),
      variant: 'secondary',
      id: `duel.pick.${def}`,
      onClick: () => {
        m.close();
        void this.act(() => this.src.seasonPick(r.season, r.ladder, def), (res) => t('duels.reward.picked', { name: itemName(res.item) })).then(() => this.loadSeason());
      },
    }));
    // a set name too long for the title goes on its own line under "Choose a piece"
    const setName = tOr(`set.${set}.name`, SETS[set]?.name ?? set);
    const full = t('duels.reward.pickTitle', { set: setName });
    const title = this.sheetTitle(full, t('d5.pickShort'), w);
    const line = title === full ? 0 : 16;
    const m = openParchmentSheet(this, {
      title,
      w,
      h: SHEET_PAD + line + sheetActionsH(actions, w),
      actions,
      id: 'duel.pickSheet',
    });
    if (line) ptext(this, m.c, m.x + w / 2, m.body.y, t('d5.pickSet', { set: setName }), 'ink', { align: 0.5, maxW: w - (SPACE.lg + 2) * 2 });
  }

  // ------------------------------------------------------------------ team

  /**
   * Team (M-3, S13) on the Army template's rows (D6): the chips, a tip, the
   * duel army card (its symbols behind an (i)), Recruit in the flow (DUE-5),
   * the presets (a tap on the edited one opens its Preset sheet: rename,
   * duplicate, delete, where it fights), the points bar, the team's rows,
   * then the bench with its Dismiss door (N10, DUE-13).
   */
  private buildTeam(p: DuelProfileView, keep: number): void {
    const team = this.teamHeroes(p);
    const pts = teamPoints(team);
    const budget = DUEL_RULES.budget;
    const over = pts > budget;
    const spend = this.fightingHeroes(p).filter(heroNeedsAttention);
    const sentence = over ? t('duels.sit.teamOver', { n: pts - budget, b: budget }) : spend.length ? t('duels.sit.teamSpend', { name: heroName(spend[0].name) }) : '';
    const { area, c, w } = this.openShell(false, this.viewTitle());
    let y = 2;
    y += this.headerRow(c, y, w, p) + GAP;
    if (sentence) y += addTipLine(this, c, 1, y, w, { text: sentence, tone: over ? 'warn' : 'info', id: 'duel.tip' }) + GAP;
    // whose heroes these are: the duel army, not the campaign warband
    y += this.rosterRow(c, p, y, w, area) + GAP;
    // Recruit, the view's primary, in the flow: never over a row (DUE-5)
    const full = p.heroes.length >= DUEL_RULES.rosterMax;
    const rec = new MButton(this, 1, y, w, 26, { label: t('duels.recruit'), icon: 'plus', variant: 'primary', id: 'duel.recruit', disabledReason: full ? t('d5.rosterFull') : undefined, onClick: () => this.openRecruit() });
    if (full) rec.setEnabled(false, t('d5.rosterFull'));
    c.add(rec);
    y += 26 + GAP + 2;
    if (!p.heroes.length) {
      ptext(this, c, 3, y + 4, t('duels.recruitHint'), 'muted', { maxW: w - 6 });
      this.finishPage(y + 20, keep);
      return;
    }
    y += this.presetChips(c, p, y, w, area) + GAP;
    y += this.presetPoints(c, p, y, w) + GAP + 2;
    const src = duelArmy(p);
    for (const h of team) {
      this.heroRow(c, p, src, h, y, w, area);
      y += ARMY_ROW_H + GAP;
    }
    const bench = p.heroes.filter((x) => !p.team.includes(x.id));
    if (bench.length) {
      y += 3;
      // the bench's heading, with the door to Dismiss (bench heroes only)
      const label = t('d5.benchDismiss');
      const bw = Math.max(56, Math.ceil(mw(label.toUpperCase(), 'rCream', 7)) + 30);
      c.add(new MButton(this, 1 + w - bw, y, bw, TAP, { label, icon: 'skull', variant: 'neutral', id: 'duel.benchDismiss', tip: t('d5.benchDismissTip'), onClick: () => this.openDismiss() }));
      ptext(this, c, 3, y + 7, t('duels.benchHead', { n: bench.length }), 'head', { size: 7.5, maxW: w - bw - 10 });
      y += TAP + 2;
      c.add(this.add.rectangle(3, y, w - 6, 1, MOSAIC.parchEdge, 0.5).setOrigin(0, 0));
      y += 4;
      for (const h of bench) {
        this.heroRow(c, p, src, h, y, w, area);
        y += ARMY_ROW_H + GAP;
      }
    }
    this.finishPage(y, keep);
  }

  /** Whose heroes these are: the duel army, not the campaign warband; its symbols behind an (i). */
  private rosterRow(c: Phaser.GameObjects.Container, p: DuelProfileView, y: number, w: number, area: ScrollArea): number {
    const bw = TAP;
    const tw = w - 23 - bw - 10;
    const sub = wrapText(t('dv.rosterSub'), tw, 4, false, TEXT_MIN);
    const h = Math.max(30, 6 + 11 + sub.lines.length * LINE_H + 4);
    const card = new ParchmentCard(this, 1, y, w, h, { id: 'duel.rosterCard' });
    c.add(card);
    card.add(addIcon(this, 6, Math.round((h - 12) / 2), 'people'));
    ptext(this, card, 23, 5, t('d5.roster', { n: p.heroes.length, max: DUEL_RULES.rosterMax }), 'head', { size: 7.5, maxW: tw });
    ptext(this, card, 23, 17, sub.lines.join('\n'), 'muted', { size: TEXT_MIN });
    const z = this.add.zone(0, 0, w - bw - 10, h).setOrigin(0, 0).setInteractive();
    uiId(z, 'duel.roster');
    tappable(z, null, () => !area.moved && showTooltip(this, t('dv.rosterTip'), z));
    card.add(z);
    card.add(new MIconButton(this, w - bw - 4, Math.round((h - TAP) / 2), bw, TAP, { label: t('dv.symbols'), icon: 'info', variant: 'neutral', id: 'duel.symbols', onClick: () => this.openSymbols() }));
    return h;
  }

  /** What a roster row's symbols mean (the Army template's): the group disc, the rank stars, the count badge, Power, the lit row. */
  openSymbols(): void {
    const w = Math.min(this.m.VW - 12, 240);
    const inner = w - 16;
    const tx = 30;
    const rows: { draw: (k: Phaser.GameObjects.Container, x: number, y: number) => void; text: string }[] = [
      { draw: (k, x, y) => addGroupDisc(this, k, x + 4, y, 0), text: t('d5.symbols.group') },
      { draw: (k, x, y) => void ptext(this, k, x, y + 2, t('duels.pts', { n: 11 }), 'sec', { size: TEXT_MIN }), text: t('d5.symbols.pts') },
      { draw: (k, x, y) => k.add(new MBadge(this, x + 11, y + 7, 2)), text: t('d5.symbols.badge') },
      { draw: (k, x, y) => void ptext(this, k, x + 22, y + 2, '128', 'head', { size: 7, align: 1 }), text: t('d5.symbols.power') },
      { draw: (k, x, y) => k.add(addIcon(this, x + 4, y + 1, 'check')), text: t('d5.symbols.team') },
    ];
    const wrapped = rows.map((r) => wrapText(r.text, inner - tx, 4, false, TEXT_MIN));
    const bodyH = wrapped.reduce((a, wr) => a + Math.max(16, wr.lines.length * LINE_H) + 6, 0);
    // a short screen scrolls the rows under the title
    const viewH = Math.min(bodyH, this.m.VH - 12 - SHEET_PAD - 2);
    const m = openParchmentSheet(this, { title: t('d5.symbolsTitle'), w, h: SHEET_PAD + viewH + 2, id: 'duel.symbolsSheet' });
    const { c, body: b } = m;
    const sa = new ScrollArea(this, c, b.x, b.y, inner, viewH, this.m.S);
    c.once('destroy', () => sa.destroy());
    let y = 0;
    rows.forEach((r, i) => {
      r.draw(sa.content, 0, y);
      ptext(this, sa.content, tx, y + 2, wrapped[i].lines.join('\n'), 'ink', { size: TEXT_MIN });
      y += Math.max(16, wrapped[i].lines.length * LINE_H) + 6;
    });
    sa.setContentHeight(bodyH);
  }

  /**
   * The presets: one chip each (the edited one lit, with a pen: a tap on it opens its Preset sheet; icons for what
   * it fights on), then "+" while there is room. Returns the height.
   */
  private presetChips(c: Phaser.GameObjects.Container, p: DuelProfileView, y: number, w: number, area: ScrollArea): number {
    const ls = p.loadouts;
    const plus = ls.length < DUEL_RULES.presetsMax;
    const k = ls.length + (plus ? 1 : 0);
    // chips of at least 24 UI px: more of them than fit wrap onto a second row
    const per = Math.max(1, Math.min(k, Math.floor((w + GAP) / (24 + GAP))));
    const rowsN = Math.ceil(k / per);
    const chipW = Math.floor((w - (per - 1) * GAP) / per);
    const at = (i: number) => {
      const col = i % per;
      return { x: 1 + col * (chipW + GAP), cw: col === per - 1 ? w - col * (chipW + GAP) : chipW, y: y + Math.floor(i / per) * (PRESET_H + GAP) };
    };
    ls.forEach((l, i) => {
      const name = presetLabel(l);
      const { x, cw, y: cy } = at(i);
      const edited = l.slot === p.loadout;
      const room = cw - 6 - (edited ? 10 : 0);
      // a name that does not fit: a given name is shortened, a default one ("Team 2") becomes its number
      const label = pw(name) <= room ? name : l.name?.trim() && cw >= 40 ? ellipsize(name, room) : `${l.slot}`;
      c.add(
        new PresetChip(this, x, cy, cw, {
          label,
          uses: LOADOUT_USES.filter((u) => p.use[u] === l.slot).map((u) => USE_ICONS[u]),
          selected: edited,
          tools: edited,
          tip: edited ? t('d5.presetTip', { team: name }) : name,
          id: `duel.preset.${l.slot}`,
          onClick: () => !area.moved && (edited ? this.openPresetSheet(l.slot) : this.selectPreset(l.slot)),
        }),
      );
    });
    if (plus) {
      const { x, cw, y: cy } = at(ls.length);
      c.add(new PresetChip(this, x, cy, cw, { plus: true, tip: t('duels.preset.new'), id: 'duel.preset.new', onClick: () => !area.moved && this.newPreset() }));
    }
    return rowsN * PRESET_H + (rowsN - 1) * GAP;
  }

  /**
   * The Preset sheet (DUE-5, ELEMENT_MAP E320): where the team fights (one labelled button per use; the one in force
   * lit with a check, G13), then Rename and Duplicate, and Delete apart from them (P4).
   */
  openPresetSheet(slot: number): void {
    const p = this.profile;
    const l = p && this.preset(p, slot);
    if (!p || !l) return;
    const w = Math.min(this.m.VW - 12, 240);
    const inner = w - 16;
    const heroes = this.heroesOf(p, l.team);
    const pts = teamPoints(heroes);
    const line = t('duels.teamLine', { n: heroes.length, max: DUEL_RULES.teamMax, pts: fmtCount(pts) });
    const used = LOADOUT_USES.filter((u) => p.use[u] === slot);
    const BH = 24;
    const bodyH = 12 + 14 + 3 * (BH + GAP) + 10 + BH + 12 + BH;
    const m = openParchmentSheet(this, { title: t('d5.presetSheet', { team: presetLabel(l) }), w, h: SHEET_PAD + bodyH + 4, id: 'duel.presetSheet' });
    const { c, body: b } = m;
    let y = b.y;
    ptext(this, c, b.x, y, line, 'sec', { maxW: inner });
    y += 12;
    ptext(this, c, b.x, y, used.length ? t('d5.fightsOn') : t('d5.fightsOnNone'), 'head', { size: 7.5, maxW: inner });
    y += 14;
    LOADOUT_USES.forEach((u) => {
      const on = p.use[u] === slot;
      const label = t(`duels.use.${u}` as TKey);
      const problem = u === 'defence' ? teamProblem(heroes, DUEL_RULES.budget) : heroes.length ? null : 'empty';
      const b2 = new MButton(this, b.x, y, inner, BH, {
        label: on ? `${label} · ${t('d5.useOnShort')}` : label,
        icon: on ? 'check' : USE_ICONS[u],
        variant: on ? 'lit' : 'secondary',
        id: `duel.use.${u}`,
        tip: on ? t('duels.useOn', { use: label }) : t('duels.useTip', { use: label }),
        onClick: () => (on ? toast(this, t('duels.useOn', { use: label }), 'info', 3000) : (m.close(), this.assignUse(u))),
      });
      if (!on && problem) b2.setEnabled(false, t(`duels.why.${problem}` as TKey, { n: DUEL_RULES.budget }));
      c.add(b2);
      y += BH + GAP;
    });
    y += 10 - GAP;
    const full = p.loadouts.length >= DUEL_RULES.presetsMax;
    const last = p.loadouts.length <= 1;
    const hw = Math.floor((inner - GAP) / 2);
    c.add(new MButton(this, b.x, y, hw, BH, { label: t('duels.preset.rename'), icon: 'pen', variant: 'secondary', id: 'duel.preset.rename', onClick: () => (m.close(), void this.renamePreset(slot)) }));
    const dup = new MButton(this, b.x + hw + GAP, y, inner - hw - GAP, BH, { label: t('duels.preset.duplicate'), icon: 'copy', variant: 'secondary', id: 'duel.preset.duplicate', onClick: () => (m.close(), this.duplicatePreset(slot)) });
    if (full) dup.setEnabled(false, t('duels.preset.full', { n: DUEL_RULES.presetsMax }));
    c.add(dup);
    // the destructive action on its own row, 12 px from the others (P4)
    y += BH + 12;
    const del = new MButton(this, b.x, y, inner, BH, { label: t('duels.preset.delete'), icon: 'bin', variant: 'neutral', id: 'duel.preset.delete', onClick: () => (m.close(), this.deletePreset(slot)) });
    if (last) del.setEnabled(false, t('duels.preset.lastOne'));
    c.add(del);
  }

  /** "In the team · 6 of 10" and the points against the budget, with its bar. */
  private presetPoints(c: Phaser.GameObjects.Container, p: DuelProfileView, y: number, w: number): number {
    const team = this.teamHeroes(p);
    const pts = teamPoints(team);
    const budget = DUEL_RULES.budget;
    const over = pts > budget;
    // the team's points against the Arena's cap (ladder floors set their own, shown on each floor)
    const bar = new MBar(this, 3, y, w - 4, { value: Math.min(pts, budget), max: budget, label: t('duels.inTeam', { n: team.length, max: DUEL_RULES.teamMax }), right: t('duels.points', { n: fmtCount(pts), max: fmtCount(budget) }), color: over ? MOSAIC.terraHi : MOSAIC.gold, h: 5, id: 'duel.points' });
    c.add(bar);
    // the whole note, wrapped (never cut mid-sentence)
    const note = wrapText(t('dv.capNote', { cap: budget }), w - 6, 2, false, TEXT_MIN);
    ptext(this, c, 3, y + bar.h + 4, note.lines.join('\n'), over ? 'bad' : 'muted', { size: TEXT_MIN });
    return bar.h + 4 + note.lines.length * LINE_H;
  }

  /**
   * A hero of the duel army on the Army template's roster row (D6): portrait, name and count badge, Lv and class,
   * rank stars, group disc and Power; lit when in the edited team. A tap opens the Hero sheet; the button on the right
   * benches him (a check: in the team) or adds him (+).
   */
  private heroRow(c: Phaser.GameObjects.Container, p: DuelProfileView, src: ArmySource, h: Hero, y: number, w: number, area: ScrollArea): void {
    const inTeam = p.team.includes(h.id);
    const bw = TAP;
    const rw = w - bw - GAP;
    const row = this.add.container(1, y);
    addRosterRow(this, row, rw, ARMY_ROW_H, h, src, inTeam);
    c.add(row);
    uiId(row, `duel.hero.${h.id}`);
    this.rowTap(row, () => area, rw, ARMY_ROW_H, 'duel.heroRow', () => this.openHero(h.id));
    const tog = new MIconButton(this, 1 + rw + GAP, y, bw, ARMY_ROW_H, {
      icon: inTeam ? 'check' : 'plus',
      label: inTeam ? t('duels.bench') : t('duels.toTeam'),
      variant: inTeam ? 'lit' : 'secondary',
      id: inTeam ? 'duel.bench' : 'duel.addToTeam',
      onClick: () => this.toggleTeam(p, h),
    });
    if (!inTeam && p.team.length >= DUEL_RULES.teamMax) tog.setEnabled(false, t('duels.why.too_many'));
    c.add(tog);
  }

  private selectPreset(slot: number): void {
    const p = this.profile;
    if (!p || p.loadout === slot) return;
    void this.act(() => this.src.loadout({ slot, edit: true }));
  }

  /** A new, empty preset (edited at once). */
  newPreset(): void {
    void this.act(
      () => this.src.createLoadout({ from: null }),
      (r) => t('duels.preset.created', { team: this.loadoutName(r.profile, r.slot) }),
    );
  }

  duplicatePreset(slot: number): void {
    void this.act(
      () => this.src.createLoadout({ from: slot }),
      (r) => t('duels.preset.copied', { team: this.loadoutName(r.profile, r.slot) }),
    );
  }

  deletePreset(slot: number): void {
    const p = this.profile;
    if (!p) return;
    const name = this.loadoutName(p, slot);
    confirmDialog(this, {
      title: t('duels.preset.deleteTitle', { team: name }),
      body: t('duels.preset.deleteBody'),
      ok: t('duels.preset.delete'),
      cancel: t('common.cancel'),
      destructive: true,
      onOk: () => void this.act(() => this.src.deleteLoadout(slot), () => t('duels.preset.deleted', { team: name })),
    });
  }

  /** Renames a preset (a small text prompt over the canvas; empty: the default name). */
  async renamePreset(slot: number): Promise<void> {
    const p = this.profile;
    if (!p || this.renaming) return;
    this.renaming = true;
    const visit = this.visit;
    const max = DUEL_RULES.presetNameMax;
    let v: Record<string, string> | null = null;
    try {
      v = await promptFields(t('duels.preset.renameTitle'), [{ name: 'name', label: t('duels.preset.nameLabel', { n: max }), maxLength: max, value: this.preset(p, slot)?.name ?? '', placeholder: t('duels.loadout', { n: slot }) }], t('duels.preset.save'), t('common.cancel'));
    } finally {
      this.renaming = false;
    }
    if (!v || !this.current(visit)) return;
    const name = cleanPresetName(v.name);
    void this.act(() => this.src.loadout({ slot, name }), (r) => t('duels.preset.renamed', { team: this.loadoutName(r.profile, slot) }));
  }

  /** The edited preset fights there from now on. */
  private assignUse(u: LoadoutUse): void {
    const p = this.profile;
    if (!p) return;
    const slot = p.loadout;
    void this.act(
      () => this.src.loadout({ slot, use: [u] }),
      (r) => t('duels.useSet', { team: this.loadoutName(r.profile, slot), use: t(`duels.use.${u}` as TKey) }),
    ).then((r) => r && u === 'defence' && void this.loadAsync());
  }

  toggleTeam(p: DuelProfileView, h: Hero): void {
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
    const w = Math.min(VW - 12, 230);
    const inner = w - (SPACE.lg + 2) * 2;
    // narrow (landscape phones): the price button goes under the name
    const narrow = inner - 3 - 34 - 46 - 8 < 60;
    const rowH = narrow ? 50 : 34;
    const full = DUEL_CLASSES.length * (rowH + GAP);
    const listH = Math.min(full, VH - 12 - SHEET_PAD - 16 - 4);
    const m = openParchmentSheet(this, { title: t('duels.recruitTitle'), w, h: SHEET_PAD + 16 + listH + 4, id: 'duel.recruitSheet' });
    const { c, body: b } = m;
    ptext(this, c, b.x, b.y, t('duels.recruitInfo', { n: fmtCount(p.glory), have: p.heroes.length, max: DUEL_RULES.rosterMax }), 'sec', { maxW: b.w });
    const isFull = p.heroes.length >= DUEL_RULES.rosterMax;
    const sa = new ScrollArea(this, c, b.x, b.y + 16, b.w, listH, this.m.S);
    c.once('destroy', () => sa.destroy());
    DUEL_CLASSES.forEach(({ cls: id, level }, i) => {
      const sample = duelRecruit(7 + i, { nextId: 1 }, 'sample_', id, []);
      const cls = CLASSES[id];
      const locked = levelProgress(p.xp).level < level;
      const price = recruitPrice(id);
      const pwid = b.w - 3;
      const ry = i * (rowH + GAP);
      const k = sa.content;
      k.add(new ParchmentCard(this, 0, ry, pwid, rowH));
      addFace(this, k, 3, ry + 3, 28, sample, locked);
      const bw = 46;
      const why = locked ? t('duels.unlocksAt', { n: level }) : isFull ? t('duels.why.roster_full') : p.glory < price ? t('duels.noGlory') : undefined;
      const tx = 36;
      if (locked) {
        // what opens it, in place of the price
        k.add(addIcon(this, pwid - 16, ry + 5, 'shield', 'D'));
        ptext(this, k, tx, ry + 5, className(sample), 'off', { maxW: pwid - tx - 20 });
        ptext(this, k, tx, ry + 18, t('duels.duelLevel', { n: level }), 'off', { maxW: pwid - tx - 6 });
        this.rowTap(k, () => sa, pwid, rowH, 'duel.classCard', () => openClassCard(this, { hero: sample, title: className(sample) }), 0, ry);
        return;
      }
      const btn = new MButton(this, narrow ? tx : pwid - bw - 4, ry + (narrow ? 25 : 5), bw, 22, {
        label: fmtCount(price),
        icon: 'laurel',
        variant: 'secondary',
        id: 'duel.hire',
        tip: t('duels.hireTip', { name: className(sample), n: fmtCount(price) }),
        onClick: () => (m.close(), void this.act(() => this.src.recruit(id), () => t('town.hired', { name: className(sample) }))),
      });
      if (why) btn.setEnabled(false, why);
      this.rowTap(k, () => sa, narrow ? pwid : pwid - bw - 8, narrow ? 22 : rowH, 'duel.classCard', () => openClassCard(this, { hero: sample, title: className(sample) }), 0, ry);
      k.add(btn);
      if (narrow) {
        ptext(this, k, tx, ry + 4, className(sample), 'ink', { maxW: pwid - tx - 4 });
        ptext(this, k, tx, ry + 14, t('duels.pts', { n: classPoints(id) }), 'sec', { maxW: pwid - tx - 4 });
        return;
      }
      const tw = pwid - tx - bw - 10;
      // the full class name on top; its points and role under it
      ptext(this, k, tx, ry + 5, className(sample), 'ink', { maxW: tw });
      const ptsT = ptext(this, k, tx, ry + 19, t('duels.pts', { n: classPoints(id) }), 'sec');
      armyPill(this, k, tx + ptsT.width + 4, ry + 17, roleName(cls.role), MOSAIC.bronze, Math.max(20, tw - ptsT.width - 4));
    });
    sa.setContentHeight(full);
  }

  /** Dismiss a hero (bench only; their gear goes to the stash). */
  openDismiss(): void {
    const p = this.profile;
    if (!p) return;
    const { VW, VH } = this.m;
    const bench = p.heroes.filter((h) => !p.team.includes(h.id));
    const w = Math.min(VW - 12, 230);
    const inner = w - (SPACE.lg + 2) * 2;
    const rowH = 30;
    const full = Math.max(1, bench.length) * (rowH + GAP);
    const listH = Math.min(full, VH - 12 - SHEET_PAD - 16 - 4);
    const m = openParchmentSheet(this, { title: t('duels.dismissTitle'), w, h: SHEET_PAD + 16 + listH + 4, id: 'duel.dismissSheet' });
    const { c, body: b } = m;
    ptext(this, c, b.x, b.y, t('duels.dismissHint'), 'sec', { maxW: inner });
    if (!bench.length) ptext(this, c, m.x + w / 2, b.y + 22, t('duels.benchEmpty'), 'ink', { align: 0.5, maxW: inner });
    else {
      const sa = new ScrollArea(this, c, b.x, b.y + 16, b.w, listH, this.m.S);
      c.once('destroy', () => sa.destroy());
      bench.forEach((h, i) => {
        const pwid = b.w - 3;
        const ry = i * (rowH + GAP);
        sa.content.add(new ParchmentCard(this, 0, ry, pwid, rowH));
        addFace(this, sa.content, 3, ry + 3, rowH - 6, h);
        const bw = Math.max(52, Math.ceil(mw(t('duels.dismissOne').toUpperCase(), 'rCream', 7)) + 16);
        sa.content.add(
          new MButton(this, pwid - bw - 4, ry + 4, bw, 22, {
            label: t('duels.dismissOne'),
            variant: 'secondary',
            id: 'duel.dismissOne',
            onClick: () =>
              confirmDialog(this, {
                title: t('duels.dismissConfirm', { name: heroName(h.name) }),
                body: t('duels.dismissBody'),
                ok: t('duels.dismissOne'),
                cancel: t('common.cancel'),
                destructive: true,
                onOk: () => (m.close(), void this.act(() => this.src.dismiss(h.id), () => t('duels.dismissed', { name: heroName(h.name) }))),
              }),
          }),
        );
        ptext(this, sa.content, rowH + 2, ry + 5, heroName(h.name), 'ink', { maxW: pwid - rowH - bw - 10 });
        ptext(this, sa.content, rowH + 2, ry + 16, `${t('hero.level', { n: h.level })} · ${className(h)}`, 'sec', { maxW: pwid - rowH - bw - 10 });
      });
      sa.setContentHeight(full);
    }
  }

  // ------------------------------------------------------------------ shop

  private buildShop(p: DuelProfileView, keep: number): void {
    const { area, c, w } = this.openShell(false, this.viewTitle());
    const cols = w >= 2 * 176 + GAP ? 2 : 1;
    let y = 2;
    y += this.headerRow(c, y, w, p) + GAP;
    // the page's hint is a tip the player can hide for good
    const tip = addTipLine(this, c, 1, y, w, { text: t(`duels.sit.${this.shopTab}` as TKey), tone: 'info', dismissId: `duel.shop.${this.shopTab}`, id: 'duel.tip' });
    y += tip + (tip ? GAP : 0);
    // Today | Gear | Sell: the second level
    c.add(
      new SegmentedSwitch(this, 1, y, w, {
        options: SHOP_TABS.map((k) => ({ id: k, label: t(`duels.shop.${k}` as TKey) })),
        selected: this.shopTab,
        id: 'duel.shop',
        onChange: (id) => {
          this.shopTab = id as ShopTab;
          this.buildBody();
        },
      }),
    );
    y += 24 + GAP + 2;
    if (this.shopTab === 'sell') {
      this.finishPage(y, 0);
      const box = area.bounds;
      const sy = box.y + y;
      const sh = box.h - y - 1;
      this.body.add(mosaicImage(this, box.x + 1, sy, w, sh, 'topBar'));
      this.stash = new MStashGrid(this, this.body, box.x + 3, sy + 2, w - 4, sh - 4, {
        items: () => p.stash,
        state: this.stashState,
        onTap: (it) => this.openSell(it),
        price: (it) => ({ text: `+${fmtCount(sellPrice(it))}`, font: 'glory' }),
        empty: { title: t('stash.emptyTitle'), hint: t('d5.sellEmpty') },
      });
      return;
    }
    let offers: ShopOffer[];
    if (this.shopTab === 'offers') {
      offers = dailyOffers(p.day);
      const day = 86_400_000;
      c.add(addIcon(this, 2, y - 2, 'hourglass'));
      ptext(this, c, 17, y, t('duels.offersIn', { t: leftText(day - (Date.now() % day)) }), 'sec', { maxW: w - 20 });
      y += 14;
    } else {
      // the slot filter (icons, the slot's name on long-press)
      const slotW = Math.floor((w - (SLOTS.length - 1) * GAP) / SLOTS.length);
      const slotIcon = (sl: Slot) => (sl === 'weapon' ? 'sword' : sl === 'trinket' ? 'ring' : sl);
      if (slotW < 22) {
        const nextSlot = SLOTS[(SLOTS.indexOf(this.gearSlot) + 1) % SLOTS.length];
        c.add(new MButton(this, 1, y, w, 22, { label: t(`slot.${this.gearSlot}` as TKey), icon: slotIcon(this.gearSlot), variant: 'neutral', id: 'duel.slot.cycle', tip: t(`slot.${nextSlot}` as TKey), onClick: () => ((this.gearSlot = nextSlot), this.buildBody()) }));
      } else
        SLOTS.forEach((sl, i) =>
          c.add(
            new MIconButton(this, 1 + i * (slotW + GAP), y, i === SLOTS.length - 1 ? w - i * (slotW + GAP) : slotW, 22, {
              icon: slotIcon(sl),
              label: t(`slot.${sl}` as TKey),
              variant: this.gearSlot === sl ? 'selected' : 'neutral',
              id: `duel.slot.${sl}`,
              onClick: () => ((this.gearSlot = sl), this.buildBody()),
            }),
          ),
        );
      y += 22 + GAP + 1;
      offers = catalogue().filter((o) => itemDef(o.def).slot === this.gearSlot);
    }
    const team = this.fightingHeroes(p);
    // what the deltas compare against: the best in the team, or one hero (a tap cycles)
    if (this.compareHero && !team.some((h) => h.id === this.compareHero)) this.compareHero = null;
    const who = this.compareHero ? heroName(team.find((h) => h.id === this.compareHero)!.name) : t('dv.compareBest');
    const cmpLabel = `${t('dv.compare')}: ${who}`;
    c.add(new MButton(this, 1, y, w, 22, { label: cmpLabel, icon: 'people', variant: 'neutral', id: 'duel.compare', tip: cmpLabel, onClick: () => this.openCompare(team) }));
    y += 22 + GAP + 1;
    const daily = this.shopTab === 'offers';
    const colW = Math.floor((w - (cols - 1) * GAP) / cols);
    offers.forEach((o, i) => {
      const k = i % cols;
      const x = 1 + k * (colW + GAP);
      this.offerCard(c, p, o, x, y, k === cols - 1 ? w - k * (colW + GAP) : colW, OFFER_H - 3, daily, team, area);
      if (k === cols - 1 || i === offers.length - 1) y += OFFER_H;
    });
    this.finishPage(y, keep);
  }

  /**
   * An offer as a card: the item and its name in its rarity ink, a rarity
   * pill and the slot, the price (today's offers: the old price struck
   * through), what the stats are compared with, then each stat with its
   * change: the arrow follows the number, the colour says better or worse,
   * times carry seconds and "slower" / "faster", a stat the compared item
   * lacks says "new". Buy, or why not ("Need 12 more Glory"). A tap on the
   * card opens the full item card.
   */
  private offerCard(c: Phaser.GameObjects.Container, p: DuelProfileView, o: ShopOffer, x: number, y: number, w: number, h: number, daily: boolean, team: Hero[], area: ScrollArea): void {
    const it = sample(o);
    const sold = p.bought.includes(o.id);
    const afford = p.glory >= o.price;
    const card = new ParchmentCard(this, x, y, w, h, { selected: !sold && afford, id: `duel.offerCard.${o.id}` });
    c.add(card);
    if (sold) card.add(this.add.rectangle(0, 0, w, h, MOSAIC.parchLo, 0.45).setOrigin(0, 0));
    card.add(mosaicImage(this, 4, 4, 28, 28, 'parchmentWell'));
    card.add(new ItemIcon(this, 6, 6, { item: it }, { size: 24, tip: false }));
    // the price, top right (today's: the list price struck through before it)
    const pt = ptext(this, card, w - 7, 7, fmtCount(o.price), sold ? 'off' : afford ? 'ink' : 'sec', { align: 1 });
    card.add(addIcon(this, w - 7 - pt.width - 14, 5, 'laurel', sold || !afford ? 'D' : ''));
    let priceW = pt.width + 20;
    if (daily && !sold) {
      const full = Math.round(o.price / 0.8);
      const ot = ptext(this, card, w - 7 - priceW - 2, 7, fmtCount(full), 'muted', { align: 1 });
      card.add(this.add.rectangle(ot.x - ot.width - 1, 11.5, ot.width + 2, 1, MOSAIC.inkMuted).setOrigin(0, 0));
      priceW += ot.width + 6;
    }
    const tx = 37;
    const name = ptext(this, card, tx, 6, itemName(it), 'ink', { maxW: w - priceW - 6 - tx });
    name.setFont(`font_${rarityInk(this, o.rarity)}`);
    const room = w - 8 - tx - (daily && !sold ? 34 : 0);
    const pwd = addRarityPill(this, card, tx, 17, o.rarity, tOr(`rarity.${o.rarity}`, RARITY_LABEL[o.rarity]), Math.min(room, 80));
    if (room - pwd - 5 >= 24) ptext(this, card, tx + pwd + 5, 18, t(`slot.${itemDef(o.def).slot}` as TKey), 'sec', { maxW: room - pwd - 5 });
    if (daily && !sold) armyPill(this, card, w - 7 - armyPillW('-20%'), 17, '-20%', MOSAIC.inkGood, 34);
    // what the changes compare against
    const sum = offerSummary(o, team, 3, this.compareHero);
    const vsHero = sum.vsHeroId ? team.find((hh) => hh.id === sum.vsHeroId) : undefined;
    let vsText = sum.vs && vsHero ? t('dv.vsItem', { name: heroName(vsHero.name), item: itemName(sum.vs), rarity: tOr(`rarity.${sum.vs.rarity}`, RARITY_LABEL[sum.vs.rarity]) }) : vsHero ? t('dv.vsNothing', { name: heroName(vsHero.name) }) : t('dv.vsNone');
    const picked = sum.pickedCannot ? team.find((hh) => hh.id === this.compareHero) : undefined;
    if (picked) vsText = `${t('dv.notFor', { name: heroName(picked.name) })} · ${vsText}`;
    ptext(this, card, 7, 35, vsText, 'muted', { size: TEXT_MIN, maxW: w - 14 });
    // the stats: name, value, change
    const g = this.add.graphics();
    const dx = Math.round(w * 0.56);
    sum.lines.forEach((l, k) => {
      const ly = 46 + k * LINE_H;
      const vt = ptext(this, card, dx - 6, ly, localDecimals(l.text), 'ink', { align: 1 });
      ptext(this, card, 7, ly, tOr(`mod.${l.key}`, l.key), 'sec', { maxW: dx - 6 - vt.width - 6 - 7 });
      if (l.isNew && l.deltaText) {
        ptext(this, card, dx + 2, ly, t('dv.new'), 'good');
        return;
      }
      const d = deltaParts(l);
      if (!d) return;
      drawArrow(g, dx + 2, ly + 2, d.up, d.better);
      const note = d.note ? ` ${t('item.sec')} ${t(d.note === 'slower' ? 'dv.slower' : 'dv.faster')}` : '';
      ptext(this, card, dx + 10, ly, `${localDecimals(d.text)}${note}`, d.better ? 'good' : 'bad', { maxW: w - 6 - dx - 10 });
    });
    card.add(g);
    // Buy, or why not
    const bw = Math.min(64, Math.max(46, Math.ceil(mw(t('duels.buy').toUpperCase(), 'rCream', 7)) + 30, Math.ceil(mw(t('duels.soldOut').toUpperCase(), 'rCream', 7)) + 16));
    const by = h - 6 - 22;
    const buy = new MButton(this, w - bw - 6, by, bw, 22, { label: sold ? t('duels.soldOut') : t('duels.buy'), icon: sold ? undefined : 'laurel', variant: 'secondary', id: 'duel.buy', tip: t('duels.buyTip', { name: itemName(it), n: o.price }), onClick: () => this.buy(o) });
    if (sold) buy.setEnabled(false, t('duels.soldOut'));
    else if (!afford) {
      const need = t('dv.needGlory', { n: fmtCount(o.price - p.glory) });
      buy.setEnabled(false, need);
      ptext(this, card, 7, by + 7, need, 'muted', { maxW: w - bw - 20 });
    }
    const z = this.add.zone(0, 0, w - bw - 10, h).setOrigin(0, 0).setInteractive();
    uiId(z, 'duel.offer');
    tappable(z, null, () => !area.moved && this.profile && this.openOffer(this.profile, o));
    card.add(z);
    card.add(buy);
  }

  /** "Compare with": the best user in the team, or one hero (his class; items he would not use fall back to the best user). */
  private openCompare(team: Hero[]): void {
    const w = Math.min(this.m.VW - 12, 240);
    const rowH = 28;
    const rows: { id: string | null; title: string; sub: string }[] = [
      { id: null, title: t('dv.compareBest'), sub: t('dv.compareBestSub') },
      ...team.map((h) => ({ id: h.id, title: heroName(h.name), sub: className(h) })),
    ];
    const full = rows.length * (rowH + GAP);
    const listH = Math.min(full, this.m.VH - 12 - SHEET_PAD - 4);
    const m = openParchmentSheet(this, { title: t('dv.compareTitle'), w, h: SHEET_PAD + listH + 4, id: 'duel.compareSheet' });
    const { c, body: b } = m;
    const sa = new ScrollArea(this, c, b.x, b.y, b.w, listH, this.m.S);
    c.once('destroy', () => sa.destroy());
    rows.forEach((r, i) => {
      const on = r.id === this.compareHero;
      const ry = i * (rowH + GAP);
      const pwid = b.w - 3;
      sa.content.add(new ParchmentCard(this, 0, ry, pwid, rowH, { selected: on }));
      sa.content.add(addIcon(this, 6, ry + (rowH - 12) / 2, on ? 'check' : 'people', on ? '' : 'D'));
      ptext(this, sa.content, 22, ry + 5, r.title, on ? 'head' : 'ink', { maxW: pwid - 30 });
      ptext(this, sa.content, 22, ry + 16, r.sub, 'sec', { size: TEXT_MIN, maxW: pwid - 30 });
      this.rowTap(sa.content, () => sa, pwid, rowH, 'duel.compare.row', () => {
        this.compareHero = r.id;
        m.close();
        this.buildBody();
      }, 0, ry);
    });
    sa.setContentHeight(full);
  }

  private openOffer(p: DuelProfileView, o: ShopOffer): void {
    const sold = p.bought.includes(o.id);
    openItemCard(this, {
      item: sample(o),
      title: t('d5.armouryItem'),
      worth: false,
      actions: [{ label: sold ? t('duels.soldOut') : t('duels.buyFor', { n: fmtCount(o.price) }), icon: 'laurel', variant: 'primary', id: 'duel.buyCard', disabled: sold ? t('duels.soldOut') : p.glory < o.price ? t('duels.noGlory') : undefined, onClick: () => this.buy(o) }],
    });
  }

  buy(o: ShopOffer): void {
    void this.act(() => this.src.buy(o.id), (r) => t('duels.bought', { name: itemName(r.item) }));
  }

  /** Sell a stash item, or salvage a bound one (never sold, docs/ITEMS.md "Bound items"): both pay a quarter of its shop price. */
  private openSell(it: Item): void {
    const price = sellPrice(it);
    const bound = isBound(it);
    const label = t(bound ? 'duels.salvage' : 'duels.sell', { n: fmtCount(price) });
    openItemCard(this, {
      item: it,
      title: t('d5.armouryItem'),
      worth: false,
      notes: [{ text: bound ? t('duels.salvageFor', { n: fmtCount(price) }) : t('duels.sellFor', { n: fmtCount(price) }), font: 'pGold' }],
      actions: [
        {
          label,
          icon: 'laurel',
          id: 'duel.sell',
          onClick: () =>
            confirmDialog(this, {
              title: t(bound ? 'duels.salvageTitle' : 'duels.sellTitle', { name: itemName(it) }),
              body: bound ? t('duels.salvageBody', { n: fmtCount(price) }) : t('d5.sellBody', { n: fmtCount(price) }),
              ok: label,
              cancel: t('common.cancel'),
              onOk: () => void this.act(() => (bound ? this.src.salvage(it.uid) : this.src.sell(it.uid)), () => t('duels.sold', { n: fmtCount(price) })),
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
    game.scene.start('Menu', {});
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
    // a ladder floor, said outright: it may pause, and its ticket's deadline on this device (controls.md R10)
    ladder: { deadline: tk.deadline },
    onFinish(sim: Battle, deployOrders: number) {
      const sub = attackSubmission(sim, deployOrders);
      src
        .ladderSubmit(tk.ticket, sub, sim.result())
        .then((r) => reportThenHub(game, () => ladderReport(r, this.label, src.demo), { tab: 'ladder', preview: src.demo, result: { glory: r.glory, won: r.won, floor: r.floor, first: r.firstClear, stars: r.stars, newBest: r.newBest, expired: r.expired } }))
        .catch((e) => backToDuel(game, { tab: 'ladder', preview: src.demo, error: errorText(e) }));
    },
    onLeave() {
      void src.ladderAbandon(tk.ticket).catch(() => undefined);
      backToDuel(game, { tab: 'ladder', preview: src.demo });
    },
  };
}

/** The post-battle report of a ladder floor (Glory and account XP as notes, or that the ticket ran out; no deaths in duels). */
export function ladderReport(r: LadderReport, label: string, demo = false): BattleReport {
  const notes = ladderNotes(r, demo);
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
export async function playLiveMatch(game: Phaser.Game, src: DuelSource, id: string, mode: DuelMode): Promise<void> {
  if (opening === id) return;
  opening = id;
  const link = new MatchLink(id);
  try {
    const first = await link.open();
    if (!('type' in first)) {
      link.close();
      forgetMatch(id);
      reportThenHub(game, () => rankedReport(first, t('battle.vs', { name: first.names[1 - first.side] })), { tab: 'ranked', arena: 'home', result: matchResult(first.glory, first.winner, first.side, first.end === 'void') });
      return;
    }
    for (const sc of game.scene.getScenes(true)) if (sc.scene.key !== 'Battle') game.scene.stop(sc.scene.key);
    // the settled report, or null while the match still runs (409 match_live) or the server is out of reach
    const poll = () => src.matchReport(id).then((r) => r.report).catch(() => null);
    // a reload (Telegram frees a backgrounded or memory-hungry mini app) comes back into the match
    rememberMatch(id, mode);
    game.scene.start('Battle', { source: matchSource(link, first, (o) => finishMatch(game, src, id, o), poll) });
  } catch {
    link.close();
    // not after every boot: the Arena's Rejoin still offers a match the server says runs
    forgetMatch(id);
    backToDuel(game, { tab: 'ranked', arena: 'home', error: t('duels.live.unreachable') });
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
  forgetMatch(id);
  const label = t('battle.vs', { name: o.names[1 - o.side] });
  const report = o.report;
  if (report) return reportThenHub(game, () => rankedReport(report, label), { tab: 'ranked', arena: 'home', result: matchResult(report.glory, report.winner, report.side, report.end === 'void') });
  src
    .matchReport(id)
    .then((r) => reportThenHub(game, () => rankedReport(r.report, label), { tab: 'ranked', arena: 'home', result: matchResult(r.report.glory, r.report.winner, r.report.side, r.report.end === 'void') }))
    .catch((e) => {
      if ((e as { code?: string } | null)?.code === 'match_live' && tries < REPORT_TRIES) {
        setTimeout(() => finishMatch(game, src, id, o, tries + 1), REPORT_RETRY_MS);
        return;
      }
      backToDuel(game, { tab: 'ranked', arena: 'home', error: errorText(e) });
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
      reportThenHub(game, () => rankedReport(r, label, true), { tab: 'ranked', arena: 'home', preview: true, result: matchResult(r.glory, r.winner, r.side, r.end === 'void') });
    },
    onLeave() {
      backToDuel(game, { tab: 'ranked', arena: 'home', preview: true });
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
    // spoils of a won duel go straight to the duel stash
    loot: r.spoils ? [r.spoils] : [],
    lootInStash: !!r.spoils,
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
    // spoils of a won duel go straight to the duel stash
    loot: r.spoils ? [r.spoils] : [],
    lootInStash: !!r.spoils,
    verified: demo ? null : r.verified,
    online: 'duel',
    notes,
  });
}
