/**
 * D1 access the war shares with the rest of the server: seasons (lifecycle),
 * clan membership, public names and random tokens. Moved out of the old
 * online store when the campaign and duels were removed.
 */
import { bytesToHex } from '../crypto';

/** A season's length (the old ONLINE_RULES.seasonDays). */
const SEASON_DAYS = 90;

export function randomToken(bytes = 16): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return bytesToHex(a);
}

// ------------------------------------------------------------------ seasons

export interface Season {
  id: number;
  startedAt: number;
  endsAt: number;
}

interface SeasonRow {
  id: number;
  started_at: number;
  ends_at: number;
  status: string;
}

let seasonCache: { season: Season; at: number; db: D1Database } | null = null;
const SEASON_MS = () => SEASON_DAYS * 24 * 3_600_000;

/**
 * The active season. Starts season 1 on first use; when the active season's
 * time is up, ends it and starts the
 * next one. Every step is idempotent, so racing requests agree.
 */
export async function currentSeason(db: D1Database, now = Date.now()): Promise<Season> {
  if (seasonCache && seasonCache.db === db && now - seasonCache.at < 30_000 && seasonCache.season.endsAt > now) return seasonCache.season;
  let row = await db.prepare("SELECT * FROM online_seasons WHERE status = 'active' ORDER BY id DESC LIMIT 1").first<SeasonRow>();
  if (!row) {
    const last = await db.prepare('SELECT MAX(id) AS id FROM online_seasons').first<{ id: number | null }>();
    const id = (last?.id ?? 0) + 1;
    await db.prepare('INSERT OR IGNORE INTO online_seasons (id, started_at, ends_at) VALUES (?1, ?2, ?3)').bind(id, now, now + SEASON_MS()).run();
    row = await db.prepare('SELECT * FROM online_seasons WHERE id = ?1').bind(id).first<SeasonRow>();
    if (!row) throw new Error('season bootstrap failed');
  }
  if (row.ends_at <= now && row.status === 'active') {
    await endSeason(db, row.id, now);
    seasonCache = null;
    return currentSeason(db, now);
  }
  const season = { id: row.id, startedAt: row.started_at, endsAt: row.ends_at };
  seasonCache = { season, at: now, db };
  return season;
}

export function forgetSeasonCache(): void {
  seasonCache = null;
}

/**
 * Ends a season: status 'ended'. Everything of the season is simply left
 * behind: the next season starts with new ids. Idempotent.
 */
export async function endSeason(db: D1Database, season: number, now = Date.now()): Promise<void> {
  await db.prepare("UPDATE online_seasons SET status = 'ended', ended_at = ?2 WHERE id = ?1 AND status = 'active'").bind(season, now).run();
}

// ------------------------------------------------------------------ clans & names

export interface Membership {
  clanId: number;
  role: 'leader' | 'officer' | 'member';
}

export async function membership(db: D1Database, season: number, pid: number): Promise<Membership | null> {
  const r = await db
    .prepare('SELECT clan_id, role FROM clan_members WHERE season_id = ?1 AND player_id = ?2')
    .bind(season, pid)
    .first<{ clan_id: number; role: Membership['role'] }>();
  return r ? { clanId: r.clan_id, role: r.role } : null;
}

/** Public names by player id: display_name only, never Telegram data (ADR-0009 §6, N-DN-1). */
export async function playerNames(db: D1Database, ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const uniq = [...new Set(ids.filter((x) => Number.isSafeInteger(x)))];
  for (let i = 0; i < uniq.length; i += 90) {
    const part = uniq.slice(i, i + 90);
    const r = await db
      .prepare(`SELECT id, display_name FROM players WHERE id IN (${part.map((_, j) => `?${j + 1}`).join(',')})`)
      .bind(...part)
      .all<{ id: number; display_name: string }>();
    for (const p of r.results) out.set(p.id, p.display_name);
  }
  return out;
}
