import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { ICON_PX, Meter, addIcon, addText, holdTimer, longPress, scaleIcon, uiMetrics, type HoldTimer } from '../ui/kit';
import { RS, camZoom, px, zoomUnits } from '../platform/renderScale';
import { ScrollList, confirmDialog, hintStore, openModal, toast, Label, type Modal } from '../ui/widgets';
import { GroupCard, PanelRow, numeralBadge, numeralColour, orderBadgeW, orderBarPlate, strokeReticle, worksTray } from '../ui/battlePanel';
import type { StripSlot } from '../ui/battleHud';
import { KeyButton, MButton, caps, mosaicImage, mtext, mw } from '../ui/mosaic';
import { MOSAIC } from '../ui/tokens';
import { FacingPip, HintPill, MED_H, MED_W, Medallion, ROMAN, TOP_H, TopBar, cardGroups, chargeTarget, groupCentre, groupNumeral, ContactSoon, OutOfRange, advanceToRange, enemyTap, orderKeyWidths, orderLabels, railLayout, MORE_H, rangeRing, rangeTarget, badgeAlpha, badgeKey, fieldBadge, groupReadout, AutoPauseMerge, BANNER_TTL_S, BADGE_H, BannerLife, damageNumberHits, type BadgeSpec, type HintTone, type TopBarOpts } from '../ui/battleHud';
import { TERRA } from '../art/smoothUi';
import { RARITY_COLOR, SIZE, STRAT, type BattleCategory } from '../ui/theme';
import { uiBlocker, uiId, uiIgnore } from '../ui/layout';
import { ellipsize, measureText, wrapText, LINE_H } from '../ui/textfit';
import { PLATE_W, PLATE_W_BIG, addPortrait, battleDoll, battleFrame, battleRow, battleRowFx, dollDisplayScale, dollOrigin, flushDolls, pumpDolls, releaseBattleRows } from '../ui/sprites';
import { dollFromHero, dollFx, drawnFrames, ANIM, ANIM_FRAMES, BATTLE_RES, BATTLE_SCALE, NFRAMES, aimFrame, attackFrame, isRangedClass, weaponClass, type DollFx, type DollSpec, type WeaponClass } from '../art/paperdoll';
import { AURA_COLORS, BANNER_COLORS, cosmeticLoadout } from '../game/cosmetics';
import { STANDARD_FRAMES, STANDARD_H, STANDARD_W, STRIP_STEPS, plateOrigin, renderGround, renderStandard, renderStripPlate, stripStep } from '../art/ground';
import { isoFacing, isoFieldBounds, isoToScreen, screenToIso } from '../art/iso';
import { P } from '../art/palette';
import { state, randomSeed } from '../state';
import { Battle, DT, RAISE_STANDARD, RULES, TICK_RATE } from '../sim/battle';
import { Rng } from '../sim/rng';
import { SPACING, formationSlots, presetFrontage, rightOf, type FormationType } from '../sim/formation';
import { KNOB_PACES, dragMove, dragOrder, dragPlan, dragStart, type DragEvents, type DragKind, type DragState } from '../ui/dragFormation';
import { grabAt, hitTest, tapSelect, type HitState, type Pt } from '../ui/input/hitTest';
import { SPEEDS, nextSpeed, paceMode, realtimeLocked, speedLabel, startSpeed, type PaceMode } from '../ui/input/pace';
import { LADDER, ticketClock } from '../duel/ladder';
import { battleUnlocks, fifthKey, orbWarn, raiseState, visibleKinds, type ControlKind, type Unlocks } from '../ui/input/attention';
import { FACING_DIRS, mirrorX, nextZoom, pipSlot } from '../ui/input/singleTap';
import { GestureRecognizer, type GestureEvent, type Ptr } from '../ui/input/gestures';
import { DEPLOY_UNDO_DEPTH, UNDO_S, UndoHistory, groupsOf, inverseOf, type UndoStep } from '../ui/input/undo';
import { StagedPlan, TAP_GHOST_MS, THEN_CHIP_S, ThenQueue, type ThenKey } from '../ui/orderQueue';
import { CARD_DOUBLE_TAP_MS, FOLLOW_MARGIN, POINTER_INSET, RECENTRE_MS, FOLLOW_CATCH_UP, boxOf, centreOf, edgePointer, followCentre, keepInView, openingFrame, type Box } from '../ui/battleCamera';
import { flashReduced, motion, shakeReduced } from '../ui/motion';
import type { BattleSetup, Order, Side, SimEvent, SimGroup, SimUnit, WorkType, WorksAllowance } from '../sim/types';
import { cellAt, cellCentre, firstGhost, ghostWhy, layAgain, segmentAt, trayRows, turnFacing, workCells, type TrayRow, type WorkGhost, type WorkGrid, type WorkWhy } from '../ui/input/works';
import type { TerrainGrid } from '../sim/terrain';
import type { BattleSource } from '../online/battleSource';
import { createDeployClock, foeIsReady, markStarted, pressReady, secondsLeft, tickDeploy, urgent, type DeployAction, type DeployClock } from '../online/deployClock';
import { reportBattle, snapshotSetup } from '../platform/verify';
import { generateEnemyArmy } from '../game/enemy';
import { drainLogged, lastBattle, unitStats } from '../game/report';
import { GROUP_NAMES, type Hero } from '../data/units';
import { RARITIES, itemDef } from '../data/items';
import { CULTURE_LABEL } from '../data/names';
import { haptic, hapticNotify, hapticSelect } from '../platform/telegram';
import { BattleFx, DMG_NUMBER_PX, DMG_NUMBER_S, drawFlankArc, Juice, JUICE_TIERS, type JuiceKind } from '../ui/battleFx';
import { FlankWatch, flankArc, flankThreats, type Vec } from '../ui/flankArc';
import { BeastView } from '../ui/beastView';
import { openSettings } from '../ui/settings';
import { battleAudio, uiError } from '../audio/hooks';
import { audio, sfx } from '../audio';
import { openAbilitySheet, openBattleMenu, type BattleMenuHandle } from '../ui/sheets/battleMenu';
import { ABILITIES, AURAS, type AbilityId } from '../data/perks';
import { isCaptain, rallyRadius } from '../sim/stats';
import { BOULDER_GEOM, TREE_GEOM, WORK_ART, renderBoulder, renderGlint, renderSparkle, renderTree, workSprites, type WorkSprite } from '../art/terrainArt';
import { campaignSetup, markBattle, playerWorks, settleBattle } from '../game/campaignBattle';
import { HEIGHT_RULES } from '../data/terrain';
import { hashString } from '../sim/rng';
import { t, tOr, type TKey } from '../i18n';
import { fmtClock } from '../util/format';
import { BattleTutorial, type TutorialEvent, type TutorialHost, type TutorialStart } from '../ui/tutorial/battleTutorial';
import { tutorialBattle } from '../game/tutorial';

// World pixels come from the 2:1 isometric projection in src/art/iso.ts.
const MARGIN_X = 200; // grass beyond the field's screen bounds
const MARGIN_Y = 300; // generous: a portrait viewport at zoom 1 is taller than the field

/** The order key's name for a queued "Then…" step (the same words as the order bar). */
function thenLabel(k: ThenKey): string {
  const key: Record<ThenKey, TKey> = { advance: 'battle.ring.advance', charge: 'battle.ring.charge', hold: 'battle.ring.hold', loose: 'battle.ring.shoot', fallback: 'battle.ring.back' };
  return t(key[k]);
}
/** A live duel more than this many sealed turns behind catches up, at most CATCH_UP_STEPS sim steps a frame. */
const CATCH_UP_TURNS = 4;
const CATCH_UP_STEPS = 120;
/** FL-01 (R4): the dust of an impact, a kill and a rout, sun-dried soil; the splinters of broken stakes. */
const DUST = 0xd8bfa4;
const SPLINTER = 0x9a6a3a;

// HUD geometry (UI pixels, docs/UI_KIT.md "Battle HUD"): the top bar, the field, the ability
// medallions down its right edge, the bottom sheet (group cards and orders).
/** Bottom sheet (UI px): group card height, the header line, the order buttons. */
const SHEET_CARD_H = 28;
const SHEET_HEAD_H = 22;
const SHEET_ORDERS_H = 28;

