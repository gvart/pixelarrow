/** M5e promotion to elite in D1 (docs/WAR.md "Promote"; server/src/war/persons.ts promote). */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { setGood } from './goods';
import { api, devLogin } from '../helpers';
import { applyFight, personOf, PROMOTE_MS, promoteCost, upkeepRate, UPKEEP, type PersonRow } from '../../src/war/persons';
import { promoteBlocker } from '../../../src/war/sim/roster';
import type { FightReport } from '../../../src/war/types';
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
    await post(me.token, '/dev/seed', { squad: [{ cls: 'hoplite', level: 6 }, { cls: 'hoplite', level: 5 }, { cls: 'militia', level: 6 }] });
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
    await setGood(me.playerId, 'coin', price - 1);
    expect(await code(await post(me.token, `/persons/${a.id}/promote`, { cls: 'royal_guard' }))).toBe('no_coin');
    await setGood(me.playerId, 'coin', price);
    const res = await post(me.token, `/persons/${a.id}/promote`, { cls: 'royal_guard' });
    expect(res.status).toBe(200);
    expect((await res.json<{ until: number }>()).until).toBeGreaterThan(Date.now() + PROMOTE_MS - 60_000);
    let r = await roster(me.token);
    expect(r.stock.coin ?? 0).toBe(0);
    expect(r.persons.find((p) => p.id === a.id)).toMatchObject({ state: 'training', cls: 'hoplite', trainTo: 'royal_guard', gear: {} });
    expect(r.items.length).toBeGreaterThan(0); // his old kit is in the stash
    // done: the elite, rare kit, level kept; baked as the elite class
    await DB().prepare('UPDATE war_persons SET until_at = 1 WHERE id = ?1').bind(a.id).run();
    r = await roster(me.token);
    const done = r.persons.find((p) => p.id === a.id)!;
    expect(done).toMatchObject({ state: 'active', cls: 'royal_guard', level: 6, trainTo: null });
    expect(Object.values(done.gear).every((g) => g!.rarity === 'rare')).toBe(true);
    const elite = personOf((await row(a.id))!);
    expect(elite.hero.cls).toBe('royal_guard');
    expect(warStatsOf(elite)).not.toEqual(pre); // baked as the elite with his rare kit
    // an elite is not promoted again, and costs elite upkeep in the field
    expect(await code(await post(me.token, `/persons/${a.id}/promote`, { cls: 'sacred_band' }))).toBe('not_promotable');
    await DB().prepare("UPDATE war_persons SET region = 'test-ridge' WHERE id = ?1").bind(a.id).run();
    expect(await upkeepRate(DB(), me.playerId)).toBe(UPKEEP.elite);
  });

  it('honours won in fights are written back (at most 3, never the same twice), which makes promotion reachable', async () => {
    const me = await devLogin(7803);
    await post(me.token, '/dev/seed', { squad: [{ cls: 'hoplite', level: 6 }] });
    const [a] = (await roster(me.token)).persons;
    const p = personOf((await row(a.id))!);
    expect(promoteBlocker(p, 'royal_guard')).toMatch(/honour/);
    const fight = (id: string, name: string): Promise<boolean> => {
      const r: FightReport = { tick: 1, loot: {}, persons: [{ pid: a.id, owner: `p:${me.playerId}`, team: 0, state: 'fit', xp: 0, kills: 0, dmg: 0, levelUps: 0, hero: p.hero, honour: { name, stat: 'hp' } }] };
      return applyFight(DB(), id, 'kleisoura', r, Date.now());
    };
    await fight('h1', 'Veteran of Kleisoura Pass');
    const once = personOf((await row(a.id))!);
    expect(once.honours).toEqual([{ name: 'Veteran of Kleisoura Pass', stat: 'hp' }]);
    expect(promoteBlocker(once, 'royal_guard')).toBeNull();
    await fight('h2', 'Veteran of Kleisoura Pass'); // the same name again: nothing
    await fight('h3', 'Held Kleisoura Pass');
    await fight('h4', 'Veteran of Grey Moors');
    await fight('h5', 'Took the fort at Ammos Dunes'); // a fourth: no room
    expect(personOf((await row(a.id))!).honours!.map((h) => h.name)).toEqual(['Veteran of Kleisoura Pass', 'Held Kleisoura Pass', 'Veteran of Grey Moors']);
  });
});
