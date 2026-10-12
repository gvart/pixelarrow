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
 * - The scripted scenario: a fixed seed, a new campaign's eight men (four
 *   hoplites, two slingers, two peltasts in reserve) against a raider band,
 *   javelin-men ahead of it and a second wave that strikes the reserve's
 *   right flank, plus the enemy's scripted orders.
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

export type TutStepId =
  | 'intro'
  | 'select'
  | 'pan'
  | 'zoom'
  | 'sling'
  | 'undo'
  | 'fight'
  | 'loose'
  | 'focus'
  | 'play'
  | 'move'
  | 'then'
  | 'ability'
  | 'morale'
  | 'flank'
  | 'win'
  | 'victory';

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
  /** Paused, orders wait as a plan for Play (controls.md R6.1): the steps that teach planning. */
  plan?: boolean;
  /** The step this one cannot run without (planned with it on a resume): Undo takes back the drag, Then… follows a move. */
  needs?: TutStepId;
}

/**
 * The lesson (TUT-02, ANSWERS A-42): placing, Undo and starting in
 * deployment; then planning while paused (Shoot and focus fire, then Play), a
 * move with a queued Then… charge, an ability, the morale glyph, and the
 * facing knob on the unengaged reserve when its flank is threatened (the
 * arcs). Feint, Orb and Works stay gated (controls.md R10b).
 */
