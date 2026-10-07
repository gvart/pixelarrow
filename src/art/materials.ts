/**
 * Material ramps for the 3D-built sprites: a muted, earthy ancient
 * Mediterranean palette (sun-browned skin, undyed and indigo wool, madder
 * crimson, weathered bronze, dull iron, dusty leather). Every ramp is light to
 * dark; src/art/model3d.ts picks tones from it by lighting.
 */
import { ramp, type Material } from './model3d';

const m = (base: number, extra: Partial<Material> = {}, n = 5): Material => ({ ramp: ramp(base, n), ...extra });

/** Skin tones (Look.skin 0..3): fair, olive, tanned, dark. */
export const SKIN: Material[] = [m(0xc89878, { contrast: 0.9 }), m(0xb07e58, { contrast: 0.9 }), m(0x9a6a46, { contrast: 0.9 }), m(0x6e4a32, { contrast: 0.9 })];
/** Hair colours (Look.hair 0..3): black, brown, auburn, fair. */
export const HAIR: Material[] = [m(0x2c241e), m(0x4e3524), m(0x6e3a20), m(0xa08350)];

/** Tunic colours by palette key. */
export const CLOTH: Record<string, Material> = {
  tunicBlue: m(0x4f6378, { grit: 0.4, contrast: 0.85 }),
  tunicGreen: m(0x5e6b45, { grit: 0.4, contrast: 0.85 }),
  tunicWhite: m(0xb6aa8e, { grit: 0.5, contrast: 0.85 }),
  tunicRed: m(0x8a3428, { grit: 0.4, contrast: 0.85 }),
  tunicOchre: m(0x9c7a44, { grit: 0.45, contrast: 0.85 }),
  cloakRed: m(0x8c2a22, { grit: 0.35, contrast: 0.95 }),
  cloakPurple: m(0x5c3048, { grit: 0.3, contrast: 0.95 }),
  cloakBlue: m(0x3e5068, { grit: 0.3, contrast: 0.95 }),
  cloakBrown: m(0x6a5038, { grit: 0.4, contrast: 0.95 }),
  cloakBlack: m(0x302a2a, { grit: 0.3, contrast: 0.95 }),
  checkGreen: m(0x5a6440, { grit: 0.5 }),
  checkRed: m(0x7a3c2c, { grit: 0.5 }),
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
export const FIELD: Record<string, number[]> = {
  bronze: BRONZE.ramp,
  cream: ramp(0xc4b48e),
  red: ramp(0x8e2e24),
  ink: ramp(0x2e2622),
  blue: ramp(0x3c5068),
  silver: SILVER.ramp,
};
export const INK: Record<string, number[]> = {
  bronze: ramp(0xb08840),
  cream: ramp(0xd2c6a6),
  red: ramp(0x9a3024),
  ink: ramp(0x241c1a),
};

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
