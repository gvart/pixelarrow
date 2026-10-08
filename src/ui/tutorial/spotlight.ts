/**
 * Tutorial spotlight: dims the screen around a hole, draws a pulsing ring
 * round the highlighted element and blocks input outside the hole where the
 * step needs it (four tap catchers around the hole; the hole itself passes
 * touches through to what is under it). With no hole and `block`, one
 * full-screen catcher takes every tap (an info step: tap to go on).
 */
import Phaser from 'phaser';
import { uiBlocker, uiId, uiIgnore } from '../layout';
import type { UiScene } from '../widgets';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpotOpts {
  /** The lit area (UI px); null: nothing lit. */
  hole: Rect | null;
  /** Darkness of the rest, 0..1. */
  dim: number;
  /** A pulsing ring round the hole (or round this rectangle). */
  ring?: boolean | Rect;
  /** Block taps outside the hole (everywhere when there is no hole). */
  block?: boolean;
  /** A tap on the blocked part (info steps go on with it). */
  onTap?: () => void;
}

const same = (a: Rect | null, b: Rect | null) => (!a && !b) || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

export class Spotlight {
  readonly c: Phaser.GameObjects.Container;
  private scene: UiScene;
  private dim: Phaser.GameObjects.Container;
  private shades: Phaser.GameObjects.Rectangle[] = [];
  private ring: Phaser.GameObjects.Graphics;
  private zones: Phaser.GameObjects.Zone[] = [];
  private cur: SpotOpts | null = null;

  constructor(scene: UiScene, parent: Phaser.GameObjects.Container) {
    this.scene = scene;
    this.c = scene.add.container(0, 0);
    this.dim = scene.add.container(0, 0);
    this.ring = scene.add.graphics();
    this.c.add([this.dim, this.ring]);
    parent.add(this.c);
  }

  get hole(): Rect | null {
    return this.cur?.hole ?? null;
  }

  /** Light a hole (or clear with null). Cheap when nothing changed. */
  show(o: SpotOpts | null): void {
    const prev = this.cur;
    if (prev && o && same(prev.hole, o.hole) && prev.dim === o.dim && !!prev.ring === !!o.ring && !!prev.block === !!o.block && (typeof o.ring !== 'object' || (typeof prev.ring === 'object' && same(prev.ring, o.ring)))) {
      this.cur = o;
      return;
    }
    this.cur = o;
    for (const z of this.zones) z.destroy();
    this.zones = [];
    for (const r of this.shades) r.destroy();
    this.shades = [];
    this.ring.clear();
    if (!o) return;
    const { VW, VH } = this.scene.m;
    const h = o.hole;
    const parts: Rect[] = h
      ? [
          { x: 0, y: 0, w: VW, h: Math.max(0, h.y) },
          { x: 0, y: h.y + h.h, w: VW, h: Math.max(0, VH - h.y - h.h) },
          { x: 0, y: h.y, w: Math.max(0, h.x), h: h.h },
          { x: h.x + h.w, y: h.y, w: Math.max(0, VW - h.x - h.w), h: h.h },
        ].filter((r) => r.w > 0 && r.h > 0)
      : [{ x: 0, y: 0, w: VW, h: VH }];
    if (o.dim > 0) {
      for (const r of parts) {
        const sh = this.scene.add.rectangle(r.x, r.y, r.w, r.h, 0x140c08, o.dim).setOrigin(0, 0);
        this.dim.add(sh);
        this.shades.push(sh);
      }
    }
    if (o.block) {
      for (const r of parts) {
        const z = this.scene.add.zone(r.x, r.y, r.w, r.h).setOrigin(0, 0).setInteractive();
        // input catchers, not UI: only a full-screen one (an info step) hides what is under it
        if (h) uiIgnore(z);
        else uiBlocker(uiId(z, 'tut.shade'));
        z.on('pointerup', () => this.cur?.onTap?.());
        this.c.addAt(z, 0);
        this.zones.push(z);
      }
    }
  }

  /** The ring breathes. */
  update(time: number): void {
    const o = this.cur;
    this.ring.clear();
    if (!o?.ring) return;
    const h = typeof o.ring === 'object' ? o.ring : o.hole;
    if (!h) return;
    const k = (Math.sin(time / 180) + 1) / 2;
    const grow = Math.round(k * 2);
    this.ring.lineStyle(2, 0xf0c860, 0.55 + 0.45 * k);
    this.ring.strokeRoundedRect(h.x - 2 - grow, h.y - 2 - grow, h.w + 4 + grow * 2, h.h + 4 + grow * 2, 4);
    this.ring.lineStyle(1, 0xfff4d0, 0.35 * (1 - k));
    this.ring.strokeRoundedRect(h.x - 5 - grow * 2, h.y - 5 - grow * 2, h.w + 10 + grow * 4, h.h + 10 + grow * 4, 6);
  }

  destroy(): void {
    this.c.destroy();
  }
}
