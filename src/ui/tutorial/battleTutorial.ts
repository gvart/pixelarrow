/**
 * The tutorial battle's controller (docs/DESIGN_V2.md "Onboarding", TUT-02).
 * It observes and scripts the battle scene through a small host interface
 * (BattleScene.tutorialHost) and the scene's 'tutorial' events (pan, zoom,
 * formation drag, turn knob, tap-to-move, ability, undo, play), so the scene
 * itself stays almost untouched:
 *
 * - steps come from src/game/tutorial.ts (order, completion conditions,
 *   progress); each one may first let the battle run until its moment comes
 *   (`pre`), then pauses it, lets old Nikias say his line (typewriter), lights
 *   the element to use (spotlight, pulsing ring, the rest dimmed and blocked)
 *   or demonstrates the gesture with the ghost hand, and waits until the player
 *   has really done it;
 * - the narrator docks where it covers neither what it points at nor the
 *   Shape row and FIGHT (`dock`, controls.md R7, TUT-1); the lit hole is never
 *   under it, so it never takes a tap meant for the lit control;
 * - the v5 controls arrive as their steps do (host.allow): planning while
 *   paused in the planning steps, the Then… chip from the move before it, Undo
 *   from its step; the 3 s windows stand still while Nikias waits;
 * - a done step chimes, is saved (a resumed tutorial skips it) and the battle
 *   runs on for a moment;
 * - skip (confirm) at any time; at the end the reward and the modes screen
 *   (src/scenes/FirstRunScene.ts).
 */
import Phaser from 'phaser';
import type { Battle } from '../../sim/battle';
import type { Order } from '../../sim/types';
import { worldRect } from '../layout';
import { confirmDialog, type UiScene } from '../widgets';
import { addText } from '../kit';
import { mosaicImage } from '../mosaic';
import { measureText } from '../textfit';
import { groupReadout } from '../battleHud';
import { flankThreats } from '../flankArc';
import { Narrator } from './narrator';
import { Spotlight, type Rect } from './spotlight';
import { GhostHand, type GhostScript, type Pt } from './ghost';
import { KNOB_PACES } from '../dragFormation';
import { ABILITIES } from '../../data/perks';
import { state } from '../../state';
import {
  TUT_GROUPS,
  beginTutorial,
  checkStep,
  enemyCue,
  finishTutorial,
  flankDir,
  grantReward,
  groupCentre,
  markStep,
  planSteps,
  progressOf,
  skipTutorial,
  stageTutorial,
  stepDef,
  tutorialExit,
  waveAtPost,
  waveClose,
  WIN_REAIM_S,
  type TutObs,
  type TutStepId,
  TUT_STEPS,
  type TutorialExit,
  type TutorialProgress,
} from '../../game/tutorial';
import { tutorialStep } from '../../audio/hooks';
import { track } from '../../platform/analytics';
import { haptic, hapticNotify } from '../../platform/haptics';
import { t, tOr, type TKey } from '../../i18n';
import { platform } from '../../platform';
import { keys } from '../input/keys';
import type { ActionId } from '../input/actions';
import { keyLabel } from '../settings/controls';
import { tutorialLine } from './keyLines';

/** The player's keyboard layout labels, once read (null: the US labels). */
let layoutLabels: ReadonlyMap<string, string> | null = null;
/** An action's current key, as the keyboard lines name it (input-v6.md §10: a rebound key shows correctly). */
const keyOf = (a: ActionId): string => {
  const [b0, b1] = keys.bindings[a];
  const b = b0 ?? b1;
  return b ? keyLabel(b, layoutLabels) : t('controls.none');
};

/** Analytics (docs/OPS.md): when this tutorial run began, and a step's stable number. */
let tutorialStartedAt = 0;
const tutStepNo = (id: TutStepId) => TUT_STEPS.findIndex((d) => d.id === id);

type Obj = Phaser.GameObjects.GameObject;

/** What the controller needs from the battle scene. */
export interface TutorialHost {
  readonly scene: UiScene;
  readonly sim: Battle;
  readonly selGroup: number;
  /** Select a group (-1: none) and rebuild the panel. */
  select(gid: number): void;
  readonly cards: readonly { gid: number; card: Phaser.GameObjects.Container }[];
  /** Order keys, chips (undo, then…) and medallions by key. */
  readonly cmdBtns: ReadonlyMap<string, Phaser.GameObjects.Container>;
  readonly hud: Phaser.GameObjects.Container;
  readonly followBtn: Phaser.GameObjects.Container | null;
  readonly paused: boolean;
  setPaused(p: boolean): void;
  hideBanner(): void;
  /** Turn on what a step teaches: planning while paused, the Then… chip, Undo; and the chips row and edge pointers (off while a step needs the ground). */
  allow(what: 'plan' | 'then' | 'undo' | 'chips', on: boolean): void;
  /** The top bar's Pause / Play key. */
  readonly playBtn: Phaser.GameObjects.Container | null;
  /** The orders staged while paused (the plan). */
  readonly planned: readonly Order[];
  /** A group's queued Then… step (null: none), and the group Then… is arming for (-1: none). */
  queued(gid: number): string | null;
  readonly thenArming: number;
  /** A field badge (null: not on screen). */
  badge(gid: number): Phaser.GameObjects.Container | null;
  /** Bottom of the top bar, top of the bottom sheet, and the top of its header row (Shape, Groups; UI px). */
  fieldTop(): number;
  panelTop(): number;
  headTop(): number;
  /** The narrator's x and width (battleLayout.narratorBox) and whether it docks in a landscape field (top-left, else its foot). */
  narratorBox(): { x: number; w: number; land: boolean };
  /** Field point -> UI pixels. */
  toUi(x: number, y: number): Pt;
  /** Field paces -> UI pixels at the current zoom (roughly, across the screen). */
  paceUi(): number;
  frameArmies(): void;
  /** Bring a field point to the middle of the field band, or to height `uiY` (UI px): what the step needs in sight. */
  centreOn(x: number, y: number, uiY?: number): void;
}

