/**
 * W-68 captives and dismissal in D1 (server/src/war/captives.ts, persons.ts): a capture frees the owner's slot and notes
 * who took him; ask to join (too soon, refused for good, joins with his record, a full army); release and the 24 h
 * auto-release wake named souls; a named soul claimed moves to the claimer; dismiss drops the gear and bars the owner.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, devLogin } from '../helpers';
import { applyFight, armyCount, CAPTIVE_MS, claimForJoin, claimSoul, personOf, type PersonRow } from '../../src/war/persons';
import { namedSoul } from '../../src/war/captives';
import { CAPTIVE, refuses } from '../../../src/war/sim/captives';
import { makePerson } from '../../../src/war/sim/roster';
import { ARMY_MAX } from '../../../src/war/sim/soldiers';
import type { FightReport, PersonResult } from '../../../src/war/types';

const DB = () => env.DB!;
const HOUR = 3_600_000;
const REGION = 'test-ridge';
type Who = { playerId: number; token: string };
const row = (id: string) => DB().prepare('SELECT * FROM war_persons WHERE id = ?1').bind(id).first<PersonRow>();
const post = (token: string, path: string, json: unknown = {}) => api(`/api/war${path}`, { method: 'POST', token, json });
const code = async (r: Response) => ((await r.json()) as { error?: { code: string } }).error?.code;
interface Roster { persons: { id: string; state: string; captorName?: string; heldAt: string | null }[]; caps: { fighters: number }; captives: { id: string; owner: number; ownerName: string; until: number; askAt: number; refused: boolean; heldAt: string }[]; items: { def: string }[] }
const roster = async (token: string) => (await api('/api/war/roster', { token })).json<Roster>();

/** `n` of me's seeded men taken captive by foe (team 1) in test-ridge, `ago` ms back. */
async function captured(me: Who, foe: Who, n: number, fightId: string, ago = 0): Promise<string[]> {
  await post(me.token, '/dev/seed', {});
  await roster(foe.token);
  const ids = (await DB().prepare("SELECT id FROM war_persons WHERE player_id = ?1 AND state = 'active' ORDER BY slot").bind(me.playerId).all<{ id: string }>()).results.map((r) => r.id).slice(0, n);
  const got = await claimForJoin(DB(), me.playerId, REGION, [ids], new Set(), Date.now());
  if (typeof got === 'string') throw new Error(got);
  const report: FightReport = {
    tick: 10,
    persons: [
      ...got[0].map((p): PersonResult => ({ pid: p.id, owner: `p:${me.playerId}`, team: 0, state: 'captive', captor: 1, fort: 4, xp: 0, kills: 0, dmg: 0, levelUps: 0, hero: { ...p.hero, kills: 7, equip: {} } })),
      { pid: 'ghost', owner: `p:${foe.playerId}`, team: 1, state: 'fit', xp: 0, kills: 0, dmg: 0, levelUps: 0, hero: got[0][0].hero },
    ],
    loot: {},
  };
  expect(await applyFight(DB(), fightId, REGION, report, Date.now() - ago)).toBe(true);
  return ids;
}

/** Give the captive `id` a new id whose join roll is `refuse` (the roll is fixed per man). */
async function rollAs(id: string, refuse: boolean): Promise<string> {
  const r = (await row(id))!;
  let k = 0;
  while (refuses(`${id}-${k}`, r.level) !== refuse) k++;
  await DB().prepare('UPDATE war_persons SET id = ?2 WHERE id = ?1').bind(id, `${id}-${k}`).run();
  return `${id}-${k}`;
}

