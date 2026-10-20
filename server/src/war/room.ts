/**
 * WarRoom: the live, server-authoritative region (W-05..W-07), free of Durable Object APIs so tests drive it directly.
 * WarRegionDO (./regionDO.ts) owns one, feeds it socket messages and calls tick() at 10 Hz.
 *
 *  - join: a player enters with squads of persons (M5e: WarRegionDO loads them from D1 by id and passes them in,
 *    `join(pid, m, persons)`; the dev-only `army` join takes class + count) on its alliance's entry; over the
 *    alliance's live soldier quota (W-06) the join waits in a FIFO line and is let in once dead men free room. A
 *    player whose squads are still in the region rejoins them (no new spawn, no quota check).
 *  - order: only for the player's own squads (squad owner `p:<id>` in the sim); attack targets a foe squad.
 *  - leave: the player's squads stay and hold where they stand with the bot hold AI (W-07); they keep counting.
 *    Civilians at work keep working (their workplace queues run on).
 *  - tick: steps the sim, then builds one binary frame per online player from what it may see (src/war/net).
 *  - fights (M5e): once men have fought and FIGHT_QUIET ticks pass with no blow struck and no man falling, the sim's
 *    endFight report leaves tick() with a fight id unique to this room instance; the DO writes it to D1 (idempotent).
 *    The sim's `raid` events leave tick() as `raided` building ids: the DO frees the captives held there. A finished
 *    fight's report carries the battle honours won in it (src/war/sim/honours.ts: took a fort, held a chokepoint,
 *    survived a won fight against SQUAD_MAX or more).
 *  - state (M5e): saveState() is the whole region: the sim's exact state (sim.exportState: hit points, wounds, orders,
 *    sites and finished buildings, siege, fog, mobs, rng), the bots, players, squad owners, the join line and the fight
 *    in progress; WarRoom.restore rebuilds the room from it after an eviction and it steps on as if never stopped
 *    (players offline: their squads hold where they stand with the hold AI).
 *  - crafting (M5h4): craft / cancelCraft orders go to the sim for the player's team; mend() queues a repair or salvage
 *    of a stash item the DO loaded from D1. tick() hands out the sim's `crafted` events (the DO writes them to D1, keyed
 *    by `run` + order id, which survives a restore) and the uids of mend items whose order went (cancelled, refused,
 *    workplace lost: back to the stash). The queues themselves live in the sim state.
 *  - holders (M6e): a crafted item is physical: tick() puts it (uid `c:<key>`) in the workplace's output chest, the
 *    maker's owner's chest nearest the workplace with room, else his team's home strongroom in the region; a slain
 *    boss's loot falls as a pile where it fell. Trade orders (load, unload, escort, salvagePile) name holders the room
 *    checks exist and are the player's to use (his chest or cart, his team's store; any pile or a foe's holder to load
 *    from: the sim checks guards and influence). holdRows() is what the DO snapshots to D1 (war_region_holds).
 */
import { createSim } from '../../../src/war/sim';
import { createBots, type Bots } from '../../../src/war/sim/bots';
import { isClassId } from '../../../src/data/classes';
import { DeltaEncoder } from '../../../src/war/net/codec';
import { visibleTo, type Rect, type TeamVision } from '../../../src/war/net/interest';
import { ALLIANCES, KEYFRAME_EVERY, MAX_SQUAD, MAX_SQUADS, NET_VERSION, splitQuota, type CheckMsg, type JoinMsg, type NetOrder, type OrderError, type Quota, type Refusal, type ServerMsg } from '../../../src/war/net/protocol';
import type { SimState } from '../../../src/war/sim/state';
import type { Item } from '../../../src/data/items';
import type { BridgePlan, FightReport, Order, PlaceResult, RegionData, ShotSnap, Snapshot, SquadId, WallPlan, WarBuildSim, WarEvent, WarPerson } from '../../../src/war/types';
import type { Side } from '../../../src/war/world/types';
import type { BossSlain } from './bosses';
import { honoursOf } from '../../../src/war/sim/honours';
import { CHOKEPOINTS } from '../../../src/war/world/season';
import { worldRegion } from '../../../src/war/world/graph';
import { bossItems } from './bosses';
import { craftKey } from './crafting';
import { bundleGoods, contents, fill, room as freeLoads, takeAll, takeOut, type Bundle } from './cargo';
import type { TransitCargo } from '../../../src/war/net/world';

/** What of bundle b went across (b less the rest r): goods and uids to take back. */
function subtract(b: Bundle, r: Bundle): { goods: Record<string, number>; uids: string[] } {
  const g = bundleGoods(b), rest = bundleGoods(r);
  for (const k of Object.keys(rest)) g[k] -= rest[k];
  const left = new Set(r.items.map((i) => i.uid));
  return { goods: Object.fromEntries(Object.entries(g).filter(([, n]) => n > 1e-9)), uids: b.items.filter((i) => !left.has(i.uid)).map((i) => i.uid) };
}
import { inRects } from '../../../src/war/sim/trade';

const SIDES = ['N', 'E', 'S', 'W'] as const;
/** Hold AI radius for an offline player's squads (tiles). */
const HOLD_RADIUS = 10;
/** Ticks a fallen man stays on the wire (the corpse); after that clients forget him (the sim keeps him). */
export const CORPSE_TICKS = 300;
/** Ticks with no blow struck and no man falling that end a fight (M5e write-back). */
export const FIGHT_QUIET = 100;

export const ownerOf = (pid: number) => `p:${pid}`;

/** M6g hand-off window: both carriers within `reach` tiles, both confirm within `ticks` (60 s). */
export const HANDOFF = { reach: 4, ticks: 600 };
export interface Carrier { squad?: number; cart?: number }
export interface Half { from: Carrier; goods: Record<string, number>; uids: string[] }
export interface HandoffWindow { a: number; b: number; halves: Record<number, Half>; ok: number[]; until: number }

/** One squad to spawn: persons (M5e), or `count` fresh men of `cls` (dev joins, restored class squads). */
export interface Group { cls: string; count: number; persons?: WarPerson[] }

/** A fight to write back: `id` is unique per room instance (epoch) and tick. */
export interface Fight { id: string; report: FightReport }

/** A squad gone over a border (M4 transfer out); M6h: with its packs and the cart it drove. */
export interface Departed { ids: string[]; off: number; lost: Record<string, number>; fight?: Fight; cargo?: TransitCargo }

