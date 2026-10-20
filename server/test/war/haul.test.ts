/**
 * M6h world trade (docs/WAR.md "Carts", "Season score and anti-abuse"): transits carry cargo (survive a transfer and a
 * restart), wagons and loaded porters travel slower, a haul chains its legs with the player offline, convoys are seen
 * per fog and Safe Roads, and the trade score's rules and daily cap.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { NET_VERSION, type JoinMsg } from '../../../src/war/net/protocol';
import type { TransitCargo } from '../../../src/war/net/world';
import { edge, hops, WORLD_REGIONS } from '../../../src/war/world';
import { makePerson } from '../../../src/war/sim/roster';
import { WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';
import { CARGO_TRAVEL, World, type ArriveResult, type Ports } from '../../src/war/world/world';
import { fillHook, scoreOf, TRADE } from '../../src/war/tradeScore';
import { devLogin } from '../helpers';
import type { Env } from '../../src/env';

const T0 = 2_000_000;
const CARGO: TransitCargo = { packs: { p1: { lots: [{ r: 'iron', n: 10, o: 'siren' }], items: [] } }, cart: { type: 'wagon', lots: [{ r: 'salt', n: 60, o: 'ammos' }], items: [] } };

function ports(cargo?: TransitCargo) {
  const arrived: { to: string; ids: string[]; cargo?: TransitCargo }[] = [];
  const p: Ports = {
    depart: async (_f, _pid, who) => ({ ids: Array.isArray(who) ? who : ['p1'], off: 0, ...(cargo ? { cargo } : {}) }),
    arrive: async (to, _pid, _a, ids, _s, _l, c): Promise<ArriveResult> => (arrived.push({ to, ids, ...(c ? { cargo: c } : {}) }), { ok: true }),
  };
  return { p, arrived };
}

describe('transits with cargo', () => {
  it('carry their cargo through a restart; a wagon travels x1.5, loaded porters x1.2', async () => {
    const e = edge('dodona', 'dodona-e')!;
    const w = new World(), f = ports(CARGO);
    const t = await w.transfer(7, 0, { from: 'dodona', to: 'dodona-e', squad: 1 }, T0, f.p);
    if ('error' in t) throw new Error(t.error);
    expect(t.arriveAt - T0).toBe(Math.round(e.ms * CARGO_TRAVEL.wagon));
    const back = new World(JSON.parse(JSON.stringify(w.st))); // a DO restart: the state from storage
    await back.due(t.arriveAt, f.p);
    expect(f.arrived[0].cargo).toEqual(CARGO);
    const porters = new World(), g = ports({ packs: CARGO.packs });
    const u = await porters.transfer(7, 0, { from: 'dodona', to: 'dodona-e', squad: 1 }, T0, g.p);
    if ('error' in u) throw new Error(u.error);
    expect(u.arriveAt - T0).toBe(Math.round(e.ms * CARGO_TRAVEL.porter));
  });

  it('the room sends packs and the crewed cart along and gives them back on arrival', () => {
    const region = warRegion('test-ridge')!;
    const men = Array.from({ length: 2 }, (_, i) => makePerson(`hl-${i}`, 'militia'));
    const join: JoinMsg = { t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: 1, team: 0, squads: [men.map((m) => m.id)] };
    const a = new WarRoom({ region, seed: 1, cap: 600 });
    a.join(1, join, [men]);
    a.tick();
    const sq = a.squadsOf(1)[0];
    a.giveCargo(1, { squad: sq }, { lots: [{ r: 'iron', n: 15, o: 'siren' }], items: [] });
    const out = a.depart(1, sq, region.entries[0].side, 0);
    if ('error' in out) throw new Error(out.error);
    expect(Object.values(out.cargo!.packs).flatMap((p) => p.lots).reduce((s, l) => s + l.n, 0)).toBe(15);
    const b = new WarRoom({ region, seed: 2, cap: 600 });
    const r = b.arrive(1, 0, men, region.entries[0].side, {}, out.cargo);
    if ('error' in r) throw new Error(r.error);
    expect(b.takeCargo(1, { squad: r.squad }, { iron: 15 })).not.toBeNull();
  });
});

describe('haul', () => {
  it('chains the legs on arrival, the player offline, and reaches the destination', async () => {
    const mid = 'dodona-e', next = WORLD_REGIONS.find((r) => r.id === mid)!.adj.find((x) => x !== 'dodona')!;
    const w = new World(), f = ports();
    const t = await w.transfer(7, 0, { from: 'dodona', to: mid, ids: ['p1'], path: [next] }, T0, f.p);
    if ('error' in t) throw new Error(t.error);
    await w.due(t.arriveAt, f.p);
    expect(f.arrived.map((x) => x.to)).toEqual([mid]);
    // the next leg left at once, in the same pass
    const leg = w.st.transit.find((x) => x.to === next)!;
    expect(leg).toMatchObject({ from: mid, ids: ['p1'] });
    await w.due(leg.arriveAt, f.p);
    expect(f.arrived.map((x) => x.to)).toEqual([mid, next]);
    expect(w.st.transit).toEqual([]);
  });
});

describe('convoys on the world map', () => {
  it('seen by alliances with men in or next to either end; under Safe Roads only at the destination', async () => {
    const w = new World(), f = ports(CARGO);
    await w.transfer(7, 0, { from: 'dodona', to: 'dodona-e', squad: 1 }, T0, f.p);
    await w.transfer(8, 0, { from: 'dodona', to: 'dodona-e', squad: 2 }, T0, f.p, true);
    const far = WORLD_REGIONS.find((r) => hops(r.id, 'dodona') >= 4 && hops(r.id, 'dodona-e') >= 4)!.id;
    const see = (alliance: 0 | 1) => w.convoys(99, alliance).map((c) => c.id);
    expect(see(1)).toEqual([]);
    w.st.regions[far].live[1] = 5;
    expect(see(1)).toEqual([]);
    const nextTo = WORLD_REGIONS.find((r) => r.adj.includes('dodona') && r.id !== 'dodona-e')!.id;
    w.st.regions[nextTo].live[1] = 5;
    expect(see(1)).toEqual([1]); // the plain convoy; Safe Roads hides the other
    w.st.regions['dodona-e'].live[1] = 3;
    expect(see(1)).toEqual([1, 2]);
    expect(w.convoys(7, 0)[0]).toMatchObject({ mine: true, cart: 'wagon', goods: { iron: 10, salt: 60 }, alliance: 0 });
    expect(w.snapshot(7, 0, { members: [0, 0, 0, 0], clans: [0, 0, 0, 0] }, T0).convoys).toHaveLength(2);
  });
});

describe('trade score', () => {
  it('counts goods of an origin >= 3 transfers away, between alliances, at most 60 a day; same alliance nothing', async () => {
    const far = WORLD_REGIONS.find((r) => hops(r.id, 'kleisoura') >= TRADE.hops)!.id, near = WORLD_REGIONS.find((r) => hops(r.id, 'kleisoura') === 1)!.id;
    expect(scoreOf('kleisoura', [{ origin: far, amount: 10 }], 500)).toBe(5);
    expect(scoreOf('kleisoura', [{ origin: near, amount: 10 }], 500)).toBe(0);
    expect(scoreOf('kleisoura', [{ origin: 'kleisoura', amount: 5 }, { origin: far, amount: 5 }], 1000)).toBe(5);
    const a = await devLogin(8301), b = await devLogin(8302), c = await devLogin(8303);
    for (const [p, al] of [[a, 0], [b, 1], [c, 0]] as const) await env.DB!.prepare('INSERT INTO war_alliance_members (season, player_id, alliance, joined_at) VALUES (1, ?1, ?2, 0)').bind(p.playerId, al).run();
    const hook = fillHook(env as unknown as Env), now = Date.now();
    const lots = [{ res: 'iron', origin: far, seal: 0, amount: 100 }];
    expect((await hook({ town: 'kleisoura', seller: a.playerId, buyer: c.playerId, lots, coin: 5000, now })).score).toBe(0); // same alliance
    const s = await hook({ town: 'kleisoura', seller: a.playerId, buyer: b.playerId, lots, coin: 9000, now });
    expect(s.score).toBe(TRADE.cap);
    await env.DB!.batch(s.stmts);
    expect((await hook({ town: 'kleisoura', seller: a.playerId, buyer: b.playerId, lots, coin: 900, now })).score).toBe(0); // capped today
  });
});
