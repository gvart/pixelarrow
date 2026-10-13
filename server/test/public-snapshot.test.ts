import { createExecutionContext, createScheduledController, env, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { buildPublicSnapshot } from '../src/public/snapshot';
import { BODY_MAX_BYTES, PublicSummaryV1 } from '../src/public/schema';
import { publicDuelTop, publicNamesReady } from '../src/public/duelTop';
import { seasonId } from '../../src/duel/season';
import { RANKED } from '../../src/duel/rating';
import { standings } from '../src/online/store';
import { fresh, join, type Player } from './onlineHelpers';
import { mockTelegram } from './helpers';
import worker from '../src/index';

const db = env.DB!;
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const DAY = 86_400_000;

/** Seeded players get large, distinctive ids and Telegram ids, so a scan of the snapshot can find any leak. */
let seq = 0;
async function seedPlayer(o: { banned?: boolean; lastSeen?: number } = {}): Promise<{ id: number; tg: number; first: string; user: string }> {
  seq++;
  const max = (await db.prepare('SELECT MAX(id) AS m FROM players').first<{ m: number | null }>())?.m ?? 0;
  const id = Math.max(9_100_000, max) + 7;
  const tg = 7_700_000_000 + seq;
  const first = `Firstname${seq}x`;
  const user = `user_${seq}_tg`;
  await db
    .prepare('INSERT INTO players (id, telegram_id, username, first_name, created_at, last_seen_at, banned_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
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

let rowSeq = 0;
async function warBattle(): Promise<void> {
  await db
    .prepare("INSERT INTO battle_log (season_id, shard_id, kind, winner, ticks, verified, created_at) VALUES (1, 1, 'attack', 0, 100, 1, ?1)")
    .bind(NOW)
    .run();
}
async function duelMatch(a: number, b: number, status: 'live' | 'done' | 'void', createdAt = NOW - 3_600_000): Promise<string> {
  const id = `m${++rowSeq}`;
  await db
    .prepare("INSERT INTO duel_matches (id, mode, seed, player_a, player_b, setup, teams, status, created_at) VALUES (?1, 'ranked', 1, ?2, ?3, '{}', '[]', ?4, ?5)")
    .bind(id, a, b, status, createdAt)
    .run();
  return id;
}
async function duelAttack(a: number, d: number, status: 'open' | 'used' | 'rejected' | 'abandoned', createdAt = NOW - 3_600_000): Promise<string> {
  const id = `a${++rowSeq}`;
  await db
    .prepare("INSERT INTO duel_attacks (id, attacker, defender, day, seed, setup, team, defence, status, created_at, expires_at) VALUES (?1, ?2, ?3, 1, 1, '{}', '[]', '[]', ?4, ?5, ?6)")
    .bind(id, a, d, status, createdAt, createdAt + 3_600_000)
    .run();
  return id;
}

const DUEL_SEASON = seasonId(NOW);
const LEGEND = RANKED.leagues[RANKED.leagues.length - 1].min;

async function rate(pid: number, ladder: 'live' | 'async', rating: number, games: number = RANKED.placements, season = DUEL_SEASON): Promise<void> {
  await db
    .prepare('INSERT INTO duel_ratings (player_id, ladder, rating, games, season, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(pid, ladder, rating, games, season, NOW)
    .run();
}

/**
 * The ADR-0009 public-name columns, as V6-ACCT-02 / V6-LINK-01 will add them
 * (added here only while those migrations have not landed).
 */
async function ensureNameColumns(): Promise<void> {
  const cols = new Set((await db.prepare("SELECT name FROM pragma_table_info('players')").all<{ name: string }>()).results.map((r) => r.name));
  const add: [string, string][] = [
    ['display_name', 'TEXT'],
    ['public_boards', 'INTEGER NOT NULL DEFAULT 1'],
    ['deleted_at', 'INTEGER'],
  ];
  for (const [c, type] of add) if (!cols.has(c)) await db.prepare(`ALTER TABLE players ADD COLUMN ${c} ${type}`).run();
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
  it('counts online battles incrementally, finished duels only, and never goes down across a prune', async () => {
    const [a, b] = [await seedPlayer(), await seedPlayer()];
    const base = (await buildPublicSnapshot(env, NOW)).totals;
    await warBattle();
    await warBattle();
    await duelMatch(a.id, b.id, 'done');
    await duelMatch(a.id, b.id, 'void');
    const live = await duelMatch(a.id, b.id, 'live');
    await duelAttack(a.id, b.id, 'used');
    await duelAttack(a.id, b.id, 'rejected');
    const open = await duelAttack(a.id, b.id, 'open');
    let t = (await buildPublicSnapshot(env, NOW)).totals;
    expect(t.warBattles - base.warBattles).toBe(2);
    expect(t.duelsFought - base.duelsFought).toBe(2);
    expect(t.onlineBattles - base.onlineBattles).toBe(4);
    // The live match and the open attack finish after the run: still counted once.
    await db.prepare("UPDATE duel_matches SET status = 'done' WHERE id = ?1").bind(live).run();
    await db.prepare("UPDATE duel_attacks SET status = 'used' WHERE id = ?1").bind(open).run();
    t = (await buildPublicSnapshot(env, NOW)).totals;
    expect(t.duelsFought - base.duelsFought).toBe(4);
    // A prune of every source row lowers no total; new rows keep counting.
    await db.batch([db.prepare('DELETE FROM battle_log'), db.prepare('DELETE FROM duel_attacks')]);
    await warBattle();
    t = (await buildPublicSnapshot(env, NOW)).totals;
    expect(t.warBattles - base.warBattles).toBe(3);
    expect(t.duelsFought - base.duelsFought).toBe(4);
    expect(t.onlineBattles - base.onlineBattles).toBe(7);
    // A run with nothing new adds nothing.
    expect((await buildPublicSnapshot(env, NOW)).totals).toEqual(t);
    // duel_attacks has no AUTOINCREMENT: emptied, it reuses rowids below the high water. They still count.
    await duelAttack(a.id, b.id, 'used');
    t = (await buildPublicSnapshot(env, NOW)).totals;
    expect(t.duelsFought - base.duelsFought).toBe(5);
  });

  it('stops waiting for a duel stuck unfinished for over a day', async () => {
    const [a, b] = [await seedPlayer(), await seedPlayer()];
    const base = (await buildPublicSnapshot(env, NOW)).totals;
    await duelMatch(a.id, b.id, 'live', NOW - 2 * DAY);
    await duelMatch(a.id, b.id, 'done');
    expect((await buildPublicSnapshot(env, NOW)).totals.duelsFought - base.duelsFought).toBe(1);
  });
  it('serves no board before the display-name columns exist, whatever the data (ADR-0010 ordering note)', async () => {
    if ((await publicNamesReady(db)).ready) return; // V6-LINK-01 has landed: nothing to check
    for (let i = 0; i < 4; i++) await rate((await seedPlayer()).id, 'live', 1600 + i);
    const snap = await buildPublicSnapshot(env, NOW);
    expect(snap.duels.live).toEqual([]);
    expect(snap.duels.season).toEqual({ id: DUEL_SEASON, endsAt: expect.any(Number) });
  });

  it('duel boards: placed, eligible players by rating; banned, deleted and opted-out players absent but counted', async () => {
    await ensureNameColumns();
    const before = (await buildPublicSnapshot(env, NOW)).totals.players;
    const top = await named();
    const second = await named();
    const third = await named();
    const banned = await named({ banned: true });
    const deleted = await named({ deleted: true });
    const optedOut = await named({ optedOut: true });
    const unplaced = await named();
    await rate(top.id, 'live', LEGEND + 40.6);
    await rate(banned.id, 'live', LEGEND + 500);
    await rate(deleted.id, 'live', LEGEND + 400);
    await rate(optedOut.id, 'live', LEGEND + 300);
    await rate(unplaced.id, 'live', LEGEND + 200, RANKED.placements - 1);
    await rate(second.id, 'live', 1500);
    await rate(third.id, 'live', 1400);
    await rate(third.id, 'async', 1700, RANKED.placements, DUEL_SEASON - 1); // a past season
    const snap = await buildPublicSnapshot(env, NOW);
    expect(snap.duels.live.slice(0, 3)).toEqual([
      { rank: 1, name: top.name, league: 'legend', rating: Math.round(LEGEND + 40.6), games: RANKED.placements },
      { rank: 2, name: second.name, league: expect.not.stringMatching(/^legend$/), rating: null, games: RANKED.placements },
      { rank: 3, name: third.name, league: expect.any(String), rating: null, games: RANKED.placements },
    ]);
    const names = snap.duels.live.map((r) => r.name);
    for (const p of [banned, deleted, optedOut, unplaced]) expect(names).not.toContain(p.name);
    expect(snap.duels.async).toEqual([]);
    // Totals: the opted-out and unplaced players count; banned and deleted ones do not.
    expect(snap.totals.players - before).toBe(5);
  });

  it('a board with fewer than 3 eligible rows is empty', async () => {
    await ensureNameColumns();
    await rate((await named()).id, 'async', 1500);
    await rate((await named()).id, 'async', 1450);
    await rate((await named({ optedOut: true })).id, 'async', 1400);
    expect((await buildPublicSnapshot(env, NOW)).duels.async).toEqual([]);
    await rate((await named()).id, 'async', 1300);
    expect((await buildPublicSnapshot(env, NOW)).duels.async).toHaveLength(3);
  });
  it('war boards: eligible players by held-region score; clans only once their names pass the validator', async () => {
    await ensureNameColumns();
    fresh();
    const ps: Player[] = [];
    for (let i = 1; i <= 5; i++) ps.push(await join(8_800_000 + i));
    const season = ps[0].profile.season.id;
    for (const [i, p] of ps.entries()) await db.prepare('UPDATE players SET display_name = ?2, public_boards = ?3 WHERE id = ?1').bind(p.playerId, `Warrior${i}`, i === 4 ? 0 : 1).run();
    const clan = async (name: string, members: typeof ps) => {
      const c = await db
        .prepare('INSERT INTO clans (season_id, shard_id, name, tag, created_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) RETURNING id')
        .bind(season, members[0].profile.shard.id, name, name.slice(0, 3).toUpperCase(), members[0].playerId, NOW)
        .first<{ id: number }>();
      for (const m of members) await db.prepare("INSERT INTO clan_members (season_id, player_id, clan_id, role, joined_at) VALUES (?1, ?2, ?3, 'member', ?4)").bind(season, m.playerId, c!.id, NOW).run();
    };
    await clan('Iron Wolves', [ps[0], ps[1]]);
    await clan('Sea Hawks', [ps[2]]);
    await clan('Bronze Oaks', [ps[4]]);
    await clan('Stone Owls', [ps[3]]);
    const st = (await standings(db, season)).filter((s) => ps.some((p) => p.playerId === s.playerId));
    expect(st.every((s) => s.score > 0)).toBe(true);

    // Default: no clan name is public before the shared validator (V6-LINK-01).
    let snap = await buildPublicSnapshot(env, NOW);
    expect(snap.war.season).toEqual({ id: season, endsAt: expect.any(Number) });
    expect(snap.totals.clans).toBeGreaterThanOrEqual(3);
    expect(snap.war.clans).toEqual([]);
    expect(snap.war.players.every((r) => r.clan === null)).toBe(true);
    const names = snap.war.players.map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(['Warrior0', 'Warrior1', 'Warrior2', 'Warrior3']));
    expect(names).not.toContain('Warrior4'); // opted out
    expect(snap.war.players.map((r) => r.rank)).toEqual(snap.war.players.map((_, i) => i + 1));

    // With a validator: names that pass are public, the rest are not.
    snap = await buildPublicSnapshot(env, NOW, { clanName: (n) => n !== 'Sea Hawks' });
    const wolves = snap.war.clans.find((c) => c.name === 'Iron Wolves');
    expect(wolves?.members).toBe(2);
    expect(snap.war.clans.map((c) => c.name)).not.toContain('Sea Hawks');
    expect(snap.war.players.find((r) => r.name === 'Warrior0')?.clan).toBe('Iron Wolves');
    expect(snap.war.players.find((r) => r.name === 'Warrior2')?.clan).toBeNull();
  });

  it('champions and boss slayers: eligible players only, newest seasons first', async () => {
    await ensureNameColumns();
    const [a, b, c] = [await named(), await named(), await named()];
    const gone = await named({ deleted: true });
    const reward = (season: number, pid: number, score: number, title: string) =>
      db.prepare('INSERT INTO season_rewards (season_id, player_id, shard_id, rank, score, title, created_at) VALUES (?1, ?2, 1, 1, ?3, ?4, ?5)').bind(season, pid, score, title, NOW).run();
    await reward(901, a.id, 50, 'Basileus');
    await reward(901, b.id, 80, 'Archon'); // the best shard winner of season 901
    await reward(902, gone.id, 90, 'Archon'); // deleted: season 902 is left out
    const duelReward = (season: number, ladder: string, pid: number, peak: number) =>
      db
        .prepare("INSERT INTO duel_season_rewards (player_id, season, ladder, league, peak, glory, cosmetic, created_at) VALUES (?1, ?2, ?3, 'gold', ?4, 0, 'x', ?5)")
        .bind(pid, season, ladder, peak, NOW)
        .run();
    await duelReward(DUEL_SEASON - 1, 'live', a.id, 1800);
    await duelReward(DUEL_SEASON - 1, 'live', c.id, 1900);
    await duelReward(DUEL_SEASON - 1, 'async', b.id, 1700);
    await duelReward(DUEL_SEASON, 'live', b.id, 2500); // the running season: not a champion yet
    const kill = (boss: string, pid: number, at: number) =>
      db
        .prepare("INSERT INTO world_bosses (season_id, shard_id, boss, loc, level, hp, max_hp, parts, status, killed_at, killed_by, created_at) VALUES (77, ?1, ?2, 1, 1, 0, 10, '[]', 'dead', ?3, ?4, ?3)")
        .bind(at, boss, at, pid)
        .run();
    await kill('kraken', a.id, 1);
    await kill('titan', a.id, 2);
    await kill('kraken', b.id, 3);
    await kill('titan', b.id, 4);
    await kill('kraken', c.id, 5);
    await kill('titan', gone.id, 6);
    const snap = await buildPublicSnapshot(env, NOW);
    expect(snap.champions.war).toEqual([{ season: 901, name: b.name, title: 'Archon' }]);
    expect(snap.champions.duel).toEqual([
      { season: DUEL_SEASON - 1, ladder: 'live', name: c.name },
      { season: DUEL_SEASON - 1, ladder: 'async', name: b.name },
    ]);
    expect(snap.bossSlayers).toEqual([
      { rank: 1, name: a.name, kills: 2 },
      { rank: 2, name: b.name, kills: 2 },
      { rank: 3, name: c.name, kills: 1 },
    ]);
    expect(snap.totals.bossesSlain).toBeGreaterThanOrEqual(6);
  });
  it('publicDuelTop performs no writes, and the build writes only public_snapshot and stats_counters (D1 spy)', async () => {
    await ensureNameColumns();
    const top = spyDb();
    await publicDuelTop(top.db, 'live', DUEL_SEASON, 10);
    expect(top.sql.length).toBeGreaterThan(0);
    for (const q of top.sql) expect(q).toMatch(/^SELECT\b/i);

    const build = spyDb();
    await buildPublicSnapshot({ ...env, DB: build.db }, NOW);
    const writes = build.sql.filter((q) => !/^(SELECT|WITH)\b/i.test(q));
    expect(writes.length).toBeGreaterThan(0);
    for (const q of writes) expect(q).toMatch(/^INSERT INTO (public_snapshot|stats_counters) /);
  });

  it('a recursive scan of the snapshot finds no seeded id, Telegram id, Telegram name or email', async () => {
    await ensureNameColumns();
    const snap = await buildPublicSnapshot(env, NOW, { clanName: () => true });
    expect(snap.duels.live.length + snap.war.players.length + snap.bossSlayers.length).toBeGreaterThan(0); // the scan sees real rows
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
      war: { season: { id: 1, endsAt: NOW }, players: ten((i) => ({ rank: i + 1, name, clan: name, score: 1e9 })), clans: ten((i) => ({ rank: i + 1, name, score: 1e9, members: 999 })) },
      champions: {
        war: Array.from({ length: 5 }, () => ({ season: 999, name, title: name })),
        duel: Array.from({ length: 5 }, () => ({ season: 999, ladder: 'async' as const, name })),
      },
      bossSlayers: ten((i) => ({ rank: i + 1, name, kills: 9999 })),
    });
    expect(new TextEncoder().encode(JSON.stringify(full)).length).toBeLessThanOrEqual(BODY_MAX_BYTES);
  });
  it('the 5-minute cron builds the snapshot; the daily housekeeping cron does not', async () => {
    mockTelegram({ getMe: { username: 'pixelarrow_bot' } });
    const run = async (cron: string, scheduledTime: number) => {
      const ctx = createExecutionContext();
      worker.scheduled(createScheduledController({ cron, scheduledTime }), env, ctx);
      await waitOnExecutionContext(ctx);
    };
    await run('17 3 * * *', NOW + 1);
    expect((await stored())?.generated_at).not.toBe(NOW + 1);
    await run('*/5 * * * *', NOW + 2);
    expect((await stored())?.generated_at).toBe(NOW + 2);
    vi.restoreAllMocks();
  });
});
