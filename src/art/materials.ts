/**
 * Material ramps for the 3D-built sprites: a muted, earthy ancient
 * Mediterranean palette (sun-browned skin, undyed and indigo wool, madder
 * crimson, weathered bronze, dull iron, dusty leather). Every ramp is light to
 * dark; src/art/model3d.ts picks tones from it by lighting.
 */
import { ramp, type Material } from './model3d';

const m = (base: number, extra: Partial<Material> = {}, n = 5): Material => ({ ramp: ramp(base, n), ...extra });

/** Skin tones (Look.skin 0..3): fair, olive, tanned, dark. */
export const SKIN: Material[] = [
  { ramp: [0xf8d5c2, 0xdbac99, 0xbe8f83, 0xa87464, 0x7b503d], contrast: 0.9 },
  { ramp: [0xf0c8a6, 0xd6a282, 0xb47e64, 0x8e5c48, 0x64402e], contrast: 0.9 },
  { ramp: [0xe2b08c, 0xc28a68, 0xa06a50, 0x7c4e3a, 0x56342a], contrast: 0.9 },
  { ramp: [0xb88660, 0x966448, 0x744a36, 0x563428, 0x3c2220], contrast: 0.9 },
];
/** Hair colours (Look.hair 0..3): black, brown, auburn, fair. */
export const HAIR: Material[] = [m(0x2c241e), m(0x4e3524), m(0x6e3a20), m(0xa08350)];

/**
 * Tunic and cloak colours by palette key. Kept muted on purpose: team colour
 * lives on shields, crests and standards (docs/ART_STYLE.md §9), bodies stay neutral.
 */
export const CLOTH: Record<string, Material> = {
  tunicBlue: m(0x5a6470, { grit: 0.4, contrast: 0.85 }),
  tunicGreen: m(0x5e6b45, { grit: 0.4, contrast: 0.85 }),
  tunicWhite: m(0xb6aa8e, { grit: 0.5, contrast: 0.85 }),
  tunicRed: m(0x8a5444, { grit: 0.4, contrast: 0.85 }),
  tunicOchre: m(0x9c7a44, { grit: 0.45, contrast: 0.85 }),
  cloakRed: m(0x744036, { grit: 0.35, contrast: 0.95 }),
  cloakPurple: m(0x5e4650, { grit: 0.3, contrast: 0.95 }),
  cloakBlue: m(0x4c5866, { grit: 0.3, contrast: 0.95 }),
  cloakBrown: m(0x6a5038, { grit: 0.4, contrast: 0.95 }),
  cloakBlack: m(0x302a2a, { grit: 0.3, contrast: 0.95 }),
  // cosmetic cloaks: richer dyes than the issue cloaks
  cloakCrimson: m(0x9a3024, { grit: 0.2, contrast: 1 }),
  cloakRoyal: m(0x6a3a7e, { grit: 0.2, contrast: 1 }),
  cloakGold: m(0xb08a3a, { grit: 0.15, contrast: 1 }),
  checkGreen: m(0x5a6440, { grit: 0.5 }),
  checkRed: m(0x7a4a3a, { grit: 0.5 }),
  trouserBrown: m(0x6a5440, { grit: 0.5 }),
};

export const BRONZE: Material = { ramp: [0xe9cf8a, 0xc59a52, 0x9a7036, 0x6e4c26, 0x46301a], metal: true, grit: 0.35, contrast: 1.15 };
export const SILVER: Material = { ramp: [0xf0eee6, 0xc4c6c2, 0x92969a, 0x62666c, 0x3c3e44], metal: true, grit: 0.2, contrast: 1.15 };
export const IRON: Material = { ramp: [0xcfd0c8, 0x8e9090, 0x666a6c, 0x45484c, 0x2c2e32], metal: true, grit: 0.3, contrast: 1.1 };
export const LINEN: Material = m(0xc8bb9a, { grit: 0.45, contrast: 0.9 });
export const LEATHER: Material = m(0x7a5a3c, { grit: 0.5 });
export const DARK_LEATHER: Material = m(0x4e3826, { grit: 0.4 });
export const WOOD: Material = m(0x7a5a38, { grit: 0.3 });
export const DARK_WOOD: Material = m(0x5a4028, { grit: 0.3 });
export const FELT: Material = m(0x8a6e4a, { grit: 0.5 });
export const STRING: Material = { ramp: [0xd8ccb0, 0xb0a488, 0x8a7e66] };
export const BLOOD: Material = { ramp: [0x6e2018, 0x5a1812, 0x46120e], contrast: 0.4 };