/** A battle-scene event the controller listens to (scene.events 'tutorial'). */
export type TutorialEvent =
  | { kind: 'pan'; px: number }
  | { kind: 'zoom' }
  | { kind: 'sling'; carried: boolean; aimed: boolean; fx: number; fy: number; group: number }
  | { kind: 'tapmove' }
  | { kind: 'ability' }
  | { kind: 'undo' }
  | { kind: 'play' }
  | { kind: 'hud' };

type Target = Rect | 'field' | null;

interface StepSpec {
  text?: TKey;
  /** The words of the line ({play}, {shoot}...): the scene's own labels (BTL-01). */
  params?: () => Record<string, string>;
  target?: () => Target;
  ghost?: () => GhostScript | null;
  /** A field point to mark: a flag (where to go) or, `foe`, a red ring (who). */
  marker?: () => Pt | null;
  foe?: boolean;
  /** Let the battle run until this is true before talking (seconds since the wait began). */
  pre?: (s: number) => boolean;
  preTimeout?: number;
  /** As the narrator starts. */
  enter?: () => void;
  /** Once he is docked: bring what the step needs into the field he leaves free. */
  view?: () => void;
  /** As the step is done. */
  done?: () => void;
  /** Seconds the battle runs on after the step. */
  after?: number;
}

const G = TUT_GROUPS;
const PRAISE: TKey[] = ['tut.good.0', 'tut.good.1', 'tut.good.2'];

/** The steps that point at a chip (the chips row shows only for them while a step waits). */
const CHIP_STEPS: readonly TutStepId[] = ['undo', 'then'];

/** Space kept round a lit control and the narrator (UI px). */
const CLEAR = 3;

const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const grow = (r: Rect, d: number): Rect => ({ x: r.x - d, y: r.y - d, w: r.w + d * 2, h: r.h + d * 2 });

export interface TutorialStart {
  /** Start over (Settings -> Replay) instead of resuming. */
  replay?: boolean;
  /** Where skip and finish return to: the screen Settings was opened from (a replay); none on the first run (FirstRun). */
  back?: TutorialExit;
}

export class BattleTutorial {
  private host: TutorialHost;
  private scene: UiScene;
  private layer: Phaser.GameObjects.Container;
  private narrator: Narrator;
  private spot: Spotlight;
  private ghost: GhostHand;
  private marker: Phaser.GameObjects.Graphics;
  private progress: TutorialProgress;
  readonly plan: TutStepId[];
  private idx = -1;
  private phase: 'pre' | 'talk' | 'run' | 'end' | 'idle' = 'idle';
  private timer = 0;
  private specs: Record<TutStepId, StepSpec>;
  // counters since the step began
  private panPx = 0;
  private zoomed = false;
  private lastSling: TutObs['lastSling'] = null;
  private tapMoves = 0;
  private abilities = 0;
  private undos = 0;
  private played = 0;
  // the enemy's script so far
  private chargeCued = false;
  private flankCued = false;
  private reaim = WIN_REAIM_S;
  /** The enemy group whose morale the morale step shows. */
  private moraleGid = -1;
  private dialog: Phaser.GameObjects.Container | null = null;
  private outcome: 'victory' | 'defeat' | null = null;
  private watchHide = 0;
  private flag: Pt | null = null;
  private praiseC: Phaser.GameObjects.Container | null = null;
  private lastTime = -1;
  /** What the step lit last frame (the narrator moves when that changes: redock). */
  private targetKind: 'field' | 'rect' | 'none' | '' = '';
  /** Where skip and finish go (TutorialStart.back). */
  private readonly back: TutorialExit | undefined;

