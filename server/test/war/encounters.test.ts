/**
 * W-65 random encounters online (server/src/war/encounters.ts): a walking player meets one once his cooldown is spent,
 * told and stored; a choice from the client (parsed as the socket gets it) pays, goods owed to his strongroom and the
 * item at his men's feet.
 */
import { describe, expect, it } from 'vitest';
import { NET_VERSION, parseClientMsg, type JoinMsg, type ServerMsg } from '../../../src/war/net/protocol';
import { WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';
import { encounterStorageKey, ladenLoads } from '../../src/war/encounters';
import { ROBBERS } from '../../../src/data/warEncounters';
import { perLoad } from '../../../src/war/sim/holders';

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
    expect(met.at(-1)).toMatchObject({ pid: 1, save: told!.save, goods: {} });
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
    expect(r.met).toMatchObject([{ pid: 1, save: { v: 1, n: 1, travel: 0, next: 2000, open: null }, goods: { coin: 3 } }]);
    expect(encMsgs(r, 1)[0].notes?.map((n) => n.kind)).toEqual(['step', 'end']);
    expect((w.snapshot().piles ?? []).some((p) => p.items === 1)).toBe(true);
  });
});

describe('W-197 robbers on the road', () => {
  const room = () => {
    const w = new WarRoom({ region, seed: 4, cap: 600 });
    w.join(1, join(1, 0, 4));
    w.tick();
    return w;
  };
  /** The first crossing's key on which they wait. */
  const keyWaited = (w: WarRoom) => {
    for (let i = 0; i < 200; i++) {
      w.encounters.road(1, ROBBERS.minLoads, `k${i}`);
      if (w.encounters.waitingFor(1)) return i;
    }
    throw new Error('never');
  };

  it('only goods count: food and rations are no load to rob, coin and cart loads are', () => {
    const food = perLoad('food') * 9, wood = perLoad('wood') * 2, coin = perLoad('coin');
    expect(ladenLoads(undefined)).toBe(0);
    expect(ladenLoads({ packs: { a: { lots: [{ r: 'food', n: food }, { r: 'ration', n: 3 }] } } })).toBe(0);
    expect(ladenLoads({ packs: { a: { lots: [{ r: 'coin', n: coin }] } }, carts: [{ lots: [{ r: 'wood', n: wood }, { r: 'food', n: food }] }] })).toBeCloseTo(3, 6);
  });

  it('a light train is left alone; a laden one meets them on about the chance, seeded by the crossing', () => {
    const w = room();
    for (let i = 0; i < 100; i++) w.encounters.road(1, ROBBERS.minLoads - 0.01, `k${i}`);
    expect(w.encounters.waitingFor(1)).toBe(false);
    let met = 0;
    for (let i = 0; i < 400; i++) {
      w.encounters.road(i + 2, ROBBERS.minLoads, `k${i}`);
      if (w.encounters.waitingFor(i + 2)) met++;
    }
    expect(met / 400).toBeGreaterThan(ROBBERS.chance - 0.1);
    expect(met / 400).toBeLessThan(ROBBERS.chance + 0.1);
  });

  const met = (w: WarRoom) => {
    keyWaited(w);
    w.tick();
    expect(w.encounters.waitingFor(1), 'patient until his run starts').toBe(true);
    w.startEncounters(1, null);
    const told = encMsgs(w.tick(), 1)[0];
    expect(told?.notes?.[0]).toMatchObject({ kind: 'start', enc: ROBBERS.id });
    expect(w.encounters.waitingFor(1)).toBe(false);
    return told!.save.open!;
  };
  const beat = (w: WarRoom, o: { tx: number; ty: number }) => {
    const band = () => (w.snapshot().lairs ?? []).find((l) => Math.hypot(l.x - o.tx, l.y - o.ty) < 0.5);
    for (let t = 0; t < 40 && !band(); t++) w.tick();
    expect(band()!.kind).toBe('bandit');
    w.order(1, { kind: 'attack', squad: w.squadsOf(1)[0], target: band()!.squad });
    let paid: Record<string, number> = {};
    for (let t = 0; t < 1800 && !paid.coin; t++) {
      const m = w.tick().met.at(-1);
      if (m?.goods.coin) paid = m.goods;
    }
    expect(band()?.state).toBe('cleared');
    expect(paid.coin).toBeGreaterThan(0);
  };

  it('they name their price as he comes in: he stands and fights, a real band; beaten, it is paid and over', () => {
    const w = room(), o = met(w);
    w.encounterChoose(1, 'fight');
    w.tick();
    beat(w, o);
  }, 60_000);

  it('or he pays: that share of all he carries is gone, seals or not, and no blow is struck', () => {
    const w = room(), q = w.squadsOf(1)[0];
    w.giveCargo(1, { squad: q }, { lots: [{ r: 'iron', n: 20, o: 'kleisoura' }, { r: 'wood', n: 10, o: 'kleisoura', s: 7 }], items: [] });
    const lairs = (w.snapshot().lairs ?? []).length, o = met(w);
    expect(o.step).toBe('demand');
    w.encounterChoose(1, 'pay');
    w.tick();
    const left = (r: string) => w.sim.cargo({ squad: q })!.slots.reduce((a, s) => a + s.hold.lots.filter((l) => l.r === r).reduce((b, l) => b + l.n, 0), 0);
    expect(left('iron')).toBeCloseTo(20 * (1 - ROBBERS.toll), 6);
    expect(left('wood')).toBeCloseTo(10 * (1 - ROBBERS.toll), 6);
    expect((w.snapshot().lairs ?? []).length).toBe(lairs);
  }, 60_000);

  it('no answer in time is a fight', () => {
    const w = room(), o = met(w);
    for (let t = 0; t < 1900 && (w.snapshot().lairs ?? []).every((l) => Math.hypot(l.x - o.tx, l.y - o.ty) >= 0.5); t++) w.tick();
    expect((w.snapshot().lairs ?? []).some((l) => Math.hypot(l.x - o.tx, l.y - o.ty) < 0.5 && l.kind === 'bandit')).toBe(true);
  }, 60_000);
});
