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
 * ADR-0004 (design/adr/ADR-0004-input-layer.md).
 */
import type { DragKind } from '../dragFormation';
import type { Pt } from './hitTest';

export interface Ptr {
  id: number;
  x: number;
  y: number;
  isDown: boolean;
}

export type PressMode = 'pending' | 'pan' | 'formation' | 'info';

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
  | { type: 'tap'; x: number; y: number };

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

  /** @param dragPx finger travel (screen px, |dx| + |dy|) before a press becomes a drag */
  constructor(private readonly dragPx: number) {}

  /** A finger came down. `downs`: every pointer now down (this one included); `zoom`: the camera zoom now. */
  down(p: Ptr, downs: Ptr[], zoom: number, probe: () => PressProbe): GestureEvent[] {
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
  }
}
