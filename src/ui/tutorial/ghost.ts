/**
 * The ghost hand: a pale pointing hand that demonstrates a gesture on a loop
 * (a press ring, the finger travelling along a path with rests, a dotted trail,
 * a lift), or two hands for a pinch. Positions are UI pixels; the script is
 * asked again on every loop, so it follows the camera and the men.
 */
import Phaser from 'phaser';
import { HAND_TIP, renderHand, renderTouchRing } from '../../art/narrator';
import type { UiScene } from '../widgets';

export interface Pt {
  x: number;
  y: number;
}

export type GhostScript =
  /** One finger: press at pts[0], travel through the rest; rest[i] = ms to rest at pts[i]. */
  | { kind: 'drag'; pts: Pt[]; rest?: number[] }
  | { kind: 'tap'; at: Pt }
  /** Two fingers spreading from the centre (d0 -> d1 apart). */
  | { kind: 'pinch'; at: Pt; d0: number; d1: number };

/** Speed of the demonstrated finger (UI px per second). */
const SPEED = 55;
const PRESS = 320;
const LIFT = 380;
const IDLE = 700;

interface Seg {
  a: Pt;
  b: Pt;
  t0: number;
  t1: number;
}

export function ensureGhostTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists('ghost_hand')) scene.textures.addCanvas('ghost_hand', renderHand().toCanvas());
  if (!scene.textures.exists('ghost_ring')) scene.textures.addCanvas('ghost_ring', renderTouchRing().toCanvas());
}

export class GhostHand {
  readonly c: Phaser.GameObjects.Container;
  private hands: Phaser.GameObjects.Image[];
  private rings: Phaser.GameObjects.Image[];
  private trail: Phaser.GameObjects.Graphics;
  private source: (() => GhostScript | null) | null = null;
  private script: GhostScript | null = null;
  private segs: Seg[] = [];
  private len = 0;
  private start = 0;

  constructor(scene: UiScene, parent: Phaser.GameObjects.Container) {
    ensureGhostTextures(scene);
    this.c = scene.add.container(0, 0);
    this.trail = scene.add.graphics();
    this.rings = [0, 1].map(() => scene.add.image(0, 0, 'ghost_ring').setVisible(false));
    this.hands = [0, 1].map(() => scene.add.image(0, 0, 'ghost_hand').setOrigin(HAND_TIP.x / 14, HAND_TIP.y / 18).setScale(2).setVisible(false));
    this.c.add([this.trail, ...this.rings, ...this.hands]);
    parent.add(this.c);
    this.c.setVisible(false);
  }

  play(source: () => GhostScript | null): void {
    this.source = source;
    this.script = null;
    this.start = -1;
    this.c.setVisible(true);
  }

  stop(): void {
    this.source = null;
    this.script = null;
    this.c.setVisible(false);
  }

  get playing(): boolean {
    return !!this.source;
  }

  private plan(time: number): void {
    this.start = time;
    this.script = this.source?.() ?? null;
    this.segs = [];
    this.len = PRESS + LIFT + IDLE;
    const s = this.script;
    if (!s) return;
    if (s.kind === 'drag') {
      let t = PRESS;
      for (let i = 1; i < s.pts.length; i++) {
        t += s.rest?.[i - 1] ?? 0;
        const d = Math.hypot(s.pts[i].x - s.pts[i - 1].x, s.pts[i].y - s.pts[i - 1].y);
        const dur = Math.max(160, (d / SPEED) * 1000);
        this.segs.push({ a: s.pts[i - 1], b: s.pts[i], t0: t, t1: t + dur });
        t += dur;
      }
      t += s.rest?.[s.pts.length - 1] ?? 200;
      this.len = t + LIFT + IDLE;
    } else if (s.kind === 'pinch') this.len = PRESS + 1100 + LIFT + IDLE;
    else this.len = PRESS + 250 + LIFT + IDLE;
  }

  update(time: number): void {
    if (!this.source) return;
    if (this.start < 0 || time - this.start > this.len) this.plan(time);
    // follow the camera and the men: the same timing, today's positions
    const live = this.source();
    if (live && this.script && live.kind === this.script.kind) {
      if (live.kind === 'drag' && this.script.kind === 'drag' && live.pts.length === this.script.pts.length) this.segs.forEach((sg, i) => ((sg.a = live.pts[i]), (sg.b = live.pts[i + 1])));
      this.script = { ...live, ...(live.kind === 'drag' && this.script.kind === 'drag' ? { rest: this.script.rest } : {}) } as GhostScript;
    }
    const s = this.script;
    const g = this.trail;
    g.clear();
    for (const h of this.hands) h.setVisible(false);
    for (const r of this.rings) r.setVisible(false);
    if (!s) return;
    const t = time - this.start;
    const lifting = t > this.len - IDLE - LIFT;
    const gone = t > this.len - IDLE;
    if (gone) return;
    const fade = lifting ? 1 - (t - (this.len - IDLE - LIFT)) / LIFT : Math.min(1, t / 160);
    const lift = lifting ? (1 - fade) * 6 : t < PRESS ? (1 - t / PRESS) * 6 : 0;
    const showHand = (i: number, p: Pt, flip = false) => {
      const h = this.hands[i];
      h.setPosition(Math.round(p.x + (flip ? -lift : lift) * 0.4), Math.round(p.y + lift)).setFlipX(flip).setAlpha(0.92 * fade).setVisible(true);
      h.setOrigin(flip ? 1 - HAND_TIP.x / 14 : HAND_TIP.x / 14, HAND_TIP.y / 18);
      const r = this.rings[i];
      const pressed = t >= PRESS * 0.6 && !lifting;
      r.setPosition(Math.round(p.x), Math.round(p.y)).setVisible(pressed).setAlpha(0.7 * fade).setScale(pressed ? 2 : 2.6);
    };
    if (s.kind === 'tap') {
      showHand(0, s.at);
      return;
    }
    if (s.kind === 'pinch') {
      const k = Phaser.Math.Clamp((t - PRESS) / 1100, 0, 1);
      const e = k * k * (3 - 2 * k);
      const d = (s.d0 + (s.d1 - s.d0) * e) / 2;
      showHand(0, { x: s.at.x + d * 0.8, y: s.at.y + d * 0.6 });
      showHand(1, { x: s.at.x - d * 0.8, y: s.at.y - d * 0.6 }, true);
      return;
    }
    // drag: the finger along the path, a dotted trail behind it
    let p = s.pts[0];
    for (const sg of this.segs) {
      if (t < sg.t0) break;
      const k = Phaser.Math.Clamp((t - sg.t0) / (sg.t1 - sg.t0), 0, 1);
      const e = k * k * (3 - 2 * k);
      p = { x: sg.a.x + (sg.b.x - sg.a.x) * e, y: sg.a.y + (sg.b.y - sg.a.y) * e };
      const n = Math.floor(Math.hypot(p.x - sg.a.x, p.y - sg.a.y) / 4);
      for (let i = 0; i <= n; i++) {
        const q = n ? i / n : 0;
        const x = Math.round(sg.a.x + (p.x - sg.a.x) * q);
        const y = Math.round(sg.a.y + (p.y - sg.a.y) * q);
        g.fillStyle(0x2a1a16, 0.5 * fade);
        g.fillRect(x - 1, y - 1, 3, 3);
        g.fillStyle(0xfaf4e8, 0.9 * fade);
        g.fillRect(x, y, 1, 1);
      }
    }
    showHand(0, p);
  }

  destroy(): void {
    this.c.destroy();
  }
}
