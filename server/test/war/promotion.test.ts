/** M5e promotion to elite in D1 (docs/WAR.md "Promote"; server/src/war/persons.ts promote). */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, devLogin } from '../helpers';
import { personOf, PROMOTE_MS, promoteCost, upkeepRate, UPKEEP, type PersonRow } from '../../src/war/persons';
import { warStatsOf } from '../../../src/war/sim/classes';

const DB = () => env.DB!;

interface P { id: string; cls: string; level: number; state: string; gear: Record<string, { def: string; rarity: string } | undefined>; trainTo: string | null }
const roster = async (token: string) => (await api('/api/war/roster', { token })).json<{ persons: P[]; stock: Record<string, number>; items: unknown[] }>();
const post = (token: string, path: string, json: unknown = {}) => api(`/api/war${path}`, { method: 'POST', token, json });
const code = async (r: Response) => ((await r.json()) as { error?: { code: string } }).error?.code;
const row = (id: string) => DB().prepare('SELECT * FROM war_persons WHERE id = ?1').bind(id).first<PersonRow>();
const honour = (id: string) => DB().prepare(`UPDATE war_persons SET honours = '[{"name":"Held the Ford","stat":"armor"}]' WHERE id = ?1`).bind(id).run();

describe('promotion to elite', () => {
  it('asks level 6, an honour and the elite rare kit; 30 min later he is the elite with the kit on', async () => {
    const me = await devLogin(7801);
    await post(me.token, '/dev/seed', { squad: [{ cls: 'hoplite', level: 6 }, { cls: 'hoplite', level: 5 }, { cls: 'militia', level: 6 }], reserve: [] });
    const [a, b, m] = (await roster(me.token)).persons;
    // requirements: honours, level, a trained man, an elite of his family
    expect(await code(await post(me.token, `/persons/${a.id}/promote`, { cls: 'royal_guard' }))).toBe('not_promotable'); // no honour
    await honour(a.id), await honour(b.id), await honour(m.id);
    expect(await code(await post(me.token, `/persons/${b.id}/promote`, { cls: 'royal_guard' }))).toBe('not_promotable'); // level 5
    expect(await code(await post(me.token, `/persons/${m.id}/promote`, { cls: 'royal_guard' }))).toBe('not_promotable'); // militia
    expect(await code(await post(me.token, `/persons/${a.id}/promote`, { cls: 'rhomphaia' }))).toBe('not_promotable'); // another family
    // cost: the kit's value in silver
    const pre = warStatsOf(personOf((await row(a.id))!));
    const price = promoteCost('royal_guard');
    expect(price).toBeGreaterThan(0);
    await DB().prepare("UPDATE war_stock SET amount = ?2 WHERE player_id = ?1 AND res = 'silver'").bind(me.playerId, price - 1).run();
    expect(await code(await post(me.token, `/persons/${a.id}/promote`, { cls: 'royal_guard' }))).toBe('no_silver');
    await DB().prepare("UPDATE war_stock SET amount = ?2 WHERE player_id = ?1 AND res = 'silver'").bind(me.playerId, price).run();
    const res = await post(me.token, `/persons/${a.id}/promote`, { cls: 'royal_guard' });
    expect(res.status).toBe(200);
    expect((await res.json<{ until: number }>()).until).toBeGreaterThan(Date.now() + PROMOTE_MS - 60_000);
    let r = await roster(me.token);
    expect(r.stock.silver).toBe(0);
    expect(r.persons.find((p) => p.id === a.id)).toMatchObject({ state: 'training', cls: 'hoplite', trainTo: 'royal_guard', gear: {} });
    expect(r.items.length).toBeGreaterThan(0); // his old kit is in the stash
    // done: the elite, rare kit, level kept; baked as the elite class
    await DB().prepare('UPDATE war_persons SET until_at = 1 WHERE id = ?1').bind(a.id).run();
    r = await roster(me.token);
    const done = r.persons.find((p) => p.id === a.id)!;
    expect(done).toMatchObject({ state: 'reserve', cls: 'royal_guard', level: 6, trainTo: null });
    expect(Object.values(done.gear).every((g) => g!.rarity === 'rare')).toBe(true);
    const elite = personOf((await row(a.id))!);
    expect(elite.hero.cls).toBe('royal_guard');
    expect(warStatsOf(elite)).not.toEqual(pre); // baked as the elite with his rare kit
    // an elite is not promoted again, and costs elite upkeep in the field
    expect(await code(await post(me.token, `/persons/${a.id}/promote`, { cls: 'sacred_band' }))).toBe('not_promotable');
    await DB().prepare("UPDATE war_persons SET region = 'test-ridge' WHERE id = ?1").bind(a.id).run();
    expect(await upkeepRate(DB(), me.playerId)).toBe(UPKEEP.elite);
  });
});
