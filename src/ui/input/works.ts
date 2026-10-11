/**
 * The works tray and placement in deployment (design/gdd/field-works.md
 * "Touch UI needs", R3, R4; controls.md R7; FW-03).
 *
 * - The tray: one row per work (stakes, ditch, laager) with its cost, how
 *   many more can go down, and why not (the cap, the supplies, the allowance).
 * - The ghost: the segment a `work` order would lay, centred on a cell and
 *   laid across the facing (the same cells as the sim's), valid or not with
 *   the sim's own reason (Battle.workRefusal) or the purse's.
 * - The facing: one of the 8 grid directions; Turn steps it 45 degrees.
 *
 * Pure: no Phaser, no scene (ADR-0004). The sim validates every order again.
 */
import { WORKS } from '../../data/terrain';
import { WORK_TYPES, type WorkType, type WorksAllowance } from '../../sim/types';
import { canAffordWork, worksCost } from '../../game/campaign';
import type { Pt } from './hitTest';

/** sin 22.5 degrees: the sim snaps a facing to the nearest of the 8 grid directions (src/sim/battle.ts). */
const SIN22 = 0.3826834323650898;

/** Why a work cannot go down: the sim's reasons (Battle.workRefusal) and the purse's. */
export type WorkWhy = 'phase' | 'type' | 'allowance' | 'bounds' | 'zone' | 'occupied' | 'ground' | 'supplies' | 'cap';

/** The field and its grid, as the sim lays a segment on them. */
export interface WorkGrid {
  /** Grid cells across and down (no grid: one cell per pace). */
  w: number;
  h: number;
  /** The field in paces. */
  width: number;
  height: number;
}

/** A segment the player is about to lay: its type, the field point under it and its facing. */
export interface WorkGhost {
  type: WorkType;
  x: number;
  y: number;
  fx: number;
  fy: number;
}

/** The grid step along a segment laid across facing (fx, fy): right of the facing, snapped to 8 directions. */
export function workStep(fx: number, fy: number): { sx: number; sy: number } {
  const l = Math.hypot(fx, fy) || 1;
  // right of the facing (src/sim/formation rightOf): (-fy, fx)
  const rx = -fy / l;
  const ry = fx / l;
  const snap = (v: number) => (v >= SIN22 ? 1 : v <= -SIN22 ? -1 : 0);
  return { sx: snap(rx), sy: snap(ry) };
}

/**
 * The cells (grid indices) a segment of `type` covers when laid at (x, y)
 * across (fx, fy), exactly as the sim lays it (Battle.segmentCells); null off
 * the grid or with no facing.
 */
export function workCells(type: WorkType, x: number, y: number, fx: number, fy: number, g: WorkGrid): number[] | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !(Math.hypot(fx, fy) > 1e-6)) return null;
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return null;
  const { sx, sy } = workStep(fx, fy);
  const cx = Math.floor((x * g.w) / g.width);
  const cy = Math.floor((y * g.h) / g.height);
  const n = WORKS.length[type];
  const out: number[] = [];
  for (let k = -Math.floor((n - 1) / 2); out.length < n; k++) {
    const ix = cx + sx * k;
    const iy = cy + sy * k;
    if (ix < 0 || iy < 0 || ix >= g.w || iy >= g.h) return null;
    out.push(iy * g.w + ix);
  }
  return out;
}

/** The centre of grid cell `i` on the field. */
export function cellCentre(i: number, g: WorkGrid): Pt {
  return { x: ((i % g.w) + 0.5) * (g.width / g.w), y: (Math.floor(i / g.w) + 0.5) * (g.height / g.h) };
}

/** The grid cell under field point (x, y), or -1 off the field. */
export function cellAt(x: number, y: number, g: WorkGrid): number {
  if (!(x >= 0 && y >= 0 && x < g.width && y < g.height)) return -1;
  return Math.floor((y * g.h) / g.height) * g.w + Math.floor((x * g.w) / g.width);
}

/** Which of the 8 facings (0 = "up", -y; then clockwise on the field, 45 degrees apart) is nearest (fx, fy). */
function dirIndex(fx: number, fy: number): number {
  const k = Math.round((Math.atan2(fy, fx) + Math.PI / 2) / (Math.PI / 4));
  return ((k % 8) + 8) % 8;
}

/** Facing number `k` of the 8, as a unit vector. */
function dirOf(k: number): Pt {
  const a = -Math.PI / 2 + (k * Math.PI) / 4;
  const r = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v);
  return { x: r(Math.cos(a)), y: r(Math.sin(a)) };
}

