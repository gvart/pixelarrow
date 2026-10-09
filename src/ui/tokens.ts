/**
 * Design tokens of the "Bronze & Stone v3" UI (docs/UI_KIT.md "Tokens"): one source for
 * the colours, the type scale, spacing and motion of every menu screen. Colours
 * are 0xRRGGBB. Every text / surface pair the screens use is listed in
 * `CONTRAST_PAIRS` and checked against WCAG AA by tests/tokens.test.ts.
 *
 * Pure data (no Phaser), so tests and the art generators can import it.
 */
import { hex } from '../art/palette';

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

// ================================================================== mosaic (UI v4)

/**
 * "Mosaic & Parchment" (docs/redesign/V4_SPEC.md): parchment cards with dark
 * ink inside a carved-stone frame with a gold meander, on a basalt page.
 * Terracotta is the one primary action, bronze the secondary, grey stone the
 * unavailable, teal the plaque / tab bar. Existing v3 tokens stay until every
 * screen has moved.
 */
export const MOSAIC = {
  /** The page behind everything: dark warm basalt. */
  page: 0x16120f,
  pageSpeck: 0x211b16,
  /** Dark carved stone of the frame, the top bar and chips on stone (darkest to lightest). */
  stone0: 0x1a1612,
  stone1: 0x26211b,
  stone2: 0x342d25,
  stone3: 0x463d33,
  /** Grey cut stone of tiles and disabled buttons. */
  slab: 0x6e6860,
  slabHi: 0x8c857a,
  slabLo: 0x4c4741,
  /** Disabled button / tile faces and their label. */
  off: 0x5f5a53,
  offHi: 0x75706a,
  offText: 0xd6cebf,
  /** The meander band: gold-ochre on dark stone. */
  meander: 0xb48f4a,
  meanderHi: 0xdcb86e,
  meanderLo: 0x6a5128,
  /** Gold text and rims on dark stone. */
  gold: 0xe6c885,
  goldHi: 0xf6e0a6,
  /** Parchment: face, light (selected) and shade, and the inked edge. */
  parch: 0xe7d6ad,
  parchHi: 0xf0e3c2,
  parchLo: 0xdcc394,
  parchEdge: 0x5a3d22,
  /** A sunken parchment well (a track, an input). */
  well: 0xd6be90,
  wellLo: 0xbfa476,
  /** Ink on parchment. */
  ink: 0x3a2414,
  inkSec: 0x5e4129,
  inkMuted: 0x634830,
  inkDisabled: 0x6e5a3b,
  inkGood: 0x33581d,
  inkBad: 0x8f2818,
  /** Reward gold, Experience and Drachmae as ink on parchment (shared overlays). */
  inkGold: 0x5e3f00,
  inkXp: 0x1f4f7a,
  inkPremium: 0x56389a,
  /** Cream text on terracotta, bronze, teal and stone. */
  cream: 0xfdf3de,
  /** Terracotta (the primary action). */
  terra: 0xa8432c,
  terraHi: 0xc9573a,
  terraLo: 0x6e2616,
  /** Aged bronze (secondary actions, frames, the war medallion). */
  bronze: 0x7d5b30,
  bronzeHi: 0xc9a066,
  bronzeLo: 0x4a3419,
  /** Dark wine: the destructive button (an action that destroys something). */
  wine: 0x5e1a28,
  wineHi: 0x8a2a36,
  wineLo: 0x3e101c,
  /** Teal: the title plaque, the glaze tile and the tab bar. */
  teal: 0x1f4f52,
  tealHi: 0x2f7270,
  tealLo: 0x122f33,
  tabBar: 0x16333a,
  /** Quest segments: done gold and open dark brown. */
  segDone: 0xe9b94a,
  segOpen: 0x4a3a2a,
} as const;

/** Rarity labels darkened to read on parchment. */
export const RARITY_INK = { common: 0x4f483f, uncommon: 0x33581d, rare: 0x1f478a, epic: 0x62298a, legendary: 0x6e4600 } as const;

// ================================================================== resources

/**
 * Every resource the menus show: one icon and one colour each, used for
 * nothing else (tests/tokens.test.ts checks they are unique). `icon` names a
 * kit icon (src/art/vectorIcons.ts / uiIcons.ts).
 */
export const RESOURCES = {
  /** Campaign gold (SaveData.gold). */
  gold: { icon: 'coin', color: 0xf0c24a },
  /** War gold: the online season's purse (profile.resources.gold), never mixed with campaign gold. */
  wargold: { icon: 'wargold', color: 0xe39a6b },
  glory: { icon: 'laurel', color: 0x9fd27a },
  drachmae: { icon: 'drachma', color: ACCENT.premium },
  stars: { icon: 'tgstar', color: ACCENT.tgStar },
  power: { icon: 'power', color: 0xf08a5a },
  wins: { icon: 'trophy', color: 0xe2c48c },
  xp: { icon: 'xp', color: 0x8fc7e8 },
} as const;
export type ResourceId = keyof typeof RESOURCES;

/**
 * One icon per game mode, used on every screen that names the mode (tabs,
 * cards, team "Use for" chips, headers). Raids and the raid defence are one
 * mode (the defence is who holds off raids): both the torch.
 */
export const MODE_ICON = {
  campaign: 'march',
  ladder: 'ladder',
  arena: 'arena',
  raid: 'raid',
  defence: 'raid',
  online: 'map',
  beasts: 'beast',
} as const;
export type ModeId = keyof typeof MODE_ICON;

