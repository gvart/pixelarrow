/**
 * W-165..W-168: three season ladders, one a path, ranked by level points; their first places are the titles; the roll of
 * honour keeps the winner and the top places before W-96's reset. Players are made through the real start; paths and
 * families come from the data.
 */
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { LADDER, TITLE_OF, type LaddersView } from '../../../src/war/net/ladders';
import { PAYS, type FavourReason } from '../../../src/war/net/favour';
import { FAMILIES, FAMILY_IDS, PATH_IDS, type PathId, type StartFamily } from '../../../src/war/world/start';
import { addFavour } from '../../src/war/favour';
import { ladders, laddersView, titles } from '../../src/war/ladders';
import { worldStub } from '../../src/war/world/routes';
import type { WarWorldDO } from '../../src/war/world/worldDO';
import { api, devLogin } from '../helpers';

const DB = () => env.DB!;
const startPost = (t: string, p: string, json: unknown) => api(`/api/war/start${p}`, { method: 'POST', token: t, json });
async function onPath(id: number, path: PathId, f: StartFamily | null = path === 'warrior' ? FAMILY_IDS[0] : null, alliance = 0) {
  const me = await devLogin(id);
  expect((await startPost(me.token, '/alliance', { alliance })).status).toBe(200);
  const r = await api('/api/war/start', { token: me.token });
  const home = ((await r.json()) as { homes?: { id: string }[] }).homes?.[0]?.id;
  expect((await startPost(me.token, '/home', { region: home ?? 'dodona' })).status).toBe(200);
  expect((await startPost(me.token, '/path', { path, ...(f ? { family: f } : {}) })).status).toBe(200);
  return me;
}
/** Level points every path earns (tasks pay all), set directly by a time so ties can be tested. */
const pay = (pid: number, n: number, at = 1000) => addFavour(env, pid, n, 'task', at);

describe('three ladders (W-165)', () => {
  it('a builder never appears on the warrior\'s, even paid for a warrior\'s work', async () => {
    const w = await onPath(8801, 'warrior'), b = await onPath(8802, 'builder'), t = await onPath(8803, 'trader');
    await pay(w.playerId, 10);
    await pay(b.playerId, 500);
    await pay(t.playerId, 30);
    // every reason that pays only one path, sent to the builder
    for (const r of Object.keys(PAYS) as FavourReason[]) if (PAYS[r] && PAYS[r] !== 'builder') await addFavour(env, b.playerId, 900, r);
    const l = await ladders(DB());
    expect(Object.keys(l).sort()).toEqual([...PATH_IDS].sort());
    const on = (p: PathId, pid: number) => l[p].some((r) => r.pid === pid);
    expect(on('warrior', b.playerId)).toBe(false);
    expect(on('trader', b.playerId)).toBe(false);
    expect(on('builder', b.playerId)).toBe(true);
    expect(on('builder', w.playerId)).toBe(false);
    expect(on('warrior', w.playerId)).toBe(true);
    expect(on('trader', t.playerId)).toBe(true);
    expect(l.builder.find((r) => r.pid === b.playerId)!.points).toBe(500); // none of the warrior's pay reached him
  });

  it('ranks by level points; a tie goes to who got there first, then the lower id', async () => {
    const a = await onPath(8811, 'trader'), b = await onPath(8812, 'trader'), c = await onPath(8813, 'trader'), d = await onPath(8814, 'trader');
    await pay(a.playerId, 100, 5000);
    await pay(b.playerId, 300, 5000);
    await pay(c.playerId, 100, 4000);
    await pay(d.playerId, 100, 4000);
    const rows = (await ladders(DB())).trader.filter((r) => [a, b, c, d].some((p) => p.playerId === r.pid));
    expect(rows.map((r) => r.pid)).toEqual([b, c, d, a].map((p) => p.playerId));
    const places = rows.map((r) => r.place);
    expect(places).toEqual([...places].sort((x, y) => x - y));
    expect(new Set(places).size).toBe(4);
  });

  it('a player with no path, or no points, stands on none', async () => {
    const dev = await devLogin(8821);
    await addFavour(env, dev.playerId, 50, 'task');
    const idle = await onPath(8822, 'builder');
    const all = Object.values(await ladders(DB())).flat();
    expect(all.some((r) => r.pid === dev.playerId)).toBe(false);
    expect(all.some((r) => r.pid === idle.playerId)).toBe(false);
  });
});

