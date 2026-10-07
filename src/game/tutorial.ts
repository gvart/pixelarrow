/**
 * The guided tutorial (docs/DESIGN_V2.md "Localization, audio and
 * onboarding"): pure state, no Phaser.
 *
 * - The step list and each step's completion condition (`checkStep`), checked
 *   against an observation the battle controller builds every frame
 *   (src/ui/tutorial/battleTutorial.ts).
 * - Progress kept in the settings (synced with the save): offered on a first
 *   launch, active (resumable: steps already learned are skipped next time,
 *   except those the battle needs), done or skipped; the one-time reward.
 * - The scripted scenario: a fixed seed, six hoplites and two slingers
 *   against a raider band, javelin-men ahead of it and a second wave that
 *   swings round the right flank, plus the enemy's scripted orders.
 * - The coach marks of the first visit to the online map.
 */
import type { Battle } from '../sim/battle';
import type { BattleSetup, Order, Side } from '../sim/types';
import type { Hero } from '../data/units';
import type { Item } from '../data/items';
import type { PerkId } from '../data/perks';
import { Rng } from '../sim/rng';
import { makeHero, makeItem, type IdSource } from './heroes';
import { armySpec } from './armySpec';
import { generateBattlefield } from '../world/battlefield';

// ------------------------------------------------------------------ steps

export type TutStepId = 'intro' | 'select' | 'pan' | 'zoom' | 'sling' | 'fight' | 'move' | 'wall' | 'loose' | 'charge' | 'ability' | 'flank' | 'win' | 'victory';

export interface TutStepDef {
  id: TutStepId;
  phase: 'deploy' | 'battle';
  /**
   * info: the narrator talks, a tap continues; action: wait until the player
   * does it; watch: the battle runs with the narrator's line, until it ends.
   */
  kind: 'info' | 'action' | 'watch';
  /** Runs again on a resumed tutorial even when learned (the battle cannot go on without it). */
  required?: boolean;
}

export const TUT_STEPS: readonly TutStepDef[] = [
  { id: 'intro', phase: 'deploy', kind: 'info' },
  { id: 'select', phase: 'deploy', kind: 'action' },
  { id: 'pan', phase: 'deploy', kind: 'action' },
  { id: 'zoom', phase: 'deploy', kind: 'action' },
  { id: 'sling', phase: 'deploy', kind: 'action' },
  { id: 'fight', phase: 'deploy', kind: 'action', required: true },
  { id: 'move', phase: 'battle', kind: 'action' },
  { id: 'wall', phase: 'battle', kind: 'action' },
  { id: 'loose', phase: 'battle', kind: 'action' },
  { id: 'charge', phase: 'battle', kind: 'action' },
  { id: 'ability', phase: 'battle', kind: 'action' },
  { id: 'flank', phase: 'battle', kind: 'action' },
  { id: 'win', phase: 'battle', kind: 'watch', required: true },
  { id: 'victory', phase: 'battle', kind: 'info', required: true },
];

export function stepDef(id: TutStepId): TutStepDef {
  return TUT_STEPS.find((s) => s.id === id)!;
}

/** What the controller sees of the battle (counters since the step began). */
export interface TutObs {
  phase: 'deploy' | 'battle' | 'ended';
  selGroup: number;
  /** The player's hoplite and slinger groups. */
  hop: number;
  sling: number;
  /** Screen pixels panned with one finger on empty ground. */
  panPx: number;
  /** The camera was zoomed (pinch or wheel). */
  zoomed: boolean;
  /** The last formation drag: carried somewhere (a move) or aimed (a turn by the knob), its facing and group. */
  lastSling: { carried: boolean; aimed: boolean; fx: number; fy: number; group: number } | null;
  /** Tap-to-move orders. */
  tapMoves: number;
  hopFormation: string;
  hopOrder: string;
  slingFire: boolean;
  /** Abilities used by the player. */
  abilities: number;
  /** From the hoplites toward the flanking wave (unit vector), when it is on the field. */
  flankDir: { x: number; y: number } | null;
  winner: number | null;
}

