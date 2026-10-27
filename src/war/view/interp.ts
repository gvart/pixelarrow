/**
 * Snapshot interpolation for the units drawn (./simClient.ts): the sim's 10 Hz snapshots (the local worker's, or the
 * region server's over the network) are kept in a short buffer and played back on a smooth clock a little behind the
 * newest one, as networked games do (Source, Overwatch: ~100 ms of interpolation delay).
 *
 * - The clock: every snapshot's tick against its arrival time gives a sample of where the sim's tick count stands; the
 *   estimate is a slow average of them, and the render tick (the estimate less the delay) is slewed towards it each
 *   frame, never jumped (unless far off: a pause, a skip, a time scale change). So uneven arrivals (setInterval drift,
 *   postMessage queueing behind a long frame, network jitter) bend its pace a little instead of freezing a man at one
 *   snapshot and jumping him on at the next.
 * - The delay: 1.2 ticks plus twice the arrival jitter, at most 1.6 (120-160 ms), so a snapshot is nearly always there
 *   before it is drawn.
 * - Late snapshots: a man is carried on along his last velocity for up to MAX_EXTRA ticks, then held.
 * - Facing is interpolated the short way round.
 */
import type { UnitSnap } from '../types';

/** Ticks behind the clock estimate drawn: the least, the most, and the share of jitter added. */
const DELAY_MIN = 1.2, DELAY_MAX = 1.6, DELAY_JIT = 2;
/** Most ticks a man is carried on past the newest snapshot. */
const MAX_EXTRA = 1.5;
/** Per-sample weight of the clock estimate and of the jitter estimate. */
const EST_K = 0.08, JIT_K = 0.1;
/** Render ticks off the target by more than this: jump to it (pause, skip, time scale). */
const RESET = 4;
/** Snapshots kept. */
const KEEP = 8;

interface Frame { tick: number; units: Map<number, UnitSnap> }
export interface Sampled { u: UnitSnap; x: number; y: number; facing: number }

export class SnapBuffer {
  private frames: Frame[] = [];
  /** Estimated sim tick at time 0 (ms), from arrivals (the sim tick now = now / interval + base). */
  private base = NaN;
  private jit = 0;
  /** The render tick and the time it was taken at. */
  private rt = NaN;
  private rtAt = 0;
  private interval = 100;
  paused = false;

  /** Ms a tick lasts (the time scale); a change restarts the clock estimate. */
  setInterval(ms: number): void {
    if (ms === this.interval) return;
    this.interval = ms;
    this.base = NaN;
  }

  /** A snapshot came at time `now` (ms). */
  push(tick: number, units: readonly UnitSnap[], now: number): void {
    const last = this.frames.at(-1);
    if (last && tick <= last.tick) this.frames.length = 0; // a restart or a replayed tick: start over
    this.frames.push({ tick, units: new Map(units.map((u) => [u.id, u])) });
    if (this.frames.length > KEEP) this.frames.shift();
    const o = tick - now / this.interval;
    if (Number.isNaN(this.base) || Math.abs(o - this.base) > RESET) (this.base = o), (this.jit = 0);
    else {
      this.jit += (Math.abs(o - this.base) - this.jit) * JIT_K;
      this.base += (o - this.base) * EST_K;
    }
  }

  /** Ticks behind the estimate drawn now. */
  get delay(): number {
    return Math.min(DELAY_MAX, Math.max(DELAY_MIN, 1 + DELAY_JIT * this.jit));
  }

  /** The newest snapshot's tick (0 before any). */
  get newest(): number {
    return this.frames.at(-1)?.tick ?? 0;
  }

  /** The fractional sim tick drawn at time `now` (call once a frame; later calls in the frame give the same). */
  clock(now: number): number {
    if (!this.frames.length) return 0;
    if (now === this.rtAt && !Number.isNaN(this.rt)) return this.rt;
    const newest = this.newest;
    // paused: the clock runs up to the newest snapshot and stops there
    const target = this.paused || Number.isNaN(this.base) ? newest : now / this.interval + this.base - this.delay;
    if (Number.isNaN(this.rt) || Math.abs(target - this.rt) > RESET) this.rt = target;
    else {
      const dt = Math.max(0, now - this.rtAt) / this.interval;
      this.rt += this.paused ? Math.min(dt, Math.max(0, newest - this.rt)) : dt;
      // slew towards the target: at most 15% faster or slower than real time, so the pace never visibly jumps
      const err = target - this.rt, k = Math.min(1, dt * 0.5);
      this.rt += Math.max(-0.15 * dt, Math.min(0.15 * dt, err * k));
    }
    this.rt = Math.max(this.frames[0].tick, Math.min(this.rt, newest + MAX_EXTRA));
    this.rtAt = now;
    return this.rt;
  }

  /**
   * Every unit of `units` (the newest snapshot's, as filtered) at render tick `t`: between the two snapshots round it,
   * carried on along its velocity past the newest (MAX_EXTRA at most).
   */
  sample(units: readonly UnitSnap[], t: number): Sampled[] {
    const fs = this.frames;
    if (!fs.length) return units.map((u) => ({ u, x: u.x, y: u.y, facing: u.facing }));
    let i = fs.length - 1;
    while (i > 0 && fs[i - 1].tick > t) i--;
    // fs[i - 1].tick <= t < fs[i].tick, or past the newest (i = last, t >= its tick), or before the oldest (i = 0)
    const b = fs[i], a = i > 0 ? fs[i - 1] : null, last = fs.length - 1;
    const out: Sampled[] = new Array(units.length);
    for (let k = 0; k < units.length; k++) {
      const u = units[k], q = b.units.get(u.id) ?? u;
      let x = q.x, y = q.y, f = q.facing;
      if (i === last && t > b.tick && a) {
        // past the newest: on along the last velocity (a man who was moving), at most MAX_EXTRA ticks
        const p = a.units.get(u.id);
        if (p && q.state !== 'dead') {
          const s = Math.min(t - b.tick, MAX_EXTRA) / (b.tick - a.tick);
          x += (q.x - p.x) * s;
          y += (q.y - p.y) * s;
        }
      } else if (a && t < b.tick) {
        const p = a.units.get(u.id);
        if (p) {
          const s = Math.max(0, (t - a.tick) / (b.tick - a.tick));
          x = p.x + (q.x - p.x) * s;
          y = p.y + (q.y - p.y) * s;
          let df = q.facing - p.facing;
          df -= Math.round(df / (2 * Math.PI)) * 2 * Math.PI;
          f = p.facing + df * s;
        }
      }
      out[k] = { u, x, y, facing: f };
    }
    return out;
  }
}
