/**
 * MPager: the two arrows and "3 / 9" between them, for walking through the
 * heroes.
 */
import Phaser from 'phaser';
import { GAP, TAP, midY, mtext } from './base';
import { MIconButton } from './iconButton';

export interface PagerOpts {
  index: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
  prevTip: string;
  nextTip: string;
}

/** The two arrows and "3 / 9" between them, for walking through the heroes. 22 tall; `PAGER_W` wide. */
export const PAGER_W = TAP * 2 + 34 + GAP * 2;
export class MPager extends Phaser.GameObjects.Container {
  readonly w = PAGER_W;
  readonly h = TAP;

  constructor(scene: Phaser.Scene, x: number, y: number, o: PagerOpts) {
    super(scene, Math.round(x), Math.round(y));
    const mk = (bx: number, icon: string, tip: string, id: string, fn: () => void) => {
      const b = new MIconButton(scene, bx, 0, TAP, TAP, { icon, label: tip, variant: 'neutral', id, onClick: fn });
      this.add(b);
    };
    mk(0, 'chevL', o.prevTip, 'hero.prev', o.onPrev);
    const label = `${o.index + 1} / ${o.count}`;
    const txt = mtext(scene, TAP + GAP + 17, midY(TAP, 7), label, 'rGold', { align: 0.5, maxW: 34, box: { owner: this, w: PAGER_W, h: TAP } });
    this.add(txt);
    mk(PAGER_W - TAP, 'chevR', o.nextTip, 'hero.next', o.onNext);
    scene.add.existing(this);
  }
}
