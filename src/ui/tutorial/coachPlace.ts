/**
 * Where a coach card goes (UI px), pure so it is unit-tested (design/ux/landscape-v6.md §13.1): it
 * points at its control wherever the size class moved it, never covers it, keeps clear of a nav rail
 * on the left and of the map-key rail on the right (WAR-6), and is at most 176 wide (240 on laptops).
 */
import type { SizeClass } from '../sizeClass';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type BubbleSide = 'above' | 'below' | 'left' | 'right';

/** A coach card's widest (§13.1): 176 UI px, 240 on laptops. */
export function bubbleMaxW(m: { cls: SizeClass; land: boolean }): number {
  return m.cls === 'expanded' ? 240 : 176;
}

/** The narrowest card that goes beside its target (narrower, its words would stack into a tower). */
const MIN_BESIDE = 120;

const hits =(a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Above a low target, else below; with a rail, the card keeps to its left, and for a target on the rail
 * itself it sits beside the rail at the target's height, the arrow pointing right. When neither above nor
 * below leaves the target uncovered (a tall panel on a short landscape canvas), the card goes beside it,
 * on the side with more room. `left`: the nav rail's width (landscape hubs), kept clear.
 */
export function bubblePlace(at: Rect | null, w: number, h: number, VW: number, VH: number, rail: Rect | null, left = 0): { x: number; y: number; w: number; side: BubbleSide } {
  const x0 = left + 8;
  const right = rail ? rail.x - 6 : VW - 8;
  const bw = Math.min(w, right - x0);
  const midY = (r: Rect) => Math.round(Math.max(4, Math.min(VH - 4 - h, r.y + r.h / 2 - h / 2)));
  if (at && rail && at.x >= rail.x - 2) return { x: Math.round(right - bw), y: midY(at), w: bw, side: 'left' };
  let y: number;
  let side: BubbleSide = 'below';
  if (!at) y = Math.round((VH - h) / 2);
  else if (at.y + at.h / 2 > VH / 2) {
    y = at.y - 8 - h;
    side = 'above';
  } else y = at.y + at.h + 8;
  y = Math.max(4, Math.min(VH - 4 - h, y));
  const cx = at ? at.x + at.w / 2 : VW / 2;
  const x = Math.round(Math.max(x0, Math.min(right - bw, cx - bw / 2)));
  if (!at || !hits({ x, y, w: bw, h }, at)) return { x, y, w: bw, side };
  // beside the target: the side with more room, as wide as that room allows
  const roomL = at.x - 8 - x0;
  const roomR = right - (at.x + at.w + 8);
  // no room beside it either (a panel across a phone's width): above or below as before
  if (Math.max(roomL, roomR) < MIN_BESIDE) return { x, y, w: bw, side };
  if (roomL >= roomR) {
    const sw = Math.min(bw, roomL);
    return { x: Math.round(at.x - 8 - sw), y: midY(at), w: sw, side: 'left' };
  }
  const sw = Math.min(bw, roomR);
  return { x: Math.round(at.x + at.w + 8), y: midY(at), w: sw, side: 'right' };
}
