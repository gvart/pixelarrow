/** Shared bits of the online scenes: text lines, buttons, the resource strip, colours. */
import Phaser from 'phaser';
import { addIcon, addPanel, addText, type FontKey } from '../../ui/kit';
import { MButton, mtext } from '../../ui/mosaic';
import type { Resources } from '../../online/rules';

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

const RES_SHORT: [keyof Resources, string][] = [
  ['gold', 'G'],
  ['food', 'F'],
  ['wood', 'W'],
  ['bronze', 'B'],
  ['recruits', 'R'],
];

export function resourceLine(r: Resources, plus = false): string {
  return RES_SHORT.map(([k, s]) => `${s}${plus ? '+' : ''}${k === 'recruits' ? Math.floor(r[k] * 10) / 10 : Math.floor(r[k])}`).join(' ');
}

/** Resources and energy in a strip at the top of a scene. */
export function addResourceBar(scene: Phaser.Scene, ui: Phaser.GameObjects.Container, x: number, y: number, w: number, r: Resources, energy: number, energyMax: number): void {
  ui.add(addPanel(scene, x, y, w, 14, 'inset'));
  ui.add(addIcon(scene, x + 2, y + 1, 'wargold'));
  ui.add(addText(scene, x + 16, y + 3, resourceLine(r).slice(1), 'ink'));
  ui.add(addText(scene, x + w - 4, y + 3, `E${Math.floor(energy)}/${energyMax}`, energy < 10 ? 'red' : 'ink', 1));
}

export const MINE_COLOR = 0x2f6fd0;
export const CLAN_COLOR = 0x3fae4a;

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
