/**
 * Where the duel screens get their data (docs/DUELS.md): the real API
 * (/api/duel, signed in through Telegram) or an in-memory demo that applies
 * the same shared rules locally (layout check, previews; it saves nothing and
 * verifies nothing). Every call rejects with an ApiError-like value when the
 * API cannot be used; the screens turn that into a state (econState).
 */
import { online } from '../platform/cloud';
import { ApiError, newRequestId } from '../platform/api';
import type { Hero } from '../data/units';
import { itemDef, type Item, type Slot } from '../data/items';
import { ATTR_IDS, ATTR_MAX, POINTS_PER_LEVEL, type Attrs } from '../data/perks';
import type { ClassId } from '../data/classes';
import type { FormationType } from '../sim/formation';
import type { BattleResult, BattleSetup, LoggedOrder, Side } from '../sim/types';
import { Rng } from '../sim/rng';
import { DEFAULT_FORMATIONS } from '../online/rules';
import {
  DUEL_RULES, accountLevel, cleanPresetName, classUnlockLevel, developHero, duelRecruit, findOffer, recruitPrice, respecHero, respecPrice, sellPrice, shopItem,
  starterDuelRoster, teamPoints, teamProblem, utcDay,
} from './rules';
import { canFight, chestItem, chestReward, chestState, duelHeroXp, ladderFloor, ladderPayout, ladderSetup, starsByFloor, validChest, type HeroXp } from './ladder';
import { RANKED, glicko2, leagueOf, matchPay, placed, scoreOf, type DuelMode, type League, type LeagueId, type Rating, type Score } from './rating';
import type { AsyncReport, LiveMatchRef, MatchReport, MatchmakerClientMsg, MatchmakerServerMsg } from './protocol';
import { ASYNC, SEASON, asyncSetup, attackPay, defenceRating, pickCandidates, seasonEnd, seasonId, seasonStart, type Ladder } from './season';
import { ShardSocket } from '../online/client';
import { onlineBattleSetup } from '../online/battle';
import { randomSite } from '../world/battlefield';

export interface DuelProfileView {
  now: number;
  day: number;
  glory: number;
  xp: number;
  level: number;
  ladder: {
    cleared: number;
    farmLeft: number;
    farmCap: number;
    /** Best stars per floor (index floor − 1, LADDER.floors long; 0: not won). Chapter sums: chapterStars (ladder.ts). */
    stars: number[];
    /** Chapter chests already claimed (states: chestState in ladder.ts). */
    chests: { chapter: number; tier: number }[];
  };
  team: string[];
  formations: FormationType[];
  heroes: Hero[];
  stash: Item[];
  battles: number;
  wins: number;
  bought: string[];
  /**
   * The presets (saved teams), 1..DUEL_RULES.presetsMax of them, sorted by
   * slot; slots may have gaps after a delete, so find a preset by `slot`
   * (never index by slot − 1). `team` and `formations` above are the edited one's (`loadout`).
   */
  loadouts: Loadout[];
  loadout: number;
  /** Which loadout fights where. */
  use: Record<LoadoutUse, number>;
  /** The defence the bot plays in raids (null: none set yet). */
  defence: { points: number; heroes: number; updatedAt: number } | null;
}

export type LoadoutUse = 'ladder' | 'arena' | 'defence';
export const LOADOUT_USES: LoadoutUse[] = ['ladder', 'arena', 'defence'];

export interface Loadout {
  /** Stable id of the preset (1..DUEL_RULES.presetsMax). */
  slot: number;
  /** Null: the default name, presetName(l) = "Team <slot>". */
  name: string | null;
  team: string[];
  formations: FormationType[];
}

/** A defender offered for a raid (GET /api/duel/async). */
export interface AsyncCandidate {
  pid: number;
  name: string;
  league: League | null;
  rating: number | null;
  points: number;
  heroes: number;
  classes: string[];
}

/** The raid card (GET /api/duel/async). */
export interface AsyncView {
  now: number;
  level: number;
  unlockLevel: number;
  unlocked: boolean;
  league: League | null;
  rating: number | null;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  defences: number;
  defenceWins: number;
  placements: { played: number; of: number };
  attacks: { used: number; cap: number; left: number };
  defence: { points: number; heroes: number; updatedAt: number } | null;
  candidates: AsyncCandidate[];
  open: { ticket: string; defender: number } | null;
}

export interface AsyncTicket {
  ticket: string;
  defender: { pid: number; name: string; league: League | null };
  expiresAt: number;
  setup: BattleSetup;
  team: Hero[];
  enemies: Hero[];
  resumed?: boolean;
}

export interface AsyncLogEntry {
  id: string;
  at: number;
  role: 'attack' | 'defence';
  pid: number;
  name: string;
  score: Score;
  delta: number;
  glory: number;
}

export interface SeasonRewardView {
  season: number;
  ladder: Ladder;
  league: LeagueId;
  glory: number;
  cosmetic: string;
}

/** The running ranked season (GET /api/duel/season). */
export interface SeasonView {
  now: number;
  season: { id: number; start: number; end: number };
  live: { league: League | null; peak: League | null };
  async: { league: League | null; peak: League | null };
  title: { league: LeagueId; season: number } | null;
  rewards: SeasonRewardView[];
  table: { league: LeagueId; glory: number; asyncGlory: number; cosmetic: string }[];
}

export type Board = 'live' | 'async' | 'legend';

export interface BoardRow {
  rank: number;
  pid: number;
  name: string;
  league: League;
  rating: number | null;
  games: number;
}

export interface LeaderboardView {
  board: Board;
  season: { id: number; end: number };
  rows: BoardRow[];
  me: BoardRow | null;
}

export interface LadderTicket {
  ticket: string;
  floor: number;
  boss: boolean;
  expiresAt: number;
  setup: BattleSetup;
  team: Hero[];
  enemies: Hero[];
  resumed?: boolean;
}

export interface LadderSubmission {
  orders: LoggedOrder[];
  deployOrders: number;
  claim: { winner: Side | -1; ticks: number; hash: string };
}

export interface LadderReport {
  floor: number;
  boss: boolean;
  won: boolean;
  firstClear: boolean;
  winner: Side | -1;
  ticks: number;
  glory: number;
  capped: number;
  accountXp: number;
  xp: HeroXp[];
  drop: Item | null;
  enemies: { dead: number; total: number };
  /** Stars this battle earned (0: lost) and the share (0..1) of team points lost. */
  stars: number;
  lost: number;
  /** The floor's best stars before this battle and after it. */
  prevStars: number;
  bestStars: number;
  /** This battle raised the floor's best. */
  newBest: boolean;
  replayed?: boolean;
  profile: DuelProfileView;
}