  constructor(host: TutorialHost, opts: TutorialStart = {}) {
    this.host = host;
    this.scene = host.scene;
    this.back = opts.back;
    const st = state.campaign.data.settings;
    const prev = progressOf(st);
    this.progress = beginTutorial(opts.replay || prev.status !== 'active' ? { ...prev, done: [] } : prev, !!opts.replay);
    tutorialStartedAt = Date.now();
    void platform.input.keyLabels().then((m) => (layoutLabels = m), () => undefined);
    st.tutorial = this.progress;
    void state.save();
    this.plan = planSteps(this.progress);
    this.specs = this.buildSpecs();
    this.layer = this.scene.add.container(0, 0);
    this.scene.ui.add(this.layer);
    this.marker = this.scene.add.graphics();
    this.layer.add(this.marker);
    this.spot = new Spotlight(this.scene, this.layer);
    this.ghost = new GhostHand(this.scene, this.layer);
    this.narrator = new Narrator(this.scene, this.layer, { skip: () => this.askSkip(), close: () => this.closeBubble() });
    const sim = host.sim;
    stageTutorial(sim, (side, o) => {
      // learned already (resumed): the slingers loose at will as usual
      if (o.kind === 'loose' && !this.plan.includes('loose')) return;
      sim.issue(side, o);
    });
    host.select(-1);
    this.scene.events.on('tutorial', this.onEvent, this);
    this.scene.events.on('update', this.update, this);
    this.scene.events.once('shutdown', () => {
      this.scene.events.off('tutorial', this.onEvent, this);
      this.scene.events.off('update', this.update, this);
    });
    this.next();
  }

  /** Current step (null between steps). */
  get step(): TutStepId | null {
    return this.idx >= 0 && this.idx < this.plan.length ? this.plan[this.idx] : null;
  }

  /** The tutorial's overlay (on top of the HUD; screenshot staging). */
  get overlay(): Phaser.GameObjects.Container {
    return this.layer;
  }

  get talking(): boolean {
    return this.phase === 'talk';
  }

  /** The 3 s Undo and Then… windows stand still while Nikias waits for the player (BattleScene.chipNow). */
  get holdsChips(): boolean {
    return this.phase === 'talk';
  }

  /** Where the narrator sits now (UI px), or null. */
  narratorRect(): Rect | null {
    return this.narrator.visible ? this.narrator.rect : null;
  }

  // ------------------------------------------------------------------ steps

  private buildSpecs(): Record<TutStepId, StepSpec> {
    const h = this.host;
    const sim = () => h.sim;
    const field = (): Target => 'field';
    /** A point ahead of the hoplites, `left` paces to their left (clear of the slingers in front). */
    const ahead = (paces: number, left = 0): Pt | null => {
      const g = sim().groups[G.hop];
      const f = g.formation;
      // right of the facing (fx, fy) is (-fy, fx)
      return { x: f.cx + f.fx * paces + f.fy * left, y: f.cy + f.fy * paces - f.fx * left };
    };
    const play = () => t('battle.strip.play');
    return {
      intro: { text: 'tut.step.intro' },
      select: { text: 'tut.step.select', target: () => this.needGroup(G.hop) },
      pan: { text: 'tut.step.pan', target: field, ghost: () => this.panDemo() },
      zoom: { text: 'tut.step.zoom', target: field, ghost: () => this.pinchDemo() },
      sling: {
        text: 'tut.step.sling',
        target: field,
        enter: () => {
          if (h.selGroup !== G.hop) h.select(G.hop);
          h.frameArmies();
          // after a pinch the zoom may still be settling: frame again
          this.scene.time.delayedCall(250, () => h.frameArmies());
          this.flag = ahead(3.3, 2);
        },
        marker: () => this.flag,
        ghost: () => this.slingDemo(),
      },
      undo: { text: 'tut.step.undo', params: () => ({ undo: t('undo.chip') }), enter: () => h.allow('undo', true), target: () => this.rectOf(h.cmdBtns.get('undo')) },
      fight: { text: 'tut.step.fight', params: () => ({ fight: t('battle.fight') }), target: () => this.fightButton(), done: () => enemyCue(sim(), 'battle'), after: 1.2 },
      // planning while paused (controls.md R6.1): Shoot and the focus wait as a plan, Play gives it
      loose: { text: 'tut.step.loose', params: () => ({ play: play(), shoot: t('battle.ring.shoot') }), target: () => this.needCmd(G.sling, 'loose') },
      focus: {
        text: 'tut.step.focus',
        // the javelin-men in sight: they are what to tap
        view: () => this.look(G.foeSkirm),
        target: () => this.needGroup(G.sling) ?? 'field',
        marker: () => groupCentre(sim(), G.foeSkirm),
        foe: true,
      },
      play: { text: 'tut.step.play', params: () => ({ play: play() }), target: () => this.rectOf(h.playBtn), after: 1.5 },
      move: {
        text: 'tut.step.move',
        target: field,
        enter: () => {
          if (h.selGroup !== G.hop) h.select(G.hop);
          // the Then… chip comes with the move, so the next step finds it
          if (this.plan.includes('then')) h.allow('then', true);
          // ahead and to the left, clear of the slingers in front (Undo took the drag back)
          this.flag = ahead(4.5, 2);
        },
        view: () => this.flag && this.lookAt(this.flag.x, this.flag.y + 1.5),
        marker: () => this.flag,
        ghost: () => (this.flag ? { kind: 'tap', at: h.toUi(this.flag.x, this.flag.y) } : null),
      },
      // Then…: arm the chip, then Charge (it fires on arrival and the band comes on: update watches for it)
      then: {
        text: 'tut.step.then',
        params: () => ({ then: t('queue.chip.then'), charge: t('battle.ring.charge') }),
        enter: () => h.allow('then', true),
        target: () => this.thenTarget(),
        after: 2,
      },
      ability: {
        text: 'tut.step.ability',
        params: () => ({ ability: tOr('ability.bash.name', ABILITIES.bash.name) }),
        pre: () => sim().activeMembers(G.hop).some((u) => sim().abilityReady(u, 'bash')),
        preTimeout: 30,
        // its medallion, or on a short field (no room on the rail) the More key that opens the rest
        target: () => this.needCmd(G.hop, this.host.cmdBtns.has('bash') ? 'bash' : 'more'),
        after: 1.5,
      },
      // the morale glyph (battle-readability.md R1): on the first enemy badge that wavers or runs
      morale: {
        text: 'tut.step.morale',
        pre: () => {
          this.moraleGid = [G.foeMain, G.foeSkirm, G.foeWave].find((g) => {
            const s = groupReadout(sim(), g).state;
            return s === 'wavering' || s === 'routing';
          }) ?? -1;
          return this.moraleGid >= 0;
        },
        preTimeout: 45,
        view: () => this.look(this.moraleGid),
        target: () => this.badgeRect(this.moraleGid),
      },
      // the knob on the unengaged reserve (O3): the wave gathered on IV's flank strikes, its arcs show, IV turns to meet it
      flank: {
        text: 'tut.step.flank',
        pre: (s) => {
          if (!this.flankCued && (waveAtPost(sim()) || s > 12)) {
            this.flankCued = true;
            enemyCue(sim(), 'flank');
          }
          return this.flankCued && (flankThreats(sim(), G.pelt).length > 0 || waveClose(sim(), 5));
        },
        preTimeout: 40,
        // the reserve in sight, a little toward the wave: its knob is what to drag
        view: () => this.look(G.pelt, G.foeWave, 0.35),
        target: () => this.needGroup(G.pelt) ?? 'field',
        ghost: () => this.turnDemo(),
        marker: () => groupCentre(sim(), G.foeWave),
        foe: true,
        done: () => enemyCue(sim(), 'win'),
      },
      win: {
        text: 'tut.step.win',
        enter: () => {
          if (!this.flankCued) enemyCue(sim(), 'flank');
          enemyCue(sim(), 'win');
        },
      },
      victory: { text: 'tut.step.victory' },
    };
  }

