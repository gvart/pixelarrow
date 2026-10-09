/**
 * Chrome of a map screen (the world map, the camp): `ChipRow` is a row of tight resource chips (icon and number) and
 * `SituationLine` is the slim parchment card under the top bar: the
 * one-sentence situation over a row of chips.
 */
import Phaser from 'phaser';
import { uiId } from '../layout';
import { wrapText, LINE_H } from '../textfit';
import { ICON_PX } from '../kit';
import { mosaicImage, mtext, mw } from './base';
import { MChip, type MChipOpts } from './controls';

export interface SituationChip extends Omit<MChipOpts, 'surface' | 'w'> {
  /** A shorter value for rows too narrow for the full one. */
  short?: string;
}

const PAD = 4;
export const CHIP_ROW_H = 18;
const GAP = 3;

/** A row of tight chips (icon, number) across `w`: natural widths plus an equal share of what is left; the short values when the full ones do not fit. */
export class ChipRow extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h = CHIP_ROW_H;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, chips: SituationChip[], surface: 'parchment' | 'stone' = 'parchment') {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    const font = surface === 'stone' ? 'ink' : 'pInk';
    const room = this.w - GAP * (chips.length - 1);
    let pad = 6;
    const nat = (cs: SituationChip[]) => cs.map((c) => (c.icon ? ICON_PX + 1 : 0) + mw(String(c.value), font) + pad);
    const total = (cs: SituationChip[]) => nat(cs).reduce((a, n) => a + n, 0);
    // too wide: the short values, then tighter padding
    if (total(chips) > room) chips = chips.map((c) => (c.short !== undefined ? { ...c, value: c.short } : c));
    if (total(chips) > room) pad = 2;
    const ns = nat(chips);
    const share = Math.max(0, Math.floor((room - ns.reduce((a, n) => a + n, 0)) / Math.max(1, chips.length)));
    let cx = 0;
    for (let i = 0; i < chips.length; i++) {
      const cw = ns[i] + share;
      this.add(new MChip(scene, cx, 0, { ...chips[i], surface, w: cw, pad: 4 }));
      cx += cw + GAP;
    }
    scene.add.existing(this);
  }
}

export class SituationLine extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  private readonly lines: number;
  private inner: Phaser.GameObjects.Container;

  /** @param compact one line of sentence (short screens). */
  constructor(scene: Phaser.Scene, x: number, y: number, w: number, o: { compact?: boolean; id?: string } = {}) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.lines = o.compact ? 1 : 2;
    this.h = PAD + this.lines * LINE_H + 3 + CHIP_ROW_H + PAD;
    this.add(mosaicImage(scene, 0, 0, this.w, this.h, 'parchment'));
    this.inner = scene.add.container(0, 0);
    this.add(this.inner);
    uiId(this, o.id ?? 'situation');
    scene.add.existing(this);
  }

  /** The sentence (wrapped to the room it has) and the chips, spread over the width. */
  set(sentence: string, urgent: boolean, chips: SituationChip[]): this {
    const scene = this.scene;
    this.inner.removeAll(true);
    const tw = this.w - (PAD + 3) * 2;
    wrapText(sentence, tw, this.lines).lines.forEach((l, i) => {
      this.inner.add(mtext(scene, PAD + 3, PAD + 1 + i * LINE_H, l, urgent ? 'pBad' : 'pInk', { box: { owner: this, w: this.w, h: this.h } }));
    });
    this.inner.add(new ChipRow(scene, PAD + 1, this.h - PAD - CHIP_ROW_H, this.w - (PAD + 1) * 2, chips));
    return this;
  }
}
