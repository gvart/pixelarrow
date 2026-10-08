import type { TelegramUser } from './telegramAuth';

export interface PlayerRow {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  language_code: string | null;
  is_premium: number;
  created_at: number;
  last_seen_at: number;
  /** Migration 0006: admin ban and the analytics opt-out. */
  banned_at?: number | null;
  ban_reason?: string | null;
  analytics_opt_out?: number;
}

const clip = (s: unknown, n: number): string | null => (typeof s === 'string' && s.length > 0 ? s.slice(0, n) : null);

/** Creates the player on first sight, refreshes profile and last-seen otherwise. */
export async function upsertPlayer(db: D1Database, user: TelegramUser, now = Date.now()): Promise<PlayerRow> {
  const row = await db
    .prepare(
      `INSERT INTO players (telegram_id, username, first_name, language_code, is_premium, created_at, last_seen_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
       ON CONFLICT (telegram_id) DO UPDATE SET
         username = excluded.username,
         first_name = excluded.first_name,
         language_code = excluded.language_code,
         is_premium = excluded.is_premium,
         last_seen_at = excluded.last_seen_at
       RETURNING *`,
    )
    .bind(user.id, clip(user.username, 64), clip(user.first_name, 128), clip(user.language_code, 16), user.is_premium ? 1 : 0, now)
    .first<PlayerRow>();
  if (!row) throw new Error('player upsert returned no row');
  return row;
}

export async function getPlayer(db: D1Database, id: number): Promise<PlayerRow | null> {
  return db.prepare('SELECT * FROM players WHERE id = ?1').bind(id).first<PlayerRow>();
}

export async function getPlayerByTelegramId(db: D1Database, telegramId: number): Promise<PlayerRow | null> {
  return db.prepare('SELECT * FROM players WHERE telegram_id = ?1').bind(telegramId).first<PlayerRow>();
}

export function publicPlayer(p: PlayerRow) {
  return {
    id: p.id,
    telegramId: p.telegram_id,
    username: p.username,
    firstName: p.first_name,
    languageCode: p.language_code,
    isPremium: p.is_premium === 1,
    createdAt: p.created_at,
    lastSeenAt: p.last_seen_at,
  };
}

export function displayName(p: { username?: string | null; first_name?: string | null; telegram_id?: number; id?: number }): string {
  return (p.first_name || p.username || `Player ${p.telegram_id ?? p.id ?? ''}`).slice(0, 64);
}
