import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, Meter, addPanel, addText, holdTimer, longPress, uiMetrics, type HoldTimer } from '../ui/kit';
import { RS, camZoom, px, zoomUnits } from '../platform/renderScale';
import { ScrollList, confirmDialog, openModal, toast, Label, type Modal } from '../ui/widgets';
import { GroupCard } from '../ui/battlePanel';
import { ListRow, type StripSlot } from '../ui/strategos';
import { HintPill, MED_H, MED_W, Medallion, TOP_H, TopBar, type TopBarOpts } from '../ui/battleHud';
import { TERRA } from '../art/smoothUi';
import { RadialOrders, type RadialOrder } from '../ui/radialOrders';
import { RARITY_COLOR, SIZE, STRAT, type BattleCategory } from '../ui/theme';
import { uiId, uiIgnore } from '../ui/layout';
import { ellipsize, measureText, wrapText, LINE_H } from '../ui/textfit';
import { PLATE_W, PLATE_W_BIG, battleDoll, battleFrame, battleRow, battleRowFx, dollFrame, dollOrigin, ensureDoll, ensureDollRow, ensurePortrait, flushDolls, pumpDolls, queueDollRows, releaseBattleRows } from '../ui/sprites';
import { dollFromHero, dollFx, ANIM, ANIM_FRAMES, BATTLE_SCALE, aimFrame, attackFrame, isRangedClass, weaponClass, type DollFx, type WeaponClass } from '../art/paperdoll';
import { AURA_COLORS, BANNER_COLORS, cosmeticLoadout } from '../game/cosmetics';
import { STANDARD_FRAMES, STANDARD_H, STANDARD_W, STRIP_STEPS, plateOrigin, renderGround, renderStandard, renderStripPlate, stripStep } from '../art/ground';
import { isoFacing, isoFieldBounds, isoToScreen, screenToIso } from '../art/iso';
import { P } from '../art/palette';
import { state, randomSeed } from '../state';
import { Battle, DT, TICK_RATE } from '../sim/battle';
import { Rng } from '../sim/rng';
import { SPACING, formationSlots, rightOf, type FormationType } from '../sim/formation';
import { KNOB_PACES, dragMove, dragPlan, dragStart, type DragEvents, type DragKind, type DragState } from '../ui/dragFormation';
import type { BattleSetup, Order, Side, SimEvent, SimGroup, SimUnit } from '../sim/types';
import type { TerrainGrid } from '../sim/terrain';
import type { BattleSource } from '../online/battleSource';
import { createDeployClock, foeIsReady, markStarted, pressReady, secondsLeft, tickDeploy, urgent, type DeployAction, type DeployClock } from '../online/deployClock';
import { reportBattle, snapshotSetup } from '../platform/verify';
import { generateEnemyArmy } from '../game/enemy';
import { armySpec } from '../game/armySpec';
import { resolveBattle } from '../game/loot';
import { lastBattle, unitStats } from '../game/report';
import { makeHero } from '../game/heroes';
import { GROUP_NAMES, type Hero } from '../data/units';
import { RARITIES, itemDef } from '../data/items';
import { CULTURE_LABEL } from '../data/names';
import { haptic, hapticNotify } from '../platform/telegram';
import { BattleFx } from '../ui/battleFx';
import { BeastView } from '../ui/beastView';
import { openSettings } from '../ui/settings';
import { battleAudio, uiError } from '../audio/hooks';
import { sfx } from '../audio';
import { ABILITIES, AURAS, type AbilityId } from '../data/perks';
import { rallyRadius } from '../sim/stats';
import { BOULDER_GEOM, TREE_GEOM, renderBoulder, renderGlint, renderSparkle, renderTree } from '../art/terrainArt';
import { generateBattlefield, randomSite } from '../world/battlefield';
import { HEIGHT_RULES } from '../data/terrain';
import { hashString } from '../sim/rng';
import { t, tOr, type TKey } from '../i18n';
import { BattleTutorial, type TutorialEvent, type TutorialHost, type TutorialStart } from '../ui/tutorial/battleTutorial';
import { tutorialBattle } from '../game/tutorial';

// World pixels come from the 2:1 isometric projection in src/art/iso.ts.
const MARGIN_X = 200; // grass beyond the field's screen bounds
const MARGIN_Y = 300; // generous: a portrait viewport at zoom 1 is taller than the field
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
/** A live duel more than this many sealed turns behind catches up, at most CATCH_UP_STEPS sim steps a frame. */
const CATCH_UP_TURNS = 4;
const CATCH_UP_STEPS = 120;

// HUD geometry (UI pixels, docs/UI_STRATEGOS.md "Battle"): the situation bar, the field with the
// group cards down its left edge and the radial ring, the ability row, the command strip.
/** Bottom sheet (UI px): group card height, the header line, the order buttons. */
const SHEET_CARD_H = 28;
const SHEET_HEAD_H = 16;
const SHEET_ORDERS_H = 28;

const PRESETS: [FormationType, string, string][] = [
  ['line', 'line', 'f_line'],
  ['column', 'column', 'f_column'],
  ['wedge', 'wedge', 'f_wedge'],
  ['skirmish', 'loose', 'f_skirm'],
  ['shieldwall', 'wall', 'f_wall'],
];

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
  /** Sheet row on show (0..3, see src/art/paperdoll.ts DIRS). */
  dir: number;
  key: string;
  /** Figure height in pixels (tags, flags, numbers, touch). */
  tall: number;
  big: boolean;
  /** A man on foot (six-phase walk, four-step fall); riders and animals use the shorter sets. */
  man: boolean;
  /** Stands on a base plate (men and riders; animals only cast a shadow). */
  plated: boolean;
  /** Top face of his piece of a joined formation base (the side layer is `shadow`). */
  plateTop: Phaser.GameObjects.Image;
  /** Strip step on show (-1: his own small plate). */
  strip: number;
  /** Texture key on plateTop (plain / selected / singled out). */
  topKey: string;
  /** Men: weapon class (which attack / aim animation), the facing row's texture, and rarity effects. */
  wc: WeaponClass;
  rowKey: string;
  fx: DollFx | null;
  /** Epic+ outline ring and rare+ glint sweep overlays (men with such gear only). */
  fxRing: Phaser.GameObjects.Sprite | null;
  fxGlint: Phaser.GameObjects.Sprite | null;
  /** Aura cosmetic colours (the player's men), or null. */
  aura: number[] | null;
  /** Which death he dies (backwards or onto the face). */
  dieB: boolean;
}

/** Texture origins of the joined formation plates, per strip step. */
const STRIP_ORIGIN: [number, number][] = [];
/** Team colours of the standards: the viewer's side, the other side (cool slate vs madder red, as the HUD bars). */
const STANDARD_RAMP = [
  [0x8ea2b8, 0x4f6c8c, 0x3d5a78, 0x2e3e56],
  [0xcc7677, 0xb83d4a, 0xa12735, 0x5e2427],
];

type Gesture = {
  mode: 'pending' | 'pan' | 'formation' | 'info';
  id: number;
  sx: number;
  sy: number;
  lx: number;
  ly: number;
  wx0: number;
  wy0: number;
  /** Pressed on the selected group or its marker (move) or on its facing knob (turn): a drag is a formation order. */
  grab: DragKind | null;
  /** Formation drag state, created on the first drag. */
  drag: DragState | null;
} | null;

/** Finger travel (screen px) before a press becomes a drag: below it a lift is a tap. */
const DRAG_PX = px(10);
/** Grab radius (screen px) around the selected group's soldiers, placement marker and facing knob. */
const GRAB_PX = px(30);
/** Tap radius (screen px) of a floating group tag (a 44 pt target). */
const TAG_PX = px(20);

export class BattleScene extends BaseScene {
  private sim!: Battle;
  /** For the server replay check (platform/verify). */
  private verifySetup: BattleSetup | null = null;
  private deployOrders: number | undefined;
  private views: UnitView[] = [];
  private world!: Phaser.GameObjects.Layer;
  private boxes!: Phaser.GameObjects.Graphics;
  /** The facing arrow and turn knob, drawn over the soldiers so it can always be seen and grabbed. */
  private knobG!: Phaser.GameObjects.Graphics;
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
  private dragPreview: { cx: number; cy: number; fx: number; fy: number; frontage: number; type: FormationType; n: number; label: string } | null = null;
  private dragLabel: Phaser.GameObjects.BitmapText | null = null;
  private hint: Phaser.GameObjects.Container | null = null;
  private lastAutoPause = -9999;
  private lastHaptic = 0;
  private enemyHeroes: Hero[] = [];
  private initialStrength: [number, number] = [1, 1];
  private ending = false;
  /** Side whose men play the victory pose once the battle is over (-1: none). */
  private victorySide = -1;
  /** Particles left this second for legendary gear and aura cosmetics (mobile cap). */
  private moteBudget = 0;
  private moteTime = 0;
  private retreatMsg: string | null = null;
  // HUD
  private hud!: Phaser.GameObjects.Container;
  private tags!: Phaser.GameObjects.Container;
  private tagMap = new Map<number, Phaser.GameObjects.Container>();
  private tagPos = new Map<number, { x: number; y: number }>();
  private top: TopBar | null = null;
  private hintPill: HintPill | null = null;
  private sitKey = '';
  private ring: RadialOrders | null = null;
  private ringKey = '';
  /** The tutorial hides the ring during its field steps. */
  private ringHidden = false;
  private cards: { gid: number; card: GroupCard; numeral: string }[] = [];
  /** Order, shape and ability controls by key (ring buttons, shape rows, ability chips): the tutorial lights them. */
  private cmdBtns = new Map<string, Phaser.GameObjects.Container>();
  /** The shape chip under 'formation' and the first ability chip under 'abilities' (the tutorial's fallbacks). */
  private tabBtns = new Map<BattleCategory, Phaser.GameObjects.Container>();
  private heroInfo: Phaser.GameObjects.Container | null = null;
  private banner: Phaser.GameObjects.Container | null = null;
  private bannerTimer: Phaser.Time.TimerEvent | null = null;
  private overlay: Phaser.GameObjects.Container | null = null;
  private hudDirty = true;
  private groupList: ScrollList | null = null;
  private fx!: BattleFx;
  /** Mythical beasts on screen (src/ui/beastView.ts); null without beasts. */
  private beasts: BeastView | null = null;
  /** Camera follows the fighting until the player pans or pinches. */
  private follow = true;
  private followBtn: Button | null = null;
  private abilityBtns: { id: AbilityId; btn: Medallion }[] = [];
  /** The shape sheet is open. */
  private shapeOpen = false;
  private lastSparkle = 0;
  /** Trees and boulders standing on the field (depth-sorted with the men). */
  private props: { img: Phaser.GameObjects.Image; x: number; y: number; tree: boolean }[] = [];
  /** Water shimmer: sparkles and streaks that blink on and off at random spots on the water. */
  private glints: { img: Phaser.GameObjects.Image; t0: number; life: number }[] = [];
  /** Water cells the shimmer picks its spots from. */
  private waterCells: number[] = [];
  /** One standard per formation, carried by a man near the centre-front. */
  private standards: { img: Phaser.GameObjects.Sprite; group: number; bearer: UnitView | null; picked: number }[] = [];
  private viewById = new Map<number, UnitView>();
  private infoTip: Phaser.GameObjects.Container | null = null;
  private holdTimer: HoldTimer | null = null;
  private propTick = 0;
  /** Online battle (attack or live duel) instead of the offline campaign's; see src/online/battleSource.ts. */
  private src: BattleSource | null = null;
  /** The side the local player commands (1 for the accepting player of a duel). */
  private me: Side = 0;
  private stallMs = 0;
  private netBanner = false;
  /** Online battles: the timed deployment (docs/DESIGN_V2.md "Online battle rules"). */
  private dclock: DeployClock | null = null;
  private countdown: { bar: Phaser.GameObjects.Graphics; shown: number } | null = null;
  private lastTickSound = -1;
  /** The guided tutorial battle (src/ui/tutorial/battleTutorial.ts): set from the scene data, the controller after the HUD. */
  private tutorialData: TutorialStart | null = null;
  tutorial: BattleTutorial | null = null;

  private get foe(): Side {
    return this.me === 0 ? 1 : 0;
  }

  /** Online battles (attacks and duels) run in real time: no pause, no auto-pause, no speed-up. */
  private get online(): boolean {
    return !!this.src;
  }

  constructor() {
    super('Battle');
  }

