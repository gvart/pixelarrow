/**
 * Chrome of a map screen (the world map, the camp): `addMapTopBar` puts the
 * v4 top bar (stone strip, plaque, back arrow) over a full-screen map,
 * `ChipRow` is a row of tight resource chips (icon and number) and
 * `SituationLine` is the slim parchment card under the top bar: the
 * one-sentence situation over a row of chips.
 */
import Phaser from 'phaser';
import { uiId } from '../layout';
import { wrapText, LINE_H } from '../textfit';
import { MOSAIC } from '../tokens';
import { addIcon, ICON_PX } from '../kit';
import { mosaicImage, midY, mtext, mw } from './base';
import type { MChipOpts } from './controls';
import { TopBar, type TopBarOpts } from './TopBar';
import { TOPBAR_H } from './ScreenFrame';

/** A TopBar on its own stone strip, across the full width at the top of a map screen. */
export function addMapTopBar(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, VW: number, o: TopBarOpts): TopBar {
  parent.add(mosaicImage(scene, 0, 0, VW, TOPBAR_H, 'topBar'));
  const g = scene.add.graphics();
  g.fillStyle(MOSAIC.meander, 0.9);
  g.fillRect(0, TOPBAR_H - 1, VW, 1);
  parent.add(g);
  const bar = new TopBar(scene, { x: 0, y: 0, w: VW, h: TOPBAR_H }, o);
  parent.add(bar);
  return bar;
}

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
      this.add(this.chip(cx, cw, chips[i], surface, font));
      cx += cw + GAP;
    }
    scene.add.existing(this);
  }

  private chip(x: number, w: number, c: SituationChip, surface: 'parchment' | 'stone', font: 'ink' | 'pInk'): Phaser.GameObjects.Container {
    const scene = this.scene;
    const chip = scene.add.container(x, 0);
    const val = String(c.value);
    chip.add(mosaicImage(scene, 0, 0, w, CHIP_ROW_H, surface === 'stone' ? 'chipStone' : 'chipParch'));
    const iconW = c.icon ? ICON_PX + 1 : 0;
    const x0 = Math.round((w - (iconW + mw(val, font))) / 2);
    if (c.icon) chip.add(addIcon(scene, x0, Math.round((CHIP_ROW_H - ICON_PX) / 2) - 1, c.icon));
    chip.add(mtext(scene, x0 + iconW, midY(CHIP_ROW_H - 1), val, font, { maxW: w - 4, box: { owner: chip, w, h: CHIP_ROW_H } }));
    uiId(chip, c.id ?? `chip:${c.icon ?? ''}:${val}`);
    return chip;
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
