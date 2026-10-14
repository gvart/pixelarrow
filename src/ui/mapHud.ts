/**
 * The map HUD of World and Camp per layout variant (design/ux/landscape-v6.md §12.2, §12.3): where
 * the situation card, the row under it, and the command keys go over the full-bleed map, and the
 * **framing rect** the camera frames, follows and centres in. Pure (no Phaser), so it is unit-tested
 * (tests/mapHud.test.ts); the scenes draw with it.
 *
 * | variant           | situation card              | commands                                           |
 * | compact portrait  | v5: full width, two lines   | v5: the stone strip across the bottom              |
 * | compact landscape | top-left, one line, ≤ 260   | a stack at the right edge, at the foot (thumbs)    |
 * | medium            | v5: full width, two lines   | the strip, ≤ 360 wide, centred                     |
 * | expanded          | top-left, two lines, ≤ 320  | a stack of 120-wide keys at the bottom-right       |
 * | short landscape   | top-left, one line, ≤ 260   | one row of keys along the foot, right-aligned      |
 *
 * "Short landscape" is compact landscape where the stack does not fit the height under the top bar (Camp's five
 * keys in Telegram's 844x390 safe area): stacking would push End day off the screen.
 *
 * The corners are anchored with `edgeClusters` (§3.5). Its framing assumes clusters that span their row or
 * column; the map card is a short corner cluster, so the framing here is the largest clear rect the card,
 * the row under it and the keys leave (below the card, or beside it), never the strip between them.
 */
import { edgeClusters, layoutVariant, EDGE_PAD, type Box, type ClassOf, type LayoutVariant } from './mosaic/layout/geometry';

export interface MapHudMetrics extends ClassOf {
  VW: number;
  VH: number;
}

export interface MapHudSpec {
  /** Height of the top bar strip, UI px. */
  top: number;
  /** The situation card's height for a number of sentence lines. */
  cardH: (lines: 1 | 2) => number;
  /** Height of the row under the card (the arc chip and the eye, or the zoom key), UI px; it floats over the map. */
  under: number;
  /** Number of command keys. */
  keys: number;
  /** The widest key's natural width (label and icon), UI px: the stack's width in compact landscape. */
  keyW: number;
  /** World (keys 30 tall) or Camp (keys 28 tall in compact landscape) (§12.2). */
  kind: 'world' | 'camp';
}

export type MapCommands =
  /** The v5 stone strip (its own height), `w` wide from `x`, on the screen's lower edge. */
  | { mode: 'bar'; x: number; w: number }
  /** Keys stacked top to bottom in `rect`, `keyH` tall, `gap` apart; the last (the primary) at the foot. */
  | { mode: 'stack'; rect: Box; keyH: number; gap: number }
  /**
   * Landscape too short for the stack (Telegram's 844x390 safe area is 161 UI px tall): the keys in one row along
   * the foot of `rect`, at their natural widths, right-aligned so the primary sits at the right end (the thumb).
   */
  | { mode: 'row'; rect: Box; keyH: number; gap: number };

export interface MapHudLayout {
  variant: LayoutVariant;
  /** The situation card: its box and how many sentence lines it holds. */
  card: Box & { lines: 1 | 2 };
  commands: MapCommands;
  /** Over the map: where the camera frames, follows and centres (UI px). */
  framing: Box;
}

/** v5's card inset from the screen's sides and under the top bar (compact portrait and medium keep it). */
const V5_SIDE = 4;
const V5_UNDER_TOP = 2;
/** Card maxima (§12.2). */
const CARD_MAX_COMPACT = 260;
const CARD_MAX_EXPANDED = 320;
/** The strip's maximum width at medium (§12.2). */
const BAR_MAX_MEDIUM = 360;
/** Keys of the stack: compact landscape World 30 and Camp 28 tall; expanded 120 x 30 (§12.2). */
const KEY_W_EXPANDED = 120;
const KEY_W_MIN = 72;
const KEY_W_MAX = 120;
/** A key of the row: 48 pt, v5's strip key. */
const ROW_KEY_H = 24;
/** Between two stacked keys: ≥ 4 pt (§15). */
export const STACK_GAP = 3;

const area = (b: Box): number => Math.max(0, b.w) * Math.max(0, b.h);

