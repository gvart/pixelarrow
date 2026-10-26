import { createExecutionContext, createScheduledController, env, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { buildPublicSnapshot } from '../src/public/snapshot';
import { BODY_MAX_BYTES, PublicSummaryV1 } from '../src/public/schema';
import { devLogin } from './helpers';
import { currentSeason, forgetSeasonCache } from '../src/war/store';
import worker from '../src/index';

const db = env.DB!;
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const DAY = 86_400_000;

/**
 * Seeded players get large, distinctive ids and Telegram ids, so a scan of the
 * snapshot can find any leak. They start opted out of public boards
 * (`public_boards = 0`); `named()` opts players in.
 */
let seq = 0;
async function seedPlayer(o: { banned?: boolean; lastSeen?: number } = {}): Promise<{ id: number; tg: number; first: string; user: string }> {
  seq++;
  const max = (await db.prepare('SELECT MAX(id) AS m FROM players').first<{ m: number | null }>())?.m ?? 0;
  const id = Math.max(9_100_000, max) + 7;
  const tg = 7_700_000_000 + seq;
  const first = `Firstname${seq}x`;
  const user = `user_${seq}_tg`;
  await db
    .prepare(
      "INSERT INTO players (id, telegram_id, username, first_name, display_name, display_name_key, created_at, last_seen_at, banned_at, public_boards) VALUES (?1, ?2, ?3, ?4, 'Seed' || ?1, 'seed' || ?1, ?5, ?6, ?7, 0)",
    )
    .bind(id, tg, user, first, NOW - 30 * DAY, o.lastSeen ?? NOW - DAY, o.banned ? NOW - DAY : null)
    .run();
  seeded.push({ id, tg, first, user });
  return { id, tg, first, user };
}

/** Everything seeded that must never reach the snapshot: player ids, Telegram ids, first names, usernames. */
const seeded: { id: number; tg: number; first: string; user: string }[] = [];

/** Wraps the D1 binding and records every SQL statement prepared through it. */
function spyDb(): { db: D1Database; sql: string[] } {
  const sql: string[] = [];
  const spy = new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') return (q: string) => (sql.push(q.trim()), target.prepare(q));
      if (prop === 'batch' || prop === 'exec') return () => Promise.reject(new Error(`unexpected ${String(prop)}`));
      const v = Reflect.get(target, prop);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  return { db: spy, sql };
}

async function warBattle(): Promise<void> {
  await db
    .prepare("INSERT INTO battle_log (season_id, shard_id, kind, winner, ticks, verified, created_at) VALUES (1, 1, 'attack', 0, 100, 1, ?1)")
    .bind(NOW)
    .run();
}
/** A seeded player with a public display name (and the given privacy state). */
async function named(o: { banned?: boolean; deleted?: boolean; optedOut?: boolean } = {}): Promise<{ id: number; tg: number; first: string; user: string; name: string }> {
  const p = await seedPlayer({ banned: o.banned });
  const name = `Nick${p.id % 100_000}`;
  await db
    .prepare('UPDATE players SET display_name = ?2, public_boards = ?3, deleted_at = ?4 WHERE id = ?1')
    .bind(p.id, name, o.optedOut ? 0 : 1, o.deleted ? NOW - DAY : null)
    .run();
  return { ...p, name };
}

async function stored(): Promise<{ body: string; generated_at: number } | null> {
  return db.prepare('SELECT body, generated_at FROM public_snapshot WHERE id = 1').first();
}

describe('public snapshot (ADR-0010 §2)', () => {
  it('writes one strict snapshot row with real totals; banned players are not counted', async () => {
    const before = await db.prepare('SELECT COUNT(*) AS n FROM players WHERE banned_at IS NULL').first<{ n: number }>();
    await seedPlayer();
    await seedPlayer({ lastSeen: NOW - 30 * DAY });
    await seedPlayer({ banned: true });
    const snap = await buildPublicSnapshot(env, NOW);
    expect(snap.v).toBe(1);
    expect(snap.generatedAt).toBe(NOW);
    expect(snap.totals.players).toBe(before!.n + 2);
    const row = await stored();
    expect(row?.generated_at).toBe(NOW);
    expect(PublicSummaryV1.parse(JSON.parse(row!.body))).toEqual(snap);
  });
  it('counts war battles incrementally and never goes down across a prune; duels are always 0', async () => {
    const base = (await buildPublicSnapshot(env, NOW)).totals;
    await warBattle();
    await warBattle();
    let t = (await buildPublicSnapshot(env, NOW)).totals;
    expect(t.warBattles - base.warBattles).toBe(2);
    expect(t.onlineBattles - base.onlineBattles).toBe(2);
    expect(t.duelsFought).toBe(0);
    // A prune of every source row lowers no total; new rows keep counting.
    await db.prepare('DELETE FROM battle_log').run();
    await warBattle();
    t = (await buildPublicSnapshot(env, NOW)).totals;
    expect(t.warBattles - base.warBattles).toBe(3);
    // A run with nothing new adds nothing.
    expect((await buildPublicSnapshot(env, NOW)).totals).toEqual(t);
  });

  it('the duel section stays in schema v1, empty', async () => {
    const snap = await buildPublicSnapshot(env, NOW);
    expect(snap.duels).toEqual({ season: null, live: [], async: [] });
    expect(snap.champions.duel).toEqual([]);
  });

  it('war boards: alliances by season score, players by kills, held regions, bosses slain; clans are counted', async () => {
    forgetSeasonCache();
    const ps: { playerId: number }[] = [];
    for (let i = 1; i <= 3; i++) ps.push(await devLogin(8_800_000 + i));
    const season = (await currentSeason(db)).id;
    for (const [i, p] of ps.entries()) {
      const c = await db
        .prepare('INSERT INTO clans (season_id, shard_id, name, tag, created_by, created_at) VALUES (?1, 0, ?2, ?3, ?4, ?5) RETURNING id')
        .bind(season, `Clan Number${i}`, `CN${i}`, p.playerId, NOW)
        .first<{ id: number }>();
      await db.prepare("INSERT INTO clan_members (season_id, player_id, clan_id, role, joined_at) VALUES (?1, ?2, ?3, 'leader', ?4)").bind(season, p.playerId, c!.id, NOW).run();
    }
    const [a, b, c, hidden] = [await named(), await named(), await named(), await named({ optedOut: true })];
    const stat = (pid: number, kills: number, wins: number, honours: number, bosses = 0) =>
      db.prepare('INSERT INTO war_player_stats (season, player_id, kills, fights, wins, honours, bosses) VALUES (1, ?1, ?2, 5, ?3, ?4, ?5)').bind(pid, kills, wins, honours, bosses).run();
    await stat(a.id, 9, 2, 1, 2);
    await stat(b.id, 9, 3, 0, 1);
    await stat(c.id, 4, 1, 2, 1);
    await stat(hidden.id, 99, 9, 9, 9);
    await db.prepare('INSERT INTO war_alliance_members (season, player_id, alliance, joined_at) VALUES (1, ?1, 3, 0)').bind(b.id).run();
    const kill = (id: string, boss: string, alliance: number | null, at: number) =>
      db.prepare('INSERT INTO war_boss_kills (id, season, region, boss, alliance, player_id, at) VALUES (?1, 1, ?2, ?3, ?4, NULL, ?5)').bind(id, 'x', boss, alliance, at).run();
    await kill('k1', 'scylla', 1, 20);
    await kill('k2', 'scylla', 2, 10);
    await kill('k3', 'scylla', 2, 30);
    const snap = await buildPublicSnapshot(env, NOW);
    expect(snap.war.season).toEqual({ id: 1, endsAt: expect.any(Number) });
    expect(snap.totals.clans).toBeGreaterThanOrEqual(3);
    expect(snap.war.alliances.map((r) => r.name).sort()).toEqual(['Dodona', 'Elaia', 'Kyrene', 'Skythia']);
    expect(snap.war.alliances.find((r) => r.name === 'Elaia')!.members).toBeGreaterThanOrEqual(1);
    expect(snap.war.players).toEqual([
      { rank: 1, name: b.name, alliance: 'Elaia', kills: 9, fights: 5, wins: 3, honours: 0 },
      { rank: 2, name: a.name, alliance: null, kills: 9, fights: 5, wins: 2, honours: 1 },
      { rank: 3, name: c.name, alliance: null, kills: 4, fights: 5, wins: 1, honours: 2 },
    ]);
    expect(snap.war.regions).toEqual([]); // a fresh world holds no scoring region
    expect(snap.bossSlayers.map((r) => [r.name, r.kills])).toEqual([[a.name, 2], [b.name, 1], [c.name, 1]]);
    expect(snap.bosses).toEqual([{ name: 'Scylla of the Estuary', region: 'Siren Estuary', kills: 3, first: 'Kyrene', alliances: [0, 1, 2, 0] }]);
    expect(snap.totals.bossesSlain).toBe(3);
  });

  it('champions: eligible players only, newest seasons first', async () => {
    const [a, b] = [await named(), await named()];
    const gone = await named({ deleted: true });
    const reward = (season: number, pid: number, score: number, title: string) =>
      db.prepare('INSERT INTO season_rewards (season_id, player_id, shard_id, rank, score, title, created_at) VALUES (?1, ?2, 1, 1, ?3, ?4, ?5)').bind(season, pid, score, title, NOW).run();
    await reward(901, a.id, 50, 'Basileus');
    await reward(901, b.id, 80, 'Archon'); // the best shard winner of season 901
    await reward(902, gone.id, 90, 'Archon'); // deleted: season 902 is left out
    const snap = await buildPublicSnapshot(env, NOW);
    expect(snap.champions.war).toEqual([{ season: 901, name: b.name, title: 'Archon' }]);
    expect(snap.champions.duel).toEqual([]);
  });
  it('the build writes only public_snapshot and stats_counters (D1 spy)', async () => {
    const build = spyDb();
    await buildPublicSnapshot({ ...env, DB: build.db }, NOW);
    const writes = build.sql.filter((q) => !/^(SELECT|WITH)\b/i.test(q));
    expect(writes.length).toBeGreaterThan(0);
    for (const q of writes) expect(q).toMatch(/^INSERT INTO (public_snapshot|stats_counters) /);
  });

  it('a recursive scan of the snapshot finds no seeded id, Telegram id, Telegram name or email', async () => {
    const snap = await buildPublicSnapshot(env, NOW);
    expect(snap.war.players.length + snap.bossSlayers.length).toBeGreaterThan(0); // the scan sees real rows
    const ids = new Set(seeded.flatMap((p) => [p.id, p.tg]));
    const texts = seeded.flatMap((p) => [p.first, p.user, String(p.tg), String(p.id)]);
    const tgPlayers = (await db.prepare('SELECT id, telegram_id, first_name, username FROM players').all<{ id: number; telegram_id: number; first_name: string | null; username: string | null }>()).results;
    for (const p of tgPlayers) {
      if (p.id > 1000) ids.add(p.id); // small ids would collide with counts and ranks; the seeded ones are large
      ids.add(p.telegram_id);
      if (p.first_name) texts.push(p.first_name);
      if (p.username) texts.push(p.username);
    }
    const BAD_KEYS = /^(id|pid|playerId|player_id|telegram.*|tg.*|username|first_?name|email|clanId|code|rd|vol|lastSeen.*)$/i;
    const walk = (v: unknown, path: string): void => {
      if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
      if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) {
          if (!(k === 'id' && path.endsWith('.season'))) expect(k, path).not.toMatch(BAD_KEYS); // a season's own number is public
          walk(x, `${path}.${k}`);
        }
        return;
      }
      if (typeof v === 'number') expect(ids.has(v), `${path} = ${v}`).toBe(false);
      if (typeof v === 'string') {
        expect(v, path).not.toContain('@');
        for (const t of texts) expect(v.includes(t), `${path} contains "${t}"`).toBe(false);
      }
    };
    walk(snap, 'snap');
    walk(JSON.parse((await stored())!.body), 'body');
  });

  it('the strict schema rejects unknown keys and oversized boards; a full snapshot stays under 32 KB', async () => {
    const snap = await buildPublicSnapshot(env, NOW);
    expect(PublicSummaryV1.safeParse({ ...snap, extra: 1 }).success).toBe(false);
    expect(PublicSummaryV1.safeParse({ ...snap, totals: { ...snap.totals, revenue: 1 } }).success).toBe(false);
    const name = 'N'.repeat(32);
    const duel = (i: number) => ({ rank: i + 1, name, league: 'legend', rating: 9999, games: 9999 });
    const ten = <T>(f: (i: number) => T) => Array.from({ length: 10 }, (_, i) => f(i));
    expect(PublicSummaryV1.safeParse({ ...snap, duels: { ...snap.duels, live: [{ ...duel(0), pid: 7 }] } }).success).toBe(false);
    expect(PublicSummaryV1.safeParse({ ...snap, duels: { ...snap.duels, live: [...ten(duel), duel(0)] } }).success).toBe(false);
    const full = PublicSummaryV1.parse({
      ...snap,
      duels: { season: { id: 1, endsAt: NOW }, live: ten(duel), async: ten(duel) },
      war: {
        season: { id: 1, endsAt: NOW },
        alliances: Array.from({ length: 4 }, (_, i) => ({ rank: i + 1, name: 'A'.repeat(40), score: 1e9, regions: 37, members: 99_999 })),
        players: ten((i) => ({ rank: i + 1, name, alliance: 'A'.repeat(40), kills: 1e9, fights: 1e9, wins: 1e9, honours: 1e9 })),
        regions: ten((i) => ({ rank: i + 1, name: 'R'.repeat(40), alliance: 'A'.repeat(40), rate: 10 })),
      },
      champions: {
        war: Array.from({ length: 5 }, () => ({ season: 999, name, title: name })),
        duel: Array.from({ length: 5 }, () => ({ season: 999, ladder: 'async' as const, name })),
      },
      bossSlayers: ten((i) => ({ rank: i + 1, name, kills: 9999 })),
      bosses: ten(() => ({ name: 'B'.repeat(40), region: 'R'.repeat(40), kills: 9999, first: 'A'.repeat(40), alliances: [9999, 9999, 9999, 9999] })),
    });
    expect(new TextEncoder().encode(JSON.stringify(full)).length).toBeLessThanOrEqual(BODY_MAX_BYTES);
  });
  it('the 5-minute cron builds the snapshot; the daily housekeeping cron does not', async () => {
    const run = async (cron: string, scheduledTime: number) => {
      const ctx = createExecutionContext();
      worker.scheduled(createScheduledController({ cron, scheduledTime }), env, ctx);
      await waitOnExecutionContext(ctx);
    };
    await run('17 3 * * *', NOW + 1);
    expect((await stored())?.generated_at).not.toBe(NOW + 1);
    await run('*/5 * * * *', NOW + 2);
    expect((await stored())?.generated_at).toBe(NOW + 2);
  });
});
