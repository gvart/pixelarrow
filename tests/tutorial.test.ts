import { describe, expect, it } from 'vitest';
import {
  TUT_GROUPS,
  TUT_STEPS,
  TUTORIAL_REWARD,
  TUT_RESERVE,
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
  waveAtPost,
  waveClose,
  wavePost,
  PAN_PX,
  WIN_REAIM_S,
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
  pelt: 3,
  panPx: 0,
  zoomed: false,
  lastSling: null,
  tapMoves: 0,
  slingFire: false,
  slingFocus: -1,
  planLoose: false,
  planFocus: false,
  played: 0,
  hopQueued: null,
  undos: 0,
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
    // the v5 controls (TUT-02, ANSWERS A-42): undo, planning while paused (shoot, focus, play), Then…, the knob on a flank, the morale glyph
    for (const id of ['select', 'pan', 'zoom', 'sling', 'undo', 'loose', 'focus', 'play', 'move', 'then', 'ability', 'morale', 'flank'] as const) expect(ids).toContain(id);
    // the planning steps run together, while paused, and end with Play
    const planned = TUT_STEPS.filter((s) => s.plan).map((s) => s.id);
    expect(planned).toEqual(['loose', 'focus', 'play']);
    expect(ids.indexOf('then')).toBe(ids.indexOf('move') + 1);
    // Feint, Orb and Works stay gated (controls.md R10b): no step teaches them
    for (const id of ['feint', 'orb', 'works']) expect(ids as string[]).not.toContain(id);
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
    expect(checkStep('undo', obs())).toBe(false);
    expect(checkStep('undo', obs({ undos: 1 }))).toBe(true);
    expect(checkStep('move', obs({ tapMoves: 1 }))).toBe(true);
    // planning while paused: Shoot and the focus count once staged (the plan) or given
    expect(checkStep('loose', obs())).toBe(false);
    expect(checkStep('loose', obs({ planLoose: true }))).toBe(true);
    expect(checkStep('loose', obs({ slingFire: true }))).toBe(true);
    expect(checkStep('focus', obs({ planLoose: true }))).toBe(false);
    expect(checkStep('focus', obs({ planFocus: true }))).toBe(true);
    expect(checkStep('focus', obs({ slingFocus: 5 }))).toBe(true);
    expect(checkStep('play', obs({ planLoose: true, planFocus: true }))).toBe(false);
    expect(checkStep('play', obs({ played: 1 }))).toBe(true);
    expect(checkStep('then', obs({ tapMoves: 1 }))).toBe(false);
    expect(checkStep('then', obs({ hopQueued: 'charge' }))).toBe(true);
    expect(checkStep('ability', obs({ abilities: 1 }))).toBe(true);
    expect(checkStep('morale', obs({ abilities: 9, undos: 9 }))).toBe(false); // info: a tap goes on
    expect(checkStep('win', obs({ winner: 0 }))).toBe(true);
    expect(checkStep('intro', obs({ selGroup: 0, panPx: 999 }))).toBe(false);
  });

  it('the flank step wants the reserve (IV) turned toward the wave, by its knob', () => {
    const flank = { x: 1, y: 0 };
    const s = (fx: number, fy: number, group = 3, carried = false) => obs({ flankDir: flank, lastSling: { carried, aimed: !carried, fx, fy, group } });
    expect(checkStep('flank', s(0, -1))).toBe(false); // still facing ahead
    expect(checkStep('flank', s(-1, 0))).toBe(false); // the wrong way
    expect(checkStep('flank', s(0.9, -0.43))).toBe(true);
    expect(checkStep('flank', s(1, 0, 0))).toBe(false); // the hoplites, locked in melee (O3): not the line it asks for
    expect(checkStep('flank', s(1, 0, 3, true))).toBe(false); // carried away, not turned
    expect(checkStep('flank', obs({ lastSling: { carried: false, aimed: true, fx: 1, fy: 0, group: 3 } }))).toBe(false); // no wave yet
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
    for (const id of ['intro', 'select', 'pan', 'zoom', 'sling', 'undo', 'fight', 'loose'] as const) p = markStep(p, id);
    p = markStep(p, 'loose'); // twice: no duplicate
    expect(p.done.filter((x) => x === 'loose')).toHaveLength(1);
    expect(canResume(p)).toBe(true);
    const plan = planSteps(beginTutorial(p));
    expect(plan[0]).toBe('fight');
    expect(plan).not.toContain('sling');
    expect(plan).not.toContain('loose');
    expect(plan).toContain('focus');
    expect(plan.slice(-2)).toEqual(['win', 'victory']);
  });

  it('a step comes back with the one it needs: Undo with the drag, Then… with the move', () => {
    let p = beginTutorial(newProgress());
    for (const id of TUT_STEPS.map((s) => s.id)) if (id !== 'undo' && id !== 'then') p = markStep(p, id);
    const plan = planSteps(beginTutorial(p));
    expect(plan).toEqual(['sling', 'undo', 'fight', 'move', 'then', 'win', 'victory']);
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
  const G = TUT_GROUPS;
  /** The morale step's moment (battle-readability.md F2, as battleHud groupState reads it): an enemy group wavers or runs. */
  const wavers = (sim: Battle) =>
    [G.foeMain, G.foeSkirm].some((g) => {
      if (sim.groups[g].routed) return true;
      const st = sim.members(g).filter((u) => u.state === 'ready');
      return st.length > 0 && st.filter((u) => u.morale < 0.5 * u.stats.morale).length >= Math.ceil(st.length / 3);
    });
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
    // a new campaign's eight men (campaign-arc.md R1): four hoplites in I, two slingers in II, two peltasts in IV
    expect(a.heroes).toHaveLength(8);
    expect(a.heroes.filter((h) => h.group === 0)).toHaveLength(4);
    expect(a.heroes.filter((h) => h.group === 1)).toHaveLength(2);
    expect(a.heroes.filter((h) => h.group === 2)).toHaveLength(0);
    expect(a.heroes.filter((h) => h.group === 3)).toHaveLength(2);
    expect(a.heroes[0].traits).toContain('veteran');
  });

  it('played as the narrator asks, the player wins, with every scripted moment on cue', () => {
    const { setup } = tutorialBattle();
    const sim = new Battle(setup);
    stageTutorial(sim);
    expect(sim.groups[G.sling].fireAtWill).toBe(false);
    expect(sim.groups[G.hop].formation.fy).toBeLessThan(0);
    // the reserve stands right of the hoplites, with room on its right
    const iv = groupCentre(sim, G.pelt)!;
    expect(iv.x).toBeGreaterThan(groupCentre(sim, G.hop)!.x + 2);
    expect(sim.width - iv.x).toBeGreaterThan(4);
    expect(Math.hypot(iv.x - TUT_RESERVE.x, iv.y - TUT_RESERVE.y)).toBeLessThan(1);
    // the slingshot in deployment: up and to the left
    const f = sim.groups[G.hop].formation;
    sim.issue(0, { kind: 'form', group: G.hop, cx: f.cx - 2, cy: f.cy - 3.3, fx: 0, fy: -1, frontage: f.frontage });
    sim.startBattle();
    enemyCue(sim, 'battle');
    // the plan given on Play: Shoot, the focus on the javelin-men
    sim.issue(0, { kind: 'loose', group: G.sling, on: true });
    sim.issue(0, { kind: 'focus', group: G.sling, target: G.foeSkirm });
    expect(sim.groups[G.sling].focus).toBe(G.foeSkirm);
    secs(sim, 1.5);
    // the move, then its queued charge fires on arrival: the band comes on, the wave slips round to its post
    const h = groupCentre(sim, G.hop)!;
    sim.issue(0, { kind: 'form', group: G.hop, cx: h.x, cy: h.y - 2, fx: 0, fy: -1, frontage: sim.groups[G.hop].formation.frontage });
    secs(sim, 3);
    sim.issue(0, { kind: 'order', group: G.hop, order: 'charge' });
    enemyCue(sim, 'charge');
    const hop = () => sim.activeMembers(G.hop);
    expect(secs(sim, 30, () => hop().some((u) => sim.abilityReady(u, 'bash')))).toBe(true);
    for (const u of hop()) if (sim.abilityReady(u, 'bash')) sim.issue(0, { kind: 'ability', unit: u.id, ability: 'bash' });
    secs(sim, 1.5);
    // the morale step: an enemy group wavers or runs while the band fights
    expect(secs(sim, 25, () => wavers(sim))).toBe(true);
    // the wave gathers on the reserve's flank, still unengaged (O3)
    expect(secs(sim, 30, () => waveAtPost(sim))).toBe(true);
    const post = wavePost(sim);
    expect(post.x).toBeGreaterThan(groupCentre(sim, G.pelt)!.x + 3);
    expect(sim.activeMembers(G.pelt).some((u) => u.engaged)).toBe(false);
    enemyCue(sim, 'flank');
    expect(secs(sim, 10, () => waveClose(sim, 7))).toBe(true);
    // from the reserve's right: its flank, not its front
    const dir = flankDir(sim)!;
    expect(dir.x).toBeGreaterThan(0.7);
    expect(sim.activeMembers(G.pelt).some((u) => u.engaged)).toBe(false);
    sim.issue(0, { kind: 'face', group: G.pelt, fx: dir.x, fy: dir.y });
    // the finale: everyone attacks, re-aimed now and then so it never stalls
    for (let k = 0; k < 40 && sim.phase === 'battle'; k++) {
      enemyCue(sim, 'win');
      secs(sim, WIN_REAIM_S);
    }
    expect(sim.phase).toBe('ended');
    expect(sim.winner).toBe(0);
    // a 3-4 minute tutorial: the battle itself stays short
    expect(sim.tick / TICK_RATE).toBeLessThan(150);
  });
});
