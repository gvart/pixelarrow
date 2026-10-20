/**
 * Main-thread side of the sim worker: sends spawns and orders, keeps the last two Snapshots and
 * interpolates unit positions between them (rendering runs one 10 Hz tick behind).
 */
import type { Behaviour } from '../sim/bots';
import type { BridgeOrder, BridgePlan, BuildingSnap, BuildingType, FogGrid, InfluenceMap, NodeSnap, Order, PlaceResult, RegionData, ResourceKind, Snapshot, SquadSnap, UnitSnap, WallOrder, WallPlan } from '../types';
import type { ToWorker } from './worker';

export interface DrawUnit { u: UnitSnap; x: number; y: number; facing: number; team: number }

export class SimClient {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private old = new Map<number, UnitSnap>();
  /** The newest snapshot as the player's team (0) knows it under the fog (W-39; `full` while fog is off). */
  cur: Snapshot | null = null;
  /** The newest snapshot, everything in it (dev tallies). */
  full: Snapshot | null = null;
  /** Team 0's fog grid (latest version) and the foe buildings as it last saw them; fog off (dev): no hiding. */
  fog: FogGrid | null = null;
  seen: BuildingSnap[] = [];
  fogOn = true;
  private at = 0;
  private interval = 100;
  stats = { stepMs: 0, units: 0 };
  squads = new Map<number, SquadSnap>();
  /** Economy (real sim only): the influence mask (latest version) and the resource nodes (posted every second). */
  influence: InfluenceMap | null = null;
  nodes: NodeSnap[] = [];
  private asks = new Map<number, (r: unknown) => void>();
  private askId = 0;

  constructor(region: RegionData) {
    type Msg = { snap: Snapshot; stats: { stepMs: number; units: number }; nodes?: NodeSnap[]; influence?: InfluenceMap; fog?: FogGrid; seen?: BuildingSnap[] } | { reply: number; place?: PlaceResult | null; wall?: WallPlan | null; bridge?: BridgePlan | null };
    this.worker.onmessage = (e: MessageEvent<Msg>) => {
      if ('reply' in e.data) {
        const r = e.data;
        this.asks.get(r.reply)?.(r.place ?? r.wall ?? r.bridge ?? null);
        this.asks.delete(r.reply);
        return;
      }
      if (e.data.nodes) this.nodes = e.data.nodes;
      if (e.data.influence) this.influence = e.data.influence;
      if (e.data.fog) (this.fog = e.data.fog), (this.seen = e.data.seen ?? []);
      this.old = new Map(this.cur?.units.map((u) => [u.id, u]));
      this.full = e.data.snap;
      this.cur = this.fogged(e.data.snap);
      this.stats = e.data.stats;
      this.at = performance.now();
      this.squads = new Map(this.cur.squads.map((s) => [s.id, s]));
    };
    const q = new URLSearchParams(location.search), dev = Number(q.get('dev')) || undefined;
    // ?net=<ws url or /ws/war/<region>>: play on the live region server (M3) instead of the local sim
    this.send({ t: 'init', region, seed: 1, sim: q.get('sim') === 'fake' ? 'fake' : 'real', net: q.get('net') ?? undefined, dev });
    this.speed(1);
  }

  /** Team 0 sees tile point (x, y) now (always with fog off or before the first grid). */
  visible(x: number, y: number): boolean {
    const g = this.fog;
    if (!g || !this.fogOn) return true;
    const cx = Math.floor(x / g.cell), cy = Math.floor(y / g.cell);
    return cx >= 0 && cy >= 0 && cx < g.w && cy < g.h && g.state[cy * g.w + cx] === 2;
  }

  /**
   * The snapshot as team 0 knows it: foe men, engines and missiles only where it sees; foe buildings where it sees
   * them now, else as last seen (drawn under the explored shroud); its own side whole.
   */
  private fogged(s: Snapshot): Snapshot {
    if (!this.fog || !this.fogOn) return s;
    const team = new Map(s.squads.map((q) => [q.id, q.team]));
    const vis = (b: BuildingSnap) => {
      for (let i = 0; i < b.tiles.length; i += 2) if (this.visible(b.tiles[i] + 0.5, b.tiles[i + 1] + 0.5)) return true;
      return this.visible(b.x, b.y);
    };
    const buildings = (s.buildings ?? []).filter((b) => b.team === 0 || vis(b));
    const here = new Set(buildings.map((b) => b.id));
    for (const b of this.seen) if (!here.has(b.id) && !vis(b)) buildings.push(b);
    return {
      ...s,
      units: s.units.filter((u) => team.get(u.squad) === 0 || this.visible(u.x, u.y)),
      shots: s.shots?.filter((h) => this.visible(h.x0, h.y0) || this.visible(h.x1, h.y1)),
      sieges: s.sieges?.filter((e) => e.team === 0 || this.visible(e.x, e.y)),
      buildings,
    };
  }