  /** Bring group `gid` (or `k` of the way from it toward group `to`) to the middle of the field the narrator leaves free. */
  private look(gid: number, to = -1, k = 0): void {
    const a = groupCentre(this.host.sim, gid);
    if (!a) return;
    const b = to >= 0 ? groupCentre(this.host.sim, to) : null;
    this.lookAt(b ? a.x + (b.x - a.x) * k : a.x, b ? a.y + (b.y - a.y) * k : a.y);
  }

  private lookAt(x: number, y: number): void {
    const { top, bottom } = this.freeBand();
    this.host.centreOn(x, y, (top + bottom) / 2);
  }

  /** The field band (UI px) the narrator leaves free: the lit hole of a field step, where its ghost and marks go. */
  private freeBand(): { top: number; bottom: number } {
    const h = this.host;
    const n = this.narrator.visible ? this.narrator.rect : null;
    let top = h.fieldTop();
    let bottom = h.panelTop();
    if (n && n.y <= top && n.y + n.h > top) top = n.y + n.h;
    if (n && n.y + n.h >= bottom && n.y < bottom) bottom = n.y;
    return { top, bottom: Math.max(top + 10, bottom) };
  }

  private next(): void {
    this.clearUi();
    this.idx++;
    const id = this.step;
    if (!id) return this.finish();
    const spec = this.specs[id];
    this.timer = 0;
    if (spec.pre && this.host.sim.phase === 'battle') {
      this.phase = 'pre';
      this.host.allow('plan', false);
      this.host.allow('chips', true);
      this.host.setPaused(false);
      return;
    }
    this.talk();
  }

  private lineOf(id: TutStepId): string {
    const spec = this.specs[id];
    const dev = { keyboard: platform.input.keyboard(), fine: platform.input.finePointer() };
    return tutorialLine(id, spec.text ?? 'tut.step.win', spec.params?.(), dev, keyOf);
  }

  private talk(): void {
    const id = this.step!;
    const def = stepDef(id);
    const spec = this.specs[id];
    const h = this.host;
    this.phase = 'talk';
    this.panPx = 0;
    this.zoomed = false;
    this.lastSling = null;
    this.tapMoves = 0;
    this.abilities = 0;
    this.undos = 0;
    this.played = 0;
    this.flag = null;
    const battle = h.sim.phase === 'battle';
    // the planning steps stage orders while paused; every other step gives them at once
    h.allow('plan', !!def.plan);
    // the chips row over the field (Undo, Then…, Clear plan) and the edge pointers only when the step is about a chip: else the ground stays clear
    h.allow('chips', def.kind !== 'action' || CHIP_STEPS.includes(id));
    if (def.kind === 'watch') h.setPaused(false);
    else if (battle) h.setPaused(true);
    spec.enter?.();
    h.hideBanner();
    this.say(this.lineOf(id), def.kind === 'info');
    const tg = spec.target?.() ?? null;
    this.targetKind = tg === 'field' ? 'field' : tg ? 'rect' : 'none';
    spec.view?.();
    if (def.kind === 'watch') this.watchHide = 2600;
    if (spec.ghost) this.ghost.play(spec.ghost);
    this.refreshSpot();
  }

