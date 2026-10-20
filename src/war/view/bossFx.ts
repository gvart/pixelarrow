/**
 * Boss FX (ART-L, PROMPTS_ART.md 40d): what makes a landmark guardian's fight read as a set piece, on top of its sheet.
 * Everything is driven by the snapshot (src/war/sim/bosses.ts BossSnap: the move it makes now, its phase, its state) and
 * stays in the view: the sim is never paused or moved.
 *  - moves: Drakon's breath as a jet from the mouth onto a ground cone that leaves fire and smoke behind; sweeps and
 *    blows with a slash and sparks; thrown rocks on an arc with a shadow and a target ring, landing in a dust crater;
 *    the crash, stomps and smashes as heavy impacts; Scylla's heads in splashes.
 *  - telegraphs: a move with a cadence (MOVES) is foreseen from the last one: a red ground ring filling before a sweep,
 *    stomp or smash, the mouth glowing and embers drawn in before a breath, the crash's landing marked while he dives.
 *  - impact: camera shake from a decaying trauma (squared), scaled by the distance to the screen centre and the zoom;
 *    hit-stop (the FX clock and the guardian's frame hold for ~0.1 s); squash and stretch of the guardian (./units.ts pose).
 *  - phases: a roar (stretch), a camera nudge towards it and the phase's own beat: Drakon's wing-beat dust taking off and
 *    his enraged aura, Gyges' chains bursting in sparks, Scylla's heads bursting from the sea, the King's war horn, the
 *    Maenad Queen's frenzy; deaths: a collapse impact, then a beam of light on the loot pile.
 *  - audio hooks: every beat calls `onCue(name, x, y)` (names in CUES) for SFX later.
 * Pooled sprites, a cap on live FX and LOD by zoom (fewer fires and no smoke or embers zoomed out) keep the 600-unit fps.
 */
import Phaser from 'phaser';
import type { BossSnap, GuardianEntry } from '../types';
import { MOVES } from '../sim/bosses';
import { HH, HW } from './iso';
import type { DrawnAs } from './units';

/** Audio-ready event names (`boss.<id>.<beat>` and the shared ones). */
export const CUES = [
  'boss.breath', 'boss.breath.charge', 'boss.sweep', 'boss.smash', 'boss.stomp', 'boss.throw', 'boss.impact', 'boss.crash',
  'boss.snatch', 'boss.takeoff', 'boss.land', 'boss.roar', 'boss.phase', 'boss.chains', 'boss.splash', 'boss.horn',
  'boss.frenzy', 'boss.enrage', 'boss.slain', 'boss.loot',
] as const;
export type Cue = (typeof CUES)[number];

interface Strip { key: string; frames: number; fps: number; ax: number; ay: number; loop: boolean; add: boolean }
interface Play {
  id: string; x: number; y: number; depth: number; t0: number; sx: number; sy: number; rot: number; flip: boolean;
  alpha: number; tint: number; until: number; fade: number; minor: boolean;
}
interface Mem {
  phase: number; state: BossSnap['state']; fx: string; hp: number; x: number; y: number;
  /** View clock (ms) of the last move of each kind. */
  last: Record<string, number>;
  /** The last breath's direction (tiles). */
  dir: [number, number];
  /** The move whose rock has landed, the breath whose charge was cued. */
  landed: string;
  charged: number;
}
interface Pose { t0: number; kind: 'roar' | 'squash' | 'flash'; until: number }
/** What the layer needs from the scene each frame. */
export interface FxCtx {
  feet: (d: { x: number; y: number; u?: { id: number } }) => { x: number; y: number };
  lift: (unit: number) => number;
  zoom: number; now: number; sinceSnap: number;
  view: { x: number; y: number; right: number; bottom: number };
  /** How a guardian's unit was drawn this frame (./units.ts drawnAs): its mouth and silhouette. */
  drawn: (unit: number) => DrawnAs | undefined;
}
/** A guardian's mouth per frame of a clip (public/war/guardians.json `mouth`), frame px, by east row. */
interface Mouth { clip: string; se: [number, number][]; ne: [number, number][] }
/** The jet's segments (strip copies along the curve) and its embers. */
const JET_SEGS = 7;
const EMBERS = 28;

/** Draw scale over a man's (guardians.json scale / 0.55). */
const SIZE: Record<string, number> = { drakon: 1.5 / 0.55, titan: 1.8, brontes: 1.8, gyges: 1.8, scylla: 1.8, river_god: 1.8 };
const size = (id: string) => SIZE[id] ?? 1;
/** Cadence (ms) of the moves a telegraph foresees, by guardian. */
const EVERY: Record<string, Partial<Record<string, number>>> = {
  drakon: { sweep: MOVES.sweep.every * 100, breath: MOVES.breath.every * 100 },
  titan: { stomp: MOVES.stomp.every * 100 },
  brontes: { smash: MOVES.smash.every * 100 },
  scylla: { snatch: MOVES.snatch.every * 100 },
};
const TELEGRAPH = 900;
const MAX_PLAYS = 90;
const TICK = 100;

export class BossFx {
  /** A slain guardian's body, gone from the snapshot, played falling where it fell (./units.ts addCorpse). */
  corpse: ((cls: string, x: number, y: number, facing: number) => void) | null = null;
  /** The body as last seen, by unit. */
  private bodies = new Map<number, { cls: string; facing: number }>();
  /** Audio hook: every beat (see CUES), at a tile point. */
  onCue: ((name: Cue, x: number, y: number, boss: string) => void) | null = null;
  private strips = new Map<string, Strip>();
  private plays: Play[] = [];
  private sprites: Phaser.GameObjects.Sprite[] = [];
  private mem = new Map<number, Mem>();
  private poses = new Map<number, Pose>();
  /** Ground decals (scorch) fading out. */
  private scorch: { x: number; y: number; r: number; t0: number }[] = [];
  private g: Phaser.GameObjects.Graphics;
  private top: Phaser.GameObjects.Graphics;
  /** FX clock: the view clock less hit-stops. */
  private clock = 0;
  private lastNow = 0;
  private stopUntil = 0;
  private trauma = 0;
  private nudge: { x: number; y: number; t0: number } | null = null;
  private shook = { x: 0, y: 0 };
  private ctx: FxCtx | null = null;
  private mouths = new Map<string, Mouth>();
  /** Additive light the breath throws on the ground. */
  private glow: Phaser.GameObjects.Graphics;
  /** A set piece the boss camera frames (a phase change, the crash, a death): the unit, where, until (view clock). */
  setPiece: { unit: number; x: number; y: number; until: number } | null = null;

