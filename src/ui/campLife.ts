/**
 * The living camp (docs/ART_STYLE.md §13): the little animated bits shared by
 * the offline field camp on the world map and the online camp panel. Frame
 * loops (campfire, standards, forge coals), drifting smoke, sparks and the
 * map-scale soldiers of src/art/campArt.ts going about camp: sitting at the
 * fire, sparring, hammering at the anvil, or strolling between waypoints and
 * idling there. Everything is pixel-snapped; one update per frame from the
 * owner scene. Cheap enough for phones: a few dozen images, no physics.
 */
import type Phaser from 'phaser';
import { KIT, SOLDIER_H, SOLDIER_W, registerCampKit, soldierFrame, type SoldierPose } from '../art/campArt';

type Img = Phaser.GameObjects.Image;

interface Loop {
  img: Img;
  keys: string[];
  period: number;
  phase: number;
}

interface Emitter {
  x: number;
  y: number;
  /** Puffs (smoke) or sparks per second. */
  rate: number;
  kind: 'smoke' | 'spark';
  acc: number;
  /** Bursts only while this returns true (e.g. while the smith's hammer falls). */
  gate?: () => boolean;
}

interface Particle {
  img: Img;
  kind: 'smoke' | 'spark';
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
}

interface Figure {
  img: Img;
  look: number;
  x: number;
  y: number;
  pose: SoldierPose;
  flip: boolean;
  /** Frame period (ms) of the pose's two frames. */
  period: number;
  phase: number;
  /** Walkers: their waypoints, target and pause. */
  route?: [number, number][];
  to?: [number, number] | null;
  waitUntil?: number;
  speed?: number;
}

export interface CampLifeOpts {
  /** Adds an object to its parent (world layer or modal container). */
  add: (o: Phaser.GameObjects.GameObject) => void;
  /** Sort by y with this depth offset (world map); null keeps the add order (containers). */
  depth: number | null;
  /** Smoke pool size. */
  pool?: number;
}

export class CampLife {
  private loops: Loop[] = [];
  private emitters: Emitter[] = [];
  private parts: Particle[] = [];
  private free: Img[] = [];
  private figures: Figure[] = [];
  private objs: Phaser.GameObjects.GameObject[] = [];
  private poolMax: number;

  constructor(
    private scene: Phaser.Scene,
    private o: CampLifeOpts,
  ) {
    registerCampKit(scene);
    this.poolMax = o.pool ?? 24;
  }

  private place(img: Img, y: number): void {
    if (this.o.depth !== null) img.setDepth(this.o.depth + y);
  }

