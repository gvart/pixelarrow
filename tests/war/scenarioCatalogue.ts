/**
 * The dev console's scenario catalogue (src/war/scenarios): every scenario loads as the sandbox applies it (prebuilds and
 * settles capped at a few ticks), steps 50 ticks without throwing, and plays the same for a seed. A fresh sim costs about
 * half a second, so the catalogue runs in shards (scenarioCatalogue.<n>.test.ts) that the scenario project runs in parallel.
 */
import { describe, expect, it } from 'vitest';
import { parseRegion } from '../../src/war/region/schema';
import { GROUPS, SCENARIOS, type Scenario } from '../../src/war/scenarios';
import { applyScenario, headlessHost, stepSim } from '../../src/war/scenarios/run';
import { createSim } from '../../src/war/sim';
import { createBots } from '../../src/war/sim/bots';
import { MOB_TEAM } from '../../src/war/sim/mobs';
import type { RegionData, Snapshot } from '../../src/war/types';

const files = import.meta.glob('../../src/war/regions/*.json', { eager: true, import: 'default' });
const parsed = new Map<string, RegionData>();
/** The scenario's region with its zones merged in (../../src/war/view/main.ts does the same). */
function regionOf(sc: Scenario): RegionData {
  const id = sc.region ?? 'test-ridge';
  if (!parsed.has(id)) parsed.set(id, parseRegion(files[`../../src/war/regions/${id}.json`]));
  const r = { ...parsed.get(id)! };
  if (sc.zones) for (const k of ['safe', 'yard', 'ambush'] as const) if (sc.zones[k]) r[k] = [...(r[k] ?? []), ...sc.zones[k]!];
  return r;
}

/** Load and step: at most CAP ticks per prebuild or settle, then 50 ticks of play. */
const CAP = 40;
function play(sc: Scenario, seed: number): Snapshot {
  const sim = createSim(regionOf(sc), seed), bots = createBots(sim);
  applyScenario(headlessHost(sim, bots, CAP), sc);
  for (let t = 0; t < 50; t++) stepSim(sim, bots);
  return sim.snapshot();
}
/** What must match between two runs of a seed: every man and every building. */
const digest = (s: Snapshot) => JSON.stringify({
  tick: s.tick,
  units: s.units.map((u) => [u.id, u.squad, +u.x.toFixed(4), +u.y.toFixed(4), u.hp, u.state]),
  squads: s.squads.map((q) => [q.id, q.team, q.owner, q.order]),
  buildings: (s.buildings ?? []).map((b) => [b.id, b.type, b.team, b.state, +b.progress.toFixed(4)]),
});

/** The catalogue's metadata (the picker's groups, goals and checklists). */
export function catalogueMeta(): void {
  describe('scenario catalogue', () => {
    it('ids are unique; every scenario has a group, a goal and (clips aside) a checklist', () => {
      expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
      for (const s of SCENARIOS) {
        expect(GROUPS, s.id).toContain(s.group);
        expect(s.goal.length, s.id).toBeGreaterThan(10);
        if (s.group !== 'clips') expect(s.check?.length ?? 0, s.id).toBeGreaterThan(0);
      }
    });

    it('covers every group', () => {
      for (const g of GROUPS) expect(SCENARIOS.some((s) => s.group === g), g).toBe(true);
    });
  });
}

/** Shard k of n of the catalogue: each scenario loads, steps 50 ticks, and the same seed plays the same. */
export function catalogueShard(k: number, n: number): void {
  describe(`scenario catalogue ${k + 1}/${n}`, () => {
    for (const sc of SCENARIOS.filter((_, i) => i % n === k)) {
      it(`${sc.id}: loads, steps 50 ticks, same seed plays the same`, () => {
        const a = play(sc, 7);
        // every squad of the scenario stood up (the civilian quota or a bad point would drop one)
        expect(a.squads.filter((q) => q.team !== MOB_TEAM).length, 'squads').toBeGreaterThanOrEqual(sc.squads.length + (sc.after?.squads.length ?? 0));
        // every first-phase site was laid out (a bad point is refused; later phases wait on the capped prebuild)
        for (const t of (sc.economy?.sites ?? []).filter((q) => !q.phase)) {
          const team = sc.squads[t.squad]?.team ?? 0;
          expect(a.buildings?.some((b) => b.team === team && Math.abs(b.x - t.x) < 1.5 && Math.abs(b.y - t.y) < 1.5), `${t.type} at ${t.x},${t.y}`).toBe(true);
        }
        expect(digest(play(sc, 7))).toBe(digest(a));
      });
    }
  });
}
