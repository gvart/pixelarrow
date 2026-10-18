/**
 * Where the first-run screens put things in each size class (design/ux/landscape-v6.md §13.1).
 * Pure geometry (UI px), so it is unit-tested; FirstRunScene draws into these boxes.
 * - compact portrait: the v5 column, at most 200 wide (unchanged);
 * - medium: a centred column, at most 360 wide (fresco on top, speech, CTA, skip);
 * - compact landscape and expanded: a stage, the fresco on the left and Nikias, the CTA and Skip on
 *   the right (compact landscape: half and half; expanded: the fresco at most 300 wide, the spec's 360
 *   cap lowered because the fresco is also the tutorial's door, a primary control capped at 300, §2.3);
 * - the three mode cards side by side everywhere but compact portrait (at most 180 each on laptops).
 */
import type { Box } from '../mosaic';
import { PANE_GUTTER, type LayoutVariant } from '../mosaic/layout/variant';

/** The v5 column's width (compact portrait). */
export const V5_COL = 200;
/** The medium column's width. */
export const MEDIUM_COL = 360;
/** The stage's width on laptops (fresco and words together). */
const STAGE_MAX = 600;
const ART_MAX = 300;
/** The words beside the fresco: room for the speech card; the CTA inside it stays ≤ 300 (§2.3). */
const SIDE_MAX = 280;
/** A mode card at most this wide on laptops (§13.1). */
const MODE_MAX = 180;

/** The content column of a column layout: centred in `inner`, at most 200 (compact portrait) or 360 wide. */
export function columnBox(v: LayoutVariant, inner: Box): Box {
  const w = Math.min(inner.w, v === 'compactPortrait' ? V5_COL : MEDIUM_COL);
  return { x: inner.x + Math.round((inner.w - w) / 2), y: inner.y, w, h: inner.h };
}

export type OfferLayout = { kind: 'column'; col: Box } | { kind: 'stage'; art: Box; side: Box };

/** The offer and resume screens: a column (portrait) or a stage (landscape). */
export function offerLayout(v: LayoutVariant, inner: Box): OfferLayout {
  if (v === 'compactPortrait' || v === 'medium') return { kind: 'column', col: columnBox(v, inner) };
  const gap = PANE_GUTTER;
  let artW: number;
  let sideW: number;
  if (v === 'compactLandscape') {
    artW = Math.floor((inner.w - gap) / 2);
    sideW = inner.w - gap - artW;
  } else {
    const w = Math.min(inner.w, STAGE_MAX);
    artW = Math.min(ART_MAX, Math.round(w * 0.55));
    sideW = Math.min(SIDE_MAX, w - gap - artW);
    // what the side cannot take goes back to the fresco (up to its cap), so the pair fills the stage
    artW = Math.min(ART_MAX, w - gap - sideW);
  }
  const x0 = inner.x + Math.round((inner.w - (artW + gap + sideW)) / 2);
  return {
    kind: 'stage',
    art: { x: x0, y: inner.y, w: artW, h: inner.h },
    side: { x: x0 + artW + gap, y: inner.y, w: sideW, h: inner.h },
  };
}

/** The three mode cards side by side (null: compact portrait stacks them, as v5): the first card's x, each card's width and the gap. */
export function modesRow(v: LayoutVariant, inner: Box): { x: number; w: number; gap: number } | null {
  if (v === 'compactPortrait') return null;
  const gap = PANE_GUTTER;
  const max = v === 'expanded' ? MODE_MAX : Infinity;
  const w = Math.min(max, Math.floor((inner.w - gap * 2) / 3));
  return { x: inner.x + Math.round((inner.w - (w * 3 + gap * 2)) / 2), w, gap };
}
