/**
 * The settings controls on parchment: `Toggle` (a switch) and `Stepper`
 * (− value +). Both are drawn for the parchment sheet they sit on (bronze
 * track, parchment well), 22 UI px tall (a 44 pt target).
 */
import Phaser from 'phaser';
import { Button, addText, mosaicPanelImage, tappable } from '../kit';
import { focusGroup } from '../focusRing';
import type { Dir } from '../input/focus';
import { uiFrame, uiId } from '../layout';
import { tweenTo } from '../motion';
import { MOSAIC } from '../tokens';
import { showTooltip } from '../widgets';

export interface ToggleOpts {
  on: boolean;
  onChange: (on: boolean) => void;
  /** What it switches (scripts and the long-press tip). */
  label: string;
  id?: string;
  /** Cannot be switched now, and why (dimmed; a tap says why). */
  disabled?: string;
}

/** A switch (34 x 22 target): a knob that slides over a lit track when on. */
export class Toggle extends Phaser.GameObjects.Container {
  readonly w = 34;
  readonly h = 22;
  readonly opts: { label: string };
  private g: Phaser.GameObjects.Graphics;
  private isOn: boolean;
  private k: { x: number };

  constructor(scene: Phaser.Scene, x: number, y: number, o: ToggleOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.opts = { label: o.label };
    this.isOn = o.on;
    this.k = { x: o.on ? 1 : 0 };
    this.g = scene.add.graphics();
    this.add(this.g);
    this.draw();
    this.setSize(this.w, this.h);
    this.setInteractive(new Phaser.Geom.Rectangle(this.displayOriginX, this.displayOriginY, this.w, this.h), Phaser.Geom.Rectangle.Contains);
    uiId(this, o.id ?? `toggle:${o.label}`);
    if (o.disabled) this.setAlpha(0.45);
    tappable(this, null, () => {
      if (o.disabled) {
        showTooltip(scene, o.disabled, this);
        return;
      }
      this.isOn = !this.isOn;
      tweenTo(scene, this.k, { x: this.isOn ? 1 : 0 }, 140, { onUpdate: () => this.draw() });
      this.draw();
      o.onChange(this.isOn);
    });
    scene.add.existing(this);
  }

  get value(): boolean {
    return this.isOn;
  }

  private draw(): void {
    const g = this.g;
    if (!g.active) return;
    const tx = 2;
    const ty = 4;
    const tw = 30;
    const th = 14;
    g.clear();
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(tx, ty + 1, tw, th, 7);
    g.fillStyle(this.isOn ? MOSAIC.bronze : MOSAIC.stone1, 1);
    g.fillRoundedRect(tx, ty, tw, th, 7);
    g.lineStyle(1, this.isOn ? MOSAIC.goldHi : MOSAIC.meanderLo, this.isOn ? 0.95 : 0.9);
    g.strokeRoundedRect(tx + 0.5, ty + 0.5, tw - 1, th - 1, 6.5);
    const kx = tx + 7 + this.k.x * (tw - 14);
    g.fillStyle(0x000000, 0.5);
    g.fillCircle(kx + 0.5, ty + 7.8, 5.6);
    g.fillStyle(this.isOn ? MOSAIC.cream : MOSAIC.slabHi, 1);
    g.fillCircle(kx, ty + 7, 5.4);
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(kx - 1.5, ty + 5.2, 1.8);
  }
}

export interface StepperOpts {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  /** What it sets (tips and ids). */
  label: string;
  id?: string;
  /** Text of the value (default the number). */
  format?: (v: number) => string;
}

/** − value + (70 x 22): the ends switch off at the limits and say so. */
export class Stepper extends Phaser.GameObjects.Container {
  readonly w = 70;
  readonly h = 22;
  private v: number;
  private txt: Phaser.GameObjects.BitmapText;
  private minus: Button;
  private plus: Button;

  constructor(scene: Phaser.Scene, x: number, y: number, private o: StepperOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.v = o.value;
    this.add(mosaicPanelImage(scene, 22, 2, 26, 18, 'parchmentWell'));
    this.txt = addText(scene, 35, 7, '', 'pInk', 0.5);
    uiFrame(this.txt, this, this.w, this.h);
    this.add(this.txt);
    const id = o.id ?? o.label;
    this.minus = new Button(scene, 0, 0, 22, 22, { label: '-', tip: o.label, id: `${id}.down`, onClick: () => this.step(-1) });
    this.plus = new Button(scene, 48, 0, 22, 22, { label: '+', tip: o.label, id: `${id}.up`, onClick: () => this.step(1) });
    this.add([this.minus, this.plus]);
    // a focused stepper takes Left/Right itself (input-v6.md §4.3); Tab passes it as one stop
    const adjust = (d: Dir) => (d === 'left' || d === 'right' ? (this.step(d === 'left' ? -1 : 1), true) : false);
    focusGroup(this.minus, this, adjust);
    focusGroup(this.plus, this, adjust);
    this.refresh();
    scene.add.existing(this);
  }

  private step(d: number): void {
    const n = Math.max(this.o.min, Math.min(this.o.max, this.v + d));
    if (n === this.v) return;
    this.v = n;
    this.refresh();
    this.o.onChange(n);
  }

  private refresh(): void {
    this.txt.setText(this.o.format ? this.o.format(this.v) : `${this.v}`);
    this.minus.setEnabled(this.v > this.o.min, `${this.o.label}: ${this.o.format ? this.o.format(this.o.min) : this.o.min}`);
    this.plus.setEnabled(this.v < this.o.max, `${this.o.label}: ${this.o.format ? this.o.format(this.o.max) : this.o.max}`);
  }
}
