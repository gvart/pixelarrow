/**
 * Mythical beasts in the battle scene (hook-based: BattleScene creates one
 * when the sim has beasts and calls `update` after drawing the units and
 * `events` with every drained batch). Everything beast-specific on screen
 * lives here:
 *
 *  - the beasts' own figures: footprint shadows, the special-move sheets
 *    (src/art/beastArt.ts: hurls, charges, fire, dives...), harpies flying
 *    high above their shadows, regrowing hydra heads, enraged tints;
 *  - effects: boulders in flight with their shadow and a dust cloud and
 *    crater where they land, fire cones and men burning, stomps and quakes
 *    (camera shake, a dust ring), harpy dive trails, the minotaur's dust;
 *  - the boss HP bar under the top bar (heads / arms / flock pips).
 */
import Phaser from 'phaser';
import type { Battle } from '../sim/battle';
import type { SimEvent, SimUnit, Side } from '../sim/types';
import type { MythState } from '../sim/myth';
import { MYTHS, isMythId, type MythId } from '../data/beasts';
import { isoToScreen } from '../art/iso';
import { renderBoulderFx } from '../art/beastArt';
import { dollFrame, ensureDoll, ensureDollRow, queueDollRows } from './sprites';
import { dollFromHero } from '../art/paperdoll';
import type { Hero } from '../data/units';
import { addPanel, addText } from './kit';
import { ellipsize } from './textfit';
import { tOr } from '../i18n';
import { TICK_RATE } from '../sim/battle';

/** What BattleScene keeps per figure (structural: its UnitView). */
export interface BeastUnitView {
  u: SimUnit;
  hero: Hero;
  spr: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  flag: Phaser.GameObjects.Image;
  dir: number;
  key: string;
  tall: number;
  big: boolean;
  deathTick: number;
}

interface Part {
  v: BeastUnitView;
  id: MythId;
  sp: string;
  /** Last tick of each signature act on this unit. */
  last: Map<string, number>;
  regrowAt: number;
}

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
  size: number;
  ground: boolean;
}

const FIRE = [0xfff0a0, 0xffc040, 0xf08028, 0xc04018, 0x5a3a30];
const DUST = [0xc8b898, 0xa8987a, 0x887a62];

export class BeastView {
  private parts: Part[] = [];
  private puffs: Puff[] = [];
  private gfx: Phaser.GameObjects.Graphics;
  private ground: Phaser.GameObjects.Graphics;
  private rocks = new Map<number, { img: Phaser.GameObjects.Image; sh: Phaser.GameObjects.Image }>();
  private craters: { x: number; y: number; t: number }[] = [];
  private rings: { x: number; y: number; r: number; t: number; max: number; color: number }[] = [];
  private bar: Phaser.GameObjects.Container | null = null;
  private barG: Phaser.GameObjects.Graphics | null = null;
  private barW = 0;
  private last = 0;

  static create(scene: Phaser.Scene, sim: Battle, views: BeastUnitView[], world: Phaser.GameObjects.Layer, ui: Phaser.GameObjects.Container, me: Side, vw: number, top: number): BeastView | null {
    if (!sim.myth) return null;
    return new BeastView(scene, sim, views, world, ui, me, vw, top);
  }

  private constructor(
    private scene: Phaser.Scene,
    private sim: Battle,
    views: BeastUnitView[],
    private world: Phaser.GameObjects.Layer,
    private ui: Phaser.GameObjects.Container,
    private me: Side,
    vw: number,
    top: number,
  ) {
    this.gfx = scene.add.graphics().setDepth(99000);
    this.ground = scene.add.graphics().setDepth(-85000);
    world.add([this.ground, this.gfx]);
    if (!scene.textures.exists('myth_boulder')) scene.textures.addCanvas('myth_boulder', renderBoulderFx(18).toCanvas());
    for (const v of views) {
      const id = v.u.stats.boss;
      if (!isMythId(id)) continue;
      const def = MYTHS[id];
      v.tall = def.tall;
      v.big = true;
      const k = Math.max(0.6, def.radius / 0.5);
      v.shadow.setTexture('shadow_big').setScale(k, k * 0.9).setAlpha(def.flies ? 0.22 : 0.34);
      v.ring.setScale(k);
      const sp = ensureDoll(scene, { ...dollFromHero(v.hero), pose: 'sp' }, [v.dir]);
      queueDollRows(scene, sp);
      this.parts.push({ v, id, sp, last: new Map(), regrowAt: -1000 });
    }
    this.buildBar(vw, top);
  }