/** Helmet crests and plumes by paint field. */
export const CREST: Record<string, Material> = {
  red: m(0x9a2e22, { contrast: 0.9 }),
  ink: m(0x2c2420, { contrast: 0.9 }),
  cream: m(0xc8bc9c, { contrast: 0.9 }),
};

/** Shield face fields and emblem inks by paint key. */
const TEAM_RED = [0xcc7677, 0xb83d4a, 0xa12735, 0x7e2430, 0x5e2427];
const TEAM_BLUE = [0x7a8eaa, 0x4f6c8c, 0x3d5a78, 0x2e3e56, 0x232c40];
const CREAM = [0xf2ecdf, 0xdfd9cd, 0xc8bca8, 0xa89a86, 0x7e6e60];
const SLATE = [0x4e5e7c, 0x3d4c68, 0x2e3e56, 0x26304a, 0x1e2438];
export const FIELD: Record<string, number[]> = {
  bronze: BRONZE.ramp,
  cream: CREAM,
  red: TEAM_RED,
  ink: SLATE,
  blue: TEAM_BLUE,
  silver: SILVER.ramp,
  gold: [0xfff2b0, 0xf0c860, 0xc8963a, 0x8e6224, 0x5a3a1a],
};
/** Emblem paints: saturated team colours that read against the field (no black). */
export const INK: Record<string, number[]> = {
  bronze: [0xe9cf8a, 0xd2b68e, 0xb08a3a, 0x8a6a2c, 0x5e4420],
  cream: CREAM,
  red: TEAM_RED,
  ink: SLATE,
  gold: [0xfff2b0, 0xf0c860, 0xc8963a, 0x8e6224, 0x5a3a1a],
};
/** A shield's light rim on its lit (upper-left) side. */
export const RIM_LIGHT = [0xf6f0e2, 0xe6dfd0, 0xdfd9cd, 0xd2b8a7, 0xb39a88];

/** Horse coats. */
export const COATS: Material[] = [
  m(0x6a4228, { grit: 0.3 }), // bay
  m(0x8a5430, { grit: 0.3 }), // chestnut
  m(0x8e8a80, { grit: 0.3 }), // grey
  m(0x3a302a, { grit: 0.25 }), // black
  m(0x9c8458, { grit: 0.3 }), // dun
];
export const MANE: Material = m(0x2a2220);
export const HOOF: Material = m(0x3a3028);

/** Animal coats. */
export const BEAST: Record<string, { coat: Material; belly: Material; dark: Material }> = {
  wolf: { coat: m(0x7a7468, { grit: 0.5 }), belly: m(0xa8a090, { grit: 0.4 }), dark: m(0x3e3a34) },
  boar: { coat: m(0x4a3a2c, { grit: 0.6 }), belly: m(0x5e4a38, { grit: 0.5 }), dark: m(0x2a221c) },
  bear: { coat: m(0x5a3e28, { grit: 0.5 }), belly: m(0x6e5034, { grit: 0.4 }), dark: m(0x2e2218) },
};
export const IVORY: Material = { ramp: [0xeee6d0, 0xd2c6a6, 0xa89a7a] };
export const EYE: Material = { ramp: [0x1a1412, 0x1a1412] };

// ---------------------------------------------------------------- rarity finishes

