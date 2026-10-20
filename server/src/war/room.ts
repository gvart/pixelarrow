/**
 * WarRoom: the live, server-authoritative region (W-05..W-07), free of Durable Object APIs so tests drive it directly.
 * WarRegionDO (./regionDO.ts) owns one, feeds it socket messages and calls tick() at 10 Hz.
 *
 *  - join: a player enters with an army (squads of <= MAX_SQUAD) on its alliance's entry; over the alliance's live
 *    soldier quota (W-06) the join waits in a FIFO line and is let in once dead men free room. A player whose squads
 *    are still in the region rejoins them (no new spawn, no quota check).
 *  - order: only for the player's own squads (squad owner `p:<id>` in the sim); attack targets a foe squad.
 *  - leave: the player's squads stay and hold where they stand with the bot hold AI (W-07); they keep counting.
 *  - tick: steps the sim, then builds one binary frame per online player from what it may see (src/war/net).
 */
import { createSim } from '../../../src/war/sim';
import { createBots, type Bots } from '../../../src/war/sim/bots';
import { isClassId } from '../../../src/data/classes';
import { DeltaEncoder } from '../../../src/war/net/codec';
import { VisionMap, visibleTo, type Rect, type TeamVision } from '../../../src/war/net/interest';
import { ALLIANCES, KEYFRAME_EVERY, MAX_SQUADS, NET_VERSION, splitQuota, type JoinMsg, type NetOrder, type OrderError, type Quota, type Refusal, type ServerMsg } from '../../../src/war/net/protocol';
import type { RegionData, ShotSnap, Snapshot, SquadId, WarBuildSim } from '../../../src/war/types';

const SIDES = ['N', 'E', 'S', 'W'] as const;
/** Hold AI radius for an offline player's squads (tiles). */
const HOLD_RADIUS = 10;

export const ownerOf = (pid: number) => `p:${pid}`;

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

interface Waiting { pid: number; join: JoinMsg }

export interface TickTimes { stepMs: number; snapMs: number; netMs: number }

export type JoinResult = { msg: ServerMsg; admitted: boolean };

export class WarRoom {
  readonly sim: WarBuildSim;
  readonly bots: Bots;
  readonly region: RegionData;
  readonly per: number[];
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
  /** Orders applied, with their tick (determinism checks, later a replay log). */
  readonly log: { tick: number; o: NetOrder }[] = [];

