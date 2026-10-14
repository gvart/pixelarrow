/**
 * `Columns` (design/ux/landscape-v6.md §3.2): split a content box into panes by its width.
 * Under 300 UI px one pane (the v5 stack), from 300 two, from 560 three when the screen declares a
 * third. Panes keep their declared order; when fewer fit, the ones of highest priority stay and the
 * rest are reported as `hidden` (a screen folds them into a control: the element-parity rule).
 */
import { PANE_GUTTER, type Box } from './variant';

export interface PaneSpec {
  /** Narrowest the pane may be, UI px. */
  min: number;
  /** Widest it may grow; past every max the panes are centred in the box (§2.3). */
  max?: number;
  /** Higher stays longer when fewer panes fit (default: earlier panes first). */
  priority?: number;
}

export interface ColumnsLayout {
  /** One entry per declared pane, in declared order: its box, or null when it is folded away. */
  panes: (Box | null)[];
  /** Indices of the panes shown, left to right. */
  shown: number[];
  /** Indices of the folded panes. */
  hidden: number[];
}

/** Two panes from this width, UI px. */
export const TWO_PANES_W = 300;
/** Three panes (when declared) from this width, UI px. */
export const THREE_PANES_W = 560;

/** How many panes fit `w` UI px when `declared` are asked for. */
export function paneCount(w: number, declared: number): number {
  const fit = w < TWO_PANES_W ? 1 : w < THREE_PANES_W ? 2 : 3;
  return Math.max(1, Math.min(fit, declared));
}

/** Widths for panes of these specs sharing `avail`: minima first, then water-filled up to each max. */
function share(specs: PaneSpec[], avail: number): number[] {
  const sumMin = specs.reduce((s, p) => s + p.min, 0);
  // the minima do not fit: share the width equally (a screen asked for too much; never overlap)
  if (sumMin > avail) {
    const each = Math.floor(avail / specs.length);
    return specs.map((_, i) => each + (i < avail - each * specs.length ? 1 : 0));
  }
  const w = specs.map((p) => p.min);
  let left = avail - sumMin;
  for (;;) {
    const open = specs.map((_, i) => i).filter((i) => w[i] < (specs[i].max ?? Infinity));
    if (!open.length || left <= 0) break;
    const each = Math.floor(left / open.length);
    if (each === 0) {
      // the last few px go one each to the first open panes
      for (const i of open.slice(0, left)) w[i]++;
      left = 0;
      break;
    }
    for (const i of open) {
      const add = Math.min(each, (specs[i].max ?? Infinity) - w[i]);
      w[i] += add;
      left -= add;
    }
  }
  return w;
}

export function columns(box: Box, specs: readonly PaneSpec[]): ColumnsLayout {
  const n = paneCount(box.w, specs.length);
  const prio = (i: number) => specs[i].priority ?? specs.length - i;
  const order = specs.map((_, i) => i).sort((a, b) => prio(b) - prio(a) || a - b);
  const shown = order.slice(0, n).sort((a, b) => a - b);
  const hidden = order.slice(n).sort((a, b) => a - b);
  const panes: (Box | null)[] = specs.map(() => null);
  // one pane is the v5 stack: the whole box
  if (n === 1) {
    panes[shown[0]] = { ...box };
    return { panes, shown, hidden };
  }
  const avail = box.w - PANE_GUTTER * (n - 1);
  const widths = share(shown.map((i) => specs[i]), avail);
  const used = widths.reduce((s, x) => s + x, 0) + PANE_GUTTER * (n - 1);
  let x = box.x + Math.floor((box.w - used) / 2);
  shown.forEach((i, k) => {
    panes[i] = { x, y: box.y, w: widths[k], h: box.h };
    x += widths[k] + PANE_GUTTER;
  });
  return { panes, shown, hidden };
}
