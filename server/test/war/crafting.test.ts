/**
 * M5h4 crafting persistence: profession nodes and respec over /api/war, crafted events written back once, stash items
 * taken to a workplace and back, and a room's queues and mends kept across an eviction.
 */
import { applyD1Migrations, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { good } from './goods';
import { NET_VERSION, type JoinMsg } from '../../../src/war/net/protocol';
import { RECIPES } from '../../../src/data/recipes';
import type { Item } from '../../../src/data/items';
import { BUILDINGS } from '../../../src/war/sim/economy';
import { makePerson } from '../../../src/war/sim/roster';
import type { BuildingType } from '../../../src/war/types';
import { flat } from '../../../tests/war/flatRegion';
import { WarRoom, type Crafted, type RoomState } from '../../src/war/room';
import { applyCrafts, craftKey, keepMends, RESPEC, returnMends, takeForMend } from '../../src/war/crafting';
import { api, devLogin } from '../helpers';

const DB = () => env.DB!;
const seedCiv = async (who: { token: string; playerId: number }, level: number) => {
  const r = await api('/api/war/dev/seed', { method: 'POST', token: who.token, json: { squad: [{ cls: 'hoplite' }], reserve: [{ cls: 'civ_smith', level }] } });
  expect(r.status).toBe(200);
  const { ids } = (await r.json()) as { ids: string[] };
  return { hoplite: ids[0], smith: ids[1] };
};
const node = (who: { token: string }, id: string, n: string) => api(`/api/war/persons/${id}/node`, { method: 'POST', token: who.token, json: { node: n } });

describe('profession nodes over /api/war', () => {
  it('takes nodes by the tree rules and keeps them on the person', async () => {
    const me = await devLogin(7601);
    const { hoplite, smith } = await seedCiv(me, 3); // L3: 2 points
    const ok = await node(me, smith, 'bladesmith');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ perks: ['bladesmith'] });
    const refusals: [string, string, string][] = [
      [smith, 'bladesmith', 'node_taken'],
      [smith, 'journeyman', 'node_level'],
      [smith, 'healer', 'node_tree'],
      [smith, 'nope', 'node_unknown'],
      [hoplite, 'bladesmith', 'not_civilian'],
    ];
    for (const [id, n, want] of refusals) {
      const r = await node(me, id, n);
      expect(r.status, n).toBe(409);
      expect(JSON.stringify(await r.json()), n).toContain(want);
    }
    expect((await node(me, smith, 'armourer')).status).toBe(200);
    const third = await node(me, smith, 'bowyer');
    expect(third.status).toBe(409);
    expect(JSON.stringify(await third.json())).toContain('node_points');
    const roster = (await (await api('/api/war/roster', { token: me.token })).json()) as { persons: { id: string; perks: string[] }[] };
    expect(roster.persons.find((p) => p.id === smith)!.perks).toEqual(['bladesmith', 'armourer']);
    const row = await DB().prepare('SELECT perks FROM war_persons WHERE id = ?1').bind(smith).first<{ perks: string }>();
    expect(JSON.parse(row!.perks)).toEqual(['bladesmith', 'armourer']);
  });

  it('respec: 50 silver, once a day, and not while he is in the field', async () => {
    const me = await devLogin(7602);
    const { smith } = await seedCiv(me, 3);
    const nothing = await api(`/api/war/persons/${smith}/respec`, { method: 'POST', token: me.token });
    expect(JSON.stringify(await nothing.json())).toContain('no_nodes');
    await node(me, smith, 'bladesmith');
    const silver = () => good(me.playerId, 'coin');
    const before = await silver();
    const r = await api(`/api/war/persons/${smith}/respec`, { method: 'POST', token: me.token });
    expect(r.status).toBe(200);
    expect(await silver()).toBe(before - RESPEC.coin);
    const row = await DB().prepare('SELECT perks, respec_at FROM war_persons WHERE id = ?1').bind(smith).first<{ perks: string; respec_at: number }>();
    expect(row!.perks).toBe('[]');
    await node(me, smith, 'armourer');
    const again = await api(`/api/war/persons/${smith}/respec`, { method: 'POST', token: me.token });
    expect(again.status).toBe(409);
    expect(JSON.stringify(await again.json())).toContain('respec_wait');
    // a day later he may again
    await DB().prepare('UPDATE war_persons SET respec_at = ?2 WHERE id = ?1').bind(smith, row!.respec_at - RESPEC.ms).run();
    expect((await api(`/api/war/persons/${smith}/respec`, { method: 'POST', token: me.token })).status).toBe(200);
    // in the field: no changes
    await DB().prepare("UPDATE war_persons SET region = 'test-ridge' WHERE id = ?1").bind(smith).run();
    const away = await node(me, smith, 'bladesmith');
    expect(JSON.stringify(await away.json())).toContain('deployed');
    expect(await silver()).toBe(before - 2 * RESPEC.coin);
  });
});

