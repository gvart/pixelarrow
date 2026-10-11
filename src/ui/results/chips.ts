/**
 * The Summary's report notes as chips with icons (audit RES-5): a promotion
 * is a gilded badge, the bounty a coin, the rest an (i). The text wraps and
 * is never cut (G14).
 */
import Phaser from 'phaser';
import { addIcon, type ScrollArea } from '../kit';
import { Label } from '../widgets';
import { mosaicImage } from '../mosaic';
import { MOSAIC } from '../tokens';
import { uiId } from '../layout';
import type { NoteChip } from './model';

/** A chip at (x, y), `w` wide, added to `parent`. */
export function addNoteChip(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, w: number, chip: NoteChip, area: ScrollArea, id: string): { c: Phaser.GameObjects.Container; h: number } {
  const c = scene.add.container(Math.round(x), Math.round(y));
  const pad = 4;
  const tx = pad + 12 + 4;
  const label = new Label(scene, tx, pad, chip.text, { maxW: w - tx - pad, maxLines: 6, font: chip.tone === 'plain' ? 'pInk' : 'pGood', area });
  const h = Math.max(20, label.h + 2 * pad);
  c.add(mosaicImage(scene, 0, 0, w, h, chip.tone === 'badge' ? 'parchmentSel' : 'parchment'));
  if (chip.tone === 'badge') {
    const g = scene.add.graphics();
    g.lineStyle(1.2, MOSAIC.bronze, 1);
    g.strokeRect(1, 1, w - 2, h - 2);
    c.add(g);
  }
  c.add(addIcon(scene, pad, Math.round((h - 12) / 2), chip.icon));
  c.add(label);
  uiId(label, id);
  parent.add(c);
  return { c, h };
}
