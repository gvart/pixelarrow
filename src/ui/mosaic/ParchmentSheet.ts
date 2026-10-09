/**
 * ParchmentSheet: a v4 modal sheet (V4_SPEC "Bottom panel"): a parchment
 * sheet on a shade that blocks the screen below, with a Cinzel title, a close
 * X and an action row of MButtons. It is a navigation layer (Telegram Back
 * closes it), a tap on the shade outside closes it too unless `shadeCloses:
 * false`. `c` is the container to add content to (UI coordinates); `body` is
 * the free area between the title and the action row.
 */
import Phaser from 'phaser';
import { addIcon, scaleIcon, type UIMetrics } from '../kit';
import { navLayer } from '../../platform/nav';
import { uiBlocker, uiId } from '../layout';
import { motion, tweenTo } from '../motion';
import { MOTION, SPACE } from '../tokens';
import { shadeTap } from '../widgets';
import { t } from '../../i18n';
import { GAP, TAP, makePressable, mosaicImage, mtext, mw } from './base';
import { actionRows } from './BottomPanel';
import { MButton, type MButtonOpts } from './controls';

type UiScene = Phaser.Scene & { m: UIMetrics; ui: Phaser.GameObjects.Container };

export interface ParchmentSheetOpts {
  title?: string;
  w?: number;
  /** Total height of the sheet; the action row (when there is one) is part of it. */
  h: number;
  /** One row of buttons across the bottom (equal widths; wraps when a label would not fit). */
  actions?: MButtonOpts[];
  /** Where the sheet sits: centred (default) or on the lower edge of the screen. */
  dock?: 'center' | 'bottom';
  shadeCloses?: boolean;
  /** Draw the X (default true). */
  closeButton?: boolean;
  onClose?: () => void;
  id?: string;
}

export interface ParchmentSheetHandle {
  c: Phaser.GameObjects.Container;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Free area between the title and the action row. */
  body: { x: number; y: number; w: number; h: number };
  buttons: MButton[];
  close: () => void;
}

export const SHEET_TITLE_H = 22;
export const SHEET_ACTION_H = 24;

/** Height of the action rows of a sheet `w` wide (0 without actions). */
export function sheetActionsH(actions: MButtonOpts[] | undefined, w: number): number {
  if (!actions?.length) return 0;
  const rows = actionRows(actions, w - SPACE.md * 2).length;
  return rows * (SHEET_ACTION_H + GAP) + SPACE.sm;
}

export function openParchmentSheet(scene: UiScene, o: ParchmentSheetOpts): ParchmentSheetHandle {
  const { VW, VH } = scene.m;
  const c = scene.add.container(0, 0);
  scene.ui.add(c);
  const shade = scene.add.rectangle(0, 0, VW, VH, 0x000000, 0.55).setOrigin(0, 0).setInteractive();
  uiBlocker(shade);
  c.add(shade);
  const w = Math.min(o.w ?? 200, VW - 12);
  const h = Math.min(o.h, VH - 12);
  const x = Math.round((VW - w) / 2);
  const y = o.dock === 'bottom' ? VH - h - 2 : Math.round((VH - h) / 2);
  const box = scene.add.container(0, 0);
  c.add(box);
  box.add(mosaicImage(scene, x, y, w, h, 'sheet'));
  const bodyTop = o.title ? y + SHEET_TITLE_H + 2 : y + SPACE.md + 2;
  const rows = o.actions?.length ? actionRows(o.actions, w - SPACE.md * 2) : [];
  const actionsH = rows.length ? rows.length * (SHEET_ACTION_H + GAP) + SPACE.sm : 0;
  const buttons: MButton[] = [];
  const frame = { owner: box as Phaser.GameObjects.Container, w: VW, h: VH };
  if (o.title) {
    const tw = w - SPACE.lg * 2 - TAP - 2;
    const size = [9, 8.5, 8, 7.5, 7, 6.5].find((z) => mw(o.title!, 'rInk', z) <= tw) ?? 6.5;
    box.add(mtext(scene, x + SPACE.lg + 2, y + SPACE.md + 3, o.title, 'rInk', { size, maxW: tw, box: frame }));
  }
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    c.destroy();
    o.onClose?.();
  };
  rows.forEach((row, ri) => {
    const aw = Math.floor((w - SPACE.md * 2 - GAP * (row.length - 1)) / row.length);
    row.forEach((a, i) => {
      const by = y + h - SPACE.md - (rows.length - ri) * SHEET_ACTION_H - (rows.length - ri - 1) * GAP;
      const b = new MButton(scene, x + SPACE.md + i * (aw + GAP), by, aw, SHEET_ACTION_H, { variant: 'neutral', ...a });
      box.add(b);
      buttons.push(b);
    });
  });
  if (o.closeButton !== false) {
    const b = scene.add.container(x + w - TAP - 3, y + 3);
    const face = scene.add.container(TAP / 2, TAP / 2);
    const s = TAP - 6;
    const ic = scaleIcon(addIcon(scene, 0, 0, 'xmark', 'L'), 1);
    ic.setPosition(-ic.displayWidth / 2, -ic.displayHeight / 2 - 0.5);
    face.add([mosaicImage(scene, -s / 2, -s / 2, s, s, 'btnBronze'), ic]);
    b.add(face);
    makePressable(b, { face, w: TAP, h: TAP, onTap: close, tip: t('mosaic.close') });
    uiId(b, `${o.id ?? 'sheet'}.close`);
    box.add(b);
  }
  if (o.shadeCloses !== false) shadeTap(shade, { x, y, w, h }, close);
  navLayer(c, close, scene);
  if (!motion.reduced) {
    box.alpha = 0;
    shade.alpha = 0;
    tweenTo(scene, box, { alpha: 1 }, MOTION.sheet);
    tweenTo(scene, shade, { alpha: 1 }, MOTION.sheet);
  }
  uiId(c, o.id ?? 'sheet');
  return { c: box, x, y, w, h, body: { x: x + SPACE.lg + 2, y: bodyTop, w: w - (SPACE.lg + 2) * 2, h: y + h - bodyTop - actionsH - SPACE.sm }, buttons, close };
}
