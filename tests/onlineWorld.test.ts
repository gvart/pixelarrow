import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_ID, getMap, hasMap, mapIds, WorldGraph } from '../src/online/world';
import { decodeMask, parseMap, rleDecode, rleEncode, validateMap, type MapJson } from '../src/online/mapSchema';
import test30 from '../src/online/maps/test30.json';

const clone = (): MapJson => JSON.parse(JSON.stringify(test30)) as MapJson;

describe('map schema', () => {
  it('RLE round-trips and rejects runs that do not add up', () => {
    const v = [0, 0, 3, 3, 3, 1, 0];
    expect(rleEncode(v)).toEqual([2, 0, 3, 3, 1, 1, 1, 0]);
    expect([...rleDecode(rleEncode(v), v.length)]).toEqual(v);
    expect(() => rleDecode([2, 0], 3)).toThrow();
    expect(() => rleDecode([4, 0], 3)).toThrow();
    expect(() => rleDecode([1], 1)).toThrow();
  });

  it('the bundled maps are valid', () => {
    expect(mapIds()).toContain('test30');
    for (const id of mapIds()) expect(validateMap(getMap(id).map)).toEqual([]);
    expect(hasMap(DEFAULT_MAP_ID)).toBe(true);
  });

  it('catches broken maps', () => {
    const bad = (f: (m: MapJson) => void) => {
      const m = clone();
      f(m);
      return validateMap(m).join('\n');
    };
    expect(bad((m) => (m.mask = m.mask.slice(2)))).toMatch(/mask/);
    expect(bad((m) => m.regions.push({ ...m.regions[0] }))).toMatch(/duplicate id/);
    expect(bad((m) => (m.regions[0].kind = 'swamp' as never))).toMatch(/unknown kind/);
    expect(bad((m) => (m.regions[0].tier = 9 as never))).toMatch(/tier/);
    expect(bad((m) => m.edges.push({ ...m.edges[0] }))).toMatch(/duplicate/);
    expect(bad((m) => m.edges.push({ a: 1, b: 999, minutes: 5, waypoints: [] }))).toMatch(/unknown region/);
    expect(bad((m) => (m.edges[0].waypoints = [...m.edges[0].waypoints].reverse()))).toMatch(/waypoint is not in region/);
    const sea = clone().regions.find((r) => r.kind === 'sea')!.id;
    expect(bad((m) => m.edges.push({ a: 1, b: sea, minutes: 5, waypoints: [] }))).toMatch(/sea regions have no edges/);
    // cut a region off: drop every edge touching it
    const lone = clone().regions.find((r) => r.kind === 'plot' && !r.spawn)!.id;
    expect(bad((m) => (m.edges = m.edges.filter((e) => e.a !== lone && e.b !== lone)))).toMatch(/not connected/);
    expect(bad((m) => m.regions.forEach((r) => delete r.spawn))).toMatch(/spawn/);
    expect(() => parseMap({ id: 'x' })).toThrow(/invalid map/);
  });
});

describe('world graph (test30)', () => {
  const w = getMap('test30');

  it('knows every region, its kind and its coast', () => {
    expect(w.all().length).toBe(30);
    expect(w.info(9)).toMatchObject({ name: 'Urbs Media', kind: 'capital', capital: true, town: true, tier: 5, passable: true });
    expect(w.info(19)).toMatchObject({ kind: 'sea', passable: false });
    expect(w.info(14).coast).toBe(true); // Portus Minor
    expect(w.info(1).coast).toBe(false);
    expect(w.spawns().length).toBeGreaterThanOrEqual(6);
    expect(w.capitals()).toEqual([9, 25]);
    expect(() => w.info(999)).toThrow();
    expect(w.has(999)).toBe(false);
    // depth grows away from the spawn plots
    for (const s of w.spawns()) expect(w.info(s).depth).toBe(0);
    expect(w.info(9).depth).toBeGreaterThan(0);
  });

  it('adjacency follows the edges, both ways; the sea has none', () => {
    for (const e of w.map.edges) {
      expect(w.adjacent(e.a, e.b)).toBe(true);
      expect(w.adjacent(e.b, e.a)).toBe(true);
      expect(w.neighbours(e.a)).toContain(e.b);
      expect(w.minutes(e.b, e.a)).toBe(e.minutes);
    }
    expect(w.adjacent(1, 25)).toBe(false);
    for (const r of w.all().filter((x) => x.kind === 'sea')) expect(w.neighbours(r.id)).toEqual([]);
    // naval routes link the island
    expect(w.edge(14, 22)?.naval).toBe(true);
  });

  it('within(id, hops) is a BFS ball, itself first', () => {
    expect(w.within(1, 0)).toEqual([1]);
    const one = w.within(1, 1);
    expect(one[0]).toBe(1);
    expect(new Set(one.slice(1))).toEqual(new Set(w.neighbours(1)));
    const two = new Set(w.within(1, 2));
    for (const n of w.neighbours(1)) for (const m of w.neighbours(n)) expect(two.has(m)).toBe(true);
    for (const x of two) expect(w.hops(1, x)).toBeLessThanOrEqual(2);
    expect(w.within(999, 3)).toEqual([]);
    expect(w.hops(1, 1)).toBe(0);
    expect(w.hops(1, 19)).toBe(Infinity);
  });

  it('path: Dijkstra on edge minutes, honouring the blocking predicate', () => {
    const p = w.path(1, 25)!;
    expect(p.path[0]).toBe(1);
    expect(p.path.at(-1)).toBe(25);
    let sum = 0;
    for (let i = 1; i < p.path.length; i++) {
      expect(w.adjacent(p.path[i - 1], p.path[i])).toBe(true);
      sum += w.minutes(p.path[i - 1], p.path[i]);
    }
    expect(p.minutes).toBe(sum);
    // optimal: no single detour is cheaper than the best route found
    for (const n of w.neighbours(1)) {
      const via = w.path(n, 25, (r) => r.id !== 1);
      if (via) expect(w.minutes(1, n) + via.minutes).toBeGreaterThanOrEqual(p.minutes);
    }
    // blocked regions are avoided; a blocked goal has no path
    const mid = p.path[1];
    const q = w.path(1, 25, (r) => r.id !== mid);
    if (q) expect(q.path).not.toContain(mid);
    expect(w.path(1, 25, (r) => r.id !== 25)).toBeNull();
    expect(w.path(1, 19)).toBeNull(); // the sea
    expect(w.path(1, 1)).toEqual({ path: [1], minutes: 0 });
    // the island is reached by sea only
    expect(w.path(1, 25, (r) => !r.coast || r.id === 25)).toBeNull();
  });

  it('pos and regionAt agree with the mask', () => {
    const mask = decodeMask(w.map);
    for (const r of w.all()) {
      const p = w.pos(r.id);
      expect(w.regionAt(p.x, p.y)).toBe(r.id);
      expect(mask[Math.floor(p.y / w.map.cell) * w.map.w + Math.floor(p.x / w.map.cell)]).toBe(r.id);
    }
    expect(w.regionAt(-5, 3)).toBe(0);
    expect(w.width).toBe(w.map.w * w.map.cell);
  });

  it('builds from any valid map JSON', () => {
    const m = clone();
    m.id = 'copy';
    const g = new WorldGraph(parseMap(m));
    expect(g.id).toBe('copy');
    expect(g.neighbours(1)).toEqual(w.neighbours(1));
  });
});
