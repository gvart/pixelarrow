/**
 * Which clip a soldier plays, and which frame of it, from the 10 Hz snapshots (./units.ts draws it).
 *
 *   dead              fallBack when the blow came from in front, else fallFwd; held on the last frame
 *   striking          the class's blow (thrust / slash; shoot / sling / throw while it has missiles, else
 *                     stab) played once per blow, started so its `strike` frame shows on the tick the
 *                     blow lands (the sim's `ready` lets it start early; `swing` places it when late)
 *   hit               stagger once, unless a blow is under way
 *   moving            walk; run above RUN tiles/s; charge while closing on an attack order
 *   in reach, waiting ready
 *   standing          foes near: ready (brace on a hold order); after a won fight the squad cheers
 *                     briefly; else idle with now and then an idle variant (look, adjust, breathe,
 *                     shift, or any clip named idle*), per unit by a hash, start frames desynced
 *
 * Clips are found on the sheet by name and fall back through ANIM_FALLBACK, so a clip added to a
 * manifest is used as soon as it ships. `override` is the hook for work clips (build, carry): it
 * names clips for a unit, the first the sheet has is used.
 */
import { resolveAnim, SHEET_ANIMS, type SheetAnim } from '../../art/sheetManifest';
import type { SquadSnap, UnitSnap } from '../types';
import type { DrawUnit } from './simClient';

export interface ClipDef { n: number; fps: number; strike: number; hold: number }
/** The sheet's clips by manifest name. */
export type Clips = ReadonlyMap<string, ClipDef>;
/** Render time: `tick` is the fractional sim tick being drawn, `snap` the newest snapshot's tick. */
export interface AnimTime { now: number; tick: number; snap: number; tickMs: number }

const RANGED: Record<string, SheetAnim> = { archer: 'shoot', slinger: 'sling', javelineer: 'throw' };
const MELEE: Record<string, SheetAnim> = { archer: 'stab', slinger: 'stab', javelineer: 'thrust' };
const IDLE_VARIANTS = ['look', 'adjust', 'breathe', 'shift'];
/** Tiles/s above which a moving man runs (the march pace is 1.5 x class speed). */
const RUN = 1.9;
/** Gap between squads (tiles) under which foes count as near. */
const NEAR = 12;
const CHEER_MS = 2600;
/** Idle slots: each one in IDLE_ODDS plays a variant once from the slot's start (+ jitter). */
const SLOT_MS = 4000;
const IDLE_ODDS = 3;

export function hash(a: number, b = 0): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** The first of `names` the sheet has, else the first one's ANIM_FALLBACK chain, else idle. */
export function pickClip(clips: Clips, ...names: string[]): string {
  for (const n of names) if (clips.has(n)) return n;
  const a = names[0] as SheetAnim;
  return (SHEET_ANIMS as readonly string[]).includes(a) ? resolveAnim(a, (x) => clips.has(x)) : 'idle';
}

/** Frame `t` ms into a clip: once through, then looping from `hold` (whole clip when hold is 0). */
export function frameAt(c: ClipDef, t: number, offset = 0): number {
  const f = Math.max(0, Math.floor((t * c.fps) / 1000)) + offset;
  return f < c.n ? f : c.hold + ((f - c.hold) % (c.n - c.hold));
}

interface OneShot { name: string; start: number; end: number }
interface Mem { hp: number; blow: number; ranged: boolean; one: OneShot | null; loop: string; loopAt: number; fall: OneShot | null; px: number; py: number; t: number; v: number }
interface SquadAnim { team: number; order: string; foeNear: boolean; fought: number; cheer: number; cx: number; cy: number; r: number; n: number; attacking: boolean }
export interface Pick { clip: string; frame: number }

export class Animator {
  /** Work clips (build, carry, ...): clip names for the unit, the first its sheet has is used (none: the usual pick). */
  override: ((u: UnitSnap) => readonly string[] | undefined) | null = null;
  private mem = new Map<number, Mem>();
  private squads = new Map<number, SquadAnim>();
  private sheet = new Map<Clips, { idles: string[] }>();

