/** Shared bits of the online scenes: text lines, buttons, durations. */
import Phaser from 'phaser';
import { addText, type FontKey } from '../../ui/kit';
import { MButton, mtext } from '../../ui/mosaic';

/** Centred lines of text; returns the y after the last line. */
export function lines(scene: Phaser.Scene, c: Phaser.GameObjects.Container, cx: number, y: number, text: string[], font: FontKey = 'pInk', maxW = 0): number {
  for (const t of text) {
    const o = maxW ? addText(scene, cx, y, t, font, 0.5, maxW) : mtext(scene, cx, y, t, font, { align: 0.5 });
    c.add(o);
    y += Math.max(10, o.height + 2);
  }
  return y;
}

export function button(scene: Phaser.Scene, c: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number, label: string, onClick: () => void, opts: { icon?: string; sel?: boolean; off?: boolean } = {}): MButton {
  const b = new MButton(scene, x, y, w, h, { label, icon: opts.icon, variant: opts.off ? 'disabled' : opts.sel ? 'primary' : 'secondary', onClick });
  c.add(b);
  return b;
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