describe('W-68 a capture', () => {
  it('frees the owner\'s slot at once; his roster notes who took him and where; the captor lists him', async () => {
    const me = await devLogin(7901), foe = await devLogin(7902);
    const [a] = await captured(me, foe, 1, 'cap:1');
    expect(await armyCount(DB(), me.playerId)).toBe(ARMY_MAX - 1);
    expect(await row(a)).toMatchObject({ state: 'captive', captor_pid: foe.playerId, held_at: REGION, held_fort: 4, gear: '{}' });
    const mine = await roster(me.token);
    expect(mine.caps.fighters).toBe(ARMY_MAX - 1);
    expect(mine.persons.find((p) => p.id === a)).toMatchObject({ state: 'captive', heldAt: REGION, captorName: expect.any(String) });
    const held = await roster(foe.token);
    expect(held.captives).toEqual([expect.objectContaining({ id: a, owner: me.playerId, ownerName: expect.any(String), refused: false, heldAt: REGION })]);
    expect(held.captives[0].askAt).toBe(held.captives[0].until - CAPTIVE_MS + CAPTIVE.askMs);
    expect((await post(me.token, `/persons/${a}/ransom`)).status).toBe(404); // ransom is gone
  });
});

describe('W-68 asking a captive to join', () => {
  it('not before 2 h; then he joins the captor with his level, class and record', async () => {
    const me = await devLogin(7903), foe = await devLogin(7904);
    await post(foe.token, '/dev/seed', { squad: [{ cls: 'hoplite' }] });
    const [a0] = await captured(me, foe, 1, 'cap:2');
    const a = await rollAs(a0, false);
    expect(await code(await post(foe.token, `/captives/${a}/join`))).toBe('too_soon');
    expect(await code(await post(me.token, `/captives/${a}/join`))).toBe('not_found'); // only his captor asks
    await DB().prepare('UPDATE war_persons SET until_at = until_at - ?2 WHERE id = ?1').bind(a, 2 * HOUR).run();
    const before = (await row(a))!;
    expect(await (await post(foe.token, `/captives/${a}/join`)).json()).toEqual({ joined: true });
    const after = (await row(a))!;
    expect(after).toMatchObject({ player_id: foe.playerId, state: 'active', level: before.level, cls: before.cls, kills: 7, name: before.name, captor_pid: null, held_at: null, region: null });
    expect(Object.keys(JSON.parse(after.gear))).not.toHaveLength(0); // his class's starter kit
    expect(await armyCount(DB(), foe.playerId)).toBe(2);
  });

  it('a refusal is for good: he can only be released', async () => {
    const me = await devLogin(7905), foe = await devLogin(7906);
    const [a0] = await captured(me, foe, 1, 'cap:3', 3 * HOUR);
    const a = await rollAs(a0, true);
    expect(await (await post(foe.token, `/captives/${a}/join`)).json()).toEqual({ joined: false });
    expect(await row(a)).toMatchObject({ state: 'captive', refused: 1, player_id: me.playerId });
    expect(await code(await post(foe.token, `/captives/${a}/join`))).toBe('refused');
    expect((await roster(foe.token)).captives[0]).toMatchObject({ id: a, refused: true });
  });

  it('a full army: refused before he is asked (no roll spent)', async () => {
    const me = await devLogin(7907), foe = await devLogin(7908);
    const [a] = await captured(me, foe, 1, 'cap:4', 3 * HOUR);
    await post(foe.token, '/dev/seed', {});
    expect(await armyCount(DB(), foe.playerId)).toBe(ARMY_MAX);
    expect(await code(await post(foe.token, `/captives/${a}/join`))).toBe('army_full');
    expect(await row(a)).toMatchObject({ state: 'captive', refused: 0 });
  });
});

