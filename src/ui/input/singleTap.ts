/**
 * Single-tap alternatives to the battle's drags and pinches (WCAG 2.5.1,
 * A11Y-14; design/gdd/controls.md R11), and the left-hand mirror (A11Y-16):
 * - facing pips: tap the knob, then tap one of eight directions;
 * - the zoom key: each tap steps the zoom 1x, 2x, 3x, then back to 1x.
 *
 * Pure: no Phaser, no scene (ADR-0004).
 */
import type { Pt } from './hitTest';

const D = Math.SQRT1_2;
/** The eight field directions a facing pip turns the group to (the knob snaps to the same eight). */
export const FACING_DIRS: readonly Pt[] = [
  { x: 0, y: -1 },
  { x: D, y: -D },
  { x: 1, y: 0 },
  { x: D, y: D },
  { x: 0, y: 1 },
  { x: -D, y: D },
  { x: -1, y: 0 },
  { x: -D, y: -D },
];

/** The zoom (whole units, 1..3) the zoom key goes to next. */
export function nextZoom(z: number): number {
  const r = Math.round(z);
  return r >= 3 ? 1 : r + 1;
}

/** The pip under a tap at `p` (the nearest within `r`), or -1. */
export function pipAt(pips: readonly Pt[], p: Pt, r: number): number {
  let best = -1;
  let bestD = r * r;
  pips.forEach((q, i) => {
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/**
 * Where a pip sits round the group (screen radians): its direction's true
 * on-screen angle (`a`, through the 2:1 iso view) snapped to the nearest 45
 * degrees, so the eight pips are evenly spread and never overlap, in the same
 * order round the ring as the facings they turn to.
 */
export function pipSlot(a: number): number {
  return Math.round(a / (Math.PI / 4)) * (Math.PI / 4);
}

/** Left-hand mode: a control at x (width w) on a VW-wide screen moves to the mirrored spot. */
export function mirrorX(x: number, w: number, vw: number, leftHand: boolean): number {
  return leftHand ? vw - x - w : x;
}