/** A claimed chapter chest (POST /api/duel/ladder/chest). */
export interface ChestClaim {
  chapter: number;
  tier: number;
  glory: number;
  /** The top tier's item (rare or better, now in the stash). */
  item: Item | null;
  /** The chest was claimed before: this is what it paid then. */
  replayed: boolean;
  profile: DuelProfileView;
}

type WithProfile<T = object> = T & { profile: DuelProfileView };

/** The ranked card (GET /api/duel/ranked). */
export interface RankedView {
  now: number;
  level: number;
  unlockLevel: number;
  unlocked: boolean;
  /** Null during placements. */
  league: League | null;
  /** Only in Legend (hidden below it). */
  rating: number | null;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  placements: { played: number; of: number };
  /** Queue cooldown after abandons (0: none). */
  cooldownUntil: number;
  /** A live match to rejoin. */
  match: LiveMatchRef | null;
}

export type QueueEvent = MatchmakerServerMsg;

export interface DuelSource {
  readonly demo: boolean;
  /** Opens the duel mode (idempotent) and returns the profile. */
  profile(): Promise<DuelProfileView>;
  recruit(cls: ClassId): Promise<WithProfile<{ hero: Hero }>>;
  dismiss(heroId: string): Promise<WithProfile>;
  equip(heroId: string, slot: Slot, itemUid: string | null): Promise<WithProfile>;
  develop(heroId: string, attrs: Partial<Attrs>, perks: string[]): Promise<WithProfile<{ hero: Hero }>>;
  respec(heroId: string): Promise<WithProfile<{ hero: Hero }>>;
  team(body: { heroIds?: string[]; formations?: FormationType[]; groups?: Record<string, number> }): Promise<WithProfile>;
  buy(offer: string): Promise<WithProfile<{ item: Item }>>;
  sell(uid: string): Promise<WithProfile<{ glory: number }>>;
  ladderStart(floor: number): Promise<LadderTicket>;
  /** `result`: the battle as the client simulated it (only the demo uses it; the server replays the log). */
  ladderSubmit(ticket: string, sub: LadderSubmission, result: BattleResult): Promise<LadderReport>;
  ladderAbandon(ticket: string): Promise<unknown>;
  ranked(): Promise<RankedView>;
  /** Joins the ranked or unranked queue; `on` gets its events until a match is found or refused. Returns cancel. */
  queue(mode: DuelMode, on: (e: QueueEvent) => void): () => void;
  /** A settled match's report (after a reconnect that came too late for match_result). */
  matchReport(id: string): Promise<WithProfile<{ report: MatchReport }>>;
  /** Picks (`edit`), renames (`name`, ≤ 16, null/empty: default) and assigns (`use`) a preset (a slot never saved starts as a copy of the edited one). */
  loadout(body: { slot: number; edit?: boolean; name?: string | null; use?: LoadoutUse[] }): Promise<WithProfile>;
  /**
   * A new preset in the lowest free slot (409 presets_full at 5): `from`
   * omitted copies the edited preset, a slot copies that one (duplicate), null
   * starts empty. Edited at once unless `edit: false`.
   */
  createLoadout(body?: { from?: number | null; name?: string | null; edit?: boolean }): Promise<WithProfile<{ slot: number }>>;
  /** Deletes a preset (409 last_preset for the only one); its uses and the edited preset move to the first remaining one. */
  deleteLoadout(slot: number): Promise<WithProfile>;
  /** Claims a chapter chest (tier 1..3 at 10/20/30 chapter stars); idempotent. */
  ladderChest(chapter: number, tier: number): Promise<ChestClaim>;
  asyncView(): Promise<AsyncView>;
  asyncStart(defender: number): Promise<AsyncTicket>;
  asyncSubmit(ticket: string, sub: LadderSubmission, result: BattleResult): Promise<WithProfile<{ report: AsyncReport; replayed?: boolean }>>;
  asyncAbandon(ticket: string): Promise<unknown>;
  asyncLog(): Promise<{ now: number; entries: AsyncLogEntry[] }>;
  season(): Promise<SeasonView>;
  seasonSeen(): Promise<unknown>;
  leaderboard(board: Board): Promise<LeaderboardView>;
}

const outside = () => new ApiError(0, 'outside', 'Available in Telegram');

/** After Cancel, how long the queue socket waits for a match the server was already making. */
const CANCEL_WAIT_MS = 5000;