export function mapHudLayout(m: MapHudMetrics, s: MapHudSpec): MapHudLayout {
  const { VW, VH } = m;
  const variant = layoutVariant(m);
  if (variant === 'compactPortrait' || variant === 'medium') {
    // the v5 HUD: the card across the screen under the bar, the strip across the bottom (≤ 360 at medium)
    const lines: 1 | 2 = VH < 240 ? 1 : 2;
    const card = { x: V5_SIDE, y: s.top + V5_UNDER_TOP, w: VW - V5_SIDE * 2, h: s.cardH(lines), lines };
    const w = variant === 'medium' ? Math.min(VW, BAR_MAX_MEDIUM) : VW;
    return { variant, card, commands: { mode: 'bar', x: Math.round((VW - w) / 2), w }, framing: { x: 0, y: card.y + card.h, w: VW, h: VH - card.y - card.h } };
  }
  const expanded = variant === 'expanded';
  const lines: 1 | 2 = expanded && VH >= 240 ? 2 : 1;
  const keyH = expanded || s.kind === 'world' ? 30 : 28;
  const keyW = expanded ? KEY_W_EXPANDED : Math.max(KEY_W_MIN, Math.min(KEY_W_MAX, Math.ceil(s.keyW)));
  const stackH = s.keys * keyH + Math.max(0, s.keys - 1) * STACK_GAP;
  const safe: Box = { x: 0, y: s.top, w: VW, h: VH - s.top };
  if (!expanded && stackH > safe.h - EDGE_PAD * 2) {
    // short landscape: the keys go in a row along the foot; the card keeps its full width at the top left
    const cardH = s.cardH(1);
    const card = { x: EDGE_PAD, y: s.top + EDGE_PAD, w: Math.min(CARD_MAX_COMPACT, VW - EDGE_PAD * 2), h: cardH, lines: 1 as const };
    const rect: Box = { x: EDGE_PAD, y: VH - EDGE_PAD - ROW_KEY_H, w: VW - EDGE_PAD * 2, h: ROW_KEY_H };
    const tlBottom = card.y + cardH + s.under;
    const below: Box = { x: 0, y: tlBottom + EDGE_PAD, w: VW, h: rect.y - EDGE_PAD - (tlBottom + EDGE_PAD) };
    const beside: Box = { x: card.x + card.w + EDGE_PAD, y: s.top, w: VW - (card.x + card.w + EDGE_PAD), h: rect.y - EDGE_PAD - s.top };
    const framing = area(below) >= area(beside) ? below : beside;
    return { variant, card, commands: { mode: 'row', rect, keyH: ROW_KEY_H, gap: STACK_GAP }, framing };
  }
  const cardW = Math.min(expanded ? CARD_MAX_EXPANDED : CARD_MAX_COMPACT, VW - EDGE_PAD * 3 - keyW);
  const cardH = s.cardH(lines);
  const { rects } = edgeClusters(safe, { tl: { w: cardW, h: cardH + s.under }, br: { w: keyW, h: stackH } });
  const tl = rects.tl!;
  const br = rects.br!;
  const card = { x: tl.x, y: tl.y, w: tl.w, h: cardH, lines };
  // the clear map: below the card and its row, or right of them (full height); left of the keys either way
  const below: Box = { x: 0, y: tl.y + tl.h + EDGE_PAD, w: br.x - EDGE_PAD, h: VH - (tl.y + tl.h + EDGE_PAD) };
  const beside: Box = { x: tl.x + tl.w + EDGE_PAD, y: s.top, w: br.x - EDGE_PAD - (tl.x + tl.w + EDGE_PAD), h: VH - s.top };
  const framing = area(below) >= area(beside) ? below : beside;
  return { variant, card, commands: { mode: 'stack', rect: br, keyH, gap: STACK_GAP }, framing };
}

/** The keys of a stack, top to bottom. */
export function stackKeys(c: Extract<MapCommands, { mode: 'stack' }>, n: number): Box[] {
  return Array.from({ length: n }, (_, i) => ({ x: c.rect.x, y: c.rect.y + i * (c.keyH + c.gap), w: c.rect.w, h: c.keyH }));
}

/**
 * One step of the deadzone follow (camera-systems): how far the camera moves this frame so the target
 * (`dx`, `dy` from the framing rect's centre, world px) comes back inside the deadzone, a box `dzW` x `dzH`
 * (20% of the framing rect, §12.3). Only the overflow past the box is chased, with exponential smoothing
 * (`1 - exp(-rate * dt)`), so the feel is the same at any frame rate.
 */
export function followStep(dx: number, dy: number, dzW: number, dzH: number, dtMs: number, rate = 4): { x: number; y: number } {
  const k = 1 - Math.exp((-Math.max(0, dtMs) / 1000) * rate);
  const over = (d: number, half: number) => (Math.abs(d) <= half ? 0 : Math.sign(d) * (Math.abs(d) - half));
  return { x: over(dx, dzW / 2) * k, y: over(dy, dzH / 2) * k };
}
