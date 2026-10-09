/**
 * FrescoFrame: the dark bronze riveted frame of a fresco banner around art
 * the caller draws (the shop's pixel market stall), instead of a painted image.
 */
import Phaser from 'phaser';
import { FRESCO_T } from '../../art/mosaicUi';
import { mosaicImage } from './base';

/** `art` draws into the inside rect (x, y, w, h in the frame's coordinates). Decorative: not tappable. */
export class FrescoFrame extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, art: (parent: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number) => void) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = Math.round(h);
    const t = FRESCO_T;
    this.add(mosaicImage(scene, 0, 0, this.w, this.h, 'parchmentWell'));
    art(this, t, t, this.w - t * 2, this.h - t * 2);
    this.add(mosaicImage(scene, 0, 0, this.w, this.h, 'fresco'));
    scene.add.existing(this);
  }
}