/** The real API through the signed-in client. */
export class ApiDuelSource implements DuelSource {
  readonly demo = false;

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!online.available) throw outside();
    if (!(await online.signIn())) throw new ApiError(0, 'network', 'Cannot reach the server');
    return online.api.request<T>(method, `/api/duel${path}`, { auth: true, body });
  }

  profile() {
    return this.req<DuelProfileView>('POST', '/profile', {});
  }
  recruit(cls: ClassId) {
    return this.req<WithProfile<{ hero: Hero }>>('POST', '/recruit', { cls, requestId: newRequestId() });
  }
  dismiss(heroId: string) {
    return this.req<WithProfile>('POST', '/dismiss', { heroId });
  }
  equip(heroId: string, slot: Slot, itemUid: string | null) {
    return this.req<WithProfile>('POST', '/equip', { heroId, slot, itemUid });
  }
  develop(heroId: string, attrs: Partial<Attrs>, perks: string[]) {
    return this.req<WithProfile<{ hero: Hero }>>('POST', '/develop', { heroId, attrs, perks });
  }
  respec(heroId: string) {
    return this.req<WithProfile<{ hero: Hero }>>('POST', '/respec', { heroId, requestId: newRequestId() });
  }
  team(body: { heroIds?: string[]; formations?: FormationType[]; groups?: Record<string, number> }) {
    return this.req<WithProfile>('POST', '/team', body);
  }
  buy(offer: string) {
    return this.req<WithProfile<{ item: Item }>>('POST', '/shop/buy', { offer, requestId: newRequestId() });
  }
  sell(uid: string) {
    return this.req<WithProfile<{ glory: number }>>('POST', '/shop/sell', { uid, requestId: newRequestId() });
  }
  ladderStart(floor: number) {
    return this.req<LadderTicket>('POST', '/ladder/start', { floor });
  }
  ladderSubmit(ticket: string, sub: LadderSubmission) {
    return this.req<LadderReport>('POST', '/ladder/submit', { ticket, ...sub });
  }
  ladderAbandon(ticket: string) {
    return this.req('POST', '/ladder/abandon', { ticket });
  }
  ranked() {
    return this.req<RankedView>('GET', '/ranked');
  }
  matchReport(id: string) {
    return this.req<WithProfile<{ report: MatchReport }>>('GET', `/match/${id}`);
  }
  loadout(body: { slot: number; edit?: boolean; name?: string | null; use?: LoadoutUse[] }) {
    return this.req<WithProfile>('POST', '/loadout', body);
  }
  createLoadout(body: { from?: number | null; name?: string | null; edit?: boolean } = {}) {
    return this.req<WithProfile<{ slot: number }>>('POST', '/loadout/create', body);
  }
  deleteLoadout(slot: number) {
    return this.req<WithProfile>('POST', '/loadout/delete', { slot });
  }
  ladderChest(chapter: number, tier: number) {
    return this.req<ChestClaim>('POST', '/ladder/chest', { chapter, tier });
  }
  asyncView() {
    return this.req<AsyncView>('GET', '/async');
  }
  asyncStart(defender: number) {
    return this.req<AsyncTicket>('POST', '/async/start', { defender });
  }
  asyncSubmit(ticket: string, sub: LadderSubmission) {
    return this.req<WithProfile<{ report: AsyncReport; replayed?: boolean }>>('POST', '/async/submit', { ticket, ...sub });
  }
  asyncAbandon(ticket: string) {
    return this.req('POST', '/async/abandon', { ticket });
  }
  asyncLog() {
    return this.req<{ now: number; entries: AsyncLogEntry[] }>('GET', '/async/log');
  }
  season() {
    return this.req<SeasonView>('GET', '/season');
  }
  seasonSeen() {
    return this.req('POST', '/season/seen', {});
  }
  leaderboard(board: Board) {
    return this.req<LeaderboardView>('GET', `/leaderboard?board=${board}`);
  }

  /**
   * The queue over `/ws/duel`: (re)connecting sends `queue` again (a dropped
   * socket leaves the server's queue), until a match is found, the server
   * refuses, or cancel.
   */
  queue(mode: DuelMode, on: (e: QueueEvent) => void): () => void {
    const sock = new ShardSocket<MatchmakerServerMsg, MatchmakerClientMsg>('/ws/duel', 4000);
    let over = false;
    let cancelled = false;
    const stop = () => {
      if (over) return;
      over = true;
      off();
      setTimeout(() => sock.close(), 300);
    };
    const off = sock.on((m) => {
      if (over) return;
      // after Cancel only a match the server was already making still counts (it must be played, or it is abandoned)
      if (cancelled && m.type !== 'match_found') {
        if (m.type === 'unqueued') stop();
        return;
      }
      if (m.type === 'mm_welcome') {
        if (m.match) {
          // already in a match: rejoin it instead
          on({ type: 'match_found', match: m.match.id, mode: m.match.mode, side: 0, opponent: { name: '', league: null } });
          return stop();
        }
        sock.send({ type: 'queue', mode });
      }
      on(m);
      if (m.type === 'match_found' || (m.type === 'unqueued' && m.reason !== 'cancelled')) stop();
    });
    void (async () => {
      if (!online.available) return on({ type: 'error', message: 'Available in Telegram', code: 'outside' });
      if (!(await online.signIn())) return on({ type: 'error', message: 'The server is unreachable', code: 'network' });
      if (!over) sock.open();
    })();
    return () => {
      if (over || cancelled) return;
      cancelled = true;
      // the server answers `unqueued`, or nothing when it is pairing this player already (match_found follows)
      if (!sock.send({ type: 'cancel' })) return stop();
      setTimeout(stop, CANCEL_WAIT_MS);
    };
  }
}

const err = (code: string, message: string) => new ApiError(409, code, message);

/**
 * A local duel profile some battles in (a few cleared floors, a recruit, a
 * stash): the same rules as the server, applied to an in-memory copy.
 */
export class DemoDuelSource implements DuelSource {
  readonly demo = true;
  private p: DuelProfileView;
  private base = new Map<string, Attrs>();
  private ids = { nextId: 100 };
  private rng = new Rng(77);
  private tickets = new Map<string, LadderTicket>();
  private clock: () => number;

  constructor(opts: { now?: () => number; fresh?: boolean } = {}) {
    this.clock = opts.now ?? (() => Date.now());
    const ids = { nextId: 1 };
    const heroes = starterDuelRoster(4242, ids, 'demo_');
    if (!opts.fresh) heroes.push(duelRecruit(99, ids, 'demo_', 'thureophoros', heroes));
    this.ids.nextId = ids.nextId + 10;
    for (const h of heroes) this.base.set(h.id, { ...h.attrs });
    if (!opts.fresh) {
      // something to spend for the hub's badges: the recruit has points and a perk to take, the slinger a perk
      Object.assign(heroes[6], { level: 2, points: POINTS_PER_LEVEL });
      const sl = heroes[5];
      sl.level = 2;
      for (const k of ATTR_IDS) {
        if (sl.attrs[k] < ATTR_MAX) {
          sl.attrs[k] = Math.min(ATTR_MAX, sl.attrs[k] + POINTS_PER_LEVEL);
          break;
        }
      }
    }
    const now = this.clock();
    this.p = {
      now,
      day: utcDay(now),
      glory: opts.fresh ? DUEL_RULES.startGlory : 640,
      xp: opts.fresh ? 0 : 560,
      level: 1,
      ladder: {
        cleared: opts.fresh ? 0 : 4,
        farmLeft: opts.fresh ? DUEL_RULES.farmGloryPerDay : 260,
        farmCap: DUEL_RULES.farmGloryPerDay,
        // chapter 1: 3+3+1+3 = 10 stars, its first chest ready to claim
        stars: starsByFloor(0, opts.fresh ? {} : { 1: 3, 2: 3, 3: 1, 4: 3 }),
        chests: [],
      },
      team: heroes.slice(0, 6).map((h) => h.id),
      formations: [...DEFAULT_FORMATIONS],
      heroes,
      stash: opts.fresh ? [] : [shopItem(5, this.ids, 'demo_', findOffer('kopis:uncommon', 0)!), shopItem(6, this.ids, 'demo_', findOffer('chalcidian:rare', 0)!)],
      battles: opts.fresh ? 0 : 6,
      wins: opts.fresh ? 0 : 4,
      bought: [],
      loadouts: [
        { slot: 1, name: null, team: heroes.slice(0, 6).map((h) => h.id), formations: [...DEFAULT_FORMATIONS] },
        ...(opts.fresh ? [] : [{ slot: 2, name: 'Wall', team: [heroes[0].id, heroes[1].id, heroes[6].id], formations: [...DEFAULT_FORMATIONS] }]),
      ],
      loadout: 1,
      use: { ladder: 1, arena: 1, defence: opts.fresh ? 1 : 2 },
      defence: null,
    };
    this.p.level = accountLevel(this.p.xp);
    if (!opts.fresh) this.snapDefence();
  }

