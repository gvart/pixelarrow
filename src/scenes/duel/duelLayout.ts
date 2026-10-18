/**
 * The Duels screens per size class (design/ux/landscape-v6.md §9.2, V6-RSCR-04). Pure: DuelScene lays
 * out the panes this returns (tests/duelPanes.test.ts).
 *
 * - compact portrait: null, the v5 page (one scroll area, the fixed action at its foot).
 * - compact landscape and expanded: a **profile column** on the left (Glory, level, Team and Armoury; on
 *   a sub-screen its chips and controls) and the **mode content** on the right, each its own scroll
 *   area; the fixed action sits at the bottom-right of the right pane. The Armoury at 844x390 keeps one
 *   column, so its cards still go two abreast (§9.2 "Shop cards: 2 columns").
 * - medium: the v5 stack across the pane (its rows and buttons keep their own caps, §2.3); Team is master and detail.
 */
import { gridColumns, layoutVariant, PANE_GUTTER, type Box, type ClassOf } from '../../ui/mosaic/layout/geometry';
import { CONTENT_MAX } from '../../ui/sizeClass';

/** The views a Duels page can be. */
export type DuelView = 'hub' | 'team' | 'shop' | 'raid' | 'board' | 'search' | 'stack';

/** The profile column's width per variant (§9.2). */
export const SIDE_W = { compactLandscape: 130, medium: 180, expanded: 180 } as const;

export interface DuelPanes {
  /** The profile column (null: one pane). */
  side: Box | null;
  /** The mode content. */
  main: Box;
}

/**
 * Two cards abreast in portrait from 2 x 176 (v5); elsewhere the §3.7 grid. Its cell is 150, not §9.2's 140: at
 * 140 the third card's name, slot and stat changes are cut ("Weap…"), and 150 still gives the spec's two columns
 * at 844x390 and on tablets; a third column comes where the pane holds three readable cards.
 */
const CARD_V5 = 176;
/** The narrowest defender rows beside the profile column, UI px. */
const MAIN_MIN = 220;
const CARD_MIN = 150;
/** Between cards and tiles, UI px (the page's GAP). */
const GAP = 3;
/** A floor tile's least width: a touch target (mosaic TAP, 22 UI px). */
const TAP = 22;

/** Where the profile column and the mode content go, inside `region` (the frame's content box); null in compact portrait. */
export function duelPanes(m: ClassOf, region: Box, view: DuelView): DuelPanes | null {
  const v = layoutVariant(m);
  if (v === 'compactPortrait') return null;
  // the panes region is at most CONTENT_MAX wide (§2.3), centred in the frame
  const w = Math.min(region.w, CONTENT_MAX);
  const r = { x: region.x + Math.floor((region.w - w) / 2), y: region.y, w, h: region.h };
  const stack = (max: number): DuelPanes => {
    const sw = Math.min(r.w, max);
    return { side: null, main: { x: r.x + Math.floor((r.w - sw) / 2), y: r.y, w: sw, h: r.h } };
  };
  if (view === 'stack') return stack(r.w);
  if (v === 'medium' && view !== 'team') return stack(r.w);
  if (v === 'compactLandscape' && view === 'shop') return stack(r.w);
  const sw = SIDE_W[v];
  // the defender rows would be squeezed beside the column (Telegram's insets at 844x390): one pane
  if (v === 'compactLandscape' && view === 'raid' && r.w - sw - PANE_GUTTER < MAIN_MIN) return stack(r.w);
  return { side: { x: r.x, y: r.y, w: sw, h: r.h }, main: { x: r.x + sw + PANE_GUTTER, y: r.y, w: r.w - sw - PANE_GUTTER, h: r.h } };
}

/** Floor tiles a row: one chapter (ten) on a row at expanded where they fit, else five (four on the narrowest phones). */
export function floorsPerRow(m: ClassOf, w: number): number {
  if (layoutVariant(m) === 'expanded' && w >= 10 * TAP + 9 * 2) return 10;
  return w >= 5 * TAP + 4 * 2 ? 5 : 4;
}

/** Offer cards a row: v5's two from 2 x 176 in portrait; elsewhere the grid (min 150, up to 4). */
export function offerColumns(m: ClassOf, w: number): number {
  if (layoutVariant(m) === 'compactPortrait') return w >= 2 * CARD_V5 + GAP ? 2 : 1;
  return gridColumns(w, { minCell: CARD_MIN, maxCols: 4, gap: GAP });
}