/** Pan distance (screen px) that counts as "looked around". */
export const PAN_PX = 40;

/** Has the player done what the step asks? Info steps finish on a tap (always false here). */
export function checkStep(id: TutStepId, o: TutObs): boolean {
  switch (id) {
    case 'select':
      return o.selGroup === o.hop;
    case 'pan':
      return o.panPx >= PAN_PX;
    case 'zoom':
      return o.zoomed;
    case 'sling':
      return !!o.lastSling && o.lastSling.carried && o.lastSling.group === o.hop;
    case 'fight':
      return o.phase !== 'deploy';
    case 'move':
      return o.tapMoves > 0;
    case 'wall':
      return o.hopFormation === 'shieldwall';
    case 'loose':
      return o.slingFire;
    case 'charge':
      return o.hopOrder === 'charge';
    case 'ability':
      return o.abilities > 0;
    case 'flank': {
      const s = o.lastSling;
      if (!s || !s.aimed || s.group !== o.hop || !o.flankDir) return false;
      return s.fx * o.flankDir.x + s.fy * o.flankDir.y > 0.5;
    }
    case 'win':
      return o.winner !== null;
    default:
      return false;
  }
}

// ------------------------------------------------------------------ progress

export type TutStatus = 'offer' | 'active' | 'done' | 'skipped';

export interface TutorialProgress {
  status: TutStatus;
  /** Steps learned (kept across a resume). */
  done: TutStepId[];
  /** The completion reward was given (never twice, not on a replay). */
  rewarded?: boolean;
}

/** A first launch: the tutorial is offered. */
export function newProgress(): TutorialProgress {
  return { status: 'offer', done: [] };
}

/** Saves from before the tutorial have no record: nothing is offered (Settings can replay it). */
export function progressOf(s: { tutorial?: TutorialProgress }): TutorialProgress {
  const p = s.tutorial;
  if (!p || typeof p !== 'object' || !['offer', 'active', 'done', 'skipped'].includes(p.status)) return { status: 'done', done: [], rewarded: true };
  return { status: p.status, done: Array.isArray(p.done) ? p.done.filter((x) => TUT_STEPS.some((d) => d.id === x)) : [], rewarded: !!p.rewarded };
}

/** Start (or resume) the tutorial; a replay starts from the first step. */
export function beginTutorial(p: TutorialProgress, replay = false): TutorialProgress {
  return { ...p, status: 'active', done: replay ? [] : [...p.done] };
}

export function markStep(p: TutorialProgress, id: TutStepId): TutorialProgress {
  return p.done.includes(id) ? p : { ...p, done: [...p.done, id] };
}

export function skipTutorial(p: TutorialProgress): TutorialProgress {
  return { ...p, status: 'skipped' };
}

/** Finished: whether the reward is due now (first completion only). */
export function finishTutorial(p: TutorialProgress): { progress: TutorialProgress; reward: boolean } {
  const reward = !p.rewarded;
  return { progress: { ...p, status: 'done', done: TUT_STEPS.map((s) => s.id), rewarded: true }, reward };
}

/** The steps a run goes through: everything not learned yet, plus the ones the battle needs. */
export function planSteps(p: TutorialProgress): TutStepId[] {
  return TUT_STEPS.filter((s) => s.required || !p.done.includes(s.id)).map((s) => s.id);
}

/** Interrupted part-way (the app closed): offer to resume. */
export function canResume(p: TutorialProgress): boolean {
  return p.status === 'active' && p.done.length > 0;
}

// ------------------------------------------------------------------ reward

export const TUTORIAL_REWARD = { gold: 60, item: 'chalcidian' } as const;