const item = (uid: string, def = 'xiphos', cond = 40): Item => ({ uid, def, rarity: 'common', cond, q: 1, mc: 100 });
const ev = (order: number, what: Crafted['what'], it: Item, owner: string): Crafted => ({ t: 1, kind: 'crafted', order, building: 1, team: 0, owner, recipe: `item:${it.def}`, what, item: it });
const stashRows = (pid: number) => DB().prepare('SELECT uid, item, region FROM war_items WHERE player_id = ?1 ORDER BY uid').bind(pid).all<{ uid: string; item: string; region: string | null }>().then((r) => r.results);

describe('crafted events written back', () => {
  it('records a crafted item once (it lies in the room, M6e); a replayed event changes nothing; bots write nothing', async () => {
    const me = await devLogin(7603);
    await DB().prepare('DELETE FROM war_items WHERE player_id = ?1').bind(me.playerId).run();
    const rolled: Item = { uid: 'c123', def: 'xiphos', rarity: 'rare', cond: 100, q: 2, mc: 100, mk: 'Nikias', aff: 'x' as never };
    const e = ev(7, 'craft', rolled, `p:${me.playerId}`);
    expect(await applyCrafts(DB(), 'test-ridge', 'run1', [e, ev(8, 'craft', rolled, 'bot:1')], 1000)).toBe(1);
    expect(await applyCrafts(DB(), 'test-ridge', 'run1', [e], 2000)).toBe(0);
    const keys = async () => (await DB().prepare('SELECT uid FROM war_crafts WHERE player_id = ?1 ORDER BY uid').bind(me.playerId).all<{ uid: string }>()).results.map((r) => r.uid);
    expect(await keys()).toEqual([`c:${craftKey('test-ridge', 'run1', 7)}`]);
    expect(await stashRows(me.playerId)).toHaveLength(0); // nothing abstract: the item is in the room's output chest
    // another run of the region: a new key
    expect(await applyCrafts(DB(), 'test-ridge', 'run2', [e], 3000)).toBe(1);
    expect(await keys()).toHaveLength(2);
  });

  it('a mend takes the stash item to the workplace; repair writes cond and mc back, salvage removes it', async () => {
    const me = await devLogin(7604);
    const { hoplite } = await seedCiv(me, 2);
    const pid = me.playerId;
    await DB().prepare('DELETE FROM war_items WHERE player_id = ?1').bind(pid).run();
    for (const uid of ['m1', 'm2', 'm3']) await DB().prepare('INSERT INTO war_items (uid, player_id, item, created_at, place) VALUES (?1, ?2, ?3, 0, ?4)').bind(uid, pid, JSON.stringify(item(uid)), `sr:${pid}`).run();
    expect(await takeForMend(DB(), pid, 'm1', 'test-ridge')).toEqual(item('m1'));
    expect(await takeForMend(DB(), pid, 'm1', 'test-ridge')).toBeNull(); // already there
    expect(await takeForMend(DB(), pid + 1, 'm2', 'test-ridge')).toBeNull(); // not his
    // at the workplace it cannot be put on, and the stash says where it is
    const eq = await api(`/api/war/persons/${hoplite}/equip`, { method: 'POST', token: me.token, json: { slot: 'weapon', uid: 'm1' } });
    expect(eq.status).toBe(404);
    const st = (await (await api('/api/war/stash', { token: me.token })).json()) as { items: { item: Item; region: string | null }[] };
    expect(st.items.find((x) => x.item.uid === 'm1')!.region).toBe('test-ridge');
    // repaired: the client never sent the item; the event's cond / mc go in and it is home again
    const mended = { ...item('m1'), cond: 95, mc: 95 };
    await applyCrafts(DB(), 'test-ridge', 'r', [ev(1, 'repair', mended, `p:${pid}`)], 1);
    let rows = await stashRows(pid);
    expect(rows.find((r) => r.uid === 'm1')).toMatchObject({ region: null });
    expect(JSON.parse(rows.find((r) => r.uid === 'm1')!.item)).toEqual(mended);
    // salvage of an item at home does nothing; at the workplace it is gone
    await applyCrafts(DB(), 'test-ridge', 'r', [ev(2, 'salvage', item('m2'), `p:${pid}`)], 1);
    expect((await stashRows(pid)).map((r) => r.uid)).toContain('m2');
    await takeForMend(DB(), pid, 'm3', 'test-ridge');
    await applyCrafts(DB(), 'test-ridge', 'r', [ev(3, 'salvage', item('m3'), `p:${pid}`)], 1);
    rows = await stashRows(pid);
    expect(rows.map((r) => r.uid)).toEqual(['m1', 'm2']);
    // returned and stray mends go home
    await takeForMend(DB(), pid, 'm1', 'test-ridge');
    await takeForMend(DB(), pid, 'm2', 'test-ridge');
    await returnMends(DB(), 'test-ridge', ['m1']);
    await keepMends(DB(), 'test-ridge', []);
    expect((await stashRows(pid)).every((r) => r.region === null)).toBe(true);
  });
});

