import { beforeEach, describe, expect, it } from 'vitest';
import { lairAt, worldBossSites, bossMaxHp } from '../../src/online/lairs';
import { currentSeason } from '../src/online/store';
import type { BattleSetup } from '../../src/sim/types';
import { DB, fresh, getJson, join, must, placeArmy, play, post, shardRow, type Player, type Ticket } from './onlineHelpers';

beforeEach(fresh);

/** Puts a player's army next to a region of a shard (test shortcut for a march). */
async function standBeside(p: Player, loc: number, shard: { id: number; world: { neighbours(l: number): readonly number[]; info(l: number): { passable: boolean } } }): Promise<number> {
  const spot = must(shard.world.neighbours(loc).find((n) => shard.world.info(n).passable), `passable neighbour of ${loc}`);
  await placeArmy(p, spot, shard.id);
  return spot;
}

/** Makes the stored beast setup of a ticket a pushover (test-only), so the client's play and the server's replay agree on a win. */
async function weakenTicket(ticket: string): Promise<BattleSetup> {
  const row = await DB().prepare('SELECT setup FROM battle_tickets WHERE id = ?1').bind(ticket).first<{ setup: string }>();
  const setup = JSON.parse(row!.setup) as BattleSetup;
  for (const u of setup.armies[1].units) {
    u.stats.maxHp = 1;
    u.stats.dmg = 0;
    delete u.hp0;
  }
  await DB().prepare('UPDATE battle_tickets SET setup = ?2 WHERE id = ?1').bind(ticket, JSON.stringify(setup)).run();
  return setup;
}

interface BossInfo {
  boss: string;
  loc: number;
  hp: number;
  maxHp: number;
  parts: number[];
  status: string;
  top: { player: number; damage: number }[];
  you: { damage: number; raids: number; loot: { share: number; items: { rarity: string }[] } | null; chest?: { kind: string; item: unknown } | null };
}

describe('beast lairs', () => {
  it('a lair region shows its beast; a slain beast gives the region, its hoard and a trophy', async () => {
    const p = await join(8801, 'Herakles');
    const shard = await shardRow(p);
    // the nearest lair to home
    const lair = shard.world.within(p.profile.home, 99).find((l) => lairAt(shard.world, shard.seed, l));
    expect(lair).toBeDefined();
    const at = await standBeside(p, lair!, shard);
    expect(at).toBeTruthy();
    const view = await getJson<{ region: { occupant: string; lair?: string }; lair: { enc: string; home: boolean } | null; defenders: { kind: string } }>(`/api/online/region/${lair}`, p.token);
    expect(view.status).toBe(200);
    expect(view.body.region.occupant).toBe('beast');
    expect(view.body.lair?.home).toBe(true);
    expect(view.body.defenders.kind).toBe('beast');
    const t = await post<Ticket>('/api/online/attack/start', p.token, { loc: lair });
    expect(t.status).toBe(200);
    expect(t.body.defenderKind).toBe('beast');
    const setup = await weakenTicket(t.body.ticket);
    const run = play(setup);
    expect(run.claim.winner).toBe(0);
    const sub = await post<{ captured: boolean; loot: { rarity: string }[]; beast: { trophy: string | null } }>('/api/online/attack/submit', p.token, { ticket: t.body.ticket, ...run });
    expect(sub.status).toBe(200);
    expect(sub.body.captured).toBe(true);
    expect(sub.body.beast.trophy).toMatch(/^trophy_/);
    expect(sub.body.loot.length).toBeGreaterThan(0);
    for (const it of sub.body.loot) expect(['rare', 'epic', 'legendary']).toContain(it.rarity);
    const row = await DB().prepare('SELECT owner_id, beast_slain_at FROM online_regions WHERE shard_id = ?1 AND loc = ?2').bind(shard.id, lair).first<{ owner_id: number; beast_slain_at: number }>();
    expect(row?.owner_id).toBe(p.playerId);
    expect(row?.beast_slain_at).toBeGreaterThan(0);
    const ent = await DB().prepare("SELECT product_id FROM entitlements WHERE player_id = ?1 AND product_id LIKE 'trophy_%'").bind(p.playerId).first<{ product_id: string }>();
    expect(ent?.product_id).toBe(sub.body.beast.trophy);
  });
});

