/** M5e lifecycle in D1: training, prisoners (ransom, release), field upkeep and retirement (server/src/war/persons.ts). */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, devLogin } from '../helpers';
import { applyFight, claimForJoin, personOf, RANSOM_PER_LEVEL, ROSTER_MAX, settle, START, TRAIN, type PersonRow } from '../../src/war/persons';
import type { FightReport, PersonResult } from '../../../src/war/types';

const DB = () => env.DB!;
const HOUR = 3_600_000;

interface P { id: string; cls: string; name: string; level: number; xp: number; state: string; slot: number | null; gear: Record<string, { def: string } | undefined>; skills: string[]; until: number | null; trainTo: string | null; ransom?: number }
interface RosterBody { persons: P[]; caps: { fighters: number }; stock: Record<string, number>; items: { def: string }[]; captives: { id: string; ransom: number; owner: number }[]; upkeep: { rate: number; owed: number; unpaid: boolean } }
const roster = async (token: string) => (await api('/api/war/roster', { token })).json<RosterBody>();
const post = (token: string, path: string, json: unknown = {}) => api(`/api/war${path}`, { method: 'POST', token, json });
const code = async (r: Response) => ((await r.json()) as { error?: { code: string } }).error?.code;
const row = (id: string) => DB().prepare('SELECT * FROM war_persons WHERE id = ?1').bind(id).first<PersonRow>();
const stock = async (pid: number, res: string) => (await DB().prepare('SELECT amount FROM war_stock WHERE player_id = ?1 AND res = ?2').bind(pid, res).first<{ amount: number }>())?.amount ?? 0;

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

describe('training', () => {
  it('trains a recruit into a class at a home building for a kit, in TRAIN.ms; only within a family after', async () => {
    const me = await devLogin(7502);
    expect((await post(me.token, '/recruit', { town: 'home', count: 2 })).status).toBe(200);
    const [a, b] = (await roster(me.token)).persons;
    expect(await code(await post(me.token, `/persons/${a.id}/train`, { cls: 'royal_guard' }))).toBe('no_training'); // no fortress
    expect(await code(await post(me.token, `/persons/${a.id}/train`, { cls: 'militia' }))).toBe('no_training');
    const res = await post(me.token, `/persons/${a.id}/train`, { cls: 'archer' });
    expect(res.status).toBe(200);
    const { until } = await res.json<{ until: number }>();
    expect(until).toBeGreaterThan(Date.now() + TRAIN.ms - 60_000);
    let r = await roster(me.token);
    const t = r.persons.find((p) => p.id === a.id)!;
    expect(t).toMatchObject({ state: 'training', cls: 'militia', trainTo: 'archer', gear: {} });
    expect(r.stock.silver).toBe(START.silver - TRAIN.silver);
    expect(r.items.length).toBeGreaterThan(0); // his militia gear went to the stash
    // in training: not deployable, not trainable again
    expect(await claimForJoin(DB(), me.playerId, 'test-ridge', [[a.id]], new Set(), Date.now())).toMatch(/training/);
    expect(await code(await post(me.token, `/persons/${a.id}/train`, { cls: 'slinger' }))).toBe('not_fit');
    // time is up: an archer with the archer kit, level and XP kept
    await DB().prepare('UPDATE war_persons SET until_at = 1, xp = 17 WHERE id = ?1').bind(a.id).run();
    r = await roster(me.token);
    const done = r.persons.find((p) => p.id === a.id)!;
    expect(done).toMatchObject({ state: 'reserve', cls: 'archer', trainTo: null, xp: 17, level: 1 });
    expect(Object.values(done.gear).map((g) => g!.def)).toContain('bow');
    // a trained man changes class only within his family
    expect(await code(await post(me.token, `/persons/${a.id}/train`, { cls: 'hoplite' }))).toBe('family');
    expect((await post(me.token, `/persons/${a.id}/train`, { cls: 'slinger' })).status).toBe(200);
    // no silver, no kit
    await DB().prepare("UPDATE war_stock SET amount = 5 WHERE player_id = ?1 AND res = 'silver'").bind(me.playerId).run();
    expect(await code(await post(me.token, `/persons/${b.id}/train`, { cls: 'hoplite' }))).toBe('no_silver');
  });
});

