/**
 * MPager: the two arrows and "3 / 9" between them, for walking through the
 * heroes; `addSwipe` walks them with a horizontal swipe.
 */
import Phaser from 'phaser';
import { GAP, TAP, midY, mtext } from './base';
import { MIconButton } from './iconButton';
import { haptic } from '../../platform/haptics';

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

/** Horizontal swipes on `zone` (an interactive object): left = next, right = previous. */
export function addSwipe(zone: Phaser.GameObjects.GameObject, onLeft: () => void, onRight: () => void, minPx = 40): void {
  let start: { x: number; y: number; t: number } | null = null;
  zone.on('pointerdown', (p: Phaser.Input.Pointer) => (start = { x: p.x, y: p.y, t: p.downTime }));
  zone.on('pointerup', (p: Phaser.Input.Pointer) => {
    const s = start;
    start = null;
    if (!s) return;
    const dx = p.x - s.x;
    const dy = p.y - s.y;
    const scale = (zone.scene?.game.scale.width ?? 1) / Math.max(1, window.innerWidth || 1);
    if (Math.abs(dx) < minPx * scale || Math.abs(dx) < Math.abs(dy) * 1.5 || p.upTime - s.t > 700) return;
    haptic('light');
    if (dx < 0) onLeft();
    else onRight();
  });
}
