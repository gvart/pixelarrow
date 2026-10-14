/**
 * The four layout variants of design/ux/landscape-v6.md §1 (the Kit Layouts page shows each
 * primitive in all four): compact portrait (phones, v5), compact landscape (phones sideways,
 * short windows), medium (tablets, near-square windows) and expanded (laptops and desktops).
 */
import type { Box } from '../ScreenFrame';
import type { UIMetrics } from '../../sizeClass';

export type { Box };

export type LayoutVariant = 'compactPortrait' | 'compactLandscape' | 'medium' | 'expanded';

/** The size class and orientation a primitive needs (a subset of UIMetrics, so tests can pass plain objects). */
export type ClassOf = Pick<UIMetrics, 'cls' | 'land'>;

export function layoutVariant(m: ClassOf): LayoutVariant {
  if (m.cls === 'compact') return m.land ? 'compactLandscape' : 'compactPortrait';
  return m.cls;
}

/** The space between panes, UI px (2 x the 4-pt grid at S = 2, §3.2). */
export const PANE_GUTTER = 8;
/** The frame padding clusters and panes keep from the edge, UI px (§3.5). */
export const EDGE_PAD = 6;
