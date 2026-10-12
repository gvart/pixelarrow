/**
 * Real money (Telegram Stars): the purchase button (Telegram blue, the star and
 * the word "Stars", never terracotta, never a bare number) and the confirm
 * every real-money purchase asks first, on a parchment sheet.
 */
import type Phaser from 'phaser';
import { Button, addIcon, addText, scaleIcon } from '../kit';
import { LINE_H, wrapText } from '../textfit';
import type { Modal, UiScene } from '../widgets';
import { t } from '../../i18n';
import { openParchmentSheet } from './ParchmentSheet';

/** The real-money button: Telegram blue, the Telegram star and the word "Stars". */
export function purchaseButton(scene: Phaser.Scene, x: number, y: number, w: number, h: number, o: { stars: number; onClick: () => void; id?: string; tip?: string }): Button {
  return new Button(scene, x, y, w, h, { label: t('res.starsPrice', { n: o.stars }), icon: 'tgstar', inline: true, variant: 'purchase', id: o.id, tip: o.tip ?? t('res.tip.stars'), onClick: o.onClick });
}

/** Every real-money purchase asks first, in a sheet that says it is real money. */
export function confirmPurchase(scene: UiScene, o: { what: string; stars: number; onOk: () => void }): Modal {
  const w = Math.min(scene.m.VW - 8, 240);
  const body = wrapText(t('v3.buyConfirmBody', { what: o.what, n: o.stars }), w - 44, 5);
  const m = openParchmentSheet(scene, { title: t('v3.buyConfirmTitle'), h: 30 + body.lines.length * LINE_H + 16 + 26 + 6 + 24 + 16, w, dock: 'bottom', shadeCloses: false });
  const { c, body: b } = m;
  c.add(scaleIcon(addIcon(scene, b.x, b.y + 1, 'tgstar'), 2));
  c.add(addText(scene, b.x + 30, b.y + 2, body.lines.join('\n'), 'pInk'));
  let y = b.y + Math.max(26, body.lines.length * LINE_H + 6) + 8;
  c.add(purchaseButton(scene, b.x, y, b.w, 26, { stars: o.stars, id: 'purchase.confirm', onClick: () => (m.close(), o.onOk()) }).setLabel(t('v3.payStars', { n: o.stars })));
  y += 26 + 6;
  c.add(new Button(scene, b.x, y, b.w, 24, { label: t('common.cancel'), variant: 'ghost', id: 'purchase.cancel', onClick: () => m.close() }));
  return m;
}
