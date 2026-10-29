/** M5e lifecycle in D1: no training (W-60), captives' upkeep (W-68 prisoners: ./captives.test.ts) and retirement (server/src/war/persons.ts). */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { good, setGood } from './goods';
import { api, devLogin } from '../helpers';
import { applyFight, claimForJoin, claimSoul, personOf, settle, type PersonRow } from '../../src/war/persons';
import { makePerson } from '../../../src/war/sim/roster';
import { ARMY_MAX } from '../../../src/war/sim/soldiers';
import type { FightReport, PersonResult } from '../../../src/war/types';

const DB = () => env.DB!;
const HOUR = 3_600_000;

interface P { id: string; cls: string; name: string; level: number; xp: number; state: string; slot: number | null; gear: Record<string, { def: string } | undefined>; skills: string[]; until: number | null; trainTo: string | null }
interface RosterBody { persons: P[]; caps: { fighters: number }; stock: Record<string, number>; items: { def: string }[]; captives: { id: string; owner: number }[]; upkeep: { rate: number; owed: number; unpaid: boolean } }
const roster = async (token: string) => (await api('/api/war/roster', { token })).json<RosterBody>();
const post = (token: string, path: string, json: unknown = {}) => api(`/api/war${path}`, { method: 'POST', token, json });
const code = async (r: Response) => ((await r.json()) as { error?: { code: string } }).error?.code;
const row = (id: string) => DB().prepare('SELECT * FROM war_persons WHERE id = ?1').bind(id).first<PersonRow>();
const stock = (pid: number, res: string) => good(pid, res === 'silver' ? 'coin' : res);

/** Deploy `ids` of the player into test-ridge and write a fight in which they end as `states`. */
async function fight(me: { playerId: number }, foe: { playerId: number }, ids: string[], states: PersonResult['state'][], fightId: string, xp = 20) {
  const got = await claimForJoin(DB(), me.playerId, 'test-ridge', [ids], new Set(), Date.now());
  if (typeof got === 'string') throw new Error(got);
  const report: FightReport = {
    tick: 10,
    persons: [
      ...got[0].map((p, i): PersonResult => ({ pid: p.id, owner: `p:${me.playerId}`, team: 0, state: states[i] ?? 'fit', ...(states[i] === 'captive' ? { captor: 1 } : {}), xp, kills: 0, dmg: 0, levelUps: 0, hero: { ...p.hero, xp: p.hero.xp + xp } })),
      { pid: 'ghost', owner: `p:${foe.playerId}`, team: 1, state: 'fit', xp: 0, kills: 0, dmg: 0, levelUps: 0, hero: got[0][0].hero },
    ],
    loot: {},
  };
  expect(await applyFight(DB(), fightId, 'test-ridge', report, Date.now())).toBe(true);
  return got[0];
}

describe('war lifecycle migration', () => {
  it('adds the training and retired states, upkeep and the memorial', async () => {
    const me = await devLogin(7501);
    for (const st of ['training', 'retired']) await DB().prepare('INSERT INTO war_persons (id, player_id, state) VALUES (?1, ?2, ?3)').bind(`mig-${st}`, me.playerId, st).run();
    await expect(DB().prepare("INSERT INTO war_persons (id, player_id, state) VALUES ('mig-x', ?1, 'resting')").bind(me.playerId).run()).rejects.toThrow(/CHECK/);
    const cols = async (t: string) => (await DB().prepare('SELECT name FROM pragma_table_info(?1)').bind(t).all<{ name: string }>()).results.map((c) => c.name);
    expect(await cols('war_persons')).toEqual(expect.arrayContaining(['train_to', 'captor_pid', 'region', 'slot']));
    expect(await cols('war_upkeep')).toEqual(['player_id', 'at', 'owed', 'unpaid']);
    expect(await cols('war_memorial')).toEqual(expect.arrayContaining(['player_id', 'person_id', 'honour']));
  });
});

describe('training (W-60: gone)', () => {
  it('no train route: a man keeps the class his soul woke with', async () => {
    const me = await devLogin(7502);
    await post(me.token, '/dev/seed', {});
    const [a] = (await roster(me.token)).persons;
    expect((await post(me.token, `/persons/${a.id}/train`, { cls: 'archer' })).status).toBe(404);
    expect((await row(a.id))!.state).toBe('active');
  });
});