  create(data: { fresh?: boolean; source?: BattleSource; tutorial?: TutorialStart }): void {
    this.views = [];
    this.decals = [];
    this.tagMap = new Map();
    this.tagPos = new Map();
    this.paused = false;
    this.speed = 1;
    this.acc = 0;
    this.selGroup = -1;
    this.selUnit = -1;
    this.gesture = null;
    this.pinch = null;
    this.dragPreview = null;
    this.dragLabel = null;
    this.hint = null;
    this.ending = false;
    this.victorySide = -1;
    this.retreatMsg = null;
    this.overlay = null;
    this.banner = null;
    this.follow = true;
    this.abilityBtns = [];
    this.infoTip = null;
    this.holdTimer = null;
    this.propTick = 0;
    this.stallMs = 0;
    this.netBanner = false;
    this.shapeOpen = false;
    this.sitKey = '';
    this.ringKey = '';
    this.ringHidden = false;
    this.countdown = null;
    this.lastTickSound = -1;
    this.src = data?.source ?? null;
    this.tutorialData = !this.src && data?.tutorial ? data.tutorial : null;
    this.tutorial = null;
    this.me = this.src?.side ?? 0;
    this.dclock = this.src ? createDeployClock(this.src.lockstep ? 'duel' : 'attack') : null;
    this.initUi();

    const camp = state.campaign;
    let heroes: Hero[];
    let setup: BattleSetup;
    if (this.src) {
      // Online: the server fixed seed, armies and field; both sides' heroes come with it.
      setup = JSON.parse(JSON.stringify(this.src.setup)) as BattleSetup;
      const byId = new Map(this.src.heroes.map((h) => [h.id, h]));
      heroes = setup.armies[this.me].units.map((u) => byId.get(u.heroId)!).filter(Boolean);
      this.enemyHeroes = setup.armies[this.foe].units.map((u) => byId.get(u.heroId)!).filter(Boolean);
    } else if (this.tutorialData) {
      // The tutorial: a fixed scenario with its own men (the campaign's army is not touched).
      const tb = tutorialBattle();
      setup = tb.setup;
      heroes = tb.heroes;
      this.enemyHeroes = tb.enemyHeroes;
    } else {
      if (data?.fresh || !state.pending) {
        const seed = randomSeed();
        const enemy = generateEnemyArmy(new Rng(seed ^ 0xa5a5a5a5), camp.data, camp.data.heroes, camp.data.won);
        state.pending = { enemy, seed };
      }
      const pending = state.pending!;
      this.enemyHeroes = pending.enemy.heroes;
      // Wounded heroes sit this one out.
      heroes = camp.fitHeroes();
      // The battlefield comes from the place on the map where the armies met.
      const site = pending.site ?? randomSite(new Rng(pending.seed ^ 0x51735c1));
      const terrain = generateBattlefield(pending.seed, site);
      setup = { seed: pending.seed, armies: [armySpec(heroes, false), armySpec(this.enemyHeroes, true)], terrain };
    }
    const terrain: TerrainGrid = setup.terrain ?? { w: 0, h: 0, cells: 'flat' };
    this.verifySetup = this.src || this.tutorialData ? null : snapshotSetup(setup);
    this.deployOrders = undefined;
    this.sim = new Battle(setup);
    this.src?.lockstep?.attach(this.sim);
    lastBattle.heroes = heroes.map((h) => JSON.parse(JSON.stringify(h)) as Hero);
    lastBattle.side = this.me;

    // ---- world
    this.world = this.add.layer();
    const fb = isoFieldBounds(this.sim.width, this.sim.height);
    const gx = fb.x0 - MARGIN_X;
    const gy = fb.y0 - MARGIN_Y;
    const gw = fb.x1 - fb.x0 + MARGIN_X * 2;
    const gh = fb.y1 - fb.y0 + MARGIN_Y * 2;
    const gkey = `isoground_${this.sim.width}x${this.sim.height}_${hashString(terrain.cells + (terrain.height ?? '')).toString(36)}`;
    if (!this.textures.exists(gkey)) {
      // one battlefield texture at a time: drop the previous one
      for (const k of this.textures.getTextureKeys()) if (k.startsWith('isoground_')) this.textures.remove(k);
      this.textures.addCanvas(gkey, renderGround(gw, gh, { originX: gx, originY: gy, fieldW: this.sim.width, fieldH: this.sim.height, seed: 21, terrain: this.sim.terrain }).toCanvas());
    }
    this.world.add(this.add.image(gx, gy, gkey).setOrigin(0, 0).setDepth(-100000));
    this.addTerrainProps();
    this.boxes = this.add.graphics().setDepth(-80000);
    this.world.add(this.boxes);
    this.knobG = this.add.graphics().setDepth(92000);
    this.world.add(this.knobG);
    this.projG = this.add.graphics().setDepth(100000);
    this.world.add(this.projG);
    this.fx = new BattleFx(this, this.world);
    this.fx.showNumbers = camp.data.settings.dmgNumbers;

    const heroById = new Map<string, Hero>();
    for (const h of [...heroes, ...this.enemyHeroes]) heroById.set(h.id, h);
    this.ensureFormationArt();
    this.viewById.clear();
    releaseBattleRows(this);
    const lo = cosmeticLoadout();
    const myAura = (lo.aura && AURA_COLORS[lo.aura]) || null;
    for (const u of this.sim.units) {
      const hero = heroById.get(u.heroId)!;
      const f = isoFacing(u.fx, u.fy);
      const dir = facingRow(f.back, f.left);
      // the player's men wear his cosmetics (shield paint, cloak, crest, army skin, victory pose)
      const spec = { ...dollFromHero(hero, u.side === this.me ? lo : undefined), scale: BATTLE_SCALE };
      const man = !spec.beast && !spec.mount;
      let key: string;
      let rowKey = '';
      if (man) {
        // men: one texture per facing row, each frame drawn the first time it shows
        key = battleDoll(spec);
        rowKey = battleRow(this, key, dir);
      } else {
        // only the row he faces now is drawn up front; the rest in idle time
        key = ensureDoll(this, spec, [dir]);
        queueDollRows(this, key);
      }
      const big = !!u.stats.mount || u.rad > 0.45;
      // every man and rider stands on a miniature's base plate; animals only cast a shadow
      const plated = u.stats.kind !== 'animal';
      const shadow = plated
        ? this.add.image(0, 0, big ? 'base_plate_big' : 'base_plate').setOrigin(...plateOrigin(big ? PLATE_W_BIG : PLATE_W)).setDepth(-60000)
        : this.add.image(0, 0, big ? 'shadow_big' : 'shadow').setAlpha(0.3).setDepth(-60000);
      const ring = plated
        ? this.add.image(0, 0, big ? 'plate_sel_big' : 'plate_sel').setOrigin(...plateOrigin(big ? PLATE_W_BIG : PLATE_W)).setDepth(-59000).setVisible(false)
        : this.add.image(0, 0, u.side === this.me ? (big ? 'ring_sel_big' : 'ring_sel') : 'ring_enemy').setDepth(-70000).setVisible(false);
      if (!plated && big && u.side !== this.me) ring.setScale(1.6);
      const [ox, oy] = dollOrigin(key);
      const spr = man ? this.add.sprite(0, 0, rowKey, 0).setOrigin(ox, oy) : this.add.sprite(0, 0, key, dollFrame(dir, 0)).setOrigin(ox, oy);
      const fx = man ? dollFx(spec) : null;
      const fxKey = man ? battleRowFx(rowKey) : null;
      const fxRing = fxKey && fx?.outline != null ? this.add.sprite(0, 0, fxKey, 'r0').setOrigin(ox, oy).setTint(fx.outline) : null;
      const fxGlint = fxKey && fx?.glint ? this.add.sprite(0, 0, fxKey, 'g0').setOrigin(ox, oy).setTint(0xfff6d8).setVisible(false) : null;
      if (fxRing) this.world.add(fxRing);
      if (fxGlint) this.world.add(fxGlint);
      const flag = this.add.image(0, 0, 'flag_white').setOrigin(0, 1).setVisible(false).setDepth(90000);
      const plateTop = this.add.image(0, 0, 'strip_top_0').setDepth(-59900).setVisible(false);
      this.world.add([shadow, plateTop, ring, spr, flag]);
      const tall = Math.round((u.stats.mount ? 52 : u.stats.kind === 'animal' ? (u.rad > 0.45 ? 30 : 18) : 38) * BATTLE_SCALE);
      const view: UnitView = {
        u, hero, spr, shadow, ring, flag, px: u.x, py: u.y, flip: f.left, back: f.back, deathTick: -1, dir, key, tall, big, man, plated, plateTop, strip: -1, topKey: '',
        wc: weaponClass(spec.weapon), rowKey, fx, fxRing, fxGlint, aura: u.side === this.me && man ? myAura : null, dieB: (u.id * 7 + 3) % 3 === 0,
      };
      this.views.push(view);
      this.viewById.set(u.id, view);
    }
    this.createStandards();
    this.initialStrength = [Math.max(1, this.sim.sideStrength(0)), Math.max(1, this.sim.sideStrength(1))];
    this.beasts = BeastView.create(this, this.sim, this.views, this.world, this.ui, this.me, this.m.VW, this.topH());

    // ---- cameras
    const cam = this.cameras.main;
    cam.setBounds(gx, gy, gw, gh);
    cam.setBackgroundColor(P.bg);
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCam.ignore(this.world);
    cam.ignore(this.ui);

    this.hud = this.add.container(0, 0);
    this.tags = this.add.container(0, 0);
    // Group tags float over the soldiers: map markers, tapped through the field's own gesture code.
    uiIgnore(this.tags);
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
      this.setZoom(Math.round(zoomUnits(cam.zoom)) + (dy > 0 ? -1 : 1));
      this.tutorialEvent({ kind: 'zoom' });
    });
    // Back never leaves silently: deployment asks first, in battle it offers the retreat (pausing offline).
    this.screen({
      back: () => (this.tutorial ? this.tutorial.askSkip() : this.sim.phase === 'deploy' ? this.confirmLeaveDeploy() : this.openRetreat()),
      confirmClose: true,
      settings: () => {
        if (this.sim.phase === 'battle' && !this.paused && !this.online) this.setPaused(true);
        openSettings(this);
      },
    });
    if (this.tutorialData) {
      this.tutorial = new BattleTutorial(this.tutorialHost(), this.tutorialData);
      return;
    }
    const where = terrain.name ? ` - ${terrain.name}` : '';
    this.showBanner(`${t('battle.banner.deploy', { vs: this.vsLabel() })}${where}`, 3000);
    this.showGestureHint();
  }

  /** Field coordinates -> world pixels (also used by the screenshot/smoke scripts). */
  project(x: number, y: number): { x: number; y: number } {
    return isoToScreen(x, y);
  }

  /** World pixels -> field coordinates. */
  unproject(wx: number, wy: number): { x: number; y: number } {
    return screenToIso(wx, wy);
  }

  /** Short screens: a one-line situation bar and short group cards. */
  private get compact(): boolean {
    return this.m.VH < STRAT.compactVH;
  }

  /** Height of the chrome under the field: the command strip and the ability row. */
  private panelHeight(): number {
    return this.sheetH();
  }

  /** Visible battlefield in screen pixels: right of the group cards, between the situation bar and the strip. */
  private fieldViewport(): { top: number; bottom: number; left: number } {
    const { S, VH } = this.m;
    return { top: this.topH() * S, bottom: (VH - this.panelHeight() - 6) * S, left: 0 };
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
      y0 = Math.min(y0, p.y - 44);
      y1 = Math.max(y1, p.y + 4);
    }
    if (!isFinite(x0)) return;
    const vp = this.fieldViewport();
    // the zoom is chosen for the whole width (the group cards overlay the field's edge); the centring skips them
    const availW = this.scale.width / RS;
    const availH = (vp.bottom - vp.top) / RS;
    const fit = Math.floor(Math.min(availW / (x1 - x0), availH / (y1 - y0)));
    // 1x shows a man ~25 px tall on a 390-wide phone; closer if both armies fit
    const z = Phaser.Math.Clamp(Math.max(1, fit), 1, 2);
    cam.setZoom(camZoom(z));
    const t0 = this.focusPoint();
    this.centerCam(t0.x, t0.y);
  }

  /** Centre the camera on a world point inside the visible band between the HUD bars. */
  private centerCam(x: number, y: number): void {
    const cam = this.cameras.main;
    const vp = this.fieldViewport();
    const offX = (this.scale.width / 2 - (vp.left + this.scale.width) / 2) / cam.zoom;
    const offY = (this.scale.height / 2 - (vp.top + vp.bottom) / 2) / cam.zoom;
    cam.centerOn(x + offX, y + offY);
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
      if (u.side === this.me) {
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
    return { x: p.x, y: p.y - 20 };
  }

  private setFollow(on: boolean): void {
    if (this.follow === on) return;
    this.follow = on;
    this.followBtn?.setSelected(on);
  }

  /** Smoothly track the fighting while following. */
  private updateCamera(delta: number): void {
    // a paused field stays still under the finger: orders and the ring are given on a fixed view
    if (!this.follow || this.sim.phase !== 'battle' || this.pinch || this.paused) return;
    const cam = this.cameras.main;
    const t0 = this.focusPoint();
    const vp = this.fieldViewport();
    const offX = (this.scale.width / 2 - (vp.left + this.scale.width) / 2) / cam.zoom;
    const offY = (this.scale.height / 2 - (vp.top + vp.bottom) / 2) / cam.zoom;
    const cur = { x: cam.midPoint.x - offX, y: cam.midPoint.y - offY };
    const k = 1 - Math.exp((-delta / 1000) * 2.2);
    this.centerCam(cur.x + (t0.x - cur.x) * k, cur.y + (t0.y - cur.y) * k);
  }

  protected onResized(): void {
    this.uiCam.setSize(this.scale.width, this.scale.height);
    this.m = { ...this.m, ...uiMetricsOf(this) };
    this.ui.setScale(this.m.S);
    this.buildHud();
  }

  // ===================================================================== loop

  update(_time: number, delta: number): void {
    // A timer of this scene (finish -> the online source) may have left it for another
    // scene earlier in this same step: its objects are gone, so draw nothing.
    if (this.sys.settings.status !== Phaser.Scenes.RUNNING) return;
    const ls = this.src?.lockstep;
    if (ls) this.updateNet(ls, delta);
    if (this.dclock && this.sim.phase === 'deploy' && !this.ending) {
      this.runDeployActions(tickDeploy(this.dclock, Math.min(delta, 250)));
      this.updateCountdown();
    }
    if (this.sim.phase === 'battle' && !this.paused) {
      this.acc += Math.min(0.25, delta / 1000) * this.speed;
      let steps = 0;
      // Live duel back from a reconnect: run through the sealed backlog (up to CATCH_UP steps a frame) to rejoin the opponent.
      const catchUp = (ls?.backlog?.() ?? 0) > CATCH_UP_TURNS;
      if (catchUp) this.acc = Math.max(this.acc, DT * CATCH_UP_STEPS);
      const maxSteps = catchUp ? CATCH_UP_STEPS : 10;
      while (this.acc >= DT && steps < maxSteps && this.sim.phase === 'battle') {
        // Live duel: never run ahead of the turns the server sealed.
        if (ls && !ls.canStep()) {
          this.acc = Math.min(this.acc, DT);
          break;
        }
        for (const v of this.views) {
          v.px = v.u.x;
          v.py = v.u.y;
        }
        ls?.beforeStep();
        this.sim.step();
        this.handleEvents(this.sim.drainEvents());
        this.acc -= DT;
        steps++;
      }
      if (catchUp) this.acc = Math.min(this.acc, DT);
      this.hudDirty = true;
    } else if (this.sim.phase === 'ended') {
      this.handleEvents(this.sim.drainEvents());
    }
    const alpha = this.sim.phase === 'battle' && !this.paused ? Math.min(1, this.acc / DT) : 1;
    this.updateCamera(delta);
    this.fx.update(this.paused ? 0 : delta);
    pumpDolls(this.sim.phase === 'battle' && !this.paused ? 4 : 8);
    this.renderUnits(alpha);
    flushDolls(this);
    this.beasts?.update(alpha, !!this.banner);
    this.renderProjectiles(alpha);
    this.renderBoxes();
    this.updateProps();
    this.updateTags();
    this.placeRing();
    if (this.hudDirty) this.refreshHud();
  }

  /**
   * A man's frame: victory pose, attack (per weapon: thrust, slash, chop,
   * draw / whirl / throw), block, flinch, rout, run or walk, the archer's
   * draw before a shot, or breathing in place (random phase per man).
   */
  private manFrame(v: UnitView, now: number, sinceHit: number, moving: boolean): number {
    const u = v.u;
    const t = now / TICK_RATE;
    if (this.sim.phase === 'ended' && u.side === this.victorySide && !moving) return ANIM.win[Math.floor(t * 2.6 + ((u.id * 0.37) % 1) * 2) % 2];
    const shot = u.lastShotTick > u.lastAttackTick;
    const sinceAtk = (now - Math.max(u.lastAttackTick, u.lastShotTick)) / TICK_RATE;
    if (sinceAtk >= 0) {
      // missile men at close quarters jab with the weapon in hand
      const wc: WeaponClass = !shot && isRangedClass(v.wc) ? 'none' : v.wc;
      const f = attackFrame(wc, sinceAtk);
      if (f >= 0) return f;
    }
    const sinceBlock = (now - u.lastBlockTick) / TICK_RATE;
    if (sinceBlock >= 0 && sinceBlock < 0.22) return ANIM.block[0];
    if (sinceHit >= 0 && sinceHit < 0.24) return ANIM.hit[sinceHit < 0.1 ? 0 : 1];
    if (u.state === 'routing') return ANIM.rout[Math.floor(t * 11 + u.id) % ANIM.rout.length];
    if (moving) {
      if (u.spd > u.stats.speed * 1.3) return ANIM.run[Math.floor(t * 13 + u.id) % ANIM.run.length];
      return ANIM.walk[Math.floor(t * 13 + u.id) % ANIM.walk.length];
    }
    if (isRangedClass(v.wc) && u.ammo > 0 && u.lastShotTick > 0 && (now - u.lastShotTick) / TICK_RATE < u.stats.shotTime * 1.8) {
      const f = aimFrame(v.wc, Math.max(0, u.cooldown) / TICK_RATE, t);
      if (f >= 0) return f;
    }
    return ANIM.idle[Math.floor(t * 2.2 + ((u.id * 0.618) % 1) * 4) % 4];
  }

  /** Riders, chariots and animals: the original four-phase sets. */
  private figureFrame(v: UnitView, now: number, sinceHit: number, moving: boolean): number {
    const u = v.u;
    const sinceAtk = (now - Math.max(u.lastAttackTick, u.lastShotTick)) / TICK_RATE;
    if (sinceAtk >= 0 && sinceAtk < 0.42) return sinceAtk < 0.12 ? ANIM_FRAMES.attack[0] : sinceAtk < 0.24 ? ANIM_FRAMES.attack[1] : ANIM_FRAMES.attack[2];
    if (sinceHit >= 0 && sinceHit < 0.18) return ANIM_FRAMES.hit[0];
    if (moving || u.state === 'routing') {
      const rate = (u.state === 'routing' ? 1.5 : 1) * 8;
      return ANIM.gallop[Math.floor((now / TICK_RATE) * rate + u.id) % ANIM.gallop.length];
    }
    return ANIM_FRAMES.idle[Math.floor((now / TICK_RATE) * 1.6 + ((u.id * 0.618) % 1) * 2) % 2];
  }

  /** Show a frame: men from their facing row's texture (drawn on demand), others from their sheet. */
  private showFrame(v: UnitView, dir: number, frame: number): void {
    if (!v.man) {
      v.spr.setFrame(dollFrame(dir, frame));
      return;
    }
    battleFrame(v.rowKey, frame);
    if (v.spr.texture.key !== v.rowKey) v.spr.setTexture(v.rowKey, frame);
    else if (Number(v.spr.frame.name) !== frame) v.spr.setFrame(frame);
  }

  /** Epic+ gear: the outline ring pulses; rare+: a highlight sweeps across the metal now and then. */
  private updateGearFx(v: UnitView, rx: number, ry: number, frame: number): void {
    const fxKey = battleRowFx(v.rowKey);
    const t = this.time.now / 1000;
    const rank = v.fx?.rank ?? 0;
    if (v.fxRing && fxKey) {
      if (v.fxRing.texture.key !== fxKey) v.fxRing.setTexture(fxKey, `r${frame}`);
      else v.fxRing.setFrame(`r${frame}`);
      const pulse = 0.5 + 0.5 * Math.sin(t * (rank >= 4 ? 4.4 : 3) + v.u.id);
      v.fxRing.setPosition(v.spr.x, ry).setDepth(ry - 0.5).setVisible(true).setAlpha(0.3 + 0.5 * pulse);
    }
    if (v.fxGlint && fxKey) {
      const period = rank >= 4 ? 1.8 : rank >= 3 ? 2.4 : 3.2;
      const ph = ((t + (v.u.id * 0.53) % period) % period) / 0.4; // the sweep takes 0.4 s
      const fw = v.spr.frame.width;
      const bx = Math.floor(ph * (fw * 0.6)) + Math.floor(fw * 0.2);
      if (ph < 1) {
        if (v.fxGlint.texture.key !== fxKey) v.fxGlint.setTexture(fxKey, `g${frame}`);
        else v.fxGlint.setFrame(`g${frame}`);
        v.fxGlint.setCrop(bx, 0, 2, v.spr.frame.height).setPosition(v.spr.x, ry).setDepth(ry + 0.5).setVisible(true).setAlpha(0.85);
      } else v.fxGlint.setVisible(false);
    }
    void rx;
  }

  /** Legendary gear and aura cosmetics: sparse motes rising around the man (capped for phones). */
  private gearParticles(v: UnitView, rx: number, ry: number): void {
    const now = this.time.now;
    if (now - this.moteTime > 1000) {
      this.moteTime = now;
      this.moteBudget = 36;
    }
    if (this.moteBudget <= 0) return;
    const legend = v.fx?.particles;
    const rate = (legend ? 1.4 : 0) + (v.aura ? 1 : 0);
    if (Math.random() > (rate * this.game.loop.delta) / 1000) return;
    this.moteBudget--;
    const useAura = v.aura && (!legend || Math.random() < 0.5);
    const cols = useAura ? v.aura! : legend === 'embers' ? [0xffb040, 0xffe080, 0xf07830] : legend === 'sparkle' ? [0xd0f0ff, 0xffffff] : [0xfff6c8, 0xffe8a0];
    const c = cols[Math.floor(Math.random() * cols.length)];
    this.fx.mote(rx + Math.round((Math.random() - 0.5) * 12), ry - 3 - Math.random() * v.tall * 0.8, c);
  }

  /** Online deployment: the enemy's men stay hidden until the battle starts (only their zone shows). */
  private hideFoes(): boolean {
    return this.online && this.sim.phase === 'deploy';
  }

  private renderUnits(alpha: number): void {
    const tick = this.sim.tick;
    const now = tick + alpha;
    const hide = this.hideFoes();
    for (const v of this.views) {
      const u = v.u;
      if (u.state === 'fled' || (hide && u.side === this.foe)) {
        v.spr.setVisible(false);
        v.shadow.setVisible(false);
        v.plateTop.setVisible(false);
        v.ring.setVisible(false);
        v.flag.setVisible(false);
        v.fxRing?.setVisible(false);
        v.fxGlint?.setVisible(false);
        this.fx.unit(u, 0, 0, 0, false);
        continue;
      }
      v.spr.setVisible(true);
      const ix = Phaser.Math.Linear(v.px, u.x, alpha);
      const iy = Phaser.Math.Linear(v.py, u.y, alpha);
      const sp = isoToScreen(ix, iy);
      const rx = Math.round(sp.x);
      const ry = Math.round(sp.y);
      v.spr.setPosition(rx, ry);
      v.shadow.setPosition(rx, ry);
      v.ring.setPosition(rx, ry);
      // facing -> one of the four iso diagonals: row (front/back) + mirror, with hysteresis
      const fc = isoFacing(u.fx, u.fy);
      if (fc.sy < -3) v.back = true;
      else if (fc.sy > 3) v.back = false;
      if (fc.sx < -6) v.flip = true;
      else if (fc.sx > 6) v.flip = false;
      const dir = facingRow(v.back, v.flip);
      if (dir !== v.dir) {
        if (v.man) v.rowKey = battleRow(this, v.key, dir);
        else ensureDollRow(this, v.key, dir);
        v.dir = dir;
      }
      let frame: number;
      if (u.state === 'dead') {
        if (v.deathTick < 0) v.deathTick = tick;
        const tt = (now - v.deathTick) / TICK_RATE;
        // a man falls in four steps (stagger, topple / crumple, hit the ground, lie still); riders and beasts in three
        const die = v.man ? (v.dieB ? ANIM.dieB : ANIM.die) : ANIM_FRAMES.fall;
        frame = die[Math.min(die.length - 1, Math.floor(tt / (v.man ? 0.08 : 0.11)))];
        v.spr.setDepth(-50000 + ry);
        v.shadow.setVisible(false);
        v.plateTop.setVisible(false);
        v.ring.setVisible(false);
        v.flag.setVisible(false);
        v.fxRing?.setVisible(false);
        v.fxGlint?.setVisible(false);
        v.spr.clearTint();
        this.showFrame(v, dir, frame);
        this.fx.unit(u, rx, ry, this.time.now, false);
        continue;
      }
      const moving = Math.abs(u.vx) + Math.abs(u.vy) > 0.004;
      const sinceHit = (now - u.lastHitTick) / TICK_RATE;
      frame = v.man ? this.manFrame(v, now, sinceHit, moving) : this.figureFrame(v, now, sinceHit, moving);
      this.showFrame(v, dir, frame);
      v.spr.setDepth(ry);
      if (v.fxRing || v.fxGlint) this.updateGearFx(v, rx, ry, frame);
      if ((v.fx?.particles || v.aura) && !this.paused) this.gearParticles(v, rx, ry);
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
        this.fx.sparkle(rx, ry - v.tall * 0.6, AURAS.steady.color, 2);
      }
      const selected = u.side === this.me && (u.group === this.selGroup || u.id === this.selUnit);
      const one = u.id === this.selUnit;
      // men standing in their formation slots share one joined base (a strip per rank)
      const k = this.stripOf(v);
      if (k !== v.strip) {
        v.strip = k;
        if (k >= 0) v.shadow.setTexture(`strip_side_${k}`).setOrigin(...STRIP_ORIGIN[k]);
        else if (v.plated) v.shadow.setTexture(v.big ? 'base_plate_big' : 'base_plate').setOrigin(...plateOrigin(v.big ? PLATE_W_BIG : PLATE_W));
        v.plateTop.setVisible(k >= 0);
        v.topKey = '';
      }
      if (k >= 0) {
        // the plate sits on his slot (shifted by the same interpolation lag as the man), not under his feet
        const g = this.sim.groups[u.group].formation;
        const r = rightOf(g.fx, g.fy);
        const pp = isoToScreen(g.cx + r.x * u.slotLat - g.fx * u.slotDep + (ix - u.x), g.cy + r.y * u.slotLat - g.fy * u.slotDep + (iy - u.y));
        const px = Math.round(pp.x);
        const py = Math.round(pp.y);
        v.shadow.setPosition(px, py);
        const tk = `${selected ? (one ? 'strip_one' : 'strip_sel') : 'strip_top'}_${k}`;
        if (tk !== v.topKey) {
          v.topKey = tk;
          v.plateTop.setTexture(tk).setOrigin(...STRIP_ORIGIN[k]);
        }
        v.plateTop.setPosition(px, py).setVisible(true);
      }
      v.ring.setVisible(selected && k < 0);
      if (selected && k < 0) {
        if (v.u.stats.kind !== 'animal') v.ring.setTexture(`${one ? 'plate_one' : 'plate_sel'}${v.big ? '_big' : ''}`);
        else v.ring.setTexture(one ? 'ring_one' : 'ring_sel');
      }
      v.flag.setVisible(u.state === 'routing');
      if (u.state === 'routing') v.flag.setPosition(rx + 3, ry - v.tall);
    }
    this.updateStandards();
  }

  // ===================================================================== formation art

  /** Joined-plate textures (side, plain / selected / singled-out tops) per facing step, and the standards. */
  private ensureFormationArt(): void {
    for (let k = 0; k < STRIP_STEPS; k++) {
      if (!STRIP_ORIGIN[k] || !this.textures.exists(`strip_top_${k}`)) {
        const sp = renderStripPlate(k);
        STRIP_ORIGIN[k] = [sp.ox, sp.oy];
        if (this.textures.exists(`strip_top_${k}`)) continue;
        this.textures.addCanvas(`strip_side_${k}`, sp.side.toCanvas());
        this.textures.addCanvas(`strip_top_${k}`, sp.top.toCanvas());
        this.textures.addCanvas(`strip_sel_${k}`, sp.sel.toCanvas());
        this.textures.addCanvas(`strip_one_${k}`, sp.one.toCanvas());
      }
    }
    for (let i = 0; i < 2; i++) {
      const key = `standard_${i}`;
      if (this.textures.exists(key)) continue;
      const tex = this.textures.addCanvas(key, renderStandard(STANDARD_RAMP[i]).toCanvas())!;
      for (let f = 0; f < STANDARD_FRAMES; f++) tex.add(f, 0, f * STANDARD_W, 0, STANDARD_W, STANDARD_H);
    }
    // the player's banner cosmetic dyes his own standards
    const banner = cosmeticLoadout().banner;
    const bc = banner ? BANNER_COLORS[banner] : undefined;
    if (bc && !this.textures.exists(`standard_${banner}`)) {
      const tex = this.textures.addCanvas(`standard_${banner}`, renderStandard([bc.cloth[0], bc.cloth[1], bc.cloth[2], bc.cloth[4]]).toCanvas())!;
      for (let f = 0; f < STANDARD_FRAMES; f++) tex.add(f, 0, f * STANDARD_W, 0, STANDARD_W, STANDARD_H);
    }
  }

  /**
   * The strip step a man's plate joins at, or -1 for his own small plate: he
   * stands (within a step) on his slot in a close-order formation that is
   * holding together. Hysteresis keeps plates from flickering as men shuffle.
   */
  private stripOf(v: UnitView): number {
    const u = v.u;
    if (!v.plated || v.big || u.state !== 'ready') return -1;
    const g = this.sim.groups[u.group];
    if (!g || g.routed || g.individual || g.disbanded || SPACING[g.formation.type].file > 1.05) return -1;
    const f = g.formation;
    const r = rightOf(f.fx, f.fy);
    const dx = f.cx + r.x * u.slotLat - f.fx * u.slotDep - u.x;
    const dy = f.cy + r.y * u.slotLat - f.fy * u.slotDep - u.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > (v.strip >= 0 ? 0.36 * 0.36 : 0.22 * 0.22)) return -1;
    return stripStep(f.fx, f.fy);
  }

  /** One standard per formation of men (two or more on foot), coloured by side as seen by this player. */
  private createStandards(): void {
    this.standards = [];
    for (const g of this.sim.groups) {
      const men = this.views.filter((v) => v.u.group === g.id && v.man);
      if (men.length < 2) continue;
      const banner = cosmeticLoadout().banner;
      const mine = g.side === this.me && banner && this.textures.exists(`standard_${banner}`) ? `standard_${banner}` : null;
      const img = this.add.sprite(0, 0, mine ?? `standard_${g.side === this.me ? 0 : 1}`, 0).setOrigin(6.5 / STANDARD_W, 1).setVisible(false);
      this.world.add(img);
      this.standards.push({ img, group: g.id, bearer: null, picked: 0 });
    }
  }

  /** Keep each standard with a living man near the centre-front of his formation; wave it at 4 fps. */
  private updateStandards(): void {
    const now = this.time.now;
    for (const st of this.standards) {
      const g = this.sim.groups[st.group];
      let b = st.bearer;
      const ok = (v: UnitView | null) => !!v && v.u.state === 'ready' && v.spr.visible;
      if (!ok(b) || now - st.picked > 4000) {
        // the man nearest the centre of the second rank (or the front, if there is only one)
        let best: UnitView | null = null;
        let bs = Infinity;
        for (const v of this.views) {
          if (v.u.group !== st.group || !v.man || !ok(v)) continue;
          const sc = Math.abs(v.u.slotLat) + Math.abs(v.u.slotDep - 1.3) * 0.6 + (v === b ? -0.3 : 0);
          if (sc < bs) {
            bs = sc;
            best = v;
          }
        }
        b = st.bearer = best;
        st.picked = now;
      }
      if (!b || !g || g.routed || g.disbanded) {
        st.img.setVisible(false);
        continue;
      }
      const x = b.spr.x + (b.flip ? -4 : 4);
      st.img.setPosition(Math.round(x), b.spr.y - 1).setDepth(b.spr.depth + 0.5).setVisible(true);
      st.img.setFrame(Math.floor(now / 250 + st.group * 1.7) % STANDARD_FRAMES);
    }
  }

  private renderProjectiles(alpha: number): void {
    const g = this.projG;
    g.clear();
    const now = this.sim.tick + alpha;
    for (const p of this.sim.projectiles) {
      const tt = (now - p.t0) / p.dur;
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
        g.lineBetween(Math.round(tx), Math.round(ty), Math.round(tx - dx * 4), Math.round(ty - 8));
        continue;
      }
      if (tt < 0 || tt > 1) continue;
      const height = Math.sin(Math.PI * tt) * arcH + 24 * (1 - tt) + 6 * tt;
      const x = sx + (tx - sx) * tt;
      const y = sy + (ty - sy) * tt - height;
      if (p.kind === 'stone') {
        g.fillStyle(0x5a5650, 1);
        g.fillRect(Math.round(x), Math.round(y), 2, 2);
        continue;
      }
      // orientation from the derivative of the arc
      const t2 = Math.min(1, tt + 0.02);
      const h2 = Math.sin(Math.PI * t2) * arcH + 24 * (1 - t2) + 6 * t2;
      let vx = (tx - sx) * 0.02;
      let vy = (ty - sy) * 0.02 - (h2 - height);
      const l = Math.sqrt(vx * vx + vy * vy) || 1;
      vx /= l;
      vy /= l;
      const len = p.kind === 'javelin' ? 13 : 8;
      g.lineStyle(1, p.kind === 'javelin' ? P.wood[1] : P.wood[0], 1);
      g.lineBetween(Math.round(x - vx * len), Math.round(y - vy * len), Math.round(x), Math.round(y));
      g.fillStyle(P.iron[0], 1);
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }

  /** Deployment zones (ours, and the enemy's in red), placement boxes of the selected group and the drag preview. */
  private renderBoxes(): void {
    const g = this.boxes;
    g.clear();
    this.knobG.clear();
    if (this.sim.phase === 'deploy') {
      const zone = (side: Side, color: number, fill: number, a: number) => {
        const z = this.sim.deployZone(side);
        const quad = [
          [0, z.y0],
          [this.sim.width, z.y0],
          [this.sim.width, z.y1],
          [0, z.y1],
        ].map(([x, y]) => {
          const p = isoToScreen(x, y);
          return [Math.round(p.x), Math.round(p.y)] as [number, number];
        });
        g.fillStyle(fill, a);
        g.fillPoints(quad.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
        this.dashRect(g, quad, color, 0.6, 4, 3);
      };
      zone(this.foe, 0xe07060, 0xa83a2c, this.hideFoes() ? 0.16 : 0.08);
      zone(this.me, 0xf6ecd8, 0x4a6b8a, 0.12);
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
        // a translucent cyan-grey cell per soldier: together they read as the formation's lattice
        g.fillStyle(color, a * 0.3);
        g.fillPoints(corners.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
        this.dashRect(g, corners, color, a, 1, 0);
      }
    };
    if (this.dragPreview) {
      const d = this.dragPreview;
      const slots = formationSlots({ type: d.type, cx: d.cx, cy: d.cy, fx: d.fx, fy: d.fy, frontage: d.frontage }, d.n);
      drawSlots(slots, d.fx, d.fy, 0x9fd8dc, 0.85);
      this.drawFacingKnob(this.knobG, d.cx, d.cy, d.fx, d.fy, 0xfff4c0, 0.95);
      this.placeDragLabel(d);
      return;
    }
    this.placeDragLabel(null);
    if (this.sim.phase === 'battle') this.drawMoveOrders(g);
    if (this.selGroup >= 0) {
      const grp = this.sim.groups[this.selGroup];
      if (!grp || grp.disbanded) return;
      const slots = this.sim.groupSlots(grp.id);
      drawSlots(slots, grp.formation.fx, grp.formation.fy, 0x7fa9a8, 0.6);
      // the facing arrow and its knob: drag the knob to turn the group
      const fr = this.canCommand() && this.sim.phase !== 'ended' ? this.selectedFrame() : null;
      if (fr) this.drawFacingKnob(this.knobG, fr.cx, fr.cy, fr.fx, fr.fy, 0xf6ecd8, 0.85);
    }
  }

  /**
   * Move orders as in the reference (docs/ART_STYLE.md §9): every man of ours
   * still walking to a distant slot gets a hollow order marker there (a
   * dotted dark diamond) and a thin dotted line back to him. The selected
   * group's lines are stronger.
   */
  private drawMoveOrders(g: Phaser.GameObjects.Graphics): void {
    let budget = 2400; // dots per frame, a ceiling for big armies on phones
    for (const grp of this.sim.groups) {
      if (grp.side !== this.me || grp.disbanded || grp.routed) continue;
      const sel = grp.id === this.selGroup;
      const r = rightOf(grp.formation.fx, grp.formation.fy);
      const { fx, fy } = grp.formation;
      for (const u of this.sim.activeMembers(grp.id)) {
        const v = this.viewById.get(u.id);
        if (!v || u.state !== 'ready') continue;
        const s = this.sim.slotPos(u);
        const ddx = s.x - u.x;
        const ddy = s.y - u.y;
        if (ddx * ddx + ddy * ddy < 0.8 * 0.8) continue;
        const t = isoToScreen(s.x, s.y);
        const tx = Math.round(t.x);
        const ty = Math.round(t.y);
        // the dotted line, from his feet to the marker
        const x0 = v.spr.x;
        const y0 = v.spr.y;
        const len = Math.max(Math.abs(tx - x0), Math.abs(ty - y0));
        const step = sel ? 2 : 3;
        g.fillStyle(0x9fc8c8, sel ? 0.8 : 0.45);
        for (let k = 4; k < len - 4 && budget > 0; k += step, budget--) g.fillRect(Math.round(x0 + ((tx - x0) * k) / len), Math.round(y0 + ((ty - y0) * k) / len), 1, 1);
        // the hollow marker: one cell, dotted dark outline
        const hw = 0.36;
        const hd = 0.4;
        const corners = [
          [s.x - r.x * hw + fx * hd, s.y - r.y * hw + fy * hd],
          [s.x + r.x * hw + fx * hd, s.y + r.y * hw + fy * hd],
          [s.x + r.x * hw - fx * hd, s.y + r.y * hw - fy * hd],
          [s.x - r.x * hw - fx * hd, s.y - r.y * hw - fy * hd],
        ].map(([x, y]) => {
          const p = isoToScreen(x, y);
          return [Math.round(p.x), Math.round(p.y)] as [number, number];
        });
        this.dashRect(g, corners, 0x2a2620, sel ? 0.7 : 0.45, 1, 1);
        budget -= 30;
      }
    }
  }

  /** A facing arrow from the front-rank centre to a round knob KNOB_PACES ahead (the turn handle). */
  private drawFacingKnob(g: Phaser.GameObjects.Graphics, cx: number, cy: number, fx: number, fy: number, color: number, a: number): void {
    const P = (along: number, side = 0) => {
      const r = rightOf(fx, fy);
      const p = isoToScreen(cx + fx * along + r.x * side, cy + fy * along + r.y * side);
      return { x: Math.round(p.x), y: Math.round(p.y) };
    };
    const a0 = P(0.7);
    const a1 = P(KNOB_PACES - 0.45);
    const k = P(KNOB_PACES);
    const h1 = P(KNOB_PACES - 1, 0.4);
    const h2 = P(KNOB_PACES - 1, -0.4);
    // a dark under-stroke keeps the arrow readable on light ground
    for (const [w, c, al] of [
      [3, 0x2a1d14, 0.6 * a],
      [1, color, a],
    ] as const) {
      g.lineStyle(w, c, al);
      g.lineBetween(a0.x, a0.y, a1.x, a1.y);
      g.lineBetween(h1.x, h1.y, a1.x, a1.y);
      g.lineBetween(h2.x, h2.y, a1.x, a1.y);
    }
    // the knob: a bronze disc in a dark rim, big enough to read as "grab me"
    g.fillStyle(0x2a1d14, 0.8 * a);
    g.fillCircle(k.x, k.y, 8);
    g.fillStyle(0xd9a441, a);
    g.fillCircle(k.x, k.y, 6);
    g.fillStyle(0xfff4c0, a);
    g.fillCircle(k.x - 1, k.y - 2, 2);
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
        const tt = k / n;
        g.fillRect(Math.round(x0 + (x1 - x0) * tt), Math.round(y0 + (y1 - y0) * tt), 1, 1);
      }
    }
  }

  // ===================================================================== events

  private handleEvents(events: SimEvent[]): void {
    const st = state.campaign.data.settings;
    battleAudio(this, this.sim, events, this.me);
    this.beasts?.events(events);
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          const u = this.sim.units[e.unit];
          if (e.dmg > 2 || Math.random() < 0.5) this.addBlood(u.x, u.y, false);
          if (this.fx.showNumbers) {
            const p = isoToScreen(u.x, u.y);
            this.fx.floatText(p.x, p.y - this.views[e.unit].tall - 6, `${Math.max(1, Math.round(e.dmg))}`, u.side === this.me ? 0xff8070 : 0xfff4d8);
          }
          if (u.side === this.me && this.time.now - this.lastHaptic > 120) {
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
          if (u.side === this.me) {
            hapticNotify('warning');
            if (st.pauseDeath) this.autoPause(t('battle.banner.fallen', { name: u.name }));
          }
          break;
        }
        case 'contact':
          if (e.side === this.me && st.pauseContact) this.autoPause(t('battle.banner.contact'), true);
          break;
        case 'flanked':
          if (e.side === this.me && st.pauseFlank) this.autoPause(t('battle.banner.flanked', { group: this.groupLabel(e.group) }));
          break;
        case 'rout':
          if (e.side === this.me) {
            hapticNotify('error');
            if (st.pauseRout) this.autoPause(t('battle.banner.routing', { group: this.groupLabel(e.group) }));
            else this.showBanner(t('battle.banner.routing', { group: this.groupLabel(e.group) }), 2500);
          } else this.showBanner(t('battle.banner.foeBreaks', { group: this.groupLabel(e.group) }), 2500);
          break;
        case 'ability':
          this.abilityFx(e.unit, e.ability, e.targets);
          break;
        case 'retreat':
          if (e.side === this.me) this.retreatMsg = e.caught > 0 ? t('battle.banner.retreatCaught', { n: e.caught }) : t('battle.banner.retreatSafe');
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
    return g ? groupName(g.name) : t('battle.group');
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
    const s = this.add.image(Math.round(p.x + 5), Math.round(p.y - 20), 'spark').setDepth(95000);
    this.world.add(s);
    this.tweens.add({ targets: s, alpha: 0, duration: 180, onComplete: () => s.destroy() });
  }

  /** Offline only: stop the battle so the player can react. Online the message just shows. */
  private autoPause(msg: string, always = false): void {
    if (this.tutorialData) return; // the tutorial pauses for itself
    if (this.online) {
      this.showBanner(msg, 2200);
      return;
    }
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
    // the winners strike their victory pose (a cosmetic picks which)
    this.victorySide = winner === 0 || winner === 1 ? winner : -1;
    const msg = this.retreatMsg ?? (winner === this.me ? t('battle.banner.victory') : winner === this.foe ? t('battle.banner.defeat') : t('battle.banner.draw'));
    this.showBanner(msg, 0);
    hapticNotify(winner === this.me ? 'success' : 'error');
    this.time.delayedCall(1800, () => this.finish());
  }

  private finish(): void {
    if (this.tutorialData) return; // the tutorial ends with its own reward screen
    lastBattle.stats = unitStats(this.sim);
    lastBattle.ticks = this.sim.tick;
    lastBattle.side = this.me;
    if (this.src) {
      this.src.onFinish(this.sim, this.deployOrders ?? 0);
      return;
    }
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
    state.last = { outcome, enemy: pending.enemy, fallen, partyId: pending.partyId, label: pending.label, ticks: this.sim.tick, stats: lastBattle.stats, before: lastBattle.heroes };
    state.pending = null;
    void state.save();
    this.scene.start('Results');
  }

  private confirmLeaveDeploy(): void {
    if (this.tutorial) return this.tutorial.askSkip();
    if (this.overlay) return;
    const c = confirmDialog(this, {
      title: t('battle.leave.title'),
      body: this.online ? t('battle.leave.online') : state.pending?.partyId !== undefined ? t('battle.leave.band') : t('battle.leave.skirmish'),
      ok: t('battle.leave.ok'),
      okIcon: 'back',
      cancel: t('common.stay'),
      onOk: () => this.leaveDeploy(),
    });
    this.overlay = c;
    c.once('destroy', () => this.overlay === c && (this.overlay = null));
  }

  /** Leave the deployment screen without fighting (back to the map or the army). */
  private leaveDeploy(): void {
    if (this.src) {
      this.src.onLeave();
      return;
    }
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
    if (u.side === this.me) haptic('heavy');
    switch (id) {
      case 'bash':
        for (const tg of targets) {
          const q = isoToScreen(this.sim.units[tg].x, this.sim.units[tg].y);
          this.fx.burst((p.x + q.x) / 2, (p.y + q.y) / 2 - 14, def.color, 10, { speed: 50, up: 25, life: 0.4 });
        }
        break;
      case 'berserk':
        this.fx.burst(p.x, p.y - 16, def.color, 18, { speed: 45, up: 30, life: 0.6, big: true });
        break;
      case 'volley':
        for (const tg of targets) {
          const q = isoToScreen(this.sim.units[tg].x, this.sim.units[tg].y);
          this.fx.burst(q.x, q.y - 16, def.color, 4, { speed: 20, up: 20, life: 0.4 });
        }
        break;
      case 'rally':
        this.fx.wave(p.x, p.y, 'steady', rallyRadius(u.stats));
        for (const tg of targets) {
          const q = isoToScreen(this.sim.units[tg].x, this.sim.units[tg].y);
          this.fx.sparkle(q.x, q.y - 22, def.color, 4);
        }
        break;
    }
    if (u.side === this.me) this.showBanner(t('battle.banner.ability', { name: u.name, ability: abilityName(id) }), 1100);
  }

  // ===================================================================== input

  /*
   * Touch controls (deployment and battle, also online raids and live duels):
   * - one finger on empty ground: a drag pans the camera (always, even with a
   *   group selected); a tap moves the selected group there (see tap());
   *   a long press in deployment explains the terrain;
   * - one finger on or near the selected group or its placement marker: a drag
   *   moves it (facing and shape kept); on the facing knob ahead of it: a drag
   *   turns it in place (src/ui/dragFormation.ts); a tap selects. The shape
   *   comes only from the formation buttons;
   * - two fingers: pinch zoom and pan, never an order (cancels a pending one).
   */
  private onDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    const down = this.input.manager.pointers.filter((q) => q.isDown);
    if (down.length >= 2) {
      // second finger: pinch/pan, cancel any formation drag
      this.cancelGesture();
      const [a, b] = down;
      this.pinch = { d0: Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y), z0: this.cameras.main.zoom, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      this.setFollow(false);
      return;
    }
    const grab = this.grabAt(p.x, p.y);
    // the facing knob wins over a ring button lying on it: a press there turns the group
    const ringOnly = over.length > 0 && !!this.ring && over.every((o) => (o as Phaser.GameObjects.GameObject & { parentContainer?: unknown }).parentContainer === this.ring);
    if ((over.length > 0 && !(ringOnly && grab === 'turn')) || this.overlay || this.hint) {
      this.gesture = null;
      return;
    }
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const g: NonNullable<Gesture> = { mode: 'pending', id: p.id, sx: p.x, sy: p.y, lx: p.x, ly: p.y, wx0: w.x, wy0: w.y, grab, drag: null };
    this.gesture = g;
    this.holdTimer?.remove();
    this.holdTimer = null;
    if (this.sim.phase === 'deploy' && !grab) {
      // long press on the ground in deployment: what is this terrain?
      this.holdTimer = holdTimer(this, longPress.ms, () => {
        if (this.gesture !== g || g.mode !== 'pending') return;
        g.mode = 'info';
        this.showTerrainInfo(g.wx0, g.wy0, g.sx, g.sy);
      });
    }
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
      const z = Phaser.Math.Clamp(this.pinch.z0 * (d / Math.max(1, this.pinch.d0)), camZoom(1), camZoom(3));
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
    if (g.mode === 'pending' && moved > DRAG_PX) {
      if (g.grab && this.selGroup >= 0 && this.canCommand()) {
        g.mode = 'formation';
        this.setFollow(false); // the field must stay put under the finger
        g.drag ??= this.startDrag(g, g.grab);
      } else {
        g.mode = 'pan';
      }
    }
    if (g.mode === 'pan') {
      this.setFollow(false);
      cam.scrollX -= (p.x - g.lx) / cam.zoom;
      cam.scrollY -= (p.y - g.ly) / cam.zoom;
      this.tutorialEvent({ kind: 'pan', px: Math.hypot(p.x - g.lx, p.y - g.ly) / RS });
    } else if (g.mode === 'formation' && g.drag) {
      const w = cam.getWorldPoint(p.x, p.y);
      const f = screenToIso(w.x, w.y);
      this.dragFeedback(dragMove(g.drag, f.x, f.y));
      this.updateDragPreview(g.drag);
    }
    g.lx = p.x;
    g.ly = p.y;
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (this.pinch) {
      const down = this.input.manager.pointers.filter((q) => q.isDown);
      if (down.length < 2) {
        const z0 = this.pinch.z0;
        this.pinch = null;
        this.setZoom(Math.round(zoomUnits(this.cameras.main.zoom)));
        if (Math.abs(this.cameras.main.zoom - z0) > 0.05) this.tutorialEvent({ kind: 'zoom' });
      }
      this.gesture = null;
      return;
    }
    const g = this.gesture;
    this.gesture = null;
    this.holdTimer?.remove();
    this.holdTimer = null;
    this.hideTerrainInfo();
    if (!g || p.id !== g.id) return;
    if (g.mode === 'pending') {
      this.dragPreview = null;
      this.tap(p);
    } else if (g.mode === 'formation' && g.drag) {
      const plan = dragPlan(g.drag);
      this.dragPreview = null;
      if (plan) {
        this.command({ kind: 'form', group: -1, cx: plan.cx, cy: plan.cy, fx: plan.fx, fy: plan.fy, frontage: plan.frontage });
        this.tutorialEvent({ kind: 'sling', carried: plan.kind === 'move', aimed: plan.kind === 'turn', fx: plan.fx, fy: plan.fy, group: this.selGroup });
      }
    }
  }

  private setZoom(z: number): void {
    const cam = this.cameras.main;
    const target = camZoom(Phaser.Math.Clamp(z, 1, 3));
    if (target !== cam.zoom) this.setFollow(false);
    this.tweens.add({ targets: cam, zoom: target, duration: 120 });
  }

  /** Drop any pending or half-done one-finger gesture (a second finger came down). */
  private cancelGesture(): void {
    this.gesture = null;
    this.dragPreview = null;
    this.holdTimer?.remove();
    this.holdTimer = null;
    this.hideTerrainInfo();
  }

  /**
   * What a press at this screen point grabs: the facing knob of the selected
   * group (turn), its soldiers or placement marker (move), or nothing. When
   * both are in reach, the closer one wins.
   */
  private grabAt(px: number, py: number): DragKind | null {
    if (this.selGroup < 0 || this.sim.phase === 'ended' || !this.canCommand()) return null;
    const grp = this.sim.groups[this.selGroup];
    if (!grp || grp.disbanded) return null;
    const cam = this.cameras.main;
    const d2 = (wx: number, wy: number) => ((wx - cam.worldView.x) * cam.zoom - px) ** 2 + ((wy - cam.worldView.y) * cam.zoom - py) ** 2;
    const solo = this.selUnit >= 0 && !grp.individual;
    const members = solo ? [this.sim.units[this.selUnit]] : this.sim.activeMembers(grp.id);
    const ids = new Set(members.map((u) => u.id));
    let body = Infinity;
    for (const v of this.views) if (ids.has(v.u.id)) body = Math.min(body, d2(v.spr.x, v.spr.y - v.tall / 2), d2(v.spr.x, v.spr.y));
    if (!solo) {
      for (const s of [...this.sim.groupSlots(grp.id), { x: grp.formation.cx, y: grp.formation.cy }]) {
        const w = isoToScreen(s.x, s.y);
        body = Math.min(body, d2(w.x, w.y));
      }
    }
    const k = this.knobOf();
    const kw = k ? isoToScreen(k.x, k.y) : null;
    const knob = kw ? d2(kw.x, kw.y) : Infinity;
    const r2 = GRAB_PX * GRAB_PX;
    if (knob < r2 && knob <= body) return 'turn';
    return body < r2 ? 'move' : null;
  }

  /** The selected group's (or soldier's) anchor and facing, its centre and its facing knob, in field coordinates. */
  private selectedFrame(): { cx: number; cy: number; fx: number; fy: number; px: number; py: number; frontage: number; n: number } | null {
    const grp = this.selGroup >= 0 ? this.sim.groups[this.selGroup] : null;
    if (!grp || grp.disbanded) return null;
    const f = grp.formation;
    if (this.selUnit >= 0 && !grp.individual) {
      const u = this.sim.units[this.selUnit];
      return { cx: u.x, cy: u.y, fx: f.fx, fy: f.fy, px: u.x, py: u.y, frontage: 1, n: 1 };
    }
    const slots = this.sim.groupSlots(grp.id);
    if (slots.length === 0) return null;
    const px = slots.reduce((a, q) => a + q.x, 0) / slots.length;
    const py = slots.reduce((a, q) => a + q.y, 0) / slots.length;
    return { cx: f.cx, cy: f.cy, fx: f.fx, fy: f.fy, px, py, frontage: f.frontage, n: slots.length };
  }

  /** Where the facing knob of the selected group stands (field), or null. */
  private knobOf(): { x: number; y: number } | null {
    const fr = this.selectedFrame();
    return fr ? { x: fr.cx + fr.fx * KNOB_PACES, y: fr.cy + fr.fy * KNOB_PACES } : null;
  }

  private startDrag(g: NonNullable<Gesture>, kind: DragKind): DragState {
    const fr = this.selectedFrame()!;
    const press = screenToIso(g.wx0, g.wy0);
    // thresholds are in paces at the default zoom (1: a pace is 36 px across a tile) and scale with zoom
    const k = 1 / zoomUnits(this.cameras.main.zoom);
    haptic('light');
    return dragStart(kind, fr, press.x, press.y, k);
  }

  /** Light haptic tick when the facing snaps to a straight field direction. */
  private dragFeedback(e: DragEvents): void {
    if (e.snapped) haptic('light');
  }

  /** Live preview of what lifting the finger would order (nothing = cancel). */
  private updateDragPreview(s: DragState): void {
    const grp = this.sim.groups[this.selGroup];
    const plan = dragPlan(s);
    if (!grp || !plan) {
      this.dragPreview = null;
      return;
    }
    const type = this.selUnit >= 0 && !grp.individual ? 'line' : grp.formation.type;
    const label = type === 'wedge' ? t('battle.cmd.wedge') : `${plan.files}x${plan.ranks}`;
    this.dragPreview = { cx: plan.cx, cy: plan.cy, fx: plan.fx, fy: plan.fy, frontage: plan.frontage, type, n: s.g.n, label };
  }

  /** The small "files x ranks" label ahead of the drag preview. */
  private placeDragLabel(d: { cx: number; cy: number; fx: number; fy: number; label: string } | null): void {
    if (!d) {
      this.dragLabel?.setVisible(false);
      return;
    }
    if (!this.dragLabel || !this.dragLabel.active) {
      this.dragLabel = addText(this, 0, 0, '', 'light', 0.5);
      this.tags.add(this.dragLabel);
    }
    const cam = this.cameras.main;
    const S = this.m.S;
    const w = isoToScreen(d.cx + d.fx * (KNOB_PACES + 1.2), d.cy + d.fy * (KNOB_PACES + 1.2));
    const sx = (w.x - cam.worldView.x) * cam.zoom;
    const sy = (w.y - cam.worldView.y) * cam.zoom;
    this.dragLabel.setText(d.label).setVisible(true);
    this.dragLabel.setPosition(Math.round(sx / S), Math.round(sy / S) - 8);
  }

  /**
   * One-time explanation of the touch controls (remembered in the settings).
   * It sits over the field and never blocks the panel: the first tap anywhere
   * dismisses it, and a tap on a button still presses that button.
   */
  private showGestureHint(): void {
    const st = state.campaign.data.settings;
    if (st.seenGestureHint || this.sim.phase !== 'deploy') return;
    const { VW, VH } = this.m;
    const w = Math.min(VW - 12, 200);
    const keys: TKey[] = ['battle.hint.sling', 'battle.hint.shape', 'battle.hint.pan'];
    const TOP = this.topH();
    const room = VH - this.panelHeight() - TOP - 10;
    let paras = keys.map((k) => wrapText(t(k), w - 14).lines);
    const height = () => 18 + paras.reduce((a, l) => a + l.length * LINE_H + 4, 0) + 12;
    while (paras.length > 1 && height() > room) paras = paras.slice(0, -1);
    const h = height();
    const c = this.add.container(0, 0);
    const x = Math.round((VW - w) / 2);
    const y = Math.max(TOP + 4, Math.round(TOP + (room - h) / 2));
    c.add(addPanel(this, x, y, w, h, 'parch'));
    c.add(addText(this, VW / 2, y + 6, t('battle.hint.title'), 'red', 0.5));
    let ty = y + 18;
    for (const lines of paras) {
      c.add(addText(this, x + 7, ty, lines.join('\n'), 'ink'));
      ty += lines.length * LINE_H + 4;
    }
    c.add(addText(this, VW / 2, y + h - 11, ellipsize(t('battle.hint.dismiss'), w - 8), 'dim', 0.5));
    this.ui.add(c);
    this.hint = c;
    const dismiss = () => {
      if (this.hint !== c) return;
      c.destroy();
      this.hint = null;
      st.seenGestureHint = true;
      void state.save();
    };
    this.input.once('pointerup', dismiss);
  }

  // ===================================================================== terrain

  /** Trees on wooded cells, boulders on rocks, glints on water: upright sprites sorted with the men. */
  private addTerrainProps(): void {
    this.props = [];
    this.glints = [];
    this.waterCells = [];
    const tr = this.sim.terrain;
    if (!tr) return;
    for (let v = 0; v < 3; v++) if (!this.textures.exists(`tree_${v}`)) this.textures.addCanvas(`tree_${v}`, renderTree(v).toCanvas());
    for (let v = 0; v < 2; v++) if (!this.textures.exists(`boulder_${v}`)) this.textures.addCanvas(`boulder_${v}`, renderBoulder(v).toCanvas());
    if (!this.textures.exists('glint')) this.textures.addCanvas('glint', renderGlint().toCanvas());
    if (!this.textures.exists('sparkle')) this.textures.addCanvas('sparkle', renderSparkle().toCanvas());
    const seed = this.sim.seed;
    const h = (a: number, b: number) => ((Math.imul(a + 1, 73856093) ^ Math.imul(b + 7, 19349663) ^ seed) >>> 0) % 1000 / 1000;
    const place = (key: string, fx: number, fy: number, tree: boolean) => {
      const p = isoToScreen(fx, fy);
      const img = this.add.image(Math.round(p.x), Math.round(p.y), key).setOrigin(0.5, tree ? TREE_GEOM.footY / TREE_GEOM.h : BOULDER_GEOM.footY / BOULDER_GEOM.h).setDepth(p.y);
      this.world.add(img);
      this.props.push({ img, x: p.x, y: p.y, tree });
    };
    for (let i = 0; i < tr.cells; i++) {
      const d = tr.cellDef(i);
      const c = tr.cellCenter(i);
      if (d.kind === 'forest') {
        // trees are big now: about two in three forest cells hold one, a few hold two
        const n = h(i, 1) < 0.12 ? 2 : h(i, 1) < 0.66 ? 1 : 0;
        for (let k = 0; k < n; k++) {
          const v = h(i, 10 + k) < 0.2 ? 2 : h(i, 20 + k) < 0.35 ? 1 : 0;
          place(`tree_${v}`, c.x + (h(i, 2 + k) - 0.5) * 0.7, c.y + (h(i, 4 + k) - 0.5) * 0.7, true);
        }
      } else if (d.kind === 'rocks') {
        place(`boulder_${i % 2}`, c.x + (h(i, 6) - 0.5) * 0.3, c.y + (h(i, 7) - 0.5) * 0.3, false);
      } else if (d.kind === 'water' || d.kind === 'sea') {
        this.waterCells.push(i);
      }
    }
    // a pool of shimmer sprites that hop between random spots on the water (docs/ART_STYLE.md §10)
    const n = Math.min(70, Math.ceil(this.waterCells.length * 0.8));
    for (let k = 0; k < n; k++) {
      const img = this.add.image(0, 0, k % 3 === 0 ? 'glint' : 'sparkle').setDepth(-99000).setAlpha(0);
      this.world.add(img);
      const g = { img, t0: 0, life: 0 };
      this.placeGlint(g, Math.random() * 900);
      this.glints.push(g);
    }
  }

  /** Move a shimmer sprite to a random spot on the water, starting after `delay` ms. */
  private placeGlint(g: { img: Phaser.GameObjects.Image; t0: number; life: number }, delay: number): void {
    const tr = this.sim.terrain;
    if (!tr || this.waterCells.length === 0) return;
    const cw = this.sim.width / tr.w;
    const ch = this.sim.height / tr.h;
    for (let tries = 0; tries < 4; tries++) {
      const i = this.waterCells[Math.floor(Math.random() * this.waterCells.length)];
      const c = tr.cellCenter(i);
      const x = c.x + (Math.random() - 0.5) * cw;
      const y = c.y + (Math.random() - 0.5) * ch;
      // keep off the shore: all four neighbours a little way out are water too
      const wet = (px: number, py: number) => {
        const k = tr.at(px, py).kind;
        return k === 'water' || k === 'sea';
      };
      if (![[0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35]].every(([dx, dy]) => wet(x + dx, y + dy))) continue;
      const p = isoToScreen(x, y);
      g.img.setPosition(Math.round(p.x), Math.round(p.y));
      break;
    }
    g.t0 = this.time.now + delay;
    g.life = 300 + Math.random() * 500;
  }

  /** Water shimmer (stepped), and trees fade when a soldier stands behind them. */
  private updateProps(): void {
    const now = this.time.now;
    for (const g of this.glints) {
      const a = (now - g.t0) / g.life;
      if (a > 1) this.placeGlint(g, Math.random() * 700);
      // stepped, never a smooth fade: half on, on, half on
      g.img.setAlpha(a < 0 || a > 1 ? 0 : a < 0.25 || a > 0.75 ? 0.5 : 0.95);
    }
    if (this.props.length === 0 || this.propTick++ % 4 !== 0) return;
    for (const pr of this.props) {
      if (!pr.tree) continue;
      let hidden = false;
      for (const v of this.views) {
        if (v.u.state === 'dead' || v.u.state === 'fled' || !v.spr.visible) continue;
        const dx = v.spr.x - pr.x;
        const dy = v.spr.y - pr.y;
        if (dy < 10 && dy > -72 && dx > -26 && dx < 26) {
          hidden = true;
          break;
        }
      }
      pr.img.setAlpha(hidden ? 0.4 : 1);
    }
  }

  private showTerrainInfo(wx: number, wy: number, sx: number, sy: number): void {
    this.hideTerrainInfo();
    const f = screenToIso(wx, wy);
    if (f.x < 0 || f.y < 0 || f.x > this.sim.width || f.y > this.sim.height) return;
    const d = this.sim.ground(f.x, f.y);
    const hgt = this.sim.heightAt(f.x, f.y);
    const name = tOr(`battle.ground.${d.kind}.name`, d.name);
    const desc = tOr(`battle.ground.${d.kind}.desc`, d.desc);
    const lines = hgt > 0 ? [d.kind === 'open' ? t('battle.terrain.high', { n: hgt }) : t('battle.terrain.highOf', { name, n: hgt })] : [name];
    if (hgt === 0 || d.kind !== 'open') lines.push(desc);
    if (hgt > 0) lines.push(t('battle.terrain.highRules', { n: Math.round(HEIGHT_RULES.meleeDown * 100) }));
    const { S, VW } = this.m;
    const c = this.add.container(0, 0);
    const w = Math.min(VW - 12, 200);
    const wrapped = lines.map((l) => wrapText(l, w - 12).lines);
    const h = wrapped.reduce((a, l) => a + l.length * LINE_H + 2, 8);
    const x = Phaser.Math.Clamp(Math.round(sx / S - w / 2), 6, VW - w - 6);
    const y = Math.max(this.topH() + 4, Math.round(sy / S - h - 18));
    c.add(addPanel(this, x, y, w, h, 'parch'));
    let ty = y + 5;
    wrapped.forEach((l, i) => {
      c.add(addText(this, x + 6, ty, l.join('\n'), i === 0 ? 'red' : 'ink'));
      ty += l.length * LINE_H + 2;
    });
    this.ui.add(c);
    this.infoTip = c;
    haptic('light');
  }

  private hideTerrainInfo(): void {
    this.infoTip?.destroy();
    this.infoTip = null;
  }

  private tap(p: Phaser.Input.Pointer): void {
    const cam = this.cameras.main;
    const w = cam.getWorldPoint(p.x, p.y);
    // a floating group tag (a map marker) selects its group
    const S = this.m.S;
    for (const [gid, pos] of this.tagPos) {
      if (Math.hypot(pos.x * S - p.x, pos.y * S - p.y) <= TAG_PX) {
        const g = this.sim.groups[gid];
        this.selGroup = gid;
        this.selUnit = g.individual ? this.sim.activeMembers(gid)[0]?.id ?? -1 : -1;
        haptic('light');
        this.buildHud();
        return;
      }
    }
    // nearest unit in screen space
    let best: SimUnit | null = null;
    let bestD = 30;
    const hide = this.hideFoes();
    for (const v of this.views) {
      const u = v.u;
      if (u.state === 'dead' || u.state === 'fled' || (hide && u.side === this.foe)) continue;
      const sx = (v.spr.x - cam.worldView.x) * cam.zoom;
      const sy = (v.spr.y - v.tall * 0.45 - cam.worldView.y) * cam.zoom;
      if (v.big) {
        // a horse is a long target: accept a touch anywhere on its body
        const dd = Math.sqrt((sx - p.x) ** 2 + ((sy - p.y) * 1.6) ** 2) * 0.7;
        if (dd < bestD) {
          bestD = dd;
          best = u;
        }
        continue;
      }
      const d = Math.sqrt((sx - p.x) ** 2 + (sy - p.y) ** 2);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    if (best && best.side === this.me) {
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
    if (best && best.side === this.foe) {
      if (this.selGroup >= 0 && this.canCommand() && this.sim.phase === 'battle') {
        this.attackUnit(best);
      } else {
        const h = this.enemyHeroes.find((x) => x.id === best!.heroId);
        const wpn = h?.equip.weapon ? itemName(h.equip.weapon.def) : t('battle.unarmed');
        this.showBanner(`${best.name} - ${wpn}`, 1800);
      }
      return;
    }
    if (this.selGroup >= 0 && this.canCommand()) {
      const grp = this.sim.groups[this.selGroup];
      const f = grp.formation;
      const fp = screenToIso(w.x, w.y);
      const face = this.faceEnemyFrom(fp.x, fp.y) ?? { x: f.fx, y: f.fy };
      this.command({ kind: 'form', group: -1, cx: fp.x, cy: fp.y, fx: face.x, fy: face.y, frontage: this.selUnit >= 0 && !grp.individual ? 1 : f.frontage });
      this.tutorialEvent({ kind: 'tapmove' });
    }
  }

  /**
   * Tap-to-move keeps the group's shape and turns it toward the nearest enemy
   * group as seen from the destination, so a move never leaves a flank or the
   * back to the enemy (the turn knob sets any other facing). Null: no enemy.
   */
  private faceEnemyFrom(x: number, y: number): { x: number; y: number } | null {
    if (this.hideFoes()) {
      // their positions are secret: face across the field toward their zone
      const z = this.sim.deployZone(this.foe);
      return { x: 0, y: (z.y0 + z.y1) / 2 > y ? 1 : -1 };
    }
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const g of this.sim.groups) {
      if (g.side === this.me || g.disbanded) continue;
      const mem = this.sim.activeMembers(g.id);
      if (mem.length === 0) continue;
      const cx = mem.reduce((a, u) => a + u.x, 0) / mem.length - x;
      const cy = mem.reduce((a, u) => a + u.y, 0) / mem.length - y;
      const d = Math.hypot(cx, cy);
      if (d > 1e-6 && d < bestD) {
        bestD = d;
        best = { x: cx / d, y: cy / d };
      }
    }
    return best;
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
    this.showBanner(t('battle.banner.attack', { name: target.name }), 1200);
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
      // (A duel cannot know the new group's id before the relay applies the detach: command the group.)
      if (!g.individual && !this.src?.lockstep) this.order({ kind: 'detach', unit: u.id });
      gid = u.group;
      this.selGroup = gid;
    }
    const withGroup = { ...o, group: gid } as Order;
    this.order(withGroup);
    haptic('medium');
    this.hudDirty = true;
    this.buildHud();
  }

  private firstPlayerGroup(): number {
    const g = this.sim.groups.find((x) => x.side === this.me && !x.disbanded && this.sim.activeMembers(x.id).length > 0);
    return g ? g.id : -1;
  }

  // ===================================================================== HUD

  setPaused(p: boolean): void {
    if (p && this.online) return; // online battles never pause
    this.paused = p;
    this.refreshStrip();
    this.hudDirty = true;
    if (!p && this.banner && this.bannerTimer === null && !this.netBanner) this.hideBanner();
  }

  private togglePause(): void {
    if (this.sim.phase !== 'battle' || this.online) return;
    this.setPaused(!this.paused);
  }

  /** A message under the top bar (ms = 0: stays until replaced or hidden). */
  showBanner(msg: string, ms: number): void {
    this.hideBanner();
    const { VW } = this.m;
    const c = this.add.container(0, 0);
    // under the top bar, in the hint's place (the hint hides while a banner shows)
    const left = 0;
    const maxW = VW - 60;
    const lines = wrapText(msg, maxW - 12, 2).lines;
    const w = Math.max(60, Math.min(maxW, Math.max(...lines.map((l) => measureText(l))) + 14));
    const sub = ms === 0 && this.paused && this.sim.phase === 'battle' ? wrapText(t('battle.banner.paused'), maxW - 12, 2, false, 6).lines : [];
    const subW = sub.length ? Math.max(...sub.map((l) => measureText(l, false, 6))) + 14 : 0;
    const bw = Math.min(maxW, Math.max(w, subW));
    const h = lines.length * LINE_H + 8 + sub.length * 8;
    const x = Math.round(left + (VW - left - bw) / 2);
    const y = this.topH() + 4;
    c.add(addPanel(this, x, y, bw, h, 'tooltip'));
    const txt = addText(this, x + bw / 2, y + 4, lines.join('\n'), 'gold', 0.5);
    txt.setCenterAlign();
    c.add(txt);
    if (sub.length) c.add(addText(this, x + bw / 2, y + 4 + lines.length * LINE_H, sub.join('\n'), 'dim', 0.5).setFontSize(6).setCenterAlign());
    this.ui.add(c);
    this.banner = c;
    this.hintPill?.setText('');
    this.sitKey = '';
    this.bannerTimer = ms > 0 ? this.time.delayedCall(ms, () => this.hideBanner()) : null;
  }

  hideBanner(): void {
    this.bannerTimer?.remove();
    this.bannerTimer = null;
    this.banner?.destroy();
    this.banner = null;
    this.sitKey = '';
  }

  buildHud(): void {
    this.hud.removeAll(true);
    this.cards = [];
    this.abilityBtns = [];
    this.followBtn = null;
    this.cmdBtns.clear();
    this.tabBtns.clear();
    this.heroInfo = null;
    this.countdown = null;
    this.top = null;
    this.hintPill = null;
    this.ring = null;
    this.sitKey = '';
    this.buildSheet();
    this.buildTop();
    this.buildMedallions();
    if (this.shapeOpen) this.buildShapeSheet();
    // the selected soldier: who he is and how he fares, just above the sheet
    const u = this.selUnit >= 0 ? this.sim.units[this.selUnit] : null;
    if (u) this.buildHeroInfo(u, this.stripTop() - 27);
    this.hudDirty = true;
    this.refreshHud();
    this.tutorialEvent({ kind: 'hud' });
  }

  // ---- the top bar (Pause / Speed / clock / Retreat, the two armies' strength) and the hint under it

  /** Height of the top bar: where the field begins. */
  private topH(): number {
    return TOP_H;
  }

  /** Top edge of the bottom sheet. */
  private stripTop(): number {
    return this.m.VH - this.sheetH();
  }

  private buildTop(): void {
    const { VW } = this.m;
    this.top = new TopBar(this, VW, this.topOpts());
    this.hud.add(this.top);
    // following the fight: a small eye at the field's top right (battle only)
    const pillW = VW - 2 * 30;
    if (this.sim.phase === 'battle' && !this.online) {
      const fb = new Button(this, VW - 26, TOP_H + 4, 22, 22, { icon: 'eye', iconOnly: true, label: this.follow ? t('battle.strip.follow') : t('battle.strip.watch'), style: this.follow ? 'buttonSel' : undefined, tip: t('battle.tip.follow'), id: 'battle.follow', onClick: () => this.toggleFollow() });
      this.hud.add(fb);
      this.followBtn = fb;
    }
    this.hintPill = new HintPill(this, VW / 2, TOP_H + 4, pillW);
    this.hud.add(this.hintPill);
    if (this.dclock && this.sim.phase === 'deploy') {
      // the online deployment's draining bar along the top bar's bottom edge
      const bar = this.add.graphics();
      this.hud.add(bar);
      this.countdown = { bar, shown: -1 };
      this.updateCountdown();
    }
  }

  private topOpts(): TopBarOpts {
    const deploy = this.sim.phase === 'deploy';
    const ended = this.sim.phase === 'ended';
    if (deploy) {
      return {
        left: { icon: 'back', label: t('battle.strip.leave'), tip: t('battle.tip.leave'), id: 'battle.leave', onClick: () => this.confirmLeaveDeploy() },
        right: { icon: 'people', label: t('battle.strip.men'), tip: t('battle.tip.groups'), id: 'battle.groups', onClick: () => this.openGroups() },
      };
    }
    const flee: StripSlot = { icon: 'flag', label: t('battle.strip.flee'), tip: t('battle.tip.retreat'), id: 'battle.retreat', off: ended ? t('battle.why.over') : undefined, destructive: !ended, onClick: () => this.openRetreat() };
    if (this.online) {
      return {
        left: { icon: 'eye', label: this.follow ? t('battle.strip.follow') : t('battle.strip.watch'), selected: this.follow, tip: t('battle.tip.follow'), id: 'battle.follow', onClick: () => this.toggleFollow() },
        right: flee,
      };
    }
    return {
      left: this.paused
        ? { icon: 'play', label: t('battle.strip.play'), tip: t('battle.tip.pause'), id: 'battle.play', off: ended ? t('battle.why.over') : undefined, onClick: () => this.togglePause() }
        : { icon: 'pause', label: t('battle.strip.pause'), tip: t('battle.tip.pause'), id: 'battle.pause', off: ended ? t('battle.why.over') : undefined, onClick: () => this.togglePause() },
      mid: { icon: 'fast', label: `${this.speed}×`, selected: this.speed > 1, tip: t('battle.tip.speed'), id: 'battle.speed', off: ended ? t('battle.why.over') : undefined, onClick: () => this.toggleSpeed() },
      right: flee,
      // paused, Play is the one thing to do next
      primary: this.paused && !ended ? 'left' : undefined,
    };
  }

  /** Swap the top bar's actions (pause / play, speed) without rebuilding the HUD. */
  private refreshStrip(): void {
    this.top?.set(this.topOpts());
    if (this.online && this.top?.buttons.left) this.followBtn = this.top.buttons.left;
  }

  /** The sentence, the clock and the strength row for this moment (rebuilt only when they change). */
  private refreshSituation(): void {
    if (!this.top || !this.hintPill) return;
    const sim = this.sim;
    const deploy = sim.phase === 'deploy';
    let sentence: string;
    let urgent = false;
    const mine = sim.units.filter((u) => u.side === this.me && sim.isAlive(u)).length;
    if (deploy) {
      sentence = this.src?.lockstep ? t('battle.sit.deployDuel') : this.src ? t('battle.sit.deployHidden') : t('battle.sit.deploy');
      const groups = sim.groups.filter((g) => g.side === this.me && !g.disbanded && !g.individual && sim.members(g.id).length > 0).length;
      const words = [t('battle.num.groups', { n: groups })];
      if (!this.hideFoes()) words.push(t('battle.num.foes', { n: this.enemyHeroes.length }));
      this.top.setRow({ text: words.join(' · ') });
      if (!this.dclock) this.top.setTime(`${mine}`, t('strat.menWord', { n: mine }));
    } else {
      const ours = Math.round((100 * sim.sideStrength(this.me)) / this.initialStrength[this.me]);
      const theirs = Math.round((100 * sim.sideStrength(this.foe)) / this.initialStrength[this.foe]);
      const sel = this.selGroup >= 0 ? sim.groups[this.selGroup] : null;
      const engaged = sim.units.some((u) => u.side === this.me && u.state === 'ready' && u.engaged);
      if (sim.phase === 'ended') sentence = t('battle.sit.ended');
      else if (this.paused) {
        sentence = t('battle.sit.paused');
        urgent = true;
      } else if (engaged && ours - theirs > 25) sentence = t('battle.sit.winning');
      else if (engaged && theirs - ours > 25) {
        sentence = t('battle.sit.losing');
        urgent = true;
      } else if (engaged) sentence = t('battle.sit.contact', { ours, theirs });
      else if (sel && !sel.disbanded && sim.activeMembers(sel.id).length > 0) {
        const numeral = this.cards.find((c) => c.gid === sel.id)?.numeral ?? '';
        const name = sel.individual ? sim.members(sel.id)[0]?.name ?? '' : `${groupName(sel.name)} ${numeral}`.trim();
        sentence = t('battle.sit.marching', { group: name, order: sel.routed ? t('battle.order.routed') : t(`battle.order.${sel.order}` as TKey) });
      } else sentence = this.online ? t('battle.sit.online') : t('battle.sit.quiet');
      this.top.setTime(fmtClock(Math.floor(sim.tick / TICK_RATE)), this.speed > 1 ? t('battle.num.fast') : this.online ? t('battle.strip.live') : t('battle.top.time'));
      this.top.setRow({ ours, theirs, you: t('battle.top.you'), foe: t('battle.top.foe') });
    }
    const key = `${sentence}|${urgent}`;
    if (key === this.sitKey) return;
    this.sitKey = key;
    // a banner (Paused, a message) sits where the hint goes: the hint waits
    this.hintPill.setText(this.banner ? '' : sentence, urgent);
  }

  /** Online deployment: seconds left in the top bar's clock and the draining bar. */
  private updateCountdown(): void {
    const c = this.countdown;
    const d = this.dclock;
    if (!c || !d) return;
    const s = secondsLeft(d);
    const hot = urgent(d);
    if (s !== c.shown) {
      c.shown = s;
      this.top?.setTime(`${s}`, t('battle.top.deploy'), hot);
      if (hot && s !== this.lastTickSound && s > 0) {
        this.lastTickSound = s;
        sfx.play('tap');
        haptic('light');
      }
    }
    const { VW } = this.m;
    const f = d.total > 0 ? d.left / d.total : 0;
    c.bar.clear();
    c.bar.fillStyle(0x0d0a08, 0.8);
    c.bar.fillRect(4, TOP_H - 3, VW - 8, 2);
    c.bar.fillStyle(hot && Math.floor(this.time.now / 250) % 2 ? 0xe05040 : TERRA.hi, 1);
    c.bar.fillRect(4, TOP_H - 3, Math.round((VW - 8) * f), 2);
  }

  // ---- the bottom sheet: group cards, then the orders (battle) or Fight (deployment)

  /** Group cards in the sheet: two per row, at most two rows. */
  private sheetGroups(): { g: Battle['groups'][number]; numeral: string }[] {
    const deploy = this.sim.phase === 'deploy';
    const groups = this.sim.groups.filter((g) => g.side === this.me && !g.disbanded && (this.sim.members(g.id).length > 0 || deploy) && !g.individual);
    const indiv = this.sim.groups.filter((g) => g.side === this.me && g.individual && !g.disbanded && this.sim.activeMembers(g.id).length > 0);
    return [...groups.map((g, i) => ({ g, numeral: ROMAN[i] ?? `${i + 1}` })), ...indiv.map((g) => ({ g, numeral: '*' }))].slice(0, 4);
  }

  private cardRows(): number {
    return Math.max(1, Math.ceil(this.sheetGroups().length / 2));
  }

  /** Height of the bottom sheet. */
  private sheetH(): number {
    const cards = this.cardRows() * (SHEET_CARD_H + SIZE.gap) - SIZE.gap;
    return 5 + cards + 4 + SHEET_HEAD_H + SHEET_ORDERS_H + 5;
  }

  private buildSheet(): void {
    const { VW, VH } = this.m;
    const deploy = this.sim.phase === 'deploy';
    const y0 = this.stripTop();
    this.hud.add(addPanel(this, -2, y0, VW + 4, VH - y0 + 4, 'parch'));
    // cards
    const cw = Math.floor((VW - 8 - SIZE.gap) / 2);
    const all = this.sheetGroups();
    all.forEach(({ g, numeral }, i) => {
      const card = new GroupCard(
        this,
        4 + (i % 2) * (cw + SIZE.gap),
        y0 + 5 + Math.floor(i / 2) * (SHEET_CARD_H + SIZE.gap),
        all.length === 1 ? VW - 8 : cw,
        SHEET_CARD_H,
        () => {
          if (this.selGroup === g.id && this.selUnit < 0) this.selGroup = -1;
          else this.selGroup = g.id;
          this.selUnit = g.individual ? this.sim.members(g.id)[0]?.id ?? -1 : -1;
          this.shapeOpen = false;
          this.buildHud();
        },
        () => this.cardTip(g.id, numeral),
      );
      uiId(card, `battle.group.${numeral}`);
      this.hud.add(card);
      this.cards.push({ gid: g.id, card, numeral });
    });
    // the header: whose orders, and the chips (shape, reset / solo / join)
    let y = y0 + 5 + this.cardRows() * (SHEET_CARD_H + SIZE.gap) - SIZE.gap + 4;
    const sel = this.selGroup >= 0 ? this.sim.groups[this.selGroup] : null;
    const numeral = sel ? this.cards.find((c) => c.gid === sel.id)?.numeral ?? '' : '';
    const selName = sel ? (sel.individual ? this.sim.members(sel.id)[0]?.name ?? '' : `${groupName(sel.name)} ${numeral}`.trim()) : '';
    const chips: { icon: string; label: string; tip: string; id: string; selected?: boolean; off?: string; onClick: () => void }[] = [];
    const shapeOf = sel && !sel.disbanded ? sel.formation.type : null;
    const preset = PRESETS.find((p) => p[0] === shapeOf);
    chips.push({
      icon: preset ? preset[2] : 'f_line',
      label: preset ? t('battle.orders.formation', { shape: t(`battle.cmd.${preset[1]}` as TKey) }) : t('battle.shape.chip'),
      selected: this.shapeOpen,
      off: sel && this.canCommand() ? undefined : t('battle.why.noGroup'),
      tip: t('battle.tip.cat.formation'),
      id: 'battle.cat.formation',
      onClick: () => this.openCategory('formation'),
    });
    if (deploy && !this.online) chips.push({ icon: 'repair', label: t('battle.strip.reset'), tip: t('battle.tip.reset'), id: 'battle.reset', onClick: () => this.resetDeploy() });
    const u = !deploy && this.selUnit >= 0 ? this.sim.units[this.selUnit] : null;
    if (u && this.sim.groups[u.group].individual) chips.push({ icon: 'people', label: t('battle.ring.join'), tip: t('battle.tip.join'), id: 'battle.cmd.join', onClick: () => this.rejoin(u) });
    else if (u) chips.push({ icon: 'detach', label: t('battle.ring.solo'), tip: t('battle.tip.solo'), id: 'battle.cmd.solo', onClick: () => this.detach(u) });
    let cx = VW - 4;
    for (const c of chips.reverse()) {
      const w = Math.min(96, measureText(c.label, false, 6) + 26);
      cx -= w;
      const b = new Button(this, cx, y - 1, w, SHEET_HEAD_H, { icon: c.icon, label: c.label, tip: c.tip, id: c.id, style: c.selected ? 'buttonSel' : undefined, disabledReason: c.off, onClick: c.onClick, small: true });
      if (c.off) b.setEnabled(false, c.off);
      this.hud.add(b);
      if (c.id === 'battle.cat.formation') this.tabBtns.set('formation', b);
      if (c.id === 'battle.cmd.join' || c.id === 'battle.cmd.solo') this.cmdBtns.set(c.id.slice('battle.cmd.'.length), b);
      cx -= SIZE.gap;
    }
    const title = deploy ? t('battle.shape.chip') : sel ? t('battle.orders.title', { group: selName }) : '';
    if (title) {
      const ht = addText(this, 6, y + 2, ellipsize(title.toUpperCase(), cx - 10, false, 5.5, 'head'), 'head', 0).setFontSize(5.5);
      this.hud.add(ht);
    }
    y += SHEET_HEAD_H + 3;
    // the row: Fight (deployment) or the five orders (battle)
    if (deploy) {
      const ready = this.dclock?.ready ?? false;
      const main: StripSlot = this.online
        ? { icon: 'check', label: t('battle.ready'), selected: ready, off: ready ? t('battle.why.waiting') : undefined, tip: t(this.src?.lockstep ? 'battle.tip.readyDuel' : 'battle.tip.ready'), id: 'battle.ready', onClick: () => this.startFight() }
        : { icon: 'swords', label: t('battle.fight'), tip: t('battle.tip.fight'), id: 'battle.fight', onClick: () => this.startFight() };
      const fight = new Button(this, 4, y, VW - 8, SHEET_ORDERS_H - 2, { icon: main.icon, label: main.label, tip: main.tip, id: main.id, variant: main.selected ? 'secondary' : 'primary', style: main.selected ? 'buttonSel' : undefined, disabledReason: main.off, onClick: main.onClick, inline: true });
      if (main.off) fight.setEnabled(false, main.off);
      this.hud.add(fight);
      return;
    }
    const orders = this.ringOrders();
    if (!orders.length) {
      const hint = addText(this, VW / 2, y + 9, t('battle.orders.none'), 'dim', 0.5).setFontSize(6);
      this.hud.add(hint);
      return;
    }
    const n = orders.length;
    const bw = Math.floor((VW - 8 - SIZE.gap * (n - 1)) / n);
    orders.forEach((o, i) => {
      const b = new Button(this, 4 + i * (bw + SIZE.gap), y, bw, SHEET_ORDERS_H, {
        icon: o.icon,
        label: o.label,
        tip: o.tip,
        id: `battle.cmd.${o.key}`,
        style: o.selected ? 'buttonSel' : undefined,
        disabledReason: o.off,
        onClick: () => o.onTap(),
      });
      if (o.off) b.setEnabled(false, o.off);
      this.hud.add(b);
      this.cmdBtns.set(o.key, b);
    });
    this.ringKey = this.ordersKey();
  }

  /** What the order row shows (rebuilt when it changes: orders are rare events). */
  private ordersKey(): string {
    const sel = this.selGroup >= 0 ? this.sim.groups[this.selGroup] : null;
    return sel ? `${sel.order}|${sel.fireAtWill}|${this.selectedUnits().length > 0}|${sel.formation.type}` : '';
  }

  // ---- abilities: medallions down the field's right edge

  /** The heroes' abilities the selection can use, and the war horn. */
  private abilityDefs(): { key: string; icon: string; label: string; tip: string; sub: string; run: () => void; ability?: AbilityId }[] {
    if (this.sim.phase === 'deploy') return [];
    const ids: AbilityId[] = [];
    for (const u of this.selectedUnits()) for (const id of u.abil) if (!ids.includes(id)) ids.push(id);
    const cmds: ReturnType<BattleScene['abilityDefs']> = ids.slice(0, 5).map((id) => ({ key: id, icon: ABILITIES[id].icon, label: abilityName(id), sub: tOr(`battle.effect.${id}`, ''), tip: tOr(`ability.${id}.desc`, ABILITIES[id].desc), run: () => this.useAbility(id), ability: id }));
    if (this.sim.horns[this.me] > 0 && this.sim.phase === 'battle') cmds.unshift({ key: 'horn', icon: 'horn', label: t('battle.horn'), sub: t('battle.effect.horn'), tip: t('battle.horn.tip'), run: () => this.blowHorn() });
    return cmds.slice(0, 5);
  }

  private buildMedallions(): void {
    const defs = this.abilityDefs();
    if (!defs.length) return;
    const { VW } = this.m;
    const x = VW - MED_W - 2;
    let y = TOP_H + (this.followBtn && !this.online ? 30 : 6);
    const bottom = this.stripTop() - (this.selUnit >= 0 ? 29 : 2);
    const tabs = this.tabBtns;
    for (const d of defs) {
      if (y + MED_H > bottom) break;
      const m = new Medallion(this, x, y, { icon: d.icon, label: d.label, sub: d.sub, tip: d.tip, id: `battle.cmd.${d.key}`, onClick: d.run });
      this.hud.add(m);
      this.cmdBtns.set(d.key, m);
      if (d.ability) this.abilityBtns.push({ id: d.ability, btn: m });
      y += MED_H + 4;
    }
    // the tutorial lights the first ability when it asks for one
    const first = this.cmdBtns.get(defs[0].key);
    if (!tabs.has('abilities') && first) tabs.set('abilities', first);
  }

  // ---- the radial ring (no longer shown: the orders live in the bottom sheet)


  /** Orders the ring offers the selection, with their state now. */
  private ringOrders(): RadialOrder[] {
    const sel = this.selGroup >= 0 ? this.sim.groups[this.selGroup] : null;
    if (!sel || this.sim.phase !== 'battle') return [];
    const mem = this.selectedUnits();
    const can = mem.length > 0;
    const why = can ? undefined : t('battle.why.noMen');
    const order = (o: 'hold' | 'advance' | 'charge' | 'fallback') => () => this.command({ kind: 'order', group: -1, order: o });
    const shooters = mem.filter((u) => u.stats.range > 0);
    const ammo = shooters.some((u) => u.ammo > 0);
    const shootWhy = why ?? (shooters.length === 0 ? t('battle.why.noMissiles') : !ammo ? t('battle.why.outOfAmmo') : undefined);
    const orders: RadialOrder[] = [
      { key: 'advance', icon: 'advance', label: t('battle.ring.advance'), tip: t('battle.tip.radialAdvance'), selected: sel.order === 'advance', off: why, onTap: order('advance') },
      { key: 'charge', icon: 'charge', label: t('battle.ring.charge'), tip: t('battle.tip.radialCharge'), selected: sel.order === 'charge', off: why, onTap: order('charge') },
      { key: 'hold', icon: 'hold', label: t('battle.ring.hold'), tip: t('battle.tip.radialHold'), selected: sel.order === 'hold', off: why, onTap: order('hold') },
      { key: 'loose', icon: 'throw', label: t('battle.ring.shoot'), tip: t('battle.tip.radialShoot'), selected: sel.fireAtWill && ammo, off: shootWhy, onTap: () => this.toggleThrow() },
      { key: 'fallback', icon: 'fallback', label: t('battle.ring.back'), tip: t('battle.tip.radialBack'), selected: sel.order === 'fallback', off: why, onTap: order('fallback') },
    ];
    return orders;
  }


  /** Where the ring may sit: the field between the left column, the chrome and the tutorial's narrator. */
  private ringBounds(): { x0: number; y0: number; x1: number; y1: number } {
    const { VW } = this.m;
    let y0 = this.topH();
    let y1 = this.stripTop() - (this.selUnit >= 0 ? 27 : 0);
    const n = this.tutorial?.narratorRect();
    if (n) {
      if (n.y + n.h / 2 < this.m.VH / 2) y0 = Math.max(y0, n.y + n.h);
      else y1 = Math.min(y1, n.y);
    }
    return { x0: 4, y0, x1: VW - 4 - MED_W, y1 };
  }

  /** The selected group's centre on screen -> the ring (every frame; hidden while a finger pans or drags). */
  private placeRing(): void {
    const r = this.ring;
    if (!r) return;
    const busy = !!this.pinch || (!!this.gesture && this.gesture.mode !== 'pending') || !!this.overlay || this.ringHidden;
    r.setShown(!busy);
    if (busy) return;
    const mem = this.selUnit >= 0 ? [this.sim.units[this.selUnit]] : this.sim.activeMembers(this.selGroup);
    if (!mem.length) return;
    const cam = this.cameras.main;
    const S = this.m.S;
    let cx = 0;
    let cy = 0;
    for (const u of mem) {
      cx += u.x;
      cy += u.y;
    }
    cx /= mem.length;
    cy /= mem.length;
    const c = isoToScreen(cx, cy);
    // the ring sits a little behind the group (against its facing) so its buttons leave the facing knob clear
    const fr = this.selectedFrame();
    let ox = 0;
    let oy = 0;
    if (fr) {
      const f = isoToScreen(cx + fr.fx, cy + fr.fy);
      const dx = f.x - c.x;
      const dy = f.y - c.y;
      const l = Math.hypot(dx, dy) || 1;
      ox = (-dx / l) * 22;
      oy = (-dy / l) * 22;
    }
    if (this.tutorial) r.setBounds(this.ringBounds());
    r.place(((c.x - cam.worldView.x) * cam.zoom) / S + ox, ((c.y - 10 - cam.worldView.y) * cam.zoom) / S + oy);
  }

  /** The shape sheet (deployment and battle): five shapes with one line of meaning each. */
  private buildShapeSheet(): void {
    const { VW } = this.m;
    const sel = this.selGroup >= 0 ? this.sim.groups[this.selGroup] : null;
    if (!sel) return;
    const mem = this.selectedUnits();
    const x = 4;
    const w = VW - 8;
    const rowH = this.compact ? 22 : 24;
    const h = 16 + PRESETS.length * (rowH + SIZE.gap) - SIZE.gap + 6;
    this.hideBanner();
    const y = this.stripTop() - h - 2;
    const c = this.add.container(0, 0);
    this.hud.add(c);
    c.add(addPanel(this, x, y, w, h, 'parch'));
    const numeral = this.cards.find((k) => k.gid === sel.id)?.numeral ?? '';
    const title = addText(this, x + 6, y + 5, ellipsize(t('battle.shape.title', { numeral, name: sel.individual ? this.sim.members(sel.id)[0]?.name ?? '' : groupName(sel.name) }), w - 12), 'red');
    c.add(title);
    let ry = y + 16;
    for (const [type, key, icon] of PRESETS) {
      const wallOff = type === 'shieldwall' && !mem.some((u) => u.stats.canShieldWall) ? t('battle.why.noShields') : undefined;
      const row = new ListRow(
        this,
        x + 4,
        ry,
        w - 8,
        {
          icon,
          label: t(`battle.cmd.${key}` as TKey),
          sub: this.compact ? undefined : t(`battle.shape.${type}` as TKey),
          primary: sel.formation.type === type,
          off: wallOff,
          tip: t(`battle.tip.${key}` as TKey),
          id: `battle.cmd.form_${type}`,
          onClick: () => {
            this.command({ kind: 'preset', group: -1, type });
            this.shapeOpen = false;
            this.buildHud();
          },
        },
        rowH,
      );
      c.add(row);
      this.cmdBtns.set(`form_${type}`, row);
      ry += rowH + SIZE.gap;
    }
  }

  /** Open or close the shape sheet (the other categories have no sheet: orders live on the ring, abilities in their row). */
  openCategory(cat: BattleCategory | null): void {
    if (cat === 'formation') this.shapeOpen = !this.shapeOpen;
    else this.shapeOpen = false;
    this.buildHud();
  }

  private blowHorn(): void {
    this.order({ kind: 'horn' });
    haptic('heavy');
    this.showBanner(t('battle.banner.horn'), 1400);
    this.hudDirty = true;
    this.buildHud();
  }

  /** Throw / loose at will: toggles; says so when nobody is in range yet. */
  private toggleThrow(): void {
    const sel = this.selGroup >= 0 ? this.sim.groups[this.selGroup] : null;
    if (!sel) return;
    const turningOn = !sel.fireAtWill;
    this.command({ kind: 'loose', group: -1 });
    if (turningOn && this.sim.phase === 'battle' && !this.missileTargetInRange()) toast(this, t('battle.why.noneInRange'));
  }

  private missileTargetInRange(): boolean {
    for (const s of this.selectedUnits()) {
      if (s.ammo <= 0 || s.stats.range <= 0) continue;
      for (const e of this.sim.units) {
        if (e.side === s.side || e.state !== 'ready') continue;
        if (Math.hypot(e.x - s.x, e.y - s.y) <= s.stats.range + this.sim.rangeBonus(s, e)) return true;
      }
    }
    return false;
  }

  private cardTip(gid: number, numeral: string): string {
    const g = this.sim.groups[gid];
    const n = this.sim.activeMembers(gid).length;
    const name = g.individual ? this.sim.members(gid)[0]?.name ?? '' : groupName(g.name);
    return t('battle.card.tip', { numeral, name, men: t('battle.men', { n }), order: t(`battle.order.${g.order}` as TKey), formation: t(`battle.formation.${g.formation.type}` as TKey) });
  }

  private portraitOf(gid: number): string | null {
    const lead = this.sim.activeMembers(gid)[0] ?? this.sim.members(gid)[0];
    if (!lead) return null;
    return ensurePortrait(this, dollFromHero(this.views[lead.id].hero));
  }

  /** The selected soldier: portrait, name and level, weapon, and health / morale / stamina columns. */
  private buildHeroInfo(u: SimUnit, y: number): void {
    const { VW } = this.m;
    const c = this.add.container(0, 0);
    // across the field's foot, just above the sheet
    const x = 4;
    const w = VW - 4 - x;
    c.add(addPanel(this, x, y, w, 24, 'parch'));
    const hero = this.views[u.id].hero;
    c.add(this.add.image(x + 2, y + 2, ensurePortrait(this, dollFromHero(hero))).setOrigin(0, 0).setCrop(3, 0, 18, 20));
    // the portrait framed in the colour of his finest piece of gear (rare and up pulse)
    const best = this.views[u.id].fx?.rank ?? 0;
    if (best >= 1) {
      const rf = this.add.graphics();
      rf.lineStyle(1, RARITY_COLOR[RARITIES[best]], 1);
      rf.strokeRect(x + 4.5, y + 1.5, 19, 21);
      c.add(rf);
      if (best >= 2) this.tweens.add({ targets: rf, alpha: { from: 0.45, to: 1 }, duration: best >= 4 ? 600 : 1000, yoyo: true, repeat: -1 });
    }
    const colW = Math.max(18, ...(['hp', 'mor', 'sta'] as const).map((k) => measureText(t(`battle.stat.${k}`)) + 2));
    const mx = x + w - 4 - 3 * colW - 4;
    const textW = mx - 4 - (x + 22);
    c.add(addText(this, x + 22, y + 3, ellipsize(`${u.name} ${t('battle.lv', { n: u.level })}`, textW), 'red'));
    c.add(addText(this, x + 22, y + 13, ellipsize((hero.equip.weapon ? itemName(hero.equip.weapon.def) : t('battle.unarmed')), textW), 'dim'));
    const colors = [P.bad, P.blue, P.good];
    const meters = (['hp', 'mor', 'sta'] as const).map((k, i) => {
      const cx = mx + i * (colW + 2);
      c.add(addText(this, cx + colW / 2, y + 3, t(`battle.stat.${k}`), 'dim', 0.5));
      return new Meter(this, cx, y + 14, colW, 5, colors[i]);
    });
    c.add(meters);
    c.setData('meters', meters);
    c.setData('unit', u.id);
    this.hud.add(c);
    this.heroInfo = c;
  }

  private refreshHud(): void {
    this.hudDirty = false;
    this.refreshSituation();
    for (const c of this.cards) {
      const g = this.sim.groups[c.gid];
      const mem = this.sim.activeMembers(c.gid);
      const all = this.sim.members(c.gid);
      const hp = all.reduce((a, u) => a + Math.max(0, u.state === 'ready' || u.state === 'routing' ? u.hp : 0), 0) / Math.max(1, all.reduce((a, u) => a + u.stats.maxHp, 0));
      const mo = mem.reduce((a, u) => a + u.morale / Math.max(1, u.stats.morale), 0) / Math.max(1, mem.length);
      c.card.setInfo({
        numeral: c.numeral,
        men: mem.length,
        hp,
        morale: mem.length ? mo : 0,
        orderIcon: g.routed ? 'flag' : g.shieldWall ? 'wall' : g.order,
        name: g.individual ? this.sim.members(c.gid)[0]?.name : groupName(g.name),
        shortName: g.individual ? undefined : groupName(g.name, true),
        orderWord: g.routed ? t('battle.order.routed') : this.sim.phase === 'deploy' ? t(`battle.formation.${g.formation.type}` as TKey) : t(`battle.order.${g.order}` as TKey),
        orderShort: g.routed ? t('battle.orderShort.routed') : this.sim.phase === 'deploy' ? t(`battle.formationShort.${g.formation.type}` as TKey) : t(`battle.orderShort.${g.order}` as TKey),
        portrait: this.portraitOf(c.gid),
        selected: this.selGroup === c.gid,
        routed: g.routed,
      });
    }
    // the order row shows the order in force: rebuild when that changes (orders are rare events)
    if (this.sim.phase === 'battle' && this.ordersKey() !== this.ringKey) {
      this.buildHud();
      return;
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

  /** Floating group tags above each player group (a tap near one selects it, see tap()). */
  private updateTags(): void {
    const cam = this.cameras.main;
    const S = this.m.S;
    const seen = new Set<number>();
    let idx = 0;
    this.tagPos.clear();
    for (const g of this.sim.groups) {
      if (g.side !== this.me || g.disbanded) continue;
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
      const sy = (top - 46 - cam.worldView.y) * cam.zoom;
      let tag = this.tagMap.get(g.id);
      const sel = this.selGroup === g.id;
      if (!tag || tag.getData('label') !== label || tag.getData('sel') !== sel) {
        tag?.destroy();
        tag = this.add.container(0, 0);
        const w = label.length * 5 + 9;
        tag.add(addPanel(this, -w / 2, -6, w, 13, sel ? 'buttonSel' : 'button'));
        tag.add(addText(this, 0, -3, label, sel ? 'light' : 'red', 0.5));
        tag.setData('label', label);
        tag.setData('sel', sel);
        this.tags.add(tag);
        this.tagMap.set(g.id, tag);
      }
      const tx = Math.round(sx / S);
      const ty = Math.round(Math.max(this.topH() + 6, sy / S));
      tag.setPosition(tx, ty);
      this.tagPos.set(g.id, { x: tx, y: ty });
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

  /** Why an ability cannot be used now (null: it can). */
  private abilityBlocked(id: AbilityId, holders: SimUnit[]): string | null {
    if (this.sim.phase !== 'battle') return t('battle.why.notStarted');
    if (holders.some((u) => this.sim.abilityReady(u, id))) return null;
    const cds = holders.map((u) => this.sim.abilityCooldown(u, id)).filter((c) => c > 0);
    if (cds.length === holders.length && cds.length > 0) return t('battle.why.recovering', { n: Math.ceil(Math.min(...cds) / TICK_RATE) });
    if (id === 'bash') return t('battle.why.noFoeFront');
    if (id === 'volley') return t('battle.why.noVolley');
    if (id === 'berserk') return t('battle.why.raging');
    return t('battle.why.notReady');
  }

  /** Cooldown sweeps and reasons; the Abilities tab shows how many are ready. */
  private refreshAbilities(): void {
    const units = this.selectedUnits();
    for (const a of this.abilityBtns) {
      const holders = units.filter((u) => u.abil.includes(a.id));
      const ready = holders.filter((u) => this.sim.abilityReady(u, a.id));
      const cds = holders.map((u) => this.sim.abilityCooldown(u, a.id)).filter((c) => c > 0);
      const cdLeft = ready.length === 0 && cds.length ? Math.ceil(Math.min(...cds) / TICK_RATE) : 0;
      const why = holders.length ? this.abilityBlocked(a.id, holders) : t('battle.why.notReady');
      // a recovering or target-less ability keeps its look: the seconds say when it is back
      a.btn.setBlocked(why);
      a.btn.setCorner(cdLeft > 0 ? t('battle.ability.cooldown', { n: cdLeft }) : ready.length > 1 ? `${ready.length}` : '');
      a.btn.setCooldown(cdLeft > 0 ? (Math.min(...cds) / TICK_RATE) / ABILITIES[a.id].cooldown : 0);
    }
  }

  private useAbility(id: AbilityId): void {
    const units = this.selectedUnits().filter((u) => u.abil.includes(id));
    const ready = units.filter((u) => this.sim.abilityReady(u, id));
    if (ready.length === 0) {
      hapticNotify('error');
      uiError();
      this.showBanner(`${abilityName(id)}: ${this.abilityBlocked(id, units) ?? t('battle.why.notReady')}`, 1200);
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
    for (const u of users) this.order({ kind: 'ability', unit: u.id, ability: id });
    this.handleEvents(this.sim.drainEvents());
    this.hudDirty = true;
    this.tutorialEvent({ kind: 'ability' });
  }

  private toggleSpeed(): void {
    if (this.online) return;
    this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
    this.refreshStrip();
    this.hudDirty = true;
  }

  private detach(u: SimUnit): void {
    this.command({ kind: 'order', group: -1, order: 'hold' });
    this.selUnit = u.id;
  }

  private rejoin(u: SimUnit): void {
    const home = u.homeGroup;
    this.order({ kind: 'rejoin', unit: u.id });
    this.selGroup = home;
    this.selUnit = -1;
    this.buildHud();
  }

  /** Fight! (offline) or Ready (online). */
  startFight(): void {
    if (this.sim.phase !== 'deploy') return;
    if (this.dclock) {
      this.runDeployActions(pressReady(this.dclock));
      this.buildHud();
      return;
    }
    this.deployOrders = this.sim.orderLog.length;
    this.onBattleStarted();
  }

  /** What the deployment clock asks for: start an attack, or tell the duel relay we are ready. */
  private runDeployActions(actions: DeployAction[]): void {
    for (const a of actions) {
      if (a === 'start') {
        this.deployOrders = this.sim.orderLog.length;
        this.onBattleStarted();
      } else if (a === 'sendReady') {
        this.src?.lockstep?.ready();
        this.showBanner(this.dclock?.foeReady ? t('battle.banner.starting') : t('battle.banner.waitingFoe', { name: this.opponentName() }), 0);
        this.netBanner = true;
        this.buildHud();
      }
    }
  }

  private opponentName(): string {
    return this.src?.opponent ?? t('battle.opponent');
  }

  private onBattleStarted(): void {
    if (this.sim.phase === 'deploy') this.sim.startBattle();
    if (this.dclock) markStarted(this.dclock);
    this.shapeOpen = false;
    this.setFollow(true);
    hapticNotify('success');
    this.netBanner = false;
    this.hideBanner();
    this.showBanner(t('battle.banner.begins'), 1500);
    this.buildHud();
  }

  private resetDeploy(): void {
    if (this.src) {
      // Online battles replay from the order log; an unlogged re-deploy would not.
      this.showBanner(t('battle.why.resetOnline'), 1500);
      return;
    }
    this.sim.autoDeploy(this.me);
    for (const v of this.views) {
      v.px = v.u.x;
      v.py = v.u.y;
    }
    this.buildHud();
  }

  // ---- retreat confirmation

  /** Ask before retreating: the battle is lost, men in contact or routing may be caught. Offline it pauses meanwhile. */
  openRetreat(): void {
    if (this.tutorial) return this.tutorial.askSkip();
    if (this.sim.phase !== 'battle' || this.overlay) return;
    const wasPaused = this.paused;
    if (!this.online) this.setPaused(true);
    if (!this.netBanner) this.hideBanner();
    const sim = this.sim;
    const mine = sim.units.filter((u) => u.side === this.me && sim.isAlive(u));
    const atRisk = mine.filter((u) => u.state === 'routing' || u.engaged).length;
    const pursuit = Math.round(sim.pursuit(this.me) * 100);
    const c = confirmDialog(this, {
      title: t('battle.retreat.title'),
      body: t('battle.retreat.body', { n: atRisk, total: mine.length, p: pursuit }),
      ok: t('battle.retreat.ok'),
      okIcon: 'flag',
      cancel: t('common.stay'),
      destructive: true,
      onOk: () => {
        this.overlay = null;
        if (!this.online) this.setPaused(false);
        this.order({ kind: 'retreat' });
        this.handleEvents(this.sim.drainEvents());
        this.buildHud();
      },
      onCancel: () => {
        this.overlay = null;
        if (!this.online) this.setPaused(wasPaused);
      },
    });
    this.overlay = c;
    c.once('destroy', () => this.overlay === c && (this.overlay = null));
  }

  // ---- online battles

  /** Every local order goes through here (a live duel routes it via the relay). */
  private order(o: Order): void {
    if (this.src?.lockstep) this.src.lockstep.issue(o);
    else this.sim.issue(this.me, o);
  }

  private vsLabel(): string {
    if (this.src) return this.src.label;
    if (this.tutorialData) return t('battle.vs', { name: t('tut.vs') });
    const p = state.pending!;
    return t('battle.vs', { name: p.label ?? CULTURE_LABEL[p.enemy.culture] });
  }

  /** Live duel: start on go, show the opponent's readiness and stalls, end on desync / opponent gone. */
  private updateNet(ls: NonNullable<BattleSource['lockstep']>, delta: number): void {
    if (this.sim.phase === 'battle' && this.deployOrders === undefined) {
      this.deployOrders = this.sim.orderLog.length;
      this.onBattleStarted();
    }
    if (this.dclock && !this.dclock.foeReady && ls.opponentReady?.()) {
      foeIsReady(this.dclock);
      if (this.sim.phase === 'deploy') {
        this.showBanner(this.dclock.ready ? t('battle.banner.starting') : t('battle.foeReady', { name: this.opponentName() }), 0);
        this.netBanner = true;
      }
    }
    const gone = ls.aborted();
    if (gone && !this.ending) {
      this.ending = true;
      this.showBanner(gone, 0);
      this.time.delayedCall(2200, () => this.finish());
      return;
    }
    if (this.sim.phase !== 'battle') return;
    if (!ls.canStep()) this.stallMs += delta;
    else this.stallMs = 0;
    if (this.stallMs > 700 && !this.netBanner && !this.ending) {
      this.showBanner(ls.status() ?? t('battle.banner.waitingFoe', { name: this.opponentName() }), 0);
      this.netBanner = true;
    } else if (this.stallMs === 0 && this.netBanner) {
      this.hideBanner();
      this.netBanner = false;
    }
  }

  // ---- group assignment (deployment)

  openGroups(): void {
    this.closeGroups(false);
    const { VW, VH } = this.m;
    const sideGroups = this.sim.groups.filter((g) => g.side === this.me && !g.individual).slice(0, 4);
    const units = this.sim.units.filter((u) => u.side === this.me);
    const md: Modal = openModal(this, { title: t('battle.groups.title'), w: Math.min(VW - 12, 220), h: VH - 16, onClose: () => this.closeGroups(true) });
    this.overlay = md.c;
    const { x, y, w } = md.body;
    const legend = new Label(this, x + w / 2, y, sideGroups.map((g, i) => `${ROMAN[i]} ${groupName(g.name)}`).join(' · '), { maxW: w, maxLines: 2, font: 'dim', align: 0.5 });
    md.c.add(legend);
    const top = y + legend.h + 4;
    const doneY = md.y + md.h - 9 - SIZE.btnH;
    const rowH = 50;
    const list = new ScrollList(this, md.c, x, top, w, doneY - 4 - top, {
      count: units.length,
      rowH,
      id: (i) => `battle.groups.row${i}`,
      render: (i, row, rw, _rh, area) => {
        const u = units[i];
        const hero = this.views[u.id].hero;
        row.add(addPanel(this, 0, 0, rw, rowH, 'inset'));
        row.add(this.add.image(3, 2, ensurePortrait(this, dollFromHero(hero))).setOrigin(0, 0));
        const tw = rw - 32;
        row.add(addText(this, 29, 4, ellipsize(hero.name, tw), 'red'));
        row.add(addText(this, 29, 14, ellipsize((hero.equip.weapon ? itemName(hero.equip.weapon.def) : t('battle.unarmed')), tw), 'dim'));
        const n = sideGroups.length;
        const cw = Math.floor((rw - 4 - SIZE.gap * (n - 1)) / n);
        sideGroups.forEach((g, gi) => {
          const on = u.group === g.id;
          const b = new Button(this, 2 + gi * (cw + SIZE.gap), 25, cw, 22, {
            label: `${ROMAN[gi]}`,
            style: on ? 'buttonSel' : 'button',
            tip: groupName(g.name),
            id: `battle.groups.chip${gi}`,
            onClick: () => {
              if (area.moved || on) return;
              this.order({ kind: 'assign', unit: u.id, group: g.id });
              if (!this.src) {
                hero.group = gi;
                void state.save();
              }
              for (const v of this.views) {
                v.px = v.u.x;
                v.py = v.u.y;
              }
              list.refresh();
            },
          });
          row.add(b);
        });
      },
    });
    this.groupList = list;
    md.c.add(new Button(this, md.x + Math.round((md.w - 100) / 2), doneY, 100, SIZE.btnH, { label: t('battle.groups.done'), icon: 'check', variant: 'primary', style: 'buttonSel', onClick: () => md.close() }));
  }

  private closeGroups(rebuild: boolean): void {
    this.groupList?.destroy();
    this.groupList = null;
    const o = this.overlay;
    this.overlay = null;
    if (o && o.active) o.destroy();
    if (rebuild) this.buildHud();
  }

  // ---- the tutorial (src/ui/tutorial/battleTutorial.ts): what it observes and drives

  private tutorialEvent(e: TutorialEvent): void {
    if (this.tutorialData) this.events.emit('tutorial', e);
  }

  private tutorialHost(): TutorialHost {
    const s = this;
    return {
      scene: this,
      get sim() {
        return s.sim;
      },
      get selGroup() {
        return s.selGroup;
      },
      select: (gid: number) => {
        s.selGroup = gid;
        s.selUnit = -1;
        s.buildHud();
      },
      get cat() {
        return 'formation' as BattleCategory;
      },
      get catOpen() {
        return s.shapeOpen;
      },
      get compact() {
        return false;
      },
      get cards() {
        return s.cards;
      },
      get cmdBtns() {
        return s.cmdBtns;
      },
      get tabBtns() {
        return s.tabBtns;
      },
      get hud() {
        return s.hud;
      },
      get followBtn() {
        return s.followBtn;
      },
      get paused() {
        return s.paused;
      },
      setPaused: (p: boolean) => s.setPaused(p),
      hideBanner: () => s.hideBanner(),
      showRing: (on: boolean) => {
        s.ringHidden = !on;
      },
      fieldTop: () => s.topH(),
      panelTop: () => s.m.VH - s.panelHeight(),
      toUi: (x: number, y: number) => {
        const cam = s.cameras.main;
        const w = isoToScreen(x, y);
        return { x: ((w.x - cam.worldView.x) * cam.zoom) / s.m.S, y: ((w.y - cam.worldView.y) * cam.zoom) / s.m.S };
      },
      paceUi: () => (18 * s.cameras.main.zoom) / s.m.S,
      frameArmies: () => {
        s.tweens.killTweensOf(s.cameras.main);
        s.frameArmies();
      },
    };
  }
}

function uiMetricsOf(scene: Phaser.Scene): { S: number; VW: number; VH: number } {
  return uiMetrics(scene);
}

/** "1:05". */
function fmtClock(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A sim group's name (Phalanx, Skirmish...) in the current language. */
function groupName(name: string, short = false): string {
  const i = GROUP_NAMES.indexOf(name);
  return i >= 0 ? t(`battle.${short ? 'groupShort' : 'groupName'}.${i}` as TKey) : name;
}

function abilityName(id: AbilityId): string {
  return tOr(`ability.${id}.name`, ABILITIES[id].name);
}


function itemName(def: string): string {
  const d = itemDef(def);
  return tOr(`item.${d.id}.name`, d.name);
}

export type { SimGroup };

/** Sheet row for a facing: 0 down-right, 1 up-right, 2 down-left, 3 up-left. */
function facingRow(back: boolean, left: boolean): number {
  return back ? (left ? 3 : 1) : left ? 2 : 0;
}
