/**
 * Geometry of the v4 tab bar (pure, unit-tested): five equal slots, the centre
 * one a round medallion wider than its slot and rising above the bar. Touch
 * areas are inset so neighbours keep a gap, and the slots beside the medallion
 * give up the strip it covers.
 */

import type { TKey } from '../../i18n';
import { MODE_ICON } from '../tokens';

export type TabId = 'campaign' | 'duels' | 'war' | 'codex' | 'shop';

/** The five mode tabs in order: their icon and the i18n key of the label. Campaign wears its MODE_ICON; War is the medallion (no icon), so no mode icon is borrowed. */
export const MODE_TABS: readonly { id: TabId; icon: string; key: TKey }[] = [
  { id: 'campaign', icon: MODE_ICON.campaign, key: 'tab.campaign' },
  { id: 'duels', icon: 'swords', key: 'tab.duels' },
  { id: 'war', icon: 'shield', key: 'tab.war' },
  { id: 'codex', icon: 'book', key: 'tab.codex' },
  { id: 'shop', icon: 'shop', key: 'tab.shop' },
];

/** Bar height in UI px (below the gold rim). */
export const TAB_H = 46;
/** How far the medallion rises above the bar, UI px. */
export const MEDALLION_RISE = 16;
/** Page left visible between the bottom of the screen frame and the tab bar, UI px (the medallion rises over it and the frame's lower band). */
export const TAB_FRAME_GAP = 10;
/** Gap between neighbouring touch areas, UI px (the layout check wants 4 pt = 2 UI px). */
export const TAB_GAP = 3;

export interface TabSlotBox {
  /** The slot (its parchment block when selected). */
  x: number;
  w: number;
  /** The touch area (x, width), already clear of the neighbours and the medallion. */
  hitX: number;
  hitW: number;
}

export interface TabLayout {
  slots: TabSlotBox[];
  /** Medallion diameter and the x of its left edge. */
  medallionD: number;
  medallionX: number;
}

/** Slots of a bar `VW` UI px wide. */
export function tabLayout(VW: number, count = 5): TabLayout {
  const slotW = VW / count;
  const mid = Math.floor(count / 2);
  const medallionD = Math.round(Math.min(slotW * 1.2, 46));
  const over = Math.max(0, (medallionD - slotW) / 2);
  const slots: TabSlotBox[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.round(i * slotW);
    const w = Math.round((i + 1) * slotW) - x;
    let l = TAB_GAP / 2;
    let r = TAB_GAP / 2;
    if (i === mid) {
      // the medallion's own area spans its whole diameter
      l = -over + TAB_GAP / 2;
      r = -over + TAB_GAP / 2;
    } else if (i === mid - 1) r += over;
    else if (i === mid + 1) l += over;
    slots.push({ x, w, hitX: x + l, hitW: w - l - r });
  }
  return { slots, medallionD, medallionX: Math.round(slots[mid].x + slots[mid].w / 2 - medallionD / 2) };
}
