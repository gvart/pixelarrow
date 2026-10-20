/**
 * M6e holders (docs/WAR.md "Trade", "Goods live in places"): the home strongroom in D1 (season start, every cost path
 * pays from it), crafted items physical in the room (the workplace's output chest, kept through an eviction), and the
 * migration from war_stock / war_treasury over a populated database.
 */
import { applyD1Migrations, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, devLogin } from '../helpers';
import { good, setGood } from './goods';
import { spot } from './spot';
import { NET_VERSION, orderSchema, type ServerMsg } from '../../../src/war/net/protocol';
import { WarRoom, type Crafted } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';
import { craftKey } from '../../src/war/crafting';
import { lotsOf, pay, planTake, putStmt, strongroom } from '../../src/war/holders';
import { RECRUIT_FOOD, START } from '../../src/war/persons';
import { BUILDINGS } from '../../../src/war/sim/economy';
import type { Item } from '../../../src/data/items';

const DB = () => env.DB!;
const post = (token: string, path: string, json: unknown = {}) => api(`/api/war${path}`, { method: 'POST', token, json });
const code = async (r: Response) => ((await r.json()) as { error?: { code: string } }).error?.code;

describe('home strongroom', () => {
  it('season start gives START.food once and no coin; recruits pay food from it', async () => {
    const me = await devLogin(7901);
    const r = await (await api('/api/war/roster', { token: me.token })).json<{ stock: Record<string, number>; items: Item[] }>();
    expect(r.stock).toEqual({ food: START.food });
    await api('/api/war/roster', { token: me.token });
    expect(await good(me.playerId, 'food')).toBe(START.food); // once
    expect((await post(me.token, '/recruit', { town: 'home', count: 2 })).status).toBe(200);
    expect(await good(me.playerId, 'food')).toBe(START.food - 2 * RECRUIT_FOOD);
    await setGood(me.playerId, 'food', RECRUIT_FOOD - 1);
    expect(await code(await post(me.token, '/recruit', { town: 'home', count: 1 }))).toBe('no_food');
    expect(await good(me.playerId, 'food')).toBe(RECRUIT_FOOD - 1); // nothing taken
  });

  it('takes go oldest origin first, keep origins, and a lot gone meanwhile fails the whole batch', async () => {
    const me = await devLogin(7902), sr = strongroom(me.playerId);
    await DB().batch([putStmt(DB(), sr, 'wood', 5, 'elaia'), putStmt(DB(), sr, 'wood', 5, 'dodona')]);
    const taken = await pay(DB(), sr, { wood: 7 });
    expect(taken).toEqual([{ res: 'wood', origin: 'dodona', seal: 0, amount: 5 }, { res: 'wood', origin: 'elaia', seal: 0, amount: 2 }]);
    expect(await good(me.playerId, 'wood')).toBe(3);
    // planned on a read, then the goods move: the batch fails whole
    const plan = planTake(DB(), sr, await lotsOf(DB(), sr), { wood: 3 });
    await setGood(me.playerId, 'wood', 1);
    await expect(DB().batch([...plan.stmts, putStmt(DB(), sr, 'coin', 99)])).rejects.toThrow(/malformed JSON|CHECK/);
    expect(await good(me.playerId, 'coin')).toBe(0);
  });
});

const region = warRegion('test-ridge')!;
const run = (r: WarRoom, n: number, until?: () => boolean) => {
  for (let t = 0; t < n; t++) {
    r.tick();
    if (until?.()) return;
  }
};
const crafted = (order: number, owner: string, building: number): Crafted => ({
  t: 1, kind: 'crafted', order, building, team: 0, owner, recipe: 'item:xiphos', what: 'craft', item: { uid: 'x', def: 'xiphos', rarity: 'common', cond: 100 },
});

