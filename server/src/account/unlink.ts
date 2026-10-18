/**
 * Unlink a sign-in method (ADR-0009 §4; N-LK-2, M-ID-3).
 *
 * One D1 batch per unlink. Its first statement deletes the identity only when
 * the player has another one, and every later statement is guarded by "that
 * identity is gone", so two concurrent unlinks can never leave a player with
 * no method, and a refused unlink changes nothing.
 *
 * - Telegram: the identity, the players.telegram_id mirror (same batch),
 *   notify_settings, bot_state, pending notify_outbox rows and every bearer
 *   session go. Purchases and entitlements stay with the player id. That
 *   Telegram user opening the Mini App again gets a new, empty player.
 * - Email: the identity and its hash (ON DELETE CASCADE), the address's live
 *   links and log-in throttle, and every cookie session go.
 *
 * The account's address(es) and chat, read before the change, are told.
 */
import { ApiError } from '../errors';
import { forgetSessions, type Session } from '../auth/sessions';
import { emailKeyHash } from '../auth/throttle';
import { noticeTargets, type Notifier } from './notices';

type IdentityKind = 'telegram' | 'password';

/** Unlinks `kind`; true when the caller's own session was revoked by it. */
export async function unlinkIdentity(db: D1Database, notify: Notifier, s: Session, kind: IdentityKind, now = Date.now()): Promise<{ signedOut: boolean }> {
  const ident = await db.prepare('SELECT id, subject FROM auth_identities WHERE player_id = ?1 AND kind = ?2').bind(s.pid, kind).first<{ id: number; subject: string }>();
  if (!ident) throw new ApiError(404, 'not_found', 'This sign-in method is not linked');
  const before = await noticeTargets(db, s.pid);
  const gone = `NOT EXISTS (SELECT 1 FROM auth_identities WHERE id = ${ident.id | 0})`;
  const stmts: D1PreparedStatement[] = [
    db
      .prepare('DELETE FROM auth_identities WHERE id = ?1 AND player_id = ?2 AND (SELECT COUNT(*) FROM auth_identities WHERE player_id = ?2) > 1')
      .bind(ident.id, s.pid),
  ];
  if (kind === 'telegram') {
    const tg = Number(ident.subject);
    stmts.push(
      db.prepare(`UPDATE players SET telegram_id = NULL WHERE id = ?1 AND ${gone}`).bind(s.pid),
      db.prepare(`DELETE FROM notify_settings WHERE player_id = ?1 AND ${gone}`).bind(s.pid),
      db.prepare(`DELETE FROM notify_outbox WHERE player_id = ?1 AND status = 'pending' AND ${gone}`).bind(s.pid),
      db.prepare(`DELETE FROM bot_state WHERE telegram_id = ?1 AND ${gone}`).bind(tg),
      db.prepare(`DELETE FROM sessions WHERE player_id = ?1 AND transport = 'bearer' AND ${gone}`).bind(s.pid),
    );
  } else {
    stmts.push(
      db.prepare(`UPDATE email_tokens SET used_at = ?3 WHERE used_at IS NULL AND (email_norm = ?2 OR (player_id = ?1 AND purpose IN ('reset', 'change_email'))) AND ${gone}`).bind(s.pid, ident.subject, now),
      db.prepare(`DELETE FROM auth_throttle WHERE key = ?1 AND ${gone}`).bind(`login:${await emailKeyHash(ident.subject)}`),
      db.prepare(`DELETE FROM sessions WHERE player_id = ?1 AND transport = 'cookie' AND ${gone}`).bind(s.pid),
    );
  }
  const [del] = await db.batch(stmts);
  if ((del.meta.changes ?? 0) === 0) throw new ApiError(409, 'last_login_method', "You can't remove your only sign-in method");
  forgetSessions(s.pid);
  notify(kind === 'telegram' ? 'telegram_removed' : 'email_removed', before);
  return { signedOut: s.transport === (kind === 'telegram' ? 'bearer' : 'cookie') };
}
