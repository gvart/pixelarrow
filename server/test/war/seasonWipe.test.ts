/** W-96: a new season is a full reset for every path; the path is chosen anew (server/src/war/seasonWipe.ts, worldDO rollover). */
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, devLogin } from '../helpers';
import { regionStub, worldStub } from '../../src/war/placement';
import { SEASON_WIPE } from '../../src/war/seasonWipe';
import { getFavour } from '../../src/war/favour';
import type { StartView } from '../../src/war/start';
import type { WarWorldDO } from '../../src/war/world/worldDO';
import type { WarRegionDO } from '../../src/war/regionDO';
import { FAMILIES, PATHS } from '../../../src/war/world/start';

const DB = () => env.DB!;
const post = (token: string, path: string, json: unknown) => api(`/api/war/start${path}`, { method: 'POST', token, json });
const view = async (token: string) => (await api('/api/war/start', { token })).json<StartView>();
const count = async (t: string, where = '1 = 1', ...b: unknown[]) => (await DB().prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ${where}`).bind(...b).first<{ n: number }>())!.n;

/** What a season's end leaves: the record of seasons past, and what is not a player's standing. */
const KEPT = [
  'war_season_results', 'war_cosmetics', 'war_season_stats', 'war_player_stats', 'war_boss_kills', 'war_fills', 'war_treasury_log',
  'war_chat', 'war_chat_mutes', 'war_chat_reports', 'war_seen', 'war_fights',
  'war_works', 'war_work_gifts', 'war_board_seen',
];

describe('W-96 season wipe', () => {
  it('sorts every war table into wiped or kept', async () => {
    const tables = (await DB().prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'war\\_%' ESCAPE '\\'").all<{ name: string }>()).results.map((r) => r.name);
    expect([...tables].sort()).toEqual([...SEASON_WIPE, ...KEPT].sort());
  });

  it('every path loses men, gear, belongings and titles; each player chooses again, another path if he likes', async () => {
    const start = async (id: number, alliance: number, home: string, b: { path: string; family?: string }) => {
      const me = await devLogin(id);
      await post(me.token, '/alliance', { alliance });
      await post(me.token, '/home', { region: home });
      expect((await post(me.token, '/path', b)).status).toBe(200);
      return me;
    };
    const w = await start(7961, 0, 'dodona', { path: 'warrior', family: 'line' });
    const t = await start(7962, 1, 'skythia', { path: 'trader' });
    expect(await view(w.token)).toMatchObject({ step: 'done', path: 'warrior', family: 'line' });

    // his belongings and standing: coin, a kept item, the demigod's level, a home room's guide save
    const pid = w.playerId, now = Date.now();
    await DB().batch([
      DB().prepare("INSERT INTO war_goods (place, res, origin, seal, amount) VALUES (?1, 'coin', 'x', 0, 500)").bind(`sr:${pid}`),
      DB().prepare("INSERT INTO war_items (uid, player_id, item, created_at, place) VALUES ('wipe-1', ?1, '{}', ?2, ?3)").bind(pid, now, `sr:${pid}`),
      DB().prepare('INSERT INTO war_favour (player_id, xp, level, updated_at) VALUES (?1, 900, 7, ?2)').bind(pid, now),
    ]);
    await runInDurableObject(regionStub(env, 'dodona'), async (_o: WarRegionDO, state) => {
      await state.storage.put(`guide:1:${pid}`, { done: true });
    });

    await runInDurableObject(worldStub(env), (o: WarWorldDO) => o.resetSeason());

    for (const table of SEASON_WIPE) expect(await count(table), table).toBe(0);
    expect((await getFavour(env, pid)).level).toBe(1);
    await runInDurableObject(regionStub(env, 'dodona'), async (_o: WarRegionDO, state) => {
      expect(await state.storage.get(`guide:1:${pid}`)).toBeUndefined();
    });

    // the start again, from the top
    expect(await view(w.token)).toMatchObject({ step: 'alliance', alliance: null, home: null, path: null, family: null });
    expect(await view(t.token)).toMatchObject({ step: 'alliance', path: null });

    // a warrior of the phalanx comes back a builder, and a trader a warrior of another family
    expect((await post(w.token, '/alliance', { alliance: 3 })).status).toBe(200);
    expect((await post(w.token, '/home', { region: 'elaia' })).status).toBe(200);
    const again = await (await post(w.token, '/path', { path: 'builder' })).json<StartView & { ids: string[] }>();
    expect(again).toMatchObject({ step: 'done', path: 'builder', family: null, home: 'elaia' });
    expect(again.ids).toHaveLength(PATHS.builder.start.length);
    expect(await count('war_persons', 'player_id = ?1', pid)).toBe(PATHS.builder.start.length);

    expect((await post(t.token, '/alliance', { alliance: 1 })).status).toBe(200);
    expect((await post(t.token, '/home', { region: 'skythia' })).status).toBe(200);
    expect((await post(t.token, '/path', { path: 'warrior', family: 'missile' })).status).toBe(200);
    expect(await count('war_persons', 'player_id = ?1', t.playerId)).toBe(FAMILIES.missile.start.length);
    // and his strongroom opens as a new player's: food, no coin
    const stock = (await (await api('/api/war/roster', { token: w.token })).json<{ stock: Record<string, number> }>()).stock;
    expect(stock.food).toBeGreaterThan(0);
    expect(stock.coin ?? 0).toBe(0);
  });

  it('nobody rides on: squads on the road are gone with the season', async () => {
    const out = await runInDurableObject(worldStub(env), async (o: WarWorldDO) => {
      const world = await (o as unknown as { ensure(): Promise<{ st: { transit: unknown[] } }> }).ensure();
      world.st.transit.push({ id: 999, pid: 1, ids: ['ghost'], from: 'dodona', to: 'dodona-e', arriveAt: Date.now() + 1e9, state: 'road' });
      await o.resetSeason();
      return world.st.transit.length;
    });
    expect(out).toBe(0);
  });
});
