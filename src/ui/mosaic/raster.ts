/**
 * Painted illustrations of the v4 UI (fresco banners, portraits): raster
 * files in public/ui/, loaded in BootScene and drawn cover-cropped into a rect.
 * A missing file never breaks a screen: the rect shows plain parchment.
 */
import Phaser from 'phaser';
import { panelK } from '../kit';
import { mosaicImage } from './base';

/** Texture key -> file under public/ui/. */
export const RASTERS: Record<string, string> = {
  ui_banner_campaign: 'ui/banner_campaign.jpg',
  ui_portrait_leader: 'ui/portrait_leader.jpg',
};

/** Queue the painted images (BootScene.preload). A file that fails to load is skipped. */
export function preloadRasters(scene: Phaser.Scene): void {
  for (const [key, url] of Object.entries(RASTERS)) scene.load.image(key, url);
  scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (f: Phaser.Loader.File) => console.warn('ui image missing', f.key));
}

/** The image `key` is loaded. */
export function hasRaster(scene: Phaser.Scene, key: string): boolean {
  return scene.textures.exists(key) && scene.textures.get(key).key !== '__MISSING';
}

/** Draw `key` cover-cropped into a w x h (UI px) canvas texture, cached by key and size; null when it is not loaded. */
export function coverTexture(scene: Phaser.Scene, key: string, w: number, h: number): string | null {
  if (!hasRaster(scene, key)) return null;
  const K = panelK(scene);
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  const out = `cover_${key}_${w}x${h}@${K}`;
  if (scene.textures.exists(out)) return out;
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const canvas = document.createElement('canvas');
  canvas.width = w * K;
  canvas.height = h * K;
  const scale = Math.max(canvas.width / src.width, canvas.height / src.height);
  const dw = src.width * scale;
  const dh = src.height * scale;
  const ctx = canvas.getContext('2d')!;
  // pixel art (a beast's thumbnail) stays crisp; painted images are smoothed
  ctx.imageSmoothingEnabled = src.width >= 128;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  scene.textures.addCanvas(out, canvas)!.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return out;
}

/** An image of `key` cover-cropped to w x h at (x, y); plain parchment when the file is missing. */
export function addCover(scene: Phaser.Scene, x: number, y: number, w: number, h: number, key: string | undefined): Phaser.GameObjects.Image {
  const tex = key ? coverTexture(scene, key, w, h) : null;
  if (!tex) return mosaicImage(scene, x, y, w, h, 'parchment');
  return scene.add.image(x, y, tex).setOrigin(0, 0).setScale(1 / panelK(scene));
}