  constructor(private scene: Phaser.Scene, private entries: readonly GuardianEntry[]) {
    this.g = scene.add.graphics().setDepth(9.07);
    this.top = scene.add.graphics().setDepth(10.96);
    this.glow = scene.add.graphics().setDepth(9.08).setBlendMode(Phaser.BlendModes.ADD);
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const fx = (await (await fetch('war/fx/objects.json')).json()) as { fx: { id: string; file: string; frames: number; fps: number; loop: boolean; blend?: string; frame: { w: number; h: number }; anchor: { x: number; y: number } }[] };
      for (const f of fx.fx) {
        const key = `gd-fx-${f.id}`;
        if (!this.scene.textures.exists(key)) {
          const im = new Image();
          await new Promise((ok, fail) => { im.onload = ok; im.onerror = fail; im.src = `war/fx/${f.file}`; });
          if (!this.scene.textures.exists(key)) this.scene.textures.addSpriteSheet(key, im, { frameWidth: f.frame.w, frameHeight: f.frame.h });
        }
        this.strips.set(f.id, { key, frames: f.frames, fps: f.fps, ax: f.anchor.x / f.frame.w, ay: f.anchor.y / f.frame.h, loop: f.loop, add: f.blend === 'add' });
      }
    } catch (e) {
      console.warn('[bossFx] strips', e);
    }
    try {
      const gd = (await (await fetch('war/guardians.json')).json()) as { guardians: Record<string, { mouth?: { clip: string; 'south-east': [number, number][]; 'north-east': [number, number][] } }> };
      for (const [id, e] of Object.entries(gd.guardians)) if (e.mouth) this.mouths.set(id, { clip: e.mouth.clip, se: e.mouth['south-east'], ne: e.mouth['north-east'] });
    } catch (e) {
      console.warn('[bossFx] guardians', e);
    }
  }

  /** The breath is coming within `ms` (the guardian opens its mouth on cue: ./guardians.ts clip). */
  breathIn(unit: number, id: string, now: number, ms: number): boolean {
    const m = this.mem.get(unit), every = EVERY[id]?.breath;
    if (!m || !every || m.last.breath === undefined) return false;
    const left = m.last.breath + every - now;
    return left > 0 && left < ms;
  }
  private piece(unit: number, x: number, y: number, ms: number): void {
    this.setPiece = { unit, x, y, until: (this.ctx?.now ?? 0) + ms };
  }

  /** Each frame, a guardian's body as the snapshot has it (for its corpse). */
  saw(unit: number, cls: string, facing: number): void {
    const b = this.bodies.get(unit);
    if (b) (b.cls = cls), (b.facing = facing);
    else this.bodies.set(unit, { cls, facing });
  }

  // --- the feel: shake, hit-stop, nudge, poses ---

  /** Trauma at a tile point: less the farther it is from the screen centre (gone past ~1.3 screens). */
  private shake(amount: number, x: number, y: number): void {
    const c = this.ctx;
    if (!c) return;
    const p = c.feet({ x, y }), cx = (c.view.x + c.view.right) / 2, cy = (c.view.y + c.view.bottom) / 2;
    const span = Math.hypot(c.view.right - c.view.x, c.view.bottom - c.view.y) * 0.65;
    const k = Math.max(0, 1 - Math.hypot(p.x - cx, p.y - cy) / (span * 1.3));
    this.trauma = Math.min(1, this.trauma + amount * k);
  }
  private hitStop(ms: number): void {
    this.stopUntil = Math.max(this.stopUntil, (this.ctx?.now ?? 0) + ms);
  }
  private pose(unit: number, kind: Pose['kind'], ms: number): void {
    const now = this.ctx?.now ?? 0;
    this.poses.set(unit, { t0: now, kind, until: now + ms });
  }
  /** A short camera push towards a tile point (eases out and back; the player's camera is never taken). */
  private push(x: number, y: number): void {
    const c = this.ctx;
    if (!c) return;
    const p = c.feet({ x, y }), cx = (c.view.x + c.view.right) / 2, cy = (c.view.y + c.view.bottom) / 2;
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d > Math.hypot(c.view.right - c.view.x, c.view.bottom - c.view.y) * 0.6) return; // off screen: no nudge
    const k = Math.min(0.18, 90 / c.zoom / Math.max(1, d));
    this.nudge = { x: (p.x - cx) * k, y: (p.y - cy) * k, t0: c.now };
  }

  /** The guardian's squash, stretch, flash and held frame (./units.ts pose). */
  poseOf(unit: number, now: number): { sx: number; sy: number; flash: boolean; hold: boolean } | undefined {
    const p = this.poses.get(unit), hold = now < this.stopUntil;
    if (!p || now >= p.until) {
      if (p) this.poses.delete(unit);
      return hold && this.mem.has(unit) ? { sx: 1, sy: 1, flash: false, hold } : undefined;
    }
    const k = (now - p.t0) / (p.until - p.t0);
    if (p.kind === 'flash') return { sx: 1, sy: 1, flash: k < 0.5, hold };
    if (p.kind === 'squash') {
      const e = Math.exp(-5 * k) * Math.cos(k * Math.PI * 2.5); // squash, rebound past rest, settle
      return { sx: 1 + 0.14 * e, sy: 1 - 0.16 * e, flash: false, hold };
    }
    // roar: rise and swell over the first third, hold, settle back with an overshoot
    const up = k < 0.3 ? Math.sin((k / 0.3) * (Math.PI / 2)) : k < 0.7 ? 1 : 1 - Phaser.Math.Easing.Back.Out((k - 0.7) / 0.3);
    return { sx: 1 - 0.04 * up, sy: 1 + 0.08 * up, flash: false, hold };
  }

  /** Undo last frame's shake offset (call before the camera moves). */
  unshake(cam: Phaser.Cameras.Scene2D.Camera): void {
    cam.scrollX -= this.shook.x;
    cam.scrollY -= this.shook.y;
    this.shook = { x: 0, y: 0 };
  }
  /** This frame's shake and nudge offset (call after drawing; undone by unshake). */
  applyShake(cam: Phaser.Cameras.Scene2D.Camera, dt: number, now: number): void {
    this.trauma = Math.max(0, this.trauma - (dt / 1000) * 1.4);
    const s = this.trauma * this.trauma, amp = (16 * s) / Math.max(0.35, cam.zoom); // ~16 screen px at most
    let x = amp * (Math.sin(now / 21) * 0.7 + Math.sin(now / 13.7) * 0.3), y = amp * 0.8 * (Math.sin(now / 17.3) * 0.7 + Math.sin(now / 9.1) * 0.3);
    if (this.nudge) {
      const k = (now - this.nudge.t0) / 900;
      if (k >= 1) this.nudge = null;
      else {
        const e = Math.sin(k * Math.PI) * (k < 0.5 ? 1 : 1); // out and back
        x += this.nudge.x * e;
        y += this.nudge.y * e;
      }
    }
    this.shook = { x, y };
    cam.scrollX += x;
    cam.scrollY += y;
  }

  // --- plays (pooled strip sprites) ---

  private play(id: string, x: number, y: number, depth: number, o: Partial<Omit<Play, 'id' | 'x' | 'y' | 'depth'>> = {}): void {
    const st = this.strips.get(id);
    if (!st) return;
    if (this.plays.length >= MAX_PLAYS) {
      const i = this.plays.findIndex((p) => p.minor);
      if (i < 0 || o.minor) return;
      this.plays.splice(i, 1);
    }
    this.plays.push({ id, x, y, depth, t0: this.clock, sx: 1, sy: 1, rot: 0, flip: false, alpha: 1, tint: 0xffffff, until: st.loop ? this.clock + 3000 : Infinity, fade: 0, minor: false, ...o });
  }
  private depthAt(x: number, y: number, k = 0.4): number {
    return 10 + (x + y) / 4096 + k;
  }
  private cue(name: Cue, x: number, y: number, boss: string): void {
    this.onCue?.(name, x, y, boss);
  }

  // --- each frame ---

  draw(bosses: readonly BossSnap[], ctx: FxCtx): void {
    this.ctx = ctx;
    const dt = this.lastNow ? Math.min(100, ctx.now - this.lastNow) : 0;
    this.lastNow = ctx.now;
    if (ctx.now >= this.stopUntil) this.clock += dt;
    this.glow.clear();
    const g = this.g.clear(), top = this.top.clear(), w = Math.max(1, 1.5 / ctx.zoom), lod = ctx.zoom >= 0.3;
    const seen = new Set<number>();
    for (const b of bosses) {
      seen.add(b.unit);
      this.events(b, ctx, lod);
      this.live(b, ctx, g, top, w, lod);
    }
    for (const id of this.mem.keys()) if (!seen.has(id)) (this.mem.delete(id), this.bodies.delete(id));
    // scorch decals
    for (let i = this.scorch.length - 1; i >= 0; i--) {
      const s = this.scorch[i], k = (this.clock - s.t0) / 14000;
      if (k >= 1) { this.scorch.splice(i, 1); continue; }
      const p = ctx.feet({ x: s.x, y: s.y });
      g.fillStyle(0x1a1410, 0.45 * (1 - k)).fillEllipse(p.x, p.y, s.r * HW * 2, s.r * HH * 2);
    }
    this.drawPlays(ctx);
  }

  /** Beats from what changed since the last snapshot: a new move, a phase, a state (takeoff, landing, death). */
  private events(b: BossSnap, ctx: FxCtx, lod: boolean): void {
    const m = this.mem.get(b.unit), now = ctx.now, f = b.fx, key = f ? `${f.kind}:${f.x.toFixed(1)},${f.y.toFixed(1)}>${f.tx.toFixed(1)},${f.ty.toFixed(1)}` : '';
    if (!m) {
      this.mem.set(b.unit, { phase: b.phase, state: b.state, fx: key, hp: b.hp, x: b.x, y: b.y, last: {}, dir: [1, 0], landed: '', charged: -1 });
      return;
    }
    const k = size(b.id);
    if (f && key !== m.fx && f.t < 5) this.move(b, m, f, ctx, lod);
    m.fx = key;
    // a heavy blow taken: a flash
    if (b.hp < m.hp - b.maxHp * 0.015 && b.state !== 'slain') this.pose(b.unit, 'flash', 90);
    m.hp = b.hp;
    if (b.phase > m.phase && b.state !== 'slain') this.phaseBeat(b, ctx);
    m.phase = b.phase;
    if (b.state !== m.state) {
      const ground = { x: m.x, y: m.y };
      if (b.state === 'flight' && m.state !== 'flight') {
        // a wing-beat blows the dust out flat from where he leaves
        const lift = ctx.lift(b.unit) > 40;
        const p = lift ? ctx.feet({ x: b.x, y: b.y, u: { id: b.unit } }) : ctx.feet(ground);
        this.play('boss-wingbeat', p.x, p.y, this.depthAt(b.x, b.y, 0.3), { sx: 1.3 * (k / 2.7) + 0.6, sy: 1.3 * (k / 2.7) + 0.6 });
        this.shake(0.25, b.x, b.y);
        this.cue('boss.takeoff', b.x, b.y, b.id);
      } else if (m.state === 'flight' && b.state === 'perch') {
        const p = ctx.feet({ x: b.x, y: b.y, u: { id: b.unit } });
        this.play('boss-wingbeat', p.x, p.y, this.depthAt(b.x, b.y, 0.5), { sx: 0.9, sy: 0.9 });
        this.pose(b.unit, 'squash', 450);
        this.shake(0.2, b.x, b.y);
        this.cue('boss.land', b.x, b.y, b.id);
        m.last.breath = now - (EVERY[b.id]?.breath ?? 0) + 1000; // the first breath comes a second after he lands
      } else if (m.state === 'flight' && b.state === 'fight' && b.id !== 'drakon') {
        // a giant coming down off his gate (Brontes, the River-God's charge): a heavy landing
        const p = ctx.feet({ x: b.x, y: b.y });
        this.play('boss-impact', p.x, p.y, this.depthAt(b.x, b.y), { sx: 0.9 * k, sy: 0.9 * k });
        this.pose(b.unit, 'squash', 500);
        this.shake(0.55, b.x, b.y);
        this.hitStop(90);
        this.cue('boss.land', b.x, b.y, b.id);
      } else if (b.state === 'slain') this.death(b, m, ctx, lod);
      else if (b.state === 'flee') {
        this.horn(b, ctx);
      }
      m.state = b.state;
    }
    m.x = b.x;
    m.y = b.y;
  }

  /** A move starts. */
  private move(b: BossSnap, m: Mem, f: NonNullable<BossSnap['fx']>, ctx: FxCtx, lod: boolean): void {
    const k = size(b.id), now = ctx.now;
    m.last[f.kind] = now;
    const at = ctx.feet({ x: f.x, y: f.y }), tgt = ctx.feet({ x: f.tx, y: f.ty });
    switch (f.kind) {
      case 'breath': {
        const dx = f.tx - f.x, dy = f.ty - f.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
        m.dir = [ux, uy];
        // fire left on the ground along the cone (as host.burn lights it at 1/3, 2/3 and the end), smoke after
        const chim = b.id === 'chimera';
        const spots = chim ? [0.55, 0.9] : lod ? [0.3, 0.45, 0.6, 0.75, 0.9] : [0.45, 0.9];
        for (const s of spots) {
          const across = !lod ? [0] : chim ? [-0.6, 0.6] : [-1, 0, 1];
          for (const a of across) {
            const along = s + (Math.random() - 0.5) * 0.12, wd = f.r * along * 0.7 * a + (Math.random() - 0.5) * 1.2;
            const x = f.x + ux * len * along - uy * wd, y = f.y + uy * len * along + ux * wd, p = ctx.feet({ x, y });
            const sc = (chim ? 0.75 : 1.6) * (0.7 + Math.random() * 0.6);
            this.play('boss-ground-fire', p.x, p.y + 4, this.depthAt(x, y, 0.2), { sx: sc, sy: sc * (0.8 + Math.random() * 0.4), flip: Math.random() < 0.5, t0: this.clock + 150 + s * 400 + Math.random() * 500, until: this.clock + 4000 + Math.random() * 3500, fade: 1200, minor: true });
            if (a === 0 || chim) this.scorch.push({ x, y, r: (chim ? 0.6 : 1.2) + s * f.r * (chim ? 0.25 : 0.5), t0: this.clock + s * 300 });
          }
          if (lod && !chim && (s === 0.45 || s === 0.9)) {
            const x = f.x + ux * len * s, y = f.y + uy * len * s, p = ctx.feet({ x, y });
            this.play('boss-smoke', p.x, p.y, this.depthAt(x, y, 0.45), { sx: 1.8, sy: 1.8, t0: this.clock + 1500, until: this.clock + 9000, fade: 2500, alpha: 0.8, minor: true });
          }
        }
        if (b.id === 'chimera') this.venom(b, ctx);
        this.shake(b.id === 'drakon' ? 0.3 : 0.1, f.tx, f.ty);
        this.cue('boss.breath', f.x, f.y, b.id);
        break;
      }
      case 'sweep': {
        // a claw or tail sweep (Drakon), a triple blow (Gyges): the slash towards the man, sparks on him
        const flip = tgt.x < at.x - 1, p = ctx.feet({ x: f.x, y: f.y, u: { id: b.unit } });
        const off = 40 * k * (flip ? -1 : 1);
        this.play('boss-slash', p.x + off, p.y - 40 * k, this.depthAt(f.x, f.y, 0.45), { sx: 0.8 * k, sy: 0.6 * k, flip, alpha: 0.7, tint: 0xd8d0c0 });
        if (b.id === 'gyges') {
          this.play('boss-sparks', tgt.x, tgt.y - 30, this.depthAt(f.tx, f.ty, 0.45), { sx: 0.8, sy: 0.8 });
          this.shake(0.15, f.x, f.y);
        } else {
          this.play('boss-impact', p.x, p.y, this.depthAt(f.x, f.y, 0.3), { sx: 0.6 * k * 0.5, sy: 0.6 * k * 0.5, minor: true });
          this.shake(0.3, f.x, f.y);
          this.hitStop(60);
        }
        this.pose(b.unit, 'squash', 300);
        this.cue('boss.sweep', f.x, f.y, b.id);
        break;
      }
      case 'smash':
        if (b.id === 'scylla') {
          // a head striking down at a man by the water
          this.play('boss-splash', at.x, at.y, this.depthAt(f.x, f.y, 0.3), { sx: 0.7, sy: 0.7, minor: true });
          this.play('boss-slash', tgt.x, tgt.y - 30, this.depthAt(f.tx, f.ty, 0.45), { sx: 0.6, sy: 0.5, flip: tgt.x < at.x, minor: true });
          this.cue('boss.splash', f.x, f.y, b.id);
        } else {
          const p = ctx.feet({ x: f.x, y: f.y });
          this.play('boss-impact', p.x, p.y, this.depthAt(f.x, f.y), { sx: (f.r / 3) * 1.6, sy: (f.r / 3) * 1.6 });
          this.shake(0.5, f.x, f.y);
          this.hitStop(90);
          this.pose(b.unit, 'squash', 400);
          this.cue('boss.smash', f.x, f.y, b.id);
        }
        break;
      case 'stomp': {
        const p = ctx.feet({ x: f.x, y: f.y });
        this.play('boss-impact', p.x, p.y, this.depthAt(f.x, f.y), { sx: 2.2, sy: 2.2 });
        this.play('boss-wingbeat', p.x, p.y, this.depthAt(f.x, f.y, 0.3), { sx: 1.4, sy: 1.4, minor: true });
        this.shake(0.7, f.x, f.y);
        this.hitStop(110);
        this.pose(b.unit, 'squash', 500);
        this.cue('boss.stomp', f.x, f.y, b.id);
        break;
      }
      case 'crash': {
        const p = ctx.feet({ x: f.x, y: f.y });
        this.play('crash-dust', p.x, p.y, this.depthAt(f.x, f.y), { sx: 2.2, sy: 2.2 });
        this.play('boss-impact', p.x, p.y, this.depthAt(f.x, f.y, 0.42), { sx: 3, sy: 3 });
        this.play('boss-wingbeat', p.x, p.y, this.depthAt(f.x, f.y, 0.3), { sx: 2.2, sy: 2.2 });
        this.scorch.push({ x: f.x, y: f.y, r: f.r * 0.9, t0: this.clock });
        this.shake(1, f.x, f.y);
        this.hitStop(140);
        this.pose(b.unit, 'squash', 700);
        this.push(f.x, f.y);
        this.piece(b.unit, f.x, f.y, 3000);
        this.cue('boss.crash', f.x, f.y, b.id);
        break;
      }
      case 'snatch':
        this.play('boss-splash', tgt.x, tgt.y, this.depthAt(f.tx, f.ty, 0.35), { sx: 1.1, sy: 1.1 });
        this.shake(0.2, f.tx, f.ty);
        this.cue('boss.snatch', f.tx, f.ty, b.id);
        break;
      case 'rock':
      case 'boulder':
        this.pose(b.unit, 'roar', 350);
        this.cue('boss.throw', f.x, f.y, b.id);
        break;
      case 'charge':
        this.play('boss-wingbeat', at.x, at.y, this.depthAt(f.x, f.y, 0.3), { sx: 1.2, sy: 1.2 });
        this.play('boss-impact', tgt.x, tgt.y, this.depthAt(f.tx, f.ty), { sx: 1.6, sy: 1.6 });
        this.shake(0.5, f.tx, f.ty);
        this.cue('boss.impact', f.tx, f.ty, b.id);
        break;
    }
  }

  /** A phase change: the roar, the nudge, and the guardian's own beat. */
  private phaseBeat(b: BossSnap, ctx: FxCtx): void {
    const p = ctx.feet({ x: b.x, y: b.y, u: { id: b.unit } }), k = size(b.id), d = this.depthAt(b.x, b.y, 0.45);
    this.pose(b.unit, 'roar', 900);
    this.push(b.x, b.y);
    this.piece(b.unit, b.x, b.y, 3500);
    this.shake(0.4, b.x, b.y);
    this.cue('boss.roar', b.x, b.y, b.id);
    this.cue('boss.phase', b.x, b.y, b.id);
    switch (b.id) {
      case 'gyges':
        // his chains burst: sparks off both wrists and the anchor ring
        for (const [ox, oy, t] of [[-55, -110, 0], [55, -105, 120], [0, -20, 240]] as const) this.play('boss-sparks', p.x + ox * (k / 1.8), p.y + oy * (k / 1.8), d, { sx: 1.9, sy: 1.9, t0: this.clock + t });
        this.hitStop(120);
        this.shake(0.4, b.x, b.y);
        this.cue('boss.chains', b.x, b.y, b.id);
        break;
      case 'scylla':
      case 'river_god':
        this.play('boss-splash', p.x, p.y, d, { sx: 2.2, sy: 2.2 });
        for (const e of this.entries.find((q) => q.boss === b.id)?.heads ?? []) {
          const h = ctx.feet({ x: e[0], y: e[1] });
          this.play('boss-splash', h.x, h.y, this.depthAt(e[0], e[1], 0.4), { sx: 1.3, sy: 1.3, t0: this.clock + Math.random() * 400 });
        }
        this.cue('boss.splash', b.x, b.y, b.id);
        break;
      case 'bandit_king':
        this.horn(b, ctx);
        break;
      case 'maenad_queen':
      case 'grove_queen':
        this.play('boss-horn', p.x, p.y, this.depthAt(b.x, b.y, 0.2), { sx: 1.1, sy: 1.1, tint: 0xff8fd0 });
        this.cue('boss.frenzy', b.x, b.y, b.id);
        break;
      case 'drakon':
        if (b.phase === 2) this.cue('boss.enrage', b.x, b.y, b.id);
        break;
      default:
        this.play('boss-impact', p.x, p.y, d, { sx: 1.2 * k, sy: 1.2 * k });
    }
  }

  private horn(b: BossSnap, ctx: FxCtx): void {
    const p = ctx.feet({ x: b.x, y: b.y, u: { id: b.unit } });
    this.play('boss-horn', p.x, p.y, this.depthAt(b.x, b.y, 0.2), { sx: 1.4, sy: 1.4 });
    this.play('boss-horn', p.x, p.y, this.depthAt(b.x, b.y, 0.2), { sx: 2.2, sy: 2.2, t0: this.clock + 350, alpha: 0.7 });
    this.pose(b.unit, 'roar', 900);
    this.cue('boss.horn', b.x, b.y, b.id);
  }

  private venom(b: BossSnap, ctx: FxCtx): void {
    const p = ctx.feet({ x: b.x, y: b.y, u: { id: b.unit } });
    this.play('boss-venom', p.x - 30, p.y - 20, this.depthAt(b.x, b.y, 0.45), { sx: 1, sy: 1, minor: true });
  }

  private death(b: BossSnap, m: Mem, ctx: FxCtx, lod: boolean): void {
    const k = size(b.id), x = m.x, y = m.y, p = ctx.feet({ x, y }), d = this.depthAt(x, y);
    // the collapse: the body falls where it stood (the sim has let it go), hits the ground in a crater of dust, then the
    // loot's beam
    const body = this.bodies.get(b.unit);
    if (body) this.corpse?.(body.cls, x, y, body.facing);
    this.play('boss-impact', p.x, p.y, d, { sx: 1.1 * k, sy: 1.1 * k, t0: this.clock + 500 });
    if (k > 1.5) this.play('boss-wingbeat', p.x, p.y, this.depthAt(x, y, 0.3), { sx: 0.8 * k, sy: 0.8 * k, t0: this.clock + 550 });
    this.play('boss-beam', p.x, p.y, this.depthAt(x, y, 0.5), { sx: 1.3, sy: 1.6, t0: this.clock + 1600, until: this.clock + 20000, fade: 3000, alpha: 0.9 });
    this.shake(0.6 + 0.15 * k, x, y);
    this.hitStop(160);
    this.push(x, y);
    this.piece(b.unit, x, y, 4500);
    this.cue('boss.slain', x, y, b.id);
    this.cue('boss.loot', x, y, b.id);
    void lod;
  }

  /** What a guardian is doing now: telegraphs, the breath's jet, a rock in flight, auras. */
  private live(b: BossSnap, ctx: FxCtx, g: Phaser.GameObjects.Graphics, top: Phaser.GameObjects.Graphics, w: number, lod: boolean): void {
    if (b.state === 'slain' || b.state === 'away') return;
    const m = this.mem.get(b.unit)!, now = ctx.now, k = size(b.id), f = b.fx;
    const body = ctx.feet({ x: b.x, y: b.y, u: { id: b.unit } }), lift = ctx.lift(b.unit);
    // auras: Drakon enraged (P3), a maenad queen frenzied (P2)
    if ((b.id === 'drakon' && b.phase === 2) || ((b.id === 'maenad_queen' || b.id === 'grove_queen') && b.phase >= 1)) {
      const st = this.strips.get('boss-frenzy');
      if (st) {
        const red = b.id === 'drakon';
        const sp = this.sprite(this.nSprite++, st.key, Math.floor((this.clock / 1000) * st.fps) % st.frames);
        sp.setOrigin(st.ax, st.ay).setPosition(body.x, body.y + 4).setScale(red ? 3.2 : 0.9, red ? 1.6 : 0.75).setFlipX(false).setRotation(0)
          .setDepth(this.depthAt(b.x, b.y, red ? 0.46 : 0.24)).setAlpha(red ? 0.3 + 0.08 * Math.sin(now / 120) : 0.6).setTint(red ? 0xff5030 : 0xffffff).setBlendMode(Phaser.BlendModes.ADD);
      }
    }
    // a man-sized guardian (the King, a queen, the Chimera) is found in the press by a gold ring under him
    if (k === 1 && b.state !== 'flight') {
      const p = ctx.feet({ x: b.x, y: b.y, u: { id: b.unit } }), t = 0.5 + 0.5 * Math.sin(now / 260);
      g.lineStyle(w * 2, 0xeeae52, 0.55 + 0.3 * t).strokeEllipse(p.x, p.y, 52 + 6 * t, 24 + 3 * t);
      g.lineStyle(w, 0xf6d48a, 0.35).strokeEllipse(p.x, p.y, 66 + 8 * t, 31 + 4 * t);
      // over everything (roofs, the press): a soft light round him and a gold marker over his head (./units.ts outlines
      // his sprite in gold too)
      const d = ctx.drawn(b.unit), head = d ? d.y - d.oy * d.fh * d.scale + 30 : p.y - 70, s = Math.max(1.3, 1.4 / ctx.zoom);
      this.glow.fillStyle(0xffc860, 0.08 + 0.05 * t).fillEllipse(p.x, (p.y + head) / 2, 60, p.y - head + 30);
      const my = head - (10 + 4 * t) * s;
      top.fillStyle(0x1b1612, 0.9).fillTriangle(p.x - 9 * s, my - 11 * s, p.x + 9 * s, my - 11 * s, p.x, my + 2 * s);
      top.fillStyle(0xffc23d, 1).fillTriangle(p.x - 6.5 * s, my - 9.5 * s, p.x + 6.5 * s, my - 9.5 * s, p.x, my - 0.5 * s);
    }
    // telegraphs: the next move of a cadence foreseen from the last one (only while the fight is on)
    const ev = EVERY[b.id] ?? {};
    for (const kind of ['sweep', 'stomp', 'smash'] as const) {
      const every = kind === 'sweep' && b.phase === 2 ? 6000 : ev[kind], last = m.last[kind];
      if (!every || last === undefined || now - last > every * 2.2) continue;
      const left = (last + every * Math.ceil((now - last) / every)) - now;
      if (left > TELEGRAPH || b.state === 'perch' || b.state === 'flight') continue;
      const r = kind === 'sweep' ? MOVES.sweep.r : kind === 'stomp' ? MOVES.stomp.r : MOVES.smash.r, t = 1 - left / TELEGRAPH;
      const p = ctx.feet({ x: b.x, y: b.y }), rx = r * HW * Math.SQRT2, ry = r * HH * Math.SQRT2;
      g.fillStyle(0xb01818, 0.08 + 0.22 * t).fillEllipse(p.x, p.y, 2 * rx * t, 2 * ry * t);
      g.lineStyle(w * 2.5, 0xff5a3c, 0.4 + 0.5 * t * (0.6 + 0.4 * Math.sin(now / 45))).strokeEllipse(p.x, p.y, 2 * rx, 2 * ry);
    }
    // the breath coming: embers drawn into the mouth, its glow, the last cone's ground marked
    if (b.id === 'drakon' && b.state === 'perch' && !f && m.last.breath !== undefined) {
      const every = ev.breath!, left = m.last.breath + every - now;
      if (left > 0 && left < 1400) {
        const t = 1 - left / 1400, mouth = this.mouth(b, body, m.dir, ctx);
        if (lod) for (let i = 0; i < 10; i++) {
          const a = i * 2.4 + now / 300, rr = (1 - ((now / 400 + i / 10) % 1)) * 120 * (k / 2.7);
          top.fillStyle(i % 2 ? 0xf6d48a : 0xe5923d, 0.9).fillRect(mouth.x + Math.cos(a) * rr - 2, mouth.y + Math.sin(a) * rr * 0.6 - 2, 4, 4);
        }
        top.fillStyle(0xff9a30, 0.25 + 0.35 * t).fillCircle(mouth.x, mouth.y, 10 + 26 * t);
        top.fillStyle(0xfff0b0, 0.5 + 0.4 * t).fillCircle(mouth.x, mouth.y, 4 + 10 * t);
        if (left < 400 && m.charged !== m.last.breath) (m.charged = m.last.breath), this.cue('boss.breath.charge', b.x, b.y, b.id);
      }
    }
    // the crash coming: where he will land, marked while he dives (the yard: his lair)
    if (b.id === 'drakon' && b.state === 'flight' && b.phase === 2) {
      const e = this.entries.find((q) => q.boss === b.id);
      if (e) {
        const p = ctx.feet({ x: e.x, y: e.y }), r = MOVES.crash.r, rx = r * HW * Math.SQRT2, ry = r * HH * Math.SQRT2, t = 0.5 + 0.5 * Math.sin(now / 70);
        g.fillStyle(0x000000, 0.35).fillEllipse(p.x, p.y, 2 * rx * 0.8, 2 * ry * 0.8);
        g.fillStyle(0xb01818, 0.25).fillEllipse(p.x, p.y, 2 * rx, 2 * ry);
        g.lineStyle(w * 3, 0xff5a3c, 0.6 + 0.4 * t).strokeEllipse(p.x, p.y, 2 * rx, 2 * ry);
      }
    }
    if (!f) return;
    const s = (f.t + Math.min(1, ctx.sinceSnap / TICK)) / 10; // seconds into the move
    if (f.kind === 'breath') this.breath(b, f, s, body, lift, ctx, top);
    else if (f.kind === 'rock' || f.kind === 'boulder') {
      // the throw: an arc with a shadow running under it and the landing marked; a crater where it lands
      const at = ctx.feet({ x: f.x, y: f.y, u: { id: b.unit } }), t = ctx.feet({ x: f.tx, y: f.ty }), q = Math.min(1, s / 0.6);
      const big = f.kind === 'boulder', rr = big ? 16 : 11;
      if (q < 1) {
        const x = at.x + (t.x - at.x) * q, y = at.y - 60 * (k / 1.8) + (t.y - at.y + 60 * (k / 1.8)) * q - Math.sin(q * Math.PI) * 140;
        const gx = ctx.feet({ x: f.x + (f.tx - f.x) * q, y: f.y + (f.ty - f.y) * q });
        g.fillStyle(0x000000, 0.25 + 0.2 * q).fillEllipse(gx.x, gx.y, rr * 2.4 * (0.6 + 0.4 * q), rr * 1.2 * (0.6 + 0.4 * q));
        const rx = f.r * HW * Math.SQRT2, ry = f.r * HH * Math.SQRT2;
        g.lineStyle(w * 2.5, 0xff5a3c, 0.5 + 0.4 * q).strokeEllipse(t.x, t.y, 2 * rx * (1.3 - 0.3 * q), 2 * ry * (1.3 - 0.3 * q));
        rock(top, x, y, rr, s * 9);
      } else if (m.landed !== m.fx) {
        m.landed = m.fx;
        this.play('boss-impact', t.x, t.y, this.depthAt(f.tx, f.ty), { sx: big ? 2.3 : 1.6, sy: big ? 2.3 : 1.6 });
        this.scorch.push({ x: f.tx, y: f.ty, r: f.r * 0.7, t0: this.clock });
        this.shake(big ? 0.55 : 0.4, f.tx, f.ty);
        this.hitStop(big ? 90 : 60);
        this.cue('boss.impact', f.tx, f.ty, b.id);
      }
    } else if (f.kind === 'sweep' || f.kind === 'stomp' || f.kind === 'smash' || f.kind === 'crash') {
      if (!(b.id === 'scylla' && f.kind === 'smash')) ring(g, ctx.feet({ x: f.x, y: f.y }), f.r, s, f.kind === 'sweep' ? 0xf0e8d8 : 0xd8b070, w);
    }
  }

  /**
   * A guardian's mouth on screen and the way its head points (screen unit vector): from the frame it is drawn with now
   * (./units.ts drawnAs) and its mouth table (guardians.json; west rows mirrored). No table or not drawn: off the body by
   * the side it faces.
   */
  private mouth(b: BossSnap, body: { x: number; y: number }, dir: [number, number], ctx: FxCtx): { x: number; y: number; hx: number; hy: number } {
    const d = ctx.drawn(b.unit), t = this.mouths.get(b.id);
    if (d && t) {
      const east = d.row.endsWith('east'), south = d.row.startsWith('south'), pts = south ? t.se : t.ne;
      const [mx, my] = pts[Math.min(pts.length - 1, d.clip === t.clip ? d.frame : 8)];
      const x = east ? mx : d.fw - mx, hl = Math.hypot(1, south ? 0.6 : 0.15);
      return { x: d.x + (x - d.ox * d.fw) * d.scale, y: d.y + (my - d.oy * d.fh) * d.scale, hx: (east ? 1 : -1) / hl, hy: (south ? 0.6 : -0.15) / hl };
    }
    const k = size(b.id) / (1.5 / 0.55), sx = dir[0] - dir[1], sy = (dir[0] + dir[1]) / 2, l = Math.hypot(sx, sy) || 1;
    return { x: body.x + Math.sign(sx || 1) * 34 * Math.max(1, k), y: body.y - 40 * Math.max(1, k), hx: sx / l, hy: sy / l };
  }

  /**
   * The breath: a jet of fire leaving the mouth along the head and bending down onto the near end of the ground cone
   * (a quadratic curve), drawn as strip copies along it that widen from the mouth (taper) and churn out of step
   * (turbulence), a white-hot core, embers sprayed along it and thrown up where it lands, the light it throws on the
   * ground; the cone strip on the ground runs on from there to the target.
   */
  private breath(b: BossSnap, f: NonNullable<BossSnap['fx']>, s: number, body: { x: number; y: number }, lift: number, ctx: FxCtx, top: Phaser.GameObjects.Graphics): void {
    const dx = f.tx - f.x, dy = f.ty - f.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const chim = b.id === 'chimera', fade = f.t > 16 ? Math.max(0, (20 - f.t - Math.min(1, ctx.sinceSnap / TICK)) / 4) : 1;
    const grow = Math.min(1, s / 0.3); // the jet reaches out over its first third of a second
    const kd = Math.max(0.4, size(b.id) / (1.5 / 0.55)); // 1: Drakon
    const mouth = this.mouth(b, body, [ux, uy], ctx);
    const off = lift ? 3 : 0.5, g0 = ctx.feet({ x: f.x + ux * off, y: f.y + uy * off }), end = ctx.feet({ x: f.tx, y: f.ty });
    // the cone on the ground (the ART-L strips: 12 m long at 1x, here stretched to the sim cone), lit as the jet lands
    const sx = dx - dy, sy = (dx + dy) / 2, q = sy >= 0 ? 'se' : 'ne';
    const ign = this.strips.get(`breath-${q}-ignite`), loop = this.strips.get(`breath-${q}-loop`), ss = s - 0.15, st = ss < 0.5 ? ign : loop;
    if (st && ss > 0) {
      const fr = ss < 0.5 ? Math.min(st.frames - 1, Math.floor(ss * st.fps)) : Math.floor((ss - 0.5) * st.fps) % st.frames;
      const kc = ((len - off) * 2) / 12; // tiles are 2 m
      this.sprite(this.nSprite++, st.key, fr).setOrigin(sx < 0 ? 1 - st.ax : st.ax, st.ay).setFlipX(sx < 0).setRotation(0).setScale(kc, kc)
        .setPosition(g0.x, g0.y).setDepth(this.depthAt(f.x + ux * len * 0.5, f.y + uy * len * 0.5, 0.42)).setAlpha(fade).setTint(0xffffff).setBlendMode(Phaser.BlendModes.NORMAL);
    }
    // where the jet comes down: the near part of the cone (on the ground)
    const land = lift ? 0.3 : 0.5, P2 = { x: g0.x + (end.x - g0.x) * land, y: g0.y + (end.y - g0.y) * land };
    const L = Math.hypot(P2.x - mouth.x, P2.y - mouth.y) || 1;
    // out along the head's line (straight at the ground point when the head points away from it), bending down
    let hx = mouth.hx, hy = mouth.hy;
    if (hx * (P2.x - mouth.x) + hy * (P2.y - mouth.y) < 0) (hx = (P2.x - mouth.x) / L), (hy = (P2.y - mouth.y) / L);
    const P1 = { x: mouth.x + hx * L * 0.55, y: mouth.y + hy * L * 0.55 };
    const at = (u: number) => {
      const v = 1 - u;
      return { x: v * v * mouth.x + 2 * v * u * P1.x + u * u * P2.x, y: v * v * mouth.y + 2 * v * u * P1.y + u * u * P2.y };
    };
    const jet = this.strips.get('boss-breath-jet'), clk = this.clock, depth = lift ? 10.955 : this.depthAt(f.x + ux, f.y + uy, 0.44);
    const w0 = (chim ? 0.3 : 0.5) * kd, w1 = (chim ? 1 : 2.8) * kd; // strip height scale at the mouth, where it lands
    if (jet) {
      // tip first (under), mouth last (over)
      for (let i = JET_SEGS - 1; i >= 0; i--) {
        const ua = (i / JET_SEGS) * grow, ub = ((i + 1) / JET_SEGS) * grow, a = at(ua), c = at(ub);
        const sl = Math.hypot(c.x - a.x, c.y - a.y), ang = Math.atan2(c.y - a.y, c.x - a.x), um = (ua + ub) / 2;
        const wob = i ? Math.sin(clk / 70 + i * 1.9) * (2 + 8 * um) * kd : 0, nx = -Math.sin(ang), ny = Math.cos(ang);
        const kw = (w0 + (w1 - w0) * um) * (0.9 + 0.15 * Math.sin(clk / 55 + i * 2.3));
        const fr = (Math.floor(s * jet.fps) + i * 3) % jet.frames;
        this.sprite(this.nSprite++, jet.key, fr).setOrigin(jet.ax, jet.ay).setFlipX(false).setFlipY(i % 2 === 1).setRotation(ang)
          .setScale(Math.max(0.05, (sl * 2.3) / 250), kw).setPosition(a.x + nx * wob, a.y + ny * wob)
          .setDepth(depth + (JET_SEGS - i) * 1e-6).setAlpha(fade).setTint(i >= JET_SEGS - 2 ? 0xffc890 : 0xffffff).setBlendMode(Phaser.BlendModes.NORMAL);
      }
    }
    // the white-hot core out of the mouth
    for (let i = 0; i < 6; i++) {
      const u = (i / 6) * 0.35 * grow, p = at(u), r = (3 + 9 * (u / 0.35)) * kd * (0.85 + 0.15 * Math.sin(clk / 40 + i));
      top.fillStyle(i < 2 ? 0xfffbe8 : 0xffe27a, 0.8 * fade * (1 - u)).fillCircle(p.x, p.y, Math.max(2, r));
    }
    top.fillStyle(0xfff4d0, 0.8 * fade).fillCircle(mouth.x, mouth.y, 12 * kd);
    // embers: sprayed out along the jet, and thrown up off the ground where it lands
    if (ctx.zoom >= 0.3) for (let i = 0; i < EMBERS; i++) {
      const h = (i * 0.618) % 1, ph = (clk / (500 + 300 * h) + h) % 1;
      if (i % 2 === 0) {
        const u = ph * grow, p = at(u), spread = (10 + 60 * u) * kd * (h - 0.5);
        top.fillStyle(h < 0.5 ? 0xffc23d : 0xfff4d0, 0.9 * fade * (1 - ph)).fillRect(p.x + spread * 0.6, p.y + spread - 30 * ph * kd, 3, 3);
      } else if (grow >= 1) {
        const ang = -Math.PI / 2 + (h - 0.5) * 2.4, v = (90 + 120 * h) * kd;
        top.fillStyle(h < 0.5 ? 0xffa030 : 0xffe27a, 0.95 * fade * (1 - ph)).fillRect(P2.x + Math.cos(ang) * v * ph, P2.y + Math.sin(ang) * v * ph + 160 * kd * ph * ph, 3, 3);
      }
    }
    // the light on the ground: round where the jet lands and along the cone, flickering
    const fl = 0.8 + 0.2 * Math.sin(clk / 37) * Math.sin(clk / 91), R = (chim ? 0.5 : 1) * kd * 220 * fade * grow;
    for (const [px, py, k] of [[P2.x, P2.y, 1], [(P2.x + end.x) / 2, (P2.y + end.y) / 2, 0.85], [end.x, end.y, 0.6]] as const) {
      this.glow.fillStyle(0xff7a20, 0.16 * fl).fillEllipse(px, py, 2.2 * R * k, 1.1 * R * k);
      this.glow.fillStyle(0xffb040, 0.2 * fl).fillEllipse(px, py, 1.3 * R * k, 0.65 * R * k);
    }
    this.glow.fillStyle(0xffe08a, 0.3 * fl).fillEllipse(P2.x, P2.y, 0.6 * R, 0.3 * R);
  }

  private nSprite = 0;
  private sprite(i: number, key: string, frame: number): Phaser.GameObjects.Sprite {
    let sp = this.sprites[i];
    if (!sp) this.sprites.push((sp = this.scene.add.sprite(0, 0, key)));
    return sp.setTexture(key, frame).setVisible(true).setFlipY(false);
  }

  /** Draw the live plays (and hide the unused pool); `live` sprites were taken first this frame. */
  private drawPlays(ctx: FxCtx): void {
    const c = this.clock, pad = 400;
    for (let i = this.plays.length - 1; i >= 0; i--) {
      const p = this.plays[i], st = this.strips.get(p.id)!;
      const el = c - p.t0;
      if (el < 0) continue;
      const fr = Math.floor((el / 1000) * st.fps);
      if ((!st.loop && fr >= st.frames) || c >= p.until) { this.plays.splice(i, 1); continue; }
      if (p.x < ctx.view.x - pad || p.x > ctx.view.right + pad || p.y < ctx.view.y - pad || p.y > ctx.view.bottom + pad * 2) continue;
      const a = p.fade && p.until - c < p.fade ? (p.until - c) / p.fade : 1;
      this.sprite(this.nSprite++, st.key, st.loop ? fr % st.frames : fr).setOrigin(p.flip ? 1 - st.ax : st.ax, st.ay).setFlipX(p.flip).setRotation(p.rot)
        .setScale(p.sx, p.sy).setPosition(p.x, p.y).setDepth(p.depth).setAlpha(p.alpha * a).setTint(p.tint)
        .setBlendMode(st.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    }
    for (let i = this.nSprite; i < this.sprites.length; i++) this.sprites[i].setVisible(false);
    this.nSprite = 0;
  }
}

/** A ring of r tiles widening out over its first half second. */
function ring(g: Phaser.GameObjects.Graphics, p: { x: number; y: number }, r: number, s: number, c: number, w: number): void {
  if (s < 0 || s > 1) return;
  const k = 0.4 + 0.6 * Math.min(1, s * 2);
  g.lineStyle(w * 3, c, 0.8 * (1 - s)).strokeEllipse(p.x, p.y, 2 * r * HW * Math.SQRT2 * k, 2 * r * HH * Math.SQRT2 * k);
}

/** A thrown rock: a lumpy stone tumbling (r px), dark outline, lit from the upper left. */
function rock(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, spin: number): void {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 7; i++) {
    const a = spin + (i / 7) * Math.PI * 2, rr = r * (0.8 + 0.25 * Math.sin(i * 2.7));
    pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.85));
  }
  g.fillStyle(0x2e2d2c, 1).fillPoints(pts.map((p) => new Phaser.Math.Vector2(x + (p.x - x) * 1.18, y + (p.y - y) * 1.18)), true);
  g.fillStyle(0x6a655e, 1).fillPoints(pts, true);
  g.fillStyle(0x8a857c, 1).fillCircle(x - r * 0.3, y - r * 0.3, r * 0.35);
}
