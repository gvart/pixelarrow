/**
 * The living skirmish behind the main menu (src/scenes/MenuScene.ts): the
 * player's own men (their real classes, gear and cosmetics) meet a fresh band
 * of enemies in a short, scripted bout that loops forever and never repeats
 * exactly, on a letterboxed stage at the top of the screen (the menu sits
 * below it). Two lines form off the stage, close, the archers loose, the
 * lines charge into a melee of attacks,
 * blocks, flinches and a few deaths, one hero's killing blow lands in slow
 * motion with the camera pushing in, the enemy breaks and runs, the victors
 * raise their arms, a fade, and the next bout starts with new enemies.
 *
 * Everything lives in one container inside the scene's UI root (so the UI
 * scale applies): the iso plain (src/art/ground.ts), the figures as lazily
 * filled battle rows (src/ui/sprites.ts battleRow / battleFrame, the same
 * sheets as the battlefield at BATTLE_SCALE), blood decals, arrows on one
 * Graphics object and a small particle pool for dust and blood. The world is
 * positioned by the projection of src/art/iso.ts (the player bottom-left
 * facing up-right, the enemy top-right facing down-left, as in the battle).
 *
 * Light by design: a dozen figures, one sort per frame, a capped pool, and a
 * frame budget for the sheet rendering (pumpDolls). With the OS "reduce
 * motion" preference the lines just stand facing each other, breathing.
 */
import Phaser from 'phaser';
import { ANIM, BATTLE_RES, BATTLE_SCALE, FRAME, aimFrame, attackFrame, attackLength, dollFromHero, isRangedClass, weaponClass, type DollSpec, type WeaponClass } from '../../art/paperdoll';
import { renderGround } from '../../art/ground';
import { isoToScreen } from '../../art/iso';
import { P } from '../../art/palette';
import type { Hero } from '../../data/units';
import { buildArmy, type ArmyMix } from '../../game/enemy';
import { cosmeticLoadout } from '../../game/cosmetics';
import { standardArmy } from '../../game/heroes';
import { Rng } from '../../sim/rng';
import type { UIMetrics } from '../../ui/kit';
import { battleDoll, battleFrame, battleRow, dollDisplayScale, dollOrigin, flushDolls, pumpDolls, releaseBattleRows } from '../../ui/sprites';
import type { Culture } from '../../data/names';

/** The stage (UI px): an unobstructed rectangle the skirmish is masked to. */
export interface MenuStage {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Integer zoom of the battle world on the stage (2: figures twice the battlefield's size at 2x). */
  zoom: number;
}

type Side = 0 | 1;
type State = 'walk' | 'hold' | 'run' | 'fight' | 'shoot' | 'pursue' | 'win' | 'rout' | 'dead' | 'stand';
type Act = { kind: 'attack'; t0: number; wc: WeaponClass; strikeAt: number; struck: boolean } | { kind: 'hit' | 'block'; t0: number } | { kind: 'aim'; until: number };

interface Man {
  hero: Hero;
  spec: DollSpec;
  key: string;
  rowKey: string;
  row: number;
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  side: Side;
  ranged: boolean;
  wc: WeaponClass;
  shield: boolean;
  star: boolean;
  /** Field position and where he is going (field units). */
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** His place in the line (the spot he holds / returns to). */
  lineX: number;
  speed: number;
  state: State;
  act: Act | null;
  hp: number;
  phase: number;
  foe: Man | null;
  nextAtk: number;
  deathT: number;
  dieB: boolean;
  tintUntil: number;
  dustT: number;
  /** Fighters: knocked back from the spot they hold, drifting back. */
  push: number;
}

interface Missile {
  kind: 'arrow' | 'stone' | 'javelin';
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t0: number;
  dur: number;
  target: Man | null;
  done: boolean;
  /** Stuck in the ground until (battle time); stones vanish. */
  until: number;
}

interface Particle {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  grav: number;
  life: number;
  max: number;
  live: boolean;
}

const PAD = 10;
/** Field units (one = a diamond tile, 36 x 18 world px) along the line, between men. */
const LINE_SP = 0.8;
/** Where the player's line waits for the enemy before the charge, and where the lines meet (±). */
const HOLD_Y = 1.4;
const FIGHT_Y = 0.5;
/** The archers' posts behind their lines (field y), and the lines' starting distance (off the stage). */
const POST_Y = 1.6;
const START_Y = [3.6, 4.6];
const WALK = 1.05;
const RUN = 2.5;
const ROUT = 2.3;
const MAX_PARTICLES = 48;
const MAX_DECALS = 40;
/** The melee goes on for at least / at most this long (s) after the lines meet. */
const MELEE_MIN = 5.5;
const MELEE_MAX = 9.5;
const DEPTH_DEAD = -5000;
const DEPTH_DECAL = -8000;
const DEPTH_SHADOW = -9000;
const DEPTH_GROUND = -1e6;
const DEPTH_MISSILE = 1e5;
const DEPTH_PARTICLE = 1.2e5;

const DUST = 0xcbb77a;
const BLOOD = 0x8a1e16;

/** Rows 0..3: front-right, back-right, front-left, back-left (BattleScene facingRow). */
const ROW_UP_RIGHT = 1;
const ROW_DOWN_LEFT = 2;

export class MenuBattle {
  private world: Phaser.GameObjects.Container;
  private ground: Phaser.GameObjects.Image;
  private dimG: Phaser.GameObjects.Graphics | null = null;
  private fadeG: Phaser.GameObjects.Graphics | null = null;
  private projG: Phaser.GameObjects.Graphics | null = null;
  private maskG: Phaser.GameObjects.Graphics | null = null;
  private zoom = 1;
  private men: Man[] = [];
  private missiles: Missile[] = [];
  private parts: Particle[] = [];
  private decals: Phaser.GameObjects.Image[] = [];
  private rng: Rng;
  private seed: number;
  private stage: MenuStage | null = null;
  private focus = { x: 0, y: 0 };
  private nLine = 4;
  private nRanged = 2;
  /** Battle time (s, slowed in slow motion) and wall time (s). */
  private t = 0;
  private wall = 0;
  private running = false;
  private reduced: boolean;
  private rosterOffset = 0;
  // the bout
  private charged = false;
  private contactT = -1;
  private breakT = -1;
  private fadeT = -1;
  private fadeDone = false;
  private slowT = -1;
  private slowAnchor = { x: 0, y: 0 };
  private slowUsed = false;
  private playerDeaths = 0;
  private enemyShotDeaths = 0;
  private destroyed = false;
  private readonly ui: Phaser.GameObjects.Container;
  private readonly m: UIMetrics;

