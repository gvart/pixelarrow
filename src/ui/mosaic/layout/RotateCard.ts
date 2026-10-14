/**
 * `RotateCard`, the global floor (design/ux/landscape-v6.md §3.6): below the floor (a window under
 * 320 CSS px tall, floor.ts) a parchment card on the stone stage shows a turning phone and one line,
 * "Turn your phone or make the window taller". The scene behind keeps running (a live battle is not
 * paused by a resize); the card only covers it, and goes as soon as the size is above the floor.
 * No scene picks it as a layout: `mountRotateCard` follows the size, nothing else.
 */
import Phaser from 'phaser';
import type { UIMetrics } from '../../kit';
import { RS } from '../../../platform/renderScale';
import { uiBlocker, uiFrame, uiId, uiPanel } from '../../layout';
import { MOSAIC, TEXT_MIN, lineHeight } from '../../tokens';
import { lang } from '../../../i18n';
import { mosaicImage, mtext, mw } from '../base';
import { wrapWords } from '../policy';
import { belowFloor, rotateCardText } from './floor';

type UiScene = Phaser.Scene & { m: UIMetrics };

const CARD_MAX_W = 200;
const PAD = 8;
const ICON = 28;

/** The card on the stone stage, VW x VH UI px. */
export class RotateCard extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, VW: number, VH: number) {
    super(scene, 0, 0);
    // the stage takes every tap: the screen under it is out of reach, not paused
    const stage = scene.add.rectangle(0, 0, VW, VH, MOSAIC.page, 1).setOrigin(0, 0).setInteractive({ cursor: 'default' });
    uiBlocker(stage);
    this.add(stage);
    const w = Math.min(CARD_MAX_W, VW - 16);
    const line = rotateCardText(lang());
    const size = 7;
    const lines = wrapWords(line, w - PAD * 2, (s) => mw(s, 'pInk', size)).length;
    const textH = Math.ceil(lines * lineHeight(size));
    const h = Math.min(VH - 8, PAD + ICON + 6 + textH + PAD);
    const x = Math.round((VW - w) / 2);
    const y = Math.round((VH - h) / 2);
    // the card is a dialog for the layout check: the screen under the stage is what it measures (V6-063)
    const card = uiPanel(new Phaser.GameObjects.Container(scene, 0, 0), x, y, w, h);
    this.add(card);
    card.add(mosaicImage(scene, x, y, w, h, 'parchment'));
    card.add(phoneGlyph(scene, x + w / 2, y + PAD + ICON / 2));
    const txt = mtext(scene, x + w / 2, y + PAD + ICON + 6, line, 'pInk', { size: Math.max(TEXT_MIN, size), maxW: w - PAD * 2, wrap: true, align: 0.5 }).setCenterAlign();
    uiFrame(txt, this as unknown as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, w, h, x, y);
    card.add(txt);
    uiId(this, 'layout.rotateCard');
  }
}

/** A phone on its side with a turning arrow over it, in ink (no icon of the set shows one). */
function phoneGlyph(scene: Phaser.Scene, cx: number, cy: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.lineStyle(1.5, MOSAIC.ink, 1);
  // the phone, upright, turning
  g.strokeRoundedRect(cx - 6, cy - 11, 12, 20, 2);
  g.fillStyle(MOSAIC.ink, 1);
  g.fillRect(cx - 2, cy + 6, 4, 1);
  // the arrow round it: an arc and its head
  g.beginPath();
  g.arc(cx, cy - 1, 13, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(330), false);
  g.strokePath();
  const a = Phaser.Math.DegToRad(330);
  const hx = cx + 13 * Math.cos(a);
  const hy = cy - 1 + 13 * Math.sin(a);
  g.fillTriangle(hx + 3, hy - 3, hx + 2, hy + 4, hx - 4, hy + 1);
  return g;
}

/**
 * Keep a rotate card over `scene` while its window is below the floor (`force`: always, for the
 * Kit's sample). Returns a function that removes it. The card sits in a layer of its own above the
 * scene's UI, at the scene's S, and follows every resize.
 */
export function mountRotateCard(scene: UiScene, o: { force?: boolean } = {}): () => void {
  let layer: Phaser.GameObjects.Container | null = null;
  const update = () => {
    layer?.destroy();
    layer = null;
    if (!o.force && !belowFloor(scene.scale.width / RS, scene.scale.height / RS)) return;
    const { S } = scene.m;
    const VW = Math.floor(scene.scale.width / S);
    const VH = Math.floor(scene.scale.height / S);
    layer = scene.add.container(0, 0).setScale(S).setDepth(1e6);
    layer.add(new RotateCard(scene, VW, VH));
  };
  update();
  scene.scale.on('resize', update);
  const remove = () => {
    scene.scale.off('resize', update);
    layer?.destroy();
    layer = null;
  };
  scene.events.once('shutdown', remove);
  return remove;
}
