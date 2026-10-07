/**
 * The tutorial battle's controller (docs/DESIGN_V2.md "Onboarding"). It
 * observes and scripts the battle scene through a small host interface
 * (BattleScene.tutorialHost) and the scene's 'tutorial' events (pan, zoom,
 * slingshot, tap-to-move, ability), so the scene itself stays almost
 * untouched:
 *
 * - steps come from src/game/tutorial.ts (order, completion conditions,
 *   progress); each one may first let the battle run until its moment comes
 *   (`pre`), then pauses it, lets old Nikias say his line (typewriter), lights
 *   the element to use (spotlight, pulsing ring, the rest dimmed and blocked)
 *   or demonstrates the gesture with the ghost hand, and waits until the player
 *   has really done it;
 * - a done step chimes, is saved (a resumed tutorial skips it) and the battle
 *   runs on for a moment;
 * - skip (confirm) at any time; at the end the reward and the modes screen
 *   (src/scenes/FirstRunScene.ts).
 */
import Phaser from 'phaser';
import type { Battle } from '../../sim/battle';
import type { BattleCategory } from '../theme';
import { worldRect } from '../layout';
import { confirmDialog, type UiScene } from '../widgets';
import { addPanel, addText } from '../kit';
import { measureText } from '../textfit';
import { Narrator } from './narrator';
import { Spotlight, type Rect } from './spotlight';
import { GhostHand, type GhostScript, type Pt } from './ghost';
import { state } from '../../state';
import {
  TUT_GROUPS,
  beginTutorial,
  checkStep,
  enemyCue,
  bandBroken,
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
  waveClose,
  type TutObs,
  type TutStepId,
  type TutorialProgress,
} from '../../game/tutorial';
import { tutorialStep } from '../../audio/hooks';
import { haptic, hapticNotify } from '../../platform/telegram';
import { t, type TKey } from '../../i18n';

/** What the controller needs from the battle scene. */
export interface TutorialHost {
  readonly scene: UiScene;
  readonly sim: Battle;
  readonly selGroup: number;
  /** Select a group (-1: none) and rebuild the panel. */
  select(gid: number): void;
  readonly cat: BattleCategory;
  readonly catOpen: boolean;
  readonly compact: boolean;
  readonly cards: readonly { gid: number; card: Phaser.GameObjects.Container }[];
  readonly cmdBtns: ReadonlyMap<string, Phaser.GameObjects.Container>;
  readonly tabBtns: ReadonlyMap<BattleCategory, Phaser.GameObjects.Container>;
  readonly hud: Phaser.GameObjects.Container;
  readonly followBtn: Phaser.GameObjects.Container | null;
  readonly paused: boolean;
  setPaused(p: boolean): void;
  hideBanner(): void;
  /** Bottom of the top bar and top of the command panel (UI px). */
  fieldTop(): number;
  panelTop(): number;
  /** Field point -> UI pixels. */
  toUi(x: number, y: number): Pt;
  /** Field paces -> UI pixels at the current zoom (roughly, across the screen). */
  paceUi(): number;
  frameArmies(): void;
}

/** A battle-scene event the controller listens to (scene.events 'tutorial'). */
export type TutorialEvent =
  | { kind: 'pan'; px: number }
  | { kind: 'zoom' }
  | { kind: 'sling'; carried: boolean; aimed: boolean; fx: number; fy: number; group: number }
  | { kind: 'tapmove' }
  | { kind: 'ability' }
  | { kind: 'hud' };

type Target = Rect | 'field' | null;

interface StepSpec {
  /** Where the narrator sits: over the field's top, or over the command panel. */
  at: 'top' | 'bottom';
  text?: TKey;
  target?: () => Target;
  ghost?: () => GhostScript | null;
  /** A field point to mark with a flag (where to go). */
  marker?: () => Pt | null;
  /** Let the battle run until this is true before talking (seconds since the wait began). */
  pre?: (s: number) => boolean;
  preTimeout?: number;
  /** As the narrator starts. */
  enter?: () => void;
  /** As the step is done. */
  done?: () => void;
  /** Seconds the battle runs on after the step. */
  after?: number;
}

const G = TUT_GROUPS;
const PRAISE: TKey[] = ['tut.good.0', 'tut.good.1', 'tut.good.2'];

export interface TutorialStart {
  /** Start over (Settings -> Replay) instead of resuming. */
  replay?: boolean;
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
  private flankCued = false;
  private dialog: Phaser.GameObjects.Container | null = null;
  private outcome: 'victory' | 'defeat' | null = null;
  private watchHide = 0;

