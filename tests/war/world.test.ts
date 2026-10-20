import { describe, expect, it } from 'vitest';
import { adjacent, ALLIANCES, edge, hops, WORLD_EDGES, WORLD_REGIONS, worldRegion } from '../../src/war/world';

const SIDES = ['N', 'E', 'S', 'W'] as const;
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' } as const;

describe('war world graph', () => {
  it('has 37 regions: 4 homes, 16 entries, 16 neutrals, 1 centre, unique ids', () => {
    expect(WORLD_REGIONS).toHaveLength(37);
    expect(new Set(WORLD_REGIONS.map((r) => r.id)).size).toBe(37);
    const by = (role: string) => WORLD_REGIONS.filter((r) => r.role === role).length;
    expect([by('home'), by('entry'), by('neutral'), by('center')]).toEqual([4, 16, 16, 1]);
  });

  it('adjacency is symmetric and names known regions', () => {
    for (const r of WORLD_REGIONS)
      for (const b of r.adj) {
        expect(worldRegion(b), `${r.id} -> ${b}`).toBeDefined();
        expect(adjacent(b, r.id), `${b} -> ${r.id}`).toBe(true);
        expect(b).not.toBe(r.id);
      }
  });

  it('every home has 4 entries of its alliance, one per side, ringed round it', () => {
    for (const a of ALLIANCES) {
      const home = worldRegion(a.home)!;
      expect(home).toMatchObject({ role: 'home', alliance: a.id });
      expect(home.adj).toHaveLength(4);
      for (const s of SIDES) {
        const id = `${a.home}-${s.toLowerCase()}`;
        expect(home.adj).toContain(id);
        expect(worldRegion(id)).toMatchObject({ role: 'entry', alliance: a.id });
        expect(edge(a.home, id)).toMatchObject({ sideA: s, sideB: OPP[s] });
      }
      // the ring: N and S each touch E and W
      for (const [x, y] of [['n', 'e'], ['n', 'w'], ['s', 'e'], ['s', 'w']]) expect(adjacent(`${a.home}-${x}`, `${a.home}-${y}`)).toBe(true);
    }
  });

  it('borders cross on facing sides with a travel time', () => {
    expect(WORLD_EDGES.length).toBe(WORLD_REGIONS.reduce((n, r) => n + r.adj.length, 0) / 2);
    for (const e of WORLD_EDGES) {
      expect(e.sideB).toBe(OPP[e.sideA]);
      expect(e.ms).toBeGreaterThanOrEqual(60_000);
      expect(e.ms % 1000).toBe(0);
      expect(edge(e.b, e.a)).toMatchObject({ sideA: e.sideB, sideB: e.sideA, ms: e.ms });
    }
    expect(edge('dodona', 'kleisoura')).toBeNull();
  });

  it('tin comes from exactly 2 regions, neither a home nor touching one; each home reaches one in 2 transfers', () => {
    const tin = WORLD_REGIONS.filter((r) => r.res.tin);
    expect(tin.map((r) => r.id).sort()).toEqual(['achelous', 'kleisoura']);
    for (const t of tin) expect(t.adj.some((b) => worldRegion(b)!.role === 'home')).toBe(false);
    for (const a of ALLIANCES) expect(Math.min(...tin.map((t) => hops(a.home, t.id)))).toBe(2);
  });

  it('is fair: every home is 4 transfers from Omphalos and sums 9 resource points', () => {
    for (const a of ALLIANCES) {
      expect(hops(a.home, 'omphalos')).toBe(4);
      expect(Object.values(worldRegion(a.home)!.res).reduce((s, v) => s + v, 0)).toBe(9);
    }
  });
});
