/**
 * The decision sheet the linking screens share (V6-LINK-06): AU-13, AU-14 and AU-16 each keep one sheet
 * open and swap its body from step to step (§8.5: "three steps in one body, so the polling owner is
 * obvious"). An outside tap does nothing (`shadeCloses: false`); the body scrolls when a short screen
 * can't hold it, and its buttons are the focus stops (the first is focused on open).
 */
import Phaser from 'phaser';
import { Button, ScrollArea } from '../kit';
import { MButton, mtext, mw, openParchmentSheet, sheetWidth, GAP, SHEET_TITLE_H, type MButtonVariant, type ParchmentSheetHandle } from '../mosaic';
import type { UiScene } from '../mosaic/subShell';
import { measureText } from '../textfit';
import type { FontKey } from '../kit';

export const BTN_H = 24;
const TEXT = 7;

export interface BodyButton {
  label: string;
  id: string;
  variant: MButtonVariant | 'destructive';
  onClick: () => void;
  /** Off, with the reason a tap shows. */
  off?: string;
}

/** Builds one body top to bottom; `y` is where the next part goes, `w` the room. */
export class Body {
  y = 0;
  constructor(
    readonly scene: UiScene,
    readonly into: Phaser.GameObjects.Container,
    readonly w: number,
    readonly x = 0,
  ) {}

  text(s: string, font: FontKey = 'pInk', size = TEXT): Phaser.GameObjects.BitmapText {
    const tx = mtext(this.scene, this.x, this.y, s, font, { size, maxW: this.w, wrap: true });
    this.into.add(tx);
    this.y += tx.height + 5;
    return tx;
  }

  /** A string with no spaces (a link, a code), broken between characters to fit: never cut (it gets copied by eye). */
  token(s: string, font: FontKey = 'pMuted', size = 6.5): void {
    const lines: string[] = [];
    let cur = '';
    for (const ch of s) {
      if (cur && mw(cur + ch, font, size) > this.w) {
        lines.push(cur);
        cur = '';
      }
      cur += ch;
    }
    if (cur) lines.push(cur);
    this.text(lines.join('\n'), font, size);
  }

  gap(n = 4): void {
    this.y += n;
  }

  /** An object `h` tall at the current line. */
  put(obj: Phaser.GameObjects.GameObject, h: number): void {
    this.into.add(obj);
    this.y += h + GAP;
  }

  private make(b: BodyButton, x: number, w: number): Phaser.GameObjects.Container {
    const btn =
      b.variant === 'destructive'
        ? new Button(this.scene, x, this.y, w, BTN_H, { label: b.label, variant: 'destructive', id: b.id, onClick: b.onClick, disabledReason: b.off })
        : new MButton(this.scene, x, this.y, w, BTN_H, { label: b.label, variant: b.variant, id: b.id, onClick: b.onClick, disabledReason: b.off });
    if (b.off) btn.setEnabled(false, b.off);
    this.into.add(btn);
    return btn;
  }

  /** One full-width button (at most 240 wide, centred on a wide sheet). */
  button(b: BodyButton): Phaser.GameObjects.Container {
    const bw = Math.min(this.w, 240);
    const btn = this.make(b, this.x + Math.round((this.w - bw) / 2), bw);
    this.y += BTN_H + GAP;
    return btn;
  }

  /** Two buttons side by side (the second on the right, under the thumb), stacked when a label won't fit (§13.6). */
  pair(a: BodyButton, b: BodyButton): void {
    const half = Math.floor((this.w - GAP * 2) / 2);
    const fits = [a, b].every((x) => measureText(x.label.toUpperCase()) * 1.15 + 16 <= half);
    if (!fits) {
      this.button(b);
      this.button(a);
      return;
    }
    this.make(a, this.x, half);
    this.make(b, this.x + this.w - half, half);
    this.y += BTN_H + GAP;
  }
}

export interface LinkSheet {
  readonly m: ParchmentSheetHandle;
  /** Clears the body and builds it again. */
  show(build: (b: Body) => void): void;
  close(): void;
  /** Still on screen. */
  readonly live: boolean;
}

export function openLinkSheet(scene: UiScene, o: { title: string; id: string; onClose?: () => void; closeButton?: boolean }): LinkSheet {
  const sheetO = { title: o.title, w: Math.min(scene.m.VW - 16, 320), shadeCloses: false, closeButton: o.closeButton ?? true, panel: 'decision' as const, id: o.id, onClose: o.onClose };
  const w = sheetWidth(scene, sheetO);
  const h = Math.min(scene.m.VH - 16, 340);
  const m = openParchmentSheet(scene, { ...sheetO, h });
  const { x, y } = m.body;
  const bw = w - 16;
  const viewH = h - SHEET_TITLE_H - 10;
  let area: ScrollArea | null = null;
  m.c.once('destroy', () => area?.destroy());
  return {
    m,
    get live() {
      return !!m.c.scene;
    },
    show(build) {
      if (!m.c.scene) return;
      area?.destroy();
      area = new ScrollArea(scene, m.c, x, y, bw, viewH, scene.m.S);
      const b = new Body(scene, area.content, bw);
      build(b);
      area.setContentHeight(b.y + 4);
    },
    close: () => m.c.scene && m.close(),
  };
}

