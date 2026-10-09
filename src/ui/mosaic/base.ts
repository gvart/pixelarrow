/**
 * Shared pieces of the v4 "Mosaic & Parchment" components (docs/redesign/V4_SPEC.md):
 * cached surface textures, text that fits, a press animation with the kit's
 * tap / long-press rules, and the red count badge.
 */
import Phaser from 'phaser';
import { renderMosaic, type MosaicStyle } from '../../art/mosaicUi';
import type { Face } from '../../art/vectorFont';
import { LINE_H } from '../../art/vectorFont';
import { SHADOW_FONTS, addText, panelK, tappable, type FontKey } from '../kit';
import { uiFrame } from '../layout';
import { motion } from '../motion';
import { MOSAIC, ACCENT } from '../tokens';
import { ellipsize, measureText } from '../textfit';
import { showTooltip } from '../widgets';

type C = Phaser.GameObjects.Container;

/** Smallest touch target in UI px (44 pt at the smallest UI scale, S = 2). */
export const TAP = 22;
/** Gap between neighbouring touch targets in UI px (the layout check wants 4 pt). */
export const GAP = 3;

const ROMAN_FONTS: ReadonlySet<FontKey> = new Set<FontKey>(['rInk', 'rCream', 'rGold', 'rOff']);

/** The vector face a font key is drawn in. */
export function faceOf(font: FontKey): Face {
  return ROMAN_FONTS.has(font) ? 'roman' : font === 'head' || font === 'headL' ? 'head' : 'body';
}

/** Width in UI px of `str` in `font` at `size`. */
export function mw(str: string, font: FontKey, size = 7): number {
  return measureText(str, SHADOW_FONTS.has(font), size, faceOf(font));
}

/** `str` shortened with "…" to fit `maxW` UI px. */
export function fit(str: string, font: FontKey, size: number, maxW: number): string {
  return ellipsize(str, Math.max(0, maxW), SHADOW_FONTS.has(font), size, faceOf(font));
}

/** Y of a one-line text of `size` so it is centred in a box of height `h`. */
export function midY(h: number, size = 7): number {
  return Math.round((h - (LINE_H * size) / 7) / 2);
}

export interface TextOpts {
  size?: number;
  align?: 0 | 0.5 | 1;
  /** Shorten with "…" to this width. */
  maxW?: number;
  /** The component the text must stay inside (layout check): box `w` x `h`. */
  box?: { owner: C; w: number; h: number };
}

/** A fitted one-line text (drawn at `x`, `y` with the given alignment). */
export function mtext(scene: Phaser.Scene, x: number, y: number, str: string, font: FontKey, o: TextOpts = {}): Phaser.GameObjects.BitmapText {
  const size = o.size ?? 7;
  const s = o.maxW !== undefined ? fit(str, font, size, o.maxW) : str;
  const t = addText(scene, x, y, s, font, o.align ?? 0);
  if (size !== 7) t.setFontSize(size);
  if (o.box) uiFrame(t, o.box.owner, o.box.w, o.box.h);
  return t;
}

/** Texture key of a surface (cached by size and style; `panel_` so the big ones are swept when unused). */
export function mosaicTexture(scene: Phaser.Scene, w: number, h: number, style: MosaicStyle): string {
  w = Math.max(4, Math.round(w));
  h = Math.max(4, Math.round(h));
  const K = panelK(scene);
  const key = `panel_mosaic_${style}_${w}x${h}@${K}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, renderMosaic(style, w, h, K))!.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}

/** An image of a surface, scaled to UI px (origin top-left). */
export function mosaicImage(scene: Phaser.Scene, x: number, y: number, w: number, h: number, style: MosaicStyle): Phaser.GameObjects.Image {
  return scene.add.image(x, y, mosaicTexture(scene, w, h, style)).setOrigin(0, 0).setScale(1 / panelK(scene));
}

export interface PressOpts {
  /** The part that shrinks on press (about its own origin: centre it on the button). */
  face?: C;
  w: number;
  h: number;
  onTap: () => void;
  /** Surface swap while held (the pressed look). */
  down?: () => void;
  up?: () => void;
  /** Long-press text. */
  tip?: string;
  /** Not available: a tap says `reason` instead of acting. */
  disabled?: () => string | undefined;
  /** Shrink the touch area by this much on every side (so neighbours keep a gap). */
  inset?: number;
  /** The hit area as {x, y, w, h} in the component's own coordinates (default: the whole w x h). */
  hit?: { x: number; y: number; w: number; h: number };
}

/** Makes `obj` (a Container of size w x h) a button: hit area, press look, tap and long-press. */
export function makePressable(obj: C, o: PressOpts): void {
  const hit = o.hit ?? { x: o.inset ?? 0, y: o.inset ?? 0, w: o.w - (o.inset ?? 0) * 2, h: o.h - (o.inset ?? 0) * 2 };
  obj.setSize(o.w, o.h);
  // Phaser offsets a container's hit area by half its size
  obj.setInteractive(new Phaser.Geom.Rectangle(hit.x + o.w / 2, hit.y + o.h / 2, hit.w, hit.h), Phaser.Geom.Rectangle.Contains);
  const scene = obj.scene;
  const press = (on: boolean) => {
    if (!obj.scene) return;
    const blocked = o.disabled?.();
    if (on && blocked) return;
    if (on) o.down?.();
    else o.up?.();
    o.face?.setScale(on && !motion.reduced ? 0.97 : 1);
  };
  obj.on('pointerdown', () => press(true));
  obj.on('pointerup', () => press(false));
  obj.on('pointerout', () => press(false));
  tappable(obj, null, () => {
    const why = o.disabled?.();
    if (why) showTooltip(scene, why, obj);
    else o.onTap();
  }, () => o.disabled?.() ?? o.tip);
}

/** A small red count bubble (alerts and counts only; red means "look here"). */
export class MBadge extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number, n: number | string) {
    super(scene, Math.round(x), Math.round(y));
    const s = typeof n === 'number' ? (n > 99 ? '99+' : `${n}`) : n;
    const w = Math.max(10, mw(s, 'onAccent', 6) + 6);
    const g = scene.add.graphics();
    g.fillStyle(0x1a0d06, 1);
    g.fillRoundedRect(-w / 2 - 1, -6.5, w + 2, 13, 3);
    g.fillStyle(ACCENT.dangerFill, 1);
    g.fillRoundedRect(-w / 2, -5.5, w, 11, 2.4);
    g.lineStyle(0.6, MOSAIC.goldHi, 0.8);
    g.strokeRoundedRect(-w / 2, -5.5, w, 11, 2.4);
    const txt = addText(scene, 0, -3.6, s, 'onAccent', 0.5).setFontSize(6);
    uiFrame(txt, this, 40, 14, -20, -7);
    this.add([g, txt]);
    scene.add.existing(this);
  }
}

/** A container centred on a w x h component, so a press scales it about the middle; `put` adds an object given in the component's own coordinates. */
export function centeredFace(scene: Phaser.Scene, w: number, h: number): C {
  return scene.add.container(w / 2, h / 2);
}

export function put<T extends Phaser.GameObjects.GameObject & { x: number; y: number }>(face: C, w: number, h: number, obj: T): T {
  obj.x -= w / 2;
  obj.y -= h / 2;
  face.add(obj);
  return obj;
}
