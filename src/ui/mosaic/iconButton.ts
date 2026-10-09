/**
 * MIconButton: a square v4 button carrying one icon (rename, copy, delete, put
 * in the team, a slot filter). Bronze (secondary), stone (neutral), terracotta
 * (primary), a lit parchment block (selected) or flat grey (disabled, with a
 * reason shown on tap). Its name is the long-press text and what scripts find
 * it by. At least 22 UI px (44 pt).
 */
import Phaser from 'phaser';
import type { MosaicStyle } from '../../art/mosaicUi';
import { addIcon, scaleIcon } from '../kit';
import { uiId } from '../layout';
import { MBadge, TAP, centeredFace, makePressable, mosaicImage, mosaicTexture, put } from './base';

export type MIconButtonVariant = 'secondary' | 'neutral' | 'primary' | 'selected' | 'disabled';

export interface MIconButtonOpts {
  icon: string;
  /** Accessible name: the long-press text. */
  label: string;
  variant?: MIconButtonVariant;
  onClick?: () => void;
  /** Why it cannot be used: shown on tap. */
  disabledReason?: string;
  badge?: number | string;
  id?: string;
}

const STYLE: Record<MIconButtonVariant, [MosaicStyle, MosaicStyle]> = {
  secondary: ['btnBronze', 'btnBronzeDown'],
  neutral: ['btnNeutral', 'btnNeutralDown'],
  primary: ['btnPrimary', 'btnPrimaryDown'],
  selected: ['trackSel', 'trackSel'],
  disabled: ['btnStone', 'btnStone'],
};

export class MIconButton extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  readonly opts: { label: string; icon: string };
  private variant: MIconButtonVariant;
  private enabled: boolean;
  private reason: string | undefined;
  private face: Phaser.GameObjects.Container;
  private bg!: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, private o: MIconButtonOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = Math.max(TAP, Math.round(h));
    this.variant = o.variant ?? 'secondary';
    this.enabled = this.variant !== 'disabled';
    this.reason = o.disabledReason;
    this.opts = { label: o.label, icon: o.icon };
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
      tip: o.label,
      disabled: () => (this.enabled ? undefined : this.reason ?? o.disabledReason),
    });
    uiId(this, o.id ?? `ibtn:${o.label}`);
    scene.add.existing(this);
  }

  /** Enable or disable; `reason` is what a tap on the disabled button says. */
  setEnabled(on: boolean, reason?: string): this {
    if (reason !== undefined) this.reason = reason;
    if (on === this.enabled) return this;
    this.enabled = on;
    this.variant = on ? (this.o.variant && this.o.variant !== 'disabled' ? this.o.variant : 'secondary') : 'disabled';
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
    const ic = scaleIcon(addIcon(scene, 0, 0, this.o.icon, v === 'disabled' ? 'D' : v === 'selected' ? '' : 'L'), 1.2);
    ic.setPosition(Math.round((this.w - ic.displayWidth) / 2), Math.round((this.h - ic.displayHeight) / 2) - 1);
    put(this.face, this.w, this.h, ic);
    const b = this.o.badge;
    if (b !== undefined && b !== 0 && this.enabled) this.face.add(new MBadge(scene, this.w / 2 - 3, -this.h / 2 + 3, b));
  }
}
