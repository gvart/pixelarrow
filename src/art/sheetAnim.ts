/**
 * The battle's animation picker for figures drawn from a sprite sheet
 * (src/art/sheetDoll.ts): a man's state, as the sim already exposes it, to an
 * animation of his sheet and a frame of it. Pure (unit-tested); procedural
 * figures keep BattleScene.manFrame / figureFrame unchanged.
 *
 * Priority (as manFrame): victory, attack, block, hit / stun, rout, moving
 * (charge, run, walk), the windup before a blow and the draw before a shot,
 * stances (shield wall, engaged), idle with the odd ambient (look around,
 * adjust the shield). Every animation a sheet lacks shows as its fallback
 * (ANIM_FALLBACK).
 *
 * Timing is the battle clock (sim time, which runs on real frame time) at
 * each clip's own fps. An attack's `strike` frame is on screen at the sim's
 * attack: the frames before it play just before, as the cooldown runs out.
 * Strides run on an accumulated stride clock (ManState.stride), so a change
 * of pace never jumps the cycle; clips with a `hold` play their entry once,
 * then loop from it (AnimMemory remembers when the state began).
 */
import { resolveAnim, type SheetAnim } from './sheetManifest';
import type { WeaponClass } from './paperdoll';

export interface AnimInfo {
  frames: number;
  fps: number;
  strike?: number;
  hold?: number;
}
export type AnimTable = Partial<Record<SheetAnim, AnimInfo>>;

export interface Pick {
  anim: SheetAnim;
  i: number;
}

/** What the picker reads of a man (all times in seconds). */
export interface ManState {
  /** Battle clock. */
  t: number;
  /** Unit id (phase and cadence of his own). */
  id: number;
  /** His side won and he is standing. */
  victory: boolean;
  /** Since his last attack or shot (< 0: none yet). */
  sinceAtk: number;
  /** The last attack was a shot. */
  shot: boolean;
  wc: WeaponClass;
  sinceBlock: number;
  sinceHit: number;
  /** Stunned (sim u.stun > 0). */
  stunned: boolean;
  routing: boolean;
  moving: boolean;
  /** Faster than his marching speed. */
  running: boolean;
  /** Moving under a charge order. */
  charging: boolean;
  /** His group holds a shield wall. */
  shieldWall: boolean;
  /** In contact with the enemy. */
  engaged: boolean;
  /** Missile men in their shooting rhythm: seconds until the next shot (< 0: not aiming). */
  aimUntil: number;
  /** Melee men in contact: seconds until his attack cooldown runs out (< 0: none coming). */
  swingIn?: number;
  /** Stride rate multiplier (his pace against his marching speed). */
  pace: number;
  /**
   * Stride clock: seconds of marching, each scaled by the pace of the moment
   * (the scene accumulates it). Without it the stride runs on t x pace.
   */
  stride?: number;
}

/** What a man's picker remembers between frames: the looping state he is in and since when (its entry plays once). */
export interface AnimMemory {
  anim: SheetAnim | null;
  t0: number;
  last: number;
}

export const newAnimMemory = (): AnimMemory => ({ anim: null, t0: 0, last: -1 });
/** A state left for less than this (a block, a flinch) is taken up again where it was, without its entry. */
const RESUME_S = 0.5;

const RANGED: readonly WeaponClass[] = ['bow', 'sling', 'jav'];

/** The attack animation of a weapon class. */
export function attackAnimOf(wc: WeaponClass): SheetAnim {
  switch (wc) {
    case 'spear':
    case 'lance':
      return 'thrust';
    case 'blade':
    case 'chop':
    case 'two':
      return 'slash';
    case 'bow':
      return 'shoot';
    case 'sling':
      return 'sling';
    case 'jav':
      return 'throw';
    default:
      return 'attack';
  }
}

/** How long before a shot the draw / whirl / cock begins (s), as paperdoll aimFrame. */
const AIM_WINDOW: Partial<Record<WeaponClass, number>> = { bow: 0.5, sling: 0.6, jav: 0.45 };

