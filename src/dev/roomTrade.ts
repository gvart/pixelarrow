/**
 * The local room's holders and trade (docs/impl/godot-port.md P8 wave B, G-09): what the region Durable Object keeps in
 * D1 for them, held in memory (TradeBooks, the TS reading of godot/native/src/room_trade_store.h), and the DO's handlers
 * of the `mend`, `stow`, `npc`, `board` and `handoff` messages and of a tick's crafted events, mends freed and board
 * deeds over it (TradeDo: server/src/war/regionDO.ts mend, stow, stowTribute, stowContract, npc, board, handoff;
 * ./npcMarket.ts npcDeal; ./townBoard.ts boardView and boardOrder; ./crafting.ts takeForMend, returnMends, keepMends and
 * applyCrafts; ./market.ts site; ./holders.ts planTake and saveRegionHolds). The same SQL rules over plain records, in
 * record insertion order (a SELECT with no ORDER BY reads them so).
 *
 * The books: the home strongroom is RoomStore.goods (its lots all of origin `home`: the strongroom keeps totals, as the
 * larder reads it); every other holder (stalls, warehouses, tributes) keeps lots (good, origin, seal); the stash's items
 * by place, or by region while a workplace holds them (a mend); the crafted events applied (war_crafts); the region
 * holds as the last save left them; rented sites; each NPC town's purse and stock; the town board's jobs and heats. A
 * player's alliance, his liege and the tribute on his sales are the store's (wave C: membership and oaths).
 *
 * Left out, as online or world rules: renting a site and the player market (HTTP routes; a rented site is seeded), a
 * town holder's rent (the world: offline nobody holds a town, so rent is free), contracts and their escrows (posted over
 * HTTP: none offline, so `stow` to a contract finds none), anti-abuse on hand-offs (abuse.ts handoffRefusal, the gift
 * log), the tasks' tallies, season stats, favour earned and boss-kill trophies. A board reader's level is his path's
 * level (D1: his favour's).
 */
import type { Item } from '../data/items';
import { NPC_CARTS, NPC_HIRE } from '../data/warNpcTowns';
import { BOARD } from '../data/warTownBoard';
import { storyOf } from '../data/warStories';
import { CLASSES, isClassId } from '../data/classes';
import { freeName } from '../data/names';
import { buyable, costOf, npcDay, npcGoods, npcRuleNow, npcShown, payFor, purseAfter, sellable, stockAfter, type NpcView } from '../war/net/npcMarket';
import { NPC } from '../data/warNpcTowns';
import { armyStrength, boardEntries, boardLines, boardWindow, heatAfter, quotePay, TOWN_SEAL, windowEnd, type Band, type BoardJob, type BoardView, type JobKind } from '../war/net/townBoard';
import { depthOf } from '../war/sim/depth';
import { ITEMS_PER_LOAD, perLoad, type Hold, type Lot } from '../war/sim/holders';
import { makePerson } from '../war/sim/roster';
import { ALLIANCES } from '../war/world/alliances';
import { homeOf, isWorldRegion } from '../war/world/graph';
import { FRONTIER_TOWNS, OMPHALOS } from '../war/world/season';
import { cartCap, manRefusal, type PathId } from '../war/world/start';
import type { RegionData, WarEvent, WarPerson } from '../war/types';
import type { RoomStore, Soul } from './roomStore';

/** server/src/war/cargo.ts (pure: loaded through import.meta.glob, as ./vectors/room.ts loads WarRoom). */
interface Slot { hold: Hold; cap: number; x?: number; y?: number }
interface Bundle { lots: Lot[]; items: Item[] }
const cargo = Object.values(import.meta.glob('../../server/src/war/cargo.ts', { eager: true }))[0] as {
  fill(slots: readonly Slot[], b: Bundle): Bundle;
  takeOut(slots: readonly Slot[], goods: Record<string, number>, uids?: readonly string[], seal?: number): Bundle | null;
  takeSealed(slots: readonly Slot[], seal: number): Bundle;
  room(slots: readonly Slot[]): number;
  bundleGoods(b: Bundle): Record<string, number>;
  bundleLoads(b: Bundle): number;
};

const EPS = 1e-6;
const DAY = 86_400_000;
/** holders.ts HOME, round; market.ts SITE; crafting.ts craftKey; oaths.ts tributePlace. */
const HOME = 'home';
const round = (n: number) => Math.round(n * 1000) / 1000;
const SITE = { loads: 20 };
const craftKey = (region: string, run: string, order: number) => `${region}:${run}:${order}`;
const tributePlace = (town: string, payer: number) => `tr:${town}:${payer}`;
const strongroom = (pid: number) => `sr:${pid}`;
const srPid = (place: string) => (/^sr:\d+$/.test(place) ? Number(place.slice(3)) : null);
const ownerPid = (o: string) => (/^p:\d+$/.test(o) ? Number(o.slice(2)) : null);

/** An ApiError the DO turns into `{ t: 'error', code: 'badTarget', detail: '<code>: <message>' }`. */
export class Refusal {
  constructor(readonly code: string, readonly message: string) {}
}
const refuse = (code: string, message: string): never => {
  throw new Refusal(code, message);
};

/** market.ts townOf: a market town's sites (rent and tax are the holder's: offline nobody holds a town). */
function townOf(id: string): { stalls: number; warehouses: number; home: number | null } | null {
  if (FRONTIER_TOWNS.includes(id)) return { stalls: 6, warehouses: 6, home: null };
  if (id === OMPHALOS) return { stalls: 10, warehouses: 4, home: null };
  const a = ALLIANCES.find((x) => x.home === id);
  return a ? { stalls: 12, warehouses: 0, home: a.id } : null;
}

