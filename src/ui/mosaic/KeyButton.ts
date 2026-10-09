/**
 * KeyButton: the compact command button of the v4 battle HUD (and any dense
 * toolbar): a Cinzel label with its icon above it (tall) or beside it (short)
 * on terracotta (the one primary), aged bronze or grey stone; `lit` marks the
 * one in force (a bright gold face with ink text). Same state API as the kit
 * Button the battle scene drove (setSelected / setEnabled / opts.label), so
 * scripts and the tutorial find it the same way.
 */
import Phaser from 'phaser';
import type { MosaicStyle } from '../../art/mosaicUi';
import { LINE_H } from '../../art/vectorFont';
import { ICON_PX, addIcon, type FontKey } from '../kit';
import { uiId } from '../layout';
import { MOSAIC } from '../tokens';
import { MBadge, TAP, centeredFace, fit, makePressable, mosaicImage, mosaicTexture, mtext, mw, put } from './base';

/** Capitals for Cinzel text: its word space is very narrow in the bitmap face, so spaces are doubled. */
export function caps(str: string): string {
  return str.toUpperCase().replace(/ +/g, '  ');
}

export type KeyVariant = 'primary' | 'bronze' | 'stone';

export interface KeyButtonOpts {
  label: string;
  icon?: string;
  variant?: KeyVariant;
  /** The one in force (selected order, fast speed, open sheet). */
  lit?: boolean;
  /** Not available, and why (a tap says it). */
  disabledReason?: string;
  badge?: number | string;
  /** Only the icon is drawn (the label is the tip and what scripts find). */
  iconOnly?: boolean;
  /** Write the label in Inter instead of Cinzel capitals (a row of buttons whose words do not all fit as capitals). */
  plain?: boolean;
  onClick?: () => void;
  tip?: string;
  id?: string;
}

const LOOK: Record<KeyVariant, [MosaicStyle, MosaicStyle]> = {
  primary: ['btnPrimary', 'btnPrimaryDown'],
  bronze: ['btnBronze', 'btnBronzeDown'],
  stone: ['btnNeutral', 'btnNeutralDown'],
};

export class KeyButton extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  /** The label and icon (scripts and the layout check find buttons by them). */
  readonly opts: { label: string; icon?: string };
  private lit: boolean;
  private enabled: boolean;
  private reason: string | undefined;
  private face: Phaser.GameObjects.Container;
  private bg!: Phaser.GameObjects.Image;
  private content!: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, private o: KeyButtonOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = Math.max(TAP, Math.round(h));
    this.opts = { label: o.label, icon: o.icon };
    this.lit = !!o.lit;
    this.enabled = !o.disabledReason;
    this.reason = o.disabledReason;
    this.face = centeredFace(scene, this.w, this.h);
    this.add(this.face);
    this.build();
    makePressable(this, {
      face: this.face,
      w: this.w,
      h: this.h,
      onTap: () => o.onClick?.(),
      down: () => this.setSurface(true),
      up: () => this.setSurface(false),
      tip: o.tip ?? o.label,
      disabled: () => (this.enabled ? undefined : this.reason ?? o.tip ?? o.label),
    });
    uiId(this, o.id ?? `key:${o.label}`);
    scene.add.existing(this);
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get isSelected(): boolean {
    return this.lit;
  }

  /** Light or unlight (the order in force). */
  setSelected(on: boolean): this {
    if (on === this.lit) return this;
    this.lit = on;
    this.build();
    return this;
  }

  /** Enable or disable; `reason` is what a tap on the disabled button says. */
  setEnabled(on: boolean, reason?: string): this {
    if (reason !== undefined) this.reason = reason;
    if (on === this.enabled) return this;
    this.enabled = on;
    this.build();
    return this;
  }

  private style(down: boolean): MosaicStyle {
    if (!this.enabled) return 'btnStone';
    if (this.lit) return down ? 'btnLitDown' : 'btnLit';
    return LOOK[this.o.variant ?? 'bronze'][down ? 1 : 0];
  }

  private setSurface(down: boolean): void {
    if (!this.enabled) return;
    this.bg.setTexture(mosaicTexture(this.scene, this.w, this.h, this.style(down)));
    this.content.y = down ? 1 : 0;
  }

  private build(): void {
    const scene = this.scene;
    this.face.removeAll(true);
    this.bg = put(this.face, this.w, this.h, mosaicImage(scene, 0, 0, this.w, this.h, this.style(false)));
    this.content = scene.add.container(0, 0);
    this.face.add(this.content);
    const font: FontKey = !this.enabled ? 'rOff' : this.lit ? 'rInk' : 'rCream';
    const icon = this.o.icon;
    const stack = (this.h >= 28 || (this.h >= 24 && this.w < 44)) && !!icon && !this.o.iconOnly;
    if (this.o.iconOnly && icon) {
      this.addGlyph(Math.round((this.w - ICON_PX) / 2), Math.round((this.h - 2 - ICON_PX) / 2));
      const bi = this.o.badge;
      if (bi !== undefined && bi !== 0 && this.enabled) this.face.add(new MBadge(scene, this.w / 2 - 3, -this.h / 2 + 3, bi));
      return;
    }
    const room = this.w - 4;
    // Cinzel is drawn in capitals (its lower case spaces badly in the bitmap face); a button too narrow
    // for that at a readable size writes the word in Inter instead
    const capsLabel = caps(this.o.label);
    const lead = !stack && icon ? ICON_PX + 2 : 0;
    const capSize = [7, 6.5, 6, 5.5].find((z) => mw(capsLabel, font, z) <= room - lead);
    const inter = !!this.o.plain || capSize === undefined;
    const face: FontKey = inter ? (!this.enabled ? 'dim' : this.lit ? 'pInk' : 'light') : font;
    const label = inter ? this.o.label : capsLabel;
    const size = inter ? [6.5, 6, 5.5, 5].find((z) => mw(label, face, z) <= room - lead) ?? 5 : capSize!;
    const showIcon = !!icon && (stack || size >= 6);
    const text = fit(label, face, size, room - (showIcon && !stack ? lead : 0));
    const tw = mw(text, face, size);
    const lineH = (LINE_H * size) / 7;
    const frame = { owner: this as Phaser.GameObjects.Container, w: this.w, h: this.h };
    const body = this.h - 2;
    if (stack) {
      const top = Math.round((body - (ICON_PX + 2 + lineH)) / 2);
      this.addGlyph(Math.round((this.w - ICON_PX) / 2), top);
      put(this.content, this.w, this.h, mtext(scene, this.w / 2, top + ICON_PX + 2, text, face, { size, align: 0.5, box: frame }));
    } else {
      const adv = showIcon ? lead : 0;
      const x0 = Math.round((this.w - (adv + tw)) / 2);
      if (showIcon) this.addGlyph(x0, Math.round((body - ICON_PX) / 2));
      put(this.content, this.w, this.h, mtext(scene, x0 + adv, Math.round((body - lineH) / 2), text, face, { size, box: frame }));
    }
    const b = this.o.badge;
    if (b !== undefined && b !== 0 && this.enabled) this.face.add(new MBadge(scene, this.w / 2 - 3, -this.h / 2 + 3, b));
  }

  private addGlyph(x: number, y: number): void {
    const img = addIcon(this.scene, x, y, this.o.icon!, !this.enabled ? 'D' : 'L');
    if (this.enabled && this.lit) img.setTint(MOSAIC.ink);
    put(this.content, this.w, this.h, img);
  }
}
