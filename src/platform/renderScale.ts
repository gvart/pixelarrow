/**
 * Render scale: the canvas is drawn at device pixels (CSS px x RS) so vector
 * text and smooth UI shapes stay sharp on high-density phones; the pixel-art
 * world keeps its look because world cameras zoom by RS too.
 *
 * Units after this: `scene.scale.width/height` and pointer coordinates are
 * device px. The UI kit's S (src/ui/kit.ts uiMetrics) already includes RS, so
 * layout in UI px is unchanged. Code with a raw screen-pixel constant (a drag
 * threshold, a hit radius) multiplies it by RS (`px()`); code choosing a world
 * camera zoom works in "zoom units" (1 = the old 1x) via `camZoom()` /
 * `zoomUnits()`.
 */
import Phaser from 'phaser';

/**
 * Device pixels per CSS pixel for a screen of `dpr`: quarter steps, at most 3x (fill rate), and at most 2x
 * on a phone or tablet. Every procedural texture (fonts, icons, panels) is drawn at this scale, so texture
 * memory grows with its square: about 285 MB of canvases by the Army screen at 3x against 140 MB at 2x.
 * Inside Telegram on iOS the first is past the WebView's budget: WebKit kills the page, reloads it once
 * (the app comes back on the menu) and leaves a second crash within 30 s on a black screen.
 */
export function renderScaleFor(dpr: number, mobile: boolean): number {
  return Math.max(1, Math.min(mobile ? 2 : 3, Math.round((dpr || 1) * 4) / 4));
}

/** A phone or tablet (iPadOS reports a Mac with touch). */
export function isMobileDevice(ua: string, maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod|Android/i.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
}

const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
const mobile = typeof navigator !== 'undefined' && isMobileDevice(navigator.userAgent ?? '', navigator.maxTouchPoints ?? 0);

/** Device pixels per CSS pixel the canvas is drawn at (renderScaleFor). */
export const RS = renderScaleFor(dpr, mobile);

/** A screen-pixel distance given in CSS px, in canvas px. */
export const px = (cssPx: number): number => cssPx * RS;

/** Camera zoom for a world zoom level in the old CSS-px units. */
export const camZoom = (units: number): number => units * RS;

/** World zoom level (old CSS-px units) of a camera zoom. */
export const zoomUnits = (zoom: number): number => zoom / RS;

/**
 * Make Phaser's RESIZE mode size the canvas at RS x its parent: the parent's
 * CSS size is reported multiplied by RS, so the game size (and the canvas
 * backing store) are in device pixels; index.html stretches the canvas back
 * to the parent's CSS size. Call before `new Phaser.Game`.
 */
export function installRenderScale(): void {
  if (RS === 1) return;
  const proto = Phaser.Scale.ScaleManager.prototype as unknown as {
    getParentBounds(this: Phaser.Scale.ScaleManager & { parent: HTMLElement | null; canvasBounds: Phaser.Geom.Rectangle }): boolean;
  };
  proto.getParentBounds = function () {
    if (!this.parent) return false;
    const r = this.parent.getBoundingClientRect();
    const w = Math.floor(r.width * RS);
    const h = Math.floor(r.height * RS);
    if (this.parentSize.width !== w || this.parentSize.height !== h) {
      this.parentSize.setSize(w, h);
      return true;
    }
    if (this.canvas) {
      const c = this.canvas.getBoundingClientRect();
      if (c.x !== this.canvasBounds.x || c.y !== this.canvasBounds.y) return true;
    }
    return false;
  };
}
