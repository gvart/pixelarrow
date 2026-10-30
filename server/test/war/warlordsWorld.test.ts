/**
 * W-76 proposal, live warlords on the world map: a domain room's summary carries each warlord's holdings there (places,
 * men), a raid warned (seconds left, 0 once under way) and a fall (the age he fell at); the region DO turns those into
 * wall-clock times (lordReport) and the world keeps them on the region it shows (RegionState.lords), only for regions
 * that sent them.
 */
import { describe, expect, it } from 'vitest';
import { NET_VERSION, type JoinMsg } from '../../../src/war/net/protocol';
import { domainOf, WARLORD, WARLORDS } from '../../../src/data/warWarlords';
import type { RegionData } from '../../../src/war/types';
import { lordReport, WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';
import { World } from '../../src/war/world/world';

const W = WARLORDS[0], SEAT = W.seat, MARCH = domainOf(W)[1], DAY = 86_400_000;
const join = (pid: number, team: number, region: string): JoinMsg => ({ t: 'join', v: NET_VERSION, region, playerId: pid, team, army: [{ cls: 'hoplite', count: 4 }] });

function flat(id: string, n = 160): RegionData {
  return {
    id, name: id, w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0),
    entries: (['N', 'E', 'S', 'W'] as const).map((side) => ({ side, x: side === 'W' ? 0 : side === 'E' ? n - 4 : n / 2 - 2, y: side === 'N' ? 0 : side === 'S' ? n - 4 : n / 2 - 2, w: 4, h: 4 })),
    noBuild: [], objects: [], lairs: [], claimPoints: [{ x: 60, y: 80, lairs: [] }],
  };
}
const step = (room: WarRoom, n: number) => { for (let i = 0; i < n; i++) room.tick(); };

describe('W-76 warlords reported to the world', () => {
  it('a seat room reports his hall and men; a room outside every domain reports none', () => {
    const room = new WarRoom({ region: warRegion(SEAT)!, seed: 1, cap: 600, warlords: true });
    room.setWarlordAge(0);
    room.join(1, join(1, 0, SEAT));
    step(room, WARLORD.think * 3);
    const lords = room.summary().lords!;
    expect(lords).toHaveLength(1);
    expect(lords[0]).toMatchObject({ id: W.id });
    expect(lords[0].holds).toBeGreaterThanOrEqual(1);
    expect(lords[0].men).toBeGreaterThan(0);
    expect(new WarRoom({ region: flat(SEAT), seed: 1, cap: 600 }).summary().lords).toBeUndefined();
  });

  it('a raid in warning reports its seconds left (in tens); a fall reports the age he fell at', () => {
    const region = flat(MARCH);
    const room = new WarRoom({ region, seed: 3, cap: 600, warlords: true });
    room.setWarlordAge(WARLORD.grow.marchDay);
    room.join(1, join(1, 0, MARCH));
    room.sim.claim(0, 112, 80, 14);
    room.sim.order({ kind: 'placeBuilding', team: 0, type: 'storehouse', x: 112, y: 80 });
    step(room, 2);
    room.sim.finishSite(room.sim.snapshot().buildings!.find((b) => b.type === 'storehouse')!.id);
    for (const s of room.sim.snapshot().squads) if (s.owner.startsWith('p:')) room.sim.order({ kind: 'move', squad: s.id, x: 20, y: 150 });
    step(room, WARLORD.think * 4);
    room.warlords!.raidNow(0);
    let raid: number | undefined;
    for (let i = 0; i < 60 && raid === undefined; i++) step(room, WARLORD.think), (raid = room.summary().lords?.[0].raid);
    expect(raid).toBeGreaterThan(0);
    expect(raid! % 10).toBe(0);
    expect(raid).toBeLessThanOrEqual(WARLORD.raid.warn / 10);
    room.warlordFell(W.id, WARLORD.grow.marchDay);
    step(room, WARLORD.think * 2);
    expect(room.summary().lords![0]).toMatchObject({ holds: 0, fell: WARLORD.grow.marchDay });
  });

  it('lordReport: seconds and ages become wall-clock times', () => {
    const from = 5 * DAY, now = from + 2 * DAY;
    expect(lordReport([{ id: W.id, holds: 2, men: 11, raid: 30 }, { id: 'kelaino', holds: 0, men: 0, fell: 1.5 }], from, now)).toEqual([
      { id: W.id, holds: 2, men: 11, raid: { at: now + 30_000 } },
      { id: 'kelaino', holds: 0, men: 0, backAt: from + (1.5 + WARLORD.back) * DAY },
    ]);
  });

  it('the world keeps the last report of a region\'s lords on its state, and drops them when a report has none', () => {
    const w = new World(), now = Date.now();
    const lords = [{ id: W.id, holds: 2, men: 11, raid: { at: now + 30_000 } }];
    w.report(MARCH, { live: [4, 0, 0, 0], claims: [0, 0, 0, 0], channel: [0, 0, 0, 0], lords }, now);
    expect(w.snapshot(1, 0, { members: [0, 0, 0, 0], clans: [0, 0, 0, 0] }, now).regions.find((r) => r.id === MARCH)?.lords).toEqual(lords);
    w.report(MARCH, { live: [4, 0, 0, 0], claims: [0, 0, 0, 0], channel: [0, 0, 0, 0] }, now);
    expect(w.region(MARCH)?.lords).toBeUndefined();
  });
});
