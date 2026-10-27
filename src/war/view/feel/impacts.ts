/**
 * E4 impacts as pure logic (no Phaser; tests/war/feel.test.ts): what in a snapshot hits hard enough to be felt, read by
 * diffing it with the last one (the view's own memory, not the sim's events: other layers own those hooks), and the
 * rate-limited hit-stop.
 *
 *   wall / gate break   a wall, tower or gate going down (destroyed or to rubble)        shake, stop 70-80 ms
 *   building break      any other piece destroyed                                           small shake
 *   ram                 a ram's blow                                                        small shake, stop 40 ms
 *   boulder             a thrower's stone landing                                           small shake, stop 40 ms
 *   elite kill          an elite (level 6 up or an elite class) or a host captain falling   stop 55 ms
 *   boss kill           a guardian slain                                                    shake, stop 80 ms
 *
 * Boss slams shake from ../bossFx.ts (it knows the moves); both feed the one shaker (./shake.ts).
 */
import type { Snapshot, UnitSnap } from '../../types';
import { CLASSES, isClassId } from '../../../data/classes';
import { BUILDINGS } from '../../sim/economy';
import { struckSince } from '../sound/mix';

export type ImpactKind = 'wallBreak' | 'gateBreak' | 'buildingBreak' | 'ram' | 'boulder' | 'eliteKill' | 'bossKill';
/** A tile point where it happened. */
export interface Impact { kind: ImpactKind; x: number; y: number }

/** Trauma added at the view's centre, hit-stop ms (0: none). */
export const TIER: Record<ImpactKind, { shake: number; stop: number }> = {
  wallBreak: { shake: 0.38, stop: 70 },
  gateBreak: { shake: 0.42, stop: 80 },
  buildingBreak: { shake: 0.22, stop: 0 },
  ram: { shake: 0.12, stop: 40 },
  boulder: { shake: 0.14, stop: 40 },
  eliteKill: { shake: 0, stop: 55 },
  bossKill: { shake: 0.3, stop: 80 },
};

/** Host captains and the bosses' own men count as elites. */
const CAPTAIN = /^mob_(bandit_captain|bandit_king|maenad_queen|drakon|gyges|brontes|chimera|scylla_head)$/;

export function isElite(u: Pick<UnitSnap, 'cls' | 'level'>): boolean {
  if ((u.level ?? 0) >= 6 || CAPTAIN.test(u.cls)) return true;
  return isClassId(u.cls) && CLASSES[u.cls].role === 'elite';
}

/** Diffs snapshots into impacts; one per snapshot taken (the scene takes one a frame and may skip some: `gap`). */
export class ImpactWatch {
  private tick = -1;
  private alive = new Set<number>();
  private fallen = new Set<number>();
  private broken = new Set<number>();
  private slain = new Set<string>();
  /** Siege stones in flight: key -> landing tick and place. */
  private flying = new Map<string, { t1: number; x: number; y: number }>();
  private out: Impact[] = [];

  /** The impacts of `cur` since the last snapshot seen (empty for the same tick again, and on the first one). */
  diff(cur: Snapshot): readonly Impact[] {
    const out = this.out;
    out.length = 0;
    if (cur.tick === this.tick) return out;
    const first = this.tick < 0, gap = !first && cur.tick > this.tick ? Math.min(10, cur.tick - this.tick) : 1;
    this.tick = cur.tick;
    for (const u of cur.units) {
      if (u.state !== 'dead') { this.alive.add(u.id); continue; }
      if (this.fallen.has(u.id)) continue;
      this.fallen.add(u.id);
      if (!first && this.alive.has(u.id) && isElite(u)) out.push({ kind: 'eliteKill', x: u.x, y: u.y });
    }
    for (const b of cur.buildings ?? []) {
      if (b.state !== 'destroyed' && !b.rubble) { this.broken.delete(b.id); continue; }
      if (this.broken.has(b.id)) continue;
      this.broken.add(b.id);
      if (first) continue;
      const wall = BUILDINGS[b.type]?.wall;
      out.push({ kind: wall === 'gate' ? 'gateBreak' : wall ? 'wallBreak' : 'buildingBreak', x: b.x + b.w / 2, y: b.y + b.h / 2 });
    }
    for (const g of cur.sieges ?? []) {
      if ((g.type === 'ram' || g.type === 'coveredRam') && g.state === 'attack' && !first && struckSince(g.swing, gap)) out.push({ kind: 'ram', x: g.x, y: g.y });
    }
    for (const sh of cur.shots ?? []) {
      if (sh.siege === undefined) continue;
      const k = `${sh.by}:${sh.t0}`;
      if (!this.flying.has(k)) this.flying.set(k, { t1: sh.t1, x: sh.x1, y: sh.y1 });
    }
    for (const [k, f] of this.flying) {
      if (f.t1 > cur.tick) continue;
      if (cur.tick - f.t1 < 5) out.push({ kind: 'boulder', x: f.x, y: f.y });
      this.flying.delete(k);
    }
    for (const b of cur.bosses ?? []) {
      if (b.state !== 'slain') { this.slain.delete(b.id); continue; }
      if (this.slain.has(b.id)) continue;
      this.slain.add(b.id);
      if (!first) out.push({ kind: 'bossKill', x: b.x, y: b.y });
    }
    return out;
  }
}

/**
 * The hit-stop's budget: a stop at most every GAP ms, a light one (under LIGHT ms) only after a longer quiet (QUIET ms),
 * so a big fight full of blows freezes now and then, never in a stutter; a heavier stop within the gap is dropped too
 * (the shake and the sound still carry it).
 */
export class HitStop {
  static readonly GAP = 1100;
  static readonly QUIET = 2600;
  static readonly LIGHT = 50;
  until = 0;
  private last = -Infinity;

  /** Ask for a stop of `ms` at view time `now`; true when taken. */
  ask(now: number, ms: number): boolean {
    if (ms <= 0) return false;
    const since = now - this.last;
    if (since < HitStop.GAP || (ms < HitStop.LIGHT && since < HitStop.QUIET)) return false;
    this.last = now;
    this.until = now + ms;
    return true;
  }

  frozen(now: number): boolean {
    return now < this.until;
  }
}
