/**
 * The War map's HUD per layout variant (design/ux/landscape-v6.md §8.2, §8.3): where the situation card,
 * the key rail, the march bar and an open hex panel go over the full-bleed map, and the **framing rect**
 * the camera centres and frames in. Pure (no Phaser), unit-tested in tests/warHud.test.ts; OnlineScene
 * draws with it.
 *
 * | variant           | map                 | card                 | key rail                      | hex panel            |
 * | compact portrait  | v5: the framed window (null here: the scene keeps the v5 hub)                               |
 * | medium            | v5: the framed window, taller (null here)                                                   |
 * | compact landscape | full bleed          | top-left, ≤ 280      | right edge, full height, 30   | inspector, 220       |
 * | expanded          | full bleed          | top-left, ≤ 320      | right edge, full height, 44   | inspector, 240 / 280 |
 *
 * The key rail never hides (§16.4: the v5 rail hid whole when it did not fit). An open panel docks left of
 * the rail; the card and the march bar stay beside it where they fit, else they fold under it (the scene
 * registers them collapsed into the panel's close key, which brings them back).
 */
import { EDGE_PAD, layoutVariant, type Box, type ClassOf, type LayoutVariant } from '../../ui/mosaic/layout/geometry';

export interface WarHudMetrics extends ClassOf {
  VW: number;
  VH: number;
  navW: number;
}

export interface WarHudSpec {
  /** The top bar strip's height, UI px. */
  top: number;
  /** The key column's size in `avail` UI px of height (OnlineScene's railLayout: labelled keys when they fit). */
  rail: (avail: number, expanded: boolean) => { w: number; h: number };
  /** The situation card's height at a width (its sentence row and the chip rows that width needs). */
  cardH: (w: number) => number;
  /** The army is marching: the march bar shows. */
  marching: boolean;
  /** A hex is selected: its panel is open. */
  panel: boolean;
}

export interface WarHud {
  variant: LayoutVariant;
  /** The map, full bleed: right of the nav rail, under the top bar. */
  map: Box;
  /** The stone key rail: the right edge, full height. */
  rail: Box;
  /** The keys inside it (Army, Clan, Lobby, Centre, Zoom), from its top. */
  keys: Box;
  /** The situation card (sentence, Collect, chips); null when it folds under an open panel. */
  card: Box | null;
  /** The march bar while marching; null when an open panel leaves it no room. */
  march: Box | null;
  /** The hex panel: an inspector side panel left of the rail. */
  panel: Box | null;
  /** The clear map the camera frames in, UI px. */
  framing: Box;
}

/** Card widths (§8.2): the chips in one row of 6 need about 240. */
const CARD_MAX_COMPACT = 280;
const CARD_MAX_EXPANDED = 320;
/** Narrower than this beside an open panel, the card folds under it. */
const CARD_MIN = 170;
/** Hex panel widths (§8.2; the side-panel caps of §3.4: 220–280 compact, 240–320 expanded). */
const PANEL_COMPACT = 220;
const PANEL_EXPANDED = 280;
const PANEL_EXPANDED_NARROW = 240;
/** The march bar (v5's MARCH_H) and its widths: the clock, the countdown and Halt need 140. */
export const MARCH_H = 24;
const MARCH_MAX = 260;
const MARCH_MIN = 140;
const RAIL_PAD = 2;

const area = (b: Box): number => Math.max(0, b.w) * Math.max(0, b.h);

/** The landscape HUD, or null where the scene keeps the v5 hub (compact portrait, medium). */
export function warHudLayout(m: WarHudMetrics, s: WarHudSpec): WarHud | null {
  const variant = layoutVariant(m);
  if (variant === 'compactPortrait' || variant === 'medium') return null;
  const { VW, VH, navW } = m;
  const expanded = variant === 'expanded';
  const top = s.top;
  const map: Box = { x: navW, y: top, w: VW - navW, h: VH - top };
  const k = s.rail(map.h - RAIL_PAD * 2, expanded);
  const rail: Box = { x: VW - k.w, y: top, w: k.w, h: map.h };
  const keys: Box = { x: rail.x, y: top + RAIL_PAD, w: k.w, h: k.h };
  const panelW = Math.min(expanded ? (VW < 600 ? PANEL_EXPANDED_NARROW : PANEL_EXPANDED) : PANEL_COMPACT, rail.x - navW - EDGE_PAD * 2);
  const panel: Box | null = s.panel ? { x: rail.x - panelW, y: top, w: panelW, h: map.h } : null;
  // the clear map between the nav rail and the panel (or the key rail)
  const right = panel ? panel.x : rail.x;
  const cx = navW + EDGE_PAD;
  const cw = Math.min(expanded ? CARD_MAX_EXPANDED : CARD_MAX_COMPACT, right - EDGE_PAD - cx);
  const card: Box | null = panel && cw < CARD_MIN ? null : { x: cx, y: top + EDGE_PAD, w: cw, h: s.cardH(cw) };
  const freeW = right - navW;
  const mw = Math.min(MARCH_MAX, freeW - EDGE_PAD * 2);
  const march: Box | null = !s.marching || mw < MARCH_MIN ? null : { x: navW + Math.round((freeW - mw) / 2), y: VH - EDGE_PAD - MARCH_H, w: mw, h: MARCH_H };
  // the framing rect: the clear map below the card or beside it, left of the panel or the rail, above the march bar
  const bottom = march ? march.y - EDGE_PAD : VH;
  let framing: Box = { x: navW, y: top, w: right - navW, h: bottom - top };
  if (card) {
    const below: Box = { x: navW, y: card.y + card.h + EDGE_PAD, w: right - navW, h: bottom - (card.y + card.h + EDGE_PAD) };
    const beside: Box = { x: card.x + card.w + EDGE_PAD, y: top, w: right - (card.x + card.w + EDGE_PAD), h: bottom - top };
    framing = area(below) >= area(beside) ? below : beside;
  }
  return { variant, map, rail, keys, card, march, panel, framing };
}

/**
 * The camera centre (world px) clamped so the framing rect's world box stays over the map `b` (the
 * half-view correction, camera-systems "clamp the view, not the centre"); a framing rect larger than the
 * map centres the map in it. `framing` is in UI px, `canvas` in device px (the camera's view), `S` the UI scale.
 */
export function clampToFraming(cx: number, cy: number, zoom: number, S: number, canvas: { w: number; h: number }, framing: Box, b: Box): { x: number; y: number } {
  const axis = (c: number, f0: number, f1: number, half: number, lo0: number, len: number): number => {
    // the framing rect's edges in world px are c + (f - half) / zoom
    const lo = lo0 - (f0 - half) / zoom;
    const hi = lo0 + len - (f1 - half) / zoom;
    if (lo > hi) return (lo + hi) / 2;
    return Math.max(lo, Math.min(hi, c));
  };
  return {
    x: axis(cx, framing.x * S, (framing.x + framing.w) * S, canvas.w / 2, b.x, b.w),
    y: axis(cy, framing.y * S, (framing.y + framing.h) * S, canvas.h / 2, b.y, b.h),
  };
}

/** How far (device px) a point on screen must move to sit inside `r`: zero when it already does (§8.3: never move a visible hex). */
export function intoFraming(p: { x: number; y: number }, r: Box): { x: number; y: number } {
  const d = (v: number, lo: number, hi: number) => (v < lo ? lo - v : v > hi ? hi - v : 0);
  return { x: d(p.x, r.x, r.x + r.w), y: d(p.y, r.y, r.y + r.h) };
}
