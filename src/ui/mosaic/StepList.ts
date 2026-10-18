/**
 * StepList (design/ux/accounts-v6.md §12): numbered steps in a column, used by Link Telegram (AU-13).
 * The current step's number is lit bronze, a done step shows a tick (not colour alone), a pending one is
 * quiet; the current step has a slot under its title for its controls (a button, the QR code, a timer),
 * which the caller adds at `slotY`.
 */
import Phaser from 'phaser';
import { addIcon, scaleIcon } from '../kit';
import { MOSAIC } from '../tokens';
import { mtext } from './base';

export type StepState = 'pending' | 'current' | 'done';

export interface Step {
  title: string;
  state: StepState;
  /** Height of the controls under this step (its slot), UI px. */
  slot?: number;
}

const BADGE = 13;
const INDENT = 19;
const TEXT = 7;

export class StepList extends Phaser.GameObjects.Container {
  readonly h: number;
  private readonly slots: number[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, steps: Step[]) {
    super(scene, Math.round(x), Math.round(y));
    let yy = 0;
    steps.forEach((s, i) => {
      const g = scene.add.graphics();
      const lit = s.state === 'current';
      g.fillStyle(lit ? MOSAIC.bronze : MOSAIC.parchLo, 1);
      g.fillCircle(BADGE / 2, yy + BADGE / 2, BADGE / 2);
      g.lineStyle(1, MOSAIC.parchEdge, 1);
      g.strokeCircle(BADGE / 2, yy + BADGE / 2, BADGE / 2);
      this.add(g);
      if (s.state === 'done') this.add(scaleIcon(addIcon(scene, 1, yy + 1, 'check', 'D'), 0.9));
      else this.add(mtext(scene, BADGE / 2, yy + 3, String(i + 1), lit ? 'rCream' : 'pMuted', { size: TEXT }).setOrigin(0.5, 0));
      const title = mtext(scene, INDENT, yy + 3, s.title, lit ? 'pInk' : 'pMuted', { size: TEXT, maxW: w - INDENT, wrap: true });
      this.add(title);
      yy += Math.max(BADGE, title.height + 3) + 4;
      this.slots[i] = yy;
      yy += s.slot ?? 0;
    });
    this.h = yy;
    scene.add.existing(this);
  }

  /** Where step `i`'s slot starts, in this list's coordinates; its controls go at x = indent. */
  slotY(i: number): number {
    return this.slots[i];
  }

  static readonly indent = INDENT;
}
