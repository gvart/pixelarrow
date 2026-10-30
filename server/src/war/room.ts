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
import { createWarlords, type WarlordMemory, type WarlordNote, type Warlords } from '../../../src/war/sim/warlords';
import type { SecretEvent } from '../../../src/war/sim/secrets';
import { wildDeeds, type WildDeed } from '../../../src/war/net/mastery';
import { isClassId } from '../../../src/data/classes';
import { DeltaEncoder } from '../../../src/war/net/codec';
import { interestRect, seesBoss, visibleTo, type Rect, type TeamVision } from '../../../src/war/net/interest';
import { isMobFx } from '../../../src/war/sim/mobs';
import { EconomyFeed, encodeFog, encodeInfluence, NODES_EVERY, storeByMen } from '../../../src/war/net/economy';
import { ALLIANCES, isBossEvent, KEYFRAME_EVERY, MAX_SQUAD, MAX_SQUADS, NET_VERSION, splitQuota, WILD_EVERY, type CheckMsg, type DevMsg, type JoinMsg, type NetOrder, type OrderError, type Quota, type Refusal, type ServerMsg } from '../../../src/war/net/protocol';
import type { SimState } from '../../../src/war/sim/state';
import type { Item } from '../../../src/data/items';
import type { BridgePlan, FightReport, LandmarkSnap, Order, PlaceResult, RegionData, RegionMemory, ShotSnap, Snapshot, SquadId, WallPlan, WarBuildSim, WarEvent, WarPerson, WarSkillId } from '../../../src/war/types';
import type { AttrId } from '../../../src/data/perks';
import { spendLevel, type SpendRefusal } from '../../../src/war/sim/roster';
import type { Side } from '../../../src/war/world/types';
import type { BossSlain } from './bosses';
import { honoursOf } from '../../../src/war/sim/honours';
import { CHOKEPOINTS } from '../../../src/war/world/season';
import { worldRegion } from '../../../src/war/world/graph';
import { bossItems } from './bosses';
import { bossGoods } from '../../../src/data/warBosses';
import { STORM, WAKE, type WorldEvent } from '../../../src/war/world/events';
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
import { ARMY_MAX } from '../../../src/war/sim/soldiers';
import { RoomGuide, type GuideDone } from './guide';
import type { GuideSave } from '../../../src/war/net/guide';
import { RoomStories, type StoryDone } from './stories';
import { RoomEncounters, type EncounterDone } from './encounters';
import type { EncSave } from '../../../src/war/sim/encounters';
import type { StorySave } from '../../../src/war/sim/stories';
import { LABOUR_EVERY, WORK_R, workSite, type WorkId } from '../../../src/war/net/works';
import { GatherWatch } from './taskWatch';
import type { TaskMetric } from '../../../src/war/net/tasks';
import { ALLIANCES as ALLIANCE_LIST } from '../../../src/war/world/alliances';
import { BUILDINGS } from '../../../src/war/sim/economy';
import { bannerOf, buildRefusal, netOf, ownBuildings, piecesOf, storesOf, type Persist, type Piece, type RoomSettlement } from './roomSettlements';
import { SETTLE } from './settlements';
import type { SettlementNet } from '../../../src/war/net/protocol';

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

/** W-61: a guard contract the room checks: the poster's team (whose town), the taker, the men he must keep inside. */
export interface GuardWatch { id: number; team: number; taker: number; men: number }
/** W-61: what the room counted this LABOUR_EVERY (the DO books it in D1). */
export interface Peace {
  labour: { pid: number; site: number; secs: number }[];
  guards: { id: number; held: boolean; secs: number }[];
  works: { team: number; work: WorkId; by: Record<number, number> }[];
}

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
  /** The war season and authored region version it was saved on (the DO sets it; another one starts the region over). */
  edition?: string;
  /** W-72 proposal: the region's warlords (src/war/sim/warlords.ts exportState). */
  warlords?: unknown;
  /** W-63: players' own alliances, who placed each camp or fort site, camps already reported to found(). */
  settle?: { own: [number, number][]; campBy: [number, number][]; tried: number[] };
}

/** W-63: a finished camp or fort to report to settlements.found (its placer the lord). */
export interface FoundReq { centre: number; x: number; y: number; lord: number }
/** A held claim point being taken: its holder hears it (once per ATTACK_COOLDOWN a point and attacker). */
export interface ClaimTaking { point: number; holder: number; by: number }
/**
 * W-63: what the room saw this tick of the settlements: camps to found, attacks on them (player `by`, settlement
 * `victim`); and held claim points being taken (`taking`).
 */
export interface SettleOut { found: FoundReq[]; attacks: { by: number; victim: number }[]; taking: ClaimTaking[] }
/** W-64: a pact or truce in force between alliances a and b (crown.ts pactsOf; the DO loads them with the settlements). */
export interface RoomPact { a: number; b: number; kind: 'pact' | 'truce' }
/** W-63: a settlement's report (settlements.report): town level, people on its ground, what persists of it. */
export interface SettleReport { id: number; level: number; tended: boolean; persist: Persist }
/** W-63 ticks: founding checks and attack samples; one player's attacks on one settlement are logged once per ATTACK_COOLDOWN. */
export const SETTLE_EVERY = 10;
export const ATTACK_COOLDOWN = 3000;

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
  /** Accept the dev panel's helpers (DevMsg: stock, claim, spawn, skip). The DO allows them only with DEV_AUTH=1. Default: allowArmy. */
  allowDev?: boolean;
  /** This room instance's id in fight ids (default: random). */
  epoch?: string;
  fightQuiet?: number;
  /** M7f: a fresh room wakes the region's lairs and guardians (a neutral region on its own map). */
  wild?: boolean;
  /** W-65: a fresh room starts the region's roaming life (src/war/sim/roam.ts; homes too). Default false (tests, tools). */
  roam?: boolean;
  /** W-72 proposal: run the region's rival warlords (src/war/sim/warlords.ts) when it lies in a domain. Default false (tests, tools). */
  warlords?: boolean;
  /**
   * The alliance whose home this region is: a fresh room (a new season, docs/WAR.md depth 0 "owned") gives it an
   * influence anchor of HOME_CLAIM_R at its home town, so it may build at home from the start (homes have no claim points).
   */
  home?: number;
}

/** Influence radius of a home's anchor (tiles): the town (pieces within ~42 tiles of its centre) and a ring round it. */
export const HOME_CLAIM_R = 64;

/** A home's anchor: the centre of its pre-built town (the map centre when it has none). */
export function homeAnchor(region: RegionData): { x: number; y: number } {
  const ps = (region.prebuilt ?? []).filter((p) => !p.tiles);
  if (!ps.length) return { x: region.w / 2, y: region.h / 2 };
  return { x: Math.round(ps.reduce((a, p) => a + p.x, 0) / ps.length) + 0.5, y: Math.round(ps.reduce((a, p) => a + p.y, 0) / ps.length) + 0.5 };
}

