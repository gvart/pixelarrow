/**
 * world-fill local mini-bosses (src/data/warBosses.ts WAR_CHIEFS, src/war/sim/mobs.ts): a lair led by a named chief
 * spawns him and his escort, he is stronger than his kind's man, his name and look ride on the lair's snapshot, his
 * death drops a loot pile and a `chiefSlain` event, and his lair stays clear for chiefRespawn (30-60 min), not 10 min.
 */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { CHIEF_KINDS, chiefLoot, chiefRespawn, chiefsOfKind, WAR_CHIEFS, warChief } from '../../src/data/warBosses';
import { MOBS, RESPAWN } from '../../src/war/sim/mobs';
import { makePerson } from '../../src/war/sim/roster';
import { ARMY_MAX } from '../../src/war/sim/soldiers';
import type { RegionData, WarBuildSim, WarEvent } from '../../src/war/types';

function flat(lairs: RegionData['lairs'], n = 96): RegionData {
  return {
    id: 't', name: 't', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0),
    entries: [], noBuild: [], objects: [], lairs, claimPoints: [],
  };
}
const run = (sim: WarBuildSim, ticks: number, until?: () => boolean) => {
  for (let t = 0; t < ticks; t++) {
    sim.step();
    if (until?.()) return t + 1;
  }
  return ticks;
};

describe('chiefs', () => {
  it('every chief has a kind with a row in CHIEF_KINDS and a MOBS kind; ids are unique; each fighting kind has 3+', () => {
    expect(new Set(WAR_CHIEFS.map((c) => c.id)).size).toBe(WAR_CHIEFS.length);
    for (const c of WAR_CHIEFS) {
      expect(CHIEF_KINDS[c.kind], c.id).toBeDefined();
      expect(MOBS[c.kind as keyof typeof MOBS], c.id).toBeDefined();
    }
    for (const k of Object.keys(MOBS)) if (!MOBS[k as keyof typeof MOBS].passive) expect(chiefsOfKind(k).length, k).toBeGreaterThanOrEqual(3);
  });

  it('respawns in 30-60 min by depth, and loot is modest and seeded', () => {
    expect(chiefRespawn(1)).toBeGreaterThanOrEqual(18000);
    expect(chiefRespawn(4)).toBe(36000);
    expect(chiefRespawn(0)).toBeGreaterThan(RESPAWN * 2);
    const a = chiefLoot('greymaw', 1, 'k'), b = chiefLoot('greymaw', 1, 'k');
    expect(a).toEqual(b);
    expect(a.goods.coin).toBeGreaterThan(0);
    expect(a.goods.coin).toBeLessThanOrEqual(30);
    expect(chiefLoot('greymaw', 4, 'k').goods.coin).toBeGreaterThan(a.goods.coin);
  });

  it('a chief lair: him and his escort, stronger than his kind, named on the snapshot', () => {
    const sim = createSim(flat([{ kind: 'wolf', x: 40.5, y: 40.5, chief: 'greymaw' }]), 3);
    sim.spawnMobs();
    const s = sim.snapshot(), l = s.lairs![0], q = s.squads[l.squad];
    expect(q.units).toHaveLength(CHIEF_KINDS.wolf.escort + 1);
    expect(l.chief).toMatchObject({ id: 'greymaw', name: 'Old Greymaw', alive: true, unit: q.units[0] });
    const men = s.units.filter((u) => q.units.includes(u.id));
    expect(men[0].maxHp).toBeCloseTo(men[1].maxHp * CHIEF_KINDS.wolf.hp, 3);
  });

  it('a solo army (12 men, level 2) kills him; his death drops a pile and a chiefSlain event; the lair stays clear past a plain lair respawn', () => {
    const sim = createSim(flat([{ kind: 'boar', x: 40.5, y: 40.5, chief: 'tuskmother' }]), 3);
    const evs: WarEvent[] = [];
    sim.spawnMobs();
    const l = sim.snapshot().lairs![0];
    const me = sim.spawnSquad('you', 0, 'hoplite', ARMY_MAX, l.x + 8, l.y, Array.from({ length: ARMY_MAX }, (_, k) => makePerson(`p${k}`, 'hoplite', { level: 2 })));
    sim.order({ kind: 'attack', squad: me, target: l.squad });
    run(sim, 4000, () => (evs.push(...sim.events()), sim.snapshot().lairs![0].state === 'cleared'));
    const after = sim.snapshot();
    expect(after.lairs![0].state).toBe('cleared');
    expect(after.lairs![0].chief?.alive).toBe(false);
    const slain = evs.find((e) => e.kind === 'chiefSlain');
    expect(slain).toMatchObject({ chief: 'tuskmother', name: warChief('tuskmother')!.name });
    expect((after.piles ?? []).length).toBeGreaterThan(0);
    // walk away, wait out a plain lair's respawn: still clear
    sim.order({ kind: 'move', squad: me, x: 90, y: 90 });
    run(sim, RESPAWN + 400);
    expect(sim.snapshot().lairs![0].state).toBe('cleared');
    expect(sim.snapshot().lairs![0].respawnIn).toBeGreaterThan(0);
  });

  it('addLair with a chief (a hidden quest\'s end) leads it, never comes back', () => {
    const sim = createSim(flat([]), 3);
    const id = sim.addLair({ kind: 'bandit', x: 40.5, y: 40.5, chief: 'one_ear' });
    const s = sim.snapshot(), l = s.lairs![id];
    expect(l.chief?.name).toBe('One-Ear Nikon');
    expect(s.units.find((u) => u.id === l.chief!.unit)?.cls).toBe('mob_bandit_captain');
  });
});
