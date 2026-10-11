/**
 * ResultTile: a Summary tile of the Results screen (time, kills, losses, gold
 * or glory, XP). Like the kit's StatTile, but every text keeps the 6.5 UI px
 * floor (A11Y-09) and a small (i) shows the tile has a tip (audit G15: the
 * non-touch path; a mouse hover shows it too). `start()` counts the number up.
 */
import Phaser from 'phaser';
import { addIcon, scaleIcon } from '../kit';
import { uiId } from '../layout';
import { mosaicImage, mtext, mw } from '../mosaic';
import { TEXT_MIN } from '../tokens';
import { sfx } from '../../audio';
import { haptic } from '../../platform/telegram';

export interface ResultTileOpts {
  icon: string;
  label: string;
  value: number;
  /** Shown before the number ("+"). */
  prefix?: string;
  /** How to show the number (a clock instead of a count). */
  format?: (v: number) => string;
  tone?: 'ink' | 'good' | 'bad';
  /** Count-up length in ms (0: the final value at once). */
  duration?: number;
  delay?: number;
  /** A tick sound while counting. */
  sound?: boolean;
  id: string;
}

const NUM_SIZES = [11, 10, 9, 8, 7, TEXT_MIN];
const ICON = 12;

export class ResultTile extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  private num: Phaser.GameObjects.BitmapText;
  private shown: (v: number) => string;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, private o: ResultTileOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = Math.round(h);
    this.shown = (v) => `${o.prefix ?? ''}${o.format ? o.format(v) : Math.round(v)}`;
    this.add(mosaicImage(scene, 0, 0, this.w, this.h, 'parchment'));
    const font = o.tone === 'good' ? 'pGood' : o.tone === 'bad' ? 'pBad' : 'pInk';
    const box = { owner: this as Phaser.GameObjects.Container, w: this.w, h: this.h };
    const final = this.shown(o.value);
    const labelW = mw(o.label, 'pSec', TEXT_MIN);
    // roomy: icon, number, label stacked; compact: the icon beside the label, when both fit
    const roomy = this.h >= 44;
    const iconBeside = !roomy && labelW + ICON + 1 <= this.w - 6;
    const iconH = roomy ? ICON + 1 : 0;
    const rowH = 9;
    const avail = this.h - 4 - iconH - rowH - 2;
    // compact: the number shares the top row with the (i), so it keeps clear of it on both sides
    const numRoom = roomy ? this.w - 8 : this.w - 22;
    const size = NUM_SIZES.find((z) => mw(final, font, z) <= numRoom && Math.round((z * 11) / 7) <= avail) ?? TEXT_MIN;
    const numH = Math.round((size * 11) / 7);
    let ty = Math.max(2, Math.round((this.h - (iconH + numH + 2 + rowH)) / 2));
    if (roomy) {
      this.add(addIcon(scene, Math.round((this.w - ICON) / 2), ty, o.icon));
      ty += iconH;
    }
    this.num = mtext(scene, this.w / 2, ty, this.shown(0), font, { size, align: 0.5, box });
    this.add(this.num);
    const ly = ty + numH + 2;
    if (iconBeside) {
      const gx = Math.round((this.w - (ICON + 1 + labelW)) / 2);
      this.add(addIcon(scene, gx, ly - 2, o.icon));
      this.add(mtext(scene, gx + ICON + 1, ly, o.label, 'pSec', { size: TEXT_MIN, box }));
    } else this.add(mtext(scene, this.w / 2, ly, o.label, 'pSec', { size: TEXT_MIN, align: 0.5, maxW: this.w - 4, box }));
    // the (i): this tile has a tip (tap, long-press or hover)
    this.add(scaleIcon(addIcon(scene, this.w - 9, 2, 'info'), 7 / ICON).setAlpha(0.55));
    uiId(this, o.id);
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
