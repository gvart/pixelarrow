/**
 * W-67 mob FX: the sim's mob events (src/war/sim/mobs.ts; offline from the worker's event log, live from the server's
 * `mobFx` message) as short view-only beats, so neutral regions read alive:
 *  - mobDash: a boar's charge run-up and a lion's pounce kick dust from under the beast for the burst (a lion's leap a
 *    pale spray, a serpent's lunge a little mud), and a skid burst where it lands on the man;
 *  - mobCry: a lair roused, the wolves' howl or a lion's or bear's roar: sound rings swelling out of the pack (a roar a
 *    small camera shake when on screen);
 *  - mobScatter: a pack breaking off or a herd bolting: dust thrown out round the pack.
 * Pooled records drawn with one Graphics; a cap on live puffs (the oldest go) and LOD by zoom (zoomed out: no dust, the
 * rings only) keep the 600-unit fps. Sound: ./sound/warAudio.ts (mobSfx).
 */
import Phaser from 'phaser';
import type { MobFxEvent, MobKind } from '../types';
import { HH, HW } from './iso';
import { camShake, shakeFalloff } from './feel/shake';
import { MOBS } from '../sim/mobs';

/** A dust puff (world px), born at t0 (ms), drifting (vx, vy px/s), growing to r. */
interface Puff { x: number; y: number; vx: number; vy: number; r: number; t0: number; life: number; c: number; a: number }
/** A cry's rings at a tile point. */
interface Ring { x: number; y: number; t0: number; c: number; roar: boolean }
/** A burst under way: the beast (unit id) kicks dust until `until`. */
interface Trail { unit: number; mob: MobKind; until: number; next: number; tx: number; ty: number; landed: boolean }

const MAX_PUFFS = 160;
const MAX_RINGS = 12;
/** Zoom under which no dust is drawn (the rings stay). */
const LOD_DUST = 0.3;
/** Ms of the sim tick (the burst's ticks). */
const TICK = 100;
const DUST: Record<MobKind, number> = { wolf: 0x8a8070, boar: 0x7a6248, bear: 0x6a5a48, bandit: 0x8a7a60, jackal: 0xb09a70, ibex: 0x9a9488, lion: 0xb8a072, serpent: 0x5a5038 };
const CRY = { howl: 0xc8d4e0, roar: 0xe8b060 } as const;

export class MobFx {
  private puffs: Puff[] = [];
  private rings: Ring[] = [];
  private trails: Trail[] = [];
  private g: Phaser.GameObjects.Graphics;
  private top: Phaser.GameObjects.Graphics;
  /** Beats seen (for scripts and shots): kind -> count. */
  readonly seen: Record<string, number> = {};

  constructor(
    scene: Phaser.Scene,
    /** Tile point -> world px of the ground there. */
    private ground: (x: number, y: number) => { x: number; y: number },
    /** A unit's feet as drawn this frame (world px), undefined when not drawn. */
    private unitAt: (id: number) => { x: number; y: number } | undefined,
  ) {
    this.g = scene.add.graphics().setDepth(9.06);
    this.top = scene.add.graphics().setDepth(10.95);
  }