  constructor(host: TutorialHost, opts: TutorialStart = {}) {
    this.host = host;
    this.scene = host.scene;
    const st = state.campaign.data.settings;
    const prev = progressOf(st);
    this.progress = beginTutorial(opts.replay || prev.status !== 'active' ? { ...prev, done: [] } : prev, !!opts.replay);
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
    this.narrator = new Narrator(this.scene, this.layer, () => this.askSkip());
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

  // ------------------------------------------------------------------ steps

  private buildSpecs(): Record<TutStepId, StepSpec> {
    const h = this.host;
    const sim = () => h.sim;
    const field = (): Target => 'field';
    const ahead = (paces: number): Pt | null => {
      const g = sim().groups[G.hop];
      const f = g.formation;
      return { x: f.cx + f.fx * paces, y: f.cy + f.fy * paces };
    };
    return {
      intro: { at: 'bottom', text: 'tut.step.intro' },
      select: { at: 'top', text: 'tut.step.select', target: () => this.needGroup(G.hop) },
      pan: { at: 'bottom', text: 'tut.step.pan', target: field, ghost: () => this.panDemo() },
      zoom: { at: 'bottom', text: 'tut.step.zoom', target: field, ghost: () => this.pinchDemo() },
      sling: {
        at: 'bottom',
        text: 'tut.step.sling',
        target: field,
        enter: () => {
          if (h.selGroup !== G.hop) h.select(G.hop);
          h.frameArmies();
          // after a pinch the zoom may still be settling: frame again
          this.scene.time.delayedCall(250, () => h.frameArmies());
          this.flag = ahead(2.5);
        },
        marker: () => this.flag,
        ghost: () => this.slingDemo(),
      },
      fight: { at: 'top', text: 'tut.step.fight', target: () => this.fightButton(), done: () => enemyCue(sim(), 'battle'), after: 1.2 },
      move: {
        at: 'bottom',
        text: 'tut.step.move',
        target: field,
        enter: () => {
          if (h.selGroup !== G.hop) h.select(G.hop);
          this.flag = ahead(3);
        },
        marker: () => this.flag,
        ghost: () => (this.flag ? { kind: 'tap', at: h.toUi(this.flag.x, this.flag.y) } : null),
        after: 2.2,
      },
      wall: { at: 'top', text: 'tut.step.wall', target: () => this.needCmd(G.hop, 'formation', 'form_shieldwall'), after: 2.5 },
      loose: { at: 'top', text: 'tut.step.loose', target: () => this.needCmd(G.sling, 'attack', 'loose'), after: 2.5 },
      charge: { at: 'top', text: 'tut.step.charge', target: () => this.needCmd(G.hop, 'attack', 'charge'), done: () => enemyCue(sim(), 'charge') },
      ability: {
        at: 'top',
        text: 'tut.step.ability',
        pre: () => sim().activeMembers(G.hop).some((u) => sim().abilityReady(u, 'bash')),
        preTimeout: 25,
        target: () => this.needCmd(G.hop, 'abilities', 'bash'),
        after: 1.5,
      },
      flank: {
        at: 'bottom',
        text: 'tut.step.flank',
        pre: (s) => {
          if (!this.flankCued && (bandBroken(sim()) || s > 22)) {
            this.flankCued = true;
            enemyCue(sim(), 'flank');
          }
          return this.flankCued && waveClose(sim());
        },
        preTimeout: 50,
        enter: () => {
          if (h.selGroup !== G.hop) h.select(G.hop);
        },
        target: field,
        ghost: () => this.turnDemo(),
        marker: () => {
          const c = groupCentre(sim(), G.foeWave);
          return c;
        },
        done: () => enemyCue(sim(), 'win'),
      },
      win: {
        at: 'bottom',
        text: 'tut.step.win',
        enter: () => {
          if (!this.flankCued) enemyCue(sim(), 'flank');
          enemyCue(sim(), 'win');
        },
      },
      victory: { at: 'bottom', text: 'tut.step.victory' },
    };
  }

  private flag: Pt | null = null;

  private next(): void {
    this.clearUi();
    this.idx++;
    const id = this.step;
    if (!id) return this.finish();
    const spec = this.specs[id];
    this.timer = 0;
    if (spec.pre && this.host.sim.phase === 'battle') {
      this.phase = 'pre';
      this.host.setPaused(false);
      return;
    }
    this.talk();
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
    this.flag = null;
    const battle = h.sim.phase === 'battle';
    if (def.kind === 'watch') h.setPaused(false);
    else if (battle) h.setPaused(true);
    spec.enter?.();
    if (spec.at === 'top') h.hideBanner();
    const text = t(spec.text ?? 'tut.step.win');
    const info = def.kind === 'info';
    this.say(text, spec.at, info);
    // a word of praise still showing goes below a narrator at the top
    if (this.praiseC?.scene && spec.at === 'top') this.praiseC.y = this.narrator.rect.y + this.narrator.rect.h + 4;
    if (def.kind === 'watch') this.watchHide = 2600;
    if (spec.ghost) this.ghost.play(spec.ghost);
    this.refreshSpot();
  }

  private say(text: string, at: 'top' | 'bottom', tap: boolean): void {
    const y = at === 'top' ? this.host.fieldTop() + 2 : 'bottom';
    this.narrator.say(text, { y, tap, onTap: tap ? () => this.tapInfo() : undefined });
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
      this.host.setPaused(false);
      return;
    }
    this.next();
  }

