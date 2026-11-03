/**
 * W-62 the guided first hour (src/war/net/guide.ts): the targets stand on open, reachable ground of every home
 * region, and the warrior's chain runs to the end on dodona (seeded): his hoplites claim the soul by the road, gather, beat
 * the guide's bandit pair without a loss within 3 minutes of arrival and raise a camp in the home town. W-170: the builder's
 * and the trader's chains close on what they do, on the same watch.
 */
import { eventForPath } from '../../src/war/view/hud/worldEvents';
import { describe, expect, it } from 'vitest';
import dodonaJson from '../../src/war/regions/dodona.json';
import elaiaJson from '../../src/war/regions/elaia.json';
import kyreneJson from '../../src/war/regions/kyrene.json';
import skythiaJson from '../../src/war/regions/skythia.json';
import { parseRegion } from '../../src/war/region/schema';
import { createSim } from '../../src/war/sim';
import { buildGrid, findPath, tileAt } from '../../src/war/sim/grid';
import { ARMY_MAX } from '../../src/war/sim/soldiers';
import { doneNow, GIVER_NEAR, GUIDE_LAIR, GUIDE_PATHS, GUIDE_SOUL, guideAbroad, guideExit, guideHand, guideNext, guideOpen, guideSpots, guideSteps, HOME_R, newWatch, watchEvents, watchFor, type GuideStepId } from '../../src/war/net/guide';
import { npcSpot } from '../../src/war/net/npcMarket';
import { ALLIANCES } from '../../src/war/world/alliances';
import { PATH_IDS } from '../../src/war/world/start';
import type { Snapshot } from '../../src/war/types';
import { storyOf } from '../../src/data/warStories';
import { adjacent } from '../../src/war/world/graph';
import type { RegionData, WarBuildSim } from '../../src/war/types';

const HOMES: [string, unknown][] = [['dodona', dodonaJson], ['elaia', elaiaJson], ['kyrene', kyreneJson], ['skythia', skythiaJson]];

describe('W-62 guide spots', () => {
  for (const [id, json] of HOMES)
    it(`${id}: soul and lair stand on the walkable road from the north entry towards the town`, () => {
      const r = parseRegion(json) as RegionData, g = buildGrid(r), sp = guideSpots(r, 0);
      const from = tileAt(g, sp.entry.x, sp.entry.y);
      for (const p of [sp.soul, sp.lair]) {
        const t = tileAt(g, p.x, p.y);
        expect(g.cost[t]).toBeGreaterThan(0);
        const way = findPath(g, from, t);
        expect(way.at(-1)).toBe(t);
        expect(way.length).toBeLessThan(Math.hypot(p.x - sp.entry.x, p.y - sp.entry.y) * 1.3 + 8); // on this side of any river, no detour
      }
      expect(Math.hypot(sp.soul.x - sp.entry.x, sp.soul.y - sp.entry.y)).toBeLessThan(GUIDE_SOUL.at + 6);
      expect(Math.hypot(sp.lair.x - sp.entry.x, sp.lair.y - sp.entry.y)).toBeLessThan(GUIDE_LAIR.at + 6);
      // the lair is on the way home: nearer the town than the entry is
      expect(Math.hypot(sp.lair.x - sp.home.x, sp.lair.y - sp.home.y)).toBeLessThan(Math.hypot(sp.entry.x - sp.home.x, sp.entry.y - sp.home.y));
    });
});