  constructor(
    private scene: Phaser.Scene & { ui: Phaser.GameObjects.Container; m: UIMetrics },
    private heroes: Hero[],
    seed: number,
  ) {
    this.ui = scene.ui;
    this.m = scene.m;
    this.seed = seed;
    this.rng = new Rng(seed);
    this.reduced = prefersReducedMotion();
    this.world = scene.add.container(0, 0);
    this.ui.add(this.world);
    this.ground = scene.add.image(0, 0, 'px').setOrigin(0, 0).setDepth(DEPTH_GROUND).setVisible(false);
    this.world.add(this.ground);
  }

  /**
   * The plain under the stage (world px, shown at the stage's zoom), a little
   * bigger than the stage so the camera can drift. Its faint diamond grid is
   * aligned with the field the men stand on (the world's origin, at `focus`).
   */
  private plain(): void {
    const st = this.stage!;
    const Z = this.zoom;
    const gw = Math.ceil(st.w / Z) + PAD * 2;
    const gh = Math.ceil(st.h / Z) + PAD * 2;
    const ox = -Math.round((this.focus.x - st.x) / Z) - PAD;
    const oy = -Math.round((this.focus.y - st.y) / Z) - PAD;
    const key = `menu_plain_${gw}x${gh}_${ox}_${oy}`;
    if (!this.scene.textures.exists(key)) {
      for (const k of this.scene.textures.getTextureKeys()) if (k.startsWith('menu_plain_')) this.scene.textures.remove(k);
      this.scene.textures.addCanvas(key, renderGround(gw, gh, { originX: ox, originY: oy, fieldW: 1e6, fieldH: 1e6, seed: 11 }).toCanvas());
    }
    this.ground.setTexture(key).setPosition(ox, oy).setVisible(true);
    this.world.setPosition(this.focus.x, this.focus.y).setScale(Z);
  }

  /** Begin the skirmish on the stage. */
  start(stage: MenuStage): void {
    if (this.destroyed) return;
    this.stage = stage;
    this.zoom = Math.max(1, Math.round(stage.zoom));
    // the lines meet a little below the middle of the stage (the title sits at its top)
    this.focus.x = Math.round(stage.x + stage.w * 0.5);
    this.focus.y = Math.round(stage.y + stage.h * 0.66);
    const unitsW = stage.w / (this.zoom * 18);
    this.nLine = unitsW >= 7.5 ? 4 : 3;
    this.nRanged = unitsW >= 7.5 ? 2 : 1;
    this.plain();
    // the world shows only inside the stage
    const S = this.m.S;
    this.maskG = this.scene.make.graphics({}, false);
    this.maskG.fillStyle(0xffffff);
    this.maskG.fillRect(stage.x * S, stage.y * S, stage.w * S, stage.h * S);
    this.world.setMask(this.maskG.createGeometryMask());
    this.projG = this.scene.add.graphics().setDepth(DEPTH_MISSILE);
    this.world.add(this.projG);
    // the film look (letterbox bars, a soft edge) and the fade between bouts sit
    // right above the world, under whatever the menu lays over the stage
    this.dimG = this.scene.add.graphics();
    this.ui.add(this.dimG);
    this.drawDim();
    this.fadeG = this.scene.add.graphics();
    this.ui.add(this.fadeG);
    const i = this.ui.getIndex(this.world);
    this.ui.moveTo(this.dimG, i + 1);
    this.ui.moveTo(this.fadeG, i + 2);
    this.running = true;
    this.newBout();
  }