/** Icons reserved for one meaning each (a resource, a mode): never reused for anything else. */
export const RESERVED_ICONS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(RESOURCES).map(([k, v]) => [v.icon, `resource:${k}`])),
  star: 'ladder floor rating',
  podium: 'leaderboard',
  lock: 'locked',
  shop: 'shop',
  ladder: 'mode:ladder',
  arena: 'mode:arena',
  raid: 'mode:raid',
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
  // ---- mosaic (UI v4)
  ...[MOSAIC.parchHi, MOSAIC.parch, MOSAIC.parchLo].flatMap((bg) => [
    { fg: MOSAIC.ink, bg, min: 4.5, what: 'ink on parchment' },
    { fg: MOSAIC.inkSec, bg, min: 4.5, what: 'secondary ink on parchment' },
    { fg: MOSAIC.inkMuted, bg, min: 4.5, what: 'muted ink on parchment' },
    { fg: MOSAIC.inkDisabled, bg, min: 3, what: 'disabled ink on parchment' },
    { fg: MOSAIC.inkGood, bg, min: 4.5, what: 'success ink on parchment' },
    { fg: MOSAIC.inkBad, bg, min: 4.5, what: 'danger ink on parchment' },
    { fg: MOSAIC.inkGold, bg, min: 4.5, what: 'reward ink on parchment' },
    { fg: MOSAIC.inkXp, bg, min: 4.5, what: 'xp ink on parchment' },
    { fg: MOSAIC.inkPremium, bg, min: 4.5, what: 'drachmae ink on parchment' },
    ...Object.entries(RARITY_INK).map(([r, fg]) => ({ fg, bg, min: 4.5, what: `rarity ${r} on parchment` })),
  ]),
  { fg: MOSAIC.ink, bg: MOSAIC.well, min: 4.5, what: 'ink in a parchment well' },
  ...[MOSAIC.inkGood, MOSAIC.inkBad, MOSAIC.inkMuted, MOSAIC.inkGold, MOSAIC.inkXp, MOSAIC.inkPremium].map((fg) => ({ fg, bg: MOSAIC.well, min: 4.5, what: 'ink colour in a parchment well' })),
  { fg: MOSAIC.inkSec, bg: MOSAIC.well, min: 4.5, what: 'secondary ink in a parchment well' },
  ...[MOSAIC.terra, MOSAIC.terraLo].map((bg) => ({ fg: MOSAIC.cream, bg, min: 4.5, what: 'cream on terracotta' })),
  ...[MOSAIC.bronze, MOSAIC.bronzeLo].map((bg) => ({ fg: MOSAIC.cream, bg, min: 4.5, what: 'cream on bronze' })),
  ...[MOSAIC.teal, MOSAIC.tealLo, MOSAIC.tabBar].map((bg) => ({ fg: MOSAIC.cream, bg, min: 4.5, what: 'cream on teal' })),
  ...[MOSAIC.tealHi].map((bg) => ({ fg: MOSAIC.cream, bg, min: 4.5, what: 'cream on teal glaze' })),
  ...[MOSAIC.stone0, MOSAIC.stone1, MOSAIC.stone2, MOSAIC.stone3].flatMap((bg) => [
    { fg: MOSAIC.gold, bg, min: 4.5, what: 'gold on stone' },
    { fg: MOSAIC.cream, bg, min: 4.5, what: 'cream on stone' },
  ]),
  ...[MOSAIC.slab, MOSAIC.slabLo].map((bg) => ({ fg: MOSAIC.cream, bg, min: 4.5, what: 'cream on cut stone' })),
  ...[MOSAIC.stone1, MOSAIC.stone2, MOSAIC.stone3].map((bg) => ({ fg: TEXT.primary, bg, min: 4.5, what: 'number on stone chip' })),
  { fg: MOSAIC.cream, bg: MOSAIC.bronzeLo, min: 4.5, what: 'cream on bronze tile' },
  { fg: MOSAIC.gold, bg: MOSAIC.tabBar, min: 4.5, what: 'gold on the tab bar' },
  { fg: MOSAIC.offText, bg: MOSAIC.off, min: 3, what: 'disabled label on grey stone' },
  ...[MOSAIC.wine, MOSAIC.wineLo].map((bg) => ({ fg: MOSAIC.cream, bg, min: 4.5, what: 'cream on destructive wine' })),
  ...[MOSAIC.bronzeHi, 0xb98d52].map((bg) => ({ fg: MOSAIC.ink, bg, min: 4.5, what: 'ink on the lit bronze button' })),
  { fg: MOSAIC.cream, bg: ACCENT.purchase, min: 4.5, what: 'cream on purchase blue' },
  { fg: MOSAIC.ink, bg: MOSAIC.segDone, min: 4.5, what: 'check on a done quest segment' },
  { fg: TEXT.onAccent, bg: ACCENT.primary, min: 4.5, what: 'primary button label' },
  { fg: TEXT.onAccent, bg: ACCENT.primaryLo, min: 4.5, what: 'primary button (pressed)' },
  { fg: TEXT.onAccent, bg: ACCENT.purchase, min: 4.5, what: 'purchase button label' },
  { fg: TEXT.onAccent, bg: ACCENT.dangerFill, min: 4.5, what: 'badge count' },
  ...Object.entries(ROLE).map(([r, bg]) => ({ fg: TEXT.onAccent, bg, min: 4.5, what: `role pill ${r}` })),
];

/** "#rrggbb" of a token (Canvas 2D). */
export function css(c: number, alpha = 1): string {
  if (alpha < 1) return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${alpha})`;
  return hex(c);
}
