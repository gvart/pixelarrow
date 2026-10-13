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
  const p = await db
    .prepare('SELECT COUNT(*) AS players, SUM(last_seen_at >= ?1) AS active FROM players WHERE banned_at IS NULL')
    .bind(now - 7 * DAY)
    .first<{ players: number; active: number | null }>();
  return {
    players: p?.players ?? 0,
    activePlayers7d: p?.active ?? 0,
    onlineBattles: 0,
    duelsFought: 0,
    warBattles: 0,
    bossesSlain: 0,
    clans: 0,
  };
}
