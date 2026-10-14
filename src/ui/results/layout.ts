/**
 * Where the Results screen's parts go by size class (design/ux/landscape-v6.md §7.5; V6-RSCR-02).
 * Pure geometry, UI px. One column on phones and tablets upright (the v5 page); two panes in
 * landscape: the banner, why line and Summary on the left, the Heroes / Spoils tabs, their page
 * and the primary on the right, so the Spoils-then-Continue flow stays one button.
 */
import type { SizeClass } from '../sizeClass';
import { ROW_MAX } from '../sizeClass';

export interface PaneBox {
  x: number;
  w: number;
}

/** The left pane at expanded (§7.5: 260); at compact landscape the two panes share the width. */
export const SUMMARY_PANE_W = 260;
/** A tablet upright: the Summary stacked over the tabs takes at most this share of the page's height. */
export const SUMMARY_STACK_SHARE = 0.4;
/** The space between the panes (landscape-v6 §3.2). */
export const RESULTS_GUTTER = 8;
/** The landscape primary at the right pane's foot, at most this wide (§7.5). */
export const CTA_PANE_MAX = 240;

/**
 * The banner column (`left`) and, in landscape, the page column (`right`) inside the frame's content box.
 * One column: `left` is the whole page (4 px inset, as v5; at most ROW_MAX, centred, on a tablet upright) and `right` is null. Two panes: the right pane
 * is a list's width at most (ROW_MAX: its rows are list rows), and the pair is centred in the box.
 */
export function resultsPanes(box: { x: number; w: number }, land: boolean, cls: SizeClass): { left: PaneBox; right: PaneBox | null } {
  const inner = { x: box.x + 4, w: box.w - 8 };
  // a tablet upright: one column of list rows, at most ROW_MAX, centred (the stretched rule)
  if (!land && cls === 'medium' && inner.w > ROW_MAX) return { left: { x: inner.x + Math.floor((inner.w - ROW_MAX) / 2), w: ROW_MAX }, right: null };
  if (!land) return { left: inner, right: null };
  const leftW = cls === 'compact' ? Math.floor((inner.w - RESULTS_GUTTER) * 0.48) : Math.min(SUMMARY_PANE_W, Math.floor((inner.w - RESULTS_GUTTER) * 0.45));
  const rightW = Math.min(ROW_MAX, inner.w - RESULTS_GUTTER - leftW);
  const x = inner.x + Math.floor((inner.w - (leftW + RESULTS_GUTTER + rightW)) / 2);
  return { left: { x, w: leftW }, right: { x: x + leftW + RESULTS_GUTTER, w: rightW } };
}

/** The Summary tiles: five in a row when every label fits a fifth of the width, else three and two (v5). */
export function tilesPerRow(w: number, gap: number, labelW: readonly number[]): 5 | 3 {
  const tw = Math.floor((w - 4 * gap) / 5);
  return labelW.every((lw) => lw + 8 <= tw) ? 5 : 3;
}

/** The Spoils grid's columns: 2 or 3 on a phone (v5), up to 4 where the page is wider (landscape-v6 §7.5). */
export function spoilCols(w: number, gap: number, phone: boolean): number {
  if (phone) return w >= 3 * 64 + 2 * gap ? 3 : 2;
  return Math.max(2, Math.min(4, Math.floor((w + gap) / (64 + gap))));
}