  private st(u: SimUnit): MythState | undefined {
    return this.sim.myth?.get(u);
  }

  // ------------------------------------------------------------------ events

  events(evs: readonly SimEvent[]): void {
    for (const e of evs) {
      if (e.type !== 'myth') continue;
      const part = this.parts.find((p) => p.v.u.id === e.unit);
      part?.last.set(e.act, e.tick);
      const at = isoToScreen(e.x, e.y);
      const to = isoToScreen(e.tx, e.ty);
      switch (e.act) {
        case 'boulder':
          this.dust(to.x, to.y, 26, 1.3);
          this.rings.push({ x: to.x, y: to.y, r: 0, t: 0, max: 46, color: 0xc8b898 });
          this.craters.push({ x: to.x, y: to.y, t: 0 });
          this.shake(e.targets.length > 0 ? 0.008 : 0.004);
          break;
        case 'stomp':
          this.dust(at.x, at.y, 20, 1);
          this.rings.push({ x: at.x, y: at.y, r: 0, t: 0, max: 60, color: 0xb8a888 });
          this.shake(0.006);
          break;
        case 'quake':
          this.rings.push({ x: at.x, y: at.y, r: 0, t: 0, max: 200, color: 0x9a8a6a });
          this.rings.push({ x: at.x, y: at.y, r: -30, t: 0, max: 170, color: 0x7a6a50 });
          this.dust(at.x, at.y, 30, 1.6);
          this.shake(0.012);
          break;
        case 'breath':
          this.fireCone(e.x, e.y, e.tx, e.ty);
          break;
        case 'sever':
          this.burst(at.x, at.y - 30, [0x8a1a14, 0x6e1410, 0x4a0e0a], 18, 70);
          break;
        case 'seal':
          this.burst(at.x, at.y - 34, FIRE, 10, 30);
          break;
        case 'regrow':
          if (part) part.regrowAt = e.tick;
          this.burst(at.x, at.y - 30, [0x6a9a4a, 0x4f7a3a, 0xa0c070], 14, 40);
          break;
        case 'land':
        case 'trample':
          this.dust(at.x, at.y, 10, 0.8);
          break;
        case 'balk':
          this.burst(to.x, to.y - 20, [0xfff4c0, 0xe0c060], 12, 50);
          this.shake(0.005);
          break;
        case 'enrage':
          this.burst(at.x, at.y - 40, [0xff4030, 0xc02018], 24, 60);
          break;
        case 'goat':
          this.rings.push({ x: at.x, y: at.y, r: 0, t: 0, max: 70, color: 0xc06040 });
          break;
        case 'immune':
          this.burst(at.x + 4, at.y - 22, [0xffe890, 0xd7a440], 4, 30);
          break;
        case 'grab':
          this.burst(to.x, to.y - 10, [0x8ab8c0, 0xd8ecee], 10, 40);
          break;
        default:
          break;
      }
    }
  }

  // ------------------------------------------------------------------ every frame

  update(alpha: number, banner: boolean): void {
    const now = this.scene.time.now;
    const dt = Math.min(0.1, Math.max(0, (now - (this.last || now)) / 1000));
    this.last = now;
    const tick = this.sim.tick + alpha;
    for (const p of this.parts) this.figure(p, tick);
    this.flights(tick);
    this.burning();
    this.step(dt);
    this.draw();
    this.updateBar(banner);
  }

  private since(p: Part, act: string, tick: number): number {
    const t = p.last.get(act);
    return t === undefined ? Infinity : (tick - t) / TICK_RATE;
  }

