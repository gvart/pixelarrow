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
 *  - tick: steps the sim, then builds one binary frame per online player from what it may see (src/war/net).
 *  - fights (M5e): once men have fought and FIGHT_QUIET ticks pass with no blow struck and no man falling, the sim's
 *    endFight report leaves tick() with a fight id unique to this room instance; the DO writes it to D1 (idempotent).
 *  - state (M5e): saveState() is the whole region: the sim's exact state (sim.exportState: hit points, wounds, orders,
 *    sites and finished buildings, siege, fog, mobs, rng), the bots, players, squad owners, the join line and the fight
 *    in progress; WarRoom.restore rebuilds the room from it after an eviction and it steps on as if never stopped
 *    (players offline: their squads hold where they stand with the hold AI).
 */
import { createSim } from '../../../src/war/sim';
import { createBots, type Bots } from '../../../src/war/sim/bots';
import { isClassId } from '../../../src/data/classes';
import { DeltaEncoder } from '../../../src/war/net/codec';
import { visibleTo, type Rect, type TeamVision } from '../../../src/war/net/interest';
import { ALLIANCES, KEYFRAME_EVERY, MAX_SQUAD, MAX_SQUADS, NET_VERSION, splitQuota, type CheckMsg, type JoinMsg, type NetOrder, type OrderError, type Quota, type Refusal, type ServerMsg } from '../../../src/war/net/protocol';
import type { SimState } from '../../../src/war/sim/state';
import type { BridgePlan, FightReport, Order, PlaceResult, RegionData, ShotSnap, Snapshot, SquadId, WallPlan, WarBuildSim, WarPerson } from '../../../src/war/types';

const SIDES = ['N', 'E', 'S', 'W'] as const;
/** Hold AI radius for an offline player's squads (tiles). */
const HOLD_RADIUS = 10;
/** Ticks a fallen man stays on the wire (the corpse); after that clients forget him (the sim keeps him). */
export const CORPSE_TICKS = 300;
/** Ticks with no blow struck and no man falling that end a fight (M5e write-back). */
export const FIGHT_QUIET = 100;

export const ownerOf = (pid: number) => `p:${pid}`;

/** One squad to spawn: persons (M5e), or `count` fresh men of `cls` (dev joins, restored class squads). */
export interface Group { cls: string; count: number; persons?: WarPerson[] }

/** A fight to write back: `id` is unique per room instance (epoch) and tick. */
export interface Fight { id: string; report: FightReport }

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
  readonly log: { tick: number; o: NetOrder }[] = [];

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

  /** Spawn a squad on the team's entry (or `at`, a restored squad's centre). */
  private spawn(owner: string, team: number, g: Group, at?: { x: number; y: number }): SquadId {
    const side = SIDES[team % SIDES.length];
    const e = this.region.entries.find((x) => x.side === side) ?? this.region.entries[0] ?? { x: 0, y: 0, w: this.region.w, h: this.region.h };
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
      const c = centres.get(id);
      if (c) this.bots.set(id, { kind: 'hold', x: c.x, y: c.y, radius: HOLD_RADIUS });
    }
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
    if (squad === undefined && o.kind !== 'cancelSite' && o.kind !== 'placeBuilding' && o.kind !== 'placeWall' && o.kind !== 'placeBridge' && o.kind !== 'upgrade' && o.kind !== 'craft' && o.kind !== 'cancelCraft') return 'bad';
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < this.region.w && y < this.region.h;
    const allIn = (a?: number[]) => !a || a.every((v, i) => (i % 2 ? v < this.region.h : v < this.region.w) && v >= 0);
    const ownSite = (id: number) => this.snap.buildings?.find((b) => b.id === id)?.team === p.team;
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
        if (!ownSite(o.kind === 'build' ? o.site : o.building)) return 'badTarget';
        break;
    }
    const sent = (squad === undefined && o.kind !== 'cancelSite' ? { ...o, team: p.team } : o) as Order;
    if (squad !== undefined) this.bots.clear(squad);
    this.sim.order(sent);
    this.log.push({ tick: this.currentTick, o });
    return null;
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
  tick(now: () => number = () => 0): { frames: Map<number, Uint8Array>; admitted: Map<number, ServerMsg>; fights: Fight[]; times: TickTimes } {
    const t0 = now();
    this.sim.step();
    this.bots.tick();
    const t1 = now();
    this.snap = this.sim.snapshot();
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
    return { frames, admitted, fights, times: { stepMs: t1 - t0, snapMs: t2 - t1, netMs: now() - t2 } };
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
      sim: this.sim.exportState(), bots: this.bots.exportState(),
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