  constructor(o: RoomOptions) {
    this.region = o.region;
    this.sim = createSim(o.region, o.seed);
    this.bots = createBots(this.sim);
    this.per = o.quotas ?? splitQuota(o.cap, ALLIANCES);
    this.live = this.per.map(() => 0);
    const radius = new VisionMap(o.region.w, o.region.h);
    this.vision = o.vision ?? ((_sim, snap) => (radius.build(snap), radius));
    this.keyEvery = o.keyframeEvery ?? KEYFRAME_EVERY;
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

  /** A join (or a reinforcement by a player already in). `sessionPid`: the player the socket was authenticated as. */
  join(sessionPid: number, m: JoinMsg): JoinResult {
    const refuse = (reason: Refusal, detail?: string): JoinResult => ({ msg: { t: 'refused', reason, detail }, admitted: false });
    if (m.v !== NET_VERSION) return refuse('version', `server speaks v${NET_VERSION}`);
    if (m.region !== this.region.id) return refuse('region', `this room is ${this.region.id}`);
    if (m.playerId !== sessionPid) return refuse('player', 'playerId is not the signed-in player');
    if (m.team >= this.per.length) return refuse('team');
    const p = this.players.get(sessionPid);
    if (p && p.team !== m.team) return refuse('team', `already in alliance ${p.team}`);
    for (const g of m.army) if (!isClassId(g.cls)) return refuse('army', `unknown class ${g.cls}`);
    const have = this.squadsOf(sessionPid);
    // a rejoin: the squads still stand here (offline hold); they go back under the player's control
    if (p && !p.online && have.length) return { msg: this.admit(sessionPid, m.team, null), admitted: true };
    if (have.length + m.army.length > MAX_SQUADS) return refuse('squads', `at most ${MAX_SQUADS} squads per player`);
    const need = m.army.reduce((a, g) => a + g.count, 0);
    if (need > this.per[m.team]) return refuse('quota', `army of ${need} is bigger than the alliance quota ${this.per[m.team]}`);
    this.queue = this.queue.filter((w) => w.pid !== sessionPid);
    if (this.queue.some((w) => w.join.team === m.team) || this.live[m.team] + need > this.per[m.team]) {
      this.queue.push({ pid: sessionPid, join: m });
      const pos = this.queue.filter((w) => w.join.team === m.team).length;
      return { msg: { t: 'queued', reason: 'quota', pos, need, quota: this.quota() }, admitted: false };
    }
    return { msg: this.admit(sessionPid, m.team, m), admitted: true };
  }

  private admit(pid: number, team: number, m: JoinMsg | null): ServerMsg {
    let p = this.players.get(pid);
    if (!p) this.players.set(pid, (p = { pid, team, online: true, cam: null, enc: null, sinceKey: -1, bytes: 0 }));
    p.online = true;
    if (!p.enc) { p.enc = new DeltaEncoder(); p.sinceKey = -1; }
    for (const id of this.squadsOf(pid)) this.bots.clear(id);
    if (m) for (const g of m.army) this.spawn(pid, team, g.cls, g.count);
    return { t: 'welcome', v: NET_VERSION, region: this.region.id, you: { id: pid, team }, squads: this.squadsOf(pid), tick: this.currentTick, quota: this.quota() };
  }

  private spawn(pid: number, team: number, cls: string, count: number): SquadId {
    const side = SIDES[team % SIDES.length];
    const e = this.region.entries.find((x) => x.side === side) ?? this.region.entries[0] ?? { x: 0, y: 0, w: this.region.w, h: this.region.h };
    // squads spread over the entry on a 6-tile grid round its centre
    const k = this.spawns++, ox = ((k % 5) - 2) * 6, oy = ((Math.floor(k / 5) % 5) - 2) * 6;
    const x = Math.min(e.x + e.w - 1, Math.max(e.x + 1, e.x + e.w / 2 + ox)), y = Math.min(e.y + e.h - 1, Math.max(e.y + 1, e.y + e.h / 2 + oy));
    const id = this.sim.spawnSquad(ownerOf(pid), team, cls, count, x, y);
    this.owners[id] = ownerOf(pid);
    this.teams[id] = team;
    this.live[team] += count;
    return id;
  }

  /** The socket went away: the squads stay and hold (W-07). */
  leave(pid: number): void {
    const p = this.players.get(pid);
    this.queue = this.queue.filter((w) => w.pid !== pid);
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

  /** Step once; frames per online player and the queued players let in this tick. */
  tick(now: () => number = () => 0): { frames: Map<number, Uint8Array>; admitted: Map<number, ServerMsg>; times: TickTimes } {
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
    for (const u of this.snap.units) if (u.state !== 'dead') {
      const t = this.teams[u.squad];
      if (t !== undefined && t < this.live.length) this.live[t]++;
    }
    const admitted = this.drainQueue();
    const t2 = now();
    const frames = new Map<number, Uint8Array>();
    if (this.online() > 0) {
      const vision = this.vision(this.sim, this.snap);
      const shots = this.snap.shots ?? [];
      const fresh = shots.filter((s: ShotSnap) => s.t0 > this.lastTick);
      for (const p of this.players.values()) {
        if (!p.online || !p.enc) continue;
        const key = p.sinceKey < 0 || p.sinceKey + 1 >= this.keyEvery;
        p.sinceKey = key ? 0 : p.sinceKey + 1;
        const vis = visibleTo(this.snap, vision, ownerOf(p.pid), p.team, p.cam, key ? shots : fresh);
        const f = p.enc.encode({ tick: this.snap.tick, ...vis }, key);
        p.bytes += f.length;
        frames.set(p.pid, f);
      }
    }
    this.lastTick = this.snap.tick;
    return { frames, admitted, times: { stepMs: t1 - t0, snapMs: t2 - t1, netMs: now() - t2 } };
  }

  /** Let waiting joins in, first come first served per alliance, while their alliance has room. */
  private drainQueue(): Map<number, ServerMsg> {
    const out = new Map<number, ServerMsg>();
    const blocked = new Set<number>();
    const rest: Waiting[] = [];
    for (const w of this.queue) {
      const team = w.join.team, need = w.join.army.reduce((a, g) => a + g.count, 0);
      if (blocked.has(team) || this.live[team] + need > this.per[team]) { blocked.add(team); rest.push(w); continue; }
      out.set(w.pid, this.admit(w.pid, team, w.join));
    }
    this.queue = rest;
    return out;
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
