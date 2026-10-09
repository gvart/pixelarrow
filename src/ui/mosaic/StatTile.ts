/**
 * StatTile: a small parchment tile with an icon, a big Inter number and a
 * quiet label under it (the battle report's time / kills / losses / gold / XP).
 * `start()` counts the number up; the tile stays correct without it.
 */
import Phaser from 'phaser';
import { addIcon } from '../kit';
import { uiId } from '../layout';
import { sfx } from '../../audio';
import { haptic } from '../../platform/telegram';
import { mosaicImage, mtext, mw } from './base';

export type StatTone = 'ink' | 'good' | 'bad';

export interface StatTileOpts {
  icon?: string;
  label: string;
  value: number;
  /** Shown before the number ("+"). */
  prefix?: string;
  /** How to show a number (a clock instead of a count). */
  format?: (v: number) => string;
  tone?: StatTone;
  /** Count-up length in ms (0: show the final value at once). */
  duration?: number;
  delay?: number;
  /** A tick sound while counting. */
  sound?: boolean;
  id?: string;
}

const NUM_SIZES = [11, 10, 9, 8, 7, 6];

export class StatTile extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  private num: Phaser.GameObjects.BitmapText;
  private shown: (v: number) => string;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, private o: StatTileOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = Math.round(h);
    this.shown = (v) => `${o.prefix ?? ''}${o.format ? o.format(v) : Math.round(v)}`;
    this.add(mosaicImage(scene, 0, 0, this.w, this.h, 'parchment'));
    const font = o.tone === 'good' ? 'pGood' : o.tone === 'bad' ? 'pBad' : 'pInk';
    const box = { owner: this as Phaser.GameObjects.Container, w: this.w, h: this.h };
    // roomy: icon, number, label stacked; compact: the icon sits beside the label under the number
    const compact = !!o.icon && this.h < 44;
    const iconH = o.icon && !compact ? 13 : 0;
    const final = this.shown(o.value);
    const labelRoom = this.w - 6 - (compact ? 13 : 0);
    const labelSize = [6, 5.5].find((z) => mw(o.label, 'pSec', z) <= labelRoom) ?? 5.5;
    const labelW = Math.min(labelRoom, mw(o.label, 'pSec', labelSize));
    const rowH = compact ? 10 : 8;
    const avail = this.h - 4 - iconH - rowH - 2;
    const size = NUM_SIZES.find((z) => mw(final, font, z) <= this.w - 8 && Math.round((z * 11) / 7) <= avail) ?? 6;
    const numH = Math.round((size * 11) / 7);
    const total = iconH + numH + 2 + rowH;
    let ty = Math.max(2, Math.round((this.h - total) / 2));
    if (iconH && o.icon) {
      const ic = addIcon(scene, 0, 0, o.icon);
      ic.setPosition(Math.round((this.w - ic.displayWidth) / 2), ty);
      this.add(ic);
      ty += iconH;
    }
    this.num = mtext(scene, this.w / 2, ty, this.shown(0), font, { size, align: 0.5, box });
    this.add(this.num);
    const ly = ty + numH + 2;
    if (compact && o.icon) {
      const ic = addIcon(scene, 0, 0, o.icon);
      const gx = Math.round((this.w - (13 + labelW)) / 2);
      ic.setPosition(gx, ly - 1);
      this.add(ic);
      this.add(mtext(scene, gx + 13, ly + 1, o.label, 'pSec', { size: labelSize, maxW: labelRoom, box }));
    } else this.add(mtext(scene, this.w / 2, ly, o.label, 'pSec', { size: labelSize, align: 0.5, maxW: this.w - 4, box }));
    uiId(this, o.id ?? `stat:${o.label}`);
    scene.add.existing(this);
    if (!(o.duration ?? 0)) this.num.setText(final);
  }

  /** Count up (the final number is set at the end). Returns the tween, or undefined when there is nothing to count. */
  start(): Phaser.Tweens.Tween | undefined {
    const o = this.o;
    const final = this.shown(o.value);
    if (!(o.duration ?? 0)) return void this.num.setText(final);
    let lastTick = 0;
    return this.scene.tweens.addCounter({
      from: 0,
      to: o.value,
      duration: o.duration,
      delay: o.delay ?? 0,
      ease: 'Cubic.easeOut',
      onUpdate: (tw) => {
        const v = tw.getValue() ?? 0;
        this.num.setText(this.shown(v));
        const now = this.scene?.time.now ?? 0;
        if (o.sound && now - lastTick > 70 && v > 0) {
          lastTick = now;
          sfx.play('tap');
        }
      },
      onComplete: () => {
        this.num.setText(final);
        if (o.sound && o.value > 0) haptic('light');
      },
    });
  }
}