  private keep<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.o.add(obj);
    this.objs.push(obj);
    return obj;
  }

  /** A looping image (bottom-left origin at x, y feet line). */
  loop(x: number, y: number, keys: string[], period: number, phase = 0, origin: [number, number] = [0, 1]): Img {
    const img = this.keep(this.scene.add.image(Math.round(x), Math.round(y), keys[0]).setOrigin(origin[0], origin[1]));
    this.place(img, y);
    this.loops.push({ img, keys, period, phase });
    return img;
  }

  /** A still image (feet line y). */
  still(x: number, y: number, key: string, origin: [number, number] = [0, 1]): Img {
    const img = this.keep(this.scene.add.image(Math.round(x), Math.round(y), key).setOrigin(origin[0], origin[1]));
    this.place(img, y);
    return img;
  }

  smoke(x: number, y: number, rate = 1.6): void {
    this.emitters.push({ x, y, rate, kind: 'smoke', acc: Math.random() });
  }

  sparks(x: number, y: number, rate = 3, gate?: () => boolean): void {
    this.emitters.push({ x, y, rate, kind: 'spark', acc: 0, gate });
  }

  /** A soldier standing (or sitting / sparring / smithing) in place; feet at (x, y). */
  figure(look: number, x: number, y: number, pose: SoldierPose, flip = false, period = 0): Img {
    const img = this.keep(this.scene.add.image(0, 0, `ck_soldier_${look % 6}`, soldierFrame(pose, 0)).setOrigin(5 / SOLDIER_W, 14 / SOLDIER_H));
    const p = period || (pose === 'idle' ? 900 + Math.random() * 700 : pose === 'sit' ? 1300 + Math.random() * 900 : pose === 'smith' ? 380 : pose === 'spar' ? 330 + Math.random() * 120 : 220);
    const f: Figure = { img, look, x, y, pose, flip, period: p, phase: Math.random() * 4000 };
    this.figures.push(f);
    this.draw(f, 0);
    return img;
  }

  /** A soldier strolling between waypoints, idling a while at each. */
  walker(look: number, route: [number, number][], speed = 7): void {
    if (!route.length) return;
    const [x, y] = route[Math.floor(Math.random() * route.length)];
    this.figure(look, x, y, 'idle');
    const f = this.figures[this.figures.length - 1];
    f.route = route;
    f.to = null;
    f.speed = speed;
    f.waitUntil = this.scene.time.now + 400 + Math.random() * 2500;
  }

  /** Is the smith at (near) this spot on the striking frame? (sparks gate) */
  striking(x: number, y: number): boolean {
    const now = this.scene.time.now;
    return this.figures.some((f) => f.pose === 'smith' && Math.abs(f.x - x) < 12 && Math.abs(f.y - y) < 12 && Math.floor((now + f.phase) / f.period) % 2 === 1);
  }

  private draw(f: Figure, now: number): void {
    const frame = Math.floor((now + f.phase) / f.period) % 2;
    f.img.setFrame(soldierFrame(f.pose, frame));
    f.img.setPosition(Math.round(f.x), Math.round(f.y)).setFlipX(f.flip);
    this.place(f.img, f.y);
  }

  update(now: number, dt: number): void {
    const step = Math.min(dt, 100) / 1000;
    for (const l of this.loops) {
      if (!l.img.active) continue;
      const k = l.keys[Math.floor((now + l.phase) / l.period) % l.keys.length];
      if (l.img.texture.key !== k) l.img.setTexture(k);
    }
    for (const f of this.figures) {
      if (f.route) {
        if (f.to) {
          const dx = f.to[0] - f.x;
          const dy = f.to[1] - f.y;
          const d = Math.hypot(dx, dy);
          const v = (f.speed ?? 7) * step;
          if (d <= v) {
            f.x = f.to[0];
            f.y = f.to[1];
            f.to = null;
            f.pose = 'idle';
            f.period = 900 + Math.random() * 600;
            f.waitUntil = now + 1200 + Math.random() * 3800;
          } else {
            f.x += (dx / d) * v;
            f.y += (dy / d) * v;
            if (Math.abs(dx) > 0.5) f.flip = dx < 0;
          }
        } else if (now >= (f.waitUntil ?? 0)) {
          const opts = f.route.filter(([x, y]) => Math.hypot(x - f.x, y - f.y) > 3);
          if (opts.length) {
            f.to = opts[Math.floor(Math.random() * opts.length)];
            f.pose = 'walk';
            f.period = 200;
          } else f.waitUntil = now + 2000;
        }
      }
      this.draw(f, now);
    }
    // emitters
    for (const e of this.emitters) {
      if (e.gate && !e.gate()) continue;
      e.acc += e.rate * step;
      while (e.acc >= 1) {
        e.acc -= 1;
        this.emit(e, now);
      }
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      const t = (now - p.born) / p.life;
      if (t >= 1 || !p.img.active) {
        p.img.setVisible(false);
        this.free.push(p.img);
        this.parts.splice(i, 1);
        continue;
      }
      p.x += p.vx * step;
      p.y += p.vy * step;
      if (p.kind === 'smoke') {
        p.vx += 1.2 * step; // a breeze from the west
        const wob = Math.sin((now - p.born) / 380 + p.life) * 0.6;
        const key = t < 0.25 ? 'ck_puff0' : t < 0.6 ? 'ck_puff1' : 'ck_puff2';
        if (p.img.texture.key !== key) p.img.setTexture(key);
        p.img.setPosition(Math.round(p.x + wob), Math.round(p.y)).setAlpha(t < 0.12 ? (t / 0.12) * 0.75 : 0.75 * (1 - t) ** 1.3);
      } else {
        p.vy += 14 * step;
        p.img.setPosition(Math.round(p.x), Math.round(p.y)).setAlpha(1 - t * 0.6).setTint(t < 0.4 ? KIT.ember[0] : t < 0.7 ? KIT.ember[2] : KIT.ember[3]);
      }
      this.place(p.img, p.kind === 'smoke' ? 9000 : 9001);
    }
  }

  private emit(e: Emitter, now: number): void {
    if (this.parts.length >= this.poolMax) return;
    let img = this.free.pop();
    const key = e.kind === 'smoke' ? 'ck_puff0' : 'ck_spark';
    if (!img) img = this.keep(this.scene.add.image(0, 0, key).setOrigin(0.5, 0.5));
    img.setTexture(key).setVisible(true).clearTint().setAlpha(0);
    const smoke = e.kind === 'smoke';
    const p: Particle = {
      img,
      kind: e.kind,
      x: e.x + (Math.random() - 0.5) * (smoke ? 2 : 3),
      y: e.y,
      vx: smoke ? 0.5 + Math.random() * 1.5 : (Math.random() - 0.5) * 14,
      vy: smoke ? -(4 + Math.random() * 3) : -(14 + Math.random() * 14),
      born: now,
      life: smoke ? 2400 + Math.random() * 1400 : 380 + Math.random() * 300,
    };
    img.setPosition(Math.round(p.x), Math.round(p.y));
    this.parts.push(p);
  }

  destroy(): void {
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.loops = [];
    this.emitters = [];
    this.parts = [];
    this.free = [];
    this.figures = [];
  }
}
