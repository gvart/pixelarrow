/**
 * The mix, in decibels (FL-03, audio-design). Pure logic, no Web Audio, so
 * it is unit-tested directly; the engine turns these numbers into gains.
 *
 *   destination ← limiter ← master ┬ world ┬ music ← musicDuck ← tracks, stingers
 *                                  │       └ sfx   ┬ sfxDuck ← field sounds
 *                                  │               └ (keys: the horns that duck, not ducked themselves)
 *                                  └ ui ← clicks, coins, narrator
 *
 * - The player's 0..10 steps map to dB (STEP_DB per step, 0 = off), then a
 *   per-bus trim. Effects drives both the SFX and the UI bus.
 * - `world` is the pause gate: a paused battle fades music and field sounds
 *   out, and only the UI bus still speaks.
 * - Ducking: a horn (and the army-break chord) pulls the music down while it
 *   sounds, then lets it back up slowly, so the call is heard over the drums.
 */
import type { SfxId } from './sfx';

export type Bus = 'music' | 'sfx' | 'ui';

/** dB per volume step: 10 = 0 dB, 1 = -18 dB, 0 = off. */
export const STEP_DB = 2;
/** Below this a gain is silence. */
export const SILENT_DB = -80;

/** Per-bus trim, dB (headroom into the limiter; the old linear 1.2 / 0.9 maxima). */
export const TRIM_DB: Record<Bus, number> = { music: 1.5, sfx: -1, ui: -1 };

export function dbToGain(db: number): number {
  return db <= SILENT_DB ? 0 : Math.pow(10, db / 20);
}

export function gainToDb(g: number): number {
  return g <= 0 ? -Infinity : 20 * Math.log10(g);
}

/** A 0..10 settings step -> dB (-Infinity = off). Bad values are off. */
export function stepDb(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return -Infinity;
  return -(10 - Math.min(10, step)) * STEP_DB;
}

/** Which bus a sound plays on. Everything not listed is a field sound (SFX). */
const UI_SOUNDS: ReadonlySet<SfxId> = new Set<SfxId>(['click', 'tap', 'back', 'error', 'warning', 'coin', 'levelUp', 'chime', 'narrate', 'quill', 'nope', 'destroy', 'undo']);

export function busOf(id: SfxId): Bus {
  return UI_SOUNDS.has(id) ? 'ui' : 'sfx';
}

/** How far a sound pulls other buses down while it plays, dB (sidechain by volume automation). */
export interface DuckSpec {
  music: number;
  sfx?: number;
}

export const DUCK: Partial<Record<SfxId, DuckSpec>> = {
  horn: { music: -7 },
  hornLow: { music: -7 },
  hornChord: { music: -10, sfx: -4 },
  rallyCry: { music: -4 },
};

/** Attack and release time constants (s): out of the way fast, back slowly so it doesn't pump. */
export const DUCK_ATTACK = 0.025;
export const DUCK_RELEASE = 0.3;
/** The pause gate's time constant (s): about 0.35 s to silence. */
export const GATE_TC = 0.06;

/** Active ducks per bus; the deepest one wins. */
export class Ducker {
  private holds: { bus: 'music' | 'sfx'; until: number; db: number }[] = [];

  /** A ducking sound starts at `now` and lasts `dur` s. */
  add(spec: DuckSpec, now: number, dur: number): void {
    this.holds.push({ bus: 'music', until: now + dur, db: spec.music });
    if (spec.sfx) this.holds.push({ bus: 'sfx', until: now + dur, db: spec.sfx });
  }

  /** The duck on `bus` at `now`, dB (0 = none). */
  depth(bus: 'music' | 'sfx', now: number): number {
    if (this.holds.some((h) => h.until <= now)) this.holds = this.holds.filter((h) => h.until > now);
    let d = 0;
    for (const h of this.holds) if (h.bus === bus && h.db < d) d = h.db;
    return d;
  }

  clear(): void {
    this.holds = [];
  }
}

export interface MixSettings {
  sound: boolean;
  musicVol: number;
  sfxVol: number;
}

/** The bus levels for these settings, dB (-Infinity = off). */
export function busDb(s: MixSettings): Record<Bus, number> {
  const sfx = stepDb(s.sfxVol);
  return { music: stepDb(s.musicVol) + TRIM_DB.music, sfx: sfx + TRIM_DB.sfx, ui: sfx + TRIM_DB.ui };
}
