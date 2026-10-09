/**
 * Rarity name fonts for parchment: the rarity colours darkened to read on
 * cream paper (RARITY_INK, AA-checked in tests/tokens.test.ts). The stone
 * panels keep the light ones of ui/fonts.ts.
 */
import type Phaser from 'phaser';
import { normalizeRarity } from '../../data/items';
import { registerVectorFont, type FontKey } from '../kit';
import { RARITY_INK } from '../tokens';

/** The font key of an item name in its rarity ink; registers the fonts on first use. */
export function parchRarityFont(scene: Phaser.Scene, rarity: string): FontKey {
  const r = normalizeRarity(rarity);
  if (!scene.textures.exists('font_rarP_legendary')) for (const [k, c] of Object.entries(RARITY_INK)) registerVectorFont(scene, `font_rarP_${k}`, c);
  return `rarP_${r}` as FontKey;
}
