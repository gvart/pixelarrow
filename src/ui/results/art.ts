/**
 * The painted art of the Results screen (AS-05, audit RES-2 and RES-4): the
 * gilded laurel branch beside the banner plaque (the right branch is the left
 * one mirrored) and the open, empty chest of the Spoils empty state. Cutout
 * PNGs in public/ui/, loaded by ResultsScene.preload; a missing file draws
 * nothing rather than break the screen.
 */
import Phaser from 'phaser';
import { hasRaster } from '../mosaic/raster';

export const LAUREL_KEY = 'ui_laurel_branch';
export const CHEST_EMPTY_KEY = 'ui_chest_open_empty';
const FILES: Record<string, string> = { [LAUREL_KEY]: 'ui/laurel_branch.png', [CHEST_EMPTY_KEY]: 'ui/chest_open_empty.png' };
/** Source aspect (width / height) of each file: 160x216 and 288x272. */
const ASPECT: Record<string, number> = { [LAUREL_KEY]: 160 / 216, [CHEST_EMPTY_KEY]: 288 / 272 };

/** Queue the files the screen has not loaded yet. */
export function preloadResultsArt(scene: Phaser.Scene): void {
  for (const [key, url] of Object.entries(FILES)) if (!scene.textures.exists(key)) scene.load.image(key, url);
}

/** A painted cutout `h` UI px tall at (x, y) (origin top left), smoothed; null when the file is missing. */
export function addCutout(scene: Phaser.Scene, key: string, x: number, y: number, h: number): Phaser.GameObjects.Image | null {
  if (!hasRaster(scene, key)) return null;
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
  return scene.add.image(Math.round(x), Math.round(y), key).setOrigin(0, 0).setDisplaySize(Math.round(h * ASPECT[key]), Math.round(h));
}

/** Width in UI px of the cutout `key` drawn `h` tall. */
export const cutoutW = (key: string, h: number): number => Math.round(h * ASPECT[key]);
