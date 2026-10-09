/**
 * Meters of the v4 UI: MBar (a thin bar with a label and a value over it, on
 * parchment: the farm Glory bar, the search range, the team's points) and
 * StatChip (a 22-tall stone or parchment plate with an icon, a number that can
 * count to a new value and an optional bar under it: Glory, the duel level).
 */
import Phaser from 'phaser';
import { addIcon, ICON_PX } from '../kit';
import { uiId } from '../layout';
import { motion } from '../motion';
import { MOSAIC, MOTION } from '../tokens';
import { TAP, centeredFace, fit, makePressable, midY, mosaicImage, mtext, mw, put } from './base';

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
  /** The label is quieter (a used-up or locked meter). */
  quiet?: boolean;
  id?: string;
}

/** A label row (Inter on parchment) over a dark trough with a coloured fill. */
export class MBar extends Phaser.GameObjects.Container {
  readonly w: number;
  /** Total height: the label row (when there is one), the gap and the bar. */
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
    this.h = textH + this.barH;
    const frame = { owner: this as Phaser.GameObjects.Container, w: this.w, h: this.h };
    if (o.right) {
      this.rightText = mtext(scene, this.w, 0, o.right, 'pInk', { align: 1, box: frame });
      this.add(this.rightText);
    }
    if (o.label) this.add(mtext(scene, 0, 0, o.label, o.quiet ? 'pMuted' : 'pSec', { maxW: this.w - (o.right ? mw(o.right, 'pInk') + 8 : 0), box: frame }));
    this.barW = this.w;
    const by = textH;
    const g = scene.add.graphics();
    g.fillStyle(MOSAIC.stone0, 1);
    g.fillRoundedRect(0, by, this.w, this.barH, 1.5);
    g.lineStyle(0.7, MOSAIC.parchEdge, 0.9);
    g.strokeRoundedRect(0.35, by + 0.35, this.w - 0.7, this.barH - 0.7, 1.5);
    this.add(g);
    this.fill = scene.add.rectangle(1, by + 1, 0, this.barH - 2, o.color).setOrigin(0, 0);
    this.add(this.fill);
    this.setValue(o.value, o.max, o.right);
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

// ================================================================== StatChip

export interface StatChipOpts {
  icon?: string;
  /** What it shows (the count-up of `setValue` replaces it with a number). */
  value: string | number;
  /** 0..1: a thin bar under the number (the duel level's XP). */
  progress?: number;
  /** Fill colour of that bar (a token). */
  progressColor?: number;
  surface?: 'parchment' | 'stone';
  onClick?: () => void;
  tip?: string;
  id?: string;
}

const CHIP_H = TAP;

/** A plate 22 tall: an icon, a number and (optionally) a bar under it; tappable when `onClick` is given. */
export class StatChip extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h = CHIP_H;
  readonly opts: { label: string; icon?: string };
  private num: Phaser.GameObjects.BitmapText;
  private counter = { v: 0 };

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, o: StatChipOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    const stone = o.surface !== 'parchment';
    const val = String(o.value);
    this.opts = { label: val, icon: o.icon };
    const face = centeredFace(scene, this.w, this.h);
    this.add(face);
    put(face, this.w, this.h, mosaicImage(scene, 0, 0, this.w, this.h, stone ? 'chipStone' : 'chipParch'));
    const font = stone ? 'ink' : 'pInk';
    const iconW = o.icon ? ICON_PX + 3 : 0;
    const room = this.w - 10 - iconW;
    const text = fit(val, font, 8, room);
    const bar = o.progress !== undefined;
    const x0 = Math.round((this.w - (iconW + mw(text, font, 8))) / 2);
    const ty = bar ? 3 : midY(this.h - 1, 8);
    if (o.icon) put(face, this.w, this.h, addIcon(scene, x0, bar ? 2 : Math.round((this.h - ICON_PX) / 2) - 1, o.icon));
    this.num = put(face, this.w, this.h, mtext(scene, x0 + iconW, ty, text, font, { size: 8, box: { owner: this, w: this.w, h: this.h } }));
    if (bar) {
      const bw = this.w - 12;
      const g = scene.add.graphics();
      g.fillStyle(MOSAIC.stone0, 1);
      g.fillRoundedRect(6, this.h - 7, bw, 3, 1);
      g.fillStyle(o.progressColor ?? MOSAIC.gold, 1);
      g.fillRoundedRect(6, this.h - 7, Math.max(2, Math.round(bw * Math.max(0, Math.min(1, o.progress!)))), 3, 1);
      put(face, this.w, this.h, g);
    }
    if (o.onClick) makePressable(this, { face, w: this.w, h: this.h, onTap: o.onClick, tip: o.tip });
    uiId(this, o.id ?? `statchip:${o.icon ?? ''}:${val}`);
    scene.add.existing(this);
  }

  /** The number counts to `v` (at once under Reduce motion); the chip keeps its width. */
  setValue(v: number): this {
    const from = Number(this.num.text.replace(/\D/g, '')) || 0;
    if (motion.reduced || from === v) {
      this.num.setText(`${v}`);
      return this;
    }
    this.counter.v = from;
    this.scene.tweens.add({ targets: this.counter, v, duration: MOTION.countUp, ease: 'Cubic.easeOut', onUpdate: () => this.num.active && this.num.setText(`${Math.round(this.counter.v)}`) });
    return this;
  }

  /** The chip's width for a value (icon, number, padding). */
  static width(o: Pick<StatChipOpts, 'icon' | 'value'>, min = 0): number {
    return Math.max(min, Math.ceil(mw(String(o.value), 'ink', 8) + (o.icon ? ICON_PX + 3 : 0) + 11));
  }
}

