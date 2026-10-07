/**
 * Extra bitmap fonts for the army / hero / stash / economy screens: item
 * names in their rarity colour (dark on parchment, light with a shadow on the
 * dark stage) and a few accent colours. Same glyphs and metrics as the kit's
 * fonts (src/ui/kit.ts registerUiAssets), so measureText / ellipsize apply.
 * Use with addText(scene, x, y, text, rarityFont('epic')).
 */
import type Phaser from 'phaser';
import { renderFontAtlas, FONT_LINE_HEIGHT } from '../art/font';
import { normalizeRarity, type Rarity } from '../data/items';
import { SHADOW_FONTS, type FontKey } from './kit';

/** Readable on parchment. */
const DARK: Record<Rarity, number> = {
  common: 0x6a6258,
  uncommon: 0x3f7a2e,
  rare: 0x2f5ea8,
  epic: 0x7a3aa8,
  legendary: 0x9a6a10,
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
  blue: [0x2f5ea8, undefined],
  bronze: [0x8a5a20, undefined],
  goodL: [0xa8e088, 0x1d140f],
  redL: [0xff8a70, 0x1d140f],
};

function register(scene: Phaser.Scene, name: string, color: number, shadow?: number): void {
  const tkey = `font_${name}`;
  if (scene.textures.exists(tkey)) return;
  const { canvas, glyphs } = renderFontAtlas(color, shadow);
  scene.textures.addCanvas(tkey, canvas);
  const frame = scene.textures.getFrame(tkey);
  const tw = frame.source.width;
  const th = frame.source.height;
  const h = FONT_LINE_HEIGHT;
  const chars: Record<number, unknown> = {};
  for (const g of glyphs) {
    chars[g.ch.charCodeAt(0)] = {
      x: g.x, y: g.y, width: g.w, height: h, centerX: Math.floor(g.w / 2), centerY: Math.floor(h / 2), xOffset: 0, yOffset: 0,
      xAdvance: g.w + 1 - (shadow !== undefined ? 1 : 0), data: {}, kerning: {},
      u0: g.x / tw, v0: g.y / th, u1: (g.x + g.w) / tw, v1: (g.y + h) / th,
    };
  }
  for (let cc = 97; cc <= 122; cc++) if (!chars[cc] && chars[cc - 32]) chars[cc] = chars[cc - 32];
  for (let cc = 0x430; cc <= 0x44f; cc++) if (!chars[cc] && chars[cc - 0x20]) chars[cc] = chars[cc - 0x20];
  if (chars[0x401]) chars[0x451] = chars[0x401];
  scene.cache.bitmapFont.add(tkey, { data: { retroFont: true, font: tkey, size: 7, lineHeight: h + 1, chars }, texture: tkey, frame: null });
  if (shadow !== undefined) (SHADOW_FONTS as Set<FontKey>).add(name as FontKey);
}

/** Register the extra fonts once per game. */
export function ensureFonts(scene: Phaser.Scene): void {
  if (scene.textures.exists('font_rarL_legendary')) return;
  for (const r of Object.keys(DARK) as Rarity[]) {
    register(scene, `rar_${r}`, DARK[r]);
    register(scene, `rarL_${r}`, LIGHT[r], 0x1d140f);
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
