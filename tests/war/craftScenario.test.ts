import { describe, expect, it } from 'vitest';
import ridgeJson from '../../src/war/regions/test-ridge.json';
import { parseRegion } from '../../src/war/region/schema';
import { scenarioById } from '../../src/war/scenarios';
import { createSim } from '../../src/war/sim';
import { makePerson } from '../../src/war/sim/roster';
import type { ResourceKind, WarEvent, WarPerson } from '../../src/war/types';

const ridge = parseRegion(ridgeJson);

/** The crafting scenario as the sandbox plays it (src/war/view/devPanel.ts applyScenario), headless; the smiths as the sandbox roster's household gives them. */
function crafting() {
  const sc = scenarioById('crafting')!, e = sc.economy!, a = sc.after!;
  const sim = createSim(ridge, 1);
  for (const c of e.claims) sim.claim(c.team, c.x, c.y, c.r);
  for (const [r, n] of Object.entries(e.stock ?? {})) sim.addStock(0, r as ResourceKind, n);
  for (const q of sc.squads) sim.spawnSquad('you', q.team, q.cls, q.count, q.x, q.y);
  for (const t of e.sites ?? []) sim.order({ kind: 'placeBuilding', squad: t.squad, type: t.type, x: t.x, y: t.y });
  const done = () => { const bs = sim.snapshot().buildings ?? []; return bs.length > 0 && bs.every((b) => b.state === 'done'); };
  let on = -1;
  for (let t = 0; t < e.prebuild! && !done(); t++) {
    const open = t % 20 === 0 ? sim.snapshot().buildings?.find((b) => b.state !== 'done') : undefined;
    if (open && open.id !== on) sim.order({ kind: 'build', squad: 0, site: (on = open.id) });
    sim.step();
  }
  for (const o of a.orders) sim.order(o);
  for (let t = 0; t < (a.settle ?? 0); t++) sim.step();
  const smith = makePerson('you-smith', 'civ_smith', { level: 4 });
  const persons: Record<string, WarPerson[]> = { civ_smith: [{ ...smith, hero: { ...smith.hero, perks: ['bladesmith'] as unknown as typeof smith.hero.perks } }, makePerson('you-smith2', 'civ_smith')] };
  for (const q of a.squads) sim.spawnSquad('you', q.team, q.cls, q.count, q.x, q.y, persons[q.cls]);
  for (const o of a.then ?? []) sim.order(o);
  return sim;
}

describe('M5h5 crafting scenario', () => {
  it('the owner crafts a sword end to end at the forge', () => {
    const sim = crafting();
    const s = sim.snapshot();
    expect(s.buildings!.map((b) => [b.type, b.state])).toEqual([['camp', 'done'], ['forge', 'done'], ['cookhouse', 'done'], ['infirmary', 'done']]);
    sim.order({ kind: 'craft', team: 0, building: 1, recipe: 'item:xiphos' });
    const events: WarEvent[] = [];
    for (let t = 0; t < 3000 && !events.some((e) => e.kind === 'crafted'); t++) {
      sim.step();
      events.push(...sim.events());
    }
    const made = events.find((e) => e.kind === 'crafted');
    expect(made && made.kind === 'crafted' && made.what).toBe('craft');
    if (made?.kind !== 'crafted') return;
    expect(made.item.def).toBe('xiphos');
    expect(made.owner).toBe('you');
    expect(made.item.q).toBeDefined();
  });
});