describe('upkeep', () => {
  it('his men in the field cost the strongroom nothing (they eat there, W-60); captives he holds a food an hour; unpaid, the wounded do not heal and no XP is earned', async () => {
    const me = await devLogin(7507), foe = await devLogin(7508);
    await post(me.token, '/dev/seed', {});
    await post(foe.token, '/dev/seed', {});
    const ids = (await roster(me.token)).persons.filter((p) => p.state === 'active').map((p) => p.id);
    const [w] = await fight(me, foe, ids, ['wounded'], 'test-ridge:u:1', 0); // one wounded, eleven still in the field
    let r = await roster(me.token);
    expect(r.upkeep).toMatchObject({ rate: 0, unpaid: false });
    // he takes three of the foe's men: three food an hour
    const fids = (await roster(foe.token)).persons.filter((p) => p.state === 'active').map((p) => p.id).slice(0, 3);
    await fight(foe, me, fids, ['captive', 'captive', 'captive'], 'test-ridge:u:0');
    await DB().prepare('UPDATE war_persons SET captor_pid = ?2 WHERE id IN (?3, ?4, ?5)').bind(foe.playerId, me.playerId, ...fids).run();
    r = await roster(me.token);
    expect(r.upkeep).toMatchObject({ rate: 3, unpaid: false });
    const food0 = await stock(me.playerId, 'food');
    await DB().prepare('UPDATE war_upkeep SET at = at - ?2 WHERE player_id = ?1').bind(me.playerId, 2 * HOUR).run();
    r = await roster(me.token);
    expect(r.stock.food).toBe(food0 - 6);
    // no food: unpaid (his captives are released, as souls); his wounded man's time is up but he does not heal; a fight earns no XP
    await setGood(me.playerId, 'food', 3);
    await DB().prepare('UPDATE war_upkeep SET at = at - ?2 WHERE player_id = ?1').bind(me.playerId, 3 * HOUR).run();
    await DB().prepare('UPDATE war_persons SET until_at = 1 WHERE id = ?1').bind(w.id).run();
    r = await roster(me.token);
    expect(r.upkeep.unpaid).toBe(true);
    expect(r.upkeep.owed).toBeCloseTo(6, 1);
    expect(r.captives).toEqual([]);
    expect(r.stock.food ?? 0).toBe(0);
    expect(r.persons.find((p) => p.id === w.id)!.state).toBe('wounded');
    const fitId = ids[1], xp0 = (await row(fitId))!.xp;
    const report: FightReport = { tick: 20, persons: [{ pid: fitId, owner: `p:${me.playerId}`, team: 0, state: 'fit', xp: 50, kills: 1, dmg: 9, levelUps: 0, hero: { ...personOf((await row(fitId))!).hero, xp: xp0 + 50, kills: 1 } }], loot: {} };
    expect(await applyFight(DB(), 'test-ridge:u:2', 'test-ridge', report, Date.now())).toBe(true);
    expect(await row(fitId)).toMatchObject({ xp: xp0, kills: 1 });
    // fed again: the debt is paid, the wounded heal
    await setGood(me.playerId, 'food', 100);
    await settle(DB(), me.playerId, Date.now());
    r = await roster(me.token);
    expect(r.upkeep.unpaid).toBe(false);
    expect(r.stock.food).toBe(94);
    expect(r.persons.find((p) => p.id === w.id)!.state).toBe('active');
  });
});

describe('retirement', () => {
  it('frees a place in the army, pays back half the gear, leaves an honour; level 10 may retire into a trade', async () => {
    const me = await devLogin(7509);
    await post(me.token, '/dev/seed', {});
    let r = await roster(me.token);
    expect(r.caps.fighters).toBe(ARMY_MAX);
    const [a, b, c] = r.persons;
    await DB().prepare(`UPDATE war_persons SET honours = '[{"name":"Held the Ford","stat":"dmg"}]' WHERE id = ?1`).bind(a.id).run();
    const s0 = r.stock.coin;
    const res = await post(me.token, `/persons/${a.id}/retire`);
    const { refund } = await res.json<{ refund: number }>();
    expect(refund).toBeGreaterThan(0);
    r = await roster(me.token);
    expect(r.persons.some((p) => p.id === a.id)).toBe(false);
    expect(r.caps.fighters).toBe(ARMY_MAX - 1);
    expect(r.stock.coin).toBe(s0 + refund);
    expect(await DB().prepare('SELECT name, honour FROM war_memorial WHERE player_id = ?1').bind(me.playerId).all()).toMatchObject({ results: [{ name: a.name, honour: 'Held the Ford' }] });
    expect(await claimSoul(DB(), me.playerId, makePerson('soul-7509-a', 'hoplite'), 'test-ridge', Date.now())).toBe(true); // the place he left
    // into a trade: only at level 10
    expect(await code(await post(me.token, `/persons/${b.id}/retire`, { civ: 'civ_cook' }))).toBe('level');
    await DB().prepare('UPDATE war_persons SET level = 10 WHERE id = ?1').bind(b.id).run();
    expect((await post(me.token, `/persons/${b.id}/retire`, { civ: 'civ_cook' })).status).toBe(200);
    expect(await row(b.id)).toMatchObject({ cls: 'civ_cook', level: 5, state: 'active', name: b.name });
    // a deployed man cannot retire
    await claimForJoin(DB(), me.playerId, 'test-ridge', [[c.id]], new Set(), Date.now());
    expect(await code(await post(me.token, `/persons/${c.id}/retire`))).toBe('deployed');
  });
});