export interface GoodLot { res: string; origin: string; seal: number; amount: number }
export interface StashRow { uid: string; pid: number; item: Item; place: string | null; region: string | null }
export interface SiteRow { id: string; kind: 'stall' | 'warehouse'; pid: number; town: string; paidTo: number | null }
export interface HoldRow { ref: string; kind: string; pid: number; team: number; goods: Record<string, number>; items: Item[] }
export interface JobRow {
  id: number; pid: number; town: string; kind: JobKind; entry: string; errand: number; goal: string; giver: string | null; story: string | null; state: 'taken' | 'ready';
  target: number | null; band: Band | null; x: number | null; y: number | null; done: number; need: number; toTown: string | null; res: string | null; n: number; coin: number; points: number;
}
interface Purse { purse: number; read: number | null; day: number; minted: number }

/** The D1 books of holders and trade, in memory. `s`: the room store (the strongroom's goods, the persons). */
export class TradeBooks {
  places = new Map<string, GoodLot[]>();
  items: StashRow[] = [];
  crafts: string[] = [];
  holds = new Map<string, HoldRow[]>();
  sites: SiteRow[] = [];
  npc = new Map<string, { purse: number; day: number; minted: number }>();
  stock: { town: string; res: string; stock: number; at: number }[] = [];
  jobs: JobRow[] = [];
  heat: { pid: number; town: string; kind: JobKind; heat: number; at: number }[] = [];
  private nextJob = 1;
  private hires = 0;
  constructor(private readonly s: RoomStore) {}

  // ---------------------------------------------------------------- holders.ts

