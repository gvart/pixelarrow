/**
 * OfferCard: a parchment card for something you can take: art in a well, its
 * whole name (up to three lines, never cut) and one state line: a price
 * (grey when you cannot afford it), Equipped, Owned, or where to earn it.
 * Used by the shop's cosmetics grid; the art is drawn by the caller.
 */
import Phaser from 'phaser';
import { addIcon, addText, scaleIcon } from '../kit';
import { uiFrame, uiId } from '../layout';
import { MOSAIC } from '../tokens';
import { wrapText } from '../textfit';
import { makePressable, mosaicImage, mtext, mw, centeredFace, put } from './base';

export type OfferState =
  /** A price: `short` greys it (cannot afford). */
  | { kind: 'price'; text: string; icon?: string; short?: boolean }
  | { kind: 'equipped'; text: string }
  | { kind: 'owned'; text: string }
  /** Earned elsewhere (a pass tier, the Duels seasons). */
  | { kind: 'locked'; text: string; icon?: string };

export interface OfferCardOpts {
  name: string;
  state: OfferState;
  /** Draws the art centred at (cx, cy) in the card's coordinates, in a `size` square. */
  art: (card: Phaser.GameObjects.Container, cx: number, cy: number, size: number) => void;
  onClick?: () => void;
  tip?: string;
  id?: string;
}

const ART = 32;
const NAME_SIZE = 6;
const STATE_H = 12;

export class OfferCard extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;

  /** Height a card `w` wide needs for `names` (its lines: the tallest name of a row). */
  static height(names: string[], w: number): number {
    const lines = Math.max(1, ...names.map((n) => wrapText(n, w - 6, 3, false, NAME_SIZE).lines.length));
    return Math.max(66, 39 + lines * 8 + 4 + STATE_H);
  }

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, o: OfferCardOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = Math.round(h);
    const st = o.state;
    const locked = st.kind === 'locked';
    const face = centeredFace(scene, this.w, this.h);
    this.add(face);
    const P = <T extends Phaser.GameObjects.GameObject & { x: number; y: number }>(obj: T): T => put(face, this.w, this.h, obj);
    P(mosaicImage(scene, 0, 0, this.w, this.h, st.kind === 'equipped' ? 'parchmentSel' : 'parchment'));
    const wx = Math.round((this.w - ART) / 2);
    P(mosaicImage(scene, wx, 4, ART, ART, 'parchmentWell'));
    const art = scene.add.container(0, 0);
    o.art(art, this.w / 2, 4 + ART / 2, ART - 4);
    if (locked) art.setAlpha(0.55);
    P(art);
    // the state as a seal on the well's corner
    if (st.kind === 'equipped' || st.kind === 'owned' || locked) {
      const g = scene.add.graphics();
      const cx = wx + ART - 2;
      const cy = 6;
      g.fillStyle(MOSAIC.stone0, 1);
      g.fillCircle(cx, cy, 5);
      if (locked) {
        g.fillStyle(MOSAIC.off, 1);
        g.fillCircle(cx, cy, 4.2);
      } else {
        g.fillStyle(st.kind === 'equipped' ? MOSAIC.gold : MOSAIC.inkGood, 1);
        g.fillCircle(cx, cy, 4.2);
        g.lineStyle(1.2, st.kind === 'equipped' ? MOSAIC.ink : MOSAIC.cream, 1);
        g.beginPath();
        g.moveTo(cx - 2, cy);
        g.lineTo(cx - 0.5, cy + 1.6);
        g.lineTo(cx + 2.2, cy - 1.6);
        g.strokePath();
      }
      P(g);
      if (locked) {
        const lk = scaleIcon(addIcon(scene, 0, 0, 'lock', 'L'), 0.5);
        lk.setPosition(Math.round(cx - lk.displayWidth / 2), Math.round(cy - lk.displayHeight / 2));
        P(lk);
      }
    }
    const lines = wrapText(o.name, this.w - 6, 3, false, NAME_SIZE).lines;
    const nt = addText(scene, this.w / 2, 39, lines.join('\n'), locked ? 'pSec' : 'pInk', 0.5).setFontSize(NAME_SIZE).setLineSpacing(-1);
    nt.setCenterAlign();
    uiFrame(nt, this, this.w, this.h);
    P(nt);
    // the state line, centred at the bottom
    const sy = this.h - STATE_H;
    const font = st.kind === 'equipped' || st.kind === 'owned' ? 'pGood' : locked ? 'pSec' : st.kind === 'price' && st.short ? 'pOff' : 'pInk';
    const icon = st.kind === 'price' || st.kind === 'locked' ? st.icon : undefined;
    const maxW = this.w - 8 - (icon ? 12 : 0);
    const size = [6.5, 6, 5.5].find((z) => mw(st.text, font, z) <= maxW) ?? 5.5;
    const tx = mtext(scene, 0, sy + 1, st.text, font, { size, maxW });
    const both = (icon ? 12 : 0) + tx.width;
    const sx = Math.round(this.w / 2 - both / 2);
    if (icon) {
      const ic = scaleIcon(addIcon(scene, sx, sy - 1, icon, st.kind === 'price' && st.short ? 'D' : ''), 10 / 12);
      P(ic);
    }
    tx.setX(sx + (icon ? 12 : 0));
    uiFrame(tx, this, this.w, this.h);
    P(tx);
    if (o.onClick) makePressable(this, { face, w: this.w, h: this.h, onTap: o.onClick, tip: o.tip });
    uiId(this, o.id ?? `offer:${o.name}`);
    scene.add.existing(this);
  }
}
