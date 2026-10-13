/**
 * The player's own account summary, `GET /api/account` (ADR-0009 key
 * interfaces, accounts-v6.md §8.2 and §14 Q5). Only ever about the caller:
 * the Telegram username and the masked email are the player's own data.
 */
import { RENAME_COOLDOWN_MS, type PlayerRow } from '../players';

export interface NameStatus {
  /** The next rename costs nothing (the player never renamed). */
  freeChange: boolean;
  /** While the cooldown runs: when the next rename is allowed (unix ms). */
  nextChangeAt: number | null;
  /** While an admin lock runs: its end (unix ms). */
  lockedUntil: number | null;
  /** The last admin rename (the client shows its notice once). */
  moderatedAt: number | null;
}

export interface AccountSummary {
  displayName: string;
  identities: ({ kind: 'telegram'; telegramUsername: string | null } | { kind: 'password'; emailMasked: string })[];
  publicBoards: boolean;
  sessions: number;
  hasPurchases: boolean;
  name: NameStatus;
}

/** `jane.doe@gmail.com` → `j***@g***.com`. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${local.slice(0, 1)}***@${domain.slice(0, 1)}***${tld}`;
}

export async function nameStatus(db: D1Database, p: Pick<PlayerRow, 'id' | 'name_changed_at' | 'name_locked_until'>, now: number): Promise<NameStatus> {
  const mod = await db
    .prepare('SELECT MAX(changed_at) AS at FROM display_name_history WHERE player_id = ?1 AND by_admin = 1')
    .bind(p.id)
    .first<{ at: number | null }>();
  const next = p.name_changed_at === null ? null : p.name_changed_at + RENAME_COOLDOWN_MS;
  return {
    freeChange: p.name_changed_at === null,
    nextChangeAt: next !== null && next > now ? next : null,
    lockedUntil: p.name_locked_until !== null && p.name_locked_until > now ? p.name_locked_until : null,
    moderatedAt: mod?.at ?? null,
  };
}

export async function accountSummary(db: D1Database, p: PlayerRow, now: number): Promise<AccountSummary> {
  const [ids, counts] = await db.batch([
    db.prepare('SELECT kind, subject FROM auth_identities WHERE player_id = ?1 ORDER BY id').bind(p.id),
    db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM sessions WHERE player_id = ?1 AND expires_at > ?2 AND idle_expires_at > ?2) AS sessions,
                EXISTS (SELECT 1 FROM purchases WHERE player_id = ?1) OR EXISTS (SELECT 1 FROM entitlements WHERE player_id = ?1) AS purchases`,
      )
      .bind(p.id, now),
  ]);
  const c = counts.results[0] as { sessions: number; purchases: number };
  return {
    displayName: p.display_name,
    identities: (ids.results as { kind: 'telegram' | 'password'; subject: string }[]).map((i) =>
      i.kind === 'telegram' ? { kind: 'telegram', telegramUsername: p.username } : { kind: 'password', emailMasked: maskEmail(i.subject) },
    ),
    publicBoards: p.public_boards === 1,
    sessions: c.sessions,
    hasPurchases: !!c.purchases,
    name: await nameStatus(db, p, now),
  };
}
