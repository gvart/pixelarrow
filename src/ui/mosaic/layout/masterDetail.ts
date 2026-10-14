/**
 * `MasterDetail` (design/ux/landscape-v6.md §3.3): a list pane and a detail pane. Compact portrait
 * keeps the v5 stack (the list fills the screen; a row opens its detail as a sheet or a sub-screen);
 * every other variant puts the list on the left (180–300 UI px) and the detail on the right (at
 * least 160), the detail showing the first item on arrival.
 */
import { PANE_GUTTER, layoutVariant, type Box, type ClassOf } from './variant';

export const MASTER_MIN = 180;
export const MASTER_MAX = 300;
export const DETAIL_MIN = 160;
/** The list's share of the box before its clamps. */
const MASTER_SHARE = 0.4;

export interface MasterDetailLayout {
  /** Two panes side by side (false: the v5 stack). */
  split: boolean;
  master: Box;
  /** null in the v5 stack: the detail opens over the list. */
  detail: Box | null;
}

export function masterDetail(box: Box, m: ClassOf): MasterDetailLayout {
  if (layoutVariant(m) === 'compactPortrait') return { split: false, master: { ...box }, detail: null };
  let mw = Math.max(MASTER_MIN, Math.min(MASTER_MAX, Math.round(box.w * MASTER_SHARE)));
  // the detail minimum wins: at 338 (phone landscape beside the rail) the list gets 170
  mw = Math.min(mw, box.w - PANE_GUTTER - DETAIL_MIN);
  const dx = box.x + mw + PANE_GUTTER;
  return { split: true, master: { x: box.x, y: box.y, w: mw, h: box.h }, detail: { x: dx, y: box.y, w: box.x + box.w - dx, h: box.h } };
}
