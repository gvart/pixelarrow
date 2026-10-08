/**
 * Design tokens of the UI kit: colour meanings and spacing. One source for
 * every screen (docs/UI_KIT.md). Sizes are UI pixels (the scaled UI root;
 * one UI pixel = S CSS pixels, S = 2..4, see uiMetrics).
 */
import type { Rarity } from '../data/items';

// ------------------------------------------------------------ rarity

/** Frame / label colour per rarity: grey, green, blue, purple, gold. */
export const RARITY_COLOR: Record<Rarity, number> = {
  common: 0x9a948a,
  uncommon: 0x5f9a45,
  rare: 0x4a78c0,
  epic: 0x9a58c0,
  legendary: 0xe0b040,
};
/** Lighter tint for glows and highlights. */
export const RARITY_GLOW: Record<Rarity, number> = {
  common: 0xd8d2c8,
  uncommon: 0x9ad87a,
  rare: 0x8ab8ff,
  epic: 0xd09aff,
  legendary: 0xfff0a0,
};
/** Rare and above glow softly; Legendary also sparkles. */
export const glows = (r: Rarity): boolean => r === 'rare' || r === 'epic' || r === 'legendary';

// ------------------------------------------------------------ battle panel categories

export type BattleCategory = 'movement' | 'attack' | 'formation' | 'abilities';
/** Movement bronze, Attack red, Formation blue, Abilities gold. */
export const CATEGORY_COLOR: Record<BattleCategory, number> = {
  movement: 0xb8863b,
  attack: 0xa83a2c,
  formation: 0x4a6b9a,
  abilities: 0xe0b860,
};
export const CATEGORY_DARK: Record<BattleCategory, number> = {
  movement: 0x6e4f22,
  attack: 0x6e2219,
  formation: 0x2c4060,
  abilities: 0x8a6a28,
};

// ------------------------------------------------------------ meaning colours

export const COLOR = {
  good: 0x5f9a45, // gains, health, success (stat delta up)
  bad: 0xb0402c, // losses, damage, errors (stat delta down)
  hp: 0x9a3b2f,
  morale: 0x4a6b9a,
  xp: 0xd8a840,
  stamina: 0x5f8a45,
  ink: 0x4a2420,
  shade: 0x000000,
} as const;

// ------------------------------------------------------------ spacing and touch

/** Minimum touch target in CSS points (docs/DESIGN_V2.md "Touch targets"). */
export const TOUCH_PT = 44;
/** Minimum spacing between touch targets in CSS points. */
export const TOUCH_GAP_PT = 4;
/** Minimum touch target in UI pixels at scale S. */
export const touchMin = (S: number): number => Math.ceil(TOUCH_PT / S);

/** Standard sizes in UI pixels; all satisfy the touch rules at every scale (S >= 2). */
export const SIZE = {
  /** Button / row / tab height. */
  btnH: 24,
  /** Minimum width of an icon button. */
  btnMinW: 24,
  /** Item cell (icon slot) edge. */
  cell: 24,
  /** Gap between touch targets (4 pt at S = 2). */
  gap: 3,
  /** Inner padding of panels. */
  pad: 6,
  /** Scroll list row height. */
  rowH: 26,
  /** Tab bar height. */
  tabH: 24,
} as const;

// ------------------------------------------------------------ Strategos (docs/UI_STRATEGOS.md)

/**
 * Bronze is the one "selected / next" accent: the radial ring, its facing
 * handle, the focus ring round the next thing to tap, selected chips. Red
 * stays the one primary action; grey dither means "cannot" (with a reason).
 */
export const BRONZE = {
  main: 0xb8863b,
  dark: 0x6e4f22,
  hi: 0xe8c26a,
} as const;

/** Fixed chrome of every Strategos screen, in UI pixels. */
export const STRAT = {
  /** Situation bar: two sentence lines plus a row of labelled numbers. */
  sitH: 40,
  /** Situation bar on short screens (one sentence line). */
  sitHCompact: 30,
  /** Command strip: three fixed slots over a parchment band. */
  stripH: 34,
  /** Width of the strip's side slots (Back / Army); the middle slot takes the rest. */
  stripSide: 40,
  /** Height of the strip's buttons (a 52 pt target at S = 2). */
  stripBtnH: 26,
  /** Screens shorter than this (UI px) use the compact situation bar and shorter group cards. */
  compactVH: 300,
} as const;
