/**
 * world-fill density (scripts/war/regions/fill.ts over every generated region): lairs within the depth table (homes 2-4
 * weak half packs of wolves, boars or jackals, far from the town), 1-2 named chiefs past the homes (known ids, no name
 * twice in a region), and a living region keeps its step time well inside the sim budget with its wild and roaming life.
 */
import { describe, expect, it } from 'vitest';
import { WORLD_REGIONS } from '../../src/war/regions/index';
import { parseRegion } from '../../src/war/region/schema';
import { DEPTH, depthOf } from '../../src/war/sim/depth';
import { warChief } from '../../src/data/warWild';
import { createSim } from '../../src/war/sim';
import type { RegionData } from '../../src/war/types';

const files = import.meta.glob('../../src/war/regions/*.json', { eager: true, import: 'default' });
const load = (id: string): RegionData => parseRegion(files[`../../src/war/regions/${id}.json`]);

describe('world-fill', () => {
  it('every region: lairs within its depth range, chiefs 1 (entries) or 2 (deeper), none at home', () => {
    for (const r of WORLD_REGIONS) {
      const g = load(r.id), d = depthOf(g), lairs = g.lairs ?? [];
      const plain = lairs.filter((l) => !l.chief), chiefs = lairs.filter((l) => l.chief);
      const [lo, hi] = DEPTH[d].lairs;
      expect(plain.length, r.id).toBeGreaterThanOrEqual(lo);
      // authored hosts and set pieces may exceed the table; the fill never adds past it
      if (r.role !== 'home') expect(chiefs.length, r.id).toBe(d <= 1 ? 1 : 2);
      else {
        expect(chiefs, r.id).toHaveLength(0);
        expect(plain.length, r.id).toBeLessThanOrEqual(hi);
        expect(plain.every((l) => ['wolf', 'boar', 'jackal'].includes(l.kind) && (l.count ?? 9) <= 3), r.id).toBe(true);
      }
      for (const c of chiefs) expect(warChief(c.chief!)?.kind, `${r.id} ${c.chief}`).toBe(c.kind);
      expect(new Set(chiefs.map((c) => c.chief)).size, r.id).toBe(chiefs.length);
    }
  });

  it('home lairs stand on the outskirts: 60+ tiles from the town court', () => {
    for (const r of WORLD_REGIONS.filter((x) => x.role === 'home')) {
      const g = load(r.id), court = g.safe?.[0];
      if (!court) continue;
      const cx = court.x + court.w / 2, cy = court.y + court.h / 2;
      for (const l of g.lairs ?? []) expect(Math.hypot(l.x - cx, l.y - cy), r.id).toBeGreaterThan(60);
    }
  });

  it('a living rim region with a player in it steps well within the budget (seeded)', () => {
    const g = load('krios'), sim = createSim(g, 11);
    sim.spawnMobs();
    sim.spawnRoam();
    const e = g.entries[0];
    sim.spawnSquad('p:1', 0, 'hoplite', 12, e.x + e.w / 2, e.y + e.h / 2);
    let total = 0;
    for (let t = 0; t < 600; t++) (sim.step(), (total += sim.stats().stepMs));
    expect(total / 600).toBeLessThan(8);
    expect((sim.snapshot().roam ?? []).filter((x) => x.kind === 'pack').length).toBeGreaterThanOrEqual(4);
  });
});