  /** Once per frame, before `pick`: squad stances (foes near, victory cheer). */
  frame(units: DrawUnit[], squads: ReadonlyMap<number, SquadSnap>, now: number): void {
    const acc = new Map<number, { x: number; y: number; n: number; atk: boolean; pts: DrawUnit[] }>();
    for (const d of units) {
      if (d.u.state === 'dead') continue;
      let a = acc.get(d.u.squad);
      if (!a) acc.set(d.u.squad, (a = { x: 0, y: 0, n: 0, atk: false, pts: [] }));
      a.x += d.x; a.y += d.y; a.n++; a.pts.push(d);
      if (d.u.state === 'attack') a.atk = true;
    }
    for (const [id, a] of acc) {
      let s = this.squads.get(id);
      if (!s) this.squads.set(id, (s = { team: 0, order: 'hold', foeNear: false, fought: -1, cheer: -1, cx: 0, cy: 0, r: 0, n: 0, attacking: false }));
      const q = squads.get(id);
      s.team = q?.team ?? 0; s.order = q?.order ?? 'hold'; s.n = a.n; s.attacking = a.atk;
      s.cx = a.x / a.n; s.cy = a.y / a.n;
      let r = 0;
      for (const d of a.pts) r = Math.max(r, Math.hypot(d.x - s.cx, d.y - s.cy));
      s.r = r;
    }
    for (const [id, s] of this.squads) {
      if (!acc.has(id)) { this.squads.delete(id); continue; }
      s.foeNear = false;
      for (const o of this.squads.values()) {
        if (o.team !== s.team && Math.hypot(o.cx - s.cx, o.cy - s.cy) - o.r - s.r < NEAR) { s.foeNear = true; break; }
      }
      if (s.attacking) { s.fought = now; s.cheer = -1; }
      else if (s.fought >= 0 && s.cheer < 0 && !s.foeNear && now - s.fought > 800) s.cheer = now;
    }
  }

  /** Forget units no longer in the snapshot. */
  prune(alive: Set<number>): void {
    for (const id of this.mem.keys()) if (!alive.has(id)) this.mem.delete(id);
  }

  pick(d: DrawUnit, clips: Clips, at: AnimTime, units: DrawUnit[], shots: readonly { by: number }[]): Pick {
    const u = d.u, { now } = at, cls = u.cls;
    let m = this.mem.get(u.id);
    if (!m) this.mem.set(u.id, (m = { hp: u.hp, blow: -1e9, ranged: !!RANGED[cls], one: null, loop: '', loopAt: now, fall: null, px: d.x, py: d.y, t: now, v: 0 }));
    // the time render reaches snapshot tick k
    const msAt = (k: number) => now + (k - at.tick) * at.tickMs;

    if (u.state === 'dead') {
      if (!m.fall) {
        const name = pickClip(clips, this.fromFront(d, units) ? 'fallBack' : 'fallFwd', 'fallFwd');
        m.fall = { name, start: now, end: 0 };
      }
      const c = clips.get(m.fall.name)!;
      return { clip: m.fall.name, frame: Math.min(c.n - 1, Math.floor(((now - m.fall.start) * c.fps) / 1000)) };
    }

    // speed over the last frames (tiles/s), smoothed
    const dt = now - m.t;
    if (dt > 0) {
      const v = (Math.hypot(d.x - m.px, d.y - m.py) * 1000) / dt;
      m.v += (v - m.v) * Math.min(1, dt / 250);
      m.px = d.x; m.py = d.y; m.t = now;
    }

    if (m.one && now >= m.one.end) m.one = null;
    const strikeName = this.strikeClip(clips, cls, m.ranged);
    const striking = () => !!m.one && m.one.name === strikeName && now >= m.one.start;
    if (u.state === 'attack') {
      const c = clips.get(strikeName)!, lead = (c.strike * 1000) / c.fps, dur = (c.n * 1000) / c.fps;
      if (u.swing !== undefined) {
        const blow = msAt(at.snap - u.swing);
        if (blow > m.blow + 150) {
          m.blow = blow;
          if (RANGED[cls] && u.swing <= 1) {
            const r = shots.some((s) => s.by === u.id);
            if (r !== m.ranged) m.ranged = r;
          }
          // landed without a clip under way (e.g. the first blow on coming into reach): place it now
          const name = this.strikeClip(clips, cls, m.ranged);
          if (!striking() && now < blow - lead + dur) m.one = { name, start: blow - lead, end: blow - lead + dur };
        }
      }
      if (u.ready !== undefined && !striking()) {
        const next = msAt(at.snap + 1 + u.ready);
        if (next - lead <= now) m.one = { name: strikeName, start: next - lead, end: next - lead + dur };
      }
    }
    if (u.hp < m.hp) {
      const at0 = msAt(at.snap);
      if (!striking()) {
        const name = pickClip(clips, 'stagger');
        const c = clips.get(name)!;
        m.one = { name, start: at0, end: at0 + (c.n * 1000) / c.fps };
      }
    }
    m.hp = u.hp;
    if (m.one && now >= m.one.start) return { clip: m.one.name, frame: frameAt(clips.get(m.one.name)!, now - m.one.start) };

    const work = this.override?.(u)?.find((n) => clips.has(n));
    if (work) return this.loop(m, clips, work, now, u.id);
    const s = this.squads.get(u.squad);
    if (u.state === 'move') {
      const name = s?.order === 'attack' ? pickClip(clips, 'charge') : m.v > RUN ? pickClip(clips, 'run') : pickClip(clips, 'walk');
      return this.loop(m, clips, name, now, u.id);
    }
    if (u.state === 'attack') return this.loop(m, clips, pickClip(clips, 'ready'), now, u.id);
    if (s && s.cheer >= 0) {
      const t = now - s.cheer - (hash(u.id, 7) % 500);
      if (t < CHEER_MS && t >= 0 && clips.has('cheer')) return { clip: 'cheer', frame: frameAt(clips.get('cheer')!, t) };
    }
    if (s?.foeNear) return this.loop(m, clips, s.order === 'hold' ? pickClip(clips, 'brace', 'ready') : pickClip(clips, 'ready'), now, u.id);
    return this.idle(m, clips, now, u.id);
  }

