/**
 * The battlefield gesture recogniser (pure, no Phaser): raw pointer events in,
 * gesture events out. The scene routes Phaser's pointerdown/move/up here and
 * acts on what comes back; it keeps no gesture state of its own.
 *
 * - One finger, lifted before it travels `dragPx`: a TAP.
 * - One finger that travels further: a FORMATION DRAG when the press grabbed
 *   the selected group (src/ui/input/hitTest.ts) and it can take orders, else
 *   a PAN of the camera.
 * - A one-finger press held still (the scene's long-press timer calls hold()):
 *   INFO (terrain explained in deployment); the lift then does nothing.
 * - A second finger: PINCH zoom and pan. It cancels any one-finger gesture,
 *   so two fingers never give an order.
 *
 * A mouse adds two buttons (ADR-0012 Decision 5, input-v6.md §2.2); the left
 * button and every finger take the paths above, unchanged:
 * - RIGHT click: an ORDER CLICK at the cursor (the scene sends the tap-move or
 *   the attack/focus a tap would, and never selects). RIGHT drag past `dragPx`:
 *   an ORDER DRAG, the group's ghost at the press point facing toward the
 *   cursor (snapped to the eight directions within SNAP_DEG, as the knob);
 *   the release sends one order. Esc (cancelOrder) or a left press cancels it.
 * - MIDDLE drag: a PAN, 1:1 from the first move.
 *
 * ADR-0004 (design/adr/ADR-0004-input-layer.md), amended by ADR-0012.
 */
import { SNAP_DEG, type DragKind } from '../dragFormation';
import type { Pt } from './hitTest';
import { FACING_DIRS } from './singleTap';

export interface Ptr {
  id: number;
  x: number;
  y: number;
  isDown: boolean;
  /** The mouse button of this event: 0 left (and every finger), 1 middle, 2 right. Missing: left. */
  button?: number;
  /** The event came from a touch screen: always the left button. */
  wasTouch?: boolean;
}

type PressMode = 'pending' | 'pan' | 'formation' | 'info';

export interface Press {
  id: number;
  /** Screen point of the press and the last point seen. */
  sx: number;
  sy: number;
  lx: number;
  ly: number;
  /** World point under the press (taken when the finger came down). */
  at: Pt;
  /** What a drag from the press point takes hold of (null: a drag pans). */
  grab: DragKind | null;
  mode: PressMode;
}

/** What the scene learns about a single-finger press when it comes down. */
export interface PressProbe {
  /** A HUD control, overlay or hint is under the finger: the field ignores this press. */
  blocked: boolean;
  grab: DragKind | null;
  at: Pt;
}

export type GestureEvent =
  /** A second finger came down: any one-finger gesture is dropped. */
  | { type: 'pinch-start' }
  /** The pinch moved: `zoom` is the unclamped camera zoom; (dx, dy) the move of the fingers' midpoint. */
  | { type: 'pinch'; zoom: number; dx: number; dy: number }
  /** Fewer than two fingers are left; `z0` is the zoom when the pinch began. */
  | { type: 'pinch-end'; z0: number }
  /** A one-finger press began on the field. */
  | { type: 'press'; press: Press }
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'drag-start'; kind: DragKind; at: Pt }
  | { type: 'drag-move'; x: number; y: number }
  | { type: 'drag-end' }
  /** The one finger lifted (whatever it was doing). */
  | { type: 'release' }
  | { type: 'tap'; x: number; y: number }
  /** A right click at screen (x, y): move there or attack what is there. */
  | { type: 'order-click'; x: number; y: number }
  /** A right press became a drag: the ghost stands at the field point `at`. */
  | { type: 'order-drag-start'; at: Pt }
  /** The facing (field, unit) from `at` toward the cursor; `snapped` to one of the eight directions. */
  | { type: 'order-drag-move'; at: Pt; fx: number; fy: number; snapped: boolean }
  /** The right button came up: send the order at `at` facing (fx, fy). */
  | { type: 'order-drag-end'; at: Pt; fx: number; fy: number }
  /** Esc or a left press dropped the right press: nothing is sent. */
  | { type: 'order-cancel' };