  /** A holder's lots, amount > 0, ORDER BY res, origin, seal (the strongroom's: its totals, origin home). */
  lotsOf(place: string): GoodLot[] {
    const pid = srPid(place), by = (a: GoodLot, b: GoodLot) => (a.res < b.res ? -1 : a.res > b.res ? 1 : a.origin < b.origin ? -1 : a.origin > b.origin ? 1 : a.seal - b.seal);
    if (pid !== null) return Object.entries(this.s.goods.get(pid) ?? {}).filter(([, n]) => n > 0).map(([res, amount]) => ({ res, origin: HOME, seal: 0, amount })).sort(by);
    return (this.places.get(place) ?? []).filter((l) => l.amount > 0).map((l) => ({ ...l })).sort(by);
  }
  /** holders.ts goodsOf: totals by good, rounded. */
  goodsAt(place: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const l of this.lotsOf(place)) out[l.res] = round((out[l.res] ?? 0) + l.amount);
    return out;
  }
  /** putStmt: n of res (origin, seal) into a holder. */
  put(place: string, res: string, n: number, origin = HOME, seal = 0): void {
    const pid = srPid(place);
    if (pid !== null) {
      const g = this.s.goods.get(pid) ?? {};
      g[res] = (g[res] ?? 0) + n;
      this.s.goods.set(pid, g);
      return;
    }
    const ls = this.places.get(place) ?? [], l = ls.find((x) => x.res === res && x.origin === origin && x.seal === seal);
    if (l) l.amount += n;
    else ls.push({ res, origin, seal, amount: n });
    this.places.set(place, ls);
  }
  /** planTake: `cost` out of the holder's unsealed lots, oldest origin first; the lots taken (refused: no_<good>). */
  planTake(place: string, cost: Record<string, number>, what = 'You'): GoodLot[] {
    const lots = this.lotsOf(place), taken: GoodLot[] = [];
    for (const [res, want] of Object.entries(cost)) {
      if (!(want > 0)) continue;
      let left = want;
      for (const l of lots) {
        if (l.res !== res || l.seal || left <= EPS) continue;
        const k = Math.min(l.amount, left);
        if (k <= EPS) continue;
        taken.push({ res, origin: l.origin, seal: 0, amount: k });
        left -= k;
      }
      if (left > EPS) refuse(`no_${res}`, `${what} lack ${round(left)} ${res}`);
    }
    return taken;
  }
  /** The planned lots out of the holder (takeStmts: below 1e-6 is 0). */
  takeLots(place: string, taken: readonly GoodLot[]): void {
    const pid = srPid(place);
    for (const t of taken) {
      if (pid !== null) {
        const g = this.s.goods.get(pid)!;
        g[t.res] = g[t.res] - t.amount < EPS ? 0 : g[t.res] - t.amount;
        continue;
      }
      const l = this.places.get(place)!.find((x) => x.res === t.res && x.origin === t.origin && x.seal === t.seal)!;
      l.amount = l.amount - t.amount < EPS ? 0 : l.amount - t.amount;
    }
  }
  /** market.ts loadsIn: the loads a holder fills. */
  loadsIn(place: string): number {
    const g = this.goodsAt(place), items = this.items.filter((r) => r.place === place).length;
    return Object.entries(g).reduce((a, [r, n]) => a + n / perLoad(r), 0) + items / ITEMS_PER_LOAD;
  }
  /** M6e saveRegionHolds: the region's rows replaced (goods rounded). */
  saveHolds(region: string, rows: readonly HoldRow[]): void {
    this.holds.set(region, rows.map((r) => ({ ...r, goods: Object.fromEntries(Object.entries(r.goods).map(([k, v]) => [k, round(v)])), items: structuredClone(r.items) })));
  }

  // ---------------------------------------------------------------- items (the stash)

  /** placeItemStmt: an item (a new row, or one moved) in a holder for pid. */
  placeItem(pid: number, place: string, item: Item): void {
    const r = this.items.find((x) => x.uid === item.uid), it = structuredClone(item);
    if (r) Object.assign(r, { pid, item: it, place, region: null });
    else this.items.push({ uid: item.uid, pid, item: it, place, region: null });
  }
  /** crafting.ts takeForMend: his strongroom item to a workplace in region (null: none at home). */
  takeForMend(pid: number, uid: string, region: string): Item | null {
    const r = this.items.find((x) => x.uid === uid && x.pid === pid && x.place === strongroom(pid));
    if (!r) return null;
    r.region = region;
    r.place = null;
    return structuredClone(r.item);
  }
  /** returnMends: items whose mend order went, back in the strongroom. */
  returnMends(region: string, uids: readonly string[]): void {
    for (const r of this.items) if (r.region === region && uids.includes(r.uid)) (r.region = null), (r.place = strongroom(r.pid));
  }
  /** keepMends: a restored room's workplaces hold only `uids`; the rest go home. */
  keepMends(region: string, uids: readonly string[]): void {
    for (const r of this.items) if (r.region === region && !uids.includes(r.uid)) (r.region = null), (r.place = strongroom(r.pid));
  }
  /** applyCrafts: each crafted event once (keyed region, run, order); repair: the item back home as made; salvage: gone. */
  applyCrafts(region: string, run: string, evs: readonly Extract<WarEvent, { kind: 'crafted' }>[]): number {
    let n = 0;
    for (const e of evs) {
      const pid = ownerPid(e.owner);
      if (pid === null) continue;
      const id = craftKey(region, run, e.order);
      if (this.crafts.includes(id)) continue;
      this.crafts.push(id);
      if (e.what === 'repair') {
        const r = this.items.find((x) => x.uid === e.item.uid && x.pid === pid && x.region === region);
        if (r) Object.assign(r, { item: structuredClone(e.item), region: null, place: strongroom(pid) });
      } else if (e.what === 'salvage') this.items = this.items.filter((x) => !(x.uid === e.item.uid && x.pid === pid && x.region === region));
      n++;
    }
    return n;
  }

  // ---------------------------------------------------------------- market.ts sites

  /** rentSite, offline: no holder, so no rent; one of each a player a town, up to the town's count. */
  rentSite(pid: number, town: string, kind: 'stall' | 'warehouse', now: number): string {
    const t = townOf(town) ?? refuse('not_market', `${town} is no market town`);
    if (kind === 'warehouse' && t.home !== null) refuse('no_warehouse', 'At home your goods are in your strongroom');
    const id = kind === 'stall' ? `st:${town}:${pid}` : `wh:${town}:${pid}`;
    if (this.sites.some((x) => x.id === id)) refuse('rented', `You rent a ${kind} here already`);
    if (this.sites.filter((x) => x.town === town && x.kind === kind).length >= (kind === 'stall' ? t.stalls : t.warehouses)) refuse('no_site', `Every ${kind} in ${town} is taken`);
    this.sites.push({ id, kind, pid, town, paidTo: now + DAY });
    return id;
  }
  /** site: his open site of `kind` here (at home a warehouse is the strongroom); rent settled (nobody holds the town). */
  site(pid: number, town: string, kind: 'stall' | 'warehouse', now: number): string {
    const t = townOf(town) ?? refuse('not_market', `${town} is no market town`);
    const id = kind === 'stall' ? `st:${town}:${pid}` : t.home !== null ? strongroom(pid) : `wh:${town}:${pid}`;
    if (id.startsWith('sr:')) return id;
    const row = this.sites.find((x) => x.id === id) ?? refuse(`no_${kind}`, `You rent no ${kind} in ${town}`);
    if ((row.paidTo ?? now) < now) row.paidTo = now; // settleRent with no holder
    return id;
  }

  // ---------------------------------------------------------------- npcMarket.ts books

  private purseOf(town: string, now: number): Purse {
    const r = this.npc.get(town), today = npcDay(now);
    if (!r) return { purse: NPC.purse.start, read: null, day: today, minted: 0 };
    const purse = purseAfter(r.purse, today - r.day);
    return { purse, read: r.purse, day: today, minted: r.minted + purse - r.purse };
  }
  private stocksOf(town: string, now: number): Map<string, { stock: number; read: number | null }> {
    const out = new Map<string, { stock: number; read: number | null }>();
    for (const g of npcGoods(town)) {
      const r = this.stock.find((x) => x.town === town && x.res === g.res);
      out.set(g.res, r ? { stock: stockAfter(r.stock, g.par, now - r.at), read: r.stock } : { stock: g.par, read: null });
    }
    return out;
  }
  private setPurse(town: string, p: Purse, coin: number): void {
    this.npc.set(town, { purse: coin, day: p.day, minted: p.minted });
  }
  private setStock(town: string, res: string, stock: number, now: number): void {
    const r = this.stock.find((x) => x.town === town && x.res === res);
    if (r) (r.stock = stock), (r.at = now);
    else this.stock.push({ town, res, stock, at: now });
  }
  npcView(town: string, now: number): NpcView {
    if (!npcGoods(town).length) refuse('no_town', `${town} is no town`);
    const p = this.purseOf(town, now), st = this.stocksOf(town, now);
    return npcShown(town, Math.floor(p.purse), (res) => st.get(res)!.stock, p.purse, now);
  }
  private ruleOf(town: string, res: string, now: number) {
    return npcRuleNow(town, res, now) ?? refuse('not_traded', `This town does not deal in ${res}`);
  }
  /** planSell: the town buys up to `want` as far as its purse pays; `apply` writes its books. */
  planSell(town: string, res: string, want: number, now: number): { n: number; coin: number; apply: () => void } {
    const g = this.ruleOf(town, res, now), p = this.purseOf(town, now), s = this.stocksOf(town, now).get(res)!;
    const n = sellable(g, s.stock, want, p.purse), coin = payFor(g, s.stock, n, p.purse);
    if (!(n > 0) || !(coin > 0)) refuse('purse_empty', 'The town has no coin left to pay you');
    return { n, coin, apply: () => (this.setPurse(town, p, p.purse - coin), this.setStock(town, res, s.stock + n, now)) };
  }
  planBuy(town: string, res: string, want: number, have: number, now: number): { n: number; coin: number; apply: () => void } {
    const g = this.ruleOf(town, res, now), p = this.purseOf(town, now), s = this.stocksOf(town, now).get(res)!;
    const n = buyable(g, s.stock, want, have), coin = costOf(g, s.stock, n);
    if (!(n > 0)) refuse(s.stock < 0.01 ? 'sold_out' : 'no_coin', s.stock < 0.01 ? 'The town has none left' : 'You carry too little coin');
    return { n, coin, apply: () => (this.setPurse(town, p, p.purse + coin), this.setStock(town, res, s.stock - n, now)) };
  }
  planPay(town: string, coin: number, now: number): () => void {
    const p = this.purseOf(town, now);
    return () => this.setPurse(town, p, p.purse + coin);
  }
  planPayOut(town: string, pay: (purse: number) => number, now: number): { coin: number; apply: () => void } {
    const p = this.purseOf(town, now), coin = Math.max(0, Math.min(p.purse, pay(p.purse)));
    return { coin, apply: () => coin > 0 && this.setPurse(town, p, p.purse - coin) };
  }
  planStock(town: string, res: string, by: number, now: number): () => void {
    const s = this.stocksOf(town, now).get(res) ?? refuse('not_traded', `This town does not deal in ${res}`);
    if (s.stock + by < -EPS) refuse('sold_out', 'The town has too little left to send');
    return () => this.setStock(town, res, Math.max(0, s.stock + by), now);
  }

  // ---------------------------------------------------------------- home, persons

  /** npcMarket.ts isHomeOf: his strongroom is here (a place off the world map counts). */
  isHomeOf(pid: number, town: string): boolean {
    const a = this.s.allianceOf(pid);
    return !isWorldRegion(town) || (a !== null && homeOf(a as 0) === town);
  }
  /** persons.ts workerCount: his workers in the army's states. */
  workerCount(pid: number): number {
    return this.s.recs.filter((r) => r.pid === pid && ['active', 'wounded', 'training'].includes(r.state) && (r.person.hero.cls ?? '').startsWith('civ_')).length;
  }
  /** persons.ts newId, offline: his hires counted (online a random token). */
  newId(pid: number): string {
    return `w${pid}-${++this.hires}`;
  }

  // ---------------------------------------------------------------- townBoard.ts books

  jobsOf(pid: number): JobRow[] {
    return this.jobs.filter((j) => j.pid === pid);
  }
  jobOf(pid: number, id: number): JobRow {
    return this.jobs.find((j) => j.id === id && j.pid === pid) ?? refuse('not_found', 'You do not hold that');
  }
  addJob(j: Omit<JobRow, 'id' | 'state' | 'done'>): JobRow {
    const row: JobRow = { id: this.nextJob++, pid: j.pid, town: j.town, kind: j.kind, entry: j.entry, errand: j.errand, goal: j.goal, giver: j.giver, story: j.story, state: 'taken', target: j.target, band: j.band, x: j.x, y: j.y, done: 0, need: j.need, toTown: j.toTown, res: j.res, n: j.n, coin: j.coin, points: j.points };
    this.jobs.push(row);
    return row;
  }
  dropJob(id: number): void {
    this.jobs = this.jobs.filter((j) => j.id !== id);
  }
  heatsOf(pid: number, town: string, now: number): Record<JobKind, number> {
    const out: Record<JobKind, number> = { kill: 0, build: 0, trade: 0 };
    for (const r of this.heat) if (r.pid === pid && r.town === town) out[r.kind] = heatAfter(r.heat, now - r.at);
    return out;
  }
  setHeat(pid: number, town: string, kind: JobKind, heat: number, at: number): void {
    const r = this.heat.find((x) => x.pid === pid && x.town === town && x.kind === kind);
    if (r) (r.heat = heat), (r.at = at);
    else this.heat.push({ pid, town, kind, heat, at });
  }
  /** boardDeeds: his taken Kills whose band's lair fell with his men near are ready; how many. */
  boardDeeds(pid: number, town: string, deeds: readonly { kind: string; key: string }[]): number {
    const lairs = deeds.filter((d) => d.kind === 'lair').map((d) => Number(d.key));
    let n = 0;
    if (!lairs.length) return 0;
    for (const j of this.jobs)
      if (j.pid === pid && j.town === town && j.kind === 'kill' && j.state === 'taken' && j.target !== null && lairs.includes(j.target)) (j.state = 'ready'), (j.done = 1), n++;
    return n;
  }

  dump() {
    return {
      items: this.items, places: [...this.places], crafts: this.crafts, holds: [...this.holds], sites: this.sites, npc: [...this.npc], stock: this.stock,
      jobs: this.jobs, heat: this.heat,
    };
  }
}

