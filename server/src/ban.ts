/**
 * Bans (admin panel). Sessions are stateless tokens, so a ban must also be
 * checked on every authenticated request: each isolate keeps the set of
 * banned player ids for BAN_TTL_MS (one indexed D1 read per isolate per
 * minute, reading only banned rows), so a ban takes effect everywhere within
 * a minute, and at once in the isolate that issued it. Sign-in checks the
 * player row directly.
 */
import { ApiError } from './errors';

export const BAN_TTL_MS = 60_000;

let cache: { ids: Set<number>; at: number; db: D1Database } | null = null;

export async function bannedIds(db: D1Database, now = Date.now()): Promise<Set<number>> {
  if (cache && cache.db === db && now - cache.at < BAN_TTL_MS) return cache.ids;
  const rows = await db.prepare('SELECT id FROM players WHERE banned_at IS NOT NULL').all<{ id: number }>();
  cache = { ids: new Set(rows.results.map((r) => r.id)), at: now, db };
  return cache.ids;
}

export function forgetBans(): void {
  cache = null;
}

export const bannedError = () =>
  new ApiError(403, 'banned', 'This account is banned. Contact support through the bot (/paysupport) if you think this is a mistake.');

/** Throws 403 "banned" when the player is banned (no-op without a database). */
export async function assertNotBanned(db: D1Database | undefined, pid: number): Promise<void> {
  if (!db) return;
  if ((await bannedIds(db)).has(pid)) throw bannedError();
}