// ---------------------------------------------------------------- the room

const region = { ...flat(96), id: 'craft-test' };
const ticks = (r: WarRoom, n: number, until?: () => boolean) => {
  const out: Crafted[] = [], freed: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = r.tick();
    out.push(...t.crafted);
    freed.push(...t.freed);
    if (until?.()) break;
  }
  return { crafted: out, freed };
};
const bld = (r: WarRoom, id: number) => r.snapshot().buildings!.find((b) => b.id === id)!;

const SMITH = (perks: string[]) => {
  const p = makePerson('s1', 'civ_smith', { level: 3, name: 'Nikias' });
  p.hero.perks = perks as never;
  return p;
};

/** A room with player 1 (team 0) joined and a done camp (0) and forge (1), a smith (perks) at work at the forge. */
function forgeRoom(perks: string[]): WarRoom {
  const r = new WarRoom({ region, seed: 1, cap: 600 });
  const join: JoinMsg = { t: 'join', v: NET_VERSION, region: region.id, playerId: 1, team: 0, army: [{ cls: 'militia', count: 1 }] };
  expect(r.join(1, join).msg).toMatchObject({ t: 'welcome' });
  const sim = r.sim, types: BuildingType[] = ['camp', 'forge'];
  sim.claim(0, 40, 40, 40);
  for (const t of types) for (const [k, v] of Object.entries(BUILDINGS[t].cost)) sim.addStock(0, k as never, v);
  const squads = types.map((t, i) => {
    const s = sim.spawnSquad('a', 0, 'militia', 12, 30 + i * 10, 46);
    sim.order({ kind: 'placeBuilding', squad: s, type: t, x: 30 + i * 10, y: 40 });
    return s;
  });
  ticks(r, 8000, () => types.every((_, i) => bld(r, i)?.state === 'done'));
  for (const s of squads) sim.order({ kind: 'move', squad: s, x: 4, y: 4 + s });
  const smith = SMITH(perks);
  const f = bld(r, 1);
  const s = sim.spawnSquad('p:1', 0, 'civ_smith', 1, f.x, f.y + 3, [smith]);
  sim.order({ kind: 'civWork', squad: s, building: 1 });
  ticks(r, 300);
  return r;
}

