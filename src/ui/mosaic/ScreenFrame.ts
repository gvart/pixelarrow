/**
 * ScreenFrame: the v4 page (V4_SPEC "Screen frame"): dark basalt behind, a
 * carved-stone frame with a gold meander and corner rosettes, parchment inside.
 * The top bar sits inside the frame under its upper band; the content area is
 * what is left. Build it first, then place the TopBar at `topBar` and the
 * screen's content in `content`.
 */
import Phaser from 'phaser';
import { FRAME_T } from '../../art/mosaicUi';
import { SPACE } from '../tokens';
import { mosaicImage } from './base';
import { TAB_FRAME_GAP } from './tabLayout';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Height of the top bar strip (the plaque, the back arrow and the gear), UI px. */
export const TOPBAR_H = 24;

export interface ScreenFrameOpts {
  /** Height of the tab bar under the frame (0 for a sub-screen, which hides it); a small gap of page is left above it. */
  tabBar?: number;
  /** Reserve the top bar strip (default true). */
  topBar?: boolean;
  /** Top of the page (default 0: a screen of its own; the Kit gallery leaves room for its tabs). */
  y?: number;
}

export class ScreenFrame extends Phaser.GameObjects.Container {
  /** The whole frame (stone band included). */
  readonly rect: Box;
  /** The top bar strip, inside the band. */
  readonly topBar: Box;
  /** The parchment area under the top bar (inside the band); screens lay their content in `inner`. */
  readonly content: Box;
  /** `content` inset by the standard screen padding. */
  readonly inner: Box;

  constructor(scene: Phaser.Scene, VW: number, VH: number, o: ScreenFrameOpts = {}) {
    super(scene, 0, 0);
    const y0 = o.y ?? 0;
    const bottom = VH - (o.tabBar ? o.tabBar + TAB_FRAME_GAP : 0);
    this.rect = { x: 0, y: y0, w: VW, h: bottom - y0 };
    const barH = o.topBar === false ? 0 : TOPBAR_H;
    this.topBar = { x: FRAME_T, y: y0 + FRAME_T, w: VW - FRAME_T * 2, h: barH };
    this.content = { x: FRAME_T, y: y0 + FRAME_T + barH, w: VW - FRAME_T * 2, h: bottom - y0 - FRAME_T * 2 - barH };
    const pad = SPACE.md;
    this.inner = { x: this.content.x + pad, y: this.content.y + SPACE.sm, w: this.content.w - pad * 2, h: this.content.h - SPACE.sm - pad };
    this.add(mosaicImage(scene, 0, y0, VW, VH - y0, 'page'));
    this.add(mosaicImage(scene, this.content.x, this.content.y, this.content.w, this.content.h, 'paper'));
    if (barH > 0) this.add(mosaicImage(scene, this.topBar.x, this.topBar.y, this.topBar.w, barH, 'topBar'));
    this.add(mosaicImage(scene, 0, y0, VW, bottom - y0, 'frame'));
    scene.add.existing(this);
  }
}