describe('W-62 the first-hour chain (sim side)', () => {
  it('soul, gather, bandit pair, camp and the hand-off (W-73) run to completion on dodona', () => {
    const r = parseRegion(dodonaJson) as RegionData, sp = guideSpots(r, 0), next = guideNext('dodona', r)!;
    // the hand-off: the nearest neighbour with a region chain, its giver, and the exit towards it
    expect(adjacent('dodona', next.region)).toBe(true);
    expect(next.giver).toBe(storyOf(next.region)!.giver.name);
    const sim: WarBuildSim = createSim(r, 7) as WarBuildSim;
    sim.claim(0, sp.home.x, sp.home.y, HOME_R); // the home alliance's ground (the server room does it)
    const sq = sim.spawnSquad('you', 0, 'hoplite', ARMY_MAX - 1, sp.entry.x, sp.entry.y);
    const soul = sim.spawnSoul(sp.soul.x, sp.soul.y, 'hoplite', GUIDE_SOUL.level, 'shrine');
    sim.addLair({ kind: GUIDE_LAIR.kind, x: sp.lair.x, y: sp.lair.y, count: GUIDE_LAIR.count });
    const w = newWatch(0, sp.lair, undefined, next.exit), at: Partial<Record<GuideStepId, number>> = {};
    const run = (max: number, step: GuideStepId) => {
      for (let t = 0; t < max && !at[step]; t++) {
        sim.step();
        const s = sim.snapshot();
        watchEvents(w, s, sim.events());
        for (const id of doneNow(w, s)) at[id] ??= s.tick;
      }
      expect(at[step], `${step} done`).toBeDefined();
    };
    const men = () => { const s = sim.snapshot(); return s.squads[sq].units.filter((u) => s.units[u].state !== 'dead').length; };
    const centre = () => { const s = sim.snapshot(), us = s.squads[sq].units.map((u) => s.units[u]); return { x: us.reduce((a, u) => a + u.x, 0) / us.length, y: us.reduce((a, u) => a + u.y, 0) / us.length }; };
    const nearest = (res: string[], p: { x: number; y: number }) => sim.resourceNodes().filter((n) => res.includes(n.res) && n.amount > 0).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];

    sim.order({ kind: 'claimSoul', squad: sq, soul });
    run(600, 'soul');
    sim.step();
    expect(men()).toBe(ARMY_MAX);

    const node = nearest(['wood', 'stone'], centre());
    expect(Math.hypot(node.x - sp.entry.x, node.y - sp.entry.y)).toBeLessThan(60); // a node near the road
    sim.order({ kind: 'gather', squad: sq, node: node.id });
    run(900, 'gather');

    const lair = sim.snapshot().lairs!.find((l) => Math.hypot(l.x - sp.lair.x, l.y - sp.lair.y) < 0.5)!;
    sim.order({ kind: 'attack', squad: sq, target: lair.squad });
    run(1200, 'lair');
    expect(at.lair!).toBeLessThan(1800); // within 3 minutes of arrival
    expect(men()).toBe(ARMY_MAX); // nobody fell (wounded at worst)
    expect(sim.snapshot().lairs!.find((l) => l.id === lair.id)?.respawnIn).toBeDefined();

    // a camp on the town's ground, as near the road in as it fits
    const c = centre();
    let spot: { x: number; y: number } | null = null;
    for (let d = HOME_R - 8; d >= 0 && !spot; d -= 2) {
      const k = d / Math.hypot(c.x - sp.home.x, c.y - sp.home.y), x = Math.round(sp.home.x + (c.x - sp.home.x) * k), y = Math.round(sp.home.y + (c.y - sp.home.y) * k);
      for (let o = 0; o < 6 && !spot; o++) if (sim.checkPlacement(0, 'camp', x + o * 3, y, 0).ok) spot = { x: x + o * 3, y };
    }
    expect(spot).not.toBeNull();
    sim.order({ kind: 'placeBuilding', squad: sq, type: 'camp', x: spot!.x, y: spot!.y, rot: 0 });
    run(4000, 'build');

    expect(at.next).toBeUndefined();
    sim.order({ kind: 'move', squad: sq, x: next.exit.x, y: next.exit.y });
    run(14000, 'next'); // the long road round the town to the south exit
    expect(Object.keys(at).sort()).toEqual(guideSteps('warrior').map((s) => s.id).sort());
  }, 60_000);
});

