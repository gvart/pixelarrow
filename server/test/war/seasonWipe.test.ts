/** W-96: a new season is a full reset for every path; the path is chosen anew (server/src/war/seasonWipe.ts, worldDO rollover). */
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { api, devLogin } from '../helpers';
import { regionStub, worldStub } from '../../src/war/placement';
import { SEASON_WIPE } from '../../src/war/seasonWipe';
import { getFavour } from '../../src/war/favour';
import { applyBossKill } from '../../src/war/bosses';
import { encounterStorageKey } from '../../src/war/encounters';
import { storyStorageKey } from '../../src/war/stories';
import { guideSaveOf, guideSaveStmt, pathOf, type StartView } from '../../src/war/start';
import type { WarRoom } from '../../src/war/room';
import type { WarWorldDO } from '../../src/war/world/worldDO';
import type { WarRegionDO } from '../../src/war/regionDO';
import { FAMILIES, PATHS } from '../../../src/war/world/start';
import { guideSteps } from '../../../src/war/net/guide';
import { NET_VERSION } from '../../../src/war/net/protocol';

const DB = () => env.DB!;
const post = (token: string, path: string, json: unknown) => api(`/api/war/start${path}`, { method: 'POST', token, json });
const view = async (token: string) => (await api('/api/war/start', { token })).json<StartView>();
const count = async (t: string, where = '1 = 1', ...b: unknown[]) => (await DB().prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ${where}`).bind(...b).first<{ n: number }>())!.n;

/** What a season's end leaves: the record of seasons past, and what is not a player's standing. */
const KEPT = [
  // the record, each row under the season it belongs to (STAT_SEASON, the world's id)
  'war_season_results', 'war_cosmetics', 'war_season_stats', 'war_player_stats', 'war_boss_kills',
  // W-96: chat; a clan's treasury is not the war's
  'war_chat', 'war_chat_mutes', 'war_chat_reports', 'war_treasury_log',
  // ledgers no rule reads a standing from: anti-abuse sightings, applied fights
  'war_seen', 'war_fights',
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

    // his belongings and standing: coin, a kept item, the demigod's level, the alliance's works, a town's trades and board,
    // his guide (hidden, a warrior's chain done) and every save his rooms keep
    const pid = w.playerId, now = Date.now();
    await DB().batch([
      DB().prepare("INSERT INTO war_goods (place, res, origin, seal, amount) VALUES (?1, 'coin', 'x', 0, 500)").bind(`sr:${pid}`),
      DB().prepare("INSERT INTO war_items (uid, player_id, item, created_at, place) VALUES ('wipe-1', ?1, '{}', ?2, ?3)").bind(pid, now, `sr:${pid}`),
      DB().prepare('INSERT INTO war_favour (player_id, xp, level, updated_at) VALUES (?1, 900, 7, ?2)').bind(pid, now),
      DB().prepare("INSERT INTO war_works (season, alliance, work, done_at, stage) VALUES (1, 0, 'road', ?1, 1)").bind(now),
      DB().prepare("INSERT INTO war_work_gifts (season, alliance, work, player_id) VALUES (1, 0, 'road', ?1)").bind(pid),
      DB().prepare("INSERT INTO war_fills (id, offer_id, town, res, n, price, tax, seller, buyer, ally, at) VALUES ('wipe-fill', 1, 'dodona', 'food', 1, 1, 0, ?1, ?1, 0, ?2)").bind(pid, now),
      DB().prepare("INSERT INTO war_board_seen (alliance, town, board, at) VALUES (0, 'dodona', '{}', ?1)").bind(now),
      guideSaveStmt(DB(), pid, { v: 1, done: guideSteps('warrior').map((x) => x.id), hidden: true }),
    ]);
    expect(await guideSaveOf(DB(), pid)).toMatchObject({ hidden: true });
    await runInDurableObject(regionStub(env, 'dodona'), async (_o: WarRegionDO, state) => {
      // more saves than one storage delete takes (128), and a key only an older build wrote
      for (let i = 0; i < 130; i++) await state.storage.put(storyStorageKey(1, pid + i), { done: true });
      await state.storage.put(encounterStorageKey(1, pid), { done: true });
      await state.storage.put('warlords:1', { from: 1, mem: { fallen: { x: 1 }, freed: {} } });
      await state.storage.put('woke', 1);
      await state.storage.put(`guide:1:${pid}`, { done: true });
    });

    await runInDurableObject(worldStub(env), (o: WarWorldDO) => o.resetSeason());

    for (const table of SEASON_WIPE) expect(await count(table), table).toBe(0);
    expect((await getFavour(env, pid)).level).toBe(1);
    expect(await guideSaveOf(DB(), pid)).toBeNull();
    // a region's own storage keeps its name and the world's events, whatever else was ever saved in it
    await runInDurableObject(regionStub(env, 'dodona'), async (_o: WarRegionDO, state) => {
      expect([...(await state.storage.list()).keys()].filter((k) => k !== 'worldEvents')).toEqual(['region']);
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
    // and his guide opens again from the top, as a builder's
    await runInDurableObject(regionStub(env, 'elaia'), async (o: WarRegionDO) => {
      const d = o as unknown as { ensure(r: string): Promise<WarRoom>; guideStart(p: number, r: WarRoom): Promise<void> };
      const room = await d.ensure('elaia');
      room.join(pid, { t: 'join', v: NET_VERSION, region: 'elaia', playerId: pid, team: 3, squads: [] }, []);
      room.setPath(pid, await pathOf(DB(), pid));
      await d.guideStart(pid, room);
      expect(room.guide.open).toContain(pid);
    });
    expect(guideSteps('builder')[0].id).toBe('gather');
    expect(await guideSaveOf(DB(), pid)).toMatchObject({ done: [] });
    expect((await guideSaveOf(DB(), pid))?.hidden).toBeFalsy();

    expect((await post(t.token, '/alliance', { alliance: 1 })).status).toBe(200);
    expect((await post(t.token, '/home', { region: 'skythia' })).status).toBe(200);
    expect((await post(t.token, '/path', { path: 'warrior', family: 'missile' })).status).toBe(200);
    expect(await count('war_persons', 'player_id = ?1', t.playerId)).toBe(FAMILIES.missile.start.length);
    // and his strongroom opens as a new player's: food, no coin
    const stock = (await (await api('/api/war/roster', { token: w.token })).json<{ stock: Record<string, number> }>()).stock;
    expect(stock.food).toBeGreaterThan(0);
    expect(stock.coin ?? 0).toBe(0);
  });

  it('the new season counts from its own start: boss kills under its id, warlords aged from its first day', async () => {
    const a = await devLogin(7963);
    const { id, startAt } = await runInDurableObject(worldStub(env), async (o: WarWorldDO) => {
      const season = await o.resetSeason();
      const world = await (o as unknown as { ensure(): Promise<{ st: { season: { startAt: number } } }> }).ensure();
      return { id: season, startAt: world.st.season.startAt };
    });
    expect(id).toBeGreaterThan(1);
    await applyBossKill(DB(), 'siren', 'wipe-run', { t: 1, kind: 'bossSlain', region: 'siren', boss: 'scylla', killers: [`p:${a.playerId}`] }, 1000);
    expect((await DB().prepare("SELECT season FROM war_boss_kills WHERE region = 'siren'").first<{ season: number }>())?.season).toBe(id);
    await vi.waitFor(() => runInDurableObject(regionStub(env, 'dodona'), async (_o: WarRegionDO, state) => {
      expect(await state.storage.get('worldEvents')).toMatchObject({ start: startAt });
    }));
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
