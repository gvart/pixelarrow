/**
 * The duel hub (docs/DUELS.md, docs/UI_STRATEGOS.md "Duels"): the persistent
 * duel army, its Glory and account level in the header, two game modes on a
 * switch and two places of their own behind the header's icons.
 *
 * - **Ladder**: the next floor (Fight), then the 50 floors in 5 chapters of 10
 *   (stars per floor, the boss last, chapter chests at 10 / 20 / 30 stars);
 *   a cleared floor is a replay for farm Glory.
 * - **Arena**: the season line, then a card per mode: Live PvP (league,
 *   placements, Find match and Unranked; the search and the opponent found
 *   take the page) and Raids (the async ladder: raids left, the defence team,
 *   Raid opens the defender picks). Each card's trophy opens its leaderboard.
 * - **Team** (header icon, badged when a fighting hero has points or a perk to
 *   spend): the presets (up to five; rename, duplicate, delete, what each
 *   fights on), the point budget, the heroes (a tap: the hero sheet), recruit
 *   and dismiss.
 * - **Shop** (header icon): today's offers, the gear catalogue, selling; each
 *   offer is a card with its main stats against what the team wears.
 *
 * Team, Shop, Raids and a leaderboard are full views with a title and a back
 * arrow to where the player came from. A season's rewards show in a popup on
 * the first visit after it ended. Every change is a request to the duel
 * source; the screen redraws from the answer. Started with `{ preview: true }`
 * it runs on the in-memory demo.
 */
import Phaser from 'phaser';
import { BaseScene } from '../BaseScene';
import { Button, addIcon, addPanel, addText, scaleIcon, tappable, Meter, ScrollArea, type FontKey } from '../../ui/kit';
import { Badge, ItemIcon, ScrollList, Tabs, addEmptyState, addScrollHint, confirmDialog, openModal, toast } from '../../ui/widgets';
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
import { heroNeedsAttention, heroStars } from '../../game/gear';
import { buildReport, lastBattle, resultFor, type BattleReport } from '../../game/report';
import { attackSubmission } from '../../online/battle';
import type { BattleSource } from '../../online/battleSource';
import { errorText } from '../../online/client';
import {
  DUEL_CLASSES, DUEL_RULES, catalogue, classPoints, cleanPresetName, dailyOffers, duelRecruit, heroPoints, levelProgress, offerSummary, recruitPrice, sellPrice, teamPoints, teamProblem,
  type ShopOffer,
} from '../../duel/rules';
import { CHAPTERS, CHEST_TIERS, LADDER, chapterFloors, chapterMaxStars, chapterOf, chapterStars, chestReward, chestState, isBoss, ladderFloor, type ChestState } from '../../duel/ladder';
import {
  DemoDuelSource, LOADOUT_USES, duelSource, type AsyncTicket, type AsyncView, type AsyncLogEntry, type Board, type ChestClaim, type DemoMatch, type DuelProfileView, type DuelSource,
  type LadderReport, type LadderTicket, type LeaderboardView, type Loadout, type LoadoutUse, type QueueEvent, type RankedView, type SeasonView,
} from '../../duel/client';
import { RANKED, divisionRoman, leagueRank, type DuelMode, type League, type LeagueId } from '../../duel/rating';
import type { AsyncReport, MatchReport } from '../../duel/protocol';
import { ASYNC, SEASON, seasonMonth } from '../../duel/season';
import { addCosmetic } from '../../ui/econ/widgets';
import { MatchLink, forgetMatch, matchSource, rememberMatch, type MatchOutcome } from '../../duel/match';
import { LINE_H, wrapText } from '../../ui/textfit';
import { DuelHeroSource } from '../../duel/heroSource';
import { showReport } from '../ResultsScene';
import { makeItem } from '../../game/heroes';
import { Rng } from '../../sim/rng';
import { promptFields } from '../online/textInput';
import { ensureDuelIcons } from './duelIcons';
import { t, tOr, type TKey } from '../../i18n';

/** The hub's views: the two game modes and the two places behind the header icons. */
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
  result?: { glory: number; won: boolean; draw?: boolean; floor?: number; first?: boolean; stars?: number; newBest?: boolean };
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
const MODE_ICONS = ['flag', 'swords'];
const USE_ICONS: Record<LoadoutUse, string> = { ladder: 'flag', arena: 'swords', defence: 'shield' };

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
/** Offer cards narrower than this put Buy under the stats. */
const OFFER_NARROW = 160;

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

/** "Team 2" or the name a preset was given. */
export function presetLabel(l: Pick<Loadout, 'slot' | 'name'>): string {
  return l.name?.trim() || t('duels.loadout', { n: l.slot });
}

const STAR_ON = 0xf0c24a;
const STAR_OFF = 0x4a4038;

/** `n` of `max` small stars (filled gold, the rest dark) centred on `cx`, `size` px each. */
function drawStars(g: Phaser.GameObjects.Graphics, cx: number, y: number, n: number, max = 3, size = 6): void {
  const step = size + 1;
  const x0 = Math.round(cx - (max * step - 1) / 2);
  for (let i = 0; i < max; i++) {
    const ox = x0 + i * step + size / 2;
    const oy = y + size / 2;
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? size * 0.24 : size * 0.55;
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      pts.push({ x: ox + Math.cos(a) * r, y: oy + 0.4 + Math.sin(a) * r });
    }
    g.fillStyle(i < n ? STAR_ON : STAR_OFF, 1);
    g.fillPoints(pts, true);
  }
}

/** A small up (better) or down (worse) triangle, 5 px wide, at x, y (top-left). */
function drawArrow(g: Phaser.GameObjects.Graphics, x: number, y: number, up: boolean): void {
  g.fillStyle(up ? COLOR.good : COLOR.bad, 1);
  if (up) g.fillTriangle(x, y + 5, x + 5, y + 5, x + 2.5, y);
  else g.fillTriangle(x, y, x + 5, y, x + 2.5, y + 5);
}

/** A small chevron (open: pointing down, closed: right) at x, y. */
function drawChevron(g: Phaser.GameObjects.Graphics, x: number, y: number, open: boolean): void {
  g.fillStyle(BRONZE.hi, 1);
  if (open) g.fillTriangle(x, y + 1, x + 7, y + 1, x + 3.5, y + 6);
  else g.fillTriangle(x + 1, y, x + 1, y + 7, x + 6, y + 3.5);
}

