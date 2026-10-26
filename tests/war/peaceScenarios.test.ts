/**
 * W-61: the peaceful-play scenarios (src/war/scenarios/peace.ts) play what their checklists promise: the village is a
 * level-3 town at the start and a Town once the ring closes; a build contract's ally squad logs labour on the site.
 */
import { describe, expect, it } from 'vitest';
import { parseRegion } from '../../src/war/region/schema';
import { scenarioById } from '../../src/war/scenarios';
import { applyScenario, headlessHost, stepSim } from '../../src/war/scenarios/run';
import { createSim } from '../../src/war/sim';
import { createBots } from '../../src/war/sim/bots';
import ridge from '../../src/war/regions/test-ridge.json';

const load = (id: string, cap = 12000) => {
  const sim = createSim(parseRegion(ridge), 1), bots = createBots(sim);
  applyScenario(headlessHost(sim, bots, cap), scenarioById(id)!);
  return { sim, bots };
};

describe('peace scenarios (W-61)', () => {
  it('peace-town-level: a Village at the start, a Town once the ring stands', () => {
    const { sim, bots } = load('peace-town-level');
    expect(sim.townLevels(true).find((t) => t.team === 0)).toMatchObject({ level: 3, name: 'Village' });
    for (let t = 0; t < 30000 && !(sim.townLevels().find((x) => x.team === 0)?.closed); t++) stepSim(sim, bots);
    expect(sim.townLevels(true).find((t) => t.team === 0)).toMatchObject({ closed: true, level: 4 });
  }, 120_000);

  it('peace-build-contract: the ally\'s men log labour on the storehouse site', () => {
    const { sim, bots } = load('peace-build-contract');
    sim.takeLabour();
    for (let t = 0; t < 1200; t++) stepSim(sim, bots);
    const site = sim.snapshot().buildings!.find((b) => b.type === 'storehouse')!;
    expect(sim.takeLabour().filter((l) => l.owner === 'p:2' && l.site === site.id).reduce((a, l) => a + l.secs, 0)).toBeGreaterThan(0);
  }, 60_000);
});