  private say(text: string, tap: boolean): void {
    const y = this.dock(text, tap);
    this.narrator.say(text, { y, tap, onTap: tap ? () => this.tapInfo() : undefined });
  }

  /**
   * Where the narrator goes (TUT-1, O2): over the group cards, its foot just
   * above the Shape row (so Shape, FIGHT and the order keys stay in sight), or
   * over the top bar when that would cover what it points at (a card, a
   * medallion, the chips). Of the two, the one that covers the lit control,
   * the flag and the ghost's path least.
   */
  private dock(text: string, tap: boolean): number {
    const h = this.host;
    const box = h.narratorBox();
    this.narrator.box = box;
    const nh = this.narrator.measure(text, tap);
    const keep: Rect[] = [];
    const id = this.step;
    const spec = id ? this.specs[id] : null;
    const tg = spec?.target?.() ?? null;
    if (tg && tg !== 'field') keep.push(grow(tg, CLEAR + 3));
    const pts: Pt[] = [];
    const m = spec?.marker?.();
    if (m) pts.push(h.toUi(m.x, m.y));
    const g = spec?.ghost?.();
    if (g) pts.push(...(g.kind === 'drag' ? g.pts : [g.at]));
    for (const p of pts) keep.push({ x: p.x - 12, y: p.y - 16, w: 24, h: 24 });
    // landscape (§13.1): top-left of the field, else at its foot; never over the top row, the cards or the rail
    const cands = box.land ? [h.fieldTop(), Math.max(h.fieldTop(), h.panelTop() - 2 - nh)] : [Math.max(h.fieldTop(), h.headTop() - 2 - nh), 0];
    let best = cands[0];
    let bestCost = Infinity;
    for (const y of cands) {
      const r = { x: box.x, y, w: box.w, h: nh };
      const cost = keep.reduce((a, k) => a + overlap(r, k), 0);
      if (cost < bestCost) {
        best = y;
        bestCost = cost;
      }
    }
    return best;
  }

  /**
   * The lit control changed (the card is tapped, now the ground; the chip, now
   * the key): move the narrator if it would cover the new one, its line whole,
   * and bring the step's ground back into view.
   */
  private redock(): void {
    const id = this.step;
    if (!id || this.outcome || this.narrator.folded) return;
    // only when the lit control is now under him, or the step turned to the ground (no flicker while the camera eases)
    const tg = this.specs[id].target?.() ?? null;
    const kind = tg === 'field' ? 'field' : tg ? 'rect' : 'none';
    const was = this.targetKind;
    this.targetKind = kind;
    const covered = !!tg && tg !== 'field' && overlap(grow(tg, CLEAR), this.narrator.rect) > 0;
    if (!covered && !(kind === 'field' && was !== 'field' && was !== '')) return;
    const text = this.lineOf(id);
    const info = stepDef(id).kind === 'info';
    const y = this.dock(text, info);
    if (y === this.narrator.rect.y) return;
    this.narrator.say(text, { y, tap: info, instant: true, onTap: info ? () => this.tapInfo() : undefined });
    this.specs[id].view?.();
  }

  /** ✕ on the narrator: an info line goes on; an action step folds the bubble into its "Nikias" key. */
  private closeBubble(): void {
    if (this.dialog || this.phase !== 'talk') return;
    const id = this.step;
    if (this.outcome || (id && stepDef(id).kind === 'info')) {
      this.narrator.finishTyping();
      this.tapInfo();
      return;
    }
    this.narrator.fold();
    this.refreshSpot();
  }

  /** A tap during an info step: show the whole line first, then go on. */
  private tapInfo(): void {
    if (this.dialog || this.phase !== 'talk') return;
    if (this.narrator.finishTyping()) return;
    if (this.outcome === 'defeat') return this.restart();
    this.complete();
  }

  private complete(): void {
    const id = this.step;
    if (!id || this.phase !== 'talk') return;
    const def = stepDef(id);
    const spec = this.specs[id];
    this.progress = markStep(this.progress, id);
    track('tutorial_step', { id, step: tutStepNo(id) });
    state.campaign.data.settings.tutorial = this.progress;
    void state.save();
    if (def.kind === 'action') {
      tutorialStep();
      hapticNotify('success');
      this.praise(t(PRAISE[this.idx % PRAISE.length]));
    } else haptic('light');
    spec.done?.();
    this.clearUi();
    if (spec.after && this.host.sim.phase === 'battle') {
      this.phase = 'run';
      this.timer = spec.after;
      this.host.allow('plan', false);
      this.host.allow('chips', true);
      this.host.setPaused(false);
      return;
    }
    this.next();
  }

  /** A short word of praise over the field (clear of the top bar and the banners), rising and fading. */
  private praise(word: string): void {
    const s = this.scene;
    const w = measureText(word) + 14;
    const x = Math.round((s.m.VW - w) / 2);
    this.praiseC?.destroy();
    const c = s.add.container(0, this.host.fieldTop() + 4);
    c.add(mosaicImage(s, x, 0, w, 15, 'parchment'));
    c.add(addText(s, s.m.VW / 2, 4, word, 'pGood', 0.5));
    this.layer.add(c);
    this.praiseC = c;
    s.tweens.add({ targets: c, alpha: 0, delay: 700, duration: 400, onComplete: () => c.destroy() });
  }

