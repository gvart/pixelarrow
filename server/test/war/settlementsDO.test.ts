/**
 * W-63 shared settlements wired into the region DO (server/src/war/regionDO.ts) and the world (worldDO): tribute levied
 * out of the vassal's store and stalls, an attack on a vassal told to its overlord (and his men let in), terms gated on
 * presence, and the season's end keeping a Town while an untended Hamlet decays.
 */
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, devLogin } from '../helpers';
import { WAR_SEASON } from '../../../src/war/world/alliances';
import { joinRefusal } from '../../../src/war/world/access';
import type { WarRegionDO } from '../../src/war/regionDO';
import type { WarRoom } from '../../src/war/room';
import { ownerOf } from '../../src/war/room';
import type { RoomSettlement } from '../../src/war/roomSettlements';
import { tiedTo } from '../../src/war/roomSettlements';
import { found, seasonSweep, SETTLE } from '../../src/war/settlements';
import { ensureHolder, goodsOf, putStmt, strongroom } from '../../src/war/holders';
import { stallId } from '../../src/war/market';

const DB = () => env.DB!;
const H = 3_600_000;
const stub = (region: string) => env.WAR_REGION.get(env.WAR_REGION.idFromName(region));
const ally = (pid: number, a: number) => DB().prepare('INSERT INTO war_alliance_members (season, player_id, alliance, joined_at) VALUES (?1, ?2, ?3, 0) ON CONFLICT (season, player_id) DO UPDATE SET alliance = ?3').bind(WAR_SEASON.id, pid, a).run();
type Priv = { ensure(r: string): Promise<WarRoom>; loadSettlements(r: WarRoom): Promise<void>; settles: RoomSettlement[]; levyOne(r: WarRoom, s: RoomSettlement, now?: number): Promise<void>; attacked(r: WarRoom, l: { by: number; victim: number }[]): Promise<void>; world(): unknown };
const priv = (o: WarRegionDO) => o as unknown as Priv;

/** A settlement in `region` whose camp stands in the DO's room (team `team`), its store holding `goods`. */
async function settled(o: WarRegionDO, region: string, lord: number, team: number, x: number, y: number, goods: Record<string, number> = {}) {
  const room = await priv(o).ensure(region);
  room.sim.claim(team, x, y, 40);
  search: for (let d = 0; d < 30; d += 2) for (const [dx, dy] of [[d, 0], [0, d], [-d, 0], [0, -d]]) if (room.sim.checkPlacement(team, 'camp', x + dx, y + dy).ok) { x += dx; y += dy; break search; }
  const centre = room.restorePieces(team, { x, y, r: SETTLE.r }, [{ type: 'camp', x, y, rot: 0, hp: 1, goods }]);
  expect(centre).not.toBeNull();
  const b = room.snapshot().buildings!.find((q) => q.id === centre)!;
  const id = await found(DB(), { region, centre: centre!, x: b.x, y: b.y, lord }, () => null, Date.now());
  return { room, id, centre: centre!, x: b.x, y: b.y };
}

describe('W-63 tribute', () => {
  it('a levy credits the overlord and takes the same out of the vassal\'s store and its citizens\' stalls', async () => {
    const L = (await devLogin(9501)).playerId, V = (await devLogin(9502)).playerId, C = (await devLogin(9503)).playerId;
    await ally(L, 1), await ally(V, 2), await ally(C, 2);
    await runInDurableObject(stub('moors'), async (o: WarRegionDO) => {
      const over = await found(DB(), { region: 'kimmeria', centre: 1, x: 100, y: 100, lord: L }, () => null, Date.now());
      const { room, id } = await settled(o, 'moors', V, 2, 140, 140, { wood: 100 });
      await DB().batch([
        DB().prepare('UPDATE war_settlements SET overlord_id = ?2, tribute_pct = 20, levied_at = 0 WHERE id = ?1').bind(id, over),
        DB().prepare("INSERT INTO war_settlement_members (settlement_id, player_id, role, since) VALUES (?1, ?2, 'citizen', 0)").bind(id, C),
        ensureHolder(DB(), stallId('moors', C), 'stall', { pid: C, town: 'moors' }, 0),
        putStmt(DB(), stallId('moors', C), 'coin', 10),
      ]);
      await priv(o).loadSettlements(room);
      const s = () => priv(o).settles.find((x) => x.id === id)!;
      await priv(o).levyOne(room, s()); // the first look: where they stand
      expect(await goodsOf(DB(), strongroom(L))).toEqual({});
      room.putStore(id, { wood: 50 });
      await DB().batch([putStmt(DB(), stallId('moors', C), 'coin', 100)]);
      await priv(o).levyOne(room, s());
      expect(await goodsOf(DB(), strongroom(L))).toEqual({ wood: 10, coin: 20 });
      expect(room.storeGoods(id).wood).toBeCloseTo(140);
      expect((await goodsOf(DB(), stallId('moors', C))).coin).toBeCloseTo(90);
      // not due again for LEVY_MS
      room.putStore(id, { wood: 50 });
      await priv(o).loadSettlements(room);
      await priv(o).levyOne(room, s());
      expect(await goodsOf(DB(), strongroom(L))).toEqual({ wood: 10, coin: 20 });
      await priv(o).levyOne(room, s(), Date.now() + 7 * H);
      expect((await goodsOf(DB(), strongroom(L))).wood).toBeCloseTo(20);
      expect(room.storeGoods(id).wood).toBeCloseTo(180);
    });
  });
});

