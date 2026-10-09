/**
 * Niche: an arched stone niche round a pixel figure (the hero's stage on the
 * Army and Hero sheets).
 */
import type Phaser from 'phaser';
import { MOSAIC } from '../tokens';

type C = Phaser.GameObjects.Container;

/**
 * An arched stone niche round a pixel figure: the figure (a Stage) sits at
 * (x, y) w x h; the stone beyond the arch and a bronze rim are drawn over its
 * corners. Add the niche after the figure.
 */
export function addNiche(scene: Phaser.Scene, parent: C, x: number, y: number, w: number, h: number): void {
  const g = scene.add.graphics();
  const ry = Math.min(w * 0.4, 24);
  // the arch: a half ellipse rising `ry` above the straight sides, inset by `d`
  const arch = (d: number) => {
    const pts: { x: number; y: number }[] = [{ x: x + d, y: y + h - d }];
    const rx = w / 2 - d;
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI + (i / 20) * Math.PI;
      pts.push({ x: x + w / 2 + rx * Math.cos(a), y: y + ry + (ry - d) * Math.sin(a) });
    }
    pts.push({ x: x + w - d, y: y + h - d });
    return pts;
  };
  // the stone beyond the arch: a wedge in each upper corner
  g.fillStyle(MOSAIC.stone2, 1);
  const a0 = arch(0);
  const top = a0.slice(1, -1);
  g.fillPoints([{ x, y }, { x: x + w / 2, y }, ...top.slice(0, 11).reverse()], true);
  g.fillPoints([{ x: x + w, y }, { x: x + w / 2, y }, ...top.slice(10)], true);
  g.fillRect(x, y, w, 1);
  g.fillStyle(MOSAIC.stone2, 1);
  g.fillRect(x - 1, y - 1, w + 2, 1);
  g.lineStyle(2.4, MOSAIC.bronzeLo, 1);
  g.strokePoints(arch(-0.6), false);
  g.lineStyle(1.2, MOSAIC.bronzeHi, 1);
  g.strokePoints(arch(-0.2), false);
  g.lineStyle(0.8, MOSAIC.stone0, 0.9);
  g.strokePoints(arch(1), false);
  parent.add(g);
}
