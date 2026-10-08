import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ONLINE_RULES } from '../../src/online/rules';
import { liveMessages } from '../src/online/live';
import { shardDoName } from '../src/online/store';
import type { DuelHub } from '../src/online/duel';
import { RegionDO } from '../src/region';
import { devLogin } from './helpers';
import { DB, fresh, getJson, join, lineWorld, placeArmy, post, worldOf, wsOnline, type Player, type WsClient } from './onlineHelpers';

beforeEach(fresh);
afterEach(() => vi.restoreAllMocks());

const SIGHT = ONLINE_RULES.sight;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const armyMsgs = (c: WsClient) => c.msgs.filter((m) => String(m.type).startsWith('army_'));

describe('live army messages (pure)', () => {
  const mover = { pid: 1, name: 'A', clan: 7 };
  const world = lineWorld(40);
  const path = [10, 11, 12, 13, 14, 15];
  const at = path.map((_, i) => 1000 + i * 60_000);

  it('cuts a march to the regions each viewer can see', () => {
    const { out, arrival } = liveMessages(
      world,
      mover,
      { kind: 'march', path, at },
      [
        { pid: 2, clan: null, sources: [10 - SIGHT], whole: false }, // sees only the start
        { pid: 3, clan: null, sources: [35], whole: false }, // sees nothing
        { pid: 4, clan: 7, sources: [], whole: true }, // clan mate: everything
        { pid: 5, clan: null, sources: [15 + SIGHT], whole: false }, // sees the end
      ],
      500,
      SIGHT,
    );
    const to = (pid: number) => out.filter((o) => o.to === pid).map((o) => o.msg);
    expect(to(2)).toEqual([{ type: 'army_march', player: 1, name: 'A', clan: 7, path: [10], at: [at[0]], until: [at[1]], now: 500 }]);
    expect(to(3)).toEqual([]);
    expect(to(4)[0]).toMatchObject({ path, at, until: [...at.slice(1), null] });
    expect(to(5)[0]).toMatchObject({ path: [15], at: [at[5]], until: [null] });
    expect(arrival).toEqual({ at: at[5], loc: 15, to: [4, 5], told: [2, 4, 5] });
  });

  it('positions go only to viewers who see the region', () => {
    const { out } = liveMessages(world, mover, { kind: 'pos', pos: 10 }, [
      { pid: 2, clan: null, sources: [10 + SIGHT], whole: false },
      { pid: 3, clan: null, sources: [10 + SIGHT + 1], whole: false },
    ], 9, SIGHT);
    expect(out).toEqual([{ to: 2, msg: { type: 'army_pos', player: 1, name: 'A', clan: 7, loc: 10, now: 9 } }]);
  });
});

const shardStubOf = (p: Player) => env.REGION.get(env.REGION.idFromName(shardDoName({ season: p.profile.season.id, id: p.profile.shard.id })));

/**
 * A march for the mover from `start` to `to` (3+ routes) and a region `watch`
 * that sees the start but not the destination (and is off the route), plus a
 * region `far` that sees nothing of the route.
 */
function plan(p: Player): { start: number; to: number; watch: number; far: number; path: number[] } {
  const w = worldOf(p);
  const land = w.all().filter((r) => r.passable).map((r) => r.id);
  for (const start of land)
    for (const to of land) {
      const route = w.path(start, to);
      if (!route || route.path.length < 4 || route.path.length - 1 > ONLINE_RULES.maxMarch) continue;
      for (const watch of land) {
        if (route.path.includes(watch) || w.hops(watch, start) > SIGHT || w.hops(watch, to) <= SIGHT) continue;
        const alt = w.path(start, to, (r) => r.id !== watch);
        if (!alt || alt.path.join() !== route.path.join()) continue;
        const far = land.find((f) => route.path.every((x) => w.hops(f, x) > SIGHT) && w.hops(f, watch) > SIGHT);
        if (far !== undefined) return { start, to, watch, far, path: route.path };
      }
    }
  throw new Error('no plan');
}

