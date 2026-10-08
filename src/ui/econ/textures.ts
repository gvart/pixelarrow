/**
 * Textures of the goods icons (src/art/goodsIcons.ts) and cosmetic previews
 * (src/art/cosmeticArt.ts): smooth icons drawn at the screen's density (K
 * atlas px per UI px, src/ui/kit.ts panelK), so an image showing one is scaled
 * back to its UI px size (`fitGoodsIcon` / `fitCosmetic`). Without a DOM
 * (tests) the old pixel icons are used at 1 atlas px per UI px.
 */
import Phaser from 'phaser';
import { panelK } from '../kit';
import { renderGoodsIcon, renderGoodsIconHD, goodsIconKey, type GoodsKind } from '../../art/goodsIcons';
import { renderCosmetic, renderCosmeticHD, cosmeticKey, COSMETIC_PREVIEW } from '../../art/cosmeticArt';

/** The goods icons' size in UI px. */
export const GOODS_PX = 16;

export function goodsTexture(scene: Phaser.Scene, kind: GoodsKind, id: string): string {
  if (typeof document === 'undefined') {
    const key = goodsIconKey(kind, id);
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, renderGoodsIcon(kind, id).toCanvas());
    return key;
  }
  const px = GOODS_PX * panelK(scene);
  const key = goodsIconKey(kind, id, px);
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, renderGoodsIconHD(kind, id, px))!.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}

/** Scale an image of a goods icon texture to `size` UI px. */
export function fitGoodsIcon(img: Phaser.GameObjects.Image, size = GOODS_PX): Phaser.GameObjects.Image {
  return img.setScale(size / Math.max(1, img.width));
}

/** A goods icon image at (x, y), origin top-left, `size` UI px on a side. */
export function addGoodsIcon(scene: Phaser.Scene, x: number, y: number, kind: GoodsKind, id: string, size = GOODS_PX): Phaser.GameObjects.Image {
  return fitGoodsIcon(scene.add.image(Math.round(x), Math.round(y), goodsTexture(scene, kind, id)).setOrigin(0, 0), size);
}

/** The texture of a cosmetic's preview for showing at `size` UI px. */
export function cosmeticTexture(scene: Phaser.Scene, id: string, slot: string, size = COSMETIC_PREVIEW): string {
  if (typeof document === 'undefined') {
    const key = cosmeticKey(id);
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, renderCosmetic(id, slot).toCanvas());
    return key;
  }
  const px = Math.round(size * panelK(scene));
  const key = cosmeticKey(id, px);
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, renderCosmeticHD(id, slot, px))!.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}

/** Scale an image of a cosmetic preview texture to `size` UI px. */
export function fitCosmetic(img: Phaser.GameObjects.Image, size = COSMETIC_PREVIEW): Phaser.GameObjects.Image {
  return img.setScale(size / Math.max(1, img.width));
}

/** A cosmetic preview image at (x, y), origin top-left, `size` UI px on a side. */
export function addCosmetic(scene: Phaser.Scene, x: number, y: number, id: string, slot: string, size = COSMETIC_PREVIEW): Phaser.GameObjects.Image {
  return fitCosmetic(scene.add.image(Math.round(x), Math.round(y), cosmeticTexture(scene, id, slot, size)).setOrigin(0, 0), size);
}
