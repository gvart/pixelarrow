/**
 * RD-02: the flank arc (design/gdd/battle-readability.md R4; GDD review N15).
 * Pure geometry and timing, no Phaser (battleFx.ts draws it):
 *  - `flanked`: a solid red arc with inward chevrons on the side of the group's
 *    badge the blow came from, +-60 degrees around the attack, for FLANK_ARC_S;
 *  - the threat before contact: a dashed arc on the side an enemy group is
 *    entering, while it heads into our flank or rear sector within 8 paces.
 * Presentation only: it reads sim state and events, never the sim RNG.
 */
import { isoDir } from '../art/iso';
import type { SimGroup, SimUnit } from '../sim/types';

/** The red arc lasts this long (s of battle time) after a `flanked` event (R4 knob FLANK_ARC_S). */
export const FLANK_ARC_S = 2;
/** An enemy group this close (paces, man to man) heading into our flank sector draws the dashed arc. */
export const THREAT_PACES = 8;
/** The arc spans +-60 degrees around the attack direction. */
export const ARC_HALF = Math.PI / 3;
/** At most this many threat arcs per group (the nearest ones). */
const MAX_THREATS = 2;

export interface Vec {
  x: number;
  y: number;
}

export type FlankSide = 'front' | 'left' | 'right' | 'rear';

/**
 * Where `from` lies around a group at `centre` facing `facing` (unit vector):
 * the sim's own split (hitDirection: dot > 0.45 front, < -0.35 rear), with the
 * side told left or right.
 */
export function flankSide(facing: Vec, centre: Vec, from: Vec): FlankSide {
  const dx = from.x - centre.x;
  const dy = from.y - centre.y;
  const d = Math.hypot(dx, dy) || 1;
  const dot = (dx * facing.x + dy * facing.y) / d;
  if (dot > 0.45) return 'front';
  if (dot < -0.35) return 'rear';
  return facing.x * dy - facing.y * dx < 0 ? 'left' : 'right';
}

/** An arc around a badge: its middle (screen radians, y down), the side, and solid (flanked) or dashed (threat). */
export interface ArcShape {
  mid: number;
  side: FlankSide;
  dashed: boolean;
}

/** The arc toward `from` around a group at `centre`: the attack direction projected to the screen. */
export function flankArc(facing: Vec, centre: Vec, from: Vec, dashed: boolean): ArcShape {
  const d = isoDir(from.x - centre.x, from.y - centre.y);
  return { mid: Math.atan2(d.y, d.x), side: flankSide(facing, centre, from), dashed };
}

/** `n` screen points along the arc on the ellipse (rx, ry) round (cx, cy). */
export function arcPath(a: ArcShape, cx: number, cy: number, rx: number, ry: number, n = 9): Vec[] {
  const pts: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const th = a.mid - ARC_HALF + (2 * ARC_HALF * i) / (n - 1);
    pts.push({ x: cx + rx * Math.cos(th), y: cy + ry * Math.sin(th) });
  }
  return pts;
}

/** A chevron: its tip on the arc, its arms outside, pointing in at the badge. */
interface Chevron {
  tip: Vec;
  l: Vec;
  r: Vec;
}

/** The solid arc's chevrons, spread along it (a dashed threat arc has none). */
export function arcChevrons(a: ArcShape, cx: number, cy: number, rx: number, ry: number, count = 2): Chevron[] {
  if (a.dashed) return [];
  const out: Chevron[] = [];
  const at = (th: number, k: number): Vec => ({ x: cx + rx * k * Math.cos(th), y: cy + ry * k * Math.sin(th) });
  for (let i = 0; i < count; i++) {
    const th = count === 1 ? a.mid : a.mid - ARC_HALF / 2 + (ARC_HALF * i) / (count - 1);
    out.push({ tip: at(th, 1), l: at(th - 0.22, 1.45), r: at(th + 0.22, 1.45) });
  }
  return out;
}

/** The red arcs: the last `flanked` event per group and where the blow came from. */
export class FlankWatch {
  private last = new Map<number, { at: number; from: Vec }>();

  /** Group `gid` was flanked at `at` (s of battle time) by a man standing at `from` (field). */
  flanked(gid: number, at: number, from: Vec): void {
    this.last.set(gid, { at, from });
  }

  /** Where the blow came from while the arc shows (FLANK_ARC_S), else null. A new event refreshes, never stacks. */
  solid(gid: number, now: number): Vec | null {
    const f = this.last.get(gid);
    return f && now >= f.at && now - f.at < FLANK_ARC_S ? f.from : null;
  }
}

/** What the threat test reads from the battle (a `Battle` fits). */
export interface ThreatSim {
  groups: readonly SimGroup[];
  activeMembers(gid: number): readonly SimUnit[];
}

function centre(men: readonly SimUnit[]): Vec {
  return { x: men.reduce((a, u) => a + u.x, 0) / men.length, y: men.reduce((a, u) => a + u.y, 0) / men.length };
}

/**
 * N15, the dashed arc before contact: the centres (field) of the enemy groups
 * within THREAT_PACES of group `gid` (man to man), in its flank or rear sector,
 * moving toward it and not yet in melee; nearest first, at most 2. None for a
 * routed, lone or orb group (the orb has no flanks).
 */
export function flankThreats(sim: ThreatSim, gid: number): Vec[] {
  const g = sim.groups[gid];
  if (!g || g.routed || g.disbanded || g.individual || g.formation.type === 'orb') return [];
  const mine = sim.activeMembers(gid);
  if (!mine.length) return [];
  const c = centre(mine);
  const facing = { x: g.formation.fx, y: g.formation.fy };
  const found: { at: Vec; d: number }[] = [];
  for (const e of sim.groups) {
    if (e.side === g.side || e.disbanded || e.routed) continue;
    const men = sim.activeMembers(e.id);
    if (!men.length || men.some((u) => u.engaged)) continue;
    const ec = centre(men);
    if (flankSide(facing, c, ec) === 'front') continue;
    let d = Infinity;
    for (const u of men) for (const m of mine) d = Math.min(d, Math.hypot(u.x - m.x, u.y - m.y));
    if (d > THREAT_PACES) continue;
    const vx = men.reduce((a, u) => a + u.vx, 0) / men.length;
    const vy = men.reduce((a, u) => a + u.vy, 0) / men.length;
    if (vx * (c.x - ec.x) + vy * (c.y - ec.y) <= 1e-6) continue;
    found.push({ at: ec, d });
  }
  return found.sort((a, b) => a.d - b.d).slice(0, MAX_THREATS).map((f) => f.at);
}