  /** Dev: fog of war on / off (re-filters the snapshot drawn now). */
  setFog(on: boolean): void {
    this.fogOn = on;
    if (this.full) this.cur = this.fogged(this.full);
  }

  private send(m: ToWorker): void {
    this.worker.postMessage(m);
  }

  /** `bot`: a bot behaviour that drives the squad (../sim/bots.ts). */
  spawn(owner: string, team: number, cls: string, count: number, x: number, y: number, bot?: Behaviour): void {
    this.send({ t: 'spawn', owner, team, cls, count, x, y, bot });
  }

  order(o: Order): void {
    this.send({ t: 'order', o });
  }

  /** The camera's ground rect in tiles (corner tiles): the live server sends what lies near it (net mode only). */
  camera(corners: { x: number; y: number }[]): void {
    const xs = corners.map((c) => c.x), ys = corners.map((c) => c.y);
    this.send({ t: 'view', x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
  }

  /** Dev: a claim anchor (influence radius r) for a team. */
  claim(team: number, x: number, y: number, r?: number): void {
    this.send({ t: 'claim', team, x, y, r });
  }

  /** Neutral play: spawn the region's lairs. */
  spawnMobs(): void {
    this.send({ t: 'mobs' });
  }

  /** Scenarios: fast-forward up to `max` ticks, the team's squads building its unfinished sites, until none is left. */
  prebuild(team: number, max: number): void {
    this.send({ t: 'prebuild', team, max });
  }

  /** Scenarios: step `ticks` ticks at once (squads settle before play). */
  skip(ticks: number): void {
    this.send({ t: 'skip', ticks });
  }

  /** Dev: damage a building (scripts: a breach). */
  damageBuilding(id: number, dmg: number): void {
    this.send({ t: 'damage', id, dmg });
  }

  /** Scenarios: the team's unfinished bridges done at once. */
  finishBridges(team: number): void {
    this.send({ t: 'finishBridges', team });
  }

  /** Dev: add to a team's stockpile. */
  addStock(team: number, res: ResourceKind, n: number): void {
    this.send({ t: 'stock', team, res, n });
  }

  /** The sim's checkPlacement, answered off the worker (null on the fake sim). */
  checkPlacement(team: number, type: BuildingType, x: number, y: number, rot: 0 | 1): Promise<PlaceResult | null> {
    return this.ask((id) => ({ t: 'check', id, team, type, x, y, rot }));
  }

  /** The sim's checkWall, answered off the worker (null on the fake sim). */
  checkWall(team: number, wall: Omit<WallOrder, 'kind' | 'squad'>): Promise<WallPlan | null> {
    return this.ask((id) => ({ t: 'checkWall', id, team, wall }));
  }

  /** The sim's checkBridge, answered off the worker (null on the fake sim). */
  checkBridge(team: number, bridge: Omit<BridgeOrder, 'kind' | 'squad'>): Promise<BridgePlan | null> {
    return this.ask((id) => ({ t: 'checkBridge', id, team, bridge }));
  }

  private ask<T>(m: (id: number) => ToWorker): Promise<T | null> {
    const id = ++this.askId;
    return new Promise((ok) => {
      this.asks.set(id, ok as (r: unknown) => void);
      this.send(m(id));
    });
  }

  /** Time scale; 0 pauses. */
  speed(scale: number): void {
    if (scale > 0) this.interval = 100 / scale;
    this.send({ t: 'speed', scale });
  }

  /** Render time for the clips (./anim.ts): the fractional tick drawn (one behind the newest snapshot). */
  time(now: number): { now: number; tick: number; snap: number; tickMs: number } {
    const snap = this.cur?.tick ?? 0;
    return { now, tick: snap - 1 + Math.min(1, (performance.now() - this.at) / this.interval), snap, tickMs: this.interval };
  }

  /** Units at render time, positions in tiles. */
  units(): DrawUnit[] {
    if (!this.cur) return [];
    const a = Math.min(1, (performance.now() - this.at) / this.interval);
    return this.cur.units.map((u) => {
      const p = this.old.get(u.id) ?? u;
      let df = u.facing - p.facing;
      df -= Math.round(df / (2 * Math.PI)) * 2 * Math.PI;
      return { u, x: p.x + (u.x - p.x) * a, y: p.y + (u.y - p.y) * a, facing: p.facing + df * a, team: this.squads.get(u.squad)?.team ?? 0 };
    });
  }
}
