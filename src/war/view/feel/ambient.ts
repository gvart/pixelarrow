/**
 * E4 ambient life, view only (no sim units, nothing the sim or the picking sees):
 *  - smoke: thin puffs from the chimneys, roofs, hearths and campfires of the finished buildings drawn this frame
 *    (../build/buildingLayer.ts hearths, ./hearths.ts), rising and drifting with one breeze, growing and thinning;
 *    about two roofs in three smoke.
 *  - birds: small flocks crossing the view now and then, their shadows on the ground; little groups pecking on open
 *    ground (placed per 24-tile cell by the region, so the same spots each time) that take off and scatter away from
 *    men coming near (moving or fighting), back after a while.
 *  - townsfolk: in a team's town of level 2 up (W-61 townLevels), a few of its people walk between its buildings and
 *    stand a while at each (../units.ts paint: the civilian sheets); indoors while a fight is in the town.
 * Cheap: tiny procedural textures (made once), pooled images, culled to the view, nothing allocated a frame.
 */
import Phaser from 'phaser';
import type { BuildingSnap, RegionData, Snapshot } from '../../types';
import type { DrawUnit } from '../simClient';
import type { IsoMap } from '../iso';
import { BUILDINGS } from '../../sim/economy';
import type { Hearth } from './hearths';

type View = { x: number; y: number; right: number; bottom: number };

/** What the layer needs from the scene. */
export interface AmbientHost {
  hearths: () => { readonly hearths: readonly Hearth[]; readonly nh: number };
  paint: (img: Phaser.GameObjects.Image, cls: string, clip: string, ms: number, dx: number, dy: number, x: number, y: number, depth: number, team: number) => boolean;
  depthAt: (x: number, y: number) => number;
}

const PUFF = 'amb-puff', BIRD = 'amb-bird';
/** Live puffs at most, and their life (ms). */
const PUFFS = 220, LIFE = 3400;
/** Emission period (ms) by hearth kind. */
const PERIOD = { chimney: 420, roof: 560, fire: 330 } as const;
/** Smoke over every sprite, under the HUD's world marks (as the siege layer's smoke). */
const SMOKE_DEPTH = 10.88, SKY_DEPTH = 10.95;
const BIRDS = 72;
/** Px a flying bird is above its shadow. */
const ALT = 70;
/** A perched group's cell size (tiles), share of cells with one, scare radius (tiles), time away (ms). */
const CELL = 24, PERCH = 0.3, SCARE = 6, AWAY = 45000;
const CIV = ['civ_cook', 'civ_merchant', 'civ_forager', 'civ_smith', 'civ_physician', 'civ_engineer'];
const WALKERS = 6;

