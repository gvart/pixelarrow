/** A new player's start (/api/war/start, server/src/war/start.ts): alliance, home region, path; and every refusal. */
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, devLogin } from '../helpers';
import { isCivClass } from '../../../src/data/classes';
import { FAMILIES, FAMILY_IDS, homeRefusal, PATH_IDS, PATHS } from '../../../src/war/world/start';
import { worldStub } from '../../src/war/world/routes';
import type { StartView } from '../../src/war/start';
import { claimForJoin, release } from '../../src/war/persons';
import type { WarPerson } from '../../../src/war/types';
import type { WarWorldDO } from '../../src/war/world/worldDO';
import type { World } from '../../src/war/world/world';

const post = (token: string, path: string, json: unknown) => api(`/api/war/start${path}`, { method: 'POST', token, json });
const view = async (token: string) => (await api('/api/war/start', { token })).json<StartView>();
const code = async (r: Response) => ((await r.json()) as { error?: { code: string } }).error?.code;
/** A player at the path step of `alliance`, home in its capital. */
async function atPath(id: number, alliance = 0, home = 'dodona') {
  const me = await devLogin(id);
  expect((await post(me.token, '/alliance', { alliance })).status).toBe(200);
  expect((await post(me.token, '/home', { region: home })).status).toBe(200);
  return me;
}
type Man = { id: string; cls: string; state: string; slot: number | null; region: string | null; level: number };
const men = async (token: string) => (await (await api('/api/war/roster', { token })).json<{ persons: Man[] }>()).persons.filter((p) => p.state === 'active').sort((a, b) => a.slot! - b.slot!);

describe('start rules', () => {
  it('a home is one of the alliance\'s, open to fresh men and with room for a squad', () => {
    expect(homeRefusal('dodona', 0, null, 150)).toBeNull();
    expect(homeRefusal('dodona-e', 0, { owner: -1, contested: false, live: [0, 0, 0, 0] }, 150)).toBeNull();
    expect(homeRefusal('skythia', 0, null, 150)).toMatch(/not a home of Dodona/);
    expect(homeRefusal('kleisoura', 0, null, 150)).toMatch(/not a home/);
    expect(homeRefusal('dodona-e', 0, { owner: 1, contested: false, live: [0, 40, 0, 0] }, 150)).toMatch(/held by Skythia/);
    expect(homeRefusal('dodona-e', 0, { owner: 1, contested: true, live: [5, 40, 0, 0] }, 150)).toBeNull();
    expect(homeRefusal('dodona', 0, { owner: 0, contested: false, live: [140, 0, 0, 0] }, 150)).toMatch(/full/);
  });
});

