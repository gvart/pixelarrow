/**
 * Meters of the v4 UI: MBar (a thin bar with a label and a value over it, on
 * parchment: the farm Glory bar, the search range, the team's points, the
 * hero's XP and derived stats with a preview of pending points).
 */
import Phaser from 'phaser';
import { tappable } from '../kit';
import { uiId } from '../layout';
import { showTooltip } from '../widgets';
import { ACCENT, MOSAIC } from '../tokens';
import { TAP, mtext, mw } from './base';

// ================================================================== MBar

export interface MBarOpts {
  /** The line over the bar (left) and its value (right); both optional. */
  label?: string;
  right?: string;
  value: number;
  max: number;
  /** Fill colour (a token). */
  color: number;
  /** Bar height in UI px (default 5). */
  h?: number;
  /** Size of the label row's text (default 7). */
  size?: number;
  /** The trough: dark stone (default) or the pale sunken well of a hero sheet. */
  trough?: 'dark' | 'light';
  /** The label is quieter (a used-up or locked meter). */
  quiet?: boolean;
  /** The value text in a good / bad ink (a preview of pending points: "a > b"). */
  rightTone?: 'good' | 'bad';
  /** A pending value: the bar shows the move from `value` to it as a green gain or, with `worse`, a red loss. */
  preview?: number;
  /** The preview is a change for the worse. */
  worse?: boolean;
  /** Long-press / tap text; makes the meter a 22 tall touch target. */
  tip?: string;
  id?: string;
}

/** A label row (Inter on parchment) over a dark trough with a coloured fill; optionally a preview of a pending change and a tip. */
export class MBar extends Phaser.GameObjects.Container {
  readonly w: number;
  /** Total height: the label row (when there is one), the gap and the bar (at least 22 with a tip). */
  readonly h: number;
  private fill: Phaser.GameObjects.Rectangle;
  private rightText: Phaser.GameObjects.BitmapText | null = null;
  private barW: number;
  private barH: number;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, o: MBarOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.barH = o.h ?? 5;
    const hasText = !!(o.label || o.right);
    const textH = hasText ? 11 : 0;
    this.h = Math.max(o.tip ? TAP : 0, textH + this.barH);
    const size = o.size ?? 7;
    const frame = { owner: this as Phaser.GameObjects.Container, w: this.w, h: this.h };
    const rightFont = o.rightTone === 'good' ? 'pGood' : o.rightTone === 'bad' ? 'pBad' : 'pInk';
    if (o.right) {
      this.rightText = mtext(scene, this.w, 0, o.right, rightFont, { size, align: 1, box: frame });
      this.add(this.rightText);
    }
    if (o.label) this.add(mtext(scene, 0, 0, o.label, o.quiet ? 'pMuted' : o.tip ? 'pInk' : 'pSec', { size, maxW: this.w - (o.right ? mw(o.right, rightFont, size) + 8 : 0), box: frame }));
    this.barW = this.w;
    const by = this.h - this.barH - (o.tip ? 3 : 0);
    const g = scene.add.graphics();
    if (o.trough === 'light') {
      g.fillStyle(MOSAIC.parchEdge, 0.9);
      g.fillRoundedRect(0, by, this.w, this.barH, this.barH / 2.2);
      g.fillStyle(MOSAIC.well, 1);
      g.fillRoundedRect(0.7, by + 0.7, this.w - 1.4, this.barH - 1.4, Math.max(1, this.barH / 2.6));
    } else {
      g.fillStyle(MOSAIC.stone0, 1);
      g.fillRoundedRect(0, by, this.w, this.barH, 1.5);
      g.lineStyle(0.7, MOSAIC.parchEdge, 0.9);
      g.strokeRoundedRect(0.35, by + 0.35, this.w - 0.7, this.barH - 0.7, 1.5);
    }
    this.add(g);
    const f = (v: number) => (o.max > 0 ? Math.max(0, Math.min(1, v / o.max)) : 0);
    const pv = o.preview;
    const lo = pv !== undefined ? Math.min(o.value, pv) : o.value;
    this.fill = scene.add.rectangle(1, by + 1, 0, this.barH - 2, o.color).setOrigin(0, 0);
    this.add(this.fill);
    if (pv !== undefined && Math.abs(pv - o.value) > 1e-6) {
      const loW = Math.round((this.barW - 2) * f(lo));
      const hiW = Math.round((this.barW - 2) * f(Math.max(o.value, pv)));
      this.add(scene.add.rectangle(1 + loW, by + 1, Math.max(1, hiW - loW), this.barH - 2, o.worse ? ACCENT.dangerFill : 0x5fae3c).setOrigin(0, 0));
    }
    this.setValue(lo, o.max, o.right);
    if (o.tip) {
      this.setSize(this.w, this.h);
      this.setInteractive(new Phaser.Geom.Rectangle(this.w / 2, this.h / 2, this.w, this.h), Phaser.Geom.Rectangle.Contains);
      tappable(this, null, () => showTooltip(scene, o.tip!, this), o.tip);
    }
    if (o.id) uiId(this, o.id);
    scene.add.existing(this);
  }

  /** New value (and, when given, the right-hand text). */
  setValue(value: number, max: number, right?: string): this {
    const f = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    this.fill.width = Math.max(f > 0 ? 1 : 0, Math.round((this.barW - 2) * f));
    if (right !== undefined && this.rightText?.active) this.rightText.setText(right);
    return this;
  }
}