/** What the handlers call of WarRoom (server/src/war/room.ts). */
export interface TradeRoom {
  region: RegionData;
  run: string;
  currentTick: number;
  sim: { dropPile(x: number, y: number, lots: readonly Lot[], items: readonly Item[]): number };
  mend(pid: number, kind: 'repair' | 'salvage', building: number, item: Item): string | null;
  carrier(pid: number, from: { squad?: number; cart?: number }): { slots: (Slot & { x: number; y: number })[] } | null;
  inCourt(pid: number, from: { squad?: number; cart?: number }): boolean;
  takeCargo(pid: number, from: { squad?: number; cart?: number }, goods: Record<string, number>, uids?: string[], seal?: number): Bundle | null;
  giveCargo(pid: number, to: { squad?: number; cart?: number }, b: Bundle): Bundle;
  npcSlots(pid: number): (Slot & { x: number; y: number })[];
  cartsOf(pid: number): number[];
  giveCart(pid: number, type: 'handcart' | 'wagon'): number | null;
  storyTrade(pid: number, op: 'sell' | 'buy' | 'hire' | 'cart', coin: number, abroad: number): void;
  hired(pid: number, persons: WarPerson[]): { msg: unknown } | null;
  personsHere(): Set<string>;
  setLarder(pid: number, goods: Record<string, number>): void;
  armyOf(pid: number): { cls: string; level?: number; hp: number }[];
  townBand(b: Band, seed: string): { lair: number; x: number; y: number };
  watchTownJob(j: { id: number; pid: number; x: number; y: number }): void;
  unwatchTownJob(id: number): void;
  handoff(pid: number, other: number, op: 'offer' | 'confirm' | 'cancel', half?: { from: { squad?: number; cart?: number }; goods: Record<string, number>; uids: string[] }): { window: { a: number; b: number; halves: Record<number, { goods: Record<string, number>; uids: string[] }>; ok: number[]; until: number }; ready: boolean } | { error: string; detail: string };
  swapHandoff(a: number, b: number): { ok: true } | { error: string };
}

