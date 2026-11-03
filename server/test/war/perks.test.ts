/**
 * W-84, W-111, W-112, W-114: levels by path in D1, and what a level does in the room. Players are made through the real
 * start (/api/war/start); amounts come from the table (src/war/net/favour.ts).
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { FAVOUR_EARN, FAVOUR_XP, HOUR_CAP, PAYS, perkRows, type FavourReason } from '../../../src/war/net/favour';
import { perkFx, PERKS } from '../../../src/data/warPerks';
import { makePerson } from '../../../src/war/sim/roster';
import { FAMILIES, FAMILY_IDS, PATH_IDS, unlockLevel, type PathId, type StartFamily } from '../../../src/war/world/start';
import { WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';
import { addFavour, builtFavour, cappedStmts, favourStmts, getFavour, levelsOf } from '../../src/war/favour';
import { claimSoul } from '../../src/war/persons';
import { settleTunnelFor } from '../../src/war/raise';
import { pathOf } from '../../src/war/start';
import { fillHook } from '../../src/war/tradeScore';
import { api, devLogin } from '../helpers';

const DB = () => env.DB!;
const startPost = (t: string, p: string, json: unknown) => api(`/api/war/start${p}`, { method: 'POST', token: t, json });
async function onPath(id: number, path: PathId, f: StartFamily | null = null) {
  const me = await devLogin(id);
  expect((await startPost(me.token, '/alliance', { alliance: 0 })).status).toBe(200);
  expect((await startPost(me.token, '/home', { region: 'dodona' })).status).toBe(200);
  expect((await startPost(me.token, '/path', { path, ...(f ? { family: f } : {}) })).status).toBe(200);
  return me;
}
const xp = async (pid: number) => (await getFavour(env, pid)).xp;
const setLevel = (pid: number, level: number) =>
  DB().prepare('INSERT INTO war_favour (player_id, xp, level, updated_at) VALUES (?1, ?2, ?3, 0) ON CONFLICT (player_id) DO UPDATE SET xp = ?2, level = ?3').bind(pid, FAVOUR_XP[level], level).run();

describe('each path levels by its own work (W-111)', () => {
  it('a reason pays its path only; tasks, stories and encounters pay all; a player with no path, all', async () => {
    let id = 8700;
    const reasons: FavourReason[] = ['win', 'land', 'lair', 'boss', 'built', 'sold', 'carried', 'task', 'story', 'encounter'];
    for (const path of PATH_IDS) {
      const me = await onPath(id++, path, path === 'warrior' ? 'line' : null);
      for (const r of reasons) {
        const was = await xp(me.playerId);
        await addFavour(env, me.playerId, 5, r);
        const paid = (await xp(me.playerId)) - was, only = PAYS[r];
        expect(paid, `${path} ${r}`).toBe(!only || only === path ? 5 : 0);
      }
      expect((await getFavour(env, me.playerId)).recent.every((row) => !PAYS[row.reason] || PAYS[row.reason] === path), path).toBe(true);
    }
    const dev = await devLogin(id++);
    for (const r of reasons) await addFavour(env, dev.playerId, 1, r);
    expect(await xp(dev.playerId)).toBe(reasons.length);
  });

  it('goods sold and carried are capped an hour, one count; a hook gets statements it can batch', async () => {
    const me = await onPath(8710, 'trader'), t = Date.UTC(2031, 0, 6, 12, 5);
    await addFavour(env, me.playerId, HOUR_CAP.sold! + 50, 'sold', t);
    expect(await xp(me.playerId)).toBe(HOUR_CAP.sold);
    await addFavour(env, me.playerId, 10, 'carried', t);
    expect(await xp(me.playerId)).toBe(HOUR_CAP.sold);
    expect(await cappedStmts(DB(), me.playerId, 10, 'sold', t)).toEqual([]);
    await DB().batch(await cappedStmts(DB(), me.playerId, 10, 'carried', t + 3_600_000));
    expect(await xp(me.playerId)).toBe(HOUR_CAP.sold! + 10);
    expect(favourStmts(DB(), me.playerId, 0, 'task', t)).toEqual([]);
  });

  it('a fill pays the seller if he trades, in the fill\'s own statements (tradeScore.ts)', async () => {
    const trader = await onPath(8711, 'trader'), buyer = await onPath(8712, 'warrior', 'line'), builder = await onPath(8713, 'builder');
    const sell = (seller: number, coin: number) => fillHook(env)({ town: 'dodona', seller, buyer: buyer.playerId, lots: [], coin, now: Date.now() });
    await DB().batch((await sell(trader.playerId, 100)).stmts);
    expect(await xp(trader.playerId)).toBe(100 * FAVOUR_EARN.sold);
    await DB().batch((await sell(builder.playerId, 100)).stmts);
    expect(await xp(builder.playerId)).toBe(0);
  });

  it('labour adds up to lumps per room, none lost', () => {
    const room = {}, secs = 10 / FAVOUR_EARN.built.labour;
    expect(builtFavour(room, [[1, secs / 2]])).toEqual([]);
    const paid = builtFavour(room, [[1, secs / 2], [2, 1]]);
    expect(paid).toHaveLength(1);
    expect(paid[0][0]).toBe(1);
    expect(paid[0][1]).toBeCloseTo(10, 0);
  });
});

describe('the level in the world', () => {
  it('GET /favour says his path; pathOf reads his level', async () => {
    const me = await onPath(8720, 'warrior', 'shock');
    await setLevel(me.playerId, 5);
    const v = await (await api('/api/war/favour', { token: me.token })).json<{ level: number; path: string; family: string }>();
    expect(v).toMatchObject({ level: 5, path: 'warrior', family: 'shock' });
    expect(await pathOf(DB(), me.playerId)).toEqual({ path: 'warrior', family: 'shock', level: 5 });
    expect(perkRows('warrior', 'shock').length).toBeGreaterThan(PERKS.warrior.length);
    expect((await levelsOf(DB(), [me.playerId, 999999])).get(999999)).toBe(1);
  });

  it('W-112: a soul of a stronger class of his family joins only at its level; the Tunnel still raises', async () => {
    let id = 8730;
    for (const f of FAMILY_IDS) {
      const me = await onPath(id++, 'warrior', f);
      const [cls, at] = Object.entries(FAMILIES[f].unlocks)[0] as [string, number];
      expect(unlockLevel(f, cls)).toBe(at);
      expect(await claimSoul(DB(), me.playerId, makePerson(`p-${f}-a`, cls), 'test-ridge', Date.now()), f).toBe(false);
      await setLevel(me.playerId, at);
      expect(await claimSoul(DB(), me.playerId, makePerson(`p-${f}-b`, cls), 'test-ridge', Date.now()), f).toBe(true);
      expect((await settleTunnelFor(DB(), me.playerId, Date.now())).floor).toBeGreaterThan(0);
    }
  });

  it('W-110: a claimed soul comes plain at any level (the old bonus is gone)', async () => {
    const me = await onPath(8740, 'warrior', 'line');
    await setLevel(me.playerId, 12);
    expect(await claimSoul(DB(), me.playerId, makePerson('plain-soul', 'hoplite'), 'test-ridge', Date.now())).toBe(true);
    const r = await DB().prepare('SELECT points, gear FROM war_persons WHERE id = ?1').bind('plain-soul').first<{ points: number; gear: string }>();
    expect(r!.points).toBe(0);
    expect(Object.values(JSON.parse(r!.gear) as Record<string, { rarity: string }>).every((it) => it.rarity === 'common')).toBe(true);
  });

  it('the room: a level gained reaches his living men; another player\'s men are untouched', () => {
    const room = new WarRoom({ region: warRegion('test-ridge')!, seed: 5, cap: 600 });
    room.setPath(1, { path: 'warrior', family: 'line', level: 1 });
    room.setPath(2, { path: 'warrior', family: 'line', level: 1 });
    const a = room.sim.spawnSquad('p:1', 0, 'hoplite', 1, 40, 40, [makePerson('a', 'hoplite')]);
    const b = room.sim.spawnSquad('p:2', 0, 'hoplite', 1, 44, 40, [makePerson('b', 'hoplite')]);
    const hp = (q: number) => room.sim.snapshot().units.find((u) => u.squad === q)!.maxHp;
    const was = hp(a);
    expect(room.pathPlayers()).toEqual([1, 2]);
    room.setLevel(1, 3);
    expect(hp(a)).toBe(Math.round(was * (1 + perkFx('warrior', 3).hp!)));
    expect(hp(b)).toBe(was);
    room.setLevel(99, 12); // not here: nothing
    expect(room.pathPlayers()).toEqual([1, 2]);
  });
});
