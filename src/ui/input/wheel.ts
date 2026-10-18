/**
 * The mouse wheel and the trackpad (ADR-0012 Decision 5, design/ux/input-v6.md
 * §2.3). Pure: no Phaser, no DOM (ADR-0004).
 *
 * - `WheelAccumulator` turns raw `wheel` deltas into whole zoom steps: a mouse
 *   notch is one step, a trackpad's stream of small deltas adds up to one, and
 *   no more than one step lands per `WHEEL_STEP_MS`. Ctrl (a trackpad pinch)
 *   zooms the same way; shift or a horizontal delta pans.
 * - `wheelOwner` picks the one scroll area a wheel over a hit object belongs
 *   to: the innermost that can scroll, so two lists on screen never scroll
 *   together.
 */

/** Pixels of wheel travel per zoom step (a mouse notch is 100 in Chromium and WebKit). */
const WHEEL_STEP_PX = 100;
/** At most one zoom step this often (ms), so a flick or a trackpad's momentum doesn't run away. */
const WHEEL_STEP_MS = 120;
/** One `DOM_DELTA_LINE` in pixels. */
const WHEEL_LINE_PX = 16;

/** The fields of a DOM `WheelEvent` the accumulator reads. */
export interface WheelIn {
  deltaX: number;
  deltaY: number;
  /** 0 pixels, 1 lines, 2 pages. */
  deltaMode: number;
  ctrlKey: boolean;
  shiftKey: boolean;
}

interface WheelOut {
  /** A whole zoom step: 1 in, -1 out. */
  zoom?: 1 | -1;
  /** A sideways pan, in CSS px (positive: the view moves right). */
  panX?: number;
  /** Call `preventDefault` on the event (a pinch must never zoom the page). */
  prevent: boolean;
}

/** A delta in CSS px, whatever its `deltaMode`. */
function wheelPx(d: number, mode: number, viewH: number): number {
  return mode === 1 ? d * WHEEL_LINE_PX : mode === 2 ? d * viewH : d;
}

export class WheelAccumulator {
  private acc = 0;
  private last = -Infinity;

  /** Feed one wheel event at `nowMs`; `viewH` is the view's height in CSS px (page mode). */
  push(e: WheelIn, nowMs: number, viewH: number): WheelOut {
    const out: WheelOut = { prevent: e.ctrlKey };
    const dx = wheelPx(e.deltaX, e.deltaMode, viewH);
    const dy = wheelPx(e.deltaY, e.deltaMode, viewH);
    // shift turns a vertical wheel sideways (as browsers do for pages)
    const pan = e.shiftKey && !e.ctrlKey ? dx || dy : dx;
    if (pan) out.panX = pan;
    if (e.shiftKey && !e.ctrlKey) return out;
    if (!dy) return out;
    // turning back starts the count again
    if (Math.sign(dy) !== Math.sign(this.acc)) this.acc = 0;
    this.acc += dy;
    if (Math.abs(this.acc) >= WHEEL_STEP_PX && nowMs - this.last >= WHEEL_STEP_MS) {
      // down (positive deltaY) zooms out; what was held back is dropped, not banked
      out.zoom = this.acc > 0 ? -1 : 1;
      this.acc = 0;
      this.last = nowMs;
    }
    return out;
  }
}

/** A display-list node: enough of a Phaser game object to walk up its containers. */
export interface WheelNode {
  parentContainer?: WheelNode | null;
}

/**
 * The scroll area that takes a wheel over `hit` (the top object under the
 * pointer): walking up from it, the first area whose content or drag zone
 * holds it and that can scroll. `areaOf` says which area a node is the content
 * or zone of (undefined for any other node). Nothing under the pointer, or
 * no area round it: no area scrolls.
 */
export function wheelOwner<A extends { canScroll(): boolean }>(hit: WheelNode | undefined, areaOf: (n: WheelNode) => A | undefined): A | undefined {
  for (let n: WheelNode | null | undefined = hit; n; n = n.parentContainer) {
    const a = areaOf(n);
    if (a?.canScroll()) return a;
  }
  return undefined;
}
