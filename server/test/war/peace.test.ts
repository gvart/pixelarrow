/**
 * W-61 peaceful play (docs/WAR.md "Peaceful play"): build contracts paid as the labour is done, guard contracts paid
 * an hour at a time and broken when the guard leaves, alliance works fed with goods and labour, the peace score's
 * weights and caps, the titles, and the room's counts (labour, guards holding a town, men at a work site).
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { devLogin } from '../helpers';
import { setGood, good } from './goods';
import { goodsOf, putStmt } from '../../src/war/holders';
import { rentSite, stallId } from '../../src/war/market';
import { GUARD, guardCheck, labourDone, postContract, takeContract, contract } from '../../src/war/contracts';
import { addLabour, bonusesOf, give as giveWork, openWorks, worksOf } from '../../src/war/works';
import { statsOf, titles } from '../../src/war/peace';
import { joinAlliance } from '../../src/war/world/members';
import { WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';
import { World } from '../../src/war/world/world';
import { NET_VERSION } from '../../../src/war/net/protocol';
import { allianceRates, PEACE } from '../../../src/war/world/season';
import { WORKS, LABOUR_EVERY } from '../../../src/war/net/works';
import { WAR_SEASON } from '../../../src/war/world/alliances';

const DB = () => env.DB!;
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? String(e));
const put = (holder: string, res: string, n: number) => DB().batch([putStmt(DB(), holder, res, n, 'dodona')]);
const T = 'kleisoura', H = 3600;

async function player(n: number, alliance: number) {
  const p = await devLogin(n);
  await setGood(p.playerId, 'coin', 500);
  await joinAlliance(DB(), p.playerId, alliance as never, Date.now());
  return p.playerId;
}

describe('build contracts (W-61)', () => {
  it('any stall holder posts one; only an ally takes it; the reward is released as the labour is done', async () => {
    const po = await player(8601, 0), al = await player(8602, 0), foe = await player(8603, 1), now = Date.now();
    await rentSite(DB(), po, T, 'stall', -1, now);
    await put(stallId(T, po), 'coin', 200);
    const id = await postContract(DB(), po, T, { kind: 'build', toTown: T, reward: 100, region: 'dodona', site: 7, hours: 2, deadline: now + 48 * H * 1000 }, -1, now);
    expect(await goodsOf(DB(), `ct:${id}`)).toEqual({ coin: 100 });
    expect(await code(takeContract(DB(), foe, id, now))).toBe('not_ally');
    await takeContract(DB(), al, id, now);
    const before = await good(al, 'coin');
    // half the labour on the right site: half the reward; another site pays nothing
    expect(await labourDone(env, al, 'dodona', 8, H, now)).toBe(0);
    expect(await labourDone(env, al, 'dodona', 7, H, now)).toBeCloseTo(50, 3);
    expect(await good(al, 'coin')).toBeCloseTo(before + 50, 3);
    // the rest (more than needed): done, all paid, a contract filled
    await labourDone(env, al, 'dodona', 7, 2 * H, now);
    const c = await contract(DB(), id);
    expect(c.state).toBe('done');
    expect(await good(al, 'coin')).toBeCloseTo(before + 100, 3);
    expect(await goodsOf(DB(), `ct:${id}`)).toEqual({});
    const s = await statsOf(DB(), al);
    expect(s.contracts).toBe(1);
    expect(s.labourHours).toBeCloseTo(2, 3);
    const pts = await DB().prepare("SELECT SUM(points) AS p FROM war_peace_score WHERE alliance = 0 AND kind = 'contracts'").first<{ p: number }>();
    expect(pts!.p).toBeGreaterThanOrEqual(PEACE.contract + 100 / PEACE.contractPer - 1e-6);
  });
});

describe('guard contracts (W-61)', () => {
  it('pays an hour at a time while held; done after all hours', async () => {
    const po = await player(8611, 2), gd = await player(8612, 2), now = Date.now();
    await rentSite(DB(), po, T, 'stall', -1, now);
    await put(stallId(T, po), 'coin', 300);
    const id = await postContract(DB(), po, T, { kind: 'guard', toTown: T, reward: 90, region: 'kyrene', hours: 3, men: 4, deadline: now + 10 * H * 1000 }, -1, now);
    await takeContract(DB(), gd, id, now);
    const c0 = await good(gd, 'coin');
    expect(await guardCheck(env, id, true, H / 2, now)).toBe('taken');
    expect(await good(gd, 'coin')).toBeCloseTo(c0, 3); // no whole hour yet
    await guardCheck(env, id, true, H / 2, now);
    expect(await good(gd, 'coin')).toBeCloseTo(c0 + 30, 3);
    // a short step out is forgiven
    expect(await guardCheck(env, id, false, GUARD.grace / 2, now)).toBe('taken');
    expect(await guardCheck(env, id, true, 2 * H, now)).toBe('done');
    expect(await good(gd, 'coin')).toBeCloseTo(c0 + 90, 3);
    expect((await statsOf(DB(), gd)).guardHours).toBeCloseTo(3, 3);
  });

  it('broken when the guard leaves past the grace: the rest goes back to the poster', async () => {
    const po = await player(8621, 3), gd = await player(8622, 3), now = Date.now();
    await rentSite(DB(), po, T, 'stall', -1, now);
    await rentSite(DB(), po, T, 'warehouse', -1, now);
    await put(stallId(T, po), 'coin', 300);
    const id = await postContract(DB(), po, T, { kind: 'guard', toTown: T, reward: 100, region: 'elaia', hours: 4, men: 2, deadline: now + 10 * H * 1000 }, -1, now);
    expect(await code(postContract(DB(), po, T, { kind: 'guard', toTown: T, reward: 10, region: 'elaia', hours: 4, men: 2, deadline: now + H * 1000 }, -1, now))).toBe('bad_request');
    await takeContract(DB(), gd, id, now);
    await guardCheck(env, id, true, H, now);
    expect(await guardCheck(env, id, false, GUARD.grace / 2, now)).toBe('taken');
    expect(await guardCheck(env, id, false, GUARD.grace / 2, now)).toBe('broken');
    expect(await goodsOf(DB(), `ct:${id}`)).toEqual({});
    const back = await goodsOf(DB(), `wh:${T}:${po}`).catch(() => ({}));
    const into = Object.keys(back).length ? back : await goodsOf(DB(), `sr:${po}`);
    expect((into as Record<string, number>).coin).toBeGreaterThanOrEqual(75 - 1e-6);
  });
});

describe('alliance works (W-61)', () => {
  it('members feed goods (at most what is lacking) and labour; done: once, scored, its bonus for every room', async () => {
    const a = await player(8631, 1), b = await player(8632, 1), now = Date.now(), season = 9001;
    for (const p of [a, b]) await joinAlliance(DB(), p, 1 as never, now, season);
    const temple = WORKS.find((w) => w.id === 'temple')!;
    for (const [k, n] of Object.entries(temple.goods)) await setGood(a, k, n + 50);
    expect(await code(giveWork(env, a, 'nope', { stone: 1 }, now, season))).toBe('not_found');
    expect(await giveWork(env, a, 'temple', { stone: 100, wood: 10 }, now, season)).toEqual({ stone: 100 });
    expect(await good(a, 'stone')).toBe(temple.goods.stone + 50 - 100);
    expect(await giveWork(env, a, 'temple', { stone: 9999, marble: 9999, coin: 9999 }, now, season)).toEqual({ stone: temple.goods.stone - 100, marble: temple.goods.marble, coin: temple.goods.coin });
    let v = (await worksOf(DB(), 1, season)).find((w) => w.id === 'temple')!;
    expect(v.done).toBe(false);
    expect(v.goods.stone).toBe(temple.goods.stone);
    // labour: two members' men at the site
    const half = (temple.labour * H) / 2;
    expect(await addLabour(env, 1, 'temple', { [a]: half, [b]: half + 999 }, now, season)).toBeCloseTo(temple.labour * H, 3);
    v = (await worksOf(DB(), 1, season)).find((w) => w.id === 'temple')!;
    expect(v.done).toBe(true);
    expect(v.by.map((x) => x.pid).sort()).toEqual([a, b].sort());
    expect(await addLabour(env, 1, 'temple', { [a]: 100 }, now, season)).toBe(0);
    expect(await openWorks(DB(), 1, season)).toEqual(['road', 'beacons', 'wonder']);
    expect((await bonusesOf(DB(), season)).get(1)).toEqual({ repairCost: temple.bonus.repairCost });
    const pts = await DB().prepare("SELECT SUM(points) AS p FROM war_peace_score WHERE alliance = 1 AND kind = 'works'").first<{ p: number }>();
    expect(pts!.p).toBe(PEACE.work);
  });
});

describe('titles (W-61)', () => {
  it('the season leader in coin sold, labour, guard hours', async () => {
    const t = await titles(DB(), WAR_SEASON.id);
    const ids = t.map((x) => x.id);
    expect(ids).toContain('masterBuilder');
    expect(ids).toContain('warden');
    for (const x of t) expect(x.value).toBeGreaterThan(0);
  });

  it('the Ares-born title counts kills this season, not his men\'s lifetime kills', async () => {
    const vet = await player(8611, 0), fresh = await player(8612, 1), S = WAR_SEASON.id, now = Date.now();
    // the veteran's man has 500 lifetime kills, all from older seasons; this season he struck down 3, the fresh one 7
    await DB().prepare("INSERT INTO war_persons (id, player_id, cls, name, level, xp, points, kills, battles, attrs, skills, gear, honours, state, created_at, updated_at) VALUES ('wl-vet', ?1, 'hoplite', 'Vet', 9, 0, 0, 500, 80, '{}', '[]', '{}', '[]', 'active', ?2, ?2)").bind(vet, now).run();
    await DB().batch([
      DB().prepare('INSERT INTO war_player_stats (season, player_id, kills) VALUES (?1, ?2, 3), (?1, ?3, 7)').bind(S, vet, fresh),
      DB().prepare('INSERT INTO war_player_stats (season, player_id, kills) VALUES (?1, ?2, 400)').bind(S - 1, vet),
    ]);
    const w = (await titles(DB(), S)).find((x) => x.id === 'warlord');
    expect(w?.pid).toBe(fresh);
    expect(w?.value).toBe(7);
  });
});

describe('the room counts (W-61)', () => {
  it('a guard inside the poster team\'s town holds it; too few men do not', () => {
    const r = new WarRoom({ region: warRegion('test-ridge')!, seed: 3, cap: 600 });
    const j = (pid: number, team: number) => r.join(pid, { t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: pid, team, army: [{ cls: 'militia', count: 4 }] });
    j(1, 0);
    j(2, 0);
    r.tick();
    // team 0's town on open ground near the middle, guard 2's men walk into it
    const reg = r.region;
    r.sim.claim(0, reg.w / 2, reg.h / 2, 40);
    r.sim.addStock(0, 'wood', 500);
    let at: [number, number] | null = null;
    for (let k = 0; k < 400 && !at; k++) {
      const x = Math.round(reg.w / 2 + ((k % 20) - 10) * 3), y = Math.round(reg.h / 2 + (Math.floor(k / 20) - 10) * 3);
      if (r.sim.checkPlacement(0, 'camp', x, y).ok) at = [x, y];
    }
    expect(at).not.toBeNull();
    r.sim.order({ kind: 'placeBuilding', team: 0, type: 'camp', x: at![0], y: at![1] });
    r.sim.step();
    for (const b of r.sim.snapshot().buildings ?? []) r.sim.finishSite(b.id);
    r.sim.spawnSquad('p:2', 0, 'militia', 4, at![0] + 5, at![1]); // more of guard 2's men, inside
    r.setGuards([{ id: 77, team: 0, taker: 2, men: 4 }, { id: 78, team: 0, taker: 2, men: 9 }]);
    r.setWorks(0, ['temple']);
    let peace = null;
    for (let t = 0; t < LABOUR_EVERY * 2 && !peace?.guards.length; t++) peace = r.tick().peace;
    expect(peace).not.toBeNull();
    expect(peace!.guards).toEqual([{ id: 77, held: true, secs: LABOUR_EVERY / 10 }, { id: 78, held: false, secs: LABOUR_EVERY / 10 }]);
  });

  it('the world scores town levels an hour (capped) and peace points; a road speeds transfers', () => {
    const rates = allianceRates([{ id: 'x', owner: -1, live: [0, 0, 0, 0], town: [5, 2, 0, 0] }, { id: 'y', owner: -1, live: [0, 0, 0, 0], town: [5, 0, 0, 0] }, { id: 'z', owner: -1, live: [0, 0, 0, 0], town: [5, 0, 0, 0] }]);
    expect(rates[0]).toBe(PEACE.townCap);
    expect(rates[1]).toBe(PEACE.town[2]);
    const w = new World();
    const t0 = Date.now();
    w.addPeace(0, 'volume', 5, t0);
    expect(w.seasonSnap(t0).peace!.volume[0]).toBe(5);
    expect(w.seasonSnap(t0).scores[0]).toBe(5);
    w.setTravel(2, 0.85);
    expect(w.st.season.travel![2]).toBe(0.85);
  });
});
