/** M5e captives held at forts and raids (docs/WAR.md "Capture", "Prisoners": a raid reaching the fort frees all). */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { BUILDINGS } from '../../src/war/sim/economy';
import { makePerson } from '../../src/war/sim/roster';
import type { WarBuildSim, WarEvent } from '../../src/war/types';
import { flat } from './flatRegion';

type Raid = Extract<WarEvent, { kind: 'raid' }>;
const run = (sim: WarBuildSim, n: number, until?: () => boolean) => {
  for (let t = 0; t < n; t++) {
    sim.step();
    if (until?.()) return;
  }
};
const raids = (sim: WarBuildSim) => sim.events().filter((e): e is Raid => e.kind === 'raid');
/** Done camps of `team` at `at`, raised by militia who then walk off to the far corner; returns their ids. */
const camps = (sim: WarBuildSim, team: number, at: [number, number][]) => {
  const n0 = sim.snapshot().buildings?.length ?? 0;
  const squads = at.map(([x, y]) => {
    sim.claim(team, x, y, 20);
    for (const [r, v] of Object.entries(BUILDINGS.camp.cost)) sim.addStock(team, r as never, v);
    const s = sim.spawnSquad('builders', team, 'militia', 12, x, y + 6);
    sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x, y });
    return s;
  });
  const ids = at.map((_, i) => n0 + i);
  const done = () => ids.every((id) => sim.snapshot().buildings!.find((b) => b.id === id)?.state === 'done');
  run(sim, 8000, done);
  expect(done()).toBe(true);
  for (const s of squads) sim.order({ kind: 'move', squad: s, x: 90, y: 4 + s });
  run(sim, 400);
  sim.events();
  return ids;
};

describe('M5e captives held at a fort', () => {
  it("a captive is held at the captor's nearest camp or fort", () => {
    const sim = createSim(flat(96), 6);
    const [near, far] = camps(sim, 1, [[30, 50], [30, 10]]);
    const tough = Array.from({ length: 8 }, (_, k) => makePerson(`w${k}`, 'militia')).map((p) => ({ ...p, hero: { ...p.hero, attrs: { ...p.hero.attrs, end: 15 } } }));
    const a = sim.spawnSquad('a', 0, 'x', 0, 30, 34, tough);
    const b = sim.spawnSquad('b', 1, 'royal_guard', 12, 30, 42);
    sim.order({ kind: 'attack', squad: b, target: a });
    const snapA = () => sim.snapshot().squads[a].units.filter((id) => sim.snapshot().units[id].state !== 'dead').length;
    run(sim, 3000, () => snapA() === 0);
    sim.order({ kind: 'hold', squad: b });
    run(sim, 1);
    const held = sim.endFight().persons.filter((p) => p.state === 'captive');
    expect(held.length).toBeGreaterThan(0);
    for (const p of held) expect(p.fort).toBe(near);
    expect(far).not.toBe(near);
  });

  it('a captor with no fort or camp holds them nowhere (no fort id)', () => {
    const sim = createSim(flat(), 6);
    const tough = Array.from({ length: 8 }, (_, k) => makePerson(`w${k}`, 'militia')).map((p) => ({ ...p, hero: { ...p.hero, attrs: { ...p.hero.attrs, end: 15 } } }));
    const a = sim.spawnSquad('a', 0, 'x', 0, 30, 24, tough);
    const b = sim.spawnSquad('b', 1, 'royal_guard', 12, 30, 32);
    sim.order({ kind: 'attack', squad: b, target: a });
    run(sim, 3000, () => sim.snapshot().squads[a].units.every((id) => sim.snapshot().units[id].state === 'dead'));
    sim.order({ kind: 'hold', squad: b });
    run(sim, 1);
    const held = sim.endFight().persons.filter((p) => p.state === 'captive');
    expect(held.length).toBeGreaterThan(0);
    for (const p of held) expect(p.fort).toBeUndefined();
  });
});

describe('M5e raids', () => {
  it('foe soldiers reaching an unguarded camp raid it, once per cooldown; a guarded one is not raided', () => {
    const go = (guarded: boolean) => {
      const sim = createSim(flat(96), 3);
      const [id] = camps(sim, 1, [[40, 40]]);
      if (guarded) sim.spawnSquad('g', 1, 'hoplite', 6, 40, 44);
      const r = sim.spawnSquad('r', 0, 'militia', 4, 40, 80);
      sim.order({ kind: 'move', squad: r, x: 40, y: 45 });
      run(sim, 400);
      return { id, got: raids(sim) };
    };
    expect(go(true).got).toEqual([]);
    const { id, got } = go(false);
    expect(got).toEqual([expect.objectContaining({ building: id, team: 1, by: 0, fell: false })]);
  });

  it('a holding building that falls is raided once (fell)', () => {
    const sim = createSim(flat(96), 4);
    const [id] = camps(sim, 1, [[40, 40]]);
    sim.damageBuilding(id, 1e9);
    run(sim, 30);
    expect(raids(sim)).toEqual([expect.objectContaining({ building: id, team: 1, fell: true })]);
    run(sim, 30);
    expect(raids(sim)).toEqual([]);
  });
});
