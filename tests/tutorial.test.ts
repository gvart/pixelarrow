import { describe, expect, it } from 'vitest';
import {
  TUT_GROUPS,
  TUT_STEPS,
  TUTORIAL_REWARD,
  bandBroken,
  beginTutorial,
  canResume,
  checkStep,
  enemyCue,
  finishTutorial,
  flankDir,
  grantReward,
  groupCentre,
  markStep,
  newProgress,
  nextCoach,
  ONLINE_COACH,
  planSteps,
  progressOf,
  skipTutorial,
  stageTutorial,
  tutorialBattle,
  waveClose,
  PAN_PX,
  type TutObs,
} from '../src/game/tutorial';
import { Battle, TICK_RATE } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import { DEFAULT_SETTINGS, deserialize, serialize, type SaveData } from '../src/game/save';
import { Campaign } from '../src/game/campaign';

const obs = (o: Partial<TutObs> = {}): TutObs => ({
  phase: 'deploy',
  selGroup: -1,
  hop: 0,
  sling: 1,
  panPx: 0,
  zoomed: false,
  lastSling: null,
  tapMoves: 0,
  hopFormation: 'line',
  hopOrder: 'hold',
  slingFire: false,
  abilities: 0,
  flankDir: null,
  winner: null,
  ...o,
});

describe('tutorial steps', () => {
  it('lists every step once, deployment before battle, ending in the victory', () => {
    const ids = TUT_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const firstBattle = TUT_STEPS.findIndex((s) => s.phase === 'battle');
    expect(TUT_STEPS.slice(firstBattle).every((s) => s.phase === 'battle')).toBe(true);
    expect(ids[ids.length - 1]).toBe('victory');
    // what the design asks for: select, slingshot, charge, shield wall, abilities (+ pan, zoom, move, missiles, flank)
    for (const id of ['select', 'pan', 'zoom', 'sling', 'move', 'wall', 'loose', 'charge', 'ability', 'flank'] as const) expect(ids).toContain(id);
  });

  it('completes each action step only when the player did it', () => {
    expect(checkStep('select', obs({ selGroup: 1 }))).toBe(false);
    expect(checkStep('select', obs({ selGroup: 0 }))).toBe(true);
    expect(checkStep('pan', obs({ panPx: PAN_PX - 1 }))).toBe(false);
    expect(checkStep('pan', obs({ panPx: PAN_PX }))).toBe(true);
    expect(checkStep('zoom', obs({ zoomed: true }))).toBe(true);
    // the formation drag: the hoplites carried somewhere (a turn alone, or another group, is not enough)
    expect(checkStep('sling', obs({ lastSling: { carried: false, aimed: true, fx: 0, fy: -1, group: 0 } }))).toBe(false);
    expect(checkStep('sling', obs({ lastSling: { carried: true, aimed: false, fx: 0, fy: -1, group: 1 } }))).toBe(false);
    expect(checkStep('sling', obs({ lastSling: { carried: true, aimed: false, fx: 0, fy: -1, group: 0 } }))).toBe(true);
    expect(checkStep('fight', obs())).toBe(false);
    expect(checkStep('fight', obs({ phase: 'battle' }))).toBe(true);
    expect(checkStep('move', obs({ tapMoves: 1 }))).toBe(true);
    expect(checkStep('wall', obs({ hopFormation: 'line' }))).toBe(false);
    expect(checkStep('wall', obs({ hopFormation: 'shieldwall' }))).toBe(true);
    expect(checkStep('loose', obs({ slingFire: true }))).toBe(true);
    expect(checkStep('charge', obs({ hopOrder: 'advance' }))).toBe(false);
    expect(checkStep('charge', obs({ hopOrder: 'charge' }))).toBe(true);
    expect(checkStep('ability', obs({ abilities: 1 }))).toBe(true);
    expect(checkStep('win', obs({ winner: 0 }))).toBe(true);
    expect(checkStep('intro', obs({ selGroup: 0, panPx: 999 }))).toBe(false);
  });

  it('the flank step wants the hoplites turned toward the wave', () => {
    const flank = { x: 1, y: 0 };
    const s = (fx: number, fy: number, group = 0) => obs({ flankDir: flank, lastSling: { carried: false, aimed: true, fx, fy, group } });
    expect(checkStep('flank', s(0, -1))).toBe(false); // still facing ahead
    expect(checkStep('flank', s(-1, 0))).toBe(false); // the wrong way
    expect(checkStep('flank', s(0.9, -0.43))).toBe(true);
    expect(checkStep('flank', s(1, 0, 1))).toBe(false); // the slingers, not the hoplites
    expect(checkStep('flank', obs({ lastSling: { carried: false, aimed: true, fx: 1, fy: 0, group: 0 } }))).toBe(false); // no wave yet
  });
});

