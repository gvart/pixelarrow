/**
 * ChoiceCard (design/ux/accounts-v6.md §12): a parchment card that is one of two exclusive choices, used
 * by Choose which account to keep (AU-16): a title ("This account"), the account's name (never cut: it's
 * the thing being chosen), an optional quieter line (a masked email), fact lines, and the keep control.
 *
 * - picked: the selected rim, a ✓ and "Kept" (never colour alone);
 * - forcedKept: picked, with the lock and the reason;
 * - forcedOff: can't be picked: the lock and the reason, and a tap says why;
 * - unpicked: "Keep this".
 *
 * Two cards sit side by side from 600 CSS px of sheet width and stack below (`choiceColumns`). Each card
 * is one focus stop (Tab and the arrows move between them, Enter picks).
 */
import Phaser from 'phaser';
import { addIcon, scaleIcon } from '../kit';
import { RS } from '../../platform/renderScale';
import { makePressable, mosaicImage, mtext } from './base';
import { uiId } from '../layout';
import type { CardState } from '../account/linking';

export interface ChoiceCardOpts {
  title: string;
  name: string;
  sub?: string | null;
  facts: string[];
  keepLabel: string;
  keptLabel: string;
  /** The lock line when forced (kept or off). */
  reason?: string;
  id: string;
  onPick: () => void;
}

const PAD = 6;
const TEXT = 7;
const KEEP_H = 12;

/** Two columns at ≥ 600 CSS px of sheet (§1.6), else stacked; `S` is the UI scale. */
export function choiceColumns(sheetW: number, S: number): boolean {
  return (sheetW * S) / RS >= 600;
}

export class ChoiceCard extends Phaser.GameObjects.Container {
  readonly h: number;
  private pick: CardState = 'unpicked';
  private readonly cw: number;
  private readonly o: ChoiceCardOpts;
  private readonly bodyH: number;

  /** The height a card of width `w` needs for `o` (every card of a pair takes the taller one). */
  static measure(scene: Phaser.Scene, w: number, o: ChoiceCardOpts): number {
    const parts = ChoiceCard.texts(scene, w, o);
    const h = parts.reduce((a, p) => a + p.height + 2, 0);
    parts.forEach((p) => p.destroy());
    const reason = o.reason ? mtext(scene, 0, 0, o.reason, 'pSec', { size: TEXT, maxW: w - PAD * 2 - 12, wrap: true }) : null;
    const rh = reason ? reason.height + 4 : 0;
    reason?.destroy();
    return PAD + h + 3 + rh + KEEP_H + PAD;
  }

  private static texts(scene: Phaser.Scene, w: number, o: ChoiceCardOpts): Phaser.GameObjects.BitmapText[] {
    const mw = w - PAD * 2;
    return [
      mtext(scene, 0, 0, o.title, 'rInk', { size: 7.5, maxW: mw }),
      mtext(scene, 0, 0, o.name, 'pInk', { size: 8, maxW: mw, wrap: true }),
      ...(o.sub ? [mtext(scene, 0, 0, o.sub, 'pMuted', { size: TEXT, maxW: mw })] : []),
      mtext(scene, 0, 0, o.facts.join('\n'), 'pInk', { size: TEXT, maxW: mw, wrap: true }),
    ];
  }

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, o: ChoiceCardOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.cw = w;
    this.h = h;
    this.o = o;
    this.bodyH = h;
    makePressable(this, {
      w,
      h,
      tip: `${o.title}: ${o.name}`,
      // a forced-off card says why on a tap (makePressable shows the reason)
      disabled: () => (this.pick === 'forcedOff' ? o.reason : undefined),
      onTap: () => o.onPick(),
    });
    uiId(this, o.id);
    scene.add.existing(this);
    this.paint();
  }

  setState(s: CardState): this {
    if (s !== this.pick) {
      this.pick = s;
      this.paint();
    }
    return this;
  }

  private paint(): void {
    const scene = this.scene;
    const { cw: w, o } = this;
    this.removeAll(true);
    const on = this.pick === 'picked' || this.pick === 'forcedKept';
    this.add(mosaicImage(scene, 0, 0, w, this.bodyH, on ? 'parchmentSel' : 'parchment'));
    let yy = PAD;
    for (const p of ChoiceCard.texts(scene, w, o)) {
      p.setPosition(PAD, yy);
      this.add(p);
      yy += p.height + 2;
    }
    const forced = this.pick === 'forcedKept' || this.pick === 'forcedOff';
    if (forced && o.reason) {
      yy += 3;
      this.add(scaleIcon(addIcon(scene, PAD, yy - 1, 'lock', 'L'), 0.75));
      this.add(mtext(scene, PAD + 12, yy, o.reason, 'pSec', { size: TEXT, maxW: w - PAD * 2 - 12, wrap: true }));
    }
    const ky = this.bodyH - PAD - 9;
    if (on) this.add(scaleIcon(addIcon(scene, PAD, ky - 1, 'check', 'L'), 0.75));
    if (this.pick !== 'forcedOff') this.add(mtext(scene, PAD + (on ? 12 : 0), ky, on ? o.keptLabel : o.keepLabel, on ? 'pInk' : 'pSec', { size: TEXT, maxW: w - PAD * 2 - 12 }));
    this.setAlpha(this.pick === 'forcedOff' ? 0.75 : 1);
  }
}