/** Give the completion reward: a little gold and a common helmet. */
export function grantReward(data: { gold: number; stash: Item[] } & IdSource, rng: Rng): Item {
  data.gold += TUTORIAL_REWARD.gold;
  const it = makeItem(rng, data, TUTORIAL_REWARD.item, 'common', 100);
  data.stash.push(it);
  return it;
}

// ------------------------------------------------------------------ scenario

export const TUTORIAL_SEED = 0x7e7041a1;
export const TUT_FIELD = { w: 20, h: 28 } as const;

/** Group ids in the scenario's sim (side 0 has four groups, then side 1's four). */
export const TUT_GROUPS = { hop: 0, sling: 1, foeMain: 4, foeSkirm: 5, foeWave: 7 } as const;

export interface TutorialBattle {
  setup: BattleSetup;
  heroes: Hero[];
  enemyHeroes: Hero[];
}

function equip(h: Hero, rng: Rng, ids: IdSource, slot: 'weapon' | 'shield' | 'helmet' | 'armor', def: string | null, cond = 70): void {
  if (def === null) delete h.equip[slot];
  else h.equip[slot] = makeItem(rng, ids, def, 'common', cond, h.culture);
}

/** The tutorial battle: always the same men on the same small plain. */
export function tutorialBattle(): TutorialBattle {
  const rng = new Rng(TUTORIAL_SEED);
  const ids: IdSource = { nextId: 1 };
  const heroes: Hero[] = [];
  for (let i = 0; i < 6; i++) {
    const h = makeHero(rng, ids, 'greek', 'hoplite', 2, 1, 0, heroes);
    h.perks = ['shield_bash' as PerkId];
    h.points = 0;
    equip(h, rng, ids, 'weapon', 'dory', 90);
    equip(h, rng, ids, 'shield', 'hoplon', 90);
    heroes.push(h);
  }
  heroes[0].traits = ['veteran'];
  for (let i = 0; i < 2; i++) {
    const h = makeHero(rng, ids, 'greek', 'slinger', 2, 1, 1, heroes);
    h.perks = [];
    equip(h, rng, ids, 'weapon', 'sling', 90);
    heroes.push(h);
  }
  const foes: Hero[] = [];
  const raider = (group: number) => {
    const h = makeHero(rng, ids, 'celtic', 'militia', 1, 1, group, foes);
    h.perks = [];
    h.traits = [];
    equip(h, rng, ids, 'weapon', 'club', 55);
    equip(h, rng, ids, 'shield', 'thureos', 50);
    equip(h, rng, ids, 'helmet', null);
    equip(h, rng, ids, 'armor', null);
    foes.push(h);
  };
  for (let i = 0; i < 5; i++) raider(0);
  for (let i = 0; i < 2; i++) {
    const h = makeHero(rng, ids, 'celtic', 'javelineer', 1, 1, 1, foes);
    h.perks = [];
    h.traits = [];
    equip(h, rng, ids, 'helmet', null);
    foes.push(h);
  }
  for (let i = 0; i < 4; i++) raider(3);
  const terrain = generateBattlefield(TUTORIAL_SEED, { base: 'plain', river: false, coast: false, rocky: false, woods: 0.08 }, TUT_FIELD.w, TUT_FIELD.h);
  const setup: BattleSetup = {
    seed: TUTORIAL_SEED,
    armies: [armySpec(heroes, false, ['line', 'skirmish', 'line', 'column']), armySpec(foes, false, ['line', 'skirmish', 'line', 'column'])],
    width: TUT_FIELD.w,
    height: TUT_FIELD.h,
    timeLimit: 900,
    terrain,
  };
  return { setup, heroes, enemyHeroes: foes };
}

/** Centre of a group's active men (null: nobody left). */
export function groupCentre(sim: Battle, gid: number): { x: number; y: number } | null {
  const m = sim.activeMembers(gid);
  if (!m.length) return null;
  return { x: m.reduce((a, u) => a + u.x, 0) / m.length, y: m.reduce((a, u) => a + u.y, 0) / m.length };
}

