/**
 * AccountRow (design/ux/accounts-v6.md §12): one sign-in method on the Account page. A row on its
 * parchment well (as the page's other settings rows): the method's mark (`tg`: Telegram's paper plane,
 * `at`: an @ for email), its name, a quieter line (the player's own handle, the masked address or a
 * status), and one trailing control: a small labelled button (Add, Remove, Link), the ⋯ button (more
 * actions), or none. The "off with reason" state keeps the button visible and grey; a tap says why (the
 * last sign-in method, N-LK-2).
 */
import Phaser from 'phaser';
import { Button, addText, mosaicPanelImage } from '../kit';
import { ellipsize } from '../textfit';
import { MOSAIC } from '../tokens';

export interface AccountRowOpts {
  mark: 'tg' | 'at';
  title: string;
  sub: string;
  /** The trailing control: a labelled button, the ⋯ menu, or nothing (read only). */
  action?: { kind: 'button'; label: string; onClick: () => void; off?: string; id: string } | { kind: 'more'; label: string; onClick: () => void; id: string };
}

export const ACCOUNT_ROW_H = 24;
const BTN_W = 68;
const MORE_W = 26;

export class AccountRow extends Phaser.GameObjects.Container {
  readonly h = ACCOUNT_ROW_H;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, o: AccountRowOpts) {
    super(scene, Math.round(x), Math.round(y));
    const h = ACCOUNT_ROW_H;
    this.add(mosaicPanelImage(scene, 0, 0, w, h - 1, 'parchmentWell'));
    this.add(mark(scene, 4, Math.round((h - 1 - 12) / 2), o.mark));
    const a = o.action;
    const right = a ? (a.kind === 'more' ? MORE_W : BTN_W) + 2 : 0;
    const room = w - 20 - right - 6;
    this.add(addText(scene, 20, 2, ellipsize(o.title, room, false, 6.5), 'pInk').setFontSize(6.5));
    this.add(addText(scene, 20, 12, ellipsize(o.sub, room, false, 6.5), 'pMuted').setFontSize(6.5));
    if (a?.kind === 'button') {
      const b = new Button(scene, w - BTN_W - 1, 1, BTN_W, h - 2, { label: a.label, small: true, inline: true, id: a.id, onClick: a.onClick, disabledReason: a.off });
      if (a.off) b.setEnabled(false, a.off);
      this.add(b);
    } else if (a?.kind === 'more') {
      // the ⋯ as three dots in the label (the kit's 'more' icon is a chevron); its name is the long-press text
      this.add(new Button(scene, w - MORE_W - 1, 1, MORE_W, h - 2, { label: '•••', small: true, tip: a.label, id: a.id, onClick: a.onClick }));
    }
    scene.add.existing(this);
  }
}

/** The method's mark in 12 UI px, drawn (no image request): Telegram's paper plane, or an @. */
function mark(scene: Phaser.Scene, x: number, y: number, kind: 'tg' | 'at'): Phaser.GameObjects.GameObject {
  if (kind === 'at') return addText(scene, x + 1, y - 1, '@', 'pInk').setFontSize(10);
  const g = scene.add.graphics();
  g.fillStyle(MOSAIC.bronze, 1);
  g.fillCircle(x + 6, y + 6, 6);
  g.fillStyle(MOSAIC.parchHi, 1);
  // the plane: a wide triangle pointing up-right, with the fold
  g.fillTriangle(x + 2.2, y + 6, x + 9.8, y + 3, x + 8, y + 9.6);
  g.fillStyle(MOSAIC.bronzeLo, 1);
  g.fillTriangle(x + 5.2, y + 7, x + 9.8, y + 3, x + 6, y + 9);
  return g;
}