describe('start API', () => {
  it('needs a session', async () => {
    expect((await api('/api/war/start')).status).toBe(401);
  });

  it('happy path: alliance, home, path; the family\'s men stand at home in slot order', async () => {
    const me = await devLogin(7901);
    let v = await view(me.token);
    expect(v).toMatchObject({ step: 'alliance', alliance: null, home: null, homes: [], path: null, family: null });
    expect(v.alliances.map((a) => a.name)).toEqual(['Dodona', 'Skythia', 'Kyrene', 'Elaia']);
    const before = v.alliances[1].members;

    const ra = await post(me.token, '/alliance', { alliance: 1 });
    expect(ra.status).toBe(200);
    v = await ra.json<StartView>();
    expect(v).toMatchObject({ step: 'home', alliance: 1 });
    expect(v.alliances[1].members).toBe(before + 1);
    expect(v.homes.map((h) => h.id).sort()).toEqual(['skythia', 'skythia-e', 'skythia-n', 'skythia-s', 'skythia-w']);
    expect(v.homes.find((h) => h.id === 'skythia')).toMatchObject({ role: 'home', refusal: null, quota: 150 });

    v = await (await post(me.token, '/home', { region: 'skythia-n' })).json<StartView>();
    expect(v).toMatchObject({ step: 'path', home: 'skythia-n' });
    expect(v.homes.find((h) => h.id === 'skythia-n')!.players).toBeGreaterThanOrEqual(1);

    const rs = await post(me.token, '/path', { path: 'warrior', family: 'shock' });
    expect(rs.status).toBe(200);
    const done = await rs.json<StartView & { ids: string[] }>();
    expect(done).toMatchObject({ step: 'done', alliance: 1, home: 'skythia-n', path: 'warrior', family: 'shock' });

    const army = await men(me.token);
    expect(army.map((p) => p.cls)).toEqual(FAMILIES.shock.start);
    expect(army.map((p) => p.id)).toEqual(done.ids);
    expect(army.every((p) => p.region === null && p.level === 1)).toBe(true);
    // no recruiting (W-60): he grows by claiming souls
    expect((await api('/api/war/recruit', { method: 'POST', token: me.token, json: { town: 'home', count: 1 } })).status).toBe(404);
  });

  it('W-95: every warrior family starts 6 men of that family, up to his cap of 12 by souls', async () => {
    let id = 7910;
    for (const family of FAMILY_IDS) {
      const me = await atPath(id++);
      const r = await post(me.token, '/path', { path: 'warrior', family });
      expect(r.status, family).toBe(200);
      expect((await men(me.token)).map((p) => p.cls), family).toEqual(FAMILIES[family].start);
    }
    expect(PATHS.warrior.cap).toBe(12);
  });

  it('W-95: a builder and a trader start 2 guards and 2 workers, no family', async () => {
    let id = 7920;
    for (const path of ['builder', 'trader'] as const) {
      const me = await atPath(id++);
      const done = await (await post(me.token, '/path', { path })).json<StartView & { ids: string[] }>();
      expect(done).toMatchObject({ step: 'done', path, family: null });
      const all = await men(me.token);
      expect(all.map((p) => p.cls)).toEqual(PATHS[path].start);
      expect(all.filter((p) => !isCivClass(p.cls))).toHaveLength(2);
      expect(all.filter((p) => isCivClass(p.cls))).toHaveLength(2);
      expect(PATHS[path].cap).toBe(4);
      // guards and workers march in together
      const joined = await claimForJoin(env.DB!, me.playerId, 'dodona', [all.map((p) => p.id)], new Set(), Date.now());
      expect(typeof joined).not.toBe('string');
      expect((joined as WarPerson[][])[0].map((p) => p.hero.cls)).toEqual(PATHS[path].start);
      await release(env.DB!, 'dodona', all.map((p) => p.id));
      // his strongroom opens with the season's food, as every path's
      expect((await (await api('/api/war/roster', { token: me.token })).json<{ stock: Record<string, number> }>()).stock.food).toBeGreaterThan(0);
    }
  });

  it('W-83: the path is locked once chosen: no second path, family, alliance or home', async () => {
    const me = await atPath(7930);
    expect((await post(me.token, '/path', { path: 'builder' })).status).toBe(200);
    const first = await men(me.token);
    for (const b of [{ path: 'builder' }, { path: 'trader' }, { path: 'warrior', family: 'line' }]) expect(await code(await post(me.token, '/path', b))).toBe('started');
    expect(await code(await post(me.token, '/alliance', { alliance: 1 }))).toBe('started');
    expect(await code(await post(me.token, '/home', { region: 'dodona-e' }))).toBe('started');
    expect(await view(me.token)).toMatchObject({ step: 'done', path: 'builder', family: null });
    expect((await men(me.token)).map((p) => p.id)).toEqual(first.map((p) => p.id));
    for (const path of PATH_IDS) expect(PATHS[path].name.length).toBeGreaterThan(0);
  });

  it('refuses each step out of order, a home that is not free or not the alliance\'s, and a bad path', async () => {
    const me = await devLogin(7902);
    expect(await code(await post(me.token, '/home', { region: 'dodona' }))).toBe('no_alliance');
    expect(await code(await post(me.token, '/path', { path: 'builder' }))).toBe('no_alliance');
    expect((await post(me.token, '/alliance', { alliance: 4 })).status).toBe(400);
    expect((await post(me.token, '/alliance', { alliance: 0 })).status).toBe(200);
    expect(await code(await post(me.token, '/path', { path: 'builder' }))).toBe('no_home');
    // not this alliance's, nor a world region at all
    for (const region of ['skythia', 'kleisoura', 'nowhere']) {
      const r = await post(me.token, '/home', { region });
      expect(r.status).toBe(409);
      expect(await code(r)).toBe('home_refused');
    }
    expect((await post(me.token, '/home', { region: 'Dodona!' })).status).toBe(400);

    // a full home: Dodona's quota already stands in dodona-w
    await runInDurableObject(worldStub(env), async (o: WarWorldDO) => {
      const w = await (o as unknown as { ensure(): Promise<World> }).ensure();
      w.region('dodona-w')!.live[0] = 145;
    });
    const full = await post(me.token, '/home', { region: 'dodona-w' });
    expect(await code(full)).toBe('home_refused');
    expect((await view(me.token)).homes.find((h) => h.id === 'dodona-w')!.refusal).toMatch(/full/);
    await runInDurableObject(worldStub(env), async (o: WarWorldDO) => {
      (await (o as unknown as { ensure(): Promise<World> }).ensure()).region('dodona-w')!.live[0] = 0;
    });

    // switching the alliance before the path resets the home
    expect((await post(me.token, '/home', { region: 'dodona' })).status).toBe(200);
    expect(await (await post(me.token, '/alliance', { alliance: 3 })).json<StartView>()).toMatchObject({ step: 'home', alliance: 3, home: null });
    expect((await post(me.token, '/home', { region: 'elaia-e' })).status).toBe(200);

    for (const b of [{ path: 'hero' }, { path: 'warrior' }, { path: 'warrior', family: 'navy' }, { path: 'builder', family: 'line' }, { path: 'trader', family: 'rider' }]) {
      const r = await post(me.token, '/path', b);
      expect(r.status, JSON.stringify(b)).toBe(409);
      expect(await code(r)).toBe('bad_path');
    }
    expect((await post(me.token, '/path', { path: 'Warrior' })).status).toBe(400);
    expect((await env.DB!.prepare('SELECT COUNT(*) AS n FROM war_persons WHERE player_id = ?1').bind(me.playerId).first<{ n: number }>())?.n).toBe(0);
    expect((await view(me.token)).step).toBe('path');
  });

  it('a player who came in by the dev routes counts as started', async () => {
    const me = await devLogin(7903);
    await api('/api/war/world/dev/alliance', { method: 'POST', token: me.token, json: { alliance: 2 } });
    expect((await view(me.token)).step).toBe('home');
    await api('/api/war/dev/seed', { method: 'POST', token: me.token, json: {} });
    expect(await view(me.token)).toMatchObject({ step: 'done', alliance: 2, home: 'kyrene' });
  });
});
