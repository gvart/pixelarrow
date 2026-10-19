/**
 * Missiles in flight from the snapshots' ShotSnaps: each flies a parabola in iso from the shooter's
 * hand to the target's chest, over the ground levels between them (z0 -> z1, at the drawn heights),
 * rotated along its screen velocity, with a small shadow on the ground under it. Kept past the
 * snapshot that drops it so it reaches the ground; then an arrow or javelin sticks there a few
 * seconds and a stone kicks up a coded dust puff. Release lines up with the shooter's strike frame:
 * the shot is loosed on tick t0 and shows from render tick t0 + 1 (./anim.ts).
 */
import Phaser from 'phaser';
import type { MissileKind, ShotSnap } from '../types';
import { hash, type AnimTime } from './anim';
import type { IsoMap } from './iso';

const LAUNCH = 36; // px over the feet: the hand
const IMPACT = 22; // px over the target's feet
const LEN: Record<MissileKind, number> = { arrow: 16, javelin: 28, stone: 0 };
const ARC: Record<MissileKind, number> = { arrow: 0.16, javelin: 0.2, stone: 0.11 }; // apex per px of ground distance
const STUCK_MS = 4000;
const PUFF_MS = 450;
const MAX_STUCK = 400;

interface Stuck { x: number; y: number; dx: number; dy: number; kind: MissileKind; at: number }

export class ShotLayer {
  private live = new Map<string, ShotSnap>();
  private stuck: Stuck[] = [];
  private seen = -1;
  private gGround: Phaser.GameObjects.Graphics;
  private gAir: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, private iso: IsoMap) {
    this.gGround = scene.add.graphics().setDepth(9.05);
    this.gAir = scene.add.graphics().setDepth(10.85);
  }

  /** The newest snapshot's shots (call every frame; only new ticks are read). */
  update(tick: number, shots: readonly ShotSnap[] | undefined): void {
    if (tick === this.seen) return;
    this.seen = tick;
    for (const s of shots ?? []) {
      const k = `${s.by}:${s.t0}`;
      if (!this.live.has(k)) this.live.set(k, s);
    }
  }

  draw(at: AnimTime, zoom: number, show: boolean): void {
    const g = this.gGround.clear(), a = this.gAir.clear(), { now } = at;
    if (!show) return;
    const w = Math.max(1.5, 1.2 / zoom);
    for (const [k, s] of this.live) {
      const p = (at.tick - (s.t0 + 1)) / (s.t1 - s.t0);
      if (p < 0) continue;
      const [x, y, gy] = this.at(s, Math.min(1, p));
      const [x2, y2] = this.at(s, Math.min(1, p) + 0.02), dl = Math.hypot(x2 - x, y2 - y) || 1, dx = (x2 - x) / dl, dy = (y2 - y) / dl;
      if (p >= 1) {
        this.live.delete(k);
        if (this.stuck.length < MAX_STUCK) this.stuck.push({ x, y: gy, dx, dy, kind: s.kind, at: now });
        continue;
      }
      g.fillStyle(0x000000, 0.22).fillEllipse(x, gy, s.kind === 'stone' ? 4 : 8, 3);
      this.missile(a, s.kind, x, y, dx, dy, w, 1);
    }
    this.stuck = this.stuck.filter((s) => now - s.at < (s.kind === 'stone' ? PUFF_MS : STUCK_MS));
    for (const s of this.stuck) {
      const t = now - s.at;
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
    }
  }

  /** Screen point of a shot at progress p: [x, y in the air, y of its shadow on the ground]. */
  private at(s: ShotSnap, p: number): [number, number, number] {
    const iso = this.iso, za = iso.zDraw(s.x0, s.y0), zb = iso.zDraw(s.x1, s.y1);
    const gx = s.x0 + (s.x1 - s.x0) * p, gy = s.y0 + (s.y1 - s.y0) * p, z = za + (zb - za) * p;
    const sx = iso.sx(gx, gy), sy = iso.sy(gx, gy, z);
    const d = Math.hypot(iso.sx(s.x1, s.y1) - iso.sx(s.x0, s.y0), iso.sy(s.x1, s.y1, zb) - iso.sy(s.x0, s.y0, za));
    const h = LAUNCH + (IMPACT - LAUNCH) * p + 4 * Math.min(140, d * ARC[s.kind]) * p * (1 - p);
    return [sx, sy - h, sy];
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
