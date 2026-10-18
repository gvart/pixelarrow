/**
 * Battle camera maths (CT-05, design/gdd/controls.md R7 "opening frame", R8,
 * F2). Pure: no Phaser, no sim. The scene measures boxes in world px
 * (isoToScreen) and the visible field band, and carries out the result
 * (zoom, centre, the edge pointers). Pinch, pan, the wheel and the eye stay
 * in BattleScene, unchanged.
 */
import { localDecimals } from '../i18n/numbers';

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

/**
 * controls.md "Tuning Knobs" OPEN_ZOOM_MIN (range 0.5-1): the lowest opening
 * zoom (zoom units, 1 = the old 1x). QA-03 S3-3 (CT-05 AC1): the deployment
 * opens with both armies in view at every phone size, which takes about 0.6x
 * at 320 wide, so the floor is the range's bottom. A man is ~20 px tall there:
 * the overview is for placing groups (their badges keep their size), and the
 * fight starts at 1x (OPEN_FIGHT_ZOOM), the readability floor (PLAY R5).
 */
export const OPEN_ZOOM_MIN = 0.5;
/** The opening never zooms closer than this. */
const OPEN_ZOOM_MAX = 1;
/** The opening zoom snaps down to this step (fine, so it never drops a whole quarter below the fit). */
const OPEN_ZOOM_STEP = 0.05;
/** The fight starts at least this close (zoom units): a man is ~34 px tall. */
export const OPEN_FIGHT_ZOOM = 1;
/** The zoom key's word: whole steps as "2×", the deployment's overview to a tenth ("0.6×", ru "0,6×"). */
export function zoomLabel(z: number): string {
  return z >= 0.995 ? `${Math.round(z)}×` : `${localDecimals(String(Math.floor(z * 10 + 1e-6) / 10))}×`;
}

/** Where a pinch settles (zoom units): whole steps from 1x up; under 1x the overview `lo` or 1x, whichever is nearer. */
export function snapZoom(z: number, lo: number): number {
  if (z >= 1 || lo >= 1) return Math.max(1, Math.round(z));
  return z < (lo + 1) / 2 ? lo : 1;
}

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
 * F2, the deployment's opening zoom: frame both armies if that fits at `min`
 * or closer, snapped down to OPEN_ZOOM_STEP (so it still fits), never closer
 * than 1x. Otherwise 1x and `fits: false` (the scene opens on the player's
 * army and the edge arrow points at the enemy).
 * `viewW`/`viewH` are the visible field band in 1x px (CSS px); `armies` is in world px.
 */
export function openingFrame(viewW: number, viewH: number, armies: Box, min = OPEN_ZOOM_MIN): { zoom: number; fits: boolean } {
  const w = Math.max(1, armies.x1 - armies.x0);
  const h = Math.max(1, armies.y1 - armies.y0);
  const raw = Math.min(viewW / w, viewH / h);
  if (raw < min) return { zoom: 1, fits: false };
  const z = Math.floor(Math.min(OPEN_ZOOM_MAX, raw) / OPEN_ZOOM_STEP + 1e-9) * OPEN_ZOOM_STEP;
  return { zoom: Math.max(min, Math.round(z * 100) / 100), fits: true };
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

/**
 * An edge pointer's spot clear of the field badges (QA-03 S3-3: the enemy
 * arrow sat over our IV badge): `p` slides along its edge of `rect` (inset by
 * `inset`), the least it takes so a disc of radius `r` touches no badge box.
 * A pointer on the left or right edge slides up or down, one on the top or
 * bottom edge sideways. Returns `p` when it is clear already or nothing is.
 */
export function clearOfBadges(p: Pt, badges: readonly Box[], rect: Box, inset: number, r: number): Pt {
  const hits = (q: Pt) => badges.some((b) => q.x + r > b.x0 && q.x - r < b.x1 && q.y + r > b.y0 && q.y - r < b.y1);
  if (!hits(p)) return p;
  const side = Math.abs(p.x - (rect.x0 + inset)) < 1 || Math.abs(rect.x1 - inset - p.x) < 1;
  const lo = side ? rect.y0 + inset : rect.x0 + inset;
  const hi = side ? rect.y1 - inset : rect.x1 - inset;
  const at = side ? p.y : p.x;
  for (let d = 2; d <= hi - lo; d += 2) {
    for (const v of [at - d, at + d]) {
      if (v < lo || v > hi) continue;
      const q = side ? { x: p.x, y: v } : { x: v, y: p.y };
      if (!hits(q)) return q;
    }
  }
  return p;
}
