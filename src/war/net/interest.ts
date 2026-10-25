/**
 * Interest management for the live region (./protocol.ts). Each tick the server builds one coarse vision mask for all
 * teams (bit `team` of a cell is set within VISION tiles of a living unit or a standing building of that team: the
 * alliance shares sight), then each client gets:
 *   - its own squads' units, always (selection, minimap);
 *   - its team's buildings and engines (and carts of his), always;
 *   - any other unit, building, engine or new shot that its team sees AND that lies inside its camera rect plus CAMERA_MARGIN.
 * No camera rect yet: the camera counts as the whole map.
 */
import type { BuildingSnap, ShotSnap, SiegeSnap, Snapshot, SquadSnap, UnitSnap } from '../types';
import { CAMERA_MARGIN, VISION } from './protocol';

/** Vision cell size in tiles. */
export const CELL = 8;

export interface Rect { x0: number; y0: number; x1: number; y1: number }

/**
 * The one hook the per-client filter uses: does `team` see tile (x,y)? VisionMap below is the M3 radius rule; the sim's
 * fog of war (W-39, src/war/sim/vision.ts) can stand in for it by implementing this.
 */
export interface TeamVision { sees(team: number, x: number, y: number): boolean }

export class VisionMap implements TeamVision {
  readonly cw: number;
  readonly ch: number;
  /** Bit `team` (0..7) per cell. */
  readonly mask: Uint8Array;
  private disc: number[] = [];
  private stamp: Int32Array;
  private gen = 0;

  constructor(w: number, h: number, radius = VISION) {
    this.cw = Math.ceil(w / CELL);
    this.ch = Math.ceil(h / CELL);
    this.mask = new Uint8Array(this.cw * this.ch);
    this.stamp = new Int32Array(this.cw * this.ch * 8);
    // cells whose nearest point lies within radius of a point anywhere in the centre cell
    const r = Math.ceil(radius / CELL) + 1;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const gx = Math.max(0, Math.abs(dx) - 1) * CELL, gy = Math.max(0, Math.abs(dy) - 1) * CELL;
        if (gx * gx + gy * gy <= radius * radius) this.disc.push(dx, dy);
      }
  }

  /** Rebuild from a snapshot (team of each unit through its squad). */
  build(snap: Snapshot): void {
    this.mask.fill(0);
    this.gen++;
    const team = new Map<number, number>();
    for (const s of snap.squads) team.set(s.id, s.team);
    for (const u of snap.units) if (u.state !== 'dead') this.mark(team.get(u.squad) ?? -1, u.x, u.y);
    for (const b of snap.buildings ?? []) if (b.state !== 'destroyed') this.mark(b.team, b.x, b.y);
  }

  private mark(team: number, x: number, y: number): void {
    if (team < 0 || team > 7) return;
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), c = cy * this.cw + cx;
    if (cx < 0 || cy < 0 || cx >= this.cw || cy >= this.ch) return;
    // one unit per cell and team is enough: the disc is the same
    if (this.stamp[c * 8 + team] === this.gen) return;
    this.stamp[c * 8 + team] = this.gen;
    const bit = 1 << team, d = this.disc;
    for (let i = 0; i < d.length; i += 2) {
      const x2 = cx + d[i], y2 = cy + d[i + 1];
      if (x2 >= 0 && y2 >= 0 && x2 < this.cw && y2 < this.ch) this.mask[y2 * this.cw + x2] |= bit;
    }
  }

  sees(team: number, x: number, y: number): boolean {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    if (cx < 0 || cy < 0 || cx >= this.cw || cy >= this.ch) return false;
    return ((this.mask[cy * this.cw + cx] >> team) & 1) === 1;
  }
}

const inRect = (r: Rect | null, x: number, y: number) => !r || (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);

/** The camera rect grown by the margin (null: everything). */
export function interestRect(cam: Rect | null, margin = CAMERA_MARGIN): Rect | null {
  return cam ? { x0: Math.min(cam.x0, cam.x1) - margin, y0: Math.min(cam.y0, cam.y1) - margin, x1: Math.max(cam.x0, cam.x1) + margin, y1: Math.max(cam.y0, cam.y1) + margin } : null;
}

export interface Visible { units: UnitSnap[]; squads: SquadSnap[]; shots: ShotSnap[]; buildings: BuildingSnap[]; sieges: SiegeSnap[] }

/**
 * What one client (owner string, team) gets this tick. `newShots`: shots loosed since the last frame (all in-flight
 * ones on a keyframe); one is sent when either end is seen and inside the rect.
 */
export function visibleTo(snap: Snapshot, vision: TeamVision, owner: string, team: number, cam: Rect | null, newShots: ShotSnap[]): Visible {
  const r = interestRect(cam);
  const squadOf = new Map<number, SquadSnap>();
  for (const s of snap.squads) squadOf.set(s.id, s);
  const units: UnitSnap[] = [], used = new Set<number>();
  for (const u of snap.units) {
    const s = squadOf.get(u.squad);
    if (!s) continue;
    if (s.owner === owner || (vision.sees(team, u.x, u.y) && inRect(r, u.x, u.y))) {
      units.push(u);
      used.add(s.id);
    }
  }
  const squads = snap.squads.filter((s) => used.has(s.id) || s.owner === owner);
  const ok = (x: number, y: number) => vision.sees(team, x, y) && inRect(r, x, y);
  const shots = newShots.filter((s) => ok(s.x0, s.y0) || ok(s.x1, s.y1));
  const buildings = (snap.buildings ?? []).filter((b) => b.team === team || ok(b.x, b.y));
  const sieges = (snap.sieges ?? []).filter((e) => e.team === team || e.owner === owner || ok(e.x, e.y));
  return { units, squads, shots, buildings, sieges };
}