  /** A preset by slot (the first one when that slot is gone). */
  private preset(slot: number): Loadout {
    return this.p.loadouts.find((l) => l.slot === slot) ?? this.p.loadouts[0];
  }

  private loadoutTeam(use: LoadoutUse): Hero[] {
    const l = this.preset(this.p.use[use]);
    return l.team.map((id) => this.p.heroes.find((h) => h.id === id)).filter((h): h is Hero => !!h);
  }

  /** The defence snapshot (what the bot plays): kept while the defence loadout fits the budget. */
  private snapDefence(): void {
    const team = this.loadoutTeam('defence');
    if (teamProblem(team, DUEL_RULES.budget)) return;
    this.p.defence = { points: teamPoints(team), heroes: team.length, updatedAt: this.clock() };
  }

  private view(): DuelProfileView {
    const now = this.clock();
    const ids = new Set(this.p.heroes.map((h) => h.id));
    for (const l of this.p.loadouts) l.team = l.team.filter((id) => ids.has(id));
    const edited = this.preset(this.p.loadout);
    this.p.team = edited.team;
    this.p.formations = edited.formations;
    this.p.now = now;
    this.p.day = utcDay(now);
    this.p.level = accountLevel(this.p.xp);
    return JSON.parse(JSON.stringify(this.p)) as DuelProfileView;
  }

  private hero(id: string): Hero {
    const h = this.p.heroes.find((x) => x.id === id);
    if (!h) throw new ApiError(404, 'not_found', 'No such hero');
    return h;
  }

  private spend(n: number): void {
    if (this.p.glory < n) throw err('cannot_afford', 'Not enough Glory');
    this.p.glory -= n;
  }

  async profile() {
    return this.view();
  }

  async recruit(cls: ClassId) {
    const unlock = classUnlockLevel(cls);
    if (unlock === null) throw err('not_recruitable', 'That class is not recruited for duels');
    if (accountLevel(this.p.xp) < unlock) throw err('locked', `Unlocks at duel level ${unlock}`);
    if (this.p.heroes.length >= DUEL_RULES.rosterMax) throw err('roster_full', `At most ${DUEL_RULES.rosterMax} heroes`);
    this.spend(recruitPrice(cls));
    const hero = duelRecruit(this.rng.int(1, 1e9), this.ids, 'demo_', cls, this.p.heroes);
    this.p.heroes.push(hero);
    this.base.set(hero.id, { ...hero.attrs });
    return { hero, profile: this.view() };
  }

  async dismiss(heroId: string) {
    const h = this.hero(heroId);
    if (this.p.heroes.length <= 1) throw err('last_hero', 'Keep at least one hero');
    this.p.heroes = this.p.heroes.filter((x) => x.id !== heroId);
    for (const l of this.p.loadouts) l.team = l.team.filter((x) => x !== heroId);
    for (const it of Object.values(h.equip)) if (it) this.p.stash.push(it);
    return { profile: this.view() };
  }

  async equip(heroId: string, slot: Slot, itemUid: string | null) {
    const h = this.hero(heroId);
    if (itemUid) {
      const i = this.p.stash.findIndex((x) => x.uid === itemUid);
      if (i < 0) throw new ApiError(404, 'not_found', 'No such item in your stash');
      const it = this.p.stash[i];
      const def = itemDef(it.def);
      if (def.slot !== slot) throw new ApiError(400, 'bad_request', 'Wrong slot');
      this.p.stash.splice(i, 1);
      if (h.equip[slot]) this.p.stash.push(h.equip[slot]!);
      h.equip[slot] = it;
      if (slot === 'weapon' && def.twoHanded && h.equip.shield) {
        this.p.stash.push(h.equip.shield);
        delete h.equip.shield;
      }
      if (slot === 'shield' && h.equip.weapon && itemDef(h.equip.weapon.def).twoHanded) {
        this.p.stash.push(h.equip.weapon);
        delete h.equip.weapon;
      }
    } else if (h.equip[slot]) {
      this.p.stash.push(h.equip[slot]!);
      delete h.equip[slot];
    }
    return { profile: this.view() };
  }

  async develop(heroId: string, attrs: Partial<Attrs>, perks: string[]) {
    const h = this.hero(heroId);
    const out = developHero(h, attrs, perks);
    if (typeof out === 'string') throw err(out, out === 'no_points' ? 'Not enough attribute points' : out === 'attr_max' ? 'That attribute is at its maximum' : 'That perk cannot be taken now');
    Object.assign(h, out);
    return { hero: out, profile: this.view() };
  }

  async respec(heroId: string) {
    const h = this.hero(heroId);
    this.spend(respecPrice(h));
    Object.assign(h, respecHero(h, this.base.get(h.id) ?? h.attrs));
    return { hero: h, profile: this.view() };
  }

  async team(body: { heroIds?: string[]; formations?: FormationType[]; groups?: Record<string, number>; loadout?: number }) {
    if (body.loadout !== undefined && !this.p.loadouts.some((y) => y.slot === body.loadout)) throw new ApiError(404, 'no_preset', 'No such preset');
    const l = this.preset(body.loadout ?? this.p.loadout);
    if (body.heroIds) {
      if (body.heroIds.length > DUEL_RULES.teamMax) throw new ApiError(400, 'bad_request', 'Team too big');
      for (const id of body.heroIds) this.hero(id);
      l.team = [...new Set(body.heroIds)];
    }
    if (body.formations) l.formations = body.formations;
    for (const [id, g] of Object.entries(body.groups ?? {})) this.hero(id).group = g;
    if (this.p.defence) this.snapDefence();
    return { profile: this.view() };
  }

