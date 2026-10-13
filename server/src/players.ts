export interface PlayerRow {
  id: number;
  /** Mirror of the telegram identity (server/src/auth/identity.ts); null for email-only players. */
  telegram_id: number | null;
  username: string | null;
  first_name: string | null;
  language_code: string | null;
  is_premium: number;
  /** The public name (ADR-0009). */
  display_name: string;
  display_name_key: string;
  created_at: number;
  last_seen_at: number;
  /** Migration 0006: admin ban and the analytics opt-out. */
  banned_at?: number | null;
  ban_reason?: string | null;
  analytics_opt_out?: number;
  deleted_at?: number | null;
}

export async function getPlayer(db: D1Database, id: number): Promise<PlayerRow | null> {
  return db.prepare('SELECT * FROM players WHERE id = ?1').bind(id).first<PlayerRow>();
}

/** By the telegram_id mirror: for the bot and payments, never for log-in (N-ID-2). */
export async function getPlayerByTelegramId(db: D1Database, telegramId: number): Promise<PlayerRow | null> {
  return db.prepare('SELECT * FROM players WHERE telegram_id = ?1').bind(telegramId).first<PlayerRow>();
}

export function publicPlayer(p: PlayerRow) {
  return {
    id: p.id,
    displayName: p.display_name,
    telegramId: p.telegram_id,
    username: p.username,
    firstName: p.first_name,
    languageCode: p.language_code,
    isPremium: p.is_premium === 1,
    createdAt: p.created_at,
    lastSeenAt: p.last_seen_at,
  };
}
