import { describe, expect, it } from 'vitest';
import { adjacent, WORLD_IDS } from '../../src/war/world/graph';
import { FRONTIER_TOWNS, inSight, isChokepoint, MARKET_TOWNS, PURPOSE, scoreRate, seasonStandings, TRADE_ROUTES } from '../../src/war/world-view/geo';
import { fieldSquads, mockWorld, travelMs } from '../../src/war/world-view/source';
import type { RegionState } from '../../src/war/net/world';

const region = (id: string, owner: number, live = [0, 0, 0, 0]): RegionState => ({ id, owner: owner as RegionState['owner'], claims: [0, 0, 0, 0], live, contested: false, besieged: false });

describe('world view geography', () => {
  it('has a purpose for every region and nothing else', () => {
    expect(Object.keys(PURPOSE).sort()).toEqual([...WORLD_IDS].sort());
  });

  it('runs every trade route over borders', () => {
    for (const r of TRADE_ROUTES) for (let i = 1; i < r.path.length; i++) expect(adjacent(r.path[i - 1], r.path[i]), `${r.name} ${r.path[i - 1]}-${r.path[i]}`).toBe(true);
  });

  it('flags the market towns and chokepoints of the doc', () => {
    expect(MARKET_TOWNS.size).toBe(9);
    for (const id of ['kleisoura', 'achelous', 'saddle', 'dodona-e', 'kyrene-w']) expect(isChokepoint(id)).toBe(true);
    expect(isChokepoint('ammos')).toBe(false);
  });

  it('scores Omphalos 10 only with no enemy there, towns 3, gates 2, other neutrals 1, entries 0', () => {
    expect(scoreRate(region('omphalos', 2))).toBe(10);
    expect(scoreRate(region('omphalos', 2, [5, 0, 30, 0]))).toBe(0);
    for (const id of FRONTIER_TOWNS) expect(scoreRate(region(id, 1))).toBe(3);
    expect(scoreRate(region('gorge', 1))).toBe(2);
    expect(scoreRate(region('krios', 1))).toBe(1);
    expect(scoreRate(region('dodona-n', 0))).toBe(0);
    expect(scoreRate(region('krios', -1))).toBe(0);
    const s = seasonStandings([region('omphalos', 2), region('kleisoura', 2), region('krios', 0)]);
    expect(s[2]).toMatchObject({ rate: 13, towns: 2, frontier: 1, omphalos: true });
    expect(s[0]).toMatchObject({ rate: 1, towns: 0, omphalos: false });
  });

  it('shows troops only on, next to or where you stand', () => {
    const regions = new Map([region('dodona-e', 0), region('kleisoura', 1), region('ammon', 2), region('saddle', 1)].map((r) => [r.id, r]));
    expect(inSight('dodona-e', 0, regions, new Set())).toBe(true);
    expect(inSight('kleisoura', 0, regions, new Set())).toBe(true); // borders dodona-e
    expect(inSight('ammon', 0, regions, new Set())).toBe(false);
    expect(inSight('ammon', 0, regions, new Set(['ammon']))).toBe(true);
    expect(inSight('dodona-e', null, regions, new Set())).toBe(false);
  });
});

describe('world view sources', () => {
  it('groups deployed men per region, not those at home or on the road', () => {
    const s = fieldSquads([
      { id: 'a', cls: 'hoplite', state: 'active', region: 'moors' },
      { id: 'b', cls: 'archer', state: 'active', region: 'moors' },
      { id: 'c', cls: 'hoplite', state: 'active', region: null },
      { id: 'd', cls: 'hoplite', state: 'active', region: '>saddle' },
      { id: 'e', cls: 'hoplite', state: 'active', region: 'test-ridge' },
    ]);
    expect(s).toEqual([{ region: 'moors', men: 2, classes: { hoplite: 1, archer: 1 }, ids: ['a', 'b'] }]);
  });

  it('builds a mock world with every region, homes held by their alliance', () => {
    const w = mockWorld(0);
    expect(w.snap.regions.map((r) => r.id).sort()).toEqual([...WORLD_IDS].sort());
    expect(w.snap.regions.find((r) => r.id === 'skythia')!.owner).toBe(1);
    expect(w.snap.transit.length).toBeGreaterThan(0);
    expect(travelMs('dodona', 'dodona-n')).toBe(100_000);
  });
});