/** A sim `crafted` event (M5h4): the DO mints or updates the item in D1. */
export type Crafted = Extract<WarEvent, { kind: 'crafted' }>;

/** A stash item at a workplace (a repair or salvage order). */
export interface Mend { uid: string; pid: number; building: number; def: string }

/** The room record kept in DO storage (WarRoom.saveState / restore). */
export interface RoomState {
  v: 2;
  region: string;
  tick: number;
  players: { pid: number; team: number }[];
  owners: (string | null)[];
  teams: (number | null)[];
  spawns: number;
  /** [unit id, tick] of the fallen still on the wire. */
  died: [number, number][];
  lastBlow: number;
  inFight: boolean;
  queue: Waiting[];
  /** Person ids on the field (alive), for the D1 check on restore. */
  pids: string[];
  sim: SimState;
  bots: unknown;
  /** M5h4: the region run (crafted event keys) and stash items at its workplaces. */
  run?: string;
  mends?: Mend[];
  /** Teams that took a fort in the fight in progress (honours). */
  stormed?: number[];
}

export interface RoomOptions {
  region: RegionData;
  seed: number;
  /** Total live soldier cap (W-06); split evenly unless `quotas`. */
  cap: number;
  quotas?: number[];
  keyframeEvery?: number;
  /**
   * Team sight for the interest filter, asked once per tick after the step. Default: the radius rule (VisionMap); the
   * sim's fog of war (W-39) plugs in here.
   */
  vision?: (sim: WarBuildSim, snap: Snapshot) => TeamVision;
  /** Accept the dev `army` join (class + count). The DO allows it only with DEV_AUTH=1. Default true (tests, tools). */
  allowArmy?: boolean;
  /** This room instance's id in fight ids (default: random). */
  epoch?: string;
  fightQuiet?: number;
}

interface Player {
  pid: number;
  team: number;
  online: boolean;
  cam: Rect | null;
  enc: DeltaEncoder | null;
  /** Ticks since its last keyframe; -1: none sent yet. */
  sinceKey: number;
  bytes: number;
}

export interface Waiting { pid: number; join: JoinMsg; groups: Group[] }

export interface TickTimes { stepMs: number; snapMs: number; netMs: number }

export type JoinResult = { msg: ServerMsg; admitted: boolean };

export class WarRoom {
  readonly sim: WarBuildSim;
  readonly bots: Bots;
  readonly region: RegionData;
  readonly per: number[];
  readonly epoch: string;
  private players = new Map<number, Player>();
  private queue: Waiting[] = [];
  /** Squad id -> owner (kept from spawns and every snapshot: detach makes squads too). */
  private owners: string[] = [];
  private teams: number[] = [];
  private live: number[];
  private snap: Snapshot;
  private vision: (sim: WarBuildSim, snap: Snapshot) => TeamVision;
  private spawns = 0;
  private keyEvery: number;
  private lastTick = -1;
  /** Tick each unit was first seen dead. */
  private diedAt: number[] = [];
  private allowArmy: boolean;
  private fightQuiet: number;
  private lastBlow = -1;
  private inFight = false;
  /** Person ids of joins dropped from the line (the DO sends them home). */
  private released: string[] = [];
  /** Orders applied, with their tick (determinism checks, later a replay log). */
  readonly log: { tick: number; o: Order }[] = [];
  /** This region run: set when the region starts fresh, kept across restores (crafted event keys). */
  run: string;
  private mends: Mend[] = [];
  /** Teams that raided or brought down a foe's holding building since the last fight ended (honours). */
  private stormed = new Set<number>();

