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
  /** Migration 0018 (ADR-0009 §6). */
  public_boards: number;
  name_changed_at: number | null;
  name_locked_until: number | null;
}

const DAY = 86_400_000;
/** At most one rename by the player per 30 days, after the free first one. */
export const RENAME_COOLDOWN_MS = 30 * DAY;
/** A name freed by a rename or a deletion stays taken this long. */
export const NAME_HOLD_MS = 30 * DAY;
/** An admin rename locks the player's renames this long. */
export const ADMIN_NAME_LOCK_MS = 7 * DAY;

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

/** True while another player freed this key less than NAME_HOLD_MS ago. */
export async function nameKeyHeld(db: D1Database, key: string, pid: number, now: number): Promise<boolean> {
  return !!(await db
    .prepare('SELECT 1 FROM display_name_history WHERE old_key = ?1 AND player_id != ?2 AND changed_at > ?3 LIMIT 1')
    .bind(key, pid, now - NAME_HOLD_MS)
    .first());
}

/**
 * Sets a player's display name and logs it in display_name_history, in one
 * batch. A player's own rename (`byAdmin` false) applies only while the
 * cooldown and the lock allow it and starts the cooldown; an admin rename sets
 * the lock instead. Returns false when the guard refused it; throws a UNIQUE
 * error when the key is taken.
 */
export async function setDisplayName(
  db: D1Database,
  pid: number,
  name: string,
  key: string,
  now: number,
  by: { admin: false } | { admin: true; lockedUntil: number },
): Promise<boolean> {
  const guard = by.admin ? '' : ' AND (name_locked_until IS NULL OR name_locked_until <= ?5) AND (name_changed_at IS NULL OR name_changed_at <= ?5 - ?6)';
  const [, updated] = await db.batch([
    db
      .prepare(`INSERT INTO display_name_history (player_id, old, new, old_key, changed_at, by_admin) SELECT id, display_name, ?2, display_name_key, ?4, ?7 FROM players WHERE id = ?1 AND deleted_at IS NULL${guard}`)
      .bind(pid, name, key, now, now, RENAME_COOLDOWN_MS, by.admin ? 1 : 0),
    by.admin
      ? db.prepare('UPDATE players SET display_name = ?2, display_name_key = ?3, name_locked_until = ?4 WHERE id = ?1 AND deleted_at IS NULL').bind(pid, name, key, by.lockedUntil)
      : db.prepare(`UPDATE players SET display_name = ?2, display_name_key = ?3, name_changed_at = ?4 WHERE id = ?1 AND deleted_at IS NULL${guard}`).bind(pid, name, key, now, now, RENAME_COOLDOWN_MS),
  ]);
  return updated.meta.changes === 1;
}
