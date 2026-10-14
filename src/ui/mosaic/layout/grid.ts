/**
 * `Grid` (design/ux/landscape-v6.md §3.7): a list of like items reflows by width instead of
 * stretching. Columns = clamp(floor((w + gap) / (minCell + gap)), 1, maxCols); the cells share the
 * width, so each is at least `minCell` wide (once one fits).
 */
import type { Box } from './variant';

export interface GridOpts {
  minCell: number;
  maxCols: number;
  /** Between cells, both ways (default 4: the 4-pt grid). */
  gap?: number;
  /** Cell height (default: square cells). */
  cellH?: number;
}

export interface GridLayout {
  cols: number;
  cellW: number;
  cellH: number;
  cells: Box[];
  /** Height of all the rows. */
  h: number;
}

const GRID_GAP = 4;

export function gridColumns(w: number, o: GridOpts): number {
  const gap = o.gap ?? GRID_GAP;
  return Math.max(1, Math.min(o.maxCols, Math.floor((w + gap) / (o.minCell + gap))));
}

export function grid(box: Box, count: number, o: GridOpts): GridLayout {
  const gap = o.gap ?? GRID_GAP;
  const cols = gridColumns(box.w, o);
  const cellW = Math.floor((box.w - gap * (cols - 1)) / cols);
  const cellH = o.cellH ?? cellW;
  const cells = Array.from({ length: count }, (_, i) => ({ x: box.x + (i % cols) * (cellW + gap), y: box.y + Math.floor(i / cols) * (cellH + gap), w: cellW, h: cellH }));
  const rows = Math.ceil(count / cols);
  return { cols, cellW, cellH, cells, h: rows ? rows * (cellH + gap) - gap : 0 };
}