describe('tutorial progress', () => {
  it('is offered on a first launch; old saves are not offered', () => {
    expect(newProgress().status).toBe('offer');
    expect(progressOf({}).status).toBe('done');
    expect(progressOf({ tutorial: { status: 'bogus' as never, done: [] } }).status).toBe('done');
  });

  it('skips learned steps on a resume but keeps those the battle needs', () => {
    let p = beginTutorial(newProgress());
    expect(planSteps(p)).toEqual(TUT_STEPS.map((s) => s.id));
    expect(canResume(p)).toBe(false);
    for (const id of ['intro', 'select', 'pan', 'zoom', 'sling', 'fight', 'move'] as const) p = markStep(p, id);
    p = markStep(p, 'move'); // twice: no duplicate
    expect(p.done.filter((x) => x === 'move')).toHaveLength(1);
    expect(canResume(p)).toBe(true);
    const plan = planSteps(beginTutorial(p));
    expect(plan[0]).toBe('fight');
    expect(plan).not.toContain('sling');
    expect(plan).toContain('wall');
    expect(plan.slice(-2)).toEqual(['win', 'victory']);
  });

  it('a replay starts over; the reward comes once', () => {
    let p = beginTutorial(newProgress());
    const f1 = finishTutorial(p);
    expect(f1.reward).toBe(true);
    expect(f1.progress.status).toBe('done');
    p = beginTutorial(f1.progress, true);
    expect(p.done).toEqual([]);
    expect(planSteps(p)).toHaveLength(TUT_STEPS.length);
    const f2 = finishTutorial(p);
    expect(f2.reward).toBe(false);
    expect(skipTutorial(newProgress()).status).toBe('skipped');
  });

  it('survives a save round trip (settings), and a fresh campaign has none', () => {
    const c = Campaign.fresh(42);
    expect(c.data.settings.tutorial).toBeUndefined();
    c.data.settings.tutorial = markStep(beginTutorial(newProgress()), 'select');
    c.data.settings.onlineCoach = 3;
    const back = deserialize(serialize(c.sync())) as SaveData;
    expect(progressOf(back.settings).done).toEqual(['select']);
    expect(progressOf(back.settings).status).toBe('active');
    expect(back.settings.onlineCoach).toBe(3);
    expect(DEFAULT_SETTINGS.tutorial).toBeUndefined();
  });

  it('the reward: gold and a common item in the stash', () => {
    const d = { gold: 10, stash: [] as SaveData['stash'], nextId: 5 };
    const it = grantReward(d, new Rng(3));
    expect(d.gold).toBe(10 + TUTORIAL_REWARD.gold);
    expect(d.stash).toHaveLength(1);
    expect(it.def).toBe(TUTORIAL_REWARD.item);
    expect(it.rarity).toBe('common');
  });

  it('online coach marks go one by one', () => {
    expect(nextCoach(undefined)).toBe('home');
    expect(nextCoach(1)).toBe('neighbour');
    expect(nextCoach(ONLINE_COACH.length)).toBeNull();
  });
});

describe('tutorial battle', () => {
  const secs = (sim: Battle, s: number, until?: () => boolean) => {
    for (let i = 0; i < s * TICK_RATE && sim.phase === 'battle'; i++) {
      if (until?.()) return true;
      sim.step();
    }
    return until?.() ?? false;
  };

  it('is the same every time', () => {
    const a = tutorialBattle();
    const b = tutorialBattle();
    expect(JSON.stringify(a.setup)).toBe(JSON.stringify(b.setup));
    expect(a.heroes.filter((h) => h.group === 0)).toHaveLength(6);
    expect(a.heroes.filter((h) => h.group === 1)).toHaveLength(2);
  });

  it('played as the narrator asks, the player wins, with every scripted moment on cue', () => {
    const { setup } = tutorialBattle();
    const sim = new Battle(setup);
    const G = TUT_GROUPS;
    stageTutorial(sim);
    expect(sim.groups[G.sling].fireAtWill).toBe(false);
    expect(sim.groups[G.hop].formation.fy).toBeLessThan(0);
    // the slingshot in deployment: two paces forward
    const f = sim.groups[G.hop].formation;
    sim.issue(0, { kind: 'form', group: G.hop, cx: f.cx, cy: f.cy - 2, fx: 0, fy: -1, frontage: f.frontage });
    sim.startBattle();
    enemyCue(sim, 'battle');
    secs(sim, 2);
    const h = groupCentre(sim, G.hop)!;
    sim.issue(0, { kind: 'form', group: G.hop, cx: h.x, cy: h.y - 2, fx: 0, fy: -1, frontage: sim.groups[G.hop].formation.frontage });
    secs(sim, 2);
    sim.issue(0, { kind: 'preset', group: G.hop, type: 'shieldwall' });
    secs(sim, 3);
    sim.issue(0, { kind: 'loose', group: G.sling });
    expect(sim.groups[G.sling].fireAtWill).toBe(true);
    secs(sim, 3);
    sim.issue(0, { kind: 'order', group: G.hop, order: 'charge' });
    enemyCue(sim, 'charge');
    const hop = () => sim.activeMembers(G.hop);
    expect(secs(sim, 25, () => hop().some((u) => sim.abilityReady(u, 'bash')))).toBe(true);
    for (const u of hop()) if (sim.abilityReady(u, 'bash')) sim.issue(0, { kind: 'ability', unit: u.id, ability: 'bash' });
    secs(sim, 40, () => bandBroken(sim));
    enemyCue(sim, 'flank');
    expect(secs(sim, 25, () => waveClose(sim))).toBe(true);
    const dir = flankDir(sim)!;
    expect(dir.x).toBeGreaterThan(0.3); // from the right
    const c = groupCentre(sim, G.hop)!;
    sim.issue(0, { kind: 'form', group: G.hop, cx: c.x, cy: c.y, fx: dir.x, fy: dir.y, frontage: sim.groups[G.hop].formation.frontage });
    enemyCue(sim, 'win');
    secs(sim, 200);
    expect(sim.phase).toBe('ended');
    expect(sim.winner).toBe(0);
    // a 3-4 minute tutorial: the battle itself stays short
    expect(sim.tick / TICK_RATE).toBeLessThan(150);
  });
});
