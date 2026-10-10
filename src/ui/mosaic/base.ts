/**
 * Shared pieces of the v4 "Mosaic & Parchment" components (docs/redesign/V4_SPEC.md):
 * cached surface textures, text that fits, a press animation with the kit's
 * tap / long-press rules, and the red count badge.
 */
import Phaser from 'phaser';
import { renderMosaic, type MosaicStyle } from '../../art/mosaicUi';
import type { Face } from '../../art/vectorFont';
import { LINE_H } from '../../art/vectorFont';
import { SHADOW_FONTS, addText, fitCinzel, panelK, tappable, type FontKey } from '../kit';
import { uiFrame } from '../layout';
import { motion } from '../motion';
import { MOSAIC, TEXT_MIN } from '../tokens';
import { ellipsize, measureText } from '../textfit';
import { showTooltip } from '../widgets';
import { badgeText, wrapWords } from './policy';

export { badgeText, wrapWords };

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
  /** Shorten with "…" to this width (or, with `wrap`, the line width). */
  maxW?: number;
  /** A must-show fact (audit G14): wrap onto more lines at `maxW`, never shorten with "…". */
  wrap?: boolean;
  /** The component the text must stay inside (layout check): box `w` x `h`. */
  box?: { owner: C; w: number; h: number };
}

/** A fitted one-line text (drawn at `x`, `y` with the given alignment). */
export function mtext(scene: Phaser.Scene, x: number, y: number, str: string, font: FontKey, o: TextOpts = {}): Phaser.GameObjects.BitmapText {
  let size = o.size ?? 7;
  let face = font;
  let s = str;
  if (o.maxW !== undefined && o.wrap) s = wrapWords(str, o.maxW, (x) => mw(x, font, size)).join('\n');
  else if (o.maxW !== undefined) {
    if (ROMAN_FONTS.has(font)) {
      // a Cinzel text that does not fit: smaller first (down to 6.5, A11Y-09), then the same words in Inter, then cut
      const sizes: number[] = [];
      for (let z = size; z >= TEXT_MIN; z -= 0.5) sizes.push(z);
      const fl = fitCinzel(str, font, o.maxW, sizes.length ? sizes : [size], (x) => x);
      ({ text: s, font: face, size } = fl);
    } else s = fit(str, font, size, o.maxW);
  }
  const t = addText(scene, x, y, s, face, o.align ?? 0);
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

/**
 * The count badge: an alert-red disc with a cream count and a cream ring (red alone on stone is 2.08:1, art
 * bible 4.3). Counts of actionable things only (`badgeText`); a non-number is a small dot. Draws nothing for 0.
 */
export class MBadge extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number, n: number | string) {
    super(scene, Math.round(x), Math.round(y));
    const s = badgeText(n);
    const g = scene.add.graphics();
    this.add(g);
    scene.add.existing(this);
    if (s === null) {
      // nothing to act on: draw nothing (a clear 1 px box keeps the parent's bounds right)
      this.add(scene.add.rectangle(0, 0, 1, 1, 0, 0));
      return;
    }
    if (s === '') {
      // a dot: ring, then the disc
      g.fillStyle(0x1a0d06, 0.9);
      g.fillCircle(0, 0, 4.6);
      g.fillStyle(MOSAIC.cream, 1);
      g.fillCircle(0, 0, 3.8);
      g.fillStyle(MOSAIC.alert, 1);
      g.fillCircle(0, 0, 2.9);
      // Graphics have no bounds: a clear box of the dot's size keeps the parent's getBounds() right (scripts tap by it)
      this.add(scene.add.rectangle(0, 0, 9, 9, 0, 0));
      return;
    }
    const w = Math.max(11, mw(s, 'onAccent', TEXT_MIN) + 6);
    g.fillStyle(0x1a0d06, 1);
    g.fillRoundedRect(-w / 2 - 1.5, -7, w + 3, 14, 4);
    g.fillStyle(MOSAIC.cream, 1);
    g.fillRoundedRect(-w / 2 - 0.8, -6.3, w + 1.6, 12.6, 3.4);
    g.fillStyle(MOSAIC.alert, 1);
    g.fillRoundedRect(-w / 2, -5.5, w, 11, 2.8);
    const txt = addText(scene, 0, -3.9, s, 'onAccent', 0.5).setFontSize(TEXT_MIN);
    uiFrame(txt, this, 40, 14, -20, -7);
    this.add(txt);
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
