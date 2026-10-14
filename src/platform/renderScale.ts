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
import { legacyColumnWidth } from '../ui/sizeClass';

const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

/** Device pixels per CSS pixel the canvas is drawn at (capped: 3x is plenty, and fill rate matters). */
export const RS = Math.max(1, Math.min(3, Math.round(dpr * 4) / 4));

/** A screen-pixel distance given in CSS px, in canvas px. */
export const px = (cssPx: number): number => cssPx * RS;

/** Camera zoom for a world zoom level in the old CSS-px units. */
export const camZoom = (units: number): number => units * RS;

/** World zoom level (old CSS-px units) of a camera zoom. */
export const zoomUnits = (zoom: number): number => zoom / RS;

/**
 * The legacy column (ADR-0013, V6-021): while a scene that has not migrated to
 * the size classes runs, the game box is the v5 column, min(W, H x 0.64) of the
 * safe area, centred in #game (which fills the safe area). A scene that opted in
 * gets the whole safe area. BaseScene switches it as each screen is built.
 */
let column = true;

/** Is the game box the v5 column right now? */
export const legacyColumn = (): boolean => column;

/** Switch the legacy column on or off; the game resizes at once, before the scene lays out. */
export function setLegacyColumn(scale: Phaser.Scale.ScaleManager, on: boolean): void {
  if (column === on) return;
  column = on;
  if (scale.getParentBounds()) scale.refresh();
}

/**
 * Make Phaser's RESIZE mode size the game from #game: the parent's CSS box,
 * narrowed to the legacy column while it is on (index.html centres the canvas
 * at `--pa-col` wide), times RS, so the game size (and the canvas backing
 * store) are in device pixels; index.html stretches the canvas back to its CSS
 * size. At RS 1 the size is not rounded, as Phaser's own measure. Call before
 * `new Phaser.Game`.
 */
export function installRenderScale(): void {
  const proto = Phaser.Scale.ScaleManager.prototype as unknown as {
    getParentBounds(this: Phaser.Scale.ScaleManager & { parent: HTMLElement | null; canvasBounds: Phaser.Geom.Rectangle }): boolean;
  };
  proto.getParentBounds = function () {
    if (!this.parent) return false;
    const r = this.parent.getBoundingClientRect();
    const cssW = column ? legacyColumnWidth(r.width, r.height) : r.width;
    const w = RS === 1 ? cssW : Math.floor(cssW * RS);
    const h = RS === 1 ? r.height : Math.floor(r.height * RS);
    if (this.parentSize.width !== w || this.parentSize.height !== h) {
      this.parent.style.setProperty('--pa-col', `${cssW}px`);
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