const hash = (a: number, b: number, c = 0): number => {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** The puff (5 sizes) and bird (3 wing beats, 2 perched, a shadow) frames, drawn once. */
function makeTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(PUFF)) {
    const t = scene.textures.createCanvas(PUFF, 5 * 16, 16)!, c = t.context;
    const sizes = [3, 4.5, 5.5, 6.5, 7.5];
    sizes.forEach((r, i) => {
      const cx = i * 16 + 8, cy = 8;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const dx = x + 0.5 - 8, dy = y + 0.5 - cy, d = Math.hypot(dx, dy * 1.1);
        if (d > r) continue;
        // lit from the top left: a light cap, a mid body, a shaded rim; the bigger, the more broken its edge
        const lit = -dx * 0.5 - dy * 0.7 > r * 0.25, rim = d > r - 1.2;
        if (rim && i >= 2 && hash(x, y, i) < 0.35) continue;
        c.fillStyle = lit ? '#f2efe8' : rim ? '#b9b4ab' : '#d9d5cd';
        c.fillRect(cx - 8 + x, y, 1, 1);
      }
      t.add(i, 0, i * 16, 0, 16, 16);
    });
    t.refresh();
  }
  if (!scene.textures.exists(BIRD)) {
    // 16 x 10 cells: flying (wings up, level, down; from the side and a little above), perched (standing, pecking),
    // the shadow. x: body, w: the wing's lighter top, b: the beak.
    const FR = [
      ['x.............x', '.x...........x.', '.wx.........xw.', '..wx.......xw..', '...xx.....xx...', '....xxx.xxx....', '.....bxxxxx....', '.......xx......'],
      ['', '', '', 'xx...........xx', '.wwxx.....xxww.', '....xxxxxxx....', '....bxxxxxx....', '.......xx......'],
      ['', '', '', '', '.....bxxxxx....', '....xxxxxxx....', '...xw..xx.wx...', '..xw.......wx..', '.x...........x.'],
      ['', '', '..xx', '.xxxx', 'bxxxxxx', '..xwwwxx', '...xxxxxx', '....x.x', '....x.x'],
      ['', '', '', '', '...xwwxx', '..xxxxxxxx', '.xxxx.xx', 'bxx.x.x', '....x.x'],
    ];
    const W = 16, H = 10, t = scene.textures.createCanvas(BIRD, W * 6, H)!, c = t.context;
    const col: Record<string, string> = { x: '#24201d', w: '#4b443e', b: '#6b5a40' };
    FR.forEach((rows, f) => rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (!col[ch]) return;
      c.fillStyle = col[ch];
      c.fillRect(f * W + x, y + 1, 1, 1);
    })));
    c.fillStyle = '#000000'; // the shadow: a soft dash
    c.fillRect(5 * W + 4, 4, 8, 2);
    c.fillRect(5 * W + 6, 3, 4, 4);
    for (let i = 0; i < 6; i++) t.add(i, 0, i * W, 0, W, H);
    t.refresh();
  }
  scene.textures.get(PUFF).setFilter(Phaser.Textures.FilterMode.NEAREST);
  scene.textures.get(BIRD).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

interface Puff { img: Phaser.GameObjects.Image; x: number; y: number; t0: number; life: number; drift: number; seed: number; tint: number; on: boolean }
interface Bird { img: Phaser.GameObjects.Image; sh: Phaser.GameObjects.Image; on: boolean }
interface Flock { on: boolean; x: number; y: number; vx: number; vy: number; n: number; t0: number; seed: number; alt: number }
interface Perch { key: number; x: number; y: number; n: number; depth: number }
interface Walker {
  img: Phaser.GameObjects.Image; sh: Phaser.GameObjects.Image; cls: string; town: number;
  x: number; y: number; tx: number; ty: number; wait: number; from: number; dx: number; dy: number; t0: number;
}

export class AmbientLayer {
  private puffs: Puff[] = [];
  private nextPuff = 0;
  private birds: Bird[] = [];
  private flocks: Flock[] = [];
  /** View clock of the next crossing flock (scripts may set 0 for one now). */
  nextFlock = 0;
  private perches: Perch[] = [];
  private nPerch = 0;
  /** Perch cells whose birds flew, until when (view clock). */
  private gone = new Map<number, number>();
  private walkers: Walker[] = [];
  private towns = new Map<number, { x: number; y: number; r: number; team: number; doors: number[]; fight: boolean }>();
  private last = 0;
  private frame = 0;
  private wind: number;
  /** For scripts: puffs, birds and townsfolk drawn last frame. */
  readonly stats = { puffs: 0, birds: 0, folk: 0 };

  constructor(private scene: Phaser.Scene, private iso: IsoMap, private region: RegionData, private host: AmbientHost) {
    makeTextures(scene);
    this.wind = (hash(region.w, region.h, 7) - 0.5) * 16; // px a second, one breeze for the region
  }

  update(view: View, zoom: number, now: number, cur: Snapshot | null, units: readonly DrawUnit[]): void {
    const dt = Math.min(100, now - (this.last || now));
    this.frame++;
    this.smoke(view, now);
    this.flying(view, zoom, now, dt);
    if (this.frame % 6 === 0) this.perch(view, now, units);
    this.drawPerches(now);
    this.folk(view, now, dt, cur);
    this.last = now;
  }

  // ---------------------------------------------------------------- smoke