describe('W-170 a chain per path', () => {
  const jsons = import.meta.glob<unknown>('../../src/war/regions/*.json', { eager: true, import: 'default' });
  const region = (id: string) => parseRegion(jsons[`../../src/war/regions/${id}.json`]) as RegionData;
  const snap = (o: Partial<Snapshot>): Snapshot => ({ tick: 1, units: [], squads: [{ id: 0, team: 0, owner: 'p:1' }], buildings: [], ...o }) as unknown as Snapshot;
  const man = (x: number, y: number, o = {}) => ({ id: 9, squad: 0, x, y, state: 'idle', ...o });
  const bld = (o: object) => ({ id: 5, team: 0, owner: 'p:1', x: 100, y: 100, state: 'done', type: 'privateHouse', ...o });
  const HOMES = Object.values(ALLIANCES).map((a) => a.home);

  it('the chains are what the owner asked, each ending on the hand-off; a builder or trader meets no fight', () => {
    expect(GUIDE_PATHS.warrior.map((s) => s.id)).toEqual(['soul', 'gather', 'lair', 'build', 'next']);
    expect(GUIDE_PATHS.builder.map((s) => s.id)).toEqual(['gather', 'house', 'access', 'work', 'next']);
    expect(GUIDE_PATHS.trader.map((s) => s.id)).toEqual(['load', 'carry', 'sell', 'hire', 'next']);
    expect(guideSteps(null)).toBe(GUIDE_PATHS.warrior);
    for (const p of PATH_IDS) for (const s of GUIDE_PATHS[p]) expect(Object.keys(s.reward).length, `${p} ${s.id}`).toBeGreaterThan(0);
  });

  it.each(HOMES)('%s: a builder or trader hands off to his own chain, right here; only a warrior has the bandit camp', (id) => {
    const r = region(id);
    for (const p of ['builder', 'trader'] as const) {
      const hand = guideHand(id, r, p)!;
      expect(hand.road).toBeNull();
      expect(hand.giver).toBe(storyOf(id, p)!.giver.name);
      const w = watchFor(p, r, 0, 'p:1', id, { x: 1, y: 1 });
      expect(w.lair).toBeNull();
      expect(w.nextR).toBe(GIVER_NEAR);
    }
    expect(watchFor('warrior', r, 0, 'p:1', id, { x: 1, y: 1 }).lair).toEqual({ x: 1, y: 1 });
    expect(guideHand(id, r, 'warrior')!.road).not.toBeNull(); // the road to the nearest land with a story (W-73)
    expect(guideAbroad(id, r)).not.toBeNull();
  });

  it('a builder: his own house, a changed access, a staffed workplace, each only his', () => {
    const r = region('dodona'), w = watchFor('builder', r, 0, 'p:1', 'dodona', null), men = [man(100, 100)];
    expect(doneNow(w, snap({ units: men as never })).size).toBe(0);
    expect(doneNow(w, snap({ units: men as never, buildings: [bld({ owner: 'p:2' })] as never })).has('house')).toBe(false);
    expect(doneNow(w, snap({ units: men as never, buildings: [bld({ access: 'private' })] as never })).has('house')).toBe(true);
    expect(doneNow(w, snap({ units: men as never, buildings: [bld({ access: 'private' })] as never })).has('access')).toBe(false);
    expect(doneNow(w, snap({ units: men as never, buildings: [bld({ access: 'alliance' })] as never })).has('access')).toBe(true);
    const stall = bld({ id: 6, type: 'stall' });
    expect(doneNow(w, snap({ units: men as never, buildings: [stall] as never })).has('work')).toBe(false); // nobody at it
    expect(doneNow(w, snap({ units: men as never, buildings: [{ ...stall, staffed: true }] as never })).has('work')).toBe(true);
    const w2 = watchFor('builder', r, 0, 'p:1', 'dodona', null); // a town forge, an order of his man's running
    expect(doneNow(w2, snap({ units: men as never, buildings: [bld({ id: 7, type: 'forge', pre: true, owner: undefined, queue: [{ by: 9 }] })] as never })).has('work')).toBe(true);
  });

  it('a trader: a loaded cart, the far town, and goods on men\'s backs count too; his hand-off is at home', () => {
    const home = region('dodona'), out = guideAbroad('dodona', home)!, far = region(out.region);
    const w = watchFor('trader', home, 0, 'p:1', 'dodona', null);
    expect(w.town).toBeNull();
    expect(w.next).toEqual(guideHand('dodona', home, 'trader')!.at);
    expect(doneNow(w, snap({ sieges: [{ owner: 'p:1', team: 0, loads: 0 }] as never })).has('load')).toBe(false);
    expect(doneNow(w, snap({ sieges: [{ owner: 'p:2', team: 0, loads: 3 }] as never })).has('load')).toBe(false);
    expect(doneNow(w, snap({ sieges: [{ owner: 'p:1', team: 0, loads: 3 }] as never })).has('load')).toBe(true);
    const a = watchFor('trader', far, 0, 'p:1', 'dodona', null), t = npcSpot(far);
    expect(a.town).toEqual(t);
    expect(a.next).toBeNull();
    expect(doneNow(a, snap({ units: [man(t.x + 100, t.y)] as never })).has('carry')).toBe(false);
    const there = doneNow(a, snap({ units: [man(t.x + 5, t.y)] as never }));
    expect(there.has('carry') && there.has('load')).toBe(true);
    expect(guideExit(out.region, 'dodona', far)).not.toBeNull();
  });

  it('the guide stays open by his path\'s chain', () => {
    const all = guideSteps('builder').map((s) => s.id);
    expect(guideOpen({ v: 1, done: all }, 'builder')).toBe(false);
    expect(guideOpen({ v: 1, done: all }, 'trader')).toBe(true);
  });
});

describe('W-174 the world event card tells a path its own events', () => {
  it('fights to a warrior, a caravan rush to a trader, nothing to a builder', () => {
    expect(eventForPath('bossWake', 'warrior')).toBe(true);
    expect(eventForPath('caravanRush', 'warrior')).toBe(false);
    expect(eventForPath('caravanRush', 'trader')).toBe(true);
    expect(eventForPath('bossWake', 'trader')).toBe(false);
    expect(eventForPath('bossWake', 'builder')).toBe(false);
    expect(eventForPath('caravanRush', 'builder')).toBe(false);
    expect(eventForPath('bossWake', null)).toBe(true);
  });
});
