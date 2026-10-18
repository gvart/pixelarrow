/**
 * The battle's animation picker for figures drawn from a sprite sheet
 * (src/art/sheetDoll.ts): a man's state, as the sim already exposes it, to an
 * animation of his sheet and a frame of it. Pure (unit-tested); procedural
 * figures keep BattleScene.manFrame / figureFrame unchanged.
 *
 * Priority (as manFrame): victory, attack, block, hit / stun, rout, moving
 * (charge, run, walk), the missile draw before a shot, stances (shield wall,
 * engaged), idle with the odd ambient (look around, adjust the shield).
 * Every animation a sheet lacks shows as its fallback (ANIM_FALLBACK).
 */
import { resolveAnim, type SheetAnim } from './sheetManifest';
import type { WeaponClass } from './paperdoll';

export interface AnimInfo {
  frames: number;
  fps: number;
  strike?: number;
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
  /** Stride rate multiplier (his pace against his marching speed). */
  pace: number;
}

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
export function chooseManAnim(s: ManState, anims: AnimTable): { want: SheetAnim; mode: 'once' | 'loop' | 'aim' | 'release'; since: number; rate: number } {
  const cadence = 0.92 + frac(s.id * 0.37) * 0.16;
  if (s.victory) return { want: 'cheer', mode: 'loop', since: s.t, rate: 1 };
  if (s.sinceAtk >= 0) {
    // missile men at close quarters jab with the weapon in hand
    const ranged = RANGED.includes(s.wc);
    const wc: WeaponClass = !s.shot && ranged ? 'none' : s.wc;
    const want = attackAnimOf(wc);
    const a = anims[resolveAnim(want, (x) => !!anims[x])]!;
    if (ranged && s.shot) {
      if (s.sinceAtk * a.fps < a.frames - strikeOf(a)) return { want, mode: 'release', since: s.sinceAtk, rate: 1 };
    } else if (s.sinceAtk * a.fps < a.frames) return { want, mode: 'once', since: s.sinceAtk, rate: 1 };
  }
  if (s.sinceBlock >= 0 && s.sinceBlock < 0.22) return { want: s.shieldWall ? 'brace' : 'block', mode: 'once', since: s.sinceBlock, rate: 1 };
  if (s.stunned) return { want: 'stagger', mode: 'loop', since: s.t, rate: 1 };
  if (s.sinceHit >= 0 && s.sinceHit < 0.24) return { want: 'hit', mode: 'once', since: s.sinceHit, rate: 1 };
  if (s.routing) return { want: 'rout', mode: 'loop', since: s.t, rate: cadence };
  if (s.moving) {
    if (s.charging) return { want: 'charge', mode: 'loop', since: s.t, rate: cadence * s.pace };
    return { want: s.running ? 'run' : 'walk', mode: 'loop', since: s.t, rate: cadence * s.pace };
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

/** A man's animation and frame on a sheet with these animations. */
export function pickManAnim(s: ManState, anims: AnimTable): Pick {
  const c = chooseManAnim(s, anims);
  const anim = resolveAnim(c.want, (x) => !!anims[x]);
  const a = anims[anim]!;
  const n = a.frames;
  switch (c.mode) {
    case 'once':
      return { anim, i: Math.min(n - 1, Math.floor(c.since * a.fps)) };
    case 'release':
      return { anim, i: Math.min(n - 1, strikeOf(a) + Math.floor(c.since * a.fps)) };
    case 'aim': {
      // the draw before the shot: the frames up to the release, spread over the aim window (a sling whirls them)
      const k = strikeOf(a);
      if (s.wc === 'sling') return { anim, i: loop(s.t, a.fps, k, 0) };
      const win = AIM_WINDOW[s.wc] ?? 0.5;
      return { anim, i: Math.max(0, Math.min(k - 1, Math.floor((1 - c.since / win) * k))) };
    }
    default:
      return { anim, i: loop(c.since, a.fps * c.rate, n, frac(s.id * 0.618)) };
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
  if (ko && kn && tt >= down) return { anim: 'kneel', i: loop(tt - down, kn.fps, kn.frames, frac(id * 0.618)) };
  return { anim, i: Math.min(a.frames - 1, Math.floor(tt * a.fps)) };
}