type Out = [number, unknown];
type Msg = Record<string, unknown>;
const heldOf = (slots: readonly Slot[], res: string) => slots.reduce((a, s) => a + s.hold.lots.filter((l) => l.r === res && l.s === undefined).reduce((b, l) => b + l.n, 0), 0);
const lotOut = (l: GoodLot, seal?: number): Lot => ({ r: l.res as never, n: l.amount, o: l.origin, ...(seal !== undefined ? { s: seal } : {}) });

/**
 * The DO's handlers (regionDO.ts) over the books. `room`: the room as it stands; `open`: the players with a socket now
 * (a message to a player goes to his sockets); `now`: the room's clock; `wake`: a named soul wakes in the room.
 */
export class TradeDo {
  constructor(private readonly room: () => TradeRoom, private readonly s: RoomStore, private readonly t: TradeBooks, private readonly open: (pid: number) => boolean, private readonly now: () => number, private readonly wake: (s: Soul) => boolean) {}

  private static err(e: unknown): Msg {
    if (!(e instanceof Refusal)) throw e;
    return { t: 'error', code: 'badTarget', detail: `${e.code}: ${e.message}` };
  }

  /** regionDO.ts mend: the stash item to the workplace, then into the room's queue; refused: straight back. */
  mend(pid: number, m: { kind: 'repair' | 'salvage'; building: number; uid: string }, tell: (m: Msg) => void): void {
    const r = this.room(), region = r.region.id, item = this.t.takeForMend(pid, m.uid, region);
    if (!item) return tell({ t: 'error', code: 'badTarget', detail: 'no such item in your stash' });
    const err = r.mend(pid, m.kind, m.building, item);
    if (err) {
      this.t.returnMends(region, [item.uid]);
      tell({ t: 'error', code: err, detail: m.kind });
    }
  }

  /** regionDO.ts stow (M6f): goods and items between his packs (or cart) and his site here. */
  stow(pid: number, m: { dir: 'in' | 'out'; site: 'stall' | 'warehouse' | 'strongroom' | 'contract' | 'tribute'; of?: number; squad?: number; cart?: number; contract?: number; goods?: Record<string, number>; uids?: string[] }, tell: (m: Msg) => void): void {
    const r = this.room(), t = this.t, region = r.region.id, now = this.now();
    const from = m.squad !== undefined ? { squad: m.squad } : { cart: m.cart! };
    if (!r.carrier(pid, from)) return tell({ t: 'error', code: 'notOwner', detail: 'stow' });
    if (m.site === 'contract') return this.stowContract(pid, m, from, tell);
    if (m.site === 'tribute') return this.stowTribute(pid, m, from, tell);
    const kind = m.site;
    let id: string;
    try {
      if (kind === 'strongroom') {
        if (isWorldRegion(region)) {
          const a = this.s.allianceOf(pid);
          if (a === null || homeOf(a as 0) !== region) refuse('not_home', 'Your strongroom is at home');
        }
        id = strongroom(pid);
      } else {
        if (!r.inCourt(pid, from)) refuse('not_in_court', 'Bring them into the market court');
        id = t.site(pid, region, kind, now);
      }
    } catch (e) {
      return tell(TradeDo.err(e));
    }
    const goods = m.goods ?? {}, uids = m.uids ?? [];
    if (m.dir === 'in') {
      const b = r.takeCargo(pid, from, goods, uids);
      if (!b) return tell({ t: 'error', code: 'badTarget', detail: 'they do not carry that' });
      if (id.startsWith('wh:') && t.loadsIn(id) + cargo.bundleLoads(b) > SITE.loads + 1e-6) {
        r.giveCargo(pid, from, b);
        return tell(TradeDo.err(new Refusal('warehouse_full', `A warehouse holds ${SITE.loads} loads`)));
      }
      for (const l of b.lots) t.put(id, l.r, l.n, l.o, l.s ?? 0);
      for (const it of b.items) t.placeItem(pid, id, it);
      tell({ t: 'stowed', dir: 'in', site: id, goods: cargo.bundleGoods(b), items: b.items.length });
      if (kind === 'strongroom') r.setLarder(pid, this.s.goodsOf(pid)); // W-80
    } else {
      let b: Bundle;
      try {
        const taken = t.planTake(id, goods), want = [...new Set(uids)];
        const rows = t.items.filter((x) => x.place === id && want.includes(x.uid));
        if (rows.length !== want.length) refuse('no_item', 'An item is not there');
        t.takeLots(id, taken);
        t.items = t.items.filter((x) => !rows.includes(x));
        b = { lots: taken.map((l) => lotOut(l, l.seal ? l.seal : undefined)), items: rows.map((x) => x.item) };
      } catch (e) {
        return tell(TradeDo.err(e));
      }
      const rest = r.giveCargo(pid, from, b);
      for (const l of rest.lots) t.put(id, l.r, l.n, l.o, l.s ?? 0);
      for (const it of rest.items) t.placeItem(pid, id, it);
      tell({ t: 'stowed', dir: 'out', site: id, goods: cargo.bundleGoods(b), items: b.items.length - rest.items.length, ...(rest.lots.length ? { left: cargo.bundleGoods(rest) } : {}) });
      if (kind === 'strongroom') r.setLarder(pid, this.s.goodsOf(pid)); // W-80
    }
  }