describe('crafted items are physical', () => {
  it('into the owner\'s chest near the workplace (else the team strongroom); kept through an eviction', () => {
    const r = new WarRoom({ region, seed: 1, cap: 600 });
    const sim = r.sim;
    const [cx, cy] = spot(r, 60, 40);
    for (const t of ['camp', 'chest'] as const) for (const [k, v] of Object.entries(BUILDINGS[t].cost)) sim.addStock(0, k as never, v * 2);
    const s = sim.spawnSquad('p:1', 0, 'militia', 12, cx, cy + 5);
    sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: cx, y: cy });
    run(r, 3000, () => r.snapshot().buildings?.some((b) => b.type === 'camp' && b.state === 'done') ?? false);
    const x = cx + 6, y = cy;
    expect(sim.checkPlacement(0, 'chest', x, y).ok).toBe(true);
    sim.order({ kind: 'placeBuilding', squad: s, type: 'chest', x, y });
    run(r, 3000, () => r.snapshot().buildings?.some((b) => b.type === 'chest' && b.state === 'done') ?? false);
    const chest = r.snapshot().buildings!.find((b) => b.type === 'chest')!;
    expect(chest.state).toBe('done');
    // no chest of his: the team's strongroom; his chest: in it
    r.deposit(crafted(5, 'p:2', chest.id));
    expect(sim.cargo({ reserve: 0 })!.slots[0].hold.items.map((i) => i.uid)).toEqual([`c:${craftKey('test-ridge', r.run, 5)}`]);
    r.deposit(crafted(6, 'p:1', chest.id));
    expect(sim.cargo({ building: chest.id })!.slots[0].hold.items.map((i) => i.uid)).toEqual([`c:${craftKey('test-ridge', r.run, 6)}`]);
    r.tick();
    expect(r.holdRows().find((h) => h.ref === `b:${chest.id}`)).toMatchObject({ kind: 'chest', pid: 1, items: [{ def: 'xiphos' }] });
    // an eviction: the restored room holds the same
    const back = WarRoom.restore({ region, seed: 1, cap: 600 }, r.saveState(), new Map());
    expect(back.sim.cargo({ building: chest.id })!.slots[0].hold.items.map((i) => i.uid)).toEqual([`c:${craftKey('test-ridge', r.run, 6)}`]);
    expect(back.sim.cargo({ reserve: 0 })!.slots[0].hold.items).toHaveLength(1);
    // trade orders: the room checks the holder (M6 protocol)
    const w = r.join(2, { t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: 2, team: 1, army: [{ cls: 'militia', count: 4 }] }).msg as Extract<ServerMsg, { t: 'welcome' }>;
    const mine = w.squads[0];
    expect(r.order(2, { kind: 'unload', squad: mine, to: { building: chest.id } })).toBe('badTarget'); // not his chest
    expect(r.order(2, { kind: 'load', squad: mine, from: { pile: 99 } })).toBe('badTarget');
    expect(r.order(2, { kind: 'escort', squad: mine, cart: 99 })).toBe('badTarget');
    expect(r.order(2, { kind: 'load', squad: mine, from: { building: chest.id } })).toBeNull(); // a foe's chest: the sim judges the guard
    expect(r.order(2, { kind: 'load', squad: s, from: { building: chest.id } })).toBe('notOwner');
    expect(orderSchema.safeParse({ kind: 'load', squad: 1, from: { building: 1, cart: 2 } }).success).toBe(false);
    expect(orderSchema.safeParse({ kind: 'unload', squad: 1, to: { cart: 2 }, res: 'coin' }).success).toBe(true);
  });
});

describe('migration 0029 over a populated database', () => {
  it('moves war_stock to strongroom goods (silver as coin), the treasury to strongbox coin, items to the strongroom', async () => {
    const db = env.MIGRATE_DB;
    const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0029_'));
    await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
    await db.batch([
      db.prepare("INSERT INTO players (id, telegram_id, display_name, display_name_key, created_at, last_seen_at) VALUES (41, 4100, 'Mig', 'mig', 0, 0)"),
      db.prepare("INSERT INTO war_stock (player_id, res, amount) VALUES (41, 'food', 120), (41, 'silver', 75)"),
      db.prepare("INSERT INTO war_items (uid, player_id, item, created_at) VALUES ('i1', 41, '{}', 0)"),
      db.prepare("INSERT INTO war_items (uid, player_id, item, created_at, region) VALUES ('i2', 41, '{}', 0, 'test-ridge')"),
    ]);
    await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
    const goods = (await db.prepare('SELECT place, res, amount FROM war_goods ORDER BY res').all()).results;
    expect(goods).toEqual([{ place: 'sr:41', res: 'coin', amount: 75 }, { place: 'sr:41', res: 'food', amount: 120 }]);
    expect(await db.prepare("SELECT kind, player_id FROM war_holders WHERE id = 'sr:41'").first()).toEqual({ kind: 'strongroom', player_id: 41 });
    expect((await db.prepare('SELECT uid, place FROM war_items ORDER BY uid').all()).results).toEqual([{ uid: 'i1', place: 'sr:41' }, { uid: 'i2', place: null }]);
    expect(await db.prepare("SELECT name FROM sqlite_master WHERE name IN ('war_stock', 'war_treasury')").first()).toBeNull();
  });
});