  private drawDim(): void {
    const g = this.dimG;
    const st = this.stage;
    if (!g || !st) return;
    // letterbox bars and a soft darkening of the sides (few rectangles: blended fill is what a weak GPU pays for)
    g.clear();
    g.fillStyle(0x14100c, 0.92);
    g.fillRect(st.x, st.y, st.w, 6);
    g.fillRect(st.x, st.y + st.h - 6, st.w, 6);
    g.fillStyle(0x14100c, 0.14);
    g.fillRect(st.x, st.y + 6, 8, st.h - 12);
    g.fillRect(st.x + st.w - 8, st.y + 6, 8, st.h - 12);
    g.fillRect(st.x, st.y + 6, st.w, 6);
    g.fillRect(st.x, st.y + st.h - 12, st.w, 6);
  }

  // ------------------------------------------------------------ armies

  /** The player's men for this bout (the leader always, the rest rotating through the roster) and a fresh enemy band. */
  private newBout(): void {
    this.clearBout();
    // every bout brings new figures: drop the sheets of the last one (the player's are redrawn on demand)
    releaseBattleRows(this.scene);
    this.t = 0;
    this.charged = false;
    this.contactT = -1;
    this.breakT = -1;
    this.fadeT = -1;
    this.fadeDone = false;
    this.slowT = -1;
    this.slowUsed = false;
    this.playerDeaths = 0;
    this.enemyShotDeaths = 0;
    this.seed = (this.seed * 1103515245 + 12345) % 2147483647;
    this.rng = new Rng(this.seed);
    const rng = this.rng;
    const lo = cosmeticLoadout();

    // the player's army: men on foot (riders and beasts have their own sheets; another day)
    const own = this.heroes.map((h) => ({ h, spec: { ...dollFromHero(h, lo), scale: BATTLE_SCALE, res: BATTLE_RES } })).filter((e) => !e.spec.mount && !e.spec.beast);
    // a small party is joined by the city's levy (the standard army) so a line forms
    const levy = standardArmy(new Rng(this.seed ^ 0x5bd1e995), { nextId: 90001 }).map((h) => ({ h, spec: { ...dollFromHero(h), scale: BATTLE_SCALE, res: BATTLE_RES } }));
    const lead = own[0] ?? levy[0];
    const rest = (own.length ? own : levy).slice(1);
    const rot = rest.length ? rest.slice(this.rosterOffset % rest.length).concat(rest.slice(0, this.rosterOffset % rest.length)) : [];
    this.rosterOffset += Math.max(1, this.nLine - 1);
    const pool = [lead, ...rot];
    const ranged = (e: { spec: DollSpec }) => isRangedClass(weaponClass(e.spec.weapon));
    const pLine = pool.filter((e) => !ranged(e)).slice(0, this.nLine);
    const pRanged = pool.filter(ranged).slice(0, this.nRanged);
    for (const e of levy) {
      if (!ranged(e) && pLine.length < this.nLine) pLine.push(e);
      else if (ranged(e) && pRanged.length < this.nRanged) pRanged.push(e);
    }
    if (!pLine.some((e) => e === lead)) pLine[0] = lead;

    // the enemy: a band of the world's peoples, sized to the stage
    const culture = rng.pick<Culture>(['greek', 'phoenician', 'celtic']);
    const mix = rng.pick<ArmyMix>(['line', 'line', 'raiders', 'bandits', 'mercs', 'hill_tribe', 'pirates', 'deserters']);
    const ids = { nextId: 70001 };
    // asked for more than needed: missile-heavy mixes leave few foot men after the trim
    const army = buildArmy(rng, ids, { culture, count: this.nLine * 2 + this.nRanged + 1, level: 1, tier: 1, targetPower: 0, mix, tune: false });
    const foes = army.heroes.map((h) => ({ h, spec: { ...dollFromHero(h), scale: BATTLE_SCALE, res: BATTLE_RES } })).filter((e) => !e.spec.mount && !e.spec.beast);
    let eLine = foes.filter((e) => !isRangedClass(weaponClass(e.spec.weapon))).slice(0, this.nLine);
    const eRanged = foes.filter((e) => isRangedClass(weaponClass(e.spec.weapon))).slice(0, this.nRanged);
    if (eLine.length < 2) eLine = [...eLine, ...eRanged.splice(0, 2 - eLine.length)];
    if (eLine.length < pLine.length && eRanged.length > 1) eLine.push(eRanged.pop()!);

    const place = (list: { h: Hero; spec: DollSpec }[], side: Side, ranged: boolean) => {
      const n = list.length;
      const sign = side === 0 ? 1 : -1;
      list.forEach((e, i) => {
        // the archers stand behind their line, towards its outer flank
        const lx = ranged ? sign * -(0.4 + i * 0.9) : (i - (n - 1) / 2) * LINE_SP;
        const startY = sign * (START_Y[side] + (ranged ? 1.2 : 0) + rng.range(0, 0.5));
        const m = this.spawn(e.h, e.spec, side, ranged, lx, startY);
        m.ty = sign * (ranged ? POST_Y + rng.range(0, 0.3) - i * 0.15 : side === 0 ? HOLD_Y : FIGHT_Y);
        m.tx = lx;
        m.state = this.reduced ? 'stand' : 'walk';
        m.speed = WALK * rng.range(0.92, 1.08);
        m.hp = ranged ? 2 : side === 0 ? (e === lead ? 4 : 3) : rng.chance(0.5) ? 4 : 3;
        m.star = side === 0 && e === lead;
        if (this.reduced) {
          m.x = lx;
          m.y = ranged ? sign * POST_Y : sign * FIGHT_Y;
        }
      });
    };
    place(pLine, 0, false);
    place(pRanged, 0, true);
    place(eLine, 1, false);
    place(eRanged, 1, true);
    // a first idle-time pass so the first walk frames are drawn before they show
    pumpDolls(8);
  }

