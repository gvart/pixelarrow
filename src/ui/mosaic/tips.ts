/**
 * The tip of the v4 UI (`addTipLine`): a short contextual note on the
 * parchment page (an icon and a few lines of ink), with an optional x that
 * hides it for good (remembered in the hint store). Flat by default (on a
 * card); `card: true` sets it on a parchment card of its own (the shop's
 * notes). Tones: info (quiet), reward (something to claim), warn (a real
 * problem: danger ink).
 */
import Phaser from 'phaser';
import { addIcon, addText, scaleIcon } from '../kit';
import { uiFrame, uiId } from '../layout';
import { tweenTo } from '../motion';
import { MOTION } from '../tokens';
import { LINE_H, wrapText } from '../textfit';
import { hintStore } from '../widgets';
import { t } from '../../i18n';
import { TAP, makePressable, mosaicImage, mw } from './base';
import { MButton } from './controls';
import type { FontKey } from '../kit';

export interface TipLineOpts {
  text: string;
  icon?: string;
  tone?: 'info' | 'reward' | 'warn';
  /** Dismissible, remembered under this id (the hint store). */
  dismissId?: string;
  /** Lines of text at most (default: as many as the text needs; C1: a tip wraps, never cuts). */
  maxLines?: number;
  /** On a parchment card of its own instead of flat on the page. */
  card?: boolean;
  /** One button under the words, at the right (the guest tip's Create account, accounts-v6.md AU-07). */
  action?: { label: string; id: string; onClick: () => void };
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
  const card = !!o.card;
  const font: FontKey = tone === 'warn' ? 'pBad' : tone === 'reward' || card ? 'pInk' : 'pSec';
  const xw = o.dismissId ? TAP + 2 : 0;
  const tx = 18;
  const wr = wrapText(o.text, w - tx - xw - 2 - (card ? 2 : 0), o.maxLines ?? 99);
  const textH = Math.max(o.dismissId ? TAP : card ? 18 : 16, wr.lines.length * LINE_H + (card ? 8 : 6));
  const h = textH + (o.action ? TAP + 4 : 0);
  const c = scene.add.container(Math.round(x), Math.round(y));
  parent.add(c);
  if (card) c.add(mosaicImage(scene, 0, 0, w, h, 'parchment'));
  const ic = scaleIcon(addIcon(scene, 0, 0, o.icon ?? (tone === 'reward' ? 'chest' : 'info'), tone === 'info' ? 'D' : ''), 1.2);
  ic.setPosition(card ? 5 : 2, Math.round((textH - ic.displayHeight) / 2));
  c.add(ic);
  const txt = addText(scene, tx, Math.round((textH - wr.lines.length * LINE_H) / 2) + 1, wr.lines.join('\n'), font);
  uiFrame(txt, c, w, h);
  c.add(txt);
  if (o.dismissId) {
    const id = o.dismissId;
    const b = scene.add.container(w - TAP, Math.round((textH - TAP) / 2));
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
  if (o.action) {
    const aw = Math.min(w - tx - 4, Math.max(80, mw(o.action.label, 'pInk') + 24));
    c.add(new MButton(scene, w - aw - 4, textH, aw, TAP, { label: o.action.label, variant: 'secondary', id: o.action.id, onClick: o.action.onClick }));
  }
  uiId(c, o.id ?? 'tip');
  return h;
}
