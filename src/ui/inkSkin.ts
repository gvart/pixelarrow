/**
 * Ink on parchment for the shared overlays (UI v4, docs/redesign/V4_SPEC.md).
 *
 * Screens and their sheets are built from components written for dark
 * surfaces: light text keys ('ink', 'sec', 'head'...) and dark `panel_*`
 * textures. A sheet, modal or parchment card is parchment now, so every
 * object added to it is re-skinned as it arrives: light-on-dark font keys
 * become their ink forms, dark panels become parchment wells and cards, and
 * the scroll-list edge fades melt into parchment. Call sites need no change.
 *
 * `inkify(container)` skins what the container holds and patches its `add`
 * (and the add of every container inside it), so content built after the call
 * is skinned too. It is idempotent: the ink fonts and the v4 surfaces map to
 * themselves. A component that draws its own dark surface (a stone chip)
 * calls `ownSkin(obj)` and is left alone, with everything inside it.
 */
import Phaser from 'phaser';
import type { MosaicStyle } from '../art/mosaicUi';
import { MOSAIC } from './tokens';
import { mosaicPanelTexture, panelK, type FontKey } from './kit';

/** Light-on-dark font keys -> the ink font that reads on parchment. */
const FONT_INK: Record<string, string> = {
  font_ink: 'font_pInk',
  font_sec: 'font_pSec',
  font_muted: 'font_pMuted',
  font_dim: 'font_pMuted',
  font_good: 'font_pGood',
  font_glory: 'font_pGood',
  font_red: 'font_pBad',
  font_bad: 'font_pBad',
  font_power: 'font_pBad',
  font_head: 'font_hInk',
  font_headL: 'font_hInk',
  font_title: 'font_hInk',
  font_gold: 'font_pGold',
  font_reward: 'font_pGold',
  font_stars: 'font_pGold',
  font_wargold: 'font_pGold',
  font_xp: 'font_pXp',
  font_premium: 'font_pPremium',
  // fonts.ts (item names in their rarity colour, accents)
  font_blue: 'font_pXp',
  font_bronze: 'font_pGold',
  font_goodL: 'font_pGood',
  font_redL: 'font_pBad',
};
for (const r of ['common', 'uncommon', 'rare', 'epic', 'legendary']) {
  FONT_INK[`font_rar_${r}`] = `font_rarI_${r}`;
  FONT_INK[`font_rarL_${r}`] = `font_rarI_${r}`;
}

/** The ink form of a light-on-dark font key ('ink' -> 'pInk'); keys that already read on parchment come back unchanged. */
export function inkFontKey(font: FontKey): FontKey {
  return (FONT_INK[`font_${font}`]?.slice(5) as FontKey | undefined) ?? font;
}

/** v3 dark panel styles -> the parchment surface that replaces them. */
const PANEL_INK: Record<string, MosaicStyle> = {
  parch: 'parchment',
  scroll: 'parchment',
  card: 'parchment',
  cardRaised: 'parchment',
  cardSel: 'parchmentSel',
  slotSel: 'parchmentSel',
  tabSel: 'parchmentSel',
  inset: 'parchmentWell',
  slot: 'parchmentWell',
  well: 'parchmentWell',
  track: 'parchmentWell',
  tab: 'parchmentWell',
  dark: 'parchmentWell',
  cardLocked: 'parchmentWell',
  thumb: 'trackSel',
  // rows drawn with the button faces: a plain one is parchment, the picked one terracotta, a lit one bronze
  button: 'parchment',
  buttonDown: 'parchmentSel',
  buttonSel: 'btnPrimary',
  buttonSelDown: 'btnPrimaryDown',
  buttonOn: 'btnBronzeOn',
  buttonOnDown: 'btnBronzeOn',
  buttonOff: 'parchmentWell',
  buttonDanger: 'btnDanger',
  buttonDangerDown: 'btnDangerDown',
  buttonBuy: 'btnBuy',
  buttonBuyDown: 'btnBuyDown',
};