/** A right-button press: pending until it travels `dragPx`, then a drag with a facing. */
interface OrderPress {
  sx: number;
  sy: number;
  at: Pt;
  drag: boolean;
  fx: number;
  fy: number;
}

/** What the recogniser is doing now, for the cursor (input-v6.md §2.4). */
type ActiveGesture = DragKind | 'pan' | 'order' | null;

const SNAP_COS = Math.cos((SNAP_DEG * Math.PI) / 180);

/** The facing from a field vector: one of the eight directions when within SNAP_DEG of it, else the vector itself; null when too short. */
function snapFacing(dx: number, dy: number): { fx: number; fy: number; snapped: boolean } | null {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const fx = dx / len;
  const fy = dy / len;
  for (const d of FACING_DIRS) if (fx * d.x + fy * d.y >= SNAP_COS) return { fx: d.x, fy: d.y, snapped: true };
  return { fx, fy, snapped: false };
}

const buttonOf = (p: Ptr): number => (p.wasTouch ? 0 : (p.button ?? 0));

interface Pinch {
  d0: number;
  z0: number;
  cx: number;
  cy: number;
}

const mid = (a: Ptr, b: Ptr) => ({ d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 });

export class GestureRecognizer {
  press: Press | null = null;
  pinch: Pinch | null = null;
  private order: OrderPress | null = null;
  /** The middle button's last point while it pans. */
  private mid: { lx: number; ly: number; moved: boolean } | null = null;
  /** A left press that cancelled a right drag: its lift is not a tap. */
  private swallow = false;

  /**
   * @param dragPx finger travel (screen px, |dx| + |dy|) before a press becomes a drag
   * @param toField screen px to field coordinates (the right-drag's ghost and facing)
   */
  constructor(
    private readonly dragPx: number,
    private readonly toField: (x: number, y: number) => Pt = (x, y) => ({ x, y }),
  ) {}

  /** What is under way now: a formation drag, a pan, a right-button order, or nothing. */
  active(): ActiveGesture {
    if (this.order) return 'order';
    if (this.mid?.moved || this.press?.mode === 'pan') return 'pan';
    if (this.press?.mode === 'formation') return this.press.grab;
    return null;
  }

  /** Esc: drop a right-button press, if there is one (then nothing is sent). */
  cancelOrder(): GestureEvent[] {
    if (!this.order) return [];
    this.order = null;
    return [{ type: 'order-cancel' }];
  }

  /** A finger came down. `downs`: every pointer now down (this one included); `zoom`: the camera zoom now. */
  down(p: Ptr, downs: Ptr[], zoom: number, probe: () => PressProbe): GestureEvent[] {
    const button = buttonOf(p);
    if (this.order) {
      // a left press cancels the right drag (and is used up by it); other buttons are ignored
      if (button !== 0) return [];
      this.swallow = true;
      return this.cancelOrder();
    }
    if (button !== 0) {
      // the right and middle buttons start nothing over a gesture under way or over the HUD
      if (this.press || this.pinch || this.mid || probe().blocked) return [];
      if (button === 2) this.order = { sx: p.x, sy: p.y, at: this.toField(p.x, p.y), drag: false, fx: 0, fy: 0 };
      else if (button === 1) this.mid = { lx: p.x, ly: p.y, moved: false };
      return [];
    }
    if (downs.length >= 2) {
      this.press = null;
      const m = mid(downs[0], downs[1]);
      this.pinch = { d0: m.d, z0: zoom, cx: m.cx, cy: m.cy };
      return [{ type: 'pinch-start' }];
    }
    const q = probe();
    if (q.blocked) {
      this.press = null;
      return [];
    }
    this.press = { id: p.id, sx: p.x, sy: p.y, lx: p.x, ly: p.y, at: q.at, grab: q.grab, mode: 'pending' };
    return [{ type: 'press', press: this.press }];
  }

