/** M7c depth and guardians (docs/WAR.md "Region lore and depth"): the depth table, scaling, claim channel, host, boss gate. */
import { describe, expect, it } from 'vitest';
import { bossesOfRegion, WAR_BOSSES } from '../../src/data/warBosses';
import { createSim } from '../../src/war/sim';
import { DEPTH, depthOf, HOST, REGION_DEPTH } from '../../src/war/sim/depth';
import { NEUTRAL_TEAM } from '../../src/war/sim/economy';
import { MOB_TEAM, MOBS } from '../../src/war/sim/mobs';
import { WORLD_REGIONS } from '../../src/war/world/regions';
import type { RegionData, WarBuildSim } from '../../src/war/types';

function flat(lairs: RegionData['lairs'], claimPoints: RegionData['claimPoints'] = [], extra: Partial<RegionData> = {}, n = 96): RegionData {
  return {
    id: 't', name: 't', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0),
    entries: [], noBuild: [], objects: [{ id: 'oak', x: 80.5, y: 10.5 }], lairs, claimPoints, ...extra,
  };
}
function run(sim: WarBuildSim, ticks: number, until?: () => boolean): number {
  for (let t = 0; t < ticks; t++) {
    sim.step();
    if (until?.()) return t + 1;
  }
  return ticks;
}
const lair = (sim: WarBuildSim, i = 0) => sim.snapshot().lairs![i];
const claim = (sim: WarBuildSim, i = 0) => sim.snapshot().claims![i];
const men = (sim: WarBuildSim, squad: number) => {
  const s = sim.snapshot();
  return s.squads[squad].units.map((id) => s.units[id]);
};
/** Squads of hoplites (12 each) kill lair i to the last mob. */
function clear(sim: WarBuildSim, i = 0, team = 0, squads = 1, owner = 'you'): number[] {
  const l = lair(sim, i), out: number[] = [];
  for (let k = 0; k < squads; k++) {
    const s = sim.spawnSquad(`${owner}${k}`, team, 'hoplite', 12, l.x + 9, l.y + k * 3);
    sim.order({ kind: 'attack', squad: s, target: l.squad });
    out.push(s);
  }
  run(sim, 4000, () => lair(sim, i).state === 'cleared');
  expect(lair(sim, i).state).toBe('cleared');
  return out;
}

describe('M7c depth table', () => {
  it('every world region has its depth (homes 0, entries 1, rim and Omphalos 4)', () => {
    for (const r of WORLD_REGIONS) {
      expect(REGION_DEPTH[r.id], r.id).toBeDefined();
      if (r.role === 'home') expect(REGION_DEPTH[r.id]).toBe(0);
      if (r.role === 'entry') expect(REGION_DEPTH[r.id]).toBe(1);
    }
    for (const id of ['krios', 'siren', 'ammon', 'delta', 'omphalos']) expect(REGION_DEPTH[id]).toBe(4);
    expect(depthOf({ id: 't' })).toBe(1);
    expect(depthOf({ id: 'krios', depth: 2 })).toBe(2);
  });

  it('boss tiers are depth - 1 (Omphalos 3); the signature legendaries stay on the rim', () => {
    for (const b of WAR_BOSSES) {
      expect(b.tier, b.id).toBe(b.region === 'omphalos' ? 3 : REGION_DEPTH[b.region] - 1);
      if (b.signature.length) expect(REGION_DEPTH[b.region]).toBe(4);
    }
    expect(WAR_BOSSES.find((b) => b.id === 'savanna_lion')!.tier).toBe(1);
    expect(WAR_BOSSES.find((b) => b.id === 'griffin')!.tier).toBe(1);
    expect(WAR_BOSSES.find((b) => b.signature.includes('alexander'))).toMatchObject({ id: 'bandit_king', region: 'ammon' });
    expect(WAR_BOSSES.find((b) => b.signature.includes('aegis_of_zeus'))).toMatchObject({ id: 'drakon', region: 'krios' });
    expect(bossesOfRegion('omphalos').map((b) => b.id)).toEqual(['titan', 'minotaur']);
  });
});

describe('M7c scaling', () => {
  it('mob hp and damage scale with depth', () => {
    const at = (depth: number) => {
      const sim = createSim(flat([{ kind: 'wolf', x: 20.5, y: 20.5 }], [], { depth }), 1);
      sim.spawnMobs();
      return men(sim, lair(sim).squad)[0].maxHp;
    };
    expect(at(3) / at(1)).toBeCloseTo(DEPTH[3].mob);
    expect(at(4) / at(1)).toBeCloseTo(DEPTH[4].mob);
  });

  it('node yield scales with depth', () => {
    const max = (depth: number) => createSim(flat([], [], { depth }), 1).resourceNodes()[0].max;
    expect(max(2) / max(1)).toBeCloseTo(DEPTH[2].yield);
  });

  it('a cleared lair at depth 2 stays clear its depth time', () => {
    const sim = createSim(flat([{ kind: 'jackal', x: 20.5, y: 20.5 }], [], { depth: 2 }), 2);
    sim.spawnMobs();
    clear(sim);
    expect(lair(sim).respawnIn).toBeGreaterThan(DEPTH[2].respawn - 20);
    expect(lair(sim).respawnIn).toBeLessThanOrEqual(DEPTH[2].respawn);
  });
});

