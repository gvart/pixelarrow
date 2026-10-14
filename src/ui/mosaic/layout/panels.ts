/**
 * Sheets become side panels (design/ux/landscape-v6.md §3.4): where a sheet of each kind goes in
 * each variant, and its box. Pure: `openPanel` (SidePanel.ts) draws it.
 *
 * | kind     | compact portrait | compact landscape           | medium            | expanded                     |
 * | decision | bottom (v5)      | dialog ≤ 320 x (VH - 16)    | dialog ≤ 320      | dialog ≤ 320                 |
 * | task     | bottom (v5)      | side clamp(220, .6VW, 280)  | bottom ≤ 320      | side clamp(240, .36VW, 320)  |
 * | settings | bottom (v5)      | side 60% of VW              | bottom ≤ 280      | dialog ≤ 320, 80% of VH      |
 */
import { DIALOG_MAX, SIDE_PANEL_MAX, SIDE_PANEL_MIN } from '../../sizeClass';
import { layoutVariant, type Box, type ClassOf } from './variant';

export type PanelKind = 'decision' | 'task' | 'settings';
export type PanelPresentation = 'bottom' | 'side' | 'dialog';

export interface PanelLayout {
  presentation: PanelPresentation;
  /** The panel's box in UI px (a bottom sheet's lower edge is the screen's). */
  rect: Box;
}

/** v5's docked sheet width (ParchmentSheet), and its margin from the screen's sides. */
const V5_SHEET_W = 260;
const SHEET_SIDE = 8;
/** A dialog keeps this much of the screen around it (§3.4: VH - 16). */
const DIALOG_MARGIN = 16;
const MEDIUM_TASK_MAX = 320;
const MEDIUM_SETTINGS_MAX = 280;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Where a sheet of `kind` goes and its box. `area` is the content area a side panel docks in (under
 * the top bar, beside the nav rail: never over the rail); `h` is the height the content asks for
 * (side panels take the area's full height). `leftHand` docks side panels on the left (A11Y-16).
 */
export function panelLayout(m: ClassOf & { VW: number; VH: number }, kind: PanelKind, area: Box, h: number, o: { leftHand?: boolean } = {}): PanelLayout {
  const { VW, VH } = m;
  const v = layoutVariant(m);
  const bottom = (maxW: number): PanelLayout => {
    const w = Math.min(maxW, VW - SHEET_SIDE);
    const hh = Math.min(h, VH - 12);
    return { presentation: 'bottom', rect: { x: Math.round((VW - w) / 2), y: VH - hh, w, h: hh } };
  };
  const dialog = (hh: number): PanelLayout => {
    const w = Math.min(DIALOG_MAX, VW - DIALOG_MARGIN);
    const dh = Math.min(hh, VH - DIALOG_MARGIN);
    return { presentation: 'dialog', rect: { x: Math.round((VW - w) / 2), y: Math.round((VH - dh) / 2), w, h: dh } };
  };
  const side = (w: number): PanelLayout => {
    const sw = Math.min(w, area.w);
    return { presentation: 'side', rect: { x: o.leftHand ? area.x : area.x + area.w - sw, y: area.y, w: sw, h: area.h } };
  };
  if (v === 'compactPortrait') return bottom(V5_SHEET_W);
  if (kind === 'decision') return dialog(h);
  if (kind === 'task') {
    if (v === 'medium') return bottom(MEDIUM_TASK_MAX);
    if (v === 'compactLandscape') return side(clamp(Math.round(0.6 * VW), 220, 280));
    return side(clamp(Math.round(0.36 * VW), SIDE_PANEL_MIN, SIDE_PANEL_MAX));
  }
  if (v === 'compactLandscape') return side(Math.round(0.6 * VW));
  if (v === 'medium') return bottom(MEDIUM_SETTINGS_MAX);
  return dialog(Math.round(0.8 * VH));
}
