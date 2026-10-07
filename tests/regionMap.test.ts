import { describe, expect, it } from 'vitest';
import { WorldGraph, getMap } from '../src/online/world';
import { rleEncode, type MapJson } from '../src/online/mapSchema';
import { LiveArmies, allSteps, alongPolyline, poseOf, routePoints, sightSteps } from '../src/online/liveArmies';
import { planMarch } from '../src/online/marchPlan';
import { regionActions, type ActInput } from '../src/online/regionActions';
import { ONLINE_RULES } from '../src/online/rules';
import { demoShard } from '../src/online/demoShard';
import type { LiveArmyMsg } from '../src/online/protocol';

/** Five regions in a row (1 - 2 - 3 - 4 - 5), 10 px cells, one minute per route. */
function lineMap(): WorldGraph {
  const site = { base: 'plain', river: false, coast: false, rocky: false, woods: 0 } as const;
  const map: MapJson = {
    id: 'line',
    version: 1,
    cell: 10,
    w: 5,
    h: 1,
    mask: rleEncode([1, 2, 3, 4, 5]),
    terrain: rleEncode([3, 3, 3, 3, 3]),
    regions: [1, 2, 3, 4, 5].map((id) => ({ id, name: `R${id}`, kind: id === 3 ? 'capital' : 'plot', tier: 1, site, spawn: id === 1, label: [id * 10 - 5, 5] as [number, number] })),
    edges: [1, 2, 3, 4].map((a) => ({ a, b: a + 1, minutes: 1, waypoints: [[a * 10 - 5, 5], [a * 10 + 5, 5]] as [number, number][] })),
  };
  return new WorldGraph(map);
}

describe('live army movement', () => {
  const w = lineMap();
  const path = [1, 2, 3, 4, 5];
  const at = [1000, 61_000, 121_000, 181_000, 241_000];

  it('cuts marches to what a viewer sees (fog stays on the server)', () => {
    expect(sightSteps(w, path, at, [1], 0)).toEqual([{ loc: 1, at: 1000, until: 61_000 }]);
    expect(sightSteps(w, path, at, [1], 1).map((s) => s.loc)).toEqual([1, 2]);
    expect(sightSteps(w, path.slice(0, 2), at, [5], 2)).toEqual([]);
    expect(allSteps(path, at).at(-1)).toEqual({ loc: 5, at: 241_000, until: null });
  });

  it('interpolates along the route waypoints and stops at the end', () => {
    const a = { player: 2, name: 'B', clan: null, loc: 1, steps: allSteps(path, at), own: false };
    const mid = poseOf(w, a, 31_000);
    expect(mid.x).toBeCloseTo(10, 5);
    expect(mid).toMatchObject({ loc: 1, moving: true, visible: true, dx: 10, dy: 0 });
    expect(poseOf(w, a, 500)).toMatchObject({ visible: false }); // not set out yet
    expect(poseOf(w, a, 300_000)).toMatchObject({ loc: 5, x: 45, moving: false, visible: true });
    // routes run either way along their waypoints
    expect(routePoints(w, 2, 1)).toEqual([{ x: 15, y: 5 }, { x: 5, y: 5 }]);
    expect(alongPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 0.75)).toMatchObject({ x: 10, y: 5 });
  });

  it('hides an army that walked out of sight; gaps are not interpolated', () => {
    const steps = sightSteps(w, path, at, [1, 2, 4], 0);
    expect(steps.map((s) => s.loc)).toEqual([1, 2, 4]);
    const a = { player: 2, name: 'B', clan: null, loc: 1, steps, own: false };
    expect(poseOf(w, a, 91_000)).toMatchObject({ loc: 2, moving: true, visible: true, dx: 0, dy: 0 }); // heading into the fog
    expect(poseOf(w, a, 150_000)).toMatchObject({ visible: false }); // in the fog between 2 and 4
    expect(poseOf(w, a, 190_000)).toMatchObject({ loc: 4, visible: true });
    expect(poseOf(w, a, 250_000)).toMatchObject({ visible: false }); // left the last visible region
  });

  it('tracks socket messages with the server clock', () => {
    const live = new LiveArmies(w, 1, (loc) => loc < 10);
    live.load([{ player: 1, loc: 1, dest: null, arriveAt: null, path: null }], { '1': 'Me' }, 10_000, 4_000);
    expect(live.skew).toBe(6_000);
    const march: LiveArmyMsg = { type: 'army_march', player: 7, name: 'Raider', clan: 3, path, at, until: [...at.slice(1), null], now: 31_000 };
    expect(live.apply(march, 1_000)).toBe(true);
    expect(live.skew).toBe(30_000);
    expect(live.poses(1_000).find((p) => p.player === 7)).toMatchObject({ moving: true, visible: true });
    live.apply({ type: 'army_pos', player: 7, name: 'Raider', clan: 3, loc: 3, now: 40_000 }, 10_000);
    expect(live.armies.get(7)).toMatchObject({ loc: 3, steps: null });
    live.apply({ type: 'army_hide', player: 7, now: 41_000 }, 11_000);
    expect(live.armies.has(7)).toBe(false);
    // your own army never hides; its march settles when it ends
    live.ownMarch([1, 2], [30_000, 40_000]);
    expect(live.apply({ type: 'army_hide', player: 1, now: 31_000 }, 1_000)).toBe(false);
    expect(live.settle(20_000)).toBe(true); // server time 50 s
    expect(live.armies.get(1)).toMatchObject({ loc: 2, steps: null });
    live.apply({ type: 'army_arrive', player: 1, loc: 4, now: 60_000 }, 30_000);
    expect(live.armies.get(1)).toMatchObject({ loc: 4 });
  });

  it('armies standing in the fog are not shown', () => {
    const live = new LiveArmies(w, 1, (loc) => loc < 3);
    live.apply({ type: 'army_pos', player: 9, name: 'X', clan: null, loc: 5, now: 0 }, 0);
    expect(live.poses(0)[0].visible).toBe(false);
  });
});

