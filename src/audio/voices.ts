/**
 * Voice limiter: decides whether a sound may start. Pure logic (no Web Audio),
 * so it is unit-tested directly. A 40-soldier melee fires dozens of hits per
 * second; without a cap that would clip and burn a phone's CPU.
 *
 * Rules, in order:
 *  1. ended voices are dropped;
 *  2. the same sound id is not restarted within `minGap` seconds (unless the
 *     new request is important, priority >= `urgent`) — ten clashes in one
 *     sim tick become one;
 *  3. at most `perSound` copies of one id play at once (the quietest/oldest is
 *     replaced if the new one matters more);
 *  4. at most `max` voices in total: the lowest-priority (then oldest) voice is
 *     stolen if the new one has a higher priority, otherwise the request is dropped.
 */
export interface Voice {
  id: string;
  priority: number;
  start: number;
  end: number;
  /** Fade the voice out quickly (set by the engine; absent in tests). */
  stop?: () => void;
}

export interface LimiterOpts {
  max: number;
  perSound: number;
  minGap: number;
  urgent: number;
}

export const DEFAULT_LIMITS: LimiterOpts = { max: 12, perSound: 3, minGap: 0.045, urgent: 8 };

export type Admit = { ok: false } | { ok: true; voice: Voice; stolen: Voice | null };

export class VoiceLimiter {
  readonly opts: LimiterOpts;
  private voices: Voice[] = [];
  private lastStart = new Map<string, number>();

  constructor(opts: Partial<LimiterOpts> = {}) {
    this.opts = { ...DEFAULT_LIMITS, ...opts };
  }

  get active(): readonly Voice[] {
    return this.voices;
  }

  count(now: number): number {
    this.prune(now);
    return this.voices.length;
  }

  /** Ask for a voice; on success the caller plays the sound (and stops `stolen`, if any). */
  admit(id: string, priority: number, now: number, dur: number): Admit {
    this.prune(now);
    const { max, perSound, minGap, urgent } = this.opts;
    const last = this.lastStart.get(id);
    if (last !== undefined && now - last < minGap && priority < urgent) return { ok: false };
    let stolen: Voice | null = null;
    const same = this.voices.filter((v) => v.id === id);
    if (same.length >= perSound) {
      const victim = weakest(same);
      if (victim.priority > priority) return { ok: false };
      stolen = victim;
    } else if (this.voices.length >= max) {
      const victim = weakest(this.voices);
      if (victim.priority >= priority) return { ok: false };
      stolen = victim;
    }
    if (stolen) this.remove(stolen);
    const voice: Voice = { id, priority, start: now, end: now + Math.max(0.01, dur) };
    this.voices.push(voice);
    this.lastStart.set(id, now);
    return { ok: true, voice, stolen };
  }

  /** Forget everything (context closed or recreated). */
  clear(): void {
    this.voices = [];
    this.lastStart.clear();
  }

  private remove(v: Voice): void {
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
  }

  private prune(now: number): void {
    if (this.voices.some((v) => v.end <= now)) this.voices = this.voices.filter((v) => v.end > now);
  }
}

/** Lowest priority; among equals the one that started first. */
function weakest(vs: Voice[]): Voice {
  let w = vs[0];
  for (const v of vs) if (v.priority < w.priority || (v.priority === w.priority && v.start < w.start)) w = v;
  return w;
}
