/**
 * Log-in identities (ADR-0008 §1). `auth_identities` is the source of truth for
 * log-in; `players.telegram_id` is a mirror kept for the bot, notifications and
 * admin. This module is the only writer of either, and writes both in one D1
 * batch (M-ID-3), so the mirror always equals the telegram identity.
 */
import type { PlayerRow } from '../players';
import type { TelegramUser } from '../telegramAuth';
import { generateDisplayName } from '../names/generate';
import { nameKey } from '../names/validate';

const clip = (s: unknown, n: number): string | null => (typeof s === 'string' && s.length > 0 ? s.slice(0, n) : null);
/** Attempts at a fresh generated name before giving up (the key space is ~5M names). */
const NAME_ATTEMPTS = 5;

/** The player that logs in with this Telegram user id, if any (never via the mirror, N-ID-2). */
export async function playerByTelegramIdentity(db: D1Database, telegramId: number): Promise<PlayerRow | null> {
  return db
    .prepare(`SELECT p.* FROM auth_identities i JOIN players p ON p.id = i.player_id WHERE i.kind = 'telegram' AND i.subject = ?1`)
    .bind(String(telegramId))
    .first<PlayerRow>();
}

/**
 * Proof of a Telegram user (valid initData, or a Stars payment from Telegram)
 * is in hand: refresh that player's profile, or create the player with a
 * generated display name. Returns the row before (null when new) and after.
 */
export async function upsertTelegramPlayer(db: D1Database, user: TelegramUser, now = Date.now()): Promise<{ prev: PlayerRow | null; player: PlayerRow }> {
  const subject = String(user.id);
  const profile = [clip(user.username, 64), clip(user.first_name, 128), clip(user.language_code, 16), user.is_premium ? 1 : 0] as const;
  for (let attempt = 0; ; attempt++) {
    const prev = await playerByTelegramIdentity(db, user.id);
    if (prev) {
      const [, , updated] = await db.batch([
        db.prepare(`UPDATE auth_identities SET last_login_at = ?2 WHERE kind = 'telegram' AND subject = ?1`).bind(subject, now),
        db.prepare('UPDATE players SET telegram_id = ?2 WHERE id = ?1').bind(prev.id, user.id),
        db
          .prepare('UPDATE players SET username = ?2, first_name = ?3, language_code = ?4, is_premium = ?5, last_seen_at = ?6 WHERE id = ?1 RETURNING *')
          .bind(prev.id, ...profile, now),
      ]);
      return { prev, player: updated.results[0] as PlayerRow };
    }
    const name = generateDisplayName();
    try {
      const [created] = await db.batch([
        db
          .prepare(
            `INSERT INTO players (telegram_id, username, first_name, language_code, is_premium, display_name, display_name_key, created_at, last_seen_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8) RETURNING *`,
          )
          .bind(user.id, ...profile, name, nameKey(name), now),
        db
          .prepare(
            `INSERT INTO auth_identities (player_id, kind, subject, verified_at, created_at, last_login_at)
             SELECT id, 'telegram', ?1, ?2, ?2, ?2 FROM players WHERE telegram_id = ?3`,
          )
          .bind(subject, now, user.id),
      ]);
      return { prev: null, player: created.results[0] as PlayerRow };
    } catch (e) {
      // A concurrent first log-in of the same user (the loop then finds it), or a taken name.
      if (attempt + 1 >= NAME_ATTEMPTS || !/UNIQUE/i.test(String((e as Error).message))) throw e;
    }
  }
}

/**
 * A verified sign-up (ADR-0008 §1, M-ID-2): creates the player with a
 * generated display name, its password identity and the hash in one D1 batch.
 * 'taken' when the address became a password identity in the meantime
 * (`UNIQUE(kind, subject)` is checked only now, at proof time).
 */
export async function createPasswordPlayer(db: D1Database, emailNorm: string, email: string, hash: string, now = Date.now()): Promise<PlayerRow | 'taken'> {
  for (let attempt = 0; ; attempt++) {
    const name = generateDisplayName();
    const key = nameKey(name);
    try {
      const [created] = await db.batch([
        db.prepare('INSERT INTO players (display_name, display_name_key, created_at, last_seen_at) VALUES (?1, ?2, ?3, ?3) RETURNING *').bind(name, key, now),
        db
          .prepare(
            `INSERT INTO auth_identities (player_id, kind, subject, email, verified_at, created_at, last_login_at)
             SELECT id, 'password', ?1, ?2, ?3, ?3, NULL FROM players WHERE display_name_key = ?4`,
          )
          .bind(emailNorm, email, now, key),
        db
          .prepare(`INSERT INTO password_hashes (identity_id, hash, updated_at) SELECT id, ?2, ?3 FROM auth_identities WHERE kind = 'password' AND subject = ?1`)
          .bind(emailNorm, hash, now),
      ]);
      return created.results[0] as PlayerRow;
    } catch (e) {
      const msg = String((e as Error).message);
      if (/UNIQUE/i.test(msg) && /auth_identities/i.test(msg)) return 'taken';
      // A generated-name collision: try another name.
      if (attempt + 1 >= NAME_ATTEMPTS || !/UNIQUE/i.test(msg)) throw e;
    }
  }
}