  private smoke(view: View, now: number): void {
    const { hearths: list, nh: n } = this.host.hearths(), prev = this.last || now;
    for (let i = 0; i < n; i++) {
      const h = list[i], s = h.id * 97 + 13;
      if (h.kind === 'roof' && hash(h.id, 3) > 0.66) continue;
      if (h.x < view.x - 40 || h.x > view.right + 40 || h.y < view.y - 40 || h.y > view.bottom + 200) continue;
      const p = PERIOD[h.kind] * (0.85 + 0.3 * hash(h.id, 5));
      if (Math.floor((now + s) / p) === Math.floor((prev + s) / p)) continue;
      this.emit(h, now);
    }
    let live = 0;
    for (const q of this.puffs) {
      if (!q.on) continue;
      const age = (now - q.t0) / q.life;
      if (age >= 1) { q.on = false; q.img.setVisible(false); continue; }
      live++;
      const t = (now - q.t0) / 1000, rise = 18 + 6 * q.seed;
      const x = q.x + q.drift * t * (0.4 + age) + Math.sin(t * 1.7 + q.seed * 6) * 2.5 * age, y = q.y - rise * t * (1 - 0.25 * age);
      const a = (age < 0.12 ? age / 0.12 : 1 - (age - 0.12) / 0.88) * 0.62;
      q.img.setPosition(Math.round(x), Math.round(y)).setFrame(Math.min(4, Math.floor(age * 5.5))).setAlpha(a);
    }
    this.stats.puffs = live;
  }

  private emit(h: Hearth, now: number): void {
    let q: Puff | undefined;
    for (let k = 0; k < this.puffs.length; k++) {
      const c = this.puffs[(this.nextPuff + k) % this.puffs.length];
      if (!c.on) { q = c; this.nextPuff = (this.nextPuff + k + 1) % this.puffs.length; break; }
    }
    if (!q) {
      if (this.puffs.length >= PUFFS) return;
      q = { img: this.scene.add.image(0, 0, PUFF, 0).setDepth(SMOKE_DEPTH), x: 0, y: 0, t0: 0, life: 0, drift: 0, seed: 0, tint: 0, on: false };
      this.puffs.push(q);
    }
    const r = hash(h.id, now | 0);
    q.on = true;
    q.x = h.x + (r - 0.5) * 3;
    q.y = h.y;
    q.t0 = now;
    q.life = LIFE * (0.75 + 0.5 * r) * (h.kind === 'fire' ? 0.8 : 1);
    q.drift = this.wind + (r - 0.5) * 4;
    q.seed = r;
    q.img.setTint(h.kind === 'fire' ? 0xb0aaa2 : 0xe4e0d8).setVisible(true).setAlpha(0).setFrame(0).setPosition(q.x, q.y);
  }

  // ---------------------------------------------------------------- birds

  /** A bird image and its shadow from the pool (null: the pool is spent this frame). */
  private bird(i: number): Bird | null {
    if (i >= BIRDS) return null;
    let b = this.birds[i];
    if (!b) {
      b = { img: this.scene.add.image(0, 0, BIRD, 0).setDepth(SKY_DEPTH), sh: this.scene.add.image(0, 0, BIRD, 5).setDepth(9.02).setAlpha(0.22), on: false };
      this.birds.push(b);
    }
    return b;
  }
  private nBird = 0;

