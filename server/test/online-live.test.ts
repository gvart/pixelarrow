import { env, runDurableObjectAlarm } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findHexPath, hexDistance, HEX_DIRS, type Axial } from '../../src/online/hex';
import { liveMessages } from '../src/online/live';
import { shardDoName } from '../src/online/store';
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

async function shardSeed(p: Player): Promise<number> {
  const row = await DB().prepare('SELECT seed FROM online_shards WHERE season_id = ?1 AND id = ?2').bind(p.profile.season.id, p.profile.shard.id).first<{ seed: number }>();
  return row!.seed;
}

/** A march target 4 hexes from home (passable path) and a hex on the far side of home for a watcher. */
async function plan(p: Player): Promise<{ to: Axial; watch: Axial; path: Axial[] }> {
  const seed = await shardSeed(p);
  const h = p.profile.home;
  for (let i = 0; i < 6; i++) {
    const d = HEX_DIRS[i];
    const o = HEX_DIRS[(i + 3) % 6];
    const to = { q: h.q + d.q * 4, r: h.r + d.r * 4 };
    const watch = { q: h.q + o.q * 3, r: h.r + o.r * 3 };
    const path = findHexPath(seed, h, to, () => true, 8000, p.profile.shard.radius);
    if (path && path.length <= 7 && path.every((x) => hexDistance(x, watch) >= 3)) return { to, watch, path };
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

    const { to, watch } = await plan(a);
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
    const stub = env.REGION.get(env.REGION.idFromName(shardDoName({ season: a.profile.season.id, id: a.profile.shard.id })));
    await stub.liveMove(a.playerId, [], { at: Date.now() + 40, q: to.q, r: to.r, to: [c.playerId], told: [b.playerId, c.playerId] });
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
