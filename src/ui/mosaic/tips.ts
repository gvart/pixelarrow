/**
 * TipLine of the v4 UI: a short contextual line on the parchment page (an icon
 * and at most two lines of ink), with an optional x that hides it for good
 * (remembered like the v3 tips). Tones: info (quiet), reward (something to
 * claim), warn (a real problem: danger ink).
 */
import Phaser from 'phaser';
import { addIcon, addText, scaleIcon } from '../kit';
import { uiFrame, uiId } from '../layout';
import { tweenTo } from '../motion';
import { MOTION } from '../tokens';
import { LINE_H, wrapText } from '../textfit';
import { hintStore } from '../widgets';
import { t } from '../../i18n';
import { TAP, makePressable, mosaicImage } from './base';
import type { FontKey } from '../kit';

export interface TipLineOpts {
  text: string;
  icon?: string;
  tone?: 'info' | 'reward' | 'warn';
  /** Dismissible, remembered under this id (the same store as the v3 tips). */
  dismissId?: string;
  maxLines?: number;
  id?: string;
}

/** Whether a dismissible tip was hidden for good. */
export function tipHidden(id: string): boolean {
  const seen = hintStore.seen();
  return seen.includes(`tip:${id}`) || seen.includes('*');
}

/** Adds a tip to `parent` at (x, y), w wide; returns its height (0 when it was hidden for good). */
export function addTipLine(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, w: number, o: TipLineOpts): number {
  if (o.dismissId && tipHidden(o.dismissId)) return 0;
  const tone = o.tone ?? 'info';
  const font: FontKey = tone === 'warn' ? 'pBad' : tone === 'reward' ? 'pInk' : 'pSec';
  const xw = o.dismissId ? TAP + 2 : 0;
  const tx = 18;
  const wr = wrapText(o.text, w - tx - xw - 2, o.maxLines ?? 2);
  const h = Math.max(o.dismissId ? TAP : 16, wr.lines.length * LINE_H + 6);
  const c = scene.add.container(Math.round(x), Math.round(y));
  parent.add(c);
  const ic = scaleIcon(addIcon(scene, 0, 0, o.icon ?? (tone === 'reward' ? 'chest' : 'info'), tone === 'info' ? 'D' : ''), 1.2);
  ic.setPosition(2, Math.round((h - ic.displayHeight) / 2));
  c.add(ic);
  const txt = addText(scene, tx, Math.round((h - wr.lines.length * LINE_H) / 2) + 1, wr.lines.join('\n'), font);
  uiFrame(txt, c, w, h);
  c.add(txt);
  if (o.dismissId) {
    const id = o.dismissId;
    const b = scene.add.container(w - TAP, Math.round((h - TAP) / 2));
    const face = scene.add.container(TAP / 2, TAP / 2);
    const s = TAP - 8;
    const bg = mosaicImage(scene, -s / 2, -s / 2, s, s, 'btnBronze');
    const x2 = scaleIcon(addIcon(scene, 0, 0, 'xmark', 'L'), 0.9);
    x2.setPosition(-x2.displayWidth / 2, -x2.displayHeight / 2 - 0.5);
    face.add([bg, x2]);
    b.add(face);
    makePressable(b, {
      face,
      w: TAP,
      h: TAP,
      tip: t('v3.dismiss'),
      onTap: () => {
        hintStore.mark(`tip:${id}`);
        tweenTo(scene, c, { alpha: 0 }, MOTION.fade, { onComplete: () => c.destroy() });
      },
    });
    uiId(b, `tip.${id}.close`);
    c.add(b);
  }
  uiId(c, o.id ?? 'tip');
  return h;
}
