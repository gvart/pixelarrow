/** M7b town pieces of the world regions (docs/WAR.md "Pre-built structures"): real buildings, claimed by their town, intact courts. */
import { describe, expect, it } from 'vitest';
import elaia from '../../src/war/regions/elaia.json';
import achelous from '../../src/war/regions/achelous.json';
import stymphalia from '../../src/war/regions/stymphalia.json';
import { parseRegion } from '../../src/war/region/schema';
import { createSim } from '../../src/war/sim';
import { NEUTRAL_TEAM } from '../../src/war/sim/economy';
import type { BuildingSnap, RegionData } from '../../src/war/types';

const files = import.meta.glob('../../src/war/regions/*.json', { eager: true, import: 'default' });
const count = (bs: BuildingSnap[], type: string) => bs.filter((b) => b.type === type && !b.ruin).length;

describe('M7b world region towns', () => {
  it('places no town structure as a map object and needs no blocked tiles for them', () => {
    for (const [f, json] of Object.entries(files)) {
      const r = parseRegion(json);
      expect(r.objects?.some((o) => o.id.includes('/town-')), f).toBe(false);
    }
  });

  it('loads the Elaia agora with its houses, temple, stoas, well and statues as buildings, every piece placed', () => {
    const r = parseRegion(elaia);
    const sim = createSim(r, 1), bs = sim.snapshot().buildings!.filter((b) => b.pre);
    expect(bs).toHaveLength(r.prebuilt!.length);
    expect(count(bs, 'house')).toBeGreaterThanOrEqual(6);
    expect(count(bs, 'temple')).toBe(1);
    expect(count(bs, 'stoa')).toBe(2);
    expect(count(bs, 'well')).toBeGreaterThanOrEqual(1);
    expect(count(bs, 'statue')).toBe(2);
    expect(bs.every((b) => b.state === 'done')).toBe(true); // a home town is whole
  });

  it('gives a frontier town its claim point and keeps its safe court whole, neutral and its gates open', () => {
    for (const json of [achelous, stymphalia]) {
      const r = parseRegion(json) as RegionData;
      const sim = createSim(r, 2), bs = sim.snapshot().buildings!.filter((b) => b.pre);
      expect(bs).toHaveLength(r.prebuilt!.length);
      const court = r.safe![0], inCourt = (b: BuildingSnap) => b.x >= court.x - 1 && b.y >= court.y - 1 && b.x <= court.x + court.w + 1 && b.y <= court.y + court.h + 1;
      const walls = bs.filter((b) => inCourt(b) && (b.type === 'stoneWall' || b.type === 'stoneTower' || b.type === 'stoneGate'));
      expect(walls.filter((b) => b.type === 'stoneGate')).toHaveLength(2);
      expect(walls.filter((b) => b.type === 'stoneTower')).toHaveLength(4);
      for (const b of walls) expect([b.state, b.team]).toEqual(['done', NEUTRAL_TEAM]);
      // the market's pieces follow the market claim point; some of the town lies in ruins (its lore)
      expect(r.prebuilt!.filter((e) => e.type === 'temple').every((e) => e.claim !== undefined)).toBe(true);
      expect(r.prebuilt!.some((e) => e.state === 'ruined')).toBe(true);
    }
  });

  it('claims a village by its own point', () => {
    const r = parseRegion(achelous) as RegionData;
    const zones = new Set(r.prebuilt!.map((e) => e.claim));
    expect(zones.size).toBeGreaterThanOrEqual(3); // the town and two villages
  });
});
