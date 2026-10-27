/**
 * W-65 random encounters online (server/src/war/encounters.ts): a walking player meets one once his cooldown is spent,
 * told and stored; a choice from the client (parsed as the socket gets it) pays, goods owed to his strongroom and the
 * item at his men's feet.
 */
import { describe, expect, it } from 'vitest';
import { NET_VERSION, parseClientMsg, type JoinMsg, type ServerMsg } from '../../../src/war/net/protocol';
import { WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';
import { encounterStorageKey } from '../../src/war/encounters';

const region = warRegion('dodona-e')!;
const join = (pid: number, team: number, count: number): JoinMsg => ({ t: 'join', v: NET_VERSION, region: 'dodona-e', playerId: pid, team, army: [{ cls: 'hoplite', count }] });
const encMsgs = (r: ReturnType<WarRoom['tick']>, pid: number) => (r.msgs.get(pid) ?? []).filter((m): m is Extract<ServerMsg, { t: 'encounter' }> => m.t === 'encounter');

describe('W-65 encounters in the region room', () => {
  it('his cooldown spent on the road: one springs, told and stored', () => {
    const w = new WarRoom({ region, seed: 4, cap: 600 });
    w.join(1, join(1, 0, 6));
    w.tick();
    expect(w.startEncounters(1, { v: 1, n: 0, travel: 0, next: 20, open: null })).toMatchObject({ t: 'encounter', save: { n: 0 } });
    w.order(1, { kind: 'move', squad: w.squadsOf(1)[0], x: region.w / 2, y: region.h / 2 });
    let told: Extract<ServerMsg, { t: 'encounter' }> | undefined, met: ReturnType<WarRoom['tick']>['met'] = [];
    for (let t = 0; t < 400 && !told; t++) {
      const r = w.tick();
      met = [...met, ...r.met];
      told = encMsgs(r, 1)[0];
    }
    expect(told?.notes?.[0]?.kind).toBe('start');
    expect(told?.save.n).toBe(1);
    expect(met.at(-1)).toEqual({ pid: 1, save: told!.save, goods: {} });
    expect(encounterStorageKey(3, 1)).toBe('encounter:3:1');
  }, 60_000);

  it('a choice from the client pays: goods to his strongroom, the item at his feet', () => {
    const w = new WarRoom({ region, seed: 4, cap: 600 });
    w.join(1, join(1, 0, 4));
    w.tick();
    const men = w.snapshot().units.filter((u) => w.snapshot().squads.find((q) => q.id === u.squad)?.owner === 'p:1');
    const x = men[0].x, y = men[0].y;
    w.startEncounters(1, { v: 1, n: 1, travel: 0, next: 2000, open: { id: 'deserter', step: 'judge', x, y, tx: x, ty: y, since: 0 } });
    expect(parseClientMsg(JSON.stringify({ t: 'encounter', op: 'choose', option: 'strip' }))).toEqual({ t: 'encounter', op: 'choose', option: 'strip' });
    w.encounterChoose(1, 'strip');
    const r = w.tick();
    expect(r.met).toEqual([{ pid: 1, save: { v: 1, n: 1, travel: 0, next: 2000, open: null }, goods: { coin: 3 } }]);
    expect(encMsgs(r, 1)[0].notes?.map((n) => n.kind)).toEqual(['step', 'end']);
    expect((w.snapshot().piles ?? []).some((p) => p.items === 1)).toBe(true);
  });
});
