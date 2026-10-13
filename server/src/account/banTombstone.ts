/**
 * Ban tombstones (ADR-0009 §7.7, M-DL-5): when a banned player is deleted,
 * each of their log-in identities survives only as
 * b64url(SHA-256(pepper ‖ kind ‖ 0x00 ‖ subject)) for 180 days. Sign-up,
 * Telegram log-in and linking refuse an identity found here. The current and
 * the previous pepper are both checked, so a pepper rotation keeps them.
 */
import { b64urlEncode, utf8 } from '../crypto';
import type { Pepper, PepperSet } from '../auth/password';

export const BAN_TOMBSTONE_MS = 180 * 86_400_000;

export type IdentityKind = 'telegram' | 'password';

export async function banIdentityHash(pepper: Pepper, kind: IdentityKind, subject: string): Promise<string> {
  const tail = utf8(`${kind}\u0000${subject}`);
  const buf = new Uint8Array(pepper.bytes.length + tail.length);
  buf.set(pepper.bytes);
  buf.set(tail, pepper.bytes.length);
  return b64urlEncode(await crypto.subtle.digest('SHA-256', buf));
}

/**
 * True when this identity belongs to a deleted banned player (within 180 days).
 * The peppers are read only when a live tombstone exists at all, so a
 * deployment without them works until the first banned player is deleted;
 * from then on a missing pepper fails closed (the getter throws).
 */
export async function isBanTombstoned(db: D1Database, peppers: () => PepperSet, kind: IdentityKind, subject: string, now = Date.now()): Promise<boolean> {
  if (!(await db.prepare('SELECT 1 FROM ban_tombstones WHERE expires_at > ?1 LIMIT 1').bind(now).first())) return false;
  const set = peppers();
  const hashes = await Promise.all([set.current, ...set.previous].map((p) => banIdentityHash(p, kind, subject)));
  const hit = await db
    .prepare(`SELECT 1 FROM ban_tombstones WHERE expires_at > ?1 AND identity_hash IN (${hashes.map((_, i) => `?${i + 2}`).join(',')}) LIMIT 1`)
    .bind(now, ...hashes)
    .first();
  return !!hit;
}