/** Moves players into `p`'s shard with no land of their own (vision only from their army and what the test gives them). */
async function intoShardOf(p: Player, others: Player[], at: number): Promise<void> {
  for (const o of others) {
    await DB().prepare('DELETE FROM online_regions WHERE owner_id = ?1').bind(o.playerId).run();
    await placeArmy(o, at, p.profile.shard.id);
  }
}

describe('live army movement over the shard socket', () => {
  it('pushes marches, halts and arrivals only to players who can see them', async () => {
    const a = await join(9101, 'Mover');
    const b = await join(9102, 'Watcher');
    const d = await join(9104, 'Faraway');
    // C is A's clan mate: sees A's whole march.
    await post('/api/online/clans', a.token, { name: 'Kites', tag: 'KIT' });
    const inv = await post<{ code: string }>('/api/online/clans/invite', a.token);
    const c = await devLogin(9103, 'Mate');
    expect((await post('/api/online/clans/join', c.token, { code: inv.body.code })).status).toBe(200);

    // the map names the neutral holders of each unclaimed region (for its miniatures), never of owned land
    const map = await getJson<{ regions: { owner: number | null; occupant: string; def?: string }[] }>('/api/online/map', a.token);
    expect(map.body.regions.some((h) => h.owner === null && h.occupant === 'npc' && typeof h.def === 'string')).toBe(true);
    expect(map.body.regions.filter((h) => h.owner !== null).every((h) => h.def === undefined)).toBe(true);

    const { start, to, watch, far } = plan(a);
    // A sets out from `start`; B (army and one region at `watch`) sees the start, not where A is going; D sees nothing.
    await placeArmy(a, start);
    await intoShardOf(a, [b], watch);
    await intoShardOf(a, [d], far);
    await DB().prepare('DELETE FROM online_regions WHERE shard_id = ?1 AND loc = ?2').bind(a.profile.shard.id, watch).run();
    await DB()
      .prepare("INSERT INTO online_regions (season_id, shard_id, loc, occupant, owner_id) VALUES (?1, ?2, ?3, 'player', ?4)")
      .bind(a.profile.season.id, a.profile.shard.id, watch, b.playerId)
      .run();
    // C, the clan mate, joins A's shard too (clan land and armies are shared)
    const cp = await getJson<{ shard: { id: number } }>('/api/online/profile', c.token);
    expect(cp.body.shard.id).toBe(a.profile.shard.id);

    const [wa, wb, wc, wd] = await Promise.all([wsOnline(a.token), wsOnline(b.token), wsOnline(c.token), wsOnline(d.token)]);
    await Promise.all([wa, wb, wc, wd].map((w) => w.next('welcome')));

    const m = await post<{ path: number[]; at: number[] }>('/api/online/march', a.token, { loc: to });
    expect(m.status).toBe(200);
    const full = m.body.path;
    const w = worldOf(a);
    const seen = full.map((x, i) => ({ x, i })).filter(({ x }) => w.hops(watch, x) <= SIGHT);

    const mb = await wb.next('army_march');
    expect(mb).toMatchObject({ player: a.playerId, name: 'Mover', clan: expect.any(Number) });
    expect(mb.path).toEqual(seen.map(({ x }) => x));
    expect(mb.at).toEqual(seen.map(({ i }) => m.body.at[i]));
    expect((mb.path as unknown[]).length).toBeLessThan(full.length); // the destination stays in the fog
    expect(mb.path).not.toContain(full[full.length - 1]);

    const mc = await wc.next('army_march');
    expect(mc.path).toEqual(full);
    expect(mc.until).toEqual([...m.body.at.slice(1), null]);
    expect((await wa.next('army_march')).path).toEqual(full);

    // A halts at once (still at the start): B and C see it stand there.
    expect((await post('/api/online/march/stop', a.token)).status).toBe(200);
    expect(await wb.next('army_pos')).toMatchObject({ player: a.playerId, loc: start });
    expect(await wc.next('army_pos')).toMatchObject({ player: a.playerId });

    await sleep(150);
    // D's land is far away: nothing about A ever reached D.
    expect(armyMsgs(wd)).toEqual([]);
    expect(armyMsgs(wb).map((x) => x.type)).toEqual(['army_march', 'army_pos']);

    // Arrivals: the shard announces them at the arrival time to those who see the last region.
    // The test's Date.now() only advances on I/O, so it can lag the shard's clock: pass the
    // move's `now` explicitly (the arrival is in the future for the shard too), let the arrival
    // time pass on the real clock, then run the alarm (the scheduled one may already have fired).
    const stub = shardStubOf(a);
    const t = Date.now();
    await stub.liveMove(a.playerId, [], { at: t + 40, loc: to, to: [c.playerId], told: [b.playerId, c.playerId] }, t);
    await sleep(80);
    await runDurableObjectAlarm(stub);
    expect(await wc.next('army_arrive')).toMatchObject({ player: a.playerId, loc: to });
    await sleep(50);
    expect(armyMsgs(wb).some((x) => x.type === 'army_arrive')).toBe(false);

    // A new march that B cannot see at all hides the old one from B.
    await stub.liveMove(a.playerId, [], { at: Date.now() + 60_000, loc: to, to: [c.playerId], told: [b.playerId, c.playerId] });
    await stub.liveMove(a.playerId, [{ to: c.playerId, msg: { type: 'army_pos', player: a.playerId, name: 'Mover', clan: null, loc: to, now: Date.now() } }], null);
    expect(await wb.next('army_hide')).toMatchObject({ player: a.playerId });

    for (const w of [wa, wb, wc, wd]) w.ws.close(1000);
  });
});