/** M7f: a landmark as the room reports it to the world (src/war/net/world.ts LandmarkWorld; back: minutes, not a time). */
export interface LandmarkReport { id: string; holder: number; guardian: 'alive' | 'slain' | 'away'; back?: number; state: LandmarkSnap['state']; hp: number; garrisoned: boolean }
/** What the room tells the world (World.report). */
export interface Summary { live: number[]; claims: number[]; channel: number[]; landmark?: LandmarkReport; prestige?: number[]; ruined?: boolean; town?: number[] }

interface Player {
  pid: number;
  team: number;
  online: boolean;
  cam: Rect | null;
  enc: DeltaEncoder | null;
  /** The economy view he was sent (nodes, influence): fresh with each encoder. */
  feed?: EconomyFeed;
  /** Ticks since its last keyframe; -1: none sent yet. */
  sinceKey: number;
  bytes: number;
}

export interface Waiting { pid: number; join: JoinMsg; groups: Group[] }

export interface TickTimes { stepMs: number; snapMs: number; netMs: number }

export type JoinResult = { msg: ServerMsg; admitted: boolean };

/** W-60: a soul claimed here, for the DO to write (server/src/war/persons.ts claimSoul). */
export interface SoulClaim { pid: number; person: WarPerson; squad: SquadId; unit: number }

export class WarRoom {
  readonly sim: WarBuildSim;
  readonly bots: Bots;
  /** W-72 proposal: the region's rival warlords (null: none here, or not asked for). */
  readonly warlords: Warlords | null;
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
  private allowDev: boolean;
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
  /** Each team's influence runs at an influence version (encoded once per change). */
  private inflRuns = new Map<number, { v: number; runs: number[] }>();
  /** Each team's fog runs at a fog version (W-39; encoded once per change). */
  private fogRuns = new Map<number, { v: number; runs: number[] }>();
  /** W-60: each player's fighters across all regions (D1, set by the DO on join and after each claim): the soul gate. */
  private armies = new Map<number, number>();
  /** W-61: guard contracts the DO watches here (poster's team), the alliance works open at this home region, town sent. */
  private guards: GuardWatch[] = [];
  private workSites: { work: WorkId; team: number; x: number; y: number }[] = [];
  private townSent = new Map<number, string>();
  /** W-65: the `wild` message last sent on each client's feed (a new feed, a rejoin, sends it again). */
  private wildSent = new WeakMap<EconomyFeed, string>();
  /** W-72 proposal: the `warlords` list last sent on each client's feed. */
  private lordSent = new WeakMap<EconomyFeed, string>();
  /** The `allies` message last sent on each client's feed (a new feed, a rejoin, sends it again). */
  private allySent = new WeakMap<EconomyFeed, string>();
  /** W-62 E7: men carrying wood and stone home, tallied for the tasks (the DO books `gathered`). */
  private gather = new GatherWatch();
  /** W-73: each lair's state as last seen (src/war/net/mastery.ts wildDeeds). */
  private wildSeen = new Map<number, string>();
  /** W-62: world events running in this region (the DO sets them: src/war/world/events.ts). */
  private worldEvents: WorldEvent[] = [];
  /** W-62: the first-hour guide of the home alliance's new players (./guide.ts). */
  readonly guide: RoomGuide;
  /** W-65: the region's story chain, one run per player here (./stories.ts). */
  readonly stories: RoomStories;
  /** W-65: random encounters on the road, one run per player here (./encounters.ts). */
  readonly encounters: RoomEncounters;
  // W-63 shared settlements (the block at the end of the class)
  private settles: RoomSettlement[] = [];
  private own = new Map<number, number>();
  private campBy = new Map<number, number>();
  private pendingCamps: { pid: number; team: number; type: string; x: number; y: number; tick: number }[] = [];
  private tried = new Set<number>();
  private hpSeen = new Map<string, number>();
  private attackAt = new Map<string, number>();
  private takeAt = new Map<string, number>();
  private pacts: RoomPact[] = [];
  private later = new Map<number, ServerMsg[]>();
  private isHome: boolean;
  /** W-63: why the last order was refused with notYourGround (the DO sends it as the error's detail). */
  refusal = '';

