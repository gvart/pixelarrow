import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { buildPublicSnapshot } from '../src/public/snapshot';
import { PublicSummaryV1 } from '../src/public/schema';

const db = env.DB!;
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const DAY = 86_400_000;

/** Seeded players get large, distinctive ids and Telegram ids, so a scan of the snapshot can find any leak. */
let seq = 0;
async function seedPlayer(o: { banned?: boolean; lastSeen?: number } = {}): Promise<{ id: number; tg: number; first: string; user: string }> {
  seq++;
  const id = 9_100_000 + seq;
  const tg = 7_700_000_000 + seq;
  const first = `Firstname${seq}x`;
  const user = `user_${seq}_tg`;
  await db
    .prepare('INSERT INTO players (id, telegram_id, username, first_name, created_at, last_seen_at, banned_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
    .bind(id, tg, user, first, NOW - 30 * DAY, o.lastSeen ?? NOW - DAY, o.banned ? NOW - DAY : null)
    .run();
  return { id, tg, first, user };
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
});