  /** stowTribute (W-153): a payer's tribute set aside at this town, onto someone's back. */
  private stowTribute(pid: number, m: { dir: 'in' | 'out'; of?: number; goods?: Record<string, number> }, from: { squad?: number; cart?: number }, tell: (m: Msg) => void): void {
    const r = this.room(), t = this.t, payer = m.of ?? pid, region = r.region.id;
    const no = (detail: string) => tell({ t: 'error', code: 'badTarget', detail });
    if (m.dir !== 'out') return no('tribute: only out');
    if (!r.inCourt(pid, from)) return no('not_in_court: Bring them into the market court');
    const lord = this.s.liegeOf(payer);
    if (lord === null || (m.of !== undefined && lord !== pid)) return no('not_sworn: Nothing is owed to you here');
    const place = tributePlace(region, payer), seal = m.of === undefined ? -lord : undefined;
    let b: Bundle;
    try {
      const all = m.goods && Object.keys(m.goods).length ? m.goods : t.goodsAt(place), taken = t.planTake(place, all);
      t.takeLots(place, taken);
      b = { lots: taken.map((l) => lotOut(l, seal)), items: [] };
    } catch (e) {
      if (!(e instanceof Refusal)) throw e;
      return no(`${e.code}: ${e.message}`);
    }
    const rest = r.giveCargo(pid, from, b);
    for (const l of rest.lots) t.put(place, l.r, l.n, l.o);
    tell({ t: 'stowed', dir: 'out', site: place, goods: cargo.bundleGoods(b), items: 0, ...(rest.lots.length ? { left: cargo.bundleGoods(rest) } : {}) });
  }

  /** stowContract (M6g): contracts are posted over HTTP, so offline there is none (contracts.ts contract: not_found). */
  private stowContract(pid: number, m: { contract?: number }, from: { squad?: number; cart?: number }, tell: (m: Msg) => void): void {
    if (!this.room().inCourt(pid, from)) return tell({ t: 'error', code: 'badTarget', detail: 'not_in_court: Bring them into the market court' });
    tell(TradeDo.err(new Refusal('not_found', `No contract ${m.contract}`)));
  }

  /** npcMarket.ts takeCoin: his coin from the packs at the town, and at home from his strongroom too. */
  private takeCoin(slots: Slot[], coin: number, home: boolean, pid: number): { apply: () => void; taken: Bundle | null } {
    const pack = Math.min(coin, heldOf(slots, 'coin')), rest = coin - pack;
    if (rest > 1e-6 && !home) refuse('no_coin', `It costs ${coin} coin: your men at the town carry ${Math.floor(pack)}`);
    const id = strongroom(pid), taken = rest > 1e-6 ? this.t.planTake(id, { coin: rest }, 'Your strongroom') : [];
    return { apply: () => this.t.takeLots(id, taken), taken: pack > 0 ? cargo.takeOut(slots, { coin: pack }) : null };
  }
  /** npcMarket.ts npcGive: a bundle into the packs and carts at the town; what does not fit is set down at their feet. */
  private give(slots: readonly (Slot & { x: number; y: number })[], b: Bundle): void {
    const rest = cargo.fill(slots, b);
    if (rest.lots.length) this.room().sim.dropPile(slots[0].x, slots[0].y, rest.lots, []);
  }

  /** regionDO.ts npc (W-143..W-145): a deal with this region's NPC town, told; a hired man falls in. */
  npc(pid: number, m: { op: 'sell' | 'buy' | 'hire' | 'cart'; res?: string; n?: number; cls?: string; cart?: 'handcart' | 'wagon' }, out: Out[]): void {
    try {
      const got = this.npcDeal(pid, m);
      out.push([pid, got.done]);
      if (got.welcome && this.open(pid)) out.push([pid, got.welcome]);
    } catch (e) {
      out.push([pid, TradeDo.err(e)]);
    }
  }
  private npcDeal(pid: number, m: { op: 'sell' | 'buy' | 'hire' | 'cart'; res?: string; n?: number; cls?: string; cart?: 'handcart' | 'wagon' }): { done: Msg; welcome?: unknown } {
    const r = this.room(), t = this.t, town = r.region.id, now = this.now();
    if (!npcGoods(town).length) refuse('no_town', 'There is no town here');
    const slots = r.npcSlots(pid);
    if (!slots.length) refuse('not_present', 'Your men must stand at the town');
    const home = t.isHomeOf(pid, town);
    if (m.op === 'sell') {
      const res = m.res!, have = heldOf(slots, res), want = Math.min(m.n ?? have, have);
      if (!(want > 1e-6)) refuse('no_goods', `Your men carry no ${res}`);
      const plan = t.planSell(town, res, want, now), b = cargo.takeOut(slots, { [res]: plan.n })!;
      const far = b.lots.filter((l) => l.o !== town && !(home && l.o === HOME)).reduce((a, l) => a + l.n, 0), abroad = Math.floor((plan.coin * far) / plan.n);
      const cut = this.s.tributeCut(pid, plan.coin), kept = plan.coin - cut;
      plan.apply();
      if (home) t.put(strongroom(pid), 'coin', kept, town);
      if (cut > 0) t.put(tributePlace(town, pid), 'coin', cut);
      if (!home) this.give(slots, { lots: [{ r: 'coin', n: kept, o: town }], items: [] });
      r.storyTrade(pid, 'sell', plan.coin, abroad);
      return { done: { t: 'npcDone', op: 'sell', coin: plan.coin, res, n: plan.n, ...(cut > 0 ? { tribute: cut } : {}) } };
    }
    if (m.op === 'buy') {
      const res = m.res!, roomFor = cargo.room(slots) * perLoad(res), want = Math.min(m.n ?? roomFor, roomFor);
      if (!(want > 1e-6)) refuse('no_room', 'Your men and carts here have no room');
      const bank = home ? (t.goodsAt(strongroom(pid)).coin ?? 0) : 0;
      const plan = t.planBuy(town, res, want, heldOf(slots, 'coin') + bank, now), pay = this.takeCoin(slots, plan.coin, home, pid);
      plan.apply();
      pay.apply();
      this.give(slots, { lots: [{ r: res as never, n: plan.n, o: town }], items: [] });
      r.storyTrade(pid, 'buy', plan.coin, 0);
      return { done: { t: 'npcDone', op: 'buy', coin: plan.coin, res, n: plan.n } };
    }
    if (m.op === 'hire') {
      const cls = m.cls!, cost = (NPC_HIRE as Record<string, number>)[cls];
      if (cost === undefined) refuse('bad_request', `Nobody here hires out as ${cls}`);
      const why = manRefusal(this.s.path(pid), cls, { soldiers: this.s.armyCount(pid), workers: t.workerCount(pid) });
      if (why === 'family') refuse('wrong_family', 'A worker is not of your people');
      if (why === 'locked') refuse('class_locked', 'A worker will not follow you yet: a higher level first');
      if (why) refuse(why === 'household' ? 'household_full' : 'army_full', why === 'household' ? 'Your household is full' : 'Your army is full');
      const pay = this.takeCoin(slots, cost, home, pid), id = t.newId(pid), p = makePerson(id, cls);
      const culture = CLASSES[isClassId(cls) ? cls : 'militia'].cultures[0] ?? 'greek';
      const man = { ...p, hero: { ...p.hero, name: freeName(culture, now % 97, new Set()) } };
      const paid = t.planPay(town, cost, now);
      pay.apply();
      paid();
      this.s.add(pid, man, town);
      const got = this.s.claimForJoin(pid, town, [[id]], r.personsHere(), now, this.wake);
      const fell = typeof got === 'string' ? null : r.hired(pid, got[0]); // no room now: he waits off the field
      r.storyTrade(pid, 'hire', cost, 0);
      return { done: { t: 'npcDone', op: 'hire', coin: cost }, welcome: fell?.msg };
    }
    const type = m.cart!, cost = NPC_CARTS[type];
    if (r.cartsOf(pid).length >= cartCap(this.s.path(pid).path)) refuse('carts_full', 'You keep as many carts as your path allows');
    const pay = this.takeCoin(slots, cost, home, pid), paid = t.planPay(town, cost, now);
    pay.apply();
    paid();
    r.giveCart(pid, type);
    r.storyTrade(pid, 'cart', cost, 0);
    return { done: { t: 'npcDone', op: 'cart', coin: cost } };
  }

