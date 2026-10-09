/**
 * Design tokens of the "Bronze & Stone v3" UI (docs/UI_V3.md): one source for
 * the colours, the type scale, spacing and motion of every menu screen. Colours
 * are 0xRRGGBB. Every text / surface pair the screens use is listed in
 * `CONTRAST_PAIRS` and checked against WCAG AA by tests/tokens.test.ts.
 *
 * Pure data (no Phaser), so tests and the art generators can import it.
 */

// ================================================================== palette

/** Surfaces, from the page down to the raised card. */
export const SURFACE = {
  /** The page behind everything: deep warm near-black. */
  bg: 0x14100c,
  /** Wells, list rows sunk into a card. */
  sunken: 0x0f0c09,
  /** Cards and panels: dark hammered bronze-stone. */
  card: 0x221a14,
  /** Raised cards (the one to look at), headers. */
  raised: 0x2e241b,
  /** The bronze rim of panels. */
  rim: 0x8c6a3c,
  /** The lit rim of the selected element. */
  rimHi: 0xe2c48c,
  /** Hairlines and dividers. */
  line: 0x4a3923,
} as const;

/** Text colours (on any SURFACE). */
export const TEXT = {
  /** Body text, numbers, titles. */
  primary: 0xf3ead9,
  /** Secondary lines, captions. */
  secondary: 0xc9b9a0,
  /** Locked / unavailable explanations (neutral, never red). */
  muted: 0xa89a84,
  /** Disabled labels (still 3:1 on cards, they are not read as body text). */
  disabled: 0x8a7d69,
  /** Text on the terracotta primary and the purchase blue. */
  onAccent: 0xfff6ea,
} as const;

/** Meaning colours. Red is only ever a real problem (an error, a loss); locks are neutral. */
export const ACCENT = {
  /** The one primary action of a screen (filled terracotta). */
  primary: 0xb8482e,
  primaryHi: 0xd2603f,
  primaryLo: 0x7a2c1a,
  /** Rewards and progress: Glory, XP, stars, chests. */
  gold: 0xe8b84a,
  goldHi: 0xffe08a,
  /** Premium currency (Drachmae): silver-violet. */
  premium: 0xb7a3ea,
  /** Real money (Telegram Stars): its own blue button and the Telegram star. */
  purchase: 0x1b6fa3,
  purchaseHi: 0x2f8cc8,
  purchaseLo: 0x124c70,
  tgStar: 0xf6b93b,
  /** Better / gains (text on dark). */
  success: 0x9fd27a,
  /** Worse / losses / errors (text on dark). */
  danger: 0xf08a72,
  /** Danger fills (badges, destructive rims). */
  dangerFill: 0xa8352a,
} as const;

/**
 * Unit roles: their own palette (never the danger red), each a pill fill with
 * light text. Same keys as ClassRole (src/data/classes.ts).
 */
export const ROLE = {
  levy: 0x6b5d4c,
  heavy: 0x3f5f86,
  ranged: 0x4f6b2e,
  light: 0x8a5a1c,
  cavalry: 0x2f6b66,
  elite: 0x5c3f86,
  beast: 0x6e3550,
} as const;

/** Rarity: frame colour and a label colour that passes AA on cards. */
export const RARITY_FRAME = { common: 0x9a948a, uncommon: 0x5f9a45, rare: 0x4a78c0, epic: 0x9a58c0, legendary: 0xe0b040 } as const;
export const RARITY_TEXT = { common: 0xd2ccc0, uncommon: 0x9ed67c, rare: 0x8dbaff, epic: 0xd2a8ff, legendary: 0xffd263 } as const;

// ================================================================== resources

/**
 * Every resource the menus show: one icon and one colour each, used for
 * nothing else (tests/tokens.test.ts checks they are unique). `icon` names a
 * kit icon (src/art/vectorIcons.ts / uiIcons.ts).
 */
export const RESOURCES = {
  gold: { icon: 'coin', color: 0xf0c24a },
  glory: { icon: 'laurel', color: 0x9fd27a },
  drachmae: { icon: 'drachma', color: ACCENT.premium },
  stars: { icon: 'tgstar', color: ACCENT.tgStar },
  power: { icon: 'power', color: 0xf08a5a },
  wins: { icon: 'trophy', color: 0xe2c48c },
  xp: { icon: 'xp', color: 0x8fc7e8 },
} as const;
export type ResourceId = keyof typeof RESOURCES;

