/**
 * Log-in identities (ADR-0008 §1). `auth_identities` is the source of truth
 * for log-in, and this module is its only writer.
 */
import type { PlayerRow } from '../players';
import { generateDisplayName } from '../names/generate';
import { nameKey } from '../names/validate';

/** The identity kind and session method of a dev player (DEV_AUTH=1, local only). */
export const DEV_KIND = 'dev';
export type DevKind = typeof DEV_KIND;
/** What auth_identities.kind holds. */
export type IdentityKind = DevKind | 'password';

/** The dev player to sign in as; `id` is its identity's subject. */
export interface DevUser {
  id: number;
  username?: string;
  first_name?: string;
  language_code?: string;
}

const clip = (s: unknown, n: number): string | null => (typeof s === 'string' && s.length > 0 ? s.slice(0, n) : null);
/** Attempts at a fresh generated name before giving up (the key space is ~5M names). */
const NAME_ATTEMPTS = 5;

/** The dev player with this id, if any. */
export async function playerByDevIdentity(db: D1Database, id: number): Promise<PlayerRow | null> {
  return db
    .prepare('SELECT p.* FROM auth_identities i JOIN players p ON p.id = i.player_id WHERE i.kind = ?2 AND i.subject = ?1')
    .bind(String(id), DEV_KIND)
    .first<PlayerRow>();
}

/**
 * The dev sign-in: refreshes that player's profile, or creates the player
 * with a generated display name. Returns the row before (null when new) and after.
 */
export async function upsertDevPlayer(db: D1Database, user: DevUser, now = Date.now()): Promise<{ prev: PlayerRow | null; player: PlayerRow }> {
  const subject = String(user.id);
  const profile = [clip(user.username, 64), clip(user.first_name, 128), clip(user.language_code, 16)] as const;
  for (let attempt = 0; ; attempt++) {
    const prev = await playerByDevIdentity(db, user.id);
    if (prev) {
      const [, updated] = await db.batch([
        db.prepare('UPDATE auth_identities SET last_login_at = ?2 WHERE kind = ?3 AND subject = ?1').bind(subject, now, DEV_KIND),
        db.prepare('UPDATE players SET username = ?2, first_name = ?3, language_code = ?4, last_seen_at = ?5 WHERE id = ?1 RETURNING *').bind(prev.id, ...profile, now),
      ]);
      return { prev, player: updated.results[0] as PlayerRow };
    }
    const name = generateDisplayName();
    const key = nameKey(name);
    try {
      const [created] = await db.batch([
        db
          .prepare(
            `INSERT INTO players (username, first_name, language_code, display_name, display_name_key, created_at, last_seen_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6) RETURNING *`,
          )
          .bind(...profile, name, key, now),
        db
          .prepare(
            `INSERT INTO auth_identities (player_id, kind, subject, verified_at, created_at, last_login_at)
             SELECT id, ?4, ?1, ?2, ?2, ?2 FROM players WHERE display_name_key = ?3`,
          )
          .bind(subject, now, key, DEV_KIND),
      ]);
      return { prev: null, player: created.results[0] as PlayerRow };
    } catch (e) {
      // A concurrent first sign-in of the same id (the loop then finds it), or a taken name.
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
