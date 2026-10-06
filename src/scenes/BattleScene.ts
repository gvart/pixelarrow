import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, Meter, ScrollArea, addPanel, addText, tappable } from '../ui/kit';
import { dollFrame, ensureDoll } from '../ui/sprites';
import { dollFromHero, ANIM_FRAMES } from '../art/paperdoll';
import { renderGround } from '../art/ground';
import { isoFacing, isoFieldBounds, isoToScreen, screenToIso } from '../art/iso';
import { P } from '../art/palette';
import { state, randomSeed } from '../state';
import { Battle, DT, TICK_RATE } from '../sim/battle';
import { Rng } from '../sim/rng';
import { formationSlots, frontageForWidth, rightOf, type FormationType } from '../sim/formation';
import type { BattleSetup, Order, SimEvent, SimGroup, SimUnit } from '../sim/types';
import { reportBattle, snapshotSetup } from '../platform/verify';
import { generateEnemyArmy } from '../game/enemy';
import { armySpec } from '../game/armySpec';
import { resolveBattle } from '../game/loot';
import { makeHero } from '../game/heroes';
import { GROUP_NAMES, type Hero } from '../data/units';
import { itemDef } from '../data/items';
import { CULTURE_LABEL } from '../data/names';
import { haptic, hapticNotify } from '../platform/telegram';
import { BattleFx } from '../ui/battleFx';
import { ABILITIES, AURAS, type AbilityId } from '../data/perks';
import { rallyRadius } from '../sim/stats';

// World pixels come from the 2:1 isometric projection in src/art/iso.ts.
const MARGIN_X = 200; // grass beyond the field's screen bounds
const MARGIN_Y = 300; // generous: a portrait viewport at zoom 1 is taller than the field
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

interface UnitView {
  u: SimUnit;
  hero: Hero;
  spr: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  flag: Phaser.GameObjects.Image;
  px: number;
  py: number;
  flip: boolean;
  back: boolean;
  deathTick: number;
}

type Gesture =
  | { mode: 'pending' | 'pan' | 'formation'; id: number; sx: number; sy: number; lx: number; ly: number; wx0: number; wy0: number }
  | null;

export class BattleScene extends BaseScene {
  private sim!: Battle;
  /** For the server replay check (platform/verify). */
  private verifySetup: BattleSetup | null = null;
  private deployOrders: number | undefined;
  private views: UnitView[] = [];
  private world!: Phaser.GameObjects.Layer;
  private boxes!: Phaser.GameObjects.Graphics;
  private projG!: Phaser.GameObjects.Graphics;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private decals: Phaser.GameObjects.Image[] = [];
  private paused = false;
  private speed = 1;
  private acc = 0;
  private selGroup = -1;
  private selUnit = -1;
  private gesture: Gesture = null;
  private pinch: { d0: number; z0: number; cx: number; cy: number } | null = null;
  private dragPreview: { cx: number; cy: number; fx: number; fy: number; frontage: number; type: FormationType; n: number } | null = null;
  private lastAutoPause = -9999;
  private lastHaptic = 0;
  private enemyHeroes: Hero[] = [];
  private initialStrength: [number, number] = [1, 1];
  private ending = false;
  private retreatMsg: string | null = null;
  // HUD
  private hud!: Phaser.GameObjects.Container;
  private tags!: Phaser.GameObjects.Container;
  private tagMap = new Map<number, Phaser.GameObjects.Container>();
  private pauseBtn: Button | null = null;
  private speedBtn: Button | null = null;
  private clock: Phaser.GameObjects.BitmapText | null = null;
  private strength: [Meter, Meter] | null = null;
  private groupTabs: { gid: number; btn: Button; meter: Meter; label: string; prefix: string }[] = [];
  private orderBtns = new Map<string, Button>();
  private presetBtns = new Map<FormationType, Button>();
  private heroInfo: Phaser.GameObjects.Container | null = null;
  private banner: Phaser.GameObjects.Container | null = null;
  private bannerTimer: Phaser.Time.TimerEvent | null = null;
  private overlay: Phaser.GameObjects.Container | null = null;
  private hudDirty = true;
  private statusText: Phaser.GameObjects.BitmapText | null = null;
  private groupArea: ScrollArea | null = null;
  private groupScroll = 0;
  private fx!: BattleFx;
  /** Camera follows the fighting until the player pans or pinches. */
  private follow = true;
  private followBtn: Button | null = null;
  private abilityBtns: { id: AbilityId; btn: Button; g: Phaser.GameObjects.Graphics; count: Phaser.GameObjects.BitmapText; w: number; h: number }[] = [];
  private lastSparkle = 0;

  constructor() {
    super('Battle');
  }

  create(data: { fresh?: boolean }): void {
    this.views = [];
    this.decals = [];
    this.tagMap = new Map();
    this.paused = false;
    this.speed = 1;
    this.acc = 0;
    this.selGroup = -1;
    this.selUnit = -1;
    this.gesture = null;
    this.pinch = null;
    this.dragPreview = null;
    this.ending = false;
    this.retreatMsg = null;
    this.overlay = null;
    this.banner = null;
    this.follow = true;
    this.abilityBtns = [];
    this.initUi();

    const camp = state.campaign;
    if (data?.fresh || !state.pending) {
      const seed = randomSeed();
      const enemy = generateEnemyArmy(new Rng(seed ^ 0xa5a5a5a5), camp.data, camp.data.heroes, camp.data.won);
      state.pending = { enemy, seed };
    }
    const pending = state.pending!;
    this.enemyHeroes = pending.enemy.heroes;
    // Wounded heroes sit this one out.
    const heroes = camp.fitHeroes();
    const setup: BattleSetup = { seed: pending.seed, armies: [armySpec(heroes, false), armySpec(this.enemyHeroes, true)] };
    this.verifySetup = snapshotSetup(setup);
    this.deployOrders = undefined;
    this.sim = new Battle(setup);

    // ---- world
    this.world = this.add.layer();
    const fb = isoFieldBounds(this.sim.width, this.sim.height);
    const gx = fb.x0 - MARGIN_X;
    const gy = fb.y0 - MARGIN_Y;
    const gw = fb.x1 - fb.x0 + MARGIN_X * 2;
    const gh = fb.y1 - fb.y0 + MARGIN_Y * 2;
    const gkey = `isoground_${this.sim.width}x${this.sim.height}`;
    if (!this.textures.exists(gkey)) {
      this.textures.addCanvas(gkey, renderGround(gw, gh, { originX: gx, originY: gy, fieldW: this.sim.width, fieldH: this.sim.height, seed: 21 }).toCanvas());
    }
    this.world.add(this.add.image(gx, gy, gkey).setOrigin(0, 0).setDepth(-100000));
    this.boxes = this.add.graphics().setDepth(-80000);
    this.world.add(this.boxes);
    this.projG = this.add.graphics().setDepth(100000);
    this.world.add(this.projG);
    this.fx = new BattleFx(this, this.world);
    this.fx.showNumbers = camp.data.settings.dmgNumbers;

    const heroById = new Map<string, Hero>();
    for (const h of [...heroes, ...this.enemyHeroes]) heroById.set(h.id, h);
    for (const u of this.sim.units) {
      const hero = heroById.get(u.heroId)!;
      const key = ensureDoll(this, dollFromHero(hero));
      const shadow = this.add.image(0, 0, 'shadow').setAlpha(0.3).setDepth(-60000);
      const ring = this.add.image(0, 0, u.side === 0 ? 'ring_sel' : 'ring_enemy').setDepth(-70000).setVisible(false);
      const spr = this.add.sprite(0, 0, key, dollFrame(0, 0)).setOrigin(0.5, 38 / 40);
      const flag = this.add.image(0, 0, 'flag_white').setOrigin(0, 1).setVisible(false).setDepth(90000);
      this.world.add([shadow, ring, spr, flag]);
      const f = isoFacing(u.fx, u.fy);
      this.views.push({ u, hero, spr, shadow, ring, flag, px: u.x, py: u.y, flip: f.left, back: f.back, deathTick: -1 });
    }
    this.initialStrength = [Math.max(1, this.sim.sideStrength(0)), Math.max(1, this.sim.sideStrength(1))];

    // ---- cameras
    const cam = this.cameras.main;
    cam.setBounds(gx, gy, gw, gh);
    cam.setBackgroundColor(P.bg);
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCam.ignore(this.world);
    cam.ignore(this.ui);

    this.hud = this.add.container(0, 0);
    this.tags = this.add.container(0, 0);
    this.ui.add(this.tags);
    this.ui.add(this.hud);
    this.selGroup = this.firstPlayerGroup();
    this.buildHud();
    this.frameArmies();

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
    this.input.on('wheel', (_p: unknown, _o: unknown[], _dx: number, dy: number) => {
      this.setZoom(Math.round(cam.zoom) + (dy > 0 ? -1 : 1));
    });
    this.telegramBack(() => {
      if (this.sim.phase === 'deploy') this.leaveDeploy();
      else this.togglePause();
    });
    this.showBanner(`Deploy vs ${pending.label ?? CULTURE_LABEL[pending.enemy.culture]}`, 3000);
  }

