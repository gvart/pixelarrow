/**
 * W-62 world events and the season war: the schedule from the season seed, the world alarm multiplexing arrivals,
 * event boundaries and the season's end, each event's effect (caravan rush, landmark siege in the World; soul storm and
 * boss wake in the region), and the rollover: men, gear and titles kept, landmarks, score and control reset, the board
 * and cosmetics in D1.
 */
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, devLogin } from '../helpers';
import { EVENT_KINDS, EVENT_REGIONS, EVENTS, RUSH, seasonEvents, seasonSeed, SIEGE, STORM, WAKE, type WorldEvent } from '../../../src/war/world/events';
import { WAR_SEASON } from '../../../src/war/world/alliances';
import { worldRegion } from '../../../src/war/world/graph';
import { createSouls, SOUL } from '../../../src/war/sim/souls';
import type { AllianceId } from '../../../src/war/world/types';
import type { TransitCargo } from '../../../src/war/net/world';
import { cargoLoads, freshWorld, World, type Ports } from '../../src/war/world/world';
import type { WarWorldDO } from '../../src/war/world/worldDO';
import { WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';
import { remembered, writeMemory } from '../../src/war/memory';
import { statStmt, statsOf, titles } from '../../src/war/peace';
import { worldStub } from '../../src/war/placement';

const T0 = 1_000_000;
const H = 3600_000;
const L = WAR_SEASON.lengthMs;
const DB = () => env.DB!;

const cargo: TransitCargo = { packs: { m1: { lots: [{ r: 'wood', n: 30, o: 'dodona' }], items: [] } } };
function ports(withCargo = false): Ports {
  return {
    depart: async (_from, _pid, who) => ({ ids: Array.isArray(who) ? who : ['m1'], off: 0, ...(withCargo ? { cargo } : {}) }),
    arrive: async () => ({ ok: true }),
  };
}
const first = (w: World, kind: WorldEvent['kind']) => w.events().find((e) => e.kind === kind)!;

describe('W-62 event schedule', () => {
  it('is the same for the same seed, about one every 3 h, 20-60 min each, never two at once, kinds evenly', () => {
    const a = seasonEvents(seasonSeed(1, T0), T0, T0 + L);
    expect(seasonEvents(seasonSeed(1, T0), T0, T0 + L)).toEqual(a);
    expect(seasonEvents(seasonSeed(2, T0), T0, T0 + L)).not.toEqual(a);
    expect(a.length).toBeGreaterThan(L / (4 * H));
    expect(a.length).toBeLessThan(L / (2 * H));
    a.forEach((e, i) => {
      expect(e.id).toBe(i);
      expect(EVENT_REGIONS[e.kind]).toContain(e.region);
      expect(e.endAt - e.startAt).toBeGreaterThanOrEqual(EVENTS.minMs);
      expect(e.endAt - e.startAt).toBeLessThanOrEqual(EVENTS.maxMs);
      if (i) expect(e.startAt - a[i - 1].endAt).toBeGreaterThanOrEqual(EVENTS.every - EVENTS.maxMs - EVENTS.jitter - 1);
      if (i) expect(e.region).not.toBe(a[i - 1].region);
    });
    const n = EVENT_KINDS.map((k) => a.filter((e) => e.kind === k).length);
    expect(Math.max(...n) - Math.min(...n)).toBeLessThanOrEqual(1);
    // the world keeps the seed in its season state
    expect(new World(freshWorld(T0)).events()).toEqual(seasonEvents(seasonSeed(WAR_SEASON.id, T0), T0, T0 + L));
  });
});

describe('W-62 world alarm', () => {
  it('next due wins: an arrival before the first event; every event opens and closes; the season still ends on time', async () => {
    const w = new World(freshWorld(T0)), list = w.events();
    expect(w.nextAlarm()).toBe(list[0].startAt);
    const t = await w.transfer(7, 0, { from: 'dodona', to: 'dodona-e', squad: 1 }, T0, ports());
    if ('error' in t) throw new Error(t.error);
    expect(t.arriveAt).toBeLessThan(list[0].startAt);
    expect(w.nextAlarm()).toBe(t.arriveAt);
    let opened = 0, closed = 0, alarms = 0;
    for (let at = w.nextAlarm(); at !== null; at = w.nextAlarm()) {
      alarms++;
      const ev = w.eventTick(at);
      w.advance(at);
      await w.due(at, ports());
      opened += ev.started.length;
      closed += ev.ended.length;
      if (ev.started.length) expect(w.activeEvents(at)).toEqual(ev.started);
      if (w.st.season.ended) break;
    }
    expect(opened).toBe(list.length);
    expect(closed).toBe(list.length);
    expect(alarms).toBe(1 + 2 * list.length + (list[list.length - 1].endAt === T0 + L ? 0 : 1));
    expect(w.st.season.ended).toMatchObject({ at: T0 + L, reason: 'time' });
    expect(w.nextAlarm()).toBeNull();
  });

  it('the snapshot carries the running event and the next', () => {
    const w = new World(freshWorld(T0)), [e0, e1] = w.events();
    const s = w.snapshot(1, 0, { members: [], clans: [] }, e0.startAt + 1);
    expect(s.events).toEqual({ active: [e0], next: e1 });
    expect(w.snapshot(1, 0, { members: [], clans: [] }, T0).events).toEqual({ active: [], next: e0 });
  });
});

describe('W-62 event effects in the world', () => {
  it('caravan rush: a convoy with cargo arriving at its market scores its loads, at most RUSH.cap; outside it nothing', async () => {
    const w = new World(freshWorld(T0)), e = first(w, 'caravanRush');
    const from = worldRegion(e.region)!.adj[0];
    const send = async (pid: number, a: AllianceId, at: number) => {
      const t = await w.transfer(pid, a, { from, to: e.region, ids: [`m${pid}`] }, at, ports(true));
      if ('error' in t) throw new Error(t.error);
      return t;
    };
    const early = await send(1, 0, e.startAt - 5 * H);
    await w.due(early.arriveAt, ports());
    expect(w.st.season.event).toBeUndefined();
    await send(2, 1, e.startAt - 5 * H);
    w.eventTick(e.startAt + 1);
    await w.due(e.startAt + 1, ports());
    const pts = Math.min(RUSH.cap, Math.ceil(cargoLoads(cargo) * RUSH.perLoad));
    expect(pts).toBeGreaterThan(0);
    expect(w.st.season.event).toEqual([0, pts, 0, 0]);
    expect(w.seasonSnap(e.startAt + 1).event).toEqual([0, pts, 0, 0]);
  });

  it('landmark siege: its capture scores the captor; the garrisoned holder at its end scores again', () => {
    const w = new World(freshWorld(T0)), e = first(w, 'landmarkSiege');
    const lm = (holder: number, garrisoned: boolean) => ({ id: 'x', holder, guardian: 'slain' as const, state: 'restored' as const, hp: 1, garrisoned });
    const claims = [0, 0, 1, 0];
    w.report(e.region, { live: [0, 0, 12, 0], claims, channel: [0, 0, 0, 0], landmark: lm(-1, false) }, e.startAt - H);
    w.report(e.region, { live: [0, 0, 12, 0], claims, channel: [0, 0, 0, 0], landmark: lm(2, false) }, e.startAt - H / 2);
    expect(w.st.season.event).toBeUndefined(); // before the siege: no bonus
    w.report(e.region, { live: [0, 0, 0, 12], claims: [0, 0, 0, 2], channel: [0, 0, 0, 0], landmark: lm(3, true) }, e.startAt + 1);
    expect(w.st.season.event).toEqual([0, 0, 0, SIEGE.capture]);
    const s = w.eventTick(e.endAt);
    expect(s.ended.map((x) => x.id)).toContain(e.id);
    expect(w.st.season.event).toEqual([0, 0, 0, SIEGE.capture + SIEGE.held]);
  });
});

describe('W-62 event effects in the region', () => {
  it('soul storm: souls wake STORM.chance times as often, more at once', () => {
    const region = warRegion('stymphalia')!;
    const run = (k: number) => {
      let woke = 0;
      const souls = createSouls(region, 7, { men: () => [], gate: () => ({ ok: true, have: 0 }), join: () => null, stop: () => {}, emit: (e) => void (e.kind === 'soulFaded' && woke++) });
      souls.setStorm(k);
      let most = 0;
      for (let t = 1; t <= 60 * 600; t++) {
        souls.tick(t);
        most = Math.max(most, souls.snaps(t).length);
      }
      return { woke: woke + souls.snaps(60 * 600).length, most };
    };
    const calm = run(1), storm = run(STORM.chance);
    expect(calm.most).toBeLessThanOrEqual(SOUL.max);
    expect(storm.woke).toBeGreaterThan(calm.woke * 3);
    expect(storm.most).toBeGreaterThan(SOUL.max);
    expect(storm.most).toBeLessThanOrEqual(SOUL.stormMax);
  });

  it('boss wake: a slain guardian is back now and stronger; held, it stays down; its kill drops the rare goods twice', () => {
    const r = new WarRoom({ region: warRegion('krios')!, seed: 1, cap: 600, wild: true });
    for (let i = 0; i < 2; i++) r.tick();
    const base = r.snapshot().bosses!.find((b) => b.id === 'drakon')!.maxHp;
    r.sim.hurtBoss('drakon', 1e9, 'p:1');
    let slain = 0;
    for (let i = 0; i < 2; i++) slain += r.tick().bosses.length;
    expect(slain).toBe(1);
    expect(r.snapshot().bosses!.find((b) => b.id === 'drakon')!.state).toBe('slain');
    const piles = () => r.snapshot().piles ?? [];
    const rare = (p: ReturnType<typeof piles>) => p.reduce((s, x) => s + ((x.goods as Record<string, number>).dragonbone ?? 0), 0);
    const once = rare(piles());
    expect(once).toBeGreaterThan(0);
    r.setWorldEvents([{ id: 0, kind: 'bossWake', region: 'krios', startAt: 0, endAt: Number.MAX_SAFE_INTEGER }]);
    r.wakeGuardians();
    r.tick();
    const d = r.snapshot().bosses!.find((b) => b.id === 'drakon')!;
    expect(d.state).not.toBe('slain');
    expect(d.maxHp).toBeCloseTo(base * WAKE.hp, 3);
    r.sim.hurtBoss('drakon', 1e12, 'p:1');
    for (let i = 0; i < 2; i++) r.tick();
    expect(rare(piles()) - once).toBe(once * WAKE.loot);
    // held: a woken event leaves a slain guardian down
    const m = r.memory();
    m.claims[0] = 0;
    const held = new WarRoom({ region: warRegion('krios')!, seed: 1, cap: 600, wild: true });
    held.recall(m, 0);
    held.tick();
    held.wakeGuardians();
    held.tick();
    expect(held.snapshot().bosses!.find((b) => b.id === 'drakon')!.state).toBe('slain');
  });
});

describe('W-62 season war', () => {
  it('the rollover keeps men, gear and titles; resets landmarks, score and control; keeps the board and awards cosmetics', async () => {
    const a = await devLogin(7621), b = await devLogin(7622);
    await api('/api/war/world/dev/alliance', { method: 'POST', token: a.token, json: { alliance: 2 } });
    await api('/api/war/world/dev/alliance', { method: 'POST', token: b.token, json: { alliance: 1 } });
    await api('/api/war/dev/seed', { method: 'POST', token: a.token, json: {} });
    const persons = async () => (await DB().prepare("SELECT id, region FROM war_persons WHERE player_id = ?1 AND state = 'active' ORDER BY id").bind(a.playerId).all<{ id: string; region: string | null }>()).results;
    const items = async () => (await DB().prepare('SELECT COUNT(*) AS n FROM war_items WHERE player_id = ?1').bind(a.playerId).first<{ n: number }>())!.n;
    const before = await persons(), gear = await items();
    expect(before.length).toBeGreaterThan(0);
    // three of his men stand in Krios, whose citadel the region remembers taken
    await DB().prepare("UPDATE war_persons SET region = 'krios' WHERE id IN (SELECT value FROM json_each(?1))").bind(JSON.stringify(before.slice(0, 3).map((p) => p.id))).run();
    const krios = new WarRoom({ region: warRegion('krios')!, seed: 1, cap: 600, wild: true });
    const mem = krios.memory();
    mem.claims = mem.claims.map(() => 2);
    mem.landmark = { captured: true, restored: true };
    await writeMemory(DB(), 'krios', remembered(mem, Date.now()));
    await statStmt(DB(), b.playerId, 'sold', 500).run(); // b: Merchant Prince

    const world = worldStub(env);
    const out = await runInDurableObject(world, async (o: WarWorldDO) => {
      const id = (await o.standings()).season.id;
      await o.report('saddle', { live: [0, 0, 12, 0], claims: [0, 0, 1, 0], channel: [0, 0, 0, 0] });
      await o.addTrade(2, 50);
      const next = await o.resetSeason();
      return { id, next, snap: await o.snapshot(a.playerId, 2), bs: await o.snapshot(b.playerId, 1) };
    });
    expect(out.next).toBe(out.id + 1);
    // the board
    const row = await DB().prepare('SELECT * FROM war_season_results WHERE season = ?1').bind(out.id).first<{ winner: number; reason: string; scores: string; titles: string }>();
    expect(row).toMatchObject({ winner: 2, reason: 'time' });
    expect(JSON.parse(row!.scores)[2]).toBeGreaterThanOrEqual(50);
    expect(JSON.parse(row!.titles)).toEqual([expect.objectContaining({ id: 'merchantPrince', pid: b.playerId })]);
    expect(out.snap.last).toMatchObject({ season: out.id, winner: 2, banners: expect.any(Number) });
    // cosmetics: the winners' banner, the title's crest
    expect(out.snap.crests).toEqual([{ season: out.id, kind: 'banner', alliance: 2 }]);
    expect(out.bs.crests).toEqual([{ season: out.id, kind: 'crest', alliance: 1, title: 'merchantPrince' }]);
    // reset: score, control, landmarks
    expect(out.snap.score).toMatchObject({ id: out.next, scores: [0, 0, 0, 0], ended: null });
    expect(out.snap.regions.find((r) => r.id === 'saddle')!.owner).toBe(-1);
    expect(out.snap.regions.find((r) => r.id === 'skythia')!.owner).toBe(1);
    expect(await DB().prepare("SELECT region FROM war_region_state WHERE region = 'krios'").first()).toBeNull();
    // kept: every man (those in Krios home again), his gear, the crests; the titles are won anew
    const after = await persons();
    expect(after.map((p) => p.id)).toEqual(before.map((p) => p.id));
    expect(after.every((p) => p.region === null)).toBe(true);
    expect(await items()).toBe(gear);
    expect((await titles(DB(), out.id)).map((t) => [t.id, t.pid])).toEqual([['merchantPrince', b.playerId]]);
    expect(await titles(DB())).toEqual([]);
    expect((await statsOf(DB(), b.playerId)).sold).toBe(0);
    await statStmt(DB(), b.playerId, 'sold', 7).run();
    expect((await statsOf(DB(), b.playerId)).sold).toBe(7);
  });
});