  private spawn(hero: Hero, spec: DollSpec, side: Side, ranged: boolean, x: number, y: number): Man {
    const key = battleDoll(spec);
    const row = side === 0 ? ROW_UP_RIGHT : ROW_DOWN_LEFT;
    const rowKey = battleRow(this.scene, key, row);
    const [ox, oy] = dollOrigin(key);
    const shadow = this.scene.add.image(0, 0, 'shadow').setAlpha(0.32).setDepth(DEPTH_SHADOW);
    const f0 = battleFrame(rowKey, 0);
    const img = this.scene.add.image(0, 0, f0.key, f0.frame).setOrigin(ox, oy).setScale(dollDisplayScale(key));
    this.world.add(shadow);
    this.world.add(img);
    const m: Man = {
      hero, spec, key, rowKey, row, img, shadow, side, ranged, wc: weaponClass(spec.weapon), shield: !!spec.shield, star: false,
      x, y, tx: x, ty: y, lineX: x, speed: WALK, state: 'walk', act: null, hp: 3, phase: this.rng.range(0, 7), foe: null,
      nextAtk: 0, deathT: 0, dieB: this.rng.chance(0.4), tintUntil: -1, dustT: 0, push: 0,
    };
    this.men.push(m);
    this.draw(m);
    return m;
  }

  private clearBout(): void {
    for (const m of this.men) {
      m.img.destroy();
      m.shadow.destroy();
    }
    this.men = [];
    this.missiles = [];
    for (const d of this.decals) d.destroy();
    this.decals = [];
    for (const p of this.parts) {
      p.live = false;
      p.img.setVisible(false);
    }
    this.projG?.clear();
  }

  // ------------------------------------------------------------ the bout

  update(deltaMs: number): void {
    if (this.destroyed || !this.running) return;
    const wdt = Math.min(0.1, deltaMs / 1000);
    this.wall += wdt;
    let scale = 1;
    let zoom = 1;
    if (this.slowT >= 0) {
      this.slowT += wdt;
      const u = this.slowT / 1.35;
      if (u >= 1) this.slowT = -1;
      else {
        const env = Math.pow(Math.sin(Math.PI * u), 0.6);
        scale = 1 - 0.72 * env;
        zoom = 1 + 0.24 * env;
      }
    }
    const dt = this.reduced ? wdt : wdt * scale;
    this.t += dt;
    if (!this.reduced) this.step(dt);
    for (const m of this.men) this.draw(m);
    this.world.sort('depth');
    pumpDolls(this.slowT >= 0 ? 2 : 4);
    flushDolls(this.scene);
    this.drawMissiles();
    this.camera(zoom);
    this.drawFade();
  }

  private camera(push: number): void {
    const drift = this.reduced ? { x: 0, y: 0 } : { x: 3 * Math.sin(this.wall * 0.33), y: 1.5 * Math.sin(this.wall * 0.21 + 1) };
    const Z = this.zoom;
    const z = Z * push;
    // the push-in keeps the hero where he is: a world point a shows at focus + a * z
    const ax = this.slowAnchor.x;
    const ay = this.slowAnchor.y;
    this.world.setScale(z);
    this.world.setPosition(Math.round(this.focus.x + drift.x - ax * (z - Z)), Math.round(this.focus.y + drift.y - ay * (z - Z)));
  }

