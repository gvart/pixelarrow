/**
 * Life in the isometric camp (src/scenes/CampScene.ts): the soldiers as
 * paperdoll figures (src/art/paperdoll.ts, drawn at half the battle scale on
 * lazily filled battle rows, src/ui/sprites.ts) strolling the paths, sitting
 * at the fire, sparring on the drill ground, hammering at the forge, keeping
 * the stall, resting their wounds at the tents and standing guard at the
 * gate; goats and hens on the pasture; gulls over the shore; the smoke,
 * sparks and frame loops of src/ui/campLife.ts. Everything is pixel-snapped
 * and sorted by its feet line inside the scene's world container. Sparse by
 * design: at most a dozen figures, a handful of animals, one particle pool.
 */
import type Phaser from 'phaser';
import { ANIM, FRAME, type DollSpec } from '../art/paperdoll';
import { battleDoll, battleFrame, battleRow, dollOrigin } from './sprites';
import { CampLife } from './campLife';
import { renderBird, renderGoat, renderHen } from '../art/campIso';

export type FigureRole = 'stroll' | 'sit' | 'spar' | 'smith' | 'keep' | 'rest' | 'guard' | 'drill';

interface Figure {
  key: string;
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  role: FigureRole;
  dir: number;
  frames: readonly number[];
  period: number;
  phase: number;
  /** Strollers: waypoints, target, pause. */
  route?: [number, number][];
  to?: [number, number] | null;
  waitUntil?: number;
  speed: number;
  /** Fixed facing for the still roles. */
  face?: number;
  rowKey: string;
  rowDir: number;
}

interface Animal {
  img: Phaser.GameObjects.Image;
  kind: 'goat' | 'hen';
  x: number;
  y: number;
  to: [number, number] | null;
  waitUntil: number;
  spots: [number, number][];
  phase: number;
  flip: boolean;
}

interface Bird {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

export interface CampIsoLifeOpts {
  /** The world container (pannable); objects are added to it and depth-sorted by their feet. */
  add: (o: Phaser.GameObjects.GameObject) => void;
  /** Depth of a thing whose feet are at world y. */
  depthAt: (y: number) => number;
  /** Where birds may fly (world px). */
  sky: { x0: number; x1: number; y0: number; y1: number };
}

/** Facing row for a screen movement (iso axes: +X down-right, +Y down-left). */
export function facingOf(dx: number, dy: number): number {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return 0;
  if (dx >= 0) return dy >= 0 ? 0 : 1;
  return dy >= 0 ? 2 : 3;
}

const ATTACK_HOLD = [1, 1.6, 0.6, 0.8, 1.2];

export class CampIsoLife {
  readonly fx: CampLife;
  private figures: Figure[] = [];
  private animals: Animal[] = [];
  private birds: Bird[] = [];
  private objs: Phaser.GameObjects.GameObject[] = [];
  private now = 0;

  constructor(
    private scene: Phaser.Scene,
    private o: CampIsoLifeOpts,
  ) {
    this.fx = new CampLife(scene, { add: o.add, depth: 0, pool: 18 });
    if (!scene.textures.exists('ci_goat0')) {
      scene.textures.addCanvas('ci_goat0', renderGoat(0).toCanvas());
      scene.textures.addCanvas('ci_goat1', renderGoat(1).toCanvas());
      scene.textures.addCanvas('ci_hen0', renderHen(0).toCanvas());
      scene.textures.addCanvas('ci_hen1', renderHen(1).toCanvas());
      scene.textures.addCanvas('ci_bird0', renderBird(0).toCanvas());
      scene.textures.addCanvas('ci_bird1', renderBird(1).toCanvas());
    }
  }

  private keep<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.o.add(obj);
    this.objs.push(obj);
    return obj;
  }

