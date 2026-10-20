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
 *  - state (M5e): saveState() is a small, bounded record of the region (squads by person id or class and count, their
 *    centres, players, team stock, building sites); WarRoom.restore rebuilds a room from it after an eviction. Hit
 *    points, orders and an unfinished fight are not kept: soldiers come back whole, holding where they stood.
 */
import { createSim } from '../../../src/war/sim';
import { createBots, type Bots } from '../../../src/war/sim/bots';
import { isClassId } from '../../../src/data/classes';
import { DeltaEncoder } from '../../../src/war/net/codec';
import { visibleTo, type Rect, type TeamVision } from '../../../src/war/net/interest';
import { ALLIANCES, KEYFRAME_EVERY, MAX_SQUAD, MAX_SQUADS, NET_VERSION, splitQuota, type JoinMsg, type NetOrder, type OrderError, type Quota, type Refusal, type ServerMsg } from '../../../src/war/net/protocol';
import type { BuildingType, FightReport, RegionData, ResourceKind, ShotSnap, Snapshot, SquadId, WarBuildSim, WarPerson } from '../../../src/war/types';

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

/** The bounded room record kept in DO storage (WarRoom.saveState / restore). */
export interface RoomState {
  v: 1;
  region: string;
  tick: number;
  players: { pid: number; team: number }[];
  squads: { owner: string; team: number; x: number; y: number; cls: string; count: number; pids: string[] }[];
  stock: Record<number, Partial<Record<ResourceKind, number>>>;
  buildings: { type: BuildingType; team: number; x: number; y: number; rot: 0 | 1 }[];
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

interface Waiting { pid: number; join: JoinMsg; groups: Group[] }

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

  /** An order from the player; null when it was taken. */
  order(pid: number, o: NetOrder): OrderError | null {
    const p = this.players.get(pid);
    if (!p?.online) return 'notJoined';
    const me = ownerOf(pid);
    if (this.owners[o.squad] !== me) return 'notOwner';
    if (o.kind === 'attack' && (this.owners[o.target] === undefined || this.teams[o.target] === p.team)) return 'badTarget';
    if (o.kind === 'merge' && (this.owners[o.into] !== me || o.into === o.squad)) return 'notOwner';
    if (o.kind === 'move' && !(o.x >= 0 && o.y >= 0 && o.x < this.region.w && o.y < this.region.h)) return 'bad';
    this.bots.clear(o.squad);
    this.sim.order(o);
    this.log.push({ tick: this.currentTick, o });
    return null;
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

  /** The region as a bounded record for DO storage (RoomState): living squads, players, team stock, building sites. */
  saveState(): RoomState {
    const snap = this.sim.snapshot(); // fresh: squads spawned since the last tick count too
    const sq = new Map<number, { x: number; y: number; n: number; cls: string; pids: string[] }>();
    for (const u of snap.units) {
      if (u.state === 'dead') continue;
      const s = sq.get(u.squad) ?? { x: 0, y: 0, n: 0, cls: u.cls, pids: [] };
      s.x += u.x; s.y += u.y; s.n++;
      if (u.pid) s.pids.push(u.pid);
      sq.set(u.squad, s);
    }
    const squads: RoomState['squads'] = [];
    for (const [id, s] of sq) {
      const owner = this.owners[id], team = this.teams[id];
      if (owner === undefined || team === undefined) continue;
      squads.push({ owner, team, x: +(s.x / s.n).toFixed(2), y: +(s.y / s.n).toFixed(2), cls: s.cls, count: s.n, pids: s.pids });
    }
    const buildings = (snap.buildings ?? [])
      .filter((b) => b.state !== 'destroyed' && !b.bridge && b.attach === undefined)
      .map((b) => ({ type: b.type, team: b.team, x: b.x, y: b.y, rot: b.rot }));
    const players = [...this.players.values()].map((p) => ({ pid: p.pid, team: p.team }));
    return { v: 1, region: this.region.id, tick: snap.tick, players, squads, stock: snap.stock ?? {}, buildings };
  }

  /**
   * A room rebuilt from saveState() after an eviction: squads respawn at their centres (persons from `persons`, the D1
   * rows still deployed here; men gone meanwhile are left out), every player offline with his squads on the hold AI,
   * team stock back, buildings back as planned sites where they still fit (the sim has no way to restore a finished
   * one yet). An unfinished fight starts afresh.
   */
  static restore(o: RoomOptions, st: RoomState, persons: ReadonlyMap<string, WarPerson>): WarRoom {
    const r = new WarRoom(o);
    for (const p of st.players) r.players.set(p.pid, { pid: p.pid, team: p.team, online: false, cam: null, enc: null, sinceKey: -1, bytes: 0 });
    for (const s of st.squads) {
      const people = s.pids.map((id) => persons.get(id)).filter((x): x is WarPerson => !!x);
      if (s.pids.length && !people.length) continue;
      const g: Group = people.length ? { cls: s.cls, count: people.length, persons: people } : { cls: s.cls, count: s.count };
      const id = r.spawn(s.owner, s.team, g, s);
      r.bots.set(id, { kind: 'hold', x: s.x, y: s.y, radius: HOLD_RADIUS });
    }
    for (const [team, res] of Object.entries(st.stock)) for (const [k, n] of Object.entries(res)) if (n) r.sim.addStock(Number(team), k as ResourceKind, n);
    for (const b of st.buildings) if (r.sim.checkPlacement(b.team, b.type, b.x, b.y, b.rot).ok) r.sim.order({ kind: 'placeBuilding', team: b.team, type: b.type, x: b.x, y: b.y, rot: b.rot });
    r.snap = r.sim.snapshot();
    return r;
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