  async loadout(body: { slot: number; edit?: boolean; name?: string | null; use?: LoadoutUse[] }) {
    if (!Number.isInteger(body.slot) || body.slot < 1 || body.slot > DUEL_RULES.presetsMax) throw new ApiError(400, 'bad_request', 'No such loadout');
    if (typeof body.name === 'string' && body.name.trim().length > DUEL_RULES.presetNameMax) throw new ApiError(400, 'bad_request', 'Name too long');
    let l = this.p.loadouts.find((y) => y.slot === body.slot);
    if (!l) {
      // a slot never saved starts as a copy of the edited preset
      const from = this.preset(this.p.loadout);
      l = { slot: body.slot, name: null, team: [...from.team], formations: [...from.formations] };
      this.p.loadouts.push(l);
      this.p.loadouts.sort((a, b) => a.slot - b.slot);
    }
    if (body.name !== undefined) l.name = cleanPresetName(body.name);
    if (body.use?.includes('defence')) {
      const team = l.team.map((id) => this.p.heroes.find((h) => h.id === id)).filter((h): h is Hero => !!h);
      const problem = teamProblem(team, DUEL_RULES.budget);
      if (problem) throw err(problem === 'empty' ? 'no_team' : problem, `A defence must fit the ${DUEL_RULES.budget}-point budget`);
    }
    for (const u of body.use ?? []) this.p.use[u] = body.slot;
    if (body.edit) this.p.loadout = body.slot;
    if (body.use?.includes('defence') || this.p.defence) this.snapDefence();
    return { profile: this.view() };
  }

  async createLoadout(body: { from?: number | null; name?: string | null; edit?: boolean } = {}) {
    let slot = 0;
    for (let x = 1; x <= DUEL_RULES.presetsMax && !slot; x++) if (!this.p.loadouts.some((l) => l.slot === x)) slot = x;
    if (!slot) throw err('presets_full', `At most ${DUEL_RULES.presetsMax} presets`);
    if (typeof body.from === 'number' && !this.p.loadouts.some((l) => l.slot === body.from)) throw new ApiError(404, 'no_preset', 'No such preset');
    if (typeof body.name === 'string' && body.name.trim().length > DUEL_RULES.presetNameMax) throw new ApiError(400, 'bad_request', 'Name too long');
    const src = body.from === null ? null : this.preset(body.from ?? this.p.loadout);
    this.p.loadouts.push({ slot, name: cleanPresetName(body.name), team: src ? [...src.team] : [], formations: src ? [...src.formations] : [...DEFAULT_FORMATIONS] });
    this.p.loadouts.sort((a, b) => a.slot - b.slot);
    if (body.edit !== false) this.p.loadout = slot;
    return { slot, profile: this.view() };
  }

  async deleteLoadout(slot: number) {
    if (!this.p.loadouts.some((l) => l.slot === slot)) throw new ApiError(404, 'no_preset', 'No such preset');
    if (this.p.loadouts.length <= 1) throw err('last_preset', 'Keep at least one preset');
    const wasDefence = this.preset(this.p.use.defence).slot === slot;
    this.p.loadouts = this.p.loadouts.filter((l) => l.slot !== slot);
    const first = this.p.loadouts[0].slot;
    if (this.p.loadout === slot) this.p.loadout = first;
    for (const u of LOADOUT_USES) if (this.p.use[u] === slot) this.p.use[u] = first;
    if (wasDefence && this.p.defence) this.snapDefence();
    return { profile: this.view() };
  }

  async ladderChest(chapter: number, tier: number): Promise<ChestClaim> {
    if (!validChest(chapter, tier)) throw new ApiError(400, 'bad_request', 'No such chest');
    const state = chestState(this.p.ladder.stars, this.p.ladder.chests, chapter, tier);
    const key = `${chapter}:${tier}`;
    if (state === 'claimed') {
      const old = this.chestPaid.get(key) ?? { glory: chestReward(chapter, tier).glory, item: null };
      return { chapter, tier, ...old, replayed: true, profile: this.view() };
    }
    if (state !== 'ready') throw err('chest_locked', 'Not enough stars in this chapter yet');
    const reward = chestReward(chapter, tier);
    const item = reward.item ? chestItem(this.rng.int(1, 1e9), this.ids, 'demo_', chapter) : null;
    this.p.glory += reward.glory;
    if (item) this.p.stash.push(item);
    this.p.ladder.chests.push({ chapter, tier });
    this.chestPaid.set(key, { glory: reward.glory, item });
    return { chapter, tier, glory: reward.glory, item, replayed: false, profile: this.view() };
  }

  private chestPaid = new Map<string, { glory: number; item: Item | null }>();

  async buy(offerId: string) {
    const day = utcDay(this.clock());
    const offer = findOffer(offerId, day);
    if (!offer) throw new ApiError(404, 'no_offer', 'That offer is not in the shop (today)');
    if (offer.id.startsWith('day') && this.p.bought.includes(offer.id)) throw err('sold_out', 'You already bought this offer today');
    this.spend(offer.price);
    const item = shopItem(this.rng.int(1, 1e9), this.ids, 'demo_', offer);
    this.p.stash.push(item);
    if (offer.id.startsWith('day')) this.p.bought.push(offer.id);
    return { item, profile: this.view() };
  }

  async sell(uid: string) {
    const i = this.p.stash.findIndex((x) => x.uid === uid);
    if (i < 0) throw new ApiError(404, 'not_found', 'No such item in your stash');
    const [it] = this.p.stash.splice(i, 1);
    const glory = sellPrice(it);
    this.p.glory += glory;
    return { glory, profile: this.view() };
  }

  async ladderStart(floorNo: number) {
    if (!canFight(floorNo, this.p.ladder.cleared)) throw err('floor_locked', 'Clear the floors below first');
    const floor = ladderFloor(floorNo);
    const team = this.loadoutTeam('ladder');
    const problem = teamProblem(team, floor.budget);
    if (problem === 'empty') throw err('no_team', 'Pick your team first');
    if (problem === 'over_budget') throw err('over_budget', `Your team is over this floor's ${floor.budget}-point budget`);
    if (problem === 'too_many') throw err('team_too_big', `At most ${DUEL_RULES.teamMax} heroes`);
    const seed = this.rng.int(1, 0x7fffffff);
    const tk: LadderTicket = {
      ticket: `demo${seed.toString(16).padStart(28, '0')}`,
      floor: floor.floor,
      boss: floor.boss,
      expiresAt: this.clock() + DUEL_RULES.ticketTtlMs,
      setup: ladderSetup(seed, JSON.parse(JSON.stringify(team)) as Hero[], this.preset(this.p.use.ladder).formations, floor),
      team: JSON.parse(JSON.stringify(team)) as Hero[],
      enemies: floor.heroes,
    };
    this.tickets.set(tk.ticket, tk);
    return tk;
  }

