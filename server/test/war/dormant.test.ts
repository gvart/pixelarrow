/**
 * Dormant regions (./regionDO.ts top comment): with armies standing and no socket open the 10 Hz loop stops; the alarm
 * (or a socket, an arrival) runs the missed ticks in one batch, the same sim ticks as live.
 */
import { env, runDurableObjectAlarm, runInDurableObject, SELF } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { NET_VERSION, type ServerMsg } from '../../../src/war/net/protocol';
import { SIM_VERSION } from '../../../src/sim/version';
import { WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';
import { BATCH, BEHIND_MS, DORMANT_MS, MAX_LAG, SLICE, type WarRegionDO } from '../../src/war/regionDO';
import { BASE, devLogin } from '../helpers';

/** The DO's private parts the tests reach into. */
interface Inner { room: WarRoom | null; clockAt: number; timer: unknown }
const inner = (o: WarRegionDO) => o as unknown as Inner;

const stub = (name = 'test-ridge') => env.WAR_REGION.get(env.WAR_REGION.idFromName(name));
const stats = async () => (await (await SELF.fetch(`${BASE}/api/war/test-ridge/stats`)).json<{ tick: number; units: number; online: number; running: boolean; caughtUp: number }>());

async function connect(token: string) {
  const res = await SELF.fetch(`${BASE}/ws/war/test-ridge?sim=${SIM_VERSION}`, { headers: { upgrade: 'websocket', 'sec-websocket-protocol': `pixelarrow.v1, ${token}` } });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  ws.accept();
  const msgs: ServerMsg[] = [];
  ws.addEventListener('message', (e) => {
    if (typeof e.data === 'string') msgs.push(JSON.parse(e.data) as ServerMsg);
  });
  return { ws, msgs };
}

/** A player's dev army parked in test-ridge, his socket closed: the region goes dormant. */
async function parked(pid: number) {
  const me = await devLogin(pid);
  const c = await connect(me.token);
  c.ws.send(JSON.stringify({ t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: me.playerId, team: 0, army: [{ cls: 'hoplite', count: 12 }] }));
  await vi.waitFor(() => expect(c.msgs.some((m) => m.t === 'welcome')).toBe(true), { timeout: 20_000, interval: 20 });
  await vi.waitFor(async () => expect((await stats()).running).toBe(true), { timeout: 20_000, interval: 20 });
  c.ws.close(1000);
  await vi.waitFor(async () => expect(await stats()).toMatchObject({ running: false, online: 0 }), { timeout: 30_000, interval: 50 });
  return me;
}

describe('dormant regions', () => {
  it('an empty region with a parked army stops its loop and sleeps till the next batch', async () => {
    await parked(7601);
    await runInDurableObject(stub(), async (o: WarRegionDO, state) => {
      expect(inner(o).timer).toBeNull();
      const at = await state.storage.getAlarm();
      expect(at).not.toBeNull();
      expect(at! - Date.now()).toBeGreaterThan(DORMANT_MS - 10_000);
      await o.settled();
      expect(await state.storage.get<{ at: number }>('state:meta')).toMatchObject({ at: expect.any(Number) });
    });
    // the alarm: the missed ticks in one batch, then asleep again
    await runInDurableObject(stub(), (o: WarRegionDO) => void (inner(o).clockAt -= 20_000));
    const t0 = (await stats()).tick;
    expect(await runDurableObjectAlarm(stub())).toBe(true);
    const s = await stats();
    expect(s.running).toBe(false);
    expect(s.tick - t0).toBeGreaterThanOrEqual(200);
    expect(s.tick - t0).toBeLessThan(260);
    expect(s.units).toBeGreaterThanOrEqual(12);
  });

  it('a catch-up batch plays the same ticks as the live loop would', async () => {
    const region = warRegion('dodona-s')!;
    const make = () => {
      const r = new WarRoom({ region, seed: 7, cap: 600, wild: true, epoch: 'e' });
      r.join(1, { t: 'join', v: NET_VERSION, region: 'dodona-s', playerId: 1, team: 0, army: [{ cls: 'hoplite', count: 12 }, { cls: 'archer', count: 12 }] });
      r.join(2, { t: 'join', v: NET_VERSION, region: 'dodona-s', playerId: 2, team: 1, army: [{ cls: 'peltast', count: 12 }] });
      r.tick();
      const [a] = r.squadsOf(1), [b] = r.squadsOf(2);
      r.order(1, { kind: 'attack', squad: a, target: b });
      r.order(2, { kind: 'attack', squad: b, target: a });
      r.leave(1);
      r.leave(2);
      return r;
    };
    const live = make();
    await runInDurableObject(stub('dormant-twin'), (o: WarRegionDO) => {
      const room = make();
      inner(o).room = room;
      const now = Date.now();
      inner(o).clockAt = now - 1500 * 100;
      expect(o.catchUp(now)).toBe(0);
      for (let i = 0; i < 1500; i++) live.tick();
      const strip = (r: WarRoom) => JSON.stringify({ ...r.snapshot(), shots: undefined });
      expect(room.currentTick).toBe(live.currentTick);
      expect(strip(room)).toBe(strip(live));
      expect(JSON.stringify(room.saveState().sim)).toBe(JSON.stringify(live.saveState().sim));
      expect(inner(o).clockAt).toBe(now);
      inner(o).room = null;
    });
  });

  it('a long gap runs in batches across alarms; one over MAX_LAG is cut', async () => {
    await parked(7602);
    await runInDurableObject(stub(), (o: WarRegionDO) => void (inner(o).clockAt -= (BATCH + 500) * 100));
    const t0 = (await stats()).tick;
    expect(await runDurableObjectAlarm(stub())).toBe(true);
    expect((await stats()).tick - t0).toBe(BATCH);
    await runInDurableObject(stub(), async (_o: WarRegionDO, state) => expect((await state.storage.getAlarm())! - Date.now()).toBeLessThanOrEqual(BEHIND_MS));
    expect(await runDurableObjectAlarm(stub())).toBe(true);
    expect((await stats()).tick - t0).toBeGreaterThanOrEqual(BATCH + 500);
    expect((await stats()).tick - t0).toBeLessThan(BATCH + 600);
    // asleep for days: no more than MAX_LAG is owed
    await runInDurableObject(stub(), (o: WarRegionDO) => {
      inner(o).clockAt -= 3 * 86_400_000;
      expect(o.catchUp()).toBe(MAX_LAG - BATCH);
    });
  });

  it('a catch-up runs in slices that yield between them', async () => {
    await parked(7604);
    await runInDurableObject(stub(), async (o: WarRegionDO) => {
      const room = inner(o).room!;
      inner(o).clockAt = Date.now() - 1000 * 100;
      const t0 = room.currentTick;
      const run = o.alarm();
      // the first slice ran, then the object yields (a socket or an RPC is served here) before the next
      expect(room.currentTick - t0).toBe(SLICE);
      await run;
      expect(room.currentTick - t0).toBeGreaterThanOrEqual(1000);
      expect(room.currentTick - t0).toBeLessThan(1050);
    });
  });

  it('a socket connecting is let in at once and the region catches up before it runs live', async () => {
    const me = await parked(7603);
    await runInDurableObject(stub(), (o: WarRegionDO) => void (inner(o).clockAt -= 30_000));
    const t0 = (await stats()).tick;
    const c = await connect(me.token);
    c.ws.send(JSON.stringify({ t: 'ping', c: 1 }));
    await vi.waitFor(() => expect(c.msgs.some((m) => m.t === 'pong')).toBe(true), { timeout: 20_000, interval: 20 });
    await vi.waitFor(async () => expect((await stats()).running).toBe(true), { timeout: 20_000, interval: 20 });
    const s = await stats();
    expect(s.tick - t0).toBeGreaterThanOrEqual(300);
    c.ws.close(1000);
    await vi.waitFor(async () => expect((await stats()).running).toBe(false), { timeout: 30_000, interval: 50 });
  });
});