  /** Idle, with a variant now and then: slot k of unit id plays one if hash(id, k) says so. */
  private idle(m: Mem, clips: Clips, now: number, id: number): Pick {
    let sh = this.sheet.get(clips);
    if (!sh) this.sheet.set(clips, (sh = { idles: [...clips.keys()].filter((k) => IDLE_VARIANTS.includes(k) || (k.startsWith('idle') && k !== 'idle')) }));
    const off = hash(id, 1) % SLOT_MS, k = Math.floor((now + off) / SLOT_MS), h = hash(id, k);
    if (sh.idles.length && h % IDLE_ODDS === 0) {
      const name = sh.idles[(h >>> 4) % sh.idles.length], c = clips.get(name)!;
      const t = now + off - k * SLOT_MS - ((h >>> 12) % 1000);
      if (t >= 0 && t < (c.n * 1000) / c.fps) return { clip: name, frame: frameAt(c, t) };
    }
    return this.loop(m, clips, 'idle', now, id);
  }

  /** A looping clip; clips with a held part start from frame 0 when entered, others from a per-unit frame. */
  private loop(m: Mem, clips: Clips, name: string, now: number, id: number): Pick {
    if (m.loop !== name) { m.loop = name; m.loopAt = now; }
    const c = clips.get(name)!;
    return { clip: name, frame: frameAt(c, now - m.loopAt, c.hold ? 0 : hash(id, 3) % c.n) };
  }

  private strikeClip(clips: Clips, cls: string, ranged: boolean): string {
    if (RANGED[cls]) return ranged ? pickClip(clips, RANGED[cls]) : pickClip(clips, MELEE[cls]);
    return pickClip(clips, 'attack');
  }

  /** Was the killing blow from in front: is the nearest live foe (the striker, or most likely the shooter) ahead of it. */
  private fromFront(d: DrawUnit, units: DrawUnit[]): boolean {
    let best: DrawUnit | null = null, bd = Infinity;
    for (const o of units) {
      if (o.team === d.team || o.u.state === 'dead') continue;
      const q = (o.x - d.x) ** 2 + (o.y - d.y) ** 2;
      if (q < bd) { bd = q; best = o; }
    }
    if (!best) return true;
    return Math.cos(d.facing) * (best.x - d.x) + Math.sin(d.facing) * (best.y - d.y) >= 0;
  }
}
