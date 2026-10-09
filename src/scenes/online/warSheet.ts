/**
 * The parchment sheet modal of the war hub (result popups, the duel lobby): a
 * dim shade, a centred 'sheet' with a Cinzel title, and a body area to fill.
 * Back (nav layer) and a tap on the shade close it.
 */
import Phaser from 'phaser';
import { navLayer } from '../../platform/nav';
import { uiBlocker } from '../../ui/layout';
import { shadeTap, type Modal } from '../../ui/widgets';
import { SPACE } from '../../ui/tokens';
import { mosaicImage, mtext, mw } from '../../ui/mosaic';
import type { UIMetrics } from '../../ui/kit';

type UiScene = Phaser.Scene & { m: UIMetrics; ui: Phaser.GameObjects.Container };

export interface WarSheetOpts {
  title: string;
  w?: number;
  h: number;
  onClose?: () => void;
  shadeCloses?: boolean;
}

/** Height the title takes inside the sheet, UI px. */
export const SHEET_TITLE_H = 24;

export function openWarSheet(scene: UiScene, o: WarSheetOpts): Modal {
  const { VW, VH } = scene.m;
  const c = scene.add.container(0, 0);
  scene.ui.add(c);
  const shade = scene.add.rectangle(0, 0, VW, VH, 0x000000, 0.6).setOrigin(0, 0).setInteractive();
  uiBlocker(shade);
  c.add(shade);
  const w = Math.min(o.w ?? 200, VW - 16);
  const h = Math.min(o.h, VH - 16);
  const x = Math.round((VW - w) / 2);
  const y = Math.round((VH - h) / 2);
  c.add(mosaicImage(scene, x, y, w, h, 'sheet'));
  const size = [9, 8.5, 8, 7.5, 7].find((z) => mw(o.title, 'rInk', z) <= w - SPACE.lg * 2) ?? 7;
  c.add(mtext(scene, x + w / 2, y + SPACE.md + 3, o.title, 'rInk', { size, align: 0.5, maxW: w - SPACE.lg * 2 }));
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    c.destroy();
    o.onClose?.();
  };
  if (o.shadeCloses !== false) shadeTap(shade, { x, y, w, h }, close);
  navLayer(c, close, scene);
  const top = y + SHEET_TITLE_H + SPACE.sm;
  return { c, x, y, w, h, body: { x: x + SPACE.lg, y: top, w: w - SPACE.lg * 2, h: y + h - SPACE.md - top }, close };
}
