/**
 * W-60 dev-console scenarios "Hunger" and "Claim a soul" (src/war/scenarios/souls.ts), played headless as the sandbox
 * applies them: what their checklists promise happens.
 */
import { describe, expect, it } from 'vitest';
import { parseRegion } from '../../src/war/region/schema';
import { scenarioById } from '../../src/war/scenarios';
import { applyScenario, headlessHost, stepSim } from '../../src/war/scenarios/run';
import { createSim } from '../../src/war/sim';
import { createBots } from '../../src/war/sim/bots';
import { hungerStage } from '../../src/war/sim/food';
import { ARMY_MAX } from '../../src/war/sim/soldiers';
import type { WarEvent } from '../../src/war/types';
import type { Scenario } from '../../src/war/scenarios/types';
import region from '../../src/war/regions/test-ridge.json';

const load = (sc: Scenario) => {
  const sim = createSim(parseRegion(region), 1), bots = createBots(sim);
  applyScenario(headlessHost(sim, bots), sc);
  return { sim, step: (n: number, ev?: WarEvent[]) => { for (let t = 0; t < n; t++) (stepSim(sim, bots), ev?.push(...sim.events())); } };
};
const sats = (sim: ReturnType<typeof createSim>, squad: number) => {
  const s = sim.snapshot();
  return s.squads[squad].units.map((id) => s.units[id]).filter((u) => u.state !== 'dead').map((u) => u.sat!);
};

describe('W-60 scenarios', () => {
  it('Hunger: the hoplites eat from the camp store, the slingers from their packs; the archers starve', () => {
    const { sim, step } = load(scenarioById('food-hunger')!);
    const store = sim.snapshot().buildings!.find((b) => b.type === 'camp')!;
    expect(store.state).toBe('done');
    expect(sats(sim, 2).every((x) => hungerStage(x) === 2)).toBe(true);
    step(30);
    expect(sats(sim, 0).every((x) => hungerStage(x) === 0)).toBe(true);
    expect(sats(sim, 1).every((x) => hungerStage(x) === 0)).toBe(true);
    expect(sim.snapshot().buildings!.find((b) => b.id === store.id)!.goods!.food).toBeLessThan(120);
    expect(sats(sim, 2).every((x) => hungerStage(x) === 2)).toBe(true);
  });

  it('Claim a soul: eleven men claim the first and are refused the second at twelve', () => {
    const { sim, step } = load(scenarioById('limit-soul')!);
    const [a, b] = sim.snapshot().souls!;
    const ev: WarEvent[] = [];
    sim.order({ kind: 'claimSoul', squad: 0, soul: a.id });
    step(400, ev);
    expect(ev.find((e) => e.kind === 'soulClaimed')).toMatchObject({ soul: a.id, squad: 0 });
    sim.order({ kind: 'claimSoul', squad: 0, soul: b.id });
    step(500, ev);
    expect(ev.find((e) => e.kind === 'soulRefused')).toMatchObject({ soul: b.id, have: ARMY_MAX });
    expect(sim.snapshot().souls!.map((x) => x.id)).toEqual([b.id]);
  });
});