const frac = (x: number) => x - Math.floor(x);
const loop = (t: number, fps: number, n: number, phase: number) => ((Math.floor(t * fps + phase * n) % n) + n) % n;
const strikeOf = (a: AnimInfo) => Math.max(1, Math.min(a.frames - 1, a.strike ?? Math.floor(a.frames / 2)));

/** A clip with an entry: frames up to `hold` once, then the rest looped (no hold: the whole clip, at a phase of his own). */
export function holdFrame(since: number, a: AnimInfo, phase = 0): number {
  const h = a.hold ?? 0;
  if (h <= 0) return loop(since, a.fps, a.frames, phase);
  const f = Math.floor(since * a.fps);
  return f < h ? Math.max(0, f) : h + ((f - h) % (a.frames - h));
}

/** A seeded ambient idle (look around / adjust the shield) now and then, or null. */
export function ambientAt(t: number, id: number, anims: AnimTable): SheetAnim | null {
  const opts = (['look', 'adjust'] as const).filter((a) => anims[a]);
  if (!opts.length) return null;
  const period = 7 + frac(id * 0.37) * 4;
  const k = Math.floor(t / period + frac(id * 0.618));
  // one window in two plays an ambient, which one by a hash of the man and the window
  const h = (Math.imul(k + 1, 0x9e3779b1) ^ Math.imul(id + 7, 0x85ebca6b)) >>> 0;
  if (h % 2) return null;
  const a = opts[(h >>> 1) % opts.length];
  const into = (t / period + frac(id * 0.618) - k) * period;
  const info = anims[a]!;
  return into < info.frames / info.fps ? a : null;
}

/** The animation a man wants this frame (before fallbacks) and how to time it. */
export function chooseManAnim(s: ManState, anims: AnimTable): { want: SheetAnim; mode: 'once' | 'loop' | 'aim' | 'release' | 'windup'; since: number; rate: number } {
  const cadence = 0.92 + frac(s.id * 0.37) * 0.16;
  if (s.victory) return { want: 'cheer', mode: 'loop', since: s.t, rate: 1 };
  if (s.sinceAtk >= 0) {
    // missile men at close quarters jab with the weapon in hand
    const ranged = RANGED.includes(s.wc);
    const wc: WeaponClass = !s.shot && ranged ? 'none' : s.wc;
    const want = attackAnimOf(wc);
    const a = anims[resolveAnim(want, (x) => !!anims[x])]!;
    // the blow lands / the missile leaves on the strike frame, at the sim's attack; the rest of the clip follows
    if (s.sinceAtk * a.fps < a.frames - strikeOf(a)) return { want, mode: 'release', since: s.sinceAtk, rate: 1 };
  }
  if (s.sinceBlock >= 0 && s.sinceBlock < 0.22) {
    // in a shield wall the brace takes the blow: the stance holds on
    if (s.shieldWall) return { want: 'brace', mode: 'loop', since: s.t, rate: 1 };
    return { want: 'block', mode: 'once', since: s.sinceBlock, rate: 1 };
  }
  if (s.stunned) return { want: 'stagger', mode: 'loop', since: s.t, rate: 1 };
  if (s.sinceHit >= 0 && s.sinceHit < 0.24) return { want: 'hit', mode: 'once', since: s.sinceHit, rate: 1 };
  if (s.routing) return { want: 'rout', mode: 'loop', since: s.t, rate: cadence };
  if (s.moving) {
    const since = s.stride ?? s.t * s.pace;
    if (s.charging) return { want: 'charge', mode: 'loop', since, rate: cadence };
    return { want: s.running ? 'run' : 'walk', mode: 'loop', since, rate: cadence };
  }
  // the windup of the next blow, timed so its strike frame meets the sim's attack
  if (s.swingIn !== undefined && s.swingIn >= 0 && !RANGED.includes(s.wc)) {
    const want = attackAnimOf(s.wc);
    const a = anims[resolveAnim(want, (x) => !!anims[x])]!;
    if (s.swingIn * a.fps < strikeOf(a)) return { want, mode: 'windup', since: s.swingIn, rate: 1 };
  }
  const win = AIM_WINDOW[s.wc];
  if (win !== undefined && s.aimUntil >= 0 && s.aimUntil < win) return { want: attackAnimOf(s.wc), mode: 'aim', since: s.aimUntil, rate: 1 };
  if (s.shieldWall) return { want: 'brace', mode: 'loop', since: s.t, rate: 1 };
  if (s.engaged) return { want: 'ready', mode: 'loop', since: s.t, rate: 1 };
  const amb = ambientAt(s.t, s.id, anims);
  if (amb) return { want: amb, mode: 'once', since: ambientSince(s.t, s.id), rate: 1 };
  return { want: 'idle', mode: 'loop', since: s.t, rate: 1 };
}

