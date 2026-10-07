/**
 * Slingshot formation gesture (pure, no Phaser), in field coordinates.
 *
 * The finger presses on (or near) the selected group or its placement marker.
 *
 * 1. CARRY: dragging moves the group's anchor (the centre of its front rank)
 *    with the finger, keeping the offset at which it was grabbed.
 * 2. AIM: the anchor locks when the finger turns back on itself (a reversal of
 *    at least REVERSE), when it rests for a moment while carrying (the scene
 *    calls `slingDwell`), or straight away when the very first motion is a pull
 *    backwards (within 60 degrees of the group's rear): "grab and pull back"
 *    re-aims the group where it stands.
 *    While aiming, the soldiers face AWAY from the finger (like a slingshot):
 *    facing = -(finger - grab point), the grab point being where the finger
 *    was when the anchor locked. Once the pull reaches LOCK the facing locks
 *    (haptic tick); bringing the finger back within UNLOCK of the grab point frees
 *    it again.
 * 3. SHAPE (facing locked): measured in the locked facing frame,
 *      side = |finger offset across the facing| (from the grab point),
 *      back = how much further back than the lock point the finger is pulled.
 *    ranks = base ranks + steps(back - side), one rank per STEP: pulling
 *    further back adds ranks (deeper, narrower), pushing sideways (either way)
 *    or forward takes ranks away (a wider line). Ranks are clamped to
 *    [1, min(n, MAX_RANKS)] and snapped so frontage = ceil(n / ranks) and the
 *    label reads "files x ranks".
 * 4. LIFT commits. Cancel (no order): the finger lifted back on its start
 *    point (within CANCEL), or a tiny pull (< MIN_PULL) from a group that was
 *    not carried anywhere. A carried group lifted after a tiny pull just moves
 *    there keeping its facing and shape.
 *
 * All distances are multiplied by the scale `k` the scene passes (2 / camera
 * zoom), so the gesture feels the same on screen at any zoom.
 */
import { rightOf } from '../sim/formation';

/** Finger travel before the first motion picks carry vs immediate aim. */
export const MOVE_MIN = 0.35;
/** A turn-back of this length locks the anchor (carry -> aim). */
export const REVERSE = 0.6;
/** Below this pull there is no facing: lifting here cancels (unless carried). */
export const MIN_PULL = 0.5;
/** The facing locks once the pull is this long... */
export const LOCK = 1.2;
/** ...and unlocks when the finger comes back this close to the anchor. */
export const UNLOCK = 0.6;
/** One rank more or less per STEP of (back - side). */
export const STEP = 1.0;
/** Lifting this close to the start point cancels. */
export const CANCEL = 0.5;
/** Never deeper than this many ranks. */
export const MAX_RANKS = 8;

export interface SlingGroup {
  /** Current anchor (front-rank centre), facing and frontage of the group. */
  cx: number;
  cy: number;
  fx: number;
  fy: number;
  frontage: number;
  /** Soldiers that will take the formation. */
  n: number;
}

export interface SlingState {
  phase: 'pending' | 'carry' | 'aim';
  g: SlingGroup;
  k: number;
  /** Press point. */
  sx: number;
  sy: number;
  /** Grab offset: anchor - finger while carrying. */
  ox: number;
  oy: number;
  /** Anchor: where the group will stand. */
  ax: number;
  ay: number;
  /** Carry: furthest finger point along the carry and the carry direction. */
  ex: number;
  ey: number;
  dx: number;
  dy: number;
  carried: boolean;
  /** Aim: the pull is measured from this point (the finger when the anchor locked). */
  qx: number;
  qy: number;
  /** Aim: facing lock. */
  locked: boolean;
  lx: number;
  ly: number;
  fx: number;
  fy: number;
  baseRanks: number;
  ranks: number;
  /** Last finger point. */
  px: number;
  py: number;
}

export interface SlingEvents {
  /** The anchor just locked (carry -> aim). */
  anchored?: boolean;
  /** The facing just locked. */
  locked?: boolean;
  /** The number of ranks just changed. */
  ranks?: boolean;
}

export interface DragFormation {
  cx: number;
  cy: number;
  fx: number;
  fy: number;
  frontage: number;
}

