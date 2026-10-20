/** M6d safe zones (docs/WAR.md "Trade towns", "Safe-zone rule"): schema, no combat inside, tag, cap, walk-out, no building. */
import kleisoura from '../../src/war/regions/kleisoura.json';
import stymphalia from '../../src/war/regions/stymphalia.json';
import achelous from '../../src/war/regions/achelous.json';
import ammos from '../../src/war/regions/ammos.json';
import { describe, expect, it } from 'vitest';
import { parseRegion } from '../../src/war/region/schema';
import { TRADE_ZONES } from '../../src/war/region/zones';
import { createSim } from '../../src/war/sim';
import { SAFE } from '../../src/war/sim/trade';
import type { RegionData, WarBuildSim } from '../../src/war/types';
import { flat } from './flatRegion';

const run = (sim: WarBuildSim, n: number) => {
  for (let t = 0; t < n; t++) sim.step();
};
const zone = { x: 20, y: 20, w: 16, h: 16 };
const town = (): RegionData => ({ ...flat(64), safe: [{ ...zone, gates: [{ x: 27, y: 20, w: 2, h: 1 }] }], yard: [{ x: 24, y: 44, w: 8, h: 5 }] });
const inside = (x: number, y: number) => x >= zone.x && y >= zone.y && x < zone.x + zone.w && y < zone.y + zone.h;
const men = (sim: WarBuildSim, squad: number) => {
  const snap = sim.snapshot();
  return snap.squads[squad].units.map((id) => snap.units[id]);
};

describe('M6d schema', () => {
  it('accepts old regions, takes safe, yard and ambush rects, rejects one outside the map', () => {
    expect(parseRegion(flat(16)).safe).toBeUndefined();
    const r = parseRegion({ ...flat(16), safe: [{ x: 2, y: 2, w: 4, h: 4, gates: [{ x: 3, y: 2, w: 2, h: 1 }] }], yard: [{ x: 2, y: 8, w: 3, h: 3 }], ambush: [{ x: 10, y: 10, w: 2, h: 2 }] });
    expect(r.safe?.[0].gates).toHaveLength(1);
    expect(() => parseRegion({ ...flat(16), ambush: [{ x: 14, y: 14, w: 4, h: 4 }] })).toThrow();
  });
  it('the four frontier towns get their court, gates, yards and ambush spots', () => {
    for (const [id, json] of Object.entries({ kleisoura, stymphalia, achelous, ammos })) {
      const r = parseRegion(json);
      expect(r.safe).toEqual(TRADE_ZONES[id].safe);
      expect(r.safe![0].gates).toHaveLength(2);
      expect(r.yard).toHaveLength(2);
      expect(r.ambush!.length).toBeGreaterThan(0);
      // the claim banner stands outside the court
      for (const c of r.claimPoints ?? []) expect(c.x >= r.safe![0].x && c.x < r.safe![0].x + r.safe![0].w && c.y >= r.safe![0].y && c.y < r.safe![0].y + r.safe![0].h).toBe(false);
    }
  });
});

describe('M6d rules', () => {
  it('an attack order on a squad inside is refused; foes outside cannot hurt the men inside', () => {
    const sim = createSim(town(), 1);
    const a = sim.spawnSquad('a', 0, 'militia', 4, 28, 28);
    const f = sim.spawnSquad('f', 1, 'archer', 12, 28, 42);
    sim.order({ kind: 'attack', squad: f, target: a });
    run(sim, 1);
    expect(sim.snapshot().squads[f].order).toBe('hold');
    run(sim, 600);
    for (const u of men(sim, a)) expect(u.hp).toBe(u.maxHp);
  });

  it('no building inside', () => {
    const sim = createSim(town(), 2);
    sim.claim(0, 28, 28, 30);
    expect(sim.checkPlacement(0, 'storehouse', 28, 28)).toMatchObject({ ok: false, reason: 'noBuild' });
    expect(sim.checkPlacement(0, 'storehouse', 28, 50).ok).toBe(true);
  });

  it('a man hit in the last 20 s is refused at the gate; at most SAFE.units of a player inside', () => {
    const sim = createSim(town(), 3);
    const a = sim.spawnSquad('a', 0, 'militia', 12, 28, 46);
    const b = sim.spawnSquad('b', 1, 'militia', 2, 28, 50);
    sim.order({ kind: 'attack', squad: b, target: a });
    run(sim, 60); // they trade blows
    sim.order({ kind: 'move', squad: b, x: 60, y: 60 });
    sim.order({ kind: 'move', squad: a, x: 28, y: 28 });
    run(sim, 100);
    expect(men(sim, a).filter((u) => u.state !== 'dead' && inside(u.x, u.y))).toHaveLength(0); // tagged
    run(sim, SAFE.tag + 300);
    sim.order({ kind: 'move', squad: a, x: 28, y: 28 });
    run(sim, 400);
    const n = men(sim, a).filter((u) => u.state !== 'dead' && inside(u.x, u.y)).length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(SAFE.units);
  });

  it('a fighter inside 15 min is walked out to the yard; logout walks all of a player out', () => {
    const sim = createSim(town(), 4);
    const a = sim.spawnSquad('a', 0, 'militia', 4, 28, 28);
    run(sim, SAFE.fighter + 400);
    expect(men(sim, a).filter((u) => inside(u.x, u.y))).toHaveLength(0);
    const c = sim.spawnSquad('c', 0, 'civ_cook', 2, 26, 26);
    run(sim, 20);
    expect(men(sim, c).every((u) => inside(u.x, u.y))).toBe(true); // civilians stay
    sim.walkOut('c');
    run(sim, 400);
    expect(men(sim, c).filter((u) => inside(u.x, u.y))).toHaveLength(0);
  });
});