describe('prisoners', () => {
  it('the captor holds the captive; the owner pays the ransom to him, or the captor lets him go', async () => {
    const me = await devLogin(7503), foe = await devLogin(7504);
    await post(me.token, '/dev/seed', {});
    await roster(foe.token);
    const ids = (await roster(me.token)).persons.filter((p) => p.state === 'active').map((p) => p.id).slice(0, 3);
    const [a, b] = await fight(me, foe, ids, ['captive', 'captive', 'fit'], 'test-ridge:p:1');
    expect(await row(a.id)).toMatchObject({ state: 'captive', captor: 1, captor_pid: foe.playerId, held_at: 'test-ridge' });
    const held = await roster(foe.token);
    expect(held.captives.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
    expect(held.captives.find((x) => x.id === a.id)).toMatchObject({ owner: me.playerId, ransom: RANSOM_PER_LEVEL * a.hero.level });
    expect(held.upkeep.rate).toBe(2); // one food an hour each
    // the owner pays: silver to the captor, the man is home
    const price = RANSOM_PER_LEVEL * a.hero.level;
    const s0 = await stock(me.playerId, 'silver'), f0 = await stock(foe.playerId, 'silver');
    const res = await post(me.token, `/persons/${a.id}/ransom`);
    expect(await res.json()).toEqual({ paid: price });
    expect(await stock(me.playerId, 'silver')).toBe(s0 - price);
    expect(await stock(foe.playerId, 'silver')).toBe(f0 + price);
    expect(await row(a.id)).toMatchObject({ state: 'reserve', captor: null, captor_pid: null, held_at: null });
    expect(await code(await post(me.token, `/persons/${a.id}/ransom`))).toBe('not_captive');
    // only his captor lets the other go
    expect((await post(me.token, `/captives/${b.id}/release`)).status).toBe(404);
    expect((await post(foe.token, `/captives/${b.id}/release`)).status).toBe(200);
    expect(await row(b.id)).toMatchObject({ state: 'reserve', captor_pid: null });
    expect((await roster(foe.token)).captives).toEqual([]);
  });

  it('no silver, no ransom', async () => {
    const me = await devLogin(7505), foe = await devLogin(7506);
    await post(me.token, '/dev/seed', {});
    await roster(foe.token);
    const [id] = (await roster(me.token)).persons.filter((p) => p.state === 'active').map((p) => p.id);
    await fight(me, foe, [id], ['captive'], 'test-ridge:p:2');
    await DB().prepare("UPDATE war_stock SET amount = 0 WHERE player_id = ?1 AND res = 'silver'").bind(me.playerId).run();
    expect(await code(await post(me.token, `/persons/${id}/ransom`))).toBe('no_silver');
    expect((await row(id))!.state).toBe('captive');
  });
});

describe('upkeep', () => {
  it('feeds the men in the field from the stock; unpaid, the wounded do not heal and no XP is earned', async () => {
    const me = await devLogin(7507), foe = await devLogin(7508);
    await post(me.token, '/dev/seed', {});
    const ids = (await roster(me.token)).persons.filter((p) => p.state === 'active').map((p) => p.id);
    const [w] = await fight(me, foe, ids, ['wounded'], 'test-ridge:u:1', 0); // one wounded, eleven still in the field
    let r = await roster(me.token);
    expect(r.upkeep).toMatchObject({ rate: 11, unpaid: false });
    // two hours on: 22 food
    const food0 = await stock(me.playerId, 'food');
    await DB().prepare('UPDATE war_upkeep SET at = at - ?2 WHERE player_id = ?1').bind(me.playerId, 2 * HOUR).run();
    r = await roster(me.token);
    expect(r.stock.food).toBe(food0 - 22);
    // no food: unpaid; his wounded man's time is up but he does not heal; a fight earns no XP
    await DB().prepare("UPDATE war_stock SET amount = 3 WHERE player_id = ?1 AND res = 'food'").bind(me.playerId).run();
    await DB().prepare('UPDATE war_upkeep SET at = at - ?2 WHERE player_id = ?1').bind(me.playerId, HOUR).run();
    await DB().prepare('UPDATE war_persons SET until_at = 1 WHERE id = ?1').bind(w.id).run();
    r = await roster(me.token);
    expect(r.upkeep.unpaid).toBe(true);
    expect(r.upkeep.owed).toBeCloseTo(8, 1);
    expect(r.stock.food).toBe(0);
    expect(r.persons.find((p) => p.id === w.id)!.state).toBe('wounded');
    const fitId = ids[1], xp0 = (await row(fitId))!.xp;
    const report: FightReport = { tick: 20, persons: [{ pid: fitId, owner: `p:${me.playerId}`, team: 0, state: 'fit', xp: 50, kills: 1, dmg: 9, levelUps: 0, hero: { ...personOf((await row(fitId))!).hero, xp: xp0 + 50, kills: 1 } }], loot: {} };
    expect(await applyFight(DB(), 'test-ridge:u:2', 'test-ridge', report, Date.now())).toBe(true);
    expect(await row(fitId)).toMatchObject({ xp: xp0, kills: 1 });
    // fed again: the debt is paid, the wounded heal
    await DB().prepare("UPDATE war_stock SET amount = 100 WHERE player_id = ?1 AND res = 'food'").bind(me.playerId).run();
    await settle(DB(), me.playerId, Date.now());
    r = await roster(me.token);
    expect(r.upkeep.unpaid).toBe(false);
    expect(r.stock.food).toBe(92);
    expect(r.persons.find((p) => p.id === w.id)!.state).toBe('reserve');
  });
});

describe('retirement', () => {
  it('frees a roster place, pays back half the gear, leaves an honour; level 10 may retire into a trade', async () => {
    const me = await devLogin(7509);
    await post(me.token, '/dev/seed', {});
    let r = await roster(me.token);
    expect(r.caps.fighters).toBe(ROSTER_MAX);
    const [a, b, c] = r.persons;
    await DB().prepare(`UPDATE war_persons SET honours = '[{"name":"Held the Ford","stat":"dmg"}]' WHERE id = ?1`).bind(a.id).run();
    const s0 = r.stock.silver;
    const res = await post(me.token, `/persons/${a.id}/retire`);
    const { refund } = await res.json<{ refund: number }>();
    expect(refund).toBeGreaterThan(0);
    r = await roster(me.token);
    expect(r.persons.some((p) => p.id === a.id)).toBe(false);
    expect(r.caps.fighters).toBe(ROSTER_MAX - 1);
    expect(r.stock.silver).toBe(s0 + refund);
    expect(await DB().prepare('SELECT name, honour FROM war_memorial WHERE player_id = ?1').bind(me.playerId).all()).toMatchObject({ results: [{ name: a.name, honour: 'Held the Ford' }] });
    expect((await post(me.token, '/recruit', { town: 'home', count: 1 })).status).toBe(200); // the place he left
    // into a trade: only at level 10
    expect(await code(await post(me.token, `/persons/${b.id}/retire`, { civ: 'civ_cook' }))).toBe('level');
    await DB().prepare('UPDATE war_persons SET level = 10 WHERE id = ?1').bind(b.id).run();
    expect((await post(me.token, `/persons/${b.id}/retire`, { civ: 'civ_cook' })).status).toBe(200);
    expect(await row(b.id)).toMatchObject({ cls: 'civ_cook', level: 5, state: 'reserve', name: b.name });
    // a deployed man cannot retire
    await claimForJoin(DB(), me.playerId, 'test-ridge', [[c.id]], new Set(), Date.now());
    expect(await code(await post(me.token, `/persons/${c.id}/retire`))).toBe('deployed');
  });
});