  /** regionDO.ts chainOver (W-190): his chain at this town is over, or he has none here. */
  private chainOver(pid: number): boolean {
    if (!storyOf(this.room().region.id, this.s.path(pid).path)) return true;
    return !!(this.s.saveOf('story', pid) as { done?: true } | null)?.done;
  }
  /** townBoard.ts boardView: the board at `town` as `pid` reads it, his men `men`. */
  boardView(pid: number, men: readonly { cls: string; level?: number; hp?: number }[], chainOver: boolean): BoardView {
    const r = this.room().region, town = r.id, t = this.t, now = this.now();
    if (!npcGoods(town).length) refuse('no_town', `${town} is no town`);
    const way = this.s.path(pid), level = (way as { level?: number }).level ?? 1, path = way.path as PathId | null;
    const fighters = men.filter((m) => !m.cls.startsWith('civ_')), whole = armyStrength(fighters.map((m) => ({ cls: m.cls, level: m.level })), level), army = armyStrength(fighters, level);
    const heats = t.heatsOf(pid, town, now), npc = t.npcView(town, now), jobs = t.jobsOf(pid);
    const win = boardWindow(now), chain = path ? storyOf(town, path) : null;
    const entries = boardEntries(r, win, { army: whole, path, killHeat: heats.kill, errand: chainOver, giver: chain?.giver.name });
    return {
      town, purse: npc.purse, until: windowEnd(win),
      lines: boardLines(entries, { army, path, heat: (k) => heats[k], purse: npc.purse, held: new Set(jobs.filter((j) => j.town === town).map((j) => j.entry)), depth: depthOf(r) }),
      jobs: jobs.map((j): BoardJob => ({ id: j.id, kind: j.kind, town: j.town, goal: j.goal, state: j.state, done: j.done, need: j.need, x: j.x, y: j.y, toTown: j.toTown, res: j.res, n: j.n, coin: j.coin, points: j.points, errand: !!j.errand, giver: j.giver, story: j.story })),
    };
  }

