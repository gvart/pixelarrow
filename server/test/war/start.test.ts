/** A new player's start (/api/war/start, server/src/war/start.ts): alliance, home region, squad; and every refusal. */
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, devLogin } from '../helpers';
import { SQUAD_MAX } from '../../../src/war/sim/soldiers';
import { homeRefusal, squadRefusal, START_CLASSES } from '../../../src/war/world/start';
import { worldStub } from '../../src/war/world/routes';
import type { StartView } from '../../src/war/start';
import type { WarWorldDO } from '../../src/war/world/worldDO';
import type { World } from '../../src/war/world/world';

const post = (token: string, path: string, json: unknown) => api(`/api/war/start${path}`, { method: 'POST', token, json });
const view = async (token: string) => (await api('/api/war/start', { token })).json<StartView>();
const code = async (r: Response) => ((await r.json()) as { error?: { code: string } }).error?.code;

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

  it('a squad is 1..12 men of the six classes with war sprites', () => {
    expect(squadRefusal(['hoplite'])).toBeNull();
    expect(squadRefusal([...START_CLASSES, ...START_CLASSES])).toBeNull();
    expect(squadRefusal([])).toMatch(/at least one/);
    expect(squadRefusal(Array(SQUAD_MAX + 1).fill('archer'))).toMatch(/at most 12/);
    expect(squadRefusal(['hoplite', 'royal_guard'])).toMatch(/royal_guard/);
    expect(squadRefusal(['civ_cook'])).toMatch(/civ_cook/);
  });
});

describe('start API', () => {
  it('needs a session', async () => {
    expect((await api('/api/war/start')).status).toBe(401);
  });

  it('happy path: alliance, home, squad; the men stand at home in slot order and came from the pool', async () => {
    const me = await devLogin(7901);
    let v = await view(me.token);
    expect(v).toMatchObject({ step: 'alliance', alliance: null, home: null, homes: [], squadMax: SQUAD_MAX, classes: [...START_CLASSES] });
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
    expect(v).toMatchObject({ step: 'squad', home: 'skythia-n' });
    expect(v.homes.find((h) => h.id === 'skythia-n')!.players).toBeGreaterThanOrEqual(1);

    const classes = ['hoplite', 'hoplite', 'hoplite', 'hoplite', 'celt_sword', 'celt_sword', 'archer', 'archer', 'slinger', 'javelineer', 'militia', 'archer'];
    const rs = await post(me.token, '/squad', { classes });
    expect(rs.status).toBe(200);
    const done = await rs.json<StartView & { ids: string[] }>();
    expect(done).toMatchObject({ step: 'done', alliance: 1, home: 'skythia-n' });
    expect(done.ids).toHaveLength(12);

    const roster = await (await api('/api/war/roster', { token: me.token })).json<{ persons: { id: string; cls: string; state: string; slot: number | null; region: string | null; level: number }[]; pools: { town: string; recruits: number }[] }>();
    const men = roster.persons.filter((p) => p.state === 'active').sort((a, b) => a.slot! - b.slot!);
    expect(men.map((p) => p.cls)).toEqual(classes);
    expect(men.map((p) => p.id)).toEqual(done.ids);
    expect(men.every((p) => p.region === null && p.level === 1)).toBe(true);
    expect(new Set(roster.persons.map((p) => p.id)).size).toBe(12);
    expect(roster.pools.find((p) => p.town === 'home')!.recruits).toBe(0);
  });

  it('refuses each step out of order, a home that is not free or not the alliance\'s, and a bad squad', async () => {
    const me = await devLogin(7902);
    expect(await code(await post(me.token, '/home', { region: 'dodona' }))).toBe('no_alliance');
    expect(await code(await post(me.token, '/squad', { classes: ['hoplite'] }))).toBe('no_alliance');
    expect((await post(me.token, '/alliance', { alliance: 4 })).status).toBe(400);
    expect((await post(me.token, '/alliance', { alliance: 0 })).status).toBe(200);
    expect(await code(await post(me.token, '/squad', { classes: ['hoplite'] }))).toBe('no_home');
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

    // switching the alliance before the squad resets the home
    expect((await post(me.token, '/home', { region: 'dodona' })).status).toBe(200);
    expect(await (await post(me.token, '/alliance', { alliance: 3 })).json<StartView>()).toMatchObject({ step: 'home', alliance: 3, home: null });
    expect((await post(me.token, '/home', { region: 'elaia-e' })).status).toBe(200);

    for (const classes of [[], Array(SQUAD_MAX + 1).fill('hoplite'), ['hoplite', 'companion'], ['civ_smith']]) {
      const r = await post(me.token, '/squad', { classes });
      expect(r.status).toBe(409);
      expect(await code(r)).toBe('bad_squad');
    }
    expect((await post(me.token, '/squad', { classes: ['Hoplite'] })).status).toBe(400);
    expect((await post(me.token, '/squad', { classes: ['archer', 'archer'] })).status).toBe(200);

    // one start: no second squad, no new alliance or home
    expect(await code(await post(me.token, '/squad', { classes: ['hoplite'] }))).toBe('started');
    expect(await code(await post(me.token, '/alliance', { alliance: 0 }))).toBe('started');
    expect(await code(await post(me.token, '/home', { region: 'elaia' }))).toBe('started');
    const n = await env.DB!.prepare("SELECT COUNT(*) AS n FROM war_persons WHERE player_id = ?1").bind(me.playerId).first<{ n: number }>();
    expect(n?.n).toBe(2);
  });

  it('a player who came in by the dev routes counts as started', async () => {
    const me = await devLogin(7903);
    await api('/api/war/world/dev/alliance', { method: 'POST', token: me.token, json: { alliance: 2 } });
    expect((await view(me.token)).step).toBe('home');
    await api('/api/war/dev/seed', { method: 'POST', token: me.token, json: {} });
    expect(await view(me.token)).toMatchObject({ step: 'done', alliance: 2, home: 'kyrene' });
  });
});