describe('a warrior\'s family (W-167)', () => {
  it('shows beside his name and adds no ladder of its own', async () => {
    const fam = FAMILY_IDS[FAMILY_IDS.length - 1];
    const w = await onPath(8831, 'warrior', fam), b = await onPath(8832, 'builder');
    await pay(w.playerId, 40);
    await pay(b.playerId, 40);
    const l = await ladders(DB());
    expect(l.warrior.find((r) => r.pid === w.playerId)!.family).toBe(fam);
    expect(FAMILIES[fam]).toBeDefined();
    expect(l.builder.find((r) => r.pid === b.playerId)).not.toHaveProperty('family');
    expect(Object.keys(l)).toHaveLength(PATH_IDS.length);
    for (const f of FAMILY_IDS) expect(Object.keys(l)).not.toContain(f);
  });
});

describe('your place (W-169)', () => {
  it('the route gives the ladders and his own place, even off the top rows', async () => {
    const low = await onPath(8841, 'builder');
    await pay(low.playerId, 1);
    for (let i = 0; i < 3; i++) await pay((await onPath(8842 + i, 'builder')).playerId, 2 + i);
    const view = await laddersView(DB(), low.playerId, 2);
    expect(view.ladders.builder).toHaveLength(2);
    expect(view.ladders.builder.some((r) => r.pid === low.playerId)).toBe(false);
    const res = (await (await api('/api/war/ladders', { token: low.token })).json()) as LaddersView;
    expect(res.you).toMatchObject({ path: 'builder', points: 1 });
    const above = res.ladders.builder.filter((r) => r.points > 1).length;
    expect(res.you!.place).toBeGreaterThan(above);
    expect(res.ladders.builder.length).toBeLessThanOrEqual(LADDER.top);
    const none = await devLogin(8849);
    expect(((await (await api('/api/war/ladders', { token: none.token })).json()) as LaddersView).you).toBeNull();
  });
});

describe('titles are first places (W-166)', () => {
  it('one a path, on the ladder\'s first row; no Warden', async () => {
    for (const [i, path] of PATH_IDS.entries()) await pay((await onPath(8851 + i, path)).playerId, 100_000 + i);
    const [l, t] = [await ladders(DB()), await titles(DB())];
    expect(t.map((x) => x.id).sort()).toEqual(PATH_IDS.map((p) => TITLE_OF[p].id).sort());
    expect(t.map((x) => x.id)).not.toContain('warden');
    for (const p of PATH_IDS) {
      const x = t.find((y) => y.id === TITLE_OF[p].id)!;
      expect(x).toMatchObject({ pid: l[p][0].pid, value: l[p][0].points, name: TITLE_OF[p].name });
    }
  });
});

describe('the roll of honour (W-168)', () => {
  it('records the winning alliance and each path\'s top places, then W-96 wipes the season', async () => {
    const winners = [] as number[];
    let id = 8861;
    for (const path of PATH_IDS) {
      for (let k = 0; k < LADDER.honour + 1; k++) {
        const me = await onPath(id++, path, path === 'warrior' ? FAMILY_IDS[0] : null, 2);
        await pay(me.playerId, 200_000 + k);
        if (k === LADDER.honour) winners.push(me.playerId);
      }
    }
    const before = await ladders(DB());
    const world = worldStub(env);
    const out = await runInDurableObject(world, async (o: WarWorldDO) => {
      const s = (await o.standings()).season.id;
      await o.report('saddle', { live: [0, 0, 12, 0], claims: [0, 0, 1, 0], channel: [0, 0, 0, 0] });
      await o.resetSeason();
      return { s, snap: await o.snapshot(winners[0], null) };
    });
    const row = await DB().prepare('SELECT winner, ladders FROM war_season_results WHERE season = ?1').bind(out.s).first<{ winner: number; ladders: string }>();
    expect(row!.winner).toBe(2);
    const kept = JSON.parse(row!.ladders) as typeof before;
    for (const p of PATH_IDS) {
      expect(kept[p]).toHaveLength(LADDER.honour);
      expect(kept[p]).toEqual(before[p].slice(0, LADDER.honour));
    }
    expect(out.snap.last).toMatchObject({ season: out.s, winner: 2, ladders: kept });
    // a crest to each first place
    for (const p of PATH_IDS) {
      const c = await DB().prepare("SELECT detail FROM war_cosmetics WHERE player_id = ?1 AND season = ?2 AND kind = 'crest'").bind(kept[p][0].pid, out.s).first<{ detail: string }>();
      expect(c?.detail).toBe(TITLE_OF[p].id);
    }
    // W-96: the live ladders are gone, the roll stays
    const after = await ladders(DB());
    for (const p of PATH_IDS) expect(after[p]).toEqual([]);
    expect(await DB().prepare('SELECT season FROM war_season_results WHERE season = ?1').bind(out.s).first()).not.toBeNull();
  });
});