describe('crafting in the region room', () => {
  it('queues and mends survive an eviction; crafted events and freed mends come out of tick()', () => {
    const r = forgeRoom(['bladesmith']);
    r.sim.addStock(0, 'bronze', 20);
    r.sim.addStock(0, 'wood', 20);
    expect(r.order(1, { kind: 'craft', building: 1, recipe: RECIPES['item:xiphos'].id })).toBeNull();
    expect(r.order(1, { kind: 'craft', building: 1, recipe: RECIPES['item:xiphos'].id })).toBeNull();
    expect(r.mend(1, 'repair', 1, item('w1'))).toBeNull();
    expect(r.mend(1, 'repair', 1, item('w1'))).toBe('bad'); // the same item twice
    expect(r.mend(1, 'salvage', 0, item('w2'))).toBeNull(); // the camp is no forge: the sim refuses it, tick frees it
    expect(r.mend(2, 'repair', 1, item('w3'))).toBe('notJoined');
    const first = ticks(r, 30);
    expect(first.freed).toEqual(['w2']);
    expect(bld(r, 1).queue!.map((q) => q.kind)).toEqual(['craft', 'craft', 'repair']);
    const st = JSON.parse(JSON.stringify(r.saveState())) as RoomState;
    const smith = r.sim.snapshot().units.find((u) => u.pid === 's1')!;
    expect(smith).toBeTruthy();
    const back = WarRoom.restore({ region, seed: 1, cap: 600 }, st, new Map([['s1', SMITH(['bladesmith'])]]));
    expect(back.run).toBe(r.run);
    expect(back.mendUids()).toEqual(['w1']);
    expect(JSON.stringify(bld(back, 1).queue)).toBe(JSON.stringify(bld(r, 1).queue));
    // both step on alike and craft the same sword
    const a = ticks(r, 3000, () => !bld(r, 1).queue), b = ticks(back, 3000, () => !bld(back, 1).queue);
    expect(a.crafted.map((e) => e.what)).toEqual(['craft', 'craft', 'repair']);
    expect(JSON.stringify(b.crafted)).toBe(JSON.stringify(a.crafted));
    expect(a.crafted[0]).toMatchObject({ owner: 'p:1', pid: 's1', item: { def: 'xiphos', mk: 'Nikias' } });
    expect(a.crafted[2].item).toMatchObject({ uid: 'w1', cond: 95, mc: 95 });
    expect(r.mendUids()).toEqual([]);
  });

  it('a cancelled mend goes back to the stash', () => {
    const r = forgeRoom([]);
    expect(r.mend(1, 'salvage', 1, item('z1'))).toBeNull();
    ticks(r, 2);
    const q = bld(r, 1).queue;
    expect(q?.[0]).toMatchObject({ kind: 'salvage', recipe: 'xiphos' });
    expect(r.order(1, { kind: 'cancelCraft', building: 1, order: q![0].id })).toBeNull();
    expect(ticks(r, 2).freed).toEqual(['z1']);
  });
});

describe('migration 0023 over rows', () => {
  it('adds perks, respec_at and the item region on a populated war schema', async () => {
    const db = env.MIGRATE_DB;
    const all = env.TEST_MIGRATIONS;
    const at = all.findIndex((m) => m.name === '0023_war_crafting.sql');
    await applyD1Migrations(db, all.slice(0, at));
    await db.batch([
      db.prepare("INSERT INTO players (id, telegram_id, name) VALUES (90001, 90001, 'm')"),
      db.prepare("INSERT INTO war_persons (id, player_id, cls, state) VALUES ('wp1', 90001, 'civ_smith', 'reserve')"),
      db.prepare("INSERT INTO war_items (uid, player_id, item) VALUES ('wi1', 90001, '{}')"),
    ]).catch(async () => {
      // players columns differ by migration: fall back to the minimum the table needs
      const cols = (await db.prepare('SELECT name, "notnull", dflt_value FROM pragma_table_info(?)').bind('players').all<{ name: string; notnull: number; dflt_value: unknown }>()).results;
      const need = cols.filter((c) => c.notnull && c.dflt_value === null && c.name !== 'id');
      await db.prepare(`INSERT INTO players (id${need.map((c) => `, ${c.name}`).join('')}) VALUES (90001${need.map(() => ", 'x'").join('')})`).run();
      await db.prepare("INSERT INTO war_persons (id, player_id, cls, state) VALUES ('wp1', 90001, 'civ_smith', 'reserve')").run();
      await db.prepare("INSERT INTO war_items (uid, player_id, item) VALUES ('wi1', 90001, '{}')").run();
    });
    await applyD1Migrations(db, all.slice(at, at + 1));
    expect(await db.prepare("SELECT perks, respec_at FROM war_persons WHERE id = 'wp1'").first()).toEqual({ perks: '[]', respec_at: null });
    expect(await db.prepare("SELECT region FROM war_items WHERE uid = 'wi1'").first()).toEqual({ region: null });
  });
});
