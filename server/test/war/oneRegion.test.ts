/**
 * W-87 one region, W-97 offline men, W-98 waiting and wounded men (docs/WAR.md "One region"): a transfer moves the whole
 * group, a join never puts his men in two places, a raised man waits at home, the wounded ride along.
 */
import { env, runInDurableObject, SELF } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { NET_VERSION, type ServerMsg } from '../../../src/war/net/protocol';
import { transferSchema, type TransitCargo } from '../../../src/war/net/world';
import { SIM_VERSION } from '../../../src/sim/version';
import { edge, WORLD_REGIONS } from '../../../src/war/world';
import { ALLIANCES } from '../../../src/war/world/alliances';
import { makePerson } from '../../../src/war/sim/roster';
import type { FightReport } from '../../../src/war/types';
import { WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';
import { applyFight, claimForJoin, HEAL, insertPerson, movePerson, personOf, type PersonRow } from '../../src/war/persons';
import { regionStub } from '../../src/war/placement';
import { CARGO_TRAVEL, World, type ArriveResult, type Ports } from '../../src/war/world/world';
import { api, BASE, devLogin } from '../helpers';
import type { WarRegionDO } from '../../src/war/regionDO';

const T0 = 3_000_000;
const DB = () => env.DB!;
const HOME = ALLIANCES[0].home;
const NEXT = WORLD_REGIONS.find((r) => r.id === HOME)!.adj[0];
const FAR = WORLD_REGIONS.find((r) => r.id === NEXT)!.adj.find((x) => x !== HOME)!;
const men = (prefix: string, n: number, cls = 'militia') => Array.from({ length: n }, (_, i) => makePerson(`${prefix}-${i}`, cls));

interface FakeOpts { cargo?: TransitCargo; online?: boolean; full?: () => boolean; refuse?: () => boolean }
function fakes(o: FakeOpts = {}) {
  const arrived: { to: string; ids: string[]; cargo?: TransitCargo }[] = [];
  const left: string[] = [];
  const online = { now: o.online ?? true };
  const p: Ports = {
    depart: async (from) => (o.refuse?.() ? { error: 'foes', detail: 'a foe near' } : (left.push(from), { ids: ['a', 'b'], off: 0, ...(o.cargo ? { cargo: o.cargo } : {}) })),
    arrive: async (to, _p, _a, ids, _s, _l, cargo): Promise<ArriveResult> => {
      if (o.full?.()) return { error: 'full' };
      arrived.push({ to, ids, ...(cargo ? { cargo } : {}) });
      return { ok: true };
    },
    online: () => online.now,
  };
  return { p, arrived, left, online };
}

describe('the transfer order', () => {
  it('names no men: ids and squads are refused, a haul path stays', () => {
    expect(transferSchema.safeParse({ from: HOME, to: NEXT }).success).toBe(true);
    expect(transferSchema.safeParse({ from: HOME, to: NEXT, path: [FAR] }).success).toBe(true);
    expect(transferSchema.safeParse({ from: HOME, to: NEXT, ids: ['a'] }).success).toBe(false);
    expect(transferSchema.safeParse({ from: HOME, to: NEXT, squad: 1 }).success).toBe(false);
  });
});

describe('the group on the road', () => {
  it('one transit a player: a second order while he is on the road is refused and asks no room', async () => {
    const w = new World(), f = fakes();
    expect(await w.transfer(7, 0, { from: HOME, to: NEXT }, T0, f.p)).toMatchObject({ men: 2, state: 'moving' });
    expect(await w.transfer(7, 0, { from: HOME, to: NEXT }, T0 + 1, f.p)).toMatchObject({ error: 'onRoad' });
    expect(f.left).toEqual([HOME]);
    expect(await w.transfer(8, 0, { from: HOME, to: NEXT }, T0 + 1, f.p)).toMatchObject({ state: 'moving' }); // another player's own
  });

  it('a full quota: the whole group waits at the border, cart and all, and comes in together', async () => {
    let full = true;
    const cargo: TransitCargo = { packs: { a: { lots: [{ r: 'iron', n: 5, o: 'x' }], items: [] } }, carts: [{ type: 'handcart', lots: [{ r: 'wood', n: 30, o: 'x' }], items: [] }] };
    const w = new World(), f = fakes({ cargo, full: () => full });
    const t = await w.transfer(7, 0, { from: HOME, to: NEXT }, T0, f.p);
    if ('error' in t) throw new Error(t.error);
    await w.due(t.arriveAt, f.p);
    expect(w.st.transit).toHaveLength(1);
    expect(w.st.transit[0]).toMatchObject({ state: 'queued', ids: ['a', 'b'] });
    expect(await w.transfer(7, 0, { from: NEXT, to: HOME }, t.arriveAt + 1, f.p)).toMatchObject({ error: 'onRoad' }); // he stands at no field
    full = false;
    await w.due(w.st.transit[0].retryAt!, f.p);
    expect(f.arrived).toEqual([{ to: NEXT, ids: ['a', 'b'], cargo }]);
    expect(w.st.transit).toEqual([]);
  });

  it('one group speed: the slowest thing it brings sets the time for all of it', async () => {
    const e = edge(HOME, NEXT)!;
    const time = async (cargo?: TransitCargo) => {
      const t = await new World().transfer(7, 0, { from: HOME, to: NEXT }, T0, fakes({ cargo }).p);
      if ('error' in t) throw new Error(t.error);
      return t.arriveAt - T0;
    };
    const wagon = { type: 'wagon' as const, lots: [], items: [] }, handcart = { type: 'handcart' as const, lots: [], items: [] };
    const loaded = { a: { lots: [{ r: 'iron', n: 10, o: 'x' }], items: [] } };
    expect(await time()).toBe(e.ms);
    expect(await time({ packs: loaded })).toBe(Math.round(e.ms * CARGO_TRAVEL.porter));
    expect(await time({ packs: {}, carts: [handcart, wagon] })).toBe(Math.round(e.ms * CARGO_TRAVEL.wagon));
    expect(await time({ packs: loaded, carts: [wagon] })).toBe(Math.round(e.ms * CARGO_TRAVEL.wagon)); // not both factors
  });
});

describe('W-97 haul with the player offline', () => {
  const chain = async (online: boolean) => {
    const w = new World(), f = fakes({ online });
    const t = await w.transfer(7, 0, { from: HOME, to: NEXT, path: [FAR] }, T0, f.p);
    if ('error' in t) throw new Error(t.error);
    return { w, f, t };
  };

  it('a leg already started finishes; no new leg starts; he is back: the chain goes on', async () => {
    const { w, f, t } = await chain(false);
    await w.due(t.arriveAt, f.p);
    expect(f.arrived.map((x) => x.to)).toEqual([NEXT]); // the leg under way finished
    expect(f.left).toEqual([HOME]); // no new one started
    expect(w.st.transit).toEqual([]);
    expect(w.nextDue()).toBeNull(); // it costs no alarm while he is away
    await w.due(t.arriveAt + 3_600_000, f.p);
    expect(f.left).toEqual([HOME]);
    f.online.now = true;
    expect(w.wake(7, t.arriveAt + 3_600_000)).toBe(true);
    expect(w.nextDue()).toBe(t.arriveAt + 3_600_000);
    await w.due(t.arriveAt + 3_600_000, f.p);
    expect(f.left).toEqual([HOME, NEXT]);
    expect(w.wake(7, t.arriveAt + 3_600_001)).toBe(false); // nothing left to wake
  });

  it('online it chains at once; a new order of his replaces a chain waiting at a stop', async () => {
    const a = await chain(true);
    await a.w.due(a.t.arriveAt, a.f.p);
    expect(a.f.left).toEqual([HOME, NEXT]);
    const b = await chain(false);
    await b.w.due(b.t.arriveAt, b.f.p);
    expect(b.w.st.hauls).toHaveLength(1);
    expect(await b.w.transfer(7, 0, { from: NEXT, to: HOME }, b.t.arriveAt + 5, b.f.p)).toMatchObject({ to: HOME });
    expect(b.w.st.hauls).toEqual([]);
  });
});

describe('WarRoom: the whole group leaves or nobody does', () => {
  const region = { ...warRegion('test-ridge')!, id: NEXT };
  const room = () => new WarRoom({ region, seed: 5, cap: 600 });
  const join = (r: WarRoom, groups: ReturnType<typeof men>[]) => r.join(1, { t: 'join', v: NET_VERSION, region: NEXT, playerId: 1, team: 0, squads: groups.map((g) => g.map((p) => p.id)) }, groups);
  /** Walk squad `s` away and return it there. */
  const walk = (r: WarRoom, s: number, x: number, y: number) => {
    expect(r.order(1, { kind: 'move', squad: s, x, y })).toBeNull();
    for (let i = 0; i < 2000 && !r.snapshot().units.some((u) => u.squad === s && Math.hypot(u.x - x, u.y - y) < 3); i++) r.tick();
  };
  const side = () => region.entries[0].side;

  it('every man of every squad, every cart of his crewed or not', () => {
    const r = room(), a = men('a', 3), b = men('b', 2);
    join(r, [a, b]);
    r.tick();
    const [sa] = r.squadsOf(1), u0 = r.snapshot().units[0];
    r.sim.spawnCart(0, 'p:1', 'wagon', u0.x, u0.y, sa);
    const lone = r.sim.spawnCart(0, 'p:1', 'handcart', u0.x + 4, u0.y);
    r.giveCargo(1, { cart: lone }, { lots: [{ r: 'wood', n: 30, o: 'x' }], items: [] });
    const out = r.depart(1, side(), 20);
    if ('error' in out) throw new Error(out.error);
    expect(out.ids.sort()).toEqual([...a, ...b].map((p) => p.id).sort());
    expect(out.cargo!.carts!.map((c) => c.type).sort()).toEqual(['handcart', 'wagon']);
    expect(out.cargo!.carts!.find((c) => c.type === 'handcart')!.lots).toMatchObject([{ r: 'wood', n: 30 }]);
    r.tick();
    expect(r.squadsOf(1)).toEqual([]);
    expect(r.snapshot().sieges?.filter((e) => e.state !== 'destroyed') ?? []).toEqual([]);
    expect(r.depart(1, side(), 20)).toMatchObject({ error: 'notOwner' }); // nobody of his stands here now
  });

  it('a foe within the radius of any one man holds them all, however far the others stand', () => {
    const r = room(), a = men('a', 2), b = men('b', 2);
    join(r, [a, b]);
    r.tick();
    const [sa, sb] = r.squadsOf(1);
    const e = r.snapshot().units.find((u) => u.squad === sa)!;
    walk(r, sb, Math.min(region.w - 10, e.x + 150), Math.min(region.h - 10, e.y + 150));
    const lone = r.snapshot().units.find((u) => u.squad === sb && u.state !== 'dead')!;
    r.sim.spawnSquad('f', 1, 'hoplite', 1, lone.x + 15, lone.y);
    expect(r.depart(1, side(), 20)).toMatchObject({ error: 'foes' });
    expect(r.squadsOf(1)).toEqual([sa, sb]); // nobody left
    expect('error' in r.depart(1, side(), 14)).toBe(false); // the same foe, further than the radius
  });

  it('the furthest man sets the off-exit time, not the middle of the group', () => {
    const r = room(), a = men('a', 2), b = men('b', 2);
    join(r, [a, b]);
    r.tick();
    const [, sb] = r.squadsOf(1);
    const e = r.snapshot().units[0];
    walk(r, sb, Math.min(region.w - 10, e.x + 100), e.y);
    const units = r.snapshot().units.filter((u) => u.state !== 'dead');
    const zone = region.entries.find((x) => x.side === side())!;
    const off = (x: number, y: number) => Math.hypot(Math.max(zone.x - x, 0, x - zone.x - zone.w), Math.max(zone.y - y, 0, y - zone.y - zone.h));
    const far = Math.max(...units.map((u) => off(u.x, u.y)));
    const out = r.depart(1, side(), 0);
    if ('error' in out) throw new Error(out.error);
    expect(out.off).toBeCloseTo(far, 5);
  });

  it('a man down holds the group: nobody is left lying on the field', () => {
    const r = room(), a = men('a', 2);
    join(r, [a]);
    r.tick();
    const snap = r.sim.snapshot.bind(r.sim);
    const spy = vi.spyOn(r.sim, 'snapshot').mockImplementation(() => {
      const s = snap();
      return { ...s, units: s.units.map((u, i) => (i === 0 ? { ...u, state: 'dead' as const, down: true } : u)) };
    });
    expect(r.depart(1, side(), 20)).toMatchObject({ error: 'down' });
    spy.mockRestore();
  });

  it('nothing is lost with a man gone from the road: his pack comes in with the others', () => {
    const r = room(), a = men('a', 2);
    const cargo: TransitCargo = { packs: { 'gone-0': { lots: [{ r: 'iron', n: 40, o: 'x' }], items: [] } } };
    const got = r.arrive(1, 0, a, side(), {}, cargo);
    if ('error' in got) throw new Error(got.error);
    expect(r.takeCargo(1, { squad: got.squad }, { iron: 40 })).not.toBeNull();
  });

  it('civilians and soldiers come in as squads of their own, so a worker stays a worker', () => {
    const r = room(), a = [...men('s', 2, 'hoplite'), ...men('c', 1, 'civ_cook')];
    expect('error' in r.arrive(1, 0, a, side())).toBe(false);
    const snap = r.snapshot();
    expect(snap.squads.filter((s) => r.squadsOf(1).includes(s.id)).map((s) => !!s.civ).sort()).toEqual([false, true]);
  });

  it('W-97: offline, a soldier at work keeps his order; idle men hold', () => {
    const r = room(), a = men('a', 2);
    join(r, [a]);
    r.tick();
    const [s] = r.squadsOf(1);
    const snap = r.sim.snapshot.bind(r.sim);
    const spy = vi.spyOn(r.sim, 'snapshot').mockImplementation(() => {
      const x = snap();
      return { ...x, squads: x.squads.map((q) => (q.id === s ? { ...q, order: 'gather' } : q)) };
    });
    r.tick();
    const set = vi.spyOn((r as unknown as { bots: { set: (...a: unknown[]) => void } }).bots, 'set');
    r.leave(1);
    expect(set).not.toHaveBeenCalled();
    spy.mockRestore();
    const r2 = room(), b = men('b', 2);
    join(r2, [b]);
    r2.tick();
    const set2 = vi.spyOn((r2 as unknown as { bots: { set: (...a: unknown[]) => void } }).bots, 'set');
    r2.leave(1);
    expect(set2).toHaveBeenCalledOnce();
  });

  it('muster: men off the field fall in beside the group; a full quota leaves them waiting', () => {
    const r = room(), a = men('a', 2), b = men('b', 1);
    join(r, [a]);
    r.tick();
    const c = r.snapshot().units[0];
    expect(r.muster(1, b)).not.toBeNull();
    const man = r.sim.snapshot().units.find((u) => u.pid === b[0].id)!;
    expect(Math.hypot(man.x - c.x, man.y - c.y)).toBeLessThan(12);
    const small = new WarRoom({ region, seed: 5, cap: 8 });
    small.join(1, { t: 'join', v: NET_VERSION, region: NEXT, playerId: 1, team: 0, squads: [a.map((p) => p.id)] }, [a]);
    expect(small.muster(1, men('x', small.quota().per[0]))).toBeNull();
    expect(room().muster(1, b)).toBeNull(); // nobody by that id in the room
  });
});

describe('claims: one place in D1', () => {
  const seedMen = async (id: number, alliance?: number) => {
    const me = await devLogin(id);
    if (alliance !== undefined) await api('/api/war/world/dev/alliance', { method: 'POST', token: me.token, json: { alliance } });
    await api('/api/war/dev/seed', { method: 'POST', token: me.token, json: {} });
    const rows = (await DB().prepare("SELECT id FROM war_persons WHERE player_id = ?1 AND state = 'active' ORDER BY slot").bind(me.playerId).all<{ id: string }>()).results.map((x) => x.id);
    return { me, ids: rows };
  };
  const row = (id: string) => DB().prepare('SELECT * FROM war_persons WHERE id = ?1').bind(id).first<PersonRow>();

  it('men in one region: a claim anywhere else is refused, a claim on the road too', async () => {
    const { me, ids } = await seedMen(7601);
    expect(Array.isArray(await claimForJoin(DB(), me.playerId, 'test-ridge', [ids.slice(0, 2)], new Set(), Date.now()))).toBe(true);
    expect(await claimForJoin(DB(), me.playerId, 'elsewhere', [ids.slice(2, 4)], new Set(), Date.now())).toMatch(/Your group is in test-ridge/);
    expect(Array.isArray(await claimForJoin(DB(), me.playerId, 'test-ridge', [ids.slice(2, 4)], new Set(), Date.now()))).toBe(true);
    await DB().prepare("UPDATE war_persons SET region = '>elsewhere' WHERE region = 'test-ridge' AND player_id = ?1").bind(me.playerId).run();
    expect(await claimForJoin(DB(), me.playerId, 'elsewhere', [ids.slice(4, 6)], new Set(), Date.now())).toMatch(/on the road/);
    expect(await claimForJoin(DB(), me.playerId, 'test-ridge', [ids.slice(4, 6)], new Set(), Date.now())).toMatch(/on the road/);
  });

  it('a man at home takes the field only at home: no walking into a far region from the roster', async () => {
    const { me, ids } = await seedMen(7602, 0);
    expect(await claimForJoin(DB(), me.playerId, NEXT, [ids], new Set(), Date.now())).toMatch(/at home/);
    expect((await row(ids[0]))!.region).toBeNull();
    expect(Array.isArray(await claimForJoin(DB(), me.playerId, HOME, [ids], new Set(), Date.now()))).toBe(true);
    expect((await row(ids[0]))!.region).toBe(HOME);
  });

  it('W-98: the wounded stay in the group: he lies where the group is, and holds it there', async () => {
    const { me, ids } = await seedMen(7603);
    const got = await claimForJoin(DB(), me.playerId, 'test-ridge', [ids.slice(0, 2)], new Set(), Date.now());
    if (typeof got === 'string') throw new Error(got);
    const report: FightReport = { tick: 5, persons: [{ pid: ids[0], owner: `p:${me.playerId}`, team: 0, state: 'wounded', xp: 0, kills: 0, dmg: 0, levelUps: 0, hero: got[0][0].hero }], loot: {} };
    const now = Date.now();
    expect(await applyFight(DB(), 'one-region:1', 'test-ridge', report, now)).toBe(true);
    expect(await row(ids[0])).toMatchObject({ state: 'wounded', region: 'test-ridge', until_at: now + HEAL.field });
    // his own timer ends: he is fit again, there; the room takes him back by a claim for that region only
    await DB().prepare('UPDATE war_persons SET until_at = 1 WHERE id = ?1').bind(ids[0]).run();
    expect(await claimForJoin(DB(), me.playerId, 'elsewhere', [[ids[0]]], new Set(), Date.now())).toMatch(/Your group is in/);
    expect(await claimForJoin(DB(), me.playerId, 'test-ridge', [[ids[0]]], new Set([ids[1]]), Date.now())).toSatisfy(Array.isArray);
    expect((await row(ids[0]))!.state).toBe('active');
  });

  it('W-98: an all-wounded group still holds its place: a raised man waits at home until they heal', async () => {
    const { me, ids } = await seedMen(7604, 0);
    await DB().prepare("UPDATE war_persons SET region = ?2, state = 'wounded', until_at = ?3 WHERE player_id = ?1").bind(me.playerId, NEXT, Date.now() + HEAL.field).run();
    const raised = makePerson('raised-7604', 'militia');
    await insertPerson(DB(), me.playerId, raised, 'active', null, Date.now()).run();
    expect(await claimForJoin(DB(), me.playerId, HOME, [[raised.id]], new Set(), Date.now())).toMatch(/Your group is in/);
    expect(await claimForJoin(DB(), me.playerId, NEXT, [[ids[0]]], new Set(), Date.now())).toMatch(/wounded/); // still lying there
  });

  it('W-98: a captive who joins waits at home, off the field', async () => {
    const { me, ids } = await seedMen(7605);
    await claimForJoin(DB(), me.playerId, 'test-ridge', [ids], new Set(), Date.now());
    await DB().prepare("UPDATE war_persons SET state = 'dead', region = NULL WHERE player_id = ?1 AND id != ?2").bind(me.playerId, ids[0]).run();
    const foe = await devLogin(7606);
    const cap = makePerson('cap-7606', 'hoplite');
    await insertPerson(DB(), foe.playerId, cap, 'captive', null, Date.now()).run();
    expect(await movePerson(DB(), cap.id, me.playerId, { from: 'captive', region: null }, Date.now())).toBe(true);
    expect(await row(cap.id)).toMatchObject({ player_id: me.playerId, state: 'active', region: null });
    expect(await claimForJoin(DB(), me.playerId, 'elsewhere', [[cap.id]], new Set(), Date.now())).toMatch(/Your group is in/);
    expect(personOf((await row(cap.id))!).hero.cls).toBe('hoplite');
  });
});

describe('the rooms end to end', () => {
  async function connect(token: string, region: string) {
    const res = await SELF.fetch(`${BASE}/ws/war/${region}?sim=${SIM_VERSION}`, { headers: { upgrade: 'websocket', 'sec-websocket-protocol': `pixelarrow.v1, ${token}` } });
    expect(res.status).toBe(101);
    const ws = res.webSocket!;
    ws.accept();
    const msgs: ServerMsg[] = [];
    ws.addEventListener('message', (e) => {
      if (typeof e.data === 'string') msgs.push(JSON.parse(e.data) as ServerMsg);
    });
    const next = async (pred: (m: ServerMsg) => boolean, ms = 20_000) => {
      for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 20))) {
        const i = msgs.findIndex(pred);
        if (i >= 0) return msgs.splice(i, 1)[0];
      }
      throw new Error(`timeout: ${JSON.stringify(msgs.map((m) => m.t))}`);
    };
    return { send: (m: unknown) => ws.send(JSON.stringify(m)), next, close: () => ws.close(1000) };
  }
  const stub = (region: string) => regionStub(env, region);
  const where = async (pid: number) => Object.fromEntries((await DB().prepare("SELECT id, region FROM war_persons WHERE player_id = ?1 AND state IN ('active', 'wounded')").bind(pid).all<{ id: string; region: string | null }>()).results.map((r) => [r.id, r.region]));
  const answer = (m: ServerMsg) => m.t === 'welcome' || m.t === 'refused';
  /** The live room of a region (off the wire): who is on the field; a man carried off it (his fight is over). */
  const inRoom = <T>(region: string, fn: (room: WarRoom, o: { pollMuster(r: WarRoom): Promise<void> }) => T | Promise<T>) =>
    runInDurableObject(stub(region), async (o: WarRegionDO) => {
      const x = o as unknown as { room: WarRoom; pollMuster(r: WarRoom): Promise<void> };
      return fn(x.room, x);
    });
  const field = (region: string) => inRoom(region, (r) => [...r.personsHere()]);
  const carryOff = (region: string, id: string) => inRoom(region, (r) => (r.sim.dropPersons([id]), void r.tick()));

  it('the wounded ride with the group; a man raised while it is away waits at home and falls in when it comes home', async () => {
    const me = await devLogin(7610);
    await api('/api/war/world/dev/alliance', { method: 'POST', token: me.token, json: { alliance: 0 } });
    await api('/api/war/dev/seed', { method: 'POST', token: me.token, json: { squad: [{ cls: 'hoplite' }, { cls: 'hoplite' }, { cls: 'hoplite' }] } });
    const ids = Object.keys(await where(me.playerId));
    const a = await connect(me.token, HOME);
    a.send({ t: 'join', v: NET_VERSION, region: HOME, playerId: me.playerId, team: 0, squads: [ids.slice(0, 2)] });
    expect(await a.next(answer)).toMatchObject({ t: 'welcome' });
    // the join's muster brought the man it did not name: at home nobody waits while the group is there
    await a.next((m) => m.t === 'welcome');
    expect(Object.values(await where(me.playerId))).toEqual([HOME, HOME, HOME]);
    a.close();

    // one is wounded where he stands, off the field (his fight is over); the others leave and take him along
    const side = edge(HOME, NEXT)!;
    await DB().prepare("UPDATE war_persons SET state = 'wounded', until_at = ?2 WHERE id = ?1").bind(ids[2], Date.now() + HEAL.field).run();
    await carryOff(HOME, ids[2]);
    const out = await stub(HOME).depart(HOME, me.playerId, side.sideA, NEXT, 0);
    if ('error' in out) throw new Error(out.error);
    expect(out.ids.sort()).toEqual([...ids].sort());
    expect(new Set(Object.values(await where(me.playerId)))).toEqual(new Set([`>${NEXT}`]));
    expect(await stub(NEXT).arrive(NEXT, me.playerId, 0, out.ids, side.sideB, {}, undefined)).toEqual({ ok: true });
    expect(new Set(Object.values(await where(me.playerId)))).toEqual(new Set([NEXT]));
    expect((await DB().prepare('SELECT state FROM war_persons WHERE id = ?1').bind(ids[2]).first())).toEqual({ state: 'wounded' });

    // raised at home while the group is away: he waits, and a join of him is refused
    const raised = makePerson('raised-7610', 'militia');
    await insertPerson(DB(), me.playerId, raised, 'active', null, Date.now()).run();
    const c = await connect(me.token, HOME);
    c.send({ t: 'join', v: NET_VERSION, region: HOME, playerId: me.playerId, team: 0, squads: [[raised.id]] });
    expect(await c.next(answer)).toMatchObject({ t: 'refused', detail: expect.stringMatching(/Your group is in/) });
    c.close();
    expect((await where(me.playerId))[raised.id]).toBeNull();

    // the group comes home: he falls in; the wounded man's timer is up on the road: he walks in too
    await DB().prepare('UPDATE war_persons SET until_at = 1 WHERE id = ?1').bind(ids[2]).run();
    const back = edge(NEXT, HOME)!;
    const out2 = await stub(NEXT).depart(NEXT, me.playerId, back.sideA, HOME, 0);
    if ('error' in out2) throw new Error(out2.error);
    expect(await stub(HOME).arrive(HOME, me.playerId, 0, out2.ids, back.sideB, {}, undefined)).toEqual({ ok: true });
    const end = await where(me.playerId);
    expect(new Set(Object.values(end))).toEqual(new Set([HOME]));
    expect(end[raised.id]).toBe(HOME);
    expect((await field(HOME)).sort()).toEqual([...ids, raised.id].sort());
  });

  it('his group all wounded in a foe-held region: he may still come back to it, and a man who healed rises there', async () => {
    const me = await devLogin(7612);
    await api('/api/war/world/dev/alliance', { method: 'POST', token: me.token, json: { alliance: 0 } });
    await api('/api/war/dev/seed', { method: 'POST', token: me.token, json: { squad: [{ cls: 'hoplite' }] } });
    const [id] = Object.keys(await where(me.playerId));
    const foeHome = ALLIANCES[1].home;
    await stub(foeHome).depart(foeHome, me.playerId, edge(foeHome, WORLD_REGIONS.find((r) => r.id === foeHome)!.adj[0])!.sideA, NEXT, 0); // wakes the room; nobody of his there
    await DB().prepare("UPDATE war_persons SET region = ?2, state = 'wounded', until_at = 1 WHERE id = ?1").bind(id, foeHome).run();
    const c = await connect(me.token, foeHome);
    c.send({ t: 'join', v: NET_VERSION, region: foeHome, playerId: me.playerId, team: 0, squads: [['none']] });
    expect(await c.next(answer)).toMatchObject({ t: 'welcome' });
    await c.next((m) => m.t === 'welcome');
    expect(await field(foeHome)).toContain(id);
    c.close();
  });

  it('he cannot dismiss a man on the road: nothing happens there', async () => {
    const me = await devLogin(7613);
    await api('/api/war/dev/seed', { method: 'POST', token: me.token, json: { squad: [{ cls: 'hoplite' }] } });
    const [id] = Object.keys(await where(me.playerId));
    await DB().prepare("UPDATE war_persons SET region = '>x' WHERE id = ?1").bind(id).run();
    const r = await api(`/api/war/persons/${id}/dismiss`, { method: 'POST', token: me.token, json: {} });
    expect(await r.json()).toMatchObject({ error: { code: 'on_road' } });
  });

  it('a healed man rises by the poll, with the group, offline too', async () => {
    const me = await devLogin(7611);
    await api('/api/war/world/dev/alliance', { method: 'POST', token: me.token, json: { alliance: 0 } });
    await api('/api/war/dev/seed', { method: 'POST', token: me.token, json: { squad: [{ cls: 'hoplite' }, { cls: 'hoplite' }] } });
    const ids = Object.keys(await where(me.playerId));
    const a = await connect(me.token, HOME);
    a.send({ t: 'join', v: NET_VERSION, region: HOME, playerId: me.playerId, team: 0, squads: [ids] });
    expect(await a.next(answer)).toMatchObject({ t: 'welcome' });
    a.close();
    await carryOff(HOME, ids[1]);
    await DB().prepare("UPDATE war_persons SET state = 'wounded', until_at = 1 WHERE id = ?1").bind(ids[1]).run();
    await inRoom(HOME, (r, o) => o.pollMuster(r));
    expect(await field(HOME)).toContain(ids[1]);
    expect((await DB().prepare('SELECT state, region FROM war_persons WHERE id = ?1').bind(ids[1]).first())).toEqual({ state: 'active', region: HOME });
  });
});