const PRESETS: [FormationType, string, string][] = [
  ['line', 'line', 'f_line'],
  ['column', 'column', 'f_column'],
  ['wedge', 'wedge', 'f_wedge'],
  ['skirmish', 'loose', 'f_skirm'],
  ['shieldwall', 'wall', 'f_wall'],
  // the orb (formations-orders.md R2), shown once unlocked (controls.md R10b)
  ['orb', 'orb', 'aura'],
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
  /** A man on foot (standards, formation strips). */
  man: boolean;
  /** Draws every animation column (men, riders, animals: walk and run, five-step attacks, two deaths); chariots use the sixteen legacy columns. */
  full: boolean;
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

/** An order key of the bottom sheet's order row. */
interface OrderKey {
  key: string;
  icon: string;
  label: string;
  /** The word under 360 wide when the full ones do not fit (hud.md §I). */
  short: string;
  tip: string;
  /** The order in force. */
  selected: boolean;
  /** Cannot now: why (a tap says it). */
  off?: string;
  /** On, but idle (Shoot out of range): drawn hollow, a rim round an unlit face (controls.md R3.4). */
  hollow?: boolean;
  onTap: () => void;
}

/** Finger travel (screen px) before a press becomes a drag: below it a lift is a tap. */
const DRAG_PX = px(10);
/** Grab radius (screen px) around the selected group's soldiers, placement marker and facing knob. */
const GRAB_PX = px(30);
/** Tap radius (screen px) of a floating group tag (a 44 pt target). */
const TAG_PX = px(20);
/**
 * Tap radius of a man on the field: a 44 pt target (controls.md R1.1, R11). It
 * also decides when another group's man under the finger beats the knob, which
 * keeps grabbing out to GRAB_PX beyond him. (Was 30 device px, unscaled: 10 pt
 * of radius on a 3x phone. V5-034.)
 */
const UNIT_TAP_PX = px(22);
/** World flag: a camp has been pitched in this campaign, so the Works tray stays unlocked (controls.md R10b). */
const WORKS_SEEN_FLAG = '@works';

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
  /** Who may pause and at what speeds (controls.md R10; src/ui/input/pace.ts). */
  private pace: PaceMode = 'offline';
  /** A ladder floor: when its ticket runs out (Date.now() ms), else null (CT-06). */
  private ladderEnd: number | null = null;
  /** The ladder ticket's seconds left last shown (-1: no countdown yet) and the banners given (1: soon, 2: expired). */
  private ticketSecs = -1;
  private ticketStage = 0;
  private acc = 0;
  private selGroup = -1;
  private selUnit = -1;
  /** One- and two-finger gestures on the field (src/ui/input/gestures.ts); the scene only routes pointer events to it. */
  private gestures = new GestureRecognizer(DRAG_PX);
  /** Undo (controls.md R4): a stack in deployment, the last order for UNDO_S in battle. Undo issues inverse orders. */
  private deployUndo = new UndoHistory(DEPLOY_UNDO_DEPTH);
  private battleUndo = new UndoHistory(1, UNDO_S * 1000);
  /** The battle Undo chip on screen (null when none): rebuilt when the step appears or expires. */
  private undoChip: KeyButton | null = null;
  /** Whether a battle undo was live when the HUD was last built. */
  private undoLive = false;
  /** The one-step "Then…" queue (controls.md R6.2): client-side, it fires as an ordinary order on arrival. */
  private thenQ = new ThenQueue();
  /** The group a move was just ordered for, and when: the Then… chip shows for THEN_CHIP_S (offline only, R10b). */
  private thenOffer: { gid: number; at: number } | null = null;
  /** Then… was tapped: the next order key for this group is queued on arrival (-1: not arming). */
  private thenArming = -1;
  /** Whether the Then… chip was on screen when the HUD was last built. */
  private thenLive = false;
  /** Undo steps that stand for arming a Then… (undoing one clears the queued step, R4.1). */
  private thenSteps = new WeakSet<UndoStep>();
  /** Paused staging (controls.md R6.1): orders given while paused offline, issued on Play at the resume tick. */
  private plan = new StagedPlan();
  /** The ✕ on each staged group's ghost (removes that group's staged orders). */
  private ghostBtns = new Map<number, KeyButton>();
  /** The tap-move preview (R5): the path line and the destination ghost, until `until` (ms). */
  private tapGhost: { gid: number; from: { x: number; y: number }; cx: number; cy: number; fx: number; fy: number; frontage: number; type: FormationType; n: number; until: number } | null = null;
  /** The formation drag under way (move or turn), from its first drag event to the lift. */
  private drag: DragState | null = null;
  private dragPreview: { cx: number; cy: number; fx: number; fy: number; frontage: number; type: FormationType; n: number; label: string } | null = null;
  private dragLabel: Phaser.GameObjects.BitmapText | null = null;
  private hint: Phaser.GameObjects.Container | null = null;
  /** RD-02: auto-pauses within 5 s merge into one pause and one banner. */
  private pauseMerge = new AutoPauseMerge();
  /** RD-02: a field banner's life (6 s or a false condition); null for other banners. */
  private bannerLife: BannerLife | null = null;
  /** RD-02: the red flank arcs, and the dashed threats (refreshed at threatAt, ms). */
  private flankWatch = new FlankWatch();
  private threats = new Map<number, Vec[]>();
  private threatAt = 0;
  private arcG!: Phaser.GameObjects.Graphics;
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
  /** Edge pointers (CT-05): 'group' to the selected group, 'foe' to the enemy in deployment. */
  private pointerMap = new Map<'group' | 'foe', Phaser.GameObjects.Container>();
  /** Width (UI px) of the medallion rail on the field's right edge (0 without one): pointers stay clear of it. */
  private railW = 0;
  /** The last group card tap, for the double tap that centres on the group (R8.2). */
  private lastCardTap: { gid: number; at: number } | null = null;
  private tagPos = new Map<number, { x: number; y: number }>();
  private top: TopBar | null = null;
  private hintPill: HintPill | null = null;
  /** The open ⋯ battle menu (BTL-01), if any. */
  private menu: BattleMenuHandle | null = null;
  private sitKey = '';
  /** What the order row was built for (ordersKey): the HUD is rebuilt when it changes. */
  private ordersBuilt = '';
  private cards: { gid: number; card: GroupCard; numeral: string }[] = [];
  /** Order, shape and ability controls by key (order keys, shape rows, medallions, chips): the tutorial lights them. */
  private cmdBtns = new Map<string, Phaser.GameObjects.Container>();
  private heroInfo: Phaser.GameObjects.Container | null = null;
  private banner: Phaser.GameObjects.Container | null = null;
  private bannerTimer: Phaser.Time.TimerEvent | null = null;
  private overlay: Phaser.GameObjects.Container | null = null;
  /** The "leave the deployment?" dialog while it is open (closed when the battle starts under it). */
  private leaveDialog: Phaser.GameObjects.Container | null = null;
  private hudDirty = true;
  /** The hint's "Contact soon" (B5) and the cards' "Out of range" (B6) clocks. */
  private contactSoon = new ContactSoon();
  private outOfRange = new OutOfRange();
  /** Groups whose card says "Out of range" now (refreshHud; the order row and the chips read it). */
  private far = new Set<number>();
  private groupList: ScrollList | null = null;
  private fx!: BattleFx;
  /** Feel (FL-01, R4): shake trauma, hit-stop and flash pacing; presentation only. */
  private juice = new Juice();
  /** The shake offset now added to the main camera's scroll (world px), taken back next frame. */
  private shook = { x: 0, y: 0 };
  /** Mythical beasts on screen (src/ui/beastView.ts); null without beasts. */
  private beasts: BeastView | null = null;
  /** Camera follows the fighting until the player pans or pinches. */
  private follow = true;
  private followBtn: KeyButton | null = null;
  private abilityBtns: { id: AbilityId; btn: Medallion }[] = [];
  /** The shape sheet is open. */
  private shapeOpen = false;
  /** Field works (FW-03): the player's allowance this battle was set up with; null: the player has no works here. */
  private works: { works: WorksAllowance; caught: boolean } | null = null;
  /** The works tray is open (the Works chip is lit). */
  private worksOpen = false;
  /** The segment being placed (the ghost), or null. */
  private worksGhost: WorkGhost | null = null;
  /** A drag from the ghost is moving it (lifting lays it). */
  private worksDrag = false;
  /** A cell of the own segment selected for removal, or -1. */
  private worksSel = -1;
  /** The works sprites on the field, and what they were drawn for. */
  private workArt: Phaser.GameObjects.Image[] = [];
  private worksSig = '';
  /** The ✓ / ✗ mark on the ghost (A11Y-04: validity is never colour only). */
  private ghostMark: Phaser.GameObjects.Image | null = null;
  /** CT-07 (controls.md R10b): the gated controls this battle shows, fixed when it opens. */
  private unlocks: Unlocks = battleUnlocks({ kind: 'campaign', fought: 0, campPitched: false, realtimeLocked: false });
  /** The kinds of interactive control on screen (the attention budget, at most 4). */
  private kinds: ControlKind[] = [];
  /** Left-hand mode (A11Y-16): the medallion rail and the Follow eye on the left edge. */
  private leftHand = false;
  /** The player's army fielded a standard bearer (the Raise control stays, greyed, once he falls). */
  private hadStandard = false;
  private stdBtn: Medallion | null = null;
  /** When each of my groups last began a feint (tick), for the Withdraw key's cooldown sweep. */
  private feintAt = new Map<number, number>();
  private feintBar: { g: Phaser.GameObjects.Graphics; x: number; y: number; w: number; gid: number } | null = null;
  /** The facing pips are open round this group (A11Y-14), or null. */
  private pips: { gid: number; btns: { pip: FacingPip; dir: Pt }[] } | null = null;
  private zoomBtn: KeyButton | null = null;
  /** The zoom (whole units) the camera is settling at: what the zoom key says (0: read the camera). */
  private zoomTo = 0;
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
  /** The stall banner's text (refreshed when the status changes). */
  private netText = '';
  /** Online battles: the timed deployment (docs/DESIGN_V2.md "Online battle rules"). */
  private dclock: DeployClock | null = null;
  private countdown: { bar: Phaser.GameObjects.Graphics; shown: number } | null = null;
  private lastTickSound = -1;
  /** The guided tutorial battle (src/ui/tutorial/battleTutorial.ts): set from the scene data, the controller after the HUD. */
  private tutorialData: TutorialStart | null = null;
  tutorial: BattleTutorial | null = null;
  /** What the tutorial has taught so far (TUT-02): planning while paused, the Then… chip, Undo (off until its step); and whether the chips row and the edge pointers show now. */
  private tutAllow = { plan: false, then: false, undo: false, chips: true };
  /** The tutorial's clock for the 3 s Undo and Then… windows: it stands still while old Nikias waits for the player. */
  private tutClock = 0;

  private get foe(): Side {
    return this.me === 0 ? 1 : 0;
  }

  /** An online battle (attack, ladder floor or live duel): the server fixed its setup, a timed deployment. */
  private get online(): boolean {
    return !!this.src;
  }

  /**
   * The battle cannot pause, auto-pause or change speed (controls.md R10):
   * live duels, async raids and war-map attacks. Offline battles and the duel
   * ladder (a bot, verified by replay after) may.
   */
  private get realtimeLocked(): boolean {
    return realtimeLocked(this.pace);
  }

  constructor() {
    super('Battle');
  }

  /** The works' pixel sprites (AS-06), once: a file that fails to load leaves its works drawn by the ghost outline only. */
  preload(): void {
    for (const a of Object.values(WORK_ART)) if (!this.textures.exists(a.key)) this.load.image(a.key, a.url);
  }

  create(data: { fresh?: boolean; source?: BattleSource; tutorial?: TutorialStart }): void {
    this.views = [];
    this.decals = [];
    this.tagMap = new Map();
    this.pointerMap = new Map();
    this.lastCardTap = null;
    this.tagPos = new Map();
    this.paused = false;
    this.speed = 1;
    this.juice = new Juice();
    this.shook = { x: 0, y: 0 };
    this.acc = 0;
    this.selGroup = -1;
    this.selUnit = -1;
    this.gestures.reset();
    this.deployUndo.clear();
    this.battleUndo.clear();
    this.undoChip = null;
    this.undoLive = false;
    this.thenQ.reset();
    this.thenOffer = null;
    this.thenArming = -1;
    this.thenLive = false;
    this.plan.clear();
    this.ghostBtns.clear();
    this.tapGhost = null;
    this.drag = null;
    this.dragPreview = null;
    this.dragLabel = null;
    this.hint = null;
    this.ending = false;
    this.victorySide = -1;
    this.retreatMsg = null;
    this.menu = null;
    this.overlay = null;
    this.leaveDialog = null;
    this.banner = null;
    this.bannerLife = null;
    this.pauseMerge = new AutoPauseMerge();
    this.flankWatch = new FlankWatch();
    this.threats.clear();
    this.threatAt = 0;
    this.follow = true;
    this.abilityBtns = [];
    this.infoTip = null;
    this.holdTimer = null;
    this.propTick = 0;
    this.stallMs = 0;
    this.netBanner = false;
    this.netText = '';
    this.shapeOpen = false;
    this.works = null;
    this.worksOpen = false;
    this.worksGhost = null;
    this.worksDrag = false;
    this.worksSel = -1;
    this.workArt = [];
    this.worksSig = '';
    this.ghostMark = null;
    this.kinds = [];
    this.stdBtn = null;
    this.feintAt = new Map();
    this.feintBar = null;
    this.pips = null;
    this.zoomBtn = null;
    this.zoomTo = 0;
    this.sitKey = '';
    this.contactSoon = new ContactSoon();
    this.outOfRange = new OutOfRange();
    this.far = new Set();
    this.ordersBuilt = '';
    this.countdown = null;
    this.lastTickSound = -1;
    this.src = data?.source ?? null;
    this.tutorialData = !this.src && data?.tutorial ? data.tutorial : null;
    this.tutAllow = { plan: false, then: false, undo: false, chips: true };
    this.tutClock = 0;
    this.ladderEnd = this.src?.ladder?.deadline ?? null;
    this.pace = paceMode(!!this.src, this.ladderEnd !== null);
    // the saved battle speed (A11Y-21), within what this battle offers; the scripted tutorial runs at 1×
    this.speed = this.tutorialData ? 1 : startSpeed(this.pace, state.campaign.data.settings.battleSpeed);
    this.ticketSecs = -1;
    this.ticketStage = 0;
    this.tutorial = null;
    this.me = this.src?.side ?? 0;
    this.dclock = this.src ? createDeployClock(this.src.lockstep ? 'duel' : 'attack') : null;
    this.initUi();

    const camp = state.campaign;
    // Works unlock once a camp has been pitched (R10b), and stay: a camp standing now is remembered in a world flag
    if (!this.src && !this.tutorialData && camp.data.world.camp) camp.world.setFlag(WORKS_SEEN_FLAG, 1);
    // the attention budget (CT-07, controls.md R10b): what this player has learned, read before this battle counts
    this.unlocks = battleUnlocks({
      kind: this.src ? 'online' : this.tutorialData ? 'tutorial' : 'campaign',
      fought: camp.data.fought,
      campPitched: !!camp.data.world.camp || camp.world.hasFlag(WORKS_SEEN_FLAG),
      realtimeLocked: this.realtimeLocked,
    });
    this.leftHand = !!camp.data.settings.leftHand;
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
      // field works (field-works.md R4): an offline campaign feature, once unlocked (V5-022, R10b)
      this.works = this.unlocks.works ? playerWorks(camp, pending) : null;
      setup = campaignSetup(pending, heroes, this.works?.works);
    }
    const terrain: TerrainGrid = setup.terrain ?? { w: 0, h: 0, cells: 'flat' };
    this.verifySetup = this.src || this.tutorialData ? null : snapshotSetup(setup);
    this.deployOrders = undefined;
    this.sim = new Battle(setup);
    this.src?.lockstep?.attach(this.sim);
    this.hadStandard = !!this.sim.standardBearer(this.me);
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
    this.feelSettings();

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
      // drawn at BATTLE_RES (twice the pixels), shown at the same size: setScale(1 / res) keeps layout, feet and hitboxes
      const spec = { ...dollFromHero(hero, u.side === this.me ? lo : undefined), scale: BATTLE_SCALE, res: BATTLE_RES };
      const man = !spec.beast && !spec.mount;
      const full = drawnFrames(spec) >= NFRAMES;
      // every figure draws into the shared atlases: a frame the first time it shows, trimmed, dropped again when unused
      const key = battleDoll(spec);
      const rowKey = battleRow(this, key, dir);
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
      const ds = dollDisplayScale(key);
      const f0 = battleFrame(rowKey, 0);
      const spr = this.add.sprite(0, 0, f0.key, f0.frame).setOrigin(ox, oy).setScale(ds);
      const fx = spec.beast ? null : dollFx(spec);
      const hasFx = battleRowFx(rowKey);
      const fxRing = hasFx && f0.ring && fx?.outline != null ? this.add.sprite(0, 0, f0.key, f0.ring).setOrigin(ox, oy).setScale(ds).setTint(fx.outline) : null;
      const fxGlint = hasFx && f0.glint && fx?.glint ? this.add.sprite(0, 0, f0.key, f0.glint).setOrigin(ox, oy).setScale(ds).setTint(0xfff6d8).setVisible(false) : null;
      if (fxRing) this.world.add(fxRing);
      if (fxGlint) this.world.add(fxGlint);
      const flag = this.add.image(0, 0, 'flag_white').setOrigin(0, 1).setVisible(false).setDepth(90000);
      const plateTop = this.add.image(0, 0, 'strip_top_0').setDepth(-59900).setVisible(false);
      this.world.add([shadow, plateTop, ring, spr, flag]);
      const tall = Math.round((u.stats.mount ? 52 : u.stats.kind === 'animal' ? (u.rad > 0.45 ? 30 : 18) : 38) * BATTLE_SCALE);
      const view: UnitView = {
        u, hero, spr, shadow, ring, flag, px: u.x, py: u.y, flip: f.left, back: f.back, deathTick: -1, dir, key, tall, big, man, full, plated, plateTop, strip: -1, topKey: '',
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
    // RD-02: flank arcs round our badges, under them
    this.arcG = this.add.graphics();
    this.tags.add(this.arcG);
    this.ui.add(this.hud);
    // the boss bar is HUD chrome (Z2): over the field badges, under the HUD's sheets
    const bossBar = this.beasts?.barObject;
    if (bossBar) this.ui.moveAbove(bossBar, this.tags);
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
        if (this.sim.phase === 'battle' && !this.paused && !this.realtimeLocked) this.setPaused(true);
        openSettings(this, () => this.settingsClosed());
      },
    });
    if (this.tutorialData) {
      this.tutorial = new BattleTutorial(this.tutorialHost(), this.tutorialData);
      return;
    }
    const where = terrain.name ? ` - ${terrain.name}` : '';
    // before the start, say whether this battle can pause (A11Y-18; controls.md R10)
    const pace = this.realtimeLocked ? t('pace.locked') : this.pace === 'ladder' ? t('pace.ladder', { m: LADDER.ticketMin }) : '';
    this.showBanner(`${t('battle.banner.deploy', { vs: this.vsLabel() })}${where}${pace ? `\n${pace}` : ''}`, pace ? 4500 : 3000, pace ? 4 : 2);
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
   * The opening frame (controls.md R7, F2): both armies in view if that fits
   * at OPEN_ZOOM_MIN (1x, see battleCamera.ts); otherwise 1x on the player's
   * army, and the edge arrow points at the enemy (updatePointers).
   * Enemy men still hidden (online deployment) count as their zone's centre.
   */
  private frameArmies(): void {
    const cam = this.cameras.main;
    const hidden = this.hideFoes();
    const pts: Pt[] = [];
    for (const u of this.sim.units) {
      if (u.state === 'fled' || u.state === 'dead' || (hidden && u.side !== this.me)) continue;
      pts.push(isoToScreen(u.x, u.y));
    }
    if (hidden) pts.push(this.foeCentre());
    const armies = boxOf(pts, 10, 44, 4);
    if (!armies) return;
    const vp = this.fieldViewport();
    const f = openingFrame(this.scale.width / RS, (vp.bottom - vp.top) / RS, armies);
    cam.setZoom(camZoom(f.zoom));
    this.fitBounds();
    const t0 = f.fits ? centreOf(armies) : this.focusPoint();
    this.centerCam(t0.x, t0.y);
  }

  /** Where the enemy stands (world px): their men's centre, or their zone's while the men are hidden. */
  private foeCentre(): Pt {
    if (!this.hideFoes()) {
      const b = boxOf(
        this.sim.units.filter((u) => u.side !== this.me && u.state === 'ready').map((u) => isoToScreen(u.x, u.y)),
        0,
        20,
        0,
      );
      if (b) return centreOf(b);
    }
    const z = this.sim.deployZone(this.foe);
    return isoToScreen(this.sim.width / 2, (z.y0 + z.y1) / 2);
  }

  /**
   * The camera's bounds: the ground, stretched under the HUD bars so the
   * field's edge still reaches the visible band on a short phone, whose sheet
   * is taller than the ground's margin: what the stretch adds lies under the opaque bars.
   */
  private fitBounds(): void {
    const cam = this.cameras.main;
    const fb = isoFieldBounds(this.sim.width, this.sim.height);
    const vp = this.fieldViewport();
    const top = Math.max(MARGIN_Y, vp.top / cam.zoom + 40);
    const bottom = Math.max(MARGIN_Y, (this.scale.height - vp.bottom) / cam.zoom + 40);
    cam.setBounds(fb.x0 - MARGIN_X, fb.y0 - top, fb.x1 - fb.x0 + MARGIN_X * 2, fb.y1 - fb.y0 + top + bottom);
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

  /**
   * Smoothly track the fighting while following: the melee plus the selected
   * group, never losing the group (controls.md R8.1, battleCamera.followCentre).
   */
  private updateCamera(delta: number): void {
    // a paused field stays still under the finger: orders are given on a fixed view
    if (!this.follow || this.sim.phase !== 'battle' || this.gestures.pinch || this.paused) return;
    const cam = this.cameras.main;
    const vp = this.fieldViewport();
    const engaged = this.sim.units.filter((u) => u.state === 'ready' && u.engaged);
    const melee = engaged.length >= 2 ? boxOf(engaged.map((u) => isoToScreen(u.x, u.y)), 10, 44, 4) : null;
    const group = boxOf(this.selectedUnits().map((u) => isoToScreen(u.x, u.y)), 10, 44, 4);
    const view = { w: this.scale.width / cam.zoom, h: (vp.bottom - vp.top) / cam.zoom };
    const t0 = followCentre(melee, group, this.focusPoint(), view, FOLLOW_MARGIN);
    const offX = (this.scale.width / 2 - (vp.left + this.scale.width) / 2) / cam.zoom;
    const offY = (this.scale.height / 2 - (vp.top + vp.bottom) / 2) / cam.zoom;
    const cur = { x: cam.midPoint.x - offX, y: cam.midPoint.y - offY };
    const k = 1 - Math.exp((-delta / 1000) * 2.2);
    // eased toward the frame, then pulled (fast, but not a jump) to keep the selected group in view:
    // smoothing alone let a running group outrun the camera (K2)
    const eased = { x: cur.x + (t0.x - cur.x) * k, y: cur.y + (t0.y - cur.y) * k };
    const held = keepInView(eased, group, view, 0);
    const step = Math.min(1, (FOLLOW_CATCH_UP * (delta / 1000)) / Math.max(1e-6, Math.hypot(held.x - eased.x, held.y - eased.y)));
    const next = { x: eased.x + (held.x - eased.x) * step, y: eased.y + (held.y - eased.y) * step };
    this.centerCam(next.x, next.y);
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
    this.updateTicket();
    if (this.tutorialData && !this.tutorial?.holdsChips) this.tutClock += delta;
    if (this.bannerLife?.expired(this.time.now)) this.hideBanner();
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
        this.handleEvents(drainLogged(this.sim));
        this.acc -= DT;
        steps++;
      }
      if (catchUp) this.acc = Math.min(this.acc, DT);
      this.hudDirty = true;
      this.fireThen();
    } else if (this.sim.phase === 'ended') {
      this.handleEvents(drainLogged(this.sim));
    }
    const alpha = this.sim.phase === 'battle' && !this.paused ? Math.min(1, this.acc / DT) : 1;
    this.fitBounds();
    this.updateCamera(delta);
    this.juice.frame(delta, this.sim.phase === 'battle' && !this.paused);
    this.applyShake();
    this.fx.update(this.paused ? 0 : delta);
    pumpDolls(this.sim.phase === 'battle' && !this.paused ? 4 : 8);
    this.renderUnits(alpha);
    flushDolls(this);
    this.beasts?.update(alpha, !!this.banner);
    this.renderProjectiles(alpha);
    if (this.sim.phase === 'deploy') this.syncWorkArt();
    this.renderBoxes();
    this.updateProps();
    this.updateTags();
    this.updatePointers();
    if (this.undoLive || this.battleUndo.size) this.updateUndoChip();
    if (this.thenLive !== this.thenChipLive()) this.buildHud();
    this.updateGhostBtns();
    this.updatePips();
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
    // the stride keeps time with the man's actual pace (no sliding feet), at a cadence of his own (+-8%) and a
    // phase of his own, so a rank never marches in lockstep
    const cadence = 0.92 + ((u.id * 0.37) % 1) * 0.16;
    const pace = Math.max(0.6, Math.min(1.6, u.spd / Math.max(0.01, u.stats.speed)));
    if (u.state === 'routing') return ANIM.rout[Math.floor(t * 11 * cadence + u.id) % ANIM.rout.length];
    if (moving) {
      if (u.spd > u.stats.speed * 1.3) return ANIM.run[Math.floor(t * 12 * cadence * Math.min(1.25, pace / 1.4) + u.id) % ANIM.run.length];
      return ANIM.walk[Math.floor(t * 12 * cadence * pace + u.id) % ANIM.walk.length];
    }
    if (isRangedClass(v.wc) && u.ammo > 0 && u.lastShotTick > 0 && (now - u.lastShotTick) / TICK_RATE < u.stats.shotTime * 1.8) {
      const f = aimFrame(v.wc, Math.max(0, u.cooldown) / TICK_RATE, t);
      if (f >= 0) return f;
    }
    return ANIM.idle[Math.floor(t * 2.2 + ((u.id * 0.618) % 1) * 4) % 4];
  }

  /** Chariots (sixteen-column figures): the original four-phase sets. */
  private figureFrame(v: UnitView, now: number, sinceHit: number, moving: boolean): number {
    const u = v.u;
    const sinceAtk = (now - Math.max(u.lastAttackTick, u.lastShotTick)) / TICK_RATE;
    if (sinceAtk >= 0 && sinceAtk < 0.42) return sinceAtk < 0.12 ? ANIM_FRAMES.attack[0] : sinceAtk < 0.24 ? ANIM_FRAMES.attack[1] : ANIM_FRAMES.attack[2];
    if (sinceHit >= 0 && sinceHit < 0.18) return ANIM_FRAMES.hit[0];
    if (moving || u.state === 'routing') {
      // hooves keep time with the ground covered; each horse at a stride of its own
      const pace = Math.max(0.6, Math.min(1.5, u.spd / Math.max(0.01, u.stats.speed)));
      const rate = (u.state === 'routing' ? 1.5 : 1) * 8 * pace * (0.94 + ((u.id * 0.61) % 1) * 0.12);
      return ANIM_FRAMES.gallop[Math.floor((now / TICK_RATE) * rate + u.id) % ANIM_FRAMES.gallop.length];
    }
    return ANIM_FRAMES.idle[Math.floor((now / TICK_RATE) * 1.6 + ((u.id * 0.618) % 1) * 2) % 2];
  }

  /** Show a frame from the figure's facing row (drawn into the atlases on demand). */
  private showFrame(v: UnitView, frame: number): void {
    const f = battleFrame(v.rowKey, frame);
    if (v.spr.texture.key !== f.key) v.spr.setTexture(f.key, f.frame);
    else if (v.spr.frame.name !== f.frame) v.spr.setFrame(f.frame);
  }

  /** Epic+ gear: the outline ring pulses; rare+: a highlight sweeps across the metal now and then. */
  private updateGearFx(v: UnitView, rx: number, ry: number, frame: number): void {
    const f = battleFrame(v.rowKey, frame);
    const t = this.time.now / 1000;
    const rank = v.fx?.rank ?? 0;
    if (v.fxRing && f.ring) {
      if (v.fxRing.texture.key !== f.key) v.fxRing.setTexture(f.key, f.ring);
      else if (v.fxRing.frame.name !== f.ring) v.fxRing.setFrame(f.ring);
      const pulse = 0.5 + 0.5 * Math.sin(t * (rank >= 4 ? 4.4 : 3) + v.u.id);
      v.fxRing.setPosition(v.spr.x, ry).setDepth(ry - 0.5).setVisible(true).setAlpha(0.3 + 0.5 * pulse);
    }
    if (v.fxGlint && f.glint) {
      const period = rank >= 4 ? 1.8 : rank >= 3 ? 2.4 : 3.2;
      const ph = ((t + (v.u.id * 0.53) % period) % period) / 0.4; // the sweep takes 0.4 s
      // the crop is in whole-frame pixels (atlas frames are trimmed)
      const fw = v.spr.frame.realWidth;
      const bx = Math.floor(ph * (fw * 0.6)) + Math.floor(fw * 0.2);
      if (ph < 1) {
        if (v.fxGlint.texture.key !== f.key) v.fxGlint.setTexture(f.key, f.glint);
        else if (v.fxGlint.frame.name !== f.glint) v.fxGlint.setFrame(f.glint);
        v.fxGlint.setCrop(bx, 0, 2 * BATTLE_RES, v.spr.frame.realHeight).setPosition(v.spr.x, ry).setDepth(ry + 0.5).setVisible(true).setAlpha(0.85);
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
      // hit-stop (R4): the pose of a held group or man stays as it was drawn; the sim runs on underneath
      if (this.juice.holds(u)) continue;
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
        v.rowKey = battleRow(this, v.key, dir);
        v.dir = dir;
      }
      let frame: number;
      if (u.state === 'dead') {
        if (v.deathTick < 0) v.deathTick = tick;
        const tt = (now - v.deathTick) / TICK_RATE;
        // men, riders and beasts fall in four steps (stagger, topple / crumple, hit the ground, lie still); chariots in three
        const die = v.full ? (v.dieB ? ANIM.dieB : ANIM.die) : ANIM_FRAMES.fall;
        frame = die[Math.min(die.length - 1, Math.floor(tt / (v.man ? 0.08 : 0.11)))];
        v.spr.setDepth(-50000 + ry);
        v.shadow.setVisible(false);
        v.plateTop.setVisible(false);
        v.ring.setVisible(false);
        v.flag.setVisible(false);
        v.fxRing?.setVisible(false);
        v.fxGlint?.setVisible(false);
        v.spr.clearTint();
        this.showFrame(v, frame);
        this.fx.unit(u, rx, ry, this.time.now, false);
        continue;
      }
      const moving = Math.abs(u.vx) + Math.abs(u.vy) > 0.004;
      const sinceHit = (now - u.lastHitTick) / TICK_RATE;
      frame = v.full ? this.manFrame(v, now, sinceHit, moving) : this.figureFrame(v, now, sinceHit, moving);
      this.showFrame(v, frame);
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
    this.drawWorks(g);
    const drawSlots = (slots: { x: number; y: number }[], fx: number, fy: number, color: number, a: number, dashed = false) => {
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
        // a ghost (a staged or a previewed position) has a dashed outline over a dark one, to read on any ground (A11Y-03)
        if (dashed) this.dashRect(g, corners, 0x2a1d14, a * 0.8, 3, 0);
        this.dashRect(g, corners, color, a, dashed ? 2 : 1, dashed ? 1 : 0);
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
    if (this.sim.phase === 'battle') {
      this.drawMoveOrders(g);
      // the tap-move preview (R5): a path line from the group to a ghost at the destination, for TAP_GHOST_MS
      const tg = this.tapGhost;
      if (tg && this.time.now < tg.until) {
        const a = isoToScreen(tg.from.x, tg.from.y);
        const b = isoToScreen(tg.cx, tg.cy);
        this.pathLine(g, a, b, 0xfff4c0, 0.9);
        drawSlots(formationSlots({ type: tg.type, cx: tg.cx, cy: tg.cy, fx: tg.fx, fy: tg.fy, frontage: tg.frontage }, tg.n), tg.fx, tg.fy, 0xfff4c0, 0.85, true);
      } else this.tapGhost = null;
      // the plan while paused (R6.1): each staged group's ghost (dashed), its facing, and a staged Charge's arrow (R5)
      if (this.plan.size) {
        for (const gid of this.plan.groups()) {
          const f = this.stagedFormation(gid);
          const n = this.sim.activeMembers(gid).length;
          if (f && n > 0) {
            drawSlots(formationSlots(f, n), f.fx, f.fy, 0xfff4c0, 0.9, true);
            this.drawFacingKnob(this.knobG, f.cx, f.cy, f.fx, f.fy, 0xfff4c0, 0.5);
          }
          if (this.plan.last(gid, 'order')?.order === 'charge') {
            const from = f && n > 0 ? (() => {
              const sl = formationSlots(f, n);
              return { x: sl.reduce((q, p) => q + p.x, 0) / sl.length, y: sl.reduce((q, p) => q + p.y, 0) / sl.length };
            })() : undefined;
            const c = chargeTarget(this.sim, gid, from);
            if (c) this.chargeArrow(g, isoToScreen(c.from.x, c.from.y), isoToScreen(c.to.x, c.to.y));
          }
          // a staged Feint (R5): the fall-back path (FEINT_S at its run) and, at the turn point, the charge back
          if (this.plan.last(gid, 'order')?.order === 'feint') this.feintPreview(g, gid, f);
        }
      }
    }
    if (this.selGroup >= 0) {
      const grp = this.sim.groups[this.selGroup];
      if (!grp || grp.disbanded) return;
      const slots = this.sim.groupSlots(grp.id);
      drawSlots(slots, grp.formation.fx, grp.formation.fy, 0x7fa9a8, 0.6);
      if (this.sim.phase === 'battle') this.drawTargeting(g, grp.id);
      // the facing arrow and its knob: drag the knob to turn the group
      const fr = this.canCommand() && this.sim.phase !== 'ended' ? this.selectedFrame() : null;
      if (fr) this.drawFacingKnob(this.knobG, fr.cx, fr.cy, fr.fx, fr.fy, 0xf6ecd8, 0.85);
    }
  }

  /**
   * The Feint preview (controls.md R5): a dotted path from the group straight
   * back for feintS at the feint's run (its slowest man; the sim's terrain and
   * fatigue may shorten it), a ring at the turn point and the charge arrow
   * from there, back toward the group's front.
   */
  private feintPreview(g: Phaser.GameObjects.Graphics, gid: number, f: { cx: number; cy: number; fx: number; fy: number } | null): void {
    const grp = this.sim.groups[gid];
    const mem = this.sim.activeMembers(gid);
    if (!grp || !mem.length || !this.sim.canFeint(gid)) return;
    const fr = f ?? grp.formation;
    const speed = Math.min(...mem.map((u) => u.stats.speed));
    const dist = RULES.feintS * RULES.feintPace * speed;
    const clampX = (v: number) => Phaser.Math.Clamp(v, 0.5, this.sim.width - 0.5);
    const clampY = (v: number) => Phaser.Math.Clamp(v, 0.5, this.sim.height - 0.5);
    const from = { x: fr.cx, y: fr.cy };
    const to = { x: clampX(fr.cx - fr.fx * dist), y: clampY(fr.cy - fr.fy * dist) };
    const a = isoToScreen(from.x, from.y);
    const b = isoToScreen(to.x, to.y);
    this.pathLine(g, a, b, 0xfff4c0, 0.9);
    g.lineStyle(3, 0x2a1d14, 0.8);
    g.strokeEllipse(b.x, b.y, 14, 7);
    g.lineStyle(1.5, 0xfff4c0, 1);
    g.strokeEllipse(b.x, b.y, 14, 7);
    const back = isoToScreen(to.x + fr.fx * Math.min(dist, 3), to.y + fr.fy * Math.min(dist, 3));
    this.chargeArrow(g, b, back);
  }

  /** A straight dotted path line (the tap-move preview), on a dark under-dot so it reads on light ground. */
  private pathLine(g: Phaser.GameObjects.Graphics, a: { x: number; y: number }, b: { x: number; y: number }, color: number, alpha: number): void {
    const len = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    for (let k = 4; k < len - 2; k += 3) {
      const x = Math.round(a.x + ((b.x - a.x) * k) / len);
      const y = Math.round(a.y + ((b.y - a.y) * k) / len);
      g.fillStyle(0x2a1d14, alpha * 0.7);
      g.fillRect(x - 1, y - 1, 3, 3);
      g.fillStyle(color, alpha);
      g.fillRect(x, y, 1, 1);
    }
  }

  /**
   * The staged Charge preview (R5): an arrow from the group to the enemy group
   * it will hit, in the alert colour on an ink outline, with chevrons along it
   * so it is not colour only (A11Y-03, A11Y-04).
   */
  private chargeArrow(g: Phaser.GameObjects.Graphics, a: { x: number; y: number }, b: { x: number; y: number }): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 8) return;
    const ux = dx / d;
    const uy = dy / d;
    // stop short of the target's centre, so the head sits at their front
    const end = { x: a.x + ux * Math.max(6, d - 10), y: a.y + uy * Math.max(6, d - 10) };
    const chev = (cx: number, cy: number, s: number) => {
      g.lineBetween(cx - ux * s - uy * s, cy - uy * s + ux * s, cx, cy);
      g.lineBetween(cx - ux * s + uy * s, cy - uy * s - ux * s, cx, cy);
    };
    for (const [w, c, al] of [
      [3, 0x2a1d14, 0.8],
      [1.4, 0xe07060, 1],
    ] as const) {
      g.lineStyle(w, c, al);
      g.lineBetween(a.x, a.y, end.x, end.y);
      chev(end.x, end.y, 5);
      for (let k = 14; k < d - 22; k += 14) chev(a.x + ux * k, a.y + uy * k, 3);
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

  /**
   * A selected missile group's range ring (dashed, cream on an ink outline so
   * it reads on any ground: A11Y-03) and the reticle over its focus target,
   * on top of the men (controls.md R3.2, R3.3).
   */
  private drawTargeting(g: Phaser.GameObjects.Graphics, gid: number): void {
    const ring = rangeRing(this.sim, gid);
    const pts = ring?.map((p) => isoToScreen(p.x, p.y)) ?? [];
    for (const [w, color, a] of [[3, MOSAIC.ink, 0.85], [1.4, MOSAIC.cream, 0.95]] as const) {
      g.lineStyle(w, color, a);
      // every other segment of the ring: a dash
      for (let i = 0; i < pts.length; i += 2) {
        const p = pts[i];
        const q = pts[(i + 1) % pts.length];
        g.lineBetween(p.x, p.y, q.x, q.y);
      }
    }
    if ((this.sim.groups[gid].focus ?? -1) < 0) return;
    const c = rangeTarget(this.sim, gid);
    if (!c) return;
    // over the target group's heads
    const s = isoToScreen(c.x, c.y);
    strokeReticle(this.knobG, s.x, s.y - 52, 7, 1.4);
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
    // R4: a damage number only on a charge impact and a kill, 9 UI px for 600 ms
    if (this.fx.showNumbers) {
      for (const e of damageNumberHits(events)) {
        const u = this.sim.units[e.unit];
        const p = isoToScreen(u.x, u.y);
        this.fx.floatText(p.x, p.y - this.views[e.unit].tall - 6, `${Math.max(1, Math.round(e.dmg))}`, u.side === this.me ? 0xff8070 : 0xfff4d8, DMG_NUMBER_S, DMG_NUMBER_PX);
      }
    }
    for (const [i, e] of events.entries()) {
      switch (e.type) {
        case 'hit': {
          const u = this.sim.units[e.unit];
          if (e.dmg > 2 || Math.random() < 0.5) this.addBlood(u.x, u.y, false);
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
          // R4: a kill is the smallest tier, a puff (and its number); no shake
          if (e.by >= 0) this.feel('kill', [], isoToScreen(u.x, u.y));
          if (u.side === this.me) {
            hapticNotify('warning');
            if (st.pauseDeath) this.autoPause(t('battle.banner.fallen', { name: u.name }));
          }
          break;
        }
        case 'impact': {
          // R4: a charge lands, dust on the contact line, a light shake, the two groups' sprites held 60 ms
          const u = this.sim.units[e.unit];
          const by = this.sim.units[e.by];
          if (!u || !by) break;
          const a = isoToScreen(u.x, u.y);
          const b = isoToScreen(by.x, by.y);
          this.feel('impact', [u.group, by.group], { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
          break;
        }
        case 'stakesBreak': {
          const u = this.sim.units[e.unit];
          this.feel('stakes', u ? [u.group] : [], isoToScreen(e.x, e.y), SPLINTER);
          break;
        }
        case 'standardLost': {
          const u = this.sim.units[e.unit];
          if (!u) break;
          const p = isoToScreen(u.x, u.y);
          this.feel('standard', []);
          this.fx.ripple(p.x, p.y, 2);
          break;
        }
        case 'contact':
          if (e.side === this.me && st.pauseContact) this.autoPause(t('battle.banner.contact'));
          break;
        case 'flanked': {
          if (e.side !== this.me) break;
          // R4: the red arc on the side the blow came from
          const from = this.flankFrom(events, i, e.group);
          if (from) this.flankWatch.flanked(e.group, e.tick / TICK_RATE, from);
          if (st.pauseFlank) this.autoPause(t('battle.banner.flanked', { group: this.groupLabel(e.group) }), () => this.groupStands(e.group));
          break;
        }
        case 'rout': {
          const g = this.sim.groups[e.group];
          const c = groupCentre(this.sim, e.group);
          this.feel('rout', [], c ? isoToScreen(c.x, c.y) : undefined);
          if (e.side === this.me) hapticNotify('error');
          // a broken army's routs are told by its army banner
          if (this.sim.isBroken(e.side)) break;
          if (e.side !== this.me) {
            this.fieldBanner(t('battle.banner.foeBreaks', { group: this.groupLabel(e.group) }), 2500, () => g.routed);
            break;
          }
          const shaken = this.shakenBy(events, e.group);
          const msg = t('battle.banner.routing', { group: this.groupLabel(e.group) }) + (shaken ? `\n${t('readout.shaken', { groups: shaken })}` : '');
          if (st.pauseRout) this.autoPause(msg, () => g.routed);
          else this.fieldBanner(msg, 2500, () => g.routed, 3);
          break;
        }
        case 'cohesion':
          // R4: a ripple over each shaken neighbour
          for (const gid of new Set(e.targets.map((id) => this.sim.units[id].group))) {
            const c = gid === e.group ? null : groupCentre(this.sim, gid);
            if (!c) continue;
            const p = isoToScreen(c.x, c.y);
            this.fx.ripple(p.x, p.y, 2.5);
          }
          break;
        case 'disordered': {
          const g = this.sim.groups[e.group];
          if (!g) break;
          const key = g.side === this.me ? 'readout.disordered.ours' : 'readout.disordered.theirs';
          this.fieldBanner(t(key, { group: this.groupLabel(e.group) }), BANNER_TTL_S * 1000, () => this.sim.disordered(e.group), 3);
          break;
        }
        case 'armyBreak':
          // R4: the biggest shake, on top of the rout that broke it
          this.feel('armyBreak', []);
          this.fieldBanner(t(e.side === this.me ? 'readout.armyBreak.ours' : 'readout.armyBreak.theirs'), BANNER_TTL_S * 1000);
          break;
        case 'ability':
          this.abilityFx(e.unit, e.ability, e.targets);
          break;
        case 'proc': {
          // an item power or a set special: its icon over the hero
          const u = this.sim.units[e.unit];
          if (u) {
            const p = isoToScreen(u.x, u.y);
            this.fx.floatIcon(p.x, p.y - 44, `fxicon_power_${e.power}`);
          }
          break;
        }
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

  /**
   * Offline and on the ladder: stop the battle so the player can react. Reasons
   * within 5 s of battle time merge into one pause and one banner (RD-02).
   * Real-time locked, the message just shows.
   */
  private autoPause(msg: string, live?: () => boolean): void {
    if (this.tutorialData) return; // the tutorial pauses for itself
    if (this.realtimeLocked) {
      this.fieldBanner(msg, 2200, live);
      return;
    }
    if (this.pauseMerge.offer(this.sim.tick / TICK_RATE, { text: msg, live })) this.setPaused(true);
    this.fieldBanner(this.pauseMerge.text(), BANNER_TTL_S * 1000, () => this.pauseMerge.live(), 4);
  }

  /** A field-event banner (R4): gone after `ttlMs` (6 s at most) or once `live` is false. */
  private fieldBanner(msg: string, ttlMs: number, live?: () => boolean, maxLines = 2): void {
    this.showBanner(msg, 0, maxLines);
    this.bannerLife = new BannerLife(this.time.now, Math.min(ttlMs, BANNER_TTL_S * 1000), live);
  }

  /** Where the side or rear blow behind the `flanked` event at `i` came from (its striker, field). */
  private flankFrom(events: SimEvent[], i: number, gid: number): Vec | null {
    for (let k = i - 1; k >= 0; k--) {
      const h = events[k];
      if (h.type !== 'hit' || h.dir === 'front' || this.sim.units[h.unit]?.group !== gid) continue;
      const by = this.sim.units[h.by];
      return by ? { x: by.x, y: by.y } : null;
    }
    return null;
  }

  private groupStands(gid: number): boolean {
    return !this.sim.groups[gid]?.routed && this.sim.activeMembers(gid).length > 0;
  }

  /** The numerals of our other groups the rout of `gid` shook (its `cohesion` event in this batch), or ''. */
  private shakenBy(events: SimEvent[], gid: number): string {
    const c = events.find((e) => e.type === 'cohesion' && e.group === gid);
    if (!c || c.type !== 'cohesion') return '';
    const gids = [...new Set(c.targets.map((id) => this.sim.units[id].group))].filter((g) => g !== gid);
    return gids.map((g) => groupNumeral(this.sim.groups, g)).join(', ');
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
    reportBattle(this.verifySetup, this.sim, this.deployOrders);
    state.last = settleBattle(state.campaign, state.pending!, this.sim, this.enemyHeroes, lastBattle.heroes);
    state.pending = null;
    void state.save();
    this.scene.start('Results', {});
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
    this.leaveDialog = c;
    c.once('destroy', () => {
      if (this.overlay === c) this.overlay = null;
      if (this.leaveDialog === c) this.leaveDialog = null;
    });
  }

  /** Leave the deployment screen without fighting (back to the map or the army). */
  private leaveDeploy(): void {
    // the deployment clock may have started the battle under the dialog: leaving now would abandon it
    if (this.sim.phase !== 'deploy' || this.ending) return;
    if (this.src) {
      this.src.onLeave();
      return;
    }
    const p = state.pending;
    if (p && p.partyId !== undefined) this.scene.start('World', { encounter: p.partyId });
    else this.scene.start('Army', {});
  }

  /** Visuals for an ability: icon popping above the user, bursts, waves, sparkles. */
  private abilityFx(unit: number, id: AbilityId, targets: number[]): void {
    const u = this.sim.units[unit];
    const p = isoToScreen(u.x, u.y);
    const def = ABILITIES[id];
    this.fx.floatIcon(p.x, p.y - 44, `fxicon_${id}`);
    // R4: a flash ring in the ability's colour (not under Reduce flash, and paced), a small shake, the holder held 40 ms
    if (this.juice.flash()) this.fx.flashRing(p.x, p.y, def.color);
    this.juice.hit('ability', [], [u.id]);
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
   * Touch controls (deployment and battle, also online raids and live duels).
   * Gestures are recognised by src/ui/input/gestures.ts and a press is
   * resolved by the pure hit-test in src/ui/input/hitTest.ts (ADR-0004); the
   * scene only routes Phaser's pointer events there and carries out the result:
   * - one finger on empty ground: a drag pans the camera (always, even with a
   *   group selected); a tap moves the selected group there (see tap());
   *   a long press in deployment explains the terrain;
   * - one finger on or near the selected group or its placement marker: a drag
   *   moves it (facing and shape kept); on the facing knob ahead of it: a drag
   *   turns it in place (src/ui/dragFormation.ts); a tap selects. The shape
   *   comes only from the formation buttons;
   * - two fingers: pinch zoom and pan, never an order (cancels a pending one).
   */
  private downPointers(): Ptr[] {
    return this.input.manager.pointers.filter((q) => q.isDown);
  }

  private onDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    const cam = this.cameras.main;
    const evs = this.gestures.down(p, this.downPointers(), cam.zoom, () => {
      const w = cam.getWorldPoint(p.x, p.y);
      // a HUD control, a dialog or the controls hint under the finger takes the press
      const blocked = over.length > 0 || !!this.overlay || !!this.hint;
      // placing a work: a drag from its ghost moves the ghost, anywhere else pans (FW-03)
      const grab = blocked ? null : this.worksGhost ? this.ghostGrab(p) : hitTest(this.hitState(), p).grab;
      return { blocked, grab, at: { x: w.x, y: w.y } };
    });
    this.onGestures(evs);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    this.onGestures(this.gestures.move(p, this.downPointers(), () => (this.worksGhost ? this.worksShown() : this.selGroup >= 0 && this.canCommand())));
  }

  private onUp(p: Phaser.Input.Pointer): void {
    this.onGestures(this.gestures.up(p, this.downPointers()));
  }

  /** Carry out what the gesture recogniser made of a pointer event. */
  private onGestures(evs: GestureEvent[]): void {
    const cam = this.cameras.main;
    for (const e of evs) {
      switch (e.type) {
        case 'pinch-start':
          this.cancelGesture();
          this.setFollow(false);
          cam.panEffect.reset();
          break;
        case 'pinch': {
          const z = Phaser.Math.Clamp(e.zoom, camZoom(1), camZoom(3));
          cam.setZoom(z);
          cam.scrollX -= e.dx / z;
          cam.scrollY -= e.dy / z;
          break;
        }
        case 'pinch-end':
          this.setZoom(Math.round(zoomUnits(cam.zoom)));
          if (Math.abs(cam.zoom - e.z0) > 0.05) this.tutorialEvent({ kind: 'zoom' });
          break;
        case 'press': {
          this.holdTimer?.remove();
          this.holdTimer = null;
          const g = e.press;
          // long press on the ground in deployment: what is this terrain?
          if (this.sim.phase === 'deploy' && !g.grab) {
            this.holdTimer = holdTimer(this, longPress.ms, () => {
              if (this.gestures.hold(g)) this.showTerrainInfo(g.at.x, g.at.y, g.sx, g.sy);
            });
          }
          break;
        }
        case 'pan':
          this.setFollow(false);
          cam.panEffect.reset();
          cam.scrollX -= e.dx / cam.zoom;
          cam.scrollY -= e.dy / cam.zoom;
          this.tutorialEvent({ kind: 'pan', px: Math.hypot(e.dx, e.dy) / RS });
          break;
        case 'drag-start':
          this.setFollow(false); // the field must stay put under the finger
          if (this.worksGhost) this.worksDrag = true;
          else this.drag = this.startDrag(e.at, e.kind);
          break;
        case 'drag-move': {
          const w = cam.getWorldPoint(e.x, e.y);
          const f = screenToIso(w.x, w.y);
          // the ghost follows the finger, snapping to cells
          if (this.worksDrag) {
            this.moveGhost(f.x, f.y);
            break;
          }
          if (!this.drag) break;
          this.dragFeedback(dragMove(this.drag, f.x, f.y));
          this.updateDragPreview(this.drag);
          break;
        }
        case 'release':
          this.holdTimer?.remove();
          this.holdTimer = null;
          this.hideTerrainInfo();
          break;
        case 'tap':
          this.dragPreview = null;
          if (this.worksTap(e.x, e.y)) break;
          this.tap(e.x, e.y);
          break;
        case 'drag-end': {
          // lift to place (a ghost on invalid ground stays, and says why)
          if (this.worksDrag) {
            this.worksDrag = false;
            this.placeWork();
            break;
          }
          const plan = this.drag ? dragPlan(this.drag) : null;
          this.drag = null;
          this.dragPreview = null;
          if (plan) {
            // the knob sends `face` in battle, which keeps the order (controls.md R2.2)
            this.command(dragOrder(plan, this.sim.phase));
            this.tutorialEvent({ kind: 'sling', carried: plan.kind === 'move', aimed: plan.kind === 'turn', fx: plan.fx, fy: plan.fy, group: this.selGroup });
          }
          break;
        }
      }
    }
  }

  private setZoom(z: number): void {
    const cam = this.cameras.main;
    const target = camZoom(Phaser.Math.Clamp(z, 1, 3));
    if (target !== cam.zoom) this.setFollow(false);
    this.tweens.add({ targets: cam, zoom: target, duration: 120 });
    // the zoom key says the zoom it settles at
    this.zoomTo = Math.round(zoomUnits(target));
    if (this.zoomBtn && this.zoomBtn.opts.label !== `${this.zoomTo}×`) this.buildHud();
  }

  /** The zoom key (A11Y-14): 1x, 2x, 3x, then back to 1x, about the screen's centre. */
  private stepZoom(): void {
    this.setZoom(nextZoom(zoomUnits(this.cameras.main.zoom)));
    haptic('light');
    this.tutorialEvent({ kind: 'zoom' });
  }

  /** Drop any pending or half-done one-finger gesture (a second finger came down). */
  private cancelGesture(): void {
    this.drag = null;
    this.dragPreview = null;
    this.holdTimer?.remove();
    this.holdTimer = null;
    this.hideTerrainInfo();
  }

  /**
   * The field as the hit-test sees it now, in screen px through the battle
   * camera: the men a tap can pick, the group tags, and the selection's body
   * and facing knob a drag can grab (only while it can take orders).
   */
  private hitState(): HitState {
    const cam = this.cameras.main;
    const scr = (wx: number, wy: number): Pt => ({ x: (wx - cam.worldView.x) * cam.zoom, y: (wy - cam.worldView.y) * cam.zoom });
    const S = this.m.S;
    const hide = this.hideFoes();
    const units: HitState['units'] = [];
    for (const v of this.views) {
      const u = v.u;
      if (u.state === 'dead' || u.state === 'fled' || (hide && u.side === this.foe)) continue;
      units.push({ id: u.id, side: u.side, group: u.group, big: v.big, ...scr(v.spr.x, v.spr.y - v.tall * 0.45) });
    }
    const tags = [...this.tagPos].map(([gid, q]) => ({ gid, x: q.x * S, y: q.y * S }));
    const hs: HitState = { me: this.me, sel: this.selGroup, grabbable: false, body: [], knob: null, tags, units, grabR: GRAB_PX, tagR: TAG_PX, unitR: UNIT_TAP_PX };
    if (this.selGroup < 0 || this.sim.phase === 'ended' || !this.canCommand()) return hs;
    const grp = this.sim.groups[this.selGroup];
    if (!grp || grp.disbanded) return hs;
    hs.grabbable = true;
    const solo = this.selUnit >= 0 && !grp.individual;
    const members = solo ? [this.sim.units[this.selUnit]] : this.sim.activeMembers(grp.id);
    const ids = new Set(members.map((u) => u.id));
    for (const v of this.views) if (ids.has(v.u.id)) hs.body.push(scr(v.spr.x, v.spr.y - v.tall / 2), scr(v.spr.x, v.spr.y));
    if (!solo) {
      for (const s of [...this.sim.groupSlots(grp.id), { x: grp.formation.cx, y: grp.formation.cy }]) {
        const w = isoToScreen(s.x, s.y);
        hs.body.push(scr(w.x, w.y));
      }
    }
    const k = this.knobOf();
    if (k) {
      const kw = isoToScreen(k.x, k.y);
      hs.knob = scr(kw.x, kw.y);
    }
    return hs;
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

  private startDrag(at: Pt, kind: DragKind): DragState {
    const fr = this.selectedFrame()!;
    const press = screenToIso(at.x, at.y);
    // thresholds are in paces at the default zoom (1: a pace is 36 px across a tile) and scale with zoom
    const k = 1 / zoomUnits(this.cameras.main.zoom);
    haptic('light');
    // in battle the knob sends `face`, which turns a group about its anchor: the preview pivots there too
    const g = kind === 'turn' && this.sim.phase === 'battle' ? { ...fr, px: undefined, py: undefined } : fr;
    return dragStart(kind, g, press.x, press.y, k);
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
    c.add(mosaicImage(this, x, y, w, h, 'parchment'));
    c.add(mtext(this, VW / 2, y + 6, caps(t('battle.hint.title')), 'rInk', { align: 0.5, maxW: w - 12 }));
    let ty = y + 18;
    for (const lines of paras) {
      c.add(addText(this, x + 7, ty, lines.join('\n'), 'pInk'));
      ty += lines.length * LINE_H + 4;
    }
    c.add(addText(this, VW / 2, y + h - 11, ellipsize(t('battle.hint.dismiss'), w - 8), 'pSec', 0.5));
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
    const walls: { i: number; kind: 'palisade' | 'rampart' }[] = [];
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
      } else if (d.kind === 'palisade' || d.kind === 'rampart') {
        walls.push({ i, kind: d.kind });
      }
    }
    // an assault field's palisade and rampart (campaign-arc.md R2), sorted with the men like the works
    for (const s of workSprites([], walls, this.workGrid())) this.addWorkSprite(s);
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
    c.add(mosaicImage(this, x, y, w, h, 'parchment'));
    let ty = y + 5;
    wrapped.forEach((l, i) => {
      c.add(addText(this, x + 6, ty, l.join('\n'), i === 0 ? 'pBad' : 'pInk'));
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

  /** A tap on the field (screen px): select, attack or move, as the hit-test resolves it. */
  private tap(x: number, y: number): void {
    // facing pips open: a tap off them closes them (a pip itself is a HUD button)
    if (this.pips) {
      this.closePips();
      return;
    }
    const hs = this.hitState();
    // the facing pips, the single-tap alternative to the knob drag (A11Y-14): a tap on the knob in battle, or
    // (both phases) on the selected group's own field badge. In deployment a tap on the knob's spot stays a
    // tap-move there (the ground under the knob is a common place to send the group a few paces forward)
    const hit = hitTest(hs, { x, y }).tap;
    const ownTag = hit.kind === 'tag' && hit.gid === this.selGroup && this.selUnit < 0;
    if (ownTag || (this.sim.phase === 'battle' && grabAt(hs, { x, y }) === 'turn')) {
      this.openPips();
      return;
    }
    if (hit.kind === 'tag') {
      // a floating group tag (a map marker) selects its group
      const g = this.sim.groups[hit.gid];
      this.selGroup = hit.gid;
      this.selUnit = g.individual ? this.sim.activeMembers(hit.gid)[0]?.id ?? -1 : -1;
      haptic('light');
      this.buildHud();
      return;
    }
    if (hit.kind === 'own') {
      const sel = tapSelect({ group: this.selGroup, unit: this.selUnit }, { id: hit.unit, group: hit.group }, this.sim.groups[hit.group].individual);
      this.selGroup = sel.group;
      this.selUnit = sel.unit;
      haptic('light');
      this.buildHud();
      return;
    }
    if (hit.kind === 'enemy') {
      const foe = this.sim.units[hit.unit];
      if (this.selGroup >= 0 && this.canCommand() && this.sim.phase === 'battle') {
        // missile groups focus their fire on the tapped group, melee groups attack (controls.md R3.1, R3.2)
        const gid = this.selUnit >= 0 ? this.sim.units[this.selUnit].group : this.selGroup;
        const act = enemyTap(this.sim, gid, foe.group);
        if (act.kind === 'focus') this.setFocus(act.target);
        else this.attackUnit(foe);
      } else {
        const h = this.enemyHeroes.find((q) => q.id === foe.heroId);
        const wpn = h?.equip.weapon ? itemName(h.equip.weapon.def) : t('battle.unarmed');
        this.showBanner(`${foe.name} - ${wpn}`, 1800);
      }
      return;
    }
    if (this.selGroup >= 0 && this.canCommand()) {
      const grp = this.sim.groups[this.selGroup];
      const f = grp.formation;
      const w = this.cameras.main.getWorldPoint(x, y);
      const fp = screenToIso(w.x, w.y);
      const face = this.faceEnemyFrom(fp.x, fp.y) ?? { x: f.fx, y: f.fy };
      const solo = this.selUnit >= 0 ? this.sim.units[this.selUnit] : null;
      const from = solo ? { x: solo.x, y: solo.y } : groupCentre(this.sim, this.selGroup);
      const n = this.selUnit >= 0 && !grp.individual ? 1 : Math.max(1, this.sim.activeMembers(grp.id).length);
      this.command({ kind: 'form', group: -1, cx: fp.x, cy: fp.y, fx: face.x, fy: face.y, frontage: this.selUnit >= 0 && !grp.individual ? 1 : f.frontage });
      // the tap-move preview: a path line and a ghost at the destination for TAP_GHOST_MS (R5)
      const l = Math.hypot(face.x, face.y) || 1;
      if (from) this.tapGhost = { gid: this.selGroup, from, cx: fp.x, cy: fp.y, fx: face.x / l, fy: face.y / l, frontage: n === 1 ? 1 : f.frontage, type: n === 1 ? 'line' : f.type, n, until: this.time.now + TAP_GHOST_MS };
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
    this.command({ kind: 'order', group: -1, order: 'charge' }, true);
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
  private command(o: Order, join = false): void {
    if (this.selGroup < 0) return;
    let gid = this.selGroup;
    let solo = -1;
    const detach = this.selUnit >= 0 && !this.sim.groups[this.sim.units[this.selUnit].group].individual && !this.src?.lockstep;
    // paused offline: hold the order in the plan, issued on Play (R6.1); a soldier's detach is not staged (his new group has no id yet)
    if (this.staging() && !detach) {
      if (this.selUnit >= 0) gid = this.selGroup = this.sim.units[this.selUnit].group;
      this.plan.add({ ...o, group: gid } as Order);
      this.afterCommand(o, gid, join);
      this.showBanner(t('queue.banner.staged', { n: this.plan.size }), 1400);
      haptic('medium');
      this.hudDirty = true;
      this.buildHud();
      return;
    }
    if (this.selUnit >= 0) {
      const u = this.sim.units[this.selUnit];
      // (A duel cannot know the new group's id before the relay applies the detach: command the group.)
      if (detach) {
        this.order({ kind: 'detach', unit: u.id });
        solo = u.id;
      }
      gid = u.group;
      this.selGroup = gid;
    }
    const withGroup = { ...o, group: gid } as Order;
    // undoing an order that detached a man sends him back to his group
    this.recordUndo(withGroup, solo >= 0 ? [{ kind: 'rejoin', unit: solo }] : inverseOf(withGroup, this.sim), join);
    this.order(withGroup);
    this.afterCommand(o, gid, join);
    haptic('medium');
    this.hudDirty = true;
    this.buildHud();
  }

  // ---- the order queue (controls.md R5, R6; CT-04): staging while paused, the one-step Then…, previews

  /** Paused offline in battle: orders go to the plan, not the sim (R6.1). Never online: those battles never pause. The tutorial: only in its planning steps. */
  private staging(): boolean {
    return this.paused && !this.realtimeLocked && (!this.tutorialData || this.tutAllow.plan) && this.sim.phase === 'battle';
  }

  /** Then… is offered: offline battles only (R10b: live online shows no Then chip); the tutorial, once its step comes. */
  private thenAllowed(): boolean {
    return (this.tutorialData ? this.tutAllow.then : this.unlocks.then) && this.sim.phase === 'battle';
  }

  /** The clock of the Undo and Then… windows: the scene's, or in the tutorial one that stops while the narrator waits. */
  private chipNow(): number {
    return this.tutorialData ? this.tutClock : this.time.now;
  }

  /** After an order to `gid`: a move clears its queued step and offers Then… for THEN_CHIP_S; anything else ends the offer. */
  private afterCommand(o: Order, gid: number, join: boolean): void {
    if (this.sim.phase !== 'battle') return;
    this.thenArming = -1;
    if (o.kind === 'form') {
      // a new move order clears the queue (R6.2), and the tap-move preview follows a tap (R5)
      this.thenQ.clear(gid);
      this.thenOffer = this.thenAllowed() ? { gid, at: this.chipNow() } : null;
    } else if (join || this.thenOffer?.gid === gid) this.thenOffer = null;
  }

  /** The Then… chip is live: just after a move of the selected group (or while it is arming). */
  private thenChipLive(): boolean {
    if (!this.thenAllowed() || this.selGroup < 0) return false;
    if (this.thenArming >= 0) return this.thenArming === this.selGroup;
    const o = this.thenOffer;
    return !!o && o.gid === this.selGroup && this.chipNow() - o.at < THEN_CHIP_S * 1000 && this.sim.activeMembers(o.gid).length > 0;
  }

  /** Tap Then…: arm (the next order key is queued), or disarm on a second tap. */
  private toggleThen(): void {
    if (this.thenArming >= 0) {
      this.thenArming = -1;
      this.hideBanner();
    } else {
      this.thenArming = this.selGroup;
      this.showBanner(t('queue.banner.arm'), 0);
    }
    haptic('light');
    this.buildHud();
  }

  /** An order key while Then… is armed: queue it on arrival for that group (one step, R6.2). */
  private queueThen(key: ThenKey): void {
    const gid = this.thenArming;
    this.thenArming = -1;
    this.thenOffer = null;
    if (gid < 0) return;
    this.thenQ.arm(gid, key, this.sim);
    // Undo clears the queued step (R4.1): an undo step with no orders of its own
    if (!this.staging()) {
      this.battleUndo.push([], [gid], this.chipNow());
      const step = this.battleUndo.peek(this.chipNow());
      if (step) this.thenSteps.add(step);
    }
    this.showBanner(t('queue.banner.queued', { order: thenLabel(key) }), 1400);
    haptic('medium');
    this.hudDirty = true;
    this.buildHud();
  }

  /** Cancel the queued step of the selected group (its "→ Charge" chip). */
  private cancelThen(gid: number): void {
    if (!this.thenQ.clear(gid)) return;
    this.showBanner(t('queue.banner.cancel'), 1200);
    haptic('light');
    this.hudDirty = true;
    this.buildHud();
  }

  /** Each frame while the battle runs: a queued step whose group has arrived (F1) is issued as an ordinary order now. */
  private fireThen(): void {
    if (!this.thenQ.size || this.sim.phase !== 'battle' || this.paused) return;
    const due = this.thenQ.due(this.sim);
    if (!due.length) return;
    for (const o of due) {
      this.recordUndo(o, inverseOf(o, this.sim));
      this.order(o);
      const key: ThenKey = o.kind === 'loose' ? 'loose' : o.kind === 'order' && o.order !== 'feint' ? o.order : 'hold';
      this.showBanner(t('queue.banner.fired', { order: thenLabel(key) }), 1200);
    }
    haptic('medium');
    this.hudDirty = true;
    this.buildHud();
  }

  /** Play: the plan's orders go to the sim in the order given, at the resume tick (the tick they would have had while paused). */
  private flushPlan(): void {
    if (!this.plan.size) return;
    for (const o of this.plan.flush()) this.order(o);
    // the plan is given: its steps are not one order to take back
    this.battleUndo.clear();
    this.showBanner(t('queue.banner.issued'), 900);
  }

  /** Clear plan, or remove one group's staged orders (the ✕ on its ghost). */
  private clearPlan(gid = -1): void {
    if (gid < 0) this.plan.clear();
    else this.plan.removeGroup(gid);
    this.clearPlanFeedback(t(gid < 0 ? 'queue.banner.cleared' : 'queue.banner.removed'));
  }

  private clearPlanFeedback(msg: string): void {
    this.showBanner(msg, 900);
    haptic('medium');
    this.hudDirty = true;
    this.buildHud();
  }

  /** Keep a ✕ on each staged group's ghost (a 44 pt key, R6.1 "a ✕ on each ghost"), following the camera. */
  private updateGhostBtns(): void {
    const want = this.staging() ? this.plan.groups() : [];
    for (const [gid, b] of this.ghostBtns) {
      if (!want.includes(gid) || !b.active) {
        if (b.active) b.destroy();
        this.ghostBtns.delete(gid);
      }
    }
    if (!want.length) return;
    const cam = this.cameras.main;
    const S = this.m.S;
    for (const gid of want) {
      const f = this.stagedFormation(gid);
      const n = this.sim.activeMembers(gid).length;
      // behind the ghost (its arrows point ahead); no move staged: behind the group itself
      const sl = f && n > 0 ? formationSlots(f, n) : this.sim.activeMembers(gid);
      if (!sl.length) continue;
      const fr = f ?? this.sim.groups[gid].formation;
      const w = isoToScreen(sl.reduce((q, p) => q + p.x, 0) / sl.length - fr.fx * 1.8, sl.reduce((q, p) => q + p.y, 0) / sl.length - fr.fy * 1.8);
      const x = Math.round(((w.x - cam.worldView.x) * cam.zoom) / S) - 11;
      const y = Math.round(((w.y - cam.worldView.y) * cam.zoom) / S) - 11;
      let b = this.ghostBtns.get(gid);
      if (!b) {
        b = new KeyButton(this, x, y, 22, 22, { label: t('queue.tip.ghost'), tip: t('queue.tip.ghost'), icon: 'close', iconOnly: true, variant: 'stone', id: `battle.plan.ghost.${groupNumeral(this.sim.groups, gid)}`, onClick: () => this.clearPlan(gid) });
        this.tags.add(b);
        this.ghostBtns.set(gid, b);
      }
      b.setPosition(x, y);
    }
  }

  /** Where the plan puts group `gid`: its formation with the staged form, face and shape applied (null: no move staged). */
  private stagedFormation(gid: number): { cx: number; cy: number; fx: number; fy: number; frontage: number; type: FormationType } | null {
    const g = this.sim.groups[gid];
    if (!g) return null;
    const f = { cx: g.formation.cx, cy: g.formation.cy, fx: g.formation.fx, fy: g.formation.fy, frontage: g.formation.frontage, type: g.formation.type };
    let moved = false;
    for (const o of this.plan.orders) {
      if (!('group' in o) || o.group !== gid) continue;
      if (o.kind === 'form') {
        const l = Math.hypot(o.fx, o.fy);
        Object.assign(f, { cx: o.cx, cy: o.cy, frontage: o.frontage }, l > 1e-6 ? { fx: o.fx / l, fy: o.fy / l } : {}, o.type ? { type: o.type } : {});
        moved = true;
      } else if (o.kind === 'face') {
        const l = Math.hypot(o.fx, o.fy) || 1;
        f.fx = o.fx / l;
        f.fy = o.fy / l;
        moved = true;
      } else if (o.kind === 'preset') {
        f.type = o.type;
        f.frontage = presetFrontage(o.type, Math.max(1, this.sim.activeMembers(gid).length));
        moved = true;
      }
    }
    return moved ? f : null;
  }

  // ---- undo (controls.md R4): inverse orders, through order() like any other (the log, the server and the relay see only orders)

  /** Remember how to undo `o` (null: it cannot be). In battle a new order replaces the last one's undo. */
  private recordUndo(o: Order, inverse: Order[] | null, join = false): void {
    if (this.sim.phase === 'ended') return;
    const h = this.sim.phase === 'deploy' ? this.deployUndo : this.battleUndo;
    if (!inverse) {
      if (!join) h.clear();
      return;
    }
    h.push(inverse, groupsOf(o, this.sim), this.chipNow(), join);
  }

  /** The battle step still undoable: in time, and its group still stands (else the chip goes). */
  private liveBattleUndo(): boolean {
    if (this.sim.phase !== 'battle') return false;
    const s = this.battleUndo.peek(this.chipNow());
    if (!s) return false;
    const stands = s.groups.some((gid) => {
      const g = this.sim.groups[gid];
      if (!g) return false;
      // a detached man's step names his solo group: it stands while he does
      return !g.disbanded && !g.routed && this.sim.activeMembers(gid).length > 0;
    });
    if (!stands) this.battleUndo.clear();
    return stands;
  }

  /** Undo the last step: the last order in battle (within UNDO_S), else the last deployment change. */
  private undo(): void {
    const deploy = this.sim.phase === 'deploy';
    // paused with a plan: Undo takes back the newest staged order (R6.1)
    if (this.staging() && this.plan.size) {
      this.plan.pop();
      this.clearPlanFeedback(t('queue.banner.removed'));
      this.tutorialEvent({ kind: 'undo' });
      return;
    }
    if (!deploy && !this.liveBattleUndo()) return;
    const step = (deploy ? this.deployUndo : this.battleUndo).pop(this.chipNow());
    if (!step) {
      if (deploy) toast(this, t('undo.why.none'));
      return;
    }
    // undoing a Then… clears the queued step (R4.1)
    if (this.thenSteps.has(step)) {
      for (const g of step.groups) this.thenQ.clear(g);
      this.clearPlanFeedback(t('queue.banner.cancel'));
      this.tutorialEvent({ kind: 'undo' });
      return;
    }
    for (const o of step.orders) {
      this.order(o);
      if (o.kind === 'assign') this.syncHeroGroup(o.unit);
      if (o.kind === 'rejoin' && this.selUnit === o.unit) {
        this.selGroup = this.sim.units[o.unit].homeGroup;
        this.selUnit = -1;
      }
    }
    if (deploy) {
      for (const v of this.views) {
        v.px = v.u.x;
        v.py = v.u.y;
      }
    }
    haptic('medium');
    this.showBanner(t(deploy ? 'undo.banner.deploy' : 'undo.banner.done'), 900);
    this.hudDirty = true;
    this.buildHud();
    this.tutorialEvent({ kind: 'undo' });
  }

  /** Offline: a man's group in the deployment is his group in the army (saved), as the Groups sheet does. */
  private syncHeroGroup(unit: number): void {
    if (this.src) return;
    const u = this.sim.units[unit];
    const gi = this.sim.groups.filter((g) => g.side === this.me && !g.individual).findIndex((g) => g.id === u.group);
    if (gi < 0 || gi > 3) return;
    this.views[unit].hero.group = gi;
    void state.save();
  }

  /** Keep the battle Undo chip in step with its 3 s window (it fades for the last half second). */
  private updateUndoChip(): void {
    if (this.liveBattleUndo() !== this.undoLive) {
      this.buildHud();
      return;
    }
    if (this.undoChip) this.undoChip.setAlpha(this.battleUndo.left(this.chipNow()) < 500 ? 0.55 : 1);
  }

  private firstPlayerGroup(): number {
    const g = this.sim.groups.find((x) => x.side === this.me && !x.disbanded && this.sim.activeMembers(x.id).length > 0);
    return g ? g.id : -1;
  }

  // ===================================================================== HUD

  setPaused(p: boolean): void {
    if (p && this.realtimeLocked) return; // live duels, raids and attacks never pause
    // Play issues the staged plan at the resume tick (controls.md R6.1)
    if (!p && this.paused) this.flushPlan();
    this.paused = p;
    this.refreshStrip();
    this.hudDirty = true;
    if (!p && this.banner && this.bannerTimer === null && !this.netBanner) this.hideBanner();
  }

  private togglePause(): void {
    if (this.sim.phase !== 'battle' || this.realtimeLocked) return;
    const play = this.paused;
    this.setPaused(!this.paused);
    if (play) this.tutorialEvent({ kind: 'play' });
  }

  /** A message under the top bar (ms = 0: stays until replaced or hidden); it wraps to `maxLines` (A11Y-10: never cut). */
  showBanner(msg: string, ms: number, maxLines = 2): void {
    this.hideBanner();
    const { VW } = this.m;
    const c = this.add.container(0, 0);
    // under the top bar, in the hint's place (the hint hides while a banner shows)
    const left = 0;
    const maxW = VW - 60;
    const lines = wrapText(msg, maxW - 12, maxLines).lines;
    const w = Math.max(60, Math.min(maxW, Math.max(...lines.map((l) => measureText(l))) + 14));
    const sub = ms === 0 && this.paused && this.sim.phase === 'battle' ? wrapText(t('battle.banner.paused'), maxW - 12, 3, false, 6.5).lines : [];
    const subW = sub.length ? Math.max(...sub.map((l) => measureText(l, false, 6.5))) + 14 : 0;
    const bw = Math.min(maxW, Math.max(w, subW));
    const h = lines.length * LINE_H + 8 + Math.ceil((sub.length * LINE_H * 6.5) / 7);
    const x = Math.round(left + (VW - left - bw) / 2);
    const y = this.bannerTop();
    c.add(mosaicImage(this, x, y, bw, h, 'parchment'));
    const txt = addText(this, x + bw / 2, y + 4, lines.join('\n'), 'pInk', 0.5);
    txt.setCenterAlign();
    c.add(txt);
    if (sub.length) c.add(addText(this, x + bw / 2, y + 4 + lines.length * LINE_H, sub.join('\n'), 'pSec', 0.5).setFontSize(6.5).setCenterAlign());
    this.ui.add(c);
    this.banner = c;
    this.hintPill?.setText('');
    this.sitKey = '';
    this.bannerTimer = ms > 0 ? this.time.delayedCall(ms, () => this.hideBanner()) : null;
  }

  hideBanner(): void {
    this.bannerLife = null;
    this.bannerTimer?.remove();
    this.bannerTimer = null;
    this.banner?.destroy();
    this.banner = null;
    this.sitKey = '';
  }

  buildHud(): void {
    this.hud.removeAll(true);
    this.undoChip = null;
    this.undoLive = this.liveBattleUndo();
    // Then… arms one group: selecting another lets it go
    if (this.thenArming >= 0 && this.thenArming !== this.selGroup) this.thenArming = -1;
    this.thenLive = this.thenChipLive();
    this.cards = [];
    this.abilityBtns = [];
    this.followBtn = null;
    this.cmdBtns.clear();
    this.feintBar = null;
    this.stdBtn = null;
    this.zoomBtn = null;
    this.railW = 0;
    // the attention budget (R10b): at most 4 kinds of interactive control at once; open pips push out the timed chips
    if (this.pips && (this.pips.gid !== this.selGroup || !this.canCommand() || this.shapeOpen)) this.pips = null;
    const want: ControlKind[] = ['cards', 'orders', 'medallions', 'chips'];
    if (this.pips) want.push('pips');
    this.kinds = visibleKinds(want);
    this.heroInfo = null;
    this.countdown = null;
    this.top = null;
    this.hintPill = null;
    this.sitKey = '';
    this.buildSheet();
    this.buildTop();
    this.buildMedallions();
    this.buildPips();
    if (this.shapeOpen) this.buildShapeSheet();
    if (this.worksOpen && !this.worksGhost && this.worksShown()) this.buildWorksTray();
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
    // following the fight: a small eye at the field's top right (battle only); left-hand mode mirrors it (A11Y-16)
    const pillW = VW - 2 * 30;
    if (this.sim.phase === 'battle') {
      const fb = new KeyButton(this, mirrorX(VW - 26, 22, VW, this.leftHand), this.cornerY(this.leftHand), 22, 22, { icon: 'eye', iconOnly: true, label: this.follow ? t('battle.strip.follow') : t('battle.strip.watch'), lit: this.follow, tip: t('battle.tip.follow'), id: 'battle.follow', onClick: () => this.toggleFollow() });
      this.hud.add(fb);
      this.followBtn = fb;
    }
    // the zoom key (A11Y-14): a single-tap alternative to the pinch, in the top corner away from the rail
    if (this.sim.phase !== 'ended') {
      const z = this.zoomTo || Math.round(zoomUnits(this.cameras.main.zoom));
      this.zoomBtn = new KeyButton(this, mirrorX(4, 22, VW, this.leftHand), this.cornerY(!this.leftHand), 22, 22, { label: `${z}×`, tip: t('attn.tip.zoom'), id: 'battle.zoom', variant: 'bronze', plain: true, onClick: () => this.stepZoom() });
      this.hud.add(this.zoomBtn);
    }
    this.hintPill = new HintPill(this, VW / 2, this.bannerTop(), pillW);
    this.hud.add(this.hintPill);
    if (this.dclock && this.sim.phase === 'deploy') {
      // the online deployment's draining bar along the top bar's bottom edge
      const bar = this.add.graphics();
      this.hud.add(bar);
      this.countdown = { bar, shown: -1 };
      this.updateCountdown();
    }
  }

  /** Top of a field corner key (the eye, the zoom key): Z2 of hud.md §C; a beast battle's boss bar runs between them. */
  private cornerY(_left: boolean): number {
    return TOP_H + 4;
  }

  /** Top of Z3 (banners, the Paused pill, the hint): under the corner keys' row, so never over the boss bar (BTL-1). */
  private bannerTop(): number {
    return TOP_H + 4 + (this.beasts?.hasBar ? 24 : 0);
  }

  private topOpts(): TopBarOpts {
    const ended = this.sim.phase === 'ended';
    // Z1 (hud.md §C): the ⋯ battle menu holds Leave, Reset all, Retreat, Sound and Settings (ELEMENT_MAP E179, E183, E195, E208)
    const menu: StripSlot = { icon: 'menu', label: t('battle.menu.key'), tip: t('battle.menu.tip'), id: 'battle.menu', onClick: () => this.openMenu() };
    if (this.sim.phase === 'deploy' || this.realtimeLocked) return { menu, leftHand: this.leftHand };
    return {
      menu,
      pause: this.paused
        ? { icon: 'play', label: t('battle.strip.play'), tip: t('battle.tip.pause'), id: 'battle.play', off: ended ? t('battle.why.over') : undefined, onClick: () => this.togglePause() }
        : { icon: 'pause', label: t('battle.strip.pause'), tip: t('battle.tip.pause'), id: 'battle.pause', off: ended ? t('battle.why.over') : undefined, onClick: () => this.togglePause() },
      speed: { icon: 'fast', label: speedLabel(this.speed), selected: this.speed !== 1, tip: t('pace.tip.speed', { list: SPEEDS[this.pace].map(speedLabel).join(', ') }), id: 'battle.speed', off: ended ? t('battle.why.over') : undefined, onClick: () => this.toggleSpeed() },
      // paused, Play is the one thing to do next
      primary: this.paused && !ended,
      leftHand: this.leftHand,
    };
  }

  /**
   * The ⋯ battle menu (hud.md §D, BTL-01). Opening it pauses an offline fight;
   * closing it without a pick lets the fight run on as it was. Under
   * `realtimeLocked` it never pauses and offers only Retreat and Sound (A11Y-18).
   */
  openMenu(): BattleMenuHandle | null {
    if (this.menu && !this.menu.closed) return this.menu;
    if (this.overlay) return null;
    const fighting = this.sim.phase === 'battle';
    const wasPaused = this.paused;
    if (fighting && !this.paused && !this.realtimeLocked && !this.tutorial) this.setPaused(true);
    const restore = () => {
      if (fighting && !wasPaused && this.paused && this.sim.phase === 'battle') this.setPaused(false);
    };
    const st = state.campaign.data.settings;
    this.menu = openBattleMenu(this, {
      state: { phase: this.sim.phase === 'deploy' ? 'deploy' : fighting ? 'battle' : 'ended', realtimeLocked: this.realtimeLocked, tutorial: !!this.tutorial, online: !!this.src },
      soundOn: () => st.sound !== false,
      toggleSound: () => {
        st.sound = st.sound === false;
        audio.refresh();
        void state.save();
      },
      onDismiss: restore,
      onPick: (item) => {
        if (item === 'retreat') {
          // the retreat confirm pauses on its own and resumes on Stay
          restore();
          this.openRetreat();
        } else if (item === 'leave') this.confirmLeaveDeploy();
        else if (item === 'resetAll') this.resetDeploy();
        else if (item === 'skip') this.tutorial?.askSkip();
        // Settings keeps the fight paused while it is open (ELEMENT_MAP E208)
        else openSettings(this, () => this.settingsClosed());
      },
    });
    return this.menu;
  }

  /** Reduce shake and Reduce flash (A11Y-13; missing = follow Reduce motion) and the speed, into the feel state. */
  private feelSettings(): void {
    const st = state.campaign.data.settings;
    this.juice.shakeOff = shakeReduced(st);
    this.juice.flashOff = flashReduced(st);
    this.juice.speed = this.speed;
  }

  /**
   * The shake (F1) on the main camera: last frame's offset comes off the
   * scroll and this frame's goes on, so the follow camera never drifts with
   * it. UI px → world px. Under Reduce shake, paused or at rest the offset is
   * 0 and the scroll is left alone.
   */
  private applyShake(): void {
    const cam = this.cameras.main;
    const o = this.juice.offset();
    if (!o.x && !o.y && !this.shook.x && !this.shook.y) return;
    const k = this.m.S / cam.zoom;
    const bx = cam.scrollX - this.shook.x;
    const by = cam.scrollY - this.shook.y;
    const nx = cam.useBounds ? cam.clampX(bx + o.x * k) : bx + o.x * k;
    const ny = cam.useBounds ? cam.clampY(by + o.y * k) : by + o.y * k;
    cam.setScroll(nx, ny);
    this.shook = { x: nx - bx, y: ny - by };
  }

  /**
   * A field event's feel (R4): its shake and hit-stop through the juice
   * state, and its dust (`dust` particles, `color`) at a world-pixel point.
   */
  private feel(kind: JuiceKind, groups: number[], at?: { x: number; y: number }, color = DUST): void {
    this.juice.hit(kind, groups);
    const n = JUICE_TIERS[kind].dust;
    if (at && n) this.fx.burst(at.x, at.y - 2, color, n, { speed: kind === 'rout' ? 26 : 16, up: 8, grav: 30, life: kind === 'rout' ? 0.9 : 0.5, small: kind === 'kill' });
  }

  /** Settings closed over the battle: Reduce shake and flash apply at once, and a changed Left-hand setting (A11Y-16) moves the HUD. */
  private settingsClosed(): void {
    if (!this.scene.isActive()) return;
    this.feelSettings();
    const left = !!state.campaign.data.settings.leftHand;
    if (left === this.leftHand) return;
    this.leftHand = left;
    this.buildHud();
  }

  /** Swap the top bar's actions (pause / play, speed) without rebuilding the HUD. */
  private refreshStrip(): void {
    this.top?.set(this.topOpts());
  }

  /** The sentence, the clock and the strength row for this moment (rebuilt only when they change). */
  private refreshSituation(): void {
    if (!this.top || !this.hintPill) return;
    const sim = this.sim;
    const deploy = sim.phase === 'deploy';
    let sentence: string;
    let tone: HintTone = 'info';
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
        tone = 'paused';
      } else if (engaged && ours - theirs > 25) sentence = t('battle.sit.winning');
      else if (engaged && theirs - ours > 25) {
        sentence = t('battle.sit.losing');
        tone = 'alert';
      } else if (engaged) sentence = t('battle.sit.contact', { ours, theirs });
      else if (sel && !sel.disbanded && sim.activeMembers(sel.id).length > 0) {
        const numeral = this.cards.find((c) => c.gid === sel.id)?.numeral ?? '';
        const name = sel.individual ? sim.members(sel.id)[0]?.name ?? '' : `${groupName(sel.name)} ${numeral}`.trim();
        const soon = this.contactSoon.check(sim, sel.id, sim.tick / TICK_RATE);
        sentence = t(soon ? 'battle.sit.marching' : 'battle.sit.moving', { group: name, order: sel.routed ? t('battle.order.routed') : t(`battle.order.${sel.order}` as TKey) });
      } else sentence = this.realtimeLocked ? t('battle.sit.online') : t('battle.sit.idle');
      const tk = this.ticketSecs >= 0 && sim.phase === 'battle' ? this.ticketStage : 0;
      // a ladder floor's last minutes: the clock counts down the ticket instead (controls.md R10)
      if (tk) this.top.setTime(fmtClock(this.ticketSecs), t(tk === 2 ? 'pace.expiredShort' : 'pace.left'), true);
      else this.top.setTime(fmtClock(Math.floor(sim.tick / TICK_RATE)), this.speed > 1 ? t('battle.num.fast') : this.speed < 1 ? t('pace.slow') : this.realtimeLocked ? t('battle.strip.live') : t('battle.top.time'));
      this.top.setRow({ ours, theirs, you: t('battle.top.you'), foe: t('battle.top.foe') });
    }
    const key = `${sentence}|${tone}`;
    if (key === this.sitKey) return;
    this.sitKey = key;
    // a banner (Paused, a message) sits where the hint goes: the hint waits
    // the tutorial hides the generic hint: old Nikias says what to do (hud.md, TUT-1)
    this.hintPill.setText(this.banner || this.tutorialData ? '' : sentence, tone);
  }

  /**
   * A ladder floor's ticket (controls.md R10): from LADDER.countdownMin out the
   * top bar counts it down, on this device's clock, paused or not; a banner
   * when the countdown starts and when it runs out (the run is still reported
   * and verified, but pays nothing).
   */
  private updateTicket(): void {
    if (this.ladderEnd === null || this.sim.phase === 'ended' || this.ending) return;
    const c = ticketClock(this.ladderEnd, Date.now());
    if (!c.show) return;
    if (c.secs !== this.ticketSecs) {
      this.ticketSecs = c.secs;
      this.hudDirty = true;
    }
    const stage = c.expired ? 2 : 1;
    if (stage <= this.ticketStage) return;
    this.ticketStage = stage;
    this.hudDirty = true;
    if (!this.netBanner) this.showBanner(stage === 2 ? t('pace.expired') : t('pace.soon', { m: Math.ceil(c.secs / 60) }), 4000);
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
    // only groups with men get a card, in deployment too (controls.md R1.4)
    return cardGroups(this.sim, this.me, false).map(({ gid, numeral }) => ({ g: this.sim.groups[gid], numeral }));
  }

  private cardRows(): number {
    return Math.max(1, Math.ceil(this.sheetGroups().length / 2));
  }

  /** Top of the sheet's header row (the shape chip, Groups) under the cards. */
  private sheetHeadY(): number {
    return this.stripTop() + 5 + this.cardRows() * (SHEET_CARD_H + SIZE.gap) - SIZE.gap + 4;
  }

  /** Height of the bottom sheet. */
  private sheetH(): number {
    const cards = this.cardRows() * (SHEET_CARD_H + SIZE.gap) - SIZE.gap;
    return 5 + cards + 4 + SHEET_HEAD_H + SHEET_ORDERS_H + 5;
  }

  private buildSheet(): void {
    const { VW, VH } = this.m;
    const deploy = this.sim.phase === 'deploy';
    // what the order row is built for, on every path (no selection draws no row): refreshHud rebuilds the HUD
    // whenever this differs, so a stale key would rebuild it forever (a stack overflow freezing the game loop)
    this.ordersBuilt = this.ordersKey();
    const y0 = this.stripTop();
    this.hud.add(mosaicImage(this, -2, y0, VW + 4, VH - y0 + 4, 'topBar'));
    const rim = this.add.graphics();
    rim.fillStyle(MOSAIC.meander, 1);
    rim.fillRect(-2, y0, VW + 4, 1);
    rim.fillStyle(MOSAIC.meanderLo, 1);
    rim.fillRect(-2, y0 + 1, VW + 4, 1);
    this.hud.add(rim);
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
          // a double tap on a card centres the camera on its group (R8.2) and leaves it selected
          const now = this.time.now;
          const twice = this.lastCardTap?.gid === g.id && now - this.lastCardTap.at < CARD_DOUBLE_TAP_MS;
          this.lastCardTap = twice ? null : { gid: g.id, at: now };
          if (twice) this.selGroup = g.id;
          else if (this.selGroup === g.id && this.selUnit < 0) this.selGroup = -1;
          else this.selGroup = g.id;
          this.selUnit = g.individual ? this.sim.members(g.id)[0]?.id ?? -1 : -1;
          this.shapeOpen = false;
          this.buildHud();
          if (twice) this.recentre('group');
        },
        () => this.cardTip(g.id, numeral),
      );
      uiId(card, `battle.group.${numeral}`);
      this.hud.add(card);
      this.cards.push({ gid: g.id, card, numeral });
    });
    // the header: whose orders, and the chips (shape; Groups in deployment, hud.md Z8; solo / join)
    let y = this.sheetHeadY();
    const sel = this.selGroup >= 0 ? this.sim.groups[this.selGroup] : null;
    const numeral = sel ? this.cards.find((c) => c.gid === sel.id)?.numeral ?? '' : '';
    const selName = sel ? (sel.individual ? this.sim.members(sel.id)[0]?.name ?? '' : `${groupName(sel.name)} ${numeral}`.trim()) : '';
    const chips: { icon: string; label: string; short?: string; tip: string; id: string; selected?: boolean; off?: string; onClick: () => void }[] = [];
    const shapeOf = sel && !sel.disbanded ? sel.formation.type : null;
    const preset = PRESETS.find((p) => p[0] === shapeOf);
    const shapeName = preset ? t(`battle.cmd.${preset[1]}` as TKey) : t('battle.shape.chip');
    chips.push({
      icon: preset ? preset[2] : 'f_line',
      label: preset ? t('battle.orders.formation', { shape: shapeName }) : shapeName,
      short: shapeName,
      selected: this.shapeOpen,
      off: sel && this.canCommand() ? undefined : t('battle.why.noGroup'),
      tip: t('battle.tip.cat.formation'),
      id: 'battle.cat.formation',
      onClick: () => this.openCategory('formation'),
    });
    // Reset all moved to the ⋯ menu, away from FIGHT! (A11Y-08); Groups took its place (ELEMENT_MAP E180)
    if (deploy) chips.push({ icon: 'people', label: t('battle.groups'), tip: t('battle.tip.groups'), id: 'battle.groups', onClick: () => this.openGroups() });
    const u = !deploy && this.selUnit >= 0 ? this.sim.units[this.selUnit] : null;
    if (u && this.sim.groups[u.group].individual) chips.push({ icon: 'people', label: t('battle.ring.join'), tip: t('battle.tip.join'), id: 'battle.cmd.join', onClick: () => this.rejoin(u) });
    else if (u) chips.push({ icon: 'detach', label: t('battle.ring.solo'), tip: t('battle.tip.solo'), id: 'battle.cmd.solo', onClick: () => this.detach(u) });
    // in battle the selected group's numeral badge, in its colour, leads the line (controls.md R1.3)
    const badge = !deploy && sel ? groupNumeral(this.sim.groups, sel.id) : '';
    const tx = badge ? 4 + orderBadgeW(badge) + 4 : 6;
    const barName = badge && sel && !sel.individual ? groupName(sel.name) : selName;
    // the header's words stay at the text floor (A11Y-09): the title keeps at least the group's name, the shape
    // chip drops "Formation:" before that, and a chip that still does not fit shows its icon alone
    const chipW = (label: string) => Math.min(112, Math.ceil(mw(caps(label), 'rCream', 6.5)) + 22);
    const titleNeed = !deploy && sel ? tx + Math.ceil(mw(caps(barName), 'rGold', 6.5)) + 6 : 0;
    const budget = VW - 4 - titleNeed - SIZE.gap * (chips.length - 1);
    const labels = chips.map((c) => c.label);
    const total = () => labels.reduce((a, l) => a + (l ? chipW(l) : SHEET_HEAD_H + 2), 0);
    if (total() > budget && chips[0].short) labels[0] = chips[0].short;
    for (let i = chips.length - 1; i >= 0 && total() > budget; i--) labels[i] = '';
    let cx = VW - 4;
    for (let ci = chips.length - 1; ci >= 0; ci--) {
      const c = chips[ci];
      const label = labels[ci];
      const w = label ? chipW(label) : SHEET_HEAD_H + 2;
      cx -= w;
      const b = new KeyButton(this, cx, y - 1, w, SHEET_HEAD_H, { icon: c.icon, label: label || c.label, iconOnly: !label, tip: c.tip, id: c.id, variant: 'bronze', lit: c.selected, disabledReason: c.off, onClick: c.onClick });
      this.hud.add(b);
      if (c.id === 'battle.cmd.join' || c.id === 'battle.cmd.solo') this.cmdBtns.set(c.id.slice('battle.cmd.'.length), b);
      cx -= SIZE.gap;
    }
    if (badge) this.hud.add(numeralBadge(this, 4, y + 1, SHEET_HEAD_H - 4, badge));
    // the orphan "Shape" title of the deployment is gone (BTL-8): the chip says it
    const title = !deploy && sel ? t('battle.orders.title', { group: barName }) : '';
    if (title) {
      const room = cx - tx - 2;
      const line = mw(caps(title), 'rGold', 6.5) <= room ? title : barName;
      this.hud.add(mtext(this, tx, y + 3, caps(line), 'rGold', { size: 6.5, maxW: room }));
    }
    y += SHEET_HEAD_H + 3;
    // the row: Fight (deployment) or the five orders (battle)
    if (deploy) {
      const ready = this.dclock?.ready ?? false;
      const main: StripSlot = this.online
        ? { icon: 'check', label: t('battle.ready'), selected: ready, off: ready ? t('battle.why.waiting') : undefined, tip: t(this.src?.lockstep ? 'battle.tip.readyDuel' : 'battle.tip.ready'), id: 'battle.ready', onClick: () => this.startFight() }
        : { icon: 'swords', label: t('battle.fight'), tip: t('battle.tip.fight'), id: 'battle.fight', onClick: () => this.startFight() };
      // the one primary of the deployment: the hero button (grey stone while the online ready is waiting)
      this.hud.add(new MButton(this, 4, y, VW - 8, SHEET_ORDERS_H, { icon: main.icon, label: main.label, tip: main.tip, id: main.id, variant: main.off ? 'disabled' : 'primaryHero', disabledReason: main.off, onClick: main.onClick }));
      this.buildTargetChips(null);
      return;
    }
    const orders = this.orderKeys();
    if (!orders.length) {
      // at the text floor (A11Y-09), on two lines when one is too wide (A11Y-10: never cut)
      const none = t('battle.orders.none');
      const two = mw(none, 'dim', 6.5) > VW - 12;
      this.hud.add(mtext(this, VW / 2, y + (two ? 4 : 9), none, 'dim', { size: 6.5, maxW: VW - 12, wrap: true, align: 0.5 }));
      this.buildTargetChips(null);
      return;
    }
    // the bar wears the selected group's colour (its numeral badge heads the line above; controls.md R1.3, PLAY C3)
    this.hud.add(orderBarPlate(this, 4, y, VW - 8, SHEET_ORDERS_H, groupNumeral(this.sim.groups, sel!.id)));
    // a long word gets a wider key rather than an ellipsis (controls.md R9: "Стрелять" at 360, "Advance" at 320)
    // at the text floor (hud.md §I): the full words when they fit, else the short ones ("Adv.", "Back off")
    const { words, iconOnly } = orderLabels(
      orders.map((o) => o.label),
      orders.map((o) => o.short),
      VW - 8,
      SIZE.gap,
    );
    const keyW = iconOnly ? orders.map(() => Math.floor((VW - 8 - SIZE.gap * (orders.length - 1)) / orders.length)) : orderKeyWidths(words, VW - 8, SIZE.gap);
    // one face for the whole row: capitals when every word fits its key as such, else Inter
    const plain = words.some((w, i) => mw(caps(w), 'rCream', 6.5) > keyW[i] - 4);
    let kx = 4;
    orders.forEach((o, i) => {
      const bw = keyW[i];
      const b = new KeyButton(this, kx, y, bw, SHEET_ORDERS_H, {
        icon: o.icon,
        label: words[i],
        iconOnly,
        tip: o.tip,
        id: `battle.cmd.${o.key}`,
        variant: 'bronze',
        lit: o.selected && !o.hollow,
        plain,
        disabledReason: o.off,
        onClick: () => o.onTap(),
      });
      this.hud.add(b);
      this.cmdBtns.set(o.key, b);
      // on but idle out of range: a hollow key, a gold rim round an unlit face (controls.md R3.4)
      if (o.hollow) {
        const g = this.add.graphics();
        g.lineStyle(1, MOSAIC.ink, 1);
        g.strokeRoundedRect(kx + 0.5, y + 0.5, bw - 1, SHEET_ORDERS_H - 1, 2.5);
        g.lineStyle(1.2, MOSAIC.meanderHi, 1);
        g.strokeRoundedRect(kx + 1.6, y + 1.6, bw - 3.2, SHEET_ORDERS_H - 3.2, 2);
        this.hud.add(g);
      }
      // Withdraw while the feint cools down: a sweep along the key's foot says when Feint is back (formations-orders.md R3.4)
      if (o.key === 'fallback' && this.fifth(sel!).cdLeftS > 0) {
        this.feintBar = { g: this.add.graphics(), x: kx + 3, y: y + SHEET_ORDERS_H - 4, w: bw - 6, gid: sel!.id };
        this.hud.add(this.feintBar.g);
        this.drawFeintBar();
      }
      kx += bw + SIZE.gap;
    });
    if (orders.some((o) => o.key === 'feint')) this.coach('feint');
    this.buildTargetChips(sel!);
  }

  /** What the order row shows (rebuilt when it changes: orders are rare events). */
  private ordersKey(): string {
    const sel = this.selGroup >= 0 ? this.sim.groups[this.selGroup] : null;
    if (!sel) return '';
    const fk = this.sim.phase === 'battle' ? this.fifth(sel) : null;
    return `${sel.order}|${sel.fireAtWill}|${this.selectedUnits().length > 0}|${sel.formation.type}|${sel.focus ?? -1}|${this.far.has(sel.id)}|${this.selUnit}|${fk?.key}|${(fk?.cdLeftS ?? 0) > 0}`;
  }

  // ---- targeting (controls.md R3): the Focus and "Advance to range" chips above the sheet

  /**
   * Above the sheet, left of the medallions: "Focus ✕" while the selected
   * group has a focus (a tap clears it), and "To range" while it idles out of
   * range (not in live battles, R10b).
   */
  private buildTargetChips(sel: Battle['groups'][number] | null): void {
    if (this.shapeOpen || !this.kinds.includes('chips')) return;
    // the tutorial keeps the field clear of the chips while a step needs the ground, and shows them when it teaches one
    if (this.tutorialData && !this.tutAllow.chips) return;
    // the tutorial shows Undo from its Undo step on (TUT-02): until then its lesson keeps the field clear
    const undo = !this.tutorialData || this.tutAllow.undo;
    const chips: { icon: string; label: string; tip: string; id: string; off?: string; lit?: boolean; iconOnly?: boolean; onClick: () => void }[] = [];
    // placing a work: only Place, Turn and Cancel, in one row (FW-03; a second row would climb into the top bar on short screens)
    const placing = !!this.worksGhost && this.worksShown();
    // deployment: Undo always there, greyed with its reason while empty (R4.2); online too, it is orders like any other
    if (undo && this.sim.phase === 'deploy' && !placing) {
      chips.push({ icon: 'back', label: t('undo.chip'), tip: t('undo.tip.deploy'), id: 'battle.undo', off: this.deployUndo.size ? undefined : t('undo.why.none'), onClick: () => this.undo() });
    }
    // Undo leads the chip row for 3 s after an order (controls.md R4.1; live online too: it is an order); paused, it takes back a planned order
    else if (undo && (this.undoLive || (this.staging() && this.plan.size > 0))) chips.push({ icon: 'back', label: t('undo.chip'), tip: t('undo.tip.battle'), id: 'battle.undo', onClick: () => this.undo() });
    // Then… next to Undo for 3 s after a move (R6.2; offline only, R10b); lit while it waits for the order key
    if (this.thenLive) chips.push({ icon: 'march', label: t('queue.chip.then'), tip: t('queue.tip.then'), id: 'battle.then', lit: this.thenArming >= 0, onClick: () => this.toggleThen() });
    // the selected group's queued step: "→ Charge", a tap cancels it
    const queued = sel ? this.thenQ.get(sel.id) : null;
    if (sel && queued) chips.push({ icon: 'close', label: t('queue.chip.queued', { order: thenLabel(queued) }), tip: t('queue.tip.queued'), id: 'battle.then.cancel', onClick: () => this.cancelThen(sel.id) });
    // paused with a plan: Clear plan (R6.1)
    if (this.staging() && this.plan.size > 0) chips.push({ icon: 'close', label: t('queue.chip.clear'), tip: t('queue.tip.clear'), id: 'battle.plan.clear', onClick: () => this.clearPlan() });
    if (sel && this.canCommand() && (sel.focus ?? -1) >= 0) {
      chips.push({ icon: 'close', label: t('target.chip.focus'), tip: t('target.tip.focus'), id: 'battle.target.clear', onClick: () => this.setFocus(-1) });
    }
    // field works (FW-03): the Works key beside Undo (the sheet's header has no room for a third chip at 320 without an
    // ellipsis), then Place, Turn and Cancel while placing, or Remove for a selected work
    if (this.worksShown() && !placing) chips.push({ icon: 'works', label: t('works.chip'), tip: t('works.tip.chip'), id: 'battle.works', lit: this.worksOpen, onClick: () => this.openWorks() });
    chips.push(...this.worksChips());
    if (sel && this.canCommand() && this.far.has(sel.id) && this.unlocks.toRange) {
      chips.push({ icon: 'advance', label: t('target.chip.advance'), tip: t('target.tip.advance'), id: 'battle.target.advance', onClick: () => this.advanceToRange() });
    }
    if (!chips.length) return;
    const h = SHEET_HEAD_H;
    // above the works tray while it is open
    const base = this.worksOpen && !this.worksGhost && this.worksShown() ? this.worksTrayTop() : this.selUnit >= 0 ? this.stripTop() - 27 : this.stripTop();
    let y = base - 2 - h;
    // a chip that would run under the medallion rail starts a row above (CT-04: no chip is dropped); left-hand: the rail is on the left
    const rail = this.kinds.includes('medallions') && this.abilityDefs().length ? MED_W + 4 : 0;
    const x00 = this.leftHand ? rail + 2 : 4;
    const right0 = this.m.VW - (this.leftHand ? 0 : rail) - 2;
    let x0 = x00;
    let right = right0;
    // a short field: a row level with the zoom key starts beside it, never under it
    const row = () => {
      const level = y < this.cornerY(!this.leftHand) + 22 + SIZE.gap * 2;
      x0 = level && !this.leftHand ? Math.max(x00, 4 + 22 + SIZE.gap * 2) : x00;
      right = level && this.leftHand ? Math.min(right0, this.m.VW - 4 - 22 - SIZE.gap * 2) : right0;
    };
    row();
    let x = x0;
    for (const c of chips) {
      const w = c.iconOnly ? SHEET_HEAD_H : Math.ceil(mw(c.label, 'light', 6.5)) + ICON_PX + 12;
      if (x > x0 && x + w > right) {
        y -= h + SIZE.gap;
        row();
        x = x0;
      }
      const b = new KeyButton(this, x, y, w, h, { icon: c.icon, label: c.label, tip: c.tip, id: c.id, variant: 'bronze', plain: true, lit: c.lit, iconOnly: c.iconOnly, disabledReason: c.off, onClick: c.onClick });
      this.hud.add(b);
      if (c.id === 'battle.undo') this.undoChip = this.sim.phase === 'battle' ? b : null;
      this.cmdBtns.set(c.id.slice('battle.'.length), b);
      x += w + SIZE.gap;
    }
  }

  /** Focus the selected group's missiles on enemy group `target` (-1 clears; formations-orders.md R4). */
  private setFocus(target: number): void {
    this.command({ kind: 'focus', group: -1, target });
    this.showBanner(t(target >= 0 ? 'target.banner.focus' : 'target.banner.clear'), 1200);
  }

  /** "Advance to range": walk the group to 90% of its median range from the focus or the nearest enemy (R3.4). */
  private advanceToRange(): void {
    const f = advanceToRange(this.sim, this.selGroup);
    if (!f) return;
    this.command({ kind: 'form', group: -1, cx: f.cx, cy: f.cy, fx: f.fx, fy: f.fy, frontage: this.sim.groups[this.selGroup].formation.frontage });
  }

  // ---- abilities: medallions down the field's right edge

  /** The heroes' abilities the selection can use, and the war horn. */
  private abilityDefs(): { key: string; icon: string; label: string; tip: string; sub: string; run: () => void; ability?: AbilityId }[] {
    if (this.sim.phase === 'deploy') return [];
    const ids: AbilityId[] = [];
    for (const u of this.selectedUnits()) for (const id of u.abil) if (!ids.includes(id)) ids.push(id);
    const cmds: ReturnType<BattleScene['abilityDefs']> = ids.slice(0, 5).map((id) => ({ key: id, icon: ABILITIES[id].icon, label: abilityName(id), sub: tOr(`battle.effect.${id}`, ''), tip: tOr(`ability.${id}.desc`, ABILITIES[id].desc), run: () => this.useAbility(id), ability: id }));
    // Raise the standard (abilities.md R5.3; CT-07): the army's lever, after the horn, while the army fielded a bearer
    if (this.raiseInfo().show) cmds.unshift({ key: 'standard', icon: 'standard', label: t('attn.std.name'), sub: t('attn.std.sub'), tip: t('attn.std.tip'), run: () => this.raiseStandard() });
    if (this.sim.horns[this.me] > 0 && this.sim.phase === 'battle') cmds.unshift({ key: 'horn', icon: 'horn', label: t('battle.horn'), sub: t('battle.effect.horn'), tip: t('battle.horn.tip'), run: () => this.blowHorn() });
    return cmds.slice(0, 5);
  }

  /** The Raise-the-standard control's state now (src/ui/input/attention.ts raiseState). */
  private raiseInfo(): ReturnType<typeof raiseState> {
    const b = this.sim.standardBearer(this.me);
    return raiseState({ battle: this.sim.phase === 'battle', hadBearer: this.hadStandard, bearer: b, raised: this.sim.standardRaised(this.me), broken: this.sim.isBroken(this.me) });
  }

  /** Raise the standard: the `ability` order 'standard' from the bearer (the sim checks it again; online it is an ordinary logged order). */
  private raiseStandard(): void {
    const r = this.raiseInfo();
    const b = this.sim.standardBearer(this.me);
    if (r.why || !b) {
      hapticNotify('error');
      uiError();
      this.showBanner(t(r.why ?? 'attn.std.why.lost'), 1400);
      return;
    }
    this.order({ kind: 'ability', unit: b.id, ability: RAISE_STANDARD as AbilityId });
    haptic('heavy');
    this.showBanner(r.note ? `${t('attn.std.banner', { name: b.name })} ${t(r.note)}` : t('attn.std.banner', { name: b.name }), 1600, 4);
    this.handleEvents(drainLogged(this.sim));
    this.hudDirty = true;
  }

  /** The standard's medallion: a "1" while it can be raised, greyed with the reason after (abilities.md "a '1' use pip"). */
  private refreshStandard(): void {
    if (!this.stdBtn) return;
    const r = this.raiseInfo();
    this.stdBtn.setBlocked(r.why ? t(r.why) : null);
    this.stdBtn.setCorner(r.why ? '' : '1');
  }

  private buildMedallions(): void {
    const defs = this.abilityDefs();
    if (!defs.length || !this.kinds.includes('medallions')) return;
    const { VW } = this.m;
    // the rail runs down the right edge; left-hand mode mirrors it to the left (A11Y-16)
    const x = mirrorX(VW - MED_W - 2, MED_W, VW, this.leftHand);
    let y = this.followBtn ? this.cornerY(this.leftHand) + 26 : TOP_H + 6;
    const bottom = this.stripTop() - (this.selUnit >= 0 ? 29 : 2);
    this.railW = MED_W + 4;
    // at most 3 medallions (2 on a short field) and the "more" key for the rest (hud.md Z5)
    const { shown, more } = railLayout(defs.length, this.stripTop() - TOP_H, bottom - y);
    for (const d of defs.slice(0, shown)) {
      const m = new Medallion(this, x, y, { icon: d.icon, label: d.label, sub: d.sub, tip: d.tip, id: `battle.cmd.${d.key}`, onClick: d.run });
      this.hud.add(m);
      this.cmdBtns.set(d.key, m);
      if (d.ability) this.abilityBtns.push({ id: d.ability, btn: m });
      if (d.key === 'standard') this.stdBtn = m;
      y += MED_H + 4;
    }
    if (more) {
      const rest = defs.slice(shown);
      const mk = new KeyButton(this, x, y, MED_W, MORE_H, { icon: 'more', label: t('battle.more.key'), tip: t('battle.more.tip'), id: 'battle.more', variant: 'bronze', plain: true, onClick: () => this.openMore(rest) });
      this.hud.add(mk);
      this.cmdBtns.set('more', mk);
    }
  }

  /** The rail's overflow (hud.md Z5 "more"): a sheet of the other abilities. Offline it pauses while open. */
  private openMore(defs: ReturnType<BattleScene['abilityDefs']>): void {
    if (this.overlay) return;
    const fighting = this.sim.phase === 'battle';
    const wasPaused = this.paused;
    if (fighting && !this.paused && !this.realtimeLocked && !this.tutorial) this.setPaused(true);
    const restore = () => {
      if (fighting && !wasPaused && this.paused && this.sim.phase === 'battle') this.setPaused(false);
    };
    openAbilitySheet(this, {
      items: defs.map((d) => ({ key: d.key, icon: d.icon, label: d.label, sub: d.sub })),
      onDismiss: restore,
      onPick: (key) => {
        restore();
        defs.find((d) => d.key === key)?.run();
      },
    });
  }

  // ---- the order row of the bottom sheet

  /** The order keys for the selection, with their state now. */
  private orderKeys(): OrderKey[] {
    const sel = this.selGroup >= 0 ? this.sim.groups[this.selGroup] : null;
    if (!sel || this.sim.phase !== 'battle') return [];
    const mem = this.selectedUnits();
    const can = mem.length > 0;
    const why = can ? undefined : t('battle.why.noMen');
    // Then… armed: the key is queued on arrival instead (R6.2)
    const arming = this.thenArming === sel.id;
    const order = (o: 'hold' | 'advance' | 'charge' | 'fallback') => () => (arming ? this.queueThen(o) : this.command({ kind: 'order', group: -1, order: o }));
    // paused: the keys show the plan's order for the group (R6.1)
    const now = this.plan.last(sel.id, 'order')?.order ?? sel.order;
    const shooters = mem.filter((u) => u.stats.range > 0);
    const ammo = shooters.some((u) => u.ammo > 0);
    const shootWhy = why ?? (shooters.length === 0 ? t('battle.why.noMissiles') : !ammo ? t('battle.why.outOfAmmo') : undefined);
    const fk = this.fifth(sel, arming);
    const fifth: OrderKey =
      fk.key === 'feint'
        ? { key: 'feint', icon: 'back', label: t('attn.feint'), short: t('battle.short.feint'), tip: t('attn.tip.feint'), selected: now === 'feint', off: why, onTap: () => (sel.order === 'feint' ? this.showBanner(t('attn.tip.feint'), 1600) : this.feint()) }
        : { key: 'fallback', icon: 'fallback', label: t('battle.ring.back'), short: t('battle.short.back'), tip: fk.cdLeftS > 0 ? t('attn.tip.backCd', { n: fk.cdLeftS }) : t('battle.tip.radialBack'), selected: now === 'fallback', off: why, onTap: order('fallback') };
    const orders: OrderKey[] = [
      { key: 'advance', icon: 'advance', label: t('battle.ring.advance'), short: t('battle.short.advance'), tip: t('battle.tip.radialAdvance'), selected: now === 'advance', off: why, onTap: order('advance') },
      { key: 'charge', icon: 'charge', label: t('battle.ring.charge'), short: t('battle.short.charge'), tip: t('battle.tip.radialCharge'), selected: now === 'charge', off: why, onTap: order('charge') },
      { key: 'hold', icon: 'hold', label: t('battle.ring.hold'), short: t('battle.short.hold'), tip: t('battle.tip.radialHold'), selected: now === 'hold', off: why, onTap: order('hold') },
      { key: 'loose', icon: 'throw', label: t('battle.ring.shoot'), short: t('battle.short.shoot'), tip: t('battle.tip.radialShoot'), selected: (this.plan.last(sel.id, 'loose')?.on ?? sel.fireAtWill) && ammo, hollow: sel.fireAtWill && ammo && this.far.has(sel.id), off: shootWhy, onTap: () => (arming ? this.queueThen('loose') : this.toggleThrow()) },
      fifth,
    ];
    return orders;
  }

  /** The 5th key for `sel` (formations-orders.md R3; CT-07): Feint for an eligible group once unlocked, else Withdraw. */
  private fifth(sel: SimGroup, arming = this.thenArming === sel.id): { key: 'feint' | 'fallback'; cdLeftS: number } {
    const at = this.feintAt.get(sel.id);
    const cdLeftS = at === undefined ? 0 : (at + RULES.feintCdS * TICK_RATE - this.sim.tick) / TICK_RATE;
    const eligible = this.unlocks.feint && this.sim.canFeint(sel.id);
    return fifthKey({ unlocked: this.unlocks.feint, eligible, ready: eligible && this.sim.feintReady(sel.id), cdLeftS, arming, active: sel.order === 'feint' });
  }

  /** Note when my groups begin a feint (the sim keeps its cooldown private): the Withdraw key's sweep reads it. */
  private trackFeints(): void {
    for (const g of this.sim.groups) {
      if (g.side !== this.me || g.order !== 'feint') continue;
      const at = this.feintAt.get(g.id);
      if (at === undefined || this.sim.tick - at >= RULES.feintCdS * TICK_RATE) this.feintAt.set(g.id, this.sim.tick);
    }
    this.drawFeintBar();
  }

  // ---- facing pips (A11Y-14): tap the knob, then tap a direction

  /** The pips round the selected group, if open: eight 44 pt targets on a ring, each turning it one way. */
  private buildPips(): void {
    if (!this.pips || !this.kinds.includes('pips')) return;
    const gid = this.pips.gid;
    this.pips.btns = FACING_DIRS.map((d, i) => {
      const pip = new FacingPip(this, 0, 0, this.pipArrow(d), `battle.face.${i}`, t('attn.pip'), () => this.pickFacing(d));
      this.hud.add(pip);
      return { pip, dir: d };
    });
    this.pips.gid = gid;
    this.updatePips();
  }

  /** A field direction's on-screen angle through the iso view. */
  private pipArrow(d: Pt): number {
    const a = isoToScreen(d.x, d.y);
    return Math.atan2(a.y, a.x);
  }

  /** Keep the open pips round their group (the camera may move): a ring of PIP_RING UI px, inside the field. */
  private updatePips(): void {
    const p = this.pips;
    if (!p) return;
    const fr = this.selectedFrame();
    if (!fr || p.gid !== this.selGroup) {
      this.closePips();
      return;
    }
    const cam = this.cameras.main;
    const S = this.m.S;
    const w = isoToScreen(fr.cx, fr.cy);
    const cx = ((w.x - cam.worldView.x) * cam.zoom) / S;
    const cy = ((w.y - cam.worldView.y) * cam.zoom) / S;
    const R = 32;
    const top = this.topH() + 30;
    const bottom = this.stripTop() - 14;
    for (const b of p.btns) {
      const a = pipSlot(this.pipArrow(b.dir));
      b.pip.follow(Phaser.Math.Clamp(cx + Math.cos(a) * R, 13, this.m.VW - 13), Phaser.Math.Clamp(cy + Math.sin(a) * R, top, bottom));
    }
  }

  private openPips(): void {
    if (this.selGroup < 0 || !this.canCommand()) return;
    this.pips = { gid: this.selGroup, btns: [] };
    this.setFollow(false);
    haptic('light');
    this.showBanner(t('attn.pips.banner'), 1600);
    this.buildHud();
  }

  private closePips(): void {
    if (!this.pips) return;
    this.pips = null;
    this.buildHud();
  }

  /**
   * A pip was tapped: turn the group exactly as a knob drag to that direction
   * would (`face` in battle, keeping the order; `form` in deployment).
   */
  private pickFacing(d: Pt): void {
    const fr = this.selectedFrame();
    const k = this.knobOf();
    this.pips = null;
    if (fr && k && this.canCommand()) {
      const ds = this.startDrag(isoToScreen(k.x, k.y), 'turn');
      dragMove(ds, fr.cx + d.x * KNOB_PACES, fr.cy + d.y * KNOB_PACES);
      const plan = dragPlan(ds);
      if (plan) {
        this.command(dragOrder(plan, this.sim.phase));
        this.tutorialEvent({ kind: 'sling', carried: false, aimed: true, fx: plan.fx, fy: plan.fy, group: this.selGroup });
        return;
      }
    }
    this.buildHud();
  }

  /** The feint cooldown sweep under the Withdraw key: the share of FEINT_CD still to run, gold on an ink track. */
  private drawFeintBar(): void {
    const b = this.feintBar;
    if (!b || !b.g.active) return;
    const sel = this.sim.groups[b.gid];
    const left = sel ? this.fifth(sel).cdLeftS : 0;
    b.g.clear();
    b.g.fillStyle(MOSAIC.ink, 0.9);
    b.g.fillRect(b.x, b.y, b.w, 2);
    b.g.fillStyle(MOSAIC.meanderHi, 1);
    b.g.fillRect(b.x, b.y, Math.round((b.w * Math.min(1, left / RULES.feintCdS))), 2);
  }

  /** Feint (formations-orders.md R3): an ordinary `order` the sim validates (the server replays it). */
  private feint(): void {
    this.command({ kind: 'order', group: -1, order: 'feint' });
  }

  /** A gated control's coach card, once ever, in the campaign (controls.md R10b). */
  private coach(id: 'feint' | 'orb'): void {
    if (this.src || this.tutorial) return;
    const key = `battle-${id}`;
    const seen = hintStore.seen();
    if (seen.includes(key) || seen.includes('*')) return;
    hintStore.mark(key);
    this.showBanner(t(id === 'feint' ? 'attn.coach.feint' : 'attn.coach.orb'), 4500, 4);
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
    // the orb appears once unlocked (R10b), or while the group already stands in one
    const shapes = PRESETS.filter(([type]) => type !== 'orb' || this.unlocks.orb || sel.formation.type === 'orb');
    if (shapes.some(([type]) => type === 'orb')) this.coach('orb');
    const h = 16 + shapes.length * (rowH + SIZE.gap) - SIZE.gap + 6;
    this.hideBanner();
    // above the bottom sheet when there is room; on short screens it rises over the sheet, never under the top bar
    const y = Math.max(TOP_H + 2, this.stripTop() - h - 2);
    const c = this.add.container(0, 0);
    this.hud.add(c);
    // a popup: the field and the sheet dim behind it, and a tap outside closes it
    const shade = uiBlocker(this.add.rectangle(0, 0, this.m.VW, this.m.VH, 0x000000, 0.35).setOrigin(0, 0).setInteractive());
    shade.on('pointerup', () => {
      this.shapeOpen = false;
      this.buildHud();
    });
    c.add(shade);
    c.add(mosaicImage(this, x, y, w, h, 'sheet'));
    const numeral = this.cards.find((k) => k.gid === sel.id)?.numeral ?? '';
    c.add(mtext(this, x + 6, y + 5, t('battle.shape.title', { numeral, name: sel.individual ? this.sim.members(sel.id)[0]?.name ?? '' : groupName(sel.name) }).toUpperCase().replace(/ +/g, '  '), 'rInk', { size: 7.5, maxW: w - 12 }));
    let ry = y + 16;
    for (const [type, key, icon] of shapes) {
      const wallOff =
        type === 'shieldwall' && !mem.some((u) => u.stats.canShieldWall)
          ? t('battle.why.noShields')
          : type === 'orb' && !this.sim.canOrb(sel.id)
            ? t('attn.orb.why.riders')
            : undefined;
      const row = new PanelRow(
        this,
        x + 4,
        ry,
        w - 8,
        rowH,
        {
          icon,
          title: t(`battle.cmd.${key}` as TKey),
          subtitle: this.compact ? undefined : t(`battle.shape.${type}` as TKey),
          selected: sel.formation.type === type,
          disabled: wallOff,
          tip: t(`battle.tip.${key}` as TKey),
          id: `battle.cmd.form_${type}`,
          onClick: () => {
            const warn = type === 'orb' && sel.formation.type !== 'orb' && this.orbHeadOn(sel.id);
            this.command({ kind: 'preset', group: -1, type });
            this.shapeOpen = false;
            this.buildHud();
            // V5-041: the orb is the wrong answer to a line coming head-on; say so as it is chosen (the order stands)
            if (warn) this.showBanner(t('attn.orb.warn'), 2600, 4);
          },
        },
      );
      c.add(row);
      this.cmdBtns.set(`form_${type}`, row);
      ry += rowH + SIZE.gap;
    }
  }

  /** A line or shield wall near the group faces it head-on (src/ui/input/attention.ts orbWarn). */
  private orbHeadOn(gid: number): boolean {
    if (this.hideFoes()) return false;
    const me = groupCentre(this.sim, gid);
    if (!me) return false;
    const foes = this.sim.groups
      .filter((g) => g.side !== this.me && !g.disbanded && !g.routed)
      .map((g) => ({ c: groupCentre(this.sim, g.id), f: g.formation }))
      .filter((q): q is { c: { x: number; y: number }; f: SimGroup['formation'] } => !!q.c)
      .map((q) => ({ x: q.c.x, y: q.c.y, fx: q.f.fx, fy: q.f.fy, type: q.f.type }));
    return orbWarn(me, foes);
  }

  /** Open or close the shape sheet (the other categories have no sheet: orders live in the order row, abilities in their row). */
  openCategory(cat: BattleCategory | null): void {
    if (cat === 'formation') this.shapeOpen = !this.shapeOpen;
    else this.shapeOpen = false;
    if (this.shapeOpen) this.closeWorks();
    this.buildHud();
  }

  // ---- field works (FW-03; field-works.md "Touch UI needs", R3-R5, controls.md R7): the tray, the ghost, placing and removing

  /** The Works chip shows: the player has works in this battle (offline campaign, unlocked; V5-022, R10b) and it is still deployment. */
  private worksShown(): boolean {
    return !!this.works && this.sim.phase === 'deploy' && !this.src && !this.tutorialData;
  }

  /** The field's grid, as the sim lays segments on it (no grid: one cell per pace). */
  private workGrid(): WorkGrid {
    const tr = this.sim.terrain;
    const { width, height } = this.sim;
    return { w: tr ? tr.w : Math.max(1, Math.round(width)), h: tr ? tr.h : Math.max(1, Math.round(height)), width, height };
  }

  /** The tray's rows now: what each work costs, how many more can go down, or why not. */
  private worksRows(): TrayRow[] {
    const w = this.works!;
    return trayRows({ supplies: state.campaign.world.supplies, placed: this.sim.works().filter((s) => s.side === this.me), allow: w.works, caught: w.caught });
  }

  private workWhyText(why: WorkWhy): string {
    return t(`works.why.${why}` as TKey);
  }

  /** Why the ghost cannot go down now (the purse first, then the sim's own check), or null. */
  private ghostWhy(): WorkWhy | null {
    const g = this.worksGhost;
    if (!g) return null;
    return ghostWhy(
      this.worksRows().find((r) => r.type === g.type),
      this.sim.workRefusal(this.me, g),
    );
  }

  /** The Works chip: open or close the tray. */
  openWorks(open = !this.worksOpen): void {
    this.closeWorks();
    this.worksOpen = open && this.worksShown();
    if (this.worksOpen) {
      this.shapeOpen = false;
      this.pips = null;
    }
    this.buildHud();
  }

  /** Close the tray and drop the ghost and the selection (no rebuild). */
  private closeWorks(): void {
    this.worksOpen = false;
    this.worksGhost = null;
    this.worksDrag = false;
    this.worksSel = -1;
  }

  /** A row of the tray: its ghost appears across the front of the zone, to be moved, turned and placed. */
  pickWork(type: WorkType): void {
    const row = this.worksRows().find((r) => r.type === type);
    if (!row || row.why) {
      hapticNotify('error');
      toast(this, this.workWhyText(row?.why ?? 'type'));
      return;
    }
    this.worksGhost = firstGhost(type, this.sim.deployZone(this.me), this.sim.deployZone(this.foe), this.sim.width);
    this.worksSel = -1;
    hapticSelect();
    this.showBanner(t('works.banner.pick'), 2200);
    this.buildHud();
  }

  /** The (i) key of a tray row: what the work does (G15: never long-press only). */
  private showWorkInfo(type: WorkType): void {
    this.showBanner(t(`works.${type}.info` as TKey), 4500, 4);
  }

  /** Move the ghost to the cell under field point (x, y). */
  private moveGhost(x: number, y: number): void {
    const g = this.worksGhost;
    const grid = this.workGrid();
    const i = cellAt(x, y, grid);
    if (!g || i < 0) return;
    const c = cellCentre(i, grid);
    if (c.x === g.x && c.y === g.y) return;
    g.x = c.x;
    g.y = c.y;
    haptic('light');
    if (!this.worksDrag) this.buildHud();
  }

  /** Turn the ghost an eighth of a turn (the single-tap alternative to turning it by its facing). */
  turnWork(): void {
    const g = this.worksGhost;
    if (!g) return;
    const f = turnFacing(g.fx, g.fy);
    g.fx = f.x;
    g.fy = f.y;
    haptic('light');
    this.buildHud();
  }

  /** Lay the ghost's segment: a `work` order, through order() like any other, undoable (field-works.md R3). */
  placeWork(): void {
    const g = this.worksGhost;
    if (!g) return;
    const why = this.ghostWhy();
    if (why) {
      hapticNotify('error');
      toast(this, this.workWhyText(why));
      return;
    }
    const o: Order = { kind: 'work', type: g.type, x: g.x, y: g.y, fx: g.fx, fy: g.fy };
    const before = this.sim.works().length;
    this.order(o);
    if (this.sim.works().length === before) return;
    this.recordUndo(o, inverseOf(o, this.sim));
    this.afterWorks();
    this.worksGhost = null;
    haptic('medium');
    this.showBanner(t('works.banner.placed', { name: t(`works.${g.type}.name` as TKey) }), 1200);
    this.buildHud();
  }

  /** Take up the selected segment (its supplies are never charged); Undo lays it again. */
  removeWork(): void {
    const grid = this.workGrid();
    const seg = this.sim.works()[segmentAt(this.sim.works(), this.me, this.worksSel)];
    if (!seg) return;
    const c = cellCentre(this.worksSel, grid);
    const o: Order = { kind: 'unwork', x: c.x, y: c.y };
    const again = layAgain(seg, grid);
    this.order(o);
    this.recordUndo(o, [again]);
    this.afterWorks();
    this.worksSel = -1;
    haptic('medium');
    this.showBanner(t('works.banner.removed', { name: t(`works.${seg.type}.name` as TKey) }), 1200);
    this.buildHud();
  }

  /** The ground changed under the men (the sim resnaps them): no tween from where they stood; redraw the works. */
  private afterWorks(): void {
    for (const v of this.views) {
      v.px = v.u.x;
      v.py = v.u.y;
    }
    this.syncWorkArt();
  }

  /** A tap on the field while the tray is open: the ghost moves there, or an own work is selected. True if taken. */
  private worksTap(x: number, y: number): boolean {
    if (!this.worksOpen) return false;
    const w = this.cameras.main.getWorldPoint(x, y);
    const f = screenToIso(w.x, w.y);
    if (this.worksGhost) {
      this.moveGhost(f.x, f.y);
      return true;
    }
    const cell = cellAt(f.x, f.y, this.workGrid());
    const k = segmentAt(this.sim.works(), this.me, cell);
    const sel = k >= 0 ? cell : -1;
    if (sel < 0 && this.worksSel < 0) return false;
    this.worksSel = sel;
    if (k >= 0) {
      hapticSelect();
      this.showBanner(t('works.banner.selected', { name: t(`works.${this.sim.works()[k].type}.name` as TKey) }), 1800);
    }
    this.buildHud();
    return k >= 0;
  }

  /** What a drag from this press grabs while placing: the ghost, within reach of any of its cells. */
  private ghostGrab(p: Pt): DragKind | null {
    const g = this.worksGhost;
    if (!g) return null;
    const grid = this.workGrid();
    const cam = this.cameras.main;
    for (const i of workCells(g.type, g.x, g.y, g.fx, g.fy, grid) ?? [cellAt(g.x, g.y, grid)]) {
      const c = cellCentre(i, grid);
      const s = isoToScreen(c.x, c.y);
      const sx = (s.x - cam.worldView.x) * cam.zoom;
      const sy = (s.y - cam.worldView.y) * cam.zoom;
      if (Math.hypot(sx - p.x, sy - p.y) <= GRAB_PX) return 'move';
    }
    return null;
  }

  /** Height of the tray (its rows are the shape sheet's). */
  private worksTrayH(): number {
    return 16 + 3 * ((this.compact ? 22 : 24) + 3) - 3 + 6;
  }

  /**
   * Top of the tray: just above the bottom sheet, but never so high that the
   * chip row above it (Undo, Works) runs into the zoom key; on a short screen
   * it comes down over the group cards instead.
   */
  private worksTrayTop(): number {
    const floor = this.cornerY(true) + 22 + 4 + SHEET_HEAD_H + 4;
    return Math.max(floor, this.stripTop() - 2 - this.worksTrayH());
  }

  /** The works tray, above the bottom sheet: supplies left, and a row per work with its (i). */
  private buildWorksTray(): void {
    const rows = this.worksRows().map((r) => {
      const name = t(`works.${r.type}.name` as TKey);
      const why = r.why ? this.workWhyText(r.why) : undefined;
      return {
        id: `battle.works.${r.type}`,
        title: name,
        subtitle: r.why ? t(`works.short.${r.why}` as TKey) : t('works.left', { n: r.left }),
        value: t('works.cost', { n: r.cost }),
        off: why,
        selected: this.worksGhost?.type === r.type,
        tip: t(`works.${r.type}.info` as TKey),
        infoLabel: t('works.info', { name }),
        onPick: () => this.pickWork(r.type),
        onInfo: () => this.showWorkInfo(r.type),
      };
    });
    const supplies = t('works.supplies', { n: Math.floor(state.campaign.worksLeft(this.sim.works())) });
    const top = this.worksTrayTop();
    const tray = worksTray(this, 4, top + this.worksTrayH(), this.m.VW - 8, this.compact ? 22 : 24, t('works.title'), supplies, rows, top, t('works.chip'));
    this.hud.add(tray.c);
    for (const [id, row] of tray.rows) this.cmdBtns.set(id.slice('battle.'.length), row);
  }

  /** The placing chips (Place, Turn, Cancel) or Remove for a selected work: above the sheet, after Undo. */
  private worksChips(): { icon: string; label: string; tip: string; id: string; off?: string; lit?: boolean; iconOnly?: boolean; onClick: () => void }[] {
    if (!this.worksShown() || !this.worksOpen) return [];
    if (this.worksGhost) {
      const why = this.ghostWhy();
      return [
        { icon: why ? 'xmark' : 'check', label: t('works.chip.place'), tip: t('works.tip.place'), id: 'battle.works.place', off: why ? this.workWhyText(why) : undefined, onClick: () => this.placeWork() },
        { icon: 'march', label: t('works.chip.turn'), tip: t('works.tip.turn'), id: 'battle.works.turn', onClick: () => this.turnWork() },
        { icon: 'close', label: t('works.chip.cancel'), tip: t('works.tip.cancel'), id: 'battle.works.cancel', iconOnly: true, onClick: () => this.cancelWork() },
      ];
    }
    if (this.worksSel >= 0) return [{ icon: 'close', label: t('works.chip.remove'), tip: t('works.tip.remove'), id: 'battle.works.remove', onClick: () => this.removeWork() }];
    return [];
  }

  /** Stop placing: back to the tray. */
  cancelWork(): void {
    this.worksGhost = null;
    this.worksDrag = false;
    this.buildHud();
  }

  /** Draw the works sprites again when the segments on the field changed (placed, taken up, undone, or laid by the bot). */
  private syncWorkArt(): void {
    const segs = this.sim.works();
    const sig = segs.map((s) => `${s.type}:${s.cells.join('.')}`).join('|');
    if (sig === this.worksSig) return;
    this.worksSig = sig;
    for (const img of this.workArt) img.destroy();
    this.workArt = workSprites(segs, [], this.workGrid()).map((s) => this.addWorkSprite(s)).filter((i): i is Phaser.GameObjects.Image => !!i);
  }

  /** One works sprite on the field: feet on its footprint's lowest vertex; a ditch under the men, the rest sorted with them. */
  private addWorkSprite(s: WorkSprite): Phaser.GameObjects.Image | null {
    if (!this.textures.exists(s.key)) return null;
    const img = this.add.image(s.x, s.y, s.key).setOrigin(0.5, 1).setFlipX(s.flip).setDepth(s.decal ? -90000 + s.y * 0.01 : s.y);
    this.world.add(img);
    return img;
  }

  /** The ghost (its cells, ✓ or ✗ on it: never colour only) and the selected work's outline, on the deployment boxes. */
  private drawWorks(g: Phaser.GameObjects.Graphics): void {
    const grid = this.workGrid();
    const diamond = (i: number, fill: number, a: number, line: number) => {
      const ix = i % grid.w;
      const iy = Math.floor(i / grid.w);
      const cw = grid.width / grid.w;
      const ch = grid.height / grid.h;
      const pts = [
        [ix * cw, iy * ch],
        [(ix + 1) * cw, iy * ch],
        [(ix + 1) * cw, (iy + 1) * ch],
        [ix * cw, (iy + 1) * ch],
      ].map(([x, y]) => {
        const p = isoToScreen(x, y);
        return [Math.round(p.x), Math.round(p.y)] as [number, number];
      });
      g.fillStyle(fill, a);
      g.fillPoints(pts.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
      this.dashRect(g, pts, 0x2a1d14, 0.8, 3, 0);
      this.dashRect(g, pts, line, 1, 2, 1);
    };
    const gh = this.worksGhost;
    let mark: { x: number; y: number; ok: boolean } | null = null;
    if (gh && this.worksShown()) {
      const ok = !this.ghostWhy();
      const cells = workCells(gh.type, gh.x, gh.y, gh.fx, gh.fy, grid) ?? [cellAt(gh.x, gh.y, grid)].filter((i) => i >= 0);
      for (const i of cells) diamond(i, ok ? 0x9fd8dc : 0xe07060, 0.45, ok ? 0xf6ecd8 : 0xffd0c0);
      const p = isoToScreen(gh.x, gh.y);
      mark = { x: p.x, y: p.y, ok };
    }
    const k = segmentAt(this.sim.works(), this.me, this.worksSel);
    if (k >= 0 && this.worksShown()) for (const i of this.sim.works()[k].cells) diamond(i, 0xf2d27a, 0.35, 0xfff4c0);
    // the ✓ / ✗ over the ghost's centre
    if (!mark) {
      this.ghostMark?.setVisible(false);
      return;
    }
    const key = mark.ok ? 'check' : 'xmark';
    if (!this.ghostMark || !this.ghostMark.active || this.ghostMark.getData('k') !== key) {
      this.ghostMark?.destroy();
      this.ghostMark = scaleIcon((mark.ok ? addIcon(this, 0, 0, 'check') : addIcon(this, 0, 0, 'xmark')), 1.5).setOrigin(0.5, 0.5).setDepth(92001);
      this.ghostMark.setData('k', key);
      this.world.add(this.ghostMark);
    }
    this.ghostMark.setPosition(Math.round(mark.x), Math.round(mark.y)).setVisible(true);
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
    // paused, the plan's Shoot is what the key shows: stage the explicit state, so the key lights (R6.1)
    const staged = this.staging() ? this.plan.last(sel.id, 'loose')?.on : undefined;
    const turningOn = !(staged ?? sel.fireAtWill);
    this.command(this.staging() ? { kind: 'loose', group: -1, on: turningOn } : { kind: 'loose', group: -1 });
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

  private portraitOf(gid: number): DollSpec | null {
    const lead = this.sim.activeMembers(gid)[0] ?? this.sim.members(gid)[0];
    if (!lead) return null;
    return dollFromHero(this.views[lead.id].hero);
  }

  /** The selected soldier: portrait, name and level, weapon, and health / morale / stamina columns. */
  private buildHeroInfo(u: SimUnit, y: number): void {
    const { VW } = this.m;
    const c = this.add.container(0, 0);
    // across the field's foot, just above the sheet
    const x = 4;
    const w = VW - 4 - x;
    c.add(mosaicImage(this, x, y, w, 24, 'parchment'));
    const hero = this.views[u.id].hero;
    c.add(addPortrait(this, dollFromHero(hero), x + 2, y + 2, { size: 20 }));
    // the portrait framed in the colour of his finest piece of gear (rare and up pulse)
    const best = this.views[u.id].fx?.rank ?? 0;
    if (best >= 1) {
      const rf = this.add.graphics();
      rf.lineStyle(1, RARITY_COLOR[RARITIES[best]], 1);
      rf.strokeRect(x + 1.5, y + 1.5, 21, 21);
      c.add(rf);
      if (best >= 2) this.tweens.add({ targets: rf, alpha: { from: 0.45, to: 1 }, duration: best >= 4 ? 600 : 1000, yoyo: true, repeat: -1 });
    }
    const colW = Math.max(18, ...(['hp', 'mor', 'sta'] as const).map((k) => measureText(t(`battle.stat.${k}`)) + 2));
    const mx = x + w - 4 - 3 * colW - 4;
    const textW = mx - 4 - (x + 22);
    c.add(addText(this, x + 22, y + 3, ellipsize(`${u.name} ${t('battle.lv', { n: u.level })}`, textW), 'pBad'));
    c.add(addText(this, x + 22, y + 13, ellipsize((hero.equip.weapon ? itemName(hero.equip.weapon.def) : t('battle.unarmed')), textW), 'pSec'));
    const colors = [P.bad, P.blue, P.good];
    const meters = (['hp', 'mor', 'sta'] as const).map((k, i) => {
      const cx = mx + i * (colW + 2);
      c.add(addText(this, cx + colW / 2, y + 3, t(`battle.stat.${k}`), 'pSec', 0.5));
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
      const far = this.sim.phase === 'battle' && this.outOfRange.check(this.sim, c.gid, this.sim.tick / TICK_RATE);
      if (far) this.far.add(c.gid);
      else this.far.delete(c.gid);
      const q = this.sim.phase === 'battle' ? this.thenQ.get(c.gid) : null;
      const queued = q ? thenLabel(q) : '';
      c.card.setInfo({
        numeral: c.numeral,
        men: mem.length,
        hp,
        morale: mem.length ? mo : 0,
        orderIcon: g.routed ? 'flag' : g.shieldWall ? 'wall' : g.order === 'feint' ? 'back' : g.order,
        name: g.individual ? this.sim.members(c.gid)[0]?.name : groupName(g.name),
        shortName: g.individual ? undefined : groupName(g.name, true),
        // a queued Then… step reads "→ Charge" after the order in force (R6.2), on the short form too
        orderWord: (g.routed ? t('battle.order.routed') : this.sim.phase === 'deploy' ? t(`battle.formation.${g.formation.type}` as TKey) : far ? `${t('battle.state.outOfRange')} →` : t(`battle.order.${g.order}` as TKey)) + (queued ? ` → ${queued}` : ''),
        orderShort: queued && !g.routed ? `→ ${queued}` : g.routed ? t('battle.orderShort.routed') : this.sim.phase === 'deploy' ? t(`battle.formationShort.${g.formation.type}` as TKey) : far ? `${t('battle.stateShort.outOfRange')} →` : t(`battle.orderShort.${g.order}` as TKey),
        focus: this.sim.phase === 'battle' && !g.routed && (g.focus ?? -1) >= 0,
        far,
        portrait: this.portraitOf(c.gid),
        selected: this.selGroup === c.gid,
        routed: g.routed,
        // RD-01: the morale glyph, the Standard and "Flanked!" (battle-readability.md R1, R3)
        ...groupReadout(this.sim, c.gid),
      });
    }
    // the order row shows the order in force: rebuild when that changes (orders are rare events)
    if (this.sim.phase === 'battle' && this.ordersKey() !== this.ordersBuilt) {
      this.buildHud();
      return;
    }
    this.refreshAbilities();
    this.refreshStandard();
    this.trackFeints();
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
    this.tagPos.clear();
    // RD-01: every group wears a badge (R2): ours tappable with its numeral, the enemy's a glyph plate
    const focused = new Set(this.sim.groups.filter((o) => o.side === this.me && o.fireAtWill && !o.routed).map((o) => o.focus ?? -1));
    const alpha = badgeAlpha(zoomUnits(cam.zoom));
    this.arcG.clear();
    if (this.sim.phase === 'battle' && this.time.now >= this.threatAt) {
      this.threatAt = this.time.now + 200;
      this.threats.clear();
      for (const g of this.sim.groups) if (g.side === this.me) this.threats.set(g.id, flankThreats(this.sim, g.id));
    }
    for (const g of this.sim.groups) {
      if (g.disbanded) continue;
      const mem = this.sim.activeMembers(g.id);
      if (mem.length === 0) continue;
      const mine = g.side === this.me;
      const label = mine ? groupNumeral(this.sim.groups, g.id) : '';
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
      const spec: BadgeSpec = { numeral: label, mine, selected: sel, readout: groupReadout(this.sim, g.id, (u) => isCaptain(this.views[u.id].hero)), focused: !mine && focused.has(g.id), feinting: mine && g.order === 'feint' && !g.routed, queued: mine && this.thenQ.get(g.id) !== null };
      if (!tag || tag.getData('key') !== badgeKey(spec)) {
        tag?.destroy();
        const made = fieldBadge(this, spec);
        if (!made) {
          this.tagMap.delete(g.id);
          continue;
        }
        tag = made;
        this.tags.add(tag);
        this.tagMap.set(g.id, tag);
      }
      const tx = Math.round(sx / S);
      const ty = Math.round(Math.max(this.topH() + 6, sy / S));
      tag.setPosition(tx, ty).setAlpha(alpha);
      // only our badges are tap targets (a tap selects the group)
      if (mine) this.tagPos.set(g.id, { x: tx, y: ty });
      if (mine && this.sim.phase === 'battle') this.drawFlankArcs(g, { x: cx, y: cy }, tx, ty, (tag.getData('w') as number) ?? 24, alpha);
    }
    for (const [gid, tag] of this.tagMap) {
      if (!seen.has(gid)) {
        tag.destroy();
        this.tagMap.delete(gid);
      }
    }
  }

  /**
   * RD-02 (R4, N15): round our group's badge, the red arc with chevrons on the
   * side it was just flanked from, else a dashed arc toward each enemy group
   * heading into its flank or rear.
   */
  private drawFlankArcs(g: SimGroup, c: Vec, tx: number, ty: number, w: number, alpha: number): void {
    const facing = { x: g.formation.fx, y: g.formation.fy };
    const rx = w / 2 + 5;
    const ry = BADGE_H / 2 + 6;
    const hit = this.flankWatch.solid(g.id, this.sim.tick / TICK_RATE);
    const from = hit ? [hit] : this.threats.get(g.id) ?? [];
    for (const f of from) drawFlankArc(this.arcG, tx, ty + 0.5, rx, ry, flankArc(facing, c, f, !hit), alpha);
  }

  /**
   * Edge pointers (controls.md R8.2, R7): the selected group's numeral at the
   * field band's edge, toward it, while it is off screen; in deployment also
   * the enemy arrow. A tap centres the camera there.
   */
  private updatePointers(): void {
    const cam = this.cameras.main;
    const { S, VW, VH } = this.m;
    // clear of the top corner keys (the eye, the zoom key) and of the medallion rail, on whichever side it is
    const rect: Box = { x0: this.leftHand ? this.railW : 0, y0: this.topH() + (this.zoomBtn || this.followBtn ? 28 : 0), x1: VW - (this.leftHand ? 0 : this.railW), y1: VH - this.panelHeight() - 6 };
    let first: Pt | null = null;
    const place = (key: 'group' | 'foe', at: Pt | null, label: string, colour: number, icon?: string, tip = colour): void => {
      // the tutorial keeps the ground clear while a step needs it (as the chips: tutAllow.chips)
      const e = at && !this.ending && !this.overlay && (!this.tutorialData || this.tutAllow.chips) ? edgePointer({ x: ((at.x - cam.worldView.x) * cam.zoom) / S, y: ((at.y - cam.worldView.y) * cam.zoom) / S }, rect, POINTER_INSET) : null;
      // two pointers never overlap: the second steps along its edge, toward the band's middle
      if (e && first && Math.hypot(e.x - first.x, e.y - first.y) < 30) {
        const side = Math.abs(e.x - rect.x0 - POINTER_INSET) < 1 || Math.abs(rect.x1 - POINTER_INSET - e.x) < 1;
        if (side) e.y = first.y + (first.y > (rect.y0 + rect.y1) / 2 ? -30 : 30);
        else e.x = first.x + (first.x > (rect.x0 + rect.x1) / 2 ? -30 : 30);
      }
      if (e) first = e;
      let c = this.pointerMap.get(key);
      if (!e) {
        c?.setVisible(false);
        return;
      }
      if (!c || c.getData('label') !== label) {
        c?.destroy();
        c = this.makePointer(key, label, colour, icon, tip);
      }
      c.setVisible(true).setPosition(Math.round(e.x), Math.round(e.y));
      (c.getData('arrow') as Phaser.GameObjects.Graphics).setRotation(e.angle);
    };
    const numeral = this.selUnit >= 0 ? '*' : this.selGroup >= 0 ? groupNumeral(this.sim.groups, this.selGroup) : '';
    place('group', this.groupCentre(), numeral, numeralColour(numeral));
    // the enemy's: a dark disc, the swords and the enemy zone's red arrow (group I is red too)
    place('foe', this.sim.phase === 'deploy' ? this.foeCentre() : null, 'foe', MOSAIC.ink, 'swords', 0xe07060);
  }

  /** The selection's centre (world px), or null without one. */
  private groupCentre(): Pt | null {
    const b = boxOf(this.selectedUnits().map((u) => isoToScreen(u.x, u.y)), 0, 20, 0);
    return b && centreOf(b);
  }

  /** One edge pointer: a disc (numeral or icon) with an arrow toward its target; a 44 pt tap target. */
  private makePointer(key: 'group' | 'foe', label: string, colour: number, icon: string | undefined, tip: number): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const arrow = this.add.graphics();
    arrow.fillStyle(MOSAIC.ink, 1);
    arrow.fillTriangle(9, -7, 20, 0, 9, 7);
    arrow.fillStyle(tip, 1);
    arrow.fillTriangle(10, -5, 17.5, 0, 10, 5);
    const disc = this.add.graphics();
    disc.fillStyle(MOSAIC.ink, 1);
    disc.fillCircle(0, 0, 12);
    disc.fillStyle(colour, 1);
    disc.fillCircle(0, 0, 11);
    disc.fillStyle(MOSAIC.stone1, 1);
    disc.fillCircle(0, 0, 8.5);
    c.add([arrow, disc]);
    if (icon) c.add(addIcon(this, -ICON_PX / 2, -ICON_PX / 2, icon));
    else c.add(addText(this, 0, -3.6, label, 'rGold', 0.5).setFontSize(6.5));
    c.setData('label', label);
    c.setData('arrow', arrow);
    c.setSize(44, 44).setInteractive();
    uiId(c, `battle.pointer.${key}`);
    let down: { x: number; y: number } | null = null;
    c.on('pointerdown', (p: Phaser.Input.Pointer) => (down = { x: p.x, y: p.y }));
    c.on('pointerout', () => (down = null));
    c.on('pointerup', (p: Phaser.Input.Pointer) => {
      const d = down;
      down = null;
      if (!d || Math.abs(p.x - d.x) + Math.abs(p.y - d.y) > 14 * RS) return;
      haptic('light');
      this.recentre(key);
    });
    this.tags.add(c);
    this.pointerMap.set(key, c);
    return c;
  }

  /** Centre the camera on the selected group or the enemy (a pointer tap, a card double tap); instant under Reduce motion. */
  private recentre(key: 'group' | 'foe'): void {
    const at = key === 'group' ? this.groupCentre() : this.foeCentre();
    if (!at) return;
    const cam = this.cameras.main;
    const vp = this.fieldViewport();
    const offX = (this.scale.width / 2 - (vp.left + this.scale.width) / 2) / cam.zoom;
    const offY = (this.scale.height / 2 - (vp.top + vp.bottom) / 2) / cam.zoom;
    if (motion.reduced) cam.centerOn(at.x + offX, at.y + offY);
    else cam.pan(at.x + offX, at.y + offY, RECENTRE_MS, 'Cubic.easeOut', true);
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
    this.handleEvents(drainLogged(this.sim));
    this.hudDirty = true;
    this.tutorialEvent({ kind: 'ability' });
  }

  /** The speed key: the next speed this battle offers (pace.ts); the choice is the next battle's too (A11Y-21). */
  private toggleSpeed(): void {
    if (this.realtimeLocked) return;
    this.speed = nextSpeed(this.pace, this.speed);
    this.juice.speed = this.speed;
    if (!this.tutorialData) {
      state.campaign.data.settings.battleSpeed = this.speed;
      void state.save();
    }
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
    // A campaign battle stands once it begins: closing the app now does not void it (V5-011).
    if (!this.src && !this.tutorialData && state.pending) {
      // field works are paid now, for the segments on the field only: an undone one cost nothing (field-works.md R4.3)
      if (this.works) state.campaign.payWorks(this.sim.works());
      markBattle(state.campaign, state.pending, lastBattle.heroes, this.sim.orderLog.slice(0, this.deployOrders ?? this.sim.orderLog.length), this.works?.works);
      void state.save();
    }
    // a "leave the deployment?" dialog still open no longer applies (its Leave would quit the battle)
    this.leaveDialog?.destroy();
    this.leaveDialog = null;
    if (this.dclock) markStarted(this.dclock);
    this.deployUndo.clear();
    this.shapeOpen = false;
    this.closeWorks();
    this.syncWorkArt();
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
    // "reset all" is global: it asks first (controls.md R4.3, A11Y-08)
    if (this.overlay) return;
    const c = confirmDialog(this, {
      title: t('undo.reset.title'),
      body: t('undo.reset.body'),
      ok: t('undo.reset.ok'),
      okIcon: 'repair',
      cancel: t('common.stay'),
      destructive: true,
      onOk: () => {
        this.overlay = null;
        if (this.sim.phase === 'deploy') this.doResetDeploy();
      },
    });
    this.overlay = c;
    c.once('destroy', () => this.overlay === c && (this.overlay = null));
  }

  private doResetDeploy(): void {
    // autoDeploy is a jump outside the order log: the undo steps before it no longer describe the field
    this.deployUndo.clear();
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
    if (!this.realtimeLocked) this.setPaused(true);
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
        if (!this.realtimeLocked) this.setPaused(false);
        this.order({ kind: 'retreat' });
        this.handleEvents(drainLogged(this.sim));
        this.buildHud();
      },
      onCancel: () => {
        this.overlay = null;
        if (!this.realtimeLocked) this.setPaused(wasPaused);
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
    if (this.stallMs > 700 && !this.ending) {
      // kept current while it shows: "Reconnecting...", the opponent's countdown
      const msg = ls.status() ?? t('battle.banner.waitingFoe', { name: this.opponentName() });
      if (!this.netBanner || msg !== this.netText) this.showBanner(msg, 0);
      this.netBanner = true;
      this.netText = msg;
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
        row.add(mosaicImage(this, 0, 0, rw, rowH, 'parchment'));
        row.add(addPortrait(this, dollFromHero(hero), 3, 2));
        const tw = rw - 32;
        row.add(addText(this, 29, 4, ellipsize(hero.name, tw), 'pBad'));
        row.add(addText(this, 29, 14, ellipsize((hero.equip.weapon ? itemName(hero.equip.weapon.def) : t('battle.unarmed')), tw), 'pSec'));
        const n = sideGroups.length;
        const cw = Math.floor((rw - 4 - SIZE.gap * (n - 1)) / n);
        sideGroups.forEach((g, gi) => {
          const on = u.group === g.id;
          const b = new KeyButton(this, 2 + gi * (cw + SIZE.gap), 25, cw, 22, {
            label: `${ROMAN[gi]}`,
            variant: 'bronze',
            lit: on,
            tip: groupName(g.name),
            id: `battle.groups.chip${gi}`,
            onClick: () => {
              if (area.moved || on) return;
              const assign: Order = { kind: 'assign', unit: u.id, group: g.id };
              this.recordUndo(assign, inverseOf(assign, this.sim));
              this.order(assign);
              this.syncHeroGroup(u.id);
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
    md.c.add(new MButton(this, md.x + Math.round((md.w - 100) / 2), doneY, 100, SIZE.btnH, { label: t('battle.groups.done'), icon: 'check', variant: 'primary', onClick: () => md.close() }));
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
      get cards() {
        return s.cards;
      },
      get cmdBtns() {
        return s.cmdBtns;
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
      allow: (what: 'plan' | 'then' | 'undo' | 'chips', on: boolean) => {
        if (s.tutAllow[what] === on) return;
        s.tutAllow[what] = on;
        s.buildHud();
      },
      get playBtn() {
        return s.top?.buttons.pause ?? null;
      },
      get planned() {
        return s.plan.orders;
      },
      queued: (gid: number) => s.thenQ.get(gid),
      get thenArming() {
        return s.thenArming;
      },
      badge: (gid: number) => s.tagMap.get(gid) ?? null,
      fieldTop: () => s.topH(),
      panelTop: () => s.m.VH - s.panelHeight(),
      headTop: () => s.sheetHeadY() - 1,
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
      centreOn: (x: number, y: number, uiY?: number) => {
        const cam = s.cameras.main;
        s.tweens.killTweensOf(cam);
        const p = isoToScreen(x, y);
        if (uiY === undefined) return s.centerCam(p.x, p.y - 20);
        // the point lands at height uiY of the screen (the field the narrator leaves free)
        cam.centerOn(p.x, p.y - 20 + (s.scale.height / 2 - uiY * s.m.S) / cam.zoom);
      },
    };
  }
}

function uiMetricsOf(scene: Phaser.Scene): { S: number; VW: number; VH: number } {
  return uiMetrics(scene);
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
