/**
 * The parchment sheet: the one modal of the v4 UI (V4_SPEC "Bottom panel"). A
 * parchment sheet on a shade that blocks the screen below, with a Cinzel title
 * over a fine rule, a close X, a body area to fill and, optionally, an action
 * row of MButtons (laid out by `actionRows`: one row when the labels fit, the
 * primary alone on a row of its own, else one per row). It is a navigation
 * layer (Telegram Back closes it); a tap on the shade outside closes it too
 * unless `shadeCloses: false` (decisions, forced choices), which also drops the
 * X. `dock: 'center'` fades in; `dock: 'bottom'` slides up from the lower edge.
 *
 * `openModal` (widgets.ts) and `openSheet` (v3.ts) are the same sheet for the
 * screens built from legacy light-on-dark parts: they pass `skin: true`, which
 * re-inks what they put in the sheet (see inkSkin.ts).
 */
import Phaser from 'phaser';
import { addText, type UIMetrics } from '../kit';
import { navLayer } from '../../platform/nav';
import { uiBlocker, uiFrame, uiId } from '../layout';
import { motion, tweenTo } from '../motion';
import { inkify } from '../inkSkin';
import { ellipsize, measureText } from '../textfit';
import { MOSAIC, MOTION, SPACE } from '../tokens';
import { shadeTap, type Modal } from '../widgets';
import { t } from '../../i18n';
import { GAP, mosaicImage } from './base';
import { actionRows } from './BottomPanel';
import { MButton, type MButtonOpts } from './controls';
import { MIconButton } from './iconButton';

type UiScene = Phaser.Scene & { m: UIMetrics; ui: Phaser.GameObjects.Container };

export interface ParchmentSheetOpts {
  title?: string;
  /** Width (default 200 centred, 260 docked; clamped to the screen). */
  w?: number;
  /** Total height of the sheet (clamped to the screen); the action row (when there is one) is part of it. */
  h: number;
  /** One row of buttons across the bottom (equal widths; wraps when a label would not fit). */
  actions?: MButtonOpts[];
  /** Where the sheet sits: centred (default) or on the lower edge of the screen. */
  dock?: 'center' | 'bottom';
  /**
   * A tap on the shade outside closes the sheet, like Back (default true). Pass false where an outside tap
   * would skip a decision or lose progress: yes/no confirms, tutorial steps, forced choices, forms.
   */
  shadeCloses?: boolean;
  /** Draw the X (default: when the shade closes it). */
  closeButton?: boolean;
  /** The content is built for dark surfaces (legacy parts): re-ink it for the parchment as it arrives. */
  skin?: boolean;
  onClose?: () => void;
  id?: string;
}

export interface ParchmentSheetHandle extends Modal {
  buttons: MButton[];
}

/** Height the title takes inside the sheet (title, rule and the gap under it), UI px. */
export const SHEET_TITLE_H = 26;
export const SHEET_ACTION_H = 24;
/** Padding at the sheet's edges, UI px. */
const PAD = 8;

/** Height of the action rows of a sheet `w` wide (0 without actions). */
export function sheetActionsH(actions: MButtonOpts[] | undefined, w: number): number {
  if (!actions?.length) return 0;
  const rows = actionRows(actions, w - SPACE.md * 2).length;
  return rows * (SHEET_ACTION_H + GAP) + SPACE.sm;
}

