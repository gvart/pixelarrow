/**
 * Main-thread side of the sim worker: sends spawns and orders, keeps the last two Snapshots and
 * interpolates unit positions between them (rendering runs one 10 Hz tick behind).
 */
import type { Behaviour } from '../sim/bots';
import type { Order, RegionData, Snapshot, SquadSnap, UnitSnap } from '../types';
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

  constructor(region: RegionData) {
    this.worker.onmessage = (e: MessageEvent<{ snap: Snapshot; stats: { stepMs: number; units: number } }>) => {
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
