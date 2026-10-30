/**
 * W-62 E5: the moments worth a replay, read off the recorded frames (./buffer.ts FrameNote), so the same online and
 * offline and only from what this client saw: a big fight (BIG_FIGHT men fell, no lull longer than QUIET between),
 * a siege (a fight in which a building was destroyed) or a guardian slain. Each ends with a range of ticks to replay.
 */
import type { FrameNote } from './buffer';

export interface Moment { kind: 'fight' | 'siege' | 'boss'; from: number; to: number; fell: number; razed: number; boss?: string }

/** Men fallen in one fight to call it big. */
export const BIG_FIGHT = 10;
/** Ticks without a fall, a breach or a blow being struck that end a fight (12 s). */
export const QUIET = 120;
/** A fight still on with nobody falling (a lord with deep hp, or blows far off) is told after this long without a fall (90 s). */
export const STALL = 900;
/** Ticks shown before the first blow and after the last. */
const PRE = 50;
const POST = 30;
/** A guardian's fall: this long before it (at most) and after. */
const BOSS_PRE = 600;
const BOSS_POST = 30;

export class Moments {
  /** Moments found, newest last (a few kept for the scrub bar's marks). */
  readonly found: Moment[] = [];
  onMoment: ((m: Moment) => void) | null = null;
  private fight: { from: number; last: number; blow: number; fell: number; razed: number } | null = null;
  private boss: { id: string; at: number } | null = null;

  reset(): void {
    this.fight = this.boss = null;
    this.found.length = 0;
  }

  feed(n: FrameNote): void {
    const f = this.fight;
    if (n.fell || n.razed) {
      if (f) (f.last = f.blow = n.tick), (f.fell += n.fell), (f.razed += n.razed);
      else this.fight = { from: n.tick, last: n.tick, blow: n.tick, fell: n.fell, razed: n.razed };
    } else if (f && n.striking) f.blow = n.tick;
    // over once no blow is struck for QUIET (men still swinging at a lord hold the result), or nobody fell for STALL
    if (f && this.fight === f && (n.tick - f.blow > QUIET || n.tick - f.last > STALL)) {
      this.fight = null;
      if (f.fell >= BIG_FIGHT || f.razed) this.emit({ kind: f.razed ? 'siege' : 'fight', from: f.from - PRE, to: f.last + POST, fell: f.fell, razed: f.razed });
    }
    if (n.slain.length) this.boss = { id: n.slain[0], at: n.tick };
    const b = this.boss;
    if (b && n.tick - b.at >= BOSS_POST) {
      this.boss = null;
      const g = this.fight;
      this.emit({ kind: 'boss', boss: b.id, from: Math.max(b.at - BOSS_PRE, g ? g.from - PRE : -Infinity), to: b.at + BOSS_POST, fell: g?.fell ?? 0, razed: g?.razed ?? 0 });
      if (g) this.fight = null; // the guardian's fight is told
    }
  }

  private emit(m: Moment): void {
    this.found.push(m);
    if (this.found.length > 8) this.found.shift();
    this.onMoment?.(m);
  }
}
