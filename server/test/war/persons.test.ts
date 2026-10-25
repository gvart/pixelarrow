/** M5e: war_persons in D1, the roster API (recruit, caps, equip, level-up, squad) and the idempotent fight write-back. */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { setGood } from './goods';
import { api, devLogin } from '../helpers';
import { applyFight, claimForJoin, personOf, ROSTER_MAX, START, type PersonRow } from '../../src/war/persons';
import { SQUAD_MAX } from '../../../src/war/sim/soldiers';
import { warStatsOf } from '../../../src/war/sim/classes';
import type { FightReport } from '../../../src/war/types';

const DB = () => env.DB!;

interface RosterBody {
  persons: { id: string; cls: string; name: string; level: number; xp: number; state: string; slot: number | null; region: string | null; gear: Record<string, { uid: string; def: string } | undefined>; skills: string[]; attrs: Record<string, number>; pending: { points: number; skills: number }; until: number | null }[];
  caps: { squad: number; reserve: number; roster: number; household: number; fighters: number; fit: number };
  pools: { town: string; recruits: number }[];
  stock: Record<string, number>;
  items: { uid: string; def: string }[];
}
const roster = async (token: string) => (await api('/api/war/roster', { token })).json<RosterBody>();
const post = (token: string, path: string, json: unknown) => api(`/api/war${path}`, { method: 'POST', token, json });
const row = (id: string) => DB().prepare('SELECT * FROM war_persons WHERE id = ?1').bind(id).first<PersonRow & { until_at: number | null }>();

describe('war_persons migration', () => {
  it('creates the roster tables', async () => {
    const cols = async (t: string) => (await DB().prepare('SELECT name FROM pragma_table_info(?1)').bind(t).all<{ name: string }>()).results.map((c) => c.name);
    expect(await cols('war_persons')).toEqual(expect.arrayContaining(['id', 'player_id', 'cls', 'level', 'xp', 'attrs', 'skills', 'gear', 'honours', 'state', 'until_at', 'captor', 'held_at', 'slot', 'region']));
    for (const t of ['war_pools', 'war_goods', 'war_holders', 'war_items', 'war_fights']) expect((await cols(t)).length).toBeGreaterThan(2);
    const me = await devLogin(7301);
    await expect(DB().prepare("INSERT INTO war_persons (id, player_id, state) VALUES ('x', ?1, 'resting')").bind(me.playerId).run()).rejects.toThrow(/CHECK/);
  });
});

