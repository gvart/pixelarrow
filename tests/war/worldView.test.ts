import { describe, expect, it } from 'vitest';
import { adjacent, WORLD_IDS } from '../../src/war/world/graph';
import { FRONTIER_TOWNS, inSight, isChokepoint, MARKET_TOWNS, PURPOSE, scoreRate, seasonStandings, TRADE_ROUTES } from '../../src/war/world-view/geo';
import { fieldSquads, liveTrade, mockWorld, travelMs } from '../../src/war/world-view/source';
import { convoySeen } from '../../src/war/world-view/geo';
import type { ConvoySnap as LiveConvoy, RegionState } from '../../src/war/net/world';

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
    // the design's start (docs/WAR.md Army size): one squad of 12 at home, nothing on the road
    expect(w.squads).toEqual([{ region: 'dodona', men: 12, classes: { hoplite: 12 }, ids: [] }]);
    expect(w.snap.transit).toEqual([]);
    expect(travelMs('dodona', 'dodona-n')).toBe(100_000);
  });

  it('maps the live convoys, boards and trade score onto the map', () => {
    const { snap } = mockWorld(0);
    const live = {
      ...snap,
      score: { ...snap.score, trade: [5, 0, 12, 0] },
      convoys: <LiveConvoy[]>[
        { id: 7, from: 'kleisoura', to: 'dodona-e', men: 6, departAt: 0, arriveAt: 1000, state: 'moving' as const, alliance: 1 as const, cart: 'wagon' as const, loads: 9.5, goods: { tin: 300, iron: 900, food: 20, salt: 1 }, items: 2, mine: false },
        { id: 8, from: 'dodona', to: 'moors', men: 4, departAt: 0, arriveAt: 1000, state: 'moving' as const, alliance: 0 as const, loads: 1.2, goods: { hides: 30 }, items: 0, mine: true },
        { id: 9, from: 'dodona', to: 'moors', men: 12, departAt: 0, arriveAt: 1000, state: 'moving' as const, alliance: 0 as const, loads: 0, goods: {}, items: 0, mine: true },
      ],
      boards: { stymphalia: { at: 50, goods: { tin: { ask: 11, bid: 9, askDepth: 20, bidDepth: 25 }, oil: { ask: 5, bid: null, askDepth: 120, bidDepth: 0 } }, fills: [{ res: 'tin', n: 3, price: 10, at: 40 }] } },
    };
    const t = liveTrade(live);
    // men only travel as squads, not convoys
    expect(t.convoys!.map((c) => [c.id, c.kind, c.cargo])).toEqual([[7, 'wagon', 'iron, tin, food, 2 items'], [8, 'porters', 'hides']]);
    expect(t.boards!.stymphalia).toEqual({ at: 50, fills: 1, rows: [{ good: 'oil', ask: 5, bid: null, depth: 120 }, { good: 'tin', ask: 11, bid: 9, depth: 45 }] });
    expect(t.trade).toEqual([5, 0, 12, 0]);
    // the server already filtered by fog: the map keeps them all
    expect(convoySeen(t.convoys![0], 3, new Map(), new Set())).toBe(true);
  });
});
