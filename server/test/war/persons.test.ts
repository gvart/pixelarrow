/** M5e: war_persons in D1, the roster API (caps, equip, level-up, squad), W-60 claimed souls and the idempotent fight write-back. */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, devLogin } from '../helpers';
import { applyFight, armyCount, claimForJoin, claimSoul, personOf, START, type PersonRow } from '../../src/war/persons';
import { makePerson } from '../../../src/war/sim/roster';
import { ARMY_MAX } from '../../../src/war/sim/soldiers';
import { warStatsOf } from '../../../src/war/sim/classes';
import type { FightReport } from '../../../src/war/types';

const DB = () => env.DB!;

interface RosterBody {
  persons: { id: string; cls: string; name: string; level: number; xp: number; state: string; slot: number | null; region: string | null; gear: Record<string, { uid: string; def: string } | undefined>; skills: string[]; attrs: Record<string, number>; pending: { points: number; skills: number }; until: number | null }[];
  caps: { army: number; household: number; fighters: number; fit: number };
  stock: Record<string, number>;
  items: { uid: string; def: string }[];
}
const roster = async (token: string) => (await api('/api/war/roster', { token })).json<RosterBody>();
const post = (token: string, path: string, json: unknown) => api(`/api/war${path}`, { method: 'POST', token, json });
/** A soul's person as the sim makes him (src/war/sim/souls.ts). */
const soul = (id: string, cls = 'hoplite', level = 1) => makePerson(`soul-${id}`, cls, { level });
const claim = (pid: number, id: string, cls?: string, level?: number) => claimSoul(DB(), pid, soul(id, cls, level), 'test-ridge', Date.now());
const row = (id: string) => DB().prepare('SELECT * FROM war_persons WHERE id = ?1').bind(id).first<PersonRow & { until_at: number | null }>();

describe('war_persons migration', () => {
  it('creates the roster tables', async () => {
    const cols = async (t: string) => (await DB().prepare('SELECT name FROM pragma_table_info(?1)').bind(t).all<{ name: string }>()).results.map((c) => c.name);
    expect(await cols('war_persons')).toEqual(expect.arrayContaining(['id', 'player_id', 'cls', 'level', 'xp', 'attrs', 'skills', 'gear', 'honours', 'state', 'until_at', 'captor', 'held_at', 'slot', 'region']));
    for (const t of ['war_goods', 'war_holders', 'war_items', 'war_fights']) expect((await cols(t)).length).toBeGreaterThan(2);
    const me = await devLogin(7301);
    await expect(DB().prepare("INSERT INTO war_persons (id, player_id, state) VALUES ('x', ?1, 'resting')").bind(me.playerId).run()).rejects.toThrow(/CHECK/);
  });
});