  /** A soldier with a role at world (x, y) (feet). Strollers get `route`. */
  figure(spec: DollSpec, role: FigureRole, x: number, y: number, opts: { route?: [number, number][]; face?: number; phase?: number } = {}): void {
    const key = battleDoll({ ...spec, scale: 0.5 });
    const dir = opts.face ?? facingOf(1, 1);
    const rowKey = battleRow(this.scene, key, dir);
    const [ox, oy] = dollOrigin(key);
    const img = this.keep(this.scene.add.image(Math.round(x), Math.round(y), rowKey, 0).setOrigin(ox, oy));
    const f: Figure = { key, img, x, y, role, dir, frames: ANIM.idle, period: 520, phase: opts.phase ?? Math.random() * 5000, speed: 9, face: opts.face, rowKey, rowDir: dir };
    this.pose(f, role);
    if (route(f, opts.route)) f.waitUntil = this.scene.time.now + 300 + Math.random() * 2000;
    this.figures.push(f);
    this.draw(f, this.scene.time.now);
  }

  private pose(f: Figure, role: FigureRole): void {
    f.role = role;
    switch (role) {
      case 'spar':
      case 'drill':
      case 'smith':
        f.frames = ANIM.attack;
        f.period = role === 'smith' ? 260 : 220;
        break;
      case 'rest':
        f.frames = [FRAME.hit1, FRAME.hit1, FRAME.idle1];
        f.period = 900;
        break;
      case 'sit':
        f.frames = [FRAME.block, FRAME.block, FRAME.block, FRAME.idle3];
        f.period = 700;
        break;
      case 'guard':
        f.frames = [FRAME.idle0, FRAME.idle0, FRAME.idle2, FRAME.block, FRAME.block, FRAME.idle0];
        f.period = 600;
        break;
      default:
        f.frames = ANIM.idle;
        f.period = 480 + Math.random() * 200;
    }
  }

  /** Is a smith (or sparring man) striking right now? (gates the sparks) */
  striking(x: number, y: number): boolean {
    return this.figures.some((f) => (f.role === 'smith' || f.role === 'spar') && Math.abs(f.x - x) < 14 && Math.abs(f.y - y) < 12 && this.frameOf(f, this.now) === 2);
  }

  /** The current frame index of an attack loop (its frames hold for different times). */
  private frameOf(f: Figure, now: number): number {
    if (f.frames === ANIM.attack) {
      const total = ATTACK_HOLD.reduce((a, b) => a + b, 0) * f.period;
      let t = (now + f.phase) % (total + f.period * 2);
      for (let i = 0; i < ATTACK_HOLD.length; i++) {
        t -= ATTACK_HOLD[i] * f.period;
        if (t < 0) return i;
      }
      return -1; // a pause between blows
    }
    return Math.floor((now + f.phase) / f.period) % f.frames.length;
  }

  private draw(f: Figure, now: number): void {
    const fi = this.frameOf(f, now);
    const col = fi < 0 ? FRAME.idle0 : f.frames[fi];
    if (f.rowDir !== f.dir) {
      f.rowKey = battleRow(this.scene, f.key, f.dir);
      f.rowDir = f.dir;
      f.img.setTexture(f.rowKey, 0);
    }
    battleFrame(f.rowKey, col);
    if (this.scene.textures.get(f.rowKey).has(String(col))) f.img.setFrame(col);
    f.img.setPosition(Math.round(f.x), Math.round(f.y)).setDepth(this.o.depthAt(f.y));
  }

  /** A goat or hen that wanders between `spots` (world px). */
  animal(kind: 'goat' | 'hen', spots: [number, number][]): void {
    if (!spots.length) return;
    const [x, y] = spots[Math.floor(Math.random() * spots.length)];
    const img = this.keep(this.scene.add.image(Math.round(x), Math.round(y), `ci_${kind}0`).setOrigin(0.5, 1));
    this.animals.push({ img, kind, x, y, to: null, waitUntil: this.scene.time.now + Math.random() * 3000, spots, phase: Math.random() * 3000, flip: Math.random() < 0.5 });
  }

