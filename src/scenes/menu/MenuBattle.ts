/**
 * The living skirmish behind the main menu (src/scenes/MenuScene.ts): the
 * player's own men (their real classes, gear and cosmetics) meet a fresh band
 * of enemies in a short, scripted bout that loops forever and never repeats
 * exactly, on a letterboxed stage at the top of the screen (the menu sits
 * below it). Two bodies form off the stage in two ranks each, close, the
 * archers loose, the front ranks charge and meet as a front of paired duels
 * (every man holds his place in the line; a man who falls is replaced from
 * the rank behind), a rider sweeps the enemy's flank, one hero's killing blow
 * lands in slow motion with the camera pushing in, the enemy breaks and runs,
 * the victors raise their arms, a fade, and the next bout starts with new
 * enemies.
 *
 * Everything lives in one container inside the scene's UI root (so the UI
 * scale applies): the iso plain (src/art/ground.ts), the men as lazily filled
 * battle rows (src/ui/sprites.ts battleRow / battleFrame, the same sheets as
 * the battlefield at BATTLE_SCALE), riders and animals from their 16-column
 * sheets (ensureDoll / dollFrame, as the battlefield draws them), blood
 * decals, missiles on one Graphics object and a small particle pool for dust
 * and blood. The world is positioned by the projection of src/art/iso.ts (the
 * player bottom-left facing up-right, the enemy top-right facing down-left, as
 * in the battle).
 *
 * Light by design: a score of figures, one sort per frame, a capped pool, and
 * a frame budget for the sheet rendering (pumpDolls). With the OS "reduce
 * motion" preference the lines just stand facing each other, breathing.
 */
import Phaser from 'phaser';
import { ANIM, ANIM_FRAMES, BATTLE_RES, BATTLE_SCALE, FRAME, NFRAMES, aimFrame, attackFrame, attackLength, dollFromHero, drawnFrames, isRangedClass, weaponClass, type DollSpec, type WeaponClass } from '../../art/paperdoll';
import { renderGround } from '../../art/ground';
import { isoToScreen } from '../../art/iso';
import { P } from '../../art/palette';
import type { Hero } from '../../data/units';
import { buildArmy, type ArmyMix } from '../../game/enemy';
import { cosmeticLoadout } from '../../game/cosmetics';
import { standardArmy } from '../../game/heroes';
import { Rng } from '../../sim/rng';
import type { UIMetrics } from '../../ui/kit';
import { prefersReducedMotion } from '../../ui/motion';
import { battleDoll, battleFrame, battleRow, dollDisplayScale, dollOrigin, flushDolls, pumpDolls, releaseBattleRows } from '../../ui/sprites';
import type { Culture } from '../../data/names';

