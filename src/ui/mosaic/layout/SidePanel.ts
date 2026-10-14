/**
 * Sheets become side panels (design/ux/landscape-v6.md §3.4): `openPanel` puts a sheet where
 * `panelLayout` says for the scene's variant. A bottom sheet or a centred dialog is the v5
 * ParchmentSheet (same look, same overlay stack); a side panel docks to the right edge of the
 * content area (left in left-hand mode), full height under the top bar, never over the nav rail.
 *
 * - **Modal** (default): a 20% shade over the rest of the screen; a click on it closes the panel
 *   (its cursor stays `default`, §4). Back and Esc close it (a navigation layer).
 * - **Inspector** (`inspector: true`): no shade, the screen stays live; Esc still closes it first.
 * - Enters with a 12 UI px slide from its edge and a fade, 160 ms ease-out; at once under Reduce motion.
 */
import Phaser from 'phaser';
import { addText, type UIMetrics } from '../../kit';
import { navLayer } from '../../../platform/nav';
import { uiBlocker, uiFrame, uiId, uiIgnore, uiPanel } from '../../layout';
import { motion, tweenTo } from '../../motion';
import { ellipsize, measureText } from '../../textfit';
import { MOSAIC, SPACE } from '../../tokens';
import { markSurface, shadeTap } from '../../widgets';
import { t } from '../../../i18n';
import { GAP, mosaicImage } from '../base';
import { actionRows } from '../BottomPanel';
import { MButton, type MButtonOpts } from '../controls';
import { MIconButton } from '../iconButton';
import { SHEET_ACTION_H, SHEET_TITLE_H, openParchmentSheet } from '../ParchmentSheet';
import { panelLayout, type PanelKind, type PanelPresentation } from './panels';
import type { Box } from './variant';

type UiScene = Phaser.Scene & { m: UIMetrics; ui: Phaser.GameObjects.Container };

export interface PanelOpts {
  kind: PanelKind;
  title: string;
  /** The height the content asks for (a side panel takes the content area's full height). */
  h: number;
  /** The content area a side panel docks in: under the top bar, beside the nav rail. */
  area: Box;
  /** Non-modal: no shade, the rest of the screen stays live (the War hex panel, Camp placement). */
  inspector?: boolean;
  leftHand?: boolean;
  actions?: MButtonOpts[];
  id?: string;
  onClose?: () => void;
}

export interface PanelHandle {
  presentation: PanelPresentation;
  /** The panel's container: fill it with parchment content at `body`. */
  c: Phaser.GameObjects.Container;
  x: number;
  y: number;
  w: number;
  h: number;
  body: Box;
  buttons: MButton[];
  close: () => void;
}

/** The shade of a modal side panel (§3.4: 20%). */
const SIDE_SHADE = 0.2;
/** The slide in from the docked edge, UI px, and its time (§3.4). */
const SLIDE = 12;
const SLIDE_MS = 160;
const PAD = 8;

export function openPanel(scene: UiScene, o: PanelOpts): PanelHandle {
  const { presentation, rect } = panelLayout(scene.m, o.kind, o.area, o.h, { leftHand: o.leftHand });
  const id = o.id ?? 'panel';
  if (presentation !== 'side') {
    const s = openParchmentSheet(scene, {
      title: o.title,
      w: rect.w,
      h: rect.h,
      dock: presentation === 'bottom' ? 'bottom' : 'center',
      kind: o.kind === 'decision' ? 'confirm' : 'sheet',
      shadeCloses: o.kind !== 'decision',
      actions: o.actions,
      id,
      onClose: o.onClose,
    });
    // the layout check judges the screen beneath it, and the sheet by its own caps (V6-063)
    uiPanel(s.c, s.x, s.y, s.w, s.h);
    return { presentation, ...s };
  }
  const { VW, VH } = scene.m;
  const c = scene.add.container(0, 0);
  scene.ui.add(c);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    c.destroy();
    o.onClose?.();
  };
  if (!o.inspector) {
    const shade = scene.add.rectangle(0, 0, VW, VH, MOSAIC.page, SIDE_SHADE).setOrigin(0, 0).setInteractive({ cursor: 'default' });
    uiBlocker(shade);
    c.add(shade);
    shadeTap(shade, rect, close);
  }
  const { x, y, w, h } = rect;
  const box = scene.add.container(0, 0);
  c.add(box);
  uiPanel(box, x, y, w, h, true);
  // the panel takes the taps on it (an inspector leaves the rest of the screen live)
  box.add(uiIgnore(mosaicImage(scene, x, y, w, h, 'sheet').setInteractive({ cursor: 'default' })));
  const room = w - 26 * 2;
  const size = [9, 8.5, 8, 7.5, 7, 6.5].find((z) => measureText(o.title, false, z, 'roman') <= room) ?? 6.5;
  const title = addText(scene, x + w / 2, y + 9, ellipsize(o.title, room, false, size, 'roman'), 'rInk', 0.5).setFontSize(size);
  uiFrame(title, box as unknown as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, w, 24, x, y);
  box.add(title);
  const g = scene.add.graphics();
  g.lineStyle(0.7, MOSAIC.parchEdge, 0.7);
  g.lineBetween(x + 26, y + 21, x + w - 26, y + 21);
  box.add(g);
  box.add(new MIconButton(scene, x + w - 25, y + 1, 22, 22, { icon: 'xmark', label: t('mosaic.close'), variant: 'secondary', id: `${id}.close`, onClick: close }));
  const rows = o.actions?.length ? actionRows(o.actions, w - SPACE.md * 2) : [];
  const actionsH = rows.length ? rows.length * (SHEET_ACTION_H + GAP) + SPACE.sm : 0;
  const buttons: MButton[] = [];
  rows.forEach((row, ri) => {
    const aw = Math.floor((w - SPACE.md * 2 - GAP * (row.length - 1)) / row.length);
    const by = y + h - SPACE.md - (rows.length - ri) * SHEET_ACTION_H - (rows.length - ri - 1) * GAP;
    row.forEach((a, i) => {
      const b = new MButton(scene, x + SPACE.md + i * (aw + GAP), by, aw, SHEET_ACTION_H, { variant: 'neutral', ...a });
      box.add(b);
      buttons.push(b);
    });
  });
  navLayer(c, close, scene);
  markSurface(box, MOSAIC.parch);
  if (!motion.reduced) {
    box.x = o.leftHand ? -SLIDE : SLIDE;
    box.alpha = 0;
    tweenTo(scene, box, { x: 0, alpha: 1 }, SLIDE_MS, { ease: 'Cubic.easeOut' });
  }
  uiId(c, id);
  const top = y + SHEET_TITLE_H;
  return { presentation, c: box, x, y, w, h, body: { x: x + PAD, y: top, w: w - PAD * 2, h: y + h - PAD - top - actionsH }, buttons, close };
}