describe('war roster API', () => {
  it('needs a session', async () => {
    expect((await api('/api/war/roster')).status).toBe(401);
  });

  it('recruits militia from the home pool for food, up to the roster cap', async () => {
    const me = await devLogin(7302);
    const r0 = await roster(me.token);
    expect(r0.persons).toEqual([]);
    expect(r0.pools).toEqual([expect.objectContaining({ town: 'home', recruits: START.pool })]);
    expect(r0.stock.food).toBe(START.food);
    expect(r0.caps).toMatchObject({ squad: SQUAD_MAX, reserve: SQUAD_MAX / 2, roster: ROSTER_MAX, household: 1 });
    expect((await post(me.token, '/recruit', { town: 'athens', count: 1 })).status).toBe(404);
    const res = await post(me.token, '/recruit', { town: 'home', count: SQUAD_MAX });
    expect(res.status).toBe(200);
    const r1 = await roster(me.token);
    expect(r1.persons).toHaveLength(SQUAD_MAX);
    expect(r1.persons.every((p) => p.cls === 'militia' && p.level === 1 && p.state === 'reserve')).toBe(true);
    expect(new Set(r1.persons.map((p) => p.name)).size).toBe(SQUAD_MAX); // every man has his own name
    expect(r1.stock.food).toBe(START.food - 20 * SQUAD_MAX);
    expect(r1.pools[0].recruits).toBe(0);
    expect(r1.caps.household).toBe(4);
    // the pool is empty now; refilled, the food runs out; with food, the roster cap stops it
    expect(await (await post(me.token, '/recruit', { town: 'home', count: 1 })).json()).toMatchObject({ error: { code: 'pool_empty' } });
    await DB().prepare('UPDATE war_pools SET stored = 30 WHERE player_id = ?1').bind(me.playerId).run();
    await setGood(me.playerId, 'food', 10);
    expect(await (await post(me.token, '/recruit', { town: 'home', count: 1 })).json()).toMatchObject({ error: { code: 'no_food' } });
    await setGood(me.playerId, 'food', 1000);
    expect((await post(me.token, '/recruit', { town: 'home', count: ROSTER_MAX - SQUAD_MAX })).status).toBe(200);
    expect(await (await post(me.token, '/recruit', { town: 'home', count: 1 })).json()).toMatchObject({ error: { code: 'roster_full' } });
    // the dead free their place
    await DB().prepare("UPDATE war_persons SET state = 'dead' WHERE id = ?1").bind(r1.persons[0].id).run();
    expect((await post(me.token, '/recruit', { town: 'home', count: 1 })).status).toBe(200);
  });

  it('forms the squad, spends level-up choices and equips from the stash', async () => {
    const me = await devLogin(7303);
    expect((await post(me.token, '/dev/seed', {})).status).toBe(200);
    const r = await roster(me.token);
    const squad = r.persons.filter((p) => p.state === 'active'), reserve = r.persons.filter((p) => p.state === 'reserve');
    expect(squad).toHaveLength(SQUAD_MAX);
    expect(reserve).toHaveLength(SQUAD_MAX / 2);
    expect(squad.map((p) => p.slot)).toEqual([...Array(SQUAD_MAX).keys()]);
    // squad: at most SQUAD_MAX, each once; the rest go to the reserve
    expect((await post(me.token, '/squad', { ids: r.persons.slice(0, SQUAD_MAX + 1).map((p) => p.id) })).status).toBe(400);
    expect((await post(me.token, '/squad', { ids: [squad[0].id, squad[0].id] })).status).toBe(400);
    expect((await post(me.token, '/squad', { ids: [reserve[0].id, squad[1].id] })).status).toBe(200);
    const r2 = await roster(me.token);
    expect(r2.persons.filter((p) => p.state === 'active').map((p) => [p.id, p.slot])).toEqual([[reserve[0].id, 0], [squad[1].id, 1]]);

    // a level-3 hoplite with points and no skill yet: one skill of his family, points up to ATTR_MAX
    const h = squad.find((p) => p.level === 3)!;
    await DB().prepare("UPDATE war_persons SET points = 2, skills = '[]' WHERE id = ?1").bind(h.id).run();
    expect((await roster(me.token)).persons.find((p) => p.id === h.id)!.pending).toEqual({ points: 2, skills: 1 });
    expect(await (await post(me.token, `/persons/${h.id}/level`, { skill: 'volley' })).json()).toMatchObject({ error: { code: 'bad_skill' } });
    expect(await (await post(me.token, `/persons/${h.id}/level`, { attrs: { str: 3 } })).json()).toMatchObject({ error: { code: 'no_points' } });
    expect((await post(me.token, `/persons/${h.id}/level`, { attrs: { str: 2 }, skill: 'shieldWall' })).status).toBe(200);
    const h2 = (await roster(me.token)).persons.find((p) => p.id === h.id)!;
    expect(h2.pending).toEqual({ points: 0, skills: 0 });
    expect(h2.skills).toEqual(['shieldWall']);
    expect(h2.attrs.str).toBe(h.attrs.str + 2);
    expect(await (await post(me.token, `/persons/${h.id}/level`, { skill: 'shieldDrill' })).json()).toMatchObject({ error: { code: 'bad_skill' } }); // the level-7 slot is shut

    // equip: off to the stash, a stash piece on; a piece of the wrong slot or class is refused
    const helm = h.gear.helmet!;
    expect((await post(me.token, `/persons/${h.id}/equip`, { slot: 'helmet', uid: null })).status).toBe(200);
    let r3 = await roster(me.token);
    expect(r3.persons.find((p) => p.id === h.id)!.gear.helmet).toBeUndefined();
    expect(r3.items.map((i) => i.uid)).toContain(helm.uid);
    expect(await (await post(me.token, `/persons/${h.id}/equip`, { slot: 'weapon', uid: helm.uid })).json()).toMatchObject({ error: { code: 'wrong_slot' } });
    const archer = reserve.find((p) => p.cls === 'archer')!;
    const shield = r3.items.find((i) => i.def.includes('hoplon') || i.uid.includes('shield'));
    if (shield) expect(await (await post(me.token, `/persons/${archer.id}/equip`, { slot: 'shield', uid: shield.uid })).json()).toMatchObject({ error: { code: 'class_gear' } });
    expect((await post(me.token, `/persons/${h.id}/equip`, { slot: 'helmet', uid: helm.uid })).status).toBe(200);
    r3 = await roster(me.token);
    expect(r3.persons.find((p) => p.id === h.id)!.gear.helmet?.uid).toBe(helm.uid);
    expect(r3.items.map((i) => i.uid)).not.toContain(helm.uid);
    // another player's soldier is not found
    const other = await devLogin(7304);
    expect((await post(other.token, `/persons/${h.id}/level`, {})).status).toBe(404);
  });

  it('leaves deployed soldiers alone', async () => {
    const me = await devLogin(7305);
    await post(me.token, '/dev/seed', {});
    const r = await roster(me.token);
    const ids = r.persons.filter((p) => p.state === 'active').map((p) => p.id);
    const got = await claimForJoin(DB(), me.playerId, 'test-ridge', [ids], new Set(), Date.now());
    expect(Array.isArray(got) && got[0].length).toBe(SQUAD_MAX);
    expect((await roster(me.token)).persons.filter((p) => p.region === 'test-ridge')).toHaveLength(SQUAD_MAX);
    expect(await (await post(me.token, `/persons/${ids[0]}/level`, {})).json()).toMatchObject({ error: { code: 'deployed' } });
    expect(await (await post(me.token, `/persons/${ids[0]}/equip`, { slot: 'helmet', uid: null })).json()).toMatchObject({ error: { code: 'deployed' } });
    // a second claim of the same men (another region) fails, and so does a claim of unknown or unfit ones
    expect(await claimForJoin(DB(), me.playerId, 'elsewhere', [ids.slice(0, 2)], new Set(), Date.now())).toMatch(/already in the field/);
    expect(await claimForJoin(DB(), me.playerId, 'test-ridge', [['nobody']], new Set(), Date.now())).toMatch(/no soldier/);
    expect(await claimForJoin(DB(), me.playerId, 'test-ridge', [[ids[0], ids[0]]], new Set(), Date.now())).toMatch(/twice/);
  });

  it('reads a civilian back as a civilian (his class and tool, stats the sim can bake)', async () => {
    const me = await devLogin(7399);
    await post(me.token, '/dev/seed', { squad: [{ cls: 'civ_smith', level: 5 }], reserve: [] });
    const smith = (await roster(me.token)).persons.find((p) => p.cls === 'civ_smith')!;
    const got = await claimForJoin(DB(), me.playerId, 'test-ridge', [[smith.id]], new Set(), Date.now());
    const p = Array.isArray(got) ? got[0][0] : null;
    expect(p?.hero).toMatchObject({ cls: 'civ_smith', level: 5, equip: { weapon: { def: 'stone_hammer' } } });
    expect(() => warStatsOf(p!)).not.toThrow();
  });
});