  /** A finger moved. `canDrag` is asked once, when a grabbing press first travels far enough. */
  move(p: Ptr, downs: Ptr[], canDrag: () => boolean): GestureEvent[] {
    const pinch = this.pinch;
    if (pinch) {
      if (downs.length < 2) return [];
      const m = mid(downs[0], downs[1]);
      const ev: GestureEvent = { type: 'pinch', zoom: pinch.z0 * (m.d / Math.max(1, pinch.d0)), dx: m.cx - pinch.cx, dy: m.cy - pinch.cy };
      pinch.cx = m.cx;
      pinch.cy = m.cy;
      return [ev];
    }
    const o = this.order;
    if (o) {
      const out: GestureEvent[] = [];
      if (!o.drag) {
        if (Math.abs(p.x - o.sx) + Math.abs(p.y - o.sy) <= this.dragPx) return [];
        o.drag = true;
        out.push({ type: 'order-drag-start', at: o.at });
      }
      const c = this.toField(p.x, p.y);
      const f = snapFacing(c.x - o.at.x, c.y - o.at.y);
      if (f) {
        o.fx = f.fx;
        o.fy = f.fy;
      }
      out.push({ type: 'order-drag-move', at: o.at, fx: o.fx, fy: o.fy, snapped: f?.snapped ?? false });
      return out;
    }
    const m = this.mid;
    if (m) {
      const ev: GestureEvent = { type: 'pan', dx: p.x - m.lx, dy: p.y - m.ly };
      m.lx = p.x;
      m.ly = p.y;
      m.moved = true;
      return [ev];
    }
    const g = this.press;
    if (!g || p.id !== g.id || !p.isDown) return [];
    const out: GestureEvent[] = [];
    if (g.mode === 'pending' && Math.abs(p.x - g.sx) + Math.abs(p.y - g.sy) > this.dragPx) {
      if (g.grab && canDrag()) {
        g.mode = 'formation';
        out.push({ type: 'drag-start', kind: g.grab, at: g.at });
      } else {
        g.mode = 'pan';
      }
    }
    if (g.mode === 'pan') out.push({ type: 'pan', dx: p.x - g.lx, dy: p.y - g.ly });
    else if (g.mode === 'formation') out.push({ type: 'drag-move', x: p.x, y: p.y });
    g.lx = p.x;
    g.ly = p.y;
    return out;
  }

  /** A finger lifted. `downs`: the pointers still down. */
  up(p: Ptr, downs: Ptr[]): GestureEvent[] {
    const button = buttonOf(p);
    if (button !== 0) {
      // the right or middle button came up: it ends only its own gesture (a left press held meanwhile goes on)
      const o = this.order;
      if (button === 2 && o) {
        this.order = null;
        if (!o.drag) return [{ type: 'release' }, { type: 'order-click', x: p.x, y: p.y }];
        return [{ type: 'release' }, { type: 'order-drag-end', at: o.at, fx: o.fx, fy: o.fy }];
      }
      if (button === 1 && this.mid) {
        this.mid = null;
        return [{ type: 'release' }];
      }
      return [];
    }
    if (this.swallow && button === 0) {
      this.swallow = false;
      return [{ type: 'release' }];
    }
    const pinch = this.pinch;
    if (pinch) {
      this.press = null;
      if (downs.length >= 2) return [];
      this.pinch = null;
      return [{ type: 'pinch-end', z0: pinch.z0 }];
    }
    const g = this.press;
    this.press = null;
    const out: GestureEvent[] = [{ type: 'release' }];
    if (!g || p.id !== g.id) return out;
    if (g.mode === 'pending') out.push({ type: 'tap', x: p.x, y: p.y });
    else if (g.mode === 'formation') out.push({ type: 'drag-end' });
    return out;
  }

  /** The long press fired for `press`: true (and the press becomes INFO) if it is still pending. */
  hold(press: Press): boolean {
    if (this.press !== press || press.mode !== 'pending') return false;
    press.mode = 'info';
    return true;
  }

  /** Drop the one-finger press (the scene was rebuilt or a dialog took over). */
  reset(): void {
    this.press = null;
    this.pinch = null;
    this.order = null;
    this.mid = null;
    this.swallow = false;
  }
}
