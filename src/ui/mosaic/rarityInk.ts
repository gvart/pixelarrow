/**
 * Rarity name fonts for parchment: the rarity colours darkened to read on
 * cream paper (RARITY_INK, AA-checked in tests/tokens.test.ts). The stone
 * panels keep the light ones of ui/fonts.ts. These are also the fonts the ink
 * shim (ui/inkSkin.ts) maps the light rarity fonts to.
 */
import type Phaser from 'phaser';
import { normalizeRarity } from '../../data/items';
import { registerVectorFont, type FontKey } from '../kit';
import { RARITY_INK } from '../tokens';

/** Register the rarity ink fonts once per game. */
export function ensureRarityInk(scene: Phaser.Scene): void {
  if (scene.textures.exists('font_rarI_legendary')) return;
  for (const [k, c] of Object.entries(RARITY_INK)) registerVectorFont(scene, `font_rarI_${k}`, c);
}

/** The font key of an item name in its rarity ink; registers the fonts on first use. */
export function rarityInk(scene: Phaser.Scene, rarity: string): FontKey {
  ensureRarityInk(scene);
  return `rarI_${normalizeRarity(rarity)}` as FontKey;
}
