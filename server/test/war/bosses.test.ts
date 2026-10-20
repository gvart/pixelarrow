/** W-45: a region boss kill is written once: the kill and the killers' tallies; M6e: its loot is physical (a pile in the room). */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { devLogin } from '../helpers';
import { applyBossKill, bossItems, type BossSlain } from '../../src/war/bosses';
import { fightStats } from '../../src/war/persons';
import { BOSS_TIERS, bossLoot } from '../../../src/data/warBosses';
import type { FightReport } from '../../../src/war/types';

const DB = () => env.DB!;

describe('boss kill write-back', () => {
  it('records the kill and the last blow\'s alliance, counts it for every killer, mints nothing (the loot falls as a pile)', async () => {
    const a = await devLogin(7401), b = await devLogin(7402);
    await DB().prepare('INSERT INTO war_alliance_members (season, player_id, alliance, joined_at) VALUES (1, ?1, 2, 0)').bind(a.playerId).run();
    const e: BossSlain = { t: 4200, kind: 'bossSlain', region: 'siren', boss: 'scylla', killers: [`p:${a.playerId}`, `p:${b.playerId}`, 'mob'] };
    expect(await applyBossKill(DB(), 'siren', 'run1', e, 1000)).toBe(true);
    expect(await applyBossKill(DB(), 'siren', 'run1', e, 2000)).toBe(false);
    const kill = await DB().prepare('SELECT boss, alliance, player_id FROM war_boss_kills WHERE region = ?1').bind('siren').first();
    expect(kill).toEqual({ boss: 'scylla', alliance: 2, player_id: a.playerId });
    const stats = await DB().prepare('SELECT player_id, bosses FROM war_player_stats WHERE player_id IN (?1, ?2) ORDER BY player_id').bind(a.playerId, b.playerId).all();
    expect(stats.results).toEqual([{ player_id: a.playerId, bosses: 1 }, { player_id: b.playerId, bosses: 1 }].sort((x, y) => x.player_id - y.player_id));
    expect((await DB().prepare("SELECT COUNT(*) AS n FROM war_items WHERE uid LIKE 'boss:%'").first<{ n: number }>())!.n).toBe(0);
    // the pile's items: the same for the same kill
    const items = bossItems('siren', 'run1', e);
    expect(items).toHaveLength(BOSS_TIERS[3].picks);
    expect(items.map((x) => x.def)).toEqual(bossLoot('scylla', 'siren:run1:4200:scylla').map((d) => d.def));
    expect(bossItems('siren', 'run1', e)).toEqual(items);
  });

  it('ignores an unknown boss or one with no player among the killers', async () => {
    expect(await applyBossKill(DB(), 'siren', 'run2', { t: 1, kind: 'bossSlain', region: 'siren', boss: 'nobody', killers: ['p:1'] }, 0)).toBe(false);
    expect(await applyBossKill(DB(), 'siren', 'run2', { t: 1, kind: 'bossSlain', region: 'siren', boss: 'scylla', killers: ['mob'] }, 0)).toBe(false);
  });
});

describe('fight tallies', () => {
  it('a fight is won when the player kept a fit man and no other team did', () => {
    const hero = {} as FightReport['persons'][number]['hero'];
    const p = (owner: string, team: number, state: 'fit' | 'dead', honour = false) =>
      ({ pid: `${owner}${team}${state}`, owner, team, state, xp: 0, kills: 1, dmg: 0, levelUps: 0, hero, ...(honour ? { honour: { name: 'x', stat: 'hp' as const } } : {}) });
    const binds: unknown[][] = [];
    const db = { prepare: () => ({ bind: (...v: unknown[]) => (binds.push(v), {}) }) } as unknown as D1Database;
    fightStats(db, { tick: 1, loot: {}, persons: [p('p:1', 0, 'fit', true), p('p:1', 0, 'dead'), p('p:2', 1, 'dead')] });
    // season, player, kills, fights, wins, honours, bosses
    expect(binds).toEqual([[1, 1, 2, 1, 1, 1, 0], [1, 2, 1, 1, 0, 0, 0]]);
  });
});