describe('the shard alarm: march arrivals and timed duel deployments share it', () => {
  type Hub = { hub: DuelHub };
  const arrival = (at: number, loc: number, to: number[]) => ({ at, loc, to, told: to });

  /** Two online players in a duel's deployment; returns their sockets, the duel id and its deadline. */
  async function deploying(ids: [number, number]) {
    const a = await join(ids[0], 'Achilles');
    const b = await join(ids[1], 'Hektor');
    if (b.profile.shard.id !== a.profile.shard.id) await placeArmy(b, b.profile.army.loc, a.profile.shard.id);
    const [ca, cb] = await Promise.all([wsOnline(a.token), wsOnline(b.token)]);
    await Promise.all([ca.next('welcome'), cb.next('welcome')]);
    ca.send({ type: 'challenge', to: b.playerId });
    const ch = await cb.next('challenged');
    cb.send({ type: 'challenge_reply', id: ch.id, accept: true });
    const duel = String((await ca.next('duel_start')).duel);
    await cb.next('duel_start');
    const stub = shardStubOf(a);
    const deadline = await runInDurableObject(stub, async (inst: RegionDO, state) => {
      // the shard object is shared by the file's tests: start from no pending arrivals
      await state.storage.delete([...(await state.storage.list({ prefix: 'arrive:' })).keys()]);
      await (inst as unknown as { scheduleAlarm(): Promise<void> }).scheduleAlarm();
      return (inst as unknown as Hub).hub.nextDeadline()!;
    });
    return { a, b, ca, cb, duel, stub, deadline };
  }
  const alarmOf = (stub: DurableObjectStub<RegionDO>) => runInDurableObject(stub, (_i: RegionDO, state) => state.storage.getAlarm());

  it('an arrival that is already due when it reaches the shard is announced at once, not dropped', async () => {
    const a = await join(9201, 'Late');
    const wa = await wsOnline(a.token);
    await wa.next('welcome');
    const stub = shardStubOf(a);
    const t = Date.now();
    await stub.liveMove(a.playerId, [], arrival(t - 5, 3, [a.playerId]), t);
    expect(await wa.next('army_arrive')).toMatchObject({ player: a.playerId, loc: 3 });
    expect(await runInDurableObject(stub, (_i: RegionDO, state) => state.storage.get(`arrive:${a.playerId}`))).toBeUndefined();
    wa.ws.close(1000);
  });

  it('interleaves arrivals with a duel deployment: earliest first, re-armed for the other', async () => {
    const { a, b, ca, cb, duel, stub, deadline } = await deploying([9211, 9212]);
    expect(await alarmOf(stub)).toBe(deadline);

    // An arrival before the deployment ends takes the alarm; one after it does not. (2 s ahead,
    // so the scheduled alarm cannot fire between these checks even if the test's clock lags.)
    const t = Date.now();
    await stub.liveMove(a.playerId, [], arrival(t + 2000, 1, [b.playerId]), t);
    expect(await alarmOf(stub)).toBe(t + 2000);
    await stub.liveMove(b.playerId, [], arrival(deadline + 60_000, 2, [a.playerId]), t);
    expect(await alarmOf(stub)).toBe(t + 2000);

    // the arrival alarm announces A's march and re-arms for the deployment (not B's later arrival);
    // the scheduled alarm may fire by itself first, runDurableObjectAlarm then finds nothing to do
    await sleep(2100);
    await runDurableObjectAlarm(stub);
    expect(await cb.next('army_arrive')).toMatchObject({ player: a.playerId, loc: 1 });
    expect(await alarmOf(stub)).toBe(deadline);
    expect(cb.msgs.some((m) => m.type === 'go')).toBe(false);

    // the deployment runs out: the alarm starts the duel and re-arms for B's arrival
    await runInDurableObject(stub, (inst: RegionDO) => {
      (inst as unknown as Hub).hub.duels.get(duel)!.deployUntil = Date.now() - 1;
    });
    await runDurableObjectAlarm(stub);
    await Promise.all([ca.next('go'), cb.next('go')]);
    expect(await alarmOf(stub)).toBe(deadline + 60_000);
    expect(ca.msgs.some((m) => m.type === 'army_arrive')).toBe(false);

    // a duel message (the hub reschedules) keeps the arrival alarm
    ca.send({ type: 'leave_duel', duel });
    await cb.next('duel_abort');
    expect(await alarmOf(stub)).toBe(deadline + 60_000);
    // B halts: nothing left to wake up for
    await stub.liveMove(b.playerId, [], null);
    expect(await alarmOf(stub)).toBeNull();
    for (const w of [ca, cb]) w.ws.close(1000);
  });

  it('an arrival and a deployment survive the shard object being evicted; the woken object starts and announces them', async () => {
    const { a, b, ca, cb, duel, stub, deadline } = await deploying([9221, 9222]);
    const t = Date.now();
    const later = deadline + 60_000;
    await stub.liveMove(a.playerId, [], arrival(later, 4, [b.playerId]), t);
    expect(await alarmOf(stub)).toBe(deadline);
    // A fresh RegionDO on the same storage (what an evicted object wakes up as) runs the alarms;
    // time passing is simulated by moving the deadlines into the past.
    await runInDurableObject(stub, async (_i: RegionDO, state) => {
      const woken = new RegionDO(state, env as never);
      await state.blockConcurrencyWhile(async () => undefined);
      const hub = (woken as unknown as Hub).hub;
      expect(hub.nextDeadline()).toBe(deadline);
      hub.duels.get(duel)!.deployUntil = Date.now() - 1;
      await woken.alarm();
      expect(await state.storage.getAlarm()).toBe(later);
      const key = `arrive:${a.playerId}`;
      await state.storage.put(key, { ...(await state.storage.get<object>(key)), at: Date.now() - 1 });
      await woken.alarm();
      expect(await state.storage.getAlarm()).toBeNull();
    });
    await Promise.all([ca.next('go'), cb.next('go')]);
    expect(await cb.next('army_arrive')).toMatchObject({ player: a.playerId, loc: 4 });
    ca.send({ type: 'leave_duel', duel });
    await cb.next('duel_abort');
    for (const w of [ca, cb]) w.ws.close(1000);
  });
});