  private clearUi(): void {
    this.narrator.hide();
    this.spot.show(null);
    this.ghost.stop();
    this.marker.clear();
  }

  // ------------------------------------------------------------------ loop

  private update(time: number): void {
    if (!this.scene.sys.isActive()) return;
    const delta = this.lastTime < 0 ? 16 : Math.min(250, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    const sim = this.host.sim;
    this.host.followBtn?.setVisible(false);
    // the hoplites charge (their queued Then… step fired, or the Charge key): the band comes on, the wave slips round
    if (!this.chargeCued && sim.phase === 'battle' && sim.groups[G.hop].order === 'charge') {
      this.chargeCued = true;
      enemyCue(sim, 'charge');
    }
    // the battle is over: victory (or a defeat to try again), whatever step we were on
    if (sim.phase === 'ended' && !this.outcome && sim.winner !== null) {
      this.outcome = sim.winner === 0 ? 'victory' : 'defeat';
      if (this.outcome === 'victory') {
        if (this.step !== 'win' && this.step !== 'victory') this.idx = this.plan.indexOf('win');
        this.clearUi();
        this.phase = 'run';
        this.timer = 1.6;
        if (this.step === 'win') {
          this.progress = markStep(this.progress, 'win');
          state.campaign.data.settings.tutorial = this.progress;
          void state.save();
        }
      } else {
        this.clearUi();
        this.phase = 'talk';
        this.say(t('tut.step.defeat'), true);
        this.refreshSpot();
      }
    }
    const dt = Math.min(delta, 100) / 1000;
    const running = sim.phase === 'battle' && !this.host.paused && !this.dialog;
    // the finale: the enemy groups out of contact are re-aimed at our men now and then, so it never stalls
    if (running && this.step === 'win') {
      this.reaim -= dt;
      if (this.reaim <= 0) {
        this.reaim = WIN_REAIM_S;
        enemyCue(sim, 'win');
      }
    }
    if (this.phase === 'pre') {
      if (running) this.timer += dt;
      const spec = this.specs[this.step!];
      if (spec.pre?.(this.timer)) this.talk();
      else if (this.timer > (spec.preTimeout ?? 30)) this.next(); // its moment never came: on without it
    } else if (this.phase === 'run') {
      if (running || sim.phase !== 'battle') this.timer -= dt;
      if (this.timer <= 0) this.next();
    } else if (this.phase === 'talk' && !this.outcome) {
      const id = this.step!;
      const def = stepDef(id);
      if (def.kind !== 'info' && checkStep(id, this.obs())) this.complete();
      else if (def.kind === 'watch' && this.watchHide > 0) {
        this.watchHide -= delta;
        if (this.watchHide <= 0) this.clearUi();
      }
    }
    if (this.phase === 'talk') this.refreshSpot();
    this.narrator.update(time);
    this.spot.update(time);
    this.ghost.update(time);
    this.drawMarker(time);
  }

  private obs(): TutObs {
    const h = this.host;
    const sim = h.sim;
    const plan = h.planned;
    const sling = (o: Order) => 'group' in o && o.group === G.sling;
    return {
      phase: sim.phase,
      selGroup: h.selGroup,
      hop: G.hop,
      sling: G.sling,
      pelt: G.pelt,
      panPx: this.panPx,
      zoomed: this.zoomed,
      lastSling: this.lastSling,
      tapMoves: this.tapMoves,
      slingFire: sim.groups[G.sling].fireAtWill,
      slingFocus: sim.groups[G.sling].focus ?? -1,
      planLoose: plan.some((o) => sling(o) && o.kind === 'loose' && o.on !== false),
      planFocus: plan.some((o) => sling(o) && o.kind === 'focus' && o.target >= 0),
      played: this.played,
      hopQueued: h.queued(G.hop),
      undos: this.undos,
      abilities: this.abilities,
      flankDir: flankDir(sim),
      winner: sim.winner,
    };
  }

  private onEvent(e: TutorialEvent): void {
    switch (e.kind) {
      case 'pan':
        this.panPx += e.px;
        break;
      case 'zoom':
        this.zoomed = true;
        break;
      case 'sling':
        this.lastSling = { carried: e.carried, aimed: e.aimed, fx: e.fx, fy: e.fy, group: e.group };
        break;
      case 'tapmove':
        this.tapMoves++;
        break;
      case 'ability':
        this.abilities++;
        break;
      case 'undo':
        this.undos++;
        break;
      case 'play':
        this.played++;
        break;
      case 'hud':
        this.host.followBtn?.setVisible(false);
        if (this.phase === 'talk') this.refreshSpot();
        break;
    }
  }

  // ------------------------------------------------------------------ spotlight

  private refreshSpot(): void {
    const id = this.step;
    if (!id || this.phase !== 'talk' || !this.narrator.visible) {
      this.spot.show(null);
      return;
    }
    this.redock();
    const def = stepDef(id);
    const spec = this.specs[id];
    const { VW } = this.scene.m;
    if (this.outcome) {
      this.spot.show({ hole: null, dim: 0.35, block: true, onTap: () => this.tapInfo() });
      return;
    }
    if (def.kind === 'info') {
      // a readout to look at (the morale glyph): lit and ringed, but every tap goes on
      const r = spec.target?.();
      const hole = r && r !== 'field' ? grow(r, 1) : null;
      this.spot.show({ hole, dim: 0.35, ring: !!hole, block: hole ? 'all' : true, onTap: () => this.tapInfo() });
      return;
    }
    if (def.kind === 'watch') {
      this.spot.show(null);
      return;
    }
    const tg = spec.target?.() ?? null;
    if (tg === 'field') {
      // the narrator is never inside the hole: a tap there must reach the field, never the panel
      const { top, bottom } = this.freeBand();
      this.spot.show({ hole: { x: 0, y: top, w: VW, h: bottom - top }, dim: 0.3, block: true });
    } else if (tg) {
      this.spot.show({ hole: grow(tg, 1), dim: 0.55, ring: true, block: true });
    } else this.spot.show({ hole: null, dim: 0.35, block: true });
  }

  private rectOf(o: Obj | null | undefined): Rect | null {
    if (!o || !(o as Phaser.GameObjects.Container).visible || !o.scene) return null;
    const S = this.scene.m.S;
    const any = o as unknown as { w?: number; h?: number };
    let r: Rect;
    if (typeof any.w === 'number' && typeof any.h === 'number') r = worldRect(o as unknown as Phaser.GameObjects.Components.Transform, 0, 0, any.w, any.h);
    else {
      const b = (o as unknown as { getBounds(): Phaser.Geom.Rectangle }).getBounds();
      r = { x: b.x, y: b.y, w: b.width, h: b.height };
    }
    return { x: Math.round(r.x / S), y: Math.round(r.y / S), w: Math.round(r.w / S), h: Math.round(r.h / S) };
  }

  /** An enemy group's field badge (the morale glyph rides on it). */
  private badgeRect(gid: number): Rect | null {
    return gid >= 0 ? this.rectOf(this.host.badge(gid)) : null;
  }

  /** Light the group's card while it is not selected (null once it is). */
  private needGroup(gid: number): Rect | null {
    const h = this.host;
    if (h.selGroup === gid) return null;
    return this.rectOf(h.cards.find((c) => c.gid === gid)?.card ?? null);
  }

  /** Select the group, then tap the key (an order key or a medallion): light whichever comes next. */
  private needCmd(gid: number, key: string): Target {
    const g = this.needGroup(gid);
    if (g) return g;
    return this.rectOf(this.host.cmdBtns.get(key));
  }

  /** Then…: the hoplites' card, the Then… chip, then Charge while it arms; the ground again if the chip went. */
  private thenTarget(): Target {
    const h = this.host;
    const g = this.needGroup(G.hop);
    if (g) return g;
    if (h.thenArming === G.hop) return this.rectOf(h.cmdBtns.get('charge'));
    return this.rectOf(h.cmdBtns.get('then')) ?? 'field';
  }

  private fightButton(): Target {
    let hit: Obj | null = null;
    const label = t('battle.fight');
    const walk = (list: Obj[]) => {
      for (const o of list) {
        if (hit) return;
        const any = o as unknown as { o?: { label?: string }; opts?: { label?: string }; list?: Obj[] };
        if (any.o?.label === label || any.opts?.label === label) hit = o;
        else if (any.list) walk(any.list);
      }
    };
    walk(this.host.hud.list);
    return this.rectOf(hit);
  }

  // ------------------------------------------------------------------ demonstrations

  /** A free spot in the lit field, away from the soldiers (a drag there pans). */
  private emptySpot(): Pt {
    const h = this.host;
    const { VW } = this.scene.m;
    const band = this.freeBand();
    const top = band.top + 12;
    const bottom = Math.max(top, band.bottom - 12);
    const men = h.sim.units.filter((u) => u.state === 'ready').map((u) => h.toUi(u.x, u.y));
    let best: Pt = { x: VW / 2, y: (top + bottom) / 2 };
    let bestD = -1;
    for (let y = top; y <= bottom; y += 8)
      for (let x = 30; x <= VW - 30; x += 8) {
        const d = Math.min(...men.map((m) => Math.hypot(m.x - x, m.y - 12 - y)));
        if (d > bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    return best;
  }

  private panDemo(): GhostScript {
    const p = this.emptySpot();
    const dx = p.x > this.scene.m.VW / 2 ? -34 : 34;
    return { kind: 'drag', pts: [p, { x: p.x + dx, y: p.y + 10 }, p], rest: [0, 150, 0] };
  }

  private pinchDemo(): GhostScript {
    const { top, bottom } = this.freeBand();
    return { kind: 'pinch', at: { x: this.scene.m.VW / 2, y: Math.round((top + bottom) / 2) }, d0: 14, d1: 64 };
  }

  /** Press on the hoplites and drag them to the flag. */
  private slingDemo(): GhostScript | null {
    const h = this.host;
    const c = groupCentre(h.sim, G.hop);
    const f = h.sim.groups[G.hop].formation;
    if (!c || !this.flag) return null;
    const dx = this.flag.x - f.cx;
    const dy = this.flag.y - f.cy;
    const a = h.toUi(c.x, c.y - 0.2);
    const b = h.toUi(c.x + dx, c.y + dy - 0.2);
    return { kind: 'drag', pts: [a, b], rest: [0, 450] };
  }

  /** Press on the reserve's facing knob and swing it round toward the wave (once the reserve is selected). */
  private turnDemo(): GhostScript | null {
    const h = this.host;
    if (h.selGroup !== G.pelt) return null;
    const c = groupCentre(h.sim, G.pelt);
    const d = flankDir(h.sim);
    if (!c || !d) return null;
    const f = h.sim.groups[G.pelt].formation;
    const r = KNOB_PACES + 0.6;
    // round the arc from the knob to the wave's side, through the middle direction
    let mx = f.fx + d.x;
    let my = f.fy + d.y;
    const ml = Math.hypot(mx, my);
    if (ml > 1e-3) {
      mx /= ml;
      my /= ml;
    } else {
      mx = -f.fy;
      my = f.fx;
    }
    const a = h.toUi(f.cx + f.fx * KNOB_PACES, f.cy + f.fy * KNOB_PACES);
    const m = h.toUi(c.x + mx * r, c.y + my * r);
    const e = h.toUi(c.x + d.x * r, c.y + d.y * r);
    return { kind: 'drag', pts: [a, m, e], rest: [0, 0, 450] };
  }

  /** A flag on the field where the step wants the men, or a red ring round the foe it means (pulsing, in perspective). */
  private drawMarker(time: number): void {
    const g = this.marker;
    g.clear();
    if (this.phase !== 'talk' || !this.narrator.visible) return;
    const id = this.step;
    const spec = id ? this.specs[id] : null;
    const p = spec?.marker?.();
    if (!p) return;
    const s = this.host.toUi(p.x, p.y);
    // only on the field band: off it the mark would sit on the top bar or the sheet
    const n = this.narrator.rect;
    if (s.y < this.host.fieldTop() + 4 || s.y > this.host.panelTop() - 4 || (s.x >= n.x && s.x <= n.x + n.w && s.y >= n.y && s.y <= n.y + n.h)) return;
    const k = (Math.sin(time / 200) + 1) / 2;
    const pace = this.host.paceUi();
    const foe = !!spec?.foe;
    const rx = Math.max(6, pace * (foe ? 1.6 : 0.9)) + k * 2;
    const col = foe ? 0xe05040 : 0xf0c860;
    // a dark rim first: the ring reads on light and dark ground alike (A11Y-03)
    g.lineStyle(2.5, 0x140c08, 0.5);
    g.strokeEllipse(s.x, s.y, rx * 2, rx);
    g.lineStyle(1, col, 0.6 + 0.4 * k);
    g.strokeEllipse(s.x, s.y, rx * 2, rx);
    if (!foe) {
      g.fillStyle(0x3a2a1a, 1);
      g.fillRect(Math.round(s.x), Math.round(s.y - 14), 1, 14);
      g.fillStyle(0xb8382a, 1);
      g.fillTriangle(s.x + 1, s.y - 14, s.x + 8, s.y - 11.5, s.x + 1, s.y - 9);
    }
  }

  // ------------------------------------------------------------------ skip, restart, finish

  /** Skip (asks first). The narrator's Skip, Back and the ⋯ menu's Skip tutorial come here. */
  askSkip(): void {
    if (this.dialog) return;
    const wasPaused = this.host.paused;
    if (this.host.sim.phase === 'battle') this.host.setPaused(true);
    const d = confirmDialog(this.scene, {
      title: t('tut.skipTitle'),
      body: t('tut.skipBody'),
      ok: t('tut.skipOk'),
      cancel: t('common.stay'),
      onOk: () => {
        this.dialog = null;
        state.campaign.data.settings.tutorial = skipTutorial(this.progress);
        track('tutorial_skip', { id: this.step ?? 'none', step: this.step ? tutStepNo(this.step) : 0 });
        void state.save();
        const to = tutorialExit(this.back);
        this.scene.scene.start(to.scene, to.data);
      },
      onCancel: () => {
        this.dialog = null;
        if (this.host.sim.phase === 'battle') this.host.setPaused(wasPaused);
      },
    });
    this.dialog = d;
    d.once('destroy', () => this.dialog === d && (this.dialog = null));
  }

  private restart(): void {
    this.phase = 'end';
    this.scene.scene.restart({ tutorial: { back: this.back } });
  }

  private finish(): void {
    this.phase = 'end';
    this.clearUi();
    this.host.allow('plan', false);
    this.host.allow('chips', true);
    const data = state.campaign.data;
    const f = finishTutorial(this.progress);
    track('tutorial_complete', { ms: tutorialStartedAt ? Date.now() - tutorialStartedAt : 0 });
    data.settings.tutorial = f.progress;
    // the tutorial taught every gesture: the generic "Orders by touch" hint is not shown again on the next deployment (QA-03 S4)
    data.settings.seenGestureHint = true;
    let reward = null;
    if (f.reward) reward = grantReward(data, state.campaign.random());
    // the campaign exists now: Continue works from the menu
    state.hasSave = true;
    void state.save();
    const to = tutorialExit(this.back, reward);
    this.scene.scene.start(to.scene, to.data);
  }
}
