/**
 * Extra bitmap fonts for the army / hero / stash / economy screens: item
 * names in their rarity colour (dark on parchment, light with a shadow on the
 * dark stage) and a few accent colours. Same glyphs and metrics as the kit's
 * fonts (src/ui/kit.ts registerUiAssets), so measureText / ellipsize apply.
 * Use with addText(scene, x, y, text, rarityFont('epic')).
 */
import type Phaser from 'phaser';
import { normalizeRarity, type Rarity } from '../data/items';
import { SHADOW_FONTS, registerVectorFont, type FontKey } from './kit';
import { RARITY_INK } from './tokens';

/** Readable on the stone panels (named DARK for the light-background era: the panel kind they sit on). */
const DARK: Record<Rarity, number> = {
  common: 0xc2b49c,
  uncommon: 0xa8d088,
  rare: 0x8fb4ec,
  epic: 0xc79ae8,
  legendary: 0xf0c868,
};
/** On the dark stage / tooltips (with a shadow). */
const LIGHT: Record<Rarity, number> = {
  common: 0xe0dad0,
  uncommon: 0xa8e088,
  rare: 0x9cc4ff,
  epic: 0xdcaaff,
  legendary: 0xffe080,
};

const EXTRA: Record<string, [number, number | undefined]> = {
  blue: [0x8fb0d0, undefined],
  bronze: [0xd8b36a, undefined],
  goodL: [0xa8e088, 0x1d140f],
  redL: [0xff8a70, 0x1d140f],
};

function register(scene: Phaser.Scene, name: string, color: number, shadow?: number): void {
  registerVectorFont(scene, `font_${name}`, color, shadow);
  if (shadow !== undefined) (SHADOW_FONTS as Set<FontKey>).add(name as FontKey);
}

/** Register the extra fonts once per game. */
export function ensureFonts(scene: Phaser.Scene): void {
  if (scene.textures.exists('font_rarL_legendary')) return;
  for (const r of Object.keys(DARK) as Rarity[]) {
    register(scene, `rar_${r}`, DARK[r]);
    register(scene, `rarL_${r}`, LIGHT[r], 0x1d140f);
    // ink forms for parchment (src/ui/inkSkin.ts maps rar_ and rarL_ to these)
    register(scene, `rarI_${r}`, RARITY_INK[r]);
  }
  for (const [k, [c, s]] of Object.entries(EXTRA)) register(scene, k, c, s);
}

/** The font of an item name in its rarity colour. */
export function rarityFont(r: Rarity | string, onDark = false): FontKey {
  return `${onDark ? 'rarL' : 'rar'}_${normalizeRarity(r)}` as FontKey;
}

export const FONT_BLUE = 'blue' as FontKey;
export const FONT_BRONZE = 'bronze' as FontKey;
export const FONT_GOOD_LIGHT = 'goodL' as FontKey;
export const FONT_RED_LIGHT = 'redL' as FontKey;
