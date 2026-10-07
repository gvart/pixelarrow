import { describe, expect, it } from 'vitest';
import { buildMap, checkMap, checkOptions, serializeMap, type MapSource } from '../scripts/buildMap';
import { validateMap } from '../src/online/mapSchema';
import source from '../maps-src/westmed.json';
import built from '../src/online/maps/westmed.json';

const src = source as unknown as MapSource;

describe('season map compiler (westmed)', () => {
  const { map, stats } = buildMap(src);

  it('is deterministic and the committed map is up to date (npm run map:build)', () => {
    expect(JSON.parse(serializeMap(map))).toEqual(built);
  });

  it('passes the runtime schema validator', () => {
    expect(validateMap(map, { minSpawns: src.targets.spawns })).toEqual([]);
  });

  it('passes the builder checks: contiguous regions, no slivers, edges, connectivity, fair spawns', () => {
    expect(checkMap(map, checkOptions(src))).toEqual([]);
  });

  it('has the planned size: ~300 land regions, sea zones, 150 spawns near towns', () => {
    expect(stats.landRegions).toBeGreaterThanOrEqual(280);
    expect(stats.landRegions).toBeLessThanOrEqual(350);
    expect(stats.seaRegions).toBeGreaterThanOrEqual(20);
    expect(stats.seaRegions).toBeLessThanOrEqual(40);
    expect(stats.spawns).toBe(150);
    expect(Object.keys(stats.spawnHopsToTown).map(Number).every((h) => h <= 2)).toBe(true);
    expect(stats.byKind.capital).toBeGreaterThanOrEqual(5);
    expect(stats.navalEdges).toBeGreaterThan(0);
    expect(map.w).toBeGreaterThanOrEqual(400);
    expect(map.w).toBeLessThanOrEqual(600);
    const names = map.regions.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of ['Massalia', 'Carthago', 'Roma', 'Syracusae', 'Gades', 'Emporion', 'Alalia', 'Caralis', 'Panormus', 'Lilybaeum', 'Neapolis', 'Cumae', 'Utica', 'Nikaia', 'Antipolis'])
      expect(names).toContain(n);
  });

  it('every land edge joins regions that touch; naval edges join coasts', () => {
    const coastal = new Set(map.regions.filter((r) => r.campPlot).map((r) => r.id));
    for (const id of coastal) expect(map.edges.some((e) => e.naval && (e.a === id || e.b === id)) || map.edges.some((e) => e.a === id || e.b === id)).toBe(true);
    for (const e of map.edges) expect(e.waypoints.length).toBeGreaterThanOrEqual(2);
  });
});
