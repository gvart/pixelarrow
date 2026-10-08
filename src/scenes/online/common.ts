/** Shared bits of the online scenes: modals, the resource strip, colours. */
import Phaser from 'phaser';
import { Button, addIcon, addPanel, addScroll, addText, type FontKey } from '../../ui/kit';
import type { Resources } from '../../online/rules';

export interface Modal {
  c: Phaser.GameObjects.Container;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Parchment modal over a dark shade, centred in the UI root. */
export function openModal(scene: Phaser.Scene, ui: Phaser.GameObjects.Container, VW: number, VH: number, h: number, title: string, w = Math.min(VW - 16, 184)): Modal {
  const c = scene.add.container(0, 0);
  ui.add(c);
  c.add(scene.add.rectangle(0, 0, VW, VH, 0x000000, 0.55).setOrigin(0, 0).setInteractive());
  const x = Math.round((VW - w) / 2);
  const y = Math.max(4, Math.round((VH - h) / 2));
  addScroll(scene, c, x, y, w, h);
  c.add(addText(scene, VW / 2, y + 12, title, 'red', 0.5));
  return { c, x, y, w, h };
}

/** Centred lines of text; returns the y after the last line. */
export function lines(scene: Phaser.Scene, c: Phaser.GameObjects.Container, cx: number, y: number, text: string[], font: FontKey = 'ink', maxW = 0): number {
  for (const t of text) {
    const o = addText(scene, cx, y, t, font, 0.5, maxW);
    c.add(o);
    y += Math.max(10, o.height + 2);
  }
  return y;
}

export function button(scene: Phaser.Scene, c: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number, label: string, onClick: () => void, opts: { icon?: string; sel?: boolean; off?: boolean } = {}): Button {
  const b = new Button(scene, x, y, w, h, { label, icon: opts.icon, style: opts.off ? 'buttonOff' : opts.sel ? 'buttonSel' : 'button', onClick });
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
  ui.add(addIcon(scene, x + 2, y + 1, 'coin'));
  ui.add(addText(scene, x + 16, y + 3, resourceLine(r).slice(1), 'ink'));
  ui.add(addText(scene, x + w - 4, y + 3, `E${Math.floor(energy)}/${energyMax}`, energy < 10 ? 'red' : 'ink', 1));
}

export const MINE_COLOR = 0x2f6fd0;
export const CLAN_COLOR = 0x3fae4a;

/** A stable colour for another player's land. */
export function ownerColor(id: number): number {
  const palette = [0xc0392b, 0x8e44ad, 0xd35400, 0x9b2335, 0xb8860b, 0x6d4c41, 0xad1457, 0x5d6d7e];
  return palette[Math.abs(id * 2654435761) % palette.length];
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