  private flying(view: View, zoom: number, now: number, dt: number): void {
    this.nBird = 0;
    if (now > this.nextFlock && zoom >= 0.5) {
      this.nextFlock = now + 14000 + 18000 * Math.random();
      this.launch(view, now, null);
    }
    const w = view.right - view.x, h = view.bottom - view.y;
    for (const f of this.flocks) {
      if (!f.on) continue;
      f.x += (f.vx * dt) / 1000;
      f.y += (f.vy * dt) / 1000;
      if (f.alt < ALT) f.alt = Math.min(ALT, f.alt + dt * 0.05); // scattered birds climb as they go
      // a flock gone a screen past the view is done
      if (f.x < view.x - w || f.x > view.right + w || f.y < view.y - h || f.y > view.bottom + h) { f.on = false; continue; }
      const sp = Math.hypot(f.vx, f.vy) || 1, ux = f.vx / sp, uy = f.vy / sp;
      for (let i = 0; i < f.n; i++) {
        // a loose V: each bird behind the lead, off to its side, bobbing on its own beat
        const side = i % 2 ? 1 : -1, row = Math.ceil(i / 2), j = hash(f.seed, i);
        const bx = f.x - ux * row * 9 + -uy * side * row * 7 + (j - 0.5) * 6, by = f.y - uy * row * 9 + ux * side * row * 7 + Math.sin(now / 300 + j * 9) * 2;
        if (bx < view.x - 20 || bx > view.right + 20 || by - f.alt < view.y - 20 || by > view.bottom + 20) continue;
        const b = this.bird(this.nBird++);
        if (!b) break;
        const beat = Math.floor(now / (110 + 40 * j) + j * 5) % 4, frame = beat === 3 ? 1 : beat;
        b.img.setFrame(frame).setPosition(Math.round(bx), Math.round(by - f.alt)).setFlipX(f.vx < 0).setVisible(true).setAlpha(1);
        b.sh.setPosition(Math.round(bx), Math.round(by)).setVisible(true);
      }
    }
  }

  /** A flock taking wing: across the view from an edge, or (from a perch) away from `from`. */
  private launch(view: View, now: number, perch: { x: number; y: number; n: number; fx: number; fy: number } | null): void {
    let f = this.flocks.find((q) => !q.on);
    if (!f) this.flocks.push((f = { on: false, x: 0, y: 0, vx: 0, vy: 0, n: 0, t0: 0, seed: 0, alt: ALT }));
    f.on = true;
    f.t0 = now;
    f.seed = (now * 7919) | 0;
    if (perch) {
      const dx = perch.x - perch.fx, dy = perch.y - perch.fy, d = Math.hypot(dx, dy) || 1;
      f.x = perch.x;
      f.y = perch.y;
      f.vx = (dx / d) * 120;
      f.vy = (dy / d) * 120 - 20;
      f.n = perch.n;
      f.alt = 12; // they rise as they go
      return;
    }
    const left = Math.random() < 0.5, y = view.y + (view.bottom - view.y) * (0.15 + 0.7 * Math.random());
    f.x = left ? view.x - 30 : view.right + 30;
    f.y = y + ALT;
    f.vx = (left ? 1 : -1) * (70 + 30 * Math.random());
    f.vy = (Math.random() - 0.5) * 30;
    f.n = 4 + Math.floor(Math.random() * 6);
    f.alt = ALT;
  }