describe('fight write-back', () => {
  it('writes XP, wounds, captives, deaths and loot once per fight id', async () => {
    const me = await devLogin(7306), foe = await devLogin(7307);
    await post(me.token, '/dev/seed', {});
    const ids = (await roster(me.token)).persons.filter((p) => p.state === 'active').map((p) => p.id);
    const got = await claimForJoin(DB(), me.playerId, 'test-ridge', [ids.slice(0, 4)], new Set(), Date.now());
    if (typeof got === 'string') throw new Error(got);
    const [a, b, c, d] = got[0];
    const owner = `p:${me.playerId}`;
    const lvl = (h: typeof a.hero, xp: number) => ({ ...h, xp: h.xp + xp, kills: h.kills + 1, battles: h.battles + 1 });
    const report: FightReport = {
      tick: 900,
      persons: [
        { pid: a.id, owner, team: 0, state: 'fit', xp: 30, kills: 1, dmg: 100, levelUps: 0, hero: lvl(a.hero, 30) },
        { pid: b.id, owner, team: 0, state: 'wounded', xp: 10, kills: 0, dmg: 20, levelUps: 0, hero: lvl(b.hero, 10) },
        { pid: c.id, owner, team: 0, state: 'captive', captor: 1, xp: 5, kills: 0, dmg: 0, levelUps: 0, hero: lvl(c.hero, 5) },
        { pid: d.id, owner, team: 0, state: 'dead', xp: 0, kills: 0, dmg: 0, levelUps: 0, hero: { ...d.hero, equip: {} } },
        { pid: 'w-foe-ghost', owner: `p:${foe.playerId}`, team: 1, state: 'fit', xp: 15, kills: 1, dmg: 40, levelUps: 0, hero: a.hero },
      ],
      loot: { 1: [{ uid: 'dropped-1', def: Object.values(d.hero.equip)[0]!.def, rarity: 'common', cond: 100 }] },
    };
    const t = Date.now();
    expect(await applyFight(DB(), 'test-ridge:e1:900', 'test-ridge', report, t)).toBe(true);
    const snap = async () => Promise.all([a, b, c, d].map((p) => row(p.id)));
    const after = await snap();
    expect(after[0]).toMatchObject({ state: 'active', xp: a.hero.xp + 30, kills: a.hero.kills + 1, region: 'test-ridge' });
    expect(after[1]).toMatchObject({ state: 'wounded', region: null, slot: null });
    expect(after[1]!.until_at).toBe(t + 6 * 3_600_000);
    expect(after[2]).toMatchObject({ state: 'captive', captor: 1, held_at: 'test-ridge', region: null });
    expect(after[3]).toMatchObject({ state: 'dead', gear: '{}', region: null });
    // M6e: loot is physical (piles and packs in the room): nothing is minted
    const loot = await DB().prepare('SELECT player_id FROM war_items WHERE fight_id = ?1').bind('test-ridge:e1:900').all<{ player_id: number }>();
    expect(loot.results).toEqual([]);
    // the same fight again (a retried write): nothing changes
    expect(await applyFight(DB(), 'test-ridge:e1:900', 'test-ridge', report, t + 60_000)).toBe(false);
    expect(await snap()).toEqual(after);
    expect((await DB().prepare('SELECT COUNT(*) AS n FROM war_items WHERE fight_id = ?1').bind('test-ridge:e1:900').first<{ n: number }>())!.n).toBe(0);
    // the public boards' tallies, written once: both sides kept a fit man, so neither won
    const stats = await DB().prepare('SELECT player_id, kills, fights, wins FROM war_player_stats WHERE player_id IN (?1, ?2) ORDER BY player_id').bind(me.playerId, foe.playerId).all();
    expect(stats.results).toEqual([
      { player_id: me.playerId, kills: 1, fights: 1, wins: 0 },
      { player_id: foe.playerId, kills: 1, fights: 1, wins: 0 },
    ].sort((x, y) => x.player_id - y.player_id));
    // the hero read back is the one written
    expect(personOf(after[0]!).hero.xp).toBe(a.hero.xp + 30);
    // timers: healed and released men come back to the reserve once their time is up
    await DB().prepare('UPDATE war_persons SET until_at = 1 WHERE id IN (?1, ?2)').bind(b.id, c.id).run();
    const r = await roster(me.token);
    expect(r.persons.find((p) => p.id === b.id)!.state).toBe('reserve');
    expect(r.persons.find((p) => p.id === c.id)!.state).toBe('reserve');
    expect(r.persons.find((p) => p.id === d.id)!.state).toBe('dead');
    expect(r.caps.fighters).toBe(ROSTER_MAX - 1);
  });
});
