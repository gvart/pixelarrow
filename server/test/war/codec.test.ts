import { describe, expect, it } from 'vitest';
import { DeltaDecoder, DeltaEncoder, type FrameInput } from '../../../src/war/net/codec';
import { QUANT } from '../../../src/war/net/protocol';
import { createSim } from '../../../src/war/sim';
import { makePerson } from '../../../src/war/sim/roster';
import type { BuildingSnap, Snapshot, UnitSnap, WarPerson } from '../../../src/war/types';
import { warRegion } from '../../src/war/regions';

const region = warRegion('test-ridge')!;
const q = (v: number) => Math.round(v * QUANT) / QUANT;

/** What the client should hold after decoding: the snapshot with quantised positions, hp and facing. */
function expected(u: UnitSnap) {
  const turns = Math.round((((u.facing % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * 256) & 255;
  return { id: u.id, squad: u.squad, x: q(u.x), y: q(u.y), hp: Math.round(u.hp * 10) / 10, state: u.state, cls: u.cls, turns };
}
function got(u: UnitSnap) {
  const turns = Math.round(((u.facing + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * 256) & 255;
  return { id: u.id, squad: u.squad, x: u.x, y: u.y, hp: u.hp, state: u.state, cls: u.cls, turns };
}
const frame = (s: Snapshot, shots = s.shots ?? []): FrameInput => ({ tick: s.tick, units: s.units, squads: s.squads, shots, buildings: s.buildings ?? [] });

describe('war delta codec', () => {
  it('round-trips a running battle through keyframes and deltas', () => {
    const sim = createSim(region, 3);
    const a = sim.spawnSquad('p:1', 0, 'hoplite', 20, 420, 250);
    const b = sim.spawnSquad('p:2', 1, 'archer', 20, 432, 252);
    sim.order({ kind: 'attack', squad: a, target: b });
    sim.order({ kind: 'attack', squad: b, target: a });
    const enc = new DeltaEncoder(), dec = new DeltaDecoder();
    let last = -1, deltaBytes = 0, keyBytes = 0, shots = 0;
    for (let t = 0; t < 120; t++) {
      sim.step();
      const s = sim.snapshot(), key = t % 50 === 0;
      const fresh = (s.shots ?? []).filter((x) => key || x.t0 > last);
      shots += fresh.length;
      const buf = enc.encode(frame(s, fresh), key);
      if (key) keyBytes = buf.length; else deltaBytes += buf.length;
      const out = dec.apply(buf);
      last = s.tick;
      expect(out.tick).toBe(s.tick);
      expect(out.units.map(got)).toEqual(s.units.map(expected));
      expect(out.squads.map((x) => [x.id, x.owner, x.team, x.order, x.units.length])).toEqual(s.squads.map((x) => [x.id, x.owner, x.team, x.order, x.units.length]));
      // dead units say wounded or killed
      for (const u of out.units) if (u.state === 'dead') expect(typeof u.wounded).toBe('boolean');
    }
    expect(shots).toBeGreaterThan(0);
    // a delta is far smaller than a keyframe of 40 units
    expect(deltaBytes / 118).toBeLessThan(keyBytes);
  });

  it('carries person id and level, and the squad active as a countdown', () => {
    const sim = createSim(region, 3);
    const men = Array.from({ length: 6 }, (_, i) => makePerson(`m${i}`, 'hoplite', { level: 7 - i }));
    men[0] = { ...men[0], skills: ['shieldWall'] as WarPerson['skills'] };
    const a = sim.spawnSquad('p:1', 0, 'hoplite', 6, 420, 250, men);
    sim.spawnSquad('p:2', 1, 'archer', 4, 432, 252);
    const enc = new DeltaEncoder(), dec = new DeltaDecoder();
    sim.step();
    let out = dec.apply(enc.encode(frame(sim.snapshot()), true));
    expect(out.units.filter((u) => u.squad === a).map((u) => [u.pid, u.level])).toEqual(men.map((p) => [p.id, p.hero.level]));
    expect(out.units.find((u) => u.squad !== a)!.pid).toBeUndefined();
    const s0 = sim.snapshot().squads[a];
    expect(out.squads[a].active).toEqual(s0.active);
    sim.order({ kind: 'active', squad: a });
    for (let t = 0; t < 30; t++) {
      sim.step();
      out = dec.apply(enc.encode(frame(sim.snapshot()), false));
      expect(out.squads[a].active).toEqual(sim.snapshot().squads[a].active);
    }
    expect(out.squads[a].active!.ready).toBeGreaterThan(0);
  });

  it('removes units that leave the view and sends nothing for idle ones', () => {
    const sim = createSim(region, 1);
    sim.spawnSquad('p:1', 0, 'militia', 10, 420, 250);
    for (let t = 0; t < 40; t++) sim.step(); // settle into formation
    const s = sim.snapshot(), enc = new DeltaEncoder(), dec = new DeltaDecoder();
    dec.apply(enc.encode(frame(s), true));
    expect(dec.units.size).toBe(10);
    const idle = enc.encode(frame(s), false);
    // header 6 + 4-byte unit count + 4 empty sections
    expect(idle.length).toBe(14);
    dec.apply(enc.encode({ ...frame(s), units: s.units.slice(0, 4) }, false));
    expect([...dec.units.keys()]).toEqual([0, 1, 2, 3]);
  });

  it('carries buildings as changed records', () => {
    const enc = new DeltaEncoder(), dec = new DeltaDecoder();
    const b = { id: 5, type: 'camp', team: 0, x: 10, y: 10, w: 3, h: 3, rot: 0, tiles: [], state: 'foundation', progress: 0, delivered: 0, hp: 10, maxHp: 100, workers: 0, maxWorkers: 4 } satisfies BuildingSnap as BuildingSnap;
    const base = { tick: 1, units: [], squads: [], shots: [] };
    dec.apply(enc.encode({ ...base, buildings: [b] }, true));
    expect(dec.buildings.get(5)?.state).toBe('foundation');
    expect(enc.encode({ ...base, buildings: [b] }, false).length).toBe(14);
    dec.apply(enc.encode({ ...base, buildings: [{ ...b, state: 'scaffold' }] }, false));
    expect(dec.buildings.get(5)?.state).toBe('scaffold');
    dec.apply(enc.encode({ ...base, buildings: [] }, false));
    expect(dec.buildings.size).toBe(0);
  });
});