  /** Each sixth frame: the perched groups in view (one per lucky cell, on open dry ground), scattered by men near. */
  private perch(view: View, now: number, units: readonly DrawUnit[]): void {
    const r = this.region, iso = this.iso;
    this.nPerch = 0;
    const a = iso.pick(view.x, view.y), b = iso.pick(view.right, view.y), c = iso.pick(view.x, view.bottom), d = iso.pick(view.right, view.bottom);
    const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x, d.x) / CELL)), x1 = Math.floor(Math.min(r.w - 1, Math.max(a.x, b.x, c.x, d.x)) / CELL);
    const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y, d.y) / CELL)), y1 = Math.floor(Math.min(r.h - 1, Math.max(a.y, b.y, c.y, d.y)) / CELL);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 120) return; // zoomed far out: none
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const key = cy * 4096 + cx;
      if (hash(cx, cy, 11) > PERCH) continue;
      const until = this.gone.get(key);
      if (until !== undefined) { if (now < until) continue; this.gone.delete(key); }
      const tx = cx * CELL + 2 + hash(cx, cy, 12) * (CELL - 4), ty = cy * CELL + 2 + hash(cx, cy, 13) * (CELL - 4);
      const k = Math.floor(ty) * r.w + Math.floor(tx);
      if (r.water[k] !== 0 || r.terrain[k] === 'forest' || r.terrain[k] === 'rock' || r.terrain[k] === 'snow') continue;
      const sx = iso.sx(tx, ty), sy = iso.sy(tx, ty, iso.zAt(tx, ty));
      if (sx < view.x - 30 || sx > view.right + 30 || sy < view.y - 30 || sy > view.bottom + 30) continue;
      // men moving or fighting near: up they go, away from the nearest
      let near: DrawUnit | null = null, nd = SCARE * SCARE;
      for (const u of units) {
        const st = u.u.state;
        if (st !== 'move' && st !== 'attack') continue;
        const e = (u.x - tx) ** 2 + (u.y - ty) ** 2;
        if (e < nd) (nd = e), (near = u);
      }
      const n = 3 + Math.floor(hash(cx, cy, 14) * 5);
      if (near) {
        this.gone.set(key, now + AWAY);
        this.launch(view, now, { x: sx, y: sy, n, fx: iso.sx(near.x, near.y), fy: iso.sy(near.x, near.y, iso.zAt(near.x, near.y)) });
        continue;
      }
      const p = this.perches[this.nPerch] ?? this.perches[this.perches.push({ key: 0, x: 0, y: 0, n: 0, depth: 0 }) - 1];
      this.nPerch++;
      p.key = key;
      p.x = sx;
      p.y = sy;
      p.n = n;
      p.depth = 10 + this.host.depthAt(tx, ty) / 4096 + 0.25;
    }
  }

  private drawPerches(now: number): void {
    for (let k = 0; k < this.nPerch; k++) for (let i = 0, p = this.perches[k]; i < p.n; i++) {
      const b = this.bird(this.nBird++);
      if (!b) break;
      const j = hash(p.key, i), bx = p.x + (j - 0.5) * 34, by = p.y + (hash(p.key, i, 1) - 0.5) * 16;
      const peck = Math.floor(now / 380 + j * 13) % 5 === 0, hop = Math.floor(now / 2600 + j * 7) % 3; // hop a little now and then
      b.img.setFrame(peck ? 4 : 3).setPosition(Math.round(bx + hop * 2), Math.round(by)).setFlipX(j < 0.5).setVisible(true).setAlpha(1).setDepth(p.depth + i * 1e-7);
      b.sh.setVisible(false);
    }
    this.stats.birds = this.nBird;
    for (let i = this.nBird; i < this.birds.length; i++) { this.birds[i].img.setVisible(false); this.birds[i].sh.setVisible(false); }
  }

  // ---------------------------------------------------------------- townsfolk

  private folk(view: View, now: number, dt: number, cur: Snapshot | null): void {
    if (cur && this.frame % 30 === 1) this.townsOf(cur);
    let shown = 0;
    for (const w of this.walkers) {
      const t = this.towns.get(w.town);
      if (!t) { w.img.setVisible(false); w.sh.setVisible(false); continue; }
      // walk to the next door, stand a while, pick another
      if (w.wait > 0) w.wait -= dt;
      else {
        const dx = w.tx - w.x, dy = w.ty - w.y, d = Math.hypot(dx, dy), step = (1.05 * dt) / 1000;
        if (d <= step) {
          w.x = w.tx;
          w.y = w.ty;
          w.wait = 2500 + 4000 * hash(w.t0, now | 0);
          this.nextDoor(w, t.doors, now);
        } else {
          w.x += (dx / d) * step;
          w.y += (dy / d) * step;
          w.dx = dx;
          w.dy = dy;
        }
      }
      const iso = this.iso, fx = iso.sx(w.x, w.y), fy = iso.sy(w.x, w.y, iso.zDraw(w.x, w.y));
      if (t.fight || fx < view.x - 60 || fx > view.right + 60 || fy < view.y - 20 || fy > view.bottom + 90) { w.img.setVisible(false); w.sh.setVisible(false); continue; }
      const depth = 10 + this.host.depthAt(w.x, w.y) / 4096 + 0.25;
      if (!this.host.paint(w.img, w.cls, w.wait > 0 ? 'idle' : 'walk', now + w.t0, w.dx, w.dy, fx, fy, depth, t.team)) { w.img.setVisible(false); w.sh.setVisible(false); continue; }
      if (w.sh.texture.key !== 'war-shadow' && this.scene.textures.exists('war-shadow')) w.sh.setTexture('war-shadow');
      w.sh.setPosition(Math.round(fx), Math.round(fy)).setVisible(w.sh.texture.key === 'war-shadow');
      shown++;
    }
    this.stats.folk = shown;
  }

  private nextDoor(w: Walker, doors: number[], now: number): void {
    const n = doors.length / 2;
    if (n < 2) return;
    let k = Math.floor(hash(w.t0, now | 0, 3) * n);
    if (k === w.from) k = (k + 1) % n;
    w.from = k;
    w.tx = doors[2 * k];
    w.ty = doors[2 * k + 1];
  }

  /** Twice a second: the towns of level 2 up, their doors, a fight in them; townsfolk added or sent home to match. */
  private townsOf(cur: Snapshot): void {
    const seen = new Set<number>();
    for (const tl of cur.townLevels ?? []) {
      if (tl.level < 2) continue;
      const id = Math.round(tl.x) * 4096 + Math.round(tl.y);
      seen.add(id);
      let t = this.towns.get(id);
      if (!t) this.towns.set(id, (t = { x: tl.x, y: tl.y, r: tl.r, team: tl.team, doors: [], fight: false }));
      t.doors.length = 0;
      for (const b of cur.buildings ?? []) if (this.door(b, tl)) t.doors.push(b.x + b.w / 2, b.y + b.h + 0.6);
      t.fight = cur.units.some((u) => u.state === 'attack' && (u.x - tl.x) ** 2 + (u.y - tl.y) ** 2 < tl.r * tl.r);
      const want = Math.min(WALKERS, 1 + tl.level, Math.max(0, t.doors.length / 2 - 1));
      let have = 0;
      for (const w of this.walkers) if (w.town === id) have++;
      for (let i = have; i < want; i++) this.addWalker(id, t.doors, i);
    }
    for (const id of [...this.towns.keys()]) if (!seen.has(id)) this.towns.delete(id);
    // a town gone (or shrunk): its townsfolk go home
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i], t = this.towns.get(w.town);
      let mine = 0;
      for (let j = 0; j < i; j++) if (this.walkers[j].town === w.town) mine++;
      if (!t || mine >= Math.min(WALKERS, t.doors.length / 2 - 1)) {
        w.img.destroy();
        w.sh.destroy();
        this.walkers.splice(i, 1);
      }
    }
  }

  private door(b: BuildingSnap, t: { x: number; y: number; r: number; team: number }): boolean {
    if (b.team !== t.team || (b.state !== 'done' && b.state !== 'damaged')) return false;
    const def = BUILDINGS[b.type];
    if (!def || def.wall || def.field || def.access || def.bridge || def.brazier || b.type === 'chest') return false;
    return (b.x + b.w / 2 - t.x) ** 2 + (b.y + b.h / 2 - t.y) ** 2 < t.r * t.r;
  }

  private addWalker(town: number, doors: number[], i: number): void {
    const n = doors.length / 2, k = Math.floor(hash(town, i, 21) * n);
    const w: Walker = {
      img: this.scene.add.image(0, 0, PUFF).setVisible(false),
      sh: this.scene.add.image(0, 0, this.scene.textures.exists('war-shadow') ? 'war-shadow' : PUFF).setTint(0x000000).setAlpha(0.28).setDepth(9.01).setVisible(false),
      cls: CIV[Math.floor(hash(town, i, 22) * CIV.length)], town, x: doors[2 * k], y: doors[2 * k + 1], tx: 0, ty: 0,
      wait: 800 * i, from: k, dx: 1, dy: 0, t0: (hash(town, i, 23) * 1e6) | 0,
    };
    this.nextDoor(w, doors, w.t0);
    this.walkers.push(w);
  }
}
