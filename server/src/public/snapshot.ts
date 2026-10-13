/**
 * The public stats snapshot (ADR-0010 §2), built by the 5-minute cron.
 *
 * Read-only against game tables: it writes only `public_snapshot` and
 * `stats_counters`. The request path (V6-STATS-02) serves the stored body
 * as is, so nothing here ever runs per request.
 */
import type { Env } from '../env';
import { BODY_MAX_BYTES, PublicSummaryV1 } from './schema';

const DAY = 86_400_000;

export type { PublicSummaryV1 } from './schema';

/** Builds, validates and stores the snapshot; returns what it stored. */
export async function buildPublicSnapshot(env: Env, now: number): Promise<PublicSummaryV1> {
  const db = env.DB;
  if (!db) throw new Error('public snapshot: no DB binding');
  const snap: PublicSummaryV1 = {
    v: 1,
    generatedAt: now,
    totals: await totals(db, now),
    duels: { season: null, live: [], async: [] },
    war: { season: null, players: [], clans: [] },
    champions: { war: [], duel: [] },
    bossSlayers: [],
  };
  const body = JSON.stringify(PublicSummaryV1.parse(snap));
  if (new TextEncoder().encode(body).length > BODY_MAX_BYTES) throw new Error('public snapshot: body over 32 KB');
  await db
    .prepare('INSERT INTO public_snapshot (id, body, generated_at) VALUES (1, ?1, ?2) ON CONFLICT (id) DO UPDATE SET body = excluded.body, generated_at = excluded.generated_at')
    .bind(body, now)
    .run();
  return snap;
}

async function totals(db: D1Database, now: number): Promise<PublicSummaryV1['totals']> {
  const war = await advanceCounter(db, COUNTERS.war, now);
  const duels = (await advanceCounter(db, COUNTERS.duelMatches, now)) + (await advanceCounter(db, COUNTERS.duelAttacks, now));
  const p = await db
    .prepare('SELECT COUNT(*) AS players, SUM(last_seen_at >= ?1) AS active FROM players WHERE banned_at IS NULL')
    .bind(now - 7 * DAY)
    .first<{ players: number; active: number | null }>();
  return {
    players: p?.players ?? 0,
    activePlayers7d: p?.active ?? 0,
    onlineBattles: war + duels,
    duelsFought: duels,
    warBattles: war,
    bossesSlain: 0,
    clans: 0,
  };
}

/**
 * An incremental battle counter over a source table: each run counts the
 * finished rows past `high_water` and moves it on, so a total only grows and
 * a prune of old rows never lowers it. A row still in play (a live match, an
 * open attack) holds the high water just below it until it finishes, for at
 * most PENDING_MAX_MS; after that it is passed over as never fought.
 */
interface Counter {
  name: string;
  table: string;
  /** SQL condition: the row is a battle that was fought. */
  counted: string;
  /** SQL condition: the row may still become one. */
  pending: string | null;
}

const COUNTERS = {
  war: { name: 'war_battles', table: 'battle_log', counted: '1', pending: null },
  duelMatches: { name: 'duel_matches', table: 'duel_matches', counted: "status = 'done'", pending: "status = 'live'" },
  duelAttacks: { name: 'duel_attacks', table: 'duel_attacks', counted: "status = 'used'", pending: "status = 'open'" },
} satisfies Record<string, Counter>;

const PENDING_MAX_MS = DAY;

/** Advances one counter and returns its total. */
async function advanceCounter(db: D1Database, c: Counter, now: number): Promise<number> {
  const row = await db.prepare('SELECT value, high_water FROM stats_counters WHERE name = ?1').bind(c.name).first<{ value: number; high_water: number }>();
  const value = row?.value ?? 0;
  const stored = row?.high_water ?? 0;
  const top = (await db.prepare(`SELECT MAX(rowid) AS top FROM ${c.table}`).first<{ top: number | null }>())?.top ?? 0;
  // Rowids below the high water come back only when the newest rows were
  // deleted (tables without AUTOINCREMENT reuse them): a prune of the oldest
  // rows that emptied the table. Every row left is then new.
  const from = top < stored ? 0 : stored;
  let upTo = top;
  if (c.pending) {
    const wait = await db
      .prepare(`SELECT MIN(rowid) AS r FROM ${c.table} WHERE rowid > ?1 AND ${c.pending} AND created_at > ?2`)
      .bind(from, now - PENDING_MAX_MS)
      .first<{ r: number | null }>();
    if (wait?.r != null) upTo = wait.r - 1;
  }
  if (upTo <= from) return value;
  const n = (await db.prepare(`SELECT COUNT(*) AS n FROM ${c.table} WHERE rowid > ?1 AND rowid <= ?2 AND ${c.counted}`).bind(from, upTo).first<{ n: number }>())?.n ?? 0;
  // Compare-and-set on the stored high water: an overlapping run adds nothing twice.
  const res = await db
    .prepare(
      `INSERT INTO stats_counters (name, value, high_water) VALUES (?1, ?2, ?3)
       ON CONFLICT (name) DO UPDATE SET value = value + ?2, high_water = ?3 WHERE high_water = ?4`,
    )
    .bind(c.name, n, upTo, stored)
    .run();
  return res.meta.changes > 0 ? value + n : value;
}