  constructor(o: RoomOptions) {
    this.region = o.region;
    this.sim = createSim(o.region, o.seed);
    this.bots = createBots(this.sim);
    this.warlords = o.warlords ? createWarlords(o.region, this.sim, this.bots, o.seed) : null;
    this.per = o.quotas ?? splitQuota(o.cap, ALLIANCES);
    this.live = this.per.map(() => 0);
    // default: the sim's fog of war (W-39); VisionMap (the plain radius rule) is the fallback hook for tests and tools
    const fog: TeamVision = { sees: (team, x, y) => this.sim.visibleTo(team, x, y) };
    this.vision = o.vision ?? (() => fog);
    this.keyEvery = o.keyframeEvery ?? KEYFRAME_EVERY;
    this.allowArmy = o.allowArmy ?? true;
    this.allowDev = o.allowDev ?? this.allowArmy;
    this.guide = new RoomGuide(o.region, this.sim, o.home);
    this.stories = new RoomStories(o.region, this.sim);
    this.encounters = new RoomEncounters(o.region, this.sim, o.seed);
    this.isHome = o.home !== undefined;
    this.epoch = o.epoch ?? `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    this.fightQuiet = o.fightQuiet ?? FIGHT_QUIET;
    this.run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    // W-60: a soul joins only while the player's whole army (every region, D1) is under ARMY_MAX; without a count from
    // the DO (dev armies, tests) his fighters on this field
    this.sim.setSoulGate((owner) => {
      const m = /^p:(\d+)$/.exec(owner), pid = m ? Number(m[1]) : null;
      const known = pid !== null ? this.armies.get(pid) : undefined;
      const have = known ?? this.snap?.units.filter((u) => u.state !== 'dead' && this.owners[u.squad] === owner && !u.cls.startsWith('civ_')).length ?? 0;
      return { ok: have < ARMY_MAX, have };
    });
    if (o.wild) this.sim.spawnMobs();
    if (o.roam) this.sim.spawnRoam();
    if (o.home !== undefined) {
      const a = homeAnchor(o.region);
      this.sim.claim(o.home, a.x, a.y, HOME_CLAIM_R);
    }
    this.snap = this.sim.snapshot();
  }

  /** M7f: what the region remembers once it empties (pre-built pieces, claim holders, guardians, its landmark). */
  memory(): RegionMemory {
    return this.sim.memory();
  }

  /** W-62: the world events running in this region now: a soul storm wakes souls faster; a boss wake doubles its rare goods. */
  setWorldEvents(evs: WorldEvent[]): void {
    this.worldEvents = evs;
    this.sim.setSoulStorm(evs.some((e) => e.kind === 'soulStorm') ? STORM.chance : 1);
  }

  /** W-72 proposal: the warlords' age (days since the season began; the DO's clock). */
  setWarlordAge(days: number): void {
    this.warlords?.setAge(days);
  }

  /** W-72 proposal: what the region's warlords leave behind once the room empties (fallen lords, places freed), and back. */
  warlordMemory(): WarlordMemory | null {
    return this.warlords?.memory() ?? null;
  }

  recallWarlords(m: WarlordMemory): void {
    this.warlords?.recall(m);
  }

  /** Players with living fighting men here (the warlords' pressure). */
  present(): number {
    const pids = new Set<string>();
    for (const u of this.snap.units) {
      const o = u.state !== 'dead' && !u.cls.startsWith('civ_') ? this.owners[u.squad] : undefined;
      if (o?.startsWith('p:')) pids.add(o);
    }
    return pids.size;
  }

  /** W-62: a boss wake: the region's guardians back now (unless the region is held) and stronger. */
  wakeGuardians(): void {
    this.sim.wakeGuardians(WAKE.hp);
    this.snap = this.sim.snapshot();
  }

  /** M7f: a fresh room takes on what the region remembers, `elapsed` ticks after it was left. */
  recall(m: RegionMemory, elapsed: number): void {
    this.sim.recall(m, Math.max(0, Math.floor(elapsed)));
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
    // W-63: the banner by ground: tied to a settlement here, his men fly its lord's alliance; else his own (m.team)
    this.own.set(sessionPid, m.team);
    m = { ...m, team: this.bannerTeam(sessionPid) ?? m.team };
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
    if (groups.length && (this.queue.some((w) => w.join.team === m.team) || this.live[m.team] + need > this.per[m.team])) { // W-66: a watcher (no squad) never waits
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
    if (!p.enc) { p.enc = new DeltaEncoder(); p.sinceKey = -1; p.feed = new EconomyFeed(); }
    for (const id of this.squadsOf(pid)) this.bots.clear(id);
    for (const g of groups) this.spawn(ownerOf(pid), team, g);
    return { t: 'welcome', v: NET_VERSION, region: this.region.id, you: { id: pid, team }, squads: this.squadsOf(pid), tick: this.currentTick, quota: this.quota() };
  }

  /**
   * The entry zone on `side`; when the map has none there (a border its authored map leaves out), the entry nearest
   * the middle of that edge; with no entries at all, the whole map.
   */
  private entry(side: Side): Rect {
    const { w, h, entries } = this.region;
    const [mx, my] = side === 'N' ? [w / 2, 0] : side === 'S' ? [w / 2, h] : side === 'W' ? [0, h / 2] : [w, h / 2];
    const d = (x: (typeof entries)[number]) => (x.x + x.w / 2 - mx) ** 2 + (x.y + x.h / 2 - my) ** 2;
    const e = entries.find((x) => x.side === side) ?? [...entries].sort((a, b) => d(a) - d(b))[0] ?? { x: 0, y: 0, w, h };
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
    // W-63: the banner by ground
    if (team < this.per.length) this.own.set(pid, team);
    team = this.bannerTeam(pid) ?? team;
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
      const c = this.sim.spawnCart(team, ownerOf(pid), cargo.cart.type, x, y, squad);
      fill(this.sim.cargo({ cart: c })!.slots.map((s) => ({ ...s, cap: Infinity })), cargo.cart as Bundle);
    }
    const online = this.players.get(pid)!.online;
    if (!online) {
      const e = this.entry(side);
      this.bots.set(squad, { kind: 'hold', x: (e.x0 + e.x1) / 2, y: (e.y0 + e.y1) / 2, radius: HOLD_RADIUS * 2 });
    }
    const msg: ServerMsg | null = online ? { t: 'welcome', v: NET_VERSION, region: this.region.id, you: { id: pid, team }, squads: this.squadsOf(pid), tick: this.currentTick, quota: this.quota() } : null;
    return { squad, msg };
  }

  /** W-60: the player's fighters across all regions now (the DO reads D1); the soul gate counts on it. */
  setArmy(pid: number, n: number): void {
    this.armies.set(pid, n);
  }

  /** W-62: a welcomed player's guide (his save from the DO): the message to send him, null when there is none here. */
  startGuide(pid: number, save: GuideSave | null): ServerMsg | null {
    const p = this.players.get(pid), owner = `p:${pid}`;
    if (!p) return null;
    // his whole army (D1, set by the DO), else his fighters on this field (as the soul gate counts)
    const army = this.armies.get(pid) ?? this.snap.units.filter((u) => u.state !== 'dead' && this.owners[u.squad] === owner && !u.cls.startsWith('civ_')).length;
    return this.guide.start(pid, p.team, save, army, this.snap);
  }

  /** W-65: a welcomed player's story here (his save from the DO): the message to send him, null when there is none. */
  startStory(pid: number, save: StorySave | null): ServerMsg | null {
    const p = this.players.get(pid);
    return p ? this.stories.start(pid, p.team, save) : null;
  }

  /** W-65: his choice at the story's open choice step (told and stored with the next tick). */
  storyChoose(pid: number, option: string): void {
    this.stories.choose(pid, option, this.snap);
  }

  /** W-65: a welcomed player's random encounters here (his save from the DO): the message to send him. */
  startEncounters(pid: number, save: EncSave | null): ServerMsg | null {
    const p = this.players.get(pid);
    return p ? this.encounters.start(pid, p.team, save) : null;
  }

  /** W-65: his choice at the open encounter (told and stored with the next tick). */
  encounterChoose(pid: number, option: string): void {
    this.encounters.choose(pid, option, this.snap);
  }

  /** Dev /stats (scripts/war/play-smoke.mjs): the neutral side as the server holds it (lairs, guardians, claim points). */
  wild() {
    const s = this.snap;
    return {
      lairs: (s.lairs ?? []).map((l) => ({ id: l.id, kind: l.kind, state: l.state, alive: l.alive })),
      bosses: (s.bosses ?? []).map((b) => ({ id: b.id, state: b.state, hp: Math.round(b.hp) })),
      claims: (s.claims ?? []).map((c) => ({ id: c.id, state: c.state, team: c.team, progress: c.progress })),
    };
  }

  /** M4: what the world map shows of this region (alliances 0..3): live men, claim points held, claims in progress. */
  summary(): Summary {
    const n = ALLIANCES, claims = Array<number>(n).fill(0), channel = Array<number>(n).fill(0);
    for (const c of this.snap.claims ?? []) {
      if (c.state === 'claimed' && c.team >= 0 && c.team < n) claims[c.team]++;
      const t = c.squad >= 0 ? this.teams[c.squad] : undefined;
      if ((c.state === 'channel' || c.state === 'contested' || c.taking) && t !== undefined && t < n) channel[t]++;
    }
    const out: Summary = { live: this.live.slice(0, n), claims, channel };
    // M7f: its landmark, favour and prestige per alliance, a ruined town
    const lm = this.snap.landmark;
    if (lm) {
      const bs = this.snap.bosses ?? [];
      const guardian = bs.some((b) => b.state !== 'slain' && b.state !== 'away') ? 'alive' : bs.some((b) => b.state === 'away') ? 'away' : 'slain';
      const left = bs.filter((b) => b.respawnIn !== undefined).map((b) => b.respawnIn!);
      out.landmark = {
        id: lm.id, holder: lm.holder >= 0 && lm.holder < n ? lm.holder : -1, guardian, ...(guardian !== 'alive' && left.length ? { back: Math.ceil(Math.min(...left) / 600) } : {}),
        state: lm.state, hp: Math.round(lm.hp * 100) / 100, garrisoned: lm.garrisoned,
      };
    }
    // W-61: the best town level per alliance (season score an hour)
    const tl = Array<number>(n).fill(0);
    for (const t of this.snap.townLevels ?? []) if (t.team >= 0 && t.team < n) tl[t.team] = Math.max(tl[t.team], t.level);
    if (tl.some((v) => v > 0)) out.town = tl;
    if (this.region.prebuilt?.length) {
      const pr = Array.from({ length: n }, (_, t) => Math.round(this.sim.prestige(t) * 100) / 100);
      if (pr.some((v) => v > 0)) out.prestige = pr;
      if ((this.snap.towns ?? []).some((t) => t.claim >= 0 && t.ruined)) out.ruined = true;
    }
    return out;
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
   * a site of his team to cancel, upgrade or demolish, points inside the region); the sim checks placement, stock and the rest.
   */
  order(pid: number, o: NetOrder): OrderError | null {
    const p = this.players.get(pid);
    if (!p?.online) return 'notJoined';
    const me = ownerOf(pid);
    const squad = 'squad' in o ? o.squad : undefined;
    if (squad !== undefined && this.owners[squad] !== me) return 'notOwner';
    // W-53: every man named must be his (in any of his squads), as the last snapshot shows him
    if (o.units?.some((id) => { const u = this.snap.units[id]?.id === id ? this.snap.units[id] : this.snap.units.find((x) => x.id === id); return !u || this.owners[u.squad] !== me; })) return 'notOwner';
    if (squad === undefined && o.kind !== 'cancelSite' && o.kind !== 'placeBuilding' && o.kind !== 'placeWall' && o.kind !== 'placeBridge' && o.kind !== 'upgrade' && o.kind !== 'demolish' && o.kind !== 'craft' && o.kind !== 'cancelCraft' && o.kind !== 'fortify') return 'bad';
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
      case 'man': {
        // micro: a living man of that squad, as the last snapshot shows him
        const u = this.snap.units[o.unit]?.id === o.unit ? this.snap.units[o.unit] : this.snap.units.find((x) => x.id === o.unit);
        if (!u || u.squad !== o.squad || u.state === 'dead') return 'badTarget';
        break;
      }
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
      case 'demolish':
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
      case 'claimRegion': {
        // W-64: a pact or truce with the point's holder forbids taking it
        const holder = this.snap.claims?.[o.point]?.team ?? -1, pact = holder >= 0 && holder !== p.team ? this.pactWith(p.team, holder) : null;
        if (pact) return (this.refusal = `A ${pact} with ${ALLIANCE_LIST[holder]?.name ?? 'its holder'} is in force: its claim points may not be taken`), 'atPeace';
        break;
      }
    }
    // W-63: building on a settlement's ground: its lord off others' plots, a citizen on his own plot
    const why = this.groundRefusal(pid, p.team, o);
    if (why) return (this.refusal = why), 'notYourGround';
    if (o.kind === 'placeBuilding' && (o.type === 'camp' || o.type === 'fort')) this.pendingCamps.push({ pid, team: p.team, type: o.type, x: o.x, y: o.y, tick: this.currentTick });
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
   * with room for it, else the maker's pack, else the team's home strongroom in the region. Its uid is the event's key
   * (`c:<key>`).
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
    // no chest with room: the maker carries it in his pack (the stash lists packs)
    const maker = e.pid ? this.sim.cargo({ persons: [e.pid] }) : null;
    if (maker && maker.owner === e.owner && !fill(maker.slots, { lots: [], items: [e.item] }).items.length) return;
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

  /**
   * A dev helper for the player's team (DEV_AUTH only): goods into its home strongroom, an influence anchor, a squad at
   * a point (his own when of his team, else a bot squad that holds there), or ticks stepped at once (the next tick
   * sends the frame; events of the skipped ticks come with it).
   */
  dev(pid: number, m: DevMsg): OrderError | null {
    if (!this.allowDev) return 'forbidden';
    const p = this.players.get(pid);
    if (!p) return 'notJoined';
    if (m.op === 'stock') this.sim.addStock(p.team, m.res, m.n);
    else if (m.op === 'claim') this.sim.claim(p.team, m.x, m.y, m.r);
    else if (m.op === 'spawn') {
      if (!isClassId(m.cls) || m.team >= this.per.length) return 'bad';
      const mine = m.team === p.team, at = { x: Math.max(1, Math.min(this.region.w - 2, m.x)), y: Math.max(1, Math.min(this.region.h - 2, m.y)) };
      const id = this.spawn(mine ? ownerOf(pid) : 'bot', m.team, { cls: m.cls, count: m.count }, at);
      if (!mine) this.bots.set(id, { kind: 'hold', x: at.x, y: at.y, radius: HOLD_RADIUS });
    } else
      for (let i = 0; i < m.ticks; i++) {
        this.sim.step();
        this.bots.tick();
      }
    return null;
  }

  view(pid: number, r: Rect): void {
    const p = this.players.get(pid);
    if (p) p.cam = r;
  }

  /** Step once; frames per online player, the queued players let in this tick and a finished fight to write back. */
  /** W-61: the taken guard contracts of this region (the DO polls D1). */
  setGuards(list: GuardWatch[]): void {
    this.guards = list.slice();
  }

  /** W-61: the works still open of the alliance whose home this is (sites from the region data). */
  setWorks(team: number, ids: readonly WorkId[]): void {
    const q = ALLIANCE_LIST[team]?.quadrant;
    this.workSites = ids.map((work) => ({ work, team, ...workSite(work, this.region, q) }));
  }

  /**
   * W-61 every LABOUR_EVERY ticks: labour by owner and site (build contracts), whether each watched guard holds his
   * poster's town (enough of his fighters inside its town-level ground), and the alliance's men at each open work site.
   */
  private peace(): Peace | null {
    if (this.snap.tick % LABOUR_EVERY !== 0) return null;
    const secs = LABOUR_EVERY / 10;
    const pidOf = (owner: string | null | undefined) => {
      const m = owner ? /^p:(\d+)$/.exec(owner) : null;
      return m ? Number(m[1]) : null;
    };
    const labour = this.sim.takeLabour().flatMap((l) => {
      const pid = pidOf(l.owner);
      return pid === null ? [] : [{ pid, site: l.site, secs: l.secs }];
    });
    const towns = this.snap.townLevels ?? [];
    const men = this.snap.units.filter((u) => u.state !== 'dead');
    const guards = this.guards.map((g) => {
      const t = towns.find((x) => x.team === g.team);
      const n = t ? men.filter((u) => !u.cls.startsWith('civ_') && pidOf(this.owners[u.squad]) === g.taker && (u.x - t.x) ** 2 + (u.y - t.y) ** 2 <= t.r * t.r).length : 0;
      return { id: g.id, held: n >= g.men, secs };
    });
    const works = this.workSites.map((w) => {
      const by: Record<number, number> = {};
      for (const u of men) {
        const pid = pidOf(this.owners[u.squad]);
        if (pid === null || this.teams[u.squad] !== w.team || (u.x - w.x) ** 2 + (u.y - w.y) ** 2 > WORK_R * WORK_R) continue;
        by[pid] = (by[pid] ?? 0) + secs;
      }
      return { team: w.team, work: w.work, by };
    }).filter((w) => Object.keys(w.by).length);
    return labour.length || guards.length || works.length ? { labour, guards, works } : null;
  }

  tick(now: () => number = () => 0): { frames: Map<number, Uint8Array>; msgs: Map<number, ServerMsg[]>; admitted: Map<number, ServerMsg>; fights: Fight[]; crafted: Crafted[]; bosses: BossSlain[]; sacrilege: number[]; freed: string[]; raided: number[]; captured: { cart: number; from: string; team: number; to: string }[]; souls: SoulClaim[]; faded: string[]; peace: Peace | null; times: TickTimes; guided: GuideDone[]; storied: StoryDone[]; met: EncounterDone[]; wild: WildDeed[]; gathered: [number, TaskMetric, number][]; settle: SettleOut | null; warlord: WarlordNote[] } {
    const t0 = now();
    // M6i: carts' owners before the step (a capture names only the taker)
    const cartWas = new Map((this.snap.sieges ?? []).filter((e) => e.owner !== undefined).map((e) => [e.id, { owner: e.owner!, team: e.team }]));
    this.sim.step();
    this.bots.tick();
    const t1 = now();
    this.snap = this.sim.snapshot();
    // W-72 proposal: the warlords think on this snapshot (their spawns show from the next)
    const warlord = this.warlords ? (this.warlords.setPlayers(this.present()), this.warlords.tick(this.snap)) : [];
    const evs = this.sim.events();
    const crafted = evs.filter((e): e is Crafted => e.kind === 'crafted');
    const bosses = evs.filter((e): e is BossSlain => e.kind === 'bossSlain');
    // M7f: a temple or shrine razed: the razer's alliance pays (the world)
    const sacrilege = evs.flatMap((e) => (e.kind === 'razed' && e.sacrilege && e.by >= 0 && e.by < ALLIANCES ? [e.by] : []));
    const captured = evs.flatMap((e) => (e.kind === 'cartCaptured' && cartWas.has(e.cart) ? [{ cart: e.cart, from: cartWas.get(e.cart)!.owner, team: cartWas.get(e.cart)!.team, to: e.owner }] : []));
    for (const e of crafted) if (e.what === 'craft') this.deposit(e);
    // M7e: a landmark boss's rare good falls into the pile with its gear (origin: this region)
    // W-62: slain while its region's boss wake runs: its rare goods WAKE.loot times over
    const loot = this.worldEvents.some((x) => x.kind === 'bossWake') ? WAKE.loot : 1;
    for (const e of bosses) this.sim.dropPile(e.x ?? this.region.w / 2, e.y ?? this.region.h / 2, bossGoods(e.boss).map((g) => ({ r: g.r, n: g.n * loot, o: this.region.id })), bossItems(this.region.id, this.run, e));
    // M5e: holding buildings raided or fallen this tick: their captives go free (the DO writes it)
    const raided = evs.flatMap((e) => (e.kind === 'raid' ? [e.building] : []));
    // W-68: named souls that faded or the wild took (the DO marks them gone)
    const faded = evs.flatMap((e) => ((e.kind === 'soulFaded' || e.kind === 'soulLost') && e.pid ? [e.pid] : []));
    for (const e of evs) if (e.kind === 'raid' && e.by !== undefined && e.by !== e.team) this.stormed.add(e.by);
    const freed = this.unmend(new Set(crafted.filter((e) => e.what !== 'craft').map((e) => e.item.uid)));
    this.live = this.per.map(() => 0);
    for (const s of this.snap.squads) {
      this.owners[s.id] = s.owner;
      this.teams[s.id] = s.team;
    }
    // W-62 E7; a load brought home also closes the guide's haul step, as offline (his gatherers fill a store)
    for (const pid of this.gather.step(this.snap.units, (sq) => this.owners[sq])) this.guide.mark(pid, 'haul');
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
    let vision: TeamVision | null = null;
    if (this.online() > 0) {
      vision = this.vision(this.sim, this.snap);
      const view = { ...this.snap, units: wire };
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
    const msgs = this.economy();
    // W-60: souls claimed (the DO writes the new men) or refused, told to the player who went for him
    const souls: SoulClaim[] = [];
    const tell = (pid: number, m: ServerMsg) => (msgs.get(pid) ?? msgs.set(pid, []).get(pid)!).push(m);
    for (const e of evs) {
      if (e.kind !== 'soulClaimed' && e.kind !== 'soulRefused') continue;
      const m = /^p:(\d+)$/.exec(e.owner), pid = m ? Number(m[1]) : null;
      if (pid === null) continue;
      if (e.kind === 'soulClaimed') {
        souls.push({ pid, person: e.person, squad: e.squad, unit: e.unit });
        if (this.armies.has(pid)) this.armies.set(pid, this.armies.get(pid)! + 1);
        if (this.players.get(pid)?.online) tell(pid, { t: 'soul', state: 'claimed', soul: e.soul, squad: e.squad, pid: e.person.id, cls: e.person.hero.cls, level: e.person.hero.level, name: e.person.hero.name });
      } else if (this.players.get(pid)?.online) tell(pid, { t: 'soul', state: 'refused', soul: e.soul, squad: e.squad, have: e.have });
    }
    // W-62: guide steps done (the DO pays and stores them), told to the player
    const g = this.guide.tick(this.snap, evs);
    for (const [pid, m] of g.msgs) if (this.players.get(pid)?.online) tell(pid, m);
    // W-65: story steps done (the DO stores and pays them), told to the player
    const st = this.stories.tick(this.snap, evs);
    for (const [pid, m] of st.msgs) if (this.players.get(pid)?.online) tell(pid, m);
    // W-65: random encounters (the DO stores and pays them), told to the player
    const en = this.encounters.tick(this.snap, evs);
    for (const [pid, m] of en.msgs) if (this.players.get(pid)?.online) tell(pid, m);
    // W-67: mob FX events (a beast's burst, a lair's cry, a pack scattering) to the players whose camera rect holds them
    const mobFx = evs.filter(isMobFx);
    if (mobFx.length) for (const p of this.players.values()) {
      if (!p.online) continue;
      const r = interestRect(p.cam), ev = mobFx.filter((e) => !r || (e.x >= r.x0 && e.x <= r.x1 && e.y >= r.y0 && e.y <= r.y1));
      if (ev.length) tell(p.pid, { t: 'mobFx', ev });
    }
    // world-fill: hidden quest events to the player whose quest it is
    const secretEv = evs.filter((e): e is SecretEvent => e.kind === 'secret');
    for (const e of secretEv) {
      const m = /^p:(\d+)$/.exec(e.owner), pid = m ? Number(m[1]) : null;
      if (pid !== null && this.players.get(pid)?.online) tell(pid, { t: 'secret', ev: [e] });
    }
    for (const e of evs) if (e.kind === 'chiefSlain' && e.by >= 0) for (const p of this.players.values()) if (p.online && p.team === e.by) tell(p.pid, { t: 'secret', ev: [e] });
    // W-67: guardian events to the players whose team sees the guardian (where it stands, or fell) or the struck patch
    const bossEv = evs.filter(isBossEvent);
    if (bossEv.length && vision) for (const p of this.players.values()) {
      if (!p.online) continue;
      const v = vision, sees = (x: number, y: number) => v.sees(p.team, x, y);
      const ev = bossEv.filter((e) => {
        if (e.kind === 'wardenStrike') return sees(e.x + e.w / 2, e.y + e.h / 2) || sees(e.x, e.y) || sees(e.x + e.w, e.y + e.h);
        const b = this.snap.bosses?.find((x) => x.id === e.boss), at = e.kind === 'bossSlain' && e.x !== undefined && e.y !== undefined ? { x: e.x, y: e.y } : b;
        return !!at && seesBoss(this.snap, v, p.team, at.x, at.y);
      });
      if (ev.length) tell(p.pid, { t: 'bossEv', ev });
    }
    // W-72 proposal: warlord notes; a raid's warning and the raid itself to the target team only
    if (warlord.length) for (const p of this.players.values()) {
      if (!p.online) continue;
      const ev = warlord.filter((e) => e.team === undefined || e.team === p.team);
      if (ev.length) tell(p.pid, { t: 'warlords', ev });
    }
    // W-63: camps to found, attacks on settlements; messages owed since the last tick (a banner changed)
    const settle = this.settleTick();
    for (const [pid, ms] of this.later) if (this.players.get(pid)?.online) for (const m of ms) tell(pid, m);
    this.later.clear();
    this.lastTick = this.snap.tick;
    return { frames, msgs, admitted, fights, crafted, bosses, sacrilege, freed, raided, captured, souls, faded, guided: g.done, storied: st.done, met: en.done, wild: wildDeeds(this.snap, evs, this.wildSeen), peace: this.peace(), gathered: tick % LABOUR_EVERY === 0 ? this.gather.drain() : [], settle, warlord, times: { stepMs: t1 - t0, snapMs: t2 - t1, netMs: now() - t2 } };
  }

  /**
   * The economy view per online player (src/war/net/economy.ts): his team's influence and the store at hand when they changed, and every
   * NODES_EVERY ticks (or at once after a join) the resource nodes his team sees that changed.
   */
  private economy(): Map<number, ServerMsg[]> {
    const out = new Map<number, ServerMsg[]>();
    const on = [...this.players.values()].filter((p) => p.online && p.feed);
    if (!on.length) return out;
    const infl = this.sim.influence();
    let nodes: ReturnType<WarBuildSim['resourceNodes']> | null = null;
    let wild: ServerMsg | null = null, wildKey: string | null = null;
    let lords: ServerMsg | null = null, lordKey: string | null = null;
    const push = (pid: number, m: ServerMsg) => (out.get(pid) ?? out.set(pid, []).get(pid)!).push(m);
    for (const p of on) {
      const feed = p.feed!;
      let c = this.inflRuns.get(p.team);
      if (c?.v !== infl.version) this.inflRuns.set(p.team, (c = { v: infl.version, runs: encodeInfluence(infl.mask, p.team) }));
      const r = feed.influence(c.runs);
      if (r) push(p.pid, { t: 'influence', team: p.team, w: infl.w, h: infl.h, v: infl.version, runs: r });
      // W-39: his team's fog grid when it changed (the shroud; the snapshot is already filtered by it)
      const fg = this.sim.teamGrid(p.team);
      if (feed.fog(p.team, fg.version)) {
        let fc = this.fogRuns.get(p.team);
        if (fc?.v !== fg.version) this.fogRuns.set(p.team, (fc = { v: fg.version, runs: encodeFog(fg.state) }));
        push(p.pid, { t: 'fog', team: p.team, w: fg.w, h: fg.h, cell: fg.cell, v: fg.version, runs: fc.runs });
      }
      // W-60: the store his men stand next to, only it (src/war/net/economy.ts storeByMen)
      const mine = new Set(this.squadsOf(p.pid));
      const g0 = feed.stock(storeByMen(this.snap, p.team, this.snap.units.filter((u) => mine.has(u.squad) && u.state !== 'dead')));
      if (g0) push(p.pid, { t: 'stock', team: p.team, ...g0 });
      // W-61: his team's town level here, when it changed
      const town = this.snap.townLevels?.find((t) => t.team === p.team) ?? null, tk = JSON.stringify(town);
      if (this.townSent.get(p.pid) !== tk) (this.townSent.set(p.pid, tk), push(p.pid, { t: 'town', team: p.team, town }));
      // the players whose men are his friends (yellow bars, ../../src/war/view/microRules.ts); on join and when it changed
      if (!this.allySent.has(feed) || this.snap.tick % WILD_EVERY === 0) {
        const players = this.alliesOf(p.pid), k = players.join(',');
        if (this.allySent.get(feed) !== k) (this.allySent.set(feed, k), push(p.pid, { t: 'allies', players }));
      }
      // W-65: the neutral state (lairs, claim points) the binary frames leave out; on join and when it changed
      if (this.snap.lairs || this.snap.claims || this.snap.roam) {
        if (!this.wildSent.has(feed) || this.snap.tick % WILD_EVERY === 0) {
          wild ??= { t: 'wild', lairs: this.snap.lairs ?? [], claims: this.snap.claims ?? [], ...(this.snap.roam ? { roam: this.snap.roam } : {}) };
          wildKey ??= JSON.stringify(wild);
          if (this.wildSent.get(feed) !== wildKey) (this.wildSent.set(feed, wildKey), push(p.pid, wild));
        }
      }
      // W-72 proposal: the region's warlords (holdings, a raid in warning); on join and when it changed
      if (this.warlords && (!this.lordSent.has(feed) || this.snap.tick % WILD_EVERY === 0)) {
        lords ??= { t: 'warlords', list: this.warlords.snaps() };
        lordKey ??= JSON.stringify(lords);
        if (this.lordSent.get(feed) !== lordKey) (this.lordSent.set(feed, lordKey), push(p.pid, lords));
      }
      if (this.snap.tick % NODES_EVERY && !feed.fresh) continue;
      const g = this.sim.teamGrid(p.team);
      const n = feed.nodes({
        nodes: (nodes ??= this.sim.resourceNodes()),
        sees: (x, y) => this.sim.visibleTo(p.team, x, y),
        explored: (x, y) => {
          const cx = Math.floor(x / g.cell), cy = Math.floor(y / g.cell);
          return cx >= 0 && cy >= 0 && cx < g.w && cy < g.h && g.state[cy * g.w + cx] > 0;
        },
      });
      if (n) push(p.pid, { t: 'nodes', rows: n.rows, ...(n.gone.length ? { gone: n.gone } : {}) });
    }
    return out;
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
      settle: { own: [...this.own], campBy: [...this.campBy], tried: [...this.tried] },
      ...(this.warlords ? { warlords: this.warlords.exportState() } : {}),
    };
  }

  /**
   * A room rebuilt from saveState() after an eviction: the sim resumes exactly where it was saved, every player offline
   * with his squads on the hold AI. `persons`: the D1 rows still deployed here; a man on the field D1 no longer has here
   * (a fight written back after the save) leaves the field unreported.
   */
  static restore(o: RoomOptions, st: RoomState, persons: ReadonlyMap<string, WarPerson>): WarRoom {
    const r = new WarRoom({ ...o, wild: false, roam: false });
    r.sim.importState(st.sim);
    r.bots.importState(st.bots);
    if (st.warlords && r.warlords) r.warlords.importState(st.warlords);
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
    r.own = new Map(st.settle?.own ?? []);
    r.campBy = new Map(st.settle?.campBy ?? []);
    r.tried = new Set(st.settle?.tried ?? []);
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

  // ---------------------------------------------------------------- W-63 shared settlements (./roomSettlements.ts)

  /** The banner the player's men fly here: his settlement's (its lord's alliance); null when he has no tie here. */
  bannerTeam(pid: number): number | null {
    const t = bannerOf(this.settles, pid)?.team ?? null;
    return t !== null && t < this.per.length ? t : null;
  }

  /** The region's settlements (the DO's D1 poll). Towns and squads whose banner changed turn now, in id order (logged orders). */
  setSettlements(list: readonly RoomSettlement[]): void {
    this.settles = [...list].sort((a, b) => a.id - b.id);
    for (const s of this.settles) {
      if (s.team === null || s.team >= this.per.length) continue;
      const t = this.snap.townLevels?.find((x) => x.id === s.centre);
      if (t && t.team !== s.team) this.roomOrder({ kind: 'rebanner', centre: s.centre, team: s.team });
    }
    for (const p of [...this.players.values()].sort((a, b) => a.pid - b.pid)) {
      const want = this.bannerTeam(p.pid) ?? this.own.get(p.pid) ?? p.team;
      if (want === p.team) continue;
      for (const id of this.squadsOf(p.pid)) {
        this.roomOrder({ kind: 'turnSquad', squad: id, team: want });
        this.teams[id] = want;
      }
      p.team = want;
      if (p.enc) p.feed = new EconomyFeed(); // influence and nodes of the new banner
      this.townSent.delete(p.pid);
      if (p.online) this.tellLater(p.pid, { t: 'welcome', v: NET_VERSION, region: this.region.id, you: { id: p.pid, team: want }, squads: this.squadsOf(p.pid), tick: this.currentTick, quota: this.quota() });
    }
  }

  /** W-64: the pacts and truces in force between alliances (the DO's poll). */
  setPacts(list: readonly RoomPact[]): void {
    this.pacts = [...list];
  }

  /** The pact or truce in force between alliances a and b (null: none). */
  pactWith(a: number, b: number): RoomPact['kind'] | null {
    const p = this.pacts.filter((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    return p.some((x) => x.kind === 'pact') ? 'pact' : p.length ? 'truce' : null;
  }

  /**
   * The other players here whose men are friends to player pid's (protocol `allies`): men under his own banner, and
   * under an alliance at peace with it (a pact or truce in force), ascending.
   */
  alliesOf(pid: number): number[] {
    const p = this.players.get(pid);
    if (!p) return [];
    const out = new Set<number>();
    this.owners.forEach((o, id) => {
      const m = /^p:(\d+)$/.exec(o), n = m ? Number(m[1]) : pid, t = this.teams[id];
      if (n !== pid && !out.has(n) && t !== undefined && (t === p.team || this.pactWith(p.team, t))) out.add(n);
    });
    return [...out].sort((a, b) => a - b);
  }

  /** The region's settlements as the player sees them (protocol `settlements`). */
  settlementsFor(pid: number): SettlementNet[] {
    return netOf(this.settles, pid);
  }

  /** Settlement `id`, as known here. */
  settlement(id: number): RoomSettlement | null {
    return this.settles.find((s) => s.id === id) ?? null;
  }

  private tellLater(pid: number, m: ServerMsg): void {
    (this.later.get(pid) ?? this.later.set(pid, []).get(pid)!).push(m);
  }

  /** An order the room itself gives (W-63 turnSquad, rebanner): to the sim at the next step, in the log. */
  private roomOrder(o: Order): void {
    this.sim.order(o);
    this.log.push({ tick: this.currentTick, o });
  }

  /** Why the player may not build there (null: he may): placements on a settlement's ground (./roomSettlements.ts buildRefusal). */
  private groundRefusal(pid: number, team: number, o: NetOrder): string | null {
    if (!this.settles.length) return null;
    let tiles: readonly number[];
    if (o.kind === 'placeBuilding') {
      const d = BUILDINGS[o.type];
      if (!d || d.brazier || d.access === 'ladder') return null; // field pieces before foe walls
      tiles = this.sim.checkPlacement(team, o.type, o.x, o.y, o.rot).tiles;
    } else if (o.kind === 'placeWall') tiles = [...o.points, ...(o.towers ?? []), ...(o.gates ?? [])];
    else if (o.kind === 'placeBridge') tiles = o.points;
    else return null;
    return buildRefusal(this.settles, pid, tiles);
  }

  /**
   * A level-up spend (POST /persons/:id/level) on a man of this room: his living man takes it, baked again (his next
   * fight report writes the attributes and points back). 'absent': no living man of that person here.
   */
  levelUp(id: string, attrs: Partial<Record<AttrId, number>>, skill?: WarSkillId): 'ok' | 'absent' | SpendRefusal {
    const p = this.sim.person(id);
    if (!p) return 'absent';
    const q = spendLevel(p, attrs, skill);
    if (typeof q === 'string') return q;
    this.sim.setPerson(q);
    return 'ok';
  }

  /** At least SETTLE.presence of the player's fighters stand on settlement `id`'s ground (terms may be offered). */
  presence(pid: number, id: number): boolean {
    const s = this.settlement(id);
    if (!s) return false;
    const me = ownerOf(pid);
    const n = this.snap.units.filter((u) => u.state !== 'dead' && !u.cls.startsWith('civ_') && this.owners[u.squad] === me && (u.x - s.x) ** 2 + (u.y - s.y) ** 2 <= s.r * s.r).length;
    return n >= SETTLE.presence;
  }

  /** Each settlement's town level (its centre's; 0: gone), whether its lord or a citizen has men on its ground, its pieces. */
  settlementReports(): SettleReport[] {
    return this.settles.map((s) => {
      const people = new Set(s.members.filter((m) => m.role !== 'garrison').map((m) => ownerOf(m.pid)));
      const tended = this.snap.units.some((u) => u.state !== 'dead' && people.has(this.owners[u.squad]) && (u.x - s.x) ** 2 + (u.y - s.y) ** 2 <= s.r * s.r);
      return { id: s.id, level: this.snap.townLevels?.find((t) => t.id === s.centre)?.level ?? 0, tended, persist: { pieces: piecesOf(this.snap, s) } };
    });
  }

  /** The goods in the settlement's stores now. */
  storeGoods(id: number): Record<string, number> {
    const s = this.settlement(id), out: Record<string, number> = {};
    if (!s) return out;
    for (const b of storesOf(this.snap, s)) {
      const at = this.sim.cargo({ building: b.id });
      for (const [k, n] of Object.entries(at ? contents(at.slots).goods : {})) out[k] = (out[k] ?? 0) + n;
    }
    return out;
  }

  /** Take `goods` out of the settlement's stores (all or nothing). */
  takeStore(id: number, goods: Record<string, number>): boolean {
    const s = this.settlement(id), want = Object.entries(goods).filter(([, n]) => n > 1e-9);
    if (!want.length) return true;
    if (!s) return false;
    const have = this.storeGoods(id);
    if (want.some(([k, n]) => (have[k] ?? 0) + 1e-6 < n)) return false;
    const left = Object.fromEntries(want);
    for (const b of storesOf(this.snap, s)) {
      const at = this.sim.cargo({ building: b.id });
      if (!at) continue;
      const g = contents(at.slots).goods, part: Record<string, number> = {};
      for (const [k, n] of Object.entries(left)) {
        const t = Math.min(n, g[k] ?? 0);
        if (t > 1e-9) (part[k] = t), (left[k] = n - t);
      }
      if (Object.keys(part).length) takeOut(at.slots, part);
    }
    this.snap = this.sim.snapshot();
    return true;
  }

  /** Goods back into the settlement's first store (a levy that failed). */
  putStore(id: number, goods: Record<string, number>): void {
    const s = this.settlement(id), b = s ? storesOf(this.snap, s)[0] : undefined;
    const at = b ? this.sim.cargo({ building: b.id }) : null;
    if (at) fill(at.slots.map((x) => ({ ...x, cap: Infinity })), { lots: Object.entries(goods).map(([r, n]) => ({ r: r as never, n, o: this.region.id })), items: [] });
    this.snap = this.sim.snapshot();
  }

  /**
   * A fresh field: what persists of a settlement laid down again for `team` (its ground claimed, each piece placed and
   * finished at its hp share, store goods back in); pieces whose tiles are blocked now are dropped. The new centre id
   * (null: its centre could not be laid down).
   */
  restorePieces(team: number, s: { x: number; y: number; r: number }, pieces: readonly Piece[]): number | null {
    if (!pieces.length || team >= this.per.length) return null;
    this.sim.claim(team, s.x, s.y, s.r);
    const before = new Set((this.sim.snapshot().buildings ?? []).map((b) => b.id));
    for (const p of pieces) if (BUILDINGS[p.type]) this.sim.order({ kind: 'placeBuilding', team, type: p.type, x: p.x, y: p.y, rot: p.rot });
    this.sim.step();
    const fresh = (this.sim.snapshot().buildings ?? []).filter((b) => !before.has(b.id) && b.team === team);
    let centre: number | null = null;
    for (const [i, p] of pieces.entries()) {
      const b = fresh.find((x) => x.type === p.type && Math.abs(x.x - p.x) <= 1 && Math.abs(x.y - p.y) <= 1);
      if (!b) continue;
      this.sim.finishSite(b.id);
      if (p.hp < 1) this.sim.damageBuilding(b.id, b.maxHp * (1 - Math.max(0.05, p.hp)));
      const at = p.goods ? this.sim.cargo({ building: b.id }) : null;
      if (at) fill(at.slots, { lots: Object.entries(p.goods!).map(([r, n]) => ({ r: r as never, n, o: this.region.id })), items: [] });
      if (i === 0 && (p.type === 'camp' || p.type === 'fort')) centre = b.id;
    }
    this.snap = this.sim.snapshot();
    return centre;
  }

  /** Every tick: who placed new camp and fort sites; every SETTLE_EVERY: finished camps to found, attacks on settlements. */
  private settleTick(): SettleOut | null {
    const snap = this.snap, tick = snap.tick;
    if (this.pendingCamps.length) {
      for (const b of snap.buildings ?? []) {
        if ((b.type !== 'camp' && b.type !== 'fort') || b.pre || this.campBy.has(b.id)) continue;
        const i = this.pendingCamps.findIndex((c) => c.team === b.team && c.type === b.type && Math.abs(c.x - b.x) <= 3 && Math.abs(c.y - b.y) <= 3);
        if (i >= 0) this.campBy.set(b.id, this.pendingCamps.splice(i, 1)[0].pid);
      }
      this.pendingCamps = this.pendingCamps.filter((c) => tick - c.tick < SETTLE_EVERY); // refused placements
    }
    if (tick % SETTLE_EVERY) return null;
    const out: SettleOut = { found: [], attacks: [], taking: [] };
    // held claim points being taken (the channel running, or the attackers at the banner held off): the holder hears it
    for (const c of snap.claims ?? []) {
      if (!c.taking || (c.taking === 'channel' && c.progress <= 0) || c.by === undefined || c.by < 0) continue;
      const k = `${c.id}:${c.by}`, at = this.takeAt.get(k);
      if (at !== undefined && tick - at < ATTACK_COOLDOWN) continue;
      this.takeAt.set(k, tick);
      out.taking.push({ point: c.id, holder: c.team, by: c.by });
    }
    if (!this.isHome)
      for (const b of snap.buildings ?? []) {
        if ((b.type !== 'camp' && b.type !== 'fort') || b.pre || (b.state !== 'done' && b.state !== 'damaged') || this.tried.has(b.id)) continue;
        const lord = this.campBy.get(b.id);
        if (lord === undefined) continue;
        this.tried.add(b.id);
        if (this.settles.some((s) => s.centre === b.id || (b.x - s.x) ** 2 + (b.y - s.y) ** 2 <= s.r * s.r)) continue; // a camp of a settlement
        out.found.push({ centre: b.id, x: b.x, y: b.y, lord });
      }
    // attacks: a settlement's pieces or its people's men there lost hp while a foe player's men struck near
    const seen = new Map<string, number>();
    for (const s of this.settles) {
      if (s.team === null) continue;
      const people = new Set(s.members.map((m) => ownerOf(m.pid)));
      const near = (x: number, y: number, k = 0) => (x - s.x) ** 2 + (y - s.y) ** 2 <= (s.r + k) ** 2;
      let hurt = false;
      for (const b of ownBuildings(snap, s)) {
        const k = `b${b.id}`, was = this.hpSeen.get(k);
        if (was !== undefined && b.hp < was - 1e-6) hurt = true;
        seen.set(k, b.hp);
      }
      for (const u of snap.units) {
        if (!people.has(this.owners[u.squad]) || !near(u.x, u.y)) continue;
        const k = `u${u.id}`, hp = u.state === 'dead' ? 0 : u.hp, was = this.hpSeen.get(k);
        if (was !== undefined && hp < was - 1e-6) hurt = true;
        if (u.state !== 'dead') seen.set(k, hp);
      }
      if (!hurt) continue;
      const by = new Set<number>();
      for (const u of snap.units) {
        if (u.state !== 'attack' || this.teams[u.squad] === s.team || !near(u.x, u.y, 12)) continue;
        const m = /^p:(\d+)$/.exec(this.owners[u.squad] ?? ''), pid = m ? Number(m[1]) : null;
        if (pid !== null && !s.members.some((x) => x.pid === pid)) by.add(pid);
      }
      for (const pid of [...by].sort((a, b) => a - b)) {
        const k = `${s.id}:${pid}`, at = this.attackAt.get(k);
        if (at !== undefined && tick - at < ATTACK_COOLDOWN) continue;
        this.attackAt.set(k, tick);
        out.attacks.push({ by: pid, victim: s.id });
      }
    }
    this.hpSeen = seen;
    return out.found.length || out.attacks.length || out.taking.length ? out : null;
  }
}