  private step(dt: number): void {
    const t = this.t;
    const rng = this.rng;
    // the charge: when the enemy line is near the hold line, both lines run the last stretch
    if (!this.charged) {
      const eFront = Math.max(...this.men.filter((m) => m.side === 1 && !m.ranged).map((m) => m.y), -99);
      if (eFront > -HOLD_Y - 0.1) {
        this.charged = true;
        for (const m of this.men) {
          if (m.ranged || m.state === 'dead') continue;
          m.state = 'run';
          m.speed = RUN * rng.range(0.9, 1.1);
          m.ty = m.side === 0 ? FIGHT_Y : -FIGHT_Y;
        }
      }
    }
    for (const m of this.men) this.stepMan(m, dt);
    this.stepMissiles();
    this.stepParticles(dt);
    // the enemy breaks when half the line is down (or the melee has gone on long enough)
    if (this.contactT >= 0 && this.breakT < 0) {
      const eLine = this.men.filter((m) => m.side === 1 && !m.ranged);
      const dead = eLine.filter((m) => m.state === 'dead').length;
      const since = t - this.contactT;
      if ((dead >= Math.max(1, Math.ceil(eLine.length * 0.5)) && since > MELEE_MIN) || since > MELEE_MAX) this.breakLine();
    }
    if (this.breakT >= 0 && this.fadeT < 0 && t - this.breakT > 3.4) this.fadeT = 0;
    if (this.fadeT >= 0) {
      this.fadeT += dt;
      if (!this.fadeDone && this.fadeT > 0.55) {
        // the cut: new men behind the dark
        this.newBout();
        this.fadeT = 0.56;
        this.fadeDone = true;
      } else if (this.fadeT > 1.1) this.fadeT = -1;
    }
  }

  private breakLine(): void {
    this.breakT = this.t;
    for (const m of this.men) {
      if (m.state === 'dead') continue;
      if (m.side === 1) {
        m.state = 'rout';
        m.act = null;
        m.speed = ROUT * this.rng.range(0.9, 1.15);
        m.tx = m.x + this.rng.range(-0.6, 0.6);
        m.ty = -11;
        m.row = ROW_UP_RIGHT;
      } else if (!m.ranged) {
        m.state = 'pursue';
        m.act = null;
        m.speed = RUN * 0.9;
        m.tx = m.x + this.rng.range(-0.2, 0.2);
        m.ty = m.y - this.rng.range(0.6, 1.4);
      } else {
        m.state = 'win';
        m.act = null;
      }
    }
  }

  private stepMan(m: Man, dt: number): void {
    const t = this.t;
    const rng = this.rng;
    if (m.state === 'dead') return;
    if (m.tintUntil >= 0 && t > m.tintUntil) {
      m.tintUntil = -1;
      m.img.clearTint();
    }
    // an attack lands part-way through its swing
    if (m.act?.kind === 'attack' && !m.act.struck && t >= m.act.strikeAt) {
      m.act.struck = true;
      if (m.foe && m.foe.state !== 'dead' && this.dist(m, m.foe) < 1.5) this.strike(m, m.foe);
    }
    // the knock-back of a hit eases off: he steps forward again
    if (m.push !== 0) {
      const back = Math.min(Math.abs(m.push), dt * 0.5) * Math.sign(m.push);
      m.y += back;
      m.push -= back;
      if (Math.abs(m.push) < 0.001) m.push = 0;
    }
    switch (m.state) {
      case 'walk':
      case 'run':
      case 'pursue':
      case 'rout': {
        const arrived = this.moveTo(m, dt);
        if (m.state === 'run' || m.state === 'pursue' || m.state === 'rout') {
          m.dustT -= dt;
          if (m.dustT <= 0) {
            m.dustT = 0.1 + rng.range(0, 0.08);
            const p = isoToScreen(m.x, m.y);
            this.puff(p.x + rng.range(-3, 3), p.y, 1, 8);
          }
        }
        if (!arrived) break;
        if (m.state === 'walk') {
          if (m.ranged) {
            m.state = 'shoot';
            m.nextAtk = t + rng.range(0.3, 1.4);
          } else if (m.side === 0) m.state = 'hold';
          else {
            m.state = 'fight';
            this.contact(m);
          }
        } else if (m.state === 'run') {
          m.state = 'fight';
          this.contact(m);
        } else if (m.state === 'pursue') m.state = 'win';
        else if (m.state === 'rout') m.img.setVisible(false);
        break;
      }
      case 'fight': {
        if (!m.act && (!m.foe || m.foe.state === 'dead')) {
          const foe = this.nearestFoe(m);
          if (!foe) {
            m.state = 'win';
            break;
          }
          m.foe = foe;
        }
        // step over to the next man (or close on one who gave ground)
        if (!m.act && m.foe && this.dist(m, m.foe) > 1.3) {
          m.state = 'run';
          m.speed = RUN * 0.6;
          m.tx = m.foe.x + (m.side === 0 ? 0.15 : -0.15);
          m.ty = m.foe.y + (m.side === 0 ? 1 : -1);
          break;
        }
        if (!m.act && m.foe && t >= m.nextAtk && this.dist(m, m.foe) < 1.5) {
          const wc = m.ranged ? 'none' : m.wc;
          m.act = { kind: 'attack', t0: t, wc, strikeAt: t + attackLength(wc) * 0.42, struck: false };
          m.nextAtk = t + attackLength(wc) + (m.side === 0 ? rng.range(0.6, 1.5) : rng.range(0.9, 2.0));
        }
        break;
      }
      case 'shoot': {
        if (this.breakT >= 0) break;
        if (!m.act && t >= m.nextAtk) {
          const target = this.shotTarget(m);
          if (!target) {
            m.nextAtk = t + 0.8;
            break;
          }
          m.foe = target;
          m.act = { kind: 'aim', until: t + 0.5 };
        } else if (m.act?.kind === 'aim' && t >= m.act.until) {
          const target = m.foe && m.foe.state !== 'dead' ? m.foe : this.shotTarget(m);
          m.act = { kind: 'attack', t0: t, wc: m.wc, strikeAt: t + 99, struck: true };
          m.nextAtk = t + rng.range(1.6, 2.8);
          if (target) this.loose(m, target);
        }
        break;
      }
      default:
        break;
    }
  }

