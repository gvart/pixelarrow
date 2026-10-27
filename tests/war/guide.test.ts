/**
 * W-62 the guided first hour (src/war/view/guidePlan.ts): the targets stand on open, reachable ground of every home
 * region, and the chain's sim side runs to the end on dodona (seeded): a new player's 11 hoplites claim the soul by the
 * road, gather, beat the guide's bandit pair without a loss within 3 minutes of arrival, raise a camp in the home town
 * and haul goods into it.
 */
import { describe, expect, it } from 'vitest';
import dodonaJson from '../../src/war/regions/dodona.json';
import elaiaJson from '../../src/war/regions/elaia.json';
import kyreneJson from '../../src/war/regions/kyrene.json';
import skythiaJson from '../../src/war/regions/skythia.json';
import { parseRegion } from '../../src/war/region/schema';
import { createSim } from '../../src/war/sim';
import { buildGrid, findPath, tileAt } from '../../src/war/sim/grid';
import { ARMY_MAX } from '../../src/war/sim/soldiers';
import { doneNow, GUIDE_LAIR, GUIDE_SOUL, GUIDE_STEPS, guideSpots, HOME_R, newWatch, watchEvents, type GuideStepId } from '../../src/war/view/guidePlan';
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
  it('soul, gather, bandit pair, camp and haul run to completion on dodona', () => {
    const r = parseRegion(dodonaJson) as RegionData, sp = guideSpots(r, 0);
    const sim: WarBuildSim = createSim(r, 7) as WarBuildSim;
    sim.claim(0, sp.home.x, sp.home.y, HOME_R); // the home alliance's ground (the server room does it)
    const sq = sim.spawnSquad('you', 0, 'hoplite', ARMY_MAX - 1, sp.entry.x, sp.entry.y);
    const soul = sim.spawnSoul(sp.soul.x, sp.soul.y, GUIDE_SOUL.cls, GUIDE_SOUL.level, 'shrine');
    sim.addLair({ kind: GUIDE_LAIR.kind, x: sp.lair.x, y: sp.lair.y, count: GUIDE_LAIR.count });
    const w = newWatch(0, sp.lair), at: Partial<Record<GuideStepId, number>> = {};
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

    const wood = nearest(['wood', 'stone'], spot!);
    sim.order({ kind: 'gather', squad: sq, node: wood.id });
    run(3000, 'haul');
    expect(Object.keys(at).sort()).toEqual(GUIDE_STEPS.map((s) => s.id).sort());
  }, 60_000);
});
