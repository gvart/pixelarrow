/**
 * The Codex per size class (design/ux/landscape-v6.md §13.2, V6-RSCR-09). Pure: the scene lays out what this returns.
 *
 * - compact portrait: the v5 rows; a row opens its sheet.
 * - compact landscape: rows on the left, the beast or doctrine detail on the right (§3.3 MasterDetail). Where the
 *   two panes do not fit (Telegram's insets at 844x390 leave 265 UI px beside the rail) the rows take the width
 *   and the detail opens as a right side panel (§3.4), so nothing is squeezed below a readable row.
 * - medium: a card grid, 3 columns; the detail is a bottom sheet.
 * - expanded: a card grid (min 120, up to 4 columns) on the left and a 240-wide detail pane on the right. Where
 *   only one card would fit (1024x768) the list is rows: a one-column grid is a list.
 */
import { gridColumns, layoutVariant, masterDetail, PANE_GUTTER, type Box, type ClassOf } from './mosaic/layout/geometry';

/** The detail pane's width at expanded (§13.2). */
export const DETAIL_W = 240;
/** Narrowest list pane that still holds a readable row (art well, name, two-line hint, chevron). */
const ROWS_MIN = 150;
/** Cards: §13.2's minimum cell (expanded) and the tablet's minimum for its three columns. */
const CARD_MIN = 120;
const CARD_MIN_TABLET = 110;

export interface CodexLayout {
  /** How the list draws: rows (v5's) or a card grid. */
  list: 'rows' | 'grid';
  /** Grid columns (1 for rows). */
  cols: number;
  /** The list pane. */
  master: Box;
  /** The detail pane beside the list, or null: the detail opens as a sheet (or side panel). */
  detail: Box | null;
}

export function codexLayout(m: ClassOf, box: Box): CodexLayout {
  const v = layoutVariant(m);
  const whole: CodexLayout = { list: 'rows', cols: 1, master: { ...box }, detail: null };
  if (v === 'compactPortrait') return whole;
  if (v === 'medium') return { ...whole, list: 'grid', cols: gridColumns(box.w, { minCell: CARD_MIN_TABLET, maxCols: 3 }) };
  if (v === 'compactLandscape') {
    const md = masterDetail(box, m);
    if (!md.detail || md.master.w < ROWS_MIN) return whole;
    return { list: 'rows', cols: 1, master: md.master, detail: md.detail };
  }
  const master = { ...box, w: box.w - PANE_GUTTER - DETAIL_W };
  const detail = { x: master.x + master.w + PANE_GUTTER, y: box.y, w: DETAIL_W, h: box.h };
  const cols = gridColumns(master.w, { minCell: CARD_MIN, maxCols: 4 });
  return { list: cols > 1 ? 'grid' : 'rows', cols, master, detail };
}
