/**
 * W-76 proposal, hidden quest step markers in the live room: the owner's `secret` lines carry the next step's spot, and
 * a player who comes back gets his open steps (no text, so no notice) on his new feed; nobody else gets them.
 */
import { describe, expect, it } from 'vitest';
import { NET_VERSION, type JoinMsg, type ServerMsg } from '../../../src/war/net/protocol';
import type { RegionData, WarEvent } from '../../../src/war/types';
import { WarRoom } from '../../src/war/room';

const join = (pid: number, team: number): JoinMsg => ({ t: 'join', v: NET_VERSION, region: 'hid', playerId: pid, team, army: [{ cls: 'hoplite', count: 2 }] });
function flat(n = 128): RegionData {
  return {
    id: 'hid', name: 'hid', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0),
    entries: (['N', 'E', 'S', 'W'] as const).map((side) => ({ side, x: side === 'W' ? 0 : side === 'E' ? n - 4 : n / 2 - 2, y: side === 'N' ? 0 : side === 'S' ? n - 4 : n / 2 - 2, w: 4, h: 4 })),
    noBuild: [], objects: [], lairs: [], claimPoints: [], depth: 1,
    secrets: [{ x: 70.5, y: 70.5, quest: 'cache', then: [82.5, 70.5] }],
  };
}
type Secret = Extract<WarEvent, { kind: 'secret' }>;

describe('W-76 hidden quest markers in the live room', () => {
  it('the owner\'s next-step line carries its spot; he gets his open step again when he comes back', () => {
    const room = new WarRoom({ region: flat(), seed: 1, cap: 600 });
    room.join(1, join(1, 0));
    room.join(2, join(2, 1));
    room.sim.spawnSquad('p:1', 0, 'hoplite', 3, 70.5, 72.5);
    const got = new Map<number, ServerMsg[]>();
    const step = (n: number) => { for (let i = 0; i < n; i++) for (const [pid, ms] of room.tick().msgs) (got.get(pid) ?? got.set(pid, []).get(pid)!).push(...ms); };
    const secrets = (pid: number) => (got.get(pid) ?? []).flatMap((m) => (m.t === 'secret' ? m.ev : [])).filter((e): e is Secret => e.kind === 'secret');
    step(60);
    expect(secrets(1).some((e) => e.what === 'step' && e.to?.label === 'Cache')).toBe(true);
    expect(secrets(2)).toEqual([]);
    room.leave(1);
    got.clear();
    room.join(1, join(1, 0));
    room.join(2, join(2, 1));
    step(3);
    expect(secrets(1)).toEqual([expect.objectContaining({ what: 'step', text: '', to: expect.objectContaining({ label: 'Cache' }) })]);
    expect(secrets(2)).toEqual([]);
  });
});