describe('war roster API', () => {
  it('needs a session', async () => {
    expect((await api('/api/war/roster')).status).toBe(401);
  });

  it('no recruiting (W-60): a claimed soul joins in his region, up to the army cap', async () => {
    const me = await devLogin(7302);
    const r0 = await roster(me.token);
    expect(r0.persons).toEqual([]);
    expect(r0.stock.food).toBe(START.food);
    expect(r0.caps).toMatchObject({ army: ARMY_MAX, household: 1 });
    expect((r0 as unknown as { pools?: unknown }).pools).toBeUndefined();
    expect((await post(me.token, '/recruit', { town: 'home', count: 1 })).status).toBe(404);
    expect(await claim(me.playerId, '7302-0', 'archer', 3)).toBe(true);
    for (let k = 1; k < ARMY_MAX; k++) expect(await claim(me.playerId, `7302-${k}`)).toBe(true);
    const r1 = await roster(me.token);
    expect(r1.persons).toHaveLength(ARMY_MAX);
    expect(r1.persons.find((p) => p.id === 'soul-7302-0')).toMatchObject({ cls: 'archer', level: 3, state: 'active', region: 'test-ridge' });
    expect(r1.caps).toMatchObject({ army: ARMY_MAX, fighters: ARMY_MAX, fit: ARMY_MAX });
    expect(await armyCount(DB(), me.playerId)).toBe(ARMY_MAX);
    // at ARMY_MAX a claim is refused and nothing is written
    expect(await claim(me.playerId, '7302-x')).toBe(false);
    expect(await row('soul-7302-x')).toBeNull();
    // the dead free their place, one man's worth
    await DB().prepare("UPDATE war_persons SET state = 'dead' WHERE id = ?1").bind('soul-7302-1').run();
    expect(await claim(me.playerId, '7302-x')).toBe(true);
    expect(await claim(me.playerId, '7302-y')).toBe(false);
    // the same soul twice is one man
    await DB().prepare("UPDATE war_persons SET state = 'dead' WHERE id = ?1").bind('soul-7302-2').run();
    expect(await claim(me.playerId, '7302-x')).toBe(false);
  });

  it('counts the wounded, captive and training men toward the army cap', async () => {
    const me = await devLogin(7308);
    expect((await post(me.token, '/dev/seed', {})).status).toBe(200);
    const ids = (await roster(me.token)).persons.map((p) => p.id);
    expect(ids).toHaveLength(ARMY_MAX);
    const far = Date.now() + 3_600_000;
    await DB().prepare("UPDATE war_persons SET state = 'wounded', until_at = ?2 WHERE id = ?1").bind(ids[0], far).run();
    await DB().prepare("UPDATE war_persons SET state = 'captive', until_at = ?2 WHERE id = ?1").bind(ids[1], far).run();
    await DB().prepare("UPDATE war_persons SET state = 'training', until_at = ?2, train_to = 'archer' WHERE id = ?1").bind(ids[2], far).run();
    const r = await roster(me.token);
    expect(r.caps).toMatchObject({ army: ARMY_MAX, fighters: ARMY_MAX, fit: ARMY_MAX - 3 });
    expect(await claim(me.playerId, '7308-a')).toBe(false);
  });

  it('counts the men of every region toward one cap', async () => {
    const me = await devLogin(7309);
    await post(me.token, '/dev/seed', {});
    const ids = (await roster(me.token)).persons.map((p) => p.id);
    const half = ARMY_MAX / 2;
    expect(Array.isArray(await claimForJoin(DB(), me.playerId, 'test-ridge', [ids.slice(0, half)], new Set(), Date.now()))).toBe(true);
    expect(Array.isArray(await claimForJoin(DB(), me.playerId, 'elsewhere', [ids.slice(half)], new Set(), Date.now()))).toBe(true);
    const r = await roster(me.token);
    expect(r.persons.filter((p) => p.region === 'test-ridge')).toHaveLength(half);
    expect(r.persons.filter((p) => p.region === 'elsewhere')).toHaveLength(half);
    expect(r.caps.fighters).toBe(ARMY_MAX);
    expect(await claim(me.playerId, '7309-a')).toBe(false);
    // a dev seed of more men at home is refused too: the field already holds the whole army
    expect(await (await post(me.token, '/dev/seed', { squad: [{ cls: 'hoplite' }] })).json()).toMatchObject({ error: { code: 'army_full' } });
    // a man dies in one region: one soul may join
    await DB().prepare("UPDATE war_persons SET state = 'dead', region = NULL WHERE id = ?1").bind(ids[0]).run();
    expect(await claim(me.playerId, '7309-a')).toBe(true);
    expect((await roster(me.token)).caps.fighters).toBe(ARMY_MAX);
  });

  it('orders the squad, spends level-up choices and equips from the stash', async () => {
    const me = await devLogin(7303);
    expect((await post(me.token, '/dev/seed', {})).status).toBe(200);
    const r = await roster(me.token);
    const squad = r.persons.filter((p) => p.state === 'active');
    expect(squad).toHaveLength(ARMY_MAX);
    expect(squad.map((p) => p.slot)).toEqual([...Array(ARMY_MAX).keys()]);
    expect(r.persons.filter((p) => p.state !== 'active')).toEqual([]); // no reserve
    // squad: at most ARMY_MAX, each once; the rest keep fit with no slot
    expect((await post(me.token, '/squad', { ids: [...squad.map((p) => p.id), 'w0-extra'] })).status).toBe(400);
    expect((await post(me.token, '/squad', { ids: [squad[0].id, squad[0].id] })).status).toBe(400);
    expect((await post(me.token, '/squad', { ids: [squad[5].id, squad[1].id] })).status).toBe(200);
    const r2 = await roster(me.token);
    expect(r2.persons.filter((p) => p.slot !== null).map((p) => [p.id, p.slot])).toEqual([[squad[5].id, 0], [squad[1].id, 1]]);
    expect(r2.persons.every((p) => p.state === 'active')).toBe(true);

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
    const archer = squad.find((p) => p.cls === 'archer')!;
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
    expect(Array.isArray(got) && got[0].length).toBe(ARMY_MAX);
    expect((await roster(me.token)).persons.filter((p) => p.region === 'test-ridge')).toHaveLength(ARMY_MAX);
    expect(await (await post(me.token, `/persons/${ids[0]}/level`, {})).json()).toMatchObject({ error: { code: 'deployed' } });
    expect(await (await post(me.token, `/persons/${ids[0]}/equip`, { slot: 'helmet', uid: null })).json()).toMatchObject({ error: { code: 'deployed' } });
    // a second claim of the same men (another region) fails, and so does a claim of unknown or unfit ones
    expect(await claimForJoin(DB(), me.playerId, 'elsewhere', [ids.slice(0, 2)], new Set(), Date.now())).toMatch(/already in the field/);
    expect(await claimForJoin(DB(), me.playerId, 'test-ridge', [['nobody']], new Set(), Date.now())).toMatch(/no soldier/);
    expect(await claimForJoin(DB(), me.playerId, 'test-ridge', [[ids[0], ids[0]]], new Set(), Date.now())).toMatch(/twice/);
  });

  it('reads a civilian back as a civilian (his class and tool, stats the sim can bake)', async () => {
    const me = await devLogin(7399);
    await post(me.token, '/dev/seed', { squad: [{ cls: 'civ_smith', level: 5 }] });
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
    // timers: healed and released men are fit again once their time is up
    await DB().prepare('UPDATE war_persons SET until_at = 1 WHERE id IN (?1, ?2)').bind(b.id, c.id).run();
    const r = await roster(me.token);
    expect(r.persons.find((p) => p.id === b.id)!.state).toBe('active');
    expect(r.persons.find((p) => p.id === c.id)!.state).toBe('active');
    expect(r.persons.find((p) => p.id === d.id)!.state).toBe('dead');
    expect(r.caps.fighters).toBe(ARMY_MAX - 1);
  });
});