/** The stage (UI px): an unobstructed rectangle the skirmish is masked to. */
export interface MenuStage {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Zoom of the battle world on the stage, in halves (2: figures twice the battlefield's size at 2x; 1.5 on phones). */
  zoom: number;
}

type Side = 0 | 1;
type State = 'walk' | 'hold' | 'reserve' | 'run' | 'fight' | 'shoot' | 'charge' | 'pursue' | 'win' | 'rout' | 'dead' | 'stand' | 'gone';
type Act = { kind: 'attack'; t0: number; wc: WeaponClass; strikeAt: number; struck: boolean } | { kind: 'hit' | 'block'; t0: number } | { kind: 'aim'; until: number };

interface Man {
  hero: Hero;
  spec: DollSpec;
  key: string;
  /** Men: the facing row's key (battle atlas); riders and animals draw from their own sheet. */
  rowKey: string;
  row: number;
  man: boolean;
  /** A rider or animal with the full 40-column animation sets (chariots keep the four-phase ones). */
  full: boolean;
  rider: boolean;
  beast: boolean;
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
  /** His place in the line: the front slot he holds (or will take), and the rank (0 front, 1 behind). */
  slot: number;
  rank: number;
  /** Fighters: a sideways step off the slot when two men share a foe. */
  shift: number;
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
  /** Riders: the waypoints of the flank charge. */
  path: { x: number; y: number }[];
  /** Riders: how many men the sweep has felled (one at most). */
  felled: number;
}

interface Missile {
  kind: 'arrow' | 'stone' | 'javelin';
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  /** Where it flies relative to its target (zero: a hit), so it follows a man who moves. */
  ox: number;
  oy: number;
  t0: number;
  dur: number;
  target: Man | null;
  hit: boolean;
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
/** Field units (one = a diamond tile, 36 x 18 world px) along the line, between the men of a rank. */
const LINE_SP = 1.25;
/** The second rank stands this far behind the first. */
const RANK_D = 1.15;
/** Where the player's line waits for the enemy before the charge, and where the lines meet (±). */
const HOLD_Y = 1.5;
const FIGHT_Y = 0.5;
/** The archers' posts behind their lines (field y), and the lines' starting distance (off the stage). */
const POST_Y = 2.3;
const START_Y = [3.8, 4.8];
const WALK = 1.05;
const RUN = 2.5;
const ROUT = 2.3;
const GALLOP = 4.2;
const MAX_PARTICLES = 48;
const MAX_DECALS = 40;
/** The melee goes on for at least / at most this long (s) after the lines meet. */
const MELEE_MIN = 5.5;
const MELEE_MAX = 10;
const DEPTH_DEAD = -5000;
const DEPTH_DECAL = -8000;
const DEPTH_SHADOW = -9000;
const DEPTH_GROUND = -1e6;
const DEPTH_MISSILE = 1e5;
const DEPTH_PARTICLE = 1.2e5;

const DUST = 0xcbb77a;
const BLOOD = 0x8a1e16;

/** Rows 0..3: facing +x (down-right), -y (up-right), +y (down-left), -x (up-left) (paperdoll DIRS). */
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
  /** Sheets of this bout's enemy riders and animals (dropped with the bout). */
  /**
   * Frames to draw ahead in idle time while the lines walk in (the atlas
   * draws a frame the first time it shows, ~1-3 ms each: a whole rank
   * breaking into a run at once would stutter): walk, run, the attack, the
   * flinch. Deaths, routs and the victory pose are few and drawn as they come.
   */
  private warm: { rowKey: string; col: number }[] = [];
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
    this.zoom = Math.max(1, Math.round(stage.zoom * 2) / 2);
    // the lines meet a little below the middle of the stage (the title sits at its top)
    this.focus.x = Math.round(stage.x + stage.w * 0.5);
    this.focus.y = Math.round(stage.y + stage.h * 0.62);
    // the front: as many paired duels as the stage is wide (a slot is LINE_SP * 18 world px across, and the ends may run off the stage)
    const unitsW = stage.w / (this.zoom * 18);
    this.nLine = Math.max(3, Math.min(6, Math.round(unitsW * 0.55)));
    this.nRanged = unitsW >= 6 ? 2 : 1;
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

  /** The x of a front slot (the line is centred on the field's origin). */
  private slotX(slot: number): number {
    return (slot - (this.nLine - 1) / 2) * LINE_SP;
  }

  /**
   * The player's men for this bout (the leader always, the rest rotating
   * through the roster; a rider and an animal when he has them) and a fresh
   * enemy band.
   */
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
    type E = { h: Hero; spec: DollSpec };
    const toSpec = (h: Hero, cos?: ReturnType<typeof cosmeticLoadout>): E => ({ h, spec: { ...dollFromHero(h, cos), scale: BATTLE_SCALE, res: BATTLE_RES } });
    const isRanged = (e: E) => !e.spec.mount && !e.spec.beast && isRangedClass(weaponClass(e.spec.weapon));
    const isFoot = (e: E) => !e.spec.mount && !e.spec.beast && !isRanged(e);
    const isRider = (e: E) => !!e.spec.mount;
    const isBeast = (e: E) => !!e.spec.beast;
    const nFront = this.nLine;
    const nRear = this.nLine - 1;

    // the player's army: the leader first, the rest rotating so every bout shows other men
    const own = this.heroes.map((h) => toSpec(h, lo));
    // a small party is joined by the city's levy (the standard army) so two ranks form
    const levy = standardArmy(new Rng(this.seed ^ 0x5bd1e995), { nextId: 90001 }).map((h) => toSpec(h));
    const lead = own.find(isFoot) ?? levy.find(isFoot)!;
    const rest = (own.length ? own : levy).filter((e) => e !== lead);
    const rot = rest.length ? rest.slice(this.rosterOffset % rest.length).concat(rest.slice(0, this.rosterOffset % rest.length)) : [];
    this.rosterOffset += Math.max(1, nFront - 1);
    const pool = [lead, ...rot];
    const pFoot = pool.filter(isFoot).slice(0, nFront + nRear);
    const pRanged = pool.filter(isRanged).slice(0, this.nRanged);
    const pRider = pool.filter(isRider).slice(0, 1);
    const pBeast = pool.filter(isBeast).slice(0, 1);
    for (const e of levy) {
      if (isFoot(e) && pFoot.length < nFront + nRear) pFoot.push(e);
      else if (isRanged(e) && pRanged.length < this.nRanged) pRanged.push(e);
    }
    // the leader in the middle of the front rank
    const li = pFoot.indexOf(lead);
    if (li >= 0) pFoot.splice(li, 1);
    pFoot.splice(Math.min(pFoot.length, Math.floor(nFront / 2)), 0, lead);
    const pFront = pFoot.slice(0, nFront);
    const pRear = pFoot.slice(nFront, nFront + nRear);

