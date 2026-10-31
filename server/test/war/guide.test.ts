/**
 * W-62 the first-hour guide online (server/src/war/guide.ts): the home room wakes the guide's bandit pair for a new
 * player of the home alliance, tells him each step done (paid) as his men do it, closes the soul step unpaid when his
 * army is full, the haul step on a stow / hand-off / caravan mark, keeps a finished or hidden guide shut, and ignores
 * players of other alliances.
 */
import { describe, expect, it } from 'vitest';
import { NET_VERSION, parseClientMsg, type JoinMsg, type ServerMsg } from '../../../src/war/net/protocol';
import { GUIDE_LAIR, GUIDE_STEPS, guideNext, guideSpots } from '../../../src/war/net/guide';
import { ARMY_MAX } from '../../../src/war/sim/soldiers';
import { HUNGER } from '../../../src/war/sim/food';
import { amount } from '../../../src/war/sim/holders';
import { WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';

const region = warRegion('dodona')!;
const join = (pid: number, team: number, count: number): JoinMsg => ({ t: 'join', v: NET_VERSION, region: 'dodona', playerId: pid, team, army: [{ cls: 'hoplite', count }] });
const home = () => new WarRoom({ region, seed: 3, cap: 600, home: 0 });
const guideMsgs = (r: ReturnType<WarRoom['tick']>, pid: number) => (r.msgs.get(pid) ?? []).filter((m): m is Extract<ServerMsg, { t: 'guide' }> => m.t === 'guide');
const spot = guideSpots(region, 0);
const guideLairs = (room: WarRoom) => (room.snapshot().lairs ?? []).filter((l) => Math.hypot(l.x - spot.lair.x, l.y - spot.lair.y) < 0.5);

describe('W-62 guide in the home room', () => {
  it('W-73 the hand-off: after the five steps the guide stays open on `next`; departing for its region closes it, paid', () => {
    const room = home();
    room.join(1, join(1, 0, 6));
    room.tick();
    const five = GUIDE_STEPS.filter((st) => st.id !== 'next').map((st) => st.id);
    expect(room.startGuide(1, { v: 1, done: [...five] })).toEqual({ t: 'guide', done: five });
    expect(room.guide.open).toEqual([1]);
    expect(room.guide.nextRegion).toBe(guideNext('dodona', region)!.region);
    room.guide.mark(1, 'next'); // the DO's depart for room.guide.nextRegion
    const r = room.tick();
    expect(r.guided).toEqual([expect.objectContaining({ pid: 1, step: 'next', paid: true, reward: GUIDE_STEPS.find((st) => st.id === 'next')!.reward })]);
    expect(room.guide.open).toEqual([]);
  });

  it('a new player: the bandit pair wakes on his road; beating it is told and paid, his save follows', () => {
    const room = home();
    room.join(1, join(1, 0, 6));
    room.tick();
    expect(room.startGuide(1, null)).toEqual({ t: 'guide', done: [] });
    room.tick();
    expect(guideLairs(room)).toEqual([expect.objectContaining({ kind: GUIDE_LAIR.kind, count: GUIDE_LAIR.count, state: 'home' })]);
    // his men go for the bandits
    const sq = room.squadsOf(1)[0], lair = guideLairs(room)[0];
    room.order(1, { kind: 'attack', squad: sq, target: lair.squad });
    let told: Extract<ServerMsg, { t: 'guide' }> | undefined, done: ReturnType<WarRoom['tick']>['guided'] = [];
    for (let t = 0; t < 2400 && !told; t++) {
      const r = room.tick();
      done = [...done, ...r.guided];
      told = guideMsgs(r, 1).find((m) => m.step === 'lair');
    }
    expect(told).toMatchObject({ t: 'guide', step: 'lair', paid: true });
    expect(told!.done).toContain('lair');
    const lairDone = done.find((d) => d.step === 'lair')!;
    expect(lairDone).toMatchObject({ pid: 1, paid: true, reward: GUIDE_STEPS.find((s) => s.id === 'lair')!.reward });
    expect(lairDone.save.done).toContain('lair');
    // a second new player later: a fresh pair where the first fell, his own lair step still open
    room.join(2, join(2, 0, 6));
    room.tick();
    room.startGuide(2, null);
    room.tick();
    expect(guideLairs(room).filter((l) => l.state !== 'cleared')).toHaveLength(1);
  }, 60_000);

  it('W-79: a new player marches with HUNGER.kit rations a man, packed once (his save is kept at once)', () => {
    const room = home();
    room.join(1, join(1, 0, 6));
    room.tick();
    room.startGuide(1, null);
    const sq = room.squadsOf(1)[0];
    const rations = () => (room.sim.cargo({ squad: sq })?.slots ?? []).map((x) => amount(x.hold, 'ration'));
    expect(rations()).toEqual(Array(6).fill(HUNGER.kit));
    const save = room.guide.saveOf(1)!;
    expect(save).toEqual({ v: 1, done: [] });
    room.startGuide(1, save); // he comes back: the DO hands the stored save
    expect(rations()).toEqual(Array(6).fill(HUNGER.kit));
  });

  it('W-79: the rations reach a squad spawned this very join (the DO starts the guide before any tick)', () => {
    const room = home();
    room.join(1, join(1, 0, 6));
    room.startGuide(1, null);
    const sq = room.squadsOf(1)[0];
    expect((room.sim.cargo({ squad: sq })?.slots ?? []).map((x) => amount(x.hold, 'ration'))).toEqual(Array(6).fill(HUNGER.kit));
  });

  it('a full army: the soul step closes unpaid at once; the haul step on a stow mark', () => {
    const room = home();
    room.join(1, join(1, 0, ARMY_MAX));
    room.tick();
    room.setArmy(1, ARMY_MAX);
    room.startGuide(1, null);
    const r = room.tick();
    expect(r.guided).toEqual([expect.objectContaining({ pid: 1, step: 'soul', paid: false, reward: {} })]);
    expect(guideMsgs(r, 1)).toEqual([{ t: 'guide', done: ['soul'], step: 'soul' }]);
    room.guide.mark(1, 'haul');
    expect(room.tick().guided).toEqual([expect.objectContaining({ step: 'haul', paid: true })]);
  });

  it('a claim refused (army full meanwhile) closes the soul step unpaid, not stuck', () => {
    const room = home();
    room.join(1, join(1, 0, 4));
    room.tick();
    room.setArmy(1, 4);
    room.startGuide(1, null);
    room.tick();
    room.setArmy(1, ARMY_MAX); // his men elsewhere filled the army
    const sq = room.squadsOf(1)[0], u = room.snapshot().units.find((x) => x.squad === sq)!;
    const soul = room.sim.spawnSoul(u.x + 2, u.y, 'hoplite');
    room.order(1, { kind: 'claimSoul', squad: sq, soul });
    let got: ReturnType<WarRoom['tick']>['guided'] = [];
    for (let t = 0; t < 600 && !got.length; t++) got = room.tick().guided.filter((d) => d.step === 'soul');
    expect(got).toEqual([expect.objectContaining({ step: 'soul', paid: false })]);
  });

  it('a finished or hidden guide stays shut; another alliance has none here; the client may hide it', () => {
    const room = home();
    room.join(1, join(1, 0, 4));
    room.join(2, join(2, 1, 4));
    room.tick();
    const all = GUIDE_STEPS.map((s) => s.id);
    expect(room.startGuide(1, { v: 1, done: all })).toEqual({ t: 'guide', done: all });
    expect(room.guide.open).toEqual([]);
    expect(room.startGuide(2, null)).toBeNull();
    expect(guideLairs(room)).toEqual([]);
    room.startGuide(1, { v: 1, done: [] });
    expect(room.guide.hide(1)).toEqual({ v: 1, done: [], hidden: true });
    expect(room.startGuide(1, { v: 1, done: [], hidden: true })).toEqual({ t: 'guide', done: [], hidden: true });
    expect(parseClientMsg(JSON.stringify({ t: 'guide', op: 'hide' }))).toEqual({ t: 'guide', op: 'hide' });
  });
});
