/** M5e alliance treasury (server/src/war/treasury.ts): deposits, ransoms paid by the leader and officers, the audit log. */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { good, setGood } from './goods';
import { api, devLogin } from '../helpers';
import { currentSeason } from '../../src/online/store';
import { applyFight, claimForJoin, RANSOM_PER_LEVEL, type PersonRow } from '../../src/war/persons';
import type { FightReport, PersonResult } from '../../../src/war/types';

const DB = () => env.DB!;
const post = (token: string, path: string, json: unknown = {}) => api(`/api/war${path}`, { method: 'POST', token, json });
const code = async (r: Response) => ((await r.json()) as { error?: { code: string } }).error?.code;
const stock = (pid: number) => good(pid, 'coin');
const row = (id: string) => DB().prepare('SELECT * FROM war_persons WHERE id = ?1').bind(id).first<PersonRow>();
interface T { clan: number; role: string; coin: number; log: { player: number; kind: string; amount: number; person: string | null }[] }
const view = async (token: string) => (await api('/api/war/treasury', { token })).json<T>();

/** A clan of this season with these members and roles. */
async function clan(name: string, members: [{ playerId: number }, string][]): Promise<number> {
  const season = (await currentSeason(DB())).id;
  const id = (await DB().prepare('INSERT INTO clans (season_id, shard_id, name, tag, created_by, created_at) VALUES (?1, 1, ?2, ?3, ?4, 0) RETURNING id').bind(season, name, name.slice(0, 4), members[0][0].playerId).first<{ id: number }>())!.id;
  for (const [p, role] of members) await DB().prepare('INSERT INTO clan_members (season_id, player_id, clan_id, role, joined_at) VALUES (?1, ?2, ?3, ?4, 0)').bind(season, p.playerId, id, role).run();
  return id;
}

/** One soldier of `me` taken captive by `foe` (team 1). */
async function captive(me: { playerId: number; token: string }, foe: { playerId: number }, fightId: string): Promise<string> {
  await post(me.token, '/dev/seed', {});
  const [{ id }] = (await DB().prepare("SELECT id FROM war_persons WHERE player_id = ?1 AND state = 'active' ORDER BY slot LIMIT 1").bind(me.playerId).all<{ id: string }>()).results;
  const got = await claimForJoin(DB(), me.playerId, 'test-ridge', [[id]], new Set(), Date.now());
  if (typeof got === 'string') throw new Error(got);
  const p = got[0][0];
  const report: FightReport = {
    tick: 1,
    persons: [
      { pid: p.id, owner: `p:${me.playerId}`, team: 0, state: 'captive', captor: 1, xp: 0, kills: 0, dmg: 0, levelUps: 0, hero: p.hero } satisfies PersonResult,
      { pid: 'ghost', owner: `p:${foe.playerId}`, team: 1, state: 'fit', xp: 0, kills: 0, dmg: 0, levelUps: 0, hero: p.hero },
    ],
    loot: {},
  };
  expect(await applyFight(DB(), fightId, 'test-ridge', report, Date.now())).toBe(true);
  return id;
}

describe('alliance treasury', () => {
  it('members deposit; the leader and officers pay a member’s ransom from it, to the captor; all of it is logged', async () => {
    const lead = await devLogin(7821), off = await devLogin(7822), mem = await devLogin(7823), foe = await devLogin(7824), out = await devLogin(7825);
    for (const p of [lead, off, mem, foe, out]) await api('/api/war/roster', { token: p.token }), await setGood(p.playerId, 'coin', 200);
    await clan('Treasury Band', [[lead, 'leader'], [off, 'officer'], [mem, 'member']]);
    // no alliance, no treasury
    expect(await code(await api('/api/war/treasury', { token: out.token }))).toBe('no_alliance');
    expect(await code(await post(out.token, '/treasury/deposit', { amount: 10 }))).toBe('no_alliance');
    // deposits from the war stock
    const s0 = await stock(mem.playerId);
    expect(await (await post(mem.token, '/treasury/deposit', { amount: 30 })).json()).toEqual({ coin: 30 });
    expect(await stock(mem.playerId)).toBe(s0 - 30);
    expect(await code(await post(mem.token, '/treasury/deposit', { amount: s0 }))).toBe('no_coin');
    expect((await post(lead.token, '/treasury/deposit', { amount: 100 })).status).toBe(200);
    expect((await post(mem.token, '/treasury/deposit', { amount: 0 })).status).toBe(400);
    // the member's man is taken
    const id = await captive(mem, foe, 'treasury:1');
    const price = RANSOM_PER_LEVEL * (await row(id))!.level;
    // a plain member does not pay from the pool; an outsider's captive is not the alliance's
    expect(await code(await post(mem.token, `/treasury/ransom/${id}`))).toBe('not_officer');
    const other = await captive(out, foe, 'treasury:2');
    expect(await code(await post(off.token, `/treasury/ransom/${other}`))).toBe('not_member');
    // the officer pays: pool down, captor up, the man home
    const f0 = await stock(foe.playerId);
    expect(await (await post(off.token, `/treasury/ransom/${id}`)).json()).toEqual({ paid: price });
    expect(await stock(foe.playerId)).toBe(f0 + price);
    expect(await row(id)).toMatchObject({ state: 'reserve', captor_pid: null, held_at: null });
    expect(await code(await post(lead.token, `/treasury/ransom/${id}`))).toBe('not_captive');
    const t = await view(lead.token);
    expect(t).toMatchObject({ role: 'leader', coin: 130 - price });
    expect(t.log).toEqual([
      { player: off.playerId, kind: 'ransom', amount: price, person: id, at: expect.any(Number) },
      { player: lead.playerId, kind: 'deposit', amount: 100, person: null, at: expect.any(Number) },
      { player: mem.playerId, kind: 'deposit', amount: 30, person: null, at: expect.any(Number) },
    ].map((x) => expect.objectContaining(x)));
    // an empty pool pays no ransom
    const again = await captive(mem, foe, 'treasury:3');
    await DB().prepare("UPDATE war_goods SET amount = 0 WHERE place = ?1").bind(`sb:${t.clan}`).run();
    expect(await code(await post(lead.token, `/treasury/ransom/${again}`))).toBe('no_coin');
    expect((await row(again))!.state).toBe('captive');
  });
});
