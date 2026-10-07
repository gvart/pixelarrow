/**
 * Formation drag gesture maths (pure, no Phaser), in field coordinates.
 *
 * Touch where the group should stand, then pull: the soldiers face the
 * direction the finger moves, the line is laid perpendicular to it and
 * centred on the touch point. A short pull only turns the group; every
 * DEPTH_STEP of pull beyond SHORT_PULL adds a rank (the frontage shrinks).
 */

/** Below this pull (field units) the facing is kept: it is a tap-and-hold, not a drag. */
export const MIN_PULL = 0.6;
/** Pulls up to this length only rotate the group. */
export const SHORT_PULL = 2.5;
/** Each further step of this length adds a rank. */
export const DEPTH_STEP = 1.5;

export interface DragFormation {
  cx: number;
  cy: number;
  fx: number;
  fy: number;
  frontage: number;
}

export function dragFormation(ax: number, ay: number, bx: number, by: number, n: number, frontage: number, fx0: number, fy0: number): DragFormation {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  const files = Math.max(1, Math.min(Math.max(1, n), Math.round(frontage)));
  if (len < MIN_PULL) return { cx: ax, cy: ay, fx: fx0, fy: fy0, frontage: files };
  const baseDepth = Math.ceil(n / files);
  const extra = Math.floor(Math.max(0, len - SHORT_PULL) / DEPTH_STEP);
  const depth = Math.max(1, Math.min(n, baseDepth + extra));
  return { cx: ax, cy: ay, fx: dx / len, fy: dy / len, frontage: Math.max(1, Math.ceil(n / depth)) };
}
