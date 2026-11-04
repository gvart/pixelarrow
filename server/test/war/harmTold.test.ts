/**
 * W-221 the browser pass's silent loss, on the real sim and room: a player's guards are struck and fall, and the coin in
 * their packs goes to the ground. He is told how much, and the pile reaches his page so his men can fetch it.
 */
import { describe, expect, it } from 'vitest';
import { NET_VERSION, type JoinMsg, type ServerMsg } from '../../../src/war/net/protocol';
import { put } from '../../../src/war/sim/holders';
import { WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';

const region = warRegion('test-ridge')!;
const join = (pid: number): JoinMsg => ({ t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: pid, team: 0, army: [{ cls: 'hoplite', count: 2 }] });

/** His two guards with 52 coin in a pack, bears on top of them. */
function struck() {
  const r = new WarRoom({ region, seed: 1, cap: 600 });
  r.join(1, join(1));
  r.tick();
  const q = r.squadsOf(1)[0];
  put(r.sim.cargo({ squad: q })!.slots[0].hold, 'coin', 52, 'dodona');
  const m = r.snapshot().units.find((u) => u.squad === q)!;
  r.sim.addLair({ kind: 'bear', x: m.x + 3, y: m.y, count: 6 });
  return r;
}

describe('W-221 goods fallen with a man', () => {
  it('he falls, the pile holds the coin, the owner is told how much', () => {
    const r = struck(), heard: ServerMsg[] = [];
    for (let i = 0; i < 2500 && !heard.some((m) => m.t === 'dropped'); i++) heard.push(...(r.tick().msgs.get(1) ?? []));
    expect(heard.find((m) => m.t === 'dropped')).toMatchObject({ goods: { coin: 52 } });
    expect(r.sim.snapshot().piles?.some((p) => p.goods.coin === 52)).toBe(true);
  });

  it('the pile reaches the page: without it on the wire he could neither see nor fetch it', () => {
    const r = struck();
    let piles: unknown;
    for (let i = 0; i < 2500 && !piles; i++) for (const m of r.tick().msgs.get(1) ?? []) if (m.t === 'wild' && m.piles) piles = m.piles;
    expect(piles).toEqual(expect.arrayContaining([expect.objectContaining({ goods: expect.objectContaining({ coin: 52 }) })]));
  });
});
