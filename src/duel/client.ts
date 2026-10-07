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
import { ATTR_IDS, type Attrs } from '../data/perks';
import type { ClassId } from '../data/classes';
import type { FormationType } from '../sim/formation';
import type { BattleResult, BattleSetup, LoggedOrder, Side } from '../sim/types';
import { Rng } from '../sim/rng';
import { DEFAULT_FORMATIONS } from '../online/rules';
import {
  DUEL_RULES, accountLevel, classUnlockLevel, developHero, duelRecruit, findOffer, recruitPrice, respecHero, respecPrice, sellPrice, shopItem,
  starterDuelRoster, teamProblem, utcDay,
} from './rules';
import { canFight, ladderFloor, ladderPayout, ladderSetup, type HeroXp } from './ladder';

export interface DuelProfileView {
  now: number;
  day: number;
  glory: number;
  xp: number;
  level: number;
  ladder: { cleared: number; farmLeft: number; farmCap: number };
  team: string[];
  formations: FormationType[];
  heroes: Hero[];
  stash: Item[];
  battles: number;
  wins: number;
  bought: string[];
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
  replayed?: boolean;
  profile: DuelProfileView;
}

type WithProfile<T = object> = T & { profile: DuelProfileView };

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
}

const outside = () => new ApiError(0, 'outside', 'Available in Telegram');

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
    const now = this.clock();
    this.p = {
      now,
      day: utcDay(now),
      glory: opts.fresh ? DUEL_RULES.startGlory : 640,
      xp: opts.fresh ? 0 : 180,
      level: 1,
      ladder: { cleared: opts.fresh ? 0 : 4, farmLeft: opts.fresh ? DUEL_RULES.farmGloryPerDay : 260, farmCap: DUEL_RULES.farmGloryPerDay },
      team: heroes.slice(0, 6).map((h) => h.id),
      formations: [...DEFAULT_FORMATIONS],
      heroes,
      stash: opts.fresh ? [] : [shopItem(5, this.ids, 'demo_', findOffer('kopis:uncommon', 0)!), shopItem(6, this.ids, 'demo_', findOffer('chalcidian:rare', 0)!)],
      battles: opts.fresh ? 0 : 6,
      wins: opts.fresh ? 0 : 4,
      bought: [],
    };
    this.p.level = accountLevel(this.p.xp);
  }

  private view(): DuelProfileView {
    const now = this.clock();
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
    this.p.team = this.p.team.filter((x) => x !== heroId);
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

  async team(body: { heroIds?: string[]; formations?: FormationType[]; groups?: Record<string, number> }) {
    if (body.heroIds) {
      if (body.heroIds.length > DUEL_RULES.teamMax) throw new ApiError(400, 'bad_request', 'Team too big');
      for (const id of body.heroIds) this.hero(id);
      this.p.team = [...new Set(body.heroIds)];
    }
    if (body.formations) this.p.formations = body.formations;
    for (const [id, g] of Object.entries(body.groups ?? {})) this.hero(id).group = g;
    return { profile: this.view() };
  }

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
    const team = this.p.team.map((id) => this.p.heroes.find((h) => h.id === id)).filter((h): h is Hero => !!h);
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
      setup: ladderSetup(seed, JSON.parse(JSON.stringify(team)) as Hero[], this.p.formations, floor),
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
      profile: this.view(),
    };
  }

  async ladderAbandon(ticket: string) {
    this.tickets.delete(ticket);
    return { ok: true };
  }
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