  /** Field coordinates -> world pixels (also used by the screenshot/smoke scripts). */
  project(x: number, y: number): { x: number; y: number } {
    return isoToScreen(x, y);
  }

  /** World pixels -> field coordinates. */
  unproject(wx: number, wy: number): { x: number; y: number } {
    return screenToIso(wx, wy);
  }

  /** Visible battlefield in screen pixels: between the top bar and the bottom panel. */
  private fieldViewport(): { top: number; bottom: number } {
    const { S, VH } = this.m;
    const deploy = this.sim.phase === 'deploy';
    const panel = deploy ? 2 * 26 + 22 + 14 : 3 * 26 + 18 + 6;
    return { top: 26 * S, bottom: (VH - panel - 16) * S };
  }

  /**
   * Default camera: a readable zoom (at least 2x; more if both armies fit),
   * centred on the player's army, nudged toward the enemy.
   */
  private frameArmies(): void {
    const cam = this.cameras.main;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const u of this.sim.units) {
      if (u.state === 'fled' || u.state === 'dead') continue;
      const p = isoToScreen(u.x, u.y);
      x0 = Math.min(x0, p.x - 10);
      x1 = Math.max(x1, p.x + 10);
      y0 = Math.min(y0, p.y - 36);
      y1 = Math.max(y1, p.y + 4);
    }
    if (!isFinite(x0)) return;
    const vp = this.fieldViewport();
    const availW = this.scale.width;
    const availH = vp.bottom - vp.top;
    const fit = Math.floor(Math.min(availW / (x1 - x0), availH / (y1 - y0)));
    const z = Phaser.Math.Clamp(Math.max(2, fit), 2, 4);
    cam.setZoom(z);
    const t = this.focusPoint();
    this.centerCam(t.x, t.y);
  }

  /** Centre the camera on a world point inside the visible band between the HUD bars. */
  private centerCam(x: number, y: number): void {
    const cam = this.cameras.main;
    const vp = this.fieldViewport();
    const offY = (this.scale.height / 2 - (vp.top + vp.bottom) / 2) / cam.zoom;
    cam.centerOn(x, y + offY);
  }

  /**
   * Where the camera should look: the melee if there is one (men engaged on
   * both sides), otherwise the player's army, a little toward the enemy.
   */
  private focusPoint(): { x: number; y: number } {
    let ex = 0;
    let ey = 0;
    let en = 0;
    let px = 0;
    let py = 0;
    let pn = 0;
    let fx = 0;
    let fy = 0;
    let fn = 0;
    for (const u of this.sim.units) {
      if (u.state !== 'ready') continue;
      if (u.engaged) {
        ex += u.x;
        ey += u.y;
        en++;
      }
      if (u.side === 0) {
        px += u.x;
        py += u.y;
        pn++;
      } else {
        fx += u.x;
        fy += u.y;
        fn++;
      }
    }
    let cx: number;
    let cy: number;
    if (en >= 2) {
      cx = ex / en;
      cy = ey / en;
    } else if (pn > 0) {
      cx = px / pn;
      cy = py / pn;
      if (fn > 0) {
        const pull = this.sim.phase === 'deploy' ? 0.1 : 0.3;
        cx += (fx / fn - cx) * pull;
        cy += (fy / fn - cy) * pull;
      }
    } else {
      cx = this.sim.width / 2;
      cy = this.sim.height / 2;
    }
    const p = isoToScreen(cx, cy);
    return { x: p.x, y: p.y - 14 };
  }

  private setFollow(on: boolean): void {
    if (this.follow === on) return;
    this.follow = on;
    this.followBtn?.setSelected(on);
  }

  /** Smoothly track the fighting while following. */
  private updateCamera(delta: number): void {
    if (!this.follow || this.sim.phase !== 'battle' || this.pinch) return;
    const cam = this.cameras.main;
    const t = this.focusPoint();
    const vp = this.fieldViewport();
    const offY = (this.scale.height / 2 - (vp.top + vp.bottom) / 2) / cam.zoom;
    const cur = { x: cam.midPoint.x, y: cam.midPoint.y - offY };
    const k = 1 - Math.exp((-delta / 1000) * 2.2);
    this.centerCam(cur.x + (t.x - cur.x) * k, cur.y + (t.y - cur.y) * k);
  }

  protected onResized(): void {
    this.uiCam.setSize(this.scale.width, this.scale.height);
    this.m = { ...this.m, ...uiMetricsOf(this) };
    this.ui.setScale(this.m.S);
    this.buildHud();
  }

  // ===================================================================== loop

  update(_time: number, delta: number): void {
    if (this.sim.phase === 'battle' && !this.paused) {
      this.acc += Math.min(0.25, delta / 1000) * this.speed;
      let steps = 0;
      while (this.acc >= DT && steps < 10 && this.sim.phase === 'battle') {
        for (const v of this.views) {
          v.px = v.u.x;
          v.py = v.u.y;
        }
        this.sim.step();
        this.handleEvents(this.sim.drainEvents());
        this.acc -= DT;
        steps++;
      }
      this.hudDirty = true;
    } else if (this.sim.phase === 'ended') {
      this.handleEvents(this.sim.drainEvents());
    }
    const alpha = this.sim.phase === 'battle' && !this.paused ? Math.min(1, this.acc / DT) : 1;
    this.updateCamera(delta);
    this.fx.update(this.paused ? 0 : delta);
    this.renderUnits(alpha);
    this.renderProjectiles(alpha);
    this.renderBoxes();
    this.updateTags();
    if (this.hudDirty) this.refreshHud();
  }

  private renderUnits(alpha: number): void {
    const tick = this.sim.tick;
    const now = tick + alpha;
    for (const v of this.views) {
      const u = v.u;
      if (u.state === 'fled') {
        v.spr.setVisible(false);
        v.shadow.setVisible(false);
        v.ring.setVisible(false);
        v.flag.setVisible(false);
        this.fx.unit(u, 0, 0, 0, false);
        continue;
      }
      const sp = isoToScreen(Phaser.Math.Linear(v.px, u.x, alpha), Phaser.Math.Linear(v.py, u.y, alpha));
      const rx = Math.round(sp.x);
      const ry = Math.round(sp.y);
      v.spr.setPosition(rx, ry);
      v.shadow.setPosition(rx, ry - 1);
      v.ring.setPosition(rx, ry - 1);
      // facing -> one of the four iso diagonals: row (front/back) + mirror, with hysteresis
      const fc = isoFacing(u.fx, u.fy);
      if (fc.sy < -2) v.back = true;
      else if (fc.sy > 2) v.back = false;
      if (fc.sx < -4) v.flip = true;
      else if (fc.sx > 4) v.flip = false;
      const dir = v.back ? 1 : 0;
      v.spr.setFlipX(v.flip);
      let frame: number;
      if (u.state === 'dead') {
        if (v.deathTick < 0) v.deathTick = tick;
        const t = (now - v.deathTick) / TICK_RATE;
        frame = t < 0.12 ? ANIM_FRAMES.die[0] : t < 0.28 ? ANIM_FRAMES.die[1] : ANIM_FRAMES.die[2];
        v.spr.setDepth(-50000 + ry);
        v.shadow.setVisible(false);
        v.ring.setVisible(false);
        v.flag.setVisible(false);
        v.spr.clearTint();
        v.spr.setFrame(dollFrame(dir, frame));
        this.fx.unit(u, rx, ry, this.time.now, false);
        continue;
      }
      const moving = Math.abs(u.vx) + Math.abs(u.vy) > 0.004;
      const sinceAtk = (now - Math.max(u.lastAttackTick, u.lastShotTick)) / TICK_RATE;
      const sinceHit = (now - u.lastHitTick) / TICK_RATE;
      if (sinceAtk >= 0 && sinceAtk < 0.42) {
        frame = sinceAtk < 0.1 ? ANIM_FRAMES.attack[0] : sinceAtk < 0.26 ? ANIM_FRAMES.attack[1] : ANIM_FRAMES.attack[2];
      } else if (sinceHit >= 0 && sinceHit < 0.18) {
        frame = ANIM_FRAMES.hit[0];
      } else if (moving || u.state === 'routing') {
        const rate = u.state === 'routing' ? 12 : 8;
        frame = ANIM_FRAMES.walk[Math.floor((now / TICK_RATE) * rate + u.id) % 4];
      } else {
        frame = ANIM_FRAMES.idle[Math.floor((now / TICK_RATE) * 1.6 + u.id * 0.37) % 2];
      }
      v.spr.setFrame(dollFrame(dir, frame));
      v.spr.setDepth(ry);
      v.shadow.setVisible(true);
      if (sinceHit >= 0 && sinceHit < 0.12) v.spr.setTint(0xff9a8a);
      else if (u.berserk > 0) {
        // fury: blood-red, flickering, shaking
        v.spr.setTint(Math.floor(this.time.now / 90) % 2 ? 0xff6050 : 0xe83828);
        if (!this.paused) v.spr.setX(rx + (Math.floor(this.time.now / 45) % 2 ? 1 : -1));
      } else if (u.daze > 0 && u.stun <= 0) v.spr.setTint(0xd8d0f0);
      else if (u.state === 'routing') v.spr.setTint(0xd8c8b8);
      else v.spr.clearTint();
      this.fx.unit(u, rx, ry, this.time.now, true);
      // a steady aura visibly lifts spirits now and then
      if (u.aura & AURAS.steady.bit && u.morale < u.stats.morale && !this.paused && this.time.now - this.lastSparkle > 140 && (u.id * 7 + Math.floor(this.time.now / 140)) % 9 === 0) {
        this.lastSparkle = this.time.now;
        this.fx.sparkle(rx, ry - 20, AURAS.steady.color, 2);
      }
      const selected = u.side === 0 && (u.group === this.selGroup || u.id === this.selUnit);
      v.ring.setVisible(selected);
      if (selected) v.ring.setTexture(u.id === this.selUnit ? 'ring_one' : 'ring_sel');
      v.flag.setVisible(u.state === 'routing');
      if (u.state === 'routing') v.flag.setPosition(rx + 3, ry - 26);
    }
  }

  private renderProjectiles(alpha: number): void {
    const g = this.projG;
    g.clear();
    const now = this.sim.tick + alpha;
    for (const p of this.sim.projectiles) {
      const t = (now - p.t0) / p.dur;
      const s0 = isoToScreen(p.sx, p.sy);
      const t0 = isoToScreen(p.tx, p.ty);
      const sx = s0.x;
      const sy = s0.y;
      const tx = t0.x;
      const ty = t0.y;
      const dist = Math.sqrt((tx - sx) ** 2 + ((ty - sy) * 2) ** 2);
      const arcH = p.kind === 'stone' ? dist * 0.12 : dist * 0.22;
      if (p.done) {
        if (p.hitId >= 0 || p.kind === 'stone') continue;
        // stuck in the ground
        const dx = Math.sign(tx - sx) || 1;
        g.lineStyle(1, p.kind === 'javelin' ? P.wood[1] : P.wood[0], 1);
        g.lineBetween(Math.round(tx), Math.round(ty), Math.round(tx - dx * 3), Math.round(ty - 5));
        continue;
      }
      if (t < 0 || t > 1) continue;
      const height = Math.sin(Math.PI * t) * arcH + 16 * (1 - t) + 4 * t;
      const x = sx + (tx - sx) * t;
      const y = sy + (ty - sy) * t - height;
      if (p.kind === 'stone') {
        g.fillStyle(0x5a5650, 1);
        g.fillRect(Math.round(x), Math.round(y), 2, 2);
        continue;
      }
      // orientation from the derivative of the arc
      const t2 = Math.min(1, t + 0.02);
      const h2 = Math.sin(Math.PI * t2) * arcH + 16 * (1 - t2) + 4 * t2;
      let vx = (tx - sx) * 0.02;
      let vy = (ty - sy) * 0.02 - (h2 - height);
      const l = Math.sqrt(vx * vx + vy * vy) || 1;
      vx /= l;
      vy /= l;
      const len = p.kind === 'javelin' ? 8 : 5;
      g.lineStyle(1, p.kind === 'javelin' ? P.wood[1] : P.wood[0], 1);
      g.lineBetween(Math.round(x - vx * len), Math.round(y - vy * len), Math.round(x), Math.round(y));
      g.fillStyle(P.iron[0], 1);
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }

  /** Dashed placement boxes for the selected group's slots (and the drag preview). */
  private renderBoxes(): void {
    const g = this.boxes;
    g.clear();
    if (this.sim.phase === 'deploy') {
      const z = this.sim.deployZone(0);
      const quad = [
        [0, z.y0],
        [this.sim.width, z.y0],
        [this.sim.width, z.y1],
        [0, z.y1],
      ].map(([x, y]) => {
        const p = isoToScreen(x, y);
        return [Math.round(p.x), Math.round(p.y)] as [number, number];
      });
      g.fillStyle(0x4a6b8a, 0.12);
      g.fillPoints(quad.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
      this.dashRect(g, quad, 0xf6ecd8, 0.6, 4, 3);
    }
    const drawSlots = (slots: { x: number; y: number }[], fx: number, fy: number, color: number, a: number) => {
      const r = rightOf(fx, fy);
      const hw = 0.36;
      const hd = 0.4;
      for (const s of slots) {
        const corners: [number, number][] = [
          [s.x - r.x * hw + fx * hd, s.y - r.y * hw + fy * hd],
          [s.x + r.x * hw + fx * hd, s.y + r.y * hw + fy * hd],
          [s.x + r.x * hw - fx * hd, s.y + r.y * hw - fy * hd],
          [s.x - r.x * hw - fx * hd, s.y - r.y * hw - fy * hd],
        ].map(([x, y]) => {
          const p = isoToScreen(x, y);
          return [Math.round(p.x), Math.round(p.y)] as [number, number];
        });
        this.dashRect(g, corners, color, a, 2, 2);
      }
    };
    if (this.dragPreview) {
      const d = this.dragPreview;
      const slots = formationSlots({ type: d.type, cx: d.cx, cy: d.cy, fx: d.fx, fy: d.fy, frontage: d.frontage }, d.n);
      drawSlots(slots, d.fx, d.fy, 0xfff4c0, 0.95);
      // facing arrow
      const a0 = isoToScreen(d.cx, d.cy);
      const a1 = isoToScreen(d.cx + d.fx * 1.6, d.cy + d.fy * 1.6);
      g.lineStyle(1, 0xfff4c0, 0.9);
      g.lineBetween(a0.x, a0.y, a1.x, a1.y);
      return;
    }
    if (this.selGroup >= 0) {
      const grp = this.sim.groups[this.selGroup];
      if (!grp || grp.disbanded) return;
      const slots = this.sim.groupSlots(grp.id);
      drawSlots(slots, grp.formation.fx, grp.formation.fy, 0xf6ecd8, 0.75);
    }
  }

  private dashRect(g: Phaser.GameObjects.Graphics, pts: [number, number][], color: number, alpha: number, on: number, off: number): void {
    g.fillStyle(color, alpha);
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      const len = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      const n = Math.max(1, Math.round(len));
      for (let k = 0; k <= n; k++) {
        if (k % (on + off) >= on) continue;
        const t = k / n;
        g.fillRect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), 1, 1);
      }
    }
  }

  // ===================================================================== events

  private handleEvents(events: SimEvent[]): void {
    const st = state.campaign.data.settings;
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          const u = this.sim.units[e.unit];
          if (e.dmg > 2 || Math.random() < 0.5) this.addBlood(u.x, u.y, false);
          if (this.fx.showNumbers) {
            const p = isoToScreen(u.x, u.y);
            this.fx.floatText(p.x, p.y - 30, `${Math.max(1, Math.round(e.dmg))}`, u.side === 0 ? 0xff8070 : 0xfff4d8);
          }
          if (u.side === 0 && this.time.now - this.lastHaptic > 120) {
            this.lastHaptic = this.time.now;
            haptic(e.dir === 'front' ? 'light' : 'medium');
          }
          break;
        }
        case 'block': {
          const u = this.sim.units[e.unit];
          this.spark(u.x, u.y);
          break;
        }
        case 'death': {
          const u = this.sim.units[e.unit];
          this.addBlood(u.x, u.y, true);
          if (u.side === 0) {
            hapticNotify('warning');
            if (st.pauseDeath) this.autoPause(`${u.name} has fallen`);
          }
          break;
        }
        case 'contact':
          if (e.side === 0 && st.pauseContact) this.autoPause('First contact!', true);
          break;
        case 'flanked':
          if (e.side === 0 && st.pauseFlank) this.autoPause(`${this.groupLabel(e.group)} flanked!`);
          break;
        case 'rout':
          if (e.side === 0) {
            hapticNotify('error');
            if (st.pauseRout) this.autoPause(`${this.groupLabel(e.group)} is routing!`);
            else this.showBanner(`${this.groupLabel(e.group)} is routing!`, 2500);
          } else this.showBanner(`Enemy ${this.sim.groups[e.group].name} breaks!`, 2500);
          break;
        case 'ability':
          this.abilityFx(e.unit, e.ability, e.targets);
          break;
        case 'retreat':
          if (e.side === 0) this.retreatMsg = e.caught > 0 ? `Retreat! ${e.caught} cut down` : 'Retreat! All got away';
          break;
        case 'end':
          this.onEnd(e.winner);
          break;
        default:
          break;
      }
    }
  }

  private groupLabel(gid: number): string {
    const g = this.sim.groups[gid];
    return g ? g.name : 'Group';
  }

  private addBlood(x: number, y: number, big: boolean): void {
    const n = big ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const v = Math.floor(Math.random() * 4);
      const p = isoToScreen(x, y);
      const img = this.add
        .image(Math.round(p.x + (Math.random() - 0.5) * 10), Math.round(p.y + (Math.random() - 0.5) * 4), `blood${v}`)
        .setDepth(-90000)
        .setAlpha(0.85)
        .setFlipX(Math.random() < 0.5);
      this.world.add(img);
      this.decals.push(img);
    }
    while (this.decals.length > 260) this.decals.shift()!.destroy();
  }

  private spark(x: number, y: number): void {
    const p = isoToScreen(x, y);
    const s = this.add.image(Math.round(p.x + 4), Math.round(p.y - 14), 'spark').setDepth(95000);
    this.world.add(s);
    this.tweens.add({ targets: s, alpha: 0, duration: 180, onComplete: () => s.destroy() });
  }

  private autoPause(msg: string, always = false): void {
    if (!always && this.time.now - this.lastAutoPause < 4000) {
      this.showBanner(msg, 2200);
      return;
    }
    this.lastAutoPause = this.time.now;
    this.setPaused(true);
    this.showBanner(msg, 0);
  }

  private onEnd(winner: number): void {
    if (this.ending) return;
    this.ending = true;
    const msg = this.retreatMsg ?? (winner === 0 ? 'Victory!' : winner === 1 ? 'Defeat' : 'Stalemate');
    this.showBanner(msg, 0);
    hapticNotify(winner === 0 ? 'success' : 'error');
    this.time.delayedCall(1800, () => this.finish());
  }

  private finish(): void {
    const camp = state.campaign;
    const res = this.sim.result();
    reportBattle(this.verifySetup, this.sim, this.deployOrders);
    const heroes = camp.data.heroes;
    const pending = state.pending!;
    const { outcome, survivors } = resolveBattle(res, heroes, this.enemyHeroes, camp.random());
    const alive = new Set(survivors.map((h) => h.id));
    const fallen = heroes.filter((h) => !alive.has(h.id));
    camp.data.heroes = survivors;
    camp.data.gold += outcome.gold;
    camp.data.fought++;
    if (outcome.victory) camp.data.won++;
    if (pending.partyId !== undefined) camp.afterPartyBattle(pending.partyId, outcome);
    else if (survivors.length === 0) {
      for (let i = 0; i < 3; i++) camp.data.heroes.push(makeHero(camp.random(), camp.data, 'greek', 'raw', 1, 1, i < 2 ? 0 : 1, camp.data.heroes));
    }
    state.last = { outcome, enemy: pending.enemy, fallen, partyId: pending.partyId, label: pending.label };
    state.pending = null;
    void state.save();
    this.scene.start('Results');
  }

  /** Leave the deployment screen without fighting (back to the map or the army). */
  private leaveDeploy(): void {
    const p = state.pending;
    if (p && p.partyId !== undefined) this.scene.start('World', { encounter: p.partyId });
    else this.scene.start('Army');
  }

  /** Visuals for an ability: icon popping above the user, bursts, waves, sparkles. */
  private abilityFx(unit: number, id: AbilityId, targets: number[]): void {
    const u = this.sim.units[unit];
    const p = isoToScreen(u.x, u.y);
    const def = ABILITIES[id];
    this.fx.floatIcon(p.x, p.y - 44, `fxicon_${id}`);
    if (u.side === 0) haptic('heavy');
    switch (id) {
      case 'bash':
        for (const t of targets) {
          const q = isoToScreen(this.sim.units[t].x, this.sim.units[t].y);
          this.fx.burst((p.x + q.x) / 2, (p.y + q.y) / 2 - 14, def.color, 10, { speed: 50, up: 25, life: 0.4 });
        }
        break;
      case 'berserk':
        this.fx.burst(p.x, p.y - 16, def.color, 18, { speed: 45, up: 30, life: 0.6, big: true });
        break;
      case 'volley':
        for (const t of targets) {
          const q = isoToScreen(this.sim.units[t].x, this.sim.units[t].y);
          this.fx.burst(q.x, q.y - 16, def.color, 4, { speed: 20, up: 20, life: 0.4 });
        }
        break;
      case 'rally':
        this.fx.wave(p.x, p.y, 'steady', rallyRadius(u.stats));
        for (const t of targets) {
          const q = isoToScreen(this.sim.units[t].x, this.sim.units[t].y);
          this.fx.sparkle(q.x, q.y - 22, def.color, 4);
        }
        break;
    }
    if (u.side === 0) this.showBanner(`${u.name}: ${def.name}!`, 1100);
  }

  // ===================================================================== input

  private onDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    const down = this.input.manager.pointers.filter((q) => q.isDown);
    if (down.length >= 2) {
      // second finger: pinch/pan, cancel any formation drag
      this.gesture = null;
      this.dragPreview = null;
      const [a, b] = down;
      this.pinch = { d0: Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y), z0: this.cameras.main.zoom, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      this.setFollow(false);
      return;
    }
    if (over.length > 0 || this.overlay) {
      this.gesture = null;
      return;
    }
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    this.gesture = { mode: 'pending', id: p.id, sx: p.x, sy: p.y, lx: p.x, ly: p.y, wx0: w.x, wy0: w.y };
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const cam = this.cameras.main;
    if (this.pinch) {
      const down = this.input.manager.pointers.filter((q) => q.isDown);
      if (down.length < 2) return;
      const [a, b] = down;
      const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const z = Phaser.Math.Clamp(this.pinch.z0 * (d / Math.max(1, this.pinch.d0)), 1, 4);
      cam.setZoom(z);
      cam.scrollX -= (cx - this.pinch.cx) / z;
      cam.scrollY -= (cy - this.pinch.cy) / z;
      this.pinch.cx = cx;
      this.pinch.cy = cy;
      return;
    }
    const g = this.gesture;
    if (!g || p.id !== g.id || !p.isDown) return;
    const moved = Math.abs(p.x - g.sx) + Math.abs(p.y - g.sy);
    if (g.mode === 'pending' && moved > 12) {
      g.mode = this.selGroup >= 0 && this.canCommand() ? 'formation' : 'pan';
    }
    if (g.mode === 'pan') {
      this.setFollow(false);
      cam.scrollX -= (p.x - g.lx) / cam.zoom;
      cam.scrollY -= (p.y - g.ly) / cam.zoom;
    } else if (g.mode === 'formation') {
      const w = cam.getWorldPoint(p.x, p.y);
      const a = screenToIso(g.wx0, g.wy0);
      const b = screenToIso(w.x, w.y);
      this.updateDragPreview(a.x, a.y, b.x, b.y);
    }
    g.lx = p.x;
    g.ly = p.y;
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (this.pinch) {
      const down = this.input.manager.pointers.filter((q) => q.isDown);
      if (down.length < 2) {
        this.pinch = null;
        this.setZoom(Math.round(this.cameras.main.zoom));
      }
      this.gesture = null;
      return;
    }
    const g = this.gesture;
    this.gesture = null;
    if (!g || p.id !== g.id) return;
    if (g.mode === 'pending') this.tap(p);
    else if (g.mode === 'formation' && this.dragPreview) {
      const d = this.dragPreview;
      this.dragPreview = null;
      this.command({ kind: 'form', group: -1, cx: d.cx, cy: d.cy, fx: d.fx, fy: d.fy, frontage: d.frontage });
    }
  }

  private setZoom(z: number): void {
    const cam = this.cameras.main;
    const target = Phaser.Math.Clamp(z, 1, 4);
    if (target !== cam.zoom) this.setFollow(false);
    this.tweens.add({ targets: cam, zoom: target, duration: 120 });
  }

  private updateDragPreview(ax: number, ay: number, bx: number, by: number): void {
    const grp = this.sim.groups[this.selGroup];
    if (!grp) return;
    const n = this.selUnit >= 0 && !grp.individual ? 1 : this.sim.activeMembers(grp.id).length;
    if (n === 0) return;
    let dx = bx - ax;
    let dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    const type = this.selUnit >= 0 ? 'line' : grp.formation.type;
    if (len < 0.6) {
      this.dragPreview = { cx: bx, cy: by, fx: grp.formation.fx, fy: grp.formation.fy, frontage: grp.formation.frontage, type, n };
      return;
    }
    dx /= len;
    dy /= len;
    // facing: perpendicular to the drawn line, toward the enemy
    let fx = dy;
    let fy = -dx;
    const ec = this.enemyCentroid();
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    if ((ec.x - mx) * fx + (ec.y - my) * fy < 0) {
      fx = -fx;
      fy = -fy;
    }
    const frontage = frontageForWidth(type, len, n);
    this.dragPreview = { cx: mx, cy: my, fx, fy, frontage, type, n };
  }

  private enemyCentroid(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    let n = 0;
    for (const u of this.sim.units) {
      if (u.side !== 1 || u.state !== 'ready') continue;
      x += u.x;
      y += u.y;
      n++;
    }
    return n ? { x: x / n, y: y / n } : { x: this.sim.width / 2, y: 0 };
  }

  private tap(p: Phaser.Input.Pointer): void {
    const cam = this.cameras.main;
    const w = cam.getWorldPoint(p.x, p.y);
    // nearest unit in screen space
    let best: SimUnit | null = null;
    let bestD = 26;
    for (const v of this.views) {
      const u = v.u;
      if (u.state === 'dead' || u.state === 'fled') continue;
      const sx = (v.spr.x - cam.worldView.x) * cam.zoom;
      const sy = (v.spr.y - 12 - cam.worldView.y) * cam.zoom;
      const d = Math.sqrt((sx - p.x) ** 2 + (sy - p.y) ** 2);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    if (best && best.side === 0) {
      const g = this.sim.groups[best.group];
      if (g.individual) {
        this.selGroup = g.id;
        this.selUnit = best.id;
      } else if (this.selGroup === best.group && this.selUnit !== best.id) {
        this.selUnit = best.id;
      } else if (this.selUnit === best.id) {
        this.selUnit = -1;
      } else {
        this.selGroup = best.group;
        this.selUnit = -1;
      }
      haptic('light');
      this.buildHud();
      return;
    }
    if (best && best.side === 1) {
      if (this.selGroup >= 0 && this.canCommand() && this.sim.phase === 'battle') {
        this.attackUnit(best);
      } else {
        const h = this.enemyHeroes.find((x) => x.id === best!.heroId);
        const wpn = h?.equip.weapon ? itemDef(h.equip.weapon.def).name : 'unarmed';
        this.showBanner(`${best.name} - ${wpn}`, 1800);
      }
      return;
    }
    if (this.selGroup >= 0 && this.canCommand()) {
      const grp = this.sim.groups[this.selGroup];
      const f = grp.formation;
      const fp = screenToIso(w.x, w.y);
      this.command({ kind: 'form', group: -1, cx: fp.x, cy: fp.y, fx: f.fx, fy: f.fy, frontage: this.selUnit >= 0 && !grp.individual ? 1 : f.frontage });
    }
  }

  private attackUnit(target: SimUnit): void {
    const grp = this.sim.groups[this.selGroup];
    const mem = this.selUnit >= 0 ? [this.sim.units[this.selUnit]] : this.sim.activeMembers(grp.id);
    if (mem.length === 0) return;
    let cx = 0;
    let cy = 0;
    for (const u of mem) {
      cx += u.x;
      cy += u.y;
    }
    cx /= mem.length;
    cy /= mem.length;
    let fx = target.x - cx;
    let fy = target.y - cy;
    const l = Math.sqrt(fx * fx + fy * fy) || 1;
    fx /= l;
    fy /= l;
    const stop = Math.max(0, l - 1.2);
    const f = grp.formation;
    this.command({ kind: 'form', group: -1, cx: cx + fx * stop, cy: cy + fy * stop, fx, fy, frontage: this.selUnit >= 0 && !grp.individual ? 1 : f.frontage });
    this.command({ kind: 'order', group: -1, order: 'charge' });
    this.showBanner(`Attack ${target.name}!`, 1200);
  }

  private canCommand(): boolean {
    if (this.sim.phase === 'ended') return false;
    if (this.selUnit >= 0) return this.sim.units[this.selUnit].state === 'ready';
    return this.sim.activeMembers(this.selGroup).length > 0;
  }

  /**
   * Issue an order to the current selection (group -1 = selected). A selected
   * individual hero is detached into its own group first.
   */
  private command(o: Order): void {
    if (this.selGroup < 0) return;
    let gid = this.selGroup;
    if (this.selUnit >= 0) {
      const u = this.sim.units[this.selUnit];
      const g = this.sim.groups[u.group];
      if (!g.individual) this.sim.issue(0, { kind: 'detach', unit: u.id });
      gid = u.group;
      this.selGroup = gid;
    }
    const withGroup = { ...o, group: gid } as Order;
    this.sim.issue(0, withGroup);
    haptic('medium');
    this.hudDirty = true;
    this.buildHud();
  }

  private firstPlayerGroup(): number {
    const g = this.sim.groups.find((x) => x.side === 0 && !x.disbanded && this.sim.activeMembers(x.id).length > 0);
    return g ? g.id : -1;
  }

  // ===================================================================== HUD

  private setPaused(p: boolean): void {
    this.paused = p;
    this.pauseBtn?.setIcon(p ? 'play' : 'pause');
    this.pauseBtn?.setSelected(p);
    if (!p && this.banner && this.bannerTimer === null) this.hideBanner();
  }

  private togglePause(): void {
    if (this.sim.phase !== 'battle') return;
    this.setPaused(!this.paused);
  }

  private showBanner(msg: string, ms: number): void {
    this.hideBanner();
    const { VW } = this.m;
    const c = this.add.container(0, 0);
    const t = addText(this, VW / 2, 34, msg, 'red', 0.5);
    const w = Math.max(80, t.width + 20);
    c.add(addPanel(this, Math.round((VW - w) / 2), 27, w, 20, 'parch'));
    c.add(t);
    if (ms === 0 && this.paused) c.add(addText(this, VW / 2, 50, 'Paused - give orders, then play', 'light', 0.5));
    this.ui.add(c);
    this.banner = c;
    this.bannerTimer = ms > 0 ? this.time.delayedCall(ms, () => this.hideBanner()) : null;
  }

  private hideBanner(): void {
    this.bannerTimer?.remove();
    this.bannerTimer = null;
    this.banner?.destroy();
    this.banner = null;
  }

  private buildHud(): void {
    this.hud.removeAll(true);
    this.groupTabs = [];
    this.abilityBtns = [];
    this.followBtn = null;
    this.orderBtns.clear();
    this.presetBtns.clear();
    this.heroInfo = null;
    this.statusText = null;
    const { VW, VH } = this.m;
    const H = this.hud;
    const deploy = this.sim.phase === 'deploy';

    // ---- top bar
    H.add(addPanel(this, 0, 0, VW, 24, 'parch'));
    if (deploy) {
      H.add(new Button(this, 3, 2, 26, 20, { icon: 'back', onClick: () => this.leaveDeploy() }));
      H.add(addText(this, 34, 4, 'Deployment', 'red'));
      H.add(addText(this, 34, 13, `vs ${state.pending!.label ?? CULTURE_LABEL[state.pending!.enemy.culture]} (${this.enemyHeroes.length})`, 'dim'));
      this.pauseBtn = null;
      this.speedBtn = null;
      this.clock = null;
    } else {
      this.pauseBtn = new Button(this, 3, 2, 26, 20, { icon: this.paused ? 'play' : 'pause', style: this.paused ? 'buttonSel' : 'button', onClick: () => this.togglePause() });
      this.speedBtn = new Button(this, 31, 2, 26, 20, { label: `${this.speed}x`, onClick: () => this.toggleSpeed() });
      const retreatBtn = new Button(this, 59, 2, 22, 20, { icon: 'flag', onClick: () => this.openRetreat() });
      retreatBtn.setEnabled(this.sim.phase === 'battle');
      H.add([this.pauseBtn, this.speedBtn, retreatBtn]);
      this.clock = addText(this, 85, 8, '', 'ink');
      H.add(this.clock);
    }
    if (!deploy) {
      const mw = Math.max(30, Math.min(64, VW - 140));
      const mx = VW - mw - 6;
      H.add(addText(this, mx - 3, 3, 'You', 'dim', 1));
      H.add(addText(this, mx - 3, 13, 'Foe', 'dim', 1));
      this.strength = [new Meter(this, mx, 4, mw, 6, P.blue), new Meter(this, mx, 14, mw, 6, P.bad)];
      H.add(this.strength);
    } else this.strength = null;

    // ---- bottom panel
    const rowH = 26;
    const by = VH - (deploy ? 2 * rowH + 22 + 14 : 3 * rowH + 18 + 6);
    H.add(addPanel(this, 0, by, VW, VH - by, 'parch'));
    let y = by + 4;
    // group tabs
    const groups = this.sim.groups.filter((g) => g.side === 0 && !g.disbanded && (this.sim.members(g.id).length > 0 || deploy) && !g.individual);
    const indiv = this.sim.groups.filter((g) => g.side === 0 && g.individual && !g.disbanded);
    const tabsAll = [...groups, ...indiv].slice(0, 6);
    const tw = Math.floor((VW - 8 - (tabsAll.length - 1) * 3) / Math.max(1, tabsAll.length));
    tabsAll.forEach((g, i) => {
      const n = this.sim.activeMembers(g.id).length;
      const label = g.individual ? `${g.name.slice(0, 5)}` : `${ROMAN[i] ?? i + 1} ${n}`;
      const btn = new Button(this, 4 + i * (tw + 3), y, tw, 22, {
        label,
        style: this.selGroup === g.id ? 'buttonSel' : n === 0 && !deploy ? 'buttonOff' : 'button',
        onClick: () => {
          if (this.selGroup === g.id && this.selUnit < 0) this.selGroup = -1;
          else this.selGroup = g.id;
          this.selUnit = g.individual ? this.sim.members(g.id)[0]?.id ?? -1 : -1;
          this.buildHud();
        },
      });
      H.add(btn);
      const meter = new Meter(this, 4 + i * (tw + 3) + 4, y + 16, tw - 8, 3, P.gold);
      H.add(meter);
      this.groupTabs.push({ gid: g.id, btn, meter, label, prefix: g.individual ? '' : ROMAN[i] ?? `${i + 1}` });
    });
    y += 25;
    const sel = this.selGroup >= 0 ? this.sim.groups[this.selGroup] : null;
    const cols = 6;
    const bw = Math.floor((VW - 8 - (cols - 1) * 2) / cols);
    if (deploy) {
      const w3 = Math.floor((VW - 8 - 4) / 3);
      H.add(new Button(this, 4, y, w3, rowH, { label: 'Groups', icon: 'people', onClick: () => this.openGroups() }));
      H.add(new Button(this, 6 + w3, y, w3, rowH, { label: 'Reset', icon: 'hold', onClick: () => this.resetDeploy() }));
      H.add(new Button(this, 8 + 2 * w3, y, w3, rowH, { label: 'Fight!', icon: 'swords', style: 'buttonSel', onClick: () => this.startFight() }));
      y += rowH + 2;
    } else {
      const orders: [string, string, string, () => void][] = [
        ['hold', 'Hold', 'hold', () => this.command({ kind: 'order', group: -1, order: 'hold' })],
        ['advance', 'Adv', 'advance', () => this.command({ kind: 'order', group: -1, order: 'advance' })],
        ['charge', 'Chrg', 'charge', () => this.command({ kind: 'order', group: -1, order: 'charge' })],
        ['loose', 'Throw', 'throw', () => this.command({ kind: 'loose', group: -1 })],
        ['wall', 'Wall', 'wall', () => this.command({ kind: 'shieldwall', group: -1 })],
        ['fallback', 'Back', 'fallback', () => this.command({ kind: 'order', group: -1, order: 'fallback' })],
      ];
      orders.forEach(([key, label, icon, cb], i) => {
        const b = new Button(this, 4 + i * (bw + 2), y, bw, rowH, { label, icon, onClick: cb });
        this.orderBtns.set(key, b);
        H.add(b);
      });
      y += rowH + 2;
    }
    const presets: [FormationType, string, string][] = [
      ['line', 'Line', 'f_line'],
      ['column', 'Col', 'f_column'],
      ['wedge', 'Wedge', 'f_wedge'],
      ['skirmish', 'Loose', 'f_skirm'],
      ['shieldwall', 'Wall', 'f_wall'],
    ];
    presets.forEach(([type, label, icon], i) => {
      const b = new Button(this, 4 + i * (bw + 2), y, bw, rowH, { label, icon, onClick: () => this.command({ kind: 'preset', group: -1, type }) });
      this.presetBtns.set(type, b);
      H.add(b);
    });
    // detach / rejoin
    const u = this.selUnit >= 0 ? this.sim.units[this.selUnit] : null;
    const lastX = 4 + 5 * (bw + 2);
    if (u && this.sim.groups[u.group].individual) {
      H.add(new Button(this, lastX, y, bw, rowH, { label: 'Join', icon: 'people', onClick: () => this.rejoin(u) }));
    } else if (u) {
      H.add(new Button(this, lastX, y, bw, rowH, { label: 'Solo', icon: 'detach', onClick: () => this.detach(u) }));
    } else {
      H.add(new Button(this, lastX, y, bw, rowH, { label: 'None', icon: 'close', onClick: () => this.deselect() }));
    }
    if (!sel) {
      for (const b of [...this.orderBtns.values(), ...this.presetBtns.values()]) b.setEnabled(false);
    }
    // hero info, or a one-line status of the selected group
    if (u) this.buildHeroInfo(u, by - 34);
    else {
      const strip = addPanel(this, 4, by - 15, VW - 8, 14, 'parch');
      this.statusText = addText(this, VW / 2, by - 12, '', 'ink', 0.5);
      H.add([strip, this.statusText]);
    }
    if (!deploy) {
      this.buildAbilityBar((u ? by - 34 : by - 15) - 27);
      this.followBtn = new Button(this, VW - 27, 27, 24, 20, { icon: 'eye', style: this.follow ? 'buttonSel' : 'button', onClick: () => this.toggleFollow() });
      H.add(this.followBtn);
    }
    this.hudDirty = true;
    this.refreshHud();
  }

  private buildHeroInfo(u: SimUnit, y: number): void {
    const { VW } = this.m;
    const c = this.add.container(0, 0);
    c.add(addPanel(this, 4, y, VW - 8, 32, 'parch'));
    const hero = this.views[u.id].hero;
    c.add(addText(this, 9, y + 5, `${u.name} Lv${u.level}`, 'red'));
    const wpn = hero.equip.weapon ? itemDef(hero.equip.weapon.def).name : 'Unarmed';
    c.add(addText(this, 9, y + 16, wpn, 'dim'));
    const mx = VW - 70;
    const meters = [new Meter(this, mx, y + 5, 60, 5, P.bad), new Meter(this, mx, y + 13, 60, 5, P.gold), new Meter(this, mx, y + 21, 60, 5, P.good)];
    c.add(addText(this, mx - 3, y + 4, 'HP', 'dim', 1));
    c.add(addText(this, mx - 3, y + 12, 'MOR', 'dim', 1));
    c.add(addText(this, mx - 3, y + 20, 'STA', 'dim', 1));
    c.add(meters);
    c.setData('meters', meters);
    c.setData('unit', u.id);
    this.hud.add(c);
    this.heroInfo = c;
  }

  private refreshHud(): void {
    this.hudDirty = false;
    if (this.statusText && this.statusText.active) {
      const g = this.selGroup >= 0 ? this.sim.groups[this.selGroup] : null;
      let txt = this.sim.phase === 'deploy' ? 'Tap a group, drag on the ground to place it' : 'Tap a group tag or soldier to select';
      if (g) {
        const n = this.sim.activeMembers(g.id).length;
        const parts = [g.name, `${n} men`, this.sim.phase === 'deploy' ? 'drag to place' : g.order, g.formation.type];
        if (g.shieldWall) parts.push('wall');
        if (g.routed) parts.push('ROUTED');
        txt = parts.join(' - ');
      }
      this.statusText.setText(txt.toUpperCase());
    }
    if (this.clock) {
      const s = Math.floor(this.sim.tick / TICK_RATE);
      this.clock.setText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    }
    if (this.strength) {
      this.strength[0].setValue(this.sim.sideStrength(0), this.initialStrength[0]);
      this.strength[1].setValue(this.sim.sideStrength(1), this.initialStrength[1]);
    }
    for (const t of this.groupTabs) {
      const mem = this.sim.activeMembers(t.gid);
      if (t.prefix) {
        const label = `${t.prefix} ${mem.length}`;
        if (label !== t.label) {
          t.label = label;
          t.btn.setLabel(label);
        }
      }
      const m = mem.reduce((a, u) => a + u.morale / Math.max(1, u.stats.morale), 0) / Math.max(1, mem.length);
      t.meter.setValue(m, 1, m > 0.6 ? P.good : m > 0.35 ? P.gold : P.bad);
    }
    const sel = this.selGroup >= 0 ? this.sim.groups[this.selGroup] : null;
    if (sel) {
      const mem = this.selUnit >= 0 ? [this.sim.units[this.selUnit]] : this.sim.activeMembers(sel.id);
      for (const k of ['hold', 'advance', 'charge', 'fallback']) this.orderBtns.get(k)?.setSelected(sel.order === k);
      this.orderBtns.get('wall')?.setSelected(sel.shieldWall).setEnabled(mem.some((u) => u.stats.canShieldWall));
      this.orderBtns.get('loose')?.setSelected(sel.fireAtWill && mem.some((u) => u.ammo > 0)).setEnabled(mem.some((u) => u.ammo > 0));
      for (const [type, b] of this.presetBtns) b.setSelected(sel.formation.type === type);
    }
    this.refreshAbilities();
    if (this.heroInfo) {
      const u = this.sim.units[this.heroInfo.getData('unit') as number];
      const [hp, mo, st] = this.heroInfo.getData('meters') as Meter[];
      hp.setValue(u.hp, u.stats.maxHp);
      mo.setValue(u.morale, u.stats.morale);
      st.setValue(u.stamina, u.stats.stamina);
    }
  }

  /** Floating group tags above each player group (tap to select). */
  private updateTags(): void {
    const cam = this.cameras.main;
    const S = this.m.S;
    const seen = new Set<number>();
    let idx = 0;
    for (const g of this.sim.groups) {
      if (g.side !== 0 || g.disbanded) continue;
      const mem = this.sim.activeMembers(g.id);
      const label = g.individual ? '*' : ROMAN[idx] ?? '?';
      if (!g.individual) idx++;
      if (mem.length === 0) continue;
      seen.add(g.id);
      // Tag floats above the group's centre (mean position), clear of the front rank.
      let cx = 0;
      let cy = 0;
      for (const u of mem) {
        cx += u.x;
        cy += u.y;
      }
      cx /= mem.length;
      cy /= mem.length;
      const c = isoToScreen(cx, cy);
      let top = c.y;
      for (const u of mem) if (Math.abs(u.x - cx) < 3 && Math.abs(u.y - cy) < 3) top = Math.min(top, isoToScreen(u.x, u.y).y);
      const sx = (c.x - cam.worldView.x) * cam.zoom;
      const sy = (top - 34 - cam.worldView.y) * cam.zoom;
      let tag = this.tagMap.get(g.id);
      if (!tag || tag.getData('label') !== label || tag.getData('sel') !== (this.selGroup === g.id)) {
        tag?.destroy();
        tag = this.add.container(0, 0);
        const sel = this.selGroup === g.id;
        const w = label.length * 5 + 9;
        const bg = addPanel(this, -w / 2, -6, w, 13, sel ? 'buttonSel' : 'button');
        bg.setInteractive();
        tappable(bg, null, () => {
          this.selGroup = g.id;
          this.selUnit = g.individual ? mem[0].id : -1;
          this.buildHud();
        });
        tag.add(bg);
        tag.add(addText(this, 0, -3, label, sel ? 'light' : 'red', 0.5));
        tag.setData('label', label);
        tag.setData('sel', sel);
        this.tags.add(tag);
        this.tagMap.set(g.id, tag);
      }
      tag.setPosition(Math.round(sx / S), Math.round(Math.max(30, sy / S)));
    }
    for (const [gid, tag] of this.tagMap) {
      if (!seen.has(gid)) {
        tag.destroy();
        this.tagMap.delete(gid);
      }
    }
  }

  private toggleFollow(): void {
    this.setFollow(!this.follow);
    if (this.follow) haptic('light');
  }

  /** Units the current selection commands (one hero or the group's active members). */
  private selectedUnits(): SimUnit[] {
    if (this.selUnit >= 0) return [this.sim.units[this.selUnit]].filter((u) => u.state === 'ready');
    if (this.selGroup < 0) return [];
    return this.sim.activeMembers(this.selGroup);
  }

  /** Ability buttons for the selection, right-aligned above the info strip. */
  private buildAbilityBar(y: number): void {
    const { VW } = this.m;
    const ids: AbilityId[] = [];
    for (const u of this.selectedUnits()) for (const id of u.abil) if (!ids.includes(id)) ids.push(id);
    const w = 28;
    const h = 25;
    ids.slice(0, 5).forEach((id, i) => {
      const x = VW - 4 - (ids.length - i) * (w + 2);
      const btn = new Button(this, x, y, w, h, { icon: ABILITIES[id].icon, onClick: () => this.useAbility(id) });
      const g = this.add.graphics({ x, y });
      const count = addText(this, x + w - 3, y + h - 10, '', 'gold', 1);
      this.hud.add([btn, g, count]);
      this.abilityBtns.push({ id, btn, g, count, w, h });
    });
  }

  /** Cooldown sweeps: a dark wedge shrinking clockwise in 16 steps; dimmed when unusable. */
  private refreshAbilities(): void {
    if (this.abilityBtns.length === 0) return;
    const units = this.selectedUnits();
    for (const a of this.abilityBtns) {
      const holders = units.filter((u) => u.abil.includes(a.id));
      const ready = holders.filter((u) => this.sim.abilityReady(u, a.id));
      let frac = 0;
      if (ready.length === 0 && holders.length > 0) {
        const max = ABILITIES[a.id].cooldown * TICK_RATE;
        const cd = Math.min(...holders.map((u) => this.sim.abilityCooldown(u, a.id)));
        frac = Math.min(1, cd / Math.max(1, max * holders[0].stats.cdMult));
      }
      a.g.clear();
      if (ready.length === 0) {
        if (frac > 0) {
          const steps = Math.ceil(frac * 16) / 16;
          a.g.fillStyle(0x2a1a16, 0.55);
          a.g.slice(a.w / 2, a.h / 2 - 1, Math.min(a.w, a.h) / 2 - 2, -Math.PI / 2, -Math.PI / 2 + steps * Math.PI * 2, false);
          a.g.fillPath();
        } else {
          a.g.fillStyle(0x2a1a16, 0.3);
          a.g.fillRect(2, 2, a.w - 4, a.h - 4);
        }
      }
      a.count.setText(ready.length > 1 ? `${ready.length}` : '');
    }
  }

  private useAbility(id: AbilityId): void {
    const units = this.selectedUnits().filter((u) => u.abil.includes(id));
    const ready = units.filter((u) => this.sim.abilityReady(u, id));
    if (ready.length === 0) {
      hapticNotify('error');
      const why = units.some((u) => this.sim.abilityCooldown(u, id) > 0) ? 'recovering' : id === 'bash' ? 'no enemy in front' : id === 'volley' ? 'no missile-men with a target' : 'not ready';
      this.showBanner(`${ABILITIES[id].name}: ${why}`, 1200);
      return;
    }
    let users = ready;
    if (ABILITIES[id].groupMode === 'one') {
      // the best-placed holder: for a volley the one with most shooters, else the most central
      let cx = 0;
      let cy = 0;
      for (const u of units) {
        cx += u.x;
        cy += u.y;
      }
      cx /= units.length;
      cy /= units.length;
      const score = (u: SimUnit) => (id === 'volley' ? this.sim.volleyShooters(u).length * 10 : 0) - Math.hypot(u.x - cx, u.y - cy);
      users = [ready.slice().sort((a, b) => score(b) - score(a))[0]];
    }
    for (const u of users) this.sim.issue(0, { kind: 'ability', unit: u.id, ability: id });
    this.handleEvents(this.sim.drainEvents());
    this.hudDirty = true;
  }

  private toggleSpeed(): void {
    this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
    this.speedBtn?.setLabel(`${this.speed}x`);
  }

  private deselect(): void {
    this.selGroup = -1;
    this.selUnit = -1;
    this.buildHud();
  }

  private detach(u: SimUnit): void {
    this.command({ kind: 'order', group: -1, order: 'hold' });
    this.selUnit = u.id;
  }

  private rejoin(u: SimUnit): void {
    const home = u.homeGroup;
    this.sim.issue(0, { kind: 'rejoin', unit: u.id });
    this.selGroup = home;
    this.selUnit = -1;
    this.buildHud();
  }

  private startFight(): void {
    this.deployOrders = this.sim.orderLog.length;
    this.sim.startBattle();
    this.setFollow(true);
    hapticNotify('success');
    this.hideBanner();
    this.showBanner('Battle begins!', 1500);
    this.buildHud();
  }

  private resetDeploy(): void {
    this.sim.autoDeploy(0);
    for (const v of this.views) {
      v.px = v.u.x;
      v.py = v.u.y;
    }
    this.buildHud();
  }

  // ---- retreat confirmation

  /** Ask before retreating: the battle is lost, men in contact or routing may be caught. */
  private openRetreat(): void {
    if (this.sim.phase !== 'battle' || this.overlay) return;
    const wasPaused = this.paused;
    this.setPaused(true);
    this.hideBanner();
    const { VW, VH } = this.m;
    const c = this.add.container(0, 0);
    this.ui.add(c);
    this.overlay = c;
    c.add(this.add.rectangle(0, 0, VW, VH, 0x000000, 0.55).setOrigin(0, 0).setInteractive());
    const w = VW - 24;
    const h = 112;
    const x = 12;
    const y = Math.round(VH / 2 - h / 2 - 20);
    c.add(addPanel(this, x, y, w, h, 'parch'));
    c.add(addText(this, VW / 2, y + 8, 'Sound the retreat?', 'red', 0.5));
    const sim = this.sim;
    const mine = sim.units.filter((u) => u.side === 0 && sim.isAlive(u));
    const atRisk = mine.filter((u) => u.state === 'routing' || u.engaged).length;
    const pursuit = Math.round(sim.pursuit(0) * 100);
    const lines = [
      'The battle is lost, but the',
      'army lives to fight again.',
      `${atRisk} of ${mine.length} men are routing or in`,
      `the fight: some may be caught.`,
      `Enemy pursuit ${pursuit}%. No spoils.`,
    ];
    lines.forEach((t, i) => c.add(addText(this, VW / 2, y + 22 + i * 10, t, i >= 2 ? 'ink' : 'dim', 0.5, w - 10)));
    const bw = Math.floor((w - 18) / 2);
    c.add(
      new Button(this, x + 6, y + h - 30, bw, 24, {
        label: 'Stay',
        icon: 'swords',
        onClick: () => {
          c.destroy();
          this.overlay = null;
          this.setPaused(wasPaused);
        },
      }),
    );
    c.add(
      new Button(this, x + 12 + bw, y + h - 30, bw, 24, {
        label: 'Retreat',
        icon: 'flag',
        style: 'buttonSel',
        onClick: () => {
          c.destroy();
          this.overlay = null;
          this.setPaused(false);
          this.sim.issue(0, { kind: 'retreat' });
          this.handleEvents(this.sim.drainEvents());
          this.buildHud();
        },
      }),
    );
  }

  // ---- group assignment overlay (deployment)

  private openGroups(): void {
    this.groupArea?.destroy();
    this.overlay?.destroy();
    const { VW, VH, S } = this.m;
    const c = this.add.container(0, 0);
    this.ui.add(c);
    this.overlay = c;
    c.add(this.add.rectangle(0, 0, VW, VH, 0x000000, 0.55).setOrigin(0, 0).setInteractive());
    const x = 4;
    const y = 30;
    const w = VW - 8;
    const h = VH - 60;
    c.add(addPanel(this, x, y, w, h, 'parch'));
    c.add(addText(this, VW / 2, y + 6, 'Assign groups', 'red', 0.5));
    c.add(addText(this, VW / 2, y + 15, GROUP_NAMES.slice(0, 2).map((n, i) => `${ROMAN[i]} ${n}`).join('   '), 'dim', 0.5));
    c.add(addText(this, VW / 2, y + 24, GROUP_NAMES.slice(2).map((n, i) => `${ROMAN[i + 2]} ${n}`).join('   '), 'dim', 0.5));
    const area = new ScrollArea(this, c, x + 4, y + 36, w - 8, h - 68, S);
    this.groupArea = area;
    const units = this.sim.units.filter((u) => u.side === 0);
    const sideGroups = this.sim.groups.filter((g) => g.side === 0 && !g.individual);
    let cy = 0;
    const rowW = w - 8;
    for (const u of units) {
      const hero = this.views[u.id].hero;
      const row = this.add.container(0, cy);
      row.add(addPanel(this, 0, 0, rowW, 24, 'inset'));
      const img = this.add.image(2, -9, ensureDoll(this, dollFromHero(hero)), dollFrame(0, 0)).setOrigin(0, 0);
      img.setCrop(4, 10, 26, 23);
      row.add(img);
      row.add(addText(this, 30, 4, hero.name, 'ink'));
      const wpn = hero.equip.weapon ? itemDef(hero.equip.weapon.def).name : 'Unarmed';
      row.add(addText(this, 30, 13, wpn.length > 12 ? wpn.slice(0, 11) + '.' : wpn, 'dim'));
      const chipW = 17;
      sideGroups.slice(0, 4).forEach((g, gi) => {
        const on = u.group === g.id;
        const b = new Button(this, rowW - 4 - (4 - gi) * (chipW + 2), 3, chipW, 18, {
          label: ROMAN[gi],
          style: on ? 'buttonSel' : 'button',
          onClick: () => {
            if (area.moved) return;
            this.sim.issue(0, { kind: 'assign', unit: u.id, group: g.id });
            hero.group = gi;
            void state.save();
            for (const v of this.views) {
              v.px = v.u.x;
              v.py = v.u.y;
            }
            this.groupScroll = area.scrollY;
            this.openGroups();
          },
        });
        row.add(b);
      });
      area.content.add(row);
      cy += 26;
    }
    area.setContentHeight(cy);
    area.setScroll(this.groupScroll);
    c.add(
      new Button(this, VW / 2 - 40, y + h - 28, 80, 22, {
        label: 'Done',
        icon: 'check',
        onClick: () => {
          this.groupArea?.destroy();
          this.groupArea = null;
          this.groupScroll = 0;
          c.destroy();
          this.overlay = null;
          this.buildHud();
        },
      }),
    );
  }
}

function uiMetricsOf(scene: Phaser.Scene): { S: number; VW: number; VH: number } {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const S = Math.max(2, Math.min(4, Math.floor(Math.min(W / 190, H / 400))));
  return { S, VW: Math.floor(W / S), VH: Math.floor(H / S) };
}

export type { SimGroup };