describe('W-63 attacks and access', () => {
  it('an attack on a vassal is told to its overlord; his men may come into its region whoever holds it', async () => {
    const L = (await devLogin(9511)).playerId, V = (await devLogin(9512)).playerId, X = (await devLogin(9513)).playerId;
    await ally(L, 0), await ally(V, 2), await ally(X, 3);
    await runInDurableObject(stub('ammos'), async (o: WarRegionDO) => {
      const over = await found(DB(), { region: 'savanna', centre: 1, x: 100, y: 100, lord: L }, () => null, Date.now());
      const { room, id } = await settled(o, 'ammos', V, 2, 140, 140);
      await DB().prepare('UPDATE war_settlements SET overlord_id = ?2, tribute_pct = 10 WHERE id = ?1').bind(id, over).run();
      await priv(o).loadSettlements(room);
      const told: [number[], unknown][] = [];
      (o as unknown as { world: () => unknown }).world = () => ({ notify: async (p: number[], m: unknown) => void told.push([p, m]) });
      await priv(o).attacked(room, [{ by: X, victim: id }]);
      expect(told).toEqual([[[V, L], { t: 'settlementAttacked', settlement: id, name: 'Camp', region: 'ammos', by: X, broken: [] }]]);
      expect(await DB().prepare("SELECT actor_id FROM war_settlement_log WHERE settlement_id = ?1 AND kind = 'attack'").bind(id).first()).toEqual({ actor_id: X });
      const held = { owner: 3, contested: false };
      expect(joinRefusal('ammos', 0, held, tiedTo(priv(o).settles, L))).toBeNull();
      expect(joinRefusal('ammos', 2, held, tiedTo(priv(o).settles, V))).toBeNull();
      expect(joinRefusal('ammos', 1, held, tiedTo(priv(o).settles, 999999))).toMatch(/held by/);
    });
  });
});

describe('W-63 terms need presence', () => {
  it('six of the offerer\'s men on its ground, as the room counts them', async () => {
    const lord = await devLogin(9521), foe = await devLogin(9522);
    await ally(lord.playerId, 1), await ally(foe.playerId, 2);
    const id = await runInDurableObject(stub('moors'), async (o: WarRegionDO) => (await settled(o, 'moors', lord.playerId, 1, 300, 300)).id);
    const terms = () => api(`/api/war/settlements/${id}/terms`, { method: 'POST', token: foe.token, json: { kind: 'join' } });
    const r1 = await terms();
    expect(r1.status).toBe(409);
    expect(await r1.json()).toMatchObject({ error: { code: 'not_present' } });
    await runInDurableObject(stub('moors'), async (o: WarRegionDO) => {
      const room = await priv(o).ensure('moors');
      const s = priv(o).settles.find((x) => x.id === id)!;
      room.sim.spawnSquad(ownerOf(foe.playerId), 2, 'hoplite', 6, s.x, s.y + 2);
      room.tick();
    });
    const r2 = await terms();
    expect(r2.status).toBe(200);
    expect(await r2.json()).toMatchObject({ offer: expect.any(Number) });
  });
});

describe('W-63 season end', () => {
  it('a Town survives seasonReset with its pieces under its lord\'s alliance; an untended Hamlet decays', async () => {
    const T = (await devLogin(9531)).playerId, M = (await devLogin(9532)).playerId;
    await ally(T, 3), await ally(M, 0);
    const now = Date.now();
    const ids = await runInDurableObject(stub('delta'), async (o: WarRegionDO) => {
      const town = await settled(o, 'delta', T, 3, 200, 200, { stone: 40 });
      const ham = await settled(o, 'delta', M, 0, 300, 300);
      await DB().batch([
        DB().prepare('UPDATE war_settlements SET level = 4, tended_at = 0 WHERE id = ?1').bind(town.id),
        DB().prepare('UPDATE war_settlements SET level = 1, tended_at = ?2 WHERE id = ?1').bind(ham.id, now - SETTLE.tendMs - H),
      ]);
      await priv(o).loadSettlements(town.room);
      await o.seasonReset('delta');
      return { town: town.id, ham: ham.id, x: town.x, y: town.y };
    });
    const persist = await DB().prepare('SELECT persist, level FROM war_settlements WHERE id = ?1').bind(ids.town).first<{ persist: string; level: number }>();
    expect(persist!.level).toBe(4);
    expect(JSON.parse(persist!.persist).pieces).toEqual([expect.objectContaining({ type: 'camp', x: ids.x, y: ids.y, goods: { stone: 40 } })]);
    const swept = await seasonSweep(DB(), now);
    expect(swept.removed).toContain(ids.ham);
    expect(swept.kept.map((s) => s.id)).toContain(ids.town);
    // a fresh room: the town's camp stands again under its lord's alliance, the hamlet's does not
    await runInDurableObject(stub('delta'), async (o: WarRegionDO) => {
      const room = await priv(o).ensure('delta');
      const row = await DB().prepare('SELECT centre_piece FROM war_settlements WHERE id = ?1').bind(ids.town).first<{ centre_piece: number }>();
      const camps = room.snapshot().buildings!.filter((b) => b.type === 'camp' && !b.pre);
      expect(camps.map((b) => [b.id, b.team, b.x, b.y])).toEqual([[row!.centre_piece, 3, ids.x, ids.y]]);
      expect(room.storeGoods(ids.town).stone).toBeCloseTo(40);
      expect(priv(o).settles.map((s) => s.id)).toEqual([ids.town]);
    });
  });
});