  /** New events (any order; non-mob ones are ignored by the caller). */
  push(ev: readonly MobFxEvent[], now: number, zoom: number, view: { x: number; y: number; right: number; bottom: number }): void {
    for (const e of ev) {
      this.seen[e.kind] = (this.seen[e.kind] ?? 0) + 1;
      if (e.kind === 'mobDash') {
        const ms = (MOBS[e.mob].dash?.ticks ?? 6) * TICK;
        this.trails.push({ unit: e.unit, mob: e.mob, until: now + ms, next: now, tx: e.tx, ty: e.ty, landed: false });
        if (this.trails.length > 40) this.trails.shift();
      } else if (e.kind === 'mobCry') {
        const roar = e.mob !== 'wolf';
        this.rings.push({ x: e.x, y: e.y, t0: now, c: roar ? CRY.roar : CRY.howl, roar });
        if (this.rings.length > MAX_RINGS) this.rings.shift();
        if (roar) {
          const p = this.ground(e.x, e.y), k = shakeFalloff(p.x, p.y, view);
          if (k > 0) camShake.add(0.08 * k);
        }
      } else if (zoom >= LOD_DUST) {
        // a pack breaking: dust thrown out all round it
        const p = this.ground(e.x, e.y);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4, s = 40 + Math.random() * 50;
          this.puff(p.x + Math.cos(a) * HW * 0.8, p.y + Math.sin(a) * HH * 0.8, Math.cos(a) * s, Math.sin(a) * s * 0.5, 7 + Math.random() * 5, now + Math.random() * 200, 900, DUST[e.mob], 0.55);
        }
      }
    }
  }

  private puff(x: number, y: number, vx: number, vy: number, r: number, t0: number, life: number, c: number, a: number): void {
    if (this.puffs.length >= MAX_PUFFS) this.puffs.shift();
    this.puffs.push({ x, y, vx, vy, r, t0, life, c, a });
  }

  draw(zoom: number, now: number, view: { x: number; y: number; right: number; bottom: number }): void {
    const g = this.g.clear(), top = this.top.clear(), dust = zoom >= LOD_DUST;
    // bursts: dust kicked from under the beast while it runs, a skid burst where it lands
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const t = this.trails[i], at = this.unitAt(t.unit);
      if (now >= t.until || !at) {
        if (at && !t.landed && dust) this.skid(t, at, now);
        this.trails.splice(i, 1);
        continue;
      }
      if (!dust || now < t.next) continue;
      t.next = now + (t.mob === 'lion' ? 45 : 60);
      const back = Math.random() * 2 - 1;
      this.puff(at.x + back * 6, at.y - 2, back * 20, -8 - Math.random() * 10, t.mob === 'serpent' ? 4 : 6 + Math.random() * 4, now, t.mob === 'lion' ? 500 : 700, DUST[t.mob], t.mob === 'lion' ? 0.4 : 0.6);
      const tgt = this.ground(t.tx, t.ty);
      if (!t.landed && Math.hypot(tgt.x - at.x, tgt.y - at.y) < HW * 0.9) this.skid(t, at, now);
    }
    // dust puffs: grow, drift, fade (stepped alpha, pixel-ish)
    if (dust) {
      let n = 0;
      for (const p of this.puffs) {
        const age = now - p.t0;
        if (age >= p.life) continue;
        this.puffs[n++] = p;
        if (age < 0 || p.x < view.x - 40 || p.x > view.right + 40 || p.y < view.y - 40 || p.y > view.bottom + 40) continue;
        const k = age / p.life, s = age / 1000, r = p.r * (0.5 + k);
        g.fillStyle(p.c, Math.round(p.a * (1 - k) * 4) / 4).fillEllipse(p.x + p.vx * s, p.y + p.vy * s, r * 2, r * 1.2);
      }
      this.puffs.length = n;
    } else this.puffs.length = 0;
    // cries: three rings swelling out of the pack, on top of everything (a call heard across the map)
    const w = Math.max(1.5, 2 / zoom);
    let m = 0;
    for (const r of this.rings) {
      const age = now - r.t0, life = r.roar ? 1100 : 1500;
      if (age >= life) continue;
      this.rings[m++] = r;
      const p = this.ground(r.x, r.y);
      for (let j = 0; j < 3; j++) {
        const k = (age - j * 180) / (life - 360);
        if (k <= 0 || k >= 1) continue;
        const rad = (r.roar ? 2.5 : 3.5) * HW * (0.25 + k);
        top.lineStyle(w * (r.roar ? 1.6 : 1.1), r.c, 0.8 * (1 - k)).strokeEllipse(p.x, p.y - 20, rad * 2, rad);
      }
    }
    this.rings.length = m;
  }

  /** The burst lands on the man: a low spray of dust round the beast's feet. */
  private skid(t: Trail, at: { x: number; y: number }, now: number): void {
    t.landed = true;
    const n = t.mob === 'boar' ? 9 : t.mob === 'lion' ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const a = Math.PI + (i / (n - 1) - 0.5) * Math.PI * 1.2, s = 50 + Math.random() * 40;
      this.puff(at.x, at.y, Math.cos(a) * s * (Math.random() < 0.5 ? -1 : 1), Math.sin(a) * s * 0.4 - 10, 6 + Math.random() * 4, now, 650, DUST[t.mob], 0.65);
    }
  }

  /** Live puffs, rings and bursts (scripts, tests). */
  stats(): { puffs: number; rings: number; trails: number } {
    return { puffs: this.puffs.length, rings: this.rings.length, trails: this.trails.length };
  }
}