/** The title over its rule, centred on the sheet, with the X at the right. Returns the y where the body starts. */
function addTitle(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, w: number, title: string, close: (() => void) | undefined, id: string): number {
  const side = close ? 26 : PAD;
  const room = w - side * 2;
  const size = [9, 8.5, 8, 7.5, 7, 6.5, 6].find((z) => measureText(title, false, z, 'roman') <= room) ?? 6;
  const txt = addText(scene, x + w / 2, y + 9, ellipsize(title, room, false, size, 'roman'), 'rInk', 0.5).setFontSize(size);
  uiFrame(txt, parent as unknown as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, w, 24, x, y);
  parent.add(txt);
  const g = scene.add.graphics();
  g.lineStyle(0.7, MOSAIC.parchEdge, 0.7);
  g.lineBetween(x + side, y + 21, x + w - side, y + 21);
  parent.add(g);
  if (close) parent.add(new MIconButton(scene, x + w - 25, y + 1, 22, 22, { icon: 'xmark', label: t('mosaic.close'), variant: 'secondary', id: `${id}.close`, onClick: close }));
  return y + SHEET_TITLE_H;
}

export function openParchmentSheet(scene: UiScene, o: ParchmentSheetOpts): ParchmentSheetHandle {
  const { VW, VH } = scene.m;
  const docked = o.dock === 'bottom';
  const id = o.id ?? 'sheet';
  const c = scene.add.container(0, 0);
  scene.ui.add(c);
  const shade = scene.add.rectangle(0, 0, VW, VH, 0x000000, docked ? 0.6 : 0.55).setOrigin(0, 0).setInteractive();
  uiBlocker(shade);
  c.add(shade);
  const w = Math.min(o.w ?? (docked ? 260 : 200), VW - (docked ? 8 : 16));
  const h = Math.min(o.h, VH - (docked ? 12 : 16));
  const x = Math.round((VW - w) / 2);
  const y = docked ? VH - h : Math.round((VH - h) / 2);
  const box = scene.add.container(0, 0);
  c.add(box);
  // a docked sheet reaches under the screen's lower edge (it slides up from there)
  box.add(mosaicImage(scene, x, y, w, docked ? h + 10 : h, 'sheet'));
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (docked && !motion.reduced) {
      tweenTo(scene, box, { y: h + 12 }, MOTION.sheet * 0.8, { ease: 'Cubic.easeIn' });
      tweenTo(scene, shade, { alpha: 0 }, MOTION.sheet * 0.8, { onComplete: () => c.destroy() });
    } else c.destroy();
    o.onClose?.();
  };
  const shadeCloses = o.shadeCloses !== false;
  const withX = o.closeButton ?? shadeCloses;
  const top = o.title ? addTitle(scene, box, x, y, w, o.title, withX ? close : undefined, id) : y + PAD;
  const rows = o.actions?.length ? actionRows(o.actions, w - SPACE.md * 2) : [];
  const actionsH = rows.length ? rows.length * (SHEET_ACTION_H + GAP) + SPACE.sm : 0;
  const buttons: MButton[] = [];
  rows.forEach((row, ri) => {
    const aw = Math.floor((w - SPACE.md * 2 - GAP * (row.length - 1)) / row.length);
    row.forEach((a, i) => {
      const by = y + h - SPACE.md - (rows.length - ri) * SHEET_ACTION_H - (rows.length - ri - 1) * GAP;
      const b = new MButton(scene, x + SPACE.md + i * (aw + GAP), by, aw, SHEET_ACTION_H, { variant: 'neutral', ...a });
      box.add(b);
      buttons.push(b);
    });
  });
  if (shadeCloses) shadeTap(shade, { x, y, w, h }, close);
  navLayer(c, close, scene);
  if (o.skin) inkify(box);
  if (!motion.reduced) {
    if (docked) {
      box.y = h + 12;
      tweenTo(scene, box, { y: 0 }, MOTION.sheet);
    } else {
      box.alpha = 0;
      tweenTo(scene, box, { alpha: 1 }, MOTION.sheet);
    }
    shade.alpha = 0;
    tweenTo(scene, shade, { alpha: docked ? 0.6 : 0.55 }, MOTION.sheet);
  }
  uiId(c, id);
  return { c: box, x, y, w, h, body: { x: x + PAD, y: top, w: w - PAD * 2, h: y + h - PAD - top - actionsH }, buttons, close };
}
