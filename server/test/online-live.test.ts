import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findHexPath, hexDistance, HEX_DIRS, type Axial } from '../../src/online/hex';
import { liveMessages } from '../src/online/live';
import { shardDoName } from '../src/online/store';
import type { DuelHub } from '../src/online/duel';
import { RegionDO } from '../src/region';
import { devLogin } from './helpers';
import { DB, fresh, getJson, join, post, wsOnline, type Player, type WsClient } from './onlineHelpers';

beforeEach(fresh);
afterEach(() => vi.restoreAllMocks());

const SIGHT = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const armyMsgs = (c: WsClient) => c.msgs.filter((m) => String(m.type).startsWith('army_'));

describe('live army messages (pure)', () => {
  const mover = { pid: 1, name: 'A', clan: 7 };
  const path: Axial[] = [0, 1, 2, 3, 4, 5].map((q) => ({ q, r: 0 }));
  const at = path.map((_, i) => 1000 + i * 60_000);

  it('cuts a march to the hexes each viewer can see', () => {
    const { out, arrival } = liveMessages(
      mover,
      { kind: 'march', path, at },
      [
        { pid: 2, clan: null, sources: [{ q: -3, r: 0 }], whole: false }, // sees only the start
        { pid: 3, clan: null, sources: [{ q: 20, r: 0 }], whole: false }, // sees nothing
        { pid: 4, clan: 7, sources: [], whole: true }, // clan mate: everything
        { pid: 5, clan: null, sources: [{ q: 8, r: 0 }], whole: false }, // sees the end
      ],
      500,
      SIGHT,
    );
    const to = (pid: number) => out.filter((o) => o.to === pid).map((o) => o.msg);
    expect(to(2)).toEqual([{ type: 'army_march', player: 1, name: 'A', clan: 7, path: [[0, 0]], at: [at[0]], until: [at[1]], now: 500 }]);
    expect(to(3)).toEqual([]);
    expect(to(4)[0]).toMatchObject({ path: path.map((h) => [h.q, h.r]), at, until: [...at.slice(1), null] });
    expect(to(5)[0]).toMatchObject({ path: [[5, 0]], at: [at[5]], until: [null] });
    expect(arrival).toEqual({ at: at[5], q: 5, r: 0, to: [4, 5], told: [2, 4, 5] });
  });

  it('positions go only to viewers who see the hex', () => {
    const { out } = liveMessages(mover, { kind: 'pos', pos: { q: 0, r: 0 } }, [
      { pid: 2, clan: null, sources: [{ q: 3, r: 0 }], whole: false },
      { pid: 3, clan: null, sources: [{ q: 4, r: 0 }], whole: false },
    ], 9, SIGHT);
    expect(out).toEqual([{ to: 2, msg: { type: 'army_pos', player: 1, name: 'A', clan: 7, q: 0, r: 0, now: 9 } }]);
  });
});

const shardStubOf = (p: Player) => env.REGION.get(env.REGION.idFromName(shardDoName({ season: p.profile.season.id, id: p.profile.shard.id })));

async function shardSeed(p: Player): Promise<number> {
  const row = await DB().prepare('SELECT seed FROM online_shards WHERE season_id = ?1 AND id = ?2').bind(p.profile.season.id, p.profile.shard.id).first<{ seed: number }>();
  return row!.seed;
}

/**
 * A march target 4 hexes from home (passable path) and a hex on the far side of home for a
 * watcher, whose own home (`watcherHome`) must not see the target either.
 */
async function plan(p: Player, watcherHome: Axial): Promise<{ to: Axial; watch: Axial; path: Axial[] }> {
  const seed = await shardSeed(p);
  const h = p.profile.home;
  for (let i = 0; i < 6; i++) {
    const d = HEX_DIRS[i];
    const o = HEX_DIRS[(i + 3) % 6];
    const to = { q: h.q + d.q * 4, r: h.r + d.r * 4 };
    const watch = { q: h.q + o.q * 3, r: h.r + o.r * 3 };
    const path = findHexPath(seed, h, to, () => true, 8000, p.profile.shard.radius);
    if (path && path.length <= 7 && path.every((x) => hexDistance(x, watch) >= 3) && hexDistance(to, watcherHome) > SIGHT && hexDistance(to, watch) > SIGHT) return { to, watch, path };
  }
  throw new Error('no plan');
}

