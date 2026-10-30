/**
 * The puffs of ordinary blows (./hits.ts): a few hot sparks thrown off where two armed men meet, a low dust burst at the
 * feet where a beast strikes or is struck (a heavy blow: a wider one). Pooled records drawn with two Graphics (dust
 * under the men, sparks over them), stepped alpha and square pixels; a cap on live particles (the oldest go) and none
 * zoomed far out keep a big melee's frame cheap.
 */
import Phaser from 'phaser';
import type { PuffKind } from './hits';

interface P { x: number; y: number; vx: number; vy: number; t0: number; life: number; r: number; c: number; spark: boolean }

export const MAX_PARTS = 120;
/** Zoom under which no puffs are drawn. */
const LOD = 0.3;
const SPARK = [0xfff6d0, 0xffd27a, 0xffb347];
const DUST = 0xa89878;

export class Sparks {
  private parts: P[] = [];
  private under: Phaser.GameObjects.Graphics;
  private over: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.under = scene.add.graphics().setDepth(9.5);
    this.over = scene.add.graphics().setDepth(10.95);
  }

  /** A puff at a struck unit: feet at world px (fx, fy), `h` px tall, pushed along screen direction (sx, sy). */
  add(kind: PuffKind, fx: number, fy: number, h: number, sx: number, sy: number, heavy: boolean, now: number, zoom: number): void {
    if (zoom < LOD) return;
    if (kind === 'spark') {
      // at the clash, chest high, thrown forward and up in a fan
      const cx = fx - sx * 6, cy = fy - h * 0.62;
      for (let i = 0; i < 7; i++) {
        const a = Math.atan2(sy, sx) + (Math.random() - 0.5) * 2.2, s = 70 + Math.random() * 90;
        this.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, t0: now, life: 200 + Math.random() * 120, r: 2, c: SPARK[i % 3], spark: true });
      }
      return;
    }
    const n = heavy ? 7 : 4, w = heavy ? 1.6 : 1;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (i / (n - 1)) + (Math.random() - 0.5) * 0.4, s = (30 + Math.random() * 30) * w;
      this.push({ x: fx + Math.cos(a) * 6 * w, y: fy - 1, vx: Math.cos(a) * s + sx * 20, vy: -Math.sin(a) * s * 0.3, t0: now, life: 420 + Math.random() * 200, r: (6 + Math.random() * 4) * w, c: DUST, spark: false });
    }
  }

  private push(p: P): void {
    if (this.parts.length >= MAX_PARTS) this.parts.shift();
    this.parts.push(p);
  }

  draw(zoom: number, now: number, view: { x: number; y: number; right: number; bottom: number }): void {
    const u = this.under.clear(), o = this.over.clear();
    if (!this.parts.length) return;
    if (zoom < LOD) { this.parts.length = 0; return; }
    const px = Math.max(1, 1 / zoom);
    let n = 0;
    for (const p of this.parts) {
      const age = now - p.t0;
      if (age >= p.life) continue;
      this.parts[n++] = p;
      if (p.x < view.x - 40 || p.x > view.right + 40 || p.y < view.y - 60 || p.y > view.bottom + 40) continue;
      const k = age / p.life, s = age / 1000;
      if (p.spark) {
        // a falling ember: gravity, a short tail, stepped fade
        const x = p.x + p.vx * s, y = p.y + p.vy * s + 260 * s * s, a = Math.round((1 - k) * 3) / 3;
        o.fillStyle(p.c, a).fillRect(x, y, p.r * px, p.r * px);
        o.fillStyle(p.c, a * 0.5).fillRect(x - p.vx * 0.012, y - (p.vy + 520 * s) * 0.012, p.r * px * 0.8, p.r * px * 0.8);
      } else {
        const r = p.r * (0.6 + 0.8 * k), a = Math.round(0.7 * Math.min(1, 1.6 * (1 - k)) * 4) / 4;
        u.fillStyle(p.c, a).fillEllipse(p.x + p.vx * s, p.y + p.vy * s, r * 2, r * 1.1);
      }
    }
    this.parts.length = n;
  }

  /** Live particles (scripts, tests). */
  get live(): number {
    return this.parts.length;
  }
}
