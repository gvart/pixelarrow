/**
 * The public stats snapshot (ADR-0010 §2), built by the 5-minute cron.
 *
 * Read-only against game tables: it writes only `public_snapshot` and
 * `stats_counters`. The request path (V6-STATS-02) serves the stored body
 * as is, so nothing here ever runs per request.
 */
import type { Env } from '../env';
import { seasonEnd, seasonId } from '../../../src/duel/season';
import { BOARD_MAX, BOARD_MIN, BODY_MAX_BYTES, CHAMPIONS_MAX, PublicSummaryV1 } from './schema';
import { ELIGIBLE, publicDuelTop } from './duelTop';
import { validateClanName } from '../names/validate';

const DAY = 86_400_000;


interface SnapshotOptions {
  /**
   * May this clan name be public? By default ADR-0009's shared validator
   * (names/validate.ts): a clan whose name fails it stays off the clan board
   * and war rows show `clan: null`.
   */
  clanName?: (name: string) => boolean;
}

/** Builds, validates and stores the snapshot; returns what it stored. */
export async function buildPublicSnapshot(env: Env, now: number, opts: SnapshotOptions = {}): Promise<PublicSummaryV1> {
  const db = env.DB;
  if (!db) throw new Error('public snapshot: no DB binding');
  const clanOk = opts.clanName ?? ((name: string) => validateClanName(name).ok);
  const duelSeason = seasonId(now);
  const warSeason = await db.prepare("SELECT id, ends_at FROM online_seasons WHERE status = 'active' ORDER BY id DESC LIMIT 1").first<{ id: number; ends_at: number }>();
  const snap: PublicSummaryV1 = {
    v: 1,
    generatedAt: now,
    totals: await totals(db, now, warSeason?.id ?? null),
    duels: {
      season: { id: duelSeason, endsAt: seasonEnd(duelSeason) },
      live: board(await publicDuelTop(db, 'live', duelSeason, BOARD_MAX)),
      async: board(await publicDuelTop(db, 'async', duelSeason, BOARD_MAX)),
    },
    war: {
      season: warSeason ? { id: warSeason.id, endsAt: warSeason.ends_at } : null,
      ...(warSeason ? await warBoards(db, warSeason.id, clanOk) : { players: [], clans: [] }),
    },
    champions: await champions(db, duelSeason),
    bossSlayers: board(await bossSlayers(db)),
  };
  const body = JSON.stringify(PublicSummaryV1.parse(snap));
  if (new TextEncoder().encode(body).length > BODY_MAX_BYTES) throw new Error('public snapshot: body over 32 KB');
  await db
    .prepare('INSERT INTO public_snapshot (id, body, generated_at) VALUES (1, ?1, ?2) ON CONFLICT (id) DO UPDATE SET body = excluded.body, generated_at = excluded.generated_at')
    .bind(body, now)
    .run();
  return snap;
}

/** Fewer than BOARD_MIN eligible rows: no board (it would single people out). */
function board<T>(rows: T[]): T[] {
  return rows.length < BOARD_MIN ? [] : rows.slice(0, BOARD_MAX);
}

async function totals(db: D1Database, now: number, warSeason: number | null): Promise<PublicSummaryV1['totals']> {
  const war = await advanceCounter(db, COUNTERS.war, now);
  const duels = (await advanceCounter(db, COUNTERS.duelMatches, now)) + (await advanceCounter(db, COUNTERS.duelAttacks, now));
  const p = await db
    .prepare(`SELECT COUNT(*) AS players, SUM(last_seen_at >= ?1) AS active FROM players WHERE banned_at IS NULL AND deleted_at IS NULL`)
    .bind(now - 7 * DAY)
    .first<{ players: number; active: number | null }>();
  return {
    players: p?.players ?? 0,
    activePlayers7d: p?.active ?? 0,
    onlineBattles: war + duels,
    duelsFought: duels,
    warBattles: war,
    bossesSlain: 0, // the world bosses went with the route-graph war (W-01)
    clans: warSeason === null ? 0 : ((await db.prepare('SELECT COUNT(DISTINCT clan_id) AS n FROM clan_members WHERE season_id = ?1').bind(warSeason).first<{ n: number }>())?.n ?? 0),
  };
}

/**
 * War boards of the running season: empty since the old region standings went
 * with the route-graph war (W-01); the war world's season score (src/war/world/season.ts)
 * is not on the public board yet.
 */
async function warBoards(_db: D1Database, _season: number, _clanOk: (name: string) => boolean): Promise<Pick<PublicSummaryV1['war'], 'players' | 'clans'>> {
  return { players: [], clans: [] };
}

/**
 * Past champions, newest first: the best eligible shard winner of each ended
 * war season, and the highest peak of each past duel season and ladder. A
 * season with no eligible champion is left out.
 */
async function champions(db: D1Database, duelSeason: number): Promise<PublicSummaryV1['champions']> {
  const war = await db
    .prepare(
      `SELECT season, name, title FROM (
         SELECT r.season_id AS season, p.display_name AS name, r.title,
                ROW_NUMBER() OVER (PARTITION BY r.season_id ORDER BY r.score DESC, r.player_id) AS k
         FROM season_rewards r JOIN players p ON p.id = r.player_id
         WHERE r.rank = 1 AND ${ELIGIBLE})
       WHERE k = 1 ORDER BY season DESC LIMIT ?1`,
    )
    .bind(CHAMPIONS_MAX)
    .all<{ season: number; name: string; title: string }>();
  const duel = await db
    .prepare(
      `SELECT season, ladder, name FROM (
         SELECT r.season, r.ladder, p.display_name AS name,
                ROW_NUMBER() OVER (PARTITION BY r.season, r.ladder ORDER BY r.peak DESC, r.player_id) AS k
         FROM duel_season_rewards r JOIN players p ON p.id = r.player_id
         WHERE r.season < ?1 AND r.ladder IN ('live', 'async') AND ${ELIGIBLE})
       WHERE k = 1 ORDER BY season DESC, ladder DESC LIMIT ?2`,
    )
    .bind(duelSeason, CHAMPIONS_MAX)
    .all<{ season: number; ladder: 'live' | 'async'; name: string }>();
  return { war: war.results, duel: duel.results };
}

/** Who struck the last blow on the most world bosses: none since the world bosses went with the route-graph war (W-01). */
async function bossSlayers(_db: D1Database): Promise<PublicSummaryV1['bossSlayers']> {
  return [];
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
