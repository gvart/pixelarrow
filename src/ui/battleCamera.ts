/**
 * Battle camera maths (CT-05, design/gdd/controls.md R7 "opening frame", R8,
 * F2). Pure: no Phaser, no sim. The scene measures boxes in world px
 * (isoToScreen) and the visible field band, and carries out the result
 * (zoom, centre, the edge pointers). Pinch, pan, the wheel and the eye stay
 * in BattleScene, unchanged.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** controls.md "Tuning Knobs": the lowest opening zoom (zoom units, 1 = the old 1x). */
export const OPEN_ZOOM_MIN = 0.75;
/** The opening never zooms closer than this. */
export const OPEN_ZOOM_MAX = 1;
/** F2 snaps the opening zoom to quarter steps. */
export const OPEN_ZOOM_STEP = 0.25;
/** Follow keeps the selected group this far (world px at 1x) inside the view's edge. */
export const FOLLOW_MARGIN = 24;
/** How fast (world px/s) follow may pull the view to keep the selected group in it: well above any man's run at 3x. */
export const FOLLOW_CATCH_UP = 1500;
/** An edge pointer sits this far (UI px) inside the field band. */
export const POINTER_INSET = 22;
/** Two taps on the same group card within this many ms centre the camera on it (R8.2). */
export const CARD_DOUBLE_TAP_MS = 350;
/** A pointer tap pans there in this many ms (instant under Reduce motion). */
export const RECENTRE_MS = 320;

/** The padded bounding box of points (null for none): x by `padX`, the top by `padTop` (men are tall), the bottom by `padBottom`. */
export function boxOf(pts: readonly Pt[], padX: number, padTop: number, padBottom: number): Box | null {
  if (pts.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0: x0 - padX, y0: y0 - padTop, x1: x1 + padX, y1: y1 + padBottom };
}

export function union(a: Box | null, b: Box | null): Box | null {
  if (!a) return b;
  if (!b) return a;
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

export function centreOf(b: Box): Pt {
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
}

export function isOnScreen(p: Pt, view: Box): boolean {
  return p.x >= view.x0 && p.x <= view.x1 && p.y >= view.y0 && p.y <= view.y1;
}

/**
 * F2, the deployment's opening zoom: frame both armies if that fits at
 * OPEN_ZOOM_MIN or closer, snapped down to a quarter (so it still fits),
 * never closer than 1x. Otherwise 1x and `fits: false` (the scene opens on
 * the player's army and the edge arrow points at the enemy).
 * `viewW`/`viewH` are the visible field band in 1x px (CSS px); `armies` is in world px.
 */
export function openingFrame(viewW: number, viewH: number, armies: Box): { zoom: number; fits: boolean } {
  const w = Math.max(1, armies.x1 - armies.x0);
  const h = Math.max(1, armies.y1 - armies.y0);
  const raw = Math.min(viewW / w, viewH / h);
  if (raw < OPEN_ZOOM_MIN) return { zoom: 1, fits: false };
  const z = Math.floor(Math.min(OPEN_ZOOM_MAX, raw) / OPEN_ZOOM_STEP + 1e-9) * OPEN_ZOOM_STEP;
  return { zoom: Math.max(OPEN_ZOOM_MIN, z), fits: true };
}

/**
 * R8.1, where follow looks: the centre of the melee plus the selected group
 * (or `fallback` without a melee), then moved the least it takes to keep the
 * whole selected group `margin` inside a `view` (world px) around it. A group
 * bigger than the view is centred. So follow never loses the selected group (K2).
 */
export function followCentre(melee: Box | null, group: Box | null, fallback: Pt, view: { w: number; h: number }, margin: number): Pt {
  const both = melee ? union(melee, group)! : null;
  return keepInView(both ? centreOf(both) : { ...fallback }, group, view, margin);
}

/**
 * Move a camera centre `c` the least it takes to keep the whole `group` box
 * `margin` inside a `view` (world px) around it; a group bigger than the view
 * is centred. Follow eases toward followCentre, then applies this hard (margin
 * 0), so a fast group never outruns the smoothing.
 */
export function keepInView(c: Pt, group: Box | null, view: { w: number; h: number }, margin: number): Pt {
  if (!group) return c;
  const keep = (v: number, lo: number, hi: number, half: number): number => {
    const min = hi - half + margin; // the centre at least this far along, or the group's far edge is cut
    const max = lo + half - margin; // at most this far, or its near edge is cut
    if (min > max) return (lo + hi) / 2;
    return Math.min(max, Math.max(min, v));
  };
  return { x: keep(c.x, group.x0, group.x1, view.w / 2), y: keep(c.y, group.y0, group.y1, view.h / 2) };
}

/**
 * R8.2, an edge pointer for an off-screen target: null while `target` is
 * inside `rect`; otherwise the point where the ray from the rect's centre to
 * the target crosses the rect inset by `inset`, and the ray's angle (radians,
 * 0 = right, PI/2 = down). All in one screen space (UI px).
 */
export function edgePointer(target: Pt, rect: Box, inset: number): { x: number; y: number; angle: number } | null {
  if (isOnScreen(target, rect)) return null;
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  const hw = Math.max(0, (rect.x1 - rect.x0) / 2 - inset);
  const hh = Math.max(0, (rect.y1 - rect.y0) / 2 - inset);
  const tx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty, 1);
  return { x: cx + dx * t, y: cy + dy * t, angle: Math.atan2(dy, dx) };
}