    // the enemy: a band of the world's peoples, sized to the stage (asked for more than needed: missile-heavy mixes leave few foot men)
    const culture = rng.pick<Culture>(['greek', 'phoenician', 'celtic']);
    const mix = rng.pick<ArmyMix>(['line', 'line', 'raiders', 'bandits', 'mercs', 'hill_tribe', 'pirates', 'deserters']);
    const ids = { nextId: 70001 };
    const army = buildArmy(rng, ids, { culture, count: (nFront + nRear) * 2 + this.nRanged + 2, level: 1, tier: 1, targetPower: 0, mix, tune: false });
    const foes = army.heroes.map((h) => toSpec(h));
    let eFoot = foes.filter(isFoot);
    const eRanged = foes.filter(isRanged).slice(0, this.nRanged);
    const eRider = pRider.length || rng.chance(0.5) ? foes.filter(isRider).slice(0, 1) : [];
    const eBeast = foes.filter(isBeast).slice(0, 1);
    // too few foot men (a band of slingers): the rest of the missile men close with knives
    for (const e of foes.filter(isRanged).slice(this.nRanged)) if (eFoot.length < nFront + nRear) eFoot.push(e);
    while (eFoot.length < nFront + nRear && eRanged.length > 1) eFoot.push(eRanged.pop()!);
    eFoot = eFoot.slice(0, nFront + nRear);
    const eFront = eFoot.slice(0, nFront);
    const eRear = eFoot.slice(nFront);

    const place = (list: E[], side: Side, rank: number, ranged: boolean) => {
      const sign = side === 0 ? 1 : -1;
      list.forEach((e, i) => {
        const beast = !!e.spec.beast;
        // the archers stand behind their line, towards its outer flank; the second rank in the gaps of the first
        const lx = ranged ? sign * -(0.6 + i * 1.1) : rank === 1 ? this.slotX(i) + LINE_SP / 2 : this.slotX(i);
        const back = ranged ? 1.6 : rank * RANK_D;
        const startY = sign * (START_Y[side] + back + rng.range(0, 0.4));
        const m = this.spawn(e.h, e.spec, side, ranged, lx, startY);
        m.slot = i;
        m.rank = rank;
        m.ty = sign * (ranged ? POST_Y + rng.range(0, 0.3) - i * 0.15 : (side === 0 ? HOLD_Y : FIGHT_Y) + back);
        m.tx = lx;
        m.state = this.reduced ? 'stand' : 'walk';
        m.speed = (beast ? WALK * 1.1 : WALK) * rng.range(0.92, 1.08);
        m.hp = ranged ? 2 : side === 0 ? (e === lead ? 4 : 3) : rng.chance(0.5) ? 4 : 3;
        m.star = side === 0 && e === lead;
        if (this.reduced) {
          m.x = lx;
          m.y = sign * (ranged ? POST_Y : FIGHT_Y + back);
        }
      });
    };
    place(pFront, 0, 0, false);
    place(pRear, 0, 1, false);
    place(pRanged, 0, 0, true);
    place(eFront, 1, 0, false);
    place(eRear, 1, 1, false);
    place(eRanged, 1, 0, true);
    // a beast joins the front rank's end (the pack runs with the line)
    for (const [list, side] of [[pBeast, 0], [eBeast, 1]] as [E[], Side][]) {
      for (const e of list) {
        const sign = side === 0 ? 1 : -1;
        const slot = side === 0 ? nFront : -1;
        const lx = this.slotX(slot);
        const m = this.spawn(e.h, e.spec, side, false, lx, sign * (START_Y[side] + 0.5));
        m.slot = slot;
        m.rank = 0;
        m.tx = lx;
        m.ty = sign * (side === 0 ? HOLD_Y : FIGHT_Y);
        m.state = this.reduced ? 'stand' : 'walk';
        m.speed = WALK * 1.1;
        m.hp = 2;
        if (this.reduced) {
          m.x = lx;
          m.y = sign * FIGHT_Y;
        }
      }
    }
    // the riders wait off the stage on their army's flank, to sweep the enemy's rear rank once the lines meet
    for (const [list, side] of [[pRider, 0], [eRider, 1]] as [E[], Side][]) {
      for (const e of list) {
        const sign = side === 0 ? 1 : -1;
        const far = this.slotX(nFront) + 3.5;
        const m = this.spawn(e.h, e.spec, side, false, -sign * far, sign * (HOLD_Y + 1.2));
        m.state = this.reduced ? 'gone' : 'hold';
        m.hp = 5;
        // across the enemy's rear: between its front and second rank, then off the far side
        const yIn = -sign * (FIGHT_Y + RANK_D * 0.55);
        m.path = [
          { x: -sign * (far - 1.5), y: sign * 0.9 },
          { x: -sign * (this.slotX(nFront - 1) + 0.6), y: yIn },
          { x: sign * (this.slotX(nFront - 1) + 0.6), y: yIn },
          { x: sign * (far + 1.5), y: yIn - sign * 0.4 },
        ];
        m.img.setVisible(!this.reduced);
        m.shadow.setVisible(!this.reduced);
      }
    }
    // a first idle-time pass so the first walk frames are drawn before they show
    pumpDolls(8);
  }