  /** Swap in the special-move sheet when a signature move is on; flyers fly; heads regrow. */
  private figure(p: Part, tick: number): void {
    const v = p.v;
    const u = v.u;
    const s = this.st(u);
    if (!s || !v.spr.visible) return;
    let sp = -1;
    const cyc = (rate: number, n: number) => Math.floor((tick / TICK_RATE) * rate + u.id) % n;
    let lift = 0;
    if (u.state !== 'dead') {
      switch (p.id) {
        case 'cyclops':
        case 'titan': {
          const hurl = this.since(p, 'hurl', tick);
          const stomp = this.since(p, 'stomp', tick);
          const quake = this.since(p, 'quake', tick);
          if (s.mode === 1) sp = s.t < 7 ? 0 : 1;
          else if (hurl < 0.35) sp = 2;
          else if (stomp < 0.5) sp = stomp < 0.15 ? 3 : stomp < 0.32 ? 4 : 5;
          else if (quake < 0.7) sp = quake < 0.3 ? 6 : 7;
          break;
        }
        case 'minotaur': {
          const roar = this.since(p, 'enrage', tick);
          if (s.mode === 1) sp = cyc(10, 4);
          else if (s.stunOk > 0) sp = 4;
          else if (roar < 1.2) sp = 5 + (Math.floor(roar * 6) % 2);
          if (s.enraged && sp < 0) v.spr.setTint(Math.floor(this.scene.time.now / 120) % 2 ? 0xff8070 : 0xffb0a0);
          break;
        }
        case 'chimera': {
          const br = this.since(p, 'breath', tick);
          const goat = this.since(p, 'goat', tick);
          const tail = this.since(p, 'tail', tick);
          if (s.mode === 1) sp = s.t < 6 ? 0 : 1;
          else if (br < 0.55) sp = 2;
          else if (goat < 0.7) sp = goat < 0.35 ? 3 : 4;
          else if (tail < 0.4) sp = tail < 0.2 ? 5 : 6;
          break;
        }
        case 'harpy': {
          if (u.state === 'routing' || s.mode === 0 || s.mode === 3) sp = cyc(7, 4);
          else if (s.mode === 1) sp = 4 + cyc(8, 2);
          lift = s.alt * 46;
          break;
        }
        case 'nemean_lion':
          if (s.mode === 1) {
            sp = Math.min(2, Math.floor(s.t / 5));
            lift = Math.sin(Math.min(1, s.t / 14) * Math.PI) * 14;
          }
          break;
        case 'hydra_head': {
          const rg = (tick - p.regrowAt) / TICK_RATE;
          if (rg >= 0 && rg < 0.8) {
            sp = 2;
            v.spr.setScale(0.4 + rg * 0.75);
          } else v.spr.setScale(1);
          break;
        }
        case 'kraken_arm': {
          const g = this.since(p, 'grab', tick);
          if (g < 0.6) sp = Math.min(2, Math.floor(g * 5));
          break;
        }
      }
    } else if (p.id === 'hydra_head' || p.id === 'kraken_arm') {
      // a severed head lies where it fell, fading
      const dead = (tick - v.deathTick) / TICK_RATE;
      v.spr.setAlpha(Math.max(0.35, 1 - dead * 0.2));
    }
    if (u.state !== 'dead') v.spr.setAlpha(1);
    const frame = Number(v.spr.frame.name);
    if (sp >= 0) {
      ensureDollRow(this.scene, p.sp, v.dir);
      if (v.spr.texture.key !== p.sp || frame !== dollFrame(v.dir, sp)) v.spr.setTexture(p.sp, dollFrame(v.dir, sp));
    } else if (v.spr.texture.key !== v.key) v.spr.setTexture(v.key, frame);
    if (lift) {
      v.spr.setY(v.spr.y - Math.round(lift));
      v.spr.setDepth(v.spr.depth + 2000);
      v.shadow.setScale(0.6 * (1 - lift / 120) + 0.25);
    }
    if (p.id === 'harpy' && s.mode === 1 && u.state === 'ready' && Math.random() < 0.6) {
      // a dark streak behind the dive
      this.puffs.push({ x: v.spr.x + (Math.random() - 0.5) * 4, y: v.spr.y - 10, vx: -u.vx * 60, vy: -u.vy * 30, life: 0.35, max: 0.35, color: 0x3c3440, size: 2, ground: false });
    }
    if (p.id === 'minotaur' && s.mode === 1 && Math.random() < 0.7) this.dust(v.spr.x, v.spr.y, 1, 0.4);
  }

