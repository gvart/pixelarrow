/**
 * The scale policy (ADR-0013, design/ux/landscape-v6.md §1–§2), as pure functions:
 * size classes measured on the safe-area CSS box, a whole-number UI scale S per
 * class, the UIMetrics contract, the content caps, and the legacy column that
 * keeps a scene which has not migrated at its v5 width (V6-021).
 *
 * Units: `w`/`h` here are CSS px of the game box unless named `dev` (canvas px =
 * CSS px x RS, src/platform/renderScale.ts). S includes RS, so VW × VH are UI px.
 */

export type SizeClass = 'compact' | 'medium' | 'expanded';

export interface UIMetrics {
  /** Canvas px per UI px: a whole number of CSS px, times RS. */
  S: number;
  VW: number;
  VH: number;
  /** The size class (§1). A legacy column is always compact portrait. */
  cls: SizeClass;
  /** aspect ≥ 1: a nav rail instead of a tab bar. */
  land: boolean;
  /** VH < 240: the "compact height" switches read this, not their own thresholds. */
  short: boolean;
  /** Width of the nav rail in UI px (0 with a tab bar). */
  navW: number;
  /** Usable content width in UI px: min(VW - navW, CONTENT_MAX). */
  contentW: number;
  /** The scene has not migrated: it lays out in the v5 column (ADR-0013). */
  legacy: boolean;
}

/** §2.3 maximum widths, UI px. */
export const CONTENT_MAX = 640;
export const READING_MAX = 300;
export const ROW_MAX = 360;
export const BUTTON_MAX = 240;
export const CTA_MAX = 300;
export const DIALOG_MAX = 320;
export const SIDE_PANEL_MIN = 240;
export const SIDE_PANEL_MAX = 320;

/** §1 thresholds, CSS px. */
const MEDIUM_MIN_SHORT = 480;
const EXPANDED_MIN_ASPECT = 1.1;
const EXPANDED_MIN_W = 960;
/** S = 4 outside compact only from this short side (TVs, 4K at DPR 1). */
const S4_MIN_SHORT = 1800;
/** §3.1 nav rail widths, UI px. */
export const RAIL_W = 72;
export const RAIL_W_COMPACT = 84;

/** v5's cap (index.html until v6): the canvas was at most 0.64 x its height wide. */
const LEGACY_ASPECT = 0.64;

/** The size class and orientation of a W × H CSS px safe area (§1). */
export function sizeClass(w: number, h: number): { cls: SizeClass; land: boolean } {
  const short = Math.min(w, h);
  const aspect = w / h;
  const land = aspect >= 1;
  if (short < MEDIUM_MIN_SHORT) return { cls: 'compact', land };
  if (aspect >= EXPANDED_MIN_ASPECT && w >= EXPANDED_MIN_W) return { cls: 'expanded', land };
  return { cls: 'medium', land };
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** The v5 formula (also compact's): whole CSS px per UI px, 2..4. */
const v5Scale = (w: number, h: number): number => clamp(Math.floor(Math.min(w / 190, h / 400)), 2, 4);

/** CSS px per UI px for a class (§2.1). */
function classScale(cls: SizeClass, w: number, h: number): number {
  if (cls === 'compact') return v5Scale(w, h);
  if (cls === 'medium') return clamp(Math.floor(Math.min(w / 384, h / 480)), 2, 3);
  return clamp(Math.floor(Math.min(w / 480, h / 360)), 2, Math.min(w, h) >= S4_MIN_SHORT ? 4 : 3);
}

/** The width (CSS px) of the v5 column a legacy scene lays out in, centred in a W × H safe area. */
export function legacyColumnWidth(w: number, h: number): number {
  return Math.min(w, h * LEGACY_ASPECT);
}

/**
 * The metrics of a game box of devW × devH canvas px. `legacy`: the box is the
 * v5 column of a scene that has not migrated, so S follows the v5 formula and
 * the scene is told it is a phone portrait layout (as it always was).
 */
export function metricsFor(devW: number, devH: number, rs: number, legacy: boolean): UIMetrics {
  const w = devW / rs;
  const h = devH / rs;
  const { cls, land } = legacy ? { cls: 'compact' as const, land: false } : sizeClass(w, h);
  const S = (legacy ? v5Scale(w, h) : classScale(cls, w, h)) * rs;
  const VW = Math.floor(devW / S);
  const VH = Math.floor(devH / S);
  const navW = land ? (cls === 'compact' ? RAIL_W_COMPACT : RAIL_W) : 0;
  return { S, VW, VH, cls, land, short: VH < 240, navW, contentW: Math.min(VW - navW, CONTENT_MAX), legacy };
}

/**
 * What a settled resize does to a scene: rebuild it when the class or the
 * orientation changed (a legacy scene always rebuilds, as in v5), else reflow.
 */
export function resizeAction(before: UIMetrics, after: UIMetrics): 'rebuild' | 'reflow' {
  if (before.legacy || after.legacy) return 'rebuild';
  return before.cls !== after.cls || before.land !== after.land ? 'rebuild' : 'reflow';
}
