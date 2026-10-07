/**
 * Formation drag gestures (pure, no Phaser), in field coordinates.
 *
 * Two plain direct-manipulation gestures on the selected group; the SHAPE
 * (line, column, wedge, loose, shield wall and its files x ranks) comes only
 * from the formation buttons, so a drag never changes it.
 *
 * - MOVE: press on the group (any soldier or its placement marker) and drag.
 *   The group follows the finger, keeping the offset at which it was grabbed,
 *   its facing and its shape. Lift to order.
 * - TURN: press on the facing arrow's knob in front of the group and drag. The
 *   group turns in place around its centre to face TOWARD the finger (the
 *   arrow points where the finger is). Within SNAP of one of the eight field
 *   directions the facing snaps to it (a haptic tick), so straight lines are
 *   easy. Closer than MIN_TURN to the centre the facing does not change.
 *
 * Cancel (no order): a move lifted back within CANCEL of its start point, or a
 * turn that changed the facing by less than TURN_MIN_DEG.
 *
 * All distances are multiplied by the scale `k` the scene passes (1 / camera
 * zoom), so the gestures feel the same on screen at any zoom.
 */
import { rightOf } from '../sim/formation';

/** The facing knob (the turn handle) sits this many paces ahead of the front-rank centre. */
export const KNOB_PACES = 3;
/** Lifting a move this close to its start point cancels it. */
export const CANCEL = 0.5;
/** Closer than this to the pivot, the finger does not turn the group. */
export const MIN_TURN = 0.6;
/** Snap the facing to one of the eight field directions within this angle (degrees). */
export const SNAP_DEG = 8;
/** A turn smaller than this (degrees) is no order. */
export const TURN_MIN_DEG = 4;

export type DragKind = 'move' | 'turn';

export interface DragGroup {
  /** Current anchor (front-rank centre), facing and frontage of the group. */
  cx: number;
  cy: number;
  fx: number;
  fy: number;
  frontage: number;
  /** Soldiers that will take the formation. */
  n: number;
  /** Centre the group turns around (the middle of its block). Missing = the anchor. */
  px?: number;
  py?: number;
}

export interface DragState {
  kind: DragKind;
  g: DragGroup;
  k: number;
  /** Press point. */
  sx: number;
  sy: number;
  /** Planned anchor and facing. */
  ax: number;
  ay: number;
  fx: number;
  fy: number;
  /** The facing is snapped to a field direction. */
  snapped: boolean;
  /** Last finger point. */
  x: number;
  y: number;
}

export interface DragEvents {
  /** The facing just snapped to a field direction. */
  snapped?: boolean;
}

export interface DragPlan {
  cx: number;
  cy: number;
  fx: number;
  fy: number;
  frontage: number;
  files: number;
  ranks: number;
  kind: DragKind;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const D = Math.SQRT1_2;
/** The eight field directions a facing snaps to. */
const DIRS: [number, number][] = [
  [0, -1],
  [D, -D],
  [1, 0],
  [D, D],
  [0, 1],
  [-D, D],
  [-1, 0],
  [-D, -D],
];

export function dragStart(kind: DragKind, g: DragGroup, x: number, y: number, k = 1): DragState {
  return { kind, g, k, sx: x, sy: y, ax: g.cx, ay: g.cy, fx: g.fx, fy: g.fy, snapped: false, x, y };
}

export function dragMove(s: DragState, x: number, y: number): DragEvents {
  s.x = x;
  s.y = y;
  const g = s.g;
  if (s.kind === 'move') {
    s.ax = g.cx + (x - s.sx);
    s.ay = g.cy + (y - s.sy);
    return {};
  }
  const px = g.px ?? g.cx;
  const py = g.py ?? g.cy;
  const dx = x - px;
  const dy = y - py;
  const len = Math.hypot(dx, dy);
  const was = s.snapped;
  if (len < MIN_TURN * s.k) {
    s.fx = g.fx;
    s.fy = g.fy;
    s.snapped = false;
  } else {
    let fx = dx / len;
    let fy = dy / len;
    const cos = Math.cos((SNAP_DEG * Math.PI) / 180);
    s.snapped = false;
    for (const [ux, uy] of DIRS) {
      if (fx * ux + fy * uy >= cos) {
        fx = ux;
        fy = uy;
        s.snapped = true;
        break;
      }
    }
    s.fx = fx;
    s.fy = fy;
  }
  // the anchor swings around the pivot with the block
  const r0 = rightOf(g.fx, g.fy);
  const along = (g.cx - px) * g.fx + (g.cy - py) * g.fy;
  const lat = (g.cx - px) * r0.x + (g.cy - py) * r0.y;
  const r1 = rightOf(s.fx, s.fy);
  s.ax = px + s.fx * along + r1.x * lat;
  s.ay = py + s.fy * along + r1.y * lat;
  return s.snapped && !was ? { snapped: true } : {};
}

/** What lifting the finger now would order; null = cancel (no order). */
export function dragPlan(s: DragState): DragPlan | null {
  const g = s.g;
  if (s.kind === 'move') {
    if (Math.hypot(s.x - s.sx, s.y - s.sy) < CANCEL * s.k) return null;
  } else if (s.fx * g.fx + s.fy * g.fy > Math.cos((TURN_MIN_DEG * Math.PI) / 180)) {
    return null;
  }
  const n = Math.max(1, g.n);
  const files = clamp(Math.round(g.frontage), 1, n);
  return { cx: s.ax, cy: s.ay, fx: s.fx, fy: s.fy, frontage: g.frontage, files, ranks: Math.ceil(n / files), kind: s.kind };
}

/** A whole gesture along a finger path (tests and scripted input). */
export function dragPath(kind: DragKind, g: DragGroup, path: [number, number][], k = 1): DragPlan | null {
  const s = dragStart(kind, g, path[0][0], path[0][1], k);
  for (const [x, y] of path.slice(1)) dragMove(s, x, y);
  return dragPlan(s);
}
