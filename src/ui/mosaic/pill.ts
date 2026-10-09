/**
 * Pills: the small rounded plates with a word in them. `addPill` is the
 * coloured one with cream text (a role, a level, a league, a status, "-20%");
 * `addRarityPill` is a sunken well framed in a rarity's ink with the name in
 * that ink (AA on parchment). Both return their width.
 */
import Phaser from 'phaser';
import type { Rarity } from '../../data/items';
import { uiFrame } from '../layout';
import { MOSAIC, RARITY_INK } from '../tokens';
import { fit, mtext, mw } from './base';
import { rarityInk } from './rarityInk';

type C = Phaser.GameObjects.Container;

/** A small coloured pill with cream text (role, level). `alignRight`: `x` is its right edge. Returns its width. */
export function addPill(scene: Phaser.Scene, parent: C, x: number, y: number, text: string, color: number, maxW = 200, alignRight = false): number {
  const s = fit(text, 'onAccent', 6, maxW - 8);
  const w = Math.ceil(mw(s, 'onAccent', 6)) + 8;
  if (alignRight) x -= w;
  const g = scene.add.graphics();
  g.fillStyle(0x1a0d06, 1);
  g.fillRoundedRect(Math.round(x), Math.round(y), w, 12, 3);
  g.fillStyle(color, 1);
  g.fillRoundedRect(Math.round(x) + 0.7, Math.round(y) + 0.7, w - 1.4, 10.6, 2.6);
  parent.add(g);
  const txt = mtext(scene, Math.round(x) + 4, Math.round(y) + 2, s, 'onAccent', { size: 6 });
  uiFrame(txt, g, w, 12, Math.round(x), Math.round(y));
  parent.add(txt);
  return w;
}

/** Width of a pill with `text`. */
export function pillWidth(text: string): number {
  return Math.ceil(mw(text, 'onAccent', 6)) + 8;
}

/** A rarity as a pill: a sunken well framed in the rarity's ink, `label` in that ink. */
export function addRarityPill(scene: Phaser.Scene, parent: C, x: number, y: number, rarity: Rarity, label: string, maxW: number): number {
  const s = fit(label, rarityInk(scene, rarity), 7, maxW - 8);
  const w = mw(s, rarityInk(scene, rarity), 7) + 8;
  const g = scene.add.graphics();
  g.fillStyle(MOSAIC.well, 1);
  g.fillRoundedRect(x, y, w, 12, 3);
  g.lineStyle(1, RARITY_INK[rarity], 1);
  g.strokeRoundedRect(x + 0.5, y + 0.5, w - 1, 11, 3);
  parent.add(g);
  parent.add(mtext(scene, x + 4, y + 2, s, rarityInk(scene, rarity)));
  return w;
}