/** The facing snapped to the nearest of the 8 grid directions (unit length). */
export function snapFacing(fx: number, fy: number): Pt {
  return dirOf(dirIndex(fx, fy));
}

/** Turn: the next of the 8 facings, 45 degrees clockwise on the field. */
export function turnFacing(fx: number, fy: number): Pt {
  return dirOf(dirIndex(fx, fy) + 1);
}

/**
 * Where a new ghost first stands: across the middle of the side's deployment
 * zone, a pace and a half in from its front (the edge toward the enemy),
 * facing the enemy's zone.
 */
export function firstGhost(type: WorkType, zone: { y0: number; y1: number }, foe: { y0: number; y1: number }, width: number): WorkGhost {
  const up = (foe.y0 + foe.y1) / 2 < (zone.y0 + zone.y1) / 2;
  const y = up ? zone.y0 + 1.5 : zone.y1 - 1.5;
  return { type, x: Math.floor(width / 2) + 0.5, y: Math.floor(y) + 0.5, fx: 0, fy: up ? -1 : 1 };
}

/** What the tray shows for one work. */
export interface TrayRow {
  type: WorkType;
  /** Supplies it costs (R4.1). */
  cost: number;
  /** How many more of it can go down now (0 with a reason). */
  left: number;
  /** Why none can, or null. */
  why: WorkWhy | null;
}

/** The purse and the allowance the tray reads. */
export interface TrayCtx {
  /** Supplies on hand (WorldSave.supplies), before this battle's works are paid. */
  supplies: number;
  /** The player's segments on the field now (Battle.works(), own side). */
  placed: readonly { type: WorkType }[];
  /** The allowance the battle was set up with (ArmySpec.works). */
  allow: WorksAllowance;
  /** A band caught the player: one segment at most (R4.2). */
  caught: boolean;
}

/** The tray's rows, stakes, ditch and laager in that order. */
export function trayRows(c: TrayCtx): TrayRow[] {
  const cap = c.caught ? WORKS.caught : WORKS.max;
  const purse = Math.max(0, c.supplies - worksCost(c.placed));
  return WORK_TYPES.map((type) => {
    const cost = WORKS.cost[type];
    const same = c.placed.filter((w) => w.type === type).length;
    const left = Math.max(0, Math.min(cap - c.placed.length, (c.allow[type] ?? 0) - same, Math.floor(purse / cost)));
    const why: WorkWhy | null = c.placed.length >= cap ? 'cap' : !canAffordWork(c.supplies, c.placed, type, c.caught) ? 'supplies' : left <= 0 ? 'allowance' : null;
    return { type, cost, left: why ? 0 : left, why };
  });
}

/**
 * Whether the ghost can go down: the purse's reason first (the tray's own
 * check), then the sim's (`refusal`, Battle.workRefusal for this ghost).
 */
export function ghostWhy(row: TrayRow | undefined, refusal: string | null): WorkWhy | null {
  if (row?.why) return row.why;
  return (refusal as WorkWhy | null) ?? null;
}

/**
 * The `work` order that lays segment `seg` again exactly (its cells, in the
 * same order): the undo of an `unwork`. A segment's cells run along the step
 * right of its facing from its centre cell, so the facing is the step turned
 * back a quarter.
 */
export function layAgain(seg: { type: WorkType; cells: readonly number[] }, g: WorkGrid): { kind: 'work'; type: WorkType; x: number; y: number; fx: number; fy: number } {
  const n = seg.cells.length;
  const at = seg.cells[Math.floor((n - 1) / 2)];
  const c = cellCentre(at, g);
  const a = seg.cells[0];
  const b = seg.cells[n > 1 ? 1 : 0];
  const dx = (b % g.w) - (a % g.w);
  const dy = Math.floor(b / g.w) - Math.floor(a / g.w);
  // right of (fx, fy) is (-fy, fx) = (dx, dy)
  return { kind: 'work', type: seg.type, x: c.x, y: c.y, fx: n > 1 ? dy : 0, fy: n > 1 ? -dx : -1 };
}

/** The own segment covering grid cell `cell`, as an index into `works`, or -1. */
export function segmentAt(works: readonly { side: number; cells: readonly number[] }[], side: number, cell: number): number {
  if (cell < 0) return -1;
  return works.findIndex((w) => w.side === side && w.cells.includes(cell));
}