function ambientSince(t: number, id: number): number {
  const period = 7 + frac(id * 0.37) * 4;
  const x = t / period + frac(id * 0.618);
  return (x - Math.floor(x)) * period;
}

/**
 * A man's animation and frame on a sheet with these animations. `mem` (one
 * per man, kept by the caller) lets looping states with a `hold` play their
 * entry when he takes them up.
 */
export function pickManAnim(s: ManState, anims: AnimTable, mem?: AnimMemory): Pick {
  const c = chooseManAnim(s, anims);
  const anim = resolveAnim(c.want, (x) => !!anims[x]);
  const a = anims[anim]!;
  const n = a.frames;
  switch (c.mode) {
    case 'once':
      return { anim, i: Math.min(n - 1, Math.floor(c.since * a.fps)) };
    case 'release':
      return { anim, i: Math.min(n - 1, strikeOf(a) + Math.floor(c.since * a.fps)) };
    case 'windup': {
      // frames 0..strike-1 over the last strike / fps seconds of the cooldown
      const k = strikeOf(a);
      return { anim, i: Math.max(0, Math.min(k - 1, k - 1 - Math.floor(c.since * a.fps))) };
    }
    case 'aim': {
      // the draw before the shot: the frames up to the release, spread over the aim window (a sling whirls them)
      const k = strikeOf(a);
      if (s.wc === 'sling') return { anim, i: loop(s.t, a.fps, k, 0) };
      const win = AIM_WINDOW[s.wc] ?? 0.5;
      return { anim, i: Math.max(0, Math.min(k - 1, Math.floor((1 - c.since / win) * k))) };
    }
    default: {
      if (a.hold && mem) {
        if (mem.anim !== anim || s.t - mem.last > RESUME_S || s.t < mem.last) {
          mem.anim = anim;
          mem.t0 = s.t;
        }
        mem.last = s.t;
        return { anim, i: holdFrame(s.t - mem.t0, a) };
      }
      if (mem) {
        mem.anim = anim;
        mem.last = s.t;
      }
      return { anim, i: a.hold ? a.hold + loop(c.since, a.fps * c.rate, n - a.hold, frac(s.id * 0.618)) : loop(c.since, a.fps * c.rate, n, frac(s.id * 0.618)) };
    }
  }
}

/**
 * A fallen man: forwards or backwards (dieB) at the sheet's pace, lying
 * still on the last frame; a man knocked out (sim u.ko) kneels, wounded, once
 * down, if the sheet has the loop.
 */
export function pickDeathAnim(tt: number, back: boolean, ko: boolean, id: number, anims: AnimTable): Pick {
  const anim = resolveAnim(back ? 'fallBack' : 'fallFwd', (x) => !!anims[x]);
  const a = anims[anim]!;
  const down = a.frames / a.fps;
  const kn = anims.kneel;
  if (ko && kn && tt >= down) return { anim: 'kneel', i: holdFrame(tt - down, kn, frac(id * 0.618)) };
  return { anim, i: Math.min(a.frames - 1, Math.floor(tt * a.fps)) };
}
