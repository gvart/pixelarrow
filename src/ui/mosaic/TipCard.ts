/**
 * TipCard: a quiet parchment note with an icon and a few wrapped lines, and an
 * x that hides it for good when `dismissId` is given (the v3 tip line, on
 * parchment). Check `TipCard.hidden(dismissId)` before building one.
 */
import Phaser from 'phaser';
import { addIcon, addText } from '../kit';
import { uiFrame, uiId } from '../layout';
import { LINE_H, wrapText } from '../textfit';
import { tipHidden } from '../v3';
import { hintStore } from '../widgets';
import { tweenTo } from '../motion';
import { MOTION } from '../tokens';
import { t } from '../../i18n';
import { TAP, makePressable, mosaicImage } from './base';

export interface TipCardOpts {
  text: string;
  icon?: string;
  tone?: 'info' | 'warn';
  maxLines?: number;
  dismissId?: string;
  id?: string;
}

export class TipCard extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;

  /** The player already hid this tip. */
  static hidden(dismissId?: string): boolean {
    return !!dismissId && tipHidden(dismissId);
  }

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, o: TipCardOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    const xw = o.dismissId ? TAP : 0;
    const wr = wrapText(o.text, this.w - 22 - xw - 4, o.maxLines ?? 3);
    this.h = Math.max(o.dismissId ? TAP : 18, wr.lines.length * LINE_H + 8);
    this.add(mosaicImage(scene, 0, 0, this.w, this.h, 'parchment'));
    this.add(addIcon(scene, 5, Math.round((this.h - 12) / 2), o.icon ?? 'info', o.tone === 'warn' ? '' : 'D'));
    const txt = addText(scene, 20, Math.round((this.h - wr.lines.length * LINE_H) / 2) + 1, wr.lines.join('\n'), o.tone === 'warn' ? 'pBad' : 'pInk');
    uiFrame(txt, this, this.w, this.h);
    this.add(txt);
    if (o.dismissId) {
      const id = o.dismissId;
      const b = scene.add.container(this.w - TAP, Math.round((this.h - TAP) / 2));
      b.add(addIcon(scene, Math.round((TAP - 12) / 2), Math.round((TAP - 12) / 2), 'xmark'));
      makePressable(b, {
        w: TAP,
        h: TAP,
        onTap: () => {
          hintStore.mark(`tip:${id}`);
          tweenTo(scene, this, { alpha: 0 }, MOTION.fade, { onComplete: () => this.destroy() });
        },
        tip: t('v3.dismiss'),
      });
      uiId(b, `tip.${id}.close`);
      this.add(b);
    }
    uiId(this, o.id ?? `tip:${o.dismissId ?? o.text.slice(0, 12)}`);
    scene.add.existing(this);
  }
}
