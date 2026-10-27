/**
 * Taking a held claim point in the region room (server/src/war/room.ts): a pact or truce between the two alliances
 * refuses the claim (atPeace), the holder hears that his point is being taken (settle.taking, once a cooldown), the
 * region's claim count (the world's holder) moves to the taker, and a settlement's banner flow (rebanner) does not
 * flip its pieces back and forth.
 */
import { describe, expect, it } from 'vitest';
import { NET_VERSION, type JoinMsg } from '../../../src/war/net/protocol';
import { DEPTH } from '../../../src/war/sim/depth';
import { ATTACK_COOLDOWN, WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';
import type { RoomSettlement } from '../../src/war/roomSettlements';

const base = warRegion('test-ridge')!;
const P = { x: 176.5, y: 224.5 };
// the ridge without its lairs: the point is open
const region = { ...base, lairs: [], claimPoints: [{ ...P, lairs: [] }] };
const join = (pid: number, team: number): JoinMsg => ({ t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: pid, team, army: [{ cls: 'militia', count: 1 }] });
const steps = (r: WarRoom, n: number, f?: (o: ReturnType<WarRoom['tick']>) => boolean) => {
  for (let i = 0; i < n; i++) {
    const o = r.tick();
    if (f?.(o)) return i + 1;
  }
  return n;
};
const point = (r: WarRoom) => r.snapshot().claims![0];
/** A squad of the player's own beside the point (dev spawn), its id. */
const spawnAt = (r: WarRoom, pid: number, team: number, dx: number) => {
  const before = new Set(r.squadsOf(pid));
  expect(r.dev(pid, { t: 'dev', op: 'spawn', cls: 'hoplite', count: 6, team, x: P.x + dx, y: P.y + 2 })).toBeNull();
  r.tick();
  return r.squadsOf(pid).find((s) => !before.has(s))!;
};
/** Team 0 (player 1) holds the point; its squad walks off. Player 2 (team 1) has a squad at the banner. */
function heldRoom() {
  const r = new WarRoom({ region, seed: 3, cap: 600 });
  r.join(1, join(1, 0));
  r.join(2, join(2, 1));
  r.tick();
  const d = spawnAt(r, 1, 0, 0);
  expect(r.order(1, { kind: 'claimRegion', squad: d, point: 0 })).toBeNull();
  steps(r, DEPTH[1].claim.ticks + 200, () => point(r).state === 'claimed');
  expect(point(r)).toMatchObject({ state: 'claimed', team: 0 });
  r.order(1, { kind: 'move', squad: d, x: 10, y: 170 }); // off west to the entry, out of sight
  steps(r, 1500);
  const a = spawnAt(r, 2, 1, 0);
  return { r, a };
}

describe('taking a held claim point (room)', () => {
  it('a truce or pact between the alliances refuses the claim; none: it is taken', () => {
    const { r, a } = heldRoom();
    r.setPacts([{ a: 0, b: 1, kind: 'truce' }]);
    expect(r.order(2, { kind: 'claimRegion', squad: a, point: 0 })).toBe('atPeace');
    expect(r.refusal).toMatch(/truce with Dodona/);
    r.setPacts([{ a: 1, b: 0, kind: 'pact' }, { a: 2, b: 3, kind: 'truce' }]);
    expect(r.order(2, { kind: 'claimRegion', squad: a, point: 0 })).toBe('atPeace');
    expect(r.refusal).toMatch(/pact/);
    r.setPacts([{ a: 2, b: 3, kind: 'truce' }]);
    expect(r.order(2, { kind: 'claimRegion', squad: a, point: 0 })).toBeNull();
  });

  it('the holder hears his point is being taken (once a cooldown); done, the claim count moves to the taker', () => {
    const { r, a } = heldRoom();
    expect(r.summary().claims.slice(0, 2)).toEqual([1, 0]);
    expect(r.order(2, { kind: 'claimRegion', squad: a, point: 0 })).toBeNull();
    const heard: unknown[] = [];
    steps(r, DEPTH[1].claim.ticks + 200, (o) => {
      heard.push(...(o.settle?.taking ?? []));
      return point(r).team === 1;
    });
    expect(heard).toEqual([{ point: 0, holder: 0, by: 1 }]);
    expect(ATTACK_COOLDOWN).toBeGreaterThan(DEPTH[1].claim.ticks);
    expect(point(r)).toMatchObject({ state: 'claimed', team: 1 });
    expect(r.summary().claims.slice(0, 2)).toEqual([0, 1]);
  });

  it("a settlement's town beside the point keeps its banner through the capture: no rebanner back and forth", () => {
    const { r, a } = heldRoom();
    // player 1 (team 0) is lord of a settlement whose camp stands 24 tiles off the point
    r.sim.claim(0, P.x + 26, P.y, 24);
    r.sim.addStock(0, 'wood', 9999);
    const n = r.snapshot().buildings!.length;
    r.sim.order({ kind: 'placeBuilding', team: 0, type: 'camp', x: P.x + 24, y: P.y });
    r.tick();
    const camp = r.snapshot().buildings!.find((b) => b.id >= n && b.type === 'camp')!;
    r.sim.finishSite(camp.id);
    steps(r, 60);
    const s: RoomSettlement = {
      id: 5, centre: camp.id, x: camp.x, y: camp.y, r: 24, name: 'Akra', lord: 1, lordName: 'One', team: 0, level: 1, overlord: null, tribute: 0, leviedAt: 0,
      overlordLords: [], members: [{ pid: 1, role: 'lord', plot: null }],
    };
    r.setSettlements([s]);
    expect(r.order(2, { kind: 'claimRegion', squad: a, point: 0 })).toBeNull();
    steps(r, DEPTH[1].claim.ticks + 200, () => point(r).team === 1);
    expect(point(r).team).toBe(1);
    r.setSettlements([s]); // the next poll: nothing to turn
    steps(r, 20);
    expect(r.snapshot().buildings!.find((b) => b.id === camp.id)!.team).toBe(0);
    expect(r.snapshot().townLevels!.find((t) => t.id === camp.id)!.team).toBe(0);
  });
});
