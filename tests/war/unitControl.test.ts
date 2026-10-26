import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import type { WarSim } from '../../src/war/types';
import { flat } from './flatRegion';

// W-53 unit control (docs/WAR.md "Unit control"): orders to any set of a player's men, seeded on open ground.

const run = (sim: WarSim, n: number, until?: () => boolean) => {
  for (let t = 0; t < n; t++) {
    sim.step();
    if (until?.()) return t + 1;
  }
  return n;
};
const men = (sim: WarSim, ids: number[]) => sim.snapshot().units.filter((u) => ids.includes(u.id));
const squadOf = (sim: WarSim, id: number) => sim.snapshot().units[id].squad;
const at = (sim: WarSim, ids: number[], x: number, y: number, r: number) => men(sim, ids).every((u) => Math.hypot(u.x - x, u.y - y) < r);
const idle = (sim: WarSim, ids: number[]) => men(sim, ids).every((u) => u.state === 'idle');
const idsOf = (sim: WarSim, squad: number) => sim.snapshot().squads[squad].units.filter((id) => sim.snapshot().units[id].state !== 'dead');

describe('W-53 orders to any set of men', () => {
  it('two groups of one squad ordered apart march as two formations to their marks', () => {
    const sim = createSim(flat(64), 3);
    const s = sim.spawnSquad('a', 0, 'militia', 12, 20, 32);
    run(sim, 5);
    const all = idsOf(sim, s), g1 = all.slice(0, 6), g2 = all.slice(6);
    sim.order({ kind: 'move', squad: s, units: g1, x: 46, y: 14 });
    sim.order({ kind: 'move', squad: s, units: g2, x: 46, y: 50 });
    sim.step();
    expect(new Set(g1.map((id) => squadOf(sim, id))).size).toBe(1);
    expect(new Set(g2.map((id) => squadOf(sim, id))).size).toBe(1);
    expect(squadOf(sim, g1[0])).not.toBe(squadOf(sim, g2[0]));
    const t = run(sim, 900, () => idle(sim, all) && at(sim, g1, 46, 14, 4) && at(sim, g2, 46, 50, 4));
    expect(t).toBeLessThan(700);
    expect(at(sim, g1, 46, 14, 4)).toBe(true);
    expect(at(sim, g2, 46, 50, 4)).toBe(true);
  });

  it('a single man detached by his id walks alone; the rest keep their order', () => {
    const sim = createSim(flat(64), 4);
    const s = sim.spawnSquad('a', 0, 'archer', 8, 16, 16);
    run(sim, 5);
    const all = idsOf(sim, s), lone = all[3], rest = all.filter((id) => id !== lone);
    sim.order({ kind: 'move', squad: s, x: 48, y: 16 });
    run(sim, 20);
    sim.order({ kind: 'move', squad: s, units: [lone], x: 16, y: 48 });
    sim.step();
    const q = squadOf(sim, lone);
    expect(q).not.toBe(s);
    expect(idsOf(sim, q)).toEqual([lone]);
    expect(idsOf(sim, s).sort()).toEqual([...rest].sort());
    expect(sim.snapshot().squads[s].order).toBe('move');
    run(sim, 900, () => idle(sim, all));
    expect(at(sim, [lone], 16, 48, 0.6)).toBe(true);
    expect(at(sim, rest, 48, 16, 4)).toBe(true);
  });

  it('groups ordered together re-merge into one squad that takes in the rest (the whole one keeps its id)', () => {
    const sim = createSim(flat(64), 5);
    const a = sim.spawnSquad('a', 0, 'militia', 6, 16, 20);
    const b = sim.spawnSquad('a', 0, 'archer', 6, 16, 44);
    run(sim, 5);
    const ga = idsOf(sim, a), gb = idsOf(sim, b);
    // one man of a goes his own way, then all twelve get one order
    sim.order({ kind: 'move', squad: a, units: [ga[0]], x: 40, y: 32 });
    run(sim, 30);
    sim.order({ kind: 'move', squad: b, units: [...gb, ...ga], x: 48, y: 32 });
    sim.step();
    const q = squadOf(sim, gb[0]);
    expect(q).toBe(b); // b was given whole and is the biggest whole squad
    expect(idsOf(sim, q).sort()).toEqual([...ga, ...gb].sort());
    run(sim, 900, () => idle(sim, [...ga, ...gb]));
    expect(at(sim, [...ga, ...gb], 48, 32, 5)).toBe(true);
  });

  it('ignores men of another owner or team, and fallen or unknown ids', () => {
    const sim = createSim(flat(64), 6);
    const mine = sim.spawnSquad('a', 0, 'militia', 4, 16, 16);
    const ally = sim.spawnSquad('b', 0, 'militia', 4, 16, 30);
    const foe = sim.spawnSquad('c', 1, 'militia', 4, 50, 50);
    run(sim, 5);
    const theirs = [...idsOf(sim, ally), ...idsOf(sim, foe)];
    const before = men(sim, theirs).map((u) => [u.id, u.squad, u.x, u.y]);
    sim.order({ kind: 'move', squad: mine, units: [...theirs, 999], x: 40, y: 16 });
    run(sim, 30);
    for (const [id, sq, x, y] of before) {
      const u = sim.snapshot().units[id as number];
      expect(u.squad).toBe(sq);
      expect(Math.hypot(u.x - (x as number), u.y - (y as number))).toBeLessThan(0.5);
    }
    expect(sim.snapshot().squads[mine].order).toBe('hold'); // none of the named men was his: no order
  });

  it('regrouping reuses emptied squads, so the squad list stays short', () => {
    const sim = createSim(flat(64), 7);
    const s = sim.spawnSquad('a', 0, 'militia', 12, 20, 32);
    run(sim, 5);
    const all = idsOf(sim, s);
    for (let i = 0; i < 40; i++) {
      const pick = all.filter((_, k) => (k + i) % 3 === 0);
      sim.order({ kind: 'hold', squad: squadOf(sim, pick[0]), units: pick });
      sim.step();
      sim.order({ kind: 'hold', squad: squadOf(sim, all[0]), units: all });
      sim.step();
    }
    expect(sim.snapshot().squads.length).toBeLessThanOrEqual(3);
    expect(new Set(all.map((id) => squadOf(sim, id))).size).toBe(1);
  });

  it('soldiers and civilians named together go as two squads; a layout order goes once', () => {
    const sim = createSim(flat(64), 8);
    sim.claim(0, 20, 20, 30);
    sim.addStock(0, 'wood', 500);
    const sol = sim.spawnSquad('a', 0, 'militia', 4, 20, 26);
    const civ = sim.spawnSquad('a', 0, 'civ_forager', 2, 22, 26);
    run(sim, 5);
    expect(sim.snapshot().squads[civ].civ).toBe(true);
    const ids = [...idsOf(sim, sol), ...idsOf(sim, civ)];
    sim.order({ kind: 'placeBuilding', squad: sol, units: ids, type: 'camp', x: 26, y: 20 });
    sim.step();
    expect(squadOf(sim, ids[0])).toBe(sol);
    expect(squadOf(sim, ids[4])).toBe(civ);
    expect(sim.snapshot().buildings?.filter((b) => b.type === 'camp')).toHaveLength(1);
  });
});