  /** Walk towards the target; true once there. */
  private moveTo(m: Man, dt: number): boolean {
    const dx = m.tx - m.x;
    const dy = m.ty - m.y;
    const d = Math.hypot(dx, dy);
    const stepLen = m.speed * dt;
    if (d <= stepLen) {
      m.x = m.tx;
      m.y = m.ty;
      return true;
    }
    m.x += (dx / d) * stepLen;
    m.y += (dy / d) * stepLen;
    return false;
  }

  private dist(a: Man, b: Man): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private nearestFoe(m: Man): Man | null {
    let best: Man | null = null;
    let bd = 99;
    for (const o of this.men) {
      if (o.side === m.side || o.state === 'dead' || o.state === 'rout' || o.ranged) continue;
      const d = this.dist(m, o) + Math.abs(o.x - m.x) * 0.5;
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  private shotTarget(m: Man): Man | null {
    const list = this.men.filter((o) => o.side !== m.side && o.state !== 'dead' && o.state !== 'rout');
    if (!list.length) return null;
    const line = list.filter((o) => !o.ranged);
    return this.rng.pick(line.length ? line : list);
  }

  /** The lines meet: dust, and the first blows come quickly. */
  private contact(m: Man): void {
    if (this.contactT < 0) this.contactT = this.t;
    m.nextAtk = this.t + this.rng.range(0.1, 0.7);
    const p = isoToScreen(m.x, m.y);
    this.puff(p.x, p.y, 5, 14);
    if (!m.foe) m.foe = this.nearestFoe(m);
  }

  /** A blow lands: blocked on the shield (a spark), or a flinch, blood, and now and then a death. */
  private strike(a: Man, d: Man): void {
    const t = this.t;
    const rng = this.rng;
    const p = isoToScreen(d.x, d.y);
    const playerMayDie = d.side === 0 && this.playerDeaths < 1 && this.contactT >= 0 && t - this.contactT > 2.5 && !d.star;
    const blockP = d.shield ? (d.side === 0 ? 0.5 : 0.3) : 0.1;
    const lethal = d.hp <= 1;
    // a man in the middle of his own swing finishes it: the blow lands on him, but it does not stop him
    const swinging = d.act?.kind === 'attack' && !d.act.struck;
    if (rng.chance(blockP) || (lethal && d.side === 0 && !playerMayDie)) {
      if (!swinging) d.act = { kind: 'block', t0: t };
      this.spark(p.x + (d.side === 0 ? 4 : -4), p.y - 14);
      if (d.hp <= 1 && d.side === 0) d.hp = 1;
      return;
    }
    d.hp -= 1;
    d.push = d.side === 0 ? -0.14 : 0.14;
    d.y -= d.push; // knocked back (then eases forward again)
    this.blood(p.x, p.y);
    if (d.hp <= 0) {
      d.state = 'dead';
      d.act = null;
      d.deathT = t;
      d.img.clearTint();
      d.tintUntil = -1;
      d.shadow.setVisible(false);
      d.foe = null;
      if (d.side === 0) this.playerDeaths++;
      this.decal(p.x + rng.range(-5, 5), p.y + rng.range(-2, 3));
      this.blood(p.x, p.y);
      if (a.side === 0 && !this.slowUsed && (a.star || rng.chance(0.5))) this.slowMo(a);
      return;
    }
    if (!swinging) d.act = { kind: 'hit', t0: t };
    d.img.setTint(0xff9a8a);
    d.tintUntil = t + 0.12;
  }

  private slowMo(hero: Man): void {
    if (this.reduced) return;
    this.slowUsed = true;
    this.slowT = 0;
    const p = isoToScreen(hero.x, hero.y);
    this.slowAnchor = { x: Math.round(p.x), y: Math.round(p.y - 10) };
  }

  // ------------------------------------------------------------ missiles

  private loose(m: Man, target: Man): void {
    const rng = this.rng;
    const kind = m.wc === 'bow' ? 'arrow' : m.wc === 'sling' ? 'stone' : 'javelin';
    const hit = rng.chance(0.42);
    const tx = target.x + (hit ? 0 : rng.range(-0.9, 0.9));
    const ty = target.y + (hit ? 0 : rng.range(-0.5, 0.5)) + (m.side === 0 ? -0.1 : 0.1);
    const d = Math.hypot(tx - m.x, ty - m.y);
    this.missiles.push({ kind, sx: m.x, sy: m.y, tx, ty, t0: this.t, dur: 0.45 + d * 0.11, target: hit ? target : null, done: false, until: 0 });
    if (this.missiles.length > 24) this.missiles.shift();
  }

  private stepMissiles(): void {
    const t = this.t;
    for (const p of this.missiles) {
      if (p.done) continue;
      if (t < p.t0 + p.dur) continue;
      p.done = true;
      p.until = t + 5;
      const tg = p.target;
      if (tg && tg.state !== 'dead' && tg.state !== 'rout') {
        if (tg.shield && this.rng.chance(0.5) && !tg.act) {
          tg.act = { kind: 'block', t0: t };
          const s = isoToScreen(tg.x, tg.y);
          this.spark(s.x + (tg.side === 0 ? 4 : -4), s.y - 15);
          continue;
        }
        const s = isoToScreen(tg.x, tg.y);
        const mayKill = tg.side === 1 ? this.enemyShotDeaths < 1 && p.kind !== 'stone' : false;
        tg.hp -= 1;
        this.blood(s.x, s.y);
        if (tg.hp <= 0 && mayKill && tg.act?.kind !== 'attack') {
          this.enemyShotDeaths++;
          tg.state = 'dead';
          tg.act = null;
          tg.deathT = t;
          tg.shadow.setVisible(false);
          this.decal(s.x, s.y + 1);
        } else {
          tg.hp = Math.max(1, tg.hp);
          if (!tg.act || tg.act.kind !== 'attack') tg.act = { kind: 'hit', t0: t };
          tg.img.setTint(0xff9a8a);
          tg.tintUntil = t + 0.12;
        }
      }
    }
    this.missiles = this.missiles.filter((p) => !p.done || (p.kind !== 'stone' && p.target === null && t < p.until));
  }

  /** Arrows, stones and javelins on one Graphics object (the battlefield's drawing, src/scenes/BattleScene.ts). */
  private drawMissiles(): void {
    const g = this.projG;
    if (!g) return;
    g.clear();
    const now = this.t;
    for (const p of this.missiles) {
      const s0 = isoToScreen(p.sx, p.sy);
      const t0 = isoToScreen(p.tx, p.ty);
      const sx = s0.x;
      const sy = s0.y - 14;
      const tx = t0.x;
      const ty = t0.y - (p.target ? 12 : 0);
      if (p.done) {
        const dx = Math.sign(tx - sx) || 1;
        g.lineStyle(1, p.kind === 'javelin' ? P.wood[1] : P.wood[0], 0.9);
        g.lineBetween(Math.round(tx), Math.round(ty), Math.round(tx - dx * 3), Math.round(ty - 7));
        continue;
      }
      const tt = (now - p.t0) / p.dur;
      if (tt < 0 || tt > 1) continue;
      const dist = Math.hypot(tx - sx, (ty - sy) * 2);
      const arcH = p.kind === 'stone' ? dist * 0.14 : dist * 0.26;
      const height = Math.sin(Math.PI * tt) * arcH;
      const x = sx + (tx - sx) * tt;
      const y = sy + (ty - sy) * tt - height;
      if (p.kind === 'stone') {
        g.fillStyle(0x5a5650, 1);
        g.fillRect(Math.round(x), Math.round(y), 2, 2);
        continue;
      }
      const t2 = Math.min(1, tt + 0.02);
      const h2 = Math.sin(Math.PI * t2) * arcH;
      let vx = (tx - sx) * 0.02;
      let vy = (ty - sy) * 0.02 - (h2 - height);
      const l = Math.hypot(vx, vy) || 1;
      vx /= l;
      vy /= l;
      const len = p.kind === 'javelin' ? 11 : 7;
      g.lineStyle(1, p.kind === 'javelin' ? P.wood[1] : P.wood[0], 1);
      g.lineBetween(Math.round(x - vx * len), Math.round(y - vy * len), Math.round(x), Math.round(y));
      if (p.kind === 'arrow') {
        g.fillStyle(0xe8e0cc, 1);
        g.fillRect(Math.round(x - vx * len), Math.round(y - vy * len), 1, 1);
      }
    }
  }

  // ------------------------------------------------------------ dust, blood, sparks

  private particle(x: number, y: number, vx: number, vy: number, grav: number, life: number, color: number, size: number): void {
    let p = this.parts.find((q) => !q.live);
    if (!p) {
      if (this.parts.length >= MAX_PARTICLES) return;
      const img = this.scene.add.image(0, 0, 'px').setOrigin(0, 0).setDepth(DEPTH_PARTICLE);
      this.world.add(img);
      p = { img, x: 0, y: 0, vx: 0, vy: 0, grav: 0, life: 0, max: 1, live: false };
      this.parts.push(p);
    }
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.grav = grav;
    p.max = life;
    p.life = life;
    p.live = true;
    p.img.setTint(color).setScale(size).setVisible(true).setAlpha(1).setPosition(Math.round(x), Math.round(y));
  }

  /** A puff of dust at the feet. */
  private puff(x: number, y: number, n: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const v = speed * this.rng.range(0.4, 1);
      this.particle(x, y - 1, Math.cos(a) * v, Math.sin(a) * v * 0.4 - speed * 0.5, -6, this.rng.range(0.35, 0.7), DUST, this.rng.chance(0.4) ? 2 : 1);
    }
  }

  private blood(x: number, y: number): void {
    for (let i = 0; i < 5; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const v = this.rng.range(10, 30);
      this.particle(x, y - 12, Math.cos(a) * v, Math.sin(a) * v * 0.5 - 18, 70, this.rng.range(0.25, 0.5), BLOOD, this.rng.chance(0.3) ? 2 : 1);
    }
  }

  private spark(x: number, y: number): void {
    const s = this.scene.add.image(Math.round(x), Math.round(y), 'spark').setDepth(DEPTH_PARTICLE + 1);
    this.world.add(s);
    this.scene.tweens.add({ targets: s, alpha: 0, duration: 180, onComplete: () => s.destroy() });
  }

  private decal(x: number, y: number): void {
    const v = this.rng.int(0, 3);
    const img = this.scene.add.image(Math.round(x), Math.round(y), `blood${v}`).setAlpha(0.8).setFlipX(this.rng.chance(0.5)).setDepth(DEPTH_DECAL + y);
    this.world.add(img);
    this.decals.push(img);
    while (this.decals.length > MAX_DECALS) this.decals.shift()!.destroy();
  }

  private stepParticles(dt: number): void {
    for (const p of this.parts) {
      if (!p.live) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.live = false;
        p.img.setVisible(false);
        continue;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.img.setPosition(Math.round(p.x), Math.round(p.y)).setAlpha(Math.min(1, (p.life / p.max) * 1.6));
    }
  }

  private drawFade(): void {
    const g = this.fadeG;
    if (!g) return;
    g.clear();
    if (this.fadeT < 0) return;
    const u = Math.min(1, this.fadeT / 1.1);
    const a = Math.sin(Math.PI * u) * 0.8;
    if (a <= 0.01) return;
    const st = this.stage!;
    g.fillStyle(0x1a100c, a);
    g.fillRect(st.x, st.y, st.w, st.h);
  }

  // ------------------------------------------------------------ drawing a man

  private frameOf(m: Man): number {
    const t = this.t;
    if (m.state === 'dead') {
      const seq = m.dieB ? ANIM.dieB : ANIM.die;
      return seq[Math.min(seq.length - 1, Math.floor((t - m.deathT) / 0.11))];
    }
    const a = m.act;
    if (a) {
      if (a.kind === 'attack') {
        const f = attackFrame(a.wc, t - a.t0);
        if (f >= 0) return f;
        m.act = null;
      } else if (a.kind === 'hit') {
        const s = t - a.t0;
        if (s < 0.26) return ANIM.hit[s < 0.1 ? 0 : 1];
        m.act = null;
      } else if (a.kind === 'block') {
        if (t - a.t0 < 0.3) return ANIM.block[0];
        m.act = null;
      } else if (a.kind === 'aim') {
        const f = aimFrame(m.wc, a.until - t, t);
        return f >= 0 ? f : ANIM.idle[0];
      }
    }
    switch (m.state) {
      case 'rout':
        return ANIM.rout[Math.floor(t * 11 + m.phase) % ANIM.rout.length];
      case 'run':
      case 'pursue':
        return ANIM.run[Math.floor(t * 13 + m.phase) % ANIM.run.length];
      case 'walk':
        return ANIM.walk[Math.floor(t * 13 + m.phase) % ANIM.walk.length];
      case 'win':
        return ANIM.win[Math.floor(t * 2.6 + m.phase) % ANIM.win.length];
      case 'hold':
        return m.shield && m.phase % 2 < 1.2 ? FRAME.block : ANIM.idle[Math.floor(t * 2.2 + m.phase) % ANIM.idle.length];
      default:
        return ANIM.idle[Math.floor(t * 2.2 + m.phase) % ANIM.idle.length];
    }
  }

  private draw(m: Man): void {
    const row = m.side === 0 || m.state === 'rout' ? ROW_UP_RIGHT : ROW_DOWN_LEFT;
    if (row !== m.row) {
      m.row = row;
      m.rowKey = battleRow(this.scene, m.key, row);
    }
    const f = battleFrame(m.rowKey, this.frameOf(m));
    if (m.img.texture.key !== f.key) m.img.setTexture(f.key, f.frame);
    else if (m.img.frame.name !== f.frame) m.img.setFrame(f.frame);
    const p = isoToScreen(m.x, m.y);
    const rx = Math.round(p.x);
    const ry = Math.round(p.y);
    m.img.setPosition(rx, ry).setDepth(m.state === 'dead' ? DEPTH_DEAD + ry : ry);
    m.shadow.setPosition(rx, ry);
  }

  /** Forget everything (the scene is shutting down or restarting). */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.running = false;
    this.clearBout();
    for (const p of this.parts) p.img.destroy();
    this.parts = [];
    this.dimG?.destroy();
    this.fadeG?.destroy();
    this.projG?.destroy();
    this.world.clearMask(true);
    this.maskG?.destroy();
    this.world.destroy();
    releaseBattleRows(this.scene);
  }
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
