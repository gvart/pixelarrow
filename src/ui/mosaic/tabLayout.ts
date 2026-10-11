/**
 * Geometry of the v4 tab bar (pure, unit-tested): five slots, the centre one a
 * round medallion wider than its slot and rising above the bar, always at the
 * centre of the screen. Touch areas are inset so neighbours keep a gap, and the
 * slots beside the medallion give up the strip it covers.
 *
 * Labels (art bible 7.2, interaction-patterns P19, ADR-0005): one face, one case
 * and one size for all five. Cinzel capitals at Display S (7), then 6.5, when
 * all five fit; else Inter in sentence case (the text face's own case) at 7,
 * then 6.5. Never a mix ("Campaign" beside "DUELS"). No short forms: a tab
 * carries the same name at every width (V5-063). When not all five fit at 6.5
 * (a 274 px Telegram canvas), every tab keeps its icon, the active one keeps its
 * label and the others go icon-only, their name on long-press and hover (V5-068). Slots follow their labels: a long
 * label takes a wider slot, the two sides stay equal so the medallion stays
 * centred.
 */

import type { TKey } from '../../i18n';
import { DISPLAY_MIN, MODE_ICON, TEXT_MIN } from '../tokens';

export type TabId = 'campaign' | 'duels' | 'war' | 'codex' | 'shop';

/** The five mode tabs in order: their icon and the i18n key of the label. Campaign wears its MODE_ICON, Codex (the beasts) the beasts' one; War is the medallion (no icon), so no mode icon is borrowed. */
export const MODE_TABS: readonly { id: TabId; icon: string; key: TKey }[] = [
  { id: 'campaign', icon: MODE_ICON.campaign, key: 'tab.campaign' },
  { id: 'duels', icon: 'swords', key: 'tab.duels' },
  { id: 'war', icon: 'shield', key: 'tab.war' },
  { id: 'codex', icon: MODE_ICON.beasts, key: 'tab.codex' },
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
/** Room a label keeps in its slot, UI px (half on each side): inside the selected tab's block (1 UI px in from the slot) by 1 UI px, and two labels >= 4 apart. */
export const TAB_LABEL_PAD = 4;
/** Narrowest slot, UI px: its icon and a touch area of >= 22 after the gap; the medallion's neighbours also give up the strip it covers. */
export const TAB_MIN_SLOT = 26;
/** Extra width a neighbour of the medallion needs for the strip the medallion covers, UI px. */
export const TAB_MEDALLION_SHARE = 3;
/** Narrowest slot of the medallion, UI px (a medallion of 31 across). */
export const MEDALLION_MIN_SLOT = 26;
/** Widest medallion, UI px. */
export const MEDALLION_MAX = 46;

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

/**
 * Slots of a bar `VW` UI px wide. `widths`: each slot's width (from `tabSlotWidths`); default equal slots.
 * The medallion is at most 1.2 x its slot and MEDALLION_MAX across.
 */
export function tabLayout(VW: number, count = 5, widths?: readonly number[]): TabLayout {
  const ws = widths && widths.length === count ? widths : Array.from({ length: count }, () => VW / count);
  const mid = Math.floor(count / 2);
  const edges = [0];
  for (const w of ws) edges.push(edges[edges.length - 1] + w);
  const midW = Math.round(edges[mid + 1]) - Math.round(edges[mid]);
  const medallionD = Math.round(Math.min(midW * 1.2, MEDALLION_MAX));
  const over = Math.max(0, (medallionD - midW) / 2);
  const slots: TabSlotBox[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.round(edges[i]);
    const w = Math.round(edges[i + 1]) - x;
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

/**
 * Slot widths (UI px) for five labels `labelW` UI px wide in a bar `VW` wide, or null when they do not fit.
 * The two sides are equal (the medallion stays centred); within a side each label gets its room and the two
 * share what is left; the medallion's slot takes the rest.
 */
export function tabSlotWidths(VW: number, labelW: readonly number[]): number[] | null {
  const n = labelW.length;
  const mid = Math.floor(n / 2);
  const need = labelW.map((w, i) => Math.max(Math.ceil(w) + TAB_LABEL_PAD, TAB_MIN_SLOT + (Math.abs(i - mid) === 1 ? TAB_MEDALLION_SHARE : 0)));
  const left = need.slice(0, mid);
  const right = need.slice(mid + 1);
  const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
  // the medallion's slot: its label's room, at least MEDALLION_MIN_SLOT; it gives width to the sides only when they need it
  const midNeed = Math.max(need[mid], MEDALLION_MIN_SLOT);
  let side = Math.max(sum(left), sum(right));
  if (side * 2 + midNeed > VW) return null;
  // spare width: the sides take it until each slot is as wide as an equal fifth, the medallion the rest
  side = Math.max(side, Math.min((VW - midNeed) / 2, (VW / n) * mid));
  // within a side the slots are as equal as their labels allow (a long label keeps its room, the rest share)
  const spread = (a: number[]) => {
    const out = [...a];
    let free = a.map((_, i) => i);
    for (;;) {
      const fixed = sum(out.filter((_, i) => !free.includes(i)));
      const each = (side - fixed) / free.length;
      const over = free.filter((i) => a[i] > each);
      if (!over.length) {
        free.forEach((i) => (out[i] = each));
        return out;
      }
      free = free.filter((i) => !over.includes(i));
      if (!free.length) return out;
    }
  };
  return [...spread(left), VW - side * 2, ...spread(right)];
}

export interface TabLabelStyle {
  /** 'roman': Cinzel capitals; 'body': Inter in sentence case. */
  face: 'roman' | 'body';
  size: number;
}

/** The label styles a tab bar tries, in order (art bible 7.2: Cinzel caps at Display S, else the text face). */
export const TAB_LABEL_STYLES: readonly TabLabelStyle[] = [
  { face: 'roman', size: DISPLAY_MIN },
  // interaction-patterns P19: Cinzel tab labels down to 6.5 (English at 390 px)
  { face: 'roman', size: TEXT_MIN },
  { face: 'body', size: 7 },
  { face: 'body', size: TEXT_MIN },
];

/** A label as the style writes it: capitals in Cinzel, the words as written in Inter. */
export function tabLabelText(label: string, style: TabLabelStyle): string {
  return style.face === 'roman' ? label.toUpperCase() : label;
}

export interface TabLabelFit {
  style: TabLabelStyle;
  texts: string[];
  widths: number[];
  /** Slot widths, or null when even the last style does not fit: then the bar is icon-only but for the active tab (V5-068). */
  slots: number[] | null;
}

/**
 * The one style all five labels share in a bar `VW` wide: the first of TAB_LABEL_STYLES at which every label
 * fits its slot. `measure(text, face, size)` is the width in UI px (the drawn font's, with its shadow).
 */
export function fitTabLabels(VW: number, labels: readonly string[], measure: (text: string, face: 'roman' | 'body', size: number) => number): TabLabelFit {
  let last: TabLabelFit | null = null;
  for (const style of TAB_LABEL_STYLES) {
    const texts = labels.map((l) => tabLabelText(l, style));
    const widths = texts.map((t) => measure(t, style.face, style.size));
    const slots = tabSlotWidths(VW, widths);
    last = { style, texts, widths, slots };
    if (slots) return last;
  }
  return last!;
}