/** A row of the ladder's chapter list: a chapter's heading, its chests (narrow screens: a row of their own), or five of its floors. */
type LadderRow = { kind: 'head'; ch: number } | { kind: 'chests'; ch: number } | { kind: 'floors'; ch: number; from: number };
/** A row of the Team view's list (all rows are one height, so the whole view scrolls on short screens). */
type TeamRow = { kind: 'presets' } | { kind: 'name' } | { kind: 'uses' } | { kind: 'points' } | { kind: 'hero'; hero: Hero } | { kind: 'head'; text: string } | { kind: 'empty' };

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
  private head!: Phaser.GameObjects.Container;
  private body!: Phaser.GameObjects.Container;
  private list: ScrollList | null = null;
  /** The Arena's cards when they need to scroll (short screens). */
  private pageScroll: { destroy(): void; area: { scrollY: number; setScroll(v: number): void } } | null = null;
  /** Which page the list belongs to (its scroll is kept only on a rebuild of the same page). */
  private listKey = '';
  private stash: StashGrid | null = null;
  private stashState: StashState = defaultStashState();
  private drag!: DragDrop;
  /** The situation sentence (Glory and the duel level sit on its numbers row; Team and Shop on its right). */
  private sit: SituationBar | null = null;
  /** The fixed bottom strip: Back and the one red action of the view. */
  private strip!: CommandStrip;
  private stripOpts: CommandStripOpts = {};
  /** Top of the page under the mode switch (or the view's title). */
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
  private arenaTab: ArenaTab = 'home';
  /** The raid card, the season and the open leaderboard (loaded with the Arena). */
  asyncView: AsyncView | null = null;
  season: SeasonView | null = null;
  board: Board = 'live';
  boardView: LeaderboardView | null = null;
  /** The defender picked on the Raids view (the strip's Raid). */
  private raidPick: number | null = null;
  /** The next-floor card (the focus ring after a cleared floor). */
  private nextCard: { y: number; h: number } | null = null;
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
    this.list = null;
    this.pageScroll = null;
    this.listKey = '';
    this.stash = null;
    this.sit = null;
    this.initUi();
    ensureFonts(this);
    ensureDuelIcons(this);
    this.screen({ back: () => this.back() });
    const { VW, VH } = this.m;
    this.ui.add(this.add.rectangle(0, 0, VW, VH, P.bg).setOrigin(0, 0));
    this.head = this.add.container(0, 0);
    this.body = this.add.container(0, 0);
    this.ui.add([this.body, this.head]);
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
    if (data.rejoin && !relayout && !this.src.demo) this.enterMatch(data.rejoin.id, data.rejoin.mode);
  }

  /** A full view (Team, Shop, Raids, a leaderboard): its title and back arrow replace the mode switch. */
  private get subView(): boolean {
    return this.tab === 'team' || this.tab === 'shop' || (this.tab === 'ranked' && this.arenaTab !== 'home');
  }

  /** Back (the strip, Telegram's button): out of a full view first, then to the menu. */
  private back(): void {
    if (Date.now() - this.openedAt < BACK_GUARD_MS) return;
    if (this.subView && !this.search && !this.found && this.profile && this.st === 'ready') return this.up();
    this.scene.start('Menu');
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
    toast(this, this.found ? t('duel.preparing') : t('duels.why.searching'), 'bad');
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

  /** Team or Shop (the header's icons); their back arrow returns to the mode they were opened from. */
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
   * A tap target over a list row left of its button (`right`: where the
   * button starts), so the row and its button never overlap; ignores taps
   * that ended a scroll drag.
   */
  private rowTap(list: () => ScrollList | null, row: Phaser.GameObjects.Container, right: number, h: number, id: string, cb: () => void, x = 0): void {
    const z = this.add.zone(x, 0, Math.max(10, right - 4 - x), h).setOrigin(0, 0).setInteractive();
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

  /** The view's sentence and the strip (Back is always bottom-left). */
  private chrome(sentence: string, strip: CommandStripOpts, o: { urgent?: boolean } = {}): void {
    this.say(sentence, o.urgent);
    this.stripOpts = { left: this.backSlot(), ...strip };
    this.strip.set(this.stripOpts);
    if (this.busy) this.strip.buttons.main?.setEnabled(false, t('duels.why.busy'));
  }

  private say(sentence: string, urgent = false): void {
    this.sit?.setSentence(this.src.demo ? `${sentence}${t('duels.sit.demoSuffix')}` : sentence, urgent);
  }

  /** The header icons' width (Team and Shop on the situation bar's right). */
  private get headIconsW(): number {
    return 2 * SIZE.btnMinW + SIZE.gap + 4;
  }

  private render(): void {
    this.head.removeAll(true);
    const { VW } = this.m;
    const p = this.profile;
    const ready = this.st === 'ready' && !!p;
    // short screens: Team and Shop sit on the switch's row, so the one-line sentence keeps the width
    this.sit = new SituationBar(this, VW, { sentence: '', compact: this.compact, right: ready && !this.compact ? this.headIconsW : 0, id: 'duel.situation' });
    this.head.add(this.sit);
    if (!ready || !p) {
      this.clearBody();
      this.buildState();
      return;
    }
    this.buildHeader(p);
    this.buildBody();
  }

  /** The header: Glory and the duel level (a badge with its XP bar) on the numbers row; Team (badged) and Shop on the right. */
  private buildHeader(p: DuelProfileView): void {
    const { VW } = this.m;
    const sit = this.sit!;
    const H = this.head;
    const ny = this.compact ? 17 : 27;
    const room = VW - 6 - (this.compact ? 0 : this.headIconsW) - 6;
    const lp = levelProgress(p.xp);
    const lvText = t('duels.lv', { n: lp.level });
    const lvW = measureText(lvText) + 10;
    const glory = `${p.glory}`;
    const word = t('duels.num.glory');
    const withWord = 15 + measureText(glory) + 3 + measureText(word) + 8 + lvW <= room;
    H.add(addIcon(this, 6, ny - 2, 'star'));
    const gv = addText(this, 21, ny, glory, 'gold');
    H.add(gv);
    let x = 21 + gv.width + 3;
    if (withWord) {
      const w = addText(this, x, ny, word, 'dim');
      H.add(w);
      x += w.width + 3;
    }
    x += 5;
    if (x + lvW <= 6 + room + 6) {
      H.add(addPanel(this, x, ny - 3, lvW, 14, 'inset'));
      H.add(addText(this, x + 5, ny - 1, lvText, 'ink'));
      H.add(new Meter(this, x + 3, ny + 8, lvW - 6, 2, COLOR.xp).setValue(lp.need ? lp.into : 1, lp.need || 1));
    }
    if (!this.compact) this.addHeadIcons(H, VW - 4, Math.round((sit.h - SIZE.btnMinW) / 2), p);
  }

  /** Team (a badge while a fighting hero has points or a perk to spend) and Shop, ending at `right`. */
  private addHeadIcons(H: Phaser.GameObjects.Container, right: number, by: number, p: DuelProfileView): void {
    const bw = SIZE.btnMinW;
    const shopX = right - bw;
    const teamX = shopX - SIZE.gap - bw;
    const team = new Button(this, teamX, by, bw, bw, {
      icon: 'people',
      label: t('duels.tab.team'),
      iconOnly: true,
      style: this.tab === 'team' ? 'buttonSel' : 'button',
      id: 'duel.team',
      onClick: () => this.openView('team'),
    });
    H.add(team);
    if (this.fightingHeroes(p).some(heroNeedsAttention)) H.add(new Badge(this, teamX + bw - 3, by + 3, '!'));
    H.add(
      new Button(this, shopX, by, bw, bw, {
        icon: 'amphora',
        label: t('duels.tab.shop'),
        iconOnly: true,
        style: this.tab === 'shop' ? 'buttonSel' : 'button',
        id: 'duel.shop',
        onClick: () => this.openView('shop'),
      }),
    );
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
    this.pageScroll?.destroy();
    this.pageScroll = null;
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
    const keep = key === this.listKey ? (this.list?.area.scrollY ?? this.pageScroll?.area.scrollY ?? 0) : -1;
    this.clearBody();
    const p = this.profile;
    if (!p || !this.sit) return;
    this.listKey = key;
    const { VW } = this.m;
    const ty = this.sit.bottom + 3;
    const top = ty + SIZE.tabH;
    this.body.add(addPanel(this, 0, top - 2, VW, this.strip.top - (top - 2), 'parch'));
    if (this.subView) this.buildTitleRow(ty);
    else this.buildModeSwitch(ty);
    this.pageTop = top + 4;
    this.searchText = null;
    this.nextCard = null;
    if (this.tab === 'ladder') this.buildLadder(p, keep);
    else if (this.tab === 'ranked') this.buildRanked(p, keep);
    else if (this.tab === 'team') this.buildTeam(p, keep);
    else this.buildShop(p, keep);
  }

  /** Ladder | Arena: the two game modes. */
  private buildModeSwitch(y: number): void {
    const { cx, cw } = this;
    const labels = MODES.map((k) => t(`duels.tab.${k}` as TKey));
    const iw = this.compact ? this.headIconsW - 1 : 0;
    if (iw) this.addHeadIcons(this.body, cx + cw, y, this.profile!);
    const tabs: Tabs = new Tabs(this, cx, y, cw - iw, labels, {
      icons: MODE_ICONS,
      selected: MODES.indexOf(this.mode),
      ids: MODES.map((k) => `duel.mode.${k}`),
      onChange: (i) => {
        if (this.search || this.found) {
          tabs.select(MODES.indexOf(this.mode), false);
          this.blocked();
          return;
        }
        this.openMode(MODES[i]);
      },
    });
    this.body.add(tabs);
  }

  /** A full view's title with the back arrow (and the view's own control on the right: the Legend filter). */
  private buildTitleRow(y: number): void {
    const { cx, cw } = this;
    const B = this.body;
    B.add(new Button(this, cx, y, SIZE.btnMinW, SIZE.tabH, { icon: 'back', label: t('strat.back'), iconOnly: true, id: 'duel.up', onClick: () => this.up() }));
    // short screens: Team and Shop on this row too (not beside a leaderboard's or the raid picks' longer title)
    const iw = this.compact && (this.tab === 'team' || this.tab === 'shop') ? this.headIconsW - 1 : 0;
    if (iw) this.addHeadIcons(B, cx + cw, y, this.profile!);
    let rw = iw;
    if (this.tab === 'ranked' && this.arenaTab === 'board' && this.board !== 'async') {
      // the Live board's Legend filter
      const legend = this.board === 'legend';
      const label = t('duels.board.legend');
      const w = Math.min(90, measureText(label) + 30);
      if (iw) {
        // no room for the word: the star alone (the word on long-press)
        B.add(new Button(this, cx + cw - iw - SIZE.btnMinW, y, SIZE.btnMinW, SIZE.tabH, { icon: 'star', label, iconOnly: true, style: legend ? 'buttonSel' : 'button', id: 'duel.board.legendFilter', tip: t('duels.board.legendTip'), onClick: () => this.openBoard(legend ? 'live' : 'legend') }));
        rw += SIZE.btnMinW + 6;
      } else {
      rw = w + 6;
      B.add(
        new Chip(this, cx + cw - w, y + 1, w, {
          label,
          icon: legend ? 'check' : 'star',
          selected: legend,
          id: 'duel.board.legendFilter',
          tip: t('duels.board.legendTip'),
          onClick: () => this.openBoard(legend ? 'live' : 'legend'),
        }),
      );
      }
    }
    const title =
      this.tab === 'team'
        ? t('duels.view.team')
        : this.tab === 'shop'
          ? t('duels.view.shop')
          : this.arenaTab === 'raid'
            ? t('duels.view.raid')
            : t(`duels.view.board.${this.board}` as TKey);
    B.add(addText(this, cx + SIZE.btnMinW + 6, y + 7, fitHead(title, cw - SIZE.btnMinW - 8 - rw), 'head'));
    B.add(this.add.rectangle(cx, y + SIZE.tabH, cw, 1, BRONZE.dark).setOrigin(0, 0));
  }

  /** After a battle: what it paid (and the stars a ladder floor earned), and the new next floor ringed. */
  private showArrival(): void {
    const a = this.arrival;
    this.arrival = null;
    if (!a || !this.profile || this.st !== 'ready') return;
    if (a.floor) {
      let text = !a.won ? t('duels.backLost', { n: a.floor }) : a.first ? t('duels.backWon', { n: a.floor, g: a.glory }) : t('duels.backReplay', { n: a.floor, g: a.glory });
      if (a.won && a.stars) text += ` · ${a.newBest && !a.first ? t('duels.backBest', { s: a.stars }) : t('duels.backStars', { s: a.stars })}`;
      toast(this, text, a.won ? 'good' : 'info', 3200, 'bottom');
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

  /** The chapter of the next floor (the last one once all are cleared). */
  private currentChapter(p: DuelProfileView): number {
    return chapterOf(Math.min(LADDER.floors, p.ladder.cleared + 1));
  }

  /** The chapter headings cannot hold the three chests beside the title: the chests get a row under it. */
  private get narrowLadder(): boolean {
    return this.cw - 6 < 150;
  }

  private chapterOpen(p: DuelProfileView, ch: number): boolean {
    return this.ladderOpen ? this.ladderOpen.has(ch) : ch === this.currentChapter(p);
  }

  /** The chapter list's rows: each chapter's heading, then (open chapters) its floors in rows of five. */
  private ladderRows(p: DuelProfileView): LadderRow[] {
    const rows: LadderRow[] = [];
    for (let ch = 1; ch <= CHAPTERS; ch++) {
      rows.push({ kind: 'head', ch });
      if (this.narrowLadder) rows.push({ kind: 'chests', ch });
      if (!this.chapterOpen(p, ch)) continue;
      const [a, b] = chapterFloors(ch);
      for (let f = a; f <= b; f += 5) rows.push({ kind: 'floors', ch, from: f });
    }
    return rows;
  }

  /** A chapter chest ready to claim, if any (the sentence points at it). */
  private readyChest(p: DuelProfileView): { ch: number; tier: number } | null {
    for (let ch = 1; ch <= CHAPTERS; ch++) for (let tier = 1; tier <= CHEST_TIERS; tier++) if (chestState(p.ladder.stars, p.ladder.chests, ch, tier) === 'ready') return { ch, tier };
    return null;
  }

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
    const chest = this.readyChest(p);
    const sentence =
      problem === 'over_budget'
        ? t('duels.sit.ladderOver', { n, b: f.budget })
        : (why ?? (chest ? t('duels.sit.chestReady', { n: chest.ch }) : done ? (capped ? t('duels.sit.ladderCapped') : t('duels.sit.ladderDone')) : t('duels.sit.ladder', { n, g: f.reward.firstGlory })));
    this.chrome(sentence, { main: done ? null : { label: t('duels.fightFloor', { n }), icon: 'swords', id: 'duel.fightNext', off: why, onClick: () => void this.fight(n) } }, { urgent: !!problem });
    let y = this.pageTop;
    const bottom = this.bottom;
    // the next floor (short screens: the strip's Fight and the ringed tile say it)
    if (!this.compact) {
      if (done) {
        B.add(addEmptyState(this, cx, y, cw, 40, { icon: 'star', title: t('duels.ladderDone'), hint: t('duels.ladderDoneHint', { n: LADDER.floors }) }));
        y += 46;
      } else {
        const ch = 56;
        this.buildNextFloor(f, cx, y, cw, ch, why);
        this.nextCard = { y, h: ch };
        y += ch + 6;
      }
      // farm Glory left today, over the chapters
      const farm = capped ? t('duels.farmUsed') : t('duels.farmToday', { n: p.ladder.farmLeft, max: p.ladder.farmCap });
      B.add(addText(this, cx + 2, y, ellipsize(farm, cw - 4), capped ? 'red' : 'dim'));
      y += 13;
    }
    const rows = this.ladderRows(p);
    this.list = new ScrollList(this, B, cx, y, cw, wholeRows(bottom - y, 30), {
      count: rows.length,
      rowH: 30,
      render: (i, row, rw, _h, area) => {
        const r = rows[i];
        if (r.kind === 'head') this.chapterHead(p, r.ch, row, rw - 3, area);
        else if (r.kind === 'chests') this.chestRow(p, r.ch, row, rw - 3, area);
        else this.floorTiles(p, r.from, row, rw - 3, area);
      },
    });
    // a first look starts at the current chapter
    this.list.area.setScroll(keep >= 0 ? keep : rows.findIndex((r) => r.kind === 'head' && r.ch === this.currentChapter(p)) * 33);
  }

  /** The next floor: its number on a medallion, the reward and budget, the enemy; a tap opens the floor's card. */
  private buildNextFloor(f: ReturnType<typeof ladderFloor>, x: number, y: number, w: number, h: number, why: string | undefined): void {
    const B = this.body;
    B.add(addPanel(this, x, y, w, h, 'slotSel'));
    const ms = 40;
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
    const title = t('duels.nextFloor', { n: f.floor });
    B.add(addText(this, tx, y + 6, fitHead(f.boss ? `${title} · ${t('duels.boss')}` : title, tw), 'head'));
    addNumbers(this, B, tx, y + 21, tw, [
      { icon: 'star', value: `+${f.reward.firstGlory}`, word: t('duels.num.glory'), font: 'gold' },
      { icon: 'helmet', value: `${f.budget}`, word: t('duels.num.budgetPts') },
    ]);
    // what the floor fields, and the gear its first clear drops when that fits too
    const foes = t('duels.enemy', { n: f.heroes.length, pts: f.points });
    const full = `${foes} · ${t('duels.firstDrop')}`;
    const enemy = measureText(full) <= tw ? full : foes;
    B.add(addText(this, tx, y + 37, ellipsize(why ?? enemy, tw), why ? 'red' : 'dim'));
    const z = this.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive();
    uiId(z, 'duel.nextFloor');
    tappable(z, null, () => this.profile && this.openFloor(this.profile, f.floor));
    B.add(z);
  }

  /** A chapter's heading: open / closed, its stars, and its three chests (locked, ready to claim, claimed). */
  private chapterHead(p: DuelProfileView, ch: number, row: Phaser.GameObjects.Container, w: number, area: ScrollArea): void {
    const [first] = chapterFloors(ch);
    const reached = first <= p.ladder.cleared + 1;
    const open = this.chapterOpen(p, ch);
    const stars = chapterStars(p.ladder.stars, ch);
    const max = chapterMaxStars(ch);
    row.add(addPanel(this, 0, 0, w, 27, open ? 'inset' : 'button'));
    const cw = 22;
    const narrow = this.narrowLadder;
    const chestsW = narrow ? 0 : CHEST_TIERS * cw + (CHEST_TIERS - 1) * SIZE.gap;
    const left = w - chestsW - 3;
    const g = this.add.graphics();
    drawChevron(g, 6, 6, open);
    row.add(g);
    // the heading in the head face where it fits whole, else the body face (narrow screens)
    const title = t('duels.chapter', { n: ch });
    const headFits = measureText(title, false, BASE_FONT_SIZE, 'head') <= left - 22;
    row.add(addText(this, 17, 4, headFits ? title : ellipsize(title, left - 21), reached ? (headFits ? 'head' : 'ink') : 'dim'));
    row.add(scaleIcon(addIcon(this, 17, 16, 'star', reached ? '' : 'D'), 0.75));
    const full = t('duels.chapterStars', { n: stars, max });
    row.add(addText(this, 28, 16, measureText(full) <= left - 32 ? full : `${stars}/${max}`, stars >= max ? 'gold' : 'dim'));
    const hz = this.add.zone(0, 0, left - 4, 27).setOrigin(0, 0).setInteractive();
    uiId(hz, 'duel.chapter');
    tappable(hz, area, () => this.toggleChapter(ch));
    row.add(hz);
    if (narrow) return;
    for (let tier = 1; tier <= CHEST_TIERS; tier++) {
      const st = chestState(p.ladder.stars, p.ladder.chests, ch, tier);
      const x = left + (tier - 1) * (cw + SIZE.gap);
      this.chestMarker(row, x, 2, ch, tier, st, area);
    }
  }

  /** Narrow screens: a chapter's three chests in a row of their own under its heading. */
  private chestRow(p: DuelProfileView, ch: number, row: Phaser.GameObjects.Container, w: number, area: ScrollArea): void {
    const gap = SIZE.gap;
    const mw = Math.floor((w - 2 * gap) / 3);
    for (let tier = 1; tier <= CHEST_TIERS; tier++) {
      const x = (tier - 1) * (mw + gap);
      this.chestMarker(row, x, 2, ch, tier, chestState(p.ladder.stars, p.ladder.chests, ch, tier), area, tier === CHEST_TIERS ? w - x : mw);
    }
  }

  /** A chest on a chapter heading: the stars it needs under it (a tick once claimed); ready ones glow. */
  private chestMarker(row: Phaser.GameObjects.Container, x: number, y: number, ch: number, tier: number, st: ChestState, area: ScrollArea, w = 22): void {
    const need = LADDER.chestStars[tier - 1];
    const wide = w > 22;
    if (wide) row.add(addPanel(this, x, 0, w, 27, 'inset'));
    if (st === 'ready') {
      const glow = this.add.graphics();
      glow.fillStyle(BRONZE.hi, 0.35);
      glow.fillRoundedRect(x, y, w, 23, 4);
      glow.lineStyle(1, BRONZE.hi, 1);
      glow.strokeRoundedRect(x + 0.5, y + 0.5, w - 1, 22, 4);
      row.add(glow);
      this.tweens.add({ targets: glow, alpha: { from: 1, to: 0.35 }, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    if (wide) {
      // the chest, then the stars it needs (a tick once claimed), side by side
      const label = st === 'claimed' ? null : addText(this, 0, y + 7, `${need}`, st === 'ready' ? 'gold' : 'dim');
      const both = 12 + 3 + (label ? label.width : 8);
      const ix = Math.round(x + w / 2 - both / 2);
      row.add(addIcon(this, ix, y + 5, 'chest', st === 'ready' ? '' : 'D'));
      if (label) row.add(label.setX(ix + 15));
      else row.add(scaleIcon(addIcon(this, ix + 15, y + 7, 'check', 'D'), 0.67));
    } else {
      row.add(addIcon(this, x + 5, y + 1, 'chest', st === 'ready' ? '' : 'D'));
      if (st === 'claimed') row.add(scaleIcon(addIcon(this, x + 7, y + 14, 'check', 'D'), 0.67));
      else row.add(addText(this, x + 11, y + 14, `${need}`, st === 'ready' ? 'gold' : 'dim', 0.5));
    }
    const z = this.add.zone(x, y, w, 23).setOrigin(0, 0).setInteractive();
    uiId(z, `duel.chest.${tier}`);
    tappable(z, area, () => this.tapChest(ch, tier));
    row.add(z);
  }

  /** Five floors of a chapter: number (a skull on the boss), stars, a lock beyond the next floor. */
  private floorTiles(p: DuelProfileView, from: number, row: Phaser.GameObjects.Container, w: number, area: ScrollArea): void {
    const gap = SIZE.gap;
    const tw = Math.floor((w - 4 * gap) / 5);
    const g = this.add.graphics();
    const tiles: Phaser.GameObjects.GameObject[] = [];
    for (let i = 0; i < 5; i++) {
      const n = from + i;
      if (n > LADDER.floors) break;
      const x = i * (tw + gap);
      const tileW = i === 4 ? w - x : tw;
      const cleared = n <= p.ladder.cleared;
      const next = n === p.ladder.cleared + 1;
      const boss = isBoss(n);
      row.add(addPanel(this, x, 0, tileW, 27, next ? 'slotSel' : cleared ? 'button' : 'inset'));
      const mid = x + tileW / 2;
      const font: FontKey = cleared || next ? 'ink' : 'dim';
      if (boss) {
        const label = addText(this, 0, 4, `${n}`, font);
        const both = 12 + 2 + label.width;
        if (both <= tileW - 4) {
          tiles.push(addIcon(this, Math.round(mid - both / 2), 2, 'skull', cleared || next ? '' : 'D'));
          label.setPosition(Math.round(mid - both / 2) + 14, 4);
          tiles.push(label);
        } else {
          label.destroy();
          tiles.push(addIcon(this, Math.round(mid - 6), 2, 'skull', cleared || next ? '' : 'D'));
        }
      } else tiles.push(addText(this, mid, 4, `${n}`, font, 0.5));
      if (!cleared && !next) tiles.push(scaleIcon(addIcon(this, Math.round(mid - 4.5), 16, 'lock', 'D'), 0.75));
      else drawStars(g, mid, 17, p.ladder.stars[n - 1] ?? 0);
      const z = this.add.zone(x, 0, tileW, 27).setOrigin(0, 0).setInteractive();
      uiId(z, next ? 'duel.floorNext' : cleared ? 'duel.floorDone' : 'duel.floorLocked');
      tappable(z, area, () => this.tapFloor(n));
      tiles.push(z);
    }
    row.add(g);
    row.add(tiles);
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

  /** A floor tile: the floor's card (a cleared one is a replay for farm Glory); a locked one says what opens it. */
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
    const r = chestReward(ch, tier);
    if (st === 'claimed') return void toast(this, t('duels.chest.claimed'), 'info');
    if (st === 'locked') {
      const prize = r.item ? t('duels.chest.prizeItem', { g: r.glory }) : t('duels.chest.prize', { g: r.glory });
      return void toast(this, t('duels.chest.locked', { n: LADDER.chestStars[tier - 1], have: chapterStars(p.ladder.stars, ch), prize }), 'info', 3200);
    }
    void this.claimChest(ch, tier);
  }

  /** Claims a ready chest: the reward popup once the server answers. */
  async claimChest(ch: number, tier: number): Promise<void> {
    const r = await this.act(() => this.src.ladderChest(ch, tier));
    if (r && this.sys.isActive()) {
      hapticNotify('success');
      this.openChestReward(r);
    }
  }

  /** What a chest held: its Glory and (the 30-star chest) an item; a tap on the item opens its card. */
  openChestReward(r: ChestClaim): void {
    const { VW, VH } = this.m;
    const w = Math.min(VW - 12, 200);
    const inner = w - 16;
    const m = openModal(this, { title: t('duels.chest.title', { n: r.chapter }), w, h: Math.min(VH - 12, 26 + 30 + (r.item ? 36 : 0) + SIZE.btnH + 18) });
    const { c, x } = m;
    let y = m.y + 26;
    const gl = t('duels.note.glory', { n: r.glory });
    const gw = 24 + 4 + measureText(gl) * 1.5;
    const gx = Math.round(x + w / 2 - gw / 2);
    c.add(scaleIcon(addIcon(this, gx, y, 'star'), 2));
    c.add(addText(this, gx + 28, y + 6, gl, 'gold').setScale(1.5));
    y += 30;
    const it = r.item;
    if (it) {
      c.add(addPanel(this, x + 8, y, inner, 32, 'button'));
      c.add(new ItemIcon(this, x + 12, y + 4, { item: it }, { size: 24, tip: false }));
      c.add(addText(this, x + 40, y + 6, ellipsize(itemName(it), inner - 40), rarityFont(it.rarity, true)));
      c.add(addText(this, x + 40, y + 18, ellipsize(`${tOr(`rarity.${it.rarity}`, RARITY_LABEL[it.rarity])} · ${t(`slot.${itemDef(it.def).slot}` as TKey)}`, inner - 40), 'dim'));
      const z = this.add.zone(x + 8, y, inner, 32).setOrigin(0, 0).setInteractive();
      uiId(z, 'duel.chest.item');
      tappable(z, null, () => openItemCard(this, { item: it, title: t('duels.chest.inStash'), worth: false, actions: [] }));
      c.add(z);
    }
    c.add(new Button(this, x + 8, m.y + m.h - 8 - SIZE.btnH, inner, SIZE.btnH, { label: t('duels.reward.ok'), variant: 'primary', id: 'duel.chest.ok', onClick: () => m.close() }));
  }

  /** A floor's card: the enemy army, the rewards, the best stars (and farm Glory left on a cleared floor). */
  openFloor(p: DuelProfileView, n: number): void {
    const { VW, VH } = this.m;
    const f = ladderFloor(n);
    const w = Math.min(VW - 12, 230);
    const inner = w - 16;
    const rowH = 16;
    const m = openModal(this, { title: f.boss ? t('duels.floorBoss', { n }) : t('duels.floor', { n }), w, h: Math.min(VH - 12, 26 + 36 + 26 + f.heroes.length * rowH + SIZE.btnH + 20) });
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
    // the best stars so far and how to get three; a replay: farm Glory left today
    const best = p.ladder.stars[n - 1] ?? 0;
    const g = this.add.graphics();
    drawStars(g, x + 8 + 10, y + 1, best);
    c.add(g);
    c.add(addText(this, x + 33, y, ellipsize(next ? t('duels.starsHow') : t('duels.floorBest', { s: best }), inner - 25), 'dim'));
    y += 12;
    const farm = next ? t('duels.firstDrop') : p.ladder.farmLeft > 0 ? t('duels.farmToday', { n: p.ladder.farmLeft, max: p.ladder.farmCap }) : t('duels.replayCapped');
    c.add(addText(this, x + 8, y, ellipsize(farm, inner), next || p.ladder.farmLeft > 0 ? 'dim' : 'red'));
    y += 14;
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
    const b = new Button(this, x + 8 + half + SIZE.gap, by, inner - half - SIZE.gap, SIZE.btnH, { label: next ? t('duels.fight') : t('duels.farm'), icon: 'swords', variant: 'primary', id: 'duel.floorFight', onClick: () => (m.close(), void this.fight(n)) });
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
    try {
      const v = await this.src.asyncView();
      if (!this.sys.isActive()) return;
      this.asyncView = v;
      if (this.tab === 'ranked' && this.arenaTab !== 'board' && this.profile && this.st === 'ready' && !this.search && !this.found) this.buildBody();
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
      if (this.tab === 'ranked' && this.arenaTab === 'board' && this.profile && this.st === 'ready' && !this.search && !this.found) this.buildBody();
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
    // a search or a found opponent take the whole page (the switch waits)
    if (this.found) return this.buildFound(p, this.found);
    if (this.search) return this.buildSearch(p, this.search);
    if (this.arenaTab === 'raid') this.buildRaid(p, this.pageTop, keep);
    else if (this.arenaTab === 'board') this.buildBoard(this.pageTop, keep);
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

  /**
   * A page of mixed cards that scrolls when it does not fit (short screens):
   * `build` fills the content from y = 0 and returns its height. Buttons
   * scrolled out of the viewport stop taking taps.
   */
  private scrollPage(y: number, h: number, keep: number, build: (c: Phaser.GameObjects.Container) => number): void {
    const { VW, S } = this.m;
    const area = new ScrollArea(this, this.body, 0, y, VW, h, S);
    const ch = build(area.content);
    const hint = addScrollHint(this, this.body, area);
    const gate = () => {
      const s = area.scrollY;
      for (const o of area.content.list) {
        const io = o as Phaser.GameObjects.GameObject & { y: number; h?: number; height?: number; input?: { enabled: boolean } | null };
        if (!io.input) continue;
        const oh = io.h ?? io.height ?? 0;
        io.input.enabled = io.y >= s - 1 && io.y + oh <= s + h + 1;
      }
    };
    area.onScroll(gate);
    area.setContentHeight(ch);
    area.setScroll(Math.max(0, keep));
    gate();
    this.pageScroll = { area, destroy: () => (hint.destroy(), area.destroy()) };
  }

  /** "October · 24d 5h left" and the best league of the season; returns the y below. */
  private buildSeasonLine(c: Phaser.GameObjects.Container, x: number, y: number, w: number): number {
    const s = this.season;
    c.add(addIcon(this, x + 1, y - 2, 'clock', 'D'));
    if (!s) {
      c.add(addText(this, x + 16, y, '...', 'dim'));
      return y + 14;
    }
    const peak = s.live.peak ?? s.async.peak;
    const left = t('duels.seasonLeftShort', { month: t(`duels.month.${seasonMonth(s.season.id).month}` as TKey), t: leftText(s.season.end - Date.now()) });
    // the season best only when both fit whole (the time left matters more)
    const right = peak ? t('duels.seasonBest', { league: leagueName(peak) }) : '';
    const fits = right && 16 + measureText(left) + measureText(right) + 10 <= w;
    if (fits) c.add(addText(this, x + w - 2, y, right, 'dim', 1));
    c.add(addText(this, x + 16, y, ellipsize(left, w - 18), 'ink'));
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

  /** "Gold II", "Legend · 2104" or "Placements 3/10". */
  private standing(v: { league: League | null; rating: number | null; placements: { played: number; of: number } }): string {
    const l = v.league;
    return l ? (l.id === 'legend' && v.rating !== null ? t('duels.legendRating', { n: v.rating }) : leagueName(l)) : t('duels.placements', { n: v.placements.played, max: v.placements.of });
  }

  /**
   * A mode card's top: its name and leaderboard button, then the crest, the
   * standing and won / lost (the placement bar under it). Returns the y below.
   */
  private cardTop(c: Phaser.GameObjects.Container, x: number, y: number, w: number, o: { title: string; icon: string; board: Board; id: string; v: { league: League | null; rating: number | null; placements: { played: number; of: number }; wins: number; losses: number } | null }): number {
    const bw = SIZE.btnMinW;
    c.add(addIcon(this, x + 6, y + 6, o.icon));
    c.add(addText(this, x + 22, y + 8, fitHead(o.title, w - 22 - bw - 10), 'head'));
    c.add(new Button(this, x + w - 4 - bw, y + 3, bw, bw, { icon: 'trophy', label: t(`duels.view.board.${o.board}` as TKey), iconOnly: true, id: `${o.id}.board`, onClick: () => this.openBoard(o.board) }));
    const cs = this.compact ? 24 : 30;
    const ty = y + 31;
    this.addCrest(c, x + 6, ty, cs, o.v?.league ?? null);
    const tx = x + 6 + cs + 7;
    const tw = x + w - 6 - tx;
    if (!o.v) {
      c.add(addText(this, tx, ty + 2, '...', 'dim'));
      return ty + cs + 5;
    }
    c.add(addText(this, tx, ty + 1, ellipsize(this.standing(o.v), tw), 'ink'));
    addNumbers(this, c, tx, ty + 13, tw, [
      { icon: 'swords', value: `${o.v.wins}`, word: t('duels.num.won') },
      { icon: 'skull', value: `${o.v.losses}`, word: t('duels.num.lost') },
    ]);
    if (!o.v.league && cs >= 30) c.add(new Meter(this, tx, ty + 25, tw, 3, COLOR.xp).setValue(o.v.placements.played, o.v.placements.of));
    return ty + cs + 5;
  }

  /** The Arena: the season, then the Live PvP card and the Raids card (each with its leaderboard). */
  private buildArenaHome(p: DuelProfileView, keep: number): void {
    const { cx, cw } = this;
    const r = this.ranked;
    const a = this.asyncView;
    const now = Date.now();
    const team = this.teamHeroes(p, 'arena');
    const problem = teamProblem(team, DUEL_RULES.budget);
    const cooldown = r && r.cooldownUntil > now ? r.cooldownUntil : 0;
    const locked = !!r && !r.unlocked;
    const match = r?.match ?? null;
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
              : a && a.unlocked && !a.defence
                ? t('duels.sit.raidNoDefence')
                : t('duels.sit.arena');
    this.chrome(sentence, {}, { urgent: !!match || !!cooldown || !!problem });
    const top = this.pageTop;
    this.scrollPage(top, this.bottom - top, keep, (c) => {
      let y = this.buildSeasonLine(c, cx, 0, cw) + 2;
      y += this.liveCard(c, p, cx, y, cw) + 6;
      y += this.raidCard(c, p, cx, y, cw);
      return y + 2;
    });
  }

  /** Live PvP: league or placements, won / lost, why it is closed, Find match (the one red action) and Unranked. */
  private liveCard(c: Phaser.GameObjects.Container, p: DuelProfileView, x: number, y: number, w: number): number {
    const r = this.ranked;
    const now = Date.now();
    const team = this.teamHeroes(p, 'arena');
    const problem = teamProblem(team, DUEL_RULES.budget);
    const cooldown = r && r.cooldownUntil > now ? r.cooldownUntil : 0;
    const locked = !!r && !r.unlocked;
    const match = r?.match ?? null;
    const i0 = c.list.length;
    let ly = this.cardTop(c, x, y, w, { title: t('duels.card.live'), icon: 'swords', board: 'live', id: 'duel.live', v: r });
    // one line: what is going on (or what a match pays)
    const why = this.entering ? t('duel.preparing') : cooldown ? t('duels.unq.cooldown') : problem ? t(`duels.why.${problem}` as TKey, { n: DUEL_RULES.budget }) : !r ? t('duels.unq.error') : undefined;
    const [line, font]: [string, FontKey] = match
      ? [t('duels.rejoinHint'), 'ink']
      : cooldown
        ? [t('duels.cooldown', { t: clockText(cooldown - now) }), 'red']
        : problem
          ? [why!, 'red']
          : locked && r
            ? [t('duels.lockedLine', { n: r.unlockLevel, l: levelProgress(p.xp).level }), 'red']
            : [t('duels.payRanked', { w: RANKED.glory.ranked.win, l: RANKED.glory.ranked.loss }), 'dim'];
    const wr = wrapText(line, w - 12, 2);
    c.add(addText(this, x + 6, ly, wr.lines.join('\n'), font));
    ly += wr.lines.length * LINE_H + 3;
    // Find match (or Rejoin) and Unranked
    const gap = SIZE.gap;
    const unLabel = t('duels.unranked');
    const uw = match ? 0 : Math.min(Math.floor((w - 12) / 2), measureText(unLabel) + 12);
    const mw = w - 12 - (uw ? uw + gap : 0);
    const main = match
      ? new Button(this, x + 6, ly, mw, SIZE.btnH, { label: t('duels.rejoin'), icon: 'swords', variant: 'primary', id: 'duel.rejoin', onClick: () => this.enterMatch(match.id, match.mode) })
      : new Button(this, x + 6, ly, mw, SIZE.btnH, { label: t('duels.findMatch'), icon: measureText(t('duels.findMatch')) + 30 <= mw ? 'swords' : undefined, variant: 'primary', id: 'duel.findRanked', onClick: () => this.findMatch('ranked') });
    const mainOff = match ? (this.entering ? t('duel.preparing') : undefined) : (why ?? (locked && r ? t('duels.rankedLocked', { n: r.unlockLevel }) : undefined));
    if (mainOff) main.setEnabled(false, mainOff);
    c.add(main);
    if (uw) {
      const un = new Button(this, x + 6 + mw + gap, ly, uw, SIZE.btnH, { label: unLabel, id: 'duel.findUnranked', tip: t('duels.unrankedTip', { w: RANKED.glory.unranked.win }), onClick: () => this.findMatch('unranked') });
      if (why) un.setEnabled(false, why);
      c.add(un);
    }
    ly += SIZE.btnH + 6;
    const h = ly - y;
    c.addAt(addPanel(this, x, y, w, h, 'inset'), i0);
    return h;
  }

  /** Raids: the raid league, raids left today, the defence team (a tap edits it), Raid (the picks) and the log. */
  private raidCard(c: Phaser.GameObjects.Container, p: DuelProfileView, x: number, y: number, w: number): number {
    const a = this.asyncView;
    const i0 = c.list.length;
    let ly = this.cardTop(c, x, y, w, { title: t('duels.card.raids'), icon: 'shield', board: 'async', id: 'duel.raids', v: a });
    if (a) {
      const [line, font]: [string, FontKey] = !a.unlocked
        ? [t('duels.raid.locked', { n: a.unlockLevel }), 'red']
        : [t('duels.raid.leftToday', { n: a.attacks.left, max: a.attacks.cap }), a.attacks.left > 0 ? 'ink' : 'red'];
      c.add(addText(this, x + 6, ly, ellipsize(line, w - 12), font));
      ly += 13;
      const def = a.defence;
      c.add(
        new ListRow(this, x + 6, ly, w - 12, {
          label: def ? t('duels.raid.defence', { team: this.loadoutName(p, p.use.defence) }) : t('duels.raid.noDefence'),
          sub: def ? t('duels.raid.defSub', { n: def.heroes, pts: def.points, w: a.defenceWins, d: a.defences }) : t('duels.raid.noDefenceSub'),
          icon: 'shield',
          primary: !def && a.unlocked,
          id: 'duel.raid.defence',
          onClick: () => this.openDefence(),
        }),
      );
      ly += 26 + SIZE.gap;
      const bw = SIZE.btnMinW;
      const go = new Button(this, x + 6, ly, w - 12 - bw - SIZE.gap, SIZE.btnH, { label: t('duels.raid.pickBtn'), icon: 'swords', id: 'duel.raid.open', onClick: () => this.openArena('raid') });
      if (!a.unlocked) go.setEnabled(false, t('duels.raid.locked', { n: a.unlockLevel }));
      c.add(go);
      c.add(new Button(this, x + w - 6 - bw, ly, bw, SIZE.btnH, { icon: 'eye', label: t('duels.raid.log'), iconOnly: true, id: 'duel.raid.log', onClick: () => void this.openRaidLog() }));
      ly += SIZE.btnH + 6;
    }
    const h = ly - y;
    c.addAt(addPanel(this, x, y, w, h, 'inset'), i0);
    return h;
  }

  private searchSentence(s: { mode: DuelMode; since: number }): string {
    return t(`duels.sit.searching.${s.mode}` as TKey, { t: clockText(Date.now() - s.since) });
  }

  private buildSearch(p: DuelProfileView, s: { mode: DuelMode; since: number }): void {
    void p;
    this.chrome(this.searchSentence(s), {
      left: { ...this.backSlot(), off: t('duels.why.searching') },
      main: { label: t('common.cancel'), icon: 'close', secondary: true, id: 'duel.cancelSearch', onClick: () => this.cancelSearch() },
    });
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
    const ch = this.compact ? 30 : 40;
    if (s.mode === 'ranked' && r && y + ch <= bottom) {
      const n = B.list.length;
      B.add(addPanel(this, cx, y, cw, ch, 'inset'));
      const cs = ch - 10;
      this.addCrest(B, cx + 6, y + 5, cs, r.league);
      const tx = cx + 6 + cs + 7;
      B.add(addText(this, tx, y + 5, ellipsize(this.standing(r), cx + cw - 6 - tx), 'ink'));
      if (ch >= 40) addNumbers(this, B, tx, y + 19, cx + cw - 6 - tx, [
        { icon: 'swords', value: `${r.wins}`, word: t('duels.num.won') },
        { icon: 'skull', value: `${r.losses}`, word: t('duels.num.lost') },
      ]);
      for (const o of B.list.slice(n)) (o as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0.7);
    }
  }

  private buildFound(p: DuelProfileView, f: { name: string; league: League | null }): void {
    void p;
    this.chrome(t('duels.sit.found', { name: f.name }), {
      left: null,
      main: { label: t('duel.preparing'), secondary: true, off: t('duel.preparing'), id: 'duel.preparing' },
      why: '',
    });
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
    showReport(this.game, rankedReport(report, t('battle.vs', { name: 'Hektor' }), this.src.demo), () => backToDuel(this.game, { tab: 'ranked', arena: 'home', preview: this.src.demo }));
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

  /** The raid picks: raids left, the defence team, the three defenders (the strip raids the picked one). */
  private buildRaid(p: DuelProfileView, y: number, keep: number): void {
    const { cx, cw } = this;
    const B = this.body;
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
        right: { label: t('duels.raid.log'), icon: 'eye', id: 'duel.raid.logStrip', onClick: () => void this.openRaidLog() },
      },
      { urgent: !!a && a.unlocked && !a.defence },
    );
    const bottom = this.bottom;
    if (!a) {
      B.add(addText(this, cx + cw / 2, y + 8, '...', 'ink', 0.5));
      return;
    }
    // raids left and the raid league on one line
    const left = t('duels.raid.leftLong', { n: a.attacks.left, max: a.attacks.cap });
    const lt = addText(this, cx + cw - 2, y, left, a.attacks.left > 0 ? 'ink' : 'red', 1);
    B.add(lt);
    B.add(addText(this, cx + 2, y, ellipsize(this.standing(a), cw - lt.width - 12), 'dim'));
    y += 13;
    const def = a.defence;
    B.add(
      new ListRow(this, cx, y, cw, {
        label: def ? t('duels.raid.defence', { team: this.loadoutName(p, p.use.defence) }) : t('duels.raid.noDefence'),
        sub: def ? t('duels.raid.defSub', { n: def.heroes, pts: def.points, w: a.defenceWins, d: a.defences }) : t('duels.raid.noDefenceSub'),
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
    if (!this.compact && bottom - y >= 12 + 30) {
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
    this.list.area.setScroll(Math.max(0, keep));
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
    const n = p.loadouts.length;
    // the hint gets the lines the teams and Close leave (short screens: fewer, or none)
    const fixed = 26 + 6 + n * (rowH + SIZE.gap) + SIZE.btnH + 14;
    const hintLines = Math.max(0, Math.min(3, Math.floor((VH - 12 - fixed) / LINE_H)));
    const wr = hintLines ? wrapText(t('duels.def.hint', { n: DUEL_RULES.budget }), inner, hintLines) : { lines: [] as string[] };
    const m = openModal(this, { title: t('duels.def.title'), w, h: Math.min(VH - 12, fixed + wr.lines.length * LINE_H) });
    const { c, x } = m;
    let y = m.y + 24;
    c.add(addText(this, x + 8, y, wr.lines.join('\n'), 'dim'));
    y += wr.lines.length * LINE_H + 6;
    const by = m.y + m.h - 8 - SIZE.btnH;
    const list = new ScrollList(this, c, x + 8, y, inner, Math.max(rowH, by - 4 - y), {
      count: n,
      rowH: rowH - 2,
      render: (i, row, rw) => {
        const l = p.loadouts[i];
        const heroes = this.heroesOf(p, l.team);
        const pts = teamPoints(heroes);
        const problem = teamProblem(heroes, DUEL_RULES.budget);
        const on = p.use.defence === l.slot && !!p.defence;
        const b = new Button(this, 0, 0, rw - 3, rowH - 2, {
          label: `${presetLabel(l)} · ${t('duels.teamLine', { n: heroes.length, max: DUEL_RULES.teamMax, pts })}`,
          icon: on ? 'check' : 'shield',
          inline: true,
          style: on ? 'buttonSel' : 'button',
          id: `duel.def.${l.slot}`,
          onClick: () => (m.close(), void this.act(() => this.src.loadout({ slot: l.slot, use: ['defence'] }), () => t('duels.def.set', { team: presetLabel(l) })).then(() => this.loadAsync())),
        });
        b.setEnabled(!problem, problem ? t(`duels.why.${problem}` as TKey, { n: DUEL_RULES.budget }) : undefined);
        row.add(b);
      },
    });
    c.once('destroy', () => list.destroy());
    c.add(new Button(this, x + 8, by, inner, SIZE.btnH, { label: t('common.close'), onClick: () => m.close() }));
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

  /** A leaderboard: the season's title line, the top 50, your own row pinned under it. */
  private buildBoard(y: number, keep: number): void {
    const { cx, cw } = this;
    const B = this.body;
    this.chrome(t('duels.sit.top', { season: this.season ? seasonName(this.season.season.id) : '...' }), {});
    const bottom = this.bottom;
    const title = this.season?.title;
    if (title) {
      B.add(addText(this, cx + 2, y, ellipsize(t('duels.titleLine', { title: t('duels.titleOf', { league: leagueTitle(title.league), season: seasonName(title.season) }) }), cw - 4), 'dim'));
      y += 13;
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
      this.list.area.setScroll(Math.max(0, keep));
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

  /** The Team view's rows: the presets, the edited one's name and uses, its points, then its heroes and the bench. */
  private teamRows(p: DuelProfileView): TeamRow[] {
    const team = this.teamHeroes(p);
    const bench = p.heroes.filter((x) => !p.team.includes(x.id));
    const rows: TeamRow[] = [{ kind: 'presets' }, { kind: 'name' }, { kind: 'uses' }, { kind: 'points' }];
    if (!p.heroes.length) return [...rows, { kind: 'empty' }];
    rows.push(...team.map((hero): TeamRow => ({ kind: 'hero', hero })));
    if (bench.length) rows.push({ kind: 'head', text: t('duels.benchHead', { n: bench.length }) }, ...bench.map((hero): TeamRow => ({ kind: 'hero', hero })));
    return rows;
  }

  private buildTeam(p: DuelProfileView, keep: number): void {
    const { cx, cw } = this;
    const team = this.teamHeroes(p);
    const pts = teamPoints(team);
    const budget = DUEL_RULES.budget;
    const over = pts > budget;
    const spend = this.fightingHeroes(p).filter(heroNeedsAttention);
    this.chrome(
      over ? t('duels.sit.teamOver', { n: pts - budget, b: budget }) : spend.length ? t('duels.sit.teamSpend', { name: spend[0].name }) : t('duels.sit.team'),
      {
        main: { label: t('duels.recruit'), icon: 'plus', id: 'duel.recruit', onClick: () => this.openRecruit() },
        right: { label: t('duels.dismiss'), icon: 'close', id: 'duel.dismiss', onClick: () => this.openDismiss() },
      },
      { urgent: over },
    );
    const y = this.pageTop;
    const rows = this.teamRows(p);
    this.list = new ScrollList(this, this.body, cx, y, cw, wholeRows(this.bottom - y, 32), {
      count: rows.length,
      rowH: 32,
      render: (i, row, rw, _h, area) => {
        const r = rows[i];
        const w = rw - 3;
        if (r.kind === 'presets') this.presetChips(p, row, w, area);
        else if (r.kind === 'name') this.presetName(p, row, w);
        else if (r.kind === 'uses') this.presetUses(p, row, w);
        else if (r.kind === 'points') this.presetPoints(p, row, w);
        else if (r.kind === 'hero') this.heroRow(p, r.hero, row, rw);
        else if (r.kind === 'head') {
          row.add(addText(this, 2, 16, fitHead(r.text, rw - 8), 'head'));
          row.add(this.add.rectangle(2, 27, rw - 7, 1, BRONZE.dark).setOrigin(0, 0));
        } else row.add(addText(this, 2, 10, ellipsize(t('duels.recruitHint'), w - 4), 'dim'));
      },
    });
    this.list.area.setScroll(Math.max(0, keep));
  }

  /** The presets: one chip each (the edited one bronze-rimmed; icons for what it fights on), then "+" while there is room. */
  private presetChips(p: DuelProfileView, row: Phaser.GameObjects.Container, w: number, area: ScrollArea): void {
    const ls = p.loadouts;
    const plus = ls.length < DUEL_RULES.presetsMax;
    const k = ls.length + (plus ? 1 : 0);
    const gap = SIZE.gap;
    const chipW = Math.floor((w - (k - 1) * gap) / k);
    const icons: Phaser.GameObjects.GameObject[] = [];
    const chip = (i: number, sel: boolean, id: string, onTap: () => void, tip: string): { x: number; w: number } => {
      const x = i * (chipW + gap);
      const cw = i === k - 1 ? w - x : chipW;
      row.add(addPanel(this, x, 0, cw, 29, sel ? 'slotSel' : 'button'));
      const z = this.add.zone(x, 0, cw, 29).setOrigin(0, 0).setInteractive();
      uiId(z, id);
      tappable(z, area, onTap, tip);
      icons.push(z);
      return { x, w: cw };
    };
    ls.forEach((l, i) => {
      const sel = l.slot === p.loadout;
      const name = presetLabel(l);
      const { x, w: cw } = chip(i, sel, `duel.preset.${l.slot}`, () => this.selectPreset(l.slot), name);
      const label = measureText(name) <= cw - 6 ? name : cw >= 40 ? ellipsize(name, cw - 6) : `${l.slot}`;
      row.add(addText(this, x + cw / 2, 4, label, 'ink', 0.5));
      const uses = LOADOUT_USES.filter((u) => p.use[u] === l.slot);
      const iw = 8;
      let ix = Math.round(x + cw / 2 - (uses.length * (iw + 2) - 2) / 2);
      for (const u of uses) {
        row.add(scaleIcon(addIcon(this, ix, 17, USE_ICONS[u]), iw / 12));
        ix += iw + 2;
      }
    });
    if (plus) {
      const { x, w: cw } = chip(ls.length, false, 'duel.preset.new', () => this.newPreset(), t('duels.preset.new'));
      row.add(addIcon(this, Math.round(x + cw / 2 - 6), 8, 'plus'));
    }
    row.add(icons);
  }

  /** The edited preset's name, with rename, duplicate and delete. */
  private presetName(p: DuelProfileView, row: Phaser.GameObjects.Container, w: number): void {
    const slot = p.loadout;
    const bw = SIZE.btnMinW;
    const gap = SIZE.gap;
    const full = p.loadouts.length >= DUEL_RULES.presetsMax;
    const last = p.loadouts.length <= 1;
    const bx = w - 3 * bw - 2 * gap;
    const mk = (i: number, icon: string, label: string, id: string, onClick: () => void, off?: string) => {
      const b = new Button(this, bx + i * (bw + gap), 3, bw, bw, { icon, label, iconOnly: true, id, onClick });
      if (off) b.setEnabled(false, off);
      row.add(b);
    };
    row.add(addText(this, 2, 11, fitHead(this.loadoutName(p, slot), bx - 8), 'head'));
    mk(0, 'pen', t('duels.preset.rename'), 'duel.preset.rename', () => void this.renamePreset(slot));
    mk(1, 'copy', t('duels.preset.duplicate'), 'duel.preset.duplicate', () => this.duplicatePreset(slot), full ? t('duels.preset.full', { n: DUEL_RULES.presetsMax }) : undefined);
    mk(2, 'bin', t('duels.preset.delete'), 'duel.preset.delete', () => this.deletePreset(slot), last ? t('duels.preset.lastOne') : undefined);
  }

  /** "Use for: Ladder Arena Defence": toggles that make the edited preset the one fighting there. */
  private presetUses(p: DuelProfileView, row: Phaser.GameObjects.Container, w: number): void {
    const gap = SIZE.gap;
    const head = t('duels.useFor');
    const hw = measureText(head) + 6;
    const labels = LOADOUT_USES.map((u) => t(`duels.use.${u}` as TKey));
    // the "Use for" word only while the buttons keep their words whole
    const fits = (room: number) => labels.every((l) => measureText(l) + 10 <= Math.floor((room - 2 * gap) / 3));
    const withHead = fits(w - hw);
    const x0 = withHead ? hw : 0;
    const bw = Math.floor((w - x0 - 2 * gap) / 3);
    const withIcons = (i: number) => measureText(labels[i]) + 26 <= (i === 2 ? w - x0 - 2 * (bw + gap) : bw);
    if (withHead) row.add(addText(this, 2, 11, head, 'dim'));
    const heroes = this.teamHeroes(p);
    LOADOUT_USES.forEach((u, i) => {
      const on = p.use[u] === p.loadout;
      const problem = u === 'defence' ? teamProblem(heroes, DUEL_RULES.budget) : heroes.length ? null : 'empty';
      const b = new Button(this, x0 + i * (bw + gap), 3, i === 2 ? w - x0 - 2 * (bw + gap) : bw, SIZE.btnH, {
        label: labels[i],
        icon: withIcons(i) ? (on ? 'check' : USE_ICONS[u]) : undefined,
        style: on ? 'buttonSel' : 'button',
        id: `duel.use.${u}`,
        tip: on ? t('duels.useOn', { use: labels[i] }) : t('duels.useTip', { use: labels[i] }),
        onClick: () => (on ? toast(this, t('duels.useOn', { use: labels[i] }), 'info', 3000) : this.assignUse(u)),
      });
      if (!on && problem) b.setEnabled(false, t(`duels.why.${problem}` as TKey, { n: DUEL_RULES.budget }));
      row.add(b);
    });
  }

  /** "In the team · 6 of 10" and the points against the budget, with its bar. */
  private presetPoints(p: DuelProfileView, row: Phaser.GameObjects.Container, w: number): void {
    const team = this.teamHeroes(p);
    const pts = teamPoints(team);
    const budget = DUEL_RULES.budget;
    const over = pts > budget;
    const pt = addText(this, w - 2, 8, t('duels.points', { n: pts, max: budget }), over ? 'red' : 'ink', 1);
    row.add(pt);
    row.add(addText(this, 2, 7, fitHead(t('duels.inTeam', { n: team.length, max: DUEL_RULES.teamMax }), w - pt.width - 10), 'head'));
    row.add(new Meter(this, 2, 21, w - 4, 3, over ? COLOR.bad : COLOR.xp).setValue(Math.min(pts, budget), budget));
  }

  private heroRow(p: DuelProfileView, h: Hero, row: Phaser.GameObjects.Container, rw: number): void {
    const w = rw - 3; // the scrollbar's gutter
    const inTeam = p.team.includes(h.id);
    row.add(addPanel(this, 0, 0, w, 29, inTeam ? 'slotSel' : 'button'));
    const cls = heroClass(h);
    row.add(addPanel(this, 3, 3, 23, 23, 'slot'));
    row.add(addPortrait(this, dollFromHero(h), 3, 3, { size: 23 }));
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
    // points or a perk to spend: a red "!" after the name (the hero sheet badges the tab)
    const attention = heroNeedsAttention(h) ? 14 : 0;
    const ptsText = t('duels.pts', { n: heroPoints(h) });
    let ptsW = 0;
    if (!narrow) {
      const pts = addText(this, right, 5, ptsText, 'ink', 1);
      row.add(pts);
      addGroupBadge(this, row, right - pts.width - 16, 3, h.group);
      ptsW = pts.width + 20;
    }
    const name = addText(this, x, 5, ellipsize(h.name, right - ptsW - x - attention), 'ink');
    row.add(name);
    if (attention) row.add(new Badge(this, x + name.width + 8, 9, '!'));
    const stars = w >= 220;
    const sub = narrow ? `${ptsText} · ${t('hero.level', { n: h.level })}` : `${t('hero.level', { n: h.level })} · ${className(h)}`;
    const subT = addText(this, x, 17, ellipsize(sub, right - x - (stars ? 43 : 0)), 'dim');
    row.add(subT);
    if (stars) addStars(this, row, right - 39, 19, heroStars(h));
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
        row.add(addPortrait(this, dollFromHero(sample), 4, 4, { size: 24 }).setAlpha(locked ? 0.5 : 1));
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

  /** The shop's column: the content column on phones; up to two card columns where the screen is wide. */
  private get shopCol(): { x: number; w: number; cols: number } {
    const w = Math.min(this.m.VW - 8, 480);
    const cols = w >= 2 * 176 + SIZE.gap ? 2 : 1;
    const cw = cols === 1 ? this.cw : w;
    return { x: Math.round((this.m.VW - cw) / 2), w: cw, cols };
  }

  private buildShop(p: DuelProfileView, keep: number): void {
    const { x: sx, w: sw, cols } = this.shopCol;
    const B = this.body;
    this.chrome(t(`duels.sit.${this.shopTab}` as TKey), {});
    const bottom = this.bottom;
    let y = this.pageTop;
    // Today | Gear | Sell: chips (not a second tab bar)
    const gap = SIZE.gap;
    const chw = Math.floor((sw - 2 * gap) / 3);
    SHOP_TABS.forEach((k, i) =>
      B.add(
        new Chip(this, sx + i * (chw + gap), y, i === 2 ? sw - 2 * (chw + gap) : chw, {
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
      this.stash = new StashGrid(this, B, sx, y, sw, bottom - y, {
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
      B.add(addIcon(this, sx + 1, y - 2, 'clock', 'D'));
      B.add(addText(this, sx + 16, y, ellipsize(t('duels.offersIn', { t: leftText(day - (Date.now() % day)) }), sw - 18), 'dim'));
      y += 14;
    } else {
      // slot chooser (icons; the slot's name on long-press), then that slot's items at every shop rarity
      const slotW = Math.floor((sw - (SLOTS.length - 1) * gap) / SLOTS.length);
      const slotIcon = (s: Slot) => (s === 'weapon' ? 'sword' : s === 'trinket' ? 'ring' : s);
      if (slotW < 22) {
        // too narrow for five targets: one chip that cycles the slot
        const nextSlot = SLOTS[(SLOTS.indexOf(this.gearSlot) + 1) % SLOTS.length];
        B.add(new Chip(this, sx, y, sw, { label: t(`slot.${this.gearSlot}` as TKey), icon: slotIcon(this.gearSlot), chevron: true, id: 'duel.slot.cycle', tip: t(`slot.${nextSlot}` as TKey), onClick: () => ((this.gearSlot = nextSlot), this.buildBody()) }));
      } else
        SLOTS.forEach((s, i) =>
          B.add(
            new Button(this, sx + i * (slotW + gap), y, i === SLOTS.length - 1 ? sw - i * (slotW + gap) : slotW, 22, {
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
    const team = this.fightingHeroes(p);
    // narrow cards (small phones): the stats take the full width, Buy goes under them
    const colW = Math.floor((sw - 3 - (cols - 1) * gap) / cols);
    const cardH = colW < OFFER_NARROW ? 94 : 68;
    const rows = Math.ceil(offers.length / cols);
    this.list = new ScrollList(this, B, sx, y, sw, bottom - y, {
      count: rows,
      rowH: cardH,
      render: (i, row, rw, rh, area) => {
        const colW = Math.floor((rw - 3 - (cols - 1) * gap) / cols);
        for (let k = 0; k < cols; k++) {
          const o = offers[i * cols + k];
          if (o) this.offerCard(p, o, row, k * (colW + gap), k === cols - 1 ? rw - 3 - k * (colW + gap) : colW, rh, daily, team, area);
        }
      },
    });
    this.list.area.setScroll(Math.max(0, keep));
  }

  /**
   * An offer as a card: the item in its rarity colour, rarity and slot, its
   * main stats against the best the team wears in that slot (green up, red
   * down), the price in Glory and Buy (no confirm: a tap buys). A tap on the
   * card opens the full item card.
   */
  private offerCard(p: DuelProfileView, o: ShopOffer, row: Phaser.GameObjects.Container, x: number, w: number, rh: number, daily: boolean, team: Hero[], area: ScrollArea): void {
    const it = sample(o);
    const sold = p.bought.includes(o.id);
    const afford = p.glory >= o.price;
    const h = rh - 2;
    row.add(addPanel(this, x, 0, w, h, sold ? 'slot' : 'inset'));
    row.add(new ItemIcon(this, x + 4, 4, { item: it }, { size: 24, tip: false }));
    // the price, top right
    const pt = addText(this, x + w - 5, 5, `${o.price}`, sold ? 'dim' : afford ? 'gold' : 'red', 1);
    row.add(pt);
    row.add(addIcon(this, x + w - 5 - pt.width - 14, 3, 'star', sold ? 'D' : ''));
    const priceW = pt.width + 20;
    const tx = x + 32;
    row.add(addText(this, tx, 5, ellipsize(itemName(it), x + w - priceW - 4 - tx), rarityFont(o.rarity, true)));
    const label = `${tOr(`rarity.${o.rarity}`, RARITY_LABEL[o.rarity])} · ${t(`slot.${itemDef(o.def).slot}` as TKey)}`;
    const off = daily && !sold ? '-20%' : '';
    const offW = off ? measureText(off, true) + 10 : 0;
    const sub = addText(this, tx, 16, ellipsize(label, x + w - 6 - tx - offW), 'dim');
    row.add(sub);
    if (off) addChip(this, row, tx + sub.width + 4, 15, off, COLOR.good, offW);
    // Buy, bottom right
    const bw = Math.min(56, Math.max(44, measureText(t('duels.buy')) + 14, measureText(t('duels.soldOut')) + 14));
    const by = h - 4 - 22;
    const buy = new Button(this, x + w - bw - 4, by, bw, 22, { label: sold ? t('duels.soldOut') : t('duels.buy'), id: 'duel.buy', tip: t('duels.buyTip', { name: itemName(it), n: o.price }), onClick: () => this.buy(o) });
    if (sold) buy.setEnabled(false, t('duels.soldOut'));
    else if (!afford) buy.setEnabled(false, t('duels.noGloryFor', { n: o.price - p.glory }));
    // the main stats against what the team wears
    const sum = offerSummary(o, team, 3);
    const narrow = w < OFFER_NARROW;
    const statsW = narrow ? w - 12 : w - 12 - bw - 6;
    const dw = Math.min(46, 12 + Math.max(0, ...sum.lines.map((l) => (l.better !== null && l.deltaText ? measureText(l.deltaText) : 0))));
    const g = this.add.graphics();
    sum.lines.forEach((l, k) => {
      const ly = 31 + k * LINE_H;
      const vx = x + 6 + statsW - dw - 2;
      const vt = addText(this, vx, ly, l.text, 'ink', 1);
      row.add(vt);
      if (l.better !== null && l.deltaText) {
        drawArrow(g, vx + 5, ly + 2, l.better);
        row.add(addText(this, vx + 12, ly, ellipsize(l.deltaText, dw - 12), l.better ? 'good' : 'red'));
      }
      row.add(addText(this, x + 6, ly, ellipsize(tOr(`mod.${l.key}`, l.key), statsW - dw - vt.width - 8), 'ink'));
    });
    row.add(g);
    const z = this.add.zone(x, 0, narrow ? w : w - bw - 8, narrow ? by - 3 : h).setOrigin(0, 0).setInteractive();
    uiId(z, 'duel.offer');
    tappable(z, area, () => this.profile && this.openOffer(this.profile, o));
    row.add(z);
    row.add(buy);
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

  buy(o: ShopOffer): void {
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
        .then((r) => reportThenHub(game, () => ladderReport(r, this.label, src.demo), { tab: 'ladder', preview: src.demo, result: { glory: r.glory, won: r.won, floor: r.floor, first: r.firstClear, stars: r.stars, newBest: r.newBest } }))
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
  if (r.won && r.stars) notes.push(r.newBest && !r.firstClear ? t('duels.note.starsBest', { s: r.stars }) : t('duels.note.stars', { s: r.stars }));
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
