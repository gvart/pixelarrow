/**
 * The `allies` message (server/src/war/room.ts alliesOf): each player hears which other players' men are his friends:
 * his own alliance's, and an alliance's at peace with his (a pact or truce), on join and again when that changes.
 */
import { describe, expect, it } from 'vitest';
import { NET_VERSION, WILD_EVERY, type JoinMsg, type ServerMsg } from '../../../src/war/net/protocol';
import { WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';

const region = warRegion('test-ridge')!;
const join = (pid: number, team: number): JoinMsg => ({ t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: pid, team, army: [{ cls: 'militia', count: 1 }] });
/** The last `allies` message each player got over n ticks. */
const heard = (r: WarRoom, n: number) => {
  const last = new Map<number, Extract<ServerMsg, { t: 'allies' }>>();
  for (let i = 0; i < n; i++) for (const [pid, ms] of r.tick().msgs) for (const m of ms) if (m.t === 'allies') last.set(pid, m);
  return last;
};

describe('allies message (room)', () => {
  it('names his alliance mates on join, adds a pact partner, drops it when the pact ends', () => {
    const r = new WarRoom({ region, seed: 5, cap: 600 });
    r.join(1, join(1, 0));
    r.join(2, join(2, 0));
    r.join(3, join(3, 1));
    r.join(4, join(4, 2));
    let got = heard(r, 2);
    expect(got.get(1)).toEqual({ t: 'allies', players: [2] });
    expect(got.get(3)).toEqual({ t: 'allies', players: [] });
    r.setPacts([{ a: 1, b: 0, kind: 'pact' }]);
    got = heard(r, WILD_EVERY);
    expect(got.get(1)?.players).toEqual([2, 3]);
    expect(got.get(3)?.players).toEqual([1, 2]);
    expect(got.has(4)).toBe(false); // unchanged: not sent again
    r.setPacts([]);
    got = heard(r, WILD_EVERY);
    expect(got.get(1)?.players).toEqual([2]);
    expect(got.get(3)?.players).toEqual([]);
  });
});