  /** regionDO.ts board (W-184..W-190): an order at this town's board, answered with what he reads after it. */
  board(pid: number, m: { op: 'view' | 'take' | 'deliver' | 'handin' | 'drop'; entry?: string; job?: number }, tell: (m: Msg) => void): void {
    try {
      tell({ t: 'boardView', ...this.boardOrder(pid, m, this.chainOver(pid)) });
    } catch (e) {
      tell(TradeDo.err(e));
    }
  }
  private boardOrder(pid: number, m: { op: 'view' | 'take' | 'deliver' | 'handin' | 'drop'; entry?: string; job?: number }, chainOver: boolean): { view: BoardView; paid?: { coin: number; points: number } } {
    const r = this.room(), t = this.t, town = r.region.id, now = this.now(), men = () => r.armyOf(pid);
    const done = (paid?: { coin: number; points: number }) => ({ view: this.boardView(pid, men(), chainOver), ...(paid ? { paid } : {}) });
    if (m.op === 'view') return done();
    const slots = r.npcSlots(pid), seal = (id: number) => TOWN_SEAL + id;
    if (m.op === 'take') {
      if (!slots.length) refuse('not_present', 'Your men must stand at the town');
      if (t.jobsOf(pid).length >= BOARD.hold) refuse('board_full', `You hold ${BOARD.hold} already: finish or drop one`);
      const e = this.boardView(pid, men(), chainOver).lines.find((l) => l.id === m.entry) ?? refuse('gone', 'That line is gone from the board');
      if (e.held) refuse('held', 'You hold that one already');
      if (e.kind === 'trade' && cargo.room(slots) < e.loads! - 1e-6) refuse('no_room', `It takes ${e.loads} loads of room in the packs and carts here`);
      const stock = e.kind === 'trade' ? t.planStock(town, e.res!, -e.n!, now) : null;
      const band = e.band ? r.townBand(e.band, `${pid}:${e.id}`) : null, site = band ?? e.site ?? null;
      const row = t.addJob({
        pid, town, kind: e.kind, entry: e.id, errand: e.size === 'errand' ? 1 : 0, goal: e.goal, giver: e.giver ?? null, story: e.story ?? null, target: band?.lair ?? null, band: e.band ?? null,
        x: site?.x ?? null, y: site?.y ?? null, need: e.kind === 'build' ? e.labour! : e.kind === 'trade' ? e.n! : 1, toTown: e.toTown ?? null, res: e.res ?? null, n: e.n ?? 0, coin: e.coin, points: e.points,
      });
      if (stock) {
        stock();
        cargo.fill(slots, { lots: [{ r: e.res as never, n: e.n!, o: town, s: seal(row.id) }], items: [] });
      }
      if (e.kind === 'build') r.watchTownJob({ id: row.id, pid, x: e.site!.x, y: e.site!.y });
      return done();
    }
    const j = t.jobOf(pid, m.job ?? -1);
    if (m.op === 'deliver') {
      if (j.kind !== 'trade' || j.state !== 'taken') refuse('not_load', 'You carry no load under that');
      if (j.toTown !== town) refuse('wrong_town', `It goes to ${j.toTown}`);
      if (!slots.length) refuse('not_present', 'Your men must stand at the town');
      const b = cargo.takeSealed(slots, seal(j.id)), n = b.lots.reduce((a, l) => a + l.n, 0);
      if (!(n > 1e-6)) refuse('no_load', 'The load is lost');
      try {
        t.planStock(town, j.res!, n, now)();
      } catch (x) {
        cargo.fill(slots.map((s) => ({ ...s, cap: Infinity })), b);
        throw x;
      }
      if (j.state === 'taken') (j.state = 'ready'), (j.done = n);
      return done();
    }
    if (m.op === 'drop') {
      // W-192: a load goes back where it came from
      if (j.kind === 'trade' && j.state === 'taken') {
        if (town !== j.town || !slots.length) refuse('wrong_town', 'Bring the load back to the board to drop it');
        const n = cargo.takeSealed(slots, seal(j.id)).lots.reduce((a, l) => a + l.n, 0);
        if (n > 1e-6) t.planStock(town, j.res!, n, now)();
      }
      t.dropJob(j.id);
      if (j.kind === 'build') r.unwatchTownJob(j.id);
      return done();
    }
    if (j.town !== town) refuse('wrong_town', `Hand it in at ${j.town}`);
    if (!slots.length) refuse('not_present', 'Your men must stand at the town');
    if (j.state !== 'ready') refuse('not_done', 'It is not done yet');
    const way = this.s.path(pid), heat = t.heatsOf(pid, town, now)[j.kind];
    const share = j.kind === 'trade' && j.n > 0 ? Math.min(1, j.done / j.n) : 1, base = { kind: j.kind, coin: j.coin * share, points: j.points * share };
    const pay = t.planPayOut(town, (purse) => quotePay(base, way.path as PathId | null, heat, purse).coin, now);
    const points = quotePay(base, way.path as PathId | null, heat, Infinity).points, home = t.isHomeOf(pid, town);
    t.dropJob(j.id);
    pay.apply();
    t.setHeat(pid, town, j.kind, heat + 1, now);
    if (home && pay.coin > 0) t.put(strongroom(pid), 'coin', pay.coin, town);
    if (!home && pay.coin > 0) this.give(slots, { lots: [{ r: 'coin', n: pay.coin, o: town }], items: [] });
    return done({ coin: pay.coin, points });
  }

  /** regionDO.ts boardReady (W-185): a contract of his came ready: told. */
  boardReady(pid: number, out: Out[]): void {
    if (!this.open(pid)) return;
    out.push([pid, { t: 'boardView', view: this.boardView(pid, this.room().armyOf(pid), this.chainOver(pid)) }]);
  }

  /** regionDO.ts handoff (M6g): the window; both confirmed, the swap at once (online the M6i checks first: abuse.ts). */
  handoff(pid: number, m: { op: 'offer' | 'confirm' | 'cancel'; with: number; squad?: number; cart?: number; goods?: Record<string, number>; uids?: string[] }, out: Out[]): void {
    const r = this.room(), half = m.op === 'offer' ? { from: m.squad !== undefined ? { squad: m.squad } : { cart: m.cart! }, goods: m.goods ?? {}, uids: m.uids ?? [] } : undefined;
    const got = r.handoff(pid, m.with, m.op, half);
    if ('error' in got) return void out.push([pid, { t: 'error', code: got.error, detail: `handoff: ${got.detail}` }]);
    const w = got.window, tell = (msg: (other: number) => Msg) => {
      for (const p of [w.a, w.b]) if (this.open(p)) out.push([p, msg(p === w.a ? w.b : w.a)]);
    };
    if (m.op === 'cancel') return tell((o) => ({ t: 'handoff', with: o, state: 'closed', why: 'cancelled' }));
    const halves = Object.fromEntries(Object.entries(w.halves).map(([k, h]) => [k, { goods: h.goods, uids: h.uids }]));
    if (!got.ready) return tell((o) => ({ t: 'handoff', with: o, state: 'open', halves, ok: w.ok, until: w.until }));
    const s = r.swapHandoff(w.a, w.b);
    if ('error' in s) return tell((o) => ({ t: 'handoff', with: o, state: 'closed', why: s.error }));
    tell((o) => ({ t: 'handoff', with: o, state: 'done', halves }));
  }
}