  async ladderSubmit(ticket: string, _sub: LadderSubmission, result: BattleResult) {
    const tk = this.tickets.get(ticket);
    if (!tk) throw new ApiError(404, 'not_found', 'No such ticket');
    this.tickets.delete(ticket);
    const floor = ladderFloor(tk.floor);
    const pay = ladderPayout(floor, result, tk.team, this.p.ladder.cleared, this.p.ladder.farmLeft, tk.setup.seed, this.ids, 'demo_');
    this.p.glory += pay.glory;
    this.p.xp += pay.accountXp;
    if (pay.won) this.p.ladder.cleared = Math.max(this.p.ladder.cleared, floor.floor);
    if (pay.won && !pay.firstClear) this.p.ladder.farmLeft -= pay.glory;
    this.p.battles++;
    if (pay.won) this.p.wins++;
    for (const h of pay.heroes) {
      const cur = this.p.heroes.find((x) => x.id === h.id);
      if (cur) Object.assign(cur, { level: h.level, xp: h.xp, points: h.points, traits: h.traits, battles: h.battles, kills: h.kills });
    }
    if (pay.drop) this.p.stash.push(pay.drop);
    const prevStars = this.p.ladder.stars[floor.floor - 1] ?? 0;
    if (pay.stars > prevStars) this.p.ladder.stars[floor.floor - 1] = pay.stars;
    return {
      floor: floor.floor,
      boss: floor.boss,
      won: pay.won,
      firstClear: pay.firstClear,
      winner: result.winner,
      ticks: result.ticks,
      glory: pay.glory,
      capped: pay.capped,
      accountXp: pay.accountXp,
      xp: pay.xp,
      drop: pay.drop,
      enemies: { dead: result.units.filter((u) => u.side === 1 && u.state === 'dead').length, total: floor.heroes.length },
      stars: pay.stars,
      lost: Math.round(pay.lost * 1000) / 1000,
      prevStars,
      bestStars: Math.max(prevStars, pay.stars),
      newBest: pay.stars > prevStars,
      profile: this.view(),
    };
  }

  async ladderAbandon(ticket: string) {
    this.tickets.delete(ticket);
    return { ok: true };
  }

  // ------------------------------------------------------------------ live matches (demo: a local battle against the bot)

  /** How long the demo queue takes to find an opponent (previews set it high to show the search, or 0). */
  findDelayMs = 3000;
  private rating: Rating & { games: number; wins: number; losses: number; draws: number } = { rating: 1385, rd: 90, vol: 0.06, games: 14, wins: 8, losses: 6, draws: 0 };
  private matches = new Map<string, DemoMatch>();

  /** Previews: another duel account XP (the ranked gate at level 5). */
  setXp(xp: number): void {
    this.p.xp = xp;
  }

  async ranked(): Promise<RankedView> {
    const level = accountLevel(this.p.xp);
    const r = this.rating;
    const league = placed(r.games) ? leagueOf(r.rating) : null;
    return {
      now: this.clock(),
      level,
      unlockLevel: DUEL_RULES.rankedLevel,
      unlocked: level >= DUEL_RULES.rankedLevel,
      league,
      rating: league?.id === 'legend' ? Math.round(r.rating) : null,
      games: r.games,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      placements: { played: Math.min(r.games, RANKED.placements), of: RANKED.placements },
      cooldownUntil: 0,
      match: null,
    };
  }

  queue(mode: DuelMode, on: (e: QueueEvent) => void): () => void {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const team = this.loadoutTeam('arena');
    const problem = teamProblem(team, DUEL_RULES.budget);
    const since = this.clock();
    timers.push(
      setTimeout(() => {
        if (mode === 'ranked' && accountLevel(this.p.xp) < DUEL_RULES.rankedLevel) return on({ type: 'unqueued', reason: 'locked' });
        if (problem) return on({ type: 'unqueued', reason: problem === 'empty' ? 'no_team' : problem });
        on({ type: 'queued', mode, since, now: this.clock() });
        timers.push(
          setTimeout(() => {
            const m = this.makeMatch(mode, team);
            on({ type: 'match_found', match: m.id, mode, side: 0, opponent: { name: m.names[1], league: leagueOf(this.rating.rating + 40) } });
          }, this.findDelayMs),
        );
      }, 0),
    );
    return () => timers.forEach(clearTimeout);
  }

  async matchReport(): Promise<WithProfile<{ report: MatchReport }>> {
    throw new ApiError(404, 'not_found', 'No such match');
  }

  // ------------------------------------------------------------------ raids, seasons and leaderboards (demo)

  private as: DemoAsync | null = null;
  /** The demo's async state (previews set `rewards` for the season popup). */
  get async(): DemoAsync {
    return (this.as ??= new DemoAsync(this.clock()));
  }

  private candidates(): (AsyncCandidate & { rating: number })[] {
    const a = this.async;
    const now = this.clock();
    const pool = a.defenders.filter((d) => !(now - (a.attacked.get(d.pid) ?? -Infinity) < ASYNC.repeatMs));
    return pickCandidates(a.rating.rating, pool, a.used * 7 + 1).map((d, i) => {
      const league = placed(d.games) ? leagueOf(d.rating) : null;
      return { pid: d.pid, name: d.name, league, rating: d.rating, points: 96 + ((d.pid * 13) % 50), heroes: 5 + (i % 4), classes: [] };
    });
  }