export interface SlingPlan extends DragFormation {
  files: number;
  ranks: number;
  /** The facing is set by the pull (false: the group keeps its facing). */
  aimed: boolean;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** Whole steps toward zero: a dead zone of one step around the lock point. */
const steps = (v: number, step: number) => Math.sign(v) * Math.floor(Math.abs(v) / step);

export function maxRanks(n: number): number {
  return Math.max(1, Math.min(Math.max(1, n), MAX_RANKS));
}

/** Files and ranks for n soldiers in `ranks` ranks (snapped to whole ranks). */
export function shapeFor(n: number, ranks: number): { files: number; ranks: number } {
  const nn = Math.max(1, n);
  const r = clamp(Math.round(ranks), 1, maxRanks(nn));
  const files = Math.ceil(nn / r);
  return { files, ranks: Math.ceil(nn / files) };
}

function ranksOf(g: SlingGroup): number {
  const n = Math.max(1, g.n);
  const files = clamp(Math.round(g.frontage), 1, n);
  return shapeFor(n, Math.ceil(n / files)).ranks;
}

export function slingStart(g: SlingGroup, x: number, y: number, k = 1): SlingState {
  const r = ranksOf(g);
  return {
    phase: 'pending',
    g,
    k,
    sx: x,
    sy: y,
    ox: g.cx - x,
    oy: g.cy - y,
    ax: g.cx,
    ay: g.cy,
    ex: x,
    ey: y,
    dx: 0,
    dy: 0,
    carried: false,
    qx: x,
    qy: y,
    locked: false,
    lx: x,
    ly: y,
    fx: g.fx,
    fy: g.fy,
    baseRanks: r,
    ranks: r,
    px: x,
    py: y,
  };
}

/** The finger rested: lock the anchor where it is now and start aiming. */
export function slingDwell(s: SlingState): SlingEvents {
  if (s.phase === 'aim') return {};
  s.phase = 'aim';
  s.qx = s.px;
  s.qy = s.py;
  return { anchored: true, ...aim(s, s.px, s.py) };
}

export function slingMove(s: SlingState, x: number, y: number): SlingEvents {
  s.px = x;
  s.py = y;
  const k = s.k;
  if (s.phase === 'pending') {
    const dx = x - s.sx;
    const dy = y - s.sy;
    const len = Math.hypot(dx, dy);
    if (len < MOVE_MIN * k) return {};
    // first motion straight back from the group: aim it where it stands
    if ((dx * -s.g.fx + dy * -s.g.fy) / len > 0.5) {
      s.phase = 'aim';
      s.qx = s.sx;
      s.qy = s.sy;
      return { anchored: true, ...aim(s, x, y) };
    }
    s.phase = 'carry';
    s.dx = dx / len;
    s.dy = dy / len;
  }
  if (s.phase === 'carry') {
    const dx = x - s.ex;
    const dy = y - s.ey;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return {};
    if (dx * s.dx + dy * s.dy >= -0.3 * len) {
      // still carrying: the anchor follows the finger
      s.ex = x;
      s.ey = y;
      s.ax = x + s.ox;
      s.ay = y + s.oy;
      s.carried = true;
      if (len > 0.15 * k) {
        const nx = s.dx * 0.5 + dx / len;
        const ny = s.dy * 0.5 + dy / len;
        const nl = Math.hypot(nx, ny) || 1;
        s.dx = nx / nl;
        s.dy = ny / nl;
      }
      return {};
    }
    if (len < REVERSE * k) return {}; // turning back: wait for a clear pull
    s.phase = 'aim';
    s.qx = s.ex;
    s.qy = s.ey;
    return { anchored: true, ...aim(s, x, y) };
  }
  return aim(s, x, y);
}

function aim(s: SlingState, x: number, y: number): SlingEvents {
  const k = s.k;
  const px = x - s.qx;
  const py = y - s.qy;
  const len = Math.hypot(px, py);
  const ev: SlingEvents = {};
  const prev = s.ranks;
  if (s.locked && len < UNLOCK * k) {
    s.locked = false;
    s.ranks = s.baseRanks;
  }
  if (!s.locked) {
    if (len >= MIN_PULL * k) {
      s.fx = -px / len;
      s.fy = -py / len;
    } else {
      s.fx = s.g.fx;
      s.fy = s.g.fy;
    }
    if (len >= LOCK * k) {
      s.locked = true;
      s.lx = x;
      s.ly = y;
      ev.locked = true;
    }
  }
  if (s.locked) {
    const r = rightOf(s.fx, s.fy);
    const side = Math.abs(px * r.x + py * r.y);
    const back = (x - s.lx) * -s.fx + (y - s.ly) * -s.fy;
    s.ranks = shapeFor(s.g.n, s.baseRanks + steps(back - side, STEP * k)).ranks;
  }
  if (s.ranks !== prev) ev.ranks = true;
  return ev;
}

/** What lifting the finger now would order; null = cancel (no order). */
export function slingPlan(s: SlingState): SlingPlan | null {
  const k = s.k;
  if (s.phase === 'pending') return null;
  if (Math.hypot(s.px - s.sx, s.py - s.sy) < CANCEL * k) return null;
  const pull = Math.hypot(s.px - s.qx, s.py - s.qy);
  const aimed = s.phase === 'aim' && pull >= MIN_PULL * k;
  if (!aimed && !s.carried) return null;
  const shape = shapeFor(s.g.n, s.ranks);
  return {
    cx: s.ax,
    cy: s.ay,
    fx: aimed ? s.fx : s.g.fx,
    fy: aimed ? s.fy : s.g.fy,
    frontage: shape.files,
    files: shape.files,
    ranks: shape.ranks,
    aimed,
  };
}

/** A whole gesture along a finger path (tests and scripted input). */
export function slingPath(g: SlingGroup, path: [number, number][], k = 1): SlingPlan | null {
  const s = slingStart(g, path[0][0], path[0][1], k);
  for (const [x, y] of path.slice(1)) slingMove(s, x, y);
  return slingPlan(s);
}