describe('world bosses', () => {
  async function setupBoss(ids: number[]) {
    const players = [];
    for (const id of ids) players.push(await join(id));
    const shard = await shardRow(players[0]);
    const site = worldBossSites(shard.world, shard.seed)[0];
    expect(site).toBeTruthy();
    for (const p of players) await standBeside(p, site.loc, shard);
    return { players, shard, site };
  }

  it('lists the bosses with shared HP; raids are verified segments against the current wounds', async () => {
    const { players, site } = await setupBoss([8901]);
    const [a] = players;
    const list = await getJson<{ bosses: BossInfo[] }>('/api/online/boss', a.token);
    expect(list.status).toBe(200);
    const b0 = list.body.bosses.find((b) => b.boss === site.boss)!;
    expect(b0.hp).toBe(bossMaxHp(site.boss, site.level).body);
    // a stored wound carries into the next raid's setup
    await DB().prepare('UPDATE world_bosses SET hp = ?1 WHERE boss = ?2').bind(b0.maxHp - 500, site.boss).run();
    const t = await post<Ticket & { boss: string }>('/api/online/boss/start', a.token, { boss: site.boss });
    expect(t.status).toBe(200);
    const body = t.body.setup.armies[1].units.find((u) => u.stats.boss === site.boss)!;
    expect(body.hp0).toBe(b0.maxHp - 500);
    expect(t.body.setup.timeLimit).toBeLessThanOrEqual(120);
    // a tampered claim is void and counts nothing
    const run = play(t.body.setup);
    const bad = await post<{ error: { code: string } }>('/api/online/boss/submit', a.token, { ticket: t.body.ticket, ...run, claim: { ...run.claim, hash: 'deadbeef' } });
    expect(bad.status).toBe(422);
    const after = await getJson<{ bosses: BossInfo[] }>('/api/online/boss', a.token);
    expect(after.body.bosses.find((b) => b.boss === site.boss)!.hp).toBe(b0.maxHp - 500);
    expect(after.body.bosses.find((b) => b.boss === site.boss)!.you.raids).toBe(0);
  });

  it('concurrent raids both count against the shared HP; the damage tally per player and clan', async () => {
    const { players, site } = await setupBoss([8911, 8912]);
    const [a, b] = players;
    await post('/api/online/clans', a.token, { name: 'Argonauts', tag: 'ARGO' });
    const ta = await post<Ticket>('/api/online/boss/start', a.token, { boss: site.boss });
    const tb = await post<Ticket>('/api/online/boss/start', b.token, { boss: site.boss });
    expect(ta.status).toBe(200);
    expect(tb.status).toBe(200);
    const max = (await DB().prepare('SELECT hp FROM world_bosses WHERE boss = ?1').bind(site.boss).first<{ hp: number }>())!.hp;
    const ra = play(ta.body.setup);
    const rb = play(tb.body.setup);
    const [sa, sb] = await Promise.all([
      post<{ dealt: number; bodyDealt: number }>('/api/online/boss/submit', a.token, { ticket: ta.body.ticket, ...ra }),
      post<{ dealt: number; bodyDealt: number }>('/api/online/boss/submit', b.token, { ticket: tb.body.ticket, ...rb }),
    ]);
    expect(sa.status).toBe(200);
    expect(sb.status).toBe(200);
    const row = await DB().prepare('SELECT hp, status FROM world_bosses WHERE boss = ?1').bind(site.boss).first<{ hp: number; status: string }>();
    expect(row!.hp).toBe(Math.max(0, max - sa.body.bodyDealt - sb.body.bodyDealt));
    const tally = await DB().prepare('SELECT player_id, damage, raids, clan_id FROM world_boss_damage WHERE boss = ?1 ORDER BY player_id').bind(site.boss).all<{ player_id: number; damage: number; raids: number; clan_id: number | null }>();
    expect(tally.results.map((x) => x.damage)).toEqual([sa.body.dealt, sb.body.dealt]);
    expect(tally.results.every((x) => x.raids === 1)).toBe(true);
    expect(tally.results[0].clan_id).not.toBeNull();
    // the same report twice is answered from the store, not counted again
    const again = await post<{ replayed: boolean }>('/api/online/boss/submit', a.token, { ticket: ta.body.ticket, ...ra });
    expect(again.body.replayed).toBe(true);
    const t2 = await DB().prepare('SELECT damage FROM world_boss_damage WHERE player_id = ?1').bind(a.playerId).first<{ damage: number }>();
    expect(t2!.damage).toBe(sa.body.dealt);
  });

  it('the killing raid splits the hoard by damage share, once', async () => {
    const { players, site } = await setupBoss([8921, 8922]);
    const [a, b] = players;
    // b already hurt it a lot; a finishes it off
    await getJson('/api/online/boss', a.token);
    const parts = JSON.stringify(Array.from({ length: bossMaxHp(site.boss, site.level).parts }, () => 0));
    await DB().prepare('UPDATE world_bosses SET hp = 1, parts = ?2 WHERE boss = ?1').bind(site.boss, parts).run();
    const season = await currentSeason(DB());
    await DB()
      .prepare('INSERT INTO world_boss_damage (season_id, shard_id, boss, player_id, clan_id, damage, raids, updated_at) VALUES (?1, ?2, ?3, ?4, NULL, 3000, 4, ?5)')
      .bind(season.id, a.profile.shard.id, site.boss, b.playerId, Date.now())
      .run();
    // b's war bad-luck counter is due: their chest is legendary
    await DB().prepare("INSERT INTO loot_pity (player_id, track, count, updated_at) VALUES (?1, 'war', 8, 0)").bind(b.playerId).run();
    const t = await post<Ticket>('/api/online/boss/start', a.token, { boss: site.boss });
    expect(t.status).toBe(200);
    const run = play(t.body.setup);
    const sub = await post<{ killed: boolean; killedNow: boolean; dealt: number }>('/api/online/boss/submit', a.token, { ticket: t.body.ticket, ...run });
    expect(sub.status).toBe(200);
    expect(sub.body.dealt).toBeGreaterThan(0);
    expect(sub.body.killed).toBe(true);
    expect(sub.body.killedNow).toBe(true);
    const items = async (pid: number) => (await DB().prepare("SELECT COUNT(*) AS n FROM online_items WHERE player_id = ?1 AND uid LIKE '%wb%'").bind(pid).first<{ n: number }>())!.n;
    const nA = await items(a.playerId);
    const nB = await items(b.playerId);
    expect(nB).toBeGreaterThan(nA); // b dealt far more
    expect(nA + nB).toBeGreaterThan(0);
    // the split is idempotent: looking again (and again) adds nothing
    const v1 = await getJson<{ bosses: BossInfo[] }>('/api/online/boss', b.token);
    await getJson('/api/online/boss', a.token);
    expect(await items(a.playerId)).toBe(nA);
    expect(await items(b.playerId)).toBe(nB);
    const mine = v1.body.bosses.find((x) => x.boss === site.boss)!;
    expect(mine.status).toBe('dead');
    // a chest for every contributor of at least 5% of the damage, once: b's is legendary (the counter was due) and resets it
    const chests = await DB().prepare('SELECT player_id, kind, item FROM world_boss_chests WHERE boss = ?1 ORDER BY player_id').bind(site.boss).all<{ player_id: number; kind: string; item: string }>();
    const share = (mine.you.loot?.share ?? 0) as number;
    expect(chests.results.map((r) => r.player_id)).toEqual(share >= 0.95 ? [b.playerId] : [a.playerId, b.playerId].sort((x, y) => x - y));
    const bc = chests.results.find((r) => r.player_id === b.playerId)!;
    expect(['set', 'named', 'legendary']).toContain(bc.kind);
    expect((JSON.parse(bc.item) as { rarity: string }).rarity).toBe('legendary');
    expect(mine.you.chest!.item).toEqual(JSON.parse(bc.item));
    expect(await items(b.playerId)).toBe(nB);
    const inStash = await DB().prepare("SELECT COUNT(*) AS n FROM online_items WHERE player_id = ?1 AND uid LIKE '%wbc%'").bind(b.playerId).first<{ n: number }>();
    expect(inStash!.n).toBe(1);
    const pity = await DB().prepare("SELECT count FROM loot_pity WHERE player_id = ?1 AND track = 'war'").bind(b.playerId).first<{ count: number }>();
    expect(pity!.count).toBe(0);
    expect(mine.you.loot!.share).toBeGreaterThan(0.5);
    for (const it of mine.you.loot!.items) expect(['rare', 'epic', 'legendary']).toContain(it.rarity);
    const trophies = await DB().prepare("SELECT COUNT(*) AS n FROM entitlements WHERE product_id LIKE 'trophy_%' AND player_id IN (?1, ?2)").bind(a.playerId, b.playerId).first<{ n: number }>();
    expect(trophies!.n).toBe(2);
    // no more raids on a dead boss
    expect((await post<{ error: { code: string } }>('/api/online/boss/start', b.token, { boss: site.boss })).body.error.code).toBe('boss_dead');
  });

  it('a world boss region cannot be attacked like a neutral region', async () => {
    const { players, site } = await setupBoss([8931]);
    const r = await post<{ error: { code: string } }>('/api/online/attack/start', players[0].token, { loc: site.loc });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('world_boss');
  });
});
