/** M7d landmark layouts in their regions (docs/WAR.md "Landmarks"): pre-built at 60%, gates shut, guardians posted, claim gated. */
import { describe, expect, it } from 'vitest';
import { parseRegion } from '../../src/war/region/schema';
import { createSim } from '../../src/war/sim';
import { bossesOfRegion } from '../../src/data/warBosses';
import { LANDMARKS } from '../../src/data/warLandmarks';
import { MOB_TEAM } from '../../src/war/sim/mobs';
import { RARE_NODES } from '../../src/data/warLandmarks';
import type { RegionData } from '../../src/war/types';
import { SCENARIOS } from '../../src/war/scenarios';

const files = import.meta.glob('../../src/war/regions/*.json', { eager: true, import: 'default' });
const region = (id: string): RegionData => parseRegion(files[`../../src/war/regions/${id}.json`]);
const REGIONS = LANDMARKS.map((l) => l.region);

describe('M7d landmarks in their regions', () => {
  it('each of the nine stands as pre-built landmark pieces with art at 60%, its guardians posted', () => {
    expect(REGIONS).toHaveLength(9);
    for (const id of REGIONS) {
      const r = region(id);
      const pieces = r.prebuilt!.filter((e) => e.landmark);
      expect(pieces.length, id).toBeGreaterThanOrEqual(4);
      expect(pieces.every((e) => e.hp === 0.6), id).toBe(true);
      expect(pieces.filter((e) => e.art).length, id).toBeGreaterThanOrEqual(3);
      expect(r.guardians!.map((g) => g.boss).sort(), id).toEqual(bossesOfRegion(id).map((b) => b.id).sort());
    }
    const krios = region('krios');
    expect(krios.prebuilt!.some((e) => e.art === 'citadel-keep' && e.type === 'fort' && e.maxHp === 8000)).toBe(true);
    expect(krios.guardians![0].perches!.length).toBeGreaterThan(2);
    expect(region('siren').guardians![0].heads).toHaveLength(6);
    expect(region('ammon').guardians![0].postern).toBeDefined();
    expect(region('ammon').lairs!.some((l) => l.captain)).toBe(true);
    for (const id of ['krios', 'siren', 'ammon', 'delta']) expect(region(id).rim, id).toBeDefined();
    expect(region('omphalos').rim).toBeUndefined();
    // the rare nodes of the citadel, the forge and the hold
    for (const [id, node] of [['krios', 'landmark/bone-pit'], ['gorge', 'landmark/slag-heap'], ['canyons', 'landmark/glass-field'], ['saddle', 'landmark/eagle-crater']] as const) {
      expect(region(id).objects!.some((o) => o.id === node), id).toBe(true);
      expect(RARE_NODES[node]).toBeDefined();
    }
  });

  it('the citadel loads held by Drakon: every piece placed at 60%, the mobs\' with its gate shut; the claim opens once he falls', () => {
    const r = region('krios');
    const sim = createSim(r, 1);
    sim.spawnMobs();
    sim.step();
    const bs = sim.snapshot().buildings!.filter((b) => b.landmark);
    expect(bs.length).toBe(r.prebuilt!.filter((e) => e.landmark).length);
    for (const b of bs) expect(b.hp / b.maxHp).toBeCloseTo(0.6, 5);
    expect(bs.every((b) => b.team === MOB_TEAM)).toBe(true);
    expect(bs.find((b) => b.art === 'citadel-keep')!.maxHp).toBe(8000);
    const town = r.prebuilt!.find((e) => e.art === 'citadel-keep')!.claim!;
    expect(sim.snapshot().claims![town].state).toBe('locked');
    expect(sim.snapshot().bosses![0]).toMatchObject({ id: 'drakon', state: 'idle', phase: 0 });
    sim.hurtBoss('drakon', 1e9);
    sim.step();
    expect(sim.snapshot().claims![town].state).not.toBe('locked');
  });
});

describe('M7d landmark scenarios', () => {
  const play = (id: string) => {
    const sc = SCENARIOS.find((s) => s.id === id)!;
    const sim = createSim(region(sc.region!), 1);
    sim.spawnMobs();
    for (const q of sc.squads) sim.spawnSquad('you', q.team, q.cls, q.count, q.x, q.y);
    for (const o of sc.after!.orders) sim.order(o);
    return sim;
  };

  it('landmark-citadel: Drakon is squad 3 and meets the 4-squad raid at the gate', () => {
    const sim = play('landmark-citadel');
    sim.step();
    expect(sim.snapshot().bosses![0].squad).toBe(3);
    expect(sim.snapshot().squads[4].owner).toBe('you');
    for (let t = 0; t < 900 && sim.snapshot().bosses![0].hp === sim.snapshot().bosses![0].maxHp; t++) sim.step();
    expect(sim.snapshot().bosses![0].hp).toBeLessThan(sim.snapshot().bosses![0].maxHp);
  });

  it('landmark-deadcity: the King is squad 7 and the raid fights the host', () => {
    const sim = play('landmark-deadcity');
    sim.step();
    expect(sim.snapshot().bosses![0]).toMatchObject({ id: 'bandit_king', squad: 7 });
    let falls = 0;
    for (let t = 0; t < 900 && falls === 0; t++) {
      sim.step();
      falls += sim.events().filter((e) => e.kind === 'fall').length;
    }
    expect(falls).toBeGreaterThan(0);
  });
});