  constructor(o: RoomOptions) {
    this.region = o.region;
    this.sim = createSim(o.region, o.seed);
    this.bots = createBots(this.sim);
    this.per = o.quotas ?? splitQuota(o.cap, ALLIANCES);
    this.live = this.per.map(() => 0);
    // default: the sim's fog of war (W-39); VisionMap (the plain radius rule) is the fallback hook for tests and tools
    const fog: TeamVision = { sees: (team, x, y) => this.sim.visibleTo(team, x, y) };
    this.vision = o.vision ?? (() => fog);
    this.keyEvery = o.keyframeEvery ?? KEYFRAME_EVERY;
    this.allowArmy = o.allowArmy ?? true;
    this.epoch = o.epoch ?? `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    this.fightQuiet = o.fightQuiet ?? FIGHT_QUIET;
    this.run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    this.snap = this.sim.snapshot();
  }

  get currentTick(): number {
    return this.snap.tick;
  }

  quota(): Quota {
    return { cap: this.per.reduce((a, b) => a + b, 0), per: [...this.per], live: [...this.live] };
  }

  /** Living soldiers in the region (all teams). */
  alive(): number {
    return this.live.reduce((a, b) => a + b, 0);
  }

  online(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.online) n++;
    return n;
  }

  /** The room has work: someone is connected or armies stand in the region. */
  active(): boolean {
    return this.online() > 0 || this.alive() > 0 || this.queue.length > 0;
  }

  squadsOf(pid: number): SquadId[] {
    const me = ownerOf(pid), out: SquadId[] = [];
    this.owners.forEach((o, id) => {
      if (o !== me) return;
      const s = this.snap.squads[id]; // spawned since the last snapshot: alive
      if (!s || s.units.some((u) => this.snap.units[u]?.state !== 'dead')) out.push(id);
    });
    return out;
  }

  /** A join now would spawn new squads (it is not a rejoin of squads standing here): the DO loads its persons first. */
  spawnsNew(pid: number): boolean {
    const p = this.players.get(pid);
    return !(p && !p.online && this.squadsOf(pid).length);
  }

  /** Persons on the field (alive) or waiting in the line. */
  personsHere(): Set<string> {
    const out = new Set<string>();
    for (const u of this.snap.units) if (u.pid && u.state !== 'dead') out.add(u.pid);
    for (const w of this.queue) for (const g of w.groups) for (const p of g.persons ?? []) out.add(p.id);
    return out;
  }

  /** Person ids let go since the last call (dropped joins). */
  takeReleased(): string[] {
    return this.released.splice(0);
  }

  /**
   * A join (or a reinforcement by a player already in). `sessionPid`: the player the socket was authenticated as.
   * `persons`: the join's squads loaded from D1, one list per `m.squads` entry; needed unless it is a rejoin.
   */
  join(sessionPid: number, m: JoinMsg, persons?: WarPerson[][]): JoinResult {
    const refuse = (reason: Refusal, detail?: string): JoinResult => ({ msg: { t: 'refused', reason, detail }, admitted: false });
    if (m.v !== NET_VERSION) return refuse('version', `server speaks v${NET_VERSION}`);
    if (m.region !== this.region.id) return refuse('region', `this room is ${this.region.id}`);
    if (m.playerId !== sessionPid) return refuse('player', 'playerId is not the signed-in player');
    if (m.team >= this.per.length) return refuse('team');
    const p = this.players.get(sessionPid);
    if (p && p.team !== m.team) return refuse('team', `already in alliance ${p.team}`);
    if (!m.squads === !m.army) return refuse('army', 'send squads (person ids) or, in dev, an army');
    if (m.army && !this.allowArmy) return refuse('army', 'class armies are dev only: join with person ids');
    for (const g of m.army ?? []) if (!isClassId(g.cls)) return refuse('army', `unknown class ${g.cls}`);
    const have = this.squadsOf(sessionPid);
    // a rejoin: the squads still stand here (offline hold); they go back under the player's control
    if (p && !p.online && have.length) return { msg: this.admit(sessionPid, m.team, []), admitted: true };
    let groups: Group[];
    if (m.squads) {
      const ids = m.squads;
      if (!persons || persons.length !== ids.length || persons.some((g, i) => g.length !== ids[i].length || !g.length)) return refuse('army', 'soldiers not loaded');
      groups = persons.map((g) => ({ cls: g[0].hero.cls ?? 'militia', count: g.length, persons: g }));
    } else groups = m.army!.map((g) => ({ cls: g.cls, count: g.count }));
    if (have.length + groups.length > MAX_SQUADS) return refuse('squads', `at most ${MAX_SQUADS} squads per player`);
    const need = groups.reduce((a, g) => a + g.count, 0);
    if (need > this.per[m.team]) return refuse('quota', `army of ${need} is bigger than the alliance quota ${this.per[m.team]}`);
    this.dequeue(sessionPid);
    if (this.queue.some((w) => w.join.team === m.team) || this.live[m.team] + need > this.per[m.team]) {
      this.queue.push({ pid: sessionPid, join: m, groups });
      const pos = this.queue.filter((w) => w.join.team === m.team).length;
      return { msg: { t: 'queued', reason: 'quota', pos, need, quota: this.quota() }, admitted: false };
    }
    return { msg: this.admit(sessionPid, m.team, groups), admitted: true };
  }

  /** The player's waiting join leaves the line; its persons are released. */
  private dequeue(pid: number): void {
    for (const w of this.queue) if (w.pid === pid) for (const g of w.groups) for (const x of g.persons ?? []) this.released.push(x.id);
    this.queue = this.queue.filter((w) => w.pid !== pid);
  }

  private admit(pid: number, team: number, groups: Group[]): ServerMsg {
    let p = this.players.get(pid);
    if (!p) this.players.set(pid, (p = { pid, team, online: true, cam: null, enc: null, sinceKey: -1, bytes: 0 }));
    p.online = true;
    if (!p.enc) { p.enc = new DeltaEncoder(); p.sinceKey = -1; }
    for (const id of this.squadsOf(pid)) this.bots.clear(id);
    for (const g of groups) this.spawn(ownerOf(pid), team, g);
    return { t: 'welcome', v: NET_VERSION, region: this.region.id, you: { id: pid, team }, squads: this.squadsOf(pid), tick: this.currentTick, quota: this.quota() };
  }

  /** The entry zone on `side` (any entry, else the whole map, when the region has none there). */
  private entry(side: Side): Rect {
    const e = this.region.entries.find((x) => x.side === side) ?? this.region.entries[0] ?? { x: 0, y: 0, w: this.region.w, h: this.region.h };
    return { x0: e.x, y0: e.y, x1: e.x + e.w, y1: e.y + e.h };
  }

  /** Spawn a squad on the team's entry, or the entry on `side` (M4 arrivals), or at `at` (a restored squad's centre). */
  private spawn(owner: string, team: number, g: Group, at?: { x: number; y: number }, side: Side = SIDES[team % SIDES.length]): SquadId {
    const r = this.entry(side), e = { x: r.x0, y: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0 };
    // squads spread over the entry on a 6-tile grid round its centre
    const k = this.spawns++, ox = ((k % 5) - 2) * 6, oy = ((Math.floor(k / 5) % 5) - 2) * 6;
    const x = Math.min(e.x + e.w - 1, Math.max(e.x + 1, e.x + e.w / 2 + ox)), y = Math.min(e.y + e.h - 1, Math.max(e.y + 1, e.y + e.h / 2 + oy));
    const persons = g.persons?.slice(0, MAX_SQUAD);
    const count = persons?.length ?? Math.min(g.count, MAX_SQUAD);
    const id = this.sim.spawnSquad(owner, team, g.cls, count, at?.x ?? x, at?.y ?? y, persons);
    this.owners[id] = owner;
    this.teams[id] = team;
    this.live[team] += count;
    return id;
  }

  /** The socket went away: the squads stay and hold (W-07). */
  leave(pid: number): void {
    const p = this.players.get(pid);
    this.dequeue(pid);
    if (!p) return;
    p.online = false;
    p.enc = null;
    const centres = this.centres();
    for (const id of this.squadsOf(pid)) {
      const s = this.snap.squads[id];
      if (s?.civ && (s.order === 'civWork' || s.order === 'gather' || s.order === 'build')) continue; // at work: workplace queues run on
      const c = centres.get(id);
      if (c) this.bots.set(id, { kind: 'hold', x: c.x, y: c.y, radius: HOLD_RADIUS });
    }
  }

  /**
   * M4 transfer out: the player's squad `squad` leaves the region over the entry on `side` (src/war/net/world.ts). It
   * must be a squad of persons with no foe (mobs included) within `foeRadius` tiles. Its men leave the field at once
   * (off the wire, no corpse). `off`: tiles from the squad's centre to that entry zone (0 inside it). `lost`: hit points
   * each man is down (they ride along); `fight`: their fight so far not yet written back (XP, kills), for the DO to write
   * before they leave.
   */
  depart(pid: number, who: SquadId | string[], side: Side, foeRadius: number): Departed | { error: 'notOwner' | 'foes'; detail: string } {
    this.snap = this.sim.snapshot(); // squads spawned since the last tick
    let men: Snapshot['units'];
    if (Array.isArray(who)) {
      // by person ids: his living men, from any of his squads here
      const want = new Set(who), mine = new Set(this.squadsOf(pid));
      men = this.snap.units.filter((u) => u.state !== 'dead' && u.pid && want.has(u.pid) && mine.has(u.squad));
      if (!men.length || men.length !== want.size) return { error: 'notOwner', detail: 'not all of these men stand here under you' };
    } else {
      if (this.owners[who] !== ownerOf(pid) || !this.squadsOf(pid).includes(who)) return { error: 'notOwner', detail: 'not a squad of yours here' };
      men = this.snap.units.filter((u) => u.squad === who && u.state !== 'dead');
      if (!men.length || men.some((u) => !u.pid)) return { error: 'notOwner', detail: 'only squads of soldiers (persons) transfer' };
    }
    const squads = new Set(men.map((u) => u.squad)), squad = men[0].squad;
    const team = this.teams[squad];
    const cx = men.reduce((a, u) => a + u.x, 0) / men.length, cy = men.reduce((a, u) => a + u.y, 0) / men.length;
    const foe = this.snap.units.some((u) => u.state !== 'dead' && this.teams[u.squad] !== team && (u.x - cx) ** 2 + (u.y - cy) ** 2 <= foeRadius * foeRadius);
    if (foe) return { error: 'foes', detail: `a foe within ${foeRadius} tiles` };
    const e = this.entry(side);
    const off = Math.hypot(Math.max(e.x0 - cx, 0, cx - e.x1), Math.max(e.y0 - cy, 0, cy - e.y1));
    const ids = men.map((u) => u.pid!);
    const lost: Record<string, number> = {};
    for (const u of men) if (u.hp < u.maxHp) lost[u.pid!] = u.maxHp - u.hp;
    const persons = this.sim.reportPersons(ids);
    const fight = persons.length ? { id: `${this.region.id}:${this.epoch}:${this.currentTick}:out${squad}`, report: { tick: this.currentTick, persons, loot: {} } } : undefined;
    // M6h: their packs and the cart a squad of theirs crews ride the transfer
    const cargo: TransitCargo = { packs: {} };
    for (const id of ids) {
      const at = this.sim.cargo({ persons: [id] });
      const b = at ? takeAll(at.slots) : null;
      if (b && (b.lots.length || b.items.length)) cargo.packs[id] = b;
    }
    const crewed = (this.snap.sieges ?? []).find((e) => e.owner === ownerOf(pid) && e.crew !== undefined && squads.has(e.crew) && e.state !== 'destroyed');
    const cart = crewed ? this.sim.stowCart(crewed.id) : null;
    if (cart) cargo.cart = { type: cart.type, lots: cart.hold.lots.filter((l) => l.n > 1e-9), items: cart.hold.items };
    this.sim.dropPersons(ids);
    for (const u of men) this.diedAt[u.id] = this.currentTick - CORPSE_TICKS; // gone, not fallen: no corpse, no blow
    this.live[team] -= men.length;
    this.snap = this.sim.snapshot();
    for (const id of squads) if (!this.snap.units.some((u) => u.squad === id && u.state !== 'dead')) this.bots.clear(id);
    return { ids, off, lost, ...(fight ? { fight } : {}), ...(Object.keys(cargo.packs).length || cargo.cart ? { cargo } : {}) };
  }

  /**
   * M4 transfer in: `persons` of the player (alliance `team`) arrive over the entry on `side`. Refused (the world keeps
   * them waiting) while the alliance's quota here is full, its join line is not empty or the player has MAX_SQUADS
   * here. They hold where they arrive; an online player gets a fresh welcome (his squads), an offline one takes them
   * over with a join (a rejoin: no new spawn).
   */
  arrive(pid: number, team: number, persons: WarPerson[], side: Side, lost: Record<string, number> = {}, cargo?: TransitCargo): { squad: SquadId; msg: ServerMsg | null } | { error: 'full' | 'team' | 'squads' } {
    const p = this.players.get(pid);
    if (team >= this.per.length || (p && p.team !== team)) return { error: 'team' };
    if (this.squadsOf(pid).length >= MAX_SQUADS) return { error: 'squads' };
    if (this.queue.some((w) => w.join.team === team) || this.live[team] + persons.length > this.per[team]) return { error: 'full' };
    if (!p) this.players.set(pid, { pid, team, online: false, cam: null, enc: null, sinceKey: -1, bytes: 0 });
    const squad = this.spawn(ownerOf(pid), team, { cls: persons[0].hero.cls ?? 'militia', count: persons.length, persons }, undefined, side);
    this.sim.hurtPersons(lost);
    // M6h: each man's pack back; the cart rolls in beside them, crewed by the squad
    for (const [id, b] of Object.entries(cargo?.packs ?? {})) {
      const at = this.sim.cargo({ persons: [id] });
      if (at) fill(at.slots, b as Bundle);
    }
    if (cargo?.cart) {
      const e = this.entry(side), men = this.sim.cargo({ squad })!;
      const x = men.slots[0]?.x ?? (e.x0 + e.x1) / 2, y = men.slots[0]?.y ?? (e.y0 + e.y1) / 2;
      const c = this.sim.spawnCart(team, ownerOf(pid), cargo.cart.type, x, y);
      fill(this.sim.cargo({ cart: c })!.slots.map((s) => ({ ...s, cap: Infinity })), cargo.cart as Bundle);
      this.sim.order({ kind: 'crew', squad, siege: c });
    }
    const online = this.players.get(pid)!.online;
    if (!online) {
      const e = this.entry(side);
      this.bots.set(squad, { kind: 'hold', x: (e.x0 + e.x1) / 2, y: (e.y0 + e.y1) / 2, radius: HOLD_RADIUS * 2 });
    }
    const msg: ServerMsg | null = online ? { t: 'welcome', v: NET_VERSION, region: this.region.id, you: { id: pid, team }, squads: this.squadsOf(pid), tick: this.currentTick, quota: this.quota() } : null;
    return { squad, msg };
  }

  /** M4: what the world map shows of this region (alliances 0..3): live men, claim points held, claims in progress. */
  summary(): { live: number[]; claims: number[]; channel: number[] } {
    const n = ALLIANCES, claims = Array<number>(n).fill(0), channel = Array<number>(n).fill(0);
    for (const c of this.snap.claims ?? []) {
      if (c.state === 'claimed' && c.team >= 0 && c.team < n) claims[c.team]++;
      const t = c.squad >= 0 ? this.teams[c.squad] : undefined;
      if ((c.state === 'channel' || c.state === 'contested') && t !== undefined && t < n) channel[t]++;
    }
    return { live: this.live.slice(0, n), claims, channel };
  }

  private centres(): Map<number, { x: number; y: number }> {
    const sum = new Map<number, { x: number; y: number; n: number }>();
    for (const u of this.snap.units) {
      if (u.state === 'dead') continue;
      const s = sum.get(u.squad) ?? { x: 0, y: 0, n: 0 };
      s.x += u.x; s.y += u.y; s.n++;
      sum.set(u.squad, s);
    }
    return new Map([...sum].map(([id, s]) => [id, { x: s.x / s.n, y: s.y / s.n }]));
  }

  /**
   * An order from the player; null when it was taken. The squad must be his own (a squad-less site order acts for his
   * team); targets are checked here where the sim would act on anyone's (a foe squad to attack, his own to merge into,
   * a site of his team to cancel or upgrade, points inside the region); the sim checks placement, stock and the rest.
   */
  order(pid: number, o: NetOrder): OrderError | null {
    const p = this.players.get(pid);
    if (!p?.online) return 'notJoined';
    const me = ownerOf(pid);
    const squad = 'squad' in o ? o.squad : undefined;
    if (squad !== undefined && this.owners[squad] !== me) return 'notOwner';
    if (squad === undefined && o.kind !== 'cancelSite' && o.kind !== 'placeBuilding' && o.kind !== 'placeWall' && o.kind !== 'placeBridge' && o.kind !== 'upgrade' && o.kind !== 'craft' && o.kind !== 'cancelCraft' && o.kind !== 'fortify') return 'bad';
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < this.region.w && y < this.region.h;
    const allIn = (a?: number[]) => !a || a.every((v, i) => (i % 2 ? v < this.region.h : v < this.region.w) && v >= 0);
    const ownSite = (id: number) => this.snap.buildings?.find((b) => b.id === id)?.team === p.team;
    const building = (id: number) => this.snap.buildings?.find((b) => b.id === id && b.goods !== undefined);
    const cart = (id: number) => this.snap.sieges?.find((s) => s.id === id && s.owner !== undefined && s.state !== 'destroyed');
    const pile = (id: number) => this.snap.piles?.some((x) => x.id === id) ?? false;
    /** M6: a holder that exists; `put`: one the player may put into (his chest or cart, his team's store). */
    const holder = (h: { building?: number; cart?: number; pile?: number }, put: boolean) => {
      if (h.pile !== undefined) return !put && pile(h.pile);
      if (h.cart !== undefined) {
        const c = cart(h.cart);
        return !!c && (!put || c.owner === me);
      }
      const b = h.building !== undefined ? building(h.building) : undefined;
      if (!b) return false;
      return !put || (b.type === 'chest' ? b.owner === me : b.team === p.team);
    };
    switch (o.kind) {
      case 'attack':
        if (this.owners[o.target] === undefined || this.teams[o.target] === p.team) return 'badTarget';
        break;
      case 'merge':
        if (this.owners[o.into] !== me || o.into === o.squad) return 'notOwner';
        break;
      case 'move':
      case 'attackMove':
      case 'placeBuilding':
      case 'buildSiege':
        if (!inside(o.x, o.y)) return 'bad';
        break;
      case 'placeWall':
        if (!allIn(o.points) || !allIn(o.towers) || !allIn(o.gates) || !allIn(o.inside)) return 'bad';
        break;
      case 'placeBridge':
      case 'raiseLadder':
        if (!allIn(o.kind === 'placeBridge' ? o.points : o.wallTile)) return 'bad';
        break;
      case 'cancelSite':
        if (!ownSite(o.site)) return 'badTarget';
        break;
      case 'upgrade':
      case 'build':
      case 'civWork':
      case 'craft': // M5h: a workplace of his team
      case 'cancelCraft':
      case 'fortify': // M5h3: a building of his team
        if (!ownSite(o.kind === 'build' ? o.site : o.building)) return 'badTarget';
        break;
      case 'load':
        if (!holder(o.from, false)) return 'badTarget';
        break;
      case 'unload':
        if (!holder(o.to, true)) return 'badTarget';
        break;
      case 'escort':
        if (cart(o.cart)?.team !== p.team) return 'badTarget';
        break;
      case 'salvagePile':
        if (!pile(o.pile)) return 'badTarget';
        break;
    }
    const sent = (squad === undefined && o.kind !== 'cancelSite' ? { ...o, team: p.team } : o) as Order;
    if (squad !== undefined) this.bots.clear(squad);
    this.sim.order(sent);
    this.log.push({ tick: this.currentTick, o: sent });
    return null;
  }

  /**
   * M5h4: repair or salvage `item` (the player's stash item, loaded from D1 by the DO) at workplace `building` of his
   * team; null when it was sent to the sim. The sim may still refuse it (queue full, wrong workplace): tick() then
   * hands the uid back.
   */
  mend(pid: number, kind: 'repair' | 'salvage', building: number, item: Item): OrderError | null {
    const p = this.players.get(pid);
    if (!p?.online) return 'notJoined';
    if (this.snap.buildings?.find((b) => b.id === building)?.team !== p.team) return 'badTarget';
    if (this.mends.some((m) => m.uid === item.uid)) return 'bad';
    const o: Order = { kind, team: p.team, building, owner: ownerOf(pid), item };
    this.sim.order(o);
    this.log.push({ tick: this.currentTick, o });
    this.mends.push({ uid: item.uid, pid, building, def: item.def });
    return null;
  }

  /**
   * M6e: a crafted item goes in the workplace's output chest: its owner's chest (of the team) nearest the workplace
   * with room for it, else the team's home strongroom in the region. Its uid is the event's key (`c:<key>`).
   */
  deposit(e: Crafted): void {
    e.item = { ...e.item, uid: `c:${craftKey(this.region.id, this.run, e.order)}` };
    const wp = this.snap.buildings?.find((b) => b.id === e.building);
    const chests = (this.snap.buildings ?? [])
      .filter((b) => b.type === 'chest' && b.owner === e.owner && b.team === e.team && b.state === 'done')
      .sort((a, b) => (wp ? (a.x - wp.x) ** 2 + (a.y - wp.y) ** 2 - ((b.x - wp.x) ** 2 + (b.y - wp.y) ** 2) : a.id - b.id));
    for (const c of chests) {
      const at = this.sim.cargo({ building: c.id });
      if (at && freeLoads(at.slots) >= 0.2 - 1e-6 && !fill(at.slots, { lots: [], items: [e.item] }).items.length) return;
    }
    this.sim.cargo({ reserve: e.team })!.slots[0].hold.items.push(e.item);
  }

  /**
   * M6e: the region's holders of players for the D1 snapshot (war_region_holds): chests, carts, each squad's packs.
   * `ref`: b:<building>, c:<cart>, k:<squad>.
   */
  holdRows(): { ref: string; kind: 'chest' | 'cart' | 'packs'; pid: number; team: number; goods: Record<string, number>; items: Item[] }[] {
    const out: ReturnType<WarRoom['holdRows']> = [];
    const pidOf = (o: string) => (/^p:(\d+)$/.exec(o) ? Number(o.slice(2)) : null);
    for (const b of this.snap.buildings ?? []) {
      const pid = b.type === 'chest' && b.owner ? pidOf(b.owner) : null;
      const at = pid !== null ? this.sim.cargo({ building: b.id }) : null;
      if (pid !== null && at) out.push({ ref: `b:${b.id}`, kind: 'chest', pid, team: b.team, ...contents(at.slots) });
    }
    for (const s of this.snap.sieges ?? []) {
      const pid = s.owner ? pidOf(s.owner) : null;
      const at = pid !== null && s.state !== 'destroyed' ? this.sim.cargo({ cart: s.id }) : null;
      if (pid !== null && at) out.push({ ref: `c:${s.id}`, kind: 'cart', pid, team: s.team, ...contents(at.slots) });
    }
    for (const s of this.snap.squads) {
      const pid = pidOf(s.owner);
      if (pid === null || !s.units.some((u) => this.snap.units[u]?.pack)) continue;
      const at = this.sim.cargo({ squad: s.id });
      if (at) out.push({ ref: `k:${s.id}`, kind: 'packs', pid, team: s.team, ...contents(at.slots) });
    }
    return out;
  }

  /** M6f: the player's own carrier: his squad's packs or his cart (null: not his, or gone). */
  carrier(pid: number, from: { squad?: number; cart?: number }) {
    const me = ownerOf(pid);
    if (from.squad !== undefined) {
      if (this.owners[from.squad] !== me) return null;
      return this.sim.cargo({ squad: from.squad });
    }
    if (from.cart === undefined) return null;
    const at = this.sim.cargo({ cart: from.cart });
    return at && at.owner === me ? at : null;
  }

  /** M6f: the carrier stands in the town's market court (a man of the squad, or the cart; a region with no court: anywhere). */
  inCourt(pid: number, from: { squad?: number; cart?: number }): boolean {
    const at = this.carrier(pid, from);
    if (!at) return false;
    const safe = this.region.safe;
    return !safe?.length || at.slots.some((s) => inRects(safe, s.x, s.y));
  }

  /**
   * M6f bridge out of the room: `goods` and items `uids` taken from the player's carrier (sealed lots only under
   * `seal`), all or nothing; null when it is not his or lacks some.
   */
  takeCargo(pid: number, from: { squad?: number; cart?: number }, goods: Record<string, number>, uids: string[] = [], seal?: number): Bundle | null {
    const at = this.carrier(pid, from);
    return at ? takeOut(at.slots, goods, uids, seal) : null;
  }

  /** M6f bridge into the room: a bundle into the player's carrier as far as it has room; what did not fit comes back. */
  giveCargo(pid: number, to: { squad?: number; cart?: number }, b: Bundle): Bundle {
    const at = this.carrier(pid, to);
    return at ? fill(at.slots, b) : b;
  }

  private handoffs = new Map<string, HandoffWindow>();
  private static hkey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

  /** The two carriers stand within HANDOFF.reach tiles of each other (any man of a squad, or the cart). */
  private near(a: number, ca: Carrier, b: number, cb: Carrier): boolean {
    const x = this.carrier(a, ca), y = this.carrier(b, cb), r2 = HANDOFF.reach ** 2;
    return !!x && !!y && x.slots.some((s) => y.slots.some((t) => (s.x - t.x) ** 2 + (s.y - t.y) ** 2 <= r2));
  }

  /**
   * M6g hand-off: `offer` sets (or changes, which clears both confirms) the player's half of the window with `other`
   * (a half may give nothing, but names the carrier that receives); `confirm` marks his consent; `cancel` closes it.
   * The window lasts HANDOFF.ticks and needs both carriers near. Returns the window (ready: both confirmed) or an error.
   */
  handoff(pid: number, other: number, op: 'offer' | 'confirm' | 'cancel', half?: Half): { window: HandoffWindow; ready: boolean } | { error: OrderError; detail: string } {
    const p = this.players.get(pid), q = this.players.get(other);
    if (!p?.online || !q || pid === other) return { error: 'notJoined', detail: 'both must be here' };
    const k = WarRoom.hkey(pid, other);
    let w = this.handoffs.get(k);
    if (w && this.currentTick > w.until) this.handoffs.delete(k), (w = undefined);
    if (op === 'cancel') {
      if (w) this.handoffs.delete(k);
      return w ? { window: w, ready: false } : { error: 'bad', detail: 'no window' };
    }
    if (op === 'offer') {
      if (!half || !this.carrier(pid, half.from)) return { error: 'notOwner', detail: 'not your carrier' };
      if (!w) this.handoffs.set(k, (w = { a: Math.min(pid, other), b: Math.max(pid, other), halves: {}, ok: [], until: this.currentTick + HANDOFF.ticks }));
      w.halves[pid] = { from: half.from, goods: { ...half.goods }, uids: [...half.uids] };
      w.ok = [];
    } else {
      if (!w || !w.halves[pid] || !w.halves[other]) return { error: 'bad', detail: 'both halves first' };
      if (!w.ok.includes(pid)) w.ok.push(pid);
    }
    const ha = w.halves[w.a], hb = w.halves[w.b];
    if (ha && hb && !this.near(w.a, ha.from, w.b, hb.from)) return { error: 'badTarget', detail: `stand within ${HANDOFF.reach} tiles` };
    return { window: w, ready: w.ok.length === 2 };
  }

  /**
   * Swap a ready window at once: both halves out of their carriers (all or nothing), each into the other's carrier;
   * nothing in flight. Refused (nothing moves) when either walked off, lacks his half or the other has no room.
   */
  swapHandoff(a: number, b: number): { ok: true; gave: Record<number, Bundle> } | { error: string } {
    const k = WarRoom.hkey(a, b), w = this.handoffs.get(k);
    this.handoffs.delete(k);
    if (!w || w.ok.length !== 2 || this.currentTick > w.until) return { error: 'expired' };
    const ha = w.halves[w.a], hb = w.halves[w.b];
    if (!this.near(w.a, ha.from, w.b, hb.from)) return { error: 'walked off' };
    const xa = this.carrier(w.a, ha.from)!, xb = this.carrier(w.b, hb.from)!;
    const ba = takeOut(xa.slots, ha.goods, ha.uids);
    if (!ba) return { error: 'lacks his half' };
    const bb = takeOut(xb.slots, hb.goods, hb.uids);
    if (!bb) return fill(xa.slots, ba), { error: 'lacks his half' };
    const ra = fill(xb.slots, ba), rb = fill(xa.slots, bb);
    if (ra.lots.length || ra.items.length || rb.lots.length || rb.items.length) {
      // no room: undo (each side takes back what crossed and gets his own half again)
      takeOut(xb.slots, subtract(ba, ra).goods, subtract(ba, ra).uids);
      takeOut(xa.slots, subtract(bb, rb).goods, subtract(bb, rb).uids);
      fill(xa.slots, ba), fill(xb.slots, bb);
      return { error: 'no room' };
    }
    return { ok: true, gave: { [w.a]: ba, [w.b]: bb } };
  }

  /** Open hand-off windows (tests, the DO). */
  openHandoffs(): HandoffWindow[] {
    for (const [k, w] of this.handoffs) if (this.currentTick > w.until) this.handoffs.delete(k);
    return [...this.handoffs.values()];
  }

  /** Uids of the stash items at this region's workplaces. */
  mendUids(): string[] {
    return this.mends.map((m) => m.uid);
  }

  /**
   * Mend items whose order is gone without a crafted event: per workplace and item kind, the room holds no more items
   * than its queue has repair / salvage orders (the newest go back first).
   */
  private unmend(done: ReadonlySet<string>): string[] {
    this.mends = this.mends.filter((m) => !done.has(m.uid));
    if (!this.mends.length) return [];
    const open = new Map<string, number>();
    for (const b of this.snap.buildings ?? [])
      for (const q of b.queue ?? []) if (q.kind !== 'craft') open.set(`${b.id}|${q.recipe}`, (open.get(`${b.id}|${q.recipe}`) ?? 0) + 1);
    const freed: string[] = [];
    for (let i = this.mends.length - 1; i >= 0; i--) {
      const m = this.mends[i], k = `${m.building}|${m.def}`, n = open.get(k) ?? 0;
      const held = this.mends.filter((x, j) => j <= i && `${x.building}|${x.def}` === k).length;
      if (held > n) freed.push(m.uid), this.mends.splice(i, 1);
    }
    return freed;
  }

  /** A placement check for the player's team (null: not joined). */
  check(pid: number, c: CheckMsg): Extract<ServerMsg, { t: 'checked' }> {
    const p = this.players.get(pid);
    const team = p?.team;
    let result: PlaceResult | WallPlan | BridgePlan | null = null;
    if (team !== undefined) {
      if (c.kind === 'building') result = this.sim.checkPlacement(team, c.type, c.x, c.y, c.rot);
      else if (c.kind === 'wall') result = this.sim.checkWall(team, { material: c.material, points: c.points, towers: c.towers, gates: c.gates, inside: c.inside });
      else result = this.sim.checkBridge(team, { material: c.material, points: c.points, width: c.width });
    }
    return { t: 'checked', id: c.id, result };
  }

  view(pid: number, r: Rect): void {
    const p = this.players.get(pid);
    if (p) p.cam = r;
  }

  /** Step once; frames per online player, the queued players let in this tick and a finished fight to write back. */
  tick(now: () => number = () => 0): { frames: Map<number, Uint8Array>; admitted: Map<number, ServerMsg>; fights: Fight[]; crafted: Crafted[]; bosses: BossSlain[]; freed: string[]; raided: number[]; times: TickTimes } {
    const t0 = now();
    this.sim.step();
    this.bots.tick();
    const t1 = now();
    this.snap = this.sim.snapshot();
    const evs = this.sim.events();
    const crafted = evs.filter((e): e is Crafted => e.kind === 'crafted');
    const bosses = evs.filter((e): e is BossSlain => e.kind === 'bossSlain');
    for (const e of crafted) if (e.what === 'craft') this.deposit(e);
    for (const e of bosses) this.sim.dropPile(e.x ?? this.region.w / 2, e.y ?? this.region.h / 2, [], bossItems(this.region.id, this.run, e));
    // M5e: holding buildings raided or fallen this tick: their captives go free (the DO writes it)
    const raided = evs.flatMap((e) => (e.kind === 'raid' ? [e.building] : []));
    for (const e of evs) if (e.kind === 'raid' && e.by !== undefined && e.by !== e.team) this.stormed.add(e.by);
    const freed = this.unmend(new Set(crafted.filter((e) => e.what !== 'craft').map((e) => e.item.uid)));
    this.live = this.per.map(() => 0);
    for (const s of this.snap.squads) {
      this.owners[s.id] = s.owner;
      this.teams[s.id] = s.team;
    }
    const tick = this.snap.tick, wire: typeof this.snap.units = [];
    let blow = false;
    for (const u of this.snap.units) {
      if (u.state === 'attack') blow = true;
      if (u.state === 'dead') {
        if (this.diedAt[u.id] === undefined) blow = true;
        const d = (this.diedAt[u.id] ??= tick);
        if (tick - d < CORPSE_TICKS) wire.push(u);
        continue;
      }
      wire.push(u);
      const t = this.teams[u.squad];
      if (t !== undefined && t < this.live.length) this.live[t]++;
    }
    const fights: Fight[] = [];
    if (blow) (this.lastBlow = tick), (this.inFight = true);
    else if (this.inFight && tick - this.lastBlow >= this.fightQuiet) {
      this.inFight = false;
      const report = this.sim.endFight();
      this.honour(report);
      if (report.persons.length || Object.keys(report.loot).length) fights.push({ id: `${this.region.id}:${this.epoch}:${tick}`, report });
    }
    const admitted = this.drainQueue();
    const t2 = now();
    const frames = new Map<number, Uint8Array>();
    if (this.online() > 0) {
      const vision = this.vision(this.sim, this.snap), view = { ...this.snap, units: wire };
      const shots = this.snap.shots ?? [];
      const fresh = shots.filter((s: ShotSnap) => s.t0 > this.lastTick);
      for (const p of this.players.values()) {
        if (!p.online || !p.enc) continue;
        const key = p.sinceKey < 0 || p.sinceKey + 1 >= this.keyEvery;
        p.sinceKey = key ? 0 : p.sinceKey + 1;
        const vis = visibleTo(view, vision, ownerOf(p.pid), p.team, p.cam, key ? shots : fresh);
        const f = p.enc.encode({ tick: this.snap.tick, ...vis }, key);
        p.bytes += f.length;
        frames.set(p.pid, f);
      }
    }
    this.lastTick = this.snap.tick;
    return { frames, admitted, fights, crafted, bosses, freed, raided, times: { stepMs: t1 - t0, snapMs: t2 - t1, netMs: now() - t2 } };
  }

  /** Battle honours won in a finished fight go on its report (src/war/sim/honours.ts); the fort-taking slate is wiped. */
  private honour(report: FightReport): void {
    const { claims } = this.summary(), best = Math.max(...claims), lead = claims.flatMap((n, i) => (n === best && n > 0 ? [i] : []));
    const won = honoursOf(report, {
      region: worldRegion(this.region.id)?.name ?? this.region.name, chokepoint: CHOKEPOINTS.has(this.region.id),
      holder: lead.length === 1 ? lead[0] : null, stormed: this.stormed,
    });
    for (const x of report.persons) {
      const h = won.get(x.pid);
      if (h) x.honour = h;
    }
    this.stormed.clear();
  }

  /** Let waiting joins in, first come first served per alliance, while their alliance has room. */
  private drainQueue(): Map<number, ServerMsg> {
    const out = new Map<number, ServerMsg>();
    const blocked = new Set<number>();
    const rest: Waiting[] = [];
    for (const w of this.queue) {
      const team = w.join.team, need = w.groups.reduce((a, g) => a + g.count, 0);
      if (blocked.has(team) || this.live[team] + need > this.per[team]) { blocked.add(team); rest.push(w); continue; }
      out.set(w.pid, this.admit(w.pid, team, w.groups));
    }
    this.queue = rest;
    return out;
  }

  /** The whole region for DO storage (RoomState): the sim's exact state plus the room's own books. */
  saveState(): RoomState {
    const pids = [...this.sim.snapshot().units].filter((u) => u.pid && u.state !== 'dead').map((u) => u.pid!);
    const died: [number, number][] = [];
    this.diedAt.forEach((t, id) => t !== undefined && this.currentTick - t < CORPSE_TICKS && died.push([id, t]));
    return {
      v: 2, region: this.region.id, tick: this.sim.snapshot().tick,
      players: [...this.players.values()].map((p) => ({ pid: p.pid, team: p.team })),
      owners: Array.from(this.owners, (o) => o ?? null), teams: Array.from(this.teams, (t) => t ?? null),
      spawns: this.spawns, died, lastBlow: this.lastBlow, inFight: this.inFight, queue: this.queue, pids,
      sim: this.sim.exportState(), bots: this.bots.exportState(), run: this.run, mends: this.mends, stormed: [...this.stormed],
    };
  }

  /**
   * A room rebuilt from saveState() after an eviction: the sim resumes exactly where it was saved, every player offline
   * with his squads on the hold AI. `persons`: the D1 rows still deployed here; a man on the field D1 no longer has here
   * (a fight written back after the save) leaves the field unreported.
   */
  static restore(o: RoomOptions, st: RoomState, persons: ReadonlyMap<string, WarPerson>): WarRoom {
    const r = new WarRoom(o);
    r.sim.importState(st.sim);
    r.bots.importState(st.bots);
    st.owners.forEach((x, i) => x !== null && (r.owners[i] = x));
    st.teams.forEach((x, i) => x !== null && (r.teams[i] = x));
    r.spawns = st.spawns;
    for (const [id, t] of st.died) r.diedAt[id] = t;
    r.lastBlow = st.lastBlow;
    r.inFight = st.inFight;
    r.queue = st.queue;
    if (st.run) r.run = st.run;
    r.mends = st.mends ?? [];
    r.stormed = new Set(st.stormed ?? []);
    for (const w of st.queue) r.dequeue(w.pid); // nobody is connected to wait: their persons go home (takeReleased)
    const gone = st.pids.filter((id) => !persons.has(id));
    if (gone.length) r.sim.dropPersons(gone);
    r.snap = r.sim.snapshot();
    r.lastTick = r.snap.tick - 1;
    for (const p of st.players) r.players.set(p.pid, { pid: p.pid, team: p.team, online: false, cam: null, enc: null, sinceKey: -1, bytes: 0 });
    for (const p of st.players) r.leave(p.pid); // hold where they stand
    r.recount();
    return r;
  }

  /** Living soldiers per alliance from the current snapshot. */
  private recount(): void {
    this.live = this.per.map(() => 0);
    for (const u of this.snap.units) {
      if (u.state === 'dead') continue;
      const t = this.teams[u.squad];
      if (t !== undefined && t < this.live.length) this.live[t]++;
    }
  }

  /** The current full snapshot (tests). */
  snapshot(): Snapshot {
    return this.snap;
  }

  /** Bytes sent to each online player so far. */
  bytesSent(): Map<number, number> {
    return new Map([...this.players.values()].map((p) => [p.pid, p.bytes]));
  }
}