export const TUT_STEPS: readonly TutStepDef[] = [
  { id: 'intro', phase: 'deploy', kind: 'info' },
  { id: 'select', phase: 'deploy', kind: 'action' },
  { id: 'pan', phase: 'deploy', kind: 'action' },
  { id: 'zoom', phase: 'deploy', kind: 'action' },
  { id: 'sling', phase: 'deploy', kind: 'action' },
  { id: 'undo', phase: 'deploy', kind: 'action', needs: 'sling' },
  { id: 'fight', phase: 'deploy', kind: 'action', required: true },
  { id: 'loose', phase: 'battle', kind: 'action', plan: true },
  { id: 'focus', phase: 'battle', kind: 'action', plan: true },
  { id: 'play', phase: 'battle', kind: 'action', plan: true },
  { id: 'move', phase: 'battle', kind: 'action' },
  { id: 'then', phase: 'battle', kind: 'action', needs: 'move' },
  { id: 'ability', phase: 'battle', kind: 'action' },
  { id: 'morale', phase: 'battle', kind: 'info' },
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
  /** The player's hoplite, slinger and peltast (the reserve, group IV) groups. */
  hop: number;
  sling: number;
  pelt: number;
  /** Screen pixels panned with one finger on empty ground. */
  panPx: number;
  /** The camera was zoomed (pinch, wheel or the zoom key). */
  zoomed: boolean;
  /** The last formation drag: carried somewhere (a move) or aimed (a turn by the knob), its facing and group. */
  lastSling: { carried: boolean; aimed: boolean; fx: number; fy: number; group: number } | null;
  /** Tap-to-move orders. */
  tapMoves: number;
  /** The slingers shoot at will, and their focus target (-1: none), in the sim. */
  slingFire: boolean;
  slingFocus: number;
  /** The same in the paused plan (staged, not given yet): Shoot turned on, a focus target set. */
  planLoose: boolean;
  planFocus: boolean;
  /** Play pressed (the plan went out). */
  played: number;
  /** The hoplites' queued Then… step (null: none). */
  hopQueued: string | null;
  /** Undo used. */
  undos: number;
  /** Abilities used by the player. */
  abilities: number;
  /** From the reserve (IV) toward the flanking wave (unit vector), when it is on the field. */
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
    case 'loose':
      return o.planLoose || o.slingFire;
    case 'focus':
      return o.planFocus || o.slingFocus >= 0;
    case 'play':
      return o.played > 0;
    case 'move':
      return o.tapMoves > 0;
    case 'then':
      return o.hopQueued !== null;
    case 'undo':
      return o.undos > 0;
    case 'ability':
      return o.abilities > 0;
    case 'flank': {
      const s = o.lastSling;
      if (!s || !s.aimed || s.group !== o.pelt || !o.flankDir) return false;
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

/**
 * The steps a run goes through: everything not learned yet, the ones the
 * battle needs, and what a planned step needs (Undo takes back a Then… step,
 * which follows a move).
 */
export function planSteps(p: TutorialProgress): TutStepId[] {
  const want = new Set(TUT_STEPS.filter((s) => s.required || !p.done.includes(s.id)).map((s) => s.id));
  for (let i = TUT_STEPS.length - 1; i >= 0; i--) {
    const s = TUT_STEPS[i];
    if (want.has(s.id) && s.needs) want.add(s.needs);
  }
  return TUT_STEPS.filter((s) => want.has(s.id)).map((s) => s.id);
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

/** Group ids in the scenario's sim (side 0 has four groups, then side 1's four): I, II and IV are ours, as a new campaign's. */
export const TUT_GROUPS = { hop: 0, sling: 1, pelt: 3, foeMain: 4, foeSkirm: 5, foeWave: 7 } as const;

export interface TutorialBattle {
  setup: BattleSetup;
  heroes: Hero[];
  enemyHeroes: Hero[];
}

function equip(h: Hero, rng: Rng, ids: IdSource, slot: 'weapon' | 'shield' | 'helmet' | 'armor', def: string | null, cond = 70): void {
  if (def === null) delete h.equip[slot];
  else h.equip[slot] = makeItem(rng, ids, def, 'common', cond, h.culture);
}

/**
 * The tutorial battle: always the same men on the same small plain. Eight men
 * as a new campaign starts (campaign-arc.md R1): four hoplites in I (one a
 * veteran), two slingers in II and two peltasts in IV, the reserve.
 */
export function tutorialBattle(): TutorialBattle {
  const rng = new Rng(TUTORIAL_SEED);
  const ids: IdSource = { nextId: 1 };
  const heroes: Hero[] = [];
  for (let i = 0; i < 4; i++) {
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
  for (let i = 0; i < 2; i++) {
    const h = makeHero(rng, ids, 'greek', 'peltast', 2, 1, 3, heroes);
    h.perks = [];
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
  for (let i = 0; i < 4; i++) raider(0);
  for (let i = 0; i < 2; i++) {
    const h = makeHero(rng, ids, 'celtic', 'javelineer', 1, 1, 1, foes);
    h.perks = [];
    h.traits = [];
    equip(h, rng, ids, 'helmet', null);
    foes.push(h);
  }
  for (let i = 0; i < 3; i++) raider(3);
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

/** Where the reserve (IV) stands in deployment: right of the hoplites, with room on its right for the wave's approach. */
export const TUT_RESERVE = { x: 13.5, y: 22.5 } as const;

/**
 * Deployment staging: the slingers hold their stones until told, the reserve
 * (IV) stands right of the hoplites, the second wave waits in the far right
 * corner.
 */
export function stageTutorial(sim: Battle, issue: Issue = (s, o) => sim.issue(s, o)): void {
  const G = TUT_GROUPS;
  issue(0, { kind: 'loose', group: G.sling, on: false });
  issue(0, { kind: 'form', group: G.pelt, cx: TUT_RESERVE.x, cy: TUT_RESERVE.y, fx: 0, fy: -1, frontage: 2 });
  issue(1, { kind: 'form', group: G.foeWave, cx: sim.width - 1.5, cy: 1.5, fx: 0, fy: 1, frontage: 2 });
}

/** Where the second wave gathers before it strikes: level with the reserve, at the field's right edge (its flank). */
export function wavePost(sim: Battle): { x: number; y: number } {
  const iv = groupCentre(sim, TUT_GROUPS.pelt) ?? TUT_RESERVE;
  return { x: sim.width - 0.8, y: iv.y };
}

export type EnemyCue = 'battle' | 'charge' | 'flank' | 'win';

/**
 * The enemy's script (they have no bot): javelin-men come forward when the
 * battle starts; when the player charges, the band comes on and the second
 * wave slips down the right edge to gather on the reserve's flank, still
 * unengaged; on 'flank' it strikes the reserve's side; at the end everyone
 * attacks.
 */
export function enemyCue(sim: Battle, cue: EnemyCue, issue: Issue = (s, o) => sim.issue(s, o)): void {
  const G = TUT_GROUPS;
  const alive = (g: number) => sim.activeMembers(g).length > 0;
  if (cue === 'battle') {
    if (alive(G.foeSkirm)) issue(1, { kind: 'order', group: G.foeSkirm, order: 'advance' });
  } else if (cue === 'charge') {
    if (alive(G.foeMain)) issue(1, { kind: 'order', group: G.foeMain, order: 'advance' });
    const p = wavePost(sim);
    if (alive(G.foeWave)) issue(1, { kind: 'form', group: G.foeWave, cx: p.x, cy: p.y, fx: -1, fy: 0, frontage: 2 });
  } else if (cue === 'flank') {
    if (alive(G.foeWave)) issue(1, { kind: 'order', group: G.foeWave, order: 'charge' });
  } else {
    // everyone attacks, each group turned toward our nearest men first (a charge runs along its facing: aimed
    // anywhere else it would walk to the edge and the fight would stall); repeated, it re-aims those out of contact
    const ours = [G.hop, G.sling, G.pelt].map((g) => groupCentre(sim, g)).filter((c): c is { x: number; y: number } => !!c);
    for (const g of [G.foeMain, G.foeSkirm, G.foeWave]) {
      if (!alive(g) || sim.groups[g].contact) continue;
      const c = groupCentre(sim, g);
      const to = c && ours.length ? ours.reduce((a, b) => (Math.hypot(b.x - c.x, b.y - c.y) < Math.hypot(a.x - c.x, a.y - c.y) ? b : a)) : null;
      if (c && to && Math.hypot(to.x - c.x, to.y - c.y) > 1e-3) issue(1, { kind: 'form', group: g, cx: c.x, cy: c.y, fx: to.x - c.x, fy: to.y - c.y, frontage: sim.groups[g].formation.frontage });
      issue(1, { kind: 'order', group: g, order: 'charge' });
    }
  }
}

/** Seconds between the finale's re-aims of the enemy groups out of contact (enemyCue 'win'). */
export const WIN_REAIM_S = 5;

/** The second wave is within `dist` paces of group `gid` (man to man). */
export function waveClose(sim: Battle, dist = 7, gid: number = TUT_GROUPS.pelt): boolean {
  const ours = sim.activeMembers(gid);
  const wave = sim.activeMembers(TUT_GROUPS.foeWave);
  if (!ours.length || !wave.length) return false;
  return wave.some((w) => ours.some((h) => Math.hypot(w.x - h.x, w.y - h.y) < dist));
}

/** The second wave has gathered at its post (wavePost), or near enough. */
export function waveAtPost(sim: Battle, dist = 1.5): boolean {
  const c = groupCentre(sim, TUT_GROUPS.foeWave);
  const p = wavePost(sim);
  return !!c && Math.hypot(c.x - p.x, c.y - p.y) <= dist;
}

/** From group `gid` (the reserve) toward the second wave (unit vector), or null. */
export function flankDir(sim: Battle, gid: number = TUT_GROUPS.pelt): { x: number; y: number } | null {
  const a = groupCentre(sim, gid);
  const b = groupCentre(sim, TUT_GROUPS.foeWave);
  if (!a || !b) return null;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return d > 1e-6 ? { x: (b.x - a.x) / d, y: (b.y - a.y) / d } : null;
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