  async asyncView(): Promise<AsyncView> {
    const level = accountLevel(this.p.xp);
    const a = this.async;
    const r = a.rating;
    const league = placed(r.games) ? leagueOf(r.rating) : null;
    const unlocked = level >= DUEL_RULES.rankedLevel;
    return {
      now: this.clock(),
      level,
      unlockLevel: DUEL_RULES.rankedLevel,
      unlocked,
      league,
      rating: league?.id === 'legend' ? Math.round(r.rating) : null,
      games: r.games,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      defences: r.defences,
      defenceWins: r.defenceWins,
      placements: { played: Math.min(r.games, RANKED.placements), of: RANKED.placements },
      attacks: { used: a.used, cap: ASYNC.attacksPerDay, left: Math.max(0, ASYNC.attacksPerDay - a.used) },
      defence: this.p.defence,
      candidates: unlocked && a.used < ASYNC.attacksPerDay ? this.candidates().map((c) => ({ ...c, rating: c.league?.id === 'legend' ? c.rating : null })) : [],
      open: null,
    };
  }

  async asyncStart(defender: number): Promise<AsyncTicket> {
    const a = this.async;
    if (accountLevel(this.p.xp) < DUEL_RULES.rankedLevel) throw err('locked', `Raids unlock at duel level ${DUEL_RULES.rankedLevel}`);
    if (a.used >= ASYNC.attacksPerDay) throw err('attack_cap', `At most ${ASYNC.attacksPerDay} raids a day`);
    const c = this.candidates().find((x) => x.pid === defender);
    if (!c) throw err('not_offered', 'That defender is not among your opponents now');
    const team = this.loadoutTeam('arena');
    const problem = teamProblem(team, DUEL_RULES.budget);
    if (problem) throw err(problem === 'empty' ? 'no_team' : problem, 'Your arena team cannot fight');
    const seed = this.rng.int(1, 0x7fffffff);
    const foes = starterDuelRoster(defender * 31, { nextId: 1 }, `demo_d${defender}_`);
    const mine = JSON.parse(JSON.stringify(team)) as Hero[];
    a.used++;
    a.attacked.set(defender, this.clock());
    const tk: AsyncTicket = {
      ticket: `demo${seed.toString(16).padStart(28, '0')}`,
      defender: { pid: defender, name: c.name, league: c.league },
      expiresAt: this.clock() + ASYNC.ticketTtlMs,
      setup: asyncSetup(seed, mine, this.preset(this.p.use.arena).formations, foes, [...DEFAULT_FORMATIONS]),
      team: mine,
      enemies: foes,
    };
    a.tickets.set(tk.ticket, tk);
    return tk;
  }

  async asyncSubmit(ticket: string, _sub: LadderSubmission, result: BattleResult) {
    const a = this.async;
    const tk = a.tickets.get(ticket);
    if (!tk) throw new ApiError(404, 'not_found', 'No such raid');
    a.tickets.delete(ticket);
    const score = scoreOf(result.winner, 0);
    const pay = attackPay(score);
    const r = a.rating;
    const d = a.defenders.find((x) => x.pid === tk.defender.pid)!;
    const before = placed(r.games) ? leagueOf(r.rating) : null;
    const next = glicko2(r, { rating: d.rating, rd: 80, vol: 0.06 }, score);
    const dn = defenceRating({ rating: d.rating, rd: 80, vol: 0.06 }, r, (1 - score) as Score);
    const out: AsyncReport = {
      attack: ticket,
      defender: { pid: d.pid, name: d.name },
      winner: result.winner,
      ticks: result.ticks,
      verified: false,
      glory: pay.glory,
      accountXp: pay.accountXp,
      rating: { before: Math.round(r.rating), after: Math.round(next.rating) },
      league: { before, after: null },
      placements: { played: 0, of: RANKED.placements },
      xp: [],
    };
    Object.assign(r, next, { games: r.games + 1, wins: r.wins + (score === 1 ? 1 : 0), losses: r.losses + (score === 0 ? 1 : 0), draws: r.draws + (score === 0.5 ? 1 : 0) });
    d.rating = dn.rating;
    out.league.after = placed(r.games) ? leagueOf(r.rating) : null;
    out.placements = { played: Math.min(r.games, RANKED.placements), of: RANKED.placements };
    const { heroes, xp } = duelHeroXp(result, tk.team, score === 1, new Rng(tk.setup.seed), 0);
    out.xp = xp;
    for (const h of heroes) {
      const cur = this.p.heroes.find((x) => x.id === h.id);
      if (cur) Object.assign(cur, { level: h.level, xp: h.xp, points: h.points, traits: h.traits, battles: h.battles, kills: h.kills });
    }
    this.p.glory += pay.glory;
    this.p.xp += pay.accountXp;
    this.p.battles++;
    if (score === 1) this.p.wins++;
    a.log.unshift({ id: ticket, at: this.clock(), role: 'attack', pid: d.pid, name: d.name, score, delta: out.rating.after - out.rating.before, glory: pay.glory });
    return { report: out, profile: this.view() };
  }

  async asyncAbandon(ticket: string) {
    this.async.tickets.delete(ticket);
    return { ok: true };
  }

  async asyncLog() {
    return { now: this.clock(), entries: this.async.log.map((e) => ({ ...e })) };
  }

  async season(): Promise<SeasonView> {
    const now = this.clock();
    const id = seasonId(now);
    const live = placed(this.rating.games) ? leagueOf(this.rating.rating) : null;
    const asy = placed(this.async.rating.games) ? leagueOf(this.async.rating.rating) : null;
    return {
      now,
      season: { id, start: seasonStart(id), end: seasonEnd(id) },
      live: { league: live, peak: live ? leagueOf(this.rating.rating + 30) : null },
      async: { league: asy, peak: asy },
      title: { league: this.async.rewards.reduce<LeagueId>((b, r) => (RANKED.leagues.findIndex((l) => l.id === r.league) > RANKED.leagues.findIndex((l) => l.id === b) ? r.league : b), 'gold'), season: id - 1 },
      rewards: this.async.rewards.map((r) => ({ ...r })),
      table: RANKED.leagues.map((l) => ({ league: l.id, glory: SEASON.rewards[l.id].glory, asyncGlory: Math.round(SEASON.rewards[l.id].glory * SEASON.asyncShare), cosmetic: SEASON.rewards[l.id].cosmetic })),
    };
  }

  async seasonSeen() {
    this.async.rewards = [];
    return { ok: true };
  }

