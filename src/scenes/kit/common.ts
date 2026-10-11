/**
 * Shared pieces of the Kit's v5 pages (story F-05): the scene type they build on, a cursor that lays
 * parts down a scroll area, and the static "pressed" sample of a control.
 */
import Phaser from 'phaser';
import { longPress, type ScrollArea, type UIMetrics } from '../../ui/kit';
import { motion } from '../../ui/motion';
import { SECTION_TITLE_H, SectionTitle, mtext } from '../../ui/mosaic';
import { TEXT_MIN, lineHeight } from '../../ui/tokens';

export type C = Phaser.GameObjects.Container;
export type KitScene = Phaser.Scene & { m: UIMetrics; ui: C };

/** Space between parts on a page, UI px (the layout check wants 4 pt between touch targets). */
export const G = 4;

/** Lays parts down `area.content` (`w` wide) from the top; `done()` sets the content height. */
export class Cursor {
  y = 2;
  readonly c: C;

  constructor(readonly scene: KitScene, readonly area: ScrollArea, readonly w: number) {
    this.c = area.content;
  }

  add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.c.add(o);
    return o;
  }

  /** A section title (Cinzel caps, a rule under it). */
  title(text: string): void {
    if (this.y > 2) this.y += 4;
    // Cinzel is set in capitals only (art bible 7.2)
    this.add(new SectionTitle(this.scene, 0, this.y, this.w, text.toUpperCase(), { size: 8 }));
    this.y += SECTION_TITLE_H + 2;
  }

  /** A caption line in secondary ink (wraps: it explains what the reader sees). */
  note(text: string, font: 'pSec' | 'pInk' | 'pBad' | 'pGood' = 'pSec'): void {
    const t = this.add(mtext(this.scene, 0, this.y, text, font, { size: TEXT_MIN, maxW: this.w, wrap: true }));
    this.y += Math.ceil(t.height || lineHeight(TEXT_MIN)) + 2;
  }

  done(): void {
    this.area.setContentHeight(this.y + 6);
  }
}

/**
 * Shows a control in its pressed state, as a finger held on it would: its own `pointerdown` handler
 * swaps the surface and sinks the face. The long-press tip is kept off (no timer starts), and the
 * pointer sits far away, so a real tap later still works and the next pointerout lets go.
 */
export function holdDown(obj: Phaser.GameObjects.GameObject): void {
  const show = longPress.show;
  const reduced = motion.reduced;
  longPress.show = null;
  // the Reduce-motion press (surface swap and the 1 px sink, no 0.97 shrink): a shrunk label would read
  // as under the text floor in the layout check, and the held look is the same either way
  motion.reduced = true;
  obj.emit('pointerdown', { x: -1e5, y: -1e5, isDown: true });
  motion.reduced = reduced;
  longPress.show = show;
}