describe('live army movement over the shard socket', () => {
  it('pushes marches, halts and arrivals only to players who can see them', { timeout: 30_000 }, async () => {
    const a = await join(9101, 'Mover');
    const b = await join(9102, 'Watcher');
    const d = await join(9104, 'Faraway');
    // C is A's clan mate: sees A's whole march.
    await post('/api/online/clans', a.token, { name: 'Kites', tag: 'KIT' });
    const inv = await post<{ code: string }>('/api/online/clans/invite', a.token);
    const c = await devLogin(9103, 'Mate');
    expect((await post('/api/online/clans/join', c.token, { code: inv.body.code })).status).toBe(200);

    // the map names the neutral holders of each unclaimed hex (for its miniatures), never of owned land
    const map = await getJson<{ hexes: { owner: number | null; occupant: string; def?: string }[] }>('/api/online/map', a.token);
    expect(map.body.hexes.some((h) => h.owner === null && h.occupant === 'npc' && typeof h.def === 'string')).toBe(true);
    expect(map.body.hexes.filter((h) => h.owner !== null).every((h) => h.def === undefined)).toBe(true);

    const { to, watch } = await plan(a, b.profile.home);
    // B holds one hex three steps behind A's home: B sees A's home, not where A is going.
    await DB()
      .prepare("INSERT INTO online_hexes (season_id, shard_id, q, r, occupant, owner_id) VALUES (?1, ?2, ?3, ?4, 'player', ?5)")
      .bind(a.profile.season.id, a.profile.shard.id, watch.q, watch.r, b.playerId)
      .run();

    const [wa, wb, wc, wd] = await Promise.all([wsOnline(a.token), wsOnline(b.token), wsOnline(c.token), wsOnline(d.token)]);
    await Promise.all([wa, wb, wc, wd].map((w) => w.next('welcome')));

    const m = await post<{ path: [number, number][]; at: number[] }>('/api/online/march', a.token, to);
    expect(m.status).toBe(200);
    const full = m.body.path;
    const bSources = [watch, b.profile.home];
    const seen = full.map((x, i) => ({ x, i })).filter(({ x }) => bSources.some((s) => hexDistance(s, { q: x[0], r: x[1] }) <= SIGHT));

    const mb = await wb.next('army_march');
    expect(mb).toMatchObject({ player: a.playerId, name: 'Mover', clan: expect.any(Number) });
    expect(mb.path).toEqual(seen.map(({ x }) => x));
    expect(mb.at).toEqual(seen.map(({ i }) => m.body.at[i]));
    expect((mb.path as unknown[]).length).toBeLessThan(full.length); // the destination stays in the fog
    expect(mb.path).not.toContainEqual(full[full.length - 1]);

    const mc = await wc.next('army_march');
    expect(mc.path).toEqual(full);
    expect(mc.until).toEqual([...m.body.at.slice(1), null]);
    expect((await wa.next('army_march')).path).toEqual(full);

    // A halts at once (still on its home hex): B and C see it stand there.
    expect((await post('/api/online/march/stop', a.token)).status).toBe(200);
    expect(await wb.next('army_pos')).toMatchObject({ player: a.playerId, q: a.profile.home.q, r: a.profile.home.r });
    expect(await wc.next('army_pos')).toMatchObject({ player: a.playerId });

    await sleep(150);
    // D's land is far away: nothing about A ever reached D.
    expect(armyMsgs(wd)).toEqual([]);
    expect(armyMsgs(wb).map((x) => x.type)).toEqual(['army_march', 'army_pos']);

    // Arrivals: the shard announces them at the arrival time to those who see the last hex.
    // The test's Date.now() only advances on I/O, so it can lag the shard's clock: pass the
    // move's `now` explicitly (the arrival is in the future for the shard too), let the arrival
    // time pass on the real clock, then run the alarm (the scheduled one may already have fired).
    const stub = shardStubOf(a);
    const t = Date.now();
    await stub.liveMove(a.playerId, [], { at: t + 40, q: to.q, r: to.r, to: [c.playerId], told: [b.playerId, c.playerId] }, t);
    await sleep(80);
    await runDurableObjectAlarm(stub);
    expect(await wc.next('army_arrive')).toMatchObject({ player: a.playerId, q: to.q, r: to.r });
    await sleep(50);
    expect(armyMsgs(wb).some((x) => x.type === 'army_arrive')).toBe(false);

    // A new march that B cannot see at all hides the old one from B.
    await stub.liveMove(a.playerId, [], { at: Date.now() + 60_000, q: to.q, r: to.r, to: [c.playerId], told: [b.playerId, c.playerId] });
    await stub.liveMove(a.playerId, [{ to: c.playerId, msg: { type: 'army_pos', player: a.playerId, name: 'Mover', clan: null, q: to.q, r: to.r, now: Date.now() } }], null);
    expect(await wb.next('army_hide')).toMatchObject({ player: a.playerId });

    for (const w of [wa, wb, wc, wd]) w.ws.close(1000);
  });
});

describe('the shard alarm: march arrivals and timed duel deployments share it', () => {
  type Hub = { hub: DuelHub };
  const arrival = (at: number, q: number, to: number[]) => ({ at, q, r: 0, to, told: to });

  /** Two online players in a duel's deployment; returns their sockets, the duel id and its deadline. */
  async function deploying(ids: [number, number]) {
    const a = await join(ids[0], 'Achilles');
    const b = await join(ids[1], 'Hektor');
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
    expect(await wa.next('army_arrive')).toMatchObject({ player: a.playerId, q: 3, r: 0 });
    expect(await runInDurableObject(stub, (_i: RegionDO, state) => state.storage.get(`arrive:${a.playerId}`))).toBeUndefined();
    wa.ws.close(1000);
  });

  it('interleaves arrivals with a duel deployment: earliest first, re-armed for the other', { timeout: 30_000 }, async () => {
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
    expect(await cb.next('army_arrive')).toMatchObject({ player: a.playerId, q: 1 });
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

  it('an arrival and a deployment survive the shard object being evicted; the woken object starts and announces them', { timeout: 30_000 }, async () => {
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
    expect(await cb.next('army_arrive')).toMatchObject({ player: a.playerId, q: 4 });
    ca.send({ type: 'leave_duel', duel });
    await cb.next('duel_abort');
    for (const w of [ca, cb]) w.ws.close(1000);
  });
});
