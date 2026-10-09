/**
 * BottomPanel: the v4 bottom sheet (V4_SPEC "Bottom panel", the war map's hex
 * panel): a parchment sheet rising above the tab bar with a Cinzel title, a
 * close X, a body area for lines of text, and an action row of buttons.
 */
import Phaser from 'phaser';
import { FRAME_T } from '../../art/mosaicUi';
import { t } from '../../i18n';
import { motion, tweenTo } from '../motion';
import { MOTION, SPACE } from '../tokens';
import { uiId } from '../layout';
import { GAP, TAP, makePressable, mosaicImage, mtext, mw } from './base';
import { MButton, type MButtonOpts } from './controls';
import { addIcon, scaleIcon } from '../kit';
import { inkify } from '../inkSkin';
import type { Box } from './ScreenFrame';

export interface BottomPanelOpts {
  title: string;
  /** Width in UI px (default: the screen inside its frame). */
  w?: number;
  /** Height of the body area (the lines of text) in UI px. */
  bodyH: number;
  onClose?: () => void;
  /** One row of buttons across the bottom, equal widths. */
  actions?: MButtonOpts[];
  /** Rise from under the tab bar (default true; the gallery shows it in place). */
  animate?: boolean;
  id?: string;
}

const TITLE_H = 20;
const ACTION_H = 24;

/** Natural width of an action button: its label at size 7 plus padding (the icon is dropped before the label shrinks). */
function naturalW(a: MButtonOpts): number {
  return mw(a.label.toUpperCase(), a.variant === 'disabled' ? 'rOff' : 'rCream', 7) + 16;
}

/**
 * Rows of actions in a panel `w` wide: all in one row when each fits at its natural size; else the
 * primary alone on a full-width row below the others; else every action on its own row. Never a cut label.
 */
export function actionRows(actions: MButtonOpts[], w: number): MButtonOpts[][] {
  const fits = (row: MButtonOpts[]) => row.reduce((acc, a) => acc + naturalW(a), 0) + GAP * (row.length - 1) <= w;
  if (fits(actions)) return [actions];
  const main = actions.find((a) => a.variant === 'primary' || a.variant === 'primaryHero') ?? actions[actions.length - 1];
  const rest = actions.filter((a) => a !== main);
  if (rest.length && fits(rest)) return [rest, [main]];
  return actions.map((a) => [a]);
}

export class BottomPanel extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  /** The body area (`area`) in the panel's own coordinates: add text lines here. */
  readonly area: Box;
  readonly buttons: MButton[] = [];
  private closed = false;

  /**
   * @param bottom Y of the panel's bottom edge (the top of the tab bar, or the frame's lower edge).
   */
  constructor(scene: Phaser.Scene, VW: number, bottom: number, private o: BottomPanelOpts) {
    const w = o.w ?? VW - FRAME_T * 2 + 2;
    const rows = o.actions?.length ? actionRows(o.actions, w - SPACE.md * 2) : [];
    const h = SPACE.md + TITLE_H + o.bodyH + (rows.length ? rows.length * (ACTION_H + GAP) + SPACE.md - GAP : 0) + SPACE.md;
    super(scene, Math.round((VW - w) / 2), Math.round(bottom - h));
    this.w = w;
    this.h = h;
    this.add(mosaicImage(scene, 0, 0, w, h, 'sheet'));
    const tw = w - SPACE.lg * 2 - TAP - 4;
    const size = [9, 8.5, 8, 7.5, 7].find((z) => mw(o.title, 'rInk', z) <= tw) ?? 7;
    this.add(mtext(scene, SPACE.lg + 2, SPACE.md + 2, o.title, 'rInk', { size, maxW: tw, box: { owner: this, w, h } }));
    this.area = { x: SPACE.lg + 2, y: SPACE.md + TITLE_H, w: w - (SPACE.lg + 2) * 2, h: o.bodyH };
    this.addClose();
    rows.forEach((row, ri) => {
      const aw = Math.floor((w - SPACE.md * 2 - GAP * (row.length - 1)) / row.length);
      row.forEach((a, i) => {
        const b = new MButton(scene, SPACE.md + i * (aw + GAP), h - SPACE.md - 1 - (rows.length - ri) * ACTION_H - (rows.length - ri - 1) * GAP, aw, ACTION_H, { variant: 'neutral', ...a });
        this.add(b);
        this.buttons.push(b);
      });
    });
    uiId(this, o.id ?? 'bottompanel');
    scene.add.existing(this);
    inkify(this);
    if (o.animate === false || motion.reduced) return;
    const y = this.y;
    this.y = y + 14;
    this.alpha = 0;
    tweenTo(scene, this, { y, alpha: 1 }, MOTION.sheet);
  }

  /** Slide away and destroy. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.o.onClose?.();
    tweenTo(this.scene, this, { y: this.y + 14, alpha: 0 }, MOTION.fade, { onComplete: () => this.destroy() });
  }

  private addClose(): void {
    const scene = this.scene;
    const b = scene.add.container(this.w - TAP - 3, 3);
    const face = scene.add.container(TAP / 2, TAP / 2);
    const s = TAP - 6;
    const bg = mosaicImage(scene, -s / 2, -s / 2, s, s, 'btnBronze');
    const ic = scaleIcon(addIcon(scene, 0, 0, 'xmark', 'L'), 1);
    ic.setPosition(-ic.displayWidth / 2, -ic.displayHeight / 2 - 0.5);
    face.add([bg, ic]);
    b.add(face);
    makePressable(b, { face, w: TAP, h: TAP, onTap: () => this.close(), tip: t('mosaic.close') });
    uiId(b, `${this.o.id ?? 'bottompanel'}.close`);
    this.add(b);
  }
}
