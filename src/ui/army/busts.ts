/**
 * Painted class busts (AS-02, art bible §5.2): shown where the Army screen
 * names a CLASS (V5-045). A hero's own face stays his paper-doll portrait.
 * Files are public/ui/busts/bust_<class id>.jpg, loaded on first use. Only
 * busts that were checked in the game and promoted (scripts/art/promote.mjs)
 * are listed: a class without one shows no medallion, never a broken image.
 */
import Phaser from 'phaser';
import { addCover, hasRaster } from '../mosaic/raster';
import { MOSAIC } from '../tokens';
import { uiId } from '../layout';

import { SHIPPED_BUSTS, bustKey, bustUrl } from './layout';

/** Busts already asked for (a file that failed to load is not asked for again). */
const asked = new Set<string>();

/** Load the shipped busts of `classes` not asked for yet; `done` runs once they arrive (not at all when none was missing). */
export function ensureBusts(scene: Phaser.Scene, classes: Iterable<string>, done: () => void): void {
  const missing = [...new Set(classes)].filter((c) => SHIPPED_BUSTS.has(c) && !asked.has(c) && !hasRaster(scene, bustKey(c)));
  if (!missing.length) return;
  for (const c of missing) {
    asked.add(c);
    scene.load.image(bustKey(c), bustUrl(c));
  }
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
    if (scene.sys.isActive()) done();
  });
  scene.load.start();
}

/** The class bust as a framed medallion (`size` UI px square) at (x, y), or nothing when it is not loaded. */
export function addClassBust(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, size: number, cls: string): boolean {
  if (!SHIPPED_BUSTS.has(cls) || !hasRaster(scene, bustKey(cls))) return false;
  const g = scene.add.graphics();
  g.fillStyle(0x1a0d06, 1);
  g.fillRoundedRect(x - 1.5, y - 1.5, size + 3, size + 3, 3);
  g.fillStyle(MOSAIC.bronze, 1);
  g.fillRoundedRect(x - 0.8, y - 0.8, size + 1.6, size + 1.6, 2.4);
  parent.add(g);
  parent.add(uiId(addCover(scene, x, y, size, size, bustKey(cls)), 'army.bust'));
  return true;
}