  /** A short word of praise over the field (clear of the top bar and the banners), rising and fading. */
  private praise(word: string): void {
    const s = this.scene;
    const w = measureText(word.toUpperCase()) + 14;
    const x = Math.round((s.m.VW - w) / 2);
    this.praiseC?.destroy();
    const c = s.add.container(0, this.host.fieldTop() + 34);
    c.add(addPanel(s, x, 0, w, 15, 'parch'));
    c.add(addText(s, s.m.VW / 2, 4, word.toUpperCase(), 'good', 0.5));
    this.layer.add(c);
    this.praiseC = c;
    s.tweens.add({ targets: c, alpha: 0, delay: 700, duration: 400, onComplete: () => c.destroy() });
  }

  private praiseC: Phaser.GameObjects.Container | null = null;

  private clearUi(): void {
    this.narrator.hide();
    this.spot.show(null);
    this.ghost.stop();
    this.marker.clear();
  }

  // ------------------------------------------------------------------ loop

  private lastTime = -1;

  private update(time: number): void {
    if (!this.scene.sys.isActive()) return;
    const delta = this.lastTime < 0 ? 16 : Math.min(250, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    const sim = this.host.sim;
    this.host.followBtn?.setVisible(false);
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
        this.say(t('tut.step.defeat'), 'bottom', true);
        this.refreshSpot();
      }
    }
    const dt = Math.min(delta, 100) / 1000;
    const running = sim.phase === 'battle' && !this.host.paused && !this.dialog;
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
    const sim = this.host.sim;
    return {
      phase: sim.phase,
      selGroup: this.host.selGroup,
      hop: G.hop,
      sling: G.sling,
      panPx: this.panPx,
      zoomed: this.zoomed,
      lastSling: this.lastSling,
      tapMoves: this.tapMoves,
      hopFormation: sim.groups[G.hop].formation.type,
      hopOrder: sim.groups[G.hop].order,
      slingFire: sim.groups[G.sling].fireAtWill,
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
    const def = stepDef(id);
    const spec = this.specs[id];
    const { VW } = this.scene.m;
    if (def.kind === 'info' || this.outcome) {
      this.spot.show({ hole: null, dim: 0.35, block: true, onTap: () => this.tapInfo() });
      return;
    }
    if (def.kind === 'watch') {
      this.spot.show(null);
      return;
    }
    const tg = spec.target?.() ?? null;
    if (tg === 'field') {
      const n = this.narrator.rect;
      const top = this.host.fieldTop();
      const bottom = Math.min(this.host.panelTop(), spec.at === 'bottom' ? n.y - 1 : Infinity);
      this.spot.show({ hole: { x: 0, y: top, w: VW, h: Math.max(10, bottom - top) }, dim: 0.3, block: true });
    } else if (tg) {
      const pad = 1;
      this.spot.show({ hole: { x: tg.x - pad, y: tg.y - pad, w: tg.w + pad * 2, h: tg.h + pad * 2 }, dim: 0.55, ring: true, block: true });
    } else this.spot.show({ hole: null, dim: 0.35, block: true });
  }