describe('W-68 release', () => {
  it('the captor releases him: a named soul at a shrine of the region, his level and class, waiting 6 h', async () => {
    const me = await devLogin(7909), foe = await devLogin(7910);
    const [a] = await captured(me, foe, 1, 'cap:5');
    const lv = (await row(a))!.level;
    expect((await post(me.token, `/captives/${a}/release`)).status).toBe(404);
    const t = Date.now();
    expect((await post(foe.token, `/captives/${a}/release`)).status).toBe(200);
    const r = (await row(a))!;
    // test-ridge has no shrine: he wakes in the nearest region that has one
    expect(r).toMatchObject({ state: 'soul', level: lv, captor_pid: null, bar_pid: null });
    expect(r.held_at).not.toBe(REGION);
    expect(r.until_at! - t).toBeGreaterThanOrEqual(CAPTIVE.soulMs - 5000);
    expect((await roster(foe.token)).captives).toEqual([]);
    expect((await roster(me.token)).persons.some((p) => p.id === a)).toBe(false);
    // anyone may claim him: he joins the claimer as himself
    const other = await devLogin(7911);
    await roster(other.token);
    const p = namedSoul(r, Date.now()).person;
    expect(p).toMatchObject({ id: a, hero: { level: lv, kills: 7 } });
    expect(await claimSoul(DB(), other.playerId, p, 'test-ridge', Date.now())).toBe(true);
    expect(await row(a)).toMatchObject({ player_id: other.playerId, state: 'active', region: 'test-ridge', level: lv, kills: 7 });
  });

  it('after 24 h unclaimed he is released by itself (on either player\'s read)', async () => {
    const me = await devLogin(7912), foe = await devLogin(7913);
    const [a, b] = await captured(me, foe, 2, 'cap:6');
    await DB().prepare('UPDATE war_persons SET until_at = ?2 WHERE id = ?1').bind(a, Date.now() - 1).run();
    await roster(foe.token);
    expect(await row(a)).toMatchObject({ state: 'soul' });
    expect(await row(b)).toMatchObject({ state: 'captive' });
    await DB().prepare('UPDATE war_persons SET until_at = ?2 WHERE id = ?1').bind(b, Date.now() - 1).run();
    await roster(me.token);
    expect(await row(b)).toMatchObject({ state: 'soul' });
  });
});

describe('W-68 dismiss', () => {
  it('his gear goes home (not in a live region), his soul rises; the owner is barred from it for 1 h', async () => {
    const me = await devLogin(7914);
    await post(me.token, '/dev/seed', {});
    const r0 = await roster(me.token);
    const a = r0.persons.find((p) => p.state === 'active')!.id;
    const gear = Object.values(personOf((await row(a))!).hero.equip).filter(Boolean).length;
    expect(gear).toBeGreaterThan(0);
    const t = Date.now();
    const res = await (await post(me.token, `/persons/${a}/dismiss`)).json<{ at: unknown; region: string | null }>();
    expect(res).toEqual({ at: null, region: null });
    const r = (await row(a))!;
    expect(r).toMatchObject({ state: 'soul', bar_pid: me.playerId });
    expect(r.bar_until! - t).toBeGreaterThanOrEqual(CAPTIVE.barMs - 5000);
    expect(r.held_at).toBeTruthy(); // his home region
    const r1 = await roster(me.token);
    expect(r1.items.length).toBe(r0.items.length + gear);
    expect(r1.caps.fighters).toBe(r0.caps.fighters - 1);
    // the soul carries the bar to the room (src/war/sim/souls.ts keeps him from that owner's claim)
    expect(namedSoul(r, t).bar).toEqual({ pid: me.playerId, ms: r.bar_until! - t });
    expect(await code(await post(me.token, `/persons/${a}/dismiss`))).toBe('not_dismissable');
  });

  it('not a captive, the dead, a civilian', async () => {
    const me = await devLogin(7915), foe = await devLogin(7916);
    const [a] = await captured(me, foe, 1, 'cap:7');
    expect(await code(await post(me.token, `/persons/${a}/dismiss`))).toBe('not_dismissable');
    const civ = makePerson('w7915-civ', 'civ_cook');
    await DB().prepare("INSERT INTO war_persons (id, player_id, cls, state) VALUES (?1, ?2, 'civ_cook', 'active')").bind(civ.id, me.playerId).run();
    expect(await code(await post(me.token, `/persons/${civ.id}/dismiss`))).toBe('civilian');
  });
});