/** Icons reserved for one meaning each (a resource, a mode): never reused for anything else. */
export const RESERVED_ICONS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(RESOURCES).map(([k, v]) => [v.icon, `resource:${k}`])),
  star: 'ladder floor rating',
  podium: 'leaderboard',
  lock: 'locked',
  shop: 'shop',
};

// ================================================================== type, spacing, motion

/**
 * Type scale (BitmapText font sizes; the kit's base size is 7 = 8 UI px em).
 * Display: Cormorant SC titles; body and numbers: Inter with tabular digits.
 */
export const TYPE = {
  /** Big numbers (balances, the floor medallion). */
  display: 12,
  /** Screen titles. */
  title: 9,
  /** Card titles, section headings. */
  heading: 7.5,
  /** Body text. */
  body: 7,
  /** Captions, chips, words under icons. */
  caption: 6,
  /** Tiny plates (never body text). */
  micro: 5.5,
} as const;

/** Spacing in UI px (4 pt grid at S = 2). */
export const SPACE = { xs: 2, sm: 4, md: 6, lg: 10, xl: 14 } as const;

/** Corner radius in CSS px of the surfaces (smoothUi). */
export const RADIUS = { card: 8, button: 7, chip: 6 } as const;

/** Motion durations in ms (180-250 for transitions; everything off under reduced motion). */
export const MOTION = {
  press: 70,
  tab: 200,
  slide: 220,
  sheet: 240,
  fade: 180,
  countUp: 600,
  pulse: 900,
} as const;

// ================================================================== contrast

/** Relative luminance (WCAG 2.x) of 0xRRGGBB. */
export function luminance(c: number): number {
  const ch = [(c >> 16) & 255, (c >> 8) & 255, c & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG contrast ratio of two colours (1..21). */
export function contrast(a: number, b: number): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Every text-on-surface pair the screens use, with the ratio it must reach:
 * 4.5 for text, 3 for large text / icons / disabled labels.
 */
export const CONTRAST_PAIRS: { fg: number; bg: number; min: number; what: string }[] = [
  ...[SURFACE.bg, SURFACE.sunken, SURFACE.card, SURFACE.raised].flatMap((bg) => [
    { fg: TEXT.primary, bg, min: 4.5, what: 'primary text' },
    { fg: TEXT.secondary, bg, min: 4.5, what: 'secondary text' },
    { fg: TEXT.muted, bg, min: 4.5, what: 'lock / muted text' },
    { fg: TEXT.disabled, bg, min: 3, what: 'disabled label' },
    { fg: ACCENT.gold, bg, min: 4.5, what: 'reward text' },
    { fg: ACCENT.success, bg, min: 4.5, what: 'better / gain' },
    { fg: ACCENT.danger, bg, min: 4.5, what: 'worse / error' },
    { fg: ACCENT.premium, bg, min: 4.5, what: 'Drachmae' },
    { fg: SURFACE.rimHi, bg, min: 4.5, what: 'headings (bronze)' },
    ...Object.entries(RARITY_TEXT).map(([r, fg]) => ({ fg, bg, min: 4.5, what: `rarity ${r}` })),
    ...Object.entries(RESOURCES).map(([r, v]) => ({ fg: v.color, bg, min: 4.5, what: `resource ${r}` })),
  ]),
  { fg: TEXT.onAccent, bg: ACCENT.primary, min: 4.5, what: 'primary button label' },
  { fg: TEXT.onAccent, bg: ACCENT.primaryLo, min: 4.5, what: 'primary button (pressed)' },
  { fg: TEXT.onAccent, bg: ACCENT.purchase, min: 4.5, what: 'purchase button label' },
  { fg: TEXT.onAccent, bg: ACCENT.dangerFill, min: 4.5, what: 'badge count' },
  ...Object.entries(ROLE).map(([r, bg]) => ({ fg: TEXT.onAccent, bg, min: 4.5, what: `role pill ${r}` })),
];

/** "#rrggbb" of a token (Canvas 2D). */
export function css(c: number, alpha = 1): string {
  if (alpha < 1) return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${alpha})`;
  return `#${c.toString(16).padStart(6, '0')}`;
}
