/** M5e alliance treasury (server/src/war/treasury.ts): deposits and the audit log (W-68: no ransom). */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { good, setGood } from './goods';
import { api, devLogin } from '../helpers';
import { currentSeason } from '../../src/war/store';

const DB = () => env.DB!;
const post = (token: string, path: string, json: unknown = {}) => api(`/api/war${path}`, { method: 'POST', token, json });
const code = async (r: Response) => ((await r.json()) as { error?: { code: string } }).error?.code;
const stock = (pid: number) => good(pid, 'coin');
interface T { clan: number; role: string; coin: number; log: { player: number; kind: string; amount: number; person: string | null }[] }
const view = async (token: string) => (await api('/api/war/treasury', { token })).json<T>();

/** A clan of this season with these members and roles. */
async function clan(name: string, members: [{ playerId: number }, string][]): Promise<number> {
  const season = (await currentSeason(DB())).id;
  const id = (await DB().prepare('INSERT INTO clans (season_id, shard_id, name, tag, created_by, created_at) VALUES (?1, 1, ?2, ?3, ?4, 0) RETURNING id').bind(season, name, name.slice(0, 4), members[0][0].playerId).first<{ id: number }>())!.id;
  for (const [p, role] of members) await DB().prepare('INSERT INTO clan_members (season_id, player_id, clan_id, role, joined_at) VALUES (?1, ?2, ?3, ?4, 0)').bind(season, p.playerId, id, role).run();
  return id;
}

describe('alliance treasury', () => {
  it('members deposit from the war stock; all of it is logged; ransom is gone', async () => {
    const lead = await devLogin(7821), mem = await devLogin(7823), out = await devLogin(7825);
    for (const p of [lead, mem, out]) await api('/api/war/roster', { token: p.token }), await setGood(p.playerId, 'coin', 200);
    await clan('Treasury Band', [[lead, 'leader'], [mem, 'member']]);
    // no alliance, no treasury
    expect(await code(await api('/api/war/treasury', { token: out.token }))).toBe('no_alliance');
    expect(await code(await post(out.token, '/treasury/deposit', { amount: 10 }))).toBe('no_alliance');
    const s0 = await stock(mem.playerId);
    expect(await (await post(mem.token, '/treasury/deposit', { amount: 30 })).json()).toEqual({ coin: 30 });
    expect(await stock(mem.playerId)).toBe(s0 - 30);
    expect(await code(await post(mem.token, '/treasury/deposit', { amount: s0 }))).toBe('no_coin');
    expect((await post(lead.token, '/treasury/deposit', { amount: 100 })).status).toBe(200);
    expect((await post(mem.token, '/treasury/deposit', { amount: 0 })).status).toBe(400);
    const t = await view(lead.token);
    expect(t).toMatchObject({ role: 'leader', coin: 130 });
    expect(t.log).toEqual([
      { player: lead.playerId, kind: 'deposit', amount: 100, person: null, at: expect.any(Number) },
      { player: mem.playerId, kind: 'deposit', amount: 30, person: null, at: expect.any(Number) },
    ].map((x) => expect.objectContaining(x)));
    expect((await post(lead.token, '/treasury/ransom/w1-x')).status).toBe(404);
  });
});