  private rectOf(o: Phaser.GameObjects.GameObject | null | undefined): Rect | null {
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

  /** Light the group's card (or, on the compact panel with a category open, the tab that closes it). */
  private needGroup(gid: number): Target {
    const h = this.host;
    if (h.selGroup === gid) return null;
    if (h.compact && h.catOpen) return this.rectOf(h.tabBtns.get(h.cat) ?? null);
    return this.rectOf(h.cards.find((c) => c.gid === gid)?.card ?? null);
  }

  /** Select the group, open the category, tap the command: light whichever comes next. */
  private needCmd(gid: number, cat: BattleCategory, key: string): Target {
    const g = this.needGroup(gid);
    if (g) return g;
    const b = this.host.cmdBtns.get(key);
    if (b && b.visible) {
      const r = this.rectOf(b);
      if (r) return r;
    }
    return this.rectOf(this.host.tabBtns.get(cat) ?? null);
  }

  private fightButton(): Target {
    let hit: Phaser.GameObjects.GameObject | null = null;
    const label = t('battle.fight');
    const walk = (list: Phaser.GameObjects.GameObject[]) => {
      for (const o of list) {
        if (hit) return;
        const any = o as unknown as { o?: { label?: string }; list?: Phaser.GameObjects.GameObject[] };
        if (any.o?.label === label) hit = o;
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
    const top = h.fieldTop() + 12;
    const bottom = Math.min(h.panelTop(), this.narrator.visible && this.narrator.rect.y > top ? this.narrator.rect.y : Infinity) - 12;
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
    const h = this.host;
    const top = h.fieldTop();
    const bottom = Math.min(h.panelTop(), this.narrator.visible ? this.narrator.rect.y : Infinity);
    return { kind: 'pinch', at: { x: this.scene.m.VW / 2, y: Math.round((top + bottom) / 2) }, d0: 14, d1: 64 };
  }

  /** Carry the hoplites to the flag, then pull back: the slingshot. */
  private slingDemo(): GhostScript | null {
    const h = this.host;
    const c = groupCentre(h.sim, G.hop);
    const f = h.sim.groups[G.hop].formation;
    if (!c || !this.flag) return null;
    const dx = this.flag.x - f.cx;
    const dy = this.flag.y - f.cy;
    const a = h.toUi(c.x, c.y - 0.2);
    const b = h.toUi(c.x + dx, c.y + dy - 0.2);
    const pull = h.toUi(c.x + dx - f.fx * 1.8, c.y + dy - f.fy * 1.8 - 0.2);
    return { kind: 'drag', pts: [a, b, pull], rest: [0, 380, 450] };
  }

  /** Grab the hoplites and pull away from the wave: they turn to face it. */
  private turnDemo(): GhostScript | null {
    const h = this.host;
    const c = groupCentre(h.sim, G.hop);
    const d = flankDir(h.sim);
    if (!c || !d) return null;
    const f = h.sim.groups[G.hop].formation;
    // first a little back (the gesture aims straight away), then straight away from the foe
    const bx = -f.fx - d.x;
    const by = -f.fy - d.y;
    const bl = Math.hypot(bx, by) || 1;
    const a = h.toUi(c.x, c.y);
    const m = h.toUi(c.x + (bx / bl) * 0.45, c.y + (by / bl) * 0.45);
    const e = h.toUi(c.x - d.x * 2.4, c.y - d.y * 2.4);
    return { kind: 'drag', pts: [a, m, e], rest: [0, 0, 450] };
  }

  /** A flag on the field where the step wants the men (a pulsing ring in perspective). */
  private drawMarker(time: number): void {
    const g = this.marker;
    g.clear();
    if (this.phase !== 'talk' || !this.narrator.visible) return;
    const id = this.step;
    const p = id ? this.specs[id].marker?.() : null;
    if (!p) return;
    const s = this.host.toUi(p.x, p.y);
    const k = (Math.sin(time / 200) + 1) / 2;
    const pace = this.host.paceUi();
    const rx = Math.max(6, pace * 0.9) + k * 2;
    const foe = id === 'flank';
    const col = foe ? 0xe05040 : 0xf0c860;
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

  /** Skip (asks first). Back and the battle's leave/retreat buttons come here too. */
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
        void state.save();
        this.scene.scene.start('FirstRun', { mode: 'modes' });
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
    this.scene.scene.restart({ tutorial: {} });
  }

  private finish(): void {
    this.phase = 'end';
    this.clearUi();
    const data = state.campaign.data;
    const f = finishTutorial(this.progress);
    data.settings.tutorial = f.progress;
    let reward = null;
    if (f.reward) reward = grantReward(data, state.campaign.random());
    // the campaign exists now: Continue works from the menu
    state.hasSave = true;
    void state.save();
    this.scene.scene.start('FirstRun', reward ? { mode: 'reward', item: reward } : { mode: 'modes' });
  }
}
