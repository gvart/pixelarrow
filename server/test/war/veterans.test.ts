/** E3 veterans in D1: deeds and scars written back, the fallen on the home memorial, guardian trophies for the killers. */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, devLogin } from '../helpers';
import { applyFight, claimForJoin } from '../../src/war/persons';
import { applyBossKill, type BossSlain } from '../../src/war/bosses';
import type { FightReport } from '../../../src/war/types';

const DB = () => env.DB!;
const post = (token: string, path: string, json: unknown) => api(`/api/war${path}`, { method: 'POST', token, json });

interface Body {
  persons: { id: string; name: string; state: string; kills: number; deeds: { id: string; name: string }[]; scars: number }[];
  memorial: { kind: string; personId: string; name: string; kills: number; battles: number; deeds: { id: string }[]; region: string | null }[];
  trophies: { boss: string; name: string; region: string }[];
}
const roster = async (token: string) => (await api('/api/war/roster', { token })).json<Body>();

describe('E3 veterans write-back', () => {
  it('kills, deeds and scars go on the record; the dead stay dead with a grave on the memorial, written once', async () => {
    const me = await devLogin(7601);
    await post(me.token, '/dev/seed', {});
    const ids = (await roster(me.token)).persons.filter((p) => p.state === 'active').map((p) => p.id);
    const got = await claimForJoin(DB(), me.playerId, 'erymanthos', [ids.slice(0, 3)], new Set(), Date.now());
    if (typeof got === 'string') throw new Error(got);
    const [a, b, d] = got[0];
    const owner = `p:${me.playerId}`;
    const report: FightReport = {
      tick: 1200,
      persons: [
        { pid: a.id, owner, team: 0, state: 'fit', xp: 30, kills: 2, dmg: 300, levelUps: 0, hero: { ...a.hero, kills: a.hero.kills + 2, battles: a.hero.battles + 1 },
          deeds: [{ id: 'firstBlood', name: 'First blood' }, { id: 'slayer:erymanthian_boar', name: 'Boar-slayer' }] },
        { pid: b.id, owner, team: 0, state: 'wounded', xp: 5, kills: 0, dmg: 10, levelUps: 0, hero: { ...b.hero, battles: b.hero.battles + 1 }, deeds: [{ id: 'survivor', name: 'Survivor' }], scar: true },
        { pid: d.id, owner, team: 0, state: 'dead', xp: 0, kills: 1, dmg: 50, levelUps: 0, hero: { ...d.hero, kills: d.hero.kills + 1, battles: d.hero.battles + 1, equip: {} }, deeds: [{ id: 'firstBlood', name: 'First blood' }] },
      ],
      loot: {},
    };
    const t = Date.now();
    expect(await applyFight(DB(), 'erymanthos:e3:1200', 'erymanthos', report, t)).toBe(true);
    expect(await applyFight(DB(), 'erymanthos:e3:1200', 'erymanthos', report, t + 1)).toBe(false);
    const r = await roster(me.token);
    const by = new Map(r.persons.map((p) => [p.id, p]));
    expect(by.get(a.id)!.deeds.map((x) => x.name)).toEqual(['First blood', 'Boar-slayer']);
    expect(by.get(a.id)!.kills).toBe(a.hero.kills + 2);
    expect(by.get(b.id)).toMatchObject({ state: 'wounded', scars: 1 });
    expect(by.get(d.id)).toMatchObject({ state: 'dead' });
    // one grave for the dead man, with his deeds and where he fell
    expect(r.memorial).toHaveLength(1);
    expect(r.memorial[0]).toMatchObject({ kind: 'fallen', personId: d.id, name: d.hero.name, kills: d.hero.kills + 1, region: 'erymanthos' });
    expect(r.memorial[0].deeds.map((x) => x.id)).toEqual(['firstBlood']);
    // a second fight: the same deed is not written twice, a second scar
    const again: FightReport = { tick: 1500, persons: [{ ...report.persons[1], deeds: [{ id: 'survivor', name: 'Survivor' }] }, { ...report.persons[0], deeds: [{ id: 'firstBlood', name: 'First blood' }] }], loot: {} };
    await DB().prepare("UPDATE war_persons SET state = 'active', region = 'erymanthos' WHERE id = ?1").bind(b.id).run();
    expect(await applyFight(DB(), 'erymanthos:e3:1500', 'erymanthos', again, t + 2)).toBe(true);
    const r2 = await roster(me.token);
    const b2 = r2.persons.find((p) => p.id === b.id)!;
    expect(b2.deeds.map((x) => x.id)).toEqual(['survivor']);
    expect(b2.scars).toBe(2);
    expect(r2.persons.find((p) => p.id === a.id)!.deeds).toHaveLength(2);
  });

  it('a guardian kill gives each player among its killers its trophy, once', async () => {
    const a = await devLogin(7602), b = await devLogin(7603);
    const e: BossSlain = { t: 900, kind: 'bossSlain', region: 'erymanthos', boss: 'erymanthian_boar', killers: [`p:${a.playerId}`, `p:${b.playerId}`, 'mob'] };
    expect(await applyBossKill(DB(), 'erymanthos', 'runE3', e, 1000)).toBe(true);
    expect(await applyBossKill(DB(), 'erymanthos', 'runE3', e, 2000)).toBe(false);
    for (const p of [a, b]) {
      const r = await roster(p.token);
      expect(r.trophies).toEqual([{ boss: 'erymanthian_boar', name: 'the tusks of the Erymanthian Boar', region: 'erymanthos', at: 1000 }]);
    }
  });
});