const PANEL_KEY = /^panel_([A-Za-z]+)_(\d+)x(\d+)@(\d+)$/;
const FADE_KEY = /^fade_[0-9a-f]+_(\d+)x(\d+)@(\d+)$/;

/** Marks an object whose subtree draws its own surface: inkify leaves it alone. */
export function ownSkin<T extends Phaser.GameObjects.GameObject>(obj: T): T {
  (obj as unknown as { __ownSkin?: boolean }).__ownSkin = true;
  return obj;
}

/** A vertical gradient from `color` (opaque, top) to transparent (bottom), w x h UI px, cached per size (the scroll hint's edge fade). */
export function fadeTexture(scene: Phaser.Scene, w: number, h: number, color: number): string {
  const K = panelK(scene);
  const key = `fade_${color.toString(16)}_${Math.round(w)}x${Math.round(h)}@${K}`;
  if (!scene.textures.exists(key)) {
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(w * K));
    c.height = Math.max(2, Math.round(h * K));
    const g = c.getContext('2d')!;
    const r = (color >> 16) & 255;
    const gg = (color >> 8) & 255;
    const bb = color & 255;
    const grad = g.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, `rgba(${r},${gg},${bb},1)`);
    grad.addColorStop(0.45, `rgba(${r},${gg},${bb},0.75)`);
    grad.addColorStop(1, `rgba(${r},${gg},${bb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    scene.textures.addCanvas(key, c)!.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
  return key;
}

/** The ink texture key standing in for a dark one, or the key itself. */
function inkTexture(scene: Phaser.Scene, key: string): string {
  const fade = FADE_KEY.exec(key);
  if (fade) return fadeTexture(scene, +fade[1], +fade[2], MOSAIC.parch);
  const m = PANEL_KEY.exec(key);
  const style = m && PANEL_INK[m[1]];
  return style ? mosaicPanelTexture(scene, +m[2], +m[3], style) : key;
}

// Phaser objects are patched per instance below; their methods are not typed for that.
type Patchable = Record<string, (...a: unknown[]) => unknown>;

function skinText(t: Phaser.GameObjects.BitmapText): void {
  const apply = (font: string) => FONT_INK[font] ?? font;
  const inkFont = apply(t.font);
  if (inkFont !== t.font) t.setFont(inkFont);
  const p = t as unknown as Patchable;
  const setFont = p.setFont;
  p.setFont = (...a: unknown[]) => {
    if (typeof a[0] === 'string') a[0] = apply(a[0]);
    return setFont.apply(t, a);
  };
}

function skinImage(img: Phaser.GameObjects.Image): void {
  const scene = img.scene;
  const map = (key: string) => inkTexture(scene, key);
  const key = img.texture?.key;
  if (!key) return;
  const mapped = map(key);
  if (mapped !== key) img.setTexture(mapped);
  const p = img as unknown as Patchable;
  const setTexture = p.setTexture;
  p.setTexture = (...a: unknown[]) => {
    if (typeof a[0] === 'string') a[0] = map(a[0]);
    return setTexture.apply(img, a);
  };
}

/** Skin `obj` and everything in it, and everything added to it later. */
export function inkify(obj: Phaser.GameObjects.GameObject): void {
  const o = obj as unknown as { __ownSkin?: boolean; __inked?: boolean };
  if (o.__ownSkin || o.__inked) return;
  o.__inked = true;
  if (obj instanceof Phaser.GameObjects.BitmapText) {
    skinText(obj);
  } else if (obj instanceof Phaser.GameObjects.Image) {
    skinImage(obj);
  } else if (obj instanceof Phaser.GameObjects.Container) {
    for (const child of obj.list) inkify(child);
    const p = obj as unknown as Patchable;
    for (const name of ['add', 'addAt']) {
      const orig = p[name];
      p[name] = (...a: unknown[]) => {
        const r = orig.apply(obj, a);
        const first = a[0];
        for (const child of Array.isArray(first) ? first : [first]) if (child instanceof Phaser.GameObjects.GameObject) inkify(child);
        return r;
      };
    }
  }
}
