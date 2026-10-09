/**
 * MIconButton: the square v4 button carrying one icon (rename, copy, delete, a
 * slot filter, the camp's muster / build rail, the follow toggle, the tutorial
 * skip) or a short glyph (+, -, a group numeral: `text`). Bronze (secondary), stone (neutral), terracotta (primary), a lit
 * parchment block (selected), a lit bronze block with a gold rim (lit) or flat
 * grey (disabled, with a reason shown on tap). Its label is the long-press text
 * and what scripts find it by. At least 22 UI px (44 pt).
 */
import Phaser from 'phaser';
import type { MosaicStyle } from '../../art/mosaicUi';
import { addIcon, scaleIcon, ICON_PX } from '../kit';
import { uiId } from '../layout';
import { MOSAIC } from '../tokens';
import { MBadge, TAP, centeredFace, makePressable, midY, mosaicImage, mosaicTexture, mtext, mw, put } from './base';

export type MIconButtonVariant = 'secondary' | 'neutral' | 'primary' | 'selected' | 'lit' | 'disabled';

export interface MIconButtonOpts {
  /** The icon (or `text`). */
  icon?: string;
  /** A short glyph or numeral in Cinzel instead of an icon ('+', 'III'); never cut. */
  text?: string;
  /** Accessible name: the long-press text and what scripts find it by. */
  label: string;
  variant?: MIconButtonVariant;
  /** Shorthand for `variant: 'primary'`. */
  primary?: boolean;
  onClick?: () => void;
  /** Why it cannot be used (a tap says it); also makes the button disabled. */
  off?: string;
  /** Long-press text when it differs from the label. */
  tip?: string;
  badge?: number | string;
  /** A small count in the lower right corner (built structures). */
  count?: string;
  id?: string;
}

const STYLE: Record<MIconButtonVariant, [MosaicStyle, MosaicStyle]> = {
  secondary: ['btnBronze', 'btnBronzeDown'],
  neutral: ['btnNeutral', 'btnNeutralDown'],
  primary: ['btnPrimary', 'btnPrimaryDown'],
  selected: ['trackSel', 'trackSel'],
  lit: ['btnBronze', 'btnBronzeDown'],
  disabled: ['btnStone', 'btnStone'],
};

export class MIconButton extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  readonly opts: { label: string; icon?: string };
  private variant: MIconButtonVariant;
  private enabled: boolean;
  private reason: string | undefined;
  private face: Phaser.GameObjects.Container;
  private bg!: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, private o: MIconButtonOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.max(TAP, Math.round(w));
    this.h = Math.max(TAP, Math.round(h));
    this.variant = o.off ? 'disabled' : o.variant ?? (o.primary ? 'primary' : 'secondary');
    this.enabled = this.variant !== 'disabled';
    this.reason = o.off;
    this.opts = { label: o.text ?? o.label, icon: o.icon };
    this.face = centeredFace(scene, this.w, this.h);
    this.add(this.face);
    this.build();
    makePressable(this, {
      face: this.face,
      w: this.w,
      h: this.h,
      onTap: () => o.onClick?.(),
      down: () => this.surface(true),
      up: () => this.surface(false),
      tip: o.tip ?? o.label,
      disabled: () => (this.enabled ? undefined : this.reason),
    });
    uiId(this, o.id ?? `ibtn:${o.label}`);
    scene.add.existing(this);
  }

  /** Enable or disable; `reason` is what a tap on the disabled button says. */
  setEnabled(on: boolean, reason?: string): this {
    if (reason !== undefined) this.reason = reason;
    if (on === this.enabled) return this;
    this.enabled = on;
    const base = this.o.variant ?? (this.o.primary ? 'primary' : 'secondary');
    this.variant = on ? (base === 'disabled' ? 'secondary' : base) : 'disabled';
    this.build();
    return this;
  }

  private surface(down: boolean): void {
    if (!this.enabled) return;
    this.bg.setTexture(mosaicTexture(this.scene, this.w, this.h, STYLE[this.variant][down ? 1 : 0]));
  }

  private build(): void {
    const scene = this.scene;
    this.face.removeAll(true);
    const v = this.variant;
    this.bg = put(this.face, this.w, this.h, mosaicImage(scene, 0, 0, this.w, this.h, STYLE[v][0]));
    if (this.o.text) {
      const font = v === 'disabled' ? 'rOff' : 'rCream';
      const tw = mw(this.o.text, font, 7);
      put(this.face, this.w, this.h, mtext(scene, Math.round((this.w - tw) / 2), midY(this.h - 1, 7), this.o.text, font, { size: 7, box: { owner: this, w: this.w, h: this.h } }));
    }
    if (this.o.icon) {
      const ic = scaleIcon(addIcon(scene, 0, 0, this.o.icon, v === 'disabled' ? 'D' : v === 'selected' ? '' : 'L'), Math.min(1.6, (this.h - 8) / ICON_PX));
      ic.setPosition(Math.round((this.w - ic.displayWidth) / 2), Math.round((this.h - ic.displayHeight) / 2) - 1);
      put(this.face, this.w, this.h, ic);
    }
    if (v === 'lit') {
      const g = scene.add.graphics();
      g.lineStyle(1, MOSAIC.goldHi, 1);
      g.strokeRect(1.5, 1.5, this.w - 3, this.h - 3);
      put(this.face, this.w, this.h, g);
    }
    if (this.o.count) put(this.face, this.w, this.h, mtext(scene, this.w - 3, this.h - 9, this.o.count, 'rCream', { size: 5.5, align: 1, box: { owner: this, w: this.w, h: this.h } }));
    const b = this.o.badge;
    if (b !== undefined && b !== 0 && this.enabled) this.face.add(new MBadge(scene, this.w / 2 - 3, -this.h / 2 + 3, b));
  }
}
