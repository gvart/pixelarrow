/**
 * Main-thread side of the sim worker: sends spawns and orders, keeps the last two Snapshots and
 * interpolates unit positions between them (rendering runs one 10 Hz tick behind).
 */
import type { Behaviour } from '../sim/bots';
import type { BuildingType, InfluenceMap, NodeSnap, Order, PlaceResult, RegionData, ResourceKind, Snapshot, SquadSnap, UnitSnap, WallOrder, WallPlan } from '../types';
import type { ToWorker } from './worker';

export interface DrawUnit { u: UnitSnap; x: number; y: number; facing: number; team: number }

export class SimClient {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private old = new Map<number, UnitSnap>();
  cur: Snapshot | null = null;
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
    type Msg = { snap: Snapshot; stats: { stepMs: number; units: number }; nodes?: NodeSnap[]; influence?: InfluenceMap } | { reply: number; place?: PlaceResult | null; wall?: WallPlan | null };
    this.worker.onmessage = (e: MessageEvent<Msg>) => {
      if ('reply' in e.data) {
        const r = e.data;
        this.asks.get(r.reply)?.(r.place ?? r.wall ?? null);
        this.asks.delete(r.reply);
        return;
      }
      if (e.data.nodes) this.nodes = e.data.nodes;
      if (e.data.influence) this.influence = e.data.influence;
      this.old = new Map(this.cur?.units.map((u) => [u.id, u]));
      this.cur = e.data.snap;
      this.stats = e.data.stats;
      this.at = performance.now();
      this.squads = new Map(this.cur.squads.map((s) => [s.id, s]));
    };
    this.send({ t: 'init', region, seed: 1, sim: new URLSearchParams(location.search).get('sim') === 'fake' ? 'fake' : 'real' });
    this.speed(1);
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

  /** Dev: a claim anchor (influence radius r) for a team. */
  claim(team: number, x: number, y: number, r?: number): void {
    this.send({ t: 'claim', team, x, y, r });
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