  private flights(tick: number): void {
    const fl = this.sim.myth!.flights;
    const seen = new Set<number>();
    for (const f of fl) {
      if (f.done) continue;
      seen.add(f.id);
      let r = this.rocks.get(f.id);
      if (!r) {
        const sh = this.scene.add.image(0, 0, 'shadow').setAlpha(0.35).setDepth(-60000);
        const img = this.scene.add.image(0, 0, 'myth_boulder').setOrigin(0.5, 0.85);
        this.world.add([sh, img]);
        r = { img, sh };
        this.rocks.set(f.id, r);
      }
      const k = Math.max(0, Math.min(1, (tick - f.t0) / f.dur));
      const a = isoToScreen(f.sx, f.sy);
      const b = isoToScreen(f.tx, f.ty);
      const x = a.x + (b.x - a.x) * k;
      const y = a.y + (b.y - a.y) * k;
      const h = Math.sin(Math.PI * k) * (50 + Math.hypot(b.x - a.x, b.y - a.y) * 0.25) + 64 * (1 - k);
      r.sh.setPosition(Math.round(x), Math.round(y)).setScale(0.5 + k * 0.7);
      r.img.setPosition(Math.round(x), Math.round(y - h)).setDepth(y + 3000).setAngle(k * 400);
      if (Math.random() < 0.3) this.puffs.push({ x: x, y: y - h, vx: 0, vy: 0, life: 0.3, max: 0.3, color: 0xa8987a, size: 1, ground: false });
    }
    for (const [id, r] of [...this.rocks]) {
      if (seen.has(id)) continue;
      r.img.destroy();
      r.sh.destroy();
      this.rocks.delete(id);
    }
  }

  /** Men on fire: flames flickering over them. */
  private burning(): void {
    const myth = this.sim.myth!;
    if (!myth.burns.size) return;
    for (const [id] of myth.burns) {
      const u = this.sim.units[id];
      if (!u || !this.sim.isAlive(u) || Math.random() > 0.5) continue;
      const p = isoToScreen(u.x, u.y);
      this.puffs.push({ x: p.x + (Math.random() - 0.5) * 8, y: p.y - 6 - Math.random() * 18, vx: (Math.random() - 0.5) * 6, vy: -22 - Math.random() * 14, life: 0.45, max: 0.45, color: FIRE[Math.floor(Math.random() * 3)], size: Math.random() < 0.4 ? 2 : 1, ground: false });
    }
  }

  private fireCone(x0: number, y0: number, x1: number, y1: number): void {
    const a = isoToScreen(x0, y0);
    const n = 70;
    const dx = x1 - x0;
    const dy = y1 - y0;
    for (let i = 0; i < n; i++) {
      const k = Math.random();
      const spread = (Math.random() - 0.5) * 1.1 * k;
      const px = x0 + dx * k - dy * spread;
      const py = y0 + dy * k + dx * spread;
      const p = isoToScreen(px, py);
      const vx = (p.x - a.x) * 1.4;
      const vy = (p.y - a.y) * 1.4;
      this.puffs.push({ x: a.x, y: a.y - 26, vx: vx + (Math.random() - 0.5) * 20, vy: vy - 10, life: 0.4 + k * 0.4, max: 0.4 + k * 0.4, color: FIRE[Math.min(4, Math.floor(k * 4 + Math.random()))], size: k > 0.5 ? 3 : 2, ground: false });
    }
  }

