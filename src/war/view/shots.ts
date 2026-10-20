/**
 * Missiles in flight from the snapshots' ShotSnaps: each flies a parabola in iso from the shooter's
 * hand to the target's chest, over the ground levels between them (z0 -> z1, at the drawn heights),
 * rotated along its screen velocity, with a small shadow on the ground under it. Kept past the
 * snapshot that drops it so it reaches the ground; then an arrow or javelin sticks there a few
 * seconds and a stone kicks up a coded dust puff. Release lines up with the shooter's strike frame:
 * the shot is loosed on tick t0 and shows from render tick t0 + 1 (./anim.ts).
 * M2c: a stone thrower's boulder (siege) leaves from its engine's release point (launch()), flies a high arc as the
 * stone-shot sprite with a growing shadow and lands in a big dust burst with flung chips; a fire arrow trails the
 * fire-arrow-trail loop along its flight and glows a moment where it sticks.
 */
import Phaser from 'phaser';
import type { MissileKind, ShotSnap } from '../types';
import { hash, type AnimTime } from './anim';
import type { IsoMap } from './iso';

const LAUNCH = 36; // px over the feet: the hand
const IMPACT = 22; // px over the target's feet
const LEN: Record<MissileKind, number> = { arrow: 16, javelin: 28, stone: 0, bolt: 24 };
const ARC: Record<MissileKind, number> = { arrow: 0.16, javelin: 0.2, stone: 0.11, bolt: 0.04 }; // apex per px of ground distance
const STUCK_MS = 4000;
const PUFF_MS = 450;
const MAX_STUCK = 400;

interface Stuck { x: number; y: number; dx: number; dy: number; kind: MissileKind; at: number; fire?: boolean; boulder?: boolean }
const BOULDER_ARC = 0.42;
const BOULDER_MS = 1100;

export class ShotLayer {
  private live = new Map<string, ShotSnap>();
  private stuck: Stuck[] = [];
  private seen = -1;
  private gGround: Phaser.GameObjects.Graphics;
  private gAir: Phaser.GameObjects.Graphics;
  /** Px a shooter or target at tile point (x, y) stands raised (on a wall-walk), 0 on the ground. */
  lift: (x: number, y: number) => number = () => 0;
  /** A siege engine's release point (tile point, px above its ground), for its boulders. */
  launch: (siege: number) => { x: number; y: number; px: number } | null = () => null;
  /** Launch points of boulders in flight (the engine may turn or go after it threw). */
  private from = new Map<string, { x: number; y: number; px: number }>();
  private imgs: Phaser.GameObjects.Image[] = [];
  private ni = 0;

  constructor(private scene: Phaser.Scene, private iso: IsoMap) {
    this.gGround = scene.add.graphics().setDepth(9.05);
    this.gAir = scene.add.graphics().setDepth(10.85);
  }

  private img(texture: string, frame?: number): Phaser.GameObjects.Image | null {
    if (!this.scene.textures.exists(texture)) return null;
    let im = this.imgs[this.ni];
    if (!im) this.imgs.push((im = this.scene.add.image(0, 0, texture).setDepth(10.86)));
    this.ni++;
    return im.setTexture(texture, frame).setVisible(true).setAlpha(1).setRotation(0).setOrigin(0.5).setScale(1).setDepth(10.86);
  }

  /** The newest snapshot's shots (call every frame; only new ticks are read). */
  update(tick: number, shots: readonly ShotSnap[] | undefined): void {
    if (tick === this.seen) return;
    this.seen = tick;
    for (const s of shots ?? []) {
      const k = `${s.by}:${s.t0}`;
      if (this.live.has(k)) continue;
      this.live.set(k, s);
      const l = s.siege !== undefined ? this.launch(s.siege) : null;
      if (l) this.from.set(k, l);
    }
  }

  draw(at: AnimTime, zoom: number, show: boolean): void {
    const g = this.gGround.clear(), a = this.gAir.clear(), { now } = at;
    this.ni = 0;
    this.drawAll(g, a, at, zoom, show, now);
    for (let i = this.ni; i < this.imgs.length; i++) this.imgs[i].setVisible(false);
  }