describe('march estimate and region actions', () => {
  const w = getMap('test30');

  it('finds the quickest route, avoiding the sea and rival land', () => {
    const home = w.spawns()[0];
    const far = w.capitals()[0];
    const p = planMarch(w, () => false, home, far);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.path[0]).toBe(home);
    expect(p.path.at(-1)).toBe(far);
    expect(p.energy).toBe((p.path.length - 1) * ONLINE_RULES.energyPerStep);
    expect(p.minutes).toBe(w.path(home, far)!.minutes);
    // a rival on the way: around it (or no way)
    const blocked = p.path[1];
    const q = planMarch(w, (l) => l === blocked, home, far);
    if (q.ok) expect(q.path).not.toContain(blocked);
    expect(planMarch(w, (l) => l === far, home, far)).toEqual({ ok: false, reason: 'rival' });
    const sea = w.all().find((r) => r.kind === 'sea')!.id;
    expect(planMarch(w, () => false, home, sea)).toEqual({ ok: false, reason: 'impassable' });
    expect(planMarch(w, () => false, home, 9999)).toEqual({ ok: false, reason: 'unknown' });
    expect(planMarch(w, () => false, home, home)).toEqual({ ok: false, reason: 'here' });
    expect(planMarch(w, () => false, home, far, 1)).toEqual({ ok: false, reason: 'too_far' });
    // walled in: every neighbour is rival land
    const walls = new Set(w.neighbours(home));
    expect(planMarch(w, (l) => walls.has(l) && l !== home, home, far)).toEqual({ ok: false, reason: 'no_path' });
  });

  const base: ActInput = {
    owner: null,
    ours: false,
    mine: false,
    home: false,
    passable: true,
    locked: false,
    canAttack: true,
    canGarrison: false,
    waiting: 0,
    here: false,
    adjacent: true,
    marching: false,
    energy: 50,
    plan: { ok: true, path: [1, 2], minutes: 6, energy: 2 },
  };

  it('neutral next door: attack is the primary action, last in the row', () => {
    const acts = regionActions(base);
    expect(acts.map((a) => a.id)).toEqual(['march', 'attack']);
    expect(acts[1]).toMatchObject({ enabled: true, primary: true });
    expect(acts.filter((a) => a.primary)).toHaveLength(1);
  });

  it('says why an action is disabled', () => {
    const far = regionActions({ ...base, adjacent: false, canAttack: false });
    expect(far.find((a) => a.id === 'attack')).toMatchObject({ enabled: false, reason: 'notNext' });
    expect(far.find((a) => a.primary)?.id).toBe('march');
    expect(regionActions({ ...base, energy: 4 }).find((a) => a.id === 'attack')).toMatchObject({ enabled: false, reason: 'energy', params: { n: 4, need: ONLINE_RULES.energyPerAttack } });
    expect(regionActions({ ...base, locked: true }).find((a) => a.id === 'attack')).toMatchObject({ reason: 'locked' });
    expect(regionActions({ ...base, marching: true }).find((a) => a.id === 'attack')).toMatchObject({ reason: 'marching' });
    expect(regionActions({ ...base, energy: 0, plan: { ok: true, path: [], minutes: 30, energy: 5 } }).find((a) => a.id === 'march')).toMatchObject({ enabled: false, reason: 'energy' });
    const rival = regionActions({ ...base, owner: 9, home: true, plan: { ok: false, reason: 'rival' } });
    expect(rival.find((a) => a.id === 'march')).toMatchObject({ enabled: false, reason: 'rival' });
    expect(rival.find((a) => a.id === 'attack')).toMatchObject({ enabled: false, reason: 'home' });
    expect(regionActions({ ...base, passable: false, plan: { ok: false, reason: 'impassable' } })).toEqual([{ id: 'march', enabled: false, reason: 'impassable' }]);
    expect(regionActions({ ...base, plan: { ok: false, reason: 'too_far' } }).find((a) => a.id === 'march')).toMatchObject({ reason: 'tooFar', params: { n: ONLINE_RULES.maxMarch } });
  });

  it('own land: collect and garrison', () => {
    const own = regionActions({ ...base, owner: 1, ours: true, mine: true, here: true, canGarrison: true, waiting: 12 });
    expect(own.map((a) => a.id)).toEqual(['garrison', 'collect']);
    expect(own.find((a) => a.primary)?.id).toBe('collect');
    const away = regionActions({ ...base, owner: 1, ours: true, mine: true, waiting: 0 });
    expect(away.find((a) => a.id === 'collect')).toMatchObject({ enabled: false, reason: 'noIncome' });
    expect(away.find((a) => a.id === 'garrison')).toMatchObject({ enabled: false, reason: 'notHere' });
    expect(away.find((a) => a.primary)?.id).toBe('march');
  });
});

describe('demo shard (preview map)', () => {
  it('is deterministic and shows own, clan and rival land, armies and a live march', () => {
    const a = demoShard(1_000_000, 'test30');
    const b = demoShard(1_000_000, 'test30');
    expect(JSON.stringify(a.map)).toBe(JSON.stringify(b.map));
    const owners = new Set(a.map.regions.map((r) => r.owner));
    expect(owners.has(a.map.you.id)).toBe(true);
    expect(a.map.regions.some((r) => r.owner !== null && r.owner !== a.map.you.id && r.clan === a.map.you.clan)).toBe(true);
    expect(a.map.armies.some((x) => x.path && x.path.length > 1)).toBe(true);
    expect(a.map.regions.filter((r) => r.def).length).toBeGreaterThan(3);
    // the home's neighbours are in sight; the attack spot is next door
    for (const n of a.world.neighbours(a.profile.home)) expect(a.map.regions.some((r) => r.loc === n)).toBe(true);
    expect(a.region(a.spots.neutralNext).canAttack).toBe(true);
    for (const s of [a.spots.lair, a.spots.boss, a.spots.post, a.spots.market]) expect(s).not.toBeNull();
  });
});
