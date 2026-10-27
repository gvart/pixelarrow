/** E3 scenarios (src/war/scenarios/veterans.ts, bosses.ts): the veterans' fight in Dodona and the Erymanthian Boar raid play out. */
import { describe, expect, it } from 'vitest';
import { parseRegion } from '../../src/war/region/schema';
import { scenarioById } from '../../src/war/scenarios';
import { applyScenario, headlessHost, stepSim } from '../../src/war/scenarios/run';
import { createSim } from '../../src/war/sim';
import { createBots } from '../../src/war/sim/bots';
import type { RegionData } from '../../src/war/types';

const files = import.meta.glob('../../src/war/regions/*.json', { eager: true, import: 'default' });
const load = (id: string) => {
  const sc = scenarioById(id)!;
  const sim = createSim(parseRegion(files[`../../src/war/regions/${sc.region}.json`]) as RegionData, sc.seed ?? 1), bots = createBots(sim);
  applyScenario(headlessHost(sim, bots, 40), sc);
  return { sc, sim, bots };
};

describe('E3 scenarios', () => {
  it('veterans: the squad stands by the Dodona memorial and fights the fresh hoplites', () => {
    const { sim, bots } = load('veterans');
    const s0 = sim.snapshot();
    expect(sim.region.id).toBe('dodona');
    expect(s0.buildings!.filter((b) => b.type === 'statue').length).toBeGreaterThanOrEqual(2);
    expect(s0.squads.filter((q) => q.team !== 2).length).toBeGreaterThanOrEqual(2);
    let blows = 0;
    for (let t = 0; t < 900; t++) {
      stepSim(sim, bots);
      if (sim.snapshot().units.some((u) => u.state === 'attack')) blows++;
    }
    expect(blows).toBeGreaterThan(0);
  }, 60_000);

  it('boss-erymanthian-boar: the raid reaches the Boar in the boar wood and wears it down', () => {
    const { sim, bots } = load('boss-erymanthian-boar');
    const boar = () => sim.snapshot().bosses!.find((b) => b.id === 'erymanthian_boar')!;
    expect(boar()).toBeDefined();
    const max = boar().maxHp;
    for (let t = 0; t < 1500 && boar().hp > max * 0.95; t++) stepSim(sim, bots);
    expect(boar().hp).toBeLessThan(max * 0.95);
  }, 60_000);
});