  private drawAll(g: Phaser.GameObjects.Graphics, a: Phaser.GameObjects.Graphics, at: AnimTime, zoom: number, show: boolean, now: number): void {
    if (!show) return;
    const w = Math.max(1.5, 1.2 / zoom);
    for (const [k, s] of this.live) {
      const p = (at.tick - (s.t0 + 1)) / (s.t1 - s.t0);
      if (p < 0) continue;
      const from = this.from.get(k), boulder = s.siege !== undefined;
      const [x, y, gy] = this.at(s, Math.min(1, p), from);
      const [x2, y2] = this.at(s, Math.min(1, p) + 0.02, from), dl = Math.hypot(x2 - x, y2 - y) || 1, dx = (x2 - x) / dl, dy = (y2 - y) / dl;
      if (p >= 1) {
        this.live.delete(k);
        this.from.delete(k);
        if (this.stuck.length < MAX_STUCK) this.stuck.push({ x, y: gy, dx, dy, kind: s.kind, at: now, fire: s.fire, boulder });
        continue;
      }
      if (boulder) {
        // shadow grows as it comes down; the stone itself, turning
        const k2 = 0.5 + 0.5 * p;
        g.fillStyle(0x000000, 0.18 + 0.15 * p).fillEllipse(x, gy, 14 * k2, 6 * k2);
        const im = this.img('sg-stone-shot');
        if (im) im.setPosition(Math.round(x), Math.round(y)).setScale(1.25).setRotation(p * 9);
        else a.fillStyle(0x5e5a54, 1).fillCircle(x, y, 4);
        continue;
      }
      g.fillStyle(0x000000, 0.22).fillEllipse(x, gy, s.kind === 'stone' ? 4 : 8, 3);
      if (s.fire) {
        const im = this.img('sg-fx-fire-arrow-trail', Math.floor(now / 83 + s.t0) % 8);
        // drawn flying +x with its head at the anchor (37, 7)
        if (im) im.setOrigin(1, 7 / 12).setPosition(x - dx * 4, y - dy * 4).setRotation(Math.atan2(dy, dx));
      }
      this.missile(a, s.kind, x, y, dx, dy, w, 1);
    }
    this.stuck = this.stuck.filter((s) => now - s.at < (s.boulder ? BOULDER_MS : s.kind === 'stone' ? PUFF_MS : STUCK_MS));
    for (const s of this.stuck) {
      const t = now - s.at;
      if (s.boulder) {
        // a dust burst, chips flung out, the stone rolled to rest
        const f = t / BOULDER_MS, r = 6 + 22 * Math.sqrt(f), al = 0.7 * (1 - f);
        g.fillStyle(0xb8a888, al);
        for (let i = 0; i < 7; i++) {
          const ang = (i / 7) * Math.PI * 2 + (s.x % 3);
          g.fillCircle(s.x + Math.cos(ang) * r * 0.9, s.y + Math.sin(ang) * r * 0.4 - r * 0.25, r * (0.35 + 0.1 * (i % 3)));
        }
        g.fillStyle(0xd8ccb0, al * 0.8).fillCircle(s.x, s.y - r * 0.6, r * 0.5);
        const fl = Math.min(1, f * 2.2);
        a.fillStyle(0x6a6258, 1 - fl);
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2 + 0.4, d = 30 * fl;
          a.fillRect(s.x + Math.cos(ang) * d, s.y + Math.sin(ang) * d * 0.5 - 40 * fl * (1 - fl) * 2, 2.5, 2.5);
        }
        const im = this.img('sg-stone-shot');
        if (im) im.setPosition(Math.round(s.x + 3), Math.round(s.y - 3)).setScale(1.25).setDepth(10.86);
        continue;
      }
      if (s.kind === 'stone') {
        const f = t / PUFF_MS, r = 2 + 7 * f;
        g.fillStyle(0xc8b89a, 0.55 * (1 - f));
        g.fillCircle(s.x - r * 0.6, s.y - r * 0.3, r * 0.7).fillCircle(s.x + r * 0.6, s.y - r * 0.4, r * 0.6).fillCircle(s.x, s.y - r * 0.8, r * 0.8);
        continue;
      }
      // a third buried, at its landing angle, a little jitter so a volley does not stand in rows
      const j = (hash(Math.round(s.x), Math.round(s.y)) % 9) - 4;
      const alpha = Math.min(1, (STUCK_MS - t) / 1000);
      this.missile(g, s.kind, s.x + j, s.y + (j & 3) - 1, s.dx, s.dy, w, alpha, 0.65);
      if (s.fire && t < 1500) g.fillStyle(0xff9a30, 0.7 * (1 - t / 1500)).fillCircle(s.x + j - s.dx * 6, s.y + (j & 3) - 1 - s.dy * 6, 2.5 + (Math.floor(now / 90) % 2));
    }
  }

  /** Screen point of a shot at progress p: [x, y in the air, y of its shadow on the ground]. */
  private at(s: ShotSnap, p: number, from?: { x: number; y: number; px: number }): [number, number, number] {
    const iso = this.iso, x0 = from?.x ?? s.x0, y0 = from?.y ?? s.y0, za = iso.zDraw(x0, y0), zb = iso.zDraw(s.x1, s.y1);
    const gx = x0 + (s.x1 - x0) * p, gy = y0 + (s.y1 - y0) * p, z = za + (zb - za) * p;
    const sx = iso.sx(gx, gy), sy = iso.sy(gx, gy, z);
    const d = Math.hypot(iso.sx(s.x1, s.y1) - iso.sx(x0, y0), iso.sy(s.x1, s.y1, zb) - iso.sy(x0, y0, za));
    const ra = this.lift(x0, y0), rb = this.lift(s.x1, s.y1), boulder = s.siege !== undefined;
    const launch = from ? from.px : LAUNCH, impact = boulder ? 4 : IMPACT;
    const h = ra + (rb - ra) * p + launch + (impact - launch) * p + 4 * Math.min(boulder ? 420 : 140, d * (boulder ? BOULDER_ARC : ARC[s.kind])) * p * (1 - p);
    return [sx, sy - h, sy - (ra + (rb - ra) * p)];
  }

  /** The missile with its point at (x, y), pointing along (dx, dy); `part` of its length shows. */
  private missile(g: Phaser.GameObjects.Graphics, kind: MissileKind, x: number, y: number, dx: number, dy: number, w: number, alpha: number, part = 1): void {
    if (kind === 'stone') { g.fillStyle(0x5e5a54, alpha).fillCircle(x, y, w); return; }
    const L = LEN[kind] * part, tx = x - dx * L, ty = y - dy * L;
    g.lineStyle(kind === 'javelin' ? w * 1.3 : w, 0x9a7a4e, alpha).lineBetween(tx, ty, x, y);
    g.lineStyle(w, 0xd8d4c8, alpha).lineBetween(x - dx * 2.5, y - dy * 2.5, x, y);
    if (kind === 'arrow' && part === 1) g.lineStyle(w, 0xe8e0d0, alpha).lineBetween(tx, ty, tx + dx * 3, ty + dy * 3);
  }
}