  async leaderboard(board: Board): Promise<LeaderboardView> {
    const id = seasonId(this.clock());
    const base = board === 'legend' ? 2420 : board === 'async' ? 1980 : 2310;
    const n = board === 'legend' ? 6 : 24;
    const rows: BoardRow[] = Array.from({ length: n }, (_, i) => {
      const rating = base - i * (board === 'legend' ? 60 : 38);
      const league = leagueOf(rating);
      return { rank: i + 1, pid: 1000 + i, name: DEMO_NAMES[i % DEMO_NAMES.length] + (i >= DEMO_NAMES.length ? ` ${Math.floor(i / DEMO_NAMES.length) + 1}` : ''), league, rating: league.id === 'legend' ? rating : null, games: 30 + i };
    });
    const mine = board === 'async' ? this.async.rating : this.rating;
    const league = leagueOf(mine.rating);
    const me: BoardRow | null = board === 'legend' && league.id !== 'legend' ? null : { rank: board === 'async' ? 61 : 143, pid: 1, name: 'You', league, rating: league.id === 'legend' ? Math.round(mine.rating) : null, games: mine.games };
    return { board, season: { id, end: seasonEnd(id) }, rows, me };
  }

  private makeMatch(mode: DuelMode, team: Hero[]): DemoMatch {
    const seed = this.rng.int(1, 0x7fffffff);
    const foes = starterDuelRoster(seed, { nextId: 1 }, 'demo_foe_');
    const mine = JSON.parse(JSON.stringify(team)) as Hero[];
    const setup = onlineBattleSetup(seed, { heroes: mine, formations: this.preset(this.p.use.arena).formations, bot: false }, { heroes: foes, formations: [...DEFAULT_FORMATIONS], bot: true }, randomSite(new Rng(seed ^ 0x2f6b9e1d)));
    const m: DemoMatch = { id: `demo${seed.toString(16)}`, mode, seed, setup, heroes: [mine, foes], names: ['You', 'Hektor'] };
    this.matches.set(m.id, m);
    return m;
  }

  /** The demo match a queue found (setup, both armies). */
  demoMatch(id: string): DemoMatch | null {
    return this.matches.get(id) ?? null;
  }

  /** Settles a demo match like the server would (rating, Glory, XP), from the battle the client ran. */
  demoSettle(id: string, result: Pick<BattleResult, 'winner' | 'ticks' | 'units'>): MatchReport {
    const m = this.matches.get(id);
    if (!m) throw new ApiError(404, 'not_found', 'No such match');
    this.matches.delete(id);
    const score = scoreOf(result.winner, 0);
    const pay = matchPay(m.mode, score);
    const r = this.rating;
    const { heroes, xp } = duelHeroXp(result, m.heroes[0], score === 1, new Rng(m.seed), 0);
    for (const h of heroes) {
      const cur = this.p.heroes.find((x) => x.id === h.id);
      if (cur) Object.assign(cur, { level: h.level, xp: h.xp, points: h.points, traits: h.traits, battles: h.battles, kills: h.kills });
    }
    this.p.glory += pay.glory;
    this.p.xp += pay.accountXp;
    this.p.battles++;
    if (score === 1) this.p.wins++;
    let rating: MatchReport['rating'] = null;
    let league: MatchReport['league'] = null;
    let placements: MatchReport['placements'] = null;
    if (m.mode === 'ranked') {
      const before = placed(r.games) ? leagueOf(r.rating) : null;
      const next = glicko2(r, { rating: r.rating + 40, rd: 80, vol: 0.06 }, score);
      rating = { before: Math.round(r.rating), after: Math.round(next.rating) };
      Object.assign(r, next, { games: r.games + 1, wins: r.wins + (score === 1 ? 1 : 0), losses: r.losses + (score === 0 ? 1 : 0), draws: r.draws + (score === 0.5 ? 1 : 0) });
      league = { before, after: placed(r.games) ? leagueOf(r.rating) : null };
      placements = { played: Math.min(r.games, RANKED.placements), of: RANKED.placements };
    }
    return { match: id, mode: m.mode, side: 0, names: m.names, winner: result.winner, end: 'battle', verified: false, ticks: result.ticks, abandoned: false, glory: pay.glory, accountXp: pay.accountXp, rating, league, placements, xp };
  }
}

const DEMO_NAMES = ['Brasidas', 'Lysander', 'Phormio', 'Kleon', 'Myronides', 'Iphicrates', 'Demosthenes', 'Chabrias', 'Pelopidas', 'Xanthippos', 'Agesilaos', 'Timoleon'];

/** The demo's async opponents, seasons and leaderboards (DemoDuelSource keeps one). */
class DemoAsync {
  rating: Rating & { games: number; wins: number; losses: number; draws: number; defences: number; defenceWins: number } = { rating: 1460, rd: 80, vol: 0.06, games: 12, wins: 7, losses: 5, draws: 0, defences: 9, defenceWins: 5 };
  used = 2;
  attacked = new Map<number, number>();
  tickets = new Map<string, AsyncTicket>();
  log: AsyncLogEntry[] = [];
  /** Previews: an unseen season reward (the popup). */
  rewards: SeasonRewardView[] = [];
  defenders = DEMO_NAMES.slice(0, 8).map((name, i) => ({ pid: 900 + i, name, rating: 1300 + i * 45, games: i === 0 ? 4 : 20 }));

  constructor(now: number) {
    const H = 3_600_000;
    this.log = [
      { id: 'd'.repeat(32), at: now - 2 * H, role: 'defence', pid: 901, name: 'Lysander', score: 1, delta: 4, glory: ASYNC.defence.glory.win },
      { id: 'e'.repeat(32), at: now - 5 * H, role: 'attack', pid: 903, name: 'Kleon', score: 1, delta: 14, glory: ASYNC.glory.win },
      { id: 'f'.repeat(32), at: now - 26 * H, role: 'defence', pid: 905, name: 'Iphicrates', score: 0, delta: -6, glory: 0 },
    ];
  }
}

export interface DemoMatch {
  id: string;
  mode: DuelMode;
  seed: number;
  setup: BattleSetup;
  heroes: [Hero[], Hero[]];
  names: [string, string];
}

/** Total attribute points a pending spend uses. */
export function attrTotal(a: Partial<Attrs>): number {
  return ATTR_IDS.reduce((n, k) => n + (a[k] ?? 0), 0);
}

let source: DuelSource | null = null;

/** The duel source of the running game: the demo or the API when asked, else whichever is open (the API at first). */
export function duelSource(demo?: boolean): DuelSource {
  if (demo === true) return (source = source?.demo ? source : new DemoDuelSource());
  if (demo === false || !source) return (source = source && !source.demo ? source : new ApiDuelSource());
  return source;
}