describe('M7c claim channel', () => {
  it('at depth 3 men of one player are refused; with a second player the channel runs its depth time', () => {
    const sim = createSim(flat([], [{ x: 40.5, y: 40.5, lairs: [], r: 15 }], { depth: 3 }), 3);
    sim.spawnMobs();
    expect(claim(sim)).toMatchObject({ men: 9, players: 2 });
    const a = sim.spawnSquad('a', 0, 'militia', 12, 44, 44);
    sim.order({ kind: 'claimRegion', squad: a, point: 0 });
    run(sim, DEPTH[3].claim.ticks + 300);
    expect(claim(sim).state).not.toBe('claimed');
    expect(claim(sim).progress).toBe(0);
    const b = sim.spawnSquad('b', 0, 'militia', 4, 36, 36);
    sim.order({ kind: 'claimRegion', squad: b, point: 0 });
    const t = run(sim, DEPTH[3].claim.ticks + 300, () => claim(sim).state === 'claimed');
    expect(claim(sim)).toMatchObject({ state: 'claimed', team: 0 });
    expect(t).toBeGreaterThanOrEqual(DEPTH[3].claim.ticks);
  });

  it('a boss (M7d stub) holds the region and keeps the claim shut until it falls', () => {
    const sim = createSim(flat([], [{ x: 40.5, y: 40.5, lairs: [], r: 15 }], { prebuilt: [{ type: 'house', x: 40, y: 34 }] }), 4);
    sim.setBoss('moor_bear');
    expect(sim.snapshot().buildings![0].team).toBe(MOB_TEAM);
    expect(claim(sim).state).toBe('locked');
    sim.bossDown();
    expect(claim(sim).state).toBe('open');
    expect(sim.snapshot().buildings![0].team).toBe(NEUTRAL_TEAM);
  });
});

describe('M7c bandit host', () => {
  const host = () =>
    flat(
      [{ kind: 'bandit', x: 40.5, y: 40.5, captain: true }, { kind: 'bandit', x: 30.5, y: 30.5 }],
      [{ x: 44.5, y: 44.5, lairs: [0, 1], r: 20 }],
      { prebuilt: [{ type: 'stoneTower', x: 34, y: 34 }, { type: 'stoneGate', x: 0, y: 0, tiles: [50, 40, 51, 40] }, { type: 'house', x: 46, y: 36 }] },
    );

  it('holds the town while its captain lives: pieces the mobs\', a lair on the tower, a captain at x3 hp', () => {
    const sim = createSim(host(), 5);
    expect(sim.snapshot().buildings![0].team).toBe(NEUTRAL_TEAM);
    sim.spawnMobs();
    const s = sim.snapshot();
    for (const b of s.buildings!) expect(b.team).toBe(MOB_TEAM);
    expect(lair(sim, 0)).toMatchObject({ captain: true, count: 12 });
    expect(lair(sim, 1)).toMatchObject({ x: 34, y: 34 }); // posted on the tower
    const [cap, guard] = men(sim, lair(sim, 0).squad);
    const plain = men(sim, lair(sim, 1).squad)[0];
    expect(guard.maxHp / plain.maxHp).toBeCloseTo(HOST.guard.hp);
    expect(cap.maxHp / guard.maxHp).toBeCloseTo(HOST.captain.hp);
    run(sim, 400);
    expect(men(sim, lair(sim, 1).squad).some((u) => u.on === 0)).toBe(true);
  });

  it('its claim opens once the captain falls (event), and the town goes neutral', () => {
    const sim = createSim(host(), 6);
    sim.spawnMobs();
    expect(claim(sim).state).toBe('locked');
    clear(sim, 0, 0, 3);
    const ev = sim.events().find((e) => e.kind === 'captainSlain');
    expect(ev).toMatchObject({ kind: 'captainSlain', lair: 0 });
    expect(lair(sim, 0).captain).toBe(false);
    expect(lair(sim, 1).state).not.toBe('cleared'); // the tower lair still stands
    expect(['open', 'channel', 'contested']).toContain(claim(sim).state);
    expect(sim.snapshot().buildings![2].team).toBe(NEUTRAL_TEAM);
  });

  it('sends a raid party at a foe cart in reach', () => {
    const sim = createSim(host(), 7);
    sim.spawnMobs();
    const cart = sim.spawnCart(0, 'c', 'handcart', 70, 70);
    run(sim, HOST.raid.every + 5);
    const l = lair(sim, 1);
    expect(sim.snapshot().squads[l.squad].order).toBe('attackBuilding');
    run(sim, 800);
    const e = sim.snapshot().sieges!.find((x) => x.id === cart)!;
    expect(e.hp).toBeLessThan(e.maxHp);
  });

  it('is deterministic and round-trips mid-fight', () => {
    const a = createSim(host(), 8);
    a.spawnMobs();
    const s = a.spawnSquad('x', 0, 'hoplite', 12, 50, 50);
    a.order({ kind: 'attack', squad: s, target: lair(a, 0).squad });
    run(a, 150);
    const b = createSim(host(), 8);
    b.importState(JSON.parse(JSON.stringify(a.exportState())));
    run(a, 300);
    run(b, 300);
    expect(b.snapshot()).toEqual(a.snapshot());
  });
});

describe('M7c mob defs', () => {
  it('bandits stay men with weapons', () => expect(MOBS.bandit.base).toBe('celt_sword'));
});
