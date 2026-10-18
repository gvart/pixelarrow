/**
 * QrCode (design/ux/accounts-v6.md §12): a QR code drawn as a pixel grid, for the Link Telegram sheet
 * (AU-13). The encoder (qrEncode.ts) is local and small on purpose: the link carries a one-time link
 * code, so it never goes to a QR service, and a dependency would be more code to audit than it is.
 *
 * Dark modules on a light quiet zone of 4 modules inside a bronze frame. A canvas has no alt text of its
 * own: `alt` (the link) rides on the object for tools, and the sheet puts a real Copy link button next
 * to it (§13.5).
 */
import Phaser from 'phaser';
import { MOSAIC } from '../tokens';
import { uiId } from '../layout';
import { encodeQr } from './qrEncode';

export { encodeQr, type QrMatrix } from './qrEncode';

/** Light and dark of the code: high contrast whatever the theme (scanners need it). */
const LIGHT = 0xf6efe0;
const DARK = 0x16120f;
const QUIET = 4;
const FRAME = 2;

/**
 * The code of `text` in a bronze frame, `side` UI px square at most (modules are whole UI px, so
 * the grid stays crisp). Check `QrCode.fits(text)` first: a text too long for a code draws an empty frame.
 */
export class QrCode extends Phaser.GameObjects.Container {
  readonly side: number;
  readonly alt: string;

  static fits(text: string): boolean {
    return !!encodeQr(text);
  }

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, side: number, id = 'qr') {
    super(scene, Math.round(x), Math.round(y));
    const q = encodeQr(text);
    this.alt = text;
    const cells = (q?.size ?? 21) + QUIET * 2;
    const px = Math.max(1, Math.floor((side - FRAME * 2) / cells));
    this.side = cells * px + FRAME * 2;
    const g = scene.add.graphics();
    g.fillStyle(MOSAIC.bronze, 1);
    g.fillRect(0, 0, this.side, this.side);
    g.fillStyle(LIGHT, 1);
    g.fillRect(FRAME, FRAME, cells * px, cells * px);
    if (q) {
      g.fillStyle(DARK, 1);
      const o = FRAME + QUIET * px;
      for (let yy = 0; yy < q.size; yy++) for (let xx = 0; xx < q.size; xx++) if (q.modules[yy * q.size + xx]) g.fillRect(o + xx * px, o + yy * px, px, px);
    }
    this.add(g);
    this.setSize(this.side, this.side).setData('alt', text);
    uiId(this, id);
    scene.add.existing(this);
  }
}