  /** A gull crossing the sky. */
  bird(): void {
    const s = this.o.sky;
    const img = this.keep(this.scene.add.image(0, 0, 'ci_bird0').setOrigin(0.5, 0.5).setDepth(1e6).setAlpha(0.9));
    const left = Math.random() < 0.5;
    this.birds.push({ img, x: left ? s.x0 : s.x1, y: s.y0 + Math.random() * (s.y1 - s.y0), vx: (left ? 1 : -1) * (14 + Math.random() * 10), vy: (Math.random() - 0.5) * 4, phase: Math.random() * 1000 });
  }

  update(now: number, dt: number): void {
    this.now = now;
    const step = Math.min(dt, 100) / 1000;
    for (const f of this.figures) {
      if (f.route) this.stroll(f, now, step);
      this.draw(f, now);
    }
    for (const a of this.animals) {
      if (a.to) {
        const dx = a.to[0] - a.x;
        const dy = a.to[1] - a.y;
        const d = Math.hypot(dx, dy);
        const v = (a.kind === 'goat' ? 5 : 4) * step;
        if (d <= v) {
          a.x = a.to[0];
          a.y = a.to[1];
          a.to = null;
          a.waitUntil = now + 1500 + Math.random() * 5000;
        } else {
          a.x += (dx / d) * v;
          a.y += (dy / d) * v;
          if (Math.abs(dx) > 0.5) a.flip = dx < 0;
        }
      } else if (now >= a.waitUntil) {
        const opts = a.spots.filter(([x, y]) => Math.hypot(x - a.x, y - a.y) > 4 && Math.hypot(x - a.x, y - a.y) < 70);
        a.to = opts.length ? opts[Math.floor(Math.random() * opts.length)] : null;
        if (!a.to) a.waitUntil = now + 3000;
      }
      const frame = a.to ? Math.floor(now / 180) % 2 : Math.floor((now + a.phase) / 900) % 2;
      a.img.setTexture(`ci_${a.kind}${frame}`).setFlipX(a.flip).setPosition(Math.round(a.x), Math.round(a.y)).setDepth(this.o.depthAt(a.y));
    }
    const s = this.o.sky;
    for (const b of this.birds) {
      b.x += b.vx * step;
      b.y += b.vy * step + Math.sin((now + b.phase) / 400) * 0.1;
      if (b.x < s.x0 - 10 || b.x > s.x1 + 10) {
        b.vx = -b.vx;
        b.y = s.y0 + Math.random() * (s.y1 - s.y0);
      }
      b.img.setTexture(`ci_bird${Math.floor((now + b.phase) / 220) % 2}`).setPosition(Math.round(b.x), Math.round(b.y));
    }
    this.fx.update(now, dt);
  }

  private stroll(f: Figure, now: number, step: number): void {
    if (f.to) {
      const dx = f.to[0] - f.x;
      const dy = f.to[1] - f.y;
      const d = Math.hypot(dx, dy);
      const v = f.speed * step;
      if (d <= v) {
        f.x = f.to[0];
        f.y = f.to[1];
        f.to = null;
        this.pose(f, 'stroll');
        f.waitUntil = now + 1500 + Math.random() * 4000;
      } else {
        f.x += (dx / d) * v;
        f.y += (dy / d) * v;
        f.dir = facingOf(dx, dy);
      }
    } else if (now >= (f.waitUntil ?? 0)) {
      const opts = f.route!.filter(([x, y]) => Math.hypot(x - f.x, y - f.y) > 6);
      if (opts.length) {
        f.to = opts[Math.floor(Math.random() * opts.length)];
        f.frames = ANIM.walk;
        f.period = 115;
      } else f.waitUntil = now + 2000;
    }
  }

  destroy(): void {
    this.fx.destroy();
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.figures = [];
    this.animals = [];
    this.birds = [];
  }
}

function route(f: Figure, r?: [number, number][]): boolean {
  if (!r || r.length < 2) return false;
  f.route = r;
  f.to = null;
  return true;
}
