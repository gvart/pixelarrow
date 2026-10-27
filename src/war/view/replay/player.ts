/**
 * W-62 E5: plays the recorded frames (./buffer.ts) back as the view's snapshot source (../simClient.ts ReplaySource):
 * a fractional tick `t` moved by the frame time times the rate, men interpolated between the two frames round it as
 * the live view does between its last two snapshots.
 */
import type { FogGrid, Snapshot, SquadSnap } from '../../types';
import type { DrawUnit, ReplaySource } from '../simClient';
import type { ReplayBuffer } from './buffer';

/** Ms per tick at 1x (the sim's 10 Hz). */
export const TICK_MS = 100;
export const RATES = [0.5, 1, 2, 4] as const;

export class ReplayPlayer implements ReplaySource {
  /** The tick drawn (fractional). */
  t = 0;
  rate = 1;
  playing = true;
  cur: Snapshot | null = null;
  fog: FogGrid | null = null;
  squads = new Map<number, SquadSnap>();
  readonly picked = new Set<number>();
  private old: Snapshot | null = null;
  private a = 1;

  constructor(readonly buf: ReplayBuffer) {}

  seek(t: number): void {
    this.t = Math.max(this.buf.first, Math.min(this.buf.last, t));
    this.sync();
  }

  /** Advance by `ms` of frame time (paused: hold); stops at the newest frame. */
  step(ms: number): void {
    if (this.playing) this.t += (ms / TICK_MS) * this.rate;
    if (this.t >= this.buf.last) (this.t = this.buf.last), (this.playing = false);
    if (this.t < this.buf.first) this.t = this.buf.first; // the oldest frames went while paused
    this.sync();
  }

  private sync(): void {
    const b = this.buf, i = b.indexAt(this.t), j = Math.min(i + 1, b.frames.length - 1);
    const fi = b.frames[i], fj = b.frames[j];
    if (!fi || !fj) return;
    const cur = b.snapshot(j);
    if (cur !== this.cur) this.squads = new Map(cur!.squads.map((q) => [q.id, q]));
    this.old = b.snapshot(i);
    this.cur = cur;
    this.fog = fj.fog;
    this.a = j > i ? Math.max(0, Math.min(1, (this.t - fi.tick) / (fj.tick - fi.tick))) : 1;
  }

  units(): DrawUnit[] {
    const cur = this.cur, a = this.a;
    if (!cur) return [];
    const old = new Map(this.old?.units.map((u) => [u.id, u]));
    return cur.units.map((u) => {
      const p = old.get(u.id) ?? u;
      let df = u.facing - p.facing;
      df -= Math.round(df / (2 * Math.PI)) * 2 * Math.PI;
      return { u, x: p.x + (u.x - p.x) * a, y: p.y + (u.y - p.y) * a, facing: p.facing + df * a, team: this.squads.get(u.squad)?.team ?? 0 };
    });
  }

  time(now: number): { now: number; tick: number; snap: number; tickMs: number } {
    return { now, tick: this.t, snap: this.cur?.tick ?? 0, tickMs: TICK_MS / this.rate };
  }

  since(): number {
    return (this.a * TICK_MS) / this.rate;
  }
}