  private dust(x: number, y: number, n: number, k: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (20 + Math.random() * 40) * k;
      this.puffs.push({ x, y: y - 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - 8, life: 0.6 + Math.random() * 0.6, max: 1.2, color: DUST[i % 3], size: Math.random() < 0.5 ? 3 : 2, ground: true });
    }
  }

  private burst(x: number, y: number, colors: number[], n: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.puffs.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 20, life: 0.5, max: 0.5, color: colors[i % colors.length], size: 2, ground: false });
    }
  }

  private shake(k: number): void {
    this.scene.cameras.main.shake(220, k);
  }

  private step(dt: number): void {
    for (const p of this.puffs) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * (p.ground ? 2.5 : 1.2);
      p.vy = p.vy * (1 - dt * 1.5) + (p.ground ? -6 : 0) * dt;
    }
    this.puffs = this.puffs.filter((p) => p.life > 0);
    if (this.puffs.length > 600) this.puffs.splice(0, this.puffs.length - 600);
    for (const r of this.rings) {
      r.t += dt;
      r.r += dt * r.max * 2.2;
    }
    this.rings = this.rings.filter((r) => r.r < r.max);
    for (const c of this.craters) c.t += dt;
    this.craters = this.craters.filter((c) => c.t < 40);
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    for (const p of this.puffs) {
      g.fillStyle(p.color, Math.min(1, (p.life / p.max) * 1.4));
      g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    const gr = this.ground;
    gr.clear();
    for (const c of this.craters) {
      const a = c.t < 30 ? 0.45 : 0.45 * (1 - (c.t - 30) / 10);
      gr.fillStyle(0x2e261c, a);
      gr.fillEllipse(c.x, c.y, 26, 12);
      gr.fillStyle(0x5a4a36, a);
      gr.fillEllipse(c.x - 2, c.y - 1, 18, 7);
    }
    for (const r of this.rings) {
      if (r.r <= 0) continue;
      gr.lineStyle(2, r.color, Math.max(0, 1 - r.r / r.max) * 0.8);
      gr.strokeEllipse(r.x, r.y, r.r * 2, r.r);
    }
  }

  // ------------------------------------------------------------------ the boss bar

  private bodies(): SimUnit[] {
    return this.sim.units.filter((u) => u.side !== this.me && this.sim.myth!.isBody(u));
  }

  private buildBar(vw: number, top: number): void {
    const bodies = this.bodies();
    if (!bodies.length) return;
    const c = this.scene.add.container(0, 0);
    const x = 3;
    const y = top + 3;
    const w = vw - 3 - 24 - 3 - 6;
    this.barW = w;
    c.add(addPanel(this.scene, x, y, w, 20, 'parch'));
    const id = bodies[0].stats.boss as MythId;
    const name = bodies.length > 1 ? tOr(`myth.flock.${id}`, `${MYTHS[id].name} flock`) : tOr(`class.${id}.name`, MYTHS[id].name);
    c.add(addText(this.scene, x + 4, y + 3, ellipsize(name, w - 50), 'red'));
    const g = this.scene.add.graphics();
    c.add(g);
    this.barG = g;
    c.setPosition(0, 0);
    this.ui.add(c);
    this.bar = c;
  }

  private updateBar(banner: boolean): void {
    const c = this.bar;
    const g = this.barG;
    if (!c || !g) return;
    c.setVisible(!banner);
    const bodies = this.bodies();
    let hp = 0;
    let max = 0;
    for (const b of bodies) {
      hp += Math.max(0, b.hp);
      max += b.stats.maxHp;
    }
    const parts = this.sim.units.filter((u) => u.side !== this.me && isMythId(u.stats.boss) && !this.sim.myth!.isBody(u));
    const flock = bodies.length > 1;
    const x = 3;
    const y = (c.list[0] as Phaser.GameObjects.GameObject & { y: number }).y;
    const w = this.barW;
    g.clear();
    const bx = x + 4;
    const by = y + 12;
    const bw = w - 8;
    g.fillStyle(0x2a1a16, 1);
    g.fillRect(bx, by, bw, 5);
    const f = max > 0 ? hp / max : 0;
    const enraged = bodies.some((b) => this.st(b)?.enraged);
    g.fillStyle(enraged ? 0xe05040 : 0xa83a2c, 1);
    g.fillRect(bx, by, Math.round(bw * f), 5);
    g.fillStyle(0xffffff, 0.25);
    g.fillRect(bx, by, Math.round(bw * f), 1);
    // pips: heads / arms alive, or flock members still fighting
    const pips = flock ? bodies.map((b) => b.state === 'ready') : parts.map((p) => p.state === 'ready');
    const pw = 5;
    let px = x + w - 4 - pips.length * (pw + 1);
    for (const alive of pips) {
      g.fillStyle(alive ? 0x4f7a3a : 0x3a2a22, 1);
      g.fillRect(px, y + 4, pw, 5);
      px += pw + 1;
    }
  }

  destroy(): void {
    this.bar?.destroy();
    for (const r of this.rocks.values()) {
      r.img.destroy();
      r.sh.destroy();
    }
  }
}