type Issue = (side: Side, o: Order) => void;

/**
 * Deployment staging: the slingers hold their stones until told, the second
 * wave waits in the far right corner.
 */
export function stageTutorial(sim: Battle, issue: Issue = (s, o) => sim.issue(s, o)): void {
  const G = TUT_GROUPS;
  issue(0, { kind: 'loose', group: G.sling, on: false });
  issue(1, { kind: 'form', group: G.foeWave, cx: sim.width - 1.5, cy: 1.5, fx: 0, fy: 1, frontage: 2 });
}

export type EnemyCue = 'battle' | 'charge' | 'flank' | 'win';

/**
 * The enemy's script (they have no bot): javelin-men come forward when the
 * battle starts, the band attacks when the player charges, the second wave
 * swings onto the hoplites' right flank, and at the end everyone attacks.
 */
export function enemyCue(sim: Battle, cue: EnemyCue, issue: Issue = (s, o) => sim.issue(s, o)): void {
  const G = TUT_GROUPS;
  const alive = (g: number) => sim.activeMembers(g).length > 0;
  if (cue === 'battle') {
    if (alive(G.foeSkirm)) issue(1, { kind: 'order', group: G.foeSkirm, order: 'advance' });
  } else if (cue === 'charge') {
    if (alive(G.foeMain)) issue(1, { kind: 'order', group: G.foeMain, order: 'advance' });
  } else if (cue === 'flank') {
    const hop = groupCentre(sim, G.hop) ?? { x: sim.width / 2, y: sim.height * 0.7 };
    if (alive(G.foeWave)) {
      issue(1, { kind: 'form', group: G.foeWave, cx: Math.min(sim.width - 1, hop.x + 5), cy: hop.y, fx: -1, fy: 0, frontage: 2 });
      issue(1, { kind: 'order', group: G.foeWave, order: 'charge' });
    }
  } else {
    for (const g of [G.foeMain, G.foeSkirm, G.foeWave]) if (alive(g)) issue(1, { kind: 'order', group: g, order: 'charge' });
  }
}

/** The second wave is close to the hoplites (the flank step starts). */
export function waveClose(sim: Battle, dist = 7): boolean {
  const hop = sim.activeMembers(TUT_GROUPS.hop);
  const wave = sim.activeMembers(TUT_GROUPS.foeWave);
  if (!hop.length || !wave.length) return false;
  return wave.some((w) => hop.some((h) => Math.hypot(w.x - h.x, w.y - h.y) < dist));
}

/** From the hoplites toward the second wave (unit vector), or null. */
export function flankDir(sim: Battle): { x: number; y: number } | null {
  const a = groupCentre(sim, TUT_GROUPS.hop);
  const b = groupCentre(sim, TUT_GROUPS.foeWave);
  if (!a || !b) return null;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return d > 1e-6 ? { x: (b.x - a.x) / d, y: (b.y - a.y) / d } : null;
}

/** The first band is beaten (or nearly): time for the second wave. */
export function bandBroken(sim: Battle): boolean {
  const left = sim.activeMembers(TUT_GROUPS.foeMain).filter((u) => u.state === 'ready').length;
  return left <= 1;
}

// ------------------------------------------------------------------ online coach marks

/** The first visit to the war-table map, one coach mark at a time. */
export const ONLINE_COACH = ['home', 'neighbour', 'defenders', 'march', 'attack', 'collect', 'clan'] as const;
export type CoachId = (typeof ONLINE_COACH)[number];

/** The next coach mark to show (null: all seen). `seen` is the stored count. */
export function nextCoach(seen: number | undefined): CoachId | null {
  const i = Math.max(0, Math.floor(seen ?? 0));
  return i < ONLINE_COACH.length ? ONLINE_COACH[i] : null;
}