/** Gold leaf / gilded trim (epic and legendary accents). */
export const GOLD: Material = { ramp: [0xfff2b0, 0xf0c860, 0xc8963a, 0x8e6224, 0x5a3a1a], metal: true, grit: 0.1, contrast: 1.2, glint: true };
/** Tarnished bronze: common gear, dull and spotted. */
export const DULL_BRONZE: Material = { ramp: [0xc8b07a, 0xa48450, 0x7e6036, 0x5a4226, 0x3c2c1a], metal: true, grit: 0.6, contrast: 1.0 };
/** Burnished bronze: rare gear, bright and clean. */
export const BRIGHT_BRONZE: Material = { ramp: [0xfbe6a6, 0xdcb060, 0xae7c3a, 0x7a5228, 0x4a321c], metal: true, grit: 0.12, contrast: 1.25, glint: true };
/** Orichalcum: the legendary metal, a pale fiery gold. */
export const ORICHALCUM: Material = { ramp: [0xfffbe0, 0xffe08a, 0xf0a848, 0xb46a2c, 0x6e3a1e], metal: true, grit: 0, contrast: 1.3, glint: true };
/** Dull iron (common), bright steel (rare+) and starmetal (legendary). */
export const DULL_IRON: Material = { ramp: [0xa8a49a, 0x7a7872, 0x5a5a58, 0x403f40, 0x2a2a2c], metal: true, grit: 0.55, contrast: 1.0 };
export const STEEL: Material = { ramp: [0xf0f2ec, 0xb4bcc0, 0x7e8890, 0x52585e, 0x30343a], metal: true, grit: 0.08, contrast: 1.25, glint: true };
export const STARMETAL: Material = { ramp: [0xffffff, 0xd0f0ff, 0x8ec0e0, 0x5a80a8, 0x34466a], metal: true, grit: 0, contrast: 1.3, glint: true };
/** Glowing cores of legendary weapons (a fixed bright ramp, barely shaded). */
export const EMBER: Material = { ramp: [0xfff4c0, 0xffd060, 0xf09030, 0xc85a20], contrast: 0.4, glint: true };
export const DIVINE: Material = { ramp: [0xffffff, 0xe8fcff, 0xb0e8ff, 0x7ac0f0], contrast: 0.4, glint: true };
/** Polished silver (argyraspides). */
export const BRIGHT_SILVER: Material = { ...SILVER, grit: 0.05, glint: true };

/** Rarity rank (0 common .. 4 legendary) -> the finish of a bronze piece. */
export function bronzeOf(r: number): Material {
  return r <= 0 ? DULL_BRONZE : r === 1 ? BRONZE : r === 2 || r === 3 ? BRIGHT_BRONZE : ORICHALCUM;
}
/** Rarity rank -> the finish of an iron piece. */
export function ironOf(r: number): Material {
  return r <= 0 ? DULL_IRON : r === 1 ? IRON : r === 2 || r === 3 ? STEEL : STARMETAL;
}
/** Trim (rims, brow bands, crest holders): gilded from epic up. */
export function trimOf(r: number, base: Material): Material {
  return r >= 3 ? GOLD : base;
}

/** Crest colours by cosmetic / per-man variety key (team colour lives on crests). */
export const CREST_EXTRA: Record<string, Material> = {
  deepred: { ramp: ramp(0x7a2420, 5), contrast: 0.9 },
  white: { ramp: [0xfaf6ea, 0xe8e0cc, 0xccc2aa, 0xa49a84, 0x7a705e], contrast: 0.9 },
  gold: { ramp: GOLD.ramp, contrast: 0.9, glint: true },
  purple: { ramp: ramp(0x6a2e6e, 5), contrast: 0.9 },
  blue: { ramp: ramp(0x34507a, 5), contrast: 0.9 },
  black: { ramp: ramp(0x2a2224, 5), contrast: 0.9 },
};
