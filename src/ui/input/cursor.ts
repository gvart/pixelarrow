/**
 * The mouse cursor states (input-v6.md §2.4, ADR-0012 Decision 5). Pure: what
 * is under the cursor and what the mouse is doing in, a cursor kind out. The
 * scene sets it on the canvas through cursorApply.ts, for a mouse only.
 */
import type { DragKind } from '../dragFormation';

export type CursorKind = 'default' | 'pointer' | 'not-allowed' | 'grab' | 'grabbing' | 'turn' | 'target' | 'pan' | 'wait';

/**
 * What the mouse rests on: a HUD control, the selected group's body or its
 * knob, an enemy a click would target (only with a group of mine selected),
 * or nothing that changes the cursor.
 */
export type HoverHit = 'none' | 'control' | 'body' | 'knob' | 'enemy';

export interface CursorState {
  hit: HoverHit;
  /** The drag under way: a move or turn (a right-drag's facing is a turn), a pan, or none. */
  drag: DragKind | 'pan' | null;
  /** The control under the cursor is disabled. */
  disabled: boolean;
  /** A network action is busy (P1 busy). */
  busy: boolean;
}

/** The CSS keyword each kind falls back to (pixel cursor art is optional, ADR-0012). */
export const CURSOR_CSS: Readonly<Record<CursorKind, string>> = {
  default: 'default',
  pointer: 'pointer',
  'not-allowed': 'not-allowed',
  grab: 'grab',
  grabbing: 'grabbing',
  turn: 'alias',
  target: 'crosshair',
  pan: 'all-scroll',
  wait: 'progress',
};

/** Busy first, then the drag under way, then what the cursor rests on. */
export function cursorFor(s: CursorState): CursorKind {
  if (s.busy) return 'wait';
  if (s.drag === 'move') return 'grabbing';
  if (s.drag === 'turn') return 'turn';
  if (s.drag === 'pan') return 'pan';
  switch (s.hit) {
    case 'control':
      return s.disabled ? 'not-allowed' : 'pointer';
    case 'body':
      return 'grab';
    case 'knob':
      return 'turn';
    case 'enemy':
      return 'target';
    default:
      return 'default';
  }
}