  private spawn(hero: Hero, spec: DollSpec, side: Side, ranged: boolean, x: number, y: number): Man {
    const man = !spec.mount && !spec.beast;
    const row = side === 0 ? ROW_UP_RIGHT : ROW_DOWN_LEFT;
    // every figure is drawn into the scene's battle atlases; riders and animals have the full 40-column sets
    const key = battleDoll(spec);
    const rowKey = battleRow(this.scene, key, row);
    const full = drawnFrames(spec) >= NFRAMES;
    const seqs = !man ? (full ? [ANIM.walk, ANIM.gallop, ANIM.attack, ANIM.hit] : []) : ranged ? [ANIM.walk, [FRAME.wind, FRAME.atk0], ANIM.hit] : [ANIM.walk, ANIM.run, ANIM.attack, ANIM.hit, ANIM.block];
    for (const seq of seqs) for (const col of seq) this.warm.push({ rowKey, col });
    const [ox, oy] = dollOrigin(key);
    const shadow = this.scene.add.image(0, 0, spec.mount ? 'shadow_big' : 'shadow').setAlpha(0.32).setDepth(DEPTH_SHADOW);
    const f0 = battleFrame(rowKey, 0);
    const img = this.scene.add.image(0, 0, f0.key, f0.frame).setOrigin(ox, oy).setScale(dollDisplayScale(key));
    this.world.add(shadow);
    this.world.add(img);
    const m: Man = {
      hero, spec, key, rowKey, row, man, full, rider: !!spec.mount, beast: !!spec.beast, img, shadow, side, ranged, wc: weaponClass(spec.weapon), shield: !!spec.shield, star: false,
      x, y, tx: x, ty: y, slot: 0, rank: 0, shift: 0, speed: WALK, state: 'walk', act: null, hp: 3, phase: this.rng.range(0, 7), foe: null,
      nextAtk: 0, deathT: 0, dieB: this.rng.chance(0.4), tintUntil: -1, dustT: 0, push: 0, path: [], felled: 0,
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
    this.warm = [];
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
    // sheet work for this frame: the figures' queued rows, then the men's frames drawn ahead (first in the walk-in, before they show)
    const budget = this.slowT >= 0 ? 2 : 4;
    const t0 = performance.now();
    pumpDolls(budget);
    while (this.warm.length && performance.now() - t0 < budget) {
      const w = this.warm.shift()!;
      battleFrame(w.rowKey, w.col);
    }
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
    // the charge: when the enemy line is near the hold line, both lines run the last stretch, rank behind rank
    if (!this.charged) {
      const eFront = Math.max(...this.men.filter((m) => m.side === 1 && !m.ranged && !m.rider && m.rank === 0).map((m) => m.y), -99);
      if (eFront > -HOLD_Y - 0.1) {
        this.charged = true;
        for (const m of this.men) {
          if (m.ranged || m.rider || m.state === 'dead') continue;
          m.state = 'run';
          m.speed = (m.beast ? RUN * 1.25 : RUN) * rng.range(0.9, 1.1);
          m.ty = (m.side === 0 ? 1 : -1) * (FIGHT_Y + m.rank * RANK_D);
        }
      }
    }
    // the riders go in a moment after the lines meet
    if (this.contactT >= 0 && t - this.contactT > 1.1) for (const m of this.men) if (m.rider && m.state === 'hold') this.chargeRider(m);
    for (const m of this.men) this.stepMan(m, dt);
    this.stepMissiles();
    this.stepParticles(dt);
    // the enemy breaks when half its front is down (or the melee has gone on long enough)
    if (this.contactT >= 0 && this.breakT < 0) {
      const eLine = this.men.filter((m) => m.side === 1 && !m.ranged && !m.rider);
      const dead = eLine.filter((m) => m.state === 'dead').length;
      const since = t - this.contactT;
      if ((dead >= Math.max(1, Math.ceil(this.nLine * 0.5)) && since > MELEE_MIN) || since > MELEE_MAX) this.breakLine();
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
      // a rider who swept through and rode off comes back for the rout; anyone else gone stays gone
      if (m.state === 'gone' && !(m.rider && m.side === 0)) continue;
      if (m.side === 1) {
        m.state = 'rout';
        m.act = null;
        m.speed = (m.rider ? GALLOP : m.beast ? ROUT * 1.3 : ROUT) * this.rng.range(0.9, 1.15);
        m.tx = m.x + this.rng.range(-0.6, 0.6);
        m.ty = -11;
        m.row = ROW_UP_RIGHT;
      } else if (m.rider) {
        // the rider wheels about and rides the routers down
        m.state = 'pursue';
        m.act = null;
        m.speed = GALLOP * 0.8;
        m.path = [];
        m.tx = this.slotX(this.rng.int(0, this.nLine - 1)) + this.rng.range(-0.5, 0.5);
        m.ty = -3.5;
        m.img.setVisible(true);
        m.shadow.setVisible(true);
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

  private chargeRider(m: Man): void {
    m.state = 'charge';
    m.speed = GALLOP * this.rng.range(0.95, 1.05);
    const p = m.path.shift()!;
    m.tx = p.x;
    m.ty = p.y;
  }

  private stepMan(m: Man, dt: number): void {
    const t = this.t;
    const rng = this.rng;
    if (m.state === 'dead' || m.state === 'gone') return;
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
        if (m.state === 'run' || m.state === 'pursue' || m.state === 'rout') this.dust(m, dt, m.rider ? 2 : 1);
        if (!arrived) break;
        if (m.state === 'walk') {
          if (m.ranged) {
            m.state = 'shoot';
            m.nextAtk = t + rng.range(0.3, 1.4);
          } else if (m.rank === 1) m.state = 'reserve';
          else if (m.side === 0) m.state = 'hold';
          else {
            m.state = 'fight';
            this.contact(m);
          }
        } else if (m.state === 'run') {
          if (m.rank === 1) m.state = 'reserve';
          else {
            m.state = 'fight';
            this.contact(m);
          }
        } else if (m.state === 'pursue') {
          if (m.rider) {
            m.state = 'gone';
            m.img.setVisible(false);
            m.shadow.setVisible(false);
          } else m.state = 'win';
        } else if (m.state === 'rout') {
          m.state = 'gone';
          m.img.setVisible(false);
          m.shadow.setVisible(false);
        }
        break;
      }
      case 'reserve': {
        // the second rank waits in the gaps; a man steps up when the slot before him empties
        if (this.contactT < 0 || m.act) break;
        const open = this.openSlot(m);
        if (open >= 0) this.takeSlot(m, open);
        break;
      }
      case 'fight': {
        if (!m.act && (!m.foe || m.foe.state === 'dead' || m.foe.state === 'rout' || m.foe.state === 'gone')) {
          const foe = this.nextFoe(m);
          if (!foe) {
            m.state = 'win';
            break;
          }
          this.pair(m, foe);
        }
        // close on the man he fights (one who gave ground, or the next one along the front)
        if (!m.act && m.foe && this.dist(m, m.foe) > 1.3) {
          m.state = 'run';
          m.speed = (m.beast ? RUN : RUN * 0.6) * rng.range(0.9, 1.1);
          m.tx = m.foe.x + m.shift;
          m.ty = m.foe.y + (m.side === 0 ? 1 : -1);
          break;
        }
        if (!m.act && m.foe && t >= m.nextAtk && this.dist(m, m.foe) < 1.5) {
          const wc: WeaponClass = m.ranged ? 'none' : m.man ? m.wc : m.beast ? 'none' : 'lance';
          const len = m.man ? attackLength(wc) : 0.42;
          m.act = { kind: 'attack', t0: t, wc, strikeAt: t + len * 0.42, struck: false };
          m.nextAtk = t + len + (m.side === 0 ? rng.range(0.6, 1.5) : rng.range(0.9, 2.0));
        }
        break;
      }
      case 'charge': {
        // the flank sweep: along the waypoints, felling a man in passing (one at most)
        const arrived = this.moveTo(m, dt);
        this.dust(m, dt, 2);
        if (m.path.length >= 2 && m.felled < 1 && (!m.act || m.act.kind !== 'attack')) {
          const near = this.men.find((o) => o.side !== m.side && !o.rider && o.state !== 'dead' && o.state !== 'gone' && o.state !== 'rout' && this.dist(m, o) < 0.75);
          if (near) {
            m.foe = near;
            m.act = { kind: 'attack', t0: t, wc: 'lance', strikeAt: t + 0.14, struck: false };
            m.felled++;
          }
        }
        if (!arrived) break;
        const p = m.path.shift();
        if (p) {
          m.tx = p.x;
          m.ty = p.y;
        } else {
          m.state = 'gone';
          m.img.setVisible(false);
          m.shadow.setVisible(false);
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
          const target = m.foe && m.foe.state !== 'dead' && m.foe.state !== 'gone' ? m.foe : this.shotTarget(m);
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

  private dust(m: Man, dt: number, n: number): void {
    m.dustT -= dt;
    if (m.dustT > 0) return;
    m.dustT = 0.1 + this.rng.range(0, 0.08);
    const p = isoToScreen(m.x, m.y);
    this.puff(p.x + this.rng.range(-3, 3), p.y, n, 8);
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

  private alive(o: Man): boolean {
    return o.state !== 'dead' && o.state !== 'rout' && o.state !== 'gone';
  }

  /** How many men fight this one. */
  private attackers(o: Man): number {
    let n = 0;
    for (const m of this.men) if (m.foe === o && m.state === 'fight') n++;
    return n;
  }

  /** The front man opposite a slot (the duel partner), if he still stands there. */
  private opposite(m: Man): Man | null {
    for (const o of this.men) if (o.side !== m.side && !o.ranged && !o.rider && o.rank === 0 && o.slot === m.slot && this.alive(o) && (o.state === 'fight' || o.state === 'run' || o.state === 'hold')) return o;
    return null;
  }

  /** The man to fight next: the one opposite his slot, else the nearest front man with room beside him. */
  private nextFoe(m: Man): Man | null {
    const opp = this.opposite(m);
    if (opp) return opp;
    let best: Man | null = null;
    let bd = 99;
    for (const o of this.men) {
      if (o.side === m.side || !this.alive(o) || o.ranged || o.rider || o.state === 'reserve' && this.contactT < 0) continue;
      if (this.attackers(o) >= 2) continue;
      const d = this.dist(m, o) + Math.abs(o.x - m.x) * 0.5;
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  /** Face a foe: beside the man already on him, else square on. */
  private pair(m: Man, foe: Man): void {
    m.foe = foe;
    const n = this.attackers(foe);
    m.shift = n === 0 ? 0 : (m.x <= foe.x ? -1 : 1) * 0.55;
    if (!foe.foe || !this.alive(foe.foe)) foe.foe = m;
  }

  /** A front slot of his side that stands empty (its man dead or gone): the nearest, or -1. */
  private openSlot(m: Man): number {
    const held = new Set<number>();
    for (const o of this.men) if (o.side === m.side && !o.ranged && !o.rider && o.rank === 0 && this.alive(o)) held.add(o.slot);
    let best = -1;
    let bd = 99;
    for (let s = 0; s < this.nLine; s++) {
      if (held.has(s)) continue;
      // only a slot that still has someone to fight across it
      if (!this.men.some((o) => o.side !== m.side && !o.ranged && !o.rider && this.alive(o))) break;
      const d = Math.abs(this.slotX(s) - m.x);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /** A second-rank man steps up into an empty front slot. */
  private takeSlot(m: Man, slot: number): void {
    m.rank = 0;
    m.slot = slot;
    m.state = 'run';
    m.speed = RUN * 0.7 * this.rng.range(0.9, 1.1);
    m.tx = this.slotX(slot);
    m.ty = (m.side === 0 ? 1 : -1) * FIGHT_Y;
    m.foe = null;
    const p = isoToScreen(m.x, m.y);
    this.puff(p.x, p.y, 2, 8);
  }

  private shotTarget(m: Man): Man | null {
    const list = this.men.filter((o) => o.side !== m.side && this.alive(o) && !o.rider);
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
    if (!m.foe || !this.alive(m.foe)) {
      const foe = this.nextFoe(m);
      if (foe) this.pair(m, foe);
    }
  }

  /** A blow lands: blocked on the shield (a spark), or a flinch, blood, and now and then a death. */
  private strike(a: Man, d: Man): void {
    const t = this.t;
    const rng = this.rng;
    const p = isoToScreen(d.x, d.y);
    const playerMayDie = d.side === 0 && this.playerDeaths < 1 && this.contactT >= 0 && t - this.contactT > 2.5 && !d.star && !d.rider;
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
    d.hp -= a.rider ? 2 : 1;
    d.push = d.side === 0 ? -0.14 : 0.14;
    d.y -= d.push; // knocked back (then eases forward again)
    this.blood(p.x, p.y);
    if (d.hp <= 0) {
      this.kill(d, p.x, p.y);
      if (a.side === 0 && !this.slowUsed && (a.star || rng.chance(0.5))) this.slowMo(a);
      return;
    }
    if (!swinging) d.act = { kind: 'hit', t0: t };
    d.img.setTint(0xff9a8a);
    d.tintUntil = t + 0.12;
  }

  private kill(d: Man, px: number, py: number): void {
    d.state = 'dead';
    d.act = null;
    d.deathT = this.t;
    d.img.clearTint();
    d.tintUntil = -1;
    d.shadow.setVisible(false);
    d.foe = null;
    if (d.side === 0) this.playerDeaths++;
    this.decal(px + this.rng.range(-5, 5), py + this.rng.range(-2, 3));
    this.blood(px, py);
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
    const ox = hit ? 0 : rng.range(-0.9, 0.9);
    const oy = (hit ? 0 : rng.range(-0.5, 0.5)) + (m.side === 0 ? -0.1 : 0.1);
    const d = Math.hypot(target.x + ox - m.x, target.y + oy - m.y);
    this.missiles.push({ kind, sx: m.x, sy: m.y, tx: target.x + ox, ty: target.y + oy, ox, oy, t0: this.t, dur: 0.45 + d * 0.11, target, hit, done: false, until: 0 });
    if (this.missiles.length > 24) this.missiles.shift();
  }

  private stepMissiles(): void {
    const t = this.t;
    for (const p of this.missiles) {
      if (p.done) continue;
      // in the air it follows its man (a running target is still hit, a miss still whistles past him)
      const tg = p.target;
      if (tg && this.alive(tg)) {
        p.tx = tg.x + p.ox;
        p.ty = tg.y + p.oy;
      } else p.target = null;
      if (t < p.t0 + p.dur) continue;
      p.done = true;
      p.until = t + 5;
      if (!p.hit) continue;
      if (tg && this.alive(tg)) {
        if (tg.shield && this.rng.chance(0.5) && !tg.act) {
          tg.act = { kind: 'block', t0: t };
          const s = isoToScreen(tg.x, tg.y);
          this.spark(s.x + (tg.side === 0 ? 4 : -4), s.y - 15);
          continue;
        }
        const s = isoToScreen(tg.x, tg.y);
        const mayKill = tg.side === 1 ? this.enemyShotDeaths < 1 && p.kind !== 'stone' && !tg.rider : false;
        tg.hp -= 1;
        this.blood(s.x, s.y);
        if (tg.hp <= 0 && mayKill && tg.act?.kind !== 'attack') {
          this.enemyShotDeaths++;
          this.kill(tg, s.x, s.y + 1);
        } else {
          tg.hp = Math.max(1, tg.hp);
          if (!tg.act || tg.act.kind !== 'attack') tg.act = { kind: 'hit', t0: t };
          tg.img.setTint(0xff9a8a);
          tg.tintUntil = t + 0.12;
        }
      }
    }
    this.missiles = this.missiles.filter((p) => !p.done || (p.kind !== 'stone' && !p.hit && t < p.until));
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
      const ty = t0.y - (p.hit ? 12 : 0);
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

  // ------------------------------------------------------------ drawing a figure

  /** A man's frame (the 40-column sheet). */
  private manFrame(m: Man): number {
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
      case 'reserve':
        return m.shield && m.phase % 2 < 1.2 ? FRAME.block : ANIM.idle[Math.floor(t * 2.2 + m.phase) % ANIM.idle.length];
      default:
        return ANIM.idle[Math.floor(t * 2.2 + m.phase) % ANIM.idle.length];
    }
  }

  /** A rider's or animal's frame: the full sets (walk, gallop, attack, rear, two deaths), or the chariot's four-phase ones. */
  private figureFrame(m: Man): number {
    const t = this.t;
    if (m.full) return this.fullFrame(m);
    if (m.state === 'dead') return ANIM_FRAMES.fall[Math.min(ANIM_FRAMES.fall.length - 1, Math.floor((t - m.deathT) / 0.11))];
    const a = m.act;
    if (a) {
      if (a.kind === 'attack') {
        const s = t - a.t0;
        if (s < 0.42) return ANIM_FRAMES.attack[s < 0.12 ? 0 : s < 0.24 ? 1 : 2];
        m.act = null;
      } else if (a.kind === 'hit' || a.kind === 'block') {
        if (t - a.t0 < 0.18) return ANIM_FRAMES.hit[0];
        m.act = null;
      } else m.act = null;
    }
    switch (m.state) {
      case 'walk':
      case 'run':
      case 'charge':
      case 'pursue':
      case 'rout': {
        const rate = m.rider ? (m.state === 'walk' ? 5 : 9) : m.state === 'walk' ? 7 : 11;
        return ANIM_FRAMES.gallop[Math.floor(t * rate + m.phase) % ANIM_FRAMES.gallop.length];
      }
      default:
        return ANIM_FRAMES.idle[Math.floor(t * 1.6 + m.phase) % ANIM_FRAMES.idle.length];
    }
  }

  private fullFrame(m: Man): number {
    const t = this.t;
    if (m.state === 'dead') {
      const die = m.dieB ? ANIM.dieB : ANIM.die;
      return die[Math.min(die.length - 1, Math.floor((t - m.deathT) / 0.12))];
    }
    const a = m.act;
    if (a && a.kind !== 'aim') {
      const s = t - a.t0;
      if (a.kind === 'attack') {
        if (s < 0.5) return ANIM.attack[Math.min(ANIM.attack.length - 1, Math.floor(s / 0.1))];
        m.act = null;
      } else if (a.kind === 'hit' || a.kind === 'block') {
        if (s < 0.3) return ANIM.hit[s < 0.15 ? 0 : 1];
        m.act = null;
      } else m.act = null;
    } else if (a) m.act = null;
    switch (m.state) {
      case 'walk':
        return ANIM.walk[Math.floor(t * 8 + m.phase) % ANIM.walk.length];
      case 'run':
      case 'charge':
      case 'pursue':
      case 'rout':
        return ANIM.gallop[Math.floor(t * 12 + m.phase) % ANIM.gallop.length];
      default:
        return ANIM.idle[Math.floor(t * 2 + m.phase) % ANIM.idle.length];
    }
  }

  /** The facing row: men face the enemy (routers turn away); riders and animals face the way they move. */
  private rowOf(m: Man): number {
    if (m.man) return m.side === 0 || m.state === 'rout' ? ROW_UP_RIGHT : ROW_DOWN_LEFT;
    const moving = m.state === 'walk' || m.state === 'run' || m.state === 'charge' || m.state === 'pursue' || m.state === 'rout';
    if (!moving) return m.row;
    const dx = m.tx - m.x;
    const dy = m.ty - m.y;
    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return m.row;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 3) : dy < 0 ? 1 : 2;
  }

  private draw(m: Man): void {
    const row = this.rowOf(m);
    if (row !== m.row) {
      m.row = row;
      m.rowKey = battleRow(this.scene, m.key, row);
    }
    const f = battleFrame(m.rowKey, m.man ? this.manFrame(m) : this.figureFrame(m));
    if (m.img.texture.key !== f.key) m.img.setTexture(f.key, f.frame);
    else if (String(m.img.frame.name) !== String(f.frame)) m.img.setFrame(f.frame);
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
